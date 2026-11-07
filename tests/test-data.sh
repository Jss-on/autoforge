#!/usr/bin/env bash
# Test harness for the data-intensive protocol — data-score.cjs (lint / coverage / slo / reconcile /
# migrations / explain), the `data` acceptance dimension in score-build.sh and score-requirements.sh,
# the protocol reference, the command contracts that wire it, mirror and seam parity.
set -uo pipefail

export AR_SCORE_LOG=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SEAM="$REPO_ROOT/scripts/data-score.cjs"
SB="$REPO_ROOT/scripts/score-build.sh"
SR="$REPO_ROOT/scripts/score-requirements.sh"
FIX="$REPO_ROOT/tests/fixtures/data"
BUILD_SPEC="$REPO_ROOT/claude-plugin/commands/forge/build.md"
REQ_SPEC="$REPO_ROOT/claude-plugin/commands/forge/requirements.md"
PROTO="$REPO_ROOT/claude-plugin/skills/forge/references/data-intensive-protocol.md"
CHECKLIST="$REPO_ROOT/claude-plugin/skills/forge/references/fullstack-hardening-checklist.md"

PASS=0; FAIL=0; TOTAL=0
pass() { printf '  PASS: %s\n' "$1"; PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); }
fail() { printf '  FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); }
assert_eq()       { [[ "$1" == "$2" ]] && pass "$3" || fail "$3 (expected '$1', got '$2')"; }
assert_contains() { echo "$1" | grep -q -- "$2" && pass "$3" || fail "$3 (missing '$2')"; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

# ============================================================================
printf '\n--- data-score.cjs: the seam (node suite) ---\n'
# ============================================================================
if node "$REPO_ROOT/tests/data-score.test.cjs" "$REPO_ROOT" > "$T/data-score.txt" 2>&1; then
  pass "data-score: $(tail -n 1 "$T/data-score.txt")"
else
  fail "data-score: $(tail -n 1 "$T/data-score.txt")"; grep '^FAIL' "$T/data-score.txt" | sed 's/^/    /'
fi

# ============================================================================
printf '\n--- end to end: the gates against a running data-keeping service (node:sqlite POS, two processes) ---\n'
# ============================================================================
if node "$REPO_ROOT/tests/data-e2e.test.cjs" "$REPO_ROOT" > "$T/data-e2e.txt" 2>&1; then
  pass "data-e2e: $(tail -n 1 "$T/data-e2e.txt")"
else
  fail "data-e2e: $(tail -n 1 "$T/data-e2e.txt")"; grep -A8 '^FAIL' "$T/data-e2e.txt" | sed 's/^/    /' | head -60
fi

# ============================================================================
printf '\n--- the book coverage map: every chapter mapped, mirrored into every tree ---\n'
# ============================================================================
BOOKMAP="$REPO_ROOT/.claude/skills/forge/references/data-intensive-book-map.md"
[[ -s "$BOOKMAP" ]] && pass "book map exists" || fail "book map missing"
for ch in 1 2 3 4 5 6 7 8 9 10 11 12 13 14; do
  grep -qE "^### Chapter $ch " "$BOOKMAP" && pass "book map: chapter $ch mapped" || fail "book map: chapter $ch missing"
done
grep -q "data-intensive-book-map.md" "$PROTO" && pass "protocol §10 points at the book map" || fail "protocol does not reference the book map"
! grep -q '| n/a |' "$BOOKMAP" && pass "book map: no section left as n/a" || fail "book map still has n/a rows"
[[ $(grep -c '^| Summary (' "$BOOKMAP") -eq 14 ]] && pass "book map: a Summary row per chapter (14)" || fail "book map: expected 14 Summary rows"
if [[ -n "${DDIA_PAGES_JSON:-}" && -f "${DDIA_PAGES_JSON}" ]]; then
  BMV="$(node "$REPO_ROOT/tests/book-map-verify.cjs" "$DDIA_PAGES_JSON" "$BOOKMAP" 2>&1)" && pass "book map verified against the book's body text: $(printf '%s' "$BMV" | grep BOOK_MAP_VERIFY)" || fail "book map vs body text: $(printf '%s' "$BMV" | tail -3 | tr '\n' ' ')"
else
  pass "book map body-text check skipped (set DDIA_PAGES_JSON to the locally extracted pages to run it)"
fi
DIGESTS="$REPO_ROOT/.claude/skills/forge/references"
[[ $(ls "$DIGESTS"/data-intensive-digest-ch*.md 2>/dev/null | wc -l) -eq 14 ]] && pass "chapter digests: 14 files" || fail "chapter digests: expected 14 files"
dg_bad=0; for f in "$DIGESTS"/data-intensive-digest-ch*.md; do for h in "## Thesis" "## Decision rules" "## Metrics and numbers" "## Failure modes and anti-patterns" "## Elicitation questions" "## Verifiable properties"; do grep -q "^$h" "$f" || { dg_bad=$((dg_bad+1)); echo "  missing \"$h\" in ${f##*/}"; }; done; done
[[ $dg_bad -eq 0 ]] && pass "chapter digests: thesis, rules, metrics, failure modes, questions, properties in every chapter" || fail "chapter digests: $dg_bad missing section(s)"
grep -q "data-intensive-digest-ch" "$PROTO" && pass "protocol §10 points at the digests" || fail "protocol does not reference the digests"
grep -q "data-intensive-digest-ch" "$REPO_ROOT/.claude/commands/forge/requirements.md" && grep -q "data-intensive-digest-ch" "$REPO_ROOT/.claude/commands/forge/build.md" && pass "requirements and build consult the digests" || fail "commands do not consult the digests"
for m in "$REPO_ROOT/claude-plugin/skills/forge/references/data-intensive-digest-ch08.md" "$REPO_ROOT/plugins/forge/skills/forge/references/data-intensive-digest-ch08.md" "$REPO_ROOT/.agents/skills/forge/references/data-intensive-digest-ch08.md" "$REPO_ROOT/.opencode/skills/forge/references/data-intensive-digest-ch08.md" "$REPO_ROOT/.cursor/skills/forge/references/data-intensive-digest-ch08.md"; do
  cmp -s "$DIGESTS/data-intensive-digest-ch08.md" "$m" && pass "digest mirror: ${m#$REPO_ROOT/}" || fail "digest mirror differs: ${m#$REPO_ROOT/}"
done
if [[ -n "${DDIA_PAGES_JSON:-}" && -f "${DDIA_PAGES_JSON}" ]]; then
  BCV="$(node "$REPO_ROOT/tests/book-concepts-verify.cjs" "$DDIA_PAGES_JSON" "$REPO_ROOT" 2>&1)" && pass "book content verified section by section: $(printf '%s' "$BCV" | grep BOOK_CONCEPTS_VERIFY)" || fail "book content check: $(printf '%s' "$BCV" | grep -E 'weak|BOOK_CONCEPTS_VERIFY' | tr '\n' ' ')"
else
  pass "book content check skipped (set DDIA_PAGES_JSON to run tests/book-concepts-verify.cjs)"
fi
RESEARCH="$REPO_ROOT/.claude/skills/forge/references/data-intensive-metrics-research.md"
[[ -s "$RESEARCH" ]] && pass "metrics research ledger exists" || fail "metrics research ledger missing"
[[ $(grep -c "^## Row " "$RESEARCH") -eq 9 ]] && pass "research ledger: one section per gated metric (9)" || fail "research ledger: expected 9 metric sections"
[[ $(grep -oE "https?://[^ )>]+" "$RESEARCH" | sort -u | wc -l) -ge 12 ]] && pass "research ledger: >= 12 distinct primary sources quoted" || fail "research ledger: too few sources"
grep -q "data-intensive-metrics-research.md" "$PROTO" && pass "protocol §5 points at the research ledger" || fail "protocol does not reference the research ledger"
cmp -s "$RESEARCH" "$REPO_ROOT/claude-plugin/skills/forge/references/data-intensive-metrics-research.md" && pass "research ledger mirror: claude-plugin" || fail "research ledger mirror differs"
for m in "$REPO_ROOT/claude-plugin/skills/forge/references/data-intensive-book-map.md" \
         "$REPO_ROOT/.agents/skills/forge/references/data-intensive-book-map.md" \
         "$REPO_ROOT/plugins/forge/skills/forge/references/data-intensive-book-map.md" \
         "$REPO_ROOT/.opencode/skills/forge/references/data-intensive-book-map.md" \
         "$REPO_ROOT/.cursor/skills/forge/references/data-intensive-book-map.md"; do
  cmp -s "$BOOKMAP" "$m" && pass "book map mirror: ${m#$REPO_ROOT/}" || fail "book map mirror differs: ${m#$REPO_ROOT/}"
done

# ============================================================================
printf '\n--- data-score.cjs: verdict lines are one-line contracts ---\n'
# ============================================================================
OUT=$(node "$SEAM" lint "$FIX/DATA.md" 2>/dev/null); RC=$?
assert_eq "DATA_LINT: VALID groups=8/8 na=0" "$OUT" "lint: the POS record is VALID"
assert_eq 0 "$RC" "lint: VALID exit 0"
OUT=$(node "$SEAM" lint "$FIX/DATA-invalid.md" 2>"$T/lint.err"); RC=$?
assert_eq "DATA_LINT: INVALID groups=8/8 na=0" "$OUT" "lint: the careless record is INVALID"
assert_eq 1 "$RC" "lint: INVALID exit 1"
assert_contains "$(cat "$T/lint.err")" "coordinated omission" "lint: a closed load model is named as the reason"
assert_contains "$(cat "$T/lint.err")" "dual-write" "lint: dual writes are refused"
OUT=$(node "$SEAM" coverage "$FIX/DATA.md" "$FIX/results-data.tsv" 2>/dev/null)
assert_eq "DATA_COVERAGE: 1.00" "$OUT" "coverage: eight groups traced by data rows => 1.00"
OUT=$(node "$SEAM" slo "$FIX/k6-open-pass.json" --data "$FIX/DATA.md" 2>/dev/null)
assert_eq "DATA_SLO: PASS p50=98.40 p95=312.70 p99=702.30 n=4812 errors=0.0004 dropped=0 model=open source=k6" "$OUT" "slo: an arrival-rate k6 run inside the SLO passes"
OUT=$(node "$SEAM" slo "$FIX/k6-closed-fail.json" --data "$FIX/DATA.md" 2>/dev/null); RC=$?
assert_contains "$OUT" "DATA_SLO: FAIL" "slo: a closed-model run fails"
assert_eq 1 "$RC" "slo: FAIL exit 1"
OUT=$(node "$SEAM" reconcile "$FIX/reconcile/source.tsv" "$FIX/reconcile/derived-ok.tsv" --key id 2>/dev/null)
assert_eq "DATA_RECONCILE: PASS source=4 derived=4 missing=0 extra=0 mismatched=0" "$OUT" "reconcile: a faithful derived copy passes"
OUT=$(node "$SEAM" migrations "$FIX/migrations" 2>/dev/null)
assert_eq "MIGRATION_SAFETY: PASS files=3 statements=11 unsafe=0 annotated=1 dialect=postgres" "$OUT" "migrations: expand steps + annotated contract step pass"
OUT=$(node "$SEAM" migrations "$FIX/migrations-unsafe" 2>/dev/null); RC=$?
assert_eq "MIGRATION_SAFETY: FAIL files=1 statements=5 unsafe=5 annotated=0 dialect=postgres" "$OUT" "migrations: careless DDL fails"
assert_eq 1 "$RC" "migrations: FAIL exit 1"
OUT=$(node "$SEAM" explain "$FIX/explain/plan-indexed.json" 2>/dev/null)
assert_eq "DATA_INDEXES: PASS plans=3 seq_scans=0 max_seq_rows=1000" "$OUT" "explain: indexed plans pass"
OUT=$(node "$SEAM" explain "$FIX/explain/plan-seqscan.txt" 2>/dev/null)
assert_eq "DATA_INDEXES: FAIL plans=2 seq_scans=2 max_seq_rows=1000" "$OUT" "explain: sequential scans fail"
node "$SEAM" 2>/dev/null; assert_eq 2 "$?" "no subcommand => usage, exit 2"

# ============================================================================
printf '\n--- score-build.sh: the data dimension is gated like logic ---\n'
# ============================================================================
PR=$(bash "$SB" pass-rate "$REPO_ROOT/tests/fixtures/build/data-gate-fail.tsv" 2>"$T/pr.err")
assert_eq "PASS_RATE: 0.50" "$PR" "a red data row caps the headline at 0.50"
assert_contains "$(cat "$T/pr.err")" "data_gate=CAPPED@0.50" "data gate reported CAPPED"
PR=$(bash "$SB" pass-rate "$REPO_ROOT/tests/fixtures/build/data-gate-pass.tsv" 2>"$T/pr.err")
assert_eq "PASS_RATE: 1.00" "$PR" "all data rows green => no cap"
assert_contains "$(cat "$T/pr.err")" "data_gate=PASS" "data gate reported PASS"
assert_contains "$(cat "$T/pr.err")" "data        score=1.00 weight=0.20" "data weight 0.20"
PR=$(bash "$SB" pass-rate "$REPO_ROOT/tests/fixtures/build/logic-gate-pass.tsv" 2>"$T/pr.err")
assert_eq "PASS_RATE: 1.00" "$PR" "a legacy ledger without data rows is unchanged"
assert_contains "$(cat "$T/pr.err")" "data_gate=n/a" "data gate n/a when no data rows"
printf 'FR-1 FR-2 NFR-1 NFR-2 NFR-3 NFR-4 NFR-5 NFR-6 NFR-7 NFR-8\n' > "$T/requirements.md"
COV=$(bash "$SB" coverage "$FIX/results-data.tsv" "$T/requirements.md" "$FIX/DATA.md" 2>"$T/cov.err")
assert_contains "$COV" "DATA_COVERAGE: 1.00" "coverage: DATA_COVERAGE printed when DATA.md is named"
assert_contains "$(cat "$T/cov.err")" "data_total=8 data_covered=8" "coverage: data groups counted on stderr"
COV=$(bash "$SB" coverage "$FIX/results-data.tsv" "$T/requirements.md" 2>/dev/null)
assert_contains "$COV" "DATA_COVERAGE: n/a" "coverage: n/a without a DATA.md (legacy builds unchanged)"
COV=$(BUILD_DATA_MD="$FIX/DATA.md" bash "$SB" coverage "$FIX/results-data.tsv" "$T/requirements.md" 2>/dev/null)
assert_contains "$COV" "DATA_COVERAGE: 1.00" "coverage: BUILD_DATA_MD names the record"
COV=$(BUILD_DATA_MD="$T/nowhere/DATA.md" bash "$SB" coverage "$FIX/results-data.tsv" "$T/requirements.md" 2>"$T/cov.err"); RC=$?
assert_eq 2 "$RC" "coverage: a BUILD_DATA_MD that is not a file is an error, never a silent n/a"
assert_contains "$(cat "$T/cov.err")" "data-md-missing" "coverage: the missing record is named"
cp "$FIX/DATA.md" "$T/data.md"
COV=$(bash "$SB" coverage "$FIX/results-data.tsv" "$T/requirements.md" "$T/data.md" 2>/dev/null)
assert_contains "$COV" "DATA_COVERAGE: 1.00" "coverage: a lowercase data.md argument is the data record, not the requirements"
assert_contains "$COV" "REQ_COVERAGE: 1.00" "coverage: requirements.md still resolves beside a lowercase data.md"
grep -v 'data:retention' "$FIX/results-data.tsv" > "$T/short.tsv"
COV=$(bash "$SB" coverage "$T/short.tsv" "$T/requirements.md" "$FIX/DATA.md" 2>"$T/cov.err"); RC=$?
assert_contains "$COV" "DATA_COVERAGE: 0.87" "coverage: a missing group lowers DATA_COVERAGE"
assert_eq 1 "$RC" "coverage: incomplete data coverage exits 1"
assert_contains "$(cat "$T/cov.err")" "data_missing=data:retention" "coverage: the missing group is named"
node "$REPO_ROOT/scripts/acceptance.cjs" validate "$FIX/results-data.tsv" && pass "acceptance.cjs accepts data rows" || fail "acceptance.cjs rejects data rows"

# ============================================================================
printf '\n--- score-requirements.sh: REQUIRE_DATA binds the spec to the data dimension ---\n'
# ============================================================================
V=$(bash "$SR" validate "$REPO_ROOT/tests/fixtures/requirements/valid.spec.yaml" 2>/dev/null)
assert_contains "$V" "data=absent require_data=0" "validate: data not required by default (legacy specs stay VALID)"
assert_contains "$V" "VALIDATION: VALID" "validate: legacy five-dimension spec still VALID"
V=$(REQUIRE_DATA=1 bash "$SR" validate "$REPO_ROOT/tests/fixtures/requirements/valid.spec.yaml" 2>/dev/null); RC=$?
assert_contains "$V" "VALIDATION: INVALID" "validate: REQUIRE_DATA=1 refuses a spec without a data block"
assert_eq 1 "$RC" "validate: missing data exit 1"
V=$(REQUIRE_DATA=1 REQUIRE_LOGIC=1 bash "$SR" validate "$REPO_ROOT/tests/fixtures/requirements/data.spec.yaml" 2>/dev/null); RC=$?
assert_contains "$V" "VALIDATION: VALID" "validate: the data-intensive fixture spec is VALID with REQUIRE_DATA=1"
assert_contains "$V" "data=present(groups_traced=8)" "validate: all eight groups traced"
assert_eq 0 "$RC" "validate: VALID exit 0"
sed 's/data:slo/data:nowhere/' "$REPO_ROOT/tests/fixtures/requirements/data.spec.yaml" | sed -E '/data:/,$ s/data:(workload|model|integrity|evolution|durability|derived|retention)/traced/' > "$T/untraced.spec.yaml"   # -E: BSD sed has no \| alternation
grep -q 'data:' "$T/untraced.spec.yaml" && ! grep -qE 'data:(workload|slo|model|integrity|evolution|durability|derived|retention)' "$T/untraced.spec.yaml" && pass "fixture: untraced spec keeps its data block and traces no group" || fail "fixture: untraced spec was not rewritten (sed portability)"
V=$(bash "$SR" validate "$T/untraced.spec.yaml" 2>/dev/null)
assert_contains "$V" "VALIDATION: INVALID" "validate: a data block tracing no data group is INVALID"
# a data:<group> mention outside the data block (another dimension's assert) does not count
sed 's/assert: security headers present/assert: "headers present (see data:slo elsewhere)"/' "$T/untraced.spec.yaml" > "$T/elsewhere.spec.yaml"
V=$(bash "$SR" validate "$T/elsewhere.spec.yaml" 2>/dev/null)
assert_contains "$V" "data=present(groups_traced=0)" "validate: traces are counted inside the data block only"

# ============================================================================
printf '\n--- contracts: build.md, requirements.md, checklist, protocol ---\n'
# ============================================================================
has() { grep -qiE -- "$2" "$1" && pass "$3" || fail "$3 (missing /$2/)"; }
has "$BUILD_SPEC" "data-intensive-protocol\.md"        "build: references the data-intensive protocol"
has "$BUILD_SPEC" "DATA\.md"                           "build: adopts DATA.md"
has "$BUILD_SPEC" "DATA_LINT: VALID"                   "build: DATA_LINT gate"
has "$BUILD_SPEC" "DATA_COVERAGE"                      "build: DATA_COVERAGE gate"
has "$BUILD_SPEC" "data_gate"                          "build: data gate named"
has "$BUILD_SPEC" "seven weighted dimensions"          "build: seven dimensions"
has "$BUILD_SPEC" "DATA_SLO"                           "build: open-model load test verdict"
has "$BUILD_SPEC" "DATA_RECONCILE"                     "build: derived data reconciled"
has "$BUILD_SPEC" "MIGRATION_SAFETY"                   "build: migrations linted"
has "$BUILD_SPEC" "coordinated omission|open.{0,20}load model|arrival-rate" "build: load model is open"
has "$REQ_SPEC"   "data-intensive-protocol\.md"        "requirements: references the protocol"
has "$REQ_SPEC"   "data & scale|data and scale"        "requirements: the data & scale round"
has "$REQ_SPEC"   "REQUIRE_DATA=1"                     "requirements: spec validation requires the data dimension"
has "$REQ_SPEC"   "DATA_LINT"                          "requirements: DATA.md draft linted before sign-off"
has "$REQ_SPEC"   "\*\*data\*\*"                       "requirements: NFRs map to the data dimension"
has "$CHECKLIST"  "^\| data \| 0\.20"                  "checklist: data dimension row"
has "$CHECKLIST"  "## 5\. Data"                        "checklist: data section"
has "$CHECKLIST"  "DATA_RECONCILE|reconcil"            "checklist: reconciliation row"
[[ -f "$PROTO" ]] && pass "protocol: reference exists" || fail "protocol: reference exists"
has "$PROTO" "DDIA2 p\.[0-9]+"                         "protocol: cites the book by page"
has "$PROTO" "coordinated omission"                    "protocol: coordinated omission named"
has "$PROTO" "Systems of record"                       "protocol: systems of record vs derived data"
has "$PROTO" "dual write"                              "protocol: dual writes forbidden"
has "$PROTO" "expand/contract"                         "protocol: expand/contract migrations"
has "$PROTO" "read-your-writes"                        "protocol: replication lag guarantees"
has "$PROTO" "Trust, but verify"                       "protocol: reconciliation doctrine"
has "$PROTO" "sla_days"                                "protocol: erasure SLA"
has "$PROTO" "Deliberately not used"                   "protocol: rejected metrics recorded"
has "$PROTO" "## §9 Sources"                           "protocol: cites its own sources"
for g in workload slo model integrity evolution durability derived retention; do
  grep -q "### 2\.[0-9] \`$g\`" "$PROTO" && pass "protocol: group $g documented" || fail "protocol: group $g documented"
done
for m in "$REPO_ROOT/.claude/skills/forge/references/data-intensive-protocol.md" \
         "$REPO_ROOT/.agents/skills/forge/references/data-intensive-protocol.md" \
         "$REPO_ROOT/plugins/forge/skills/forge/references/data-intensive-protocol.md" \
         "$REPO_ROOT/.opencode/skills/forge/references/data-intensive-protocol.md"; do
  if [[ -f "$m" ]] && diff -q "$PROTO" "$m" >/dev/null 2>&1; then pass "protocol parity: ${m#$REPO_ROOT/}"; else fail "protocol parity: ${m#$REPO_ROOT/} (missing or diverged)"; fi
done
for d in .claude/skills/forge claude-plugin/skills/forge .agents/skills/forge plugins/forge/skills/forge .opencode/skills/forge .cursor/skills/forge; do
  for s in data-score.cjs data-load.cjs score-build.sh score-requirements.sh acceptance.cjs validate-handoff.sh; do
    if diff -q "$REPO_ROOT/scripts/$s" "$REPO_ROOT/$d/scripts/$s" >/dev/null 2>&1; then pass "seam parity: $d/scripts/$s"; else fail "seam parity: $d/scripts/$s (missing or diverged)"; fi
  done
done
grep -q "data-score.cjs" "$REPO_ROOT/scripts/transform.sh" && pass "transform: data-score.cjs in the runtime list" || fail "transform: data-score.cjs missing from runtime list"
grep -q '"data"' "$REPO_ROOT/scripts/acceptance.cjs" || grep -q "'data'" "$REPO_ROOT/scripts/acceptance.cjs" && pass "acceptance.cjs: data in the dimension enum" || fail "acceptance.cjs: data missing from dims"

# ============================================================================
printf '\n=== Results: %d/%d passed ===' "$PASS" "$TOTAL"
if [[ "$FAIL" -gt 0 ]]; then printf ' (%d FAILED)\n' "$FAIL"; exit 1; else printf ' (all passed)\n'; exit 0; fi
