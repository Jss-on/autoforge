#!/usr/bin/env bash
# Test harness for autoresearch:feature — the brownfield feature-addition loop.
# feature reuses score-build (pass-rate) + score-regression (floor), so this gates the
# command spec: required loop semantics, mirror parity, and manifest count.
set -uo pipefail

# Fixture scoring must not write score-log.tsv into the repo; the score-log
# behavior itself is tested against a temp dir with AR_SCORE_LOG=1.
export AR_SCORE_LOG=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SPEC="$REPO_ROOT/claude-plugin/commands/autoresearch/feature.md"

PASS=0; FAIL=0; TOTAL=0
pass() { printf '  PASS: %s\n' "$1"; PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); }
fail() { printf '  FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); }

# ============================================================================
printf '\n--- spec: brownfield iteration loop + first-principle semantics ---\n'
# ============================================================================
spec_has() { grep -qiE -- "$1" "$SPEC" && pass "$2" || fail "$2 (spec missing /$1/)"; }
spec_has "brownfield"                              "spec: brownfield (existing app)"
spec_has "delta"                                   "spec: delta acceptance"
spec_has "ratchet"                                 "spec: non-regression ratchet"
spec_has "incumbent"                               "spec: incumbent baseline"
spec_has "regression"                              "spec: regression floor"
spec_has "green.{0,3}red"                          "spec: green->red auto-revert"
spec_has "experiment:"                             "spec: experiment commit (git memory)"
spec_has "git revert"                              "spec: auto-revert on regress"
spec_has "pass-rate|pass_rate"                      "spec: mechanical pass-rate metric"
spec_has "DESIGN.md"                               "spec: conforms to existing DESIGN.md"
spec_has "design-conformance"                      "spec: ux design-conformance"
spec_has "greenfield"                              "spec: greenfield -> build autonomy"
spec_has "Target"                                  "spec: Target (existing app dir)"
spec_has "compounding|stack"                       "spec: compounding / stacks"
spec_has "Iterations"                              "spec: bounded iterations"
spec_has "ship.*human-gated|never deploy"          "spec: deploy human-gated"
spec_has "handoff"                                 "spec: handoff/chain"

# ============================================================================
printf '\n--- distribution: mirror parity (5 surfaces) ---\n'
# ============================================================================
MIRRORS=(
  "$REPO_ROOT/.claude/commands/autoresearch/feature.md"
  "$REPO_ROOT/.agents/skills/autoresearch/feature.md"
  "$REPO_ROOT/plugins/autoresearch/skills/autoresearch/feature.md"
  "$REPO_ROOT/.opencode/commands/autoresearch_feature.md"
)
for m in "${MIRRORS[@]}"; do
  if [[ -f "$m" ]] && diff -q "$SPEC" "$m" >/dev/null 2>&1; then
    pass "mirror parity: ${m#$REPO_ROOT/}"
  else
    fail "mirror parity: ${m#$REPO_ROOT/} (missing or diverged)"
  fi
done

# ============================================================================
printf '\n--- distribution: manifest command count = 17 + feature listed ---\n'
# ============================================================================
for mf in "$REPO_ROOT/.claude-plugin/marketplace.json" \
          "$REPO_ROOT/claude-plugin/.claude-plugin/plugin.json" \
          "$REPO_ROOT/plugins/autoresearch/.codex-plugin/plugin.json"; do
  name="${mf#$REPO_ROOT/}"
  grep -q "17 commands" "$mf" && pass "manifest count 17: $name" || fail "manifest count 17: $name"
  grep -q "requirements, feature" "$mf" && pass "manifest lists feature: $name" || fail "manifest lists feature: $name"
done

# ============================================================================
printf '\n=== Results: %d/%d passed ===' "$PASS" "$TOTAL"
if [[ "$FAIL" -gt 0 ]]; then printf ' (%d FAILED)\n' "$FAIL"; exit 1; else printf ' (all passed)\n'; exit 0; fi
