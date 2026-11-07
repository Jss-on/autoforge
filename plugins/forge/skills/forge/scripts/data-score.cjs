#!/usr/bin/env node
/**
 * data-score.cjs — the data-architecture seam for /forge:requirements and /forge:build
 * (references/data-intensive-protocol.md — the DDIA 2nd-ed. decision procedure made mechanical).
 *
 *   lint      <DATA.md>                            → DATA_LINT: VALID|INVALID groups=N/8 na=K
 *   coverage  <DATA.md> <results.tsv>              → DATA_COVERAGE: N.NN   (every applicable group traced by ≥1 `data` row; lint must be VALID)
 *   slo       <samples|k6-summary.json> [--data DATA.md] [--p50 ms] [--p95 ms] [--p99 ms]
 *             [--errors 0.001] [--min-samples 300] [--model open|closed]
 *                                                  → DATA_SLO: PASS|FAIL p50= p95= p99= n= errors= dropped= model=
 *   reconcile <source.tsv|.csv|.json> <derived…> --key <col> [--fields a,b]
 *                                                  → DATA_RECONCILE: PASS|FAIL source= derived= missing= extra= mismatched=
 *   migrations <dir|file.sql…> [--dialect postgres|mysql|sqlite]
 *                                                  → MIGRATION_SAFETY: PASS|FAIL files= statements= unsafe= annotated=
 *   explain   <plan.json|plan.txt…> [--max-seq-rows 1000]
 *                                                  → DATA_INDEXES: PASS|FAIL plans= seq_scans=
 *
 * DATA.md is the machine-readable data-architecture record (YAML frontmatter + prose), the data
 * twin of DESIGN.md. Its eight groups are the decisions the protocol says every data-intensive
 * system must make: workload · slo · model · integrity · evolution · durability · derived ·
 * retention. A group other than workload/slo may read `{ na: <reason> }`; applicable groups are
 * the DATA_COVERAGE universe (traces `data:<group>` on `data` acceptance rows).
 *
 * slo: response times are a distribution — p50/p95/p99 from client-side samples under an
 * OPEN (arrival-rate) load model; a closed loop stops sending while the server stalls and hides
 * exactly the tail the SLO is about (coordinated omission). k6 summaries are read directly
 * (arrival-rate executors = open; dropped_iterations must be 0 or the rate was not sustained).
 * reconcile: "trust, but verify" — a derived dataset re-derivable from its system of record must
 * agree with it, row by row. migrations: expand/contract — a destructive or lock-taking statement
 * needs a `-- contract-step:` comment immediately before it, naming the release whose code stopped
 * reading the old shape. explain: a hot query that still scans the table (rows read, i.e. returned
 * plus removed by the filter) has no index for its access pattern.
 *
 * Deterministic, Node builtins only; the frontmatter parser is design-scan.cjs's.
 *   exit 0 PASS/VALID · 1 FAIL/INVALID · 2 unusable input
 */
'use strict';
const fs = require('fs'), path = require('path');
const { parseFrontmatter } = require('./design-scan.cjs');

const GROUPS = ['workload', 'slo', 'model', 'integrity', 'evolution', 'durability', 'derived', 'retention'];
const NEVER_NA = ['workload', 'slo'];
const ENUM = {
  primary: ['relational', 'document', 'key-value', 'wide-column', 'graph', 'time-series', 'search', 'vector', 'object-store', 'file', 'mixed'],
  isolation: ['read-committed', 'snapshot', 'repeatable-read', 'serializable', 'none'],
  migrations: ['expand-contract', 'forward-only', 'none'],
  compatibility: ['backward', 'forward', 'both', 'none'],
  replication: ['none', 'single-leader-sync', 'single-leader-async', 'multi-leader', 'leaderless'],
  replica_reads: ['none', 'leader-only', 'read-your-writes', 'eventual'],
  failover: ['automatic', 'manual', 'none'],
  mechanism: ['cdc', 'outbox', 'event-log', 'batch', 'trigger', 'same-transaction'],
  load_model: ['open', 'closed'],
  replication_log: ['statement', 'wal-shipping', 'logical', 'trigger'],
  fault_model: ['partial-failure', 'checkpoint-restart'],
  trust_model: ['trusted-deployment', 'byzantine-tolerant'],
  rerun: ['idempotent', 'non-idempotent'],
};
const WEAK_LIES = ['input-validation', 'restore-digests', 'multiple-time-sources']; // the "weak forms of lying" DDIA2 p.377-380 says to guard against
const DEFAULT_MIN_SAMPLES = 300, MAX_DELETION_DAYS = 30;

const num = v => { if (v === undefined || v === null || v === '') return NaN; const s = String(v).replace(/[_,\s]/g, '').replace(/(ms|s|gb|mb|x)$/i, ''); return /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s) ? Number(s) : NaN; };
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNa = g => isObj(g) && Object.keys(g).length === 1 && 'na' in g;
const text = v => typeof v === 'string' && v.trim().length > 0;

function parseArgs(argv, flags) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '-h' || k === '--help') { usage(); process.exit(0); }
    if (k.startsWith('--')) { const name = k.slice(2); if (!(name in flags)) throw new Error('unknown flag ' + k); if (flags[name] === true) o[name] = true; else { o[name] = argv[++i]; if (o[name] === undefined) throw new Error(k + ' needs a value'); } }
    else o._.push(k);
  }
  return o;
}
function usage() { console.error(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 17).map(l => l.replace(/^ \* ?/, '')).join('\n')); }

// ---------------------------------------------------------------------------
// lint — the eight decisions, each checked against the protocol's rule for it
// ---------------------------------------------------------------------------
function lint(md) {
  const errs = [], warns = [], fm = parseFrontmatter(md);
  if (!fm) return { errs: ['no YAML frontmatter (--- … ---): the data architecture must be machine-readable'], warns, groups: 0, na: [] };
  if (!text(fm.name)) errs.push('missing frontmatter `name`');
  const na = [], present = GROUPS.filter(g => fm[g] !== undefined);
  for (const g of GROUPS) {
    if (fm[g] === undefined) { errs.push(`${g}: missing — every data system decides it (write { na: <reason> } when it truly does not apply)`); continue; }
    if (isNa(fm[g])) { if (NEVER_NA.includes(g)) errs.push(`${g}: cannot be n/a — every system has a load and a response-time expectation`); else if (!text(fm[g].na) || fm[g].na.trim().length < 10) errs.push(`${g}: na needs a reason (>= 10 chars)`); else na.push(g); }
    else if (!isObj(fm[g])) errs.push(`${g}: must be a map (or { na: <reason> })`);
  }
  const grp = g => (isObj(fm[g]) && !isNa(fm[g]) ? fm[g] : null);
  const enumCheck = (where, key, v, allowed) => { if (!text(v)) errs.push(`${where}.${key}: missing (one of ${allowed.join('|')})`); else if (!allowed.includes(String(v).trim().toLowerCase())) errs.push(`${where}.${key}: "${v}" not one of ${allowed.join('|')}`); };
  const numCheck = (where, key, v, { min = 0, max = Infinity, allowNaN = false } = {}) => { const n = num(v); if (Number.isNaN(n)) { if (!allowNaN) errs.push(`${where}.${key}: missing or not a number ("${v ?? ''}")`); return NaN; } if (n < min || n > max) errs.push(`${where}.${key}: ${n} outside [${min}, ${max}]`); return n; };

  const w = grp('workload');
  if (w) {
    const r = num(w.reads_per_s), wr = num(w.writes_per_s);
    if (Number.isNaN(r) && Number.isNaN(wr)) errs.push('workload: declare peak reads_per_s and/or writes_per_s (throughput is the load parameter capacity is planned on)');
    numCheck('workload', 'concurrent_users', w.concurrent_users, { min: 1 });
    if (Number.isNaN(num(w.dataset_gb)) && Number.isNaN(num(w.dataset_mb))) errs.push('workload.dataset_gb: missing — data volume decides storage, indexing and whether one node suffices');
    if (!text(w.growth)) errs.push('workload.growth: missing — state the growth projection (e.g. "3x/yr" or "+40 GB/yr"); plan one order of magnitude ahead, not more');
    if (!text(w.read_write_ratio) && !(Number.isFinite(r) && Number.isFinite(wr))) warns.push('workload: read/write ratio not derivable (give both rates or read_write_ratio)');
  }
  const s = grp('slo');
  if (s) {
    const rt = isObj(s.response_time_ms) ? s.response_time_ms : {};
    if (!isObj(s.response_time_ms)) errs.push('slo.response_time_ms: missing map { p50, p95, p99 } — response time is a distribution, never a mean');
    const p50 = numCheck('slo.response_time_ms', 'p50', rt.p50, { min: 1 }), p95 = numCheck('slo.response_time_ms', 'p95', rt.p95, { min: 1 }), p99 = numCheck('slo.response_time_ms', 'p99', rt.p99, { min: 1 });
    if ([p50, p95, p99].every(Number.isFinite) && !(p50 <= p95 && p95 <= p99)) errs.push('slo.response_time_ms: percentiles must be non-decreasing (p50 <= p95 <= p99)');
    for (const k of Object.keys(rt)) if (/mean|avg|average/i.test(k)) errs.push(`slo.response_time_ms.${k}: averages hide the tail — delete it, keep percentiles`);
    numCheck('slo', 'error_rate_max', s.error_rate_max, { min: 0, max: 0.5 });
    if (s.availability !== undefined) numCheck('slo', 'availability', s.availability, { min: 0.9, max: 0.99999 });
    if (!text(s.window)) errs.push('slo.window: missing — an SLO holds over a stated window (e.g. 30d)');
    enumCheck('slo', 'load_model', s.load_model, ENUM.load_model);
    if (text(s.load_model) && s.load_model.trim().toLowerCase() === 'closed') errs.push('slo.load_model: closed — a closed loop stops sending while the server stalls and hides the tail it is supposed to measure (coordinated omission); use an open, arrival-rate model');
    if (s.samples_min === undefined) warns.push(`slo.samples_min: not set — defaults to ${DEFAULT_MIN_SAMPLES}`); else numCheck('slo', 'samples_min', s.samples_min, { min: 100 });
    if (!text(s.measured_at)) warns.push('slo.measured_at: say where response time is measured (client side, including queueing)');
  }
  const m = grp('model');
  if (m) {
    enumCheck('model', 'primary', m.primary, ENUM.primary);
    if (!text(m.store)) errs.push('model.store: missing — the concrete datastore and major version');
    if (m.indexes === undefined) errs.push('model.indexes: missing — one entry per hot access pattern (columns + the query it serves) or { na: <reason> }');
    else if (!isNa(m.indexes)) {
      const idx = isObj(m.indexes) ? Object.entries(m.indexes) : [];
      if (!idx.length) errs.push('model.indexes: empty — name each index with its columns and the query it serves');
      for (const [k, v] of idx) { if (!isObj(v) || !(v.columns && String(v.columns).length) || !text(v.query)) errs.push(`model.indexes.${k}: needs columns and the query (access pattern) it serves`); }
    }
    if (text(m.normalization) && /denormal/i.test(m.normalization) && !text(m.reason)) warns.push('model.normalization: denormalized without model.reason — name the read pattern it buys and who keeps the copies in sync');
  }
  const i = grp('integrity');
  if (i) {
    enumCheck('integrity', 'isolation', i.isolation, ENUM.isolation);
    const tx = isObj(i.transactions) ? Object.entries(i.transactions) : [];
    if (!tx.length) errs.push('integrity.transactions: missing — name each multi-object or read-modify-write operation with its invariant and the technique that protects it');
    for (const [k, v] of tx) if (!isObj(v) || !text(v.invariant) || !text(v.technique)) errs.push(`integrity.transactions.${k}: needs invariant and technique (serializable | select-for-update | compare-and-set | atomic-write | unique-index | check-constraint | single-writer | …)`);
    if (i.idempotency === undefined) errs.push('integrity.idempotency: missing — a retried request or redelivered event must not apply twice; name the key (or { na: <reason> } for a read-only system)');
    else if (!isNa(i.idempotency) && !(isObj(i.idempotency) && text(i.idempotency.key))) errs.push('integrity.idempotency.key: missing (e.g. Idempotency-Key header, event id)');
    if (i.constraints !== undefined && !(Array.isArray(i.constraints) ? i.constraints.length : text(i.constraints))) warns.push('integrity.constraints: empty — list the uniqueness/check constraints the database enforces');
    if (i.trust_model === undefined) errs.push('integrity.trust_model: missing — trusted-deployment (nodes honest but fallible; DDIA2 p.377-380) or byzantine-tolerant; the choice decides which lies the system guards against');
    else { enumCheck('integrity', 'trust_model', i.trust_model, ENUM.trust_model); if (text(i.trust_model) && i.trust_model.trim().toLowerCase() === 'trusted-deployment') { const guards = Array.isArray(i.weak_lies) ? i.weak_lies.map(x => String(x).trim().toLowerCase()) : []; for (const g of WEAK_LIES) if (!guards.includes(g)) errs.push(`integrity.weak_lies: must include ${g} — a trusted deployment still guards against corrupted bytes, bad input and a wrong clock (DDIA2 p.378-379)`); } }
  }
  const e = grp('evolution');
  if (e) {
    enumCheck('evolution', 'migrations', e.migrations, ENUM.migrations);
    if (text(e.migrations) && e.migrations.trim().toLowerCase() === 'none' && !text(e.reason)) errs.push('evolution.migrations: none needs evolution.reason (schemas change; "none" is a decision only for a throwaway)');
    enumCheck('evolution', 'compatibility', e.compatibility, ENUM.compatibility);
    if (text(e.compatibility) && e.compatibility.trim().toLowerCase() === 'none' && !text(e.reason)) errs.push('evolution.compatibility: none needs evolution.reason — rolling upgrades need old code to read new data and new code to read old data');
    if (!text(e.encoding)) warns.push('evolution.encoding: not named (json | protobuf | avro | …) — schema evolution rules are per encoding');
  }
  const d = grp('durability');
  if (d) {
    enumCheck('durability', 'replication', d.replication, ENUM.replication);
    const rep = text(d.replication) ? d.replication.trim().toLowerCase() : '';
    if (rep && rep !== 'none') { numCheck('durability', 'lag_budget_s', d.lag_budget_s, { min: 0 }); enumCheck('durability', 'replica_reads', d.replica_reads, ENUM.replica_reads); if (text(d.replica_reads) && d.replica_reads.trim().toLowerCase() === 'eventual' && !text(d.reason)) warns.push('durability.replica_reads: eventual without durability.reason — say which screens may show stale data and for how long'); }
    if (!isObj(d.backup)) errs.push('durability.backup: missing map { rpo_s, rto_s, frequency } — recovery objectives are numbers a drill can measure');
    else { numCheck('durability.backup', 'rpo_s', d.backup.rpo_s, { min: 0 }); numCheck('durability.backup', 'rto_s', d.backup.rto_s, { min: 1 }); if (!text(d.backup.frequency)) warns.push('durability.backup.frequency: not stated'); }
    enumCheck('durability', 'failover', d.failover, ENUM.failover);
    if (d.fault_model === undefined) errs.push('durability.fault_model: missing — partial-failure (commodity nodes fail and are replaced while the system keeps serving; DDIA2 p.23) is what forge builds for; checkpoint-restart needs durability.reason and makes the failover and restore rows n/a');
    else { enumCheck('durability', 'fault_model', d.fault_model, ENUM.fault_model); if (text(d.fault_model) && d.fault_model.trim().toLowerCase() === 'checkpoint-restart' && !text(d.reason)) errs.push('durability.fault_model: checkpoint-restart needs durability.reason'); }
    if (rep && rep !== 'none') { if (d.replication_log === undefined) errs.push('durability.replication_log: missing — statement | wal-shipping | logical | trigger (DDIA2 p.206-208); wal-shipping pins leader and followers to one storage-engine version, so evolution must plan the rolling upgrade'); else enumCheck('durability', 'replication_log', d.replication_log, ENUM.replication_log); }
  }
  const dv = grp('derived');
  if (dv) {
    const entries = Object.entries(dv);
    if (!entries.length) errs.push('derived: empty — list every cache, index, materialized view, export or model with its source, or write { na: <reason> }');
    for (const [k, v] of entries) {
      if (!isObj(v)) { errs.push(`derived.${k}: must be a map { source, mechanism, freshness_s, reconcile }`); continue; }
      if (!text(v.source)) errs.push(`derived.${k}.source: missing — which system of record it is derived from`);
      const mech = text(v.mechanism) ? v.mechanism.trim().toLowerCase() : '';
      if (/dual/.test(mech)) errs.push(`derived.${k}.mechanism: dual-write — two independent writes race and fail apart; derive from the change stream (cdc | outbox | event-log) or rebuild in batch`);
      else enumCheck(`derived.${k}`, 'mechanism', v.mechanism, ENUM.mechanism);
      numCheck(`derived.${k}`, 'freshness_s', v.freshness_s, { min: 0 });
      if (!text(v.reconcile)) errs.push(`derived.${k}.reconcile: missing — the command or test that compares the derived copy with its source (trust, but verify)`);
      if (mech && mech !== 'same-transaction') { if (v.rerun === undefined) errs.push(`derived.${k}.rerun: missing — a job or consumer that is not in the source transaction must be idempotent so a failure is a re-run and the rebuild equals live (DDIA2 p.466-475, p.528); declare rerun: idempotent`); else { enumCheck(`derived.${k}`, 'rerun', v.rerun, ENUM.rerun); if (text(v.rerun) && v.rerun.trim().toLowerCase() === 'non-idempotent') errs.push(`derived.${k}.rerun: non-idempotent — a retried job would double-apply; make it idempotent (dedupe by op id, overwrite by key, or rebuild from scratch)`); } }
    }
  }
  const r = grp('retention');
  if (r) {
    const pd = r.personal_data;
    if (pd === undefined) errs.push('retention.personal_data: missing — list the fields/tables about people (purpose + retention) or `none`');
    else if (!(text(pd) && pd.trim().toLowerCase() === 'none')) {
      const items = isObj(pd) ? Object.entries(pd) : Array.isArray(pd) ? pd.map((x, n) => [String(n), x]) : [];
      if (!items.length) errs.push('retention.personal_data: empty — name each item with purpose and retention, or `none`');
      for (const [k, v] of items) if (!isObj(v) || !text(v.purpose) || !text(v.retention)) errs.push(`retention.personal_data.${k}: needs purpose and retention (data minimization: collected for a stated purpose, kept no longer than needed)`);
      if (!isObj(r.deletion)) errs.push('retention.deletion: missing map { sla_days, covers_derived, path } — the right to erasure needs a mechanism, including derived copies');
      else {
        numCheck('retention.deletion', 'sla_days', r.deletion.sla_days, { min: 1, max: MAX_DELETION_DAYS });
        if (String(r.deletion.covers_derived).toLowerCase() !== 'true') errs.push('retention.deletion.covers_derived: must be true — a deletion that leaves copies in indexes, caches, exports or training sets is not a deletion');
        if (!text(r.deletion.path)) warns.push('retention.deletion.path: name the request path or job that performs the purge');
      }
      if (!text(r.minimization)) warns.push('retention.minimization: say what is deliberately not stored');
    }
  }
  const body = md.replace(/^---[\s\S]*?\r?\n---/, '');
  if (!/^##+ .*(systems? of record|source of truth)/im.test(body)) errs.push('prose: no "## Systems of record" section — say which store is authoritative for each fact and which data is derived from what');
  if (!/^##+ .*trade-?offs?/im.test(body)) errs.push('prose: no "## Trade-offs" section — every data design is a trade-off; record what was rejected and why');
  if (!/^##+ .*(dataflow|data flow)/im.test(body)) warns.push('prose: no "## Dataflow" section (how changes reach every derived dataset)');
  return { errs, warns, groups: present.length, na, fm };
}

// ---------------------------------------------------------------------------
// coverage — applicable groups × `data` rows' traces (TSV col 7); the record must lint VALID
// ---------------------------------------------------------------------------
function readRows(tsv) {
  return tsv.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('\t')).filter(c => !(c[0] === 'spec' && c[1] === 'dimension') && c.length >= 5)
    .map(c => ({ spec: c[0], dimension: c[1], id: c[2], weight: c[3], status: c[4], detail: c[5] || '', traces: (c[6] || '').split(/[ ,]+/).filter(Boolean) }));
}
function coverage(md, tsv) {
  const { fm, errs } = lint(md);
  if (!fm) return { ratio: 0, required: [], covered: [], missing: [], orphans: ['no frontmatter'], lintErrors: errs.length };
  const required = GROUPS.filter(g => fm[g] !== undefined && !isNa(fm[g]));
  const traced = new Set(), orphans = new Set();
  for (const row of readRows(tsv)) for (const t of row.traces) {
    const mm = /^data:([a-z]+)$/.exec(t); if (!mm) continue;
    if (row.dimension !== 'data') continue;
    if (required.includes(mm[1])) traced.add(mm[1]); else orphans.add(t);
  }
  const covered = required.filter(g => traced.has(g)), missing = required.filter(g => !traced.has(g));
  return { ratio: required.length ? covered.length / required.length : 1, required, covered, missing, orphans: [...orphans].sort(), lintErrors: errs.length };
}

// ---------------------------------------------------------------------------
// slo — percentiles from client-side samples, or a k6 end-of-test summary
// ---------------------------------------------------------------------------
function percentile(sorted, q) { if (!sorted.length) return NaN; return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]; }
function parseSamples(txt) {
  const t = txt.replace(/^﻿/, '').trim();
  if (t.startsWith('{')) {
    const j = JSON.parse(t), metrics = j.metrics || {}, dur = metrics.http_req_duration;
    if (!isObj(dur)) throw new Error('JSON is neither a k6 summary (metrics.http_req_duration) nor a sample array');
    const vals = m => (isObj(m) && isObj(m.values) ? m.values : isObj(m) ? m : {});          // handleSummary shape or the legacy --summary-export shape
    const tr = vals(dur), reqs = vals(metrics.http_reqs), failed = metrics.http_req_failed ? vals(metrics.http_req_failed) : null, dropped = vals(metrics.dropped_iterations);
    const v = k => tr[k] === undefined ? NaN : Number(tr[k]);
    const execs = Object.values((j.options && j.options.scenarios) || {}).map(x => x && x.executor).filter(Boolean);
    const model = !execs.length ? 'unknown' : execs.every(x => /arrival-rate$/.test(x)) ? 'open' : 'closed';
    return { kind: 'k6', model, p50: Number.isFinite(v('med')) ? v('med') : v('p(50)'), p95: v('p(95)'), p99: v('p(99)'),
      n: reqs.count === undefined ? NaN : Number(reqs.count),
      errors: failed ? Number(failed.rate !== undefined ? failed.rate : failed.value) : NaN, dropped: dropped.count === undefined ? 0 : Number(dropped.count) };
  }
  const vals = [], flags = []; let model = 'unknown', dropped = 0;
  const src = t.startsWith('[') ? JSON.parse(t).map(x => (typeof x === 'object' && x ? `${x.ms ?? x.latency_ms ?? x.duration_ms}\t${x.ok === false || x.status === 'err' || Number(x.status) >= 400 ? 'err' : 'ok'}` : String(x))) : t.split(/\r?\n/);
  for (const line of src) {
    const c = String(line).trim(); if (!c) continue;
    if (c.startsWith('#')) {                                   // an open-model generator (data-load.cjs) declares itself in-band, like k6's executors
      let h = /^#\s*(?:load_)?model\s*:\s*(open|closed)\b/i.exec(c); if (h) model = (model === 'closed' || h[1].toLowerCase() === 'closed') ? 'closed' : 'open';
      h = /^#\s*dropped\s*:\s*(\d+)/i.exec(c); if (h) dropped += Number(h[1]);   // concatenated runs: every stream's drops count
      continue;
    }
    if (/^ms\b/i.test(c)) continue;                            // column header
    const [a, b] = c.split(/[\t,;]\s*|\s+/), n = num(a);
    if (!Number.isFinite(n) || n < 0) throw new Error('sample is not a non-negative number: ' + c);
    vals.push(n); flags.push(b !== undefined && (/^(err|error|fail|failed|false)$/i.test(b) || (/^\d{1,3}$/.test(b) && (Number(b) >= 400 || Number(b) === 0))));
  }
  const sorted = [...vals].sort((x, y) => x - y);
  return { kind: 'samples', model, p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), p99: percentile(sorted, 0.99), n: vals.length, errors: vals.length ? flags.filter(Boolean).length / vals.length : NaN, dropped };
}
function sloVerdict(m, t) {
  const reasons = [];
  if (!Number.isFinite(m.n) || m.n < t.minSamples) reasons.push(`n=${m.n} < samples_min ${t.minSamples} (too few samples for a p99)`);
  for (const k of ['p50', 'p95', 'p99']) { if (!Number.isFinite(m[k])) reasons.push(`${k} unavailable (k6: add it to summaryTrendStats)`); else if (!Number.isFinite(t[k])) reasons.push(`${k} threshold missing (DATA.md slo.response_time_ms or --${k})`); else if (m[k] > t[k]) reasons.push(`${k} ${m[k]} ms > ${t[k]} ms`); }
  if (!Number.isFinite(t.errors)) reasons.push('error-rate threshold missing (DATA.md slo.error_rate_max or --errors)');
  else if (!Number.isFinite(m.errors)) reasons.push('error rate unavailable (k6: http_req_failed; samples: an ok|err or status column)');
  else if (m.errors > t.errors) reasons.push(`error rate ${m.errors} > ${t.errors}`);
  if (m.model !== 'open') reasons.push(m.model === 'closed' ? 'closed load model (coordinated omission) — use an arrival-rate executor' : 'load model unknown — pass --model open after an arrival-rate run (never a closed loop)');
  if (m.dropped > 0) reasons.push(`dropped_iterations=${m.dropped} — the target arrival rate was not sustained (raise maxVUs or lower the rate)`);
  return reasons;
}

// ---------------------------------------------------------------------------
// reconcile — a derived dataset against its system of record, by key
// ---------------------------------------------------------------------------
function splitDelimited(line, sep) {                 // RFC 4180-style: quotes, doubled quotes, separators inside quotes
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
}
function readTable(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  if (/\.json$/i.test(file)) { const j = JSON.parse(raw); if (!Array.isArray(j)) throw new Error(file + ': JSON must be an array of objects'); return j.map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]))); }
  const sep = /\.csv$/i.test(file) ? ',' : '\t', lines = raw.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
  if (!lines.length) return [];
  const head = splitDelimited(lines[0], sep).map(s => s.trim());
  return lines.slice(1).map(l => { const c = splitDelimited(l, sep); return Object.fromEntries(head.map((h, i) => [h, (c[i] || '').trim()])); });
}
// plain decimals (no leading zeros, below 2^53) compare numerically so 2400.00 equals 2400; anything
// else — barcodes with leading zeros, big ids, "5s" — compares as text
const plainNumber = v => /^-?(0|[1-9]\d*)(\.\d+)?$/.test(v) && Math.abs(Number(v)) < 2 ** 53;
const norm = v => { const s = String(v ?? '').trim(); return plainNumber(s) ? String(Number(s)) : s; };
function reconcileRows(source, derived, key, fields) {
  const idx = rows => { const m = new Map(); for (const r of rows) { if (!(key in r)) throw new Error(`key column "${key}" missing from a row`); if (m.has(r[key])) throw new Error(`duplicate key ${r[key]}`); m.set(r[key], r); } return m; };
  const S = idx(source), D = idx(derived);
  const cols = fields && fields.length ? fields : [...new Set(source.flatMap(Object.keys))].filter(c => c !== key && derived.every(r => c in r));
  const missing = [], extra = [], mismatched = [];
  for (const [k, s] of S) { const d = D.get(k); if (!d) { missing.push(k); continue; } for (const c of cols) if (norm(s[c]) !== norm(d[c])) mismatched.push(`${k}.${c}: ${s[c]} != ${d[c]}`); }
  for (const k of D.keys()) if (!S.has(k)) extra.push(k);
  return { source: S.size, derived: D.size, fields: cols, missing, extra, mismatched };
}

// ---------------------------------------------------------------------------
// migrations — expand/contract lint over SQL files
// ---------------------------------------------------------------------------
// Statement-level rules (dialects: all | postgres | mysql); `test` receives the upper-cased statement.
const STMT_RULES = [
  { id: 'drop-table', dialects: 'all', test: s => /^DROP\s+TABLE\b/.test(s), why: 'destroys data and every reader of it; a contract step only after the release that stopped reading it' },
  { id: 'truncate', dialects: 'all', test: s => /^TRUNCATE\b/.test(s), why: 'destroys data' },
  { id: 'delete-all', dialects: 'all', test: s => /^DELETE\s+FROM\b/.test(s) && !/\bWHERE\b/.test(s), why: 'deletes every row' },
  { id: 'index-not-concurrent', dialects: 'postgres', test: s => /^CREATE\s+(UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY\b)/.test(s), why: 'blocks writes while the index builds; CREATE INDEX CONCURRENTLY' },
  { id: 'drop-index-not-concurrent', dialects: 'postgres', test: s => /^DROP\s+INDEX\s+(?!CONCURRENTLY\b)/.test(s), why: 'takes a lock that blocks queries on the table; DROP INDEX CONCURRENTLY' },
];
// ALTER TABLE actions (one statement may carry several, comma-separated); `test` receives one upper-cased action.
const ALTER_RULES = [
  { id: 'drop-column', dialects: 'all', test: a => /^DROP\s+(COLUMN\s+)?(IF\s+EXISTS\s+)?(?!CONSTRAINT\b|INDEX\b|KEY\b|PRIMARY\b|FOREIGN\b|PARTITION\b)\w+/.test(a), why: 'old code still reads the column; contract step only' },
  { id: 'rename', dialects: 'all', test: a => /^RENAME\s+(?!CONSTRAINT\b)/.test(a) || /^CHANGE\s+(COLUMN\s+)?(\w+)\s+(?!\2\s)\w+/.test(a), why: 'breaks every client using the old name; add the new name, dual-read, backfill, drop the old' },
  { id: 'change-type', dialects: 'all', test: a => /^(ALTER|MODIFY)\s+(COLUMN\s+)?\w+\s+(SET\s+DATA\s+)?TYPE\b/.test(a) || /^(MODIFY|CHANGE)\s+(COLUMN\s+)?\w+\s+(\w+\s+)?\w+/.test(a), why: 'rewrites the table under lock and breaks readers of the old type; add a new column instead' },
  { id: 'not-null-without-default', dialects: 'all', test: a => /^ADD\s+(COLUMN\s+)?(IF\s+NOT\s+EXISTS\s+)?(?!CONSTRAINT\b|CHECK\b|UNIQUE\b|PRIMARY\b|FOREIGN\b|INDEX\b|KEY\b)\w+/.test(a) && /\bNOT\s+NULL\b/.test(a) && !/\bDEFAULT\b/.test(a) && !/\b(GENERATED|IDENTITY)\b/.test(a), why: 'existing rows violate it; add nullable, backfill, then constrain' },
  { id: 'set-not-null', dialects: 'postgres', test: a => /^ALTER\s+(COLUMN\s+)?\w+\s+SET\s+NOT\s+NULL\b/.test(a), why: 'full-table scan under ACCESS EXCLUSIVE; add a CHECK (… IS NOT NULL) NOT VALID, validate, then set' },
  { id: 'constraint-not-valid', dialects: 'postgres', test: a => /^ADD\s+(CONSTRAINT\s+\w+\s+)?(FOREIGN\s+KEY|CHECK)\b/.test(a) && !/\bNOT\s+VALID\b/.test(a), why: 'validation scans the table under lock; add … NOT VALID, then VALIDATE CONSTRAINT' },
  { id: 'unique-not-concurrent', dialects: 'postgres', test: a => /^ADD\s+(CONSTRAINT\s+\w+\s+)?(UNIQUE|PRIMARY\s+KEY)\s*\(/.test(a) && !/\bUSING\s+INDEX\b/.test(a), why: 'builds the unique index under lock; CREATE UNIQUE INDEX CONCURRENTLY, then ADD CONSTRAINT … USING INDEX' },
];
const ANNOTATION = /contract-step\s*:\s*\S/i;
function listSql(inputs) {
  const out = [];
  const walk = p => { const st = fs.statSync(p); if (st.isDirectory()) { for (const f of fs.readdirSync(p).sort()) walk(path.join(p, f)); } else if (/\.sql$/i.test(p)) out.push(p); };
  for (const p of inputs) walk(p);
  return out;
}
// Split SQL into statements, honouring quotes, double-quoted identifiers, dollar quotes and comments;
// a statement is annotated when the comments immediately before it carry `contract-step:`.
function splitSql(raw) {
  const out = []; let i = 0, stmt = '', pre = '';
  const n = raw.length, push = () => { if (stmt.trim()) out.push({ text: stmt.replace(/\s+/g, ' ').trim(), annotated: ANNOTATION.test(pre) }); stmt = ''; pre = ''; };
  while (i < n) {
    const c = raw[i], two = raw.substr(i, 2);
    if (two === '--') { const e = raw.indexOf('\n', i); const seg = e < 0 ? raw.slice(i) : raw.slice(i, e); if (!stmt.trim()) pre += seg + '\n'; i += seg.length; continue; }
    if (two === '/*') { const e = raw.indexOf('*/', i + 2); const seg = e < 0 ? raw.slice(i) : raw.slice(i, e + 2); if (!stmt.trim()) pre += seg + '\n'; i += seg.length; continue; }
    if (c === "'" || c === '"') { let j = i + 1; while (j < n) { if (raw[j] === c) { if (raw[j + 1] === c) { j += 2; continue; } break; } j++; } stmt += raw.slice(i, j + 1); i = j + 1; continue; }
    const dq = /^\$([A-Za-z_]\w*)?\$/.exec(raw.slice(i, i + 64));
    if (dq) { const tag = dq[0], e = raw.indexOf(tag, i + tag.length); const j = e < 0 ? n : e + tag.length; stmt += raw.slice(i, j); i = j; continue; }
    if (c === ';') { push(); i++; continue; }
    stmt += c; i++;
  }
  push();
  return out;
}
function alterActions(up) {                           // "ALTER TABLE [IF EXISTS] [ONLY] name action, action…" → actions, split on top-level commas
  const m = /^ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?(ONLY\s+)?("[^"]+"|`[^`]+`|[\w.]+)\s*/.exec(up); if (!m) return null;
  const rest = up.slice(m[0].length), acts = []; let depth = 0, cur = '';
  for (const ch of rest) { if (ch === '(') depth++; else if (ch === ')') depth--; if (ch === ',' && depth === 0) { acts.push(cur.trim()); cur = ''; } else cur += ch; }
  if (cur.trim()) acts.push(cur.trim());
  return acts;
}
function scanMigrations(files, dialect = 'postgres') {
  const findings = []; let statements = 0, annotated = 0;
  const applies = r => r.dialects === 'all' || r.dialects === dialect;
  for (const file of files) {
    for (const st of splitSql(fs.readFileSync(file, 'utf8'))) {
      statements++;
      const up = st.text.toUpperCase(), hits = [];
      for (const rule of STMT_RULES) if (applies(rule) && rule.test(up)) hits.push(rule);
      const acts = alterActions(up);
      if (acts) for (const a of acts) for (const rule of ALTER_RULES) if (applies(rule) && rule.test(a)) hits.push(rule);
      for (const rule of hits) { findings.push({ file, rule: rule.id, why: rule.why, statement: st.text.slice(0, 120), annotated: st.annotated }); if (st.annotated) annotated++; }
    }
  }
  return { files: files.length, statements, findings, unsafe: findings.filter(f => !f.annotated).length, annotated };
}

// ---------------------------------------------------------------------------
// explain — sequential scans in EXPLAIN output (Postgres JSON/text, SQLite EXPLAIN QUERY PLAN).
// Rows READ by a scan = rows returned + rows removed by the filter (× loops); Plan Rows is a lower bound.
// ---------------------------------------------------------------------------
function scanPlans(txt, maxSeqRows = 1000) {
  const t = txt.replace(/^﻿/, '').trim(), seq = [];
  let plans = 0;
  if (t.startsWith('[') || t.startsWith('{')) {
    const j = JSON.parse(t), roots = [];
    (function flat(x) { if (Array.isArray(x)) x.forEach(flat); else if (isObj(x)) roots.push(x); })(j);
    const n = v => (v === undefined || v === null ? 0 : Number(v) || 0);
    const walk = (node, label) => {
      if (!isObj(node)) return;
      if (node['Node Type'] === 'Seq Scan') {
        const loops = Math.max(1, n(node['Actual Loops'])), read = Math.max(n(node['Plan Rows']), (n(node['Actual Rows']) + n(node['Rows Removed by Filter'])) * loops);
        if (read >= maxSeqRows) seq.push(`${label}: Seq Scan on ${node['Relation Name'] || '?'} rows_read=${read}`);
      }
      for (const c of node.Plans || []) walk(c, label);
    };
    for (const r of roots) { plans++; walk(r.Plan || r, r.Query || `plan ${plans}`); }
    return { plans, seq };
  }
  const blocks = t.split(/\n\s*\n|^--\s*query\b.*$/im).map(b => b.trim()).filter(Boolean);
  for (const b of blocks) {
    plans++;
    const lines = b.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m = /Seq Scan on (\S+).*?\(cost=[^)]*rows=(\d+)[^)]*\)(?:\s*\(actual[^)]*?rows=(\d+)(?:\s+loops=(\d+))?[^)]*\))?/.exec(line);
      if (m) {
        let removed = 0;
        for (let k = i + 1; k < Math.min(lines.length, i + 7) && !/->/.test(lines[k]); k++) { const r = /Rows Removed by Filter:\s*(\d+)/.exec(lines[k]); if (r) { removed = Number(r[1]); break; } }
        const loops = Math.max(1, Number(m[4] || 1)), read = Math.max(Number(m[2]), (Number(m[3] || 0) + removed) * loops);
        if (read >= maxSeqRows) seq.push(`plan ${plans}: Seq Scan on ${m[1]} rows_read=${read}`);
        continue;
      }
      // SQLite EXPLAIN QUERY PLAN (tree form, or the legacy `0|0|0|SCAN TABLE t` rows): SCAN t is a full scan;
      // SEARCH t USING INDEX is not; subqueries and constants are not tables
      m = /^[\s|`\\-]*(?:\d+\|\d+\|\d+\|)?SCAN\s+(?:TABLE\s+)?(?!SUBQUERY\b|CONSTANT\b)(\w+)/i.exec(line);
      if (m && !/USING (COVERING )?INDEX/i.test(line)) seq.push(`plan ${plans}: SCAN ${m[1]} (sqlite full scan)`);
    }
  }
  return { plans, seq };
}

// ---------------------------------------------------------------------------
async function main() {
  const [sub, ...rest] = process.argv.slice(2);
  const E = (s, code = 2) => { console.error(s); return code; };
  if (sub === 'lint') {
    const o = parseArgs(rest, {}); const file = o._[0];
    if (!file || !fs.existsSync(file)) { console.log('DATA_LINT: INVALID'); return E('usage: lint <DATA.md>'); }
    const r = lint(fs.readFileSync(file, 'utf8'));
    for (const w of r.warns) console.error('warn: ' + w);
    for (const e of r.errs) console.error('error: ' + e);
    console.log(`DATA_LINT: ${r.errs.length ? 'INVALID' : 'VALID'} groups=${r.groups}/${GROUPS.length} na=${r.na.length}${r.na.length ? '(' + r.na.join(',') + ')' : ''}`);
    return r.errs.length ? 1 : 0;
  }
  if (sub === 'coverage') {
    const o = parseArgs(rest, {}); const [md, tsv] = o._;
    if (!md || !tsv || !fs.existsSync(md) || !fs.existsSync(tsv)) { console.log('DATA_COVERAGE: 0.00'); return E('usage: coverage <DATA.md> <results.tsv>'); }
    const c = coverage(fs.readFileSync(md, 'utf8'), fs.readFileSync(tsv, 'utf8'));
    console.error(`data_total=${c.required.length} data_covered=${c.covered.length} data_missing=${c.missing.length ? c.missing.map(g => 'data:' + g).join(',') : 'none'} data_orphans=${c.orphans.length ? c.orphans.join(',') : 'none'} lint_errors=${c.lintErrors}`);
    if (c.lintErrors) console.error(`DATA.md has ${c.lintErrors} lint error(s) — run \`data-score.cjs lint\`; coverage over an invalid record does not count`);
    console.log(`DATA_COVERAGE: ${(Math.floor(c.ratio * 100 + 1e-9) / 100).toFixed(2)}`);
    return c.ratio >= 1 && !c.orphans.length && !c.lintErrors ? 0 : 1;
  }
  if (sub === 'slo') {
    const o = parseArgs(rest, { data: '', p50: '', p95: '', p99: '', errors: '', 'min-samples': '', model: '' }); const file = o._[0];
    if (!file || !fs.existsSync(file)) { console.log('DATA_SLO: FAIL'); return E('usage: slo <samples|k6-summary.json> [--data DATA.md] [--p50 ms] [--p95 ms] [--p99 ms] [--errors f] [--min-samples n] [--model open|closed]'); }
    const t = { p50: NaN, p95: NaN, p99: NaN, errors: NaN, minSamples: DEFAULT_MIN_SAMPLES };
    if (o.data) { if (!fs.existsSync(o.data)) { console.log('DATA_SLO: FAIL'); return E('--data file not found: ' + o.data); } const fm = parseFrontmatter(fs.readFileSync(o.data, 'utf8')) || {}; const s = isObj(fm.slo) ? fm.slo : {}, rt = isObj(s.response_time_ms) ? s.response_time_ms : {}; t.p50 = num(rt.p50); t.p95 = num(rt.p95); t.p99 = num(rt.p99); t.errors = num(s.error_rate_max); if (Number.isFinite(num(s.samples_min))) t.minSamples = num(s.samples_min); }
    for (const k of ['p50', 'p95', 'p99', 'errors']) if (o[k]) t[k] = num(o[k]);
    if (o['min-samples']) { const ms = num(o['min-samples']); if (Number.isFinite(ms) && ms >= 1) t.minSamples = ms; else console.error(`warn: --min-samples ${o['min-samples']} is not a number; keeping ${t.minSamples}`); }
    let m; try { m = parseSamples(fs.readFileSync(file, 'utf8')); } catch (e) { console.log('DATA_SLO: FAIL'); return E('unreadable samples: ' + e.message); }
    if (o.model) { if (!ENUM.load_model.includes(o.model)) return E('--model must be open or closed'); if (m.kind === 'k6' && m.model !== 'unknown' && m.model !== o.model) console.error(`warn: --model ${o.model} contradicts the k6 scenarios (${m.model}); the summary wins`); else m.model = o.model; }
    const reasons = sloVerdict(m, t);
    for (const r of reasons) console.error('fail: ' + r);
    const f = v => Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : 'n/a';
    console.log(`DATA_SLO: ${reasons.length ? 'FAIL' : 'PASS'} p50=${f(m.p50)} p95=${f(m.p95)} p99=${f(m.p99)} n=${f(m.n)} errors=${Number.isFinite(m.errors) ? m.errors.toFixed(4) : 'n/a'} dropped=${m.dropped} model=${m.model} source=${m.kind}`);
    return reasons.length ? 1 : 0;
  }
  if (sub === 'reconcile') {
    const o = parseArgs(rest, { key: '', fields: '' }); const [src, ...der] = o._;
    if (!src || !der.length || !o.key) { console.log('DATA_RECONCILE: FAIL'); return E('usage: reconcile <source> <derived…> --key <col> [--fields a,b]'); }
    let r; try { r = reconcileRows(readTable(src), der.flatMap(readTable), o.key, o.fields ? o.fields.split(',').map(s => s.trim()).filter(Boolean) : []); } catch (e) { console.log('DATA_RECONCILE: FAIL'); return E(e.message); }
    for (const k of r.missing.slice(0, 20)) console.error('missing in derived: ' + k);
    for (const k of r.extra.slice(0, 20)) console.error('extra in derived: ' + k);
    for (const k of r.mismatched.slice(0, 20)) console.error('mismatch: ' + k);
    console.error(`fields=${r.fields.join(',') || 'none'}`);
    const bad = r.missing.length + r.extra.length + r.mismatched.length;
    console.log(`DATA_RECONCILE: ${bad ? 'FAIL' : 'PASS'} source=${r.source} derived=${r.derived} missing=${r.missing.length} extra=${r.extra.length} mismatched=${r.mismatched.length}`);
    return bad ? 1 : 0;
  }
  if (sub === 'migrations') {
    const o = parseArgs(rest, { dialect: '' }); const dialect = o.dialect || 'postgres';
    if (!['postgres', 'mysql', 'sqlite'].includes(dialect)) return E('--dialect must be postgres, mysql or sqlite');
    if (!o._.length || !o._.every(p => fs.existsSync(p))) { console.log('MIGRATION_SAFETY: FAIL'); return E('usage: migrations <dir|file.sql…> [--dialect postgres|mysql|sqlite]'); }
    const files = listSql(o._);
    if (!files.length) { console.log('MIGRATION_SAFETY: FAIL'); return E('no *.sql files found'); }
    const r = scanMigrations(files, dialect);
    for (const f of r.findings) console.error(`${f.annotated ? 'annotated' : 'UNSAFE'} ${path.relative(process.cwd(), f.file)} [${f.rule}]: ${f.statement} — ${f.why}`);
    console.log(`MIGRATION_SAFETY: ${r.unsafe ? 'FAIL' : 'PASS'} files=${r.files} statements=${r.statements} unsafe=${r.unsafe} annotated=${r.annotated} dialect=${dialect}`);
    return r.unsafe ? 1 : 0;
  }
  if (sub === 'explain') {
    const o = parseArgs(rest, { 'max-seq-rows': '' }); const max = o['max-seq-rows'] ? num(o['max-seq-rows']) : 1000;
    if (!o._.length || !o._.every(p => fs.existsSync(p)) || !Number.isFinite(max)) { console.log('DATA_INDEXES: FAIL'); return E('usage: explain <plan.json|plan.txt…> [--max-seq-rows 1000]'); }
    let plans = 0; const seq = [];
    for (const f of o._) { let r; try { r = scanPlans(fs.readFileSync(f, 'utf8'), max); } catch (e) { console.log('DATA_INDEXES: FAIL'); return E(f + ': ' + e.message); } plans += r.plans; seq.push(...r.seq.map(s => path.basename(f) + ' ' + s)); }
    for (const s of seq) console.error('seq scan: ' + s);
    console.log(`DATA_INDEXES: ${seq.length ? 'FAIL' : 'PASS'} plans=${plans} seq_scans=${seq.length} max_seq_rows=${max}`);
    return seq.length ? 1 : 0;
  }
  usage(); return sub ? 64 : 2;
}
module.exports = { GROUPS, ENUM, lint, coverage, readRows, percentile, parseSamples, sloVerdict, splitDelimited, readTable, reconcileRows, STMT_RULES, ALTER_RULES, listSql, splitSql, alterActions, scanMigrations, scanPlans, parseFrontmatter };
if (require.main === module) main().then(c => process.exit(c)).catch(e => { console.error(e.message); process.exit(2); });
