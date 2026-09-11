#!/usr/bin/env bash
# Local contract fixtures only: no credentials, network calls or deployments.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node - "$ROOT" <<'JS'
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict'), { spawnSync } = require('node:child_process');
const root = process.argv[2], validator = path.join(root, 'scripts/validate-handoff.sh');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-security-ship-'));
let count = 0, sequence = 0;
const check = id => ({ id, status: 'pass', evidence: 'evidence/check.txt' });
const core = source => ({ version: '3.1.0', source, timestamp: '2026-09-11T12:00:00Z', status: 'COMPLETE' });
const audit = () => ({ ...core('security'), security: { verdict: 'PASS', fail_on: 'high', checks: [check('auth')], findings: [] } });
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
  files(dir); const file = path.join(dir, 'handoff.json'); fs.writeFileSync(file, JSON.stringify(j));
  const r = spawnSync('bash', [validator, file, j.source, ...(gate ? ['--require-pass'] : [])], { encoding: 'utf8' });
  if (r.error) throw r.error;
  return { code: r.status, output: r.stdout.trim(), error: r.stderr };
}
function test(name, action) { action(); count++; console.log('  PASS: ' + name); }
function expect(j, code, gate = false, files) { const r = run(j, gate, files); assert.equal(r.code, code, JSON.stringify(r)); assert.equal(r.output, code ? 'INVALID' : 'VALID'); }
test('clean audit passes without invented findings', () => expect(audit(), 0, true));
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
for (const p of ['../outside.txt', '/tmp/outside.txt', 'C:/outside.txt', 'https://example.test/proof', 'evidence/../check.txt'])
  test('gate rejects evidence path ' + p, () => { const j = audit(); j.security.checks[0].evidence = p; expect(j, 1, true); });
test('gate rejects symlink escape', () => { const j = audit(); j.security.checks[0].evidence = 'outside/proof.txt'; expect(j, 1, true, dir => {
  const outside = path.join(temp, 'outside'); fs.mkdirSync(outside, { recursive: true }); fs.writeFileSync(path.join(outside, 'proof.txt'), 'outside');
  fs.symlinkSync(outside, path.join(dir, 'outside'), process.platform === 'win32' ? 'junction' : 'dir');
}); });
for (const source of ['ship', 'security']) test('legacy ' + source + ' is readable but not readiness evidence', () => { const j = { ...core(source), version: '2.3.1' }; expect(j, 0); expect(j, 1, true); });
for (const source of ['loop', 'forge', 'debug', 'plan']) test('existing ' + source + ' contract stays valid', () => expect(core(source), 0));
for (const tree of ['.claude', 'claude-plugin', '.agents', '.opencode', 'plugins/forge'])
  test('validator mirror ' + tree, () => assert.equal(fs.readFileSync(path.join(root, tree, 'skills/forge/scripts/validate-handoff.sh'), 'utf8').replace(/\r\n/g, '\n'), fs.readFileSync(validator, 'utf8').replace(/\r\n/g, '\n')));
console.log(`=== ${count}/${count} passed ===`);
JS
