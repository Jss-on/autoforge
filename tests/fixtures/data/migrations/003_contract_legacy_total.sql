-- contract-step: release 1.3.0 (2026-10-20) stopped reading sales.legacy_total; all readers deployed
ALTER TABLE sales DROP COLUMN legacy_total;
ALTER TABLE sales VALIDATE CONSTRAINT sales_customer_fk;
