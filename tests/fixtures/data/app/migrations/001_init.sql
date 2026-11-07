-- expand: the first shape. Invariants live in the database: CHECK, UNIQUE, foreign keys.
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  barcode TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  stock_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (stock_on_hand >= 0)
);
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT
);
CREATE TABLE sales (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  receipt_no INTEGER NOT NULL,
  customer_id INTEGER REFERENCES customers (id) ON DELETE SET NULL,
  total_cents INTEGER NOT NULL DEFAULT 0,
  sold_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  legacy_note TEXT,
  UNIQUE (store_id, receipt_no)
);
CREATE INDEX sales_sold_at_idx ON sales (store_id, sold_at);
CREATE TABLE sale_lines (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales (id),
  product_id INTEGER NOT NULL REFERENCES products (id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  price_cents INTEGER NOT NULL
);
CREATE INDEX sale_lines_sale_idx ON sale_lines (sale_id);
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY,
  topic TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX outbox_pending_idx ON outbox (consumed_at, id);
-- derived: written only by the outbox consumer and the report job, never by request handlers
CREATE TABLE product_search (
  product_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  source_outbox_id INTEGER NOT NULL
);
CREATE TABLE customer_search (
  customer_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT
);
CREATE TABLE daily_sales_report (
  day TEXT PRIMARY KEY,
  sales_count INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  built_at TEXT NOT NULL
);
