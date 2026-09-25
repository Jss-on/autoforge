#!/usr/bin/env bash
# smoke-seam.sh — deterministic end-to-end smoke of the mechanical pipeline.
#
# Exercises the full seam chain a real build run traverses — spec-shaped run dir
# → evidence store → strict scoring → coverage → bound → score-log → handoff
# validation → run index — with zero model involvement. Runs everywhere (CI
# included) in <1s. Complements smoke-model.sh, which tests the model side.
#
#   exit 0 SMOKE: OK · exit 1 SMOKE: FAIL (failures listed on stderr)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SB="$SCRIPT_DIR/score-build.sh"
VH="$SCRIPT_DIR/validate-handoff.sh"
RI="$SCRIPT_DIR/run-index.sh"

FAILS=0
chk() { # $1 desc, $2 expected, $3 got
  if [[ "$2" == "$3" ]]; then
    printf '  ok: %s\n' "$1"
  else
    printf '  FAIL: %s (expected %s, got %s)\n' "$1" "$2" "$3" >&2
    FAILS=$((FAILS + 1))
  fi
}

ROOT="$(mktemp -d)"
RUN="$ROOT/runs/build-000101-0000"
mkdir -p "$RUN/evidence"
trap 'rm -rf "$ROOT"' EXIT

# --- a micro run: 3 requirements, 4 rows across 3 dimensions, real evidence files
cat > "$RUN/requirements.md" <<'EOF'
# Micro SRS
- FR-1 add two numbers
- FR-2 multiply two numbers
- NFR-1 responds under 100ms
EOF
node - "$SCRIPT_DIR" "$RUN" <<'JS' || exit 1
const fs=require('node:fs'),path=require('node:path'),[scripts,run]=process.argv.slice(2);
const a=require(path.resolve(scripts,'acceptance.cjs')),v=require(path.resolve(scripts,'verification.cjs'));
(async()=>{
fs.writeFileSync(path.join(run,'calc.cjs'),'exports.add=(a,b)=>a+b;exports.mul=(a,b)=>a*b;\n');
const checks=[['add','logic',"assert.equal(c.add(-4,9),5)",'FR-1'],['mul','logic',"assert.equal(c.mul(-2,8),-16)",'FR-2'],
['module','functional',"assert.equal(typeof c.add,'function');assert.equal(typeof c.mul,'function')",'FR-1,FR-2'],
['latency','monitoring',"const s=performance.now();c.add(2,3);assert.ok(performance.now()-s<100)",'NFR-1'],
['security','hardening',"const input='globalThis.forgeInjected=true';c.add(input,1);c.mul(input,2);assert.equal(globalThis.forgeInjected,undefined)",'FR-1,FR-2']].map(([id,dimension,code,traces])=>({spec:'micro',id,dimension,weight:1,required:true,applicable:true,traces,
execution:{argv:[process.execPath,'-e',"const assert=require('node:assert/strict'),c=require('./calc.cjs');"+code],inputs:['calc.cjs'],environment:[],secret_env:{},timeout_ms:5000,output_limit:4096}}));
fs.writeFileSync(path.join(run,'checks.json'),JSON.stringify({checks}));a.snapshot(run,'checks.json','plan.json',['requirements.md']);
let tsv='spec\tdimension\tassertion\tweight\tstatus\tdetail\ttraces\n';
for(const c of checks){const file='evidence/'+c.id+'.json',r=await v.execute(run,'plan.json','micro',c.id,file);a.need(r.status==='pass','Executed seam assertion failed');tsv+=['micro',c.dimension,c.id,1,r.status,'evidence:'+file,c.traces].join('\t')+'\n';}
fs.writeFileSync(path.join(run,'build-results.tsv'),tsv);
fs.writeFileSync(path.join(run,'plan.sha256'),a.sha(fs.readFileSync(path.join(run,'plan.json'))));
})().catch(e=>{console.error(e);process.exitCode=1});
JS
printf 'n\tphase\tchange\tpass_rate\n1\timpl\tadd\t0.50\n2\timpl\tmul\t1.00\n' > "$RUN/iterations.tsv"

# --- 1. strict scoring believes real evidence
RATE=$(cd "$RUN" && AR_SCORE_LOG=1 bash "$SB" pass-rate --strict-evidence build-results.tsv 2>/dev/null | awk '{print $2}')
chk "strict pass-rate on evidenced rows" "1.00" "$RATE"

# --- 2. strict scoring demotes fabricated rows
printf 'micro\thardening\tfabricated\t1\tpass\tlooks safe\tNFR-1\n' >> "$RUN/build-results.tsv"
RATE2=$(cd "$RUN" && AR_SCORE_LOG=1 bash "$SB" pass-rate --strict-evidence build-results.tsv 2>/dev/null | awk '{print $2}')
[[ "$RATE2" != "1.00" ]] && chk "strict demotes unproven pass row" "demoted" "demoted" \
                         || chk "strict demotes unproven pass row" "demoted" "1.00"
# drop the fabricated row again for the gates below
head -6 "$RUN/build-results.tsv" > "$RUN/.tmp" && mv "$RUN/.tmp" "$RUN/build-results.tsv"

# --- 3. coverage gate closes
COV=$(cd "$RUN" && AR_SCORE_LOG=1 bash "$SB" coverage build-results.tsv requirements.md 2>/dev/null | head -1 | awk '{print $2}')
chk "REQ_COVERAGE reaches 1.00" "1.00" "$COV"

# --- 4. bound gate
B=$(bash "$SB" bound "$RUN/iterations.tsv" 25 | awk '{print $2}')
chk "bound within budget" "OK" "$B"
BX=0; bash "$SB" bound "$RUN/iterations.tsv" 1 >/dev/null || BX=$?
chk "bound exceeded exits 1" "1" "$BX"

# --- 5. scorer left its hash-anchored audit trail
LOGL=$(grep -c . "$RUN/score-log.tsv" 2>/dev/null || echo 0)
[[ "$LOGL" -ge 3 ]] && chk "score-log has an entry per invocation" "3+" "3+" \
                    || chk "score-log has an entry per invocation" "3+" "$LOGL"

# --- 6. handoff contract
cat > "$RUN/handoff.json" <<EOF
{
  "version": "3.3.0",
  "source": "build",
  "timestamp": "2026-01-01T00:00:00+00:00",
  "status": "CONVERGED",
  "results_tsv": "build-results.tsv",
  "acceptance": { "plan": "plan.json", "plan_sha256": "$(cat "$RUN/plan.sha256")" },
  "security": { "verdict": "PASS", "fail_on": "high", "findings": [], "checks": [{ "id": "input-remains-data", "status": "pass", "evidence": "evidence/security.json" }] },
  "metric": { "name": "fullstack_pass_rate", "value": 1.00 },
  "coverage": { "requirements": 1.00, "design": 1.00 },
  "config": { "spec": "micro" }
}
EOF
export FORGE_PROJECT_ROOT="$RUN"
VOUT=$(bash "$VH" "$RUN/handoff.json" build --require-pass)
chk "handoff validates" "VALID" "$VOUT"
# a converged build without coverage must NOT validate
sed '/coverage/d' "$RUN/handoff.json" > "$RUN/.h" ; VBAD=0
bash "$VH" "$RUN/.h" build >/dev/null 2>&1 || VBAD=$?
chk "converged-without-coverage rejected" "1" "$VBAD"

# An executed receipt is invalid after its source changes, including through the handoff caller.
printf '// changed after verification\n' >> "$RUN/calc.cjs"
STALE=0; bash "$VH" "$RUN/handoff.json" build --require-pass >/dev/null 2>&1 || STALE=$?
chk "current handoff rejects stale execution" "1" "$STALE"
sed '$d' "$RUN/calc.cjs" > "$RUN/.calc" && mv "$RUN/.calc" "$RUN/calc.cjs"

# --- 7. run index sees the run
IDX=$(bash "$RI" list "$ROOT/runs" | awk -F'\t' 'NR==2 {print $2"/"$3"/"$6}')
chk "run-index row (source/status/evidence)" "build/CONVERGED/yes" "$IDX"

if [[ "$FAILS" -gt 0 ]]; then echo "SMOKE: FAIL ($FAILS)"; exit 1; fi
echo "SMOKE: OK"
