#!/usr/bin/env bash
# Local contract fixtures only: no credentials, network calls or deployments.
set -uo pipefail
export FORGE_TEST_BASH="$BASH"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node - "$ROOT" <<'JS'
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict'), { spawnSync } = require('node:child_process');
const root = process.argv[2], validator = path.join(root, 'scripts/validate-handoff.sh');
const acceptance = require(path.join(root, 'scripts/acceptance.cjs'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-security-ship-'));
let count = 0, sequence = 0;
const check = id => ({ id, status: 'pass', evidence: 'evidence/check.txt' });
const core = source => ({ version: '3.1.0', source, timestamp: '2026-09-11T12:00:00Z', status: 'COMPLETE' });
const audit = () => ({ ...core('security'), security: { verdict: 'PASS', fail_on: 'high', checks: [check('auth')], findings: [] } });
const buildReport = (source = 'build') => ({ ...core(source), status: 'CONVERGED', results_tsv: 'build-results.tsv',
  version: '3.3.0', acceptance: {plan:'acceptance-plan.json',plan_sha256:'AUTO_FIXTURE'},
  metric: { name: 'fullstack_pass_rate', value: 1 }, config: {}, coverage: { requirements: 1, design: 1 }, security: audit().security });
const digest = 'sha256:' + '2'.repeat(64);
const delivery = () => ({ ...core('ship'), ship: { action: 'ship', target: 'repo:fixture/env:staging', artifact: digest,
  readiness: [check('tests')], verification: [check('smoke')],
  authorization: { source: 'user', action: 'ship', target: 'repo:fixture/env:staging', artifact: digest, evidence: 'evidence/authorization.txt' },
  receipt: { id: 'local-fixture-receipt', target: 'repo:fixture/env:staging', artifact: digest, evidence: 'evidence/receipt.txt' } } });
const rollback = () => { const j = delivery(); j.status = 'ROLLBACK'; j.ship.action = j.ship.authorization.action = 'rollback';
  const from = { receipt: 'previous-deploy', target: j.ship.target, artifact: 'sha256:' + '3'.repeat(64) };
  j.ship.rollback = { reversible: true, from, observed: { ...from }, evidence: 'evidence/receipt.txt' }; return j; };
const preview = () => { const j = delivery(); j.status = 'DRY_RUN'; j.ship.action = 'dry-run'; j.ship.verification = []; delete j.ship.receipt; delete j.ship.authorization; return j; };
function run(j, gate = false, files = () => {}) {
  const dir = path.join(temp, String(++sequence)); fs.mkdirSync(path.join(dir, 'evidence'), { recursive: true });
  for (const f of ['check.txt', 'receipt.txt', 'authorization.txt']) fs.writeFileSync(path.join(dir, 'evidence', f), 'local fixture evidence\n');
  if (['build','feature'].includes(j.source)) {
    fs.writeFileSync(path.join(dir,'requirements.md'),'FR-1 fixture requirement\n');
    fs.writeFileSync(path.join(dir,'assert.cjs'),"require('node:assert/strict').equal(1+2,3)");
    fs.writeFileSync(path.join(dir,'checks.json'),JSON.stringify({checks:[{spec:'app',id:'FR-1',dimension:'functional',weight:1,required:true,applicable:true,execution:{argv:[process.execPath,'assert.cjs'],inputs:['assert.cjs'],environment:[],secret_env:{},timeout_ms:3000,output_limit:1024}}]}));
    fs.writeFileSync(path.join(dir,'build-results.tsv'),'app\tfunctional\tFR-1\t1\tpass\tevidence:evidence/check.txt\n');
    let previous;
    if(j.source==='feature') { acceptance.snapshot(dir,'checks.json','previous.json',['requirements.md']); previous={path:'previous.json',sha256:acceptance.sha(fs.readFileSync(path.join(dir,'previous.json')))}; }
    acceptance.snapshot(dir,'checks.json','acceptance-plan.json',['requirements.md'],previous);
    fs.unlinkSync(path.join(dir,'evidence/check.txt'));
    const exec=spawnSync(process.execPath,[path.join(root,'scripts/verification.cjs'),'run',dir,'acceptance-plan.json','app','FR-1','evidence/check.txt'],{encoding:'utf8',timeout:10000});assert.equal(exec.status,0,exec.stderr);
    if(j.acceptance?.plan_sha256==='AUTO_FIXTURE') j.acceptance.plan_sha256=acceptance.sha(fs.readFileSync(path.join(dir,'acceptance-plan.json')));
  }
  files(dir); const file = path.join(dir, 'handoff.json'); fs.writeFileSync(file, JSON.stringify(j));
  const r = spawnSync(process.env.FORGE_TEST_BASH, [validator, file, j.source, ...(gate ? ['--require-pass'] : [])], { encoding: 'utf8', timeout:60000, cwd:dir, env:{...process.env,FORGE_PROJECT_ROOT:dir} });
  if (r.error) throw r.error;
  return { code: r.status, output: r.stdout.trim(), error: r.stderr };
}
function test(name, action) { action(); count++; console.log('  PASS: ' + name); }
function expect(j, code, gate = false, files) { const r = run(j, gate, files); assert.equal(r.code, code, JSON.stringify(r)); assert.equal(r.output, code ? 'INVALID' : 'VALID'); }
test('clean audit passes without invented findings', () => expect(audit(), 0, true));
test('completed build requires its pinned plan',()=>{const j=buildReport();delete j.acceptance;expect(j,1);});
test('completed build rejects replaced plan digest',()=>{const j=buildReport();j.acceptance.plan_sha256='0'.repeat(64);expect(j,1);});
test('completed build rejects a deleted required row',()=>expect(buildReport(),1,false,dir=>fs.writeFileSync(path.join(dir,'build-results.tsv'),'# all required rows were dropped\n')));
test('completed build rejects blocked required row despite claimed metric',()=>expect(buildReport(),1,false,dir=>fs.writeFileSync(path.join(dir,'build-results.tsv'),'app\tfunctional\tFR-1\t1\tblocked\tevidence:evidence/check.txt\n')));
test('old build remains readable but cannot pass new readiness',()=>{const j=buildReport();for(const version of ['3.1.0','3.2.0']){j.version=version;delete j.acceptance;expect(j,0);expect(j,1,true);}});
for (const [name, change] of [
  ['empty planned checks', j => { j.security.checks = []; }],
  ['missing current evidence record', j => { delete j.security; }],
  ['duplicate planned check', j => { j.security.checks.push(check('auth')); }],
  ['null check', j => { j.security.checks = [null]; }],
  ['string checks', j => { j.security.checks = 'passed'; }],
  ['unknown threshold', j => { j.security.fail_on = 'none'; }],
  ['failed check cannot PASS', j => { j.security.checks[0].status = 'fail'; }],
  ['blocked check cannot PASS', j => { j.security.checks[0].status = 'blocked'; }],
  ['unexecuted check cannot PASS', j => { j.security.checks[0].status = 'not_run'; }],
  ['bounded audit cannot PASS', j => { j.status = 'BOUNDED'; }],
  ['unresolved high finding cannot PASS', j => { j.security.findings = [{ id: 'F1', severity: 'high', status: 'open', evidence: 'evidence/check.txt' }]; }],
  ['accepted high finding cannot PASS', j => { j.security.findings = [{ id: 'F1', severity: 'high', status: 'accepted', evidence: 'evidence/check.txt' }]; }]
]) test(name, () => { const j = audit(); change(j); expect(j, 1); });
test('completed failing audit is valid but fails readiness gate', () => { const j = audit(); j.security.verdict = 'FAIL'; j.security.checks[0].status = 'fail'; expect(j, 0); expect(j, 1, true); });
test('blocked audit is representable and fails readiness gate', () => { const j = audit(); j.status = 'BLOCKED'; j.security.verdict = 'BLOCKED'; j.security.checks[0].status = 'not_run'; expect(j, 0); expect(j, 1, true); });
test('resolved finding permits PASS after retest', () => { const j = audit(); j.security.findings = [{ id: 'F1', severity: 'critical', status: 'resolved', evidence: 'evidence/check.txt' }]; expect(j, 0, true); });
test('finding below chosen threshold remains reportable', () => { const j = audit(); j.security.findings = [{ id: 'F1', severity: 'medium', status: 'open', evidence: 'evidence/check.txt' }]; expect(j, 0, true); });
test('stricter threshold blocks the same finding', () => { const j = audit(); j.security.fail_on = 'medium'; j.security.findings = [{ id: 'F1', severity: 'medium', status: 'open', evidence: 'evidence/check.txt' }]; expect(j, 1); });

// Synthetic native Strix records; exercise the real gate without Docker, paid models or targets.
const strixAudit = (source = 'security') => {
  const j = source === 'security' ? audit() : buildReport(source);
  j.config = { ...j.config, strix: true };
  j.security.checks.push({ id: 'strix', status: 'pass', evidence: 'evidence/strix/run.json', exit_code: 0 });
  return j;
};
function expectStrix(j, code, alter = () => {}, gate = true, files = () => {}) {
  const native = {
    run: { run_id: 'fixture-scan', status: 'completed', non_interactive: true, scope_mode: 'full',
      start_time: '2026-09-21T00:00:00Z', end_time: '2026-09-21T00:01:00Z', targets_info: [{ type: 'local', original: '/fixture' }],
      scan_results: { scan_completed: true, success: true } },
    sarif: { version: '2.1.0', runs: [{ tool: { driver: { name: 'Strix', version: 'test-fixture' } },
      invocations: [{ executionSuccessful: true }], results: [] }] }
  };
  alter(j, native);
  expect(j, code, gate, dir => {
    fs.mkdirSync(path.join(dir, 'evidence/strix'));
    for (const [name, value] of [['run.json', native.run], ['findings.sarif', native.sarif]])
      if (value !== undefined) fs.writeFileSync(path.join(dir, 'evidence/strix', name), JSON.stringify(value));
    files(dir);
  });
}
function strixFinding(j, native, severity = 'medium') {
  j.security.checks[1].exit_code = 2;
  native.sarif.runs[0].results.push({ properties: { strix: { id: 'vuln-0001', severity } } });
  j.security.findings.push({ id: 'strix:fixture-scan:vuln-0001', severity, status: 'open', evidence: 'evidence/check.txt' });
}
for (const source of ['security', 'build', 'feature']) {
  test(source + ' accepts a completed clean Strix run', () => expectStrix(strixAudit(source), 0, undefined, source === 'security'));
  test(source + ' rejects a budget-stopped Strix run even with exit 0', () => expectStrix(strixAudit(source), 1,
    (_, n) => { n.run.status = 'stopped'; }, source === 'security'));
  test(source + ' cannot drop a selected Strix check', () => expectStrix(strixAudit(source), 1,
    j => { j.security.checks.pop(); }, source === 'security'));
}
for (const [name, alter] of [
  ['running', (_, n) => { n.run.status = 'running'; }],
  ['failed', (_, n) => { n.run.status = 'failed'; }],
  ['interrupted', (_, n) => { n.run.status = 'interrupted'; }],
  ['unfinished scan', (_, n) => { n.run.scan_results.scan_completed = false; }],
  ['unsuccessful scan', (_, n) => { n.run.scan_results.success = false; }],
  ['interactive exit 0', (_, n) => { n.run.non_interactive = false; }],
  ['implicit diff scope', (_, n) => { n.run.scope_mode = 'auto'; }],
  ['missing end time', (_, n) => { n.run.end_time = null; }],
  ['numeric timestamps', (_, n) => { n.run.start_time = 0; n.run.end_time = 1; }],
  ['wrong time order', (_, n) => { n.run.end_time = '2026-09-20T00:00:00Z'; }],
  ['missing targets', (_, n) => { n.run.targets_info = []; }],
  ['incomplete coverage', (_, n) => { n.sarif.runs[0].invocations[0].executionSuccessful = false; }],
  ['missing invocation', (_, n) => { delete n.sarif.runs[0].invocations; }],
  ['open coverage follow-up', (_, n) => { n.sarif.runs[0].results = [{ kind: 'open', properties: { strix: { coverage_outcome: 'needs_follow_up' } } }]; }],
  ['unknown result kind', (_, n) => { n.sarif.runs[0].results = [{ kind: 'unknown' }]; }],
  ['unrecognized pass result', (_, n) => { n.sarif.runs[0].results = [{ kind: 'pass' }]; }],
  ['null result', (_, n) => { n.sarif.runs[0].results = [null]; }],
  ['missing native run', (_, n) => { delete n.run; }],
  ['missing native SARIF', (_, n) => { delete n.sarif; }],
  ['wrong SARIF tool', (_, n) => { n.sarif.runs[0].tool.driver.name = 'other'; }],
  ['missing tool version', (_, n) => { delete n.sarif.runs[0].tool.driver.version; }],
  ['wrong SARIF version', (_, n) => { n.sarif.version = '1.0'; }],
  ['multiple native runs', (_, n) => { n.sarif.runs.push(n.sarif.runs[0]); }],
  ['wrong results type', (_, n) => { n.sarif.runs[0].results = {}; }],
  ['fatal exit', j => { j.security.checks[1].exit_code = 1; }],
  ['missing exit', j => { delete j.security.checks[1].exit_code; }],
  ['string exit', j => { j.security.checks[1].exit_code = '0'; }],
  ['inconsistent findings exit', j => { j.security.checks[1].exit_code = 2; }],
  ['dropped finding', (j, n) => { strixFinding(j, n); j.security.findings = []; }],
  ['downgraded finding', (j, n) => { strixFinding(j, n); j.security.findings[0].severity = 'low'; }],
  ['unknown severity', (j, n) => { strixFinding(j, n); n.sarif.runs[0].results[0].properties.strix.severity = 'unknown'; }],
  ['duplicate native finding', (j, n) => { strixFinding(j, n); n.sarif.runs[0].results.push(n.sarif.runs[0].results[0]); }],
  ['finding from wrong run', (j, n) => { strixFinding(j, n); n.run.run_id = 'another-run'; }],
  ['finding with clean exit', (j, n) => { strixFinding(j, n); j.security.checks[1].exit_code = 0; }]
]) test('Strix gate rejects ' + name, () => expectStrix(strixAudit(), 1, alter));
test('Strix evidence is enforced without the config hint', () => expectStrix(strixAudit(), 1, (j, n) => { delete j.config; n.run.status = 'stopped'; }));
test('Strix medium finding uses the existing high threshold', () => expectStrix(strixAudit(), 0, strixFinding));
test('Strix high finding blocks readiness', () => expectStrix(strixAudit(), 1, (j, n) => { strixFinding(j, n, 'high'); j.security.verdict = 'FAIL'; }));
test('Strix high finding can pass only with a recorded retest', () => expectStrix(strixAudit(), 0, (j, n) => { strixFinding(j, n, 'high'); j.security.findings[0].status = 'resolved'; }));
test('Strix passing coverage rows are not vulnerabilities', () => expectStrix(strixAudit(), 0, (_, n) => {
  n.sarif.runs[0].results = ['no_issue_found', 'ruled_out', 'not_applicable'].map(outcome => ({
    kind: outcome === 'not_applicable' ? 'notApplicable' : 'pass', properties: { strix: { coverage_outcome: outcome } }
  }));
}));
test('Strix unavailable preflight stays readable and blocks readiness', () => {
  const j = strixAudit(); j.status = 'BLOCKED'; j.security.verdict = 'BLOCKED';
  Object.assign(j.security.checks[1], { status: 'blocked', exit_code: null, evidence: 'evidence/check.txt' });
  expect(j, 0); expect(j, 1, true);
});
test('Strix native sidecar cannot escape via symlink', () => expectStrix(strixAudit(), 1, undefined, true, dir => {
  const file = path.join(dir, 'evidence/strix/findings.sarif'), outside = path.join(temp, 'outside.sarif');
  fs.copyFileSync(file, outside); fs.unlinkSync(file); fs.symlinkSync(outside, file);
}));
test('Strix validation does not reinterpret optional ship metadata', () => {
  const j = delivery(); j.security = { checks: 'historical audit summary' }; expect(j, 0, true);
});
for (const source of ['build', 'feature']) {
  for (const status of ['COMPLETE', 'CONVERGED']) {
    test(source + '/' + status + ' requires passing security even without readiness flag', () => {
      const j = buildReport(source); j.status = status; expect(j, 0); expect(j, 0, true);
      delete j.security; expect(j, 1);
    });
  }
  for (const [name, change] of [
    ['empty planned checks', j => { j.security.checks = []; }],
    ['critical-only threshold', j => { j.security.fail_on = 'critical'; }],
    ['failed audit', j => { j.security.verdict = 'FAIL'; j.security.checks[0].status = 'fail'; }],
    ['unrun audit', j => { j.security.verdict = 'BLOCKED'; j.security.checks[0].status = 'not_run'; }],
    ['skipped hardening check', j => { j.security.checks[0].status = 'skip'; }],
    ['missing evidence reference', j => { delete j.security.checks[0].evidence; }],
    ['unresolved high', j => { j.security.verdict = 'FAIL'; j.security.findings = [{ id: 'F1', severity: 'high', status: 'open', evidence: 'evidence/check.txt' }]; }],
    ['accepted high', j => { j.security.verdict = 'FAIL'; j.security.findings = [{ id: 'F1', severity: 'high', status: 'accepted', evidence: 'evidence/check.txt' }]; }]
  ]) test(source + ' completion rejects ' + name, () => { const j = buildReport(source); change(j); expect(j, 1); });
  for (const threshold of ['medium', 'low', 'info']) test(source + ' permits stricter threshold ' + threshold, () => {
    const j = buildReport(source); j.security.fail_on = threshold; expect(j, 0, true);
  });
  for (const status of ['BOUNDED', 'BLOCKED', 'ERROR']) test(source + '/' + status + ' stays readable without security, never ready', () => {
    const j = buildReport(source); j.status = status; delete j.security; expect(j, 0); expect(j, 1, true);
  });
  test(source + ' cannot call incomplete work ready even with a passing audit', () => {
    const j = buildReport(source); j.status = 'BOUNDED'; expect(j, 0); expect(j, 1, true);
  });
  test(source + ' passing security cannot bypass missing or incomplete coverage', () => {
    const j = buildReport(source); delete j.coverage; expect(j, 1, true);
    j.coverage = { requirements: 1, design: 0.5 }; expect(j, 1, true);
  });
  test('legacy ' + source + ' stays readable but cannot bypass readiness', () => {
    const j = buildReport(source); j.version = '2.3.1'; delete j.security; expect(j, 0); expect(j, 1, true);
    j.security = audit().security; expect(j, 1, true);
  });
  for (const [name, change] of [
    ['missing', dir => fs.unlinkSync(path.join(dir, 'evidence/check.txt'))],
    ['empty', dir => fs.writeFileSync(path.join(dir, 'evidence/check.txt'), '')],
    ['directory', dir => { fs.unlinkSync(path.join(dir, 'evidence/check.txt')); fs.mkdirSync(path.join(dir, 'evidence/check.txt')); }]
  ]) test(source + ' completion rejects ' + name + ' evidence without readiness flag', () => expect(buildReport(source), 1, false, change));
}
test('verified bound shipment passes', () => expect(delivery(), 0, true));
for (const [name, change] of [
  ['core-only ship cannot complete', j => { delete j.ship; }],
  ['missing target', j => { delete j.ship.target; }],
  ['mutable artifact absent', j => { j.ship.artifact = ''; }],
  ['latest is not immutable', j => { j.ship.artifact = j.ship.receipt.artifact = j.ship.authorization.artifact = 'latest'; }],
  ['branch is not immutable', j => { j.ship.artifact = j.ship.receipt.artifact = j.ship.authorization.artifact = 'main'; }],
  ['empty readiness', j => { j.ship.readiness = []; }],
  ['failed readiness', j => { j.ship.readiness[0].status = 'fail'; }],
  ['missing verification', j => { j.ship.verification = []; }],
  ['failed smoke', j => { j.ship.verification[0].status = 'fail'; }],
  ['missing receipt', j => { delete j.ship.receipt; }],
  ['receipt for another target', j => { j.ship.receipt.target = 'production'; }],
  ['receipt for another artifact', j => { j.ship.receipt.artifact = 'v1'; }],
  ['missing authorization', j => { delete j.ship.authorization; }],
  ['authorization for another action', j => { j.ship.authorization.action = 'rollback'; }],
  ['authorization for another target', j => { j.ship.authorization.target = 'production'; }],
  ['authorization for another artifact', j => { j.ship.authorization.artifact = 'v1'; }],
  ['inferred authorization', j => { j.ship.authorization.source = 'inferred'; }]
]) test(name, () => { const j = delivery(); change(j); expect(j, 1); });
test('failed deployment is representable without success receipt', () => { const j = delivery(); j.status = 'ERROR'; j.ship.verification[0].status = 'fail'; delete j.ship.receipt; expect(j, 0); expect(j, 1, true); });
test('direct user-auto authorization is representable', () => { const j = delivery(); j.ship.authorization.source = 'user-auto'; expect(j, 0, true); });
test('dry-run is valid without execution and cannot pass delivery gate', () => { expect(preview(), 0); expect(preview(), 1, true); });
test('checklist-only is a non-delivery preview', () => { const j = preview(); j.ship.action = 'checklist'; expect(j, 0); expect(j, 1, true); });
test('preview cannot carry a published receipt', () => { const j = preview(); j.ship.receipt = delivery().ship.receipt; expect(j, 1); });
test('preview cannot claim COMPLETE', () => { const j = preview(); j.status = 'COMPLETE'; expect(j, 1); });
for (const status of ['DRY_RUN', 'ROLLBACK']) test(status + ' is ship-only', () => { const j = core('loop'); j.status = status; expect(j, 1); });
test('verified rollback is valid', () => expect(rollback(), 0, true));
for (const [name, change] of [
  ['irreversible action', j => { j.ship.rollback.reversible = false; }],
  ['missing rollback evidence', j => { delete j.ship.rollback; }],
  ['stale receipt', j => { j.ship.rollback.observed.receipt = 'newer'; }],
  ['current artifact changed', j => { j.ship.rollback.observed.artifact = 'different'; }],
  ['mutable original artifact', j => { j.ship.rollback.from.artifact = j.ship.rollback.observed.artifact = 'latest'; }],
  ['rollback target mismatch', j => { j.ship.rollback.from.target = j.ship.rollback.observed.target = 'production'; }]
]) test('rollback refuses ' + name, () => { const j = rollback(); change(j); expect(j, 1); });
for (const make of [audit, delivery]) {
  for (const [name, change] of [
    ['missing', dir => fs.unlinkSync(path.join(dir, 'evidence/check.txt'))],
    ['empty', dir => fs.writeFileSync(path.join(dir, 'evidence/check.txt'), '')],
    ['directory', dir => { fs.unlinkSync(path.join(dir, 'evidence/check.txt')); fs.mkdirSync(path.join(dir, 'evidence/check.txt')); }]
  ]) test(make().source + ' gate rejects ' + name + ' evidence', () => expect(make(), 1, true, change));
}
for (const make of [audit, buildReport]) {
for (const p of ['../outside.txt', '/tmp/outside.txt', 'C:/outside.txt', 'https://example.test/proof', 'evidence/../check.txt'])
  test(make().source + ' gate rejects evidence path ' + p, () => { const j = make(); j.security.checks[0].evidence = p; expect(j, 1, j.source === 'security'); });
test(make().source + ' gate rejects symlink escape', () => { const j = make(); j.security.checks[0].evidence = 'outside/proof.txt'; expect(j, 1, j.source === 'security', dir => {
  const outside = path.join(temp, 'outside'); fs.mkdirSync(outside, { recursive: true }); fs.writeFileSync(path.join(outside, 'proof.txt'), 'outside');
  fs.symlinkSync(outside, path.join(dir, 'outside'), process.platform === 'win32' ? 'junction' : 'dir');
}); });
}
for (const source of ['ship', 'security']) test('legacy ' + source + ' is readable but not readiness evidence', () => { const j = { ...core(source), version: '2.3.1' }; expect(j, 0); expect(j, 1, true); });
for (const source of ['loop', 'forge', 'debug', 'plan']) test('existing ' + source + ' contract stays valid', () => expect(core(source), 0));
for (const tree of ['.claude', 'claude-plugin', '.agents', '.opencode', 'plugins/forge'])
  test('validator mirror ' + tree, () => assert.equal(fs.readFileSync(path.join(root, tree, 'skills/forge/scripts/validate-handoff.sh'), 'utf8').replace(/\r\n/g, '\n'), fs.readFileSync(validator, 'utf8').replace(/\r\n/g, '\n')));
console.log(`=== ${count}/${count} passed ===`);
JS
