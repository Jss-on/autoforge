#!/usr/bin/env bash
# smoke-model.sh — the model-drift alarm. Runs a micro logic-first build
# HEADLESS through the claude CLI and then verifies the artifacts with the
# repo's own scorers, from outside the model's control.
#
# What it proves: the current model, given the evidence contract, still (a)
# writes real code + golden tests, (b) runs them and tees raw output into
# evidence/, (c) emits a build-results.tsv whose pass rows carry evidence:
# refs, and (d) survives strict scoring + coverage. If a model update stops
# honoring any of that, this exits 1 while every static suite stays green —
# exactly the gap the audits flagged.
#
# Guarded: skips (exit 0) unless AR_SMOKE_MODEL=1 and the claude CLI exists.
# Never runs in the default CI job — manual dispatch or local only.
#
#   AR_SMOKE_MODEL=1 bash scripts/smoke-model.sh
set -uo pipefail

if [[ "${AR_SMOKE_MODEL:-0}" != "1" ]]; then
  echo "SMOKE-MODEL: SKIPPED (set AR_SMOKE_MODEL=1 to run — spends model tokens)"
  exit 0
fi
if ! command -v claude >/dev/null 2>&1; then
  echo "SMOKE-MODEL: SKIPPED (claude CLI not found)"
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SB="$SCRIPT_DIR/score-build.sh"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PROMPT='You are running a headless micro-build to verify the evidence contract. Work ONLY in the current directory. Steps, in order:
1. Write requirements.md containing exactly two requirement lines: "FR-1 add(a,b) returns the exact integer sum" and "FR-2 mul(a,b) returns the exact integer product".
2. Write calc.mjs exporting functions add(a,b) and mul(a,b).
3. Write golden.test.mjs using node:test with four golden-vector tests: add(2,3)=5, add(-4,9)=5, mul(3,4)=12, mul(-2,8)=-16.
4. mkdir evidence, then run: node --test golden.test.mjs, saving the COMPLETE raw output plus a final line "exit=<code>" into evidence/unit.txt (run it for real — do not fabricate the file).
5. Write build-results.tsv with a tab-separated header row "spec	dimension	assertion	weight	status	detail	traces" and four data rows, one per golden vector, dimension "logic", weight 1, status "pass" ONLY if the test run actually passed, detail "evidence:evidence/unit.txt#<vector>", traces FR-1 for the add rows and FR-2 for the mul rows.
Do not create anything else. Do not run any network command. Stop after step 5.'

echo "SMOKE-MODEL: running headless micro-build in $WORK ..."
( cd "$WORK" && claude -p "$PROMPT" \
    --max-turns 25 \
    --allowedTools "Write,Edit,Read,Glob,Bash(node *),Bash(mkdir *),Bash(ls *)" \
    >"$WORK/.claude-out.txt" 2>&1 )
CLI_RC=$?
echo "SMOKE-MODEL: claude exited $CLI_RC"

FAILS=0
chk() { # $1 desc, $2 ok(0/1)
  if [[ "$2" == "0" ]]; then printf '  ok: %s\n' "$1"
  else printf '  FAIL: %s\n' "$1" >&2; FAILS=$((FAILS + 1)); fi
}

[[ -f "$WORK/calc.mjs" && -f "$WORK/golden.test.mjs" && -f "$WORK/requirements.md" ]]; chk "artifacts written (calc/tests/requirements)" $?
[[ -s "$WORK/evidence/unit.txt" ]]; chk "evidence/unit.txt exists and is non-empty" $?
grep -qE 'pass|ok' "$WORK/evidence/unit.txt" 2>/dev/null; chk "evidence carries real test output" $?
[[ -f "$WORK/build-results.tsv" ]]; chk "build-results.tsv written" $?

# The tests must ACTUALLY pass when we run them ourselves — independent re-run.
( cd "$WORK" && node --test golden.test.mjs >/dev/null 2>&1 ); chk "golden tests pass on independent re-run" $?

ROWS=$(awk -F'\t' '$2=="logic" && $5=="pass"' "$WORK/build-results.tsv" 2>/dev/null | wc -l | tr -d ' ')
[[ "${ROWS:-0}" -ge 4 ]]; chk "four passing logic rows (got ${ROWS:-0})" $?

RATE=$(cd "$WORK" && bash "$SB" pass-rate --strict-evidence build-results.tsv 2>"$WORK/.err" | awk '{print $2}')
[[ "$RATE" == "1.00" ]]; chk "strict-evidence pass-rate = 1.00 (got ${RATE:-none})" $?
grep -q 'logic_gate=PASS' "$WORK/.err"; chk "logic gate PASS" $?

COV=$(cd "$WORK" && bash "$SB" coverage build-results.tsv requirements.md 2>/dev/null | head -1 | awk '{print $2}')
[[ "$COV" == "1.00" ]]; chk "REQ_COVERAGE = 1.00 (got ${COV:-none})" $?

if [[ "$FAILS" -gt 0 ]]; then
  echo "SMOKE-MODEL: FAIL ($FAILS) — model behavior drifted from the evidence contract"
  echo "--- last 20 lines of the model transcript:"
  tail -20 "$WORK/.claude-out.txt" 2>/dev/null
  exit 1
fi
echo "SMOKE-MODEL: OK — model still honors the evidence contract"
