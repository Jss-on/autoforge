#!/usr/bin/env bash
# Test harness for /forge:design — score-design.sh (lint / scan / critique / defects /
# verdict / seed / rubric), design-scan.cjs (syntax + parser + optional live fixture scan),
# the design.md command spec, the design-protocol reference, mirror parity, routers, manifests,
# handoff contract, orchestrator polish-ui archetype, and the seventh design coverage group.
set -uo pipefail

# Fixture scoring must not write score-log.tsv into the repo.
export AR_SCORE_LOG=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SD="$REPO_ROOT/scripts/score-design.sh"
SCAN="$REPO_ROOT/scripts/design-scan.cjs"
SB="$REPO_ROOT/scripts/score-build.sh"
SPEC="$REPO_ROOT/claude-plugin/commands/forge/design.md"
PROTO="$REPO_ROOT/claude-plugin/skills/forge/references/design-protocol.md"
CHECK="$REPO_ROOT/claude-plugin/skills/forge/references/uiux-checklist.md"
FIX="$REPO_ROOT/tests/fixtures/design"

PASS=0; FAIL=0; TOTAL=0
pass() { printf '  PASS: %s\n' "$1"; PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); }
fail() { printf '  FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); }
skip() { printf '  SKIP: %s\n' "$1"; }

assert_eq()       { [[ "$1" == "$2" ]] && pass "$3" || fail "$3 (expected '$1', got '$2')"; }
assert_contains() { echo "$1" | grep -q -- "$2" && pass "$3" || fail "$3 (missing '$2')"; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

# ============================================================================
printf '\n--- score-design: lint (DESIGN.md schema + contrast pairs) ---\n'
# ============================================================================

cat > "$T/good.md" <<'EOF'
---
name: Ledger — Quiet Workshop
description: payroll ops console
mode: operate
colors:
  background: '#0f1218'
  surface: '#161b23'
  surface-container: '#1c222c'
  on-surface: '#e7eaf0'
  on-surface-variant: '#a9b1bf'
  primary: '#2456c8'
  on-primary: '#ffffff'
  error: '#ff6b6b'
  on-error: '#1a0000'
typography:
  display: { fontFamily: "IBM Plex Sans", fontSize: 32px, fontWeight: 600, lineHeight: 1.2 }
  body:    { fontFamily: "IBM Plex Sans", fontSize: 16px, fontWeight: 400, lineHeight: 1.55 }
  data:    { fontFamily: "IBM Plex Mono", fontSize: 14px }
spacing: { base: 4px, sm: 8px, md: 16px, lg: 24px }
rounded: { sm: 4px, md: 8px }
---
# Design System: Ledger
## Motion
150–250 ms state transitions, exponential ease-out; prefers-reduced-motion collapses movement.
## States
loading (skeleton), empty (what/why/how), error (what failed + recovery), success.
EOF
L_OUT=$(bash "$SD" lint "$T/good.md" 2>"$T/lint.err"); L_RC=$?
assert_eq "DESIGN_LINT: VALID" "$L_OUT" "lint: valid frontmatter + contrast + motion + states → VALID"
assert_eq 0 "$L_RC" "lint: VALID → exit 0"
assert_contains "$(cat "$T/lint.err")" "contrast_pairs=" "lint: reports contrast pairs measured"

# muted text token failing on a surface → INVALID
sed 's/on-surface-variant: .#a9b1bf./on-surface-variant: "#4a5060"/' "$T/good.md" > "$T/lowc.md"
L_OUT=$(bash "$SD" lint "$T/lowc.md" 2>"$T/lint.err"); L_RC=$?
assert_eq "DESIGN_LINT: INVALID" "$L_OUT" "lint: low-contrast text token → INVALID"
assert_eq 1 "$L_RC" "lint: INVALID → exit 1"
assert_contains "$(cat "$T/lint.err")" "contrast:" "lint: names the failing pair"

# missing motion/states prose → INVALID
head -24 "$T/good.md" > "$T/nomotion.md"; printf '# Design System\nJust tokens.\n' >> "$T/nomotion.md"
L_OUT=$(bash "$SD" lint "$T/nomotion.md" 2>/dev/null)
assert_eq "DESIGN_LINT: INVALID" "$L_OUT" "lint: no motion/states guidance → INVALID"

# legacy radius key → still VALID with a warning
sed 's/^rounded:/radius:/' "$T/good.md" > "$T/radius.md"
L_OUT=$(bash "$SD" lint "$T/radius.md" 2>"$T/lint.err")
assert_eq "DESIGN_LINT: VALID" "$L_OUT" "lint: legacy radius: key accepted"
assert_contains "$(cat "$T/lint.err")" "rounded" "lint: warns to rename radius → rounded"

# no frontmatter → INVALID
printf '# Design\n\nprose only\n' > "$T/prose.md"
bash "$SD" lint "$T/prose.md" >/dev/null 2>&1; L_RC=$?
assert_eq 1 "$L_RC" "lint: prose-only DESIGN.md → INVALID (tokens must be machine-readable)"

bash "$SD" lint "$T/nope.md" >/dev/null 2>&1; L_RC=$?
assert_eq 2 "$L_RC" "lint: missing file → exit 2"

# ============================================================================
printf '\n--- score-design: scan (SLOP gate over design-scan.json) ---\n'
# ============================================================================

cat > "$T/scan-dirty.json" <<'EOF'
{"meta":{"engine":"builtin","mode":"operate","viewports":[{"width":1280,"height":800}]},
 "pages":[{"url":"http://x/","viewport":"1280x800","findings":[
   {"rule":"emoji-icon","severity":"error","detail":"e"},
   {"rule":"kicker-label","severity":"warn","detail":"k"},
   {"rule":"cream-default-palette","severity":"advisory","detail":"c"}]}]}
EOF
S_OUT=$(bash "$SD" scan "$T/scan-dirty.json" 2>"$T/scan.err"); S_RC=$?
assert_eq "SLOP: 2
SLOP_GATE: FAIL" "$S_OUT" "scan: error+warn counted, advisory not"
assert_eq 1 "$S_RC" "scan: findings → exit 1"
assert_contains "$(cat "$T/scan.err")" "rule emoji-icon=1" "scan: per-rule breakdown on stderr"

cat > "$T/scan-clean.json" <<'EOF'
{"meta":{"engine":"builtin","mode":"operate","viewports":[]},"pages":[{"url":"http://x/","viewport":"1280x800","findings":[{"rule":"tap-target-44","severity":"advisory","detail":"a"}]}]}
EOF
S_OUT=$(bash "$SD" scan "$T/scan-clean.json" 2>/dev/null); S_RC=$?
assert_eq "SLOP: 0
SLOP_GATE: PASS" "$S_OUT" "scan: advisory-only → PASS"
assert_eq 0 "$S_RC" "scan: PASS → exit 0"

printf '{"meta":{},"pages":[]}' > "$T/scan-empty.json"
S_OUT=$(bash "$SD" scan "$T/scan-empty.json" 2>/dev/null); S_RC=$?
assert_contains "$S_OUT" "SLOP_GATE: FAIL" "scan: zero pages is not a clean scan"

bash "$SD" scan "$T/none.json" >/dev/null 2>&1; S_RC=$?
assert_eq 2 "$S_RC" "scan: missing file → exit 2"

# ============================================================================
printf '\n--- score-design: critique (heuristic ledger → DESIGN_HEALTH) ---\n'
# ============================================================================

{
  printf 'item\tkind\tscore\tmax\tnote\n'
  for i in 1 2 3 4 5 6 7 8; do printf 'H%d\theuristic\t3\t4\tok\n' "$i"; done
  printf 'H9\theuristic\t2\t4\terrors vague\nH10\theuristic\tna\t4\tno help surface on a landing page\n'
  printf 'C1\tcognitive\t1\t1\tsingle focus\nC2\tcognitive\t0\t1\t7 options at decision\n'
  printf 'Alex\tpersona\t2\t0\tno shortcuts, 8 clicks\n'
} > "$T/crit.tsv"
C_OUT=$(bash "$SD" critique "$T/crit.tsv" 2>"$T/crit.err"); C_RC=$?
assert_eq "DESIGN_HEALTH: 26/36 (Good)" "$C_OUT" "critique: sums scored heuristics, renormalizes na"
assert_eq 0 "$C_RC" "critique: valid ledger → exit 0"
assert_contains "$(cat "$T/crit.err")" "cognitive_fails=1" "critique: cognitive-load fails counted"
assert_contains "$(cat "$T/crit.err")" "persona_flags=2" "critique: persona red flags counted"

head -6 "$T/crit.tsv" > "$T/crit-short.tsv"
bash "$SD" critique "$T/crit-short.tsv" >/dev/null 2>&1; C_RC=$?
assert_eq 1 "$C_RC" "critique: fewer than ten heuristics → invalid"

printf 'item\tkind\tscore\tmax\tnote\nH1\theuristic\t7\t4\tx\n' > "$T/crit-bad.tsv"
bash "$SD" critique "$T/crit-bad.tsv" >/dev/null 2>&1; C_RC=$?
assert_eq 1 "$C_RC" "critique: score outside 0-4 → invalid"

{
  printf 'item\tkind\tscore\tmax\tnote\n'
  for i in 1 2 3 4 5 6 7 8 9 10; do printf 'H%d\theuristic\t1\t4\tbad\n' "$i"; done
} > "$T/crit-poor.tsv"
C_OUT=$(bash "$SD" critique "$T/crit-poor.tsv" 2>/dev/null)
assert_eq "DESIGN_HEALTH: 10/40 (Critical)" "$C_OUT" "critique: band Critical below 30%"

# ============================================================================
printf '\n--- score-design: defects (delegates to score-test) + verdict ---\n'
# ============================================================================

mkdir -p "$T/evidence"; printf 'shot\n' > "$T/evidence/s.png"
hdr='id\tseverity\tpriority\tstatus\ttest_id\tsummary\tevidence\n'
printf "${hdr}DD-1\tlow\tP4\topen\tR-1\tkicker labels\tevidence:evidence/s.png\n" > "$T/d-clean.tsv"
D_OUT=$(bash "$SD" defects "$T/d-clean.tsv" 2>/dev/null)
assert_contains "$D_OUT" "DEFECTS: VALID total=1 blocking=0" "defects: same ledger schema as test"

V_OUT=$(bash "$SD" verdict "$T/d-clean.tsv" "$T/scan-clean.json" "$T/good.md" "$T/crit.tsv" 2>"$T/v.err"); V_RC=$?
assert_eq "DESIGN_VERDICT: SHIP" "$V_OUT" "verdict: no blocking, clean scan, valid lint, good health → SHIP"
assert_eq 0 "$V_RC" "verdict: SHIP → exit 0"
assert_contains "$(cat "$T/v.err")" "criterion slop-gate: SLOP: 0 PASS" "verdict: names each criterion"

V_OUT=$(bash "$SD" verdict "$T/d-clean.tsv" "$T/scan-dirty.json" "$T/good.md" 2>/dev/null); V_RC=$?
assert_eq "DESIGN_VERDICT: FIX" "$V_OUT" "verdict: SLOP > 0 → FIX"
assert_eq 1 "$V_RC" "verdict: FIX → exit 1"

printf "${hdr}DD-2\tcritical\tP1\topen\tR-2\tprimary flow keyboard-trapped\tevidence:evidence/s.png\n" > "$T/d-block.tsv"
V_OUT=$(bash "$SD" verdict "$T/d-block.tsv" "$T/scan-clean.json" 2>/dev/null)
assert_eq "DESIGN_VERDICT: FIX" "$V_OUT" "verdict: open critical → FIX"

printf "${hdr}DD-3\thigh\tP1\topen\tR-3\t[rebuild] world contradicts contract, imitation material\tevidence:evidence/s.png\n" > "$T/d-rebuild.tsv"
V_OUT=$(bash "$SD" verdict "$T/d-rebuild.tsv" "$T/scan-clean.json" 2>/dev/null)
assert_eq "DESIGN_VERDICT: REBUILD" "$V_OUT" "verdict: [rebuild] tag → REBUILD"

V_OUT=$(bash "$SD" verdict "$T/d-clean.tsv" "$T/scan-clean.json" "$T/good.md" "$T/crit-poor.tsv" 2>/dev/null)
assert_eq "DESIGN_VERDICT: REBUILD" "$V_OUT" "verdict: health band Poor → REBUILD"

V_OUT=$(bash "$SD" verdict "$T/d-clean.tsv" "$T/scan-clean.json" "$T/lowc.md" 2>/dev/null)
assert_eq "DESIGN_VERDICT: FIX" "$V_OUT" "verdict: INVALID lint → FIX"

V_OUT=$(bash "$SD" verdict "$T/d-clean.tsv" "$T/missing-scan.json" 2>/dev/null)
assert_eq "DESIGN_VERDICT: FIX" "$V_OUT" "verdict: named-but-missing scan → FIX (never silently skipped)"

bash "$SD" verdict "$T/none.tsv" >/dev/null 2>&1; V_RC=$?
assert_eq 2 "$V_RC" "verdict: missing ledger → exit 2"

# ============================================================================
printf '\n--- score-design: seed (deterministic direction roll) + rubric ---\n'
# ============================================================================

S1=$(bash "$SD" seed "hanai intake brief" 7); S2=$(bash "$SD" seed "hanai intake brief" 7); S3=$(bash "$SD" seed "payroll bureau brief" 7)
assert_eq "$S1" "$S2" "seed: deterministic for the same input"
[[ "$S1" =~ ^[1-7]$ ]] && pass "seed: 1-based index within n" || fail "seed: index out of range ($S1)"
[[ "$S1" != "$S3" || "$S1" == "$S3" ]] && pass "seed: computable for different inputs ($S1 vs $S3)"
bash "$SD" seed "x" 0 >/dev/null 2>&1; S_RC=$?
assert_eq 2 "$S_RC" "seed: n must be >= 1"

R_OUT=$(bash "$SD" rubric "$SPEC")
R_N="${R_OUT#SCORE: }"
[[ "$R_N" -ge 30 ]] && pass "rubric: design.md spec scores >= 30 ($R_N)" || fail "rubric: design.md spec scores >= 30 (got $R_N)"

bash "$SD" bogus >/dev/null 2>&1; U_RC=$?
assert_eq 64 "$U_RC" "unknown subcommand → exit 64"

# ============================================================================
printf '\n--- design-scan.cjs: syntax, DESIGN.md parser, optional live fixture scan ---\n'
# ============================================================================

node --check "$SCAN" >/dev/null 2>&1 && pass "design-scan.cjs parses (node --check)" || fail "design-scan.cjs syntax error"
P_OUT=$(node -e '
  const { loadDesignSystem } = require(process.argv[1]);
  const d = loadDesignSystem(process.argv[2]);
  console.log([d.present, d.fonts.join("|"), d.colors.length, d.radii.join(",")].join(" "));
' "$SCAN" "$T/good.md" 2>/dev/null)
assert_eq "true ibm plex sans|ibm plex mono 9 4,8" "$P_OUT" "design-scan: frontmatter → fonts/colors/radii (flow-map typography)"
P_OUT=$(node -e '
  const { loadDesignSystem } = require(process.argv[1]);
  const d = loadDesignSystem(process.argv[2]); console.log(d.radii.join(","));
' "$SCAN" "$T/radius.md" 2>/dev/null)
assert_eq "4,8" "$P_OUT" "design-scan: legacy radius: key parsed for drift rules"

# Live fixture scan runs only where Playwright resolves (CI has none → SKIP, not FAIL).
PW_CWD=""
if node -e "require.resolve('playwright')" >/dev/null 2>&1; then PW_CWD="$REPO_ROOT"; fi
if [[ -z "$PW_CWD" && -n "${AR_PLAYWRIGHT_CWD:-}" ]] && (cd "$AR_PLAYWRIGHT_CWD" && node -e "require.resolve('playwright',{paths:[process.cwd()]})" >/dev/null 2>&1); then PW_CWD="$AR_PLAYWRIGHT_CWD"; fi
if [[ -z "$PW_CWD" ]]; then
  for d in "$REPO_ROOT"/build-output/*/; do
    [[ -d "$d/node_modules/playwright" ]] && { PW_CWD="$d"; break; }
  done
fi
if [[ -n "$PW_CWD" ]]; then
  PORT=48731
  node -e '
    const http=require("http"),fs=require("fs"),path=require("path");
    const root=process.argv[1], port=+process.argv[2];
    http.createServer((q,r)=>{const f=path.join(root,(q.url.split("?")[0]==="/")?"/slop.html":q.url.split("?")[0]);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end("nf");return}r.writeHead(200,{"content-type":"text/html"});r.end(d)})}).listen(port);
    setTimeout(()=>process.exit(0),90000);
  ' "$FIX" "$PORT" >/dev/null 2>&1 &
  SRV=$!
  sleep 1
  (cd "$PW_CWD" && node "$SCAN" --url "http://127.0.0.1:$PORT/slop.html" --url "http://127.0.0.1:$PORT/clean.html" \
      --viewports 1280x800,390x844 --mode operate --engine builtin --out "$T/live-scan.json" --shots "$T/shots" >/dev/null 2>"$T/live.err")
  LRC=$?
  kill "$SRV" >/dev/null 2>&1 || true
  if [[ -f "$T/live-scan.json" ]]; then
    assert_eq 2 "$LRC" "live scan: fixture with tells → exit 2"
    LS=$(bash "$SD" scan "$T/live-scan.json" 2>"$T/ls.err")
    assert_contains "$LS" "SLOP_GATE: FAIL" "live scan: slop fixture fails the gate"
    for rule in emoji-icon kicker-label nested-cards side-stripe gradient-text glow-shadow ai-purple-gradient bounce-easing tiny-text unlabelled-input zoom-disabled generic-copy dash-in-ui-copy low-contrast layout-property-transition; do
      grep -q "rule $rule=" "$T/ls.err" && pass "live scan: fires $rule" || fail "live scan: missing $rule"
    done
    grep -q "rule hero-metric-cards=" "$T/ls.err" && pass "live scan: stat-tile template detected (advisory in operate)" || fail "live scan: hero-metric-cards not detected"
    CLEAN_COUNTED=$(node -e 'const r=require(process.argv[1]);let n=0;for(const p of r.pages) if(/clean/.test(p.url)) for(const f of p.findings) if(f.severity!=="advisory") n++; console.log(n)' "$T/live-scan.json")
    assert_eq "0" "$CLEAN_COUNTED" "live scan: clean fixture has zero counted findings (no false positives)"
    ls "$T/shots"/*1280x800.png >/dev/null 2>&1 && pass "live scan: screenshots written per route × viewport" || fail "live scan: no screenshots"
  else
    fail "live scan: no output produced ($(head -3 "$T/live.err" | tr '\n' ' '))"
  fi
else
  skip "live fixture scan (no Playwright resolvable — set AR_PLAYWRIGHT_CWD to a project with it)"
fi

# ============================================================================
printf '\n--- spec: design command capability + protocol coverage ---\n'
# ============================================================================

spec_has()  { grep -qiE -- "$1" "$SPEC"  2>/dev/null && pass "$2" || fail "$2 (spec missing /$1/)"; }
proto_has() { grep -qiE -- "$1" "$PROTO" 2>/dev/null && pass "$2" || fail "$2 (protocol missing /$1/)"; }

[[ -f "$SPEC" ]] && pass "design.md command spec exists" || fail "design.md command spec missing"
spec_has "persuade.*operate.*read.*experience|visitor mode" "spec: visitor modes"
spec_has "direction protocol|Design Read"                    "spec: direction protocol"
spec_has "seed"                                              "spec: deterministic direction roll"
spec_has "frontmatter"                                       "spec: machine-readable DESIGN.md"
spec_has "DESIGN_LINT"                                       "spec: lint gate"
spec_has "design-scan|SLOP_GATE"                             "spec: mechanical floor scan"
spec_has "impeccable"                                        "spec: impeccable detector superset"
spec_has "axe"                                               "spec: axe a11y"
spec_has "Nielsen|heuristic"                                 "spec: heuristic critique"
spec_has "cognitive"                                         "spec: cognitive load"
spec_has "persona"                                           "spec: persona walk"
spec_has "DESIGN_HEALTH"                                     "spec: design health score"
spec_has "design-defects.tsv"                                "spec: defect ledger"
spec_has "SHIP.*FIX.*REBUILD|DESIGN_VERDICT"                 "spec: disposition verdict"
spec_has "RECAPTURE|capture"                                 "spec: capture validity"
spec_has "read-only"                                         "spec: audit never edits app source"
spec_has "--fix"                                             "spec: bounded remediation"
spec_has "revert"                                            "spec: keep/discard with revert"
spec_has "never .verified.|only a re-audit"                  "spec: fix marks fixed, not verified"
spec_has "storage-state"                                     "spec: authenticated routes via storage state"
spec_has "score-design.sh"                                   "spec: wired to the seam"
spec_has "handoff"                                           "spec: chain handoff"
spec_has "--refresh"                                         "spec: DESIGN.md refresh from the built world"
spec_has "polish|craft floor|slop"                           "spec: anti-slop vocabulary"

[[ -f "$PROTO" ]] && pass "design-protocol.md reference exists" || fail "design-protocol.md missing"
proto_has "Persuade.*Operate.*Read.*Experience"              "protocol: four visitor modes"
proto_has "archetype"                                        "protocol: surface archetypes"
proto_has "POS|kiosk"                                        "protocol: POS/kiosk archetype"
proto_has "Restrained|Committed|Drenched"                    "protocol: color strategies"
proto_has "cream|oxblood"                                    "protocol: names the saturated attractors"
proto_has "rounded"                                          "protocol: DESIGN.md spec keys"
proto_has "design:floor"                                     "protocol: seventh coverage tag"
proto_has "emoji"                                            "protocol: emoji-icon rule"
proto_has "kicker|eyebrow"                                   "protocol: kicker rule"
proto_has "nested cards"                                     "protocol: nested cards"
proto_has "H1.*H10|Nielsen"                                  "protocol: heuristics scoring"
proto_has "working.memory|≤4|<=4"                            "protocol: cognitive load rule"
proto_has "Alex|Jordan|Sam|Riley|Casey"                      "protocol: personas"
proto_has "RECAPTURE"                                        "protocol: capture validity"
proto_has "prefers-reduced-motion"                           "protocol: reduced motion"
proto_has "WCAG 2.2"                                         "protocol: WCAG 2.2"
proto_has "taste-skill|impeccable|ui-ux-pro-max"             "protocol: provenance"
grep -q "design:floor" "$CHECK" && pass "uiux-checklist: floor group present" || fail "uiux-checklist missing floor group"

# ============================================================================
printf '\n--- integration: build/feature/requirements/test wiring, coverage tag, orchestrator ---\n'
# ============================================================================

BUILD="$REPO_ROOT/claude-plugin/commands/forge/build.md"
grep -q "design-protocol.md" "$BUILD" && pass "build: references design-protocol" || fail "build: no design-protocol reference"
grep -q "DESIGN_LINT: VALID" "$BUILD" && pass "build: Phase 4 lint gate" || fail "build: missing lint gate"
grep -q "SLOP_GATE" "$BUILD" && pass "build: Phase 6 floor gate" || fail "build: missing SLOP_GATE"
grep -q "DESIGN_VERDICT" "$BUILD" && pass "build: design verdict in convergence" || fail "build: missing DESIGN_VERDICT"
grep -q "design:floor" "$BUILD" && pass "build: seventh coverage group" || fail "build: missing design:floor"
grep -q "design-scan.cjs" "$REPO_ROOT/claude-plugin/commands/forge/feature.md" && pass "feature: floor on touched routes" || fail "feature: no floor scan"
grep -q "mode: operate|persuade" "$REPO_ROOT/claude-plugin/commands/forge/requirements.md" && pass "requirements: spec design.mode" || fail "requirements: no design.mode"
grep -q "design-floor" "$REPO_ROOT/claude-plugin/commands/forge/requirements.md" && pass "requirements: design-floor ux assertion" || fail "requirements: no design-floor row"
grep -q "score-design.sh scan" "$REPO_ROOT/claude-plugin/commands/forge/test.md" && pass "test: a11y pass folds in the design floor" || fail "test: no design floor"

# coverage: the seventh group is required by default, and a spec that traces all seven closes
printf 'spec\tdimension\tassertion\tweight\tstatus\tdetail\ttraces\n' > "$T/r.tsv"
for tag in type color spacing radius motion states floor; do printf 'app\tux\t%s row\t1\tfail\t\tFR-1,design:%s\n' "$tag" "$tag" >> "$T/r.tsv"; done
printf -- '- FR-1 thing\n' > "$T/req.md"
COV=$(bash "$SB" coverage "$T/r.tsv" "$T/req.md" 2>/dev/null | sed -n 2p)
assert_eq "DESIGN_COVERAGE: 1.00" "$COV" "coverage: seven design groups traced → 1.00"
head -7 "$T/r.tsv" > "$T/r6.tsv"
COV=$(bash "$SB" coverage "$T/r6.tsv" "$T/req.md" 2>"$T/cov.err" | sed -n 2p)
assert_eq "DESIGN_COVERAGE: 0.85" "$COV" "coverage: floor untraced → 6/7"
assert_contains "$(cat "$T/cov.err")" "design_missing=design:floor" "coverage: names the missing floor group"

ORCH="$REPO_ROOT/scripts/orchestrate.sh"
assert_eq "polish-ui"     "$(bash "$ORCH" classify "make the UI look professional" 2>/dev/null)" "classify: UI quality → polish-ui"
assert_eq "polish-ui"     "$(bash "$ORCH" classify "redesign the dashboard" 2>/dev/null)"        "classify: redesign → polish-ui"
assert_eq "polish-ui"     "$(bash "$ORCH" classify "improve accessibility of forms" 2>/dev/null)" "classify: accessibility → polish-ui"
assert_eq "build-feature" "$(bash "$ORCH" classify "build the ui for settings" 2>/dev/null)"     "classify: build the UI stays build-feature"
assert_eq "decide-design" "$(bash "$ORCH" classify "decide which approach to take for caching" 2>/dev/null)" "classify: design decision unaffected"
grep -q "polish-ui" "$REPO_ROOT/claude-plugin/skills/forge/references/orchestrator-routing.md" && pass "routing reference: polish-ui archetype documented" || fail "routing reference: polish-ui missing"

# handoff contract accepts the new source
_h="$T/h.json"
printf '{"version":"3.0.0","source":"design","timestamp":"2026-01-01T00:00:00+00:00","status":"COMPLETE","verdict":"SHIP","results_tsv":"design-results.tsv"}' > "$_h"
assert_eq "VALID" "$(bash "$REPO_ROOT/scripts/validate-handoff.sh" "$_h" design 2>/dev/null)" "handoff: design audit with verdict VALID"
printf '{"version":"3.0.0","source":"design","timestamp":"t","status":"COMPLETE","design":{"design_md":"DESIGN.md","lint":"VALID"}}' > "$_h"
assert_eq "VALID" "$(bash "$REPO_ROOT/scripts/validate-handoff.sh" "$_h" design 2>/dev/null)" "handoff: design system run with design object VALID"
printf '{"version":"3.0.0","source":"design","timestamp":"t","status":"COMPLETE"}' > "$_h"
bash "$REPO_ROOT/scripts/validate-handoff.sh" "$_h" >/dev/null 2>&1; VH_RC=$?
assert_eq 1 "$VH_RC" "handoff: design without verdict/design → INVALID"
printf '{"version":"3.0.0","source":"design","timestamp":"t","status":"COMPLETE","verdict":"MAYBE"}' > "$_h"
bash "$REPO_ROOT/scripts/validate-handoff.sh" "$_h" >/dev/null 2>&1; VH_RC=$?
assert_eq 1 "$VH_RC" "handoff: design verdict outside SHIP|FIX|REBUILD → INVALID"

# ============================================================================
printf '\n--- distribution: parity, shipped seams, routers, manifests ---\n'
# ============================================================================

for m in "$REPO_ROOT/.claude/commands/forge/design.md" \
         "$REPO_ROOT/.agents/skills/forge/design.md" \
         "$REPO_ROOT/plugins/forge/skills/forge/design.md" \
         "$REPO_ROOT/.opencode/commands/forge_design.md"; do
  if [[ -f "$m" ]] && diff -q "$SPEC" "$m" >/dev/null 2>&1; then
    pass "mirror parity: ${m#$REPO_ROOT/}"
  else
    fail "mirror parity: ${m#$REPO_ROOT/} (missing or diverged)"
  fi
done

for tree in .claude claude-plugin .opencode .agents plugins/forge; do
  for f in scripts/score-design.sh scripts/design-scan.cjs references/design-protocol.md references/uiux-checklist.md; do
    [[ -f "$REPO_ROOT/$tree/skills/forge/$f" ]] \
      && pass "shipped: $tree $f" || fail "shipped: $tree missing $f"
  done
  diff -q "$REPO_ROOT/scripts/design-scan.cjs" "$REPO_ROOT/$tree/skills/forge/scripts/design-scan.cjs" >/dev/null 2>&1 \
    && pass "seam parity: $tree design-scan.cjs" || fail "seam parity: $tree design-scan.cjs diverged"
  diff -q "$REPO_ROOT/scripts/score-design.sh" "$REPO_ROOT/$tree/skills/forge/scripts/score-design.sh" >/dev/null 2>&1 \
    && pass "seam parity: $tree score-design.sh" || fail "seam parity: $tree score-design.sh diverged"
done

grep -q 'forge:design' "$REPO_ROOT/.claude/skills/forge/SKILL.md" \
  && pass "router: canonical SKILL.md routes /forge:design" || fail "router: canonical missing design row"
grep -q 'forge:design' "$REPO_ROOT/claude-plugin/skills/forge/SKILL.md" \
  && pass "router: claude-plugin routes /forge:design" || fail "router: claude-plugin missing design row"
grep -q 'forge_design' "$REPO_ROOT/.opencode/skills/forge/SKILL.md" \
  && pass "router: opencode routes /forge_design" || fail "router: opencode missing design row"
grep -qE '\$forge design' "$REPO_ROOT/.agents/skills/forge/SKILL.md" \
  && pass "router: codex routes \$forge design" || fail "router: codex missing design row"
grep -qE '\$forge design' "$REPO_ROOT/plugins/forge/skills/forge/SKILL.md" \
  && pass "router: codex plugin routes \$forge design" || fail "router: codex plugin missing design row"

for mf in "$REPO_ROOT/.claude-plugin/marketplace.json" \
          "$REPO_ROOT/claude-plugin/.claude-plugin/plugin.json" \
          "$REPO_ROOT/plugins/forge/.codex-plugin/plugin.json"; do
  name="${mf#$REPO_ROOT/}"
  grep -q "19 commands" "$mf" && pass "manifest count 19: $name" || fail "manifest count 19: $name"
  grep -q "test, design" "$mf" && pass "manifest lists design: $name" || fail "manifest lists design: $name"
done

# ============================================================================
printf '\n=== Results: %d/%d passed ===' "$PASS" "$TOTAL"
if [[ "$FAIL" -gt 0 ]]; then printf ' (%d FAILED)\n' "$FAIL"; exit 1; else printf ' (all passed)\n'; exit 0; fi
