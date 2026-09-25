// A real local database drill; it does not claim Neon/provider restore evidence.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const { DatabaseSync, backup } = require('node:sqlite'), a = require('../scripts/acceptance.cjs'), o = require('../scripts/operational.cjs');
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-restore-')), source = new DatabaseSync(path.join(root, 'source.db'));
  source.exec('CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT NOT NULL); INSERT INTO notes VALUES(1,\'old data\')');
  const oldApp = db => db.prepare('SELECT id, body FROM notes ORDER BY id').all();
  assert.equal(oldApp(source)[0].body, 'old data');
  source.exec('ALTER TABLE notes ADD COLUMN label TEXT'); // expand, never a destructive down migration
  const newApp = db => db.prepare('SELECT id, body, COALESCE(label,\'unlabelled\') AS label FROM notes ORDER BY id').all();
  assert.equal(newApp(source)[0].label, 'unlabelled');
  source.prepare('INSERT INTO notes(id,body,label) VALUES(?,?,?)').run(2, 'new data', 'synthetic');
  assert.deepEqual(oldApp(source).map(r => r.body), ['old data', 'new data']);
  const expected = JSON.stringify(newApp(source)), commitTime = new Date().toISOString();
  await backup(source, path.join(root, 'backup.db'));
  const incident = new Date().toISOString(); source.exec('DELETE FROM notes');
  assert.equal(oldApp(source).length, 0); // prove recovery is needed
  const started = new Date().toISOString(); fs.copyFileSync(path.join(root, 'backup.db'), path.join(root, 'restored.db'));
  const restored = new DatabaseSync(path.join(root, 'restored.db')), actual = JSON.stringify(newApp(restored));
  assert.equal(oldApp(restored).length, 2); assert.equal(actual, expected);
  const usable = new Date().toISOString(), p = { version: 1, target: 'local-fixture', artifact: 'local-old-app', configuration_sha256: a.sha('schema-v2'), pinned_at: commitTime,
    strategy: 'staged', min_samples: 1, observation_ms: 1, max_error_rate: 0, max_p95_ms: 1500, max_exposure: 0,
    recovery: { action: 'rollback', rto_seconds: 300, rpo_seconds: 60, owner: 'fixture-runner', next_drill_at: new Date(Date.now() + 30 * 86400000).toISOString() } };
  const receipt = { target: p.target, source: 'source.db', destination: 'restored.db', incident_at: incident, started_at: started, usable_at: usable, latest_restored_commit_at: commitTime,
    integrity: { expected_count: 2, actual_count: oldApp(restored).length, expected_sha256: a.sha(expected), actual_sha256: a.sha(actual) },
    compatibility: { old_app_new_schema: true, new_app_old_data: true }, serving_artifact: p.artifact };
  const result = o.recovery(p, receipt); assert.equal(result.decision, 'RECOVERED');
  assert.equal(oldApp(source).length, 0, 'isolated restore did not overwrite the source');
  fs.writeFileSync(path.join(root, 'receipt.json'), JSON.stringify({ policy: p, receipt, result }, null, 2));
  restored.close(); source.close(); console.log('SQLite isolated drill: ' + JSON.stringify(result));
})().catch(e => { console.error(e); process.exitCode = 1; });
