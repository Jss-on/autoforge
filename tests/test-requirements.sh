#!/usr/bin/env bash
# Test harness for forge:requirements — score-requirements.sh (rubric + validate),
# the requirements.md spec, mirror parity, manifest count.
set -uo pipefail

# Fixture scoring must not write score-log.tsv into the repo; the score-log
# behavior itself is tested against a temp dir with AR_SCORE_LOG=1.
export AR_SCORE_LOG=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SCORE_SH="$REPO_ROOT/scripts/score-requirements.sh"
FIX="$REPO_ROOT/tests/fixtures/requirements"
SPEC="$REPO_ROOT/claude-plugin/commands/forge/requirements.md"
RUBRIC_TARGET="${REQ_RUBRIC_TARGET:-16}"

PASS=0; FAIL=0; TOTAL=0
pass() { printf '  PASS: %s\n' "$1"; PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); }
fail() { printf '  FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); }
assert_eq()       { [[ "$1" == "$2" ]] && pass "$3" || fail "$3 (expected '$1', got '$2')"; }
assert_ge()       { [[ "$1" -ge "$2" ]] && pass "$3" || fail "$3 ($1 < $2)"; }
assert_contains() { echo "$1" | grep -q "$2" && pass "$3" || fail "$3 (missing '$2')"; }

V_OUT=""; V_CODE=0; V_VERDICT=""
run_validate() {
  V_OUT=$(bash "$SCORE_SH" validate "$FIX/$1" 2>/dev/null); V_CODE=$?
  V_VERDICT=$(echo "$V_OUT" | sed -n 's/^VALIDATION: //p')
}

# ============================================================================
printf '\n--- validate: a generated spec must be a valid build input ---\n'
# ============================================================================

run_validate valid.spec.yaml
assert_eq "VALID" "$V_VERDICT" "complete 5-dim spec => VALID"
assert_eq 0 "$V_CODE" "valid spec exit 0"
assert_contains "$V_OUT" "dims_present=functional,ux,devops,monitoring,hardening" "all 5 dims present"
assert_contains "$V_OUT" "dims_missing=none" "no dims missing"

run_validate missing-ux.spec.yaml
assert_eq "INVALID" "$V_VERDICT" "spec missing ux => INVALID (ux is mandatory)"
assert_eq 1 "$V_CODE" "missing-ux exit 1"
assert_contains "$V_OUT" "dims_missing=ux" "ux flagged missing"

run_validate no-acceptance.spec.yaml
assert_eq "INVALID" "$V_VERDICT" "name+stack only (no acceptance) => INVALID"
assert_contains "$V_OUT" "acceptance=no" "acceptance flagged absent"

MISS=$(bash "$SCORE_SH" validate "$FIX/does-not-exist.spec.yaml" 2>/dev/null); MC=$?
assert_contains "$MISS" "VALIDATION: ERROR" "missing file => ERROR"
assert_eq 2 "$MC" "missing file exit 2"

# the requirements command must generate specs the build scorer also accepts:
# our real eval specs (5 dims) validate clean.
REAL=$(bash "$SCORE_SH" validate "$REPO_ROOT/evals/fullstack/todo-api.spec.yaml" 2>/dev/null | sed -n 's/^VALIDATION: //p')
assert_eq "VALID" "$REAL" "real eval spec (todo-api) validates VALID"

# ============================================================================
printf '\n--- rubric: requirements-engineering coverage ---\n'
# ============================================================================

RSCORE=$(bash "$SCORE_SH" rubric "$SPEC" | sed -n 's/^SCORE: //p')
assert_ge "${RSCORE:-0}" "$RUBRIC_TARGET" "rubric score >= $RUBRIC_TARGET (got ${RSCORE:-0})"

# ============================================================================
printf '\n--- spec: standard RE process present ---\n'
# ============================================================================

spec_has() { grep -qiE -- "$1" "$SPEC" && pass "$2" || fail "$2 (spec missing /$1/)"; }
spec_has "elicit"                                 "spec: elicitation"
spec_has "stakeholder"                            "spec: stakeholders"
spec_has "non.?functional|NFR"                    "spec: non-functional requirements"
spec_has "MoSCoW|must.have"                       "spec: MoSCoW prioritization"
spec_has "INVEST|user stor"                       "spec: user stories"
spec_has "acceptance criteria|acceptance"         "spec: acceptance criteria"
spec_has "traceab"                                "spec: traceability"
spec_has "validation|validate"                    "spec: validation phase"
spec_has "out.of.scope|out-of-scope"             "spec: out-of-scope"
spec_has "spec.yaml|build spec"                   "spec: generates build spec"
spec_has "/forge:build|forge build" "spec: emits build invocation"
spec_has "handoff"                                "spec: handoff/chain"

# ============================================================================
printf '\n--- spec: latent-intent elicitation (protocol-driven) ---\n'
# ============================================================================
spec_has "elicitation-protocol\.md"               "spec: references the elicitation protocol"
spec_has "Domain recon"                           "spec: domain recon before questioning"
spec_has "domain brief"                           "spec: domain brief deliverable"
spec_has "regulatory checklist.*citation|citations" "spec: regulatory layer with citations"
spec_has "day-in-the-life"                        "spec: day-in-the-life walkthrough"
spec_has "unhappy paths"                          "spec: unhappy paths probed"
spec_has "must-be checklist|must-be \(Kano\)"     "spec: Kano must-be checklist"
spec_has "N-A-because|in / out"                   "spec: per-item disposition"
spec_has "worked example"                         "spec: worked example per money rule"
spec_has "Artifact-reaction|artifact-reaction"    "spec: artifact-reaction loop"
spec_has "throwaway.*wireframe|THROWAWAY"         "spec: throwaway wireframes"
spec_has "selection and correction, never adjectives|never via adjectives" "spec: taste via selection not description"
spec_has "Ambiguity audit"                        "spec: ambiguity audit sweep"
spec_has "adjective|rule.{0,3}boundary"           "spec: adjective->number / rule->boundary"
spec_has "correction path"                        "spec: every mutation has a correction path"
spec_has "provenance"                             "spec: provenance ledger"
spec_has "stated.*derived-domain|derived-domain"  "spec: provenance tags"
spec_has "zero .open.|open. item blocks"          "spec: open items block sign-off"
spec_has "never the SRS document"                 "spec: playback in client language"
spec_has "Saturation|saturation"                  "spec: saturation stop condition"
spec_has "honesty clause"                         "spec: iterative-capture honesty clause"

# --- protocol reference file exists + parity across the 5 surfaces ---
PROTO="$REPO_ROOT/claude-plugin/skills/forge/references/elicitation-protocol.md"
[[ -f "$PROTO" ]] && pass "protocol: reference file exists" || fail "protocol: reference file exists"
proto_has() { grep -qiE -- "$1" "$PROTO" 2>/dev/null && pass "$2" || fail "$2 (protocol missing /$1/)"; }
proto_has "Kano"                                  "protocol: Kano model grounding"
proto_has "research-first|BEFORE the first question" "protocol: research-first rule"
proto_has "laddering|Laddering"                   "protocol: laddering to goals"
proto_has "end-of-shift|rhythms"                  "protocol: periodic rituals probed"
proto_has "criticize an artifact|selection and correction" "protocol: react-not-specify premise"
proto_has "pronoun test"                          "protocol: pronoun ambiguity check"
proto_has "authority on their business"           "protocol: client-authority stance"
for m in "$REPO_ROOT/.claude/skills/forge/references/elicitation-protocol.md" \
         "$REPO_ROOT/.agents/skills/forge/references/elicitation-protocol.md" \
         "$REPO_ROOT/plugins/forge/skills/forge/references/elicitation-protocol.md" \
         "$REPO_ROOT/.opencode/skills/forge/references/elicitation-protocol.md"; do
  if [[ -f "$m" ]] && diff -q "$PROTO" "$m" >/dev/null 2>&1; then
    pass "protocol parity: ${m#$REPO_ROOT/}"
  else
    fail "protocol parity: ${m#$REPO_ROOT/} (missing or diverged)"
  fi
done

# ============================================================================
printf '\n--- distribution: mirror parity (5 surfaces) ---\n'
# ============================================================================

MIRRORS=(
  "$REPO_ROOT/.claude/commands/forge/requirements.md"
  "$REPO_ROOT/.agents/skills/forge/requirements.md"
  "$REPO_ROOT/plugins/forge/skills/forge/requirements.md"
  "$REPO_ROOT/.opencode/commands/forge_requirements.md"
)
for m in "${MIRRORS[@]}"; do
  if [[ -f "$m" ]] && diff -q "$SPEC" "$m" >/dev/null 2>&1; then
    pass "mirror parity: ${m#$REPO_ROOT/}"
  else
    fail "mirror parity: ${m#$REPO_ROOT/} (missing or diverged)"
  fi
done

# ============================================================================
printf '\n--- distribution: manifest command count = 16 + requirements listed ---\n'
# ============================================================================

for mf in "$REPO_ROOT/.claude-plugin/marketplace.json" \
          "$REPO_ROOT/claude-plugin/.claude-plugin/plugin.json" \
          "$REPO_ROOT/plugins/forge/.codex-plugin/plugin.json"; do
  name="${mf#$REPO_ROOT/}"
  grep -q "19 commands" "$mf" && pass "manifest count 19: $name" || fail "manifest count 19: $name"
  grep -q "requirements" "$mf" && pass "manifest lists requirements: $name" || fail "manifest lists requirements: $name"
done

# ============================================================================
printf '\n=== Results: %d/%d passed ===' "$PASS" "$TOTAL"
if [[ "$FAIL" -gt 0 ]]; then printf ' (%d FAILED)\n' "$FAIL"; exit 1; else printf ' (all passed)\n'; exit 0; fi
