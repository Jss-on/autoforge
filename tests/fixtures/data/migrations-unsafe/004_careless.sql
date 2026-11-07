ALTER TABLE sales RENAME COLUMN total_cents TO amount_cents;
ALTER TABLE sales ADD COLUMN cashier_id BIGINT NOT NULL;
CREATE INDEX sales_cashier_idx ON sales (cashier_id);
ALTER TABLE products ALTER COLUMN price_cents TYPE NUMERIC(12,2);
DROP TABLE stock_movements;
