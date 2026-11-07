// data-score.cjs: DATA.md lint (the eight decisions), DATA_COVERAGE, the SLO verdict over raw
// samples and k6 summaries (open-model rule), reconcile, the expand/contract migration lint and
// the EXPLAIN scanner. Fixtures: tests/fixtures/data (the sari-sari POS data architecture).
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const repo = path.resolve(process.argv[2] || '.');
const seam = path.join(repo, 'scripts/data-score.cjs'), ds = require(seam);
const FIX = path.join(repo, 'tests/fixtures/data');
const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-data-')));
let n = 0, total = 0;
const queue = [], test = (name, f) => queue.push([name, f]);
const put = (rel, data) => { const f = path.join(scratch, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
const run = (...args) => { const r = cp.spawnSync(process.execPath, [seam, ...args], { encoding: 'utf8', cwd: repo }); return { code: r.status, out: r.stdout.trim(), err: r.stderr }; };
const VALID = fs.readFileSync(path.join(FIX, 'DATA.md'), 'utf8').replace(/\r\n/g, '\n'); // a CRLF checkout must not break the mutation anchors
const mutate = (from, to) => { assert.ok(VALID.includes(from), 'fixture must contain ' + from); return VALID.replace(from, to); };
const errsOf = md => ds.lint(md).errs;

// --- lint ----------------------------------------------------------------------
test('lint: the POS fixture is VALID with all eight groups', () => {
  const r = ds.lint(VALID); assert.deepEqual(r.errs, []); assert.equal(r.groups, 8); assert.deepEqual(r.na, []);
  const c = run('lint', path.join(FIX, 'DATA.md')); assert.equal(c.code, 0, c.err); assert.equal(c.out, 'DATA_LINT: VALID groups=8/8 na=0');
});
test('lint: the careless fixture is INVALID and names every missing decision', () => {
  const c = run('lint', path.join(FIX, 'DATA-invalid.md')); assert.equal(c.code, 1);
  assert.equal(c.out, 'DATA_LINT: INVALID groups=8/8 na=0');
  for (const s of ['load_model: closed', 'averages hide the tail', 'dual-write', 'sla_days: 90', 'covers_derived', 'Systems of record', 'Trade-offs', 'integrity.transactions: missing']) assert.match(c.err, new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'should report ' + s);
});
test('lint: no frontmatter is INVALID', () => { assert.match(errsOf('# just prose\n\n## Systems of record\n## Trade-offs\n')[0], /no YAML frontmatter/); });
test('lint: a missing group is an error; { na: reason } is accepted except for workload and slo', () => {
  assert.match(errsOf(VALID.replace(/^derived:[\s\S]*?(?=^retention:)/m, '')).join('\n'), /derived: missing/);
  const na = ds.lint(VALID.replace(/^derived:[\s\S]*?(?=^retention:)/m, 'derived:\n  na: "no caches, indexes or exports beyond the primary tables"\n'));
  assert.deepEqual(na.errs, []); assert.deepEqual(na.na, ['derived']);
  assert.match(errsOf(VALID.replace(/^derived:[\s\S]*?(?=^retention:)/m, 'derived:\n  na: short\n')).join('\n'), /na needs a reason/);
  assert.match(errsOf(VALID.replace(/^slo:[\s\S]*?(?=^model:)/m, 'slo:\n  na: "we do not care about speed at all"\n')).join('\n'), /slo: cannot be n\/a/);
});
test('lint: workload needs a throughput, concurrency, volume and growth', () => {
  assert.match(errsOf(mutate('  reads_per_s: 40\n  writes_per_s: 6\n', '')).join('\n'), /reads_per_s and\/or writes_per_s/);
  assert.match(errsOf(mutate('  dataset_gb: 2\n', '')).join('\n'), /dataset_gb/);
  assert.match(errsOf(mutate('  growth: "+1.5 GB/yr (1 store, 600 sales/day); plan to 10 stores, not 1000"\n', '')).join('\n'), /growth/);
});
test('lint: slo percentiles must be present, ordered, never means; the load model must be open', () => {
  assert.match(errsOf(mutate('{ p50: 120, p95: 400, p99: 900 }', '{ p50: 120, p95: 400 }')).join('\n'), /p99: missing/);
  assert.match(errsOf(mutate('{ p50: 120, p95: 400, p99: 900 }', '{ p50: 500, p95: 400, p99: 900 }')).join('\n'), /non-decreasing/);
  assert.match(errsOf(mutate('{ p50: 120, p95: 400, p99: 900 }', '{ p50: 120, p95: 400, p99: 900, mean: 130 }')).join('\n'), /averages hide the tail/);
  assert.match(errsOf(mutate('load_model: open', 'load_model: closed')).join('\n'), /coordinated omission/);
  assert.match(errsOf(mutate('  error_rate_max: 0.001\n', '')).join('\n'), /error_rate_max/);
  assert.match(errsOf(mutate('  samples_min: 1000\n', '  samples_min: 10\n')).join('\n'), /samples_min: 10 outside/);
});
test('lint: model needs a known data model, a store and indexes that name their access pattern', () => {
  assert.match(errsOf(mutate('primary: relational', 'primary: blockchain')).join('\n'), /model\.primary/);
  assert.match(errsOf(mutate('      query: "SC-3 end-of-day report: sales of one store for one day"\n', '')).join('\n'), /indexes\.sales_by_store_day: needs columns and the query/);
});
test('lint: integrity needs an isolation level, protected transactions and an idempotency key', () => {
  assert.match(errsOf(mutate('isolation: read-committed', 'isolation: eventual')).join('\n'), /integrity\.isolation/);
  assert.match(errsOf(mutate('      technique: "compare-and-set on sale.status (open -> voided)"\n', '')).join('\n'), /transactions\.void_sale: needs invariant and technique/);
  assert.match(errsOf(mutate('    key: "Idempotency-Key header on POST /sales, stored with the sale for 24h"\n', '    scope: sales\n')).join('\n'), /idempotency\.key/);
});
test('lint: evolution and durability enums and the replica/backup numbers', () => {
  assert.match(errsOf(mutate('migrations: expand-contract', 'migrations: yolo')).join('\n'), /evolution\.migrations/);
  assert.match(errsOf(mutate('compatibility: both', 'compatibility: none')).join('\n'), /compatibility: none needs evolution\.reason/);
  assert.match(errsOf(mutate('replication: single-leader-async', 'replication: magic')).join('\n'), /durability\.replication/);
  assert.match(errsOf(mutate('  lag_budget_s: 5\n', '')).join('\n'), /lag_budget_s/);
  assert.deepEqual(errsOf(mutate('replication: single-leader-async\n  replicas: 1\n  lag_budget_s: 5\n  replica_reads: read-your-writes\n', 'replication: none\n')), [], 'no replica means no lag budget needed');
  assert.match(errsOf(mutate('    rpo_s: 300\n', '')).join('\n'), /backup\.rpo_s/);
});
test('lint: derived data names its source, a change-stream mechanism, freshness and a reconcile check', () => {
  assert.match(errsOf(mutate('mechanism: outbox', 'mechanism: dual-write')).join('\n'), /dual-write/);
  assert.match(errsOf(mutate('mechanism: outbox', 'mechanism: cron')).join('\n'), /derived\.product_search\.mechanism/);
  assert.match(errsOf(mutate('    reconcile: "npm run reconcile:search exports products and the index by id and diffs name/price"\n', '')).join('\n'), /product_search\.reconcile/);
});
test('lint: personal data needs purpose + retention and a deletion path within 30 days that covers derived copies', () => {
  assert.match(errsOf(mutate('sla_days: 30', 'sla_days: 45')).join('\n'), /sla_days: 45 outside/);
  assert.match(errsOf(mutate('covers_derived: true', 'covers_derived: false')).join('\n'), /covers_derived/);
  assert.match(errsOf(mutate('      retention: "2 years after the last sale"\n', '')).join('\n'), /customer_phone: needs purpose and retention/);
  assert.deepEqual(errsOf(VALID.replace(/^retention:[\s\S]*?(?=^---\n\n# Data)/m, 'retention:\n  personal_data: none\n')), [], 'personal_data: none needs no deletion block');
});
test('lint: flow maps keep commas inside quotes and nested lists (the protocol template form)', () => {
  const flow = VALID.replace(/^derived:[\s\S]*?(?=^retention:)/m, 'derived: { na: "no caches, indexes or exports beyond the primary tables" }\n')
    .replace(/    sales_by_store_day:\n      columns: \[store_id, sold_at\]\n      query: "SC-3 end-of-day report: sales of one store for one day"\n/, '    sales_by_store_day: { columns: [store_id, sold_at], query: "SC-3 end-of-day report, one store, one day" }\n');
  const r = ds.lint(flow); assert.deepEqual(r.errs, []); assert.deepEqual(r.na, ['derived']);
  assert.equal(ds.parseFrontmatter(flow).model.indexes.sales_by_store_day.columns, '[store_id, sold_at]');
  assert.equal(ds.parseFrontmatter(flow).derived.na, 'no caches, indexes or exports beyond the primary tables');
});
test('lint: the prose must name the systems of record and the trade-offs', () => {
  assert.match(errsOf(VALID.replace('## Systems of record and derived data', '## Tables')).join('\n'), /Systems of record/);
  assert.match(errsOf(VALID.replace('## Trade-offs', '## Notes')).join('\n'), /Trade-offs/);
});

// --- coverage ----------------------------------------------------------------------
test('coverage: every applicable group traced by a data row => 1.00; a missing group and an orphan are reported', () => {
  const tsv = fs.readFileSync(path.join(FIX, 'results-data.tsv'), 'utf8');
  const c = ds.coverage(VALID, tsv); assert.equal(c.ratio, 1); assert.deepEqual(c.missing, []); assert.deepEqual(c.orphans, []);
  const r = run('coverage', path.join(FIX, 'DATA.md'), path.join(FIX, 'results-data.tsv')); assert.equal(r.code, 0); assert.equal(r.out, 'DATA_COVERAGE: 1.00'); assert.match(r.err, /data_total=8 data_covered=8/);
  const c2 = ds.coverage(VALID, tsv.split('\n').filter(l => !l.includes('data:retention')).join('\n')); assert.equal(Math.floor(c2.ratio * 100), 87); assert.deepEqual(c2.missing, ['retention']);
  const c3 = ds.coverage(VALID.replace(/^derived:[\s\S]*?(?=^retention:)/m, 'derived:\n  na: "no caches, indexes or exports beyond the primary tables"\n'), tsv);
  assert.deepEqual(c3.orphans, ['data:derived'], 'a trace to an n/a group is an orphan'); assert.equal(c3.required.length, 7);
  const c4 = ds.coverage(VALID, tsv.replace('pos\tdata\tslo-p99-under-open-load', 'pos\thardening\tslo-p99-under-open-load'));
  assert.deepEqual(c4.missing, ['slo'], 'only `data` rows count toward data coverage');
  const c5 = ds.coverage(VALID.replace('load_model: open', 'load_model: closed'), tsv);
  assert.equal(c5.ratio, 1); assert.equal(c5.lintErrors, 1, 'coverage reports the record\'s lint errors');
  const bad = run('coverage', put('bad.md', VALID.replace('load_model: open', 'load_model: closed')), path.join(FIX, 'results-data.tsv'));
  assert.equal(bad.code, 1); assert.equal(bad.out, 'DATA_COVERAGE: 1.00'); assert.match(bad.err, /lint_errors=1/); assert.match(bad.err, /invalid record does not count/);
});

// --- slo ----------------------------------------------------------------------
test('slo: nearest-rank percentiles over raw samples', () => {
  const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(ds.percentile(sorted, 0.5), 50); assert.equal(ds.percentile(sorted, 0.95), 95); assert.equal(ds.percentile(sorted, 0.99), 99); assert.ok(Number.isNaN(ds.percentile([], 0.5)));
});
test('slo: raw samples pass against DATA.md thresholds only with --model open', () => {
  const lines = []; for (let i = 0; i < 1200; i++) lines.push(`${(30 + (i % 100)).toFixed(1)}\t${i % 1500 === 0 ? 'err' : 'ok'}`);
  const f = put('samples.tsv', lines.join('\n') + '\n');
  const unknown = run('slo', f, '--data', path.join(FIX, 'DATA.md')); assert.equal(unknown.code, 1); assert.match(unknown.err, /load model unknown/);
  const open = run('slo', f, '--data', path.join(FIX, 'DATA.md'), '--model', 'open'); assert.equal(open.code, 0, open.err);
  assert.match(open.out, /^DATA_SLO: PASS p50=\d+(\.\d+)? p95=\d+(\.\d+)? p99=\d+(\.\d+)? n=1200 errors=0\.0008 dropped=0 model=open source=samples$/);
  const closed = run('slo', f, '--data', path.join(FIX, 'DATA.md'), '--model', 'closed'); assert.equal(closed.code, 1); assert.match(closed.err, /coordinated omission/);
  const tight = run('slo', f, '--p50', '60', '--p95', '100', '--p99', '300', '--model', 'open'); assert.equal(tight.code, 1); assert.match(tight.err, /p95 \d+(\.\d+)? ms > 100 ms/);
  const few = run('slo', put('few.txt', '10\n20\n30\n'), '--p50', '100', '--p95', '200', '--p99', '300', '--model', 'open'); assert.equal(few.code, 1); assert.match(few.err, /n=3 < samples_min 300/);
  const json = run('slo', put('samples.json', JSON.stringify(Array.from({ length: 400 }, (_, i) => ({ ms: 20 + (i % 50), ok: true })))), '--p50', '100', '--p95', '200', '--p99', '300', '--errors', '0.01', '--model', 'open'); assert.equal(json.code, 0, json.err);
  const noerr = run('slo', f, '--p50', '200', '--p95', '400', '--p99', '900', '--model', 'open'); assert.equal(noerr.code, 1); assert.match(noerr.err, /error-rate threshold missing/, 'an error threshold is as mandatory as the percentiles');
  const nanmin = run('slo', put('few2.txt', '10\n20\n30\n'), '--p50', '100', '--p95', '200', '--p99', '300', '--errors', '0.01', '--model', 'open', '--min-samples', 'abc'); assert.equal(nanmin.code, 1); assert.match(nanmin.err, /keeping 300/); assert.match(nanmin.err, /n=3 < samples_min 300/);
  const status = ds.parseSamples('12\t200\n15\t500\n18\t404\n'); assert.equal(status.errors, 2 / 3, 'HTTP status codes >= 400 in the second column count as errors');
  const cat = ds.parseSamples('# load_model: open\n# dropped: 2\nms\tstatus\n10\t200\n# load_model: open\n# dropped: 3\n12\t201\n9\t0\n');
  assert.deepEqual([cat.model, cat.dropped, cat.n, cat.errors], ['open', 5, 3, 1 / 3], 'concatenated data-load runs: the model is read in-band, drops sum, column headers skip, status 0 (no response) is an error');
  assert.equal(ds.parseSamples('# load_model: open\n5\n# load_model: closed\n6\n').model, 'closed', 'one closed-loop stream makes the whole file closed');
  const legacy = ds.parseSamples(JSON.stringify({ metrics: { http_req_duration: { med: 90, 'p(95)': 300, 'p(99)': 650 }, http_reqs: { count: 2000, rate: 33 }, http_req_failed: { value: 0.001, passes: 2, fails: 1998 } } }));
  assert.equal(legacy.kind, 'k6'); assert.equal(legacy.p99, 650); assert.equal(legacy.n, 2000); assert.equal(legacy.errors, 0.001); assert.equal(legacy.model, 'unknown', 'the legacy --summary-export shape parses; its model must be declared');
  assert.equal(Number.isFinite(ds.percentile([1, 2, 3], 0.5)) && ds.parseSamples('1\n2\n').p50, 1);
});
test('slo: k6 summaries — arrival-rate scenarios are open; closed executors and a missing p(99) fail; dropped iterations fail', () => {
  const ok = run('slo', path.join(FIX, 'k6-open-pass.json'), '--data', path.join(FIX, 'DATA.md')); assert.equal(ok.code, 0, ok.err);
  assert.equal(ok.out, 'DATA_SLO: PASS p50=98.40 p95=312.70 p99=702.30 n=4812 errors=0.0004 dropped=0 model=open source=k6');
  const closed = run('slo', path.join(FIX, 'k6-closed-fail.json'), '--data', path.join(FIX, 'DATA.md')); assert.equal(closed.code, 1); assert.match(closed.err, /closed load model/); assert.match(closed.err, /p99 unavailable/);
  const j = JSON.parse(fs.readFileSync(path.join(FIX, 'k6-open-pass.json'), 'utf8')); j.metrics.dropped_iterations.values.count = 17;
  const dropped = run('slo', put('k6-dropped.json', JSON.stringify(j)), '--data', path.join(FIX, 'DATA.md')); assert.equal(dropped.code, 1); assert.match(dropped.err, /dropped_iterations=17/);
  const m = ds.parseSamples(fs.readFileSync(path.join(FIX, 'k6-open-pass.json'), 'utf8')); assert.equal(m.kind, 'k6'); assert.equal(m.model, 'open'); assert.equal(m.n, 4812);
});

// --- reconcile ----------------------------------------------------------------------
test('reconcile: an index that mirrors its source passes; drift is counted as missing/extra/mismatched', () => {
  const ok = run('reconcile', path.join(FIX, 'reconcile/source.tsv'), path.join(FIX, 'reconcile/derived-ok.tsv'), '--key', 'id'); assert.equal(ok.code, 0, ok.err);
  assert.equal(ok.out, 'DATA_RECONCILE: PASS source=4 derived=4 missing=0 extra=0 mismatched=0'); assert.match(ok.err, /fields=name,price_cents/, 'the common non-key columns are compared; 2400.00 equals 2400');
  const bad = run('reconcile', path.join(FIX, 'reconcile/source.tsv'), path.join(FIX, 'reconcile/derived-drift.tsv'), '--key', 'id', '--fields', 'name,price_cents'); assert.equal(bad.code, 1);
  assert.equal(bad.out, 'DATA_RECONCILE: FAIL source=4 derived=4 missing=1 extra=1 mismatched=1'); assert.match(bad.err, /missing in derived: 4/); assert.match(bad.err, /extra in derived: 9/); assert.match(bad.err, /2\.price_cents: 9500 != 9900/);
  const dup = run('reconcile', put('dup.tsv', 'id\tv\n1\ta\n1\tb\n'), put('d.tsv', 'id\tv\n1\ta\n'), '--key', 'id'); assert.equal(dup.code, 2); assert.match(dup.err, /duplicate key 1/);
  const json = ds.reconcileRows([{ id: '1', total: '10.0' }], [{ id: '1', total: '10' }], 'id', []); assert.deepEqual(json.mismatched, []);
  const strict = ds.reconcileRows([{ id: '1', barcode: '0012345', big: '9007199254740993', t: '5s' }], [{ id: '1', barcode: '12345', big: '9007199254740992', t: '5' }], 'id', []);
  assert.equal(strict.mismatched.length, 3, 'leading zeros, ids above 2^53 and unit suffixes compare as text, never as numbers');
  const csv = run('reconcile', put('src.csv', 'id,name,price\n1,"Rice, 5kg",28000\n2,"Oil ""premium""",9500\n'), put('der.csv', 'id,name,price\n2,"Oil ""premium""",9500.00\n1,"Rice, 5kg",28000\n'), '--key', 'id');
  assert.equal(csv.code, 0, csv.err); assert.equal(csv.out, 'DATA_RECONCILE: PASS source=2 derived=2 missing=0 extra=0 mismatched=0');
  assert.deepEqual(ds.splitDelimited('a,"b,c","d""e",,f', ','), ['a', 'b,c', 'd"e', '', 'f']);
});

// --- migrations ----------------------------------------------------------------------
test('migrations: expand steps and an annotated contract step pass; careless DDL fails per rule', () => {
  const ok = run('migrations', path.join(FIX, 'migrations')); assert.equal(ok.code, 0, ok.err);
  assert.equal(ok.out, 'MIGRATION_SAFETY: PASS files=3 statements=11 unsafe=0 annotated=1 dialect=postgres'); assert.match(ok.err, /annotated .*003_contract_legacy_total\.sql \[drop-column\]/);
  const bad = run('migrations', path.join(FIX, 'migrations-unsafe')); assert.equal(bad.code, 1);
  assert.equal(bad.out, 'MIGRATION_SAFETY: FAIL files=1 statements=5 unsafe=5 annotated=0 dialect=postgres');
  for (const rule of ['rename', 'not-null-without-default', 'index-not-concurrent', 'change-type', 'drop-table']) assert.match(bad.err, new RegExp('UNSAFE .*\\[' + rule + '\\]'));
  const sqlite = run('migrations', path.join(FIX, 'migrations-unsafe'), '--dialect', 'sqlite'); assert.equal(sqlite.code, 1);
  assert.equal(sqlite.out, 'MIGRATION_SAFETY: FAIL files=1 statements=5 unsafe=4 annotated=0 dialect=sqlite', 'sqlite has no CONCURRENTLY; lock rules are postgres-only');
  const r = ds.scanMigrations([put('m/010_ok.sql', 'ALTER TABLE t ADD COLUMN c TEXT;\nALTER TABLE t ADD COLUMN d INTEGER NOT NULL DEFAULT 0;\nCREATE INDEX CONCURRENTLY t_c ON t (c);\nALTER TABLE t ADD CONSTRAINT t_ck CHECK (d >= 0) NOT VALID;\nALTER TABLE t DROP CONSTRAINT t_old;\n')]);
  assert.equal(r.unsafe, 0, JSON.stringify(r.findings)); assert.equal(r.statements, 5);
  const setnn = ds.scanMigrations([put('m/011_nn.sql', 'ALTER TABLE t ALTER COLUMN c SET NOT NULL;\n')]); assert.equal(setnn.findings[0].rule, 'set-not-null');
  const fk = ds.scanMigrations([put('m/012_fk.sql', 'ALTER TABLE t ADD CONSTRAINT t_fk FOREIGN KEY (u) REFERENCES u (id);\n')]); assert.equal(fk.findings[0].rule, 'constraint-not-valid');
  const prisma = ds.listSql([put('prisma/migrations/20261107_init/migration.sql', 'CREATE TABLE a (id INT);')]).length; assert.equal(prisma, 1, 'nested prisma migration dirs are found');
  const none = run('migrations', put('empty/readme.txt', 'no sql here')); assert.equal(none.code, 2);
  const rules = sql => ds.scanMigrations([put(`m/${Math.random().toString(36).slice(2)}.sql`, sql)]).findings.map(f => f.rule);
  assert.deepEqual(rules('ALTER TABLE t ADD CONSTRAINT t_nn CHECK (c IS NOT NULL) NOT VALID;'), [], 'the recommended safe path to NOT NULL is not flagged');
  assert.deepEqual(rules('ALTER TABLE t ADD COLUMN a INT NOT NULL, ADD COLUMN b INT DEFAULT 0;'), ['not-null-without-default'], 'actions are judged one by one');
  assert.deepEqual(rules('ALTER TABLE t ALTER COLUMN c DROP IDENTITY; ALTER TABLE t ALTER COLUMN c DROP DEFAULT; ALTER TABLE t RENAME CONSTRAINT a TO b;'), [], 'DROP IDENTITY/DEFAULT and RENAME CONSTRAINT are not column drops or renames');
  assert.deepEqual(rules('ALTER TABLE t DROP indexed_at;'), ['drop-column'], 'DROP without the COLUMN keyword is still a column drop');
  assert.deepEqual(rules('CREATE INDEX CONCURRENTLY_IDX ON t (c);'), ['index-not-concurrent']);
  assert.deepEqual(rules("INSERT INTO t VALUES ('a--b'); DROP TABLE x;"), ['drop-table'], 'a -- inside a string literal is not a comment');
  assert.deepEqual(rules("COMMENT ON TABLE t IS 'a; DROP TABLE x';"), [], 'a ; inside a string literal does not end the statement');
  assert.deepEqual(rules('CREATE FUNCTION f() RETURNS void AS $$ BEGIN TRUNCATE a; DROP TABLE b; END $$ LANGUAGE plpgsql;'), [], 'dollar-quoted bodies are opaque');
  assert.deepEqual(rules('ALTER TABLE t ADD CONSTRAINT u UNIQUE (a); DROP INDEX i;'), ['unique-not-concurrent', 'drop-index-not-concurrent']);
  assert.deepEqual(rules('ALTER TABLE t ADD COLUMN id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL; DELETE FROM ONLY t RETURNING *; DELETE FROM t WHERE id = 1;'), ['delete-all']);
  const scoped = ds.scanMigrations([put('m/scoped.sql', '-- contract-step: release 1.3.0 stopped reading legacy_total\nALTER TABLE sales DROP COLUMN legacy_total;\nDROP TABLE customers;\n')]);
  assert.equal(scoped.annotated, 1); assert.equal(scoped.unsafe, 1, 'an annotation covers only the statement it precedes');
  assert.deepEqual(ds.scanMigrations([put('m/mysql.sql', 'ALTER TABLE t CHANGE a b INT;')], 'mysql').findings.map(f => f.rule), ['rename', 'change-type']);
  assert.deepEqual(ds.alterActions('ALTER TABLE ONLY S.T ADD CONSTRAINT c CHECK (a IN (1,2)) NOT VALID, DROP COLUMN z'), ['ADD CONSTRAINT c CHECK (a IN (1,2)) NOT VALID', 'DROP COLUMN z']);
});

// --- explain ----------------------------------------------------------------------
test('explain: index scans pass, a tiny lookup table may be scanned, large sequential scans fail (postgres json/text, sqlite text)', () => {
  const ok = run('explain', path.join(FIX, 'explain/plan-indexed.json')); assert.equal(ok.code, 0, ok.err); assert.equal(ok.out, 'DATA_INDEXES: PASS plans=3 seq_scans=0 max_seq_rows=1000');
  const bad = run('explain', path.join(FIX, 'explain/plan-seqscan.txt')); assert.equal(bad.code, 1);
  assert.equal(bad.out, 'DATA_INDEXES: FAIL plans=2 seq_scans=2 max_seq_rows=1000'); assert.match(bad.err, /Seq Scan on sales rows_read=56000/); assert.match(bad.err, /SCAN products \(sqlite full scan\)/);
  const strict = run('explain', path.join(FIX, 'explain/plan-indexed.json'), '--max-seq-rows', '10'); assert.equal(strict.code, 1); assert.match(strict.err, /Seq Scan on stores rows_read=12/);
  const s = ds.scanPlans('QUERY PLAN\n`--SEARCH products USING INDEX products_barcode_idx (barcode=?)\n'); assert.deepEqual(s.seq, []);
  // rows READ, not rows returned: the canonical missing-index plan returns 598 rows after filtering 55,402 away
  const filtered = ds.scanPlans('Aggregate  (cost=1890.00..1890.01 rows=1 width=8) (actual time=40.1..40.1 rows=1 loops=1)\n  ->  Seq Scan on sales  (cost=0.00..1750.00 rows=612 width=4) (actual time=0.02..38.9 rows=598 loops=1)\n        Filter: (store_id = 1)\n        Rows Removed by Filter: 55402\n');
  assert.deepEqual(filtered.seq, ['plan 1: Seq Scan on sales rows_read=56000']);
  const zeroActual = ds.scanPlans(JSON.stringify([{ Plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'sales', 'Plan Rows': 56000, 'Actual Rows': 0, 'Actual Loops': 1 } }]));
  assert.equal(zeroActual.seq.length, 1, 'Plan Rows is a lower bound even when Actual Rows is 0');
  const loops = ds.scanPlans(JSON.stringify([{ Plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'lines', 'Plan Rows': 5, 'Actual Rows': 5, 'Actual Loops': 400, 'Rows Removed by Filter': 1000 } }]));
  assert.equal(loops.seq.length, 1, 'per-loop averages are multiplied by the loop count');
  const nested = ds.scanPlans(JSON.stringify([[{ Plan: { 'Node Type': 'Index Scan', 'Plan Rows': 1 } }], [{ Plan: { 'Node Type': 'Index Scan', 'Plan Rows': 1 } }]]));
  assert.equal(nested.plans, 2, 'concatenated EXPLAIN JSON outputs are flattened');
  assert.deepEqual(ds.scanPlans('QUERY PLAN\n|--SCAN SUBQUERY 1\n`--SCAN CONSTANT ROW\n').seq, [], 'subqueries and constant rows are not table scans');
  assert.deepEqual(ds.scanPlans('0|0|0|SCAN TABLE products\n').seq, ['plan 1: SCAN products (sqlite full scan)'], 'the legacy SQLite plan format is read');
});

(async () => {
  for (const [name, f] of queue) { total++; try { await f(); n++; console.log(`PASS: ${name}`); } catch (e) { console.log(`FAIL: ${name}\n  ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')}`); } }
  fs.rmSync(scratch, { recursive: true, force: true });
  console.log(`${n}/${total} data-score checks passed`);
  process.exit(n === total ? 0 : 1);
})();
