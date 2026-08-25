#!/usr/bin/env bash
# Test harness for /forge:test — score-test.sh (defects + exit-criteria),
# the test.md QA-engagement spec, standards coverage, mirror parity, manifests.
set -uo pipefail

# Fixture scoring must not write score-log.tsv into the repo; behavior is
# exercised against temp dirs.
export AR_SCORE_LOG=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ST="$REPO_ROOT/scripts/score-test.sh"
SPEC="$REPO_ROOT/claude-plugin/commands/forge/test.md"
PROTO="$REPO_ROOT/claude-plugin/skills/forge/references/qa-testing-protocol.md"

PASS=0; FAIL=0; TOTAL=0
pass() { printf '  PASS: %s\n' "$1"; PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); }
fail() { printf '  FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); }

assert_eq()       { [[ "$1" == "$2" ]] && pass "$3" || fail "$3 (expected '$1', got '$2')"; }
assert_contains() { echo "$1" | grep -q "$2" && pass "$3" || fail "$3 (missing '$2')"; }

# ============================================================================
printf '\n--- score-test: defect-ledger validation ---\n'
# ============================================================================

T="$(mktemp -d)"
mkdir -p "$T/evidence"; printf 'raw output\n' > "$T/evidence/u.txt"

hdr='id\tseverity\tpriority\tstatus\ttest_id\tsummary\tevidence\n'

printf "${hdr}DEF-1\tmedium\tP3\topen\tTC-1\tmisaligned\tevidence:evidence/u.txt\nDEF-2\tcritical\tP1\tverified\tTC-2\ttax fix\tevidence:evidence/u.txt\n" > "$T/d.tsv"
D_OUT=$(bash "$ST" defects "$T/d.tsv" 2>/dev/null); D_RC=$?
assert_contains "$D_OUT" "DEFECTS: VALID total=2 blocking=0" "defects: valid ledger, resolved critical not blocking"
assert_eq 0 "$D_RC" "defects: valid → exit 0"

printf "${hdr}DEF-1\tcritical\tP1\topen\tTC-1\tdata loss\tevidence:evidence/u.txt\n" > "$T/d.tsv"
D_OUT=$(bash "$ST" defects "$T/d.tsv" 2>/dev/null)
assert_contains "$D_OUT" "blocking=1" "defects: open critical blocks"

printf "${hdr}DEF-1\tcritical\tP1\tdeferred\tTC-1\tdeferred critical\tevidence:evidence/u.txt\n" > "$T/d.tsv"
D_OUT=$(bash "$ST" defects "$T/d.tsv" 2>/dev/null)
assert_contains "$D_OUT" "blocking=1" "defects: critical may NOT be deferred (still blocks)"

printf "${hdr}DEF-1\thigh\tP2\tdeferred\tTC-1\tdeferred high\tevidence:evidence/u.txt\n" > "$T/d.tsv"
D_OUT=$(bash "$ST" defects "$T/d.tsv" 2>/dev/null)
assert_contains "$D_OUT" "blocking=0" "defects: high may be deferred (sign-off path)"

printf "${hdr}DEF-1\tlow\tP4\trejected\tTC-1\tnot a bug\tn/a\n" > "$T/d.tsv"
D_OUT=$(bash "$ST" defects "$T/d.tsv" 2>/dev/null); D_RC=$?
assert_eq 0 "$D_RC" "defects: rejected row exempt from evidence requirement"

printf "${hdr}DEF-1\tlow\tP4\topen\tTC-1\tno proof\tnope\n" > "$T/d.tsv"
bash "$ST" defects "$T/d.tsv" >/dev/null 2>&1; D_RC=$?
assert_eq 1 "$D_RC" "defects: open row without evidence: ref → invalid"

printf "${hdr}DEF-1\tlow\tP4\topen\tTC-1\ta\tevidence:e\nDEF-1\tlow\tP4\topen\tTC-2\tb\tevidence:e\n" > "$T/d.tsv"
bash "$ST" defects "$T/d.tsv" >/dev/null 2>&1; D_RC=$?
assert_eq 1 "$D_RC" "defects: duplicate id → invalid"

printf "${hdr}DEF-1\tbogus\tP9\twat\t\tx\ty\n" > "$T/d.tsv"
bash "$ST" defects "$T/d.tsv" >/dev/null 2>&1; D_RC=$?
assert_eq 1 "$D_RC" "defects: bad severity/priority/status/linkage → invalid"

bash "$ST" defects "$T/missing.tsv" >/dev/null 2>&1; D_RC=$?
assert_eq 2 "$D_RC" "defects: missing file → exit 2"

# ============================================================================
printf '\n--- score-test: exit-criteria verdict ---\n'
# ============================================================================

printf 'spec\tdimension\tassertion\tweight\tstatus\tdetail\ttraces\n' > "$T/r.tsv"
printf 'app\tfunctional\tlogin\t1\tpass\tevidence:evidence/u.txt#login\tFR-1\n' >> "$T/r.tsv"
printf 'app\tlogic\ttax\t1\tpass\tevidence:evidence/u.txt#tax\tFR-2\n' >> "$T/r.tsv"
printf -- '- FR-1 login\n- FR-2 tax\n' > "$T/reqs.md"
printf "${hdr}DEF-1\tmedium\tP3\topen\tTC-1\tcosmetic\tevidence:evidence/u.txt\n" > "$T/d.tsv"

E_OUT=$(bash "$ST" exit-criteria "$T/r.tsv" "$T/d.tsv" "$T/reqs.md" 2>/dev/null); E_RC=$?
assert_eq "VERDICT: RELEASE_RECOMMENDED" "$E_OUT" "exit-criteria: all green → RECOMMENDED"
assert_eq 0 "$E_RC" "exit-criteria: RECOMMENDED → exit 0"

# open critical blocks
printf "DEF-2\tcritical\tP1\topen\tTC-9\tdata loss\tevidence:evidence/u.txt\n" >> "$T/d.tsv"
E_OUT=$(bash "$ST" exit-criteria "$T/r.tsv" "$T/d.tsv" "$T/reqs.md" 2>/dev/null); E_RC=$?
assert_eq "VERDICT: RELEASE_BLOCKED" "$E_OUT" "exit-criteria: open critical → BLOCKED"
assert_eq 1 "$E_RC" "exit-criteria: BLOCKED → exit 1"
printf "${hdr}DEF-1\tmedium\tP3\topen\tTC-1\tcosmetic\tevidence:evidence/u.txt\n" > "$T/d.tsv"

# unproven pass row (no evidence file) demoted under strict → rate below target
printf 'app\thardening\tfabricated\t1\tpass\tlooks fine\tFR-1\n' >> "$T/r.tsv"
E_OUT=$(bash "$ST" exit-criteria "$T/r.tsv" "$T/d.tsv" "$T/reqs.md" 2>/dev/null)
assert_eq "VERDICT: RELEASE_BLOCKED" "$E_OUT" "exit-criteria: strict evidence demotion drops rate → BLOCKED"
E_ERR=$(bash "$ST" exit-criteria "$T/r.tsv" "$T/d.tsv" "$T/reqs.md" 2>&1 >/dev/null)
assert_contains "$E_ERR" "pass-rate.*FAIL" "exit-criteria: names the failing criterion"

# threshold override
E_OUT=$(TEST_TARGET_RATE=0.50 bash "$ST" exit-criteria "$T/r.tsv" "$T/d.tsv" "$T/reqs.md" 2>/dev/null)
assert_eq "VERDICT: RELEASE_RECOMMENDED" "$E_OUT" "exit-criteria: TEST_TARGET_RATE env override honored"

# uncovered requirement blocks
head -3 "$T/r.tsv" > "$T/r2.tsv"
printf -- '- FR-9 untested requirement\n' >> "$T/reqs.md"
E_OUT=$(bash "$ST" exit-criteria "$T/r2.tsv" "$T/d.tsv" "$T/reqs.md" 2>/dev/null)
assert_eq "VERDICT: RELEASE_BLOCKED" "$E_OUT" "exit-criteria: untraced requirement (RTM gap) → BLOCKED"

bash "$ST" exit-criteria "$T/nope.tsv" "$T/d.tsv" >/dev/null 2>&1; E_RC=$?
assert_eq 2 "$E_RC" "exit-criteria: missing results file → exit 2"

rm -rf "$T"

# ============================================================================
printf '\n--- spec: QA-engagement capability + standards coverage ---\n'
# ============================================================================

spec_has() { grep -qiE -- "$1" "$SPEC" 2>/dev/null && pass "$2" || fail "$2 (spec missing /$1/)"; }

[[ -f "$SPEC" ]] && pass "test.md command spec exists" || fail "test.md command spec missing"
spec_has "29119"                                   "spec: ISO/IEC/IEEE 29119 alignment"
spec_has "ISTQB"                                   "spec: ISTQB test process"
spec_has "25010"                                   "spec: ISO 25010 quality model"
spec_has "traceability|RTM"                        "spec: requirements traceability matrix"
spec_has "test plan"                               "spec: test plan deliverable"
spec_has "equivalence"                             "spec: equivalence partitioning"
spec_has "boundary"                                "spec: boundary value analysis"
spec_has "decision table"                          "spec: decision table technique"
spec_has "state transition"                        "spec: state transition technique"
spec_has "exploratory"                             "spec: exploratory testing (SBTM)"
spec_has "charter"                                 "spec: session charters"
spec_has "smoke"                                   "spec: smoke gate"
spec_has "regression"                              "spec: regression pass"
spec_has "severity"                                "spec: defect severity"
spec_has "priority"                                "spec: defect priority"
spec_has "defects.tsv"                             "spec: machine-readable defect ledger"
spec_has "exit.criteria|exit criteria"             "spec: exit criteria gate"
spec_has "RELEASE_RECOMMENDED|RELEASE_BLOCKED"     "spec: mechanical release verdict"
spec_has "test-summary|summary report"             "spec: test summary report deliverable"
spec_has "evidence"                                "spec: evidence-anchored results"
spec_has "score-test.sh"                           "spec: wired to the mechanical seam"
spec_has "never (modify|edit).*(source|app|production code)|read.only" "spec: app source is read-only"
spec_has "WCAG|accessibility|a11y"                 "spec: accessibility testing"
spec_has "OWASP"                                   "spec: security testing"
spec_has "performance|load"                        "spec: performance testing"
spec_has "pyramid"                                 "spec: test pyramid"
spec_has "handoff"                                 "spec: chain handoff"
spec_has "fix|feature"                             "spec: chains to remediation commands"

[[ -f "$PROTO" ]] && pass "qa-testing-protocol.md reference exists" || fail "qa-testing-protocol.md missing"

# ============================================================================
printf '\n--- distribution: parity, shipped seam, router, manifests ---\n'
# ============================================================================

for m in "$REPO_ROOT/.claude/commands/forge/test.md" \
         "$REPO_ROOT/.agents/skills/forge/test.md" \
         "$REPO_ROOT/plugins/forge/skills/forge/test.md" \
         "$REPO_ROOT/.opencode/commands/forge_test.md"; do
  if [[ -f "$m" ]] && diff -q "$SPEC" "$m" >/dev/null 2>&1; then
    pass "mirror parity: ${m#$REPO_ROOT/}"
  else
    fail "mirror parity: ${m#$REPO_ROOT/} (missing or diverged)"
  fi
done

for tree in .claude claude-plugin .opencode .agents plugins/forge; do
  [[ -f "$REPO_ROOT/$tree/skills/forge/scripts/score-test.sh" ]] \
    && pass "seam shipped: $tree score-test.sh" || fail "seam shipped: $tree missing score-test.sh"
  [[ -f "$REPO_ROOT/$tree/skills/forge/references/qa-testing-protocol.md" ]] \
    && pass "reference shipped: $tree qa-testing-protocol.md" || fail "reference shipped: $tree missing protocol"
done

grep -q 'forge:test' "$REPO_ROOT/.claude/skills/forge/SKILL.md" \
  && pass "router: canonical SKILL.md routes /forge:test" || fail "router: canonical missing test row"
grep -q 'forge:test' "$REPO_ROOT/claude-plugin/skills/forge/SKILL.md" \
  && pass "router: claude-plugin routes /forge:test" || fail "router: claude-plugin missing test row"
grep -q 'forge_test' "$REPO_ROOT/.opencode/skills/forge/SKILL.md" \
  && pass "router: opencode routes /forge_test" || fail "router: opencode missing test row"
grep -qE '\$forge test' "$REPO_ROOT/.agents/skills/forge/SKILL.md" \
  && pass "router: codex routes \$forge test" || fail "router: codex missing test row"

for mf in "$REPO_ROOT/.claude-plugin/marketplace.json" \
          "$REPO_ROOT/claude-plugin/.claude-plugin/plugin.json" \
          "$REPO_ROOT/plugins/forge/.codex-plugin/plugin.json"; do
  name="${mf#$REPO_ROOT/}"
  grep -q "20 commands" "$mf" && pass "manifest count 20: $name" || fail "manifest count 20: $name"
  grep -q "feature, test" "$mf" && pass "manifest lists test: $name" || fail "manifest lists test: $name"
done

# handoff contract accepts the new source
_h="$(mktemp)"
printf '{"version":"2.4.0","source":"test","timestamp":"2026-01-01T00:00:00+00:00","status":"COMPLETE","results_tsv":"test-results.tsv","verdict":"RELEASE_RECOMMENDED"}' > "$_h"
VH_OUT=$(bash "$REPO_ROOT/scripts/validate-handoff.sh" "$_h" test 2>/dev/null)
assert_eq "VALID" "$VH_OUT" "handoff: test source with results_tsv+verdict VALID"
printf '{"version":"2.4.0","source":"test","timestamp":"t","status":"COMPLETE"}' > "$_h"
bash "$REPO_ROOT/scripts/validate-handoff.sh" "$_h" >/dev/null 2>&1; VH_RC=$?
assert_eq 1 "$VH_RC" "handoff: test source without results_tsv → INVALID"
rm -f "$_h"

# ============================================================================
printf '\n=== Results: %d/%d passed ===' "$PASS" "$TOTAL"
if [[ "$FAIL" -gt 0 ]]; then printf ' (%d FAILED)\n' "$FAIL"; exit 1; else printf ' (all passed)\n'; exit 0; fi
