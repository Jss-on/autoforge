# Data-intensive protocol — designing and building the data side of a system, measured

Companion contract for `requirements` (Phase 1 data round, Phase 2 NFR mapping, Phase 3 SRS, Phase 5
spec) and `build` (Phase 4 data architecture, Phase 5 data slices, Phase 6 tests, Phase 8 runbook).
Source of truth: Kleppmann & Riccomini, *Designing Data-Intensive Applications*, 2nd ed. (O'Reilly,
2026) — cited below as (DDIA2 p.NN). Every rule here is the book's rule made mechanical; where the
book names a trade-off, the protocol makes the owner decide it and writes the decision down. The
release of the data design is decided by `node scripts/data-score.cjs` (`DATA_LINT`, `DATA_COVERAGE`,
`DATA_SLO`, `DATA_RECONCILE`, `MIGRATION_SAFETY`, `DATA_INDEXES`) and by the `data` acceptance
dimension of `scripts/score-build.sh`, never by "the database looks fine".

**Why this exists.** forge's mission is software + data: an application that keeps its own durable
data is data-intensive the moment "storing and processing large data volumes, managing changes to
data, ensuring consistency in the face of failures and concurrency, and making sure services are
highly available" (DDIA2 p.1) is one of its primary challenges — which is every real product, not
only the large ones. Until now the pipeline measured the UI (`DESIGN.md`, `ux`), the domain math
(`logic`) and the shell (`functional`, `devops`, `monitoring`, `hardening`); the data side was a
"schema + forward-only migrations" bullet. This protocol gives it the same shape as the UI: a
machine-readable record (`DATA.md`), eight decisions every system must make, a gated dimension, and a
fixed set of mechanical metrics.

## §0 Premises (what the book says, in the order a design meets them)

- **There are only trade-offs.** "No one approach is fundamentally better than others; everything
  has pros and cons" (DDIA2 p.2). A data design is a record of what was chosen *and what was rejected
  and why*; `DATA.md` carries a `## Trade-offs` section for that reason.
- **Systems of record and derived data.** One source of truth per fact, each fact represented
  exactly once; caches, indexes, materialized views, denormalized copies, warehouses, search indexes
  and trained models are derived, redundant and rebuildable; on discrepancy the system of record is
  right "by definition"; derived data needs an explicit process that keeps it updated (DDIA2
  p.10-11). "By being clear about which data is derived from which other data, you can bring clarity
  to an otherwise confusing system architecture" (p.11).
- **Describe load before discussing growth.** Requests per second, GB per day, peak simultaneous
  users, read/write ratio, cache hit rate, items per user — "which matters depends on the details of
  your particular application" (p.50). Rethink the architecture at every order of magnitude; plan no
  more than one order ahead (p.52). Do not engineer for hypothetical scale in a new product (p.49-50).
- **Response time is a distribution.** Measure on the client side (queueing counts), report p50 /
  p95 / p99 (p999 where the slowest users are the most valuable), never the mean as "typical", never
  average percentiles — add histograms (p.37-42). SLO example: median < 200 ms, p99 < 1 s, ≥ 99.9 %
  of valid requests non-error (p.42). Near capacity, response time rises sharply from queueing; retry
  storms turn overload metastable, so backoff with jitter, circuit breakers, load shedding and
  backpressure are part of the design (p.37-38).
- **Reliability = continuing to work correctly when things go wrong.** Faults vs failures; a failure
  is a missed SLO (p.43). Fault tolerance is bounded to a stated number and type of faults (p.44).
  Durability over uptime: minutes or hours of outage are often tolerable, permanent loss or corruption
  is catastrophic (p.48). Prefer tolerating faults to preventing them — except security (p.44).
- **Single machine first.** "It's advisable not to rush into making a system distributed if it's
  possible to keep it on a single machine" (p.26); a single-threaded program can beat a 100-core
  cluster (p.20); shard only when data volume or write throughput exceeds one node — read pressure
  means replicas (p.253); "a single machine can do a lot nowadays" (p.253, p.389).
- **Everything networked is a partial failure waiting to happen.** A timeout never means "not
  processed"; retries need idempotence; clocks are confidence intervals; a thread can pause for a
  minute and resume unaware; truth is a quorum; zombies are fenced with monotonic tokens (p.346-376).
- **Integrity before timeliness.** Violations of timeliness are allowed under eventual consistency;
  violations of integrity are perpetual (p.571-572). Integrity comes from one atomically written
  request, deterministic derivations, an end-to-end request ID enforced by a uniqueness constraint,
  and immutable reprocessable messages — without distributed transactions (p.562-573). Loosen a
  constraint only where the business already has an apology workflow; validate synchronously before
  irrecoverable actions (p.573-574).
- **Trust, but verify.** "If you want to be sure that your data is still there, you have to read it
  and check" (p.577): continuous reconciliation of derived data against its source, restore drills,
  hashed logs, redundant derivations — "don't just blindly trust that it is all working" (p.576-578).
- **Data about people is a toxic asset.** Collect for a specified purpose, no longer than
  necessary; "data you don't have is data that can't be leaked, stolen, or compelled" (p.596-597);
  the right to erasure must reach immutable logs and derived datasets, including training sets
  (p.24, p.104, p.512-513); automated decisions about people need an accountable human, an
  explanation and a correction path (p.586-588).

## §1 When it runs, and what it produces

| phase | what happens | artifact | gate |
|---|---|---|---|
| `requirements` Phase 1 — **data & scale round** | the §3 questions, in the client's words, after objects & lifecycle and before edges & elasticity | `A-n` decisions in `client-review.md` | — |
| `requirements` Phase 2 — NFR mapping | performance, scalability, durability, consistency, data lifecycle and data-privacy NFRs map to the **`data`** dimension (operability stays `monitoring`, security `hardening`) | `NFR-n` rows with numbers | ambiguity audit: a p95 without a load model is not testable |
| `requirements` Phase 3 — SRS | `## Data architecture` section = the draft `DATA.md` (§4) beside the ER diagram | `<run-dir>/DATA.md` | `node scripts/data-score.cjs lint <run-dir>/DATA.md` → `DATA_LINT: VALID` before sign-off |
| `requirements` Phase 5 — spec | `data:` block (source + ref + kind) and `acceptance.data:` rows (§6), one per applicable group | `evals/fullstack/<name>.spec.yaml` | `REQUIRE_DATA=1 scripts/score-requirements.sh validate` → `data=present(groups_traced=N)` |
| `build` Phase 4 — data architecture | adopt `DATA.md` at the project root (like `DESIGN.md`), finalize indexes, transactions, derived inventory | `DATA.md`, schema, migrations plan | `DATA_LINT: VALID`; `scripts/score-build.sh coverage build-results.tsv requirements.md DATA.md` → `DATA_COVERAGE: 1.00` |
| `build` Phase 5 — data slices | durability, constraints + idempotency, migrations, derived-data consumers, deletion job — attacked while any `data` row is red (the headline is capped at 0.50 until the dimension is green, like `logic`) | source + tests | `data_gate=PASS` |
| `build` Phase 6 — tests | the §5 metrics run and leave evidence | `evidence/data/*` | each `data` row `pass` with `evidence:` |
| `build` Phase 8 — runbook | lag, freshness and restore-drill procedures; "If I do X, Y will happen" for every data operation (p.54) | `RUNBOOK.md` | verified against the running app |
| `feature` | delta rows in `data`; the non-regression ratchet covers the incumbent `data` rows; a schema change runs `migrations` and the compatibility check | — | same gates |

**Applicability.** `REQUIRE_DATA=1` whenever the target keeps its own durable data for real users
(the "real product, not a demo" stance already in `requirements`). A static site, a throwaway
prototype or a pure client-side tool may omit the dimension; the exemption is recorded as an `A-n`
decision with its reason, never silently.

## §2 The eight decisions (DATA.md groups) and the book's rule for each

Each group is a frontmatter key in `DATA.md` (§4). A group that truly does not apply reads
`{ na: <reason> }` — except `workload` and `slo`, which every system has. Applicable groups form the
`DATA_COVERAGE` universe: each must be traced (`data:<group>`) by ≥ 1 `data` acceptance row.

### 2.1 `workload` — describe the load (DDIA2 ch.2, ch.7)
Pin the peak load parameters: reads/s, writes/s (and their ratio), concurrent users, dataset size,
growth projection, hot keys or heavy users (p.34-36, p.50). Rules: one order of magnitude of
headroom at most (p.52); "you're not Google" — a single-node database while it fits (p.49-50, p.253);
shard only for data volume or write throughput, replicate for reads (p.253); never a monotonically
increasing key as the first element of a partition key (p.257); hash the partition key, never
`hash mod N` (p.258-259); uniform keys are not uniform load — name the celebrity (p.263-264). A
secondary index on sharded data is either local (every shard indexes its own rows; reads scatter and
gather) or global (sharded by the indexed value; updated asynchronously) — `model.indexes` names which
when the store is sharded (p.268-271).

### 2.2 `slo` — response time, errors, availability (DDIA2 ch.2)
`response_time_ms: { p50, p95, p99 }` measured **client side** under an **open (arrival-rate) load
model** at the pinned peak, `error_rate_max`, `availability`, the `window`, `samples_min`. The mean is
not a target; averaging percentiles is "mathematically meaningless" (p.40-42). A closed-loop load
test (fixed virtual users that wait for each response) stops sending while the server stalls and
hides exactly the tail the SLO is about — coordinated omission (Tene; k6 open vs closed models) — so
the load model is a declared decision and `load_model: closed` fails lint. Fan-out requests inherit
tail-latency amplification: the backend budget per call is tighter than the end-user budget (p.41).
Overload behaviour is part of the SLO: exponential backoff with jitter, circuit breaker, load
shedding or backpressure, and recovery without a restart after the overload ends (p.38).

### 2.3 `model` — data model, store, indexes (DDIA2 ch.3-4)
The deciding variable is the shape of the relationships: a tree loaded whole → document; many-to-one
and many-to-many with joins → relational; multi-hop connections → graph; a domain that needs several
read shapes → event log + derived views; wide numeric data → dataframes (p.80-107). Normalize when
writes must be cheap and copies must agree; denormalize when reads must be cheap, and then treat
every copy as derived data with an update process (p.74). IDs carry no human meaning (p.72). Choose
indexes **by hand from the access patterns** — every index costs disk and write speed (p.117) — and
name, per index, the query it serves; a hot query that still scans the table has no index (p.117,
p.132-133, p.145). LSM for write-heavy, B-tree for read-heavy, "benchmark your own workload" and long
enough for compaction (p.129-131); embedded engines (SQLite, DuckDB) when the data fits one machine
(p.125). Analytics gets its own column store fed from the system of record, never ad-hoc SQL on the
OLTP database (p.6-7, p.136-137); its schema is a star or snowflake (a fact table and its dimensions,
p.77-80), and every materialized view or data cube in it is a derived dataset with an update process
(p.143-145). Full-text and vector indexes (`model.primary: search | vector`) are derived data too:
embeddings are rebuildable from the source and inherit its deletion obligation (p.145-149). N+1 is a
defect: statement count must not grow with list length (p.68-69).

### 2.4 `integrity` — transactions, constraints, idempotency (DDIA2 ch.8, ch.10, ch.13)
Declare the isolation level actually in force (the default in PostgreSQL, Oracle and SQL Server is
read committed, p.292; "repeatable read" means different things per vendor, p.298). Name every
read-modify-write and multi-object operation with its **invariant** and the **technique** that protects
it: atomic `UPDATE … SET v = v + 1` for counters, `SELECT … FOR UPDATE` for check-then-write on
existing rows, compare-and-set/version column, a database **uniqueness or check constraint** for
usernames/receipt numbers/non-negative balances, serializable isolation (or materialized conflicts)
for phantoms such as "room free → book" (p.299-308). Weak isolation leaves lost updates, write skew
and phantoms to the developer; "pick serializable when you cannot tell by inspecting the code that a
weaker level is safe" (p.308). Every retried request carries an end-to-end **idempotency key**
enforced by a uniqueness constraint; processed-message IDs live in the same transaction as the effect
(p.334-335, p.563-564). Retries: transient errors only, bounded, exponential backoff; constraint
violations are never retried (p.288). Strict uniqueness needs one decider (single leader or shard by
the unique value), never asynchronous multi-leader (p.217, p.567). Unique or monotonic identifiers
come from the database's sequence, a single decider or a logical clock — never from wall-clock
timestamps, which skew and collide (p.363-364, p.417-424). Hard invariants vs apology workflows is an
owner decision recorded here (p.573-574).

**Trust model (ch.9 pp.377-380).** Nodes inside the deployment are assumed honest but fallible; Byzantine fault tolerance is not designed for, on the book's own advice. The "weak forms of lying" it does guard against are gates here: digests compared on every restore drill (`operational.cjs recovery`), input validation at every trust boundary (the `hardening` rows), and more than one time source for clocks (§2.6).

### 2.5 `evolution` — encoding, compatibility, migrations (DDIA2 ch.5)
Rolling upgrades mean old and new code and old and new data coexist: new code must read old data
(backward) and old code must read new data (forward); older code must preserve unknown fields on a
read-modify-write (p.161-162). Databases: "data outlives code" — prefer changes that rewrite nothing
(add a nullable column, fill on read), schedule complex rewrites as explicit backfills (p.81, p.179).
**Expand/contract**: add → dual-read/backfill → switch readers → drop in a later release; a destructive
or lock-taking statement is allowed only as an annotated contract step (`-- contract-step: <release
whose code stopped reading it>`). Schema-driven encodings (Protobuf tags never reused, Avro fields only
added/removed with defaults) and a schema registry that checks compatibility before deploy (p.169-178).
Service APIs: requests backward-compatible, responses forward-compatible; public APIs versioned and
kept indefinitely (p.186). Durable-execution / workflow engines replay a workflow's history after a
crash, so every step with an external side effect (a charge, an email, a shipment) is idempotent and
keyed — the §2.4 idempotency rule applied to orchestration (p.187-189).

### 2.6 `durability` — replication, failover, backup (DDIA2 ch.2, ch.6, ch.9-10)
Keep backups even when replicating — replicas replicate deletions (p.198); acknowledged writes
survive a crash (fsync + WAL; p.120, p.282-284). Asynchronous replication is fast but a confirmed
write can be lost on failover — decide the tolerance explicitly (a fraction of a second vs days,
p.201, p.206). If replicas serve reads, pin the **lag budget** and the guarantee: read-your-writes
(route a user's own reads to the leader or a fresh-enough replica), monotonic reads, consistent prefix
(p.209-214); monitor lag = leader position − follower position and alert (p.234-235). Failover
without a proven consensus algorithm is "likely to be unsafe" (p.437); fence the old leader (p.205-
206, p.375-376). Multi-zone survives a zonal outage; multi-region costs latency, throughput and bills
and needs multi-leader with conflict resolution (p.212, p.216-217). Offline-capable and local-first
apps are multi-leader by construction (each device is a leader): the merge rule is a decision — CRDTs
or an application-level merge, version vectors to detect concurrency, never last-writer-wins on wall
clocks (p.220-229, p.237-243). RPO/RTO are numbers a drill
measures: restore into an isolated destination, time from incident to the service answering its
journey, compare row counts and content digests (`operational.cjs recovery`).

**Replication log type and the fault model (ch.6 pp.206-208, ch.1 pp.23-24).** Name the mechanism's log type in `durability.replication` (statement, WAL shipping, logical/row-based, trigger-based): WAL shipping pins leader and followers to one storage-engine version, so the rolling-upgrade plan in `evolution` must say how followers are upgraded first; a logical log decouples the two. forge targets cloud and commodity deployments that keep serving through partial failure: the failover and restore rows assume rolling node loss and replacement, never a whole-system checkpoint-restart.

### 2.7 `derived` — caches, indexes, views, exports, models (DDIA2 ch.1, ch.11-13)
Every derived dataset names its system-of-record **source**, the **mechanism** that keeps it in sync
(`cdc`, `outbox`, `event-log`, `batch`, `trigger`, `same-transaction`), its **freshness** budget and
the **reconcile** check that compares it with its source. **Dual writes are forbidden**: two
independent writes race and leave the systems "permanently inconsistent" (p.501-503, p.541); derived
systems are followers of the change stream, written only by their consumer (p.513, p.541). Consumers
are deterministic and idempotent (store the triggering offset with the value) so reprocessing repairs
them (p.527-528, p.541); events of one key stay in order through a partition key (p.497-498). Batch
jobs write nothing record-at-a-time into production — publish to a stream with a completion marker
or bulk-load and swap atomically (p.479-481). Consumer lag and the age of the oldest unprocessed event
are exported and alerted (p.499); poison messages go to a dead-letter queue (p.495); late events are
counted (p.520). Analytics is a derived system too: warehouse or lake fed by CDC/ETL, never queries on
the OLTP store (p.7-10); ML models are derived data and inherit the deletion obligation (p.552, p.24).

**Batch jobs (ch.11 pp.466-481, ch.12 pp.526-528).** A derived dataset with `mechanism: batch` is produced by a deterministic, idempotent job: the same input yields the same output, so a failed or partial run is simply re-run and the rebuild must equal the live copy (`DATA_RECONCILE`). Joins and grouping co-partition their inputs; the hot-key skew they create is the Tier B shard-skew metric. Which engine runs the job is the stack's decision.

### 2.8 `retention` — personal data, deletion, minimization (DDIA2 ch.1, ch.14)
Inventory every field or table about people with its **purpose** and **retention**; collect only for a
specified purpose and "not longer than necessary" (p.25, p.596). Deletion on request purges the system
of record **and every derived copy** — indexes, caches, exports, warehouses, training sets — within
`sla_days` ≤ 30 (GDPR Art. 12(3): without undue delay, at the latest one month; DDIA2 p.24, p.591,
p.597); immutable logs need per-user keys and crypto-shredding or excision (p.104, p.512-513); LSM
tombstones must have compacted through every level before deletion is real (p.132). State what is
deliberately not stored (p.597). Each personal-data item may name its legal `basis` (`consent |
contract | legal-obligation | legitimate-interest`); consent is not freely given when declining means
losing the service, and data collected for one purpose is not reused for another (p.591-593). When the system decides about people, name the accountable human,
the explanation path and the correction path, and watch for proxies of protected traits (p.586-588).

## §3 Elicitation — the data & scale round (client language; each decides a group)

Ask 1-3 at a time, offer the recommended default with its consequence, never treat silence as a
yes (elicitation-protocol §2). Record as `A-n`.

| question | decides |
|---|---|
| How many people use it at the busiest moment, and how many things do they save or look up per minute? How much data is there now, and in two years? | `workload` (p.50) |
| Are there a few customers, products or accounts far busier than the rest? Could one go viral? | `workload` hot keys (p.36, p.263) |
| How long may the main screens take: usually, and in the worst case you would still tolerate? Which users would you least like to keep waiting? | `slo` p50/p99, p999 priority (p.40-41) |
| What share of requests may fail or be slow before you consider the service broken, and over what period? Will you promise this in a contract? | `slo` error rate, availability, window, SLA (p.42) |
| When you open a record, do you need all of it at once or a piece? Which lists can grow to thousands of items? Do you need to look at a relationship from both sides? Which questions hop through several links? | `model` (p.71-84) |
| Which totals must always add up, and which rules must never break even for a moment — unique names, stock never below zero, no double booking? Who is harmed if they drift, and could you apologize and compensate instead? | `integrity` invariants vs apology (p.281, p.303-308, p.573-574) |
| If someone clicks twice or the connection drops after sending, what must happen to the second attempt? Which actions (emails, charges, shipments) must never happen twice? | `integrity` idempotency (p.288, p.562-564) |
| Do several people or systems change the same record at the same time? | `integrity` lost updates (p.299) |
| Can the service pause for an upgrade, or must it stay up while being updated? Do you ship apps on customers' devices that you cannot force to update? How long must old records stay readable? | `evolution` (p.161-162, p.179) |
| If a server dies suddenly, how much recently saved work may be lost: none, a second, minutes? How quickly must service resume, and may a person decide the switch? | `durability` RPO, RTO, failover (p.201, p.205-206) |
| After someone saves something, must they see it immediately on the next screen, and from another device? May someone else briefly see the old value? | `durability` replica reads / read-your-writes (p.210-213) |
| Must it keep working with no internet, and merge the changes later? Where are your users, and must it survive a whole datacenter or region going down? | `durability` multi-leader / regions (p.212, p.216-222) |
| Besides the main screens, where must the data also appear — search, reports, dashboards, a mobile app, another team's system, a model? How stale may each be? How would you notice if a copy went wrong? | `derived` sources, freshness, reconcile (p.11, p.541, p.571) |
| Do you need the full history of changes for audit, or to rebuild a report from the originals? | `derived` event log / reprocessing (p.104, p.545) |
| Which stored facts are about people? Why do you keep each one, how long is it needed, and what harm if it leaked, was sold with the company, or was demanded by a government? | `retention` purpose, retention, minimization (p.25, p.594-597) |
| If a person asks to be forgotten, within how many days must they be gone from every copy, including backups, reports and trained models? | `retention` deletion (p.24, p.597) |
| Does the system decide anything about people (approve, deny, rank, price, flag)? Who is accountable, how is a wrong decision found and corrected, and could a postcode or device stand in for a protected trait? | `retention`/AI decisions (p.586-588) |

The ambiguity audit (elicitation-protocol §6) applies with full force: every adjective becomes a
number **with its load model**; every list its expected volume; every copy its freshness; every
mutation its correction path; every integration its retry owner.

## §4 `DATA.md` — the machine-readable data architecture record

YAML frontmatter with the eight groups, then prose. Linted by `node scripts/data-score.cjs lint
DATA.md` → `DATA_LINT: VALID groups=8/8 na=K`. Worked example: `tests/fixtures/data/DATA.md` (a
sari-sari store POS). Keys are the gate's contract; values are the owner's decisions.

```yaml
---
name: <project>
kind: operational | analytical | mixed
workload:                      # peak numbers; never n/a
  reads_per_s: 40
  writes_per_s: 6
  read_write_ratio: "7:1"
  concurrent_users: 25
  dataset_gb: 2
  growth: "+1.5 GB/yr; plan to 10 stores, not 1000"
  hot_keys: "<the celebrity, the end-of-day report>"
slo:                           # never n/a
  response_time_ms: { p50: 120, p95: 400, p99: 900 }   # client side, at the peak above; no mean
  error_rate_max: 0.001
  availability: 0.995
  window: 30d
  load_model: open             # arrival-rate executor; `closed` fails (coordinated omission)
  samples_min: 1000
  measured_at: "client side (Playwright + k6), queueing included"
model:
  primary: relational | document | key-value | wide-column | graph | time-series | search | vector | object-store | file | mixed
  store: postgres@16
  normalization: normalized | denormalized   # denormalized needs `reason`
  schema: prisma/schema.prisma
  indexes:                     # one per hot access pattern, or { na: <reason> }
    sales_by_store_day: { columns: [store_id, sold_at], query: "SC-3 end-of-day report" }
integrity:
  isolation: read-committed | snapshot | repeatable-read | serializable | none
  transactions:                # every read-modify-write / multi-object operation
    checkout: { invariant: "stock >= 0; total = sum(lines)", technique: "one tx; SELECT FOR UPDATE; CHECK" }
  idempotency: { key: "Idempotency-Key header on POST /sales, kept 24h" }   # or { na: <reason> }
  constraints: [unique(barcode), unique(store_id, receipt_no), check(stock_on_hand >= 0)]
evolution:
  encoding: json | protobuf | avro
  compatibility: backward | forward | both | none   # none needs `reason`
  migrations: expand-contract | forward-only | none # none needs `reason`
  tool: prisma migrate
durability:
  replication: none | single-leader-sync | single-leader-async | multi-leader | leaderless
  lag_budget_s: 5              # required when replication != none
  replica_reads: none | leader-only | read-your-writes | eventual
  failover: automatic | manual | none
  backup: { frequency: "daily base + WAL", rpo_s: 300, rto_s: 1800, drill: "quarterly, isolated db" }
derived:                       # or { na: <reason> }
  product_search: { source: products, mechanism: outbox, freshness_s: 10, reconcile: "npm run reconcile:search" }
  daily_sales_report: { source: sales, mechanism: batch, freshness_s: 3600, reconcile: "node scripts/reconcile-report.cjs" }
retention:
  personal_data:               # or `none`
    customer_phone: { purpose: "SMS receipt", retention: "2 years after last sale", basis: consent }   # basis optional
  deletion: { sla_days: 30, covers_derived: true, path: "DELETE /customers/:id purges row, index, report cache" }
  minimization: "no card numbers stored; names on receipts only on request"
---
```

Required prose: `## Systems of record and derived data` (which store is authoritative for each
fact, what is derived from what), `## Trade-offs` (what was rejected and why); `## Dataflow`,
`## Consistency and transactions`, `## Evolution`, `## Durability and recovery`, `## Retention and
privacy` complete the record. Lint errors are the book's rules (a closed load model, a mean, a
dual-write mechanism, a 90-day deletion SLA, a missing invariant); warnings are the places the record
is thin.

## §5 The mechanical metrics — researched, decided

**Research.** The book's own metric chapter (DDIA2 ch.2) plus: Google SRE (SLI/SLO/SLA definitions;
indicators per system type — availability, latency, throughput; durability for storage; end-to-end
latency and throughput for data pipelines; correctness, freshness and coverage/completeness for
pipelines; "most metrics are better thought of as distributions rather than averages"; the SRE
Workbook's pipeline SLOs: freshness "X % of data processed within Y", "the oldest data is no older
than Y", correctness via golden data, completeness = delivered ÷ published), Tene's coordinated
omission and HdrHistogram's correction (synthetic samples for the stalled interval; histograms merge,
percentiles do not average), Grafana k6's open vs closed models (arrival-rate executors are open;
`dropped_iterations` means the rate was not sustained), Jepsen/Elle (anomalies as dependency cycles;
check isolation claims by test, not by the vendor's name for the level), Squawk and strong_migrations
(the catalogue of lock-taking and breaking DDL), PostgreSQL `pg_stat_replication` (`replay_lag`
approximates the delay before a transaction is visible on an async standby), Kafka consumer lag
(log-end offset − committed offset; records, converted to seconds by the production rate), AWS
Well-Architected REL09-BP04 (restore to a separate environment, verify completeness and integrity,
measure restore time against RTO), the DAMA data-quality dimensions and the data-observability pillars
(freshness, volume, schema), GDPR Articles 12(3) and 17 (erasure without undue delay, at most one
month, extendable only with notice).

**Decision.** forge measures the following, mechanically, with the stated tool and threshold source.
Rows 1-8 are the gated `data` dimension; the Tier B rows apply when the record declares the feature.

| # | metric | definition and measurement | threshold comes from | book | seam / evidence |
|---|---|---|---|---|---|
| 1 | **Response-time percentiles** | p50 / p95 / p99 of client-side response time over ≥ `samples_min` requests, under an **open** arrival-rate load at the pinned peak; k6 summary (arrival-rate executors) or raw per-request samples; `dropped_iterations = 0` | `DATA.md slo.response_time_ms` | p.37-42 | `data-score.cjs slo <k6.json|samples> --data DATA.md` → `DATA_SLO: PASS` |
| 2 | **Error ratio** | failed ÷ total requests in the same run (k6 `http_req_failed`, or the `ok/err` column of the samples) | `slo.error_rate_max` | p.42 | same run |
| 3 | **Load model pinned and reached** | the run's arrival rate ≥ `workload.reads_per_s + writes_per_s`; the lint confirms every load parameter is a number | `workload` | p.50, p.52 | `DATA_LINT: VALID` + the k6 `options.scenarios` rate |
| 4 | **Index coverage of hot paths** | `EXPLAIN` of every query named in `model.indexes` shows no sequential scan of ≥ 1,000 rows (PostgreSQL JSON/text, SQLite `EXPLAIN QUERY PLAN`); list pages issue a constant number of statements for 1 and 100 items | `model.indexes` | p.68-69, p.117, p.132-133 | `data-score.cjs explain <plans>` → `DATA_INDEXES: PASS`; a statement-count test |
| 5 | **Concurrency anomalies** | the project's concurrent tests for each `integrity.transactions` entry: lost update (N concurrent increments → exactly N), write skew / phantom / uniqueness (concurrent claims → exactly one winner), idempotent retry (same key twice, incl. crash after commit before ack → one effect); acknowledged writes readable after `SIGKILL` + restart | `integrity` | p.120, p.282, p.299-308, p.334-335, p.563-564 | test receipts (`verification.cjs run`) per transaction |
| 6 | **Migration safety and compatibility** | `MIGRATION_SAFETY: PASS` over the migrations directory (destructive or lock-taking DDL only as an annotated contract step); new code reads old data and old code reads new data (the `Recovery compatibility` job of operational-recovery, or a schema-registry check) | `evolution` | p.81, p.161-162, p.171, p.175, p.179 | `data-score.cjs migrations <dir> [--dialect]`; compatibility receipt |
| 7 | **Recovery objectives, measured** | restore drill into an isolated destination: RTO = incident → service answers its journey, RPO = incident → latest restored commit, row counts and content digests equal; when replicated: `replay_lag` (or leader − follower position) exported and ≤ `lag_budget_s`, read-your-writes verified, failover loses no acknowledged write | `durability.backup`, `lag_budget_s` | p.48, p.198, p.205-211, p.234-235, p.282-284 | `operational.cjs recovery` → `RECOVERED`; lag metric sample; failover test |
| 8 | **Derived-data integrity and freshness** | per derived dataset: `DATA_RECONCILE: PASS` (source vs derived by key, missing = extra = mismatched = 0); freshness = write-to-visible latency or consumer lag ≤ `freshness_s`; rebuild from source/log equals the live copy; only the consumer writes the derived store (a direct application write is rejected or absent) | `derived` | p.11, p.103, p.499, p.501-506, p.541, p.577 | `data-score.cjs reconcile <source> <derived> --key id`; freshness probe; permission test |
| 9 | **Erasure and retention** | delete a test subject → zero residual references in the system of record and every derived store, within `sla_days`; backdated records beyond their retention are purged by the job; every personal-data store in the inventory has purpose + retention | `retention` | p.24, p.104, p.512-513, p.591, p.596-597 | deletion e2e test + grep of exports/indexes; purge test; `DATA_LINT` |
| B1 | Shard skew | max ÷ mean load per shard; key → exactly one shard; hash stable across processes | `workload.hot_keys` when sharded | p.255-264 | test |
| B2 | Tenant isolation | tenant A's credentials cannot read B; restoring A leaves B unchanged | multitenant | p.254 | test |
| B3 | Pipeline SLIs | freshness (oldest unprocessed event age), completeness (delivered ÷ published), correctness (golden records), dead-letter depth, dropped-straggler count | batch/stream declared in `derived` | p.495, p.499, p.520; SRE Workbook | metrics + tests |
| B4 | Overload behaviour | backoff with jitter observed under injected failures; breaker opens; after the overload ends, throughput and latency recover without a restart | `slo` | p.38 | fault-injection test |
| B5 | Clock and pause discipline | durations from a monotonic clock (stepping the wall clock back never yields a negative duration); clock offset exported; GC pause budget | distributed deployments | p.359-371 | test + metric |
| B6 | Decision accountability | for systems that decide about people: every decision explainable (inputs + reasons), a correction path recomputes it, outcome disparity across groups monitored | `retention`/AI | p.586-588 | tests + metric |

The distributed paths earn trust the way the book's ch.9 closes: randomized and property-based tests
and fault injection (killed processes, partitioned nodes, stepped clocks) over the anomaly tests of
row 5 and the Tier B rows, not a vendor's correctness claim (p.384-388; Jepsen/Elle in the research
above).

**Monitoring rows this adds** (the `monitoring` dimension, so the numbers above keep existing in
production): a request-duration **histogram** on `/metrics` (buckets, never pre-averaged percentiles,
p.42), replication lag, consumer lag / oldest unprocessed event age, derived-data freshness, dead-letter
depth, dropped stragglers, restore-drill age.

**Deliberately not used** (and why): the mean response time ("doesn't tell you how many users
actually experienced that delay", p.40); averaged percentiles (p.42); p9999 ("too expensive",
p.41); closed-loop load numbers (coordinated omission); server-side service time alone (queueing is
what the user waits for, p.39); throughput without the percentiles at that throughput; a row count as
reconciliation (content digests, not counts, prove equality); "ACID compliant" or an isolation level's
name as proof (p.279, p.298 — run the anomaly tests); uptime nines claimed from a short pilot
(operational-recovery: a short observation proves mechanics only); vendor benchmarks (stack-selection
protocol §5: T4, never the sole source); CPU utilization as a user-facing indicator.

## §6 Acceptance — the `data` dimension

`data` is the seventh dimension of `fullstack_pass_rate` (weight 0.20, renormalized over the
dimensions that ran; a legacy spec without `data` rows is unchanged). It is **gated like `logic`**:
while any `data` row is red the headline pass-rate is capped at 0.50 (`data_gate=CAPPED@0.50`), so an
app that can lose, corrupt or leak data never converges on polish. `acceptance.cjs` treats every
applicable `data` check as required. Each row traces its group (`data:<group>`) plus the `NFR-n` it
satisfies; `DATA_COVERAGE` needs every applicable group traced by ≥ 1 `data` row.

Canonical row set (adapt ids, keep the traces; weight Must = 2, Should = 1):

```yaml
acceptance:
  data:
    - { id: data-workload-pinned,      assert: "DATA.md lints VALID and the load test runs at >= the pinned peak arrival rate",                      weight: 1, traces: "NFR-1,data:workload" }
    - { id: data-slo-open-load,        assert: "DATA_SLO: PASS — p50/p95/p99 within DATA.md slo under an open arrival-rate run, n >= samples_min, errors <= max, dropped=0", weight: 2, traces: "NFR-2,data:slo" }
    - { id: data-hot-paths-indexed,    assert: "DATA_INDEXES: PASS for every model.indexes query; list page statement count constant for 1 and 100 items", weight: 1, traces: "NFR-3,data:model" }
    - { id: data-no-lost-update,       assert: "N concurrent <transaction> runs leave the invariant intact (exact expected value); concurrent uniqueness claims -> exactly one success", weight: 2, traces: "NFR-4,data:integrity" }
    - { id: data-idempotent-retry,     assert: "same idempotency key submitted twice (and after a crash between commit and ack) -> exactly one effect", weight: 2, traces: "NFR-4,data:integrity" }
    - { id: data-durable-ack,          assert: "acknowledged writes are readable after SIGKILL of the datastore/app and restart",                        weight: 2, traces: "NFR-5,data:integrity" }
    - { id: data-migrations-safe,      assert: "MIGRATION_SAFETY: PASS over the migrations dir; old code reads new schema and new code reads old data",    weight: 1, traces: "NFR-6,data:evolution" }
    - { id: data-restore-drill,        assert: "operational.cjs recovery -> RECOVERED within rpo_s/rto_s with equal counts and digests",                 weight: 2, traces: "NFR-7,data:durability" }
    - { id: data-replica-lag,          assert: "replication lag exported and <= lag_budget_s; a user reads their own write (read-your-writes)",          weight: 1, traces: "NFR-7,data:durability" }   # when replication != none
    - { id: data-derived-reconciles,   assert: "DATA_RECONCILE: PASS for <each derived dataset> against its source; freshness <= freshness_s",           weight: 2, traces: "NFR-8,data:derived" }
    - { id: data-derived-single-writer, assert: "the derived store is written only by its consumer; a direct application write is absent/rejected",      weight: 1, traces: "NFR-8,data:derived" }
    - { id: data-erasure-complete,     assert: "deleting a test subject leaves zero references in the system of record and every derived store within sla_days", weight: 2, traces: "NFR-9,data:retention" }
    - { id: data-retention-purge,      assert: "a backdated personal-data record beyond its retention is removed by the purge job",                      weight: 1, traces: "NFR-9,data:retention" }
```

Evidence discipline is unchanged: a row flips to `pass` only with `evidence:<relpath>` naming the
receipt (`verification.cjs run`), teed into `<run-dir>/evidence/data/`; `score-build.sh pass-rate
--strict-evidence` demotes anything else.

## §7 The seam — `scripts/data-score.cjs`

| subcommand | input | verdict line (stdout, one line) | exit |
|---|---|---|---|
| `lint <DATA.md>` | the record | `DATA_LINT: VALID\|INVALID groups=N/8 na=K` | 0 / 1 / 2 |
| `coverage <DATA.md> <results.tsv>` | record + ledger | `DATA_COVERAGE: N.NN` (`data_total= data_covered= data_missing= data_orphans=` on stderr) | 0 iff 1.00 and no orphans |
| `slo <k6-summary.json\|samples> [--data DATA.md] [--p50 --p95 --p99 --errors --min-samples] [--model open\|closed]` | k6 end-of-test summary (executors decide the model) or one latency per line (`ms[<tab>ok\|err]`) with `--model` declared | `DATA_SLO: PASS\|FAIL p50= p95= p99= n= errors= dropped= model= source=` | 0 / 1 / 2 |
| `reconcile <source> <derived…> --key <col> [--fields a,b]` | TSV, CSV or JSON exports | `DATA_RECONCILE: PASS\|FAIL source= derived= missing= extra= mismatched=` | 0 / 1 / 2 |
| `migrations <dir\|file.sql…> [--dialect postgres\|mysql\|sqlite]` | SQL migrations (Prisma `migration.sql` trees are found) | `MIGRATION_SAFETY: PASS\|FAIL files= statements= unsafe= annotated= dialect=` | 0 / 1 / 2 |
| `explain <plan.json\|plan.txt…> [--max-seq-rows 1000]` | PostgreSQL `EXPLAIN (FORMAT JSON)` / text, SQLite `EXPLAIN QUERY PLAN` | `DATA_INDEXES: PASS\|FAIL plans= seq_scans= max_seq_rows=` | 0 / 1 / 2 |

When k6 is not installed, `node scripts/data-load.cjs run <url> --rate <peak/s> --duration 60s --out
samples.tsv` is the open-model generator: it starts requests on a fixed schedule whether or not
earlier ones finished, measures client side, and declares `# load_model: open` and `# dropped: N`
in-band so `slo` needs no `--model` flag (`dropped` = requests the generator itself could not start
within one interval of their planned time, the analogue of k6's `dropped_iterations`).
`tests/data-e2e.test.cjs` is the worked example: a real POS service on `node:sqlite`
(`tests/fixtures/data/app/`, two processes on one database) driven through every gate — lint, the
open-model load, real `EXPLAIN QUERY PLAN` output, cross-process lost-update and uniqueness,
idempotent retries, a killed-and-restarted process, the migrations lint, a restore drill, three
derived datasets reconciled (and drift caught), erasure checked in every export — ending in
`score-build.sh pass-rate --strict-evidence` → `data_gate=PASS` and `DATA_COVERAGE: 1.00`.

`scripts/score-build.sh coverage <results.tsv> <requirements.md> <DATA.md>` prints `DATA_COVERAGE`
after `REQ_COVERAGE` and `DESIGN_COVERAGE` (or `BUILD_DATA_MD` names the record); `pass-rate` prints
`data_gate=PASS|CAPPED@0.50|n/a`. `REQUIRE_DATA=1 scripts/score-requirements.sh validate <spec>`
refuses a spec without a traced `data` block. Percentiles are nearest-rank over the sorted samples;
the seam never averages percentiles. Everything is deterministic and re-runnable by a third party on
the stored run directory; it checks the record and the evidence shape, not the truth of a
self-reported number — the receipts and the independent verify before convergence do that.

## §8 Anti-patterns the book names (lint or review catches each)

| anti-pattern | why it fails | the rule | book |
|---|---|---|---|
| Analytics or ad-hoc SQL on the OLTP database | hurts the application's users; data silos | warehouse/lake fed from the system of record | p.6-7 |
| Dual writes (app writes db **and** cache/index) | races leave the copies permanently inconsistent | CDC/outbox/event-log consumer as the only writer | p.501-503, p.541 |
| Mean latency, averaged percentiles | hides the tail, mathematically meaningless | percentiles from histograms, client side | p.40-42 |
| Closed-loop load test | stops sending while the server stalls (coordinated omission) | open arrival-rate model | ch.2 + Tene |
| Polling for changes | load scales with pollers, not with changes | push / subscribe to the change stream | p.35, p.489, p.553 |
| Timestamp ordering of cross-node events; LWW on wall clocks | clocks skew; causally later writes are dropped | logical clocks, version vectors, single decider | p.219-220, p.224, p.363-364 |
| Check-then-insert for uniqueness | fails under weak isolation | database uniqueness constraint; serializable for phantoms | p.306-308, p.564 |
| Read-modify-write counters | lost updates | atomic update, `SELECT FOR UPDATE`, CAS | p.299-302 |
| `hash(key) mod N`; timestamp as first partition-key element | rebalancing moves everything; one hot shard | fixed shard count or hash ranges; prefix the key | p.257-259 |
| Record-at-a-time writes from a batch job into production | slow, overwhelms the db, duplicates on retry | stream + completion marker, or bulk load and swap | p.479-481 |
| Retrying on timeout without an idempotency key | the action happens twice | end-to-end request id + uniqueness constraint | p.183, p.288, p.563-564 |
| Destructive migration in the release that still reads the old shape | old code breaks during the rolling upgrade | expand/contract with annotated contract step | p.161-162, p.179 |
| Automatic failover without consensus; async replication + failover | split brain, lost acknowledged writes | proven consensus, fencing, or manual failover | p.205-206, p.411, p.437 |
| Replication instead of backups | replicas replicate deletions | backups + restore drills | p.198 |
| Hoarding personal data "in case" | toxic asset; breach, fines, compelled disclosure | purpose + retention + purge | p.25, p.594-597 |
| Distributing before one machine is exhausted | complexity with no benefit | single node, embedded engine first | p.20-21, p.253, p.389 |

## §9 Sources this protocol rests on (accessed 2026-11-07)

- Kleppmann, M. & Riccomini, C., *Designing Data-Intensive Applications*, 2nd ed., O'Reilly Media,
  2026 (ISBN 978-1-098-11906-5) — ch.1 Trade-offs; ch.2 Nonfunctional requirements; ch.3 Data models;
  ch.4 Storage and retrieval; ch.5 Encoding and evolution; ch.6 Replication; ch.7 Sharding; ch.8
  Transactions; ch.9 The trouble with distributed systems; ch.10 Consistency and consensus; ch.11
  Batch; ch.12 Stream; ch.13 A philosophy of streaming systems; ch.14 Doing the right thing.
- Beyer et al., *Site Reliability Engineering*, ch. "Service Level Objectives" — https://sre.google/sre-book/service-level-objectives/
- Beyer et al., *The Site Reliability Workbook*, ch. "Data Processing Pipelines" (freshness, correctness, completeness SLOs) — https://sre.google/workbook/data-processing/
- Tene, G., "How NOT to Measure Latency" and the coordinated-omission discussion — https://groups.google.com/g/mechanical-sympathy/c/icNZJejUHfE ; HdrHistogram — https://github.com/HdrHistogram/HdrHistogram
- Grafana k6, open vs closed models and the constant-arrival-rate executor — https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/ · https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/
- Kingsbury, K. & Alvaro, P., "Elle: Inferring Isolation Anomalies from Experimental Observations" (2020) — https://arxiv.org/abs/2003.10554
- Squawk, PostgreSQL migration linter rules — https://squawkhq.com/docs/rules ; Kane, A., strong_migrations — https://github.com/ankane/strong_migrations
- PostgreSQL documentation, `pg_stat_replication` lag columns — https://www.postgresql.org/docs/current/monitoring-stats.html
- AWS Well-Architected, REL09-BP04 "Perform periodic recovery of the data to verify backup integrity and processes" — https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_backing_up_data_periodic_recovery_testing_data.html
- UK Government Data Quality Framework (DAMA dimensions: accuracy, completeness, uniqueness, consistency, timeliness, validity) — https://www.gov.uk/government/news/meet-the-data-quality-dimensions
- OpenTelemetry semantic conventions, `db.client.operation.duration` (histogram, seconds) — https://opentelemetry.io/docs/specs/semconv/database/database-metrics/
- GDPR Articles 12(3) and 17 as applied in EDPB-published decisions (one month, extendable with notice) — https://www.edpb.europa.eu/

## §10 Coverage of the book

`references/data-intensive-book-map.md` maps every section of the book's table of contents to its
home in forge — a gate, a `DATA.md` decision, protocol guidance, the stack decision, or a reasoned
"not mechanized" (engine internals, Byzantine faults, HPC). Read it when a review asks "where did the
book's chapter on X go?".
