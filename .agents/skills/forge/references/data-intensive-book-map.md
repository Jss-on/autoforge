# DDIA 2nd ed. → forge: the coverage map

Every section of Kleppmann & Riccomini, *Designing Data-Intensive Applications*, 2nd ed. (O'Reilly
2026; the table of contents, pp. ix-xv) and where it lives in forge. Companion to
`references/data-intensive-protocol.md` (cited as §n). This map is the answer to "did everything in
the book land?": each row names a home or says why the harness leaves it to the stack.

**Status legend**
- **gate** — a mechanical verdict decides it (`data-score.cjs`, `score-build.sh`, `score-requirements.sh`).
- **record** — an owner decision the `DATA.md` record carries (linted; traced by a `data` row).
- **guide** — protocol or command prose that shapes the design and the review (anti-pattern rows, phase text).
- **research** — informs the §5 metric decision or the stack decision, not a rule of its own.
- **stack** — decided by `references/stack-selection-protocol.md` (the datastore / hosting / topology choice), cited in `DATA.md`, never re-argued there.
- Every row has one of the five homes above; no section is left as "not applicable". Engine and vendor internals are not re-implemented — their application-visible effect is what forge pins.

## Part I — Foundations of data systems

### Chapter 1 — Trade-offs in data systems architecture (pp. 1-32)

| section (page) | forge home | status |
|---|---|---|
| Operational versus analytical systems (3) | `DATA.md kind: operational \| analytical \| mixed`; §2.3 "analytics gets its own column store" | record |
| Characterizing transaction processing and analytics (5) | §2.3; `workload.read_write_ratio`, `hot_keys` | record |
| Data warehousing (7) | §2.7 warehouse/lake as a *derived* system fed by CDC/ETL; §8 "analytics on the OLTP database" | guide |
| Systems of record and derived data (10) | §0 premise; `DATA.md ## Systems of record and derived data` (required prose); every `derived.*` entry names its `source` | record |
| Cloud versus self-hosting; pros and cons of cloud services (12-14) | stack-selection protocol §2 inputs (hosting, residency, budget) and the `hosting:` acceptance definition | stack |
| Cloud native system architecture (14) | stack-selection drivers (separation of storage and compute, object storage, managed services); HLD in `build` Phase 4 | stack |
| Operations in the cloud era (17) | `references/operational-recovery.md`, `RUNBOOK.md` (build Phase 8), monitoring rows | guide |
| Distributed versus single-node systems; problems with distributed systems (19-21) | §0 "single machine first"; §2.1 shard only for volume or write throughput; Tier B5 | guide |
| Microservices and serverless (21) | HLD module boundaries (build Phase 4); stack-selection "microservice/polyglot envy" failure-mode check | stack |
| Cloud computing versus supercomputing (23) | the fault model forge assumes: commodity nodes that fail partially and are replaced while the system keeps serving, never a whole-job checkpoint-restart (§2.6 fault model; the failover and restore rows) | guide |
| Data systems, law, and society (24) | §2.8 retention, erasure reaching derived data and models, decisions about people | record |
| Summary (25) | the chapter's rules in one place; each is a row above, and §0 restates the premises in design order | guide |

### Chapter 2 — Defining nonfunctional requirements (pp. 33-64)

| section (page) | forge home | status |
|---|---|---|
| Case study: social network home timelines; materializing and updating timelines (34-35) | §2.7 derived data with a single writer; `workload.hot_keys` (the celebrity); §8 "polling for changes" | guide |
| Describing performance; latency and response time (37-39) | §2.2; metric row 1 (client side, queueing included) | gate |
| Average, median, and percentiles; use of response-time metrics (40-42) | `slo.response_time_ms { p50, p95, p99 }`, no mean (lint error), no averaged percentiles; `DATA_SLO` | gate |
| Reliability and fault tolerance; hardware and software faults (43-46) | §0 "fault tolerance is bounded to a stated number and type of faults"; `durability` group; restore drill (row 7) | record |
| Humans and reliability (47) | operability: runbook "If I do X, Y will happen", staged rollout and rollback in `ship`, blameless defect records in the loop | guide |
| Scalability; understanding load (49-50) | `workload` group (never n/a); metric row 3 (load pinned and reached) | gate |
| Shared-memory, shared-disk, and shared-nothing architectures (51) | stack-selection candidates (the datastore's architecture) | stack |
| Principles for scalability (52) | §2.1 one order of magnitude of headroom; "you're not Google" | guide |
| Maintainability: operability (53) | `monitoring` rows (histogram, lag, freshness, dead letters); `RUNBOOK.md` | gate |
| Simplicity: managing complexity (54) | ponytail discipline in `build`; `DEBT.md` | guide |
| Evolvability: making change easy (55) | `evolution` group; metric row 6 | gate |
| Summary (56) | the chapter's rules in one place; each is a row above, and §0 restates the premises in design order | guide |

### Chapter 3 — Data models and query languages (pp. 65-113)

| section (page) | forge home | status |
|---|---|---|
| Relational versus document models; the object-relational mismatch (67-71) | §2.3 "the deciding variable is the shape of the relationships"; `model.primary` | record |
| Normalization, denormalization, and joins (72-74) | `model.normalization` (`denormalized` needs a reason and makes every copy derived data) | record |
| Many-to-one and many-to-many relationships (75) | §3 question "do you need to look at a relationship from both sides?" | record |
| Stars and snowflakes: schemas for analytics (77) | `kind: analytical` → a star/snowflake schema in the warehouse fed from the system of record (§2.3) | guide |
| When to use which model (80) | §2.3 decision table; `model.primary` enumeration | record |
| Graph-like data models; property graphs; Cypher; graph queries in SQL; triple stores and SPARQL; Datalog (84-98) | `model.primary: graph` when questions hop through several links (§3); the query language is the stack's | record / stack |
| GraphQL (98) | service API compatibility rules in §2.5 (requests backward-, responses forward-compatible) | guide |
| Event sourcing and CQRS (101) | `model.primary: event log + derived views`; `derived.mechanism: event-log`; §2.7 deterministic, idempotent consumers | record |
| DataFrames, matrices, and arrays (105) | `kind: analytical` workloads; ML features and models are derived data (§2.7) | guide |
| Summary (107) | the chapter's rules in one place; each is a row above, and §0 restates the premises in design order | guide |

### Chapter 4 — Storage and retrieval (pp. 115-160)

| section (page) | forge home | status |
|---|---|---|
| Storage and indexing for OLTP; log-structured storage; B-trees; comparing B-trees and LSM-trees (116-131) | §2.3 "LSM for write-heavy, B-tree for read-heavy, benchmark your own workload"; stack-selection confirmation spike | stack |
| Multicolumn and secondary indexes; storing values within the index (132-133) | `model.indexes` (one per hot access pattern, naming its query); `DATA_INDEXES` over `EXPLAIN` plans (row 4) | gate |
| Keeping everything in memory (133) | stack choice; durability still requires an acknowledged write to survive a crash (row 5) | stack |
| Data storage for analytics; cloud data warehouses; column-oriented storage; query execution (134-142) | `kind: analytical`; §2.3 column store fed from the system of record; engine internals are the stack's | stack |
| Materialized views and data cubes (143) | every materialized view is a `derived.*` entry with source, mechanism, freshness, reconcile (§2.7) | record |
| Multidimensional and full-text indexes; full-text search (145-146) | `model.primary: search` or a derived search index (`derived.product_search` in the worked example) | record |
| Vector embeddings (147) | `model.primary: vector`; embeddings are derived data and inherit the deletion obligation (§2.8) | record |
| Summary (150) | the chapter's rules in one place; each is a row above, and §0 restates the premises in design order | guide |

### Chapter 5 — Encoding and evolution (pp. 161-196)

| section (page) | forge home | status |
|---|---|---|
| Formats for encoding data; language-specific formats; JSON, XML and binary variants; Protocol Buffers; Avro; the merits of schemas (163-177) | `evolution.encoding`, `evolution.compatibility` (backward + forward); §2.5 schema registry and tag/field rules | record |
| Modes of dataflow: through databases (178) | §2.5 "data outlives code"; expand/contract; `MIGRATION_SAFETY` (row 6); older code preserves unknown fields | gate |
| Dataflow through services: REST and RPC (180) | §2.5 API compatibility; public APIs versioned and kept | guide |
| Durable execution and workflows (187) | §2.5: a workflow step with a side effect is idempotent and replay-safe; the idempotency key of §2.4 | guide |
| Event-driven architectures (189) | `derived.mechanism: outbox \| cdc \| event-log`; §2.7 single writer | record |
| Summary (191) | the chapter's rules in one place; each is a row above, and §0 restates the premises in design order | guide |

## Part II — Distributed data

### Chapter 6 — Replication (pp. 197-249)

| section (page) | forge home | status |
|---|---|---|
| Single-leader replication; synchronous versus asynchronous (198-200) | `durability.replication`; §2.6 "a confirmed write can be lost on failover — decide the tolerance" | record |
| Setting up new followers; handling node outages (201-205) | `durability.failover`; §2.6 fence the old leader; backups beside replication (p.198) | record |
| Implementation of replication logs (206) | the stack record names the log type (statement / WAL shipping / logical / trigger); `durability.replication` cites it and `evolution` plans the rolling upgrade that log type allows (§2.6) | record · stack |
| Problems with replication lag; solutions (209-214) | `durability.lag_budget_s`, `replica_reads: read-your-writes \| eventual`; row 7 (`replay_lag` exported and within budget) | gate |
| Multi-leader replication; geographically distributed operation (215-219) | `durability.replication: multi-leader`; §3 "survive a whole region?" question; §2.6 cost of multi-region | record |
| Sync engines and local-first software (220) | §3 "keep working with no internet and merge later?"; `multi-leader` with CRDT or application-level merge (§2.6) | record |
| Dealing with conflicting writes (222) | §8 anti-pattern "LWW on wall clocks"; version vectors or a single decider | guide |
| Leaderless replication; writing when a node is down; performance; multi-region; detecting concurrent writes (229-243) | `durability.replication: leaderless`; quorums are the stack's; §8 timestamp-ordering row | record |
| Summary (243) | the chapter's rules in one place; each is a row above, and §0 restates the premises in design order | guide |

### Chapter 7 — Sharding (pp. 251-276)

| section (page) | forge home | status |
|---|---|---|
| Pros and cons of sharding (253) | §2.1 "shard only for data volume or write throughput; replicate for reads" | guide |
| Sharding for multitenancy (254) | Tier B2 tenant isolation test | gate (when multitenant) |
| Sharding of key-value data; by key range; by hash of key (255-262) | §2.1 rules (never a monotonic first key element; hash the key, never `hash mod N`); §8 rows | guide |
| Skewed workloads and relieving hot spots (263) | `workload.hot_keys`; Tier B1 shard skew | record |
| Operations: automatic versus manual rebalancing; request routing (264-267) | the stack's (`stack-decision.md` records the datastore's rebalancing and routing model) | stack |
| Sharding and secondary indexes: local versus global (268-271) | §2.1: a sharded secondary index is local (scatter/gather reads) or global (asynchronously updated) — name which in `model.indexes` | guide |
| Summary (271) | the chapter's rules in one place; each is a row above, and §0 restates the premises in design order | guide |

### Chapter 8 — Transactions (pp. 277-343)

| section (page) | forge home | status |
|---|---|---|
| What exactly is a transaction; the meaning of ACID (278-283) | §2.4 declare the isolation level actually in force; §5 "ACID compliant is not proof" | record |
| Single-object and multi-object operations (284) | `integrity.transactions` names every multi-object operation with its invariant | record |
| Weak isolation levels: read committed; snapshot isolation and repeatable read (288-298) | `integrity.isolation` enum; §2.4 vendor meanings differ | record |
| Preventing lost updates (299) | row 5 concurrent test (N increments → exactly N); techniques: atomic update, `SELECT FOR UPDATE`, CAS | gate |
| Write skew and phantoms (303) | row 5 (concurrent claims → exactly one winner); serializable or materialized conflicts | gate |
| Serializability: actual serial execution; two-phase locking; serializable snapshot isolation (308-322) | the stack's implementation; §2.4 "pick serializable when you cannot tell a weaker level is safe" | stack |
| Distributed transactions; two-phase commit; across different systems; database-internal (323-333) | §0 integrity without distributed transactions; §2.7 outbox/CDC instead of dual writes | guide |
| Exactly-once message processing revisited (334) | §2.4 processed-message ids in the same transaction as the effect; row 5 idempotent retry | gate |
| Summary (335) | the chapter's rules in one place; each is a row above, and §0 restates the premises in design order | guide |

### Chapter 9 — The trouble with distributed systems (pp. 345-399)

| section (page) | forge home | status |
|---|---|---|
| Faults and partial failures; unreliable networks; TCP limits; network faults in practice; fault detection; timeouts and unbounded delays; synchronous versus asynchronous networks (346-357) | §0 "a timeout never means not processed"; retries need idempotence (§2.4); Tier B4 overload behaviour | guide |
| Unreliable clocks: monotonic versus time-of-day; synchronization and accuracy; relying on synchronized clocks (358-365) | Tier B5 (durations from a monotonic clock, offset exported); §8 "timestamp ordering of cross-node events" | gate (when distributed) |
| Process pauses (366) | Tier B5 GC-pause budget; leases need fencing | guide |
| Knowledge, truth, and lies: the majority rules; distributed locks and leases (371-376) | §0 "truth is a quorum; zombies are fenced with monotonic tokens"; `durability.failover` | guide |
| Byzantine faults (377) | not tolerated inside the trusted deployment, as the book advises; the "weak forms of lying" it does guard against are mechanical: restore digests (`operational.cjs recovery`), input validation at every trust boundary (`hardening` rows), several time sources (§2.4, §2.6) | gate · guide |
| System model and reality; formal methods and randomized testing (380-388) | §5 research (Jepsen/Elle); randomized, property-based and fault-injection tests for the distributed paths | research |
| Summary (388) | the chapter's rules in one place; each is a row above, and §0 restates the premises in design order | guide |

### Chapter 10 — Consistency and consensus (pp. 401-450)

| section (page) | forge home | status |
|---|---|---|
| Linearizability: what makes a system linearizable; relying on it; implementing it; its cost (402-416) | §2.4 strict uniqueness needs one decider; §2.6 failover without consensus is unsafe; `replica_reads: read-your-writes` | guide |
| ID generators and logical clocks; linearizable ID generators (417-424) | §2.4: unique or monotonic ids come from the database or a single decider, never from wall clocks; §8 row | guide |
| Consensus: the many faces; consensus in practice; coordination services (425-439) | the stack's (Raft/Paxos inside the datastore or a coordination service); `durability.failover: automatic` only with a proven algorithm | stack |
| Summary (440) | the chapter's rules in one place; each is a row above, and §0 restates the premises in design order | guide |

## Part III — Derived data

### Chapter 11 — Batch processing (pp. 451-485)

| section (page) | forge home | status |
|---|---|---|
| Batch processing with Unix tools; log analysis; chain of commands; sorting versus in-memory aggregation (454-457) | `derived.mechanism: batch`; immutability of inputs; §2.7 | guide |
| Distributed filesystems; object stores; distributed job orchestration (458-465) | the stack's (object storage as the lake, an orchestrator for jobs) | stack |
| Batch processing models: MapReduce; dataflow engines; shuffling; joins and grouping; query languages; DataFrames (466-475) | the application's batch jobs are deterministic and idempotent, so a failure is a re-run and the rebuild must equal live (`DATA_RECONCILE`, §2.7); join and grouping skew is the Tier B shard-skew metric; the engines themselves are the stack's | guide · gate |
| Batch use cases: analytics; machine learning; serving derived data (476-481) | §2.7 "a batch job writes nothing record-at-a-time into production — bulk load and swap"; ML models are derived data and inherit erasure (§2.8) | record |
| Summary (481) | the chapter's rules in one place; each is a row above, and §0 restates the premises in design order | guide |

### Chapter 12 — Stream processing (pp. 487-537)

| section (page) | forge home | status |
|---|---|---|
| Transmitting event streams; messaging systems; log-based message brokers (488-499) | `derived.mechanism: event-log`; consumer lag and oldest-unprocessed-event age exported (monitoring rows); dead-letter queue | gate (Tier B3) |
| Databases and streams; keeping systems in sync; change data capture (500-507) | §8 dual writes forbidden; `derived.mechanism: cdc \| outbox`; `DATA_RECONCILE` (row 8) | gate |
| State, streams, and immutability (508) | event sourcing (`model.primary: event log`); deletion in immutable logs via excision or crypto-shredding (§2.8) | record |
| Processing streams; uses of stream processing (513-517) | derived views, search indexes, alerts as `derived.*` entries with a single writer | record |
| Reasoning about time (518) | event time vs processing time; windows; late events counted (Tier B3 dropped stragglers) | gate (Tier B3) |
| Stream joins (523) | guidance: join state is derived data with a time bound; nondeterminism of stream-table joins is accepted explicitly | guide |
| Fault tolerance (526) | §2.7 deterministic idempotent consumers storing the triggering offset; effectively-once (row 5) | gate |
| Summary (529) | the chapter's rules in one place; each is a row above, and §0 restates the premises in design order | guide |

### Chapter 13 — A philosophy of streaming systems (pp. 539-583)

| section (page) | forge home | status |
|---|---|---|
| Data integration; combining specialized tools by deriving data; batch and stream processing (539-545) | §0 systems of record and derived data; §2.7 every derived dataset with source, mechanism, freshness, reconcile | record |
| Unbundling databases; composing data storage technologies; designing applications around dataflow (546-554) | §2.7 derived systems as followers of the change stream; outbox pattern in the worked example | guide |
| Observing derived state (555) | §8 "polling for changes"; push/subscribe; freshness metrics | guide |
| Aiming for correctness; the end-to-end argument for databases (561-565) | §2.4 end-to-end idempotency key enforced by a uniqueness constraint; row 5 | gate |
| Enforcing constraints (566) | §2.4 uniqueness via one decider; hard invariants vs apology workflows is the owner's call | record |
| Timeliness and integrity (571) | §0 premise; `derived.freshness_s` (timeliness) vs reconcile (integrity) | gate |
| Trust, but verify (575) | reconciliation (row 8), restore drill (row 7), `--strict-evidence`; §0 | gate |
| Summary (579) | the chapter's rules in one place; each is a row above, and §0 restates the premises in design order | guide |

### Chapter 14 — Doing the right thing (pp. 585-601)

| section (page) | forge home | status |
|---|---|---|
| Predictive analytics; bias and discrimination; responsibility and accountability; feedback loops (586-588) | §2.8 decisions about people (accountable human, explanation, correction path, proxy traits); Tier B6; §3 question | record / gate |
| Privacy and tracking; surveillance (589-590) | §2.8 minimization: "what is deliberately not stored"; `retention.minimization` | record |
| Consent and freedom of choice; privacy and use of data (591-593) | `retention.personal_data.<item>.purpose` and the optional `basis` (consent \| contract \| legal-obligation \| legitimate-interest); purpose limitation | record |
| Data as assets and power; remembering the industrial revolution (594-595) | §0 "data about people is a toxic asset" — collect less, keep it shorter | guide |
| Legislation and self-regulation (596) | `deletion.sla_days ≤ 30` (GDPR Art. 12(3), 17); domain recon's regulatory checklist in `requirements` Phase 0 | gate |
| Summary (597) | the chapter's rules in one place; each is a row above, and §0 restates the premises in design order | guide |

## What the map shows

- **Every chapter has a home.** The owner-decided parts of the book are `DATA.md` keys (record); the
  measurable parts are seam verdicts or `data` rows (gate); the engineering judgement the book teaches
  is protocol prose that the review reads back (guide); the choice *between* technologies is the
  stack-selection protocol's (stack), which `DATA.md` cites and never re-argues.
- **Engine internals are not re-implemented, but every section still has a home.** LSM compaction,
  B-tree pages, MapReduce shuffles, Raft, rebalancing and request routing are the stack's; forge pins
  their application-visible effect (row 4 indexes, row 7 lag and restore, row 8 rebuild-equals-live,
  Tier B shard skew and pipeline SLIs). Byzantine fault tolerance is declined on the book's own advice
  for a trusted deployment, and the weak forms of lying it names are gates (digests, input validation,
  several time sources). Each chapter's Summary row points back at the rows that carry its rules.
- **Where the harness goes beyond the book:** the open-model load generator and the `dropped`
  budget (coordinated omission is a 2010s result the book cites in spirit), the migration lint
  catalogue (Squawk / strong_migrations), the GDPR one-month erasure SLA as a hard lint, and the
  `--strict-evidence` receipts — each named in protocol §5 with its source.
