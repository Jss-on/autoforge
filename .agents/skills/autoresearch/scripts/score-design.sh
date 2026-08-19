#!/usr/bin/env bash
# score-design.sh — mechanical seams for /autoresearch:design (the UI/UX designer + design QA).
#
#   lint     <DESIGN.md>                          → DESIGN_LINT: VALID | INVALID   (schema + contrast pairs)
#   scan     <design-scan.json>                   → SLOP: N  +  SLOP_GATE: PASS | FAIL   (design-scan.cjs output)
#   critique <design-critique.tsv>                → DESIGN_HEALTH: N/M (Band)      (heuristic ledger)
#   defects  <design-defects.tsv>                 → DEFECTS: VALID|INVALID total= blocking=   (delegates to score-test.sh)
#   verdict  <design-defects.tsv> [scan.json] [DESIGN.md] [critique.tsv]
#                                                 → DESIGN_VERDICT: SHIP | FIX | REBUILD
#   seed     <text-or-file> <n>                   → 1-based deterministic index (the direction roll)
#   rubric   [design.md]                          → SCORE: N   (grep-rubric of the command spec)
#
# Reuse-first: the defect ledger is score-test.sh's ledger (same 7 columns, same blocking rule —
# a critical design defect may not be deferred either); ux acceptance rows stay in build-results.tsv
# and are scored by score-build.sh. Everything here is deterministic — a third party can rerun it
# on the stored run dir. Node is a hard CORE dependency of the harness (doctor.sh), so JSON/YAML
# parsing goes through it rather than hand-rolled grep.
#
# exit codes: 0 pass/valid · 1 fail/invalid · 2 unreadable / usage
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCORE_TEST="$SCRIPT_DIR/score-test.sh"
SCAN_CJS="$SCRIPT_DIR/design-scan.cjs"
SPEC_DEFAULT="$REPO_ROOT/claude-plugin/commands/autoresearch/design.md"

# ---------------------------------------------------------------------------
log_invocation() {
  local sub="$1" file="$2" headline="$3" dir ts sha
  [[ "${AR_SCORE_LOG:-1}" == "1" ]] || return 0
  dir="$(dirname "$file")" || return 0
  [[ -d "$dir" && -w "$dir" ]] || return 0
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)" || ts="unknown"
  sha="$(sha256sum "$file" 2>/dev/null | cut -c1-16)" || sha=""
  printf '%s\t%s\t%s\t%s\t%s\n' "$ts" "$sub" "$(basename "$file")" "${sha:-nohash}" "$headline" \
    >> "$dir/score-log.tsv" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# lint: DESIGN.md is the machine-readable design source (google-labs-code/design.md spec):
# YAML frontmatter with `colors`, `typography`, `spacing`, `rounded` (+ optional `components`)
# and prose sections. The gate checks the token groups a build must trace exist, hex values
# parse, motion + component states are declared, and every text/surface pair the file itself
# implies clears WCAG AA (on-X vs X; text/muted tokens vs background AND every surface).
#   stdout: DESIGN_LINT: VALID|INVALID
#   stderr: token counts, contrast pairs measured, each failure
# ---------------------------------------------------------------------------
lint() {
  local file="${1:?usage: lint <DESIGN.md>}"
  [[ -f "$file" ]] || { echo "DESIGN_LINT: INVALID"; echo "file not found: $file" >&2; return 2; }
  [[ -f "$SCAN_CJS" ]] || { echo "DESIGN_LINT: INVALID"; echo "missing seam: $SCAN_CJS" >&2; return 2; }
  local out rc
  out="$(node -e '
    const fs = require("fs");
    const { parseFrontmatter, hexToRgb } = require(process.argv[1]);
    const md = fs.readFileSync(process.argv[2], "utf8");
    const errs = [], warns = [];
    const fm = parseFrontmatter(md);
    if (!fm) { console.error("no YAML frontmatter (--- … ---) — tokens must be machine-readable"); console.log("DESIGN_LINT: INVALID"); process.exit(1); }
    if (!fm.name) errs.push("missing frontmatter `name`");
    // colors
    const colors = {};
    (function walk(o, prefix) { for (const [k, v] of Object.entries(o || {})) { if (v && typeof v === "object") walk(v, prefix + k + "."); else colors[prefix + k] = String(v); } })(fm.colors, "");
    const colorKeys = Object.keys(colors);
    if (colorKeys.length < 4) errs.push(`colors: ${colorKeys.length} token(s) (need >= 4: a ground, a text, an accent, a status role at minimum)`);
    const rgb = {}; for (const [k, v] of Object.entries(colors)) { const c = hexToRgb(v); if (!c) { if (/^(rgb|hsl|oklch)/i.test(v)) warns.push(`colors.${k}: non-hex value "${v}" skipped for contrast math (hex is the portable form)`); else errs.push(`colors.${k}: not a valid hex color ("${v}")`); } else rgb[k] = c; }
    // typography
    const typo = fm.typography || {}; const roles = Object.entries(typo).filter(([, v]) => v && typeof v === "object");
    if (roles.length < 2) errs.push(`typography: ${roles.length} role(s) (need >= 2, e.g. display/headline + body)`);
    for (const [k, v] of roles) { if (!v.fontFamily) errs.push(`typography.${k}: missing fontFamily`); if (!v.fontSize) errs.push(`typography.${k}: missing fontSize`); }
    const families = new Set(roles.map(([, v]) => String(v.fontFamily || "").split(",")[0].trim().toLowerCase()).filter(Boolean));
    if (families.size > 3) warns.push(`typography: ${families.size} families (>3 reads as unsystematic)`);
    // spacing
    const spacing = Object.keys(fm.spacing || {}); if (spacing.length < 2) errs.push(`spacing: ${spacing.length} token(s) (need >= 2: base + scale)`);
    // rounded (spec key) — accept legacy radius/radii with a warning
    const rounded = fm.rounded || fm.radius || fm.radii;
    if (!rounded || Object.keys(rounded).length === 0) errs.push("rounded: missing (declare the corner-radius scale, even if it is a single 0px)");
    else if (!fm.rounded) warns.push("`radius:` should be `rounded:` (DESIGN.md spec key; keeps the file portable across DESIGN.md-aware tools)");
    // prose: motion + states must be declared somewhere (they are DESIGN_COVERAGE groups)
    const body = md.replace(/^---[\s\S]*?---/, "");
    if (!/motion|transition|animation|prefers-reduced-motion|duration|easing/i.test(body + JSON.stringify(fm))) errs.push("motion: no motion/transition/easing/reduced-motion guidance declared");
    if (!/loading|empty state|empty|error state|error|success/i.test(body)) errs.push("states: no loading/empty/error/success component-state guidance declared");
    if (!/prefers-reduced-motion|reduced.motion/i.test(body + JSON.stringify(fm))) warns.push("prefers-reduced-motion not mentioned — the motion section should say what collapses");
    // contrast pairs
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    const keys = Object.keys(rgb); let pairs = 0, fails = [];
    const need = (fg, bg, min, why) => { pairs++; const r = ratio(rgb[fg], rgb[bg]); if (r < min) fails.push(`${fg} on ${bg} = ${r.toFixed(2)}:1 < ${min}:1 (${why})`); };
    // on-X vs X (Material-style pairs)
    for (const k of keys) { const m = /^(.*?)on-([a-z0-9-]+)$/.exec(k); if (m) { const base = m[1] + m[2]; if (rgb[base]) need(k, base, 4.5, "on-token pair"); } }
    // text tokens vs every ground/surface
    const grounds = keys.filter(k => /(^|\.)(background|surface(-container(-lowest|-low|-high|-highest)?|-dim|-bright)?|card|canvas|panel|sheet)$/i.test(k) && !/on-|foreground|text/i.test(k));
    const texts = keys.filter(k => /(on-surface|on-background|foreground|(^|\.)text|ink|body-text|muted-foreground|on-surface-variant|on-surface-faint|text-muted|muted-text|secondary-text)/i.test(k) && !/hover|disabled|inverse|on-primary|on-secondary|on-tertiary|on-error|on-accent|on-destructive|on-success|on-warning|on-info/i.test(k));
    for (const t of texts) for (const g of grounds) need(t, g, 4.5, "text on ground/surface");
    if (fails.length) errs.push(...fails.map(f => "contrast: " + f));
    console.error(`tokens: colors=${colorKeys.length} typography_roles=${roles.length} families=${families.size} spacing=${spacing.length} rounded=${rounded ? Object.keys(rounded).length : 0} components=${Object.keys(fm.components || {}).length}`);
    console.error(`contrast_pairs=${pairs} contrast_fail=${fails.length}`);
    for (const w of warns) console.error("warn: " + w);
    for (const e of errs) console.error("error: " + e);
    console.log(errs.length ? "DESIGN_LINT: INVALID" : "DESIGN_LINT: VALID");
    process.exit(errs.length ? 1 : 0);
  ' "$SCAN_CJS" "$file")"
  rc=$?
  printf '%s\n' "$out"
  log_invocation "lint" "$file" "$out"
  return $rc
}

# ---------------------------------------------------------------------------
# scan: reduce a design-scan.cjs report to the floor gate. error+warn count; advisory does not.
#   stdout: "SLOP: N" then "SLOP_GATE: PASS|FAIL"      exit 0 iff N == 0
#   stderr: per-rule counts, per-page counted findings, advisory total, engine
# ---------------------------------------------------------------------------
scan() {
  local file="${1:?usage: scan <design-scan.json>}"
  [[ -f "$file" ]] || { echo "SLOP: 0"; echo "SLOP_GATE: FAIL"; echo "file not found: $file" >&2; return 2; }
  local out rc
  out="$(node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const pages = r.pages || []; let counted = 0, advisory = 0, errors = 0; const byRule = {};
    for (const p of pages) for (const f of p.findings || []) { byRule[f.rule] = (byRule[f.rule] || 0) + 1; if (f.severity === "advisory") advisory++; else { counted++; if (f.severity === "error") errors++; } }
    console.error(`engine=${(r.meta && r.meta.engine) || "?"} mode=${(r.meta && r.meta.mode) || "?"} pages=${pages.length} viewports=${(r.meta && r.meta.viewports || []).map(v => v.width + "x" + v.height).join(",")}`);
    for (const p of pages) console.error(`  ${p.url} @${p.viewport}: counted=${(p.findings || []).filter(f => f.severity !== "advisory").length} advisory=${(p.findings || []).filter(f => f.severity === "advisory").length}${p.screenshot ? " shot=" + p.screenshot : ""}`);
    for (const [k, v] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) console.error(`  rule ${k}=${v}`);
    console.error(`counted=${counted} errors=${errors} advisory=${advisory}`);
    if (pages.length === 0) console.error("no pages scanned — an empty scan is not a clean scan");
    console.log(`SLOP: ${counted}`);
    console.log(`SLOP_GATE: ${counted === 0 && pages.length > 0 ? "PASS" : "FAIL"}`);
    process.exit(counted === 0 && pages.length > 0 ? 0 : 1);
  ' "$file")"
  rc=$?
  printf '%s\n' "$out"
  log_invocation "scan" "$file" "$(printf '%s' "$out" | tr '\n' ' ')"
  return $rc
}

# ---------------------------------------------------------------------------
# critique: validate the heuristic-critique ledger and compute the design-health score.
# design-critique.tsv (tab): item  kind  score  max  note
#   kind=heuristic  — Nielsen H1..H10 (item = H1..H10), score 0-4 or na, max 4  (all ten rows required)
#   kind=cognitive  — the 8 cognitive-load checks (item = C1..C8), score 0|1 (1 = passes), max 1
#   kind=persona    — persona red flags (item = persona name), score = red-flag count, max 0
#   stdout: DESIGN_HEALTH: N/M (Band)     Band by percent: >=90 Excellent · >=70 Good · >=50 Acceptable · >=30 Poor · else Critical
#   stderr: heuristics scored/na, cognitive fails, persona flags, validation errors
#   exit: 0 valid · 1 invalid (missing heuristics, bad scores) · 2 unreadable
# ---------------------------------------------------------------------------
critique() {
  local file="${1:?usage: critique <design-critique.tsv>}"
  [[ -f "$file" ]] || { echo "DESIGN_HEALTH: 0/0 (Unscored)"; echo "file not found: $file" >&2; return 2; }
  local out rc
  out="$(awk -v FS='\t' '
    BEGIN { errs=0; sum=0; max=0; nH=0; na=0; cogFail=0; cogN=0; persona=0; flags=0 }
    /^#/ { next }
    $1=="item" && $2=="kind" { next }
    NF==0 || $0 ~ /^[[:space:]]*$/ { next }
    {
      if (NF < 4) { print "row " NR ": expected >=4 columns (item kind score max note)" > "/dev/stderr"; errs++; next }
      kind=$2; sc=$3;
      if (kind=="heuristic") {
        if ($1 !~ /^H([1-9]|10)$/) { print "row " NR ": heuristic item must be H1..H10 (got " $1 ")" > "/dev/stderr"; errs++ }
        if (seenH[$1]++) { print "row " NR ": duplicate heuristic " $1 > "/dev/stderr"; errs++ }
        nH++;
        if (sc=="na") { na++ }
        else if (sc !~ /^[0-4]$/) { print "row " NR ": heuristic score must be 0-4 or na (got " sc ")" > "/dev/stderr"; errs++ }
        else { sum+=sc; max+=4 }
      } else if (kind=="cognitive") {
        cogN++; if (sc !~ /^[01]$/) { print "row " NR ": cognitive score must be 0|1" > "/dev/stderr"; errs++ } else if (sc==0) cogFail++;
      } else if (kind=="persona") {
        persona++; if (sc !~ /^[0-9]+$/) { print "row " NR ": persona score = red-flag count (integer)" > "/dev/stderr"; errs++ } else flags+=sc;
      } else { print "row " NR ": unknown kind " kind > "/dev/stderr"; errs++ }
    }
    END {
      if (nH < 10) { print "heuristics: " nH "/10 rows present — all ten Nielsen heuristics must be scored (na allowed with a note)" > "/dev/stderr"; errs++ }
      pct = (max>0 ? sum/max*100 : 0);
      band = (max==0 ? "Unscored" : pct>=90 ? "Excellent" : pct>=70 ? "Good" : pct>=50 ? "Acceptable" : pct>=30 ? "Poor" : "Critical");
      printf "heuristics_scored=%d na=%d cognitive_checks=%d cognitive_fails=%d personas=%d persona_flags=%d\n", nH-na, na, cogN, cogFail, persona, flags > "/dev/stderr";
      printf "DESIGN_HEALTH: %d/%d (%s)\n", sum, max, band;
      exit (errs==0 ? 0 : 1);
    }
  ' "$file")"
  rc=$?
  printf '%s\n' "$out"
  log_invocation "critique" "$file" "$out"
  return $rc
}

# ---------------------------------------------------------------------------
# defects: the design defect ledger IS the QA defect ledger (same schema, same blocking rule).
# ---------------------------------------------------------------------------
defects() {
  local file="${1:?usage: defects <design-defects.tsv>}"
  [[ -f "$SCORE_TEST" ]] || { echo "DEFECTS: INVALID total=0 blocking=0"; echo "missing seam: $SCORE_TEST" >&2; return 2; }
  bash "$SCORE_TEST" defects "$file"
}

# ---------------------------------------------------------------------------
# verdict: the design QA disposition — the reviewer's word, derived, never felt.
#   REBUILD  — DESIGN_HEALTH band Poor/Critical, or any open defect whose summary carries [rebuild]
#   FIX      — blocking defects (open critical/high), SLOP_GATE FAIL, or DESIGN.md lint INVALID
#   SHIP     — none of the above
#   stdout: DESIGN_VERDICT: SHIP|FIX|REBUILD    exit 0 SHIP · 1 FIX/REBUILD · 2 unusable inputs
#   stderr: each criterion with its measured value
# ---------------------------------------------------------------------------
verdict() {
  local defects_file="${1:?usage: verdict <design-defects.tsv> [design-scan.json] [DESIGN.md] [design-critique.tsv]}"
  local scan_file="${2:-}" design_md="${3:-}" critique_file="${4:-}"
  [[ -f "$defects_file" ]] || { echo "DESIGN_VERDICT: FIX"; echo "defects file not found: $defects_file" >&2; return 2; }
  local rebuild=0 fix=0

  local d_out d_block
  d_out="$(defects "$defects_file" 2>/dev/null)"
  d_block="$(printf '%s' "$d_out" | grep -o 'blocking=[0-9]*' | cut -d= -f2)"
  if printf '%s' "$d_out" | grep -q 'INVALID'; then echo "criterion defects-ledger: INVALID FAIL" >&2; fix=1; fi
  if [[ "${d_block:-0}" -gt 0 ]]; then echo "criterion blocking-defects: $d_block open critical/high FAIL" >&2; fix=1; else echo "criterion blocking-defects: 0 PASS" >&2; fi
  if awk -v FS='\t' '$4!="verified" && $4!="closed" && $4!="rejected" && $4!="duplicate" && tolower($6) ~ /\[rebuild\]/ {found=1} END{exit(found?0:1)}' "$defects_file"; then
    echo "criterion rebuild-directive: an open defect is tagged [rebuild] FAIL" >&2; rebuild=1
  fi

  if [[ -n "$scan_file" ]]; then
    if [[ -f "$scan_file" ]]; then
      local s_out; s_out="$(scan "$scan_file" 2>/dev/null)"
      if printf '%s' "$s_out" | grep -q 'SLOP_GATE: PASS'; then echo "criterion slop-gate: $(printf '%s' "$s_out" | head -1) PASS" >&2
      else echo "criterion slop-gate: $(printf '%s' "$s_out" | head -1 | tr '\n' ' ') FAIL" >&2; fix=1; fi
    else echo "criterion slop-gate: scan file missing ($scan_file) FAIL" >&2; fix=1; fi
  else echo "criterion slop-gate: not supplied (skipped)" >&2; fi

  if [[ -n "$design_md" ]]; then
    if [[ -f "$design_md" ]]; then
      if lint "$design_md" >/dev/null 2>&1; then echo "criterion design-lint: VALID PASS" >&2
      else echo "criterion design-lint: INVALID FAIL" >&2; fix=1; fi
    else echo "criterion design-lint: DESIGN.md missing ($design_md) FAIL" >&2; fix=1; fi
  else echo "criterion design-lint: not supplied (skipped)" >&2; fi

  if [[ -n "$critique_file" ]]; then
    if [[ -f "$critique_file" ]]; then
      local c_out; c_out="$(critique "$critique_file" 2>/dev/null)"
      case "$c_out" in
        *Poor*|*Critical*) echo "criterion design-health: $c_out FAIL (rebuild band)" >&2; rebuild=1 ;;
        *Unscored*)        echo "criterion design-health: $c_out FAIL (no heuristics scored)" >&2; fix=1 ;;
        *)                 echo "criterion design-health: $c_out PASS" >&2 ;;
      esac
    else echo "criterion design-health: critique file missing ($critique_file) FAIL" >&2; fix=1; fi
  else echo "criterion design-health: not supplied (skipped)" >&2; fi

  local v="SHIP"
  if [[ "$rebuild" -eq 1 ]]; then v="REBUILD"; elif [[ "$fix" -eq 1 ]]; then v="FIX"; fi
  echo "DESIGN_VERDICT: $v"
  log_invocation "verdict" "$defects_file" "DESIGN_VERDICT: $v"
  [[ "$v" == "SHIP" ]] && return 0 || return 1
}

# ---------------------------------------------------------------------------
# seed: the direction roll. A deterministic pick among N candidate directions from a stable
# input (the spec/brief text or a file) — reproducible across reruns, different across projects,
# so every build does not converge on the category default. Prints a 1-based index.
# ---------------------------------------------------------------------------
seed() {
  local input="${1:?usage: seed <text-or-file> <n>}" n="${2:?usage: seed <text-or-file> <n>}"
  [[ "$n" =~ ^[0-9]+$ && "$n" -ge 1 ]] || { echo "n must be a positive integer" >&2; return 2; }
  local text="$input"
  [[ -f "$input" ]] && text="$(cat "$input")"
  node -e '
    const crypto = require("crypto");
    const h = crypto.createHash("sha256").update(process.argv[1]).digest("hex");
    const n = parseInt(process.argv[2], 10);
    const v = parseInt(h.slice(0, 12), 16) % n;
    console.log(v + 1);
  ' "$text" "$n"
}

# ---------------------------------------------------------------------------
# rubric: grep the design command spec for its required capabilities. "SCORE: N".
# ---------------------------------------------------------------------------
rubric() {
  local file="${1:-$SPEC_DEFAULT}"
  if [[ ! -f "$file" ]]; then echo "SCORE: 0"; return 0; fi
  local checks=(
    "DESIGN.md" "frontmatter|token" "visitor mode|persuade|operate" "read|experience"
    "direction|thesis" "seed|roll" "calibrat|anti-default|category default"
    "slop|floor|tell" "design-scan|SLOP_GATE" "score-design" "lint" "contrast"
    "heuristic|Nielsen" "cognitive load" "persona" "P0|P1|severity"
    "SHIP|FIX|REBUILD" "capture|screenshot" "valid" "evidence" "defects" "handoff"
    "read-only|never (edit|modify)" "--fix|remediat" "keep|discard|revert"
    "states|loading|empty|error" "onboard|empty state" "copy|clarify|error message"
    "harden|long text|i18n|overflow" "responsive|viewport" "WCAG|a11y|accessib" "reduced-motion|motion"
    "Playwright" "audit" "system"
  )
  local score=0 pat
  for pat in "${checks[@]}"; do grep -qiE -- "$pat" "$file" && score=$((score + 1)); done
  echo "SCORE: $score"
}

# ---------------------------------------------------------------------------
usage() { grep '^#' "$0" | sed 's/^# \{0,1\}//' | sed -n '2,20p'; }

case "${1:-}" in
  lint)     shift; lint "$@" ;;
  scan)     shift; scan "$@" ;;
  critique) shift; critique "$@" ;;
  defects)  shift; defects "$@" ;;
  verdict)  shift; verdict "$@" ;;
  seed)     shift; seed "$@" ;;
  rubric)   shift; rubric "$@" ;;
  -h|--help|help|"") usage; [[ -n "${1:-}" ]] && exit 0 || exit 64 ;;
  *) echo "unknown subcommand: $1" >&2; usage >&2; exit 64 ;;
esac
