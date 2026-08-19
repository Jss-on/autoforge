#!/usr/bin/env bash
# Test harness for autoresearch:fix — the defect-remediation / error burn-down loop.
# fix consumes test's defect ledger (score-test.sh defects schema) and hands back to
# test for independent verification, so this gates the command spec's alignment with
# requirements/build/test: seam resolution, defect lifecycle ceiling, evidence,
# GitHub flow, handoff validation, mirror parity, and manifest count.
set -uo pipefail

export AR_SCORE_LOG=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SPEC="$REPO_ROOT/claude-plugin/commands/autoresearch/fix.md"

PASS=0; FAIL=0; TOTAL=0
pass() { printf '  PASS: %s\n' "$1"; PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); }
fail() { printf '  FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); }

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
spec_has "\"2\.5\.0\""                              "spec: handoff version 2.5.0"
spec_has "BOUND: EXCEEDED"                          "spec: mechanical iteration bound"
spec_has "never deploy|Never deploy"                "spec: deploy human-gated"
spec_has "localhost/\`_test\`|_test.{0,3}allowlist" "spec: DB allowlist"
spec_has "production datastore"                     "spec: prod datastore untouchable"

# ============================================================================
printf '\n--- distribution: mirror parity (5 surfaces) ---\n'
# ============================================================================
MIRRORS=(
  "$REPO_ROOT/.claude/commands/autoresearch/fix.md"
  "$REPO_ROOT/.agents/skills/autoresearch/fix.md"
  "$REPO_ROOT/plugins/autoresearch/skills/autoresearch/fix.md"
  "$REPO_ROOT/.opencode/commands/autoresearch_fix.md"
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
          "$REPO_ROOT/plugins/autoresearch/.codex-plugin/plugin.json"; do
  name="${mf#$REPO_ROOT/}"
  grep -q "19 commands" "$mf" && pass "manifest count 19: $name" || fail "manifest count 19: $name"
  grep -q "fix" "$mf" && pass "manifest lists fix: $name" || fail "manifest lists fix: $name"
done

# ============================================================================
printf '\n--- seam smoke: fix-mode ledger transitions score correctly ---\n'
# ============================================================================
# Simulates what a fix run does to its ledger copy: open critical -> fixed must
# STILL block (only verified/closed lift the block — the independence contract).
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ST="$REPO_ROOT/claude-plugin/skills/autoresearch/scripts/score-test.sh"

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
VH="$REPO_ROOT/claude-plugin/skills/autoresearch/scripts/validate-handoff.sh"
cat > "$TMP/handoff-good.json" <<'EOF'
{"version":"2.5.0","source":"fix","timestamp":"2026-08-14T00:00:00+08:00","status":"COMPLETE","results_tsv":"iterations.tsv","errors_remaining":0}
EOF
bash "$VH" "$TMP/handoff-good.json" fix >/dev/null 2>&1 && pass "handoff: fix with results_tsv → VALID" || fail "handoff: fix with results_tsv → VALID"
cat > "$TMP/handoff-bad.json" <<'EOF'
{"version":"2.5.0","source":"fix","timestamp":"2026-08-14T00:00:00+08:00","status":"COMPLETE"}
EOF
bash "$VH" "$TMP/handoff-bad.json" fix >/dev/null 2>&1 && fail "handoff: fix without results → INVALID" || pass "handoff: fix without results → INVALID"

# ============================================================================
printf '\n=== Results: %d/%d passed ===' "$PASS" "$TOTAL"
if [[ "$FAIL" -gt 0 ]]; then printf ' (%d FAILED)\n' "$FAIL"; exit 1; else printf ' (all passed)\n'; exit 0; fi
