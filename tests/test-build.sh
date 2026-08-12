#!/usr/bin/env bash
# Test harness for autoresearch:build — score-build.sh (pass-rate + rubric),
# the build.md spec, mirror parity, manifest count, hardening checklist, eval specs.
set -uo pipefail

# Fixture scoring must not write score-log.tsv into the repo; the score-log
# behavior itself is tested against a temp dir with AR_SCORE_LOG=1.
export AR_SCORE_LOG=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SCORE_SH="$REPO_ROOT/scripts/score-build.sh"
FIX="$REPO_ROOT/tests/fixtures/build"
SPEC="$REPO_ROOT/claude-plugin/commands/autoresearch/build.md"
CHECKLIST="$REPO_ROOT/claude-plugin/skills/autoresearch/references/fullstack-hardening-checklist.md"
EVALS="$REPO_ROOT/evals/fullstack"
RUBRIC_TARGET="${BUILD_RUBRIC_TARGET:-32}"

PASS=0; FAIL=0; TOTAL=0
pass() { printf '  PASS: %s\n' "$1"; PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); }
fail() { printf '  FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); }

assert_eq()       { [[ "$1" == "$2" ]] && pass "$3" || fail "$3 (expected '$1', got '$2')"; }
assert_ge()       { [[ "$1" -ge "$2" ]] && pass "$3" || fail "$3 ($1 < $2)"; }
assert_contains() { echo "$1" | grep -q "$2" && pass "$3" || fail "$3 (missing '$2')"; }

PR_RATE=""; PR_ERR=""
run_pr() {
  PR_RATE=$(bash "$SCORE_SH" pass-rate "$FIX/$1" 2>/dev/null | sed -n 's/^PASS_RATE: //p')
  PR_ERR=$(bash "$SCORE_SH" pass-rate "$FIX/$1" 2>&1 >/dev/null)
}

# ============================================================================
printf '\n--- pass-rate: weighted dimension math ---\n'
# ============================================================================

run_pr all-pass.tsv
assert_eq "1.00" "$PR_RATE" "all-pass => 1.00"
assert_contains "$PR_ERR" "dims_ran=functional,devops,monitoring,hardening" "all-pass: all 4 dims ran"

run_pr monitoring-fail.tsv
assert_eq "0.81" "$PR_RATE" "monitoring fail (0.15 of 0.80 ran, renorm) => 0.81 (ops dim gates)"
assert_contains "$PR_ERR" "monitoring.*score=0.00" "monitoring dim score 0.00"

run_pr half.tsv
assert_eq "0.68" "$PR_RATE" "F=1.0 D/M/H=0.5 (no ux), weighted over 0.80 => 0.68"

# ============================================================================
printf '\n--- pass-rate: renormalization over dims that ran ---\n'
# ============================================================================

run_pr missing-dim.tsv
assert_eq "0.83" "$PR_RATE" "only F+D present, renormalized over 0.45 => 0.83"
assert_contains "$PR_ERR" "dims_unavailable=logic,ux,monitoring,hardening" "missing dims (incl ux) listed unavailable"

# ============================================================================
printf '\n--- pass-rate: logic gate (business-rule golden cases, must-pass) ---\n'
# ============================================================================

run_pr logic-gate-fail.tsv
assert_eq "0.50" "$PR_RATE" "logic golden red caps headline pass-rate at 0.50"
assert_contains "$PR_ERR" "logic_gate=CAPPED@0.50" "logic gate CAPPED while a golden case is red"

run_pr logic-gate-pass.tsv
assert_eq "1.00" "$PR_RATE" "all logic golden green => no cap => 1.00"
assert_contains "$PR_ERR" "logic_gate=PASS" "logic gate PASS when all golden cases green"

# ============================================================================
printf '\n--- pass-rate: ux dimension (first-class, gating) ---\n'
# ============================================================================

run_pr five-dim-allpass.tsv
assert_eq "1.00" "$PR_RATE" "all 5 dims incl ux pass => 1.00"
assert_contains "$PR_ERR" "dims_ran=functional,ux,devops,monitoring,hardening" "ux present in dims_ran ordering"

run_pr ux-fail.tsv
assert_eq "0.80" "$PR_RATE" "ux fail caps score at 0.80 (ux gates — UI/UX not optional)"
assert_contains "$PR_ERR" "ux .*score=0.00" "ux dim score 0.00"

# ============================================================================
printf '\n--- pass-rate: skip excluded, weight honored, zero/empty baseline ---\n'
# ============================================================================

run_pr skip-excluded.tsv
assert_eq "1.00" "$PR_RATE" "skip rows excluded from denominator => 1.00"

run_pr weighted.tsv
assert_eq "0.75" "$PR_RATE" "weight column honored (3 pass / 4 total) => 0.75"

run_pr all-fail.tsv
assert_eq "0.00" "$PR_RATE" "all-fail => 0.00"
assert_contains "$PR_ERR" "dims_ran=functional" "all-fail: dim still ran (distinct from empty)"

run_pr empty.tsv
assert_eq "0.00" "$PR_RATE" "empty/header-only => 0.00 baseline"
assert_contains "$PR_ERR" "dims_ran=none" "empty: no dims ran"

# baseline: no results file at all → 0.00 (loop needs a number, 0.00 is honest worst)
NORES=$(BUILD_RESULTS="$FIX/does-not-exist.tsv" bash "$SCORE_SH" pass-rate "$FIX/does-not-exist.tsv" 2>/dev/null | sed -n 's/^PASS_RATE: //p')
assert_eq "0.00" "$NORES" "missing results file => 0.00 baseline (exit 0, not error)"

# ============================================================================
printf '\n--- pass-rate: determinism + single-line stdout (awk-pipe contract) ---\n'
# ============================================================================

OUT1=$(bash "$SCORE_SH" pass-rate "$FIX/half.tsv" 2>/dev/null)
OUT2=$(bash "$SCORE_SH" pass-rate "$FIX/half.tsv" 2>/dev/null)
assert_eq "$OUT1" "$OUT2" "pass-rate deterministic across runs"
LINES=$(bash "$SCORE_SH" pass-rate "$FIX/half.tsv" 2>/dev/null | wc -l | tr -d ' ')
assert_eq "1" "$LINES" "stdout is exactly one line (Verify pipes | awk '{print \$2}')"
NUM=$(bash "$SCORE_SH" pass-rate "$FIX/half.tsv" 2>/dev/null | awk '{print $2}')
assert_eq "0.68" "$NUM" "pinned Verify extraction yields the bare number"

# ============================================================================
printf '\n--- rubric: build spec capability gate ---\n'
# ============================================================================

RSCORE=$(bash "$SCORE_SH" rubric "$SPEC" | sed -n 's/^SCORE: //p')
assert_ge "${RSCORE:-0}" "$RUBRIC_TARGET" "rubric score >= $RUBRIC_TARGET (got ${RSCORE:-0})"

# ============================================================================
printf '\n--- spec: required capability sections present ---\n'
# ============================================================================

spec_has() { grep -qiE -- "$1" "$SPEC" && pass "$2" || fail "$2 (spec missing /$1/)"; }
spec_has "greenfield|full.?stack"                 "spec: greenfield/full-stack scope"
spec_has "acceptance"                             "spec: acceptance gates"
spec_has "build-results"                          "spec: emits build-results TSV"
spec_has "functional"                             "spec: functional dimension"
spec_has "devops|DevOps"                          "spec: devops dimension"
spec_has "monitoring"                             "spec: monitoring dimension"
spec_has "hardening|harden"                       "spec: hardening dimension"
spec_has "Dockerfile|docker"                      "spec: containerization"
spec_has "healthz"                                "spec: health endpoint"
spec_has "metrics"                                "spec: metrics endpoint"
spec_has "rate.?limit"                            "spec: rate limiting"
spec_has "secret"                                 "spec: secrets handling"
spec_has "handoff"                                "spec: handoff.json"
spec_has "ship.*approval|approval|never deploy"   "spec: ship/deploy human-gated"
spec_has "requirement"                            "spec: SDLC requirements phase"
spec_has "design system"                          "spec: UI/UX design system"
spec_has "accessibility|a11y|WCAG"                "spec: accessibility (a11y)"
spec_has "responsive"                             "spec: responsive layout"
spec_has "e2e|end.to.end"                         "spec: e2e testing"
spec_has "root cause|debugging"                   "spec: debugging phase"
spec_has "deploy"                                 "spec: deployment phase"
spec_has "/browse|playwright"                     "spec: browser verification tool"
spec_has "ux|UI/UX"                               "spec: ux dimension"
spec_has "DESIGN.md"                              "spec: DESIGN.md design source"
spec_has "conformance|design-review"              "spec: design conformance / review"

# ============================================================================
printf '\n--- hardening checklist + eval specs present ---\n'
# ============================================================================

[[ -f "$CHECKLIST" ]] && pass "hardening checklist exists" || fail "hardening checklist missing"
SPEC_COUNT=$(find "$EVALS" -name '*.spec.yaml' 2>/dev/null | wc -l | tr -d ' ')
assert_ge "${SPEC_COUNT:-0}" 3 "at least 3 eval specs in evals/fullstack (got ${SPEC_COUNT:-0})"

# ============================================================================
printf '\n--- distribution: mirror parity (5 surfaces byte-identical) ---\n'
# ============================================================================

MIRRORS=(
  "$REPO_ROOT/.claude/commands/autoresearch/build.md"
  "$REPO_ROOT/.agents/skills/autoresearch/build.md"
  "$REPO_ROOT/plugins/autoresearch/skills/autoresearch/build.md"
  "$REPO_ROOT/.opencode/commands/autoresearch_build.md"
)
for m in "${MIRRORS[@]}"; do
  if [[ -f "$m" ]] && diff -q "$SPEC" "$m" >/dev/null 2>&1; then
    pass "mirror parity: ${m#$REPO_ROOT/}"
  else
    fail "mirror parity: ${m#$REPO_ROOT/} (missing or diverged)"
  fi
done

# ============================================================================
printf '\n--- distribution: manifest command count = 15 + build listed ---\n'
# ============================================================================

for mf in "$REPO_ROOT/.claude-plugin/marketplace.json" \
          "$REPO_ROOT/claude-plugin/.claude-plugin/plugin.json" \
          "$REPO_ROOT/plugins/autoresearch/.codex-plugin/plugin.json"; do
  name="${mf#$REPO_ROOT/}"
  grep -q "17 commands" "$mf" && pass "manifest count 17: $name" || fail "manifest count 17: $name"
  grep -q "regression, build" "$mf" && pass "manifest lists build: $name" || fail "manifest lists build: $name"
done

# ============================================================================
printf '\n--- v2.3.1 evidence anchoring: fallback killed, score-log, bound, strict mode ---\n'
# ============================================================================

# The implicit-discovery fallback is dead: from the repo root (where the stale
# evals/fullstack/build-results.tsv lives), a no-arg pass-rate must be the 0.00
# baseline with an explicit reason — never a silent 1.00 from another project's ledger.
NOFB_OUT=$(cd "$REPO_ROOT" && bash "$SCORE_SH" pass-rate 2>/dev/null)
NOFB_ERR=$(cd "$REPO_ROOT" && bash "$SCORE_SH" pass-rate 2>&1 >/dev/null)
assert_eq "PASS_RATE: 0.00" "$NOFB_OUT" "no-arg pass-rate never discovers a cross-project TSV"
assert_contains "$NOFB_ERR" "no-results-tsv" "no-arg pass-rate says why (reason=no-results-tsv)"

# bound: iteration budget is a mechanical gate now.
_bt="$(mktemp -d)"
printf 'n\tphase\tchange\tpass_rate\n1\timpl\tx\t0.10\n2\timpl\ty\t0.20\n' > "$_bt/iterations.tsv"
B_OUT=$(bash "$SCORE_SH" bound "$_bt/iterations.tsv" 40); B_CODE=$?
assert_contains "$B_OUT" "BOUND: OK used=2 max=40" "bound: within budget → OK"
assert_eq 0 "$B_CODE" "bound: OK → exit 0"
printf '48\timpl\tz\t0.99\n' >> "$_bt/iterations.tsv"
B_OUT=$(bash "$SCORE_SH" bound "$_bt/iterations.tsv" 40); B_CODE=$?
assert_contains "$B_OUT" "BOUND: EXCEEDED used=48 max=40" "bound: over budget → EXCEEDED"
assert_eq 1 "$B_CODE" "bound: EXCEEDED → exit 1"

# strict evidence: a pass row without a resolvable evidence: ref is demoted to fail.
mkdir -p "$_bt/evidence"
printf 'unit tests green\n' > "$_bt/evidence/unit.txt"
printf 'spec\tdimension\tassertion\tweight\tstatus\tdetail\ttraces\n' > "$_bt/build-results.tsv"
printf 'app\tfunctional\tproven\t1\tpass\tevidence:evidence/unit.txt#all\tFR-1\n' >> "$_bt/build-results.tsv"
printf 'app\tfunctional\tunproven\t1\tpass\tlooks good\tFR-2\n' >> "$_bt/build-results.tsv"
S_RATE=$(AR_SCORE_LOG=1 BUILD_EVIDENCE_STRICT=1 bash "$SCORE_SH" pass-rate "$_bt/build-results.tsv" 2>/dev/null | sed -n 's/^PASS_RATE: //p')
S_ERR=$(AR_SCORE_LOG=1 BUILD_EVIDENCE_STRICT=1 bash "$SCORE_SH" pass-rate "$_bt/build-results.tsv" 2>&1 >/dev/null)
assert_eq "0.50" "$S_RATE" "strict: unproven pass row demoted (1 of 2) => 0.50"
assert_contains "$S_ERR" "evidence_violations=1" "strict: violation count reported"
S2_RATE=$(AR_SCORE_LOG=1 bash "$SCORE_SH" pass-rate --strict-evidence "$_bt/build-results.tsv" 2>/dev/null | sed -n 's/^PASS_RATE: //p')
assert_eq "0.50" "$S2_RATE" "strict: --strict-evidence flag equals env toggle"
S3_RATE=$(AR_SCORE_LOG=1 bash "$SCORE_SH" pass-rate "$_bt/build-results.tsv" 2>/dev/null | sed -n 's/^PASS_RATE: //p')
assert_eq "1.00" "$S3_RATE" "non-strict scoring of the same TSV unchanged (legacy compat)"

# score-log: every scorer invocation leaves an audit line (ts, cmd, file, hash, headline).
[[ -f "$_bt/score-log.tsv" ]] && pass "score-log.tsv written next to the ledger" || fail "score-log.tsv missing"
SL_LAST=$(tail -1 "$_bt/score-log.tsv" 2>/dev/null)
assert_contains "$SL_LAST" "PASS_RATE" "score-log line carries the headline"
assert_contains "$SL_LAST" "build-results.tsv" "score-log line names the scored file"
SL_HASH=$(printf '%s' "$SL_LAST" | awk -F'\t' '{print $4}')
[[ -n "$SL_HASH" && "$SL_HASH" != "nohash" ]] && pass "score-log line carries a content hash" || fail "score-log content hash missing"
rm -rf "$_bt"

# ============================================================================
printf '\n--- v2.3.1 distribution: version consistency + shipped enforcement ---\n'
# ============================================================================

# One version, everywhere the user can read one.
CANON_VER=$(grep -m1 '^version:' "$REPO_ROOT/.claude/skills/autoresearch/SKILL.md" | sed 's/version:[[:space:]]*//')
for vf in "$REPO_ROOT/.claude-plugin/marketplace.json" "$REPO_ROOT/claude-plugin/.claude-plugin/plugin.json"; do
  if grep -q "\"version\": \"$CANON_VER\"" "$vf"; then
    pass "version consistency: ${vf#$REPO_ROOT/} == $CANON_VER"
  else
    fail "version consistency: ${vf#$REPO_ROOT/} != canonical $CANON_VER"
  fi
done
grep -q "\"version\": \"$CANON_VER" "$REPO_ROOT/plugins/autoresearch/.codex-plugin/plugin.json" \
  && pass "version consistency: codex plugin tracks $CANON_VER" \
  || fail "version consistency: codex plugin off canonical $CANON_VER"

# doctor preflight ships and parses.
bash -n "$REPO_ROOT/scripts/doctor.sh" && pass "doctor.sh parses" || fail "doctor.sh syntax error"
bash "$REPO_ROOT/scripts/doctor.sh" --help >/dev/null 2>&1 && pass "doctor.sh --help exits 0" || fail "doctor.sh --help failed"

# The enforcement layer ships inside the skill dir of every distributed tree —
# an installed user must get the same mechanical gates as this repo.
for tree in .claude claude-plugin .opencode .agents plugins/autoresearch; do
  sdir="$REPO_ROOT/$tree/skills/autoresearch/scripts"
  ok=1
  for s in score-build.sh score-requirements.sh score-regression.sh orchestrate.sh doctor.sh validate-handoff.sh run-index.sh; do
    [[ -f "$sdir/$s" ]] || ok=0
  done
  [[ "$ok" -eq 1 ]] && pass "enforcement shipped: $tree/skills/autoresearch/scripts" \
                    || fail "enforcement shipped: $tree missing seam scripts"
done

# ============================================================================
printf '\n--- v2.3.1 P1: handoff contract, run index, seam smoke ---\n'
# ============================================================================

VH="$REPO_ROOT/scripts/validate-handoff.sh"
_ht="$(mktemp -d)"
cat > "$_ht/handoff.json" <<'EOF'
{"version":"2.3.1","source":"build","timestamp":"2026-01-01T00:00:00+00:00","status":"CONVERGED",
 "results_tsv":"x.tsv","metric":{"name":"fullstack_pass_rate","value":1.0},
 "coverage":{"requirements":1.0},"config":{"spec":"x"}}
EOF
VH_OUT=$(bash "$VH" "$_ht/handoff.json" build); VH_CODE=$?
assert_eq "VALID" "$VH_OUT" "validate-handoff: canonical build handoff VALID"
assert_eq 0 "$VH_CODE" "validate-handoff: VALID → exit 0"

printf '{"version":"2.3.1","source":"build","timestamp":"t","status":"CONVERGED","results_tsv":"x","metric":"m","config":{}}' > "$_ht/noconv.json"
VH2=0; bash "$VH" "$_ht/noconv.json" >/dev/null 2>&1 || VH2=$?
assert_eq 1 "$VH2" "validate-handoff: CONVERGED without coverage → INVALID"

printf '{"version":"2.3.1","source":"autoresearch:build","timestamp":"t","status":"COMPLETE","results_tsv":"x","metric":"m","config":{}}' > "$_ht/colon.json"
VH3=0; bash "$VH" "$_ht/colon.json" >/dev/null 2>&1 || VH3=$?
assert_eq 1 "$VH3" "validate-handoff: colon-form source → INVALID"

VH4=0; bash "$VH" "$_ht/handoff.json" feature >/dev/null 2>&1 || VH4=$?
assert_eq 1 "$VH4" "validate-handoff: expected-source mismatch → INVALID"

VH5=0; bash "$VH" "$_ht/does-not-exist.json" >/dev/null 2>&1 || VH5=$?
assert_eq 2 "$VH5" "validate-handoff: missing file → exit 2"

# run-index: one fixture run dir → correct row + summary counts.
mkdir -p "$_ht/runs/build-000101-0000/evidence"
cp "$_ht/handoff.json" "$_ht/runs/build-000101-0000/handoff.json"
printf 'x\n' > "$_ht/runs/build-000101-0000/evidence/e.txt"
printf 'spec\tdim\ta\t1\tpass\td\tt\n' > "$_ht/runs/build-000101-0000/build-results.tsv"
RI_ROW=$(bash "$REPO_ROOT/scripts/run-index.sh" list "$_ht/runs" | awk -F'\t' 'NR==2 {print $2"/"$3"/"$5"/"$6}')
assert_eq "build/CONVERGED/yes/yes" "$RI_ROW" "run-index: source/status/results/evidence row"
RI_SUM=$(bash "$REPO_ROOT/scripts/run-index.sh" summary "$_ht/runs" | grep -c 'runs_total	1')
assert_eq "1" "$RI_SUM" "run-index: summary counts one run"
rm -rf "$_ht"

# The deterministic seam smoke must pass end-to-end (spec → evidence → strict
# score → coverage → bound → score-log → handoff → index).
bash "$REPO_ROOT/scripts/smoke-seam.sh" >/dev/null 2>&1 \
  && pass "smoke-seam: full pipeline OK" || fail "smoke-seam: pipeline broken"

# The schema reference ships with the skill.
[[ -f "$REPO_ROOT/.claude/skills/autoresearch/references/handoff-schema.md" ]] \
  && pass "handoff-schema.md reference present" || fail "handoff-schema.md missing"

# No command file may still pin the frozen 2.1.0 handoff version.
STALE_PINS=$(grep -rl 'version "2.1.0"' "$REPO_ROOT/.claude/commands/" 2>/dev/null | wc -l | tr -d ' ')
assert_eq "0" "$STALE_PINS" "no command still pins handoff version 2.1.0"

# Commands must tell the model how to find the seam + references off this machine.
grep -q "CLAUDE_PLUGIN_ROOT" "$SPEC" && pass "build.md carries path-resolution for installed plugins" \
                                     || fail "build.md lacks CLAUDE_PLUGIN_ROOT path resolution"

# ============================================================================
printf '\n=== Results: %d/%d passed ===' "$PASS" "$TOTAL"
if [[ "$FAIL" -gt 0 ]]; then printf ' (%d FAILED)\n' "$FAIL"; exit 1; else printf ' (all passed)\n'; exit 0; fi
