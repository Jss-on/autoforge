const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const repo = path.resolve(process.argv[2] || '.'), file = path.join(repo, 'scripts/delivery-metrics.cjs');
const metric = process.argv.includes('--metric');
if (!fs.existsSync(file)) { console.log('0'); console.error('Delivery reducer absent: 0/10'); process.exit(metric ? 0 : 1); }
const { report } = require(file);
const start = '2026-01-02T00:00:00Z', end = '2026-01-12T00:00:00Z';
const commit = (id, at) => ({ id, committed_at: at });
const delivery = (operation_id, at, commits, action = 'promote') => ({ version: 1, provider: 'vercel', service: 'notes', environment: 'production', operation_id, action,
  provider_deployment_id: 'dpl_' + operation_id, target: 'team/project', candidate: 'a'.repeat(40), configuration_sha256: 'b'.repeat(64),
  observed_live_at: at, state: 'OBSERVED_LIVE', source_commits: commits });
const incident = (id, at, restored, cause, remedies = []) => ({ source: 'incident', incident: { id, service: 'notes', impact_started_at: at,
  restored_at: restored, causal_operation_id: cause, remediation_operation_ids: remedies, unplanned: true } });
const c1 = commit('c1', '2026-01-01T00:00:00Z');
const rows = [delivery('old', '2026-01-01T00:00:00Z', [commit('c0', '2025-12-30T00:00:00Z')]),
  delivery('d1', start, [c1, commit('c2', '2026-01-01T12:00:00Z')]),
  delivery('d2', '2026-01-04T00:00:00Z', [commit('c3', start)]),
  delivery('d3', '2026-01-04T02:00:00Z', [commit('c4', '2026-01-04T01:00:00Z')]),
  delivery('d4', '2026-01-10T00:00:00Z', [c1], 'rollback'), delivery('end', end, [c1]),
  incident('i1', '2026-01-04T00:10:00Z', '2026-01-04T02:10:00Z', 'd2', ['d3', 'd4']),
  incident('i2', '2026-01-10T01:00:00Z', null, 'd4'), incident('unknown', '2026-01-05T00:00:00Z', null, null)];
const run = (input = rows) => report(input, 'notes', start, end);
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.error('PASS: ' + name); } catch (e) { failed++; console.error('FAIL: ' + name + ': ' + e.message); } }
test('all five metrics match hand calculation', () => { const r = run(); assert.equal(r.deployment_frequency.per_day, .4); assert.equal(r.change_lead_time.median_seconds, 64800);
  assert.equal(r.failed_deployment_recovery_time.median_seconds, 7200); assert.equal(r.change_fail_rate.rate, .5); assert.equal(r.deployment_rework_rate.rate, .5); });
test('window boundaries, multiple changes and rollback convention', () => { const r = run(); assert.equal(r.deployment_frequency.deployments, 4); assert.equal(r.change_lead_time.changes, 4); assert.equal(r.deployment_frequency.rollbacks, 1); });
test('duplicate imports and shipment wrapper are idempotent', () => { assert.deepEqual(run([...rows, { source: 'ship', ship: { delivery: rows[1] } }]), run()); });
test('previews and experiments cannot count or cause a production failure', () => { const p = { ...rows[1], operation_id: 'preview', environment: 'preview' };
  const r = run([...rows, p, { source: 'loop', delivery: rows[2] }, incident('p', start, end, 'preview', ['d1'])]); assert.equal(r.deployment_frequency.deployments, 4); assert.equal(r.change_fail_rate.rate, .5); assert.equal(r.deployment_rework_rate.rate, .5); });
test('open and unrelated incidents remain visible', () => { const r = run(); assert.equal(r.failed_deployment_recovery_time.completed, 1); assert.equal(r.failed_deployment_recovery_time.censored, 1); assert.equal(r.coverage.unlinked_incidents, 1); });
test('no observations are unavailable, never perfect', () => { const r = run([]); for (const m of ['change_fail_rate', 'deployment_rework_rate']) assert.equal(r[m].rate, null); assert.equal(r.deployment_frequency.per_day, null); assert.equal(r.change_lead_time.median_seconds, null); });
test('missing timestamps and conflicting duplicate operations are explicit', () => { const r = run([...rows, { ...rows[1], operation_id: 'missing', observed_live_at: null }, { ...rows[1], candidate: 'f'.repeat(40) }]);
  assert.equal(r.deployment_frequency.deployments, 3); assert.equal(r.coverage.partial, true); assert.ok(r.coverage.issues.some(s => s.includes('conflict'))); assert.ok(r.coverage.issues.some(s => s.includes('missing'))); });
test('original change IDs deduplicate squash/cherry-pick; uncertain mappings excluded', () => { const duplicate = delivery('mapped', '2026-01-11T00:00:00Z', [{ id: 'squash', original_id: 'c1', committed_at: c1.committed_at }, { id: 'unknown-map', committed_at: start, mapping_uncertain: true }]);
  const r = run([...rows, duplicate]); assert.equal(r.change_lead_time.changes, 4); assert.ok(r.coverage.partial); });
test('observed unhealthy production counts, accepted-only does not', () => { const bad = { ...rows[1], operation_id: 'bad', state: 'OBSERVED_UNHEALTHY' };
  const pending = { ...rows[1], operation_id: 'pending', state: 'ACCEPTED', observed_live_at: undefined }; const r = run([...rows, bad, pending]); assert.equal(r.deployment_frequency.deployments, 5); assert.equal(r.coverage.unobserved_operations, 1); });
test('invalid window and malformed input fail explicitly', () => { assert.throws(() => report({}, 'notes', start, end)); assert.throws(() => report([], 'notes', end, start)); assert.throws(() => run([null])); });
console.log(metric ? passed : `${passed}/10 delivery metrics checks passed`); if (failed && !metric) process.exitCode = 1;
