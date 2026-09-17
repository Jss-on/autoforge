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
printf '\n--- stack: the technology-selection gate (evidence + owner approval) ---\n'
# ============================================================================

READY="$FIX/stack-ready"
T="$(mktemp -d)"
# derive a mutated copy of the READY fixture: clone_ready <name> <sed-expr-on-decision>
clone_ready() { mkdir -p "$T/$1"; cp "$READY/sources.tsv" "$READY/claims.tsv" "$T/$1/"; sed -E "$2" "$READY/stack-decision.md" > "$T/$1/stack-decision.md"; }
run_stack() { S_OUT=$(bash "$SCORE_SH" stack "$1" 2>"$T/stderr"); S_RC=$?; S_ERR=$(cat "$T/stderr"); }

run_stack "$READY"
assert_eq "STACK_DECISION: READY" "$S_OUT" "stack: complete, cited, owner-approved record => READY"
assert_eq 0 "$S_RC" "stack: READY exit 0"
assert_contains "$S_ERR" "criterion source-ledger: SOURCES: VALID" "stack: source ledger validated via score-research"
assert_contains "$S_ERR" "criterion claims-ledger: CLAIMS: VALID" "stack: claims ledger validated via score-research"
assert_contains "$S_ERR" "criterion options: 3 considered" "stack: options counted"
assert_contains "$S_ERR" "criterion approval: approved by owner" "stack: owner approval read back"
LINES=$(echo "$S_OUT" | wc -l | tr -d ' ')
assert_eq "1" "$LINES" "stack: stdout is exactly one line"

clone_ready pending 's/^Approval: .*/Approval: pending/'
run_stack "$T/pending"
assert_eq "STACK_DECISION: BLOCKED" "$S_OUT" "stack: approval pending => BLOCKED (harness never self-approves)"
assert_eq 1 "$S_RC" "stack: BLOCKED exit 1"
assert_contains "$S_ERR" "criterion approval: pending" "stack: pending approval named as the failing criterion"

LEDGER_SHA=$(cat "$READY/sources.tsv" "$READY/claims.tsv" | tr -d '\r' | sha256sum | cut -c1-16)

mkdir -p "$T/crlf"; cp "$READY/sources.tsv" "$READY/claims.tsv" "$READY/stack-decision.md" "$T/crlf/"
sed -i 's/$/\r/' "$T/crlf/sources.tsv" "$T/crlf/claims.tsv" "$T/crlf/stack-decision.md"
run_stack "$T/crlf"
assert_eq "STACK_DECISION: READY" "$S_OUT" "stack: CRLF checkout (core.autocrlf=true) keeps the same ledger pin => READY"
clone_ready mandated "s/^Approval: .*/Approval: owner-mandated (A-11, 2026-09-18) — fitness validated, risks recorded, ledger:$LEDGER_SHA/"
run_stack "$T/mandated"
assert_eq "STACK_DECISION: READY" "$S_OUT" "stack: owner-mandated stack (validated, risks recorded) => READY"

clone_ready nopin 's/, ledger:[0-9a-f]*//'
run_stack "$T/nopin"
assert_eq "STACK_DECISION: BLOCKED" "$S_OUT" "stack: approval without a ledger pin => BLOCKED"
assert_contains "$S_ERR" "approval-pin: approval must pin the evidence" "stack: missing pin named with the hash to append"
assert_contains "$S_ERR" "ledger:$LEDGER_SHA" "stack: the failure message prints the current ledger hash"

clone_ready stale 's/^## More information/## More information/'
printf 'C-99\tRQ-4\tAdded after sign-off\tlow\tS-01\tevidence:evidence/S-01.md\n' >> "$T/stale/claims.tsv"
run_stack "$T/stale"
assert_eq "STACK_DECISION: BLOCKED" "$S_OUT" "stack: evidence edited after approval => BLOCKED (approval is stale)"
assert_contains "$S_ERR" "approval-stale: ledger changed after sign-off" "stack: stale approval named"

clone_ready noapproval '/^Approval:/d'
run_stack "$T/noapproval"
assert_eq "STACK_DECISION: BLOCKED" "$S_OUT" "stack: missing Approval line => BLOCKED"
assert_contains "$S_ERR" "approval: missing" "stack: missing approval named"

clone_ready twoopts '/^### O-3/d'
run_stack "$T/twoopts"
assert_eq "STACK_DECISION: BLOCKED" "$S_OUT" "stack: only 2 options considered => BLOCKED"
assert_contains "$S_ERR" "criterion options: 2 considered" "stack: option shortfall measured"

clone_ready uncited 's/\| 4 \[S-02\] \|/| 4 |/'
run_stack "$T/uncited"
assert_eq "STACK_DECISION: BLOCKED" "$S_OUT" "stack: a matrix score without a citation => BLOCKED"
assert_contains "$S_ERR" "matrix-evidence: RQ-3 has 1 uncited cell" "stack: uncited cell located by criterion"

clone_ready orphan 's/5 \[S-06\]/5 [S-99]/'
run_stack "$T/orphan"
assert_eq "STACK_DECISION: BLOCKED" "$S_OUT" "stack: citing a source not in sources.tsv => BLOCKED"
assert_contains "$S_ERR" "orphan S-99" "stack: orphan citation named"

clone_ready unresolved 's/5 \[S-06\]/? [S-06]/'
run_stack "$T/unresolved"
assert_eq "STACK_DECISION: BLOCKED" "$S_OUT" "stack: a ? (unknown) matrix cell => BLOCKED (no decision on missing data)"
assert_contains "$S_ERR" "matrix-unresolved: RQ-2 has 1" "stack: unresolved cell located by criterion"

clone_ready t4only 's/5 \[S-06\]/5 [S-09]/'
run_stack "$T/t4only"
assert_eq "STACK_DECISION: BLOCKED" "$S_OUT" "stack: a cell resting only on a T4 source => BLOCKED"
assert_contains "$S_ERR" "resting on T4-only sources" "stack: T4-only cell named"

clone_ready badrec 's/^Recommendation: .*/Recommendation: O-9/'
run_stack "$T/badrec"
assert_eq "STACK_DECISION: BLOCKED" "$S_OUT" "stack: recommendation naming no considered option => BLOCKED"
assert_contains "$S_ERR" "names no considered option" "stack: bad recommendation named"

clone_ready norow '/^\| RQ-2 \| 5/d'
run_stack "$T/norow"
assert_eq "STACK_DECISION: BLOCKED" "$S_OUT" "stack: a criterion with no comparison-matrix row => BLOCKED"
assert_contains "$S_ERR" "matrix-row: RQ-2 has no comparison-matrix row" "stack: missing matrix row named"

clone_ready uncovered 's/^\| RQ-4 \| Licensing/| RQ-5 | Hiring pool | 1 | A-5 |\n| RQ-4 | Licensing/; s/^\| RQ-4 \| 5 \[S-01, S-04\]/| RQ-5 | 3 [S-08] | 3 [S-08] | 2 [S-08] |\n| RQ-4 | 5 [S-01, S-04]/'
run_stack "$T/uncovered"
assert_eq "STACK_DECISION: BLOCKED" "$S_OUT" "stack: a criterion with no claim in claims.tsv => BLOCKED"
assert_contains "$S_ERR" "claim-coverage: RQ-5 has no claim" "stack: uncovered criterion named"

clone_ready untraced 's/^\| RQ-2 \| Performance headroom(.*)\| 2 \| NFR-2 \|/| RQ-2 | Performance headroom\1| 2 | gut feel |/'
run_stack "$T/untraced"
assert_eq "STACK_DECISION: BLOCKED" "$S_OUT" "stack: a criterion tracing to no requirement => BLOCKED"
assert_contains "$S_ERR" "criterion-trace: RQ-2" "stack: untraced criterion named"

clone_ready noconf '/^Confidence:/d'
run_stack "$T/noconf"
assert_eq "STACK_DECISION: BLOCKED" "$S_OUT" "stack: no declared confidence level => BLOCKED"
assert_contains "$S_ERR" "confidence: missing" "stack: missing confidence named"

clone_ready norobust 's/^Robustness: .*/Robustness: unknown/'
run_stack "$T/norobust"
assert_eq "STACK_DECISION: BLOCKED" "$S_OUT" "stack: no sensitivity-sweep verdict => BLOCKED (weighted total alone is fake precision)"
assert_contains "$S_ERR" "robustness: unknown" "stack: bad robustness verdict named"

clone_ready fragile 's/^Robustness: .*/Robustness: fragile — O-3 wins when RQ-1 weight +1; owner chose O-1 knowing this/'
run_stack "$T/fragile"
assert_eq "STACK_DECISION: READY" "$S_OUT" "stack: a fragile-but-disclosed decision the owner approved => READY"

clone_ready nobad '/^- (Bad|Risk):/d'
run_stack "$T/nobad"
assert_eq "STACK_DECISION: BLOCKED" "$S_OUT" "stack: consequences without a Bad/Risk line => BLOCKED (sales pitch)"
assert_contains "$S_ERR" "consequences: no" "stack: missing negative consequence named"

mkdir -p "$T/noclaims"; cp "$READY/sources.tsv" "$READY/stack-decision.md" "$T/noclaims/"
run_stack "$T/noclaims"
assert_eq "STACK_DECISION: BLOCKED" "$S_OUT" "stack: missing claims.tsv => BLOCKED"
assert_contains "$S_ERR" "criterion claims-ledger: claims.tsv missing FAIL" "stack: missing ledger named"

run_stack "$T/does-not-exist"
assert_eq "STACK_DECISION: ERROR" "$S_OUT" "stack: missing decision dir => ERROR"
assert_eq 2 "$S_RC" "stack: ERROR exit 2"

# validate ⟷ stack: REQUIRE_STACK_DECISION=1 makes the spec carry an approved decision.
V_OUT=$(bash "$SCORE_SH" validate "$FIX/valid.spec.yaml" 2>/dev/null)
assert_contains "$V_OUT" "stack_decision=n/a require_stack_decision=0" "validate: stack decision not required by default (legacy specs stay VALID)"
V_OUT=$(REQUIRE_STACK_DECISION=1 bash "$SCORE_SH" validate "$FIX/valid.spec.yaml" 2>/dev/null); V_RC=$?
assert_contains "$V_OUT" "VALIDATION: INVALID" "validate: REQUIRE_STACK_DECISION=1 + no decision: field => INVALID"
assert_contains "$V_OUT" "stack_decision=missing" "validate: missing decision reported"
assert_eq 1 "$V_RC" "validate: missing decision exit 1"
sed "s|^stack:|stack:\n  decision: $READY|" "$FIX/valid.spec.yaml" > "$T/with-decision.spec.yaml"
V_OUT=$(REQUIRE_STACK_DECISION=1 bash "$SCORE_SH" validate "$T/with-decision.spec.yaml" 2>/dev/null); V_RC=$?
assert_contains "$V_OUT" "VALIDATION: VALID" "validate: decision: -> READY dir => VALID"
assert_contains "$V_OUT" "stack_decision=ready" "validate: ready decision reported"
sed "s|^stack:|stack:\n  decision: $T/pending|" "$FIX/valid.spec.yaml" > "$T/with-pending.spec.yaml"
V_OUT=$(REQUIRE_STACK_DECISION=1 bash "$SCORE_SH" validate "$T/with-pending.spec.yaml" 2>/dev/null); V_RC=$?
assert_contains "$V_OUT" "VALIDATION: INVALID" "validate: decision: -> BLOCKED dir (approval pending) => INVALID"
assert_contains "$V_OUT" "stack_decision=blocked" "validate: blocked decision reported"
printf 'name: inline\nstack: { language: typescript, framework: fastify, decision: %s }\nacceptance:\n  functional: [ { id: a, assert: x, weight: 1 } ]\n  ux: [ { id: b, assert: x, weight: 1 } ]\n  devops: [ { id: c, assert: x, weight: 1 } ]\n  monitoring: [ { id: d, assert: x, weight: 1 } ]\n  hardening: [ { id: e, assert: x, weight: 1 } ]\n' "$READY" > "$T/inline.spec.yaml"
V_OUT=$(REQUIRE_STACK_DECISION=1 bash "$SCORE_SH" validate "$T/inline.spec.yaml" 2>/dev/null)
assert_contains "$V_OUT" "stack_decision=ready" "validate: inline-map stack block with decision: resolves"
sed "s|^stack:|stack:\n  decision: $READY\n  hosting: NEEDS CLARIFICATION|" "$FIX/valid.spec.yaml" > "$T/unresolved.spec.yaml"
V_OUT=$(REQUIRE_STACK_DECISION=1 bash "$SCORE_SH" validate "$T/unresolved.spec.yaml" 2>/dev/null)
assert_contains "$V_OUT" "VALIDATION: INVALID" "validate: NEEDS CLARIFICATION marker in the spec => INVALID (unresolved stack field)"
assert_contains "$V_OUT" "stack_decision=ready+unresolved" "validate: unresolved marker reported"

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

# ============================================================================
printf '\n--- spec: technology selection is evidence-based and owner-approved ---\n'
# ============================================================================
spec_has "Phase 2b"                                       "stack: a dedicated technology-selection phase"
spec_has "stack-selection-protocol\.md"                   "stack: references the stack-selection protocol"
spec_has "score-requirements\.sh stack"                   "stack: the mechanical gate is wired"
spec_has "STACK_DECISION: READY"                          "stack: gate verdict token named"
spec_has "stack-decision\.md"                             "stack: decision-record deliverable"
spec_has "never a[[:space:]]+bypass|never a bypass"       "stack: a Stack: hint is a candidate, never a bypass"
spec_has "owner-mandated"                                 "stack: owner-mandated path exists (validated, never overruled)"
spec_has "Robustness:"                                    "stack: sensitivity-sweep verdict required"
spec_has "Confidence:"                                    "stack: confidence level required"
spec_has "why not the"                                    "stack: why-not-the-others reasoning required"
spec_has "ledger:<hash>|pins the ledger hash"             "stack: approval pinned to the evidence shown"
spec_has "disconfirmation pass"                           "stack: per-candidate disconfirmation"
spec_has "REQUIRE_STACK_DECISION=1"                       "stack: spec validation requires the decision"
spec_has "AskUserQuestion"                                "stack: approval is an explicit owner question"
spec_has "knock-out|Knock-out"                            "stack: knock-out gates before scoring"
spec_has "boring default"                                 "stack: boring default always a candidate"
spec_has "decision: forge/requirements"                   "stack: spec schema carries decision: path"

# --- stack-selection protocol reference exists + parity across the 5 surfaces ---
SPROTO="$REPO_ROOT/claude-plugin/skills/forge/references/stack-selection-protocol.md"
[[ -f "$SPROTO" ]] && pass "stack protocol: reference file exists" || fail "stack protocol: reference file exists"
sproto_has() { grep -qiE -- "$1" "$SPROTO" 2>/dev/null && pass "$2" || fail "$2 (protocol missing /$1/)"; }
sproto_has "MADR"                                          "stack protocol: MADR-shaped record"
sproto_has "refutable"                                     "stack protocol: drivers are refutable scenarios (ATAM)"
sproto_has "Pugh"                                          "stack protocol: Pugh controlled convergence, not a bare weighted sum"
sproto_has "rank.reversal|rank reversal"                   "stack protocol: rank-reversal guard (fixed anchors)"
sproto_has "innovation token"                              "stack protocol: innovation-token budget"
sproto_has "one-way door|one-way doors"                    "stack protocol: reversibility class scales ceremony"
sproto_has "deps\.dev"                                     "stack protocol: deps.dev aggregator source"
sproto_has "OSV"                                           "stack protocol: OSV advisories source"
sproto_has "endoflife\.date"                               "stack protocol: EOL vs support horizon"
sproto_has "archived 2026-03"                              "stack protocol: TechEmpower archival recorded"
sproto_has "T4.*never the sole source|never the sole source" "stack protocol: vendor comparisons never sole support"
sproto_has "ordinal"                                       "stack protocol: popularity is ordinal only"
sproto_has "NEEDS CLARIFICATION"                           "stack protocol: unresolved-field marker"
sproto_has "Dummy Alternative|dummy alternatives"          "stack protocol: no straw-man options"
sproto_has "premortem"                                     "stack protocol: premortem on a mandated stack"
sproto_has "sha256sum"                                     "stack protocol: ledger hash pin command"
sproto_has "pre-registered"                                "stack protocol: spike thresholds pre-registered"
sproto_has "§10|Sources this protocol rests on"            "stack protocol: cites its own sources"
for m in "$REPO_ROOT/.claude/skills/forge/references/stack-selection-protocol.md" \
         "$REPO_ROOT/.agents/skills/forge/references/stack-selection-protocol.md" \
         "$REPO_ROOT/plugins/forge/skills/forge/references/stack-selection-protocol.md" \
         "$REPO_ROOT/.opencode/skills/forge/references/stack-selection-protocol.md"; do
  if [[ -f "$m" ]] && diff -q "$SPROTO" "$m" >/dev/null 2>&1; then
    pass "stack protocol parity: ${m#$REPO_ROOT/}"
  else
    fail "stack protocol parity: ${m#$REPO_ROOT/} (missing or diverged)"
  fi
done
for tree in .claude claude-plugin .opencode .agents plugins/forge; do
  if diff -q "$SCORE_SH" "$REPO_ROOT/$tree/skills/forge/scripts/score-requirements.sh" >/dev/null 2>&1; then
    pass "seam parity: $tree/skills/forge/scripts/score-requirements.sh"
  else
    fail "seam parity: $tree/skills/forge/scripts/score-requirements.sh (missing or diverged)"
  fi
done
[[ -f "$READY/stack-decision.md" && -f "$READY/sources.tsv" && -f "$READY/claims.tsv" ]] \
  && pass "fixture: stack-ready exemplar ships (record + ledgers)" || fail "fixture: stack-ready exemplar ships"

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

# Instruction-contract checks only; these do not simulate or prove a live interview.
# Join wrapped prose so the behavior checks survive ordinary Markdown reflow.
printf '\n--- owner review: instruction contract ---\n'
proto_clause() { tr '\r\n' '  ' < "$PROTO" | grep -qiE -- "$1" && pass "$2" || fail "$2 (protocol missing /$1/)"; }
spec_has 'client-review\.md' "contract: requirements uses the visible client review"
proto_clause 'first substantive reply.{0,120}stories, and scenarios.{0,60}before the detailed interview' "contract: draft understanding, assumptions, stories and scenarios precede questions"
proto_clause 'Create .client-review\.md.{0,60}present its contents in the conversation' "contract: the owner sees the review contents"
proto_clause 'all currently known assumptions, including defaults,.{0,120}missing facts' "contract: assumptions include defaults, exclusions, choices and unknowns"
proto_clause 'Use short sentences and everyday words throughout the interview' "contract: client language governs the whole interview"
proto_has 'SC-n.*linked.*US-n.*A-n' "contract: scenarios link stories and assumptions by ID"
proto_clause 'Keep IDs stable; preserve the old decision in a short change log' "contract: corrections preserve IDs and decision history"
proto_has 'Numbered steps:.*person does.*system shows/does.*what happens next' "contract: scenarios describe the person/system sequence"
proto_has 'Normal path, unhappy paths, and recovery/correction path' "contract: scenarios cover failure and recovery"
proto_clause 'After every owner response, update the same review:.{0,100}what is still open' "contract: each answer updates changes, impacts and open items"
proto_clause 'When a correction invalidates an earlier confirmation, reopen the affected items.{0,70}changed flows for review again' "contract: changed assumptions reopen affected flows"
proto_clause 'Never write .confirmed. merely because Forge.{0,30}recommends it' "contract: recommendations remain unconfirmed"
proto_clause 'Silence, elapsed time,.{0,110}not confirmation or saturation' "contract: unanswered questions never count as approval"
proto_clause 'In the first playback, cover.{0,40}every area below.{0,100}Each individual concern gets an A-n decision' "contract: first review covers each lifecycle concern"
proto_has 'Testing & acceptance.*normal and failure examples.*who accepts the result' "contract: acceptance includes failure examples and an owner"
proto_has 'Environments & deployment.*release approval.*rollback after a bad release' "contract: deployment covers release approval and rollback"
proto_has 'Security & misuse.*access boundaries.*suspected break-in' "contract: security includes access and incident handling"
proto_has 'Privacy & compliance.*jurisdictions.*source evidence.*responsible review' "contract: compliance includes jurisdiction and evidence"
proto_clause 'Record authoritative sources, date checked, and what still needs verification' "contract: compliance research records sources, date and uncertainty"
proto_clause 'unresolved safety, security or compliance.{0,60}cannot be relabeled .deferred. just to pass sign-off' "contract: deferral cannot hide unresolved obligations"
proto_has 'Monitoring & support.*alerts.*incident responsibility' "contract: operations includes alerts, support and incident ownership"
proto_has 'Maintenance & handover.*security patches.*documentation' "contract: maintenance includes patching and handover"
proto_has 'Retirement & exit.*export/transfer/deletion including backups.*billing' "contract: retirement covers data, access and service shutdown"
proto_clause 'zero .open. items or unresolved conflicts.{0,60}Capture explicit final approval of the.{0,20}latest review[[:space:]]+revision' "contract: finalization needs resolved items and latest-review approval"
proto_clause 'any material change reopens the affected review and.{0,30}invalidates final approval until the changed revision is accepted' "contract: approval cannot survive a material unreviewed change"
proto_clause 'spec validator checks build-input structure;.{0,40}does not prove understanding, legal compliance, lifecycle coverage or owner approval' "contract: structural validation does not prove owner understanding"
proto_has 'concern.*proposed protection.*how we will check it' "contract: security concerns are explained with protection and proof"
proto_clause 'Record a measurable NFR and a negative test.{0,70}for each applicable.{0,20}protection' "contract: security promises become requirements and refusal tests"
spec_has 'Cross-user/tenant checks exercise direct API access' "contract: security tests exercise server boundaries"
spec_has 'validate-handoff.sh .* build --require-pass' "contract: generated security requirements lead to the completion gate"

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
  grep -q "21 commands" "$mf" && pass "manifest count 21: $name" || fail "manifest count 21: $name"
  grep -q "requirements" "$mf" && pass "manifest lists requirements: $name" || fail "manifest lists requirements: $name"
done

# ============================================================================
printf '\n=== Results: %d/%d passed ===' "$PASS" "$TOTAL"
if [[ "$FAIL" -gt 0 ]]; then printf ' (%d FAILED)\n' "$FAIL"; exit 1; else printf ' (all passed)\n'; exit 0; fi
