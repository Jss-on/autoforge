#!/usr/bin/env bash
# Test harness for /forge:research — score-research.sh (sources + claims + verdict),
# the research.md engagement spec, the research protocol, handoff wiring,
# mirror parity, manifests.
set -uo pipefail

# Fixture scoring must not write score-log.tsv into the repo; behavior is
# exercised against temp dirs.
export AR_SCORE_LOG=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SR="$REPO_ROOT/scripts/score-research.sh"
VH="$REPO_ROOT/scripts/validate-handoff.sh"
SPEC="$REPO_ROOT/claude-plugin/commands/forge/research.md"
PROTO="$REPO_ROOT/claude-plugin/skills/forge/references/research-protocol.md"

PASS=0; FAIL=0; TOTAL=0
pass() { printf '  PASS: %s\n' "$1"; PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); }
fail() { printf '  FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); }

assert_eq()       { [[ "$1" == "$2" ]] && pass "$3" || fail "$3 (expected '$1', got '$2')"; }
assert_contains() { echo "$1" | grep -q "$2" && pass "$3" || fail "$3 (missing '$2')"; }

spec_has()  { grep -Eq "$1" "$SPEC"  && pass "spec: $2"  || fail "spec: $2 (pattern '$1')"; }
proto_has() { grep -Eq "$1" "$PROTO" && pass "proto: $2" || fail "proto: $2 (pattern '$1')"; }

# ============================================================================
printf '\n--- score-research: source-ledger validation ---\n'
# ============================================================================

T="$(mktemp -d)"

shdr='id\ttier\ttype\tyear\ttitle\tvenue\tlocator\tdepth\tstatus\n'

printf "${shdr}S-01\tT1\tmeta-analysis\t2023\tHead impact kinematics\tJ Neurotrauma\tdoi:10.1/x\tfull\tread\nS-02\tT2\tofficial\t2024\tTBI surveillance\tCDC\turl:https://cdc.gov/tbi\tfull\tread\nS-03\tT3\tnews\t2024\tExplainer\tQuality Paper\turl:https://q.example/a\tabstract\tread\nS-04\tT4\tweb\t2022\tForum thread\tforum\turl:https://f.example/t\tsecondary\tread\n" > "$T/s.tsv"
S_OUT=$(bash "$SR" sources "$T/s.tsv" 2>/dev/null); S_RC=$?
assert_contains "$S_OUT" "SOURCES: VALID total=4 t1=1 t2=1 t3=1 t4=1 unverified=0" "sources: valid ledger with tier counts"
assert_eq 0 "$S_RC" "sources: valid → exit 0"

printf "${shdr}S-01\tT9\tstudy\t2023\tx\tv\tdoi:10.1/x\tfull\tread\n" > "$T/s.tsv"
bash "$SR" sources "$T/s.tsv" >/dev/null 2>&1; S_RC=$?
assert_eq 1 "$S_RC" "sources: bad tier → invalid"

printf "${shdr}S-01\tT1\tstudy\t2023\tx\tv\thttps://no-scheme-prefix\tfull\tread\n" > "$T/s.tsv"
S_ERR=$(bash "$SR" sources "$T/s.tsv" 2>&1 >/dev/null); S_RC=$?
assert_eq 1 "$S_RC" "sources: bare URL without url: prefix → invalid"
assert_contains "$S_ERR" "bad locator" "sources: locator error names the rule"

printf "${shdr}S-01\tT1\tstudy\t1642\tx\tv\tdoi:10.1/x\tfull\tread\n" > "$T/s.tsv"
bash "$SR" sources "$T/s.tsv" >/dev/null 2>&1; S_RC=$?
assert_eq 1 "$S_RC" "sources: implausible year → invalid"

printf "${shdr}S-01\tT1\tstudy\t2023\tx\tv\tdoi:10.1/x\tskimmed\tread\n" > "$T/s.tsv"
bash "$SR" sources "$T/s.tsv" >/dev/null 2>&1; S_RC=$?
assert_eq 1 "$S_RC" "sources: bad depth → invalid (depth honesty is enum-enforced)"

printf "${shdr}S-01\tT1\tstudy\t2023\tx\tv\tdoi:10.1/x\tfull\tread\nS-01\tT2\tstudy\t2024\ty\tv\tpmid:9\tfull\tread\n" > "$T/s.tsv"
bash "$SR" sources "$T/s.tsv" >/dev/null 2>&1; S_RC=$?
assert_eq 1 "$S_RC" "sources: duplicate id → invalid"

printf "${shdr}S-01\tT1\tstudy\t2023\tx\tv\tpmid:123\tabstract\tunverified\n" > "$T/s.tsv"
S_OUT=$(bash "$SR" sources "$T/s.tsv" 2>/dev/null); S_RC=$?
assert_contains "$S_OUT" "unverified=1" "sources: unverified rows counted"
assert_eq 0 "$S_RC" "sources: unverified row may exist (as a lead) — ledger still valid"

bash "$SR" sources "$T/nope.tsv" >/dev/null 2>&1; S_RC=$?
assert_eq 2 "$S_RC" "sources: missing file → exit 2"

# ============================================================================
printf '\n--- score-research: claims-ledger validation (anchoring + tier floors) ---\n'
# ============================================================================

printf "${shdr}S-01\tT1\tmeta-analysis\t2023\tA\tJ1\tdoi:10.1/a\tfull\tread\nS-02\tT2\tofficial\t2024\tB\tCDC\turl:https://cdc.gov/b\tfull\tread\nS-03\tT3\tnews\t2024\tC\tPaper\turl:https://p.example/c\tabstract\tread\nS-04\tT4\tweb\t2022\tD\tblog\turl:https://b.example/d\tsecondary\tread\nS-05\tT1\trct\t2020\tE\tNEJM\tpmid:5\tabstract\tunverified\nS-06\tT1\tstudy\t2019\tF\tJ2\tdoi:10.1/f\tfull\trejected\n" > "$T/s.tsv"

chdr='id\trq\tclaim\tconfidence\tsources\tevidence\n'

printf "${chdr}C-1\tRQ-1\tPeak accel range X\thigh\tS-01,S-02\tevidence:evidence/S-01.md\nC-2\tRQ-2\tSecondary mechanism Y\tmoderate\tS-01\tevidence:evidence/S-01.md\nC-3\tRQ-2\tWeak lead Z\tlow\tS-03\tevidence:evidence/S-03.md\n" > "$T/c.tsv"
C_OUT=$(bash "$SR" claims "$T/c.tsv" "$T/s.tsv" 2>/dev/null); C_RC=$?
assert_contains "$C_OUT" "CLAIMS: VALID total=3 high=1 moderate=1 low=1 contested=0 orphans=0" "claims: valid ledger with confidence counts"
assert_eq 0 "$C_RC" "claims: valid → exit 0"

printf "${chdr}C-1\tRQ-1\tGhost cite\thigh\tS-01,S-99\tevidence:evidence/S-01.md\n" > "$T/c.tsv"
C_ERR=$(bash "$SR" claims "$T/c.tsv" "$T/s.tsv" 2>&1 >/dev/null); C_RC=$?
assert_eq 1 "$C_RC" "claims: orphan citation → invalid"
assert_contains "$C_ERR" "orphan citation S-99" "claims: orphan error names the id"

printf "${chdr}C-1\tRQ-1\tCites unverified\tmoderate\tS-05\tevidence:evidence/S-05.md\n" > "$T/c.tsv"
C_ERR=$(bash "$SR" claims "$T/c.tsv" "$T/s.tsv" 2>&1 >/dev/null); C_RC=$?
assert_eq 1 "$C_RC" "claims: citing an unverified source → invalid"
assert_contains "$C_ERR" "uncitable" "claims: uncitable status named"

printf "${chdr}C-1\tRQ-1\tCites rejected\tmoderate\tS-06\tevidence:evidence/S-06.md\n" > "$T/c.tsv"
bash "$SR" claims "$T/c.tsv" "$T/s.tsv" >/dev/null 2>&1; C_RC=$?
assert_eq 1 "$C_RC" "claims: citing a rejected source → invalid"

printf "${chdr}C-1\tRQ-1\tOnly one strong source\thigh\tS-01\tevidence:evidence/S-01.md\n" > "$T/c.tsv"
C_ERR=$(bash "$SR" claims "$T/c.tsv" "$T/s.tsv" 2>&1 >/dev/null); C_RC=$?
assert_eq 1 "$C_RC" "claims: high with 1 T1/T2 → invalid (needs >=2)"
assert_contains "$C_ERR" "high requires >=2" "claims: high floor error explicit"

printf "${chdr}C-1\tRQ-1\tSecondary only\tmoderate\tS-03\tevidence:evidence/S-03.md\n" > "$T/c.tsv"
bash "$SR" claims "$T/c.tsv" "$T/s.tsv" >/dev/null 2>&1; C_RC=$?
assert_eq 1 "$C_RC" "claims: moderate on T3-only → invalid"

printf "${chdr}C-1\tRQ-1\tForum wisdom\tlow\tS-04\tevidence:evidence/S-04.md\n" > "$T/c.tsv"
C_ERR=$(bash "$SR" claims "$T/c.tsv" "$T/s.tsv" 2>&1 >/dev/null); C_RC=$?
assert_eq 1 "$C_RC" "claims: T4-only support → invalid at ANY confidence"
assert_contains "$C_ERR" "T4-only" "claims: T4-only rule named"

printf "${chdr}C-1\tRQ-1\tGenuine dispute\tcontested\tS-01,S-02\tevidence:evidence/S-01.md\n" > "$T/c.tsv"
bash "$SR" claims "$T/c.tsv" "$T/s.tsv" >/dev/null 2>&1; C_RC=$?
assert_eq 0 "$C_RC" "claims: contested with 2 sources incl T1/T2 → valid"

printf "${chdr}C-1\tRQ-1\tLonely dispute\tcontested\tS-01\tevidence:evidence/S-01.md\n" > "$T/c.tsv"
bash "$SR" claims "$T/c.tsv" "$T/s.tsv" >/dev/null 2>&1; C_RC=$?
assert_eq 1 "$C_RC" "claims: contested with a single source → invalid"

printf "${chdr}C-1\tbadRQ\tClaim\tmoderate\tS-01\tevidence:evidence/S-01.md\n" > "$T/c.tsv"
bash "$SR" claims "$T/c.tsv" "$T/s.tsv" >/dev/null 2>&1; C_RC=$?
assert_eq 1 "$C_RC" "claims: rq must be RQ-<n>"

printf "${chdr}C-1\tRQ-1\tNo proof\tmoderate\tS-01\tlooks right\n" > "$T/c.tsv"
bash "$SR" claims "$T/c.tsv" "$T/s.tsv" >/dev/null 2>&1; C_RC=$?
assert_eq 1 "$C_RC" "claims: missing evidence: ref → invalid"

# ============================================================================
printf '\n--- score-research: verdict (the dossier gate) ---\n'
# ============================================================================

printf '# Research plan\n\nRQ-1 What are peak accelerations?\nRQ-2 What outcomes follow?\n' > "$T/plan.md"
printf "${chdr}C-1\tRQ-1\tPeak accel range X\thigh\tS-01,S-02\tevidence:evidence/S-01.md\nC-2\tRQ-2\tOutcome Y\tmoderate\tS-01\tevidence:evidence/S-01.md\n" > "$T/c.tsv"
V_OUT=$(bash "$SR" verdict "$T/c.tsv" "$T/s.tsv" "$T/plan.md" 2>/dev/null); V_RC=$?
assert_eq "VERDICT: DOSSIER_READY" "$V_OUT" "verdict: all criteria green → DOSSIER_READY"
assert_eq 0 "$V_RC" "verdict: ready → exit 0"
V_ERR=$(bash "$SR" verdict "$T/c.tsv" "$T/s.tsv" "$T/plan.md" 2>&1 >/dev/null)
assert_contains "$V_ERR" "criterion rq-coverage: 2/2 PASS" "verdict: RQ coverage measured per plan"
assert_contains "$V_ERR" "criterion t12-floor" "verdict: T1/T2 floor criterion printed"

printf '# Research plan\n\nRQ-1 q\nRQ-2 q\nRQ-3 uncovered question\n' > "$T/plan.md"
V_OUT=$(bash "$SR" verdict "$T/c.tsv" "$T/s.tsv" "$T/plan.md" 2>/dev/null); V_RC=$?
assert_eq "VERDICT: DOSSIER_BLOCKED" "$V_OUT" "verdict: plan RQ without claims → BLOCKED"
assert_eq 1 "$V_RC" "verdict: blocked → exit 1"

printf '# Research plan\n\nRQ-1 q\nRQ-2 q\nRQ-3 rare topic — evidence-scarcity note: literature does not address RQ-3\n' > "$T/plan.md"
V_OUT=$(bash "$SR" verdict "$T/c.tsv" "$T/s.tsv" "$T/plan.md" 2>/dev/null); V_RC=$?
assert_eq "VERDICT: DOSSIER_READY" "$V_OUT" "verdict: uncovered RQ with explicit scarcity note → READY"

printf "${chdr}C-1\tRQ-1\tT3 only\tlow\tS-03\tevidence:evidence/S-03.md\nC-2\tRQ-2\tT3 again\tlow\tS-03\tevidence:evidence/S-03.md\n" > "$T/c.tsv"
printf '# plan\nRQ-1 q\nRQ-2 q\n' > "$T/plan.md"
V_OUT=$(bash "$SR" verdict "$T/c.tsv" "$T/s.tsv" "$T/plan.md" 2>/dev/null); V_RC=$?
assert_eq "VERDICT: DOSSIER_BLOCKED" "$V_OUT" "verdict: 0.00 T1/T2 share < floor → BLOCKED"
V_OUT=$(RESEARCH_T12_FLOOR=0 bash "$SR" verdict "$T/c.tsv" "$T/s.tsv" "$T/plan.md" 2>/dev/null)
assert_eq "VERDICT: DOSSIER_READY" "$V_OUT" "verdict: RESEARCH_T12_FLOOR env overrides the floor"

bash "$SR" verdict "$T/missing.tsv" "$T/s.tsv" >/dev/null 2>&1; V_RC=$?
assert_eq 2 "$V_RC" "verdict: missing claims file → exit 2"

# ============================================================================
printf '\n--- score-research: paper (LaTeX projection stays ledger-anchored) ---\n'
# ============================================================================

cat > "$T/main.tex" <<'TEX'
\documentclass[11pt]{article}
\begin{document}
\begin{abstract}
Answers per RQ.
\end{abstract}
\section{Results}
Peak accelerations reach X g \cite{S-01,S-02}. Outcomes vary \citep{S-03}.
\section{Limitations}
Scarce evidence for RQ-2.
\bibliographystyle{unsrtnat}
\bibliography{references}
\end{document}
TEX
cat > "$T/references.bib" <<'BIB'
@article{S-01, title={A}, year={2023}}
@techreport{S-02, title={B}, year={2024}}
@misc{S-03, title={C}, year={2024}}
BIB
P_OUT=$(bash "$SR" paper "$T/main.tex" "$T/references.bib" 2>/dev/null); P_RC=$?
assert_contains "$P_OUT" "PAPER: VALID cites=3 bibkeys=3 orphans=0 unused=0" "paper: cites resolve, sections present → VALID"
assert_eq 0 "$P_RC" "paper: valid → exit 0"

P_OUT=$(bash "$SR" paper "$T/main.tex" "$T/references.bib" "$T/s.tsv" 2>/dev/null); P_RC=$?
assert_eq 0 "$P_RC" "paper: bib keys map to citable ledger rows → valid"

printf '@book{S-06, title={Rejected}, year={2019}}\n' >> "$T/references.bib"
P_ERR=$(bash "$SR" paper "$T/main.tex" "$T/references.bib" "$T/s.tsv" 2>&1 >/dev/null); P_RC=$?
assert_eq 1 "$P_RC" "paper: bib key mapping to rejected source → INVALID"
assert_contains "$P_ERR" "uncitable source" "paper: uncitable bib entry named"

cat > "$T/references.bib" <<'BIB'
@article{S-01, title={A}, year={2023}}
@techreport{S-02, title={B}, year={2024}}
BIB
P_ERR=$(bash "$SR" paper "$T/main.tex" "$T/references.bib" 2>&1 >/dev/null); P_RC=$?
assert_eq 1 "$P_RC" "paper: orphan \\cite key → INVALID"
assert_contains "$P_ERR" "orphan cite key" "paper: orphan key named"

printf '@article{S-01, title={A}, year={2023}}\n@techreport{S-02, title={B}, year={2024}}\n@misc{S-03, title={C}, year={2024}}\n@book{S-04, title={Extra}, year={2020}}\n' > "$T/references.bib"
P_OUT=$(bash "$SR" paper "$T/main.tex" "$T/references.bib" 2>/dev/null); P_RC=$?
assert_contains "$P_OUT" "unused=1" "paper: unused bib key counted"
assert_eq 0 "$P_RC" "paper: unused bib key is a note, not a failure"

sed 's/\\section{Limitations}/\\section{Extras}/' "$T/main.tex" > "$T/nolim.tex"
P_ERR=$(bash "$SR" paper "$T/nolim.tex" "$T/references.bib" 2>&1 >/dev/null); P_RC=$?
assert_eq 1 "$P_RC" "paper: missing Limitations section → INVALID"
assert_contains "$P_ERR" "Limitations" "paper: missing-section error names Limitations"

printf '\\documentclass{article}\\begin{document}\\begin{abstract}x\\end{abstract}\\section{Limitations}y\\bibliography{references}\\end{document}\n' > "$T/nocite.tex"
bash "$SR" paper "$T/nocite.tex" "$T/references.bib" >/dev/null 2>&1; P_RC=$?
assert_eq 1 "$P_RC" "paper: zero \\cite commands → INVALID"

bash "$SR" paper "$T/ghost.tex" "$T/references.bib" >/dev/null 2>&1; P_RC=$?
assert_eq 2 "$P_RC" "paper: missing tex file → exit 2"

# ============================================================================
printf '\n--- research.md engagement spec ---\n'
# ============================================================================

[[ -f "$SPEC" ]] && pass "spec exists" || fail "spec missing: $SPEC"
spec_has "name: forge:research"                       "frontmatter name"
spec_has "EXECUTE IMMEDIATELY"                        "executes immediately"
spec_has "score-research\.sh"                         "seam script wired"
spec_has "research-protocol\.md"                      "protocol reference wired"
spec_has "RQ-1"                                       "question decomposition (RQ-n)"
spec_has "sources\.tsv"                               "source ledger deliverable"
spec_has "claims\.tsv"                                "claims ledger deliverable"
spec_has "queries\.tsv"                               "search log deliverable (replayable sweep)"
spec_has "full\|abstract\|secondary"                  "depth honesty enum"
spec_has "[Dd]isconfirm"                              "adversarial disconfirmation pass"
spec_has "DOSSIER_READY"                              "mechanical verdict tokens"
spec_has "T4.*never sole support|never sole support"  "T4 never sole support"
spec_has "high.*≥2|≥2.*T1/T2"                         "high-confidence tier floor"
spec_has "retraction"                                 "retraction check"
spec_has "sensitive-domain|Sensitive-domain|Sensitive domains" "sensitive-domain register"
spec_has "expert witness"                             "litigation-support scope note"
spec_has "quarantine|quarantined"                     "user-context quarantine"
spec_has "no fabricated|No fabricated"                "anti-fabrication invariant"
spec_has "[Cc]itation laundering"                     "citation-laundering ban"
spec_has "score-build\.sh bound"                      "iteration bound reuses build seam"
spec_has "version \"3\.1\.0\""                        "handoff pins 3.1.0"
spec_has "validate-handoff\.sh.*research"             "handoff validated with research source"
spec_has "chain.*reason|reason.*requirements"         "chains to reason/requirements"
spec_has "Format:.*arxiv"                             "Format argument offers arxiv"
spec_has "paper-templates\.md"                        "paper-templates reference wired"
spec_has "IEEEtran|ieee"                              "IEEE format supported"
spec_has "score-research\.sh paper"                   "paper seam wired into Phase 5"
spec_has "typeset projection"                         "paper may not drift from the ledger"
spec_has "tectonic.*latexmk.*pdflatex|latexmk"        "compile toolchain order stated"

# ============================================================================
printf '\n--- research protocol (the contract) ---\n'
# ============================================================================

[[ -f "$PROTO" ]] && pass "protocol exists" || fail "protocol missing: $PROTO"
proto_has "T1"                                   "tier table present"
proto_has "publication class"                    "tier by publication class, not agreement"
proto_has "meta-analysis.*RCT|RCT.*cohort"       "medical evidence hierarchy"
proto_has "predatory"                            "predatory-journal check"
proto_has "snowball|Snowball"                    "citation snowballing"
proto_has "depth honesty|Depth honesty"          "depth honesty rule"
proto_has "citation laundering"                  "citation-laundering definition"
proto_has "independent.*T1/T2|≥2 independent"    "confidence rubric floors"
proto_has "contested"                            "contested handling (no fake middle)"
proto_has "units"                                "numbers carry units + conditions"
proto_has "jurisdiction"                         "legal claims carry jurisdiction"
proto_has "scarcity"                             "evidence-scarcity notes"
proto_has "expert witness"                       "litigation register"
proto_has "[Cc]onfirmation bias"                 "confirmation-bias guard"

# ============================================================================
printf '\n--- handoff wiring: validate-handoff research case ---\n'
# ============================================================================

_h="$T/handoff.json"
printf '{"version":"3.1.0","source":"research","timestamp":"2026-01-01T00:00:00+00:00","status":"COMPLETE","verdict":"DOSSIER_READY","report":"report.md"}' > "$_h"
H_OUT=$(bash "$VH" "$_h" research 2>/dev/null); H_RC=$?
assert_eq "VALID" "$H_OUT" "handoff: research with verdict + report → VALID"
assert_eq 0 "$H_RC" "handoff: valid → exit 0"

printf '{"version":"3.1.0","source":"research","timestamp":"t","status":"COMPLETE","verdict":"MAYBE","report":"r.md"}' > "$_h"
bash "$VH" "$_h" research >/dev/null 2>&1; H_RC=$?
assert_eq 1 "$H_RC" "handoff: verdict outside DOSSIER enum → INVALID"

printf '{"version":"3.1.0","source":"research","timestamp":"t","status":"COMPLETE","verdict":"DOSSIER_READY"}' > "$_h"
H_ERR=$(bash "$VH" "$_h" 2>&1 >/dev/null); H_RC=$?
assert_eq 1 "$H_RC" "handoff: missing report → INVALID"
assert_contains "$H_ERR" "report" "handoff: missing-report error names the field"

printf '{"version":"3.1.0","source":"research","timestamp":"t","status":"COMPLETE","verdict":"DOSSIER_READY","report":"r.md"}' > "$_h"
bash "$VH" "$_h" test >/dev/null 2>&1; H_RC=$?
assert_eq 1 "$H_RC" "handoff: expected-source mismatch → INVALID"

grep -q 'research' "$REPO_ROOT/claude-plugin/skills/forge/references/handoff-schema.md" \
  && pass "handoff-schema documents research source" || fail "handoff-schema missing research source"
grep -q '3\.1\.0' "$REPO_ROOT/claude-plugin/skills/forge/references/handoff-schema.md" \
  && pass "handoff-schema at v3.1.0" || fail "handoff-schema not at 3.1.0"

# ============================================================================
printf '\n--- distribution: mirror parity (5 surfaces byte-identical) ---\n'
# ============================================================================

MIRRORS=(
  "$REPO_ROOT/.claude/commands/forge/research.md"
  "$REPO_ROOT/.agents/skills/forge/research.md"
  "$REPO_ROOT/plugins/forge/skills/forge/research.md"
  "$REPO_ROOT/.opencode/commands/forge_research.md"
)
for m in "${MIRRORS[@]}"; do
  if [[ -f "$m" ]] && diff -q "$SPEC" "$m" >/dev/null 2>&1; then
    pass "mirror parity: ${m#$REPO_ROOT/}"
  else
    fail "mirror parity: ${m#$REPO_ROOT/} (missing or diverged)"
  fi
done

TMPL="$REPO_ROOT/claude-plugin/skills/forge/references/paper-templates.md"
grep -q 'IEEEtran' "$TMPL" && pass "templates: IEEE skeleton present" || fail "templates: IEEE skeleton missing"
grep -q 'documentclass\[11pt\]{article}' "$TMPL" && pass "templates: arXiv article skeleton present" || fail "templates: arXiv skeleton missing"
grep -q 'Scope of Use' "$TMPL" && pass "templates: scope-of-use subsection mandated" || fail "templates: scope-of-use missing"
grep -qi 'bibtex\|references\.bib' "$TMPL" && pass "templates: BibTeX generation rules present" || fail "templates: BibTeX rules missing"

for d in .claude/skills/forge claude-plugin/skills/forge .agents/skills/forge plugins/forge/skills/forge .opencode/skills/forge; do
  if diff -q "$PROTO" "$REPO_ROOT/$d/references/research-protocol.md" >/dev/null 2>&1; then
    pass "protocol parity: $d"
  else
    fail "protocol parity: $d (missing or diverged)"
  fi
  if diff -q "$TMPL" "$REPO_ROOT/$d/references/paper-templates.md" >/dev/null 2>&1; then
    pass "templates parity: $d"
  else
    fail "templates parity: $d (missing or diverged)"
  fi
  if diff -q "$SR" "$REPO_ROOT/$d/scripts/score-research.sh" >/dev/null 2>&1; then
    pass "seam parity: $d"
  else
    fail "seam parity: $d (missing or diverged)"
  fi
done

grep -q 'score-research\.sh' "$REPO_ROOT/scripts/transform.sh" \
  && pass "transform.sh syncs score-research.sh" || fail "transform.sh missing score-research.sh in runtime set"

# ============================================================================
printf '\n--- distribution: manifests + routers at 20 commands ---\n'
# ============================================================================

for mf in "$REPO_ROOT/.claude-plugin/marketplace.json" \
          "$REPO_ROOT/claude-plugin/.claude-plugin/plugin.json" \
          "$REPO_ROOT/plugins/forge/.codex-plugin/plugin.json"; do
  name="${mf#$REPO_ROOT/}"
  grep -q "20 commands" "$mf" && pass "manifest count 20: $name" || fail "manifest count 20: $name"
  grep -q "design, research" "$mf" && pass "manifest lists research: $name" || fail "manifest lists research: $name"
done

for sk in .claude/skills/forge/SKILL.md claude-plugin/skills/forge/SKILL.md \
          .agents/skills/forge/SKILL.md plugins/forge/skills/forge/SKILL.md \
          .opencode/skills/forge/SKILL.md; do
  grep -q 'research' "$REPO_ROOT/$sk" && pass "router lists research: $sk" || fail "router lists research: $sk"
  grep -q 'version: 3\.2\.0' "$REPO_ROOT/$sk" && pass "router at 3.2.0: $sk" || fail "router at 3.2.0: $sk"
done

grep -q 'forge_research' "$REPO_ROOT/.opencode/skills/forge/SKILL.md" \
  && pass "opencode router uses underscore naming" || fail "opencode router missing /forge_research"

# ============================================================================
printf '\n=== %d/%d passed (%d failed) ===\n' "$PASS" "$TOTAL" "$FAIL"
# ============================================================================
[[ "$FAIL" -eq 0 ]]
