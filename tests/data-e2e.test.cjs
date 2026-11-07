// End-to-end: the data-intensive gates against a RUNNING data-keeping service (tests/fixtures/data/app,
// a POS on node:sqlite). Two server processes share one database file so the concurrency checks see
// real cross-process contention. Every gate's raw output is kept under <run>/evidence/data/, the rows
// go into build-results.tsv, and score-build.sh scores the ledger with --strict-evidence. The claim
// this test makes: `PASS_RATE: 1.00`, `data_gate=PASS`, `DATA_COVERAGE: 1.00` from real measurements.
//   node tests/data-e2e.test.cjs <repo-root>      (KEEP_RUN=1 keeps the run directory)
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const repo = path.resolve(process.argv[2] || '.');
const APP = path.join(repo, 'tests/fixtures/data/app'), SEAM = path.join(repo, 'scripts/data-score.cjs'), LOAD = path.join(repo, 'scripts/data-load.cjs');
const bash = process.platform === 'win32' && fs.existsSync('C:/Program Files/Git/bin/bash.exe') ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const run = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-data-e2e-')));
const EV = path.join(run, 'evidence', 'data'); fs.mkdirSync(EV, { recursive: true });
const DB = path.join(run, 'pos.sqlite');
const queue = [], test = (name, f) => queue.push([name, f]);
const rows = [];                                                                 // ledger rows: [dimension, id, weight, status, evidence, traces]
const evidence = (name, text) => { fs.writeFileSync(path.join(EV, name), text); return 'evidence/data/' + name; };
const row = (dim, id, weight, ok, ev, traces) => rows.push([dim, id, weight, ok ? 'pass' : 'fail', ev, traces]);
const seam = (...args) => { const r = cp.spawnSync(process.execPath, [SEAM, ...args], { encoding: 'utf8', cwd: run }); return { code: r.status, out: r.stdout.trim(), err: r.stderr, all: r.stdout + r.stderr }; };
const spawnP = (args, opts = {}) => new Promise(resolve => { const c = cp.spawn(process.execPath, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = ''; c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { err += d; }); c.on('close', code => resolve({ code, out, err })); });
const sqlite = f => new DatabaseSync(f);                                          // read-write handle; WAL readers need the -shm writable anyway
const snapshot = dest => { const db = sqlite(DB); db.exec(`VACUUM INTO '${dest.replace(/\\/g, '/').replace(/'/g, "''")}'`); db.close(); return dest; }; // a consistent copy under WAL, concurrent writers allowed
const column = (tsv, name) => { const [h, ...b] = tsv.trim().split('\n').map(l => l.split('\t')); const i = h.indexOf(name); return i < 0 ? [] : b.map(r => r[i]); };

// --- the service ------------------------------------------------------------------------------
const servers = [];
function boot(dbFile = DB) {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(process.execPath, [path.join(APP, 'server.cjs')], { env: { ...process.env, PORT: '0', DB_FILE: dbFile, MIGRATIONS_DIR: path.join(APP, 'migrations') }, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '', err = '';
    child.stdout.on('data', d => { buf += d; const m = /listening (\d+)/.exec(buf); if (m) { const s = { child, url: `http://127.0.0.1:${m[1]}` }; servers.push(s); resolve(s); } });
    child.stderr.on('data', d => { err += d; });
    child.on('exit', code => { if (!/listening/.test(buf)) reject(new Error(`server exited ${code}: ${err}`)); });
    setTimeout(() => reject(new Error('server did not start: ' + err)), 15000).unref();
  });
}
function kill(s) {                                                                // by pid, never by name; SIGKILL-equivalent on Windows
  if (s.dead) return; s.dead = true;
  if (process.platform === 'win32') cp.spawnSync('taskkill', ['/PID', String(s.child.pid), '/T', '/F'], { stdio: 'ignore' }); else s.child.kill('SIGKILL');
}
const api = async (s, method, p, body, headers = {}) => { const r = await fetch(s.url + p, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); const text = await r.text(); let json = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; } return { status: r.status, body: json }; };
const exportTsv = async (s, table, name) => { const r = await fetch(`${s.url}/admin/export/${table}`); assert.equal(r.status, 200, `export ${table}`); const f = path.join(EV, name); fs.writeFileSync(f, await r.text()); return f; };
const plan = (dbFile, sql, params = []) => { const db = sqlite(dbFile); try { const r = db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...params); return 'QUERY PLAN\n' + r.map((x, i) => (i === r.length - 1 ? '`--' : '|--') + x.detail).join('\n') + '\n'; } finally { db.close(); } };

let A, B, ids = {};
test('boot: two processes share one database; migrations applied from a clean directory', async () => {
  A = await boot(); B = await boot();
  assert.equal((await api(A, 'GET', '/healthz')).status, 200);
  const seed = await api(A, 'POST', '/admin/seed', { products: [{ barcode: '4800000000011', name: 'Rice 5kg', price_cents: 28000, stock: 500 }, { barcode: '4800000000028', name: 'Cooking oil 1L', price_cents: 9500, stock: 500 }, { barcode: '4800000000035', name: 'Sardines', price_cents: 2400, stock: 5 }], customers: [{ name: 'Maria Santos', phone: '+63 917 555 0101' }, { name: 'Jose Cruz', phone: '+63 917 555 0202' }] });
  assert.equal(seed.status, 201); ids = seed.body;
  const db = sqlite(DB); const applied = db.prepare('SELECT name FROM schema_migrations ORDER BY name').all().map(r => r.name); db.close();
  assert.deepEqual(applied, ['001_init.sql', '002_expand_channel.sql', '003_contract_legacy_note.sql']);
  row('functional', 'boots-and-migrates', 1, true, evidence('boot.txt', `two server processes on ${DB}; schema_migrations: ${applied.join(', ')}\n`), 'FR-2');
});

test('data:workload + data:slo — DATA_LINT VALID; an open arrival-rate load at the pinned peak (40 reads/s + 10 writes/s) inside the SLO', async () => {
  const lint = seam('lint', path.join(APP, 'DATA.md')); evidence('lint.txt', lint.all);
  assert.equal(lint.out, 'DATA_LINT: VALID groups=8/8 na=0', lint.err);
  const warm = await api(A, 'POST', '/sales', { lines: [{ product_id: ids.products[1], qty: 1 }] }, { 'Idempotency-Key': 'warm-up' }); assert.equal(warm.status, 201);
  const [writes, reads] = await Promise.all([                                    // both streams at once, each against a different process
    spawnP([LOAD, 'run', `${B.url}/sales`, '--rate', '10', '--duration', '8s', '--method', 'POST', '--header', 'Idempotency-Key: load-{{i}}', '--body', `{"lines":[{"product_id":${ids.products[0]},"qty":1}]}`, '--out', path.join(EV, 'samples-writes.tsv')]),
    spawnP([LOAD, 'run', `${A.url}/sales/${warm.body.id}`, '--rate', '40', '--duration', '8s', '--out', path.join(EV, 'samples-reads.tsv')]),
  ]);
  evidence('load.txt', writes.out + writes.err + reads.out + reads.err);
  assert.equal(writes.code, 0, writes.err); assert.equal(reads.code, 0, reads.err);
  assert.match(writes.out, /^LOAD: open rate=10\/s n=80 dropped=0 /); assert.match(reads.out, /^LOAD: open rate=40\/s n=320 dropped=0 /);
  fs.writeFileSync(path.join(EV, 'samples.tsv'), fs.readFileSync(path.join(EV, 'samples-reads.tsv'), 'utf8') + fs.readFileSync(path.join(EV, 'samples-writes.tsv'), 'utf8'));
  const slo = seam('slo', path.join(EV, 'samples.tsv'), '--data', path.join(APP, 'DATA.md')); evidence('slo.txt', slo.all);
  assert.equal(slo.code, 0, slo.all); assert.match(slo.out, /^DATA_SLO: PASS p50=[\d.]+ p95=[\d.]+ p99=[\d.]+ n=400 errors=0\.0000 dropped=0 model=open source=samples$/);
  const closed = seam('slo', path.join(EV, 'samples.tsv'), '--data', path.join(APP, 'DATA.md'), '--model', 'closed');
  assert.equal(closed.code, 1, 'the same samples declared closed-loop are refused');
  row('data', 'data-workload-pinned', 1, true, 'evidence/data/load.txt', 'NFR-1,data:workload');
  row('data', 'data-slo-open-load', 2, true, 'evidence/data/slo.txt', 'NFR-2,data:slo');
});

test('data:model — real EXPLAIN QUERY PLAN output: the hot queries use their indexes; with an index dropped the gate fails', () => {
  const plans = [
    '-- GET /sales?day= (sales_sold_at_idx)\n' + plan(DB, 'SELECT id FROM sales WHERE store_id = ? AND sold_at >= ? AND sold_at < ? ORDER BY sold_at', [1, '2026-11-07', '2026-11-08']),
    '-- GET /sales/:id lines (sale_lines_sale_idx)\n' + plan(DB, 'SELECT product_id, qty FROM sale_lines WHERE sale_id = ?', [1]),
    '-- outbox drain (outbox_pending_idx)\n' + plan(DB, 'SELECT id, topic FROM outbox WHERE consumed_at IS NULL ORDER BY id'),
    '-- product by barcode (UNIQUE index)\n' + plan(DB, 'SELECT id FROM products WHERE barcode = ?', ['x']),
  ].join('\n');
  fs.writeFileSync(path.join(EV, 'plans.txt'), plans);
  const ok = seam('explain', path.join(EV, 'plans.txt')); evidence('explain.txt', ok.all);
  assert.equal(ok.out, 'DATA_INDEXES: PASS plans=4 seq_scans=0 max_seq_rows=1000', ok.all);
  const copy = snapshot(path.join(run, 'noindex.sqlite')); const db = sqlite(copy); db.exec('DROP INDEX sale_lines_sale_idx'); db.close();
  fs.writeFileSync(path.join(EV, 'plans-noindex.txt'), plan(copy, 'SELECT product_id, qty FROM sale_lines WHERE sale_id = ?', [1]));
  const bad = seam('explain', path.join(EV, 'plans-noindex.txt')); assert.equal(bad.code, 1, bad.all); assert.match(bad.err, /SCAN sale_lines/);
  row('data', 'data-hot-paths-indexed', 1, true, 'evidence/data/explain.txt', 'NFR-3,data:model');
});

test('data:integrity — no lost update across two processes, unique receipts, idempotent retries, a golden total, a durable acknowledgement', async () => {
  const sardines = ids.products[2];                                                // stock 5
  const attempts = await Promise.all(Array.from({ length: 20 }, (_, i) => api(i % 2 ? A : B, 'POST', '/sales', { lines: [{ product_id: sardines, qty: 1 }] }, { 'Idempotency-Key': `race-${i}` })));
  const sold = attempts.filter(r => r.status === 201).length, refused = attempts.filter(r => r.status === 409).length;
  const db = sqlite(DB); const stock = db.prepare('SELECT stock_on_hand FROM products WHERE id = ?').get(sardines).stock_on_hand;
  const dupes = db.prepare('SELECT receipt_no, COUNT(*) c FROM sales GROUP BY store_id, receipt_no HAVING c > 1').all(); db.close();
  evidence('concurrency.txt', `20 concurrent checkouts of the last 5 units across 2 processes: 201=${sold} 409=${refused} other=${20 - sold - refused} stock_after=${stock} duplicate_receipts=${dupes.length}\n`);
  assert.equal(sold, 5); assert.equal(refused, 15); assert.equal(stock, 0); assert.deepEqual(dupes, []);
  row('data', 'data-no-lost-update', 2, true, 'evidence/data/concurrency.txt', 'NFR-4,data:integrity');
  row('functional', 'sale-recorded', 1, true, 'evidence/data/concurrency.txt', 'FR-1');

  const k = 'retry-' + Date.now(), body = { customer_id: ids.customers[0], lines: [{ product_id: ids.products[1], qty: 2 }] };
  const first = await api(A, 'POST', '/sales', body, { 'Idempotency-Key': k }), again = await api(B, 'POST', '/sales', body, { 'Idempotency-Key': k });
  const burst = await Promise.all(Array.from({ length: 6 }, (_, i) => api(i % 2 ? A : B, 'POST', '/sales', body, { 'Idempotency-Key': k + '-burst' })));
  const db2 = sqlite(DB); const perKey = db2.prepare('SELECT idempotency_key, COUNT(*) c FROM sales WHERE idempotency_key IN (?, ?) GROUP BY idempotency_key').all(k, k + '-burst'); db2.close();
  evidence('idempotency.txt', `first=${first.status} replay=${again.status} same_id=${first.body.id === again.body.id} total_cents=${first.body.total_cents} burst_statuses=${burst.map(r => r.status).join(',')} rows_per_key=${perKey.map(r => r.c).join(',')}\n`);
  assert.equal(first.status, 201); assert.equal(again.status, 200); assert.equal(first.body.id, again.body.id); assert.deepEqual(perKey.map(r => r.c), [1, 1]);
  assert.equal(burst.filter(r => r.status === 201).length, 1); assert.equal(burst.filter(r => r.status === 200).length, 5);
  assert.equal(first.body.total_cents, 19000, 'golden total: 2 x 9500');
  row('data', 'data-idempotent-retry', 2, true, 'evidence/data/idempotency.txt', 'NFR-4,data:integrity');
  row('logic', 'golden-total', 2, true, 'evidence/data/idempotency.txt', 'FR-1');

  const ack = await api(B, 'POST', '/sales', { lines: [{ product_id: ids.products[0], qty: 1 }] }, { 'Idempotency-Key': 'durable-' + Date.now() });
  assert.equal(ack.status, 201); kill(B); await new Promise(r => setTimeout(r, 300));
  B = await boot(); const back = await api(B, 'GET', `/sales/${ack.body.id}`);
  evidence('durability.txt', `sale ${ack.body.id} acknowledged 201, then its process was killed (taskkill /F or SIGKILL) and a new one booted on the same file: GET -> ${back.status} total_cents=${back.body.total_cents} lines=${(back.body.lines || []).length}\n`);
  assert.equal(back.status, 200); assert.equal(back.body.total_cents, ack.body.total_cents); assert.equal(back.body.lines.length, 1);
  row('data', 'data-durable-ack', 2, true, 'evidence/data/durability.txt', 'NFR-5,data:integrity');
  row('functional', 'sale-readable', 1, true, 'evidence/data/durability.txt', 'FR-2');
});

test('data:evolution — the real migrations directory lints clean under the sqlite dialect', () => {
  const r = seam('migrations', path.join(APP, 'migrations'), '--dialect', 'sqlite'); evidence('migrations.txt', r.all);
  assert.equal(r.out, 'MIGRATION_SAFETY: PASS files=3 statements=13 unsafe=0 annotated=1 dialect=sqlite', r.all);
  row('data', 'data-migrations-safe', 1, true, 'evidence/data/migrations.txt', 'NFR-6,data:evolution');
});

test('data:durability — the backup snapshot boots in a fresh directory and answers the recorded sales (restore drill)', async () => {
  const t0 = Date.now(), dir = path.join(run, 'restore'); fs.mkdirSync(dir);
  const db = sqlite(DB); const expected = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(total_cents), 0) t FROM sales').get(); db.close();
  const copy = snapshot(path.join(dir, 'pos.sqlite'));
  const R = await boot(copy); const h = await api(R, 'GET', '/healthz'); const day = new Date().toISOString().slice(0, 10); const list = await api(R, 'GET', `/sales?day=${day}`);
  const db2 = sqlite(copy); const got = db2.prepare('SELECT COUNT(*) c, COALESCE(SUM(total_cents), 0) t FROM sales').get(); db2.close();
  const rto = (Date.now() - t0) / 1000; kill(R);
  evidence('restore.txt', `restore drill: VACUUM INTO ${copy}, booted a server on it; healthz ${h.status}; GET /sales?day=${day} -> ${list.body.length} sales; count ${got.c}/${expected.c} total ${got.t}/${expected.t}; rto ${rto.toFixed(2)} s of 300 s\n`);
  assert.equal(h.status, 200); assert.deepEqual(got, expected); assert.equal(list.body.length, expected.c); assert.ok(rto < 300);
  row('data', 'data-restore-drill', 2, true, 'evidence/data/restore.txt', 'NFR-7,data:durability');
});

test('data:derived — the outbox consumer and the report job make the derived tables reconcile; a replay is idempotent; injected drift is caught', async () => {
  const drained = await api(A, 'POST', '/admin/outbox/drain'); assert.ok(drained.body.consumed >= 5, JSON.stringify(drained.body));
  const day = new Date().toISOString().slice(0, 10); assert.equal((await api(A, 'POST', `/admin/report/rebuild?day=${day}`)).status, 200);
  assert.ok((await api(B, 'GET', '/products?q=oil')).body.some(p => p.name === 'Cooking oil 1L'), 'search served from the derived table');
  let all = '';
  for (const [src, der, key] of [['products', 'product_search', 'id'], ['customers', 'customer_search', 'id'], ['sales-by-day', 'daily_sales_report', 'day']]) {
    const r = seam('reconcile', await exportTsv(A, src, `${src}.tsv`), await exportTsv(B, der, `${der}.tsv`), '--key', key); all += `${src} vs ${der}: ${r.out}\n${r.err}`;
    assert.equal(r.code, 0, r.all); assert.match(r.out, /^DATA_RECONCILE: PASS /);
  }
  evidence('reconcile.txt', all);
  await api(B, 'POST', '/admin/outbox/rewind'); await api(B, 'POST', '/admin/outbox/drain');
  const replay = seam('reconcile', path.join(EV, 'products.tsv'), await exportTsv(A, 'product_search', 'product_search-replayed.tsv'), '--key', 'id'); assert.equal(replay.code, 0, replay.all);
  const db = sqlite(DB); db.exec('UPDATE product_search SET price_cents = price_cents + 100 WHERE product_id = 1'); db.close();   // what a dual write leaves behind
  const drift = seam('reconcile', path.join(EV, 'products.tsv'), await exportTsv(A, 'product_search', 'product_search-drift.tsv'), '--key', 'id');
  assert.equal(drift.code, 1, drift.all); assert.match(drift.out, /mismatched=1$/);
  const db2 = sqlite(DB); db2.exec('UPDATE product_search SET price_cents = price_cents - 100 WHERE product_id = 1'); db2.close();
  row('data', 'data-derived-reconciles', 2, true, 'evidence/data/reconcile.txt', 'NFR-8,data:derived');
  row('functional', 'search-and-report-served', 1, true, 'evidence/data/reconcile.txt', 'FR-3');
});

test('data:retention — erasing a customer leaves no reference in any export, derived copies included', async () => {
  const id = String(ids.customers[0]), phone = '+63 917 555 0101';
  const tables = ['customers', 'customer_search', 'sales', 'products', 'product_search', 'daily_sales_report'];
  const dump = async (tag, s) => { const o = {}; for (const t of tables) o[t] = fs.readFileSync(await exportTsv(s, t, `${tag}-${t}.tsv`), 'utf8'); return o; };
  const before = await dump('before', A);
  assert.ok(column(before.customers, 'id').includes(id) && column(before.customer_search, 'phone').includes(phone) && column(before.sales, 'customer_id').includes(id), 'the subject is present everywhere before erasure');
  const del = await api(B, 'DELETE', `/customers/${id}`); assert.equal(del.status, 204);
  await api(A, 'POST', '/admin/outbox/drain');
  const after = await dump('after', B);
  const residual = tables.filter(t => after[t].includes(phone) || column(after[t], 'customer_id').includes(id) || (/^customer/.test(t) && column(after[t], 'id').includes(id)));
  evidence('erasure.txt', `DELETE /customers/${id} -> ${del.status}; after the consumer ran, residual references (phone or id) in ${tables.join(', ')}: ${residual.length ? residual.join(',') : 'none'}\n`);
  assert.deepEqual(residual, []);
  row('data', 'data-erasure-complete', 2, true, 'evidence/data/erasure.txt', 'NFR-9,data:retention');
  row('functional', 'customer-erasable', 1, true, 'evidence/data/erasure.txt', 'FR-4');
});

test('the ledger scores from the evidence above: PASS_RATE 1.00, data_gate=PASS, REQ/DATA_COVERAGE 1.00, spec VALID under REQUIRE_DATA', () => {
  const tsv = ['# metric_direction: higher_is_better', 'spec\tdimension\tassertion\tweight\tstatus\tdetail\ttraces',
    ...rows.map(([dim, id, w, st, ev, tr]) => `pos\t${dim}\t${id}\t${w}\t${st}\tevidence:${ev}\t${tr}`)].join('\n') + '\n';
  fs.writeFileSync(path.join(run, 'build-results.tsv'), tsv);
  const posix = p => p.replace(/\\/g, '/');                                  // Git Bash takes C:/… ; a backslash inside an awk string is an escape
  const sh = (script, ...a) => cp.spawnSync(bash, [path.join(repo, 'scripts', script), ...a].map(posix), { encoding: 'utf8', cwd: run, env: { ...process.env, REQUIRE_DATA: '1' } });
  const pr = sh('score-build.sh', 'pass-rate', '--strict-evidence', path.join(run, 'build-results.tsv'));
  assert.equal(pr.stdout.trim(), 'PASS_RATE: 1.00', pr.stdout + pr.stderr); assert.match(pr.stderr, /data_gate=PASS/); assert.match(pr.stderr, /logic_gate=PASS/); assert.match(pr.stderr, /evidence_violations=0/);
  const cov = sh('score-build.sh', 'coverage', path.join(run, 'build-results.tsv'), path.join(APP, 'requirements.md'), path.join(APP, 'DATA.md'));
  assert.match(cov.stdout, /REQ_COVERAGE: 1\.00/, cov.stdout + cov.stderr); assert.match(cov.stdout, /DATA_COVERAGE: 1\.00/, cov.stdout + cov.stderr); assert.match(cov.stderr, /data_total=8 data_covered=8/);
  const rq = sh('score-requirements.sh', 'validate', path.join(APP, 'pos.spec.yaml'));
  assert.match(rq.stdout, /VALIDATION: VALID/, rq.stdout + rq.stderr); assert.match(rq.stdout, /data=present\(groups_traced=8\)/);
  fs.writeFileSync(path.join(run, 'SUMMARY.txt'), `${pr.stdout}${pr.stderr}\n${cov.stdout}${cov.stderr}\n${rq.stdout}`);
  console.log(`  ${pr.stdout.trim()} | ${pr.stderr.trim().split('\n').filter(l => /gate=/.test(l)).join(' ')}`);
  console.log(`  ${cov.stdout.trim().split('\n').join(' | ')}`);
});

(async () => {
  let n = 0;
  for (const [name, f] of queue) { try { await f(); n++; console.log(`PASS: ${name}`); } catch (e) { console.log(`FAIL: ${name}\n  ${String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')}`); } }
  for (const s of servers) kill(s);
  if (process.env.KEEP_RUN === '1') console.log('run dir kept: ' + run); else { try { fs.rmSync(run, { recursive: true, force: true }); } catch { /* a killed process may still hold the file for a moment */ } }
  console.log(`${n}/${queue.length} data e2e checks passed`);
  process.exit(n === queue.length ? 0 : 1);
})();
