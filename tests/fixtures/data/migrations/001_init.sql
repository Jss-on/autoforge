-- expand step: the first shape
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  barcode TEXT NOT NULL,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  stock_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (stock_on_hand >= 0)
);
CREATE UNIQUE INDEX CONCURRENTLY products_barcode_idx ON products (barcode);
CREATE TABLE sales (
  id BIGSERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL,
  receipt_no INTEGER NOT NULL,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_cents INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX CONCURRENTLY sales_store_day_idx ON sales (store_id, sold_at);
