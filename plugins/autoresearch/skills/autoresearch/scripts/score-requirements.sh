#!/usr/bin/env bash
# score-requirements.sh — backend for autoresearch:requirements.
#
#   rubric   [file]        → grep-rubric of requirements.md (RE process coverage) → "SCORE: N"
#   validate <spec.yaml>   → assert a GENERATED build spec is well-formed + complete
#
# validate is the contract between requirements → build: the spec the requirements
# command emits must be a valid autoresearch:build input. A spec is VALID iff it has a
# name, a stack, and an acceptance block covering ALL FIVE operational dimensions
# (functional, ux, devops, monitoring, hardening) with at least one weighted assertion.
# The sixth dimension `logic` (business-rule golden oracle) is optional for pure-CRUD apps
# but, when present, must carry at least one gated golden row (gate: true); set REQUIRE_LOGIC=1
# to make it mandatory for a computational domain (payroll, accounting, POS, billing).
#   exit 0 VALID / 1 INVALID / 2 ERROR
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SPEC_DEFAULT="$REPO_ROOT/claude-plugin/commands/autoresearch/requirements.md"

DIMS="functional ux devops monitoring hardening"

# ---------------------------------------------------------------------------
# rubric: grep the requirements command spec for standard requirements-engineering
# coverage. Each matched pattern = +1. Prints "SCORE: N" only.
# ---------------------------------------------------------------------------
rubric() {
  local file="${1:-$SPEC_DEFAULT}"
  if [[ ! -f "$file" ]]; then echo "SCORE: 0"; return 0; fi

  local checks=(
    "elicit"
    "stakeholder"
    "functional"
    "non.?functional|NFR"
    "MoSCoW|must.have|should.have|could.have"
    "INVEST|user stor"
    "acceptance criteria|acceptance"
    "given.{0,3}when.{0,3}then|Given/When/Then"
    "traceab"
    "validation|validate"
    "assumption"
    "constraint"
    "out.of.scope|out-of-scope"
    "ambigu"
    "prioriti"
    "SRS|PRD|requirements.md"
    "spec.yaml|build spec"
    "/autoresearch:build|autoresearch build"
    "dimension"
    "weight"
    "logic|golden"
    "rule matrix|golden vector|expected output"
    "chain|handoff"
    "scope creep|conflict"
  )
  local score=0 pat
  for pat in "${checks[@]}"; do
    if grep -qiE -- "$pat" "$file"; then score=$((score + 1)); fi
  done
  echo "SCORE: $score"
}

# ---------------------------------------------------------------------------
# validate: a generated build spec must be a valid autoresearch:build input.
# ---------------------------------------------------------------------------
validate() {
  local spec="${1:?usage: validate <spec.yaml>}"
  if [[ ! -f "$spec" ]]; then
    echo "VALIDATION: ERROR"; echo "reason=missing-file"; return 2
  fi

  local missing="" present="" d
  local has_name has_stack has_accept weights
  has_name=$(grep -cE '^name:' "$spec" || true)
  has_stack=$(grep -cE '^stack:' "$spec" || true)
  has_accept=$(grep -cE '^acceptance:' "$spec" || true)
  weights=$(grep -cE '^[[:space:]]+weight:' "$spec" || true)

  for d in $DIMS; do
    if grep -qE "^[[:space:]][[:space:]]$d:" "$spec"; then
      present="$present${present:+,}$d"
    else
      missing="$missing${missing:+,}$d"
    fi
  done

  # Logic dimension (business-rule golden oracle). Not one of the mandatory five, so pure-CRUD
  # specs stay valid; but a declared logic block must carry gated golden rows, and a computational
  # domain should set REQUIRE_LOGIC=1 to make its absence a hard failure.
  local has_logic gate_rows
  has_logic=$(grep -cE '^[[:space:]][[:space:]]logic:' "$spec" || true)
  gate_rows=$(grep -cE 'gate:[[:space:]]*true' "$spec" || true)

  local ok=1
  [[ "$has_name"   -ge 1 ]] || ok=0
  [[ "$has_stack"  -ge 1 ]] || ok=0
  [[ "$has_accept" -ge 1 ]] || ok=0
  [[ -z "$missing" ]]       || ok=0
  [[ "$weights"    -ge 1 ]] || ok=0
  # A declared `logic` block must contain >=1 gated golden case (gate: true).
  [[ "$has_logic" -lt 1 || "$gate_rows" -ge 1 ]] || ok=0
  # Opt-in hard requirement for computational domains.
  if [[ "${REQUIRE_LOGIC:-0}" == "1" ]]; then
    [[ "$has_logic" -ge 1 && "$gate_rows" -ge 1 ]] || ok=0
  fi

  if [[ "$ok" -eq 1 ]]; then
    echo "VALIDATION: VALID"
  else
    echo "VALIDATION: INVALID"
  fi
  echo "name=$([[ $has_name -ge 1 ]] && echo yes || echo no) stack=$([[ $has_stack -ge 1 ]] && echo yes || echo no) acceptance=$([[ $has_accept -ge 1 ]] && echo yes || echo no) weights=$weights"
  echo "dims_present=${present:-none}"
  echo "dims_missing=${missing:-none}"
  echo "logic=$([[ $has_logic -ge 1 ]] && echo "present(gate_rows=$gate_rows)" || echo absent) require_logic=${REQUIRE_LOGIC:-0}"
  [[ "$ok" -eq 1 ]] && return 0 || return 1
}

case "${1:-}" in
  rubric)   shift; rubric   "$@" ;;
  validate) shift; validate "$@" ;;
  *) echo "usage: $0 {rubric [file] | validate <spec.yaml>}" >&2; exit 64 ;;
esac
