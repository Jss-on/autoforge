#!/usr/bin/env bash
# score-requirements.sh — backend for forge:requirements.
#
#   rubric   [file]        → grep-rubric of requirements.md (RE process coverage) → "SCORE: N"
#   validate <spec.yaml>   → assert a GENERATED build spec is well-formed + complete
#   stack    <decision-dir> → the technology-selection gate: STACK_DECISION: READY | BLOCKED
#
# validate is the contract between requirements → build: the spec the requirements
# command emits must be a valid forge:build input. A spec is VALID iff it has a
# name, a stack, and an acceptance block covering ALL FIVE operational dimensions
# (functional, ux, devops, monitoring, hardening) with at least one weighted assertion.
# The sixth dimension `logic` (business-rule golden oracle) is optional for pure-CRUD apps
# but, when present, must carry at least one gated golden row (gate: true); set REQUIRE_LOGIC=1
# to make it mandatory for a computational domain (payroll, accounting, POS, billing).
# Set REQUIRE_STACK_DECISION=1 to also require `decision: <dir>` under the spec's stack block
# pointing at a decision directory whose `stack` verdict is READY (evidence + owner approval).
#   exit 0 VALID / 1 INVALID / 2 ERROR
#
# stack is the seam for references/stack-selection-protocol.md. The decision dir holds
# `stack-decision.md` (MADR-shaped record) plus the research ledgers `sources.tsv` +
# `claims.tsv` (validated by score-research.sh). READY iff: both ledgers valid · ≥3 options
# (`### O-n`) · ≥3 weighted criteria rows (`| RQ-n | … | weight | traces |`, traces naming a
# requirement/decision id) · every criterion has a comparison-matrix row whose every scored cell
# cites ≥1 citable `[S-nn]` · every criterion is covered by ≥1 claim · `Recommendation:` names
# an existing option · `Approval:` is `approved …` or `owner-mandated …` (pending = BLOCKED —
# the owner, not the harness, signs off a stack).
#   exit 0 READY / 1 BLOCKED / 2 ERROR
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SPEC_DEFAULT="$REPO_ROOT/claude-plugin/commands/forge/requirements.md"

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
    "/forge:build|forge build"
    "dimension"
    "weight"
    "logic|golden"
    "rule matrix|golden vector|expected output"
    "chain|handoff"
    "scope creep|conflict"
    "stack-decision|technology selection|stack-selection-protocol"
  )
  local score=0 pat
  for pat in "${checks[@]}"; do
    if grep -qiE -- "$pat" "$file"; then score=$((score + 1)); fi
  done
  echo "SCORE: $score"
}

# ---------------------------------------------------------------------------
# validate: a generated build spec must be a valid forge:build input.
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

  # Opt-in technology-selection requirement: the stack block must point (`decision: <dir>`)
  # at a decision directory whose `stack` gate is READY — evidence ledgers valid AND the
  # owner's approval recorded. requirements Phase 5 and build's spec intake set this.
  local stack_decision="n/a" ddir=""
  if [[ "${REQUIRE_STACK_DECISION:-0}" == "1" ]]; then
    ddir=$(grep -m1 -oE 'decision:[[:space:]]*[^,}#[:space:]]+' "$spec" | sed -E 's/^decision:[[:space:]]*//; s/^["'"'"']|["'"'"']$//g')
    if [[ -z "$ddir" ]]; then
      stack_decision="missing"; ok=0
    else
      [[ -d "$ddir" ]] || ddir="$(dirname "$spec")/$ddir"
      if stack "$ddir" >/dev/null 2>&1; then stack_decision="ready"; else stack_decision="blocked"; ok=0; fi
    fi
    # spec-kit style marker: an unresolved stack field is not a decision.
    if grep -qE 'NEEDS[ _-]CLARIFICATION' "$spec"; then stack_decision="$stack_decision+unresolved"; ok=0; fi
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
  echo "stack_decision=$stack_decision require_stack_decision=${REQUIRE_STACK_DECISION:-0}"
  [[ "$ok" -eq 1 ]] && return 0 || return 1
}

# ---------------------------------------------------------------------------
# stack: the technology-selection gate (references/stack-selection-protocol.md).
#   stdout: STACK_DECISION: READY | BLOCKED | ERROR   (single line)
#   stderr: each criterion with its measured value and PASS/FAIL
# ---------------------------------------------------------------------------
stack() {
  local dir="${1:?usage: stack <decision-dir>}"
  local doc="$dir/stack-decision.md" src="$dir/sources.tsv" clm="$dir/claims.tsv"
  local sr="$SCRIPT_DIR/score-research.sh"
  if [[ ! -f "$doc" ]]; then
    echo "STACK_DECISION: ERROR"; echo "reason=missing $doc" >&2; return 2
  fi
  local blocked=0 line
  if [[ -f "$src" ]] && line=$(AR_SCORE_LOG=0 bash "$sr" sources "$src" 2>/dev/null) && [[ "$line" == "SOURCES: VALID"* ]]; then
    echo "criterion source-ledger: $line PASS" >&2
  else
    echo "criterion source-ledger: ${line:-sources.tsv missing} FAIL" >&2; blocked=1
  fi
  line=""
  if [[ -f "$src" && -f "$clm" ]] && line=$(AR_SCORE_LOG=0 bash "$sr" claims "$clm" "$src" 2>/dev/null) && [[ "$line" == "CLAIMS: VALID"* ]]; then
    echo "criterion claims-ledger: $line PASS" >&2
  else
    echo "criterion claims-ledger: ${line:-claims.tsv missing} FAIL" >&2; blocked=1
  fi
  # The approval pins the exact evidence the owner saw: `ledger:<sha256-16>` of sources+claims,
  # hashed with CRs stripped so a CRLF checkout (core.autocrlf=true) yields the same pin as LF.
  local ledger_sha
  ledger_sha=$(cat "$src" "$clm" 2>/dev/null | tr -d '\r' | sha256sum | cut -c1-16)
  # Decision-record structure: options, weighted+traced criteria, a fully cited comparison
  # matrix, per-criterion claim coverage, a named recommendation, and the owner's approval.
  awk -v FS='\t' -v src="$src" -v clm="$clm" -v ledger="$ledger_sha" '
    function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
    function fail(msg) { print "criterion " msg " FAIL" > "/dev/stderr"; bad++ }
    function pass(msg) { print "criterion " msg " PASS" > "/dev/stderr" }
    BEGIN {
      bad = 0
      while ((getline l < src) > 0) {
        n = split(l, f, "\t")
        if (n >= 9 && f[1] ~ /^S-/ && f[9] != "rejected" && f[9] != "unverified") { citable[f[1]] = 1; tier[f[1]] = f[2] }
      }
      while ((getline l < clm) > 0) {
        n = split(l, f, "\t")
        if (n >= 6 && f[2] ~ /^RQ-[0-9]+$/) covered[f[2]] = 1
      }
    }
    /^## / { section = tolower($0); next }
    /^### O-[0-9]+/ { match($0, /O-[0-9]+/); opts[substr($0, RSTART, RLENGTH)] = 1; nopts++; next }
    /^Recommendation:/ { rec = trim(substr($0, 16)); next }
    /^Approval:/ { appr = trim(substr($0, 10)); next }
    /^Confidence:/ { conf = trim(substr($0, 12)); next }
    /^Robustness:/ { robust = trim(substr($0, 12)); next }
    section ~ /consequence/ && /^- *(Bad|Risk)/ { nbad++; next }
    /^\|[ \t]*RQ-[0-9]+[ \t]*\|/ {
      n = split($0, c, "|"); id = trim(c[2])
      if (section ~ /matrix|comparison/) {
        cells = 0; uncited = 0; orphan = ""; unresolved = 0; t4only = 0
        for (i = 3; i <= n; i++) {
          v = trim(c[i]); if (v == "") continue
          cells++
          if (v ~ /\?/) { unresolved++; continue }
          if (v !~ /\[S-[0-9]+/) { uncited++; continue }
          s = v; strong = 0
          while (match(s, /S-[0-9]+/)) {
            sid = substr(s, RSTART, RLENGTH); s = substr(s, RSTART + RLENGTH)
            if (!(sid in citable)) orphan = orphan " " sid
            else if (tier[sid] != "T4") strong = 1
          }
          if (orphan == "" && !strong) t4only++
        }
        mrow[id] = cells; muncited[id] = uncited; morphan[id] = orphan; munres[id] = unresolved; mt4[id] = t4only
      } else if (section ~ /driver|criteri/) {
        ncrit++; crit[id] = 1
        if (trim(c[4]) !~ /^[0-9]+(\.[0-9]+)?$/) fail("criterion-weight: " id " weight \"" trim(c[4]) "\" not numeric")
        if (trim(c[5]) !~ /(NFR|FR|A|C|US|SC)-[0-9]+/) fail("criterion-trace: " id " traces no requirement/decision id")
      }
      next
    }
    END {
      if (nopts >= 3) pass("options: " nopts " considered (>=3)"); else fail("options: " nopts+0 " considered (<3 — show real alternatives)")
      if (ncrit >= 3) pass("criteria: " ncrit " weighted+traced (>=3)"); else fail("criteria: " ncrit+0 " weighted criteria (<3)")
      for (id in crit) {
        if (!(id in mrow)) { fail("matrix-row: " id " has no comparison-matrix row"); continue }
        if (mrow[id] < nopts) fail("matrix-row: " id " scores " mrow[id] " cells for " nopts " options")
        if (munres[id] > 0) fail("matrix-unresolved: " id " has " munres[id] " `?` cell(s) — a decision on missing data; gather evidence, elicit the input, or pre-register a spike")
        if (muncited[id] > 0) fail("matrix-evidence: " id " has " muncited[id] " uncited cell(s) — every score cites [S-nn]")
        if (morphan[id] != "") fail("matrix-evidence: " id " cites uncitable/orphan" morphan[id])
        if (mt4[id] > 0) fail("matrix-evidence: " id " has " mt4[id] " cell(s) resting on T4-only sources (blogs/forums/vendor comparisons are context, never sole support)")
        if (!(id in covered)) fail("claim-coverage: " id " has no claim in claims.tsv")
      }
      if (rec ~ /O-[0-9]+/ && (substr(rec, match(rec, /O-[0-9]+/), RLENGTH) in opts)) pass("recommendation: " rec)
      else fail("recommendation: \"" rec "\" names no considered option")
      if (conf ~ /^(high|moderate|low)/) pass("confidence: " conf)
      else fail("confidence: " (conf == "" ? "missing" : conf) " (declare high|moderate|low — disclose how sure the evidence makes you)")
      if (robust ~ /^(robust|fragile)/) pass("robustness: " robust)
      else fail("robustness: " (robust == "" ? "missing" : robust) " (sensitivity sweep verdict robust|fragile required — a bare weighted total is fake precision)")
      if (nbad >= 1) pass("consequences: " nbad " negative consequence(s)/risk(s) recorded")
      else fail("consequences: no `- Bad:`/`- Risk:` line — every stack has downsides; a record without them is a sales pitch")
      if (appr ~ /^(approved|owner-mandated)/) {
        if (match(appr, /ledger:[0-9a-f]+/)) {
          pinned = substr(appr, RSTART + 7, RLENGTH - 7)
          if (pinned == ledger) pass("approval: " appr)
          else fail("approval-stale: ledger changed after sign-off (approved ledger:" pinned ", now ledger:" ledger ") — re-run the playback and re-approve")
        } else fail("approval-pin: approval must pin the evidence it approved — append ledger:" ledger " (sha256 of sources.tsv+claims.tsv, first 16 hex)")
      }
      else fail("approval: " (appr == "" ? "missing" : appr) " (owner sign-off required — the harness never approves its own stack)")
      exit (bad == 0 ? 0 : 1)
    }
  ' "$doc" || blocked=1
  if [[ "$blocked" -eq 0 ]]; then echo "STACK_DECISION: READY"; return 0; fi
  echo "STACK_DECISION: BLOCKED"; return 1
}

case "${1:-}" in
  rubric)   shift; rubric   "$@" ;;
  validate) shift; validate "$@" ;;
  stack)    shift; stack    "$@" ;;
  *) echo "usage: $0 {rubric [file] | validate <spec.yaml> | stack <decision-dir>}" >&2; exit 64 ;;
esac
