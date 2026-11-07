---
name: sari-sari POS
kind: operational
workload:
  reads_per_s: 40
  writes_per_s: 6
  read_write_ratio: "7:1"
  concurrent_users: 25
  dataset_gb: 2
  growth: "+1.5 GB/yr (1 store, 600 sales/day); plan to 10 stores, not 1000"
  hot_keys: "end-of-day report reads the whole day's sales once per store"
slo:
  response_time_ms: { p50: 120, p95: 400, p99: 900 }
  error_rate_max: 0.001
  availability: 0.995
  window: 30d
  load_model: open
  samples_min: 1000
  measured_at: "client side (Playwright and k6), queueing included"
model:
  primary: relational
  store: postgres@16
  normalization: normalized
  schema: prisma/schema.prisma
  indexes:
    sales_by_store_day:
      columns: [store_id, sold_at]
      query: "SC-3 end-of-day report: sales of one store for one day"
    sale_lines_by_sale:
      columns: [sale_id]
      query: "SC-1 receipt view: the lines of one sale"
    products_by_barcode:
      columns: [barcode]
      query: "SC-1 scan: product by barcode (unique)"
integrity:
  isolation: read-committed
  transactions:
    checkout:
      invariant: "stock_on_hand >= 0 for every line; sale total equals the sum of its lines"
      technique: "single transaction; SELECT FOR UPDATE on the product rows; CHECK (stock_on_hand >= 0)"
    void_sale:
      invariant: "a sale is voided at most once and stock is restored exactly once"
      technique: "compare-and-set on sale.status (open -> voided)"
  idempotency:
    key: "Idempotency-Key header on POST /sales, stored with the sale for 24h"
  constraints: [unique(barcode), unique(store_id, receipt_no), check(stock_on_hand >= 0)]
evolution:
  encoding: json
  compatibility: both
  migrations: expand-contract
  tool: prisma migrate
durability:
  replication: single-leader-async
  replicas: 1
  lag_budget_s: 5
  replica_reads: read-your-writes
  reason: "reports may read the replica; the cashier's own sale is read from the leader"
  failover: manual
  backup:
    frequency: "daily base + continuous WAL"
    rpo_s: 300
    rto_s: 1800
    drill: "quarterly restore into an isolated database"
derived:
  daily_sales_report:
    source: sales
    mechanism: batch
    freshness_s: 3600
    reconcile: "node scripts/reconcile-report.cjs <day> compares report totals with SUM(sales) for that day"
  product_search:
    source: products
    mechanism: outbox
    freshness_s: 10
    reconcile: "npm run reconcile:search exports products and the index by id and diffs name/price"
retention:
  personal_data:
    customer_phone:
      purpose: "SMS receipt and credit (utang) reminders"
      retention: "2 years after the last sale"
    cashier_accounts:
      purpose: "login and audit trail of who sold what"
      retention: "7 years (tax audit) then anonymized"
  deletion:
    sla_days: 30
    covers_derived: true
    path: "DELETE /customers/:id purges the row, the search index entry and the report cache; backups age out in 35 days"
  minimization: "no customer names on receipts unless asked; no card numbers stored"
---

# Data architecture — sari-sari POS

## Systems of record and derived data

`sales`, `sale_lines`, `products`, `stock_movements`, `customers`, `cashiers` in Postgres are the
systems of record: every fact is written there first and exactly once. The daily sales report and
the product search index are derived; both can be deleted and rebuilt from the tables.

## Dataflow

Checkout writes the sale and its lines in one transaction and inserts an outbox row; a relay reads
the outbox and updates the search index (at-least-once, idempotent by product id). The report job
runs hourly and recomputes the day from `sales`.

## Consistency and transactions

Postgres read committed is enough for lookups; the two read-modify-write operations are protected
explicitly (row locks for stock, compare-and-set for voiding). Receipt numbers are unique per store
through a unique index, never through application checks.

## Evolution

Expand/contract: add nullable columns, backfill in batches, then constrain; drop only after the
release that stopped reading the column has shipped. JSON payloads tolerate unknown fields.

## Durability and recovery

One async replica; reports may read it within a 5 s lag budget, the cashier's own sale is read from
the leader. Daily base backup plus WAL; RPO 5 min, RTO 30 min, drilled quarterly.

## Retention and privacy

Phones for reminders only, two years after the last sale; cashier accounts seven years for the tax
audit, then anonymized. A deletion request purges the row, the index entry and the report cache.

## Trade-offs

Rejected: a document store (joins dominate the report), synchronous replication (a 1-store shop
cannot pay the write latency), dual-writing the search index (would drift silently).
