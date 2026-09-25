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
# Set REQUIRE_STACK_DECISION=1 to also require `decision:` inside the spec's stack block:
# a decision directory whose `stack` verdict is READY and whose selected option names the
# spec's framework. Owner mandates use the same evidence and approval gate.
#   exit 0 VALID / 1 INVALID / 2 ERROR
#
# stack is the seam for references/stack-selection-protocol.md. The decision dir holds
# `stack-decision.md` (MADR-shaped record), the research ledgers `sources.tsv` + `claims.tsv`
# (validated by score-research.sh) and the reading notes the claims point at. It prints one
# `criterion <name>: <measured> PASS|FAIL` line per rule on stderr — run it to see the rules —
# and READY only when every rule passes, including the owner's approval pinned to a hash of the
# exact ledgers + record it approved (the harness never approves its own stack).
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
  local acceptance_plan="legacy-unverified"
  if [[ "${REQUIRE_ACCEPTANCE_PLAN:-0}" == 1 || -n "${2:-}" ]]; then
    acceptance_plan=blocked
    if [[ -n "${2:-}" ]] && node "$SCRIPT_DIR/acceptance.cjs" hosting "${3:-.}" "$2" >/dev/null; then
      acceptance_plan=ready
    else ok=0
    fi
  fi
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

  # Opt-in technology-selection requirement (requirements Phase 5 and build's spec intake set it).
  # Only the stack block is read: the `stack:` line itself (inline map) plus its indented children.
  local stack_decision="n/a" ddir="" sblock="" rc base want rec heading
  if [[ "${REQUIRE_STACK_DECISION:-0}" == "1" ]]; then
    sblock=$(awk '/^[[:space:]]*#/ { next } /^stack:/ { f = 1 } /^[^[:space:]#]/ && !/^stack:/ { f = 0 } f { sub(/[[:space:]]+#.*/, ""); print }' "$spec" | tr -d '\r')
    ddir=$(printf '%s\n' "$sblock" | grep -m1 -oE 'decision:[[:space:]]*[^,}#[:space:]]+' | sed -E 's/^decision:[[:space:]]*//; s/^["'"'"']|["'"'"']$//g')
    if [[ -z "$ddir" ]]; then
      stack_decision="missing"; ok=0
    else
      # Relative paths resolve against the spec's project (walk up from the spec's directory),
      # so the same committed spec validates identically from any cwd; a bare cwd-relative hit is
      # the last resort.
      if [[ "$ddir" != /* ]]; then
        base=$(cd "$(dirname "$spec")" && pwd)
        while [[ ! -d "$base/$ddir" && "$base" != "$(dirname "$base")" ]]; do base=$(dirname "$base"); done
        [[ -d "$base/$ddir" ]] && ddir="$base/$ddir"
      fi
      if [[ ! -f "$ddir/stack-decision.md" ]]; then
        stack_decision="missing-dir"; ok=0
      else
        stack "$ddir" >/dev/null 2>&1; rc=$?
        case $rc in
          0) stack_decision="ready" ;;
          2) stack_decision="error"; ok=0 ;;
          *) stack_decision="blocked"; ok=0 ;;
        esac
      fi
      # The record must describe THIS spec's stack: the spec's framework token appears in the
      # selected option's heading (an approval on a foreign record is not an approval).
      if [[ "$stack_decision" == "ready" ]]; then
        want=$(printf '%s\n' "$sblock" | grep -m1 -oE 'framework:[[:space:]]*[^,}#[:space:]]+' | sed -E 's/^framework:[[:space:]]*//; s/@.*$//; s/^["'"'"']|["'"'"']$//g')
        rec=$(awk '/^## / { exit } /^Decision:/ { print $2; exit }' "$ddir/stack-decision.md" | tr -d '\r')
        heading=$(awk -v choice="$rec" '/^## / { options = (tolower($0) ~ /considered options/) } options && /^### / && $2 == choice { print; exit }' "$ddir/stack-decision.md" | tr -d '\r')
        if [[ -z "$want" || -z "$heading" ]] || ! tr -cs '[:alnum:]_.-' '\n' <<<"$heading" | grep -qixF -- "$want"; then
          stack_decision="mismatch($want not in $rec)"; ok=0
        fi
      fi
    fi
    # spec-kit style marker inside the stack block: an unresolved field is not a decision.
    if printf '%s\n' "$sblock" | grep -qE 'NEEDS[ _-]CLARIFICATION'; then stack_decision="$stack_decision+unresolved"; ok=0; fi
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
  echo "acceptance_plan=$acceptance_plan"
  [[ "$ok" -eq 1 ]] && return 0 || return 1
}

# ---------------------------------------------------------------------------
# stack: the technology-selection gate (references/stack-selection-protocol.md §7).
#   stdout: STACK_DECISION: READY | BLOCKED | ERROR   (single line)
#   stderr: each criterion with its measured value and PASS/FAIL
# ---------------------------------------------------------------------------
stack() {
  local dir="${1:?usage: stack <decision-dir>}"
  local doc="$dir/stack-decision.md" src="$dir/sources.tsv" clm="$dir/claims.tsv"
  local sr="$SCRIPT_DIR/score-research.sh" shatool
  if [[ ! -f "$doc" ]]; then
    echo "STACK_DECISION: ERROR"; echo "reason=missing $doc" >&2; return 2
  fi
  if [[ ! -f "$sr" ]]; then
    echo "STACK_DECISION: ERROR"; echo "reason=missing $sr (seam scripts ship together — reinstall)" >&2; return 2
  fi
  if command -v sha256sum >/dev/null 2>&1; then shatool="sha256sum"
  elif command -v shasum >/dev/null 2>&1; then shatool="shasum -a 256"
  else echo "STACK_DECISION: ERROR"; echo "reason=no sha256sum/shasum on PATH (the approval pin needs one)" >&2; return 2
  fi
  local blocked=0 line="" cline=""
  if [[ -f "$src" ]] && line=$(AR_SCORE_LOG=0 bash "$sr" sources "$src" 2>/dev/null) && [[ "$line" == "SOURCES: VALID"* ]]; then
    echo "criterion source-ledger: $line PASS" >&2
  else
    echo "criterion source-ledger: ${line:-sources.tsv missing} FAIL" >&2; blocked=1
  fi
  if [[ -f "$src" && -f "$clm" ]] && cline=$(AR_SCORE_LOG=0 bash "$sr" claims "$clm" "$src" 2>/dev/null) && [[ "$cline" == "CLAIMS: VALID"* ]]; then
    echo "criterion claims-ledger: $cline PASS" >&2
  elif [[ ! -f "$clm" ]]; then
    echo "criterion claims-ledger: claims.tsv missing FAIL" >&2; blocked=1
  elif [[ ! -f "$src" ]]; then
    echo "criterion claims-ledger: sources.tsv missing (claims unverifiable) FAIL" >&2; blocked=1
  else
    echo "criterion claims-ledger: $cline FAIL" >&2; blocked=1
  fi
  if [[ -f "$dir/queries.tsv" ]] && awk 'NF && !/^#/ { n++ } END { exit(n < 2) }' "$dir/queries.tsv"; then
    echo "criterion query-log: search queries recorded PASS" >&2
  else
    echo "criterion query-log: queries.tsv needs a header and at least one search FAIL" >&2; blocked=1
  fi
  # Evidence is what was read: every claim's `evidence:<relpath>` reading note must exist.
  local missing_notes=0 cid ev rel
  if [[ -f "$clm" ]]; then
    while IFS=$'\t' read -r cid _ _ _ _ ev _; do
      [[ "$cid" == C-* ]] || continue
      rel="${ev#evidence:}"; rel="${rel//$'\r'/}"; rel="${rel%%[[:space:]]*}"
      if [[ -z "$rel" || ! -s "$dir/$rel" ]]; then
        echo "criterion evidence-notes: $cid → ${rel:-?} missing or empty FAIL" >&2; missing_notes=$((missing_notes + 1))
      fi
    done < "$clm"
    if [[ "$missing_notes" -eq 0 ]]; then echo "criterion evidence-notes: every claim's reading note exists PASS" >&2; else blocked=1; fi
  fi
  # The approval pins EXACTLY what the owner saw: ledgers + the record (minus the lines the
  # approval itself writes), CR-stripped so LF and CRLF checkouts agree.
  local ledger_sha nhigh=0
  ledger_sha=$( (cat "$src" "$clm" 2>/dev/null; grep -vE '^(Approval|Status):' "$doc") | tr -d '\r' | $shatool | cut -c1-16)
  echo "approval-pin: ledger:$ledger_sha (record only after the owner's answer)" >&2
  [[ "$cline" =~ high=([0-9]+) ]] && nhigh="${BASH_REMATCH[1]}"
  awk -v FS='\t' -v src="$src" -v clm="$clm" -v ledger="$ledger_sha" -v nhigh="$nhigh" '
    function trim(s) { gsub(/^[ \t\r]+|[ \t\r]+$/, "", s); return s }
    function fail(msg) { print "criterion " msg " FAIL" > "/dev/stderr"; bad++ }
    function pass(msg) { print "criterion " msg " PASS" > "/dev/stderr" }
    BEGIN {
      bad = 0; nopts = 0; ncrit = 0; nbad = 0; ystmt = 0
      while ((getline l < src) > 0) {
        sub(/\r$/, "", l); n = split(l, f, "\t")
        if (n >= 9 && f[1] ~ /^S-/ && f[9] != "rejected" && f[9] != "unverified") { citable[f[1]] = 1; tier[f[1]] = f[2]; depth[f[1]] = f[8] }
      }
      while ((getline l < clm) > 0) {
        sub(/\r$/, "", l); n = split(l, f, "\t")
        if (n >= 6 && f[2] ~ /^RQ-[0-9]+$/) covered[f[2]] = 1
      }
    }
    { sub(/\r$/, "") }
    /^## / { section = tolower($0); next }
    section != "" && NF && !/^### / { body[section] = body[section] " " $0 }
    # Header lines: first occurrence only, before the first `## ` heading.
    section == "" && /^Status:/         && status == "" { status = tolower(trim(substr($0, 8)));   next }
    section == "" && /^Recommendation:/ && rec == ""    { rec = trim(substr($0, 16));              next }
    section == "" && /^Decision:/       && decision == "" { decision = trim(substr($0, 10));        next }
    section == "" && /^Approval:/       && appr == ""   { appr = trim(substr($0, 10));             next }
    section == "" && /^Confidence:/     && conf == ""   { conf = tolower(trim(substr($0, 12)));    next }
    section == "" && /^Robustness:/     && robust == "" { robust = tolower(trim(substr($0, 12)));  next }
    section == "" && /^\*\*Y-statement:\*\*/            { ystmt = 1;                                next }
    # Options are the `### O-n` headings under Considered options (MADR pros/cons headings are not options).
    section ~ /considered options/ && /^### O-[0-9]+/ {
      match($0, /O-[0-9]+/); o = substr($0, RSTART, RLENGTH)
      if (!(o in opts)) { opts[o] = 1; nopts++ }
      next
    }
    section ~ /consequence/ && /^- *(Bad|Risk)/ { nbad++; next }
    # Knock-out table: `| gate | O-1 | O-2 | … |` header maps columns to options; a `fail` cell eliminates.
    section ~ /knock/ && /^\|/ {
      n = split($0, c, "|"); h = tolower(trim(c[2]))
      if (h == "gate") { for (i = 3; i <= n; i++) { v = trim(c[i]); if (v ~ /^O-[0-9]+$/) kocol[i] = v }; next }
      if (h ~ /^-+$/) next
      for (i in kocol) if (tolower(trim(c[i])) == "fail") ko[kocol[i]] = ko[kocol[i]] " " trim(c[2])
      next
    }
    /^\|/ && /RQ-[0-9]+/ {
      n = split($0, c, "|"); id = trim(c[2])
      if (!match(id, /RQ-[0-9]+/)) next
      id = substr(id, RSTART, RLENGTH)
      if (section ~ /matrix|comparison/) {
        if (id in mrow) next             # the first matrix table is the gated one; run-2 / sweep tables are views
        cells = 0; uncited = 0; orphan = ""; unresolved = 0; t4only = 0; badscore = 0
        for (i = 3; i <= n; i++) {
          v = trim(c[i]); if (v == "") continue
          cells++
          if (v ~ /\?/) { unresolved++; continue }
          if (v !~ /^[0-5]([[:space:]]|$)/) { badscore++; continue }
          if (v !~ /\[S-[0-9]+/) { uncited++; continue }
          s = v; strong = 0
          while (match(s, /S-[0-9]+/)) {
            sid = substr(s, RSTART, RLENGTH); s = substr(s, RSTART + RLENGTH)
            if (!(sid in citable)) orphan = orphan " " sid
            else if (tier[sid] != "T4") {
              strong = 1
              if (depth[sid] == "full" && !((i SUBSEP sid) in readsource)) { readsource[i, sid] = 1; nread[i]++ }
            }
          }
          if (orphan == "" && !strong) t4only++
        }
        mrow[id] = cells; muncited[id] = uncited; morphan[id] = orphan; munres[id] = unresolved; mt4[id] = t4only; mbad[id] = badscore
      } else if (section ~ /driver|criteri/) {
        if (!(id in crit)) { crit[id] = 1; ncrit++ }
        if (trim(c[4]) !~ /^[0-9]+(\.[0-9]+)?([ \t]+\([HML]\))?$/ || c[4]+0 <= 0) fail("criterion-weight: " id " weight \"" trim(c[4]) "\" must be positive (H/M/L → 3/2/1)")
        if (trim(c[5]) !~ /(NFR|FR|A|C|US|SC)-[0-9]+/) fail("criterion-trace: " id " traces no requirement/decision id")
      }
      next
    }
    END {
      if (status ~ /^(approved|owner-mandated)$/) pass("status: " status)
      else fail("status: " (status == "" ? "missing" : status) " — only approved|owner-mandated records are READY (proposed = not signed off; superseded = point decision: at the new record)")
      if (ystmt) pass("y-statement: present"); else fail("y-statement: missing — the one-sentence reasoning (facing / decided for / neglected / to achieve / accepting)")
      if (nopts >= 3) pass("options: " nopts " considered (>=3)"); else fail("options: " nopts " distinct `### O-n` under Considered options (<3 — show real alternatives)")
      if (ncrit >= 3) pass("criteria: " ncrit " weighted+traced (>=3)"); else fail("criteria: " ncrit " distinct weighted drivers (<3)")
      split("context|knock-out|decision outcome|pros and cons|disconfirmation|confirmation", required, "|")
      for (r in required) {
        found = 0
        for (s in body) if (index(s, required[r]) && trim(body[s]) != "") found = 1
        if (!found) fail("reasoning: missing or empty " required[r] " section")
      }
      for (i = 3; i < nopts + 3; i++) if (nread[i] < 2) fail("research-depth: option column " i-2 " needs at least 2 distinct non-T4 sources read in full")
      for (o in opts) {
        found = 0
        for (s in body) if (s ~ /disconfirmation/ && body[s] ~ (o "([^0-9]|$)")) found = 1
        if (!found) fail("disconfirmation: " o " has no recorded search")
      }
      for (id in crit) {
        if (!(id in mrow)) { fail("matrix-row: " id " has no comparison-matrix row"); continue }
        if (mrow[id] < nopts) fail("matrix-row: " id " scores " mrow[id] " cells for " nopts " options")
        if (munres[id] > 0) fail("matrix-unresolved: " id " has " munres[id] " `?` cell(s) — a decision on missing data; gather evidence, elicit the input, or score at low confidence with the spike pre-registered")
        if (mbad[id] > 0) fail("matrix-score: " id " has " mbad[id] " cell(s) not a 0–5 score against the driver anchor")
        if (muncited[id] > 0) fail("matrix-evidence: " id " has " muncited[id] " uncited cell(s) — every score cites [S-nn]")
        if (morphan[id] != "") fail("matrix-evidence: " id " cites uncitable/orphan" morphan[id])
        if (mt4[id] > 0) fail("matrix-evidence: " id " has " mt4[id] " cell(s) resting on T4-only sources (blogs/forums/vendor comparisons are context, never sole support)")
        if (!(id in covered)) fail("claim-coverage: " id " has no claim in claims.tsv")
      }
      recopt = ""; if (match(rec, /O-[0-9]+/)) recopt = substr(rec, RSTART, RLENGTH)
      if (recopt != "" && (recopt in opts)) pass("recommendation: " rec)
      else fail("recommendation: \"" rec "\" names no considered option")
      if (!(decision in opts)) fail("decision: \"" decision "\" names no considered option")
      else if (status == "approved" && decision != recopt) fail("decision: approved option differs from the recommendation; use the owner-mandated path")
      if ((decision in ko) && status != "owner-mandated") fail("recommendation: " decision " failed knock-out gate(s):" ko[decision] " — only an owner-mandated record may carry it as an accepted risk")
      if (conf ~ /^(high|moderate|low)/) {
        if (conf ~ /^high/ && nhigh == 0) fail("confidence: high declared but claims.tsv carries 0 high-confidence claims")
        else pass("confidence: " conf)
      } else fail("confidence: " (conf == "" ? "missing" : conf) " (declare high|moderate|low — disclose how sure the evidence makes you)")
      if (robust ~ /^(robust|fragile)/) pass("robustness: " robust)
      else fail("robustness: " (robust == "" ? "missing" : robust) " (sensitivity sweep verdict robust|fragile required — a bare weighted total is fake precision)")
      if (nbad >= 1) pass("consequences: " nbad " negative consequence(s)/risk(s) recorded")
      else fail("consequences: no `- Bad:`/`- Risk:` line — every stack has downsides; a record without them is a sales pitch")
      a = tolower(appr)
      if (a ~ /^(approved|owner-mandated)/) {
        if ((status == "approved" && a !~ /^approved by owner[[:space:]]/) || (status == "owner-mandated" && a !~ /^owner-mandated[[:space:]]/))
          fail("approval-shape: Status and owner approval must agree")
        if (appr !~ /\(A-[0-9]+[),]/ || appr !~ /[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]/)
          fail("approval-shape: needs the owner decision id (A-n) and a date — `approved by owner — rev N (A-n), YYYY-MM-DD, ledger:<hash>`")
        else if (match(a, /ledger:[0-9a-f]+/)) {
          pinned = substr(a, RSTART + 7, RLENGTH - 7)
          if (pinned == ledger) pass("approval: " appr)
          else fail("approval-stale: evidence or record changed after sign-off (approved ledger:" pinned ", now ledger:" ledger ") — re-run the playback and re-approve")
        } else fail("approval-pin: approval must pin what it approved — append ledger:" ledger " (the hash of sources.tsv + claims.tsv + this record)")
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
