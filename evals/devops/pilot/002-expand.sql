ALTER TABLE forge_notes ADD COLUMN label text;
-- Old reads/inserts use explicit columns, and new code accepts a NULL label.
-- Retain the old columns throughout the rollback window; no destructive down migration.
