---
name: sari-sari POS (SQLite sample)
kind: operational
workload:
  reads_per_s: 40
  writes_per_s: 10
  read_write_ratio: "4:1"
  concurrent_users: 20
  dataset_gb: 0.1
  growth: "+0.2 GB/yr for one store; a second store doubles it, nothing more is planned"
  hot_keys: "the end-of-day report reads one day of sales once; products are read on every sale"
slo:
  response_time_ms: { p50: 50, p95: 200, p99: 500 }
  error_rate_max: 0.01
  window: 30d
  load_model: open
  samples_min: 300
  measured_at: "client side (data-load.cjs), queueing included"
model:
  primary: relational
  store: sqlite@3 (node:sqlite, WAL, synchronous=FULL)
  normalization: normalized
  schema: tests/fixtures/data/app/migrations
  indexes:
    sales_sold_at_idx:
      columns: [store_id, sold_at]
      query: "GET /sales?day= — the sales of one store for one day (SC-3 end-of-day)"
    sale_lines_sale_idx:
      columns: [sale_id]
      query: "GET /sales/:id — the lines of one sale (SC-1 receipt)"
    outbox_pending_idx:
      columns: [consumed_at, id]
      query: "POST /admin/outbox/drain — the unconsumed outbox rows in order"
integrity:
  isolation: serializable
  transactions:
    checkout:
      invariant: "stock_on_hand >= 0 for every line; receipt_no unique per store; total = sum(lines)"
      technique: "BEGIN IMMEDIATE; UPDATE products … WHERE id = ? AND stock_on_hand >= ?; CHECK (stock_on_hand >= 0); UNIQUE (store_id, receipt_no)"
    erase_customer:
      invariant: "no sale references a deleted customer; the derived customer_search row is gone"
      technique: "one transaction: sales.customer_id := NULL, DELETE customers, outbox customer.deleted; the consumer removes the search row"
  idempotency:
    key: "Idempotency-Key header on POST /sales, stored as sales.idempotency_key UNIQUE; a replay returns the recorded sale"
  constraints: [unique(barcode), unique(store_id, receipt_no), unique(idempotency_key), check(stock_on_hand >= 0), check(price_cents >= 0), check(qty > 0)]
evolution:
  encoding: json
  compatibility: both
  migrations: expand-contract
  tool: "migrations/*.sql applied in order at boot, recorded in schema_migrations"
durability:
  replication: none
  failover: none
  backup:
    frequency: "VACUUM INTO a dated copy after every end-of-day report (a consistent snapshot under WAL)"
    rpo_s: 86400
    rto_s: 300
    drill: "boot the server against the copy in a fresh directory; the recorded sales must answer"
derived:
  product_search:
    source: products
    mechanism: outbox
    freshness_s: 60
    reconcile: "data-score.cjs reconcile <export products> <export product_search> --key id"
  customer_search:
    source: customers
    mechanism: outbox
    freshness_s: 60
    reconcile: "data-score.cjs reconcile <export customers> <export customer_search> --key id"
  daily_sales_report:
    source: sales
    mechanism: batch
    freshness_s: 3600
    reconcile: "data-score.cjs reconcile <export sales-by-day> <export daily_sales_report> --key day"
retention:
  personal_data:
    customer_phone:
      purpose: "SMS receipts and credit reminders"
      retention: "2 years after the last sale"
  deletion:
    sla_days: 30
    covers_derived: true
    path: "DELETE /customers/:id — anonymizes the sales, deletes the row, and the outbox consumer removes customer_search"
  minimization: "no card numbers, no addresses; receipts carry a receipt number, never a name"
---

# Data architecture — sari-sari POS (SQLite sample)

## Systems of record and derived data

`products`, `customers`, `sales`, `sale_lines` and the `outbox` are the system of record; every
fact is written there first, in one transaction. `product_search` and `customer_search` are
derived through the outbox consumer, `daily_sales_report` through the report job; all three can
be dropped and rebuilt from the tables.

## Dataflow

A request handler writes the tables and an outbox row in the same transaction. The consumer reads
unconsumed outbox rows in id order and upserts the search tables (idempotent by primary key); the
report job recomputes one day from `sales`.

## Consistency and transactions

SQLite serializes writers; every multi-step write runs inside `BEGIN IMMEDIATE`, and the stock
invariant is in the `UPDATE … WHERE stock_on_hand >= ?` and in a `CHECK`, never only in code.

## Evolution

Expand/contract: `002` adds a nullable column with a default; `003` drops a column only after the
release that stopped reading it, under a `contract-step` annotation.

## Durability and recovery

WAL with `synchronous = FULL`: an acknowledged sale survives a killed process. No replica; the
daily `VACUUM INTO` copy is the backup, booted from a fresh directory for the drill.

## Retention and privacy

Only a customer's name and phone are personal data; `DELETE /customers/:id` removes the row,
detaches the sales and, through the outbox, the derived search row.

## Trade-offs

Rejected: a client-side search over `products` (would couple search latency to the write path),
dual-writing `product_search` from the handler (drifts silently), a document store (the report
is a join and an aggregate).
