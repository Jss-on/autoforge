#!/usr/bin/env bash
# Test harness for forge:fix — the defect-remediation / error burn-down loop.
# fix consumes test's defect ledger (score-test.sh defects schema) and hands back to
# test for independent verification, so this gates the command spec's alignment with
# requirements/build/test: seam resolution, defect lifecycle ceiling, evidence,
# GitHub flow, handoff validation, mirror parity, and manifest count.
set -uo pipefail

export AR_SCORE_LOG=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SPEC="$REPO_ROOT/claude-plugin/commands/forge/fix.md"

PASS=0; FAIL=0; TOTAL=0
pass() { printf '  PASS: %s\n' "$1"; PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); }
fail() { printf '  FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); }
assert_eq() { if [[ "$1" == "$2" ]]; then pass "$3"; else fail "$3 (expected '$1', got '$2')"; fi; }

# ============================================================================
printf '\n--- spec: intake modes + seam alignment ---\n'
# ============================================================================
spec_has() { grep -qiE -- "$1" "$SPEC" && pass "$2" || fail "$2 (spec missing /$1/)"; }
spec_has "from-test"                                "spec: --from-test intake"
spec_has "from-debug"                               "spec: --from-debug intake"
spec_has "defects\.tsv"                             "spec: defect-ledger work queue"
spec_has "score-test\.sh defects"                   "spec: ledger validated via score-test seam"
spec_has "AR_ROOT"                                  "spec: seam resolution (AR_ROOT)"
spec_has "doctor\.sh"                               "spec: doctor preflight"
spec_has "screen-cmd"                               "spec: derived commands screened"
spec_has "error (count|burn)"                       "spec: classic error burn-down mode retained"
spec_has "blocking count"                           "spec: metric = blocking count (defect mode)"

# ============================================================================
printf '\n--- spec: remediation discipline ---\n'
# ============================================================================
spec_has "root cause"                               "spec: root-cause iron law"
spec_has "no fix without an identified root"        "spec: iron law verbatim"
spec_has "[Rr]eproduce.*RED|repro.*red"             "spec: reproduce red before fix"
spec_has "def-<id>-red"                             "spec: red evidence file per defect"
spec_has "def-<id>-green"                           "spec: green evidence file per defect"
spec_has "Fix the implementation, not the test"     "spec: never weaken tests"
spec_has "ONE exception"                            "spec: test-is-the-defect exception"
spec_has "[Rr]euse before build"                    "spec: reuse-first principle"
spec_has "experiment: fix"                          "spec: experiment commit (git memory)"
spec_has "git revert"                               "spec: auto-revert on regress"
spec_has "targeted[[:space:]]+regression|targeted\*\*[[:space:]]*regression|targeted"  "spec: targeted regression after fix"
spec_has "Guard"                                    "spec: guard command"
spec_has "unblock-first"                            "spec: unblock-first queue ordering"
spec_has "cannot reproduce|Cannot reproduce"        "spec: un-reproducible path (no self-reject)"

# ============================================================================
printf '\n--- spec: independence ceiling (fix never self-certifies) ---\n'
# ============================================================================
spec_has "NEVER \`verified\`"                       "spec: may not set verified"
spec_has "in-progress.*and.*fixed"                  "spec: status ceiling = in-progress/fixed"
spec_has "self-certif"                              "spec: self-certification forbidden"
spec_has "fixed ≠ verified|fixed != verified"       "spec: fixed-not-verified reminder"
spec_has "re-engagement"                            "spec: test re-engagement closes the loop"

# ============================================================================
printf '\n--- spec: GitHub flow + handoff ---\n'
# ============================================================================
spec_has "fix/<stamp>"                              "spec: fix branch naming"
spec_has "Fixes #"                                  "spec: PR closes qa issues"
spec_has "CI check must be green"                   "spec: PR CI green required"
spec_has "Comment on each"                          "spec: issue comments on fix landing"

# --- auto-merge: the loop finishes its own PRs, but only on mechanical evidence ---
spec_has "Auto-merge \(default ON"                  "spec: auto-merge on by default"
spec_has "gh pr merge .*--squash .*--delete-branch" "spec: squash merge + branch cleanup"
spec_has "gh pr checks"                             "spec: waits on CI checks"
spec_has "MERGEABLE"                                "spec: conflict state checked before merge"
spec_has "still-running check never merges|red or still-running" "spec: never merge on red/pending"
spec_has "branch protection"                        "spec: protection/required review respected"
spec_has "base branch.{0,40}CI|base_ci"             "spec: post-merge base-branch CI verified"
spec_has "\-\-no-merge"                             "spec: --no-merge escape hatch"
spec_has "Merge: manual|Merge:./--merge"            "spec: Merge argument"
spec_has "merge state"                              "spec: summary reports merge state"
spec_has "ship. stays human-gated"                  "spec: merging is not deploying"
spec_has "validate-handoff\.sh"                     "spec: handoff validated via seam"
spec_has "\"3.3.0\""                              "spec: handoff version 3.3.0"
spec_has "BOUND: EXCEEDED"                          "spec: mechanical iteration bound"
spec_has "never deploy|Never deploy"                "spec: deploy human-gated"
spec_has "localhost/\`_test\`|_test.{0,3}allowlist" "spec: DB allowlist"
spec_has "production datastore"                     "spec: prod datastore untouchable"

# ============================================================================
printf '\n--- distribution: mirror parity (5 surfaces) ---\n'
# ============================================================================
MIRRORS=(
  "$REPO_ROOT/.claude/commands/forge/fix.md"
  "$REPO_ROOT/.agents/skills/forge/fix.md"
  "$REPO_ROOT/plugins/forge/skills/forge/fix.md"
  "$REPO_ROOT/.opencode/commands/forge_fix.md"
)
for m in "${MIRRORS[@]}"; do
  if [[ -f "$m" ]] && diff -q "$SPEC" "$m" >/dev/null 2>&1; then
    pass "mirror parity: ${m#$REPO_ROOT/}"
  else
    fail "mirror parity: ${m#$REPO_ROOT/} (missing or diverged)"
  fi
done

# ============================================================================
printf '\n--- distribution: manifest count + fix listed ---\n'
# ============================================================================
for mf in "$REPO_ROOT/.claude-plugin/marketplace.json" \
          "$REPO_ROOT/claude-plugin/.claude-plugin/plugin.json" \
          "$REPO_ROOT/plugins/forge/.codex-plugin/plugin.json"; do
  name="${mf#$REPO_ROOT/}"
  grep -q "25 commands" "$mf" && pass "manifest count 25: $name" || fail "manifest count 25: $name"
  grep -q "fix" "$mf" && pass "manifest lists fix: $name" || fail "manifest lists fix: $name"
done

# ============================================================================
printf '\n--- seam smoke: fix-mode ledger transitions score correctly ---\n'
# ============================================================================
# Simulates what a fix run does to its ledger copy: open critical -> fixed must
# STILL block (only verified/closed lift the block — the independence contract).
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ST="$REPO_ROOT/claude-plugin/skills/forge/scripts/score-test.sh"

printf 'id\tseverity\tpriority\tstatus\ttest_id\tsummary\tevidence\n' > "$TMP/defects.tsv"
printf 'DEF-1\tcritical\tP1\tfixed\tTC-1\tprod build fails\tevidence/def-1-green.txt\n' >> "$TMP/defects.tsv"
printf 'DEF-2\thigh\tP1\tfixed\tTC-2\tenv fixture leak\tevidence/def-2-green.txt\n' >> "$TMP/defects.tsv"
OUT="$(bash "$ST" defects "$TMP/defects.tsv" 2>/dev/null)"
echo "$OUT" | grep -q "VALID" && pass "ledger with fixed rows stays VALID" || fail "ledger with fixed rows stays VALID (got: $OUT)"
echo "$OUT" | grep -q "blocking=2" && pass "fixed != resolved: critical/high still block until test verifies" \
  || fail "fixed != resolved: expected blocking=2 (got: $OUT)"

printf 'id\tseverity\tpriority\tstatus\ttest_id\tsummary\tevidence\n' > "$TMP/defects2.tsv"
printf 'DEF-1\tcritical\tP1\tverified\tTC-1\tprod build fails\tevidence/def-1-green.txt\n' >> "$TMP/defects2.tsv"
printf 'DEF-2\thigh\tP1\tverified\tTC-2\tenv fixture leak\tevidence/def-2-green.txt\n' >> "$TMP/defects2.tsv"
OUT2="$(bash "$ST" defects "$TMP/defects2.tsv" 2>/dev/null)"
echo "$OUT2" | grep -q "blocking=0" && pass "verified (tester's stamp) lifts the block" \
  || fail "verified lifts the block (got: $OUT2)"

# handoff: fix source accepts results_tsv OR errors_remaining; rejects neither
VH="$REPO_ROOT/claude-plugin/skills/forge/scripts/validate-handoff.sh"
cat > "$TMP/handoff-good.json" <<'EOF'
{"version":"3.0.0","source":"fix","timestamp":"2026-08-14T00:00:00+08:00","status":"ERROR","results_tsv":"iterations.tsv","errors_remaining":0}
EOF
bash "$VH" "$TMP/handoff-good.json" fix >/dev/null 2>&1 && pass "handoff: fix with results_tsv → VALID" || fail "handoff: fix with results_tsv → VALID"
cat > "$TMP/handoff-bad.json" <<'EOF'
{"version":"3.0.0","source":"fix","timestamp":"2026-08-14T00:00:00+08:00","status":"ERROR"}
EOF
bash "$VH" "$TMP/handoff-bad.json" fix >/dev/null 2>&1 && fail "handoff: fix without results → INVALID" || pass "handoff: fix without results → INVALID"

# ============================================================================
printf '\n--- tests that guard every fix: proved, angled, swept, pinned ---\n'
# ============================================================================
spec_has "score-fix\.cjs"                          "spec: fix-evidence seam"
spec_has "FIX_EVIDENCE: VALID"                     "spec: check gates the PR and COMPLETE"
spec_has "PROVE: DETECTS"                          "spec: the test is proved to detect the defect"
spec_has "in the fix commit"                       "spec: the test travels in the fix commit"
spec_has "fail .{0,4}on an assertion"              "spec: a load error proves nothing"
spec_has "angles\.tsv"                             "spec: angle table"
spec_has "twelve dimensions"                       "spec: scenario's dimensions"
spec_has "qa-testing-protocol"                     "spec: techniques from the QA protocol"
spec_has "critical and high . all twelve"          "spec: depth by severity"
spec_has "no crash.{0,3} is not an outcome"        "spec: negative tests assert the refusal"
spec_has "sweep\.tsv"                              "spec: sweep for the same pattern"
spec_has "callers of the fixed function"           "spec: callers swept"
spec_has "score-fix\.cjs mutate"                   "spec: planted defects for critical/high"
spec_has "no-runner"                               "spec: no-runner exemption"
spec_has "new-behaviour"                           "spec: new-behaviour exemption"
spec_has "never a .type./.lint./.build. exemption" "spec: a real defect is not excused as a type error"
spec_has "tests_tsv"                               "spec: handoff carries tests_tsv"
spec_has "test_gaps"                               "spec: handoff carries the gaps for the re-engagement"
spec_has "check --rerun"                           "spec: the proofs are executed again before COMPLETE"
spec_has "\-\-repo <target>"                       "spec: a run outside its repository names it"
spec_has "\-\-defects <source ledger>"             "spec: severities pinned to the tester's ledger"
spec_has "git-ignored files"                       "spec: copy takes only git-ignored files"
spec_has "never in a test"                         "spec: mutants go in the fixed source lines"
spec_has "evidence/<item>-red\.txt"                "spec: error-mode evidence files named"
if node "$REPO_ROOT/tests/score-fix.test.cjs" "$REPO_ROOT" > "$TMP/score-fix.txt" 2>&1; then
  pass "score-fix: $(tail -n 1 "$TMP/score-fix.txt")"
else
  fail "score-fix: $(tail -n 1 "$TMP/score-fix.txt")"; grep '^FAIL' "$TMP/score-fix.txt" | sed 's/^/    /'
fi
for d in .claude/skills/forge claude-plugin/skills/forge .agents/skills/forge plugins/forge/skills/forge .opencode/skills/forge .cursor/skills/forge; do
  if diff -q "$REPO_ROOT/scripts/score-fix.cjs" "$REPO_ROOT/$d/scripts/score-fix.cjs" >/dev/null 2>&1; then pass "seam parity: $d/scripts/score-fix.cjs"; else fail "seam parity: $d/scripts/score-fix.cjs (missing or diverged)"; fi
done
# A COMPLETE fix handoff is recomputed from its run: a real proved run passes, a bare claim does not.
FIX_RUN="$(node -e 'const os=require("os"),fs=require("fs"),path=require("path");const s=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"forge-fix-handoff-")));require(process.argv[1])(process.argv[2],s).valid().then(r=>process.stdout.write(r.replace(/\\/g,"/"))).catch(e=>{console.error(e);process.exit(1)})' "$REPO_ROOT/tests/score-fix-fixture.cjs" "$REPO_ROOT")"
if [[ -d "$FIX_RUN" ]]; then
  printf '{"version":"3.3.0","source":"fix","timestamp":"2026-10-07T00:00:00+08:00","status":"COMPLETE","results_tsv":"iterations.tsv","tests_tsv":"tests.tsv"}' > "$FIX_RUN/handoff.json"
  bash "$VH" "$FIX_RUN/handoff.json" fix >/dev/null 2>&1; assert_eq 0 "$?" "handoff: COMPLETE fix with a proved run → VALID"
  printf '{"version":"3.3.0","source":"fix","timestamp":"2026-10-07T00:00:00+08:00","status":"COMPLETE","results_tsv":"iterations.tsv"}' > "$FIX_RUN/handoff.json"
  bash "$VH" "$FIX_RUN/handoff.json" fix >/dev/null 2>&1; assert_eq 1 "$?" "handoff: COMPLETE fix without tests_tsv → INVALID"
  printf '{"version":"3.3.0","source":"fix","timestamp":"2026-10-07T00:00:00+08:00","status":"BOUNDED","results_tsv":"iterations.tsv","tests_tsv":"tests.tsv","config":{"target":"%s","defects_source":"%s"}}' "$(dirname "$(dirname "$FIX_RUN")")" "$FIX_RUN/defects.tsv" > "$FIX_RUN/handoff.json"
  bash "$VH" "$FIX_RUN/handoff.json" fix >/dev/null 2>&1; assert_eq 0 "$?" "handoff: BOUNDED fix is checked too, with the repository and ledger its config names"
  printf '{"version":"3.3.0","source":"fix","timestamp":"2026-10-07T00:00:00+08:00","status":"BOUNDED","results_tsv":"iterations.tsv","tests_tsv":"tests.tsv","config":{"target":"%s"}}' "$TMP" > "$FIX_RUN/handoff.json"
  bash "$VH" "$FIX_RUN/handoff.json" fix >/dev/null 2>&1; assert_eq 1 "$?" "handoff: a config.target that is not the proved repository → INVALID"
  rm -f "$FIX_RUN/tests.tsv"
  printf '{"version":"3.3.0","source":"fix","timestamp":"2026-10-07T00:00:00+08:00","status":"COMPLETE","results_tsv":"iterations.tsv","tests_tsv":"tests.tsv"}' > "$FIX_RUN/handoff.json"
  bash "$VH" "$FIX_RUN/handoff.json" fix >/dev/null 2>&1; assert_eq 1 "$?" "handoff: COMPLETE fix whose run fails the check → INVALID"
  node -e 'require("fs").rmSync(require("path").dirname(require("path").dirname(require("path").dirname(process.argv[1]))),{recursive:true,force:true})' "$FIX_RUN"
else
  fail "handoff: the proved fix run could not be built"
fi
printf '{"version":"3.3.0","source":"fix","timestamp":"2026-10-07T00:00:00+08:00","status":"COMPLETE","results_tsv":"iterations.tsv","tests_tsv":"tests.tsv"}' > "$TMP/handoff-claim.json"
bash "$VH" "$TMP/handoff-claim.json" fix >/dev/null 2>&1; assert_eq 1 "$?" "handoff: COMPLETE fix with no run behind it → INVALID"

# ============================================================================
printf '\n--- v3.5.0 fast path: root-cause clustering, guard cadence, batched tracker rounds ---\n'
# ============================================================================

spec_has "Fast path .default."           "spec: fast path section (default)"
spec_has "speed-protocol"                "spec: references the speed protocol"
spec_has "One slice = one root cause"    "spec: defects clustered by root cause"
spec_has "shared caller"                 "spec: fix at the shared caller"
spec_has "regression test once"          "spec: repro scripted once as the regression test"
spec_has "touched suite"                 "spec: touched suite per slice"
spec_has "every 5 kept"                  "spec: full Guard at checkpoints"
spec_has "bisects the kept batch"        "spec: checkpoint failure bisects"
spec_has "--thorough"                    "spec: --thorough restores full Guard per slice"
spec_has "status ceiling"                "spec: independence ceiling untouched"

# ============================================================================
printf '\n=== Results: %d/%d passed ===' "$PASS" "$TOTAL"
if [[ "$FAIL" -gt 0 ]]; then printf ' (%d FAILED)\n' "$FAIL"; exit 1; else printf ' (all passed)\n'; exit 0; fi
