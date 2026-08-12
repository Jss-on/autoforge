#!/usr/bin/env bash
# score-build.sh — scoring backend for autoresearch:build (full SDLC + UI/UX + hardening).
#
#   rubric    [file]                       → grep-rubric capability score of build.md → "SCORE: N"
#   pass-rate [results.tsv|spec…]          → weighted acceptance pass-rate from a build-results TSV
#   coverage  [results.tsv] [requirements] → PRD + design traceability gate (REQ_/DESIGN_COVERAGE)
#
# pass-rate logic (metric_direction: higher_is_better):
#   - acceptance assertions are grouped into 6 dimensions, each with a weight:
#       logic 0.30 · functional 0.30 · ux 0.20 · devops 0.15 · monitoring 0.15 · hardening 0.20
#     (weights renormalize over the dims that ran, so adding `logic` does NOT rescore a
#      legacy spec that declares no `logic` rows — it just renormalizes over the old five.)
#     UI/UX is first-class and gates the score — a working-but-ugly/inaccessible app is capped.
#   - LOGIC GATE: `logic` rows are business-rule golden cases and are must-pass. While ANY
#     `logic` row is red, the headline pass-rate is capped at LOGIC_GATE_CAP (default 0.50) —
#     you cannot ride ux/devops/monitoring/hardening polish to "done" while domain math is wrong.
#   - per-dimension score = sum(weight of pass) / sum(weight of pass|fail); status=skip excluded
#   - dimension weights are renormalized over the dimensions that actually ran.
#   - no measurable rows at all → PASS_RATE: 0.00 (honest baseline: nothing built yet).
#   - STDOUT is exactly one line: "PASS_RATE: N"  (so `… | awk '{print $2}'` yields the number).
#     The per-dim breakdown + dims_ran/dims_unavailable go to STDERR.
#   - exit 0 always on a well-formed/empty TSV (baseline is valid); exit 2 only on hard error.
#
# Overridable env: BUILD_RESULTS, REQUIREMENTS_MD, BUILD_DESIGN_TAGS, BUILD_W_LOGIC, BUILD_W_FUNCTIONAL,
#                  BUILD_W_UX, BUILD_W_DEVOPS, BUILD_W_MONITORING, BUILD_W_HARDENING, LOGIC_GATE_CAP
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SPEC_DEFAULT="$REPO_ROOT/claude-plugin/commands/autoresearch/build.md"

BUILD_W_LOGIC="${BUILD_W_LOGIC:-0.30}"
BUILD_W_FUNCTIONAL="${BUILD_W_FUNCTIONAL:-0.30}"
BUILD_W_UX="${BUILD_W_UX:-0.20}"
BUILD_W_DEVOPS="${BUILD_W_DEVOPS:-0.15}"
BUILD_W_MONITORING="${BUILD_W_MONITORING:-0.15}"
BUILD_W_HARDENING="${BUILD_W_HARDENING:-0.20}"
# Logic gate: until every `logic` (business-rule golden) row passes, the headline pass-rate
# is capped here — domain correctness can't be bypassed by polishing the other dimensions.
LOGIC_GATE_CAP="${LOGIC_GATE_CAP:-0.50}"

# Canonical DESIGN.md token groups every `ux` row must collectively trace (drives DESIGN_COVERAGE).
BUILD_DESIGN_TAGS="${BUILD_DESIGN_TAGS:-design:type design:color design:spacing design:radius design:motion design:states}"

# ---------------------------------------------------------------------------
# rubric: grep the build spec for required capability tokens. Each matched
# pattern = +1. Prints "SCORE: N" only. Mirrors score-regression.sh rubric.
# Covers the full SDLC (requirements→design→implement→debug→test→deploy),
# the comprehensive test pyramid, and the UI/UX dimension.
# ---------------------------------------------------------------------------
rubric() {
  local file="${1:-$SPEC_DEFAULT}"
  if [[ ! -f "$file" ]]; then echo "SCORE: 0"; return 0; fi

  local checks=(
    # --- scope / output ---
    "scaffold"
    "full.?stack|fullstack"
    "greenfield"
    "acceptance"
    "build-results"
    "pass.?rate|PASS_RATE"
    "handoff"
    # --- SDLC phases ---
    "SDLC|life.?cycle|software engineering"
    "requirement"
    "design"
    "implement"
    "debug"
    "deploy"
    "phase gate|gate|exit criteria"
    "PRD|specification"
    "root cause"
    # --- comprehensive test pyramid ---
    "TDD|red.{0,3}green|green.assertion"
    "test pyramid|unit.*integration|unit, integration"
    "unit test|unit"
    "integration"
    "e2e|end.to.end"
    "visual"
    "coverage"
    # --- UI/UX dimension ---
    "ux|UI/UX|user experience"
    "design system"
    "DESIGN.md|design.md"
    "conformance|design-review"
    "getdesign|awesome-design|design-consultation"
    "responsive"
    "accessibility|a11y|WCAG"
    "axe"
    "/browse|browse|playwright"
    "loading state|empty state|error state|states"
    "contrast|keyboard|focus|aria"
    # --- devops ---
    "Dockerfile|docker"
    "multi.?stage"
    "non.?root"
    "HEALTHCHECK|healthcheck"
    "CI|pipeline"
    "dep.?scan|dependency.scan|npm audit|trivy"
    "compose|IaC|terraform|kubernetes|k8s"
    "migration"
    "graceful.shutdown|SIGTERM"
    "env.config|environment variable|process.env"
    # --- monitoring ---
    "healthz"
    "readyz"
    "metrics"
    "Prometheus|prometheus"
    "structured.{0,3}log|JSON log"
    "trace|correlation"
    # --- hardening ---
    "secret"
    "security header|helmet|CSP|HSTS"
    "input validation|validate"
    "rate.?limit"
    "auth"
    # --- dimensions present by name ---
    "functional"
    "devops|DevOps"
    "monitoring"
    "hardening|harden"
    # --- domain logic correctness (Logic-First) ---
    "logic"
    "golden|golden case|golden vector|oracle"
    "rule matrix|business rule"
    "domain (engine|model|logic)"
    "logic gate|must.?pass|gating"
  )

  local score=0 pat
  for pat in "${checks[@]}"; do
    if grep -qiE -- "$pat" "$file"; then score=$((score + 1)); fi
  done
  echo "SCORE: $score"
}

# ---------------------------------------------------------------------------
# resolve_results: pick the build-results TSV to score. A .tsv arg wins; else
# env BUILD_RESULTS; else the conventional locations. Spec globs (*.spec.yaml)
# are accepted as args (they declare the suite) but the number comes from the TSV.
# ---------------------------------------------------------------------------
resolve_results() {
  local a
  for a in "$@"; do
    if [[ "$a" == *.tsv && -f "$a" ]]; then printf '%s' "$a"; return 0; fi
  done
  # An explicit BUILD_RESULTS override is authoritative: if set, use it; if it points
  # nowhere, treat as "no results" baseline — never silently fall back to a discovered
  # file the caller did not ask for.
  if [[ -n "${BUILD_RESULTS:-}" ]]; then
    [[ -f "$BUILD_RESULTS" ]] && { printf '%s' "$BUILD_RESULTS"; return 0; }
    return 1
  fi
  # No implicit discovery. The old conventional-location list could resolve a
  # DIFFERENT project's stale TSV (evals/fullstack/build-results.tsv) and score
  # it 1.00 with the logic gate reported n/a — a false green with zero signal
  # that the wrong ledger was read. Scoring only ever happens on a file the
  # caller explicitly named (arg or BUILD_RESULTS).
  return 1
}

# ---------------------------------------------------------------------------
# log_invocation: append an audit line to score-log.tsv next to the scored TSV.
# This is the anchor that lets a third party check the scorer actually ran on
# that exact ledger: timestamp, subcommand, file, content hash, headline.
# Logging must never break scoring — best-effort, silent on failure.
# ---------------------------------------------------------------------------
log_invocation() {
  local sub="$1" file="$2" headline="$3" dir ts sha
  # AR_SCORE_LOG=0 disables the audit log (test suites scoring fixtures must not
  # dirty the repo). Default is on — real runs always leave the trail.
  [[ "${AR_SCORE_LOG:-1}" == "1" ]] || return 0
  dir="$(dirname "$file")" || return 0
  [[ -d "$dir" && -w "$dir" ]] || return 0
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)" || ts="unknown"
  sha="$(sha256sum "$file" 2>/dev/null | cut -c1-16)" || sha=""
  printf '%s\t%s\t%s\t%s\t%s\n' "$ts" "$sub" "$(basename "$file")" "${sha:-nohash}" "$headline" \
    >> "$dir/score-log.tsv" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# apply_evidence_strict: pre-pass for BUILD_EVIDENCE_STRICT=1. Every `pass` row
# must carry an `evidence:<relpath>[#locator]` token in its detail column whose
# file exists (relative to BUILD_EVIDENCE_DIR, the TSV's directory, or cwd).
# A pass row without checkable evidence is demoted to fail before scoring —
# "the model says it passed" stops being scoreable currency on its own.
# Emits the filtered TSV path on stdout; violation count on stderr.
# ---------------------------------------------------------------------------
apply_evidence_strict() {
  local results="$1" evdir tmp miss=0 line
  evdir="${BUILD_EVIDENCE_DIR:-$(dirname "$results")}"
  tmp="$(mktemp)"
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      '#'*|'spec'$'\t'*) printf '%s\n' "$line" >> "$tmp"; continue ;;
    esac
    local IFS=$'\t'; read -r -a c <<< "$line"; unset IFS
    if [[ "${#c[@]}" -ge 5 && "${c[4]}" == "pass" ]]; then
      local detail="${c[5]:-}" ref="" ok=0
      ref="$(printf '%s' "$detail" | grep -oE 'evidence:[^#[:space:],;]+' | head -1 | cut -d: -f2-)"
      if [[ -n "$ref" ]]; then
        if [[ -f "$evdir/$ref" || -f "$(dirname "$results")/$ref" || -f "$ref" ]]; then ok=1; fi
      fi
      if [[ "$ok" -eq 0 ]]; then
        c[4]="fail"
        c[5]="${detail:+$detail; }EVIDENCE-MISSING"
        miss=$((miss + 1))
        local out="" i
        for i in "${!c[@]}"; do out+="${c[$i]}"$'\t'; done
        printf '%s\n' "${out%$'\t'}" >> "$tmp"
        continue
      fi
    fi
    printf '%s\n' "$line" >> "$tmp"
  done < "$results"
  echo "evidence_violations=$miss" >&2
  printf '%s' "$tmp"
}

# ---------------------------------------------------------------------------
# pass-rate: reduce a build-results TSV to a weighted acceptance pass-rate.
# TSV columns (tab):  spec  dimension  assertion  weight  status  detail  [traces]
# status ∈ {pass, fail, skip}.  Comment (#) + header rows ignored.
# Col 7 `traces` (optional, comma-sep FR-n/NFR-n/design:<group>) is read by `coverage`, not pass-rate.
# ---------------------------------------------------------------------------
pass-rate() {
  local a args=()
  for a in "$@"; do
    if [[ "$a" == "--strict-evidence" ]]; then BUILD_EVIDENCE_STRICT=1; else args+=("$a"); fi
  done
  set -- ${args[@]+"${args[@]}"}

  local results
  if ! results="$(resolve_results "$@")"; then
    echo "PASS_RATE: 0.00"
    echo "dims_ran=none" >&2
    echo "dims_unavailable=logic,functional,ux,devops,monitoring,hardening" >&2
    echo "reason=no-results-tsv (pass an explicit path or set BUILD_RESULTS)" >&2
    return 0
  fi

  local eff="$results" strict_tmp="" strict_tag=""
  if [[ "${BUILD_EVIDENCE_STRICT:-0}" == "1" ]]; then
    strict_tmp="$(apply_evidence_strict "$results")"
    eff="$strict_tmp"
    strict_tag="(strict)"
  fi

  local headline
  headline="$(awk -v FS='\t' \
      -v wL="$BUILD_W_LOGIC" -v wF="$BUILD_W_FUNCTIONAL" -v wU="$BUILD_W_UX" -v wD="$BUILD_W_DEVOPS" \
      -v wM="$BUILD_W_MONITORING" -v wH="$BUILD_W_HARDENING" -v gate="$LOGIC_GATE_CAP" '
    /^#/            { next }
    $1=="spec"      { next }
    NF < 5          { next }
    {
      dim=$2; wt=$4+0; st=$5;
      if (wt <= 0) wt = 1;
      if (st=="pass") { num[dim]+=wt; den[dim]+=wt }
      else if (st=="fail") { den[dim]+=wt }
      # status=skip (n/a) excluded from both numerator and denominator
    }
    END {
      w["logic"]=wL; w["functional"]=wF; w["ux"]=wU; w["devops"]=wD; w["monitoring"]=wM; w["hardening"]=wH;
      n=split("logic,functional,ux,devops,monitoring,hardening", order, ",");

      tot=0; ran=""; unavail="";
      for (i=1;i<=n;i++) {
        d=order[i];
        if ((d in den) && den[d] > 0) {
          score[d]=num[d]/den[d]; tot += w[d];
          ran = ran (ran==""?"":",") d;
        } else {
          unavail = unavail (unavail==""?"":",") d;
        }
      }

      if (tot == 0) {
        print "PASS_RATE: 0.00";
        print "dims_ran=none" > "/dev/stderr";
        print "dims_unavailable=logic,functional,ux,devops,monitoring,hardening" > "/dev/stderr";
        exit 0;
      }

      # Single division (weighted numerator / total) keeps all-pass exactly 1.0 —
      # summing per-term (w/tot) accumulates float error and floors a true 1.00 to 0.99.
      wnum=0;
      for (i=1;i<=n;i++) { d=order[i]; if (d in score) wnum += w[d]*score[d]; }
      pr = wnum/tot;

      # Floor to 2 decimals (never rounds up); tiny epsilon absorbs residual float noise.
      disp = int(pr*100 + 1e-9)/100;

      # LOGIC GATE — business-rule golden cases are must-pass. While the `logic` dimension
      # is below 100 percent, cap the headline number so domain correctness cannot be bought
      # with ux/devops/monitoring/hardening polish. No `logic` rows declared then n/a (legacy).
      gate0 = gate + 0;
      logicgate = "n/a";
      if ("logic" in score) {
        if (score["logic"] < 0.999) { if (disp > gate0) disp = gate0; logicgate = sprintf("CAPPED@%.2f", gate0) }
        else logicgate = "PASS";
      }

      printf "PASS_RATE: %.2f\n", disp;
      printf "dims_ran=%s\n", ran > "/dev/stderr";
      printf "dims_unavailable=%s\n", (unavail==""?"none":unavail) > "/dev/stderr";
      printf "logic_gate=%s\n", logicgate > "/dev/stderr";
      for (i=1;i<=n;i++) { d=order[i]; if (d in score)
        printf "  %-11s score=%.2f weight=%.2f\n", d, int(score[d]*100)/100, w[d] > "/dev/stderr"; }
      printf "  pass_rate=%.2f over dims_ran=%s\n", disp, ran > "/dev/stderr";
    }
  ' "$eff")"
  [[ -n "$strict_tmp" ]] && rm -f "$strict_tmp"
  printf '%s\n' "$headline"
  log_invocation "pass-rate$strict_tag" "$results" "$headline"
}

# ---------------------------------------------------------------------------
# resolve_requirements: pick the requirements.md (PRD) whose FR-/NFR- IDs form
# the coverage universe. A .md arg wins; else env REQUIREMENTS_MD; else convention.
# ---------------------------------------------------------------------------
resolve_requirements() {
  local a
  for a in "$@"; do
    if [[ "$a" == *.md && -f "$a" ]]; then printf '%s' "$a"; return 0; fi
  done
  if [[ -n "${REQUIREMENTS_MD:-}" ]]; then
    [[ -f "$REQUIREMENTS_MD" ]] && { printf '%s' "$REQUIREMENTS_MD"; return 0; }
    return 1
  fi
  for a in "requirements.md" "autoresearch/requirements.md" "$REPO_ROOT/requirements.md"; do
    if [[ -f "$a" ]]; then printf '%s' "$a"; return 0; fi
  done
  return 1
}

# ---------------------------------------------------------------------------
# coverage: structural traceability gate (no orphans). Every PRD requirement ID
# (FR-/NFR- in requirements.md) must be named by >=1 acceptance row's `traces`
# (TSV col 7); every BUILD_DESIGN_TAGS group must be traced by >=1 `ux` row.
# A trace to a non-existent requirement is an orphan and also fails the gate.
#   STDOUT: "REQ_COVERAGE: N.NN" then "DESIGN_COVERAGE: N.NN"
#   STDERR: req_total/req_covered/untraced, design_total/.../design_missing, orphan_traces
#   exit 0 iff both == 1.00 and no orphans ; exit 1 if incomplete ; exit 2 hard error.
# ---------------------------------------------------------------------------
coverage() {
  local results reqs
  if ! results="$(resolve_results "$@")"; then
    echo "REQ_COVERAGE: 0.00"; echo "DESIGN_COVERAGE: 0.00"
    echo "reason=no-results-tsv" >&2; return 2
  fi
  if ! reqs="$(resolve_requirements "$@")"; then
    echo "REQ_COVERAGE: 0.00"; echo "DESIGN_COVERAGE: 0.00"
    echo "reason=no-requirements-md" >&2; return 2
  fi

  local out
  out="$(awk -v FS='\t' -v REQFILE="$reqs" -v DESIGN_TAGS="$BUILD_DESIGN_TAGS" '
    BEGIN {
      nUni=0;
      while ((getline line < REQFILE) > 0) {
        s=line;
        while (match(s, /(FR|NFR)-[0-9]+/)) {
          id=substr(s, RSTART, RLENGTH);
          if (!(id in uni)) { uni[id]=1; nUni++ }
          s=substr(s, RSTART+RLENGTH);
        }
      }
      close(REQFILE);
      ndt=split(DESIGN_TAGS, dt, /[ ,]+/);
      for (i=1;i<=ndt;i++) if (dt[i] != "") needDesign[dt[i]]=1;
    }
    /^#/       { next }
    $1=="spec" { next }
    NF < 5     { next }
    {
      dim=$2; traces=(NF>=7 ? $7 : "");
      m=split(traces, t, /[ ,]+/);
      for (i=1;i<=m;i++) {
        tok=t[i]; if (tok=="") continue;
        if (tok ~ /^(FR|NFR)-[0-9]+$/) {
          tracedReq[tok]=1;
          if (!(tok in uni)) orphan[tok]=1;
        } else if (tok ~ /^design:/) {
          if (dim=="ux") tracedDesign[tok]=1;
        }
      }
    }
    END {
      covered=0; untraced="";
      for (id in uni) { if (id in tracedReq) covered++; else untraced=untraced (untraced==""?"":",") id }
      reqcov = (nUni==0 ? 0 : covered/nUni);

      dcovered=0; dmissing="";
      for (g in needDesign) { if (g in tracedDesign) dcovered++; else dmissing=dmissing (dmissing==""?"":",") g }
      dcov = (ndt==0 ? 0 : dcovered/ndt);

      orphans="";
      for (o in orphan) orphans=orphans (orphans==""?"":",") o;

      rdisp=int(reqcov*100+1e-9)/100; ddisp=int(dcov*100+1e-9)/100;
      printf "REQ_COVERAGE: %.2f\n", rdisp;
      printf "DESIGN_COVERAGE: %.2f\n", ddisp;
      printf "req_total=%d req_covered=%d untraced=%s\n", nUni, covered, (untraced==""?"none":untraced) > "/dev/stderr";
      printf "design_total=%d design_covered=%d design_missing=%s\n", ndt, dcovered, (dmissing==""?"none":dmissing) > "/dev/stderr";
      printf "orphan_traces=%s\n", (orphans==""?"none":orphans) > "/dev/stderr";
      if (rdisp>=1.0 && ddisp>=1.0 && orphans=="") exit 0; else exit 1;
    }
  ' "$results")"
  local rc=$?
  printf '%s\n' "$out"
  log_invocation "coverage" "$results" "$(printf '%s' "$out" | tr '\n' ' ')"
  return $rc
}

# ---------------------------------------------------------------------------
# bound: enforce the iteration budget mechanically. Reads iterations.tsv (first
# column = iteration number) and compares the highest iteration used against the
# declared bound. The DJN build ran 48 iterations against a bound of 40 and
# still reported CONVERGED — this gate makes that impossible to do silently.
#   exit 0 BOUND: OK · exit 1 BOUND: EXCEEDED · exit 2 BOUND: UNKNOWN
# ---------------------------------------------------------------------------
bound() {
  local its="${1:?usage: bound <iterations.tsv> <max-iterations>}"
  local max="${2:?usage: bound <iterations.tsv> <max-iterations>}"
  if [[ ! -f "$its" ]]; then echo "BOUND: UNKNOWN used=0 max=$max"; return 2; fi
  if ! printf '%s' "$max" | grep -qE '^[0-9]+$'; then
    echo "BOUND: UNKNOWN used=0 max=$max"; return 2
  fi
  local used
  used=$(awk '/^#/ { next } $1 ~ /^[0-9]+$/ { if ($1 + 0 > m) m = $1 + 0 } END { print m + 0 }' "$its")
  if [[ "$used" -le "$max" ]]; then
    echo "BOUND: OK used=$used max=$max"; return 0
  fi
  echo "BOUND: EXCEEDED used=$used max=$max"; return 1
}

case "${1:-}" in
  rubric)    shift; rubric    "$@" ;;
  pass-rate) shift; pass-rate "$@" ;;
  coverage)  shift; coverage  "$@" ;;
  bound)     shift; bound     "$@" ;;
  *) echo "usage: $0 {rubric [file] | pass-rate [--strict-evidence] [results.tsv|spec…] | coverage [results.tsv] [requirements.md] | bound <iterations.tsv> <max>}" >&2; exit 64 ;;
esac
