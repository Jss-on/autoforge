#!/usr/bin/env node
// A small but real data-keeping service — the sari-sari store POS of ./DATA.md — on Node's built-in
// SQLite. It exists so the data-intensive gates can be exercised end to end against a RUNNING system
// (tests/data-e2e.test.cjs): a system of record (products, customers, sales, sale_lines, outbox),
// derived data kept in sync through an outbox consumer (product_search, customer_search) and a batch
// job (daily_sales_report), an idempotency key, invariants enforced by the database (CHECK
// stock_on_hand >= 0, UNIQUE receipt_no, UNIQUE idempotency_key), an erasure path that reaches the
// derived copies, and expand/contract migrations applied at boot.
//
//   PORT=0 DB_FILE=./pos.sqlite node server.cjs      → prints `listening <port>` when ready
//
// Several processes may share one DB_FILE (busy_timeout + BEGIN IMMEDIATE): that is how the e2e test
// gets real cross-process contention for the lost-update, uniqueness and idempotency checks.
'use strict';
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'pos.sqlite');
const MIGRATIONS = process.env.MIGRATIONS_DIR || path.join(__dirname, 'migrations');
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 10000;');

class HttpError extends Error { constructor(code, body) { super(body.error); this.code = code; this.body = body; } }
const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
const now = () => new Date().toISOString();

function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(db.prepare('SELECT name FROM schema_migrations').all().map(r => r.name));
  for (const f of fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    tx(() => { db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')); db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(f, now()); });
  }
}
migrate();

const q = {
  product: db.prepare('SELECT * FROM products WHERE id = ?'),
  decrement: db.prepare('UPDATE products SET stock_on_hand = stock_on_hand - ? WHERE id = ? AND stock_on_hand >= ?'),
  saleByKey: db.prepare('SELECT * FROM sales WHERE idempotency_key = ?'),
  nextReceipt: db.prepare('SELECT COALESCE(MAX(receipt_no), 0) + 1 AS n FROM sales WHERE store_id = ?'),
  insertSale: db.prepare('INSERT INTO sales (store_id, receipt_no, customer_id, total_cents, sold_at, idempotency_key, channel) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  insertLine: db.prepare('INSERT INTO sale_lines (sale_id, product_id, qty, price_cents) VALUES (?, ?, ?, ?)'),
  sale: db.prepare('SELECT * FROM sales WHERE id = ?'),
  lines: db.prepare('SELECT product_id, qty, price_cents FROM sale_lines WHERE sale_id = ?'),
  salesOfDay: db.prepare('SELECT id, receipt_no, total_cents, sold_at FROM sales WHERE store_id = ? AND sold_at >= ? AND sold_at < ? ORDER BY sold_at'),
  outbox: db.prepare('INSERT INTO outbox (topic, payload, created_at) VALUES (?, ?, ?)'),
  pending: db.prepare('SELECT id, topic, payload FROM outbox WHERE consumed_at IS NULL ORDER BY id'),
  consume: db.prepare('UPDATE outbox SET consumed_at = ? WHERE id = ?'),
  rewind: db.prepare('UPDATE outbox SET consumed_at = NULL'),
  upsertSearch: db.prepare('INSERT INTO product_search (product_id, name, price_cents, source_outbox_id) VALUES (?, ?, ?, ?) ON CONFLICT(product_id) DO UPDATE SET name = excluded.name, price_cents = excluded.price_cents, source_outbox_id = excluded.source_outbox_id'),
  upsertCustomerSearch: db.prepare('INSERT INTO customer_search (customer_id, name, phone) VALUES (?, ?, ?) ON CONFLICT(customer_id) DO UPDATE SET name = excluded.name, phone = excluded.phone'),
  deleteCustomerSearch: db.prepare('DELETE FROM customer_search WHERE customer_id = ?'),
  search: db.prepare('SELECT product_id AS id, name, price_cents FROM product_search WHERE name LIKE ? ORDER BY name LIMIT 50'),
  report: db.prepare('SELECT day, sales_count, total_cents FROM daily_sales_report WHERE day = ?'),
  rebuildReport: db.prepare('INSERT INTO daily_sales_report (day, sales_count, total_cents, built_at) SELECT ?, COUNT(*), COALESCE(SUM(total_cents), 0), ? FROM sales WHERE sold_at >= ? AND sold_at < ? ON CONFLICT(day) DO UPDATE SET sales_count = excluded.sales_count, total_cents = excluded.total_cents, built_at = excluded.built_at'),
  insertProduct: db.prepare('INSERT INTO products (barcode, name, price_cents, stock_on_hand) VALUES (?, ?, ?, ?)'),
  insertCustomer: db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)'),
  customer: db.prepare('SELECT * FROM customers WHERE id = ?'),
  anonymizeSales: db.prepare('UPDATE sales SET customer_id = NULL WHERE customer_id = ?'),
  deleteCustomer: db.prepare('DELETE FROM customers WHERE id = ?'),
};
const EXPORTS = {
  products: 'SELECT id, name, price_cents FROM products ORDER BY id',
  product_search: 'SELECT product_id AS id, name, price_cents FROM product_search ORDER BY product_id',
  'sales-by-day': 'SELECT substr(sold_at, 1, 10) AS day, COUNT(*) AS sales_count, SUM(total_cents) AS total_cents FROM sales GROUP BY day ORDER BY day',
  daily_sales_report: 'SELECT day, sales_count, total_cents FROM daily_sales_report ORDER BY day',
  customers: 'SELECT id, name, phone FROM customers ORDER BY id',
  customer_search: 'SELECT customer_id AS id, name, phone FROM customer_search ORDER BY customer_id',
  sales: 'SELECT id, store_id, receipt_no, customer_id, total_cents, sold_at, channel FROM sales ORDER BY id',
};

const json = (res, code, body) => { const s = JSON.stringify(body); res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) }); res.end(s); };
const readBody = req => new Promise((resolve, reject) => {
  const c = []; let n = 0;
  req.on('data', d => { c.push(d); n += d.length; if (n > 1e6) { reject(new HttpError(413, { error: 'body over 1 MB' })); req.destroy(); } });
  req.on('end', () => { try { resolve(c.length ? JSON.parse(Buffer.concat(c).toString('utf8')) : {}); } catch { reject(new HttpError(400, { error: 'body is not JSON' })); } });
  req.on('error', reject);
});
const dayRange = day => { if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) throw new HttpError(400, { error: 'day=YYYY-MM-DD' }); const a = day + 'T00:00:00.000Z'; return [a, new Date(Date.parse(a) + 86400000).toISOString()]; };

// POST /sales — one atomic unit: stock decrement with the invariant in the WHERE and in a CHECK, a
// per-store receipt number serialized by the writer lock, the idempotency key as a UNIQUE column, and
// the outbox row in the same transaction (never a dual write). Any refusal throws → ROLLBACK.
function recordSale(key, body) {
  const existing = q.saleByKey.get(key);
  if (existing) return { code: 200, body: { id: existing.id, receipt_no: existing.receipt_no, total_cents: existing.total_cents, replay: true } };
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!lines.length) throw new HttpError(400, { error: 'lines required' });
  const store = Number(body.store_id || 1);
  let total = 0; const priced = [];
  for (const l of lines) {
    const p = q.product.get(Number(l.product_id)); const qty = Number(l.qty);
    if (!p || !Number.isInteger(qty) || qty <= 0) throw new HttpError(400, { error: 'bad line' });
    if (q.decrement.run(qty, p.id, qty).changes !== 1) throw new HttpError(409, { error: 'insufficient stock', product_id: p.id });
    total += p.price_cents * qty; priced.push([p.id, qty, p.price_cents]);
  }
  const receipt = q.nextReceipt.get(store).n;
  const saleId = Number(q.insertSale.run(store, receipt, body.customer_id ? Number(body.customer_id) : null, total, now(), key, body.channel || 'counter').lastInsertRowid);
  for (const [pid, qty, price] of priced) q.insertLine.run(saleId, pid, qty, price);
  q.outbox.run('sale.recorded', JSON.stringify({ sale_id: saleId }), now());
  return { code: 201, body: { id: saleId, receipt_no: receipt, total_cents: total } };
}
function drain() {                                                 // the single writer of the derived tables; idempotent by primary key, so a replay is harmless
  let n = 0;
  for (const ev of q.pending.all()) {
    const p = JSON.parse(ev.payload);
    tx(() => {
      if (ev.topic === 'product.upserted') { const pr = q.product.get(p.product_id); if (pr) q.upsertSearch.run(pr.id, pr.name, pr.price_cents, ev.id); }
      else if (ev.topic === 'customer.upserted') { const c = q.customer.get(p.customer_id); if (c) q.upsertCustomerSearch.run(c.id, c.name, c.phone); }
      else if (ev.topic === 'customer.deleted') q.deleteCustomerSearch.run(p.customer_id);
      q.consume.run(now(), ev.id);
    });
    n++;
  }
  return n;
}
function exportTsv(name) {
  const sql = EXPORTS[name]; if (!sql) throw new HttpError(404, { error: 'unknown export' });
  const rows = db.prepare(sql).all(); if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  return [cols.join('\t'), ...rows.map(r => cols.map(c => r[c] === null ? '' : String(r[c])).join('\t'))].join('\n') + '\n';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost'), p = url.pathname, qs = url.searchParams;
  let m;
  try {
    if (req.method === 'GET' && p === '/healthz') return json(res, 200, { ok: true, pid: process.pid });
    if (req.method === 'POST' && p === '/sales') {
      const key = req.headers['idempotency-key']; if (!key) throw new HttpError(400, { error: 'Idempotency-Key header required' });
      const body = await readBody(req); const r = tx(() => recordSale(String(key), body)); return json(res, r.code, r.body);
    }
    if (req.method === 'GET' && (m = /^\/sales\/(\d+)$/.exec(p))) { const s = q.sale.get(Number(m[1])); if (!s) throw new HttpError(404, { error: 'not found' }); return json(res, 200, { ...s, lines: q.lines.all(s.id) }); }
    if (req.method === 'GET' && p === '/sales') { const [a, b] = dayRange(qs.get('day')); return json(res, 200, q.salesOfDay.all(Number(qs.get('store') || 1), a, b)); }
    if (req.method === 'GET' && p === '/products') return json(res, 200, q.search.all('%' + (qs.get('q') || '') + '%'));
    if (req.method === 'GET' && p === '/reports/daily') { const r = q.report.get(qs.get('day')); if (!r) throw new HttpError(404, { error: 'not built yet' }); return json(res, 200, r); }
    if (req.method === 'DELETE' && (m = /^\/customers\/(\d+)$/.exec(p))) {
      const id = Number(m[1]);
      tx(() => { if (!q.customer.get(id)) throw new HttpError(404, { error: 'not found' }); q.anonymizeSales.run(id); q.deleteCustomer.run(id); q.outbox.run('customer.deleted', JSON.stringify({ customer_id: id }), now()); });
      res.writeHead(204); return res.end();
    }
    if (req.method === 'POST' && p === '/admin/seed') {
      const body = await readBody(req);
      return json(res, 201, tx(() => ({
        products: (body.products || []).map(x => { const id = Number(q.insertProduct.run(x.barcode, x.name, x.price_cents, x.stock).lastInsertRowid); q.outbox.run('product.upserted', JSON.stringify({ product_id: id }), now()); return id; }),
        customers: (body.customers || []).map(x => { const id = Number(q.insertCustomer.run(x.name, x.phone).lastInsertRowid); q.outbox.run('customer.upserted', JSON.stringify({ customer_id: id }), now()); return id; }),
      })));
    }
    if (req.method === 'POST' && p === '/admin/outbox/drain') return json(res, 200, { consumed: drain() });
    if (req.method === 'POST' && p === '/admin/outbox/rewind') { q.rewind.run(); return json(res, 200, { ok: true }); }
    if (req.method === 'POST' && p === '/admin/report/rebuild') { const day = qs.get('day'); const [a, b] = dayRange(day); tx(() => q.rebuildReport.run(day, now(), a, b)); return json(res, 200, q.report.get(day)); }
    if (req.method === 'GET' && (m = /^\/admin\/export\/([a-z_-]+)$/.exec(p))) { res.writeHead(200, { 'content-type': 'text/tab-separated-values' }); return res.end(exportTsv(m[1])); }
    throw new HttpError(404, { error: 'no route' });
  } catch (e) {
    if (e instanceof HttpError) return json(res, e.code, e.body);
    if (/CHECK constraint failed/.test(e.message)) return json(res, 409, { error: 'invariant violated: ' + e.message });
    json(res, 500, { error: e.message });
  }
});
server.listen(Number(process.env.PORT || 0), '127.0.0.1', () => { process.stdout.write(`listening ${server.address().port}\n`); });
process.on('SIGTERM', () => { server.close(() => { db.close(); process.exit(0); }); });
