<!-- forge reference: a page-cited digest of Designing Data-Intensive Applications, 2nd ed. (Kleppmann & Riccomini, O'Reilly 2026), chapter 12. Written while reading the chapter; every rule, number, failure mode, question and property carries its page. The condensed layer is references/data-intensive-protocol.md (§0-§8); the row-level map is references/data-intensive-book-map.md; this file is the full layer the requirements data round and the build Phase 4 review consult for the chapters a DATA.md group cites. -->

# Digest: Chapter 12 - Stream Processing (DDIA 2nd ed., pp.487-537)

## Thesis

Streams are the unbounded counterpart of batch files: events made available incrementally, transported by message brokers and event logs that "serve as the streaming equivalent of a filesystem" (p.487-488, p.529). Two broker families trade off differently: AMQP/JMS brokers assign and delete individual messages (good for task queues, poor for replay and ordering), while log-based brokers keep a sharded append-only log with consumer offsets, preserving order within a partition and allowing old messages to be reread (p.497, p.529-530). Databases and streams are "two sides of the same coin": the changelog can be captured implicitly by change data capture or explicitly by event sourcing, turning search indexes, caches and warehouses into followers of one leader and eliminating dual-write races (p.501-503, p.509). Processing never-ending input forces explicit decisions about time (event time vs processing time, stragglers, window types), stateful joins (stream-stream, stream-table, table-table) and fault tolerance through microbatching, checkpointing, internal transactions or idempotent writes (p.518-529).

## Decision rules

| rule | when it applies | why (mechanism) | page |
|---|---|---|---|
| Move from daily or hourly batches to processing every event as it happens when users cannot wait for the next batch | batch vs stream | daily output "is too slow for many impatient users"; data is unbounded so batch slices are artificial | p.487-488 |
| Notify consumers of new events instead of having them poll a datastore | continual low-delay processing | the more often you poll, the fewer requests return new events and the higher the overhead | p.489 |
| Do not build event delivery on database triggers | choosing a notification mechanism | triggers are "very limited" and "an afterthought in database design" | p.489 |
| Decide explicitly what happens when producers outrun consumers: drop, buffer in a queue, or apply backpressure | selecting any messaging system | Unix pipes and TCP use backpressure; brokers generally buffer unboundedly | p.489-491 |
| If buffering, know what happens when the queue exceeds memory and when the disk fills | capacity planning for a broker | crash vs spill to disk; disk access degrades performance | p.490 |
| Tolerate message loss only for periodically repeated readings (sensors, metrics); demand reliable delivery when counting events | durability requirement | "every lost message means incorrect counters"; large drops may go unnoticed | p.490 |
| Trade durability (disk writes, replication) for throughput and latency only when loss is affordable | performance vs durability | durability "has a cost" on the same hardware | p.490 |
| Use direct messaging (UDP multicast, ZeroMQ, StatsD, webhooks) only where the application handles loss and both sides are always online | low-latency feeds such as market data | offline consumers miss messages; a crashed producer loses its retry buffer | p.490-491 |
| Use a message broker when clients connect, disconnect and crash | typical application messaging | durability moves to the broker; consumers become asynchronous | p.491 |
| Do not use AMQP/JMS-style brokers for long-term storage or long backlogs | storage decision | messages are deleted after delivery; brokers assume short queues; throughput degrades as the backlog grows | p.492 |
| Avoid repurposing a database as a queue unless prepared to tune it carefully | messaging infrastructure | "tuning them to get good performance is not straightforward" | p.492 |
| Use load balancing when messages are expensive to process; fan-out when independent consumers each need every message; combine via consumer groups | multiple consumers of a topic | load balancing shares work; fan-out is like several batch jobs reading one file | p.492-493 |
| Require consumer acknowledgments so unprocessed messages are redelivered | consumer crashes | broker assumes unacknowledged messages were not processed | p.493 |
| Plan for processed-but-unacknowledged messages: atomic commit, idempotence, or accept duplicates | ack lost in the network | the broker redelivers an already processed message | p.494 |
| Do not combine load balancing with redelivery when messages have causal dependencies; use a separate queue per consumer instead | ordering matters | redelivery after a crash yields m4, m3, m5 even in order-preserving brokers | p.494 |
| Route poison messages to a dead letter queue and monitor it | a malformed message crashes consumers | infinite redelivery blocks the stream or wastes resources; operator can drop, fix, or redeploy | p.495 |
| Prefer log-based brokers when you need to rerun a consumer, add consumers that read history, or build derived data | reprocessing and data integration | receiving from AMQP/JMS is destructive; a log is read-only like a file | p.495, p.500 |
| Shard the log into partitions to exceed one disk's throughput; a topic is a group of partitions | scaling a log-based broker | each shard is an independent log on its own machine | p.496 |
| Rely on ordering only within one partition; send events that must be ordered together to the same partition via a partition key such as user ID | per-entity ordering | "There is no ordering guarantee across different partitions" | p.497-498 |
| Choose JMS/AMQP when messages are expensive, need per-message parallelism and order is unimportant; choose log-based when throughput is high, each message is fast and ordering matters | broker selection | log assigns whole shards to consumers; parallelism capped by shard count; head-of-line blocking | p.497 |
| Process each shard single-threaded; add shards to add parallelism | consumer design | thread pools "complicate consumer offset management" | p.497 |
| Record consumer offsets periodically rather than per-message acks; expect reprocessing of some messages after a failure | log-based consumption | less bookkeeping, more batching; restart resumes from last recorded offset | p.498 |
| Monitor how far each consumer is behind the head of the log and alert when it falls behind significantly | operating log-based brokers | the disk buffer gives time for a human to fix a slow consumer before messages age out | p.499 |
| Size retention by disk capacity; accept that a consumer lagging beyond retention loses messages | retention policy | the log is a bounded ring buffer on disk | p.498-499 |
| Use tiered or object storage for retention and expose messages as Iceberg tables | long retention and data integration | lower cost; batch and warehouse jobs run directly on the data | p.499 |
| Attach experimental consumers to production logs freely | development, testing, debugging | a lagging consumer "does not disrupt the service for other consumers"; only an offset remains | p.499 |
| Delete queues whose consumers are gone in traditional brokers | housekeeping | abandoned queues accumulate messages and take memory | p.500 |
| Reprocess by starting a consumer copy at an old offset and writing output to a different location | bug fixes and experiments | the offset is under the consumer's control; repeatable transformation like batch | p.500 |
| For event sourcing use a log-based broker configured never to delete old events | event-sourced systems | append-only storage with low-latency notification | p.500 |
| Avoid dual writes; make derived systems followers of the database via CDC | keeping DB, cache, search index, warehouse in sync | concurrent dual writes race and leave systems "permanently inconsistent"; partial failure needs expensive atomic commit; there is no single leader | p.501-503 |
| Transport CDC events through a log-based broker | CDC pipelines | it "preserves the ordering of messages" | p.504 |
| Expect CDC to be asynchronous and plan for replication lag | CDC consumers | the system of record does not wait for consumers | p.504 |
| Start a new derived system from a consistent snapshot tied to a known log offset when the log is truncated | bootstrapping a derived view | recent changes alone miss items "not recently updated" | p.504-505 |
| Enable log compaction when every change carries a primary key and each update replaces the prior value, so new consumers rebuild from offset 0 | CDC topics | the compacted log holds the latest value for every key; no new snapshot needed | p.505-506 |
| Pick event sourcing when you want application-level intent events and can restructure the application; pick CDC to add streams to an existing database with minimal change | CDC vs event sourcing | CDC extracts low-level changes in write order; event sourcing is "a big change" | p.507 |
| Treat database schemas exposed via CDC as public APIs governed by data contracts; decouple with an outbox table | CDC in microservices | removing a column "will break downstream consumers", possibly a customer-facing outage | p.507 |
| Accept the outbox as a dual write within one database transaction, paying for schema translation and extra write volume | outbox pattern | both writes "appear in a single transaction" | p.508 |
| Keep the full event history for event sourcing and use snapshots only as a performance optimization | event-sourced systems | later events do not override earlier ones, so compaction is impossible | p.508 |
| Treat the event log as the system of record and mutable state as a derived, reproducible view | architecture | state is the integral of the stream; "the log contains all the information there is" | p.509 |
| Correct mistakes with compensating events, never by rewriting history | errors in recorded data | auditability; easier recovery from buggy code; customer-service diagnosis | p.510 |
| Derive several read-optimized views from one log and run old and new systems side by side instead of migrating a schema | adding features | each view is just another consumer; shut the old one down when readers have moved | p.510 |
| Denormalize freely in read views | CQRS designs | the translation from log to view keeps denormalized data consistent | p.511 |
| Update views asynchronously and handle read-your-writes separately | CQRS | synchronous view updates need distributed transactions, "usually impractical" | p.511 |
| Model an event as a self-contained user action so one append is the only write; shard log and state identically for a single-threaded consumer | concurrency control | one atomic write replaces multi-object transactions; the log defines a serial order per shard | p.511-512 |
| Keep immutable history only when churn is low; for high update/delete rates invest in compaction and garbage collection | immutability feasibility | history "may grow prohibitively large" and fragment | p.512 |
| Plan true deletion (excision, crypto-shredding) for legal requirements and decide key granularity up front | GDPR-style erasure | appending a deletion event is not enough; you can shred "all or none" of data under one key | p.512-513 |
| Let a stream consumer be the only writer when a stream maintains a database or index | writing stream output to storage | keeps the store in sync with the stream | p.513 |
| Do not use sort-merge joins or restart-from-beginning recovery on streams | stream processing design | a stream never ends; a years-long job cannot restart from the start | p.514 |
| Use CEP for event-pattern detection and stream analytics for windowed aggregates and statistics | choosing a processing style | CEP stores queries and matches events; analytics aggregates over windows | p.514-515 |
| Use probabilistic algorithms (Bloom filters, HyperLogLog, percentile sketches) as a memory optimization, not because streaming is inherently approximate | memory-bound analytics | "nothing inherently approximate about stream processing" | p.515 |
| For materialized view maintenance use frameworks that support unbounded windows and log compaction (Kafka Streams, ksqlDB) | keeping caches and indexes current | needs "a window that stretches all the way back to the beginning of time" | p.516 |
| Prefer incremental view maintenance over periodic REFRESH MATERIALIZED VIEW | fresh materialized views | periodic refresh reprocesses all data and leaves views stale between runs | p.516-517 |
| For search on streams, store queries and evaluate documents against them; index the queries when there are many | media monitoring, saved searches | avoids testing every document against every query | p.517 |
| Do not treat actor frameworks as stream processors; add retry logic if you use them | event-driven RPC vs streams | many "do not guarantee message delivery in the case of crashes" | p.518 |
| Window by event timestamp, not processing time, whenever processing lag can be significant | windowed analytics | a redeploy backlog otherwise looks like "a sudden anomalous spike" | p.518-519 |
| Choose a straggler policy: drop late events and alert on the dropped count, or publish corrections and retractions | event-time windows | you can never be sure all events for a window have arrived | p.520 |
| Use "no more messages before t" markers to close windows; track each producer when several produce | watermark-style window triggering | each producer has its own minimum timestamp; adding or removing producers is trickier | p.521 |
| Log three timestamps (device event time, device send time, server receive time) and correct device clocks by offset | mobile or offline clients | device clocks cannot be trusted; server time is accurate but less meaningful | p.521 |
| Pick the window type by meaning: tumbling (each event in one window), hopping (overlap for smoothing), sliding (events within an interval of each other), session (inactivity gap) | windowed aggregation | different grouping semantics; hopping can be built from tumbling windows | p.522 |
| Provision memory or disk for window and join state | sliding windows, joins, large windows, high throughput | events must be buffered until the window finishes | p.522 |
| For stream-stream joins pick a join window and emit the negative case on expiry; do not substitute embedding one event in the other | click-through rate | embedding reports only clicks, not searches without clicks | p.523 |
| For stream-table joins keep a local copy of the table updated by CDC rather than querying the remote database per event | stream enrichment | remote queries "are likely to be slow and risk overloading the database" | p.524 |
| Model table-table joins as materialized view maintenance (changes on one side joined with current state of the other) | timeline caches, derived joins | follows the product rule for the derivative of a join | p.525 |
| Make time-dependent joins deterministic with versioned record identifiers (slowly changing dimension) or by denormalizing the value into the event | reprocessing historical data, tax rates | cross-stream interleaving is otherwise nondeterministic; versioning forbids compaction | p.526 |
| Use microbatching of about one second (Spark Streaming) or barrier-triggered checkpoints (Flink) for in-framework exactly-once | stream fault tolerance | smaller batches raise overhead, larger ones raise latency; checkpoints avoid forcing a window size | p.527 |
| Protect external side effects with an internal atomic commit (Dataflow, VoltDB, Kafka) or idempotence; checkpointing alone is not enough | outputs leave the framework | the framework cannot retract a database write, email or external publish | p.527-528 |
| Make external writes idempotent by storing the triggering offset with the value | writes to external databases | lets the consumer detect updates already applied | p.528 |
| When relying on idempotence, replay the same messages in the same order, keep processing deterministic, prevent concurrent updaters, and fence failed-over nodes | effectively-once processing | a node "thought to be dead but is actually alive" can interfere | p.528 |
| Keep state local and replicate it periodically (Flink snapshots, Kafka Streams changelog topic) rather than querying a remote store per message; rebuild from input when windows are short or the state is a CDC replica | state recovery | per-message remote queries are slow; merits shift with storage and network technology | p.529 |

## Metrics and numbers

| metric or quantity | definition / how measured | values or thresholds the book gives | caveats | page |
|---|---|---|---|---|
| End-to-end delay of a periodic batch | time from input change to visible output | daily batch reflects changes "a day later"; alternatives: hourly, per second, continuous | motivates streaming | p.487-488 |
| Broker delivery latency | time from producer send to consumer delivery | "often within a fraction of a second, but sometimes significantly later if there is a queue backlog" | producer waits only for the broker's buffer confirmation | p.491 |
| Broker throughput | messages per second | log-based brokers reach "millions of messages per second" via sharding and replication | | p.497 |
| Disk buffer capacity | drive size divided by write rate | 20 TB drive at 250 MB/s fills in about 22 hours, so at least 22 hours of buffer; typically "several days' or even weeks'" | deployments rarely use full write bandwidth | p.499 |
| Consumer lag | distance between consumer offset and head of log | alert "if it falls behind significantly"; messages lost once lag exceeds retention | | p.499 |
| Retention | time or size before segments are deleted or archived | tied to disk size; object-store tiering extends it | compacted log size depends on current contents, not number of writes | p.498-499, p.505 |
| Parallelism bound | number of consumer nodes sharing a topic | at most the number of shards | even/odd offset splitting is a workaround | p.497 |
| Window examples | aggregation interval | "average ... over the last five minutes" and 99th percentile; 1-minute counts; five-minute hopping window with one-minute hop; session gap of 30 minutes; stream-stream join window of one hour, or 30 minutes in the summary | | p.515, p.520, p.522-523, p.531 |
| Dropped straggler count | number of late events ignored | track as a metric and alert when significant | | p.520 |
| Device clock offset | server receive time minus device send time | applied to device event time | assumes negligible network delay and stable offset | p.521 |
| Offline buffering delay | time until a mobile app can upload | "hours or even days later" | appear as extreme stragglers | p.521 |
| Click delay after search | time between joined events | seconds typical, "as long as days or weeks"; click may even arrive before search | | p.523 |
| Microbatch size | duration of each mini batch | "typically around one second" | overhead vs visibility delay compromise | p.527 |
| Checkpoint and snapshot interval | how often state is persisted | "periodically", no number given | triggered by barriers in Flink | p.527, p.529 |
| Transaction amortization | input messages per internal transaction | "several input messages within a single transaction" | | p.528 |
| Job lifetime | how long a stream job runs | "several years" | restart-from-beginning infeasible | p.514 |
| Memory of probabilistic algorithms | | "significantly less memory" than exact algorithms | approximate results | p.515 |
| Reference-cited scale | | "2 Million Writes Per Second (On Three Cheap Machines)"; "Scaling PostgreSQL Queues to 100k Events Per Second" | reference titles only | p.532 |

## Failure modes and anti-patterns

| failure mode | cause | consequence | mitigation the book gives | page |
|---|---|---|---|---|
| Polling overhead grows as latency target shrinks | datastore not built for notification | wasted requests | push notifications via messaging | p.489 |
| Queue outgrows memory or disk | slow consumers with unbounded buffering | crash, degraded throughput, full disk | understand broker behavior; backpressure or dropping where acceptable | p.490, p.492 |
| Silently wrong metrics | dropped UDP messages (StatsD) | counters "at best approximate" and errors not apparent | reliable delivery when counting | p.490-491 |
| Lost messages while consumer offline; lost retry buffer on producer crash | direct messaging without broker | permanent gaps | use a broker | p.491 |
| Duplicate processing after lost acknowledgment | network loses the ack | message handled twice | atomic commit or idempotence | p.494 |
| Message reordering | load balancing plus redelivery | causal dependencies violated | separate queue per consumer; log-based ordering | p.494 |
| Poison message loop | malformed message crashes every consumer | stream blocked or resources wasted | dead letter queue with monitoring | p.495 |
| Cannot rerun or add historical consumers | destructive AMQP/JMS consumption | derived data cannot be rebuilt | log-based broker | p.495 |
| Reprocessing after consumer restart | offset recorded periodically, not per message | duplicates | idempotence or transactions | p.498 |
| Message loss for lagging consumer | offset points into deleted segment | that consumer misses data | lag monitoring and alerts; large disk buffer; tiered storage | p.498-499 |
| Head-of-line blocking | one slow message in a shard | later messages in that shard delayed | JMS/AMQP style when per-message parallelism matters | p.497 |
| Parallelism capped | consumers limited to shard count | cannot scale consumers beyond shards | add shards | p.497 |
| Abandoned queues consume memory | consumer shut down, queue kept | starves active consumers | delete unused queues | p.500 |
| Permanent inconsistency between DB and search index | concurrent dual writes interleave | one value silently overwrites another; no error raised | CDC with a single leader | p.502 |
| Half-applied dual write | one write fails, the other succeeds | systems diverge | CDC; atomic commit is expensive | p.502 |
| Stale derived systems | asynchronous CDC | replication lag symptoms | accept lag; read-your-writes techniques | p.504 |
| Incomplete rebuild of a derived view | applying only recent changes | items never updated are missing | consistent snapshot at known offset or log compaction | p.504-506 |
| Downstream outage after a schema change | CDC exposes internal schema | removing a column breaks consumers, possibly customer-facing | data contracts; outbox pattern | p.507 |
| Extra database write load | outbox table | performance problems | accept tradeoff knowingly | p.508 |
| Compacting an event-sourced log | later events do not override earlier ones | history needed for state is lost | keep full history; snapshots only for speed | p.508 |
| User does not see own write | asynchronous view updates in CQRS | confusing reads | read-your-writes approaches | p.511 |
| Unbounded history and fragmentation | high update/delete churn on small dataset | storage growth, GC pressure | tune compaction and garbage collection | p.512 |
| Data that must be deleted cannot be | immutable storage, copies, immutable backups | legal exposure | excision, crypto-shredding with careful key granularity | p.512-513 |
| Lost messages in actor-based processing | frameworks without delivery guarantees | non-fault-tolerant processing | add retry logic | p.518 |
| Phantom request spike | windowing by processing time while draining a backlog | wrong rate measurements | window by event time | p.519 |
| Stragglers after window closed | buffered or delayed events | incomplete counts | drop with metric or publish corrections | p.520 |
| Wrong event times | untrusted device clocks | misplaced events | three-timestamp offset correction | p.521 |
| State blow-up | large windows or high throughput buffering | out of memory or disk | capacity planning | p.522 |
| Join misses related events | click arrives before search or very late | wrong click-through rates | state indexed by session ID; explicit join window | p.523 |
| Overloaded database during enrichment | per-event remote lookups | slow processing, DB contention | local copy kept current via CDC | p.524 |
| Nondeterministic join output | undefined interleaving across streams | rerun gives different results | versioned identifiers or denormalized values | p.526 |
| Duplicated external side effects | restart after crash | double emails, double writes | internal atomic commit or idempotent writes | p.527-528 |
| Zombie node interference | node presumed dead keeps writing | corrupted idempotent state | fencing | p.528 |
| Lost operator state | crash without replicated state | wrong aggregates and joins | snapshots, changelog topics, redundant processing, rebuild from input | p.529 |

## Elicitation questions

- How quickly after something happens must it show up downstream: seconds, minutes, or is next day fine? (batch vs stream)
- If a few events are lost, what breaks? Are you counting money or events, or sampling readings that repeat anyway? (durability vs loss tolerance)
- When consumers cannot keep up, should we discard events, queue them, or slow the producers down? How long a backlog must we survive? (drop, buffer, backpressure; retention)
- Will you ever need to replay history, for example to fix a bug and recompute last week, or to build a brand-new search index from scratch? (log-based broker, retention, compaction)
- Which events must stay in order relative to each other, for example everything about one customer? (partition key, ordering guarantees)
- Are these heavy independent tasks handed out to workers, or a high volume of small ordered events? (AMQP/JMS vs log-based broker)
- Who else will consume this data: search, cache, analytics, other teams' services? (fan-out, CDC consumers)
- Today, how do the database, cache and search index stay in sync, and have they ever disagreed? (dual writes vs CDC)
- Are you willing to redesign the application around events, or must streaming bolt onto the existing database? (event sourcing vs CDC)
- Who owns the database schema, and who would break if a column were renamed or removed? (CDC schema contracts, outbox)
- Do you need an audit trail or history, such as items added and then removed from a cart? (immutable events)
- After a user saves something, must they see it immediately on the next screen? (asynchronous views, read-your-writes)
- Are there legal deletion or retention requirements such as GDPR erasure? (limits of immutability, crypto-shredding)
- Is the goal to detect patterns of events, compute statistics over time, or keep a view current? (CEP vs analytics vs materialized views)
- Is an approximate count acceptable for high-volume statistics? (probabilistic algorithms)
- Where do events originate, can they arrive late (offline mobile apps), and whose clock is the truth? (event time, stragglers, timestamps)
- When a late event arrives after a report is published, should the report be corrected or should the event be ignored? (straggler policy)
- What exactly is a "session" or a "period" in your business: fixed buckets, rolling averages, or inactivity gaps? (window types)
- How long can related events be apart and still count as related, for example a search and its click? (join window)
- When joining with reference data such as prices or tax rates, do you need the value at the time of the event or the current value? (time-dependent joins, slowly changing dimensions)
- Is it acceptable for an action to happen twice after a failure, such as a duplicate email or charge? (exactly-once, idempotence, transactions)
- How much downtime or recomputation is acceptable after a crash? (checkpointing, state rebuild)
- Who gets paged when consumers fall behind? (consumer lag monitoring)

## Verifiable properties

| property | how to test | page |
|---|---|---|
| Every event is immutable, self-contained and carries a timestamp | schema validation on produced events | p.488 |
| Events with the same key are consumed in production order | produce ordered sequence per key; assert consumer order | p.497-498 |
| Consumer is idempotent | deliver the same message twice; final state identical | p.528 |
| External writes record the triggering offset and skip already-applied updates | replay an earlier offset; assert no change | p.528 |
| Consumer lag is exported and an alert threshold is configured | stop a consumer; verify alert fires | p.499 |
| Retention exceeds the maximum tolerated consumer outage | compare retention setting with outage SLA | p.498-499 |
| Replaying a compacted topic from offset 0 reconstructs the full table | compare rebuilt view with database snapshot | p.505-506 |
| Compacted topic contains the latest value per key and tombstones remove deleted keys | write, overwrite, delete; inspect compacted contents | p.505-506 |
| Application writes only to the system of record; derived stores are written only by CDC consumers | code audit plus test that blocks direct writes | p.501-503 |
| Outbox row is written in the same transaction as the domain change | fail the transaction; assert no outbox row | p.508 |
| CDC schema changes pass compatibility checks before deployment | drop a column in a test; expect contract failure | p.507 |
| Poison message goes to the DLQ and the consumer continues | inject malformed message; assert progress and DLQ entry | p.495 |
| Windows are computed on event time; draining a backlog yields the same window counts as live processing | pause consumer, resume, compare counts | p.518-519 |
| Dropped straggler counter increments and alerts | inject late events | p.520 |
| Mobile events carry three timestamps | schema check | p.521 |
| Rerunning the job on the same input yields identical output (deterministic joins) | run twice, diff outputs | p.526 |
| After a crash, in-framework output equals the no-failure run (no loss, no duplicates) | kill operator mid-stream; compare outputs | p.527 |
| External side effects are not duplicated after restart | crash between write and offset commit; assert single effect | p.527-528 |
| A failed-over node cannot write after fencing | resume old node; assert writes rejected | p.528 |
| Operator state is restored from snapshot or changelog topic | kill and restart; assert aggregates continue correctly | p.529 |
| Window state stays within provisioned capacity at peak throughput | load test with maximum window and rate | p.522 |
| An experimental consumer does not affect production consumers | add lagging consumer; measure production latency | p.499 |
| Crypto-shredded data is unreadable after key deletion | delete key; attempt decryption | p.512 |

## Terms

- stream: data incrementally made available over time (p.488)
- event: small, self-contained, immutable record of something that happened, with a timestamp (p.488)
- producer / consumer: publisher or sender / subscriber or recipient (p.488-489)
- topic: grouping of related events, like a filename (p.489)
- messaging system / publish-subscribe: producers push messages to consumers through a shared topic (p.489)
- backpressure (flow control): blocking the producer when buffers fill (p.489)
- message broker (message queue): a server optimized for message streams (p.491)
- load balancing vs fan-out: each message to one consumer vs every message to all consumers (p.492-493)
- consumer group: Kafka feature combining load balancing within a group and fan-out across groups (p.493)
- acknowledgment / redelivery: consumer confirms processing; broker resends if not confirmed (p.493-494)
- dead letter queue (DLQ): queue for messages that cannot be processed (p.495)
- log-based message broker: append-only sharded log with offsets (Kafka, Kinesis) (p.496)
- partition (shard) / offset: independent log within a topic / monotonically increasing sequence number (p.496)
- partition key: field that selects the shard, giving per-key ordering (p.498)
- consumer offset: position marking which messages have been processed (p.498)
- head-of-line blocking: one slow message delays the rest of its shard (p.497)
- segments / retention: log pieces deleted or archived to reclaim disk (p.498)
- tiered storage: older messages served from object storage (p.499)
- replay: consuming from an earlier offset to reprocess (p.500)
- event sourcing: storing application state changes as immutable application-level events (p.500, p.507)
- state machine replication: same events in same order give same state (p.501)
- dual writes: application writes to each system separately (p.501)
- change data capture (CDC): observing and extracting all database changes as a stream (p.503)
- initial snapshot: consistent copy tied to a log offset for bootstrapping (p.504-505)
- log compaction / tombstone: keep only the latest value per key / null marker for deletion (p.505)
- outbox pattern: separate table exposed to CDC instead of internal schema (p.507-508)
- data contract: agreement governing exposed schemas (p.507)
- changelog: the log of all changes, state's evolution over time (p.509)
- compensating transaction: a new entry that corrects an earlier one (p.510)
- CQRS: separating write-optimized log from read-optimized views (p.510-511)
- excision / shunning / crypto-shredding: ways to truly delete immutable data (p.512)
- puncturable encryption: selectively revoking a key's decryption ability (p.513)
- operator / job: code that processes streams into other streams (p.513)
- complex event processing (CEP): pattern matching over event streams with standing queries (p.514)
- stream analytics: aggregations and statistics over windows (p.515)
- window: time interval over which events are aggregated (p.515)
- Bloom filter / HyperLogLog: probabilistic set membership / cardinality estimation (p.515)
- materialized view maintenance: keeping derived views current as source data changes (p.516)
- incremental view maintenance (IVM): recomputing only changed data in a view (p.517)
- percolator / search on streams: matching stored queries against incoming documents (p.517)
- actor model / distributed RPC: message-passing concurrency vs stream processing (p.518)
- event time vs processing time: when the event happened vs when it is processed (p.519)
- straggler: event arriving after its window was declared complete (p.520)
- tumbling, hopping, sliding, session windows: window types (p.522)
- stream-stream join (window join): matching related events within a time window (p.523)
- stream-table join (enrichment): adding table data to events via a local CDC-maintained copy (p.524)
- hash join: join against a local in-memory or on-disk copy (p.524)
- table-table join: maintaining a materialized view of a join between two changelogs (p.525)
- slowly changing dimension (SCD): versioned reference data for deterministic joins (p.526)
- exactly-once (effectively-once) semantics: output as if each record were processed once (p.527)
- microbatching: treating one-second blocks as mini batch jobs (p.527)
- checkpoint / barrier: periodic state snapshot triggered by markers in the stream (p.527)
- atomic commit: all outputs and side effects persist together or not at all (p.527-528)
- idempotence: repeated execution has the same effect as one execution (p.528)
- fencing: preventing a presumed-dead node from interfering (p.528)
- changelog topic: Kafka Streams state replication via a compacted topic (p.529)

## Chapter summary (condensed)

Stream processing is "very much like" batch processing but runs continuously on unbounded input; message brokers and event logs are the streaming equivalent of a filesystem (p.529). AMQP/JMS-style brokers assign individual messages, consumers acknowledge them, and acknowledged messages are deleted; this suits an asynchronous form of RPC such as a task queue where order does not matter and nothing needs rereading (p.529-530). Log-based brokers assign all messages in a shard to one consumer, always in the same order, achieve parallelism through sharding, track progress by checkpointing offsets, and retain messages on disk so consumers "can jump back and reread old messages" (p.530). This approach resembles database replication logs, log-structured storage and consensus, and suits systems that consume streams and generate derived state or streams (p.530). Streams come from user activity, sensors and data feeds, and from database writes: the changelog can be captured implicitly through CDC or explicitly through event sourcing, and log compaction lets the stream hold a full copy of the database (p.530). Representing databases as streams lets search indexes, caches and analytical systems be kept continually up to date, and fresh views can be built "from the beginning all the way to the present" (p.530). State as streams and message replay underlie stream joins and fault tolerance (p.530). Purposes include complex event processing, windowed stream analytics and materialized view maintenance (p.530). Reasoning about time means separating processing time from event timestamps and handling stragglers (p.530). Three join types: stream-stream within a time window (possibly a self join), stream-table where a changelog keeps a local database copy for enrichment, and table-table where every change on one side joins the latest state of the other (p.531). Fault tolerance discards partial output of failed tasks, but since a stream job runs forever a finer-grained mechanism is needed: microbatching, checkpointing, transactions or idempotent writes (p.531).

## Second-edition-specific

Judgment calls about what appears new relative to the first edition; the book does not label material as new.

- Dead letter queues as a first-class topic, including support in Apache Pulsar and Kafka Streams (KIP-1034) (p.495).
- Kafka adding JMS/AMQP-style queues and consumer groups on partitions (KIP-932), blurring the log vs queue distinction (p.497-498).
- Tiered storage and object-store-native brokers (Redpanda, WarpStream, Confluent Freight, Bufstream) with messages stored as Iceberg tables for batch and warehouse access (p.499).
- Updated hardware figures: 20 TB drives at 250 MB/s giving a 22-hour minimum buffer (p.499).
- Named CDC tooling: Debezium connectors, Kafka Connect, Maxwell, GoldenGate, pgcapture, Netflix DBLog watermark-based incremental snapshots (p.504-505).
- "API support for change streams": first-class change streams in MySQL and PostgreSQL, cloud offerings such as Datastream, and CDC for quorum databases via Cassandra's per-node log segments (p.506).
- Sidebar "Change Data Capture and Database Schemas": CDC turning internal schemas into public APIs, data contracts, and the outbox pattern with its tradeoffs (p.507-508).
- Explicit comparison of log compaction under CDC versus event sourcing, with snapshots as a performance optimization (p.508).
- Deletion of immutable data: Datomic excision, Fossil shunning, crypto-shredding and puncturable encryption; link to a later legislation section (p.512-513).
- Sidebar "Incremental View Maintenance": limitations of REFRESH MATERIALIZED VIEW, IVM via DBSP and differential dataflow, and systems Materialize, RisingWave, ClickHouse, Feldera (p.516-517).
- Kafka Streams and ksqlDB for unbounded-window materialized views (p.516).
- Hosted cloud services named: Google Cloud Pub/Sub (JMS-style API), Azure Service Bus, Google Cloud Dataflow, Azure Stream Analytics; Postgres-as-queue experience report (p.492, p.516, p.532).
- Webhooks as a direct-messaging pattern (p.491).
- The product-rule view of joins over changelogs and the social-network timeline case study as a table-table join (p.525).
- The term "effectively-once" for at-least-once plus idempotence (p.527).
- References updated through 2025 (Redpanda, Decodable, Materialize, Confluent and Apache KIP sources) (p.531-537).
