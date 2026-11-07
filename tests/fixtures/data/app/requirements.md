# Requirements — sari-sari POS (SQLite sample)

The traceability universe of the end-to-end data test (`tests/data-e2e.test.cjs`); each id is
satisfied by one `data` acceptance row with evidence.

- FR-1 A cashier records a sale of one or more products; stock is decremented and a receipt number is issued.
- FR-2 A sale is readable by id with its lines; the sales of a day are listable.
- FR-3 Products are searchable by name through the derived search table; the daily report is served from the derived report table.
- FR-4 A customer can be erased on request.
- NFR-1 The load model is pinned and the load test runs at the pinned peak.
- NFR-2 Response time p50/p95/p99 and the error ratio stay within `DATA.md slo` under an open arrival-rate load.
- NFR-3 Every hot query uses an index (no full scan of a large table).
- NFR-4 Concurrent checkouts never oversell; receipt numbers stay unique; a retried request applies once.
- NFR-5 An acknowledged sale survives a killed process.
- NFR-6 Schema changes follow expand/contract and lint clean.
- NFR-7 A backup restores into a fresh directory and the restored service answers.
- NFR-8 Derived data reconciles with its source after the consumer and the report job run.
- NFR-9 Erasure leaves no reference to the customer in any table, derived copies included.
