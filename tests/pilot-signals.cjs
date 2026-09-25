const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite'), { createHandler } = require('../evals/devops/pilot/handler.cjs'), o = require('../scripts/operational.cjs'), a = require('../scripts/acceptance.cjs');
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-signals-')), db = new DatabaseSync(path.join(dir, 'data.db'));
  db.exec('CREATE TABLE forge_notes(id TEXT PRIMARY KEY,body TEXT NOT NULL)');
  const key = 'local-fixture-secret-93f8', events = [], alerts = []; let outage = false, unhealthy = false;
  const identity = { deployment_id: 'local-pilot-v1', candidate: 'a'.repeat(40), configuration_sha256: a.sha('schema-v1') };
  const query = async (sql, params = []) => { if (outage) throw Error('database connection unavailable'); const statement = db.prepare(sql.replace(/\$\d/g, '?')); return /^SELECT/.test(sql) ? statement.all(...params).map(Object.values) : (statement.run(...params), []); };
  const server = http.createServer(createHandler({ query, secret: () => key, identity: () => identity, log: row => events.push(row), injectFailure: () => unhealthy }));
  const sink = http.createServer((req, res) => { let body = ''; req.on('data', d => body += d); req.on('end', () => { alerts.push(JSON.parse(body)); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ receipt: 'local-test-alert-' + alerts.length })); }); });
  await listen(server); await listen(sink);
  try {
    const base = 'http://127.0.0.1:' + server.address().port, headers = { 'x-forge-pilot-key': key };
    assert.equal((await fetch(base + '/api/journey', { method: 'POST' })).status, 401);
    const p = { version: 1, target: 'local-fixture', artifact: identity.deployment_id, configuration_sha256: identity.configuration_sha256, pinned_at: new Date(Date.now() - 1000).toISOString(),
      strategy: 'staged', min_samples: 3, observation_ms: 40, max_error_rate: 0, max_p95_ms: 1500, max_exposure: 0, observation_origin: base, local_fixture: true, test_alert_url: 'http://127.0.0.1:' + sink.address().port + '/alerts' };
    const healthy = await o.observe(p, base, key); assert.equal(o.rollout(p, healthy).decision, 'CONTINUE');
    assert.equal(db.prepare('SELECT count(*) AS n FROM forge_notes').get().n, 3);
    unhealthy = true; const broken = await o.observe(p, base, key);
    assert.equal(o.rollout(p, broken).decision, 'HOLD'); assert.equal(alerts.length, 1); assert.equal(alerts[0].failures, 3); assert.ok(broken.alert.receipt);
    assert.equal(events.filter(e => e.event === 'journey' && !e.ok).length, 3, 'the failure reached the service collector');
    // Exercise the runbook: stop injection, check dependency readiness separately, restore it, re-probe.
    unhealthy = false; outage = true;
    const firstPid = (await (await fetch(base + '/api/healthz')).json()).pid;
    assert.equal((await fetch(base + '/api/readyz', { headers })).status, 503);
    assert.equal((await fetch(base + '/api/healthz')).status, 200);
    outage = false; assert.equal((await fetch(base + '/api/readyz', { headers })).status, 200);
    const recovered = await o.observe(p, base, key); assert.equal(o.rollout(p, recovered).decision, 'CONTINUE');
    assert.equal((await (await fetch(base + '/api/healthz')).json()).pid, firstPid, 'readiness failure caused no restart');
    assert.equal(db.prepare('SELECT count(*) AS n FROM forge_notes').get().n, 6, 'old data survived the outage');
    fs.writeFileSync(path.join(dir, 'signals.json'), JSON.stringify({ healthy, broken, recovered, events, alerts }, null, 2));
    console.log('Pilot signals: persisted journey, injected failure, collector, HTTP test alert, readiness and runbook recovery passed (local SQLite fixture)');
  } finally { await Promise.all([new Promise(r => server.close(r)), new Promise(r => sink.close(r))]); db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
