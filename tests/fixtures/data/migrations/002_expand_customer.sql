/* expand: nullable first, backfill in batches, then constrain */
ALTER TABLE sales ADD COLUMN customer_id BIGINT;
ALTER TABLE sales ADD CONSTRAINT sales_customer_fk FOREIGN KEY (customer_id) REFERENCES customers (id) NOT VALID;
ALTER TABLE sales ADD COLUMN channel TEXT NOT NULL DEFAULT 'counter';
UPDATE sales SET channel = 'counter' WHERE channel IS NULL AND id BETWEEN 1 AND 10000;
-- the safe path to NOT NULL: a CHECK that is validated without a long lock, then SET NOT NULL in a later release
ALTER TABLE sales ADD CONSTRAINT sales_channel_nn CHECK (channel IS NOT NULL) NOT VALID;
