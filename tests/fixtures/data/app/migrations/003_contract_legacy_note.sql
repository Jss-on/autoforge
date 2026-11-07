-- contract-step: release 1.2.0 (2026-11-01) stopped reading sales.legacy_note; every reader is deployed
ALTER TABLE sales DROP COLUMN legacy_note;
