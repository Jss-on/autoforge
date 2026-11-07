# The data metrics: research ledger behind protocol §5

Protocol §5 lists what forge measures for a data-intensive system and §9 lists the sources. This file is
the research step between them: for each gated metric, the candidate measures that were considered, what
the primary sources say (quoted; accessed 2026-11-07 and re-consulted 2026-11-08), the decision, and why the
alternatives were rejected. Book pages are *Designing Data-Intensive Applications*, 2nd ed.

## Method

1. Start from the book's own instruction for each of the eight `DATA.md` groups (protocol §2) and the
   digests' "Metrics and numbers" tables (`data-intensive-digest-ch01.md` … `ch14.md`), which record every
   number and measurement the book gives with its page.
2. For each candidate measure, find the primary source that defines how it is measured in practice
   (standards bodies, the SRE books, tool documentation, a peer-reviewed checker, regulation) and quote it.
3. Keep a measure only if it is (a) client-observable or ledger-observable, (b) reproducible by a third
   party from stored evidence, (c) decidable by a seam with a threshold the owner pinned in `DATA.md`.
4. Record the rejected measure and the reason, so the choice can be re-argued from evidence rather than
   taste.

## Row 1 · Response-time percentiles under an open arrival-rate load

| Candidate | Source statement | Verdict |
|---|---|---|
| Mean response time | SRE book, *Service Level Objectives*: "averaging request latencies may seem attractive, but obscures an important detail … A simple average can obscure these tail latencies, as well as changes in them." Book pp.40-42: the response time is a distribution; the mean says nothing about how many users waited. | rejected |
| Percentiles (p50/p95/p99) | SRE book: "Using percentiles for indicators allows you to consider the shape of the distribution and its differing attributes." Book p.41: p99 is what the slowest 1 in 100 requests experience; p.42 the SLO is stated per percentile. | **kept** — p50, p95, p99 pinned in `slo.response_time_ms` |
| Averaged percentiles across runs or shards | Book p.42: percentiles cannot be averaged; HdrHistogram README: the histogram is the unit that can be merged. | rejected — raw samples or merged histograms only (`data-score.cjs slo` reads samples or a k6 summary, never an average of percentiles) |
| Closed-loop load (fixed virtual users) | k6, *Open and closed models*: "In a closed model, the execution time of each iteration dictates the number of iterations executed in your test … a closed model load test will wait, resulting in increased iteration durations … In some testing literature, this problem is known as coordinated omission." HdrHistogram README: a system that responds in 1 ms for 100 s then stalls 100 s with one sample recorded "would show ~99.99% of results at 1 msec or below, which is obviously not right." | rejected as the headline — the tail is hidden exactly when the system degrades |
| Open arrival-rate load | k6, *constant-arrival-rate*: "It is an open-model executor, meaning iterations start independently of system response … continues to start iterations at the given rate as long as VUs are available." HdrHistogram: `recordValueWithExpectedInterval` fills the stall "linearly decreasing in steps" of the expected interval so the histogram "will correctly represent the response time distribution." | **kept** — `slo.load_model: open`; `data-load.cjs` measures latency from the *planned* arrival time, which is the same correction applied at the source |
| Dropped arrivals | k6 metrics reference, `dropped_iterations`: "The number of iterations that weren't started due to lack of VUs (for the arrival-rate executors) or lack of time (expired maxDuration in the iteration-based executors)." A non-zero count means the measured percentiles exclude the requests that were never sent, so the tail is understated exactly as in the closed model. | **kept** — `dropped = 0` is part of the verdict, declared in-band by `data-load.cjs` and read from the k6 summary |
| Server-side service time only | SRE book: "not measuring behavior at the client can miss a range of problems that affect users." Book p.37-39: response time includes queueing and network; service time does not. | rejected — `slo.measured_at` is client-side |
| Sample size | SRE book on windows: a per-minute average "may hide much higher instantaneous request rates in bursts." Statistically p99 needs hundreds of samples to move. | **kept** — `slo.samples_min` (default 300) and a window of 60 s at the pinned peak |

## Row 2 · Error ratio

| Candidate | Source statement | Verdict |
|---|---|---|
| Error ratio = failed ÷ total in the same run | Book p.42 (the SLO example couples "99.9 % of requests" with the percentile); SRE book: "Have as few SLOs as possible … Choose just enough SLOs to provide good coverage." | **kept** — one ratio per run, `slo.error_rate_max` |
| Availability "nines" from a short pilot | SRE book: windows matter; a week of uptime cannot establish 99.95 %. Book p.43-47: reliability is about faults tolerated, not an uptime number. | rejected as evidence of availability; kept only as the *target* `slo.availability` measured by a probe over `slo.window` |

## Row 3 · Load model pinned and reached

| Candidate | Source statement | Verdict |
|---|---|---|
| Describe load before scaling | Book p.50-52: "describe the current load … then discuss growth"; design for one order of magnitude ahead, not more. | **kept** — `workload` lint: peak reads/s, writes/s, concurrency, volume, growth, hot keys; the load test must run at ≥ the pinned peak |
| Throughput alone | Book p.50: load parameters are chosen per system; throughput without the response-time distribution at that throughput proves nothing. | rejected as a verdict; it is the *input* to row 1 |

## Row 4 · Index coverage of the hot paths

| Candidate | Source statement | Verdict |
|---|---|---|
| `EXPLAIN` of each declared hot query | Book pp.116-133: indexes are chosen by hand from the access patterns; every index slows writes, so each must earn its place. | **kept** — `model.indexes` names the query each index serves; `data-score.cjs explain` fails on a sequential scan over ≥ 1,000 rows |
| Statement count constant for 1 and 100 rows | Book pp.68-69: the N+1 pattern as the document/relational mismatch's cost. OpenTelemetry `db.client.operation.duration` is a histogram per operation, so counts per request are observable. | **kept** — the `perf-no-n1-and-pagination` row |
| Vendor benchmark numbers | not reproducible on the owner's data and hardware | rejected |

## Row 5 · Concurrency anomalies, idempotent retry, durable acknowledgement

| Candidate | Source statement | Verdict |
|---|---|---|
| Trusting the isolation level's name | Book p.279 "ACID compliant" is marketing; p.298 "repeatable read" differs per vendor; p.292 the default is read committed. | rejected |
| Observed anomaly tests per declared transaction | Elle (Kingsbury & Alvaro 2020, abstract): a checker that "infers an Adya-style dependency graph between client-observed transactions"; an ideal checker is "sound (no false positives)" and "efficient (polynomial in history length and concurrency)." Elle README (jepsen-io/elle): "Sound: Elle can find every (non-predicate) anomaly from Adya, Liskov, & O'Neil's Generalized Isolation Level Definitions"; the anomalies it names: "G0: Write cycle", "G1a: Aborted read", "G1b: Intermediate read", "G1c: Cyclic information flow", "G-Single: Read skew", "G2: Anti-dependency cycle", plus "Internal Inconsistency", "Inconsistent Version Orders", "Dirty Updates", "Duplicate Writes", "Garbage Reads"; "When Elle claims an anomaly in an observable history … either a corresponding anomaly exists, or something worse happened." forge scales this down to one targeted, deterministic test per `integrity.transactions` entry rather than a full history checker: lost update (book p.299), write skew and phantoms (p.303), uniqueness under concurrency, each asserting the exact expected end state. | **kept** — `data-no-lost-update`, the uniqueness burst, the exact expected final value; a Jepsen/Elle run is the stack's own verification and is cited when the store publishes one |
| Idempotency key stored with the effect | Book pp.334-335, 562-566: exactly-once through idempotence and the end-to-end request id, not through distributed transactions. | **kept** — same key twice, and after a crash between commit and acknowledgement → one effect |
| Durable acknowledgement | Book pp.282-284: durability is risk reduction; fsync, WAL, replication and backups "can and should be used together"; p.283 acknowledge only after the write reached the required nodes. | **kept** — acknowledged write survives `SIGKILL` and restart |

## Row 6 · Migration safety and compatibility

| Candidate | Source statement | Verdict |
|---|---|---|
| Lint of destructive or lock-taking DDL | strong_migrations README: adding a column with a volatile default "rewrites the whole table. Reads and writes are blocked"; a non-concurrent index "blocks writes"; changing a type or renaming "breaks the running application"; the safe pattern is expand (new column, dual write, backfill, move reads) then contract. Squawk rule list: `adding-not-nullable-field`, `changing-column-type`, `renaming-column`, `renaming-table`, `require-concurrent-index-creation`. | **kept** — `data-score.cjs migrations` flags these unless annotated as a contract step |
| Compatibility both ways | Book pp.161-162, 179: rolling upgrades need backward and forward compatibility; data outlives code. | **kept** — old code reads new data, new code reads old (`data-till-compat`) |
| Down migrations as the safety net | not reversible once data was written in the new shape; the book's answer is compatibility, not rollback of schema | rejected as a requirement |

## Row 7 · Recovery objectives, measured

| Candidate | Source statement | Verdict |
|---|---|---|
| Assuming a backup exists and restores | AWS Well-Architected REL09-BP04 anti-patterns: "Assuming that a backup exists … Assuming that the time to restore … falls within the RTO … Restoring a backup, but not querying or retrieving any data to check that the restoration is usable." | rejected |
| Restore drill with validation and timing | REL09-BP04: "Validate that your backup process implementation meets your Recovery Time Objectives (RTO) and Recovery Point Objectives (RPO) by performing a recovery test … Verify that restoration from a backup results in a resource that contains the original data without any of it being corrupted"; validate with "checksum, size, or a combination"; "Measure time required for restore and recovery and compare it to your established RTO"; "Automate this process to run periodically." | **kept** — `operational.cjs recovery`: boot from the restored copy, answer the recorded journey, counts and digests equal, measured RTO/RPO against `durability.backup` |
| Replication lag by the store's own counters | PostgreSQL `pg_stat_replication`: `write_lag`, `flush_lag`, `replay_lag` are each "Time elapsed between flushing recent WAL locally and receiving notification that this standby server has written … flushed … applied it." Book pp.209-214: read-your-writes and monotonic reads are what lag breaks. | **kept** when replicated — lag ≤ `lag_budget_s`, read-your-writes test |
| Failover that loses acknowledged writes | Book pp.204-205, 234-235: asynchronous failover can discard writes; split brain. | **kept** as a negative test — failover loses no acknowledged write |

## Row 8 · Derived-data integrity and freshness

| Candidate | Source statement | Verdict |
|---|---|---|
| Row counts as reconciliation | Equal counts hide swapped or corrupted rows; book pp.575-578 "trust, but verify" asks for auditing the data itself. | rejected — digests, not counts |
| Reconcile against the source with digests | Book pp.501-506 (dual writes drift; CDC and the single writer), p.541, p.577. SRE Workbook, *Data Processing Pipelines*: correctness "compare expected and actual output"; completeness "the percentage of events that are delivered after they are successfully published"; "a daily internal auditing system compares counts of published and delivered events"; skew "the maximal percentage of data that can be misplaced." UK Data Quality Framework dimensions: accuracy, completeness, uniqueness, consistency, timeliness, validity. | **kept** — `DATA_RECONCILE` per derived dataset: missing = extra = mismatched = 0; rebuild equals live |
| Freshness | SRE Workbook: freshness as "X% of data processed in Y [seconds, days, minutes]" measured from "the earliest theoretical time the bucket could have been closed." Book p.571 timeliness versus integrity. | **kept** — write-to-visible latency or consumer lag ≤ `freshness_s` |
| Single writer | Book pp.501-506: dual writes are the root of drift. | **kept** — a derived store has exactly one writer (the consumer/job), proven by a test that the app has no other path |

## Row 9 · Erasure and retention

| Candidate | Source statement | Verdict |
|---|---|---|
| "We delete on request" as a statement | GDPR Art. 17(1): "the controller shall have the obligation to erase personal data without undue delay"; Art. 17(2): inform other controllers "of any links to, or copy or replication of, those personal data." Book pp.512-513: immutable logs and derived copies must be reachable by deletion; pp.596-597 data as liability. | rejected as evidence |
| Erasure test across every store within a hard SLA | Art. 12(3): respond "without undue delay and in any event within one month of receipt of the request," extendable by two months with notice. The one month is the hard lint (`retention.deletion.sla_days ≤ 30`); the test deletes a subject and searches every table, index, cache, export and summary for residue. | **kept** — `data-erasure-complete`, `data-retention-purge` |
| Purpose and retention per store | Book p.24, p.104 data minimization; the inventory in `retention.personal_data`. | **kept** — linted |

## Measures deliberately not used

Mean response time; percentiles averaged across runs; p9999 (too few samples at the pinned peak to be
stable); closed-loop load numbers as the headline; server-side service time alone; throughput without the
percentiles at that throughput; row counts as reconciliation; an isolation level's name or "ACID
compliant" as proof; uptime nines from a short pilot; vendor benchmarks; CPU utilization as a user-facing
indicator (book p.50: it is a resource metric, not a load parameter the user feels).

## How the sources were read

Each page was fetched in full on 2026-11-08 and the statements above are verbatim unless marked as a
paraphrase. The two pages longer than one fetch (PostgreSQL's statistics chapter, OpenTelemetry's database
metrics) were read to their end in a second fetch: the remainder of the PostgreSQL page holds no further
lag statement; the remainder of the OpenTelemetry page defines `db.client.connection.wait_time` and
`db.client.connection.use_time` ("The time it took to obtain an open connection from the pool"; "The time
between borrowing a connection and returning it to the pool"), both histograms in seconds — pool waits are
part of the client-side response time row 1 measures, which is why forge measures at the client and not
at the engine.

## Sources quoted here

- Beyer et al., *Site Reliability Engineering*, "Service Level Objectives" — https://sre.google/sre-book/service-level-objectives/
- Beyer et al., *The Site Reliability Workbook*, "Data Processing Pipelines" — https://sre.google/workbook/data-processing/
- Grafana k6, "Open and closed models" — https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/ · "constant-arrival-rate" — https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/ · metrics reference — https://grafana.com/docs/k6/latest/using-k6/metrics/reference/
- HdrHistogram README (corrected versus raw recording) — https://github.com/HdrHistogram/HdrHistogram
- Kingsbury, K. & Alvaro, P., "Elle: Inferring Isolation Anomalies from Experimental Observations" (2020) — https://arxiv.org/abs/2003.10554
- Kane, A., strong_migrations README — https://github.com/ankane/strong_migrations · Squawk rules — https://squawkhq.com/docs/rules
- PostgreSQL, "The Cumulative Statistics System", `pg_stat_replication` — https://www.postgresql.org/docs/current/monitoring-stats.html
- AWS Well-Architected, REL09-BP04 — https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_backing_up_data_periodic_recovery_testing_data.html
- OpenTelemetry semantic conventions, database metrics — https://opentelemetry.io/docs/specs/semconv/database/database-metrics/
- GDPR Articles 17 and 12 — https://gdpr-info.eu/art-17-gdpr/ · https://gdpr-info.eu/art-12-gdpr/
- UK Government Data Quality Framework, the six dimensions — https://www.gov.uk/government/news/meet-the-data-quality-dimensions
