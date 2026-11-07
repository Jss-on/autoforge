# DDIA 2nd ed. → forge: the section ledger

One row per section of the book's table of contents (`tests/fixtures/data/ddia2-toc.tsv`, 216 entries):
the mechanism the section teaches, in one sentence, and the forge artifact that encodes it — a protocol
anchor (§n), a `DATA.md` key, a seam verdict, an acceptance row, a stack rule or a digest rule. This is the
row-level answer to "is the substance of every section in forge?"; `tests/book-ledger-verify.cjs` checks
that every table-of-contents entry has a row and that every encoding names an artifact that exists.
The chapter digests (`data-intensive-digest-chNN.md`) hold the page-cited detail behind each row.

## Part I — Foundations of data systems

### Chapter 1 — Trade-offs in data systems architecture

| Ch | Page | Section | Mechanism the book teaches | forge encoding |
|---|---|---|---|---|
| 1 | 3 | Operational Versus Analytical Systems | OLTP serves user-facing point reads and writes; OLAP scans large ranges for aggregates; the two have different access patterns and must not share one store blindly | §2.1 operational versus analytical: `workload.kind` (`operational | analytical`) is the first decision — engineers' application code versus analysts' aggregate queries; the §3 data round asks which the system is; `model` store choice follows (§2.3) |
| 1 | 5 | Characterizing Transaction Processing and Analytics | Transaction processing is many small keyed reads/writes; analytics is few large scans; latency and throughput expectations differ by orders of magnitude | §2.1 `workload` pins reads/s, writes/s and the hot keys; §5 row 1 measures the OLTP tail and Tier B pipeline SLIs measure analytics freshness |
| 1 | 7 | Data Warehousing | Analytics copies operational data (ETL/ELT) into a warehouse so scans never slow the transaction system | §2.7 `derived`: a warehouse is a derived dataset with a source, a mechanism and a reconcile; `DATA_RECONCILE` per dataset |
| 1 | 10 | Systems of Record and Derived Data | Exactly one system of record per fact; every cache, index, view, report or model is derived and rebuildable from it | §2.7 `derived` and the `## Systems of record and derived data` prose of `DATA.md` (§4); single-writer and rebuild-equals-live rows (§5 row 8) |
| 1 | 12 | Cloud Versus Self-Hosting | Managed services trade control and cost for operations work; the choice is per component, not ideology | stack-selection-protocol hosting driver; `DATA.md` cites the decision in §2.6 (`durability`) and never re-argues it |
| 1 | 13 | Pros and Cons of Cloud Services | Elasticity, managed operations and pay-per-use against lock-in, variable latency and cost at scale | stack-selection-protocol knock-out gates and weighted drivers (cost, operability, exit path) |
| 1 | 14 | Cloud Native System Architecture | Separation of storage and compute, object storage as the durable layer, services that scale independently | stack-selection-protocol topology option; §2.6 `durability.backup` names object storage as the backup target when chosen |
| 1 | 17 | Operations in the Cloud Era | Operations shift from hardware to configuration, observability and recovery drills | §6 `devops` and `monitoring` rows; the operational-recovery contract (`operational.cjs recovery`) |
| 1 | 19 | Distributed Versus Single-Node Systems | Distribute only for a reason — scale, fault tolerance, latency, legal residency — because distribution adds failure modes | §0 premises and §2.6: `durability.replication: none` is a legitimate answer; §8 anti-pattern "distributed by default" |
| 1 | 20 | Problems with Distributed Systems | Partial failure, unbounded delay and unreliable clocks are the price of distribution | §2.6 fault model; ch.9 rows below; `Tier B` clock and GC discipline |
| 1 | 21 | Microservices and Serverless | Service boundaries are data boundaries; each service owns its data and others integrate through APIs or events | §2.5 `evolution` dataflow through services; §2.7 `derived` for cross-service copies; `data-intensive-digest-ch01` rules |
| 1 | 23 | Cloud Computing Versus Supercomputing | Cloud systems keep serving through partial failure of commodity nodes; HPC checkpoint-restarts whole jobs | `durability.fault_model` is linted (`DATA_LINT`, §2.6): partial-failure is what forge builds for; checkpoint-restart needs a reason and exempts the failover and restore rows |
| 1 | 24 | Data Systems, Law, and Society | Data about people carries legal and ethical obligations that shape the architecture | §2.10: technology shapes society and the law follows, engineers carry the ethical responsibility; §2.8 `retention` purpose, basis and retention per item; ch.14 rows below |
| 1 | 25 | Summary | The chapter's trade-offs in one place | §0 premises restate them in design order; `data-intensive-digest-ch01` |

### Chapter 2 — Defining nonfunctional requirements

| Ch | Page | Section | Mechanism the book teaches | forge encoding |
|---|---|---|---|---|
| 2 | 34 | Case Study: Social Network Home Timelines | A fan-out design trades write cost for read cost; the right choice follows the read/write ratio and the hot users | §2.1 `workload.hot_keys` and read/write ratio; §2.7 `derived` for the materialized timeline |
| 2 | 34 | Representing Users, Posts, and Follows | Model the relationships first; the query pattern decides the storage layout | §2.3 `model` chosen by the shape of the relationships; `model.indexes` per hot query |
| 2 | 35 | Materializing and Updating Timelines | A precomputed view is a derived dataset with an update process and a freshness bound; celebrities break the fan-out | §2.7 `derived` (mechanism, `freshness_s`, reconcile); `workload.hot_keys` names the celebrities |
| 2 | 37 | Describing Performance | Performance is stated as a distribution under a stated load, never a single number | §2.2 `slo`; §5 row 1; `data-intensive-metrics-research` row 1 |
| 2 | 38 | Latency and Response Time | Response time includes queueing and network; latency is the wait; measure what the user waits for | §2.2 `slo.measured_at` client side; `data-load.cjs` measures from the planned arrival |
| 2 | 40 | Average, Median, and Percentiles | The mean hides the tail; percentiles (p50/p95/p99) describe what users experience; percentiles cannot be averaged | §5 row 1 p50/p95/p99 from raw samples; `data-score.cjs slo` refuses averaged percentiles |
| 2 | 41 | Use of Response Time Metrics | SLOs couple a percentile with a window and a share of requests; tail amplification across fan-out calls | §2.2 `slo` (`window`, `samples_min`); `DATA_SLO` verdict; §8 anti-pattern "mean as SLO" |
| 2 | 43 | Reliability and Fault Tolerance | A reliable system keeps working when faults happen; design for faults, do not assume their absence | §2.6 `durability` and failover rows; `data-durable-ack` (acknowledged writes survive a kill) |
| 2 | 43 | Fault Tolerance | Deliberately trigger faults to prove tolerance (chaos); tolerate, do not merely prevent | §2.6 fault tolerance is exercised, not assumed: kill the process mid-write, stop a replica, restore; §5 row 7 negative tests and the restore drill (`RECOVERED`) |
| 2 | 44 | Hardware and Software Faults | Disks, machines and networks fail independently and in correlation; software bugs fail everywhere at once | §2.6 `durability.backup` across failure domains; §8 anti-pattern "backup on the same disk" |
| 2 | 47 | Humans and Reliability | Operator error is the leading cause; design sandboxes, quick recovery and clear telemetry | `monitoring` rows, runbook with verified commands (build Phase 8), rollback drill (`devops`) |
| 2 | 49 | Scalability | Scalability is a question — how does the system cope with load growth — not a label | §2.1 `workload.growth`; §5 row 3 the load test runs at or above the pinned peak |
| 2 | 50 | Understanding Load | Pick load parameters that matter for this system: requests/s, read/write ratio, concurrent users, hot keys | §2.1 `workload` lint (`DATA_LINT`): reads/s, writes/s, concurrency, volume, growth, hot keys |
| 2 | 51 | Shared-Memory, Shared-Disk, and Shared-Nothing Architectures | Scale up has a ceiling and a price curve; shared-nothing scales out at the cost of distribution | stack-selection-protocol topology driver; §2.1 `workload` growth decides when scale-out is needed |
| 2 | 52 | Principles for Scalability | Design for the next order of magnitude, not ten; rethink the architecture at each step | §2.1 `workload.growth` one order ahead; §8 anti-pattern "premature sharding" |
| 2 | 52 | Maintainability | Most cost is maintenance: operability, simplicity, evolvability | build Phases 7–8 deliverables (runbook, user manual); §2.5 `evolution` |
| 2 | 53 | Operability: Making Life Easy for Operations | Good telemetry, predictable behaviour, documented procedures, self-healing where safe | `monitoring` rows (health, histogram, gauges), the runbook's verified commands, `operational.cjs` drills |
| 2 | 54 | Simplicity: Managing Complexity | Accidental complexity hides bugs; good abstractions remove it | §4 `DATA.md` `## Trade-offs` prose names every simplification and its ceiling; the build command's ponytail ladder keeps the diff minimal |
| 2 | 55 | Evolvability: Making Change Easy | Systems change; loosely coupled, well-tested systems change safely | §2.5 `evolution` (compatibility both ways, expand/contract); `MIGRATION_SAFETY` |
| 2 | 56 | Summary | Nonfunctional requirements stated as measurable targets | §2.1, §2.2 and §5 rows 1–3 are those targets; `data-intensive-digest-ch02` |

### Chapter 3 — Data models and query languages

| Ch | Page | Section | Mechanism the book teaches | forge encoding |
|---|---|---|---|---|
| 3 | 67 | Relational Versus Document Models | Choose by the shape of relationships: many-to-many favours relational, self-contained trees favour documents | §2.3 `model.primary` chosen by relationship shape; §3 round asks for the relationships |
| 3 | 68 | The Object-Relational Mismatch | Mapping objects to rows costs joins or duplication; ORMs hide N+1 patterns | §5 row 4 statement count constant for 1 and 100 rows; §8 anti-pattern N+1 |
| 3 | 72 | Normalization, Denormalization, and Joins | Normalize to avoid update anomalies; denormalize for read speed and treat the copy as derived data | §2.3 `model.normalization`; a denormalized copy is a `derived` dataset with a reconcile (§2.7) |
| 3 | 75 | Many-to-One and Many-to-Many Relationships | Shared entities need IDs and joins; documents struggle with many-to-many | §2.3 `model` choice rule; the `## Systems of record and derived data` prose names shared entities |
| 3 | 77 | Stars and Snowflakes: Schemas for Analytics | Fact and dimension tables organize analytics; the fact table is wide and append-only | §2.3 analytical `model` (`star | snowflake`); §2.7 `derived` for the warehouse |
| 3 | 80 | When to Use Which Model | Schema-on-read versus schema-on-write; locality versus flexibility; the application's access patterns decide | §2.3 decision rule; stack-selection-protocol datastore driver cites it |
| 3 | 84 | Graph-Like Data Models | Highly connected data with heterogeneous relationships fits a graph model | §2.3 `model.primary: graph` and when it applies; stack choice of graph store |
| 3 | 86 | Property Graphs | Vertices and edges with properties; traversals of variable length | §2.3 graph model rule; `data-intensive-digest-ch03` rules on traversal queries |
| 3 | 88 | The Cypher Query Language | A declarative pattern language for graphs; the optimizer picks the traversal order | §2.3 relationships and query languages: Cypher expresses a traversal over vertices and edges as a pattern and lets the optimizer choose the order; §8 "prefer declarative queries" |
| 3 | 90 | Graph Queries in SQL | Recursive CTEs can express traversals but are verbose; a graph store or Datalog fits better | §2.3 model rule for variable-length traversals; `data-intensive-digest-ch03` |
| 3 | 92 | Triple Stores and SPARQL | Subject–predicate–object triples and a declarative query language; RDF for interchange | §2.3 graph model variants; stack-selection-protocol option when semantic data is required |
| 3 | 96 | Datalog: Recursive Relational Queries | Small reusable rules derive virtual relations; recursion is natural | §2.3 guidance: recursive queries as a `model` driver; `data-intensive-digest-ch03` rule "build complex queries as small, reusable and possibly recursive Datalog rules" |
| 3 | 98 | GraphQL | A client-shaped query language over an application API, not a database language; resolvers must batch to avoid N+1 | §2.3: GraphQL is a client-shaped API language whose per-field resolvers must batch; §5 row 4 statement-count check on API endpoints; §8 anti-pattern N+1 |
| 3 | 101 | Event Sourcing and CQRS | Store immutable events as the record and derive read models; replay rebuilds state | §2.3 `model.primary: event-log`; §2.7 `derived` read models with rebuild-equals-live (`DATA_RECONCILE`) |
| 3 | 105 | DataFrames, Matrices, and Arrays | Analytical and ML workloads use columnar frames and arrays rather than rows | §2.3 analytical model; `Tier B` pipeline SLIs for the frames' freshness and completeness |
| 3 | 107 | Summary | Data model is chosen by the shape of the data and its access patterns | §2.3 `model`; `data-intensive-digest-ch03` |

### Chapter 4 — Storage and retrieval

| Ch | Page | Section | Mechanism the book teaches | forge encoding |
|---|---|---|---|---|
| 4 | 116 | Storage and Indexing for OLTP | Indexes speed reads and cost writes; choose them from the access patterns, by hand | §2.3 `model.indexes` one per hot access pattern; `DATA_INDEXES` over `EXPLAIN` plans |
| 4 | 118 | Log-Structured Storage | Append-only segments, memtables and SSTables, compaction; write-friendly with compaction stalls | §2.3 storage-engine paragraph: the application-visible effect is measured by `DATA_SLO` at the pinned write rate; engine choice is the stack's |
| 4 | 125 | B-Trees | Page-oriented in-place updates with a write-ahead log; read-friendly, predictable | §2.3 storage-engine paragraph; §2.6 WAL as the durability mechanism (`durability`) |
| 4 | 129 | Comparing B-Trees and LSM-Trees | Write amplification versus read amplification; the workload decides | §2.3: the SLO run exposes the difference; stack-selection-protocol performance driver |
| 4 | 132 | Multicolumn and Secondary Indexes | Composite and secondary indexes serve multi-attribute queries; column order matters | §2.3 `model.indexes` names the columns and the query; `DATA_INDEXES` fails a sequential scan |
| 4 | 133 | Storing Values Within the Index | Covering indexes avoid the heap lookup at the cost of write and space | §2.3 `model.indexes` may declare covering columns; `DATA_INDEXES` plan check |
| 4 | 133 | Keeping Everything in Memory | In-memory stores still need durability through logs or snapshots | §2.3 in-memory paragraph: WAL or snapshot cadence sets the RPO in `durability.backup` |
| 4 | 134 | Data Storage for Analytics | Analytics stores are columnar, compressed, scanned; separate from OLTP | §2.3 analytical model; §2.7 `derived` warehouse rows |
| 4 | 135 | Cloud Data Warehouses | Separated storage and compute on object storage; elastic query engines | stack-selection-protocol analytics option; §2.7 `derived` warehouse freshness and reconcile |
| 4 | 136 | Column-Oriented Storage | Column layout plus compression makes scans cheap; sort order aids both | §2.3 analytical `model` and stack rule; the warehouse is `derived` |
| 4 | 142 | Query Execution: Compilation and Vectorization | Engines compile or vectorize queries; this is the engine's domain | stack-selection-protocol (engine internals are the stack's); the effect is the analytics SLI (`Tier B`) |
| 4 | 143 | Materialized Views and Data Cubes | Precomputed aggregates are derived data with a refresh process and staleness | §2.7 `derived` (`mechanism: batch`, `freshness_s`); `DATA_RECONCILE` rebuild equals live |
| 4 | 145 | Multidimensional and Full-Text Indexes | Specialized indexes (spatial, full-text) are derived structures with their own update path | §2.3 `model.primary: search` as derived data; §2.7 reconcile count and digest |
| 4 | 146 | Full-Text Search | Inverted indexes and ranking; search is a derived view of the documents | §2.3 search index is `derived`; `retention` deletion must reach it (§2.8) |
| 4 | 147 | Vector Embeddings | Embeddings are rebuildable from the source and inherit its deletion obligation | §2.3 `model.primary: vector` as derived; §2.8 erasure reaches embeddings (`data-erasure-complete`) |
| 4 | 150 | Summary | Storage engines and indexes chosen from access patterns, measured not assumed | §2.3; `DATA_INDEXES`; `data-intensive-digest-ch04` |

### Chapter 5 — Encoding and evolution

| Ch | Page | Section | Mechanism the book teaches | forge encoding |
|---|---|---|---|---|
| 5 | 163 | Formats for Encoding Data | Data outlives code; the encoding must allow old and new readers to coexist | §2.5 `evolution.encoding` and `evolution.compatibility` |
| 5 | 164 | Language-Specific Formats | Language-native serialization locks data to one language and version and is unsafe | §8 anti-pattern "language-native serialization"; §2.5 encoding choice |
| 5 | 165 | JSON, XML, and Binary Variants | Textual formats are interoperable but ambiguous on numbers and schema; binary variants save space | §2.5 `evolution.encoding: json` with schema validation at boundaries; `hardening` input validation rows |
| 5 | 169 | Protocol Buffers | Field tags make schemas evolvable: add optional fields, never reuse tags | §2.5 compatibility rules (add optional, never reuse); `data-intensive-digest-ch05` rules |
| 5 | 172 | Avro | Writer's and reader's schemas resolved at read time; good for files and dynamic schemas | §2.5 `evolution` encoding option; stack rule for the chosen broker or lake |
| 5 | 177 | The Merits of Schemas | Schemas document, validate and enable compatibility checking | §2.5 schema as contract; `hardening` boundary validation; the §3 round records the schema source |
| 5 | 178 | Modes of Dataflow | Data flows through databases, services and messages; each needs compatibility in both directions | §2.5 `evolution.compatibility: both`; `data-till-compat`-style row: old client against new server |
| 5 | 178 | Dataflow Through Databases | A value written by new code may be read by old code; unknown fields must round-trip | §2.5 rule "preserve unknown fields"; `MIGRATION_SAFETY` expand/contract |
| 5 | 180 | Dataflow Through Services: REST and RPC | Service APIs version independently; clients and servers upgrade at different times | §2.5 compatibility both ways; the compatibility acceptance row (§6) |
| 5 | 187 | Durable Execution and Workflows | Long-running workflows persist their state and replay deterministically after failure | §2.4 idempotency key; §2.9 batch infrastructure (deterministic, idempotent tasks retried by the orchestrator); `data-idempotent-retry` |
| 5 | 189 | Event-Driven Architectures | Events decouple producers and consumers in time; schemas evolve on the stream | §2.5 encoding on the stream; §2.7 `derived` consumers; ch.12 rows |
| 5 | 191 | Summary | Compatibility is designed, not hoped for | §2.5 `evolution`; `MIGRATION_SAFETY`; `data-intensive-digest-ch05` |

## Part II — Distributed data

### Chapter 6 — Replication

| Ch | Page | Section | Mechanism the book teaches | forge encoding |
|---|---|---|---|---|
| 6 | 198 | Single-Leader Replication | One leader takes writes; followers replay its log; reads may be stale | §2.6 `durability.replication` (`single-leader`); lag budget and read-your-writes rule |
| 6 | 200 | Synchronous Versus Asynchronous Replication | Synchronous followers guarantee durability at latency cost; asynchronous replication can lose acknowledged writes on failover | §2.6 replication mode and the acknowledgement rule; §5 row 7 failover loses no acknowledged write |
| 6 | 201 | Setting Up New Followers | A consistent snapshot plus the log from that position bootstraps a follower | §2.6 `durability.backup` snapshot + log; `operational.cjs recovery` uses the same pair |
| 6 | 204 | Handling Node Outages | Follower catch-up; leader failover with timeout choice, split brain and lost-write risks | §2.6 `durability.failover` (`manual | automatic`); the failover negative test (§5 row 7) |
| 6 | 206 | Implementation of Replication Logs | Statement, WAL-shipping, logical and trigger-based logs; WAL shipping couples versions | `durability.replication_log` is required by `DATA_LINT` whenever replication is not none (§2.6); `evolution` plans the rolling upgrade the log type allows |
| 6 | 209 | Problems with Replication Lag | Reading your own writes, monotonic reads and consistent prefix break under lag | §2.6 read-your-writes rule and `lag_budget_s`; §5 row 7 lag measurement |
| 6 | 214 | Solutions for Replication Lag | Route a user's reads to the leader after their writes; session stickiness; transactions across replicas | §2.6 read-your-writes technique recorded in `durability`; `data-intensive-digest-ch06` rules |
| 6 | 215 | Multi-Leader Replication | Multiple leaders accept writes; conflicts are inevitable and must be resolved | §2.6 `durability.replication: multi-leader` with a declared conflict rule; §8 anti-pattern "multi-leader without conflict handling" |
| 6 | 216 | Geographically Distributed Operation | Local writes per region trade conflict handling for latency | stack-selection-protocol topology driver; §2.6 conflict resolution declared |
| 6 | 220 | Sync Engines and Local-First Software | Clients hold a replica and sync later; conflicts resolved by CRDTs or merge rules | §2.4 `integrity.transactions` offline entry (idempotent ops, declared tolerance); §2.6 conflict rule |
| 6 | 222 | Dealing with Conflicting Writes | Avoid conflicts where possible; otherwise converge deterministically (LWW loses data; CRDTs, merge functions) | §2.6 conflict resolution recorded; §8 anti-pattern "last write wins silently" |
| 6 | 229 | Leaderless Replication | Quorum reads and writes (w + r > n); read repair and anti-entropy | §2.6 `durability.replication: leaderless` with the quorum recorded; stack rule |
| 6 | 229 | Writing to the Database When a Node Is Down | Sloppy quorums and hinted handoff keep writes available at consistency cost | §2.6 quorum declaration; `data-intensive-digest-ch06` rules |
| 6 | 235 | Single-Leader Versus Leaderless Replication Performance | Tail latency differs by topology; quorum waits on the slowest replica | §5 row 1 measures the tail under the chosen topology; stack-selection-protocol performance driver |
| 6 | 236 | Multi-Region Operation | Cross-region latency and partitions shape consistency choices | stack-selection-protocol; §2.6 `durability` declares regions and lag budget |
| 6 | 237 | Detecting Concurrent Writes | Version vectors detect concurrency; "happens-before" decides merges | §2.6 conflict detection recorded; `data-intensive-digest-ch06` rule |
| 6 | 243 | Summary | Replication choices stated with their lag, failover and conflict rules | §2.6 `durability`; `data-intensive-digest-ch06` |

### Chapter 7 — Sharding

| Ch | Page | Section | Mechanism the book teaches | forge encoding |
|---|---|---|---|---|
| 7 | 253 | Pros and Cons of Sharding | Shard only when one node cannot hold the load; sharding costs cross-shard queries and operations | §8 anti-pattern "premature sharding"; §2.1 `workload` growth triggers the decision |
| 7 | 254 | Sharding for Multitenancy | One shard per tenant isolates noisy neighbours and simplifies deletion | §2.9 sharding and multitenancy: `Tier B` tenant isolation (one tenant's burst does not move another's p99); §2.8 per-tenant erasure path |
| 7 | 255 | Sharding of Key-Value Data | A key decides the shard; the function must spread load | §2.1 `workload.hot_keys`; `Tier B` shard-skew metric |
| 7 | 256 | Sharding by Key Range | Range sharding keeps order for scans but creates hot ranges | §2.9 sharding: key-range order versus hot ranges; `Tier B` shard skew (max/mean per shard) |
| 7 | 258 | Sharding by Hash of Key | Hashing spreads load but loses range scans | stack rule; `model.indexes` must match the chosen scheme |
| 7 | 263 | Skewed Workloads and Relieving Hot Spots | Hot keys need key splitting or application-level spreading | `workload.hot_keys` recorded; `Tier B` shard-skew metric |
| 7 | 264 | Operations: Automatic Versus Manual Rebalancing | Automatic rebalancing can cascade failures; prefer operator-approved moves | stack-selection-protocol operability driver; the runbook documents rebalancing |
| 7 | 265 | Request Routing | Clients, routers or coordination services map keys to nodes | stack rule (vendor behaviour); `monitoring` of routing errors |
| 7 | 268 | Sharding and Secondary Indexes | Secondary indexes are local (scatter-gather reads) or global (asynchronous updates) | §2.3 `model.indexes` declares scope; §2.7 a global index is `derived` with a freshness bound |
| 7 | 268 | Local Secondary Indexes | Each shard indexes its own data; queries fan out to all shards | §2.3 index scope; §5 row 1 measures the fan-out tail |
| 7 | 270 | Global Secondary Indexes | Term-partitioned indexes serve reads cheaply but update asynchronously | §2.7 `derived` global index with `freshness_s` and reconcile |
| 7 | 271 | Summary | Sharding when needed, keyed to spread load, with routing and index scope decided | `Tier B` shard rows; `data-intensive-digest-ch07` |

### Chapter 8 — Transactions

| Ch | Page | Section | Mechanism the book teaches | forge encoding |
|---|---|---|---|---|
| 8 | 278 | What Exactly Is a Transaction? | A unit of work that commits or aborts as a whole, simplifying error handling | §2.4 `integrity.transactions`: every read-modify-write named with its invariant |
| 8 | 279 | The Meaning of ACID | Atomicity is abortability, consistency is the application's invariant, isolation hides concurrency, durability is risk reduction | §2.4 isolation level actually in force; §8 anti-pattern "ACID compliant as proof" |
| 8 | 284 | Single-Object and Multi-Object Operations | Single-object atomicity is cheap; multi-object needs transactions | §2.4 `integrity.transactions` lists multi-object operations and their technique |
| 8 | 288 | Weak Isolation Levels | Most databases run weak isolation that leaves anomalies to the developer | §2.4 `integrity.isolation` declared; §5 row 5 anomaly tests |
| 8 | 290 | Read Committed | No dirty reads or writes; still allows read skew and lost updates | §2.4 isolation declaration; `data-no-lost-update` |
| 8 | 293 | Snapshot Isolation and Repeatable Read | Consistent snapshots for readers; write skew remains possible | §2.4 isolation declaration and the write-skew test (§5 row 5) |
| 8 | 299 | Preventing Lost Updates | Atomic updates, explicit locking, compare-and-set or detection prevent lost updates | §2.4 technique per transaction; `data-no-lost-update` asserts the exact final value |
| 8 | 303 | Write Skew and Phantoms | Two transactions read then write disjoint rows violating a joint invariant; phantoms escape locks | §2.4 technique: serializable isolation or a materialized constraint; §5 row 5 write-skew test |
| 8 | 308 | Serializability | The only isolation that prevents all anomalies; three implementations | §2.4 `integrity.isolation: serializable` when the invariant needs it |
| 8 | 309 | Actual Serial Execution | One thread, stored procedures, fits in memory; no concurrency anomalies | §2.4 records the technique (serial execution with stored procedures, in-memory data, one thread per shard); stack-selection-protocol when chosen |
| 8 | 313 | Two-Phase Locking | Readers block writers and vice versa; deadlocks and poor tail latency | §2.4 technique option; §5 row 1 exposes its latency cost |
| 8 | 317 | Serializable Snapshot Isolation | Optimistic detection of serialization conflicts; aborts under contention | §2.4 technique option; retry on abort is part of the idempotency rule |
| 8 | 323 | Distributed Transactions | Atomic commit across nodes is costly; prefer local transactions plus idempotence | §2.4 atomic-commit paragraph; `data-idempotent-retry` |
| 8 | 324 | Two-Phase Commit | Coordinator prepares all participants then commits; a crashed coordinator blocks participants | §2.4: 2PC accepted inside one database, never XA across systems |
| 8 | 328 | Distributed Transactions Across Different Systems | XA is fragile and rarely well supported; heterogeneous atomic commit fails in practice | §2.4 rule: not an accepted technique; outbox/CDC or compensation instead |
| 8 | 333 | Database-Internal Distributed Transactions | Inside one system, consensus-based commit works well | §2.4: the stack's own distributed transaction is cited, not re-argued |
| 8 | 334 | Exactly-Once Message Processing Revisited | Exactly-once is idempotence plus deduplication keyed by the operation id | §2.4 `integrity.idempotency` key stored with the effect; `data-idempotent-retry` |
| 8 | 335 | Summary | Name the invariant, the isolation in force and the technique for every operation | §2.4 `integrity`; `data-intensive-digest-ch08` |

### Chapter 9 — The trouble with distributed systems

| Ch | Page | Section | Mechanism the book teaches | forge encoding |
|---|---|---|---|---|
| 9 | 346 | Faults and Partial Failures | In a distributed system some parts fail while others work; nondeterminism is the norm | §2.9 faults and partial failures (timeouts, unbounded delay, partial failure); §2.6 fault model; the failover and restore negative tests |
| 9 | 347 | Unreliable Networks | Packets are lost, delayed, duplicated; the only signal is a timeout | §2.9 faults and partial failures: unreliable networks, timeouts with jitter, bounded queues (`Tier B` overload behaviour) |
| 9 | 348 | The Limitations of TCP | TCP hides loss but not delay; connection state does not mean liveness | §2.9: TCP hides packet loss but not delay, an open connection proves nothing — liveness is a probe (`monitoring` `/healthz`, `/readyz`) |
| 9 | 350 | Network Faults in Practice | Partitions happen in every network; design for them | §2.6 `durability.failover` plan; the restore drill |
| 9 | 351 | Fault Detection | Failure detection is timeout-based and uncertain | `monitoring` probe cadence; `Tier B` circuit breaker recovery |
| 9 | 352 | Timeouts and Unbounded Delays | Timeouts trade false positives against detection delay; queues make delays unbounded | `Tier B` overload rows (bounded queues, timeouts); §5 row 1 tail under load |
| 9 | 355 | Synchronous Versus Asynchronous Networks | Packet switching optimizes utilization at the cost of bounded latency | §2.9: packet-switched networks give unbounded delay in exchange for utilization; the §2.2 `slo` tail budget absorbs it |
| 9 | 358 | Unreliable Clocks | Wall clocks drift and jump; never order events by them across nodes | §2.9 clocks: time-of-day clocks drift and jump, messages carry no trustworthy time; `Tier B` clock discipline; §8 anti-pattern "order by wall clock" |
| 9 | 359 | Monotonic Versus Time-of-Day Clocks | Use monotonic clocks for durations, time-of-day only for timestamps | §2.9 clocks: monotonic clocks for durations (`data-load.cjs` samples), time-of-day only for timestamps; leap seconds and NTP jumps |
| 9 | 360 | Clock Synchronization and Accuracy | NTP drift and leap seconds make clocks unreliable; monitor the skew | §2.9 clocks: drift, NTP synchronization accuracy, leap seconds; `Tier B` clock discipline (more than one time source, skew monitored and alerted) |
| 9 | 362 | Relying on Synchronized Clocks | Last-write-wins by timestamp drops writes; confidence intervals or logical clocks instead | §8 anti-pattern "LWW by timestamp"; §2.6 conflict rule |
| 9 | 366 | Process Pauses | GC, VM pauses and swapping stop a process for seconds; leases expire meanwhile | §2.9 process pauses: garbage collection and VM pauses outlive leases; fencing tokens as the `integrity.transactions` technique; `Tier B` GC discipline |
| 9 | 371 | Knowledge, Truth, and Lies | A node cannot know the truth; the majority decides | §2.9 truth by majority: a node cannot know the truth, the quorum decides; §2.6 records the protocol |
| 9 | 372 | The Majority Rules | Quorums tolerate minority failure; the majority's decision is the truth | §2.9 quorums: a majority declares a node dead and tolerates minority failure; `durability.replication` records the quorum |
| 9 | 373 | Distributed Locks and Leases | A lease holder may be paused; fencing tokens stop stale holders from writing | §2.4 technique "fencing token" for lease-protected writes; `data-intensive-digest-ch09` rule |
| 9 | 377 | Byzantine Faults | Inside a trusted deployment nodes are honest but fallible; guard the weak forms of lying (corruption, bad input) | `integrity.trust_model` is linted (`DATA_LINT`, §2.4): trusted-deployment must list `integrity.weak_lies` input-validation, restore-digests, multiple-time-sources — enforced by `hardening` rows and `operational.cjs recovery` digests |
| 9 | 380 | System Model and Reality | State the timing and failure model the algorithms assume | §2.6 fault model stated in `DATA.md` `## Trade-offs`; stack rule |
| 9 | 384 | Formal Methods and Randomized Testing | Model checking and fault-injection testing find bugs the model hides | §5 row 5 concurrency tests and the restore drill as randomized checks; Jepsen/Elle runs cited from the stack (`data-intensive-metrics-research`) |
| 9 | 388 | Summary | Partial failure, unbounded delay and unreliable clocks must be designed for | §2.6; `Tier B` rows; `data-intensive-digest-ch09` |

### Chapter 10 — Consistency and consensus

| Ch | Page | Section | Mechanism the book teaches | forge encoding |
|---|---|---|---|---|
| 10 | 402 | Linearizability | A single-copy illusion: every read sees the latest write | §2.9 linearizability: the single-copy illusion, strong consistency per operation; read-your-writes and monotonic-read tests (§5 row 7) |
| 10 | 404 | What Makes a System Linearizable? | Operations take effect atomically at a point between invocation and response | `data-intensive-digest-ch10` failure modes (stale read, flip-flop) as the test oracle |
| 10 | 408 | Relying on Linearizability | Locks, leader election and uniqueness constraints need it | §2.4 uniqueness under concurrency (`integrity.constraints`); the uniqueness burst test |
| 10 | 411 | Implementing Linearizable Systems | Single-leader with synchronous replication or consensus; leaderless quorums are not enough | §2.9: single-leader with synchronous replication or consensus is linearizable, leaderless quorums are not; `durability.replication` cites the implementation |
| 10 | 413 | The Cost of Linearizability | Availability and latency are the price (CAP); choose per operation | §2.2 `slo` tail budget; §2.6 consistency per operation |
| 10 | 417 | ID Generators and Logical Clocks | Auto-increment, UUIDs, snowflake IDs and their ordering guarantees | §2.4 `integrity.idempotency` key generation (client UUID); `data-intensive-digest-ch10` rules |
| 10 | 420 | Logical Clocks | Lamport and hybrid clocks order causally related events without wall time | §2.9 clocks: time-of-day clocks drift and jump, messages carry no trustworthy time; `Tier B` clock discipline; §8 anti-pattern "order by wall clock" |
| 10 | 423 | Linearizable ID Generators | A single counter is linearizable but a bottleneck; batch allocation trades gaps | §2.4 receipt/sequence numbering rule (per-till receipt numbers in the pilot); `integrity.constraints` uniqueness |
| 10 | 425 | Consensus | Agreeing on a value under faults; the basis of leader election and atomic commit | stack-selection-protocol: consensus (Raft, Paxos, ZAB) is bought inside the store or a coordination service, never built; §2.6 cites the choice |
| 10 | 427 | The Many Faces of Consensus | Total order broadcast, linearizable registers, locks and atomic commit are equivalent problems | `data-intensive-digest-ch10` rules; §2.4 atomic-commit paragraph |
| 10 | 433 | Consensus in Practice | Majorities, epochs and the cost of consensus; use proven implementations | §2.9 consensus: leader election with epochs, majority votes, Raft/Paxos/Zab bought from the stack (stack-selection-protocol), never hand-rolled (§8) |
| 10 | 437 | Coordination Services | ZooKeeper and etcd provide leases, locks and membership on consensus | §2.9 coordination services: ZooKeeper/etcd hold leases, locks and membership on consensus; §2.4 fencing technique names the service |
| 10 | 440 | Summary | Consistency is chosen per operation; consensus is bought, not built | §2.4, §2.6; `data-intensive-digest-ch10` |

## Part III — Derived data

### Chapter 11 — Batch processing

| Ch | Page | Section | Mechanism the book teaches | forge encoding |
|---|---|---|---|---|
| 11 | 454 | Batch Processing with Unix Tools | Immutable inputs, composable tools, outputs that are re-runnable | §2.9 batch infrastructure: the Unix philosophy — immutable input files, small tools composed through pipes, re-runnable outputs; §2.7 `rerun: idempotent` |
| 11 | 454 | Simple Log Analysis | A pipeline of small tools answers an analytics question over a log | §2.9 batch infrastructure: a log analysis as sort and uniq over an immutable file; `Tier B` pipeline SLIs for the job's output |
| 11 | 456 | Chain of Commands Versus Custom Program | Composability versus specialization; the pipe is the interface | §2.7 derived job design guidance; `data-intensive-digest-ch11` |
| 11 | 456 | Sorting Versus In-Memory Aggregation | Sorting spills to disk and scales past memory, while in-memory hash aggregation is faster only when the keys fit | stack rule (engine); the application pins output correctness (`DATA_RECONCILE`) and the `Tier B` completeness SLI |
| 11 | 457 | Batch Processing in Distributed Systems | Distributed filesystems and schedulers run jobs across machines | §2.9 batch infrastructure: distributed filesystems, sort that spills to disk, schedulers; §2.7 `derived.mechanism: batch` |
| 11 | 458 | Distributed Filesystems | HDFS-style storage: replicated blocks, immutable files | §2.9 batch infrastructure: distributed filesystems with replicated blocks and immutable files; §2.6 `durability` for the lake's replication |
| 11 | 460 | Object Stores | Cheap durable immutable objects; the modern batch substrate | §2.9 batch infrastructure: object stores — buckets of immutable objects behind an API, no directories; §2.6 `durability.backup` object-storage target |
| 11 | 461 | Distributed Job Orchestration | Schedulers retry failed tasks; idempotent tasks make retries safe | §2.9 batch infrastructure: schedulers and orchestrators retry tasks, safe only for deterministic idempotent tasks; `Tier B` pipeline SLIs (stragglers) |
| 11 | 466 | Batch Processing Models | MapReduce and dataflow engines express jobs as deterministic transformations | `derived.*.rerun: idempotent` is required by `DATA_LINT` for every batch or stream consumer (§2.7); rebuild equals live (`DATA_RECONCILE`); engines are the stack's |
| 11 | 466 | MapReduce | Map, shuffle, reduce over immutable inputs; fault tolerance by re-running tasks | §2.7 deterministic, idempotent re-run; `data-intensive-digest-ch11` |
| 11 | 468 | Dataflow Engines | Operators pipelined without full materialization; faster but need recomputation on failure | §2.9 batch infrastructure: dataflow engines pipeline operators without full materialization and recompute on failure; §2.7 `rerun: idempotent` |
| 11 | 469 | Shuffling Data | Repartitioning by key is the expensive step; skew hurts | §2.9 batch infrastructure: the shuffle repartitions by key between map and reduce; skew is the `Tier B` shard-skew metric on job partitions |
| 11 | 471 | Joins and Grouping | Co-partitioned joins, broadcast joins, hot-key handling | §2.7 batch paragraph (co-partition; skew is the `Tier B` skew metric) |
| 11 | 473 | Query Languages | Declarative SQL over the engine lets the optimizer plan | §2.9 batch infrastructure: SQL over the lake lets the engine plan the shuffle and joins; §8 "prefer declarative queries" |
| 11 | 475 | DataFrames | Dataframe APIs compile to the same engines; same correctness obligations | §2.9 batch infrastructure: dataframe APIs (Spark, Daft, pandas-class) compile to the same engines; §2.7 rebuild equals live regardless of API |
| 11 | 476 | Batch Use Cases | ETL, analytics, ML training and serving derived data | §2.7 `derived` per use case; `Tier B` pipeline SLIs |
| 11 | 476 | Extract–Transform–Load | Move and reshape data into the warehouse; track lineage | §2.7 `derived` source and mechanism; `DATA_RECONCILE` against the source |
| 11 | 477 | Analytics | Aggregates and reports from the warehouse; freshness matters | §2.9 batch infrastructure: analytics (OLAP cubes, dashboards) as derived data with `freshness_s`; `Tier B` freshness SLI |
| 11 | 478 | Machine Learning | Models are derived data with training lineage, drift and bias obligations | §2.9 batch infrastructure: feature pipelines and model training as derived data (§2.7); §2.10 accountability rows when the model decides about people |
| 11 | 479 | Serving Derived Data | Build output in batch, publish atomically to a read-only serving store | §2.7 single writer and atomic publish; `DATA_RECONCILE` rebuild equals live |
| 11 | 481 | Summary | Batch jobs are deterministic, immutable-input, re-runnable, verified against the source | §2.7; `data-intensive-digest-ch11` |

### Chapter 12 — Stream processing

| Ch | Page | Section | Mechanism the book teaches | forge encoding |
|---|---|---|---|---|
| 12 | 488 | Transmitting Event Streams | Events are immutable, timestamped, self-contained; producers notify consumers | §2.5 event encoding; §2.7 `derived.mechanism: cdc | outbox | stream`; `data-intensive-digest-ch12` verifiable properties |
| 12 | 489 | Messaging Systems | Decide what happens when producers outrun consumers: drop, buffer or backpressure | §2.9 messaging and backpressure: drop, bounded buffer or backpressure; brokers, topics, consumer delivery and redelivery; `Tier B` dead-letter depth |
| 12 | 495 | Log-Based Message Brokers | Append-only partitioned logs with consumer offsets; replayable, ordered per partition | §2.7 consumer lag as the freshness measure; per-key order property (`data-intensive-digest-ch12`) |
| 12 | 500 | Databases and Streams | A database is a stream of changes; the log unifies them | §2.7 `derived` mechanism `cdc`; §8 anti-pattern "dual writes" |
| 12 | 501 | Keeping Systems in Sync | Dual writes drift; one system of record feeds the others through its change log | §2.7 single writer; `DATA_RECONCILE`; §8 anti-pattern dual writes |
| 12 | 503 | Change Data Capture | Tail the database log, snapshot plus log position, idempotent consumers | §2.7 `mechanism: cdc` with freshness and reconcile; `data-idempotent-retry` on consumers |
| 12 | 508 | State, Streams, and Immutability | Immutable event logs allow rebuilding any derived view and auditing history | §2.3 event-log model; §2.7 rebuild equals live; §2.8 erasure must reach the log |
| 12 | 513 | Processing Streams | Consumers filter, aggregate, join and materialize | §2.7 `derived` consumers with `freshness_s`; `Tier B` pipeline SLIs |
| 12 | 514 | Uses of Stream Processing | Monitoring, materialized views, search indexes, fraud detection | §2.7 `derived` per use; `monitoring` of consumer lag |
| 12 | 518 | Reasoning About Time | Event time versus processing time; windows and late events; watermarks | `Tier B` pipeline correctness and completeness SLIs; `data-intensive-digest-ch12` rules on event time |
| 12 | 523 | Stream Joins | Stream-stream, stream-table and table-table joins depend on time and ordering | `Tier B` correctness SLI; §2.7 reconcile of joined outputs |
| 12 | 526 | Fault Tolerance | Checkpointing, idempotent writes and offsets give exactly-once effects | §2.4 `integrity.idempotency`; `data-idempotent-retry`; consumer offset recorded with the effect |
| 12 | 529 | Summary | Streams as the integration backbone, with idempotent consumers and time reasoned about | §2.7; `data-intensive-digest-ch12` |

### Chapter 13 — A philosophy of streaming systems

| Ch | Page | Section | Mechanism the book teaches | forge encoding |
|---|---|---|---|---|
| 13 | 539 | Data Integration | Derive specialized datasets from one record through logs rather than dual writes | §2.7 `derived` and the `## Systems of record and derived data` prose (§4) |
| 13 | 540 | Combining Specialized Tools by Deriving Data | Search, cache and warehouse are derived views fed by the log | §2.7 one row per derived store with source, mechanism, freshness, reconcile |
| 13 | 544 | Batch and Stream Processing | Both are derivation; lambda versus unified processing | §2.7 `mechanism: batch | stream`; `DATA_RECONCILE` applies to both |
| 13 | 546 | Unbundling Databases | Compose storage technologies through dataflow instead of one monolith | §2.7 single-writer rule per store; stack-selection-protocol composes the stores |
| 13 | 547 | Composing Data Storage Technologies | Each derived store is maintained by a consumer of the log, never by application dual writes | §2.7 single writer per store and §2.9 messaging as the integration backbone; "unbundling" the database into composed stores; §8 anti-pattern dual writes |
| 13 | 551 | Designing Applications Around Dataflow | Application code as stream transformers; state as derived data | §2.7 derived design guidance; `data-intensive-digest-ch13` rules |
| 13 | 555 | Observing Derived State | Reads are queries over derived state; freshness and write-to-read latency are design parameters | §2.7 `freshness_s`; §5 row 8 write-to-visible latency |
| 13 | 561 | Aiming for Correctness | Correctness through end-to-end measures, not only database guarantees | §2.7 data integration and correctness: the application's semantics define correct, the solution is end to end; §2.4 idempotency key; §5 rows 5 and 8 |
| 13 | 562 | The End-to-End Argument for Databases | Duplicate suppression needs an end-to-end operation identifier | §2.4 `integrity.idempotency` key generated by the client and stored with the effect |
| 13 | 566 | Enforcing Constraints | Uniqueness and limits enforced by a single partition or log ordering; apologize when the business allows | §2.4 `integrity.constraints`; uniqueness burst test; compensation as an accepted technique |
| 13 | 571 | Timeliness and Integrity | Integrity is non-negotiable; timeliness can be relaxed | §2.7 `freshness_s` budgets versus `DATA_RECONCILE` zero-mismatch |
| 13 | 575 | Trust, but Verify | Continuously audit data integrity; assume corruption happens | §2.7 reconcile per dataset; the nightly reconcile job; `operational.cjs recovery` digests |
| 13 | 579 | Summary | Derive, verify, keep integrity absolute and timeliness budgeted | §2.7; `data-intensive-digest-ch13` |

### Chapter 14 — Doing the right thing

| Ch | Page | Section | Mechanism the book teaches | forge encoding |
|---|---|---|---|---|
| 14 | 586 | Predictive Analytics | Algorithmic decisions about people need accountability and recourse | §2.10 decisions about people: predictive analytics on loans, insurance and fraud; `Tier B` accountability rows (explanation, correction path) |
| 14 | 586 | Bias and Discrimination | Models learn bias from data; disparate outcomes must be measured | §2.10: a model learns the bias in its data and discriminates systematically; `Tier B` outcome-disparity metric per protected group |
| 14 | 587 | Responsibility and Accountability | A human must be answerable for a decision; log the inputs and the path | §2.10: a human accountable for an opaque algorithmic decision; inputs and model version logged (§2.4 audit); `Tier B` accountability rows |
| 14 | 588 | Feedback Loops | Decisions change the data that trains the next decision; monitor drift | §2.10 feedback loops: credit scores and echo chambers reinforce themselves; drift monitored (`Tier B`); §2.7 model as derived data |
| 14 | 589 | Privacy and Tracking | Collect only what the purpose needs; tracking is a choice with consequences | §2.10 privacy and tracking: behavioural data collected by default for advertising and scoring is surveillance; §2.8 `retention.minimization` and per-item purpose |
| 14 | 590 | Surveillance | Pervasive data collection is surveillance by default; design against it | §2.8 minimization and `retention.personal_data` inventory |
| 14 | 591 | Consent and Freedom of Choice | Consent must be meaningful; a basis per item | §2.10 consent: meaningful, specific consent per item; insurance and fitness-tracker examples of coerced data; §2.8 `retention.personal_data.*.basis` |
| 14 | 592 | Privacy and Use of Data | Purpose limitation: data used only for what it was collected for | §2.8 purpose per item; `hardening` export allow-lists |
| 14 | 594 | Data as Assets and Power | Data hoarded becomes liability and power asymmetry | §2.8 retention periods and purge (`data-retention-purge`-style row) |
| 14 | 595 | Remembering the Industrial Revolution | Regulation follows harm; build the safeguards before it arrives | §2.10: regulation followed the harms of the industrial revolution (child labour, pollution) and will follow data; §2.8 `retention.deletion.sla_days ≤ 30` is a hard lint before the law requires it |
| 14 | 596 | Legislation and Self-Regulation | GDPR-class rights (access, erasure) must be executable, not promised | §2.8 erasure reaches every store within the SLA (`data-erasure-complete`-style row); `data-intensive-metrics-research` row 9 |
| 14 | 597 | Summary | Treat data about people as a responsibility encoded in the system | §2.8 `retention`; `data-intensive-digest-ch14` |
