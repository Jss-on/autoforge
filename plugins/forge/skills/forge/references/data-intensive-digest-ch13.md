<!-- forge reference: a page-cited digest of Designing Data-Intensive Applications, 2nd ed. (Kleppmann & Riccomini, O'Reilly 2026), chapter 13. Written while reading the chapter; every rule, number, failure mode, question and property carries its page. The condensed layer is references/data-intensive-protocol.md (§0-§8); the row-level map is references/data-intensive-book-map.md; this file is the full layer the requirements data round and the build Phase 4 review consult for the chapters a DATA.md group cites. -->

# Digest: Chapter 13 - A Philosophy of Streaming Systems

Source: Kleppmann and Riccomini, Designing Data-Intensive Applications, 2nd edition (O'Reilly 2026), pp. 539-584. Page refs are the printed page numbers from the running footers of the pdftotext extraction.

## Thesis

No single tool fits every access pattern, so real applications compose several specialized systems; the chapter's answer to the resulting data integration problem is to designate systems of record and derive everything else (indexes, caches, materialized views, ML models, notifications) through deterministic, idempotent transformations over an ordered, immutable event log (p.540-541, p.579).
This is "unbundling" the database: CDC, event logs and stream processors reimplement index maintenance, triggers and view maintenance as loosely coupled components owned by different teams; asynchrony contains faults locally and reprocessing makes evolution gradual and reversible (p.544-550).
The dataflow can be extended to end-user devices (write path pushed to clients, reads modeled as events), turning the whole organization into a spreadsheet-like derivation graph (p.551-560).
Correctness does not need distributed transactions: end-to-end request IDs make operations idempotent, sharded logs enforce constraints without cross-shard atomic commit, timeliness is separated from integrity (only the latter is non-negotiable), coordination is avoided wherever the business can apologize, and integrity is continuously audited ("trust, but verify") (p.561-578).
The authors flag that this chapter is "more opinionated than previous chapters", a deep dive into one philosophy rather than a comparison (p.539).

## Decision rules

| rule | when it applies | why (mechanism) | page |
|---|---|---|---|
| Pick a specialized tool per usage pattern rather than one tool with many features | choosing storage or processing software | "trying to satisfy too many use cases with many features is likely to lead to poor implementations"; every tool, even a "general-purpose" database, "is designed for a particular usage pattern" | p.540 |
| Expect to combine several systems (OLTP database plus search index plus warehouse, caches, ML, notifications) | complex applications with several access patterns | one piece of software "is unlikely to be suitable for all of them"; search indexes "are generally not very suitable as a durable system of record"; built-in Postgres full-text search "can be sufficient for simple applications" | p.540 |
| Be explicit about where data is written first and which representations are derived from which sources | whenever copies of the same data live in several systems | you must know "the inputs and outputs" to get data "into all the right places, in the right formats" | p.541 |
| Make the system of record the only input and update derived stores only via CDC applied in the same order | database plus search index, or any derived store | if CDC "is the only way of updating the index", the index is "entirely derived from the system of record and therefore consistent with it (barring bugs in the software)" | p.541 |
| Never let the application write directly to both the database and the derived store | multi-writer integrations | two clients' conflicting writes can be processed in different orders by the two stores; neither is "in charge", so they "become permanently inconsistent with each other" (Figure 12-4) | p.541 |
| Funnel all user input through one system that decides a total order of writes; CDC versus event sourcing matters less than "the principle of deciding on a total order" | designing the write path | state machine replication: every derived representation applies the same writes in the same order | p.541 |
| Make derived-data updates deterministic and idempotent | building any consumer of an event log | makes it "quite easy to recover from faults" by reprocessing | p.541 |
| Prefer log-based derived data over distributed transactions (XA) for integrating different systems | cross-system consistency | XA "has poor fault tolerance and performance characteristics"; a better widely adopted protocol is "unlikely to happen soon"; logs reach correctness "through deterministic retry and idempotence" | p.541-542 |
| Do not dismiss read-your-writes; aim for a middle ground between distributed transactions and asynchronous logs | derived systems that are updated asynchronously | derived systems "do not by default guarantee that reads are up-to-date"; telling everyone "suck it up" is "not productive" without guidance | p.542 |
| Do not assume a total order of events exists at scale; route all updates for one object ID to the same log shard when per-object order suffices | throughput beyond one leader, multiple regions, microservices with their own durable state, offline-capable clients | total order broadcast is equivalent to consensus, and consensus algorithms assume one node can process the whole stream; per-object sharding gives order without global coordination | p.542-543 |
| Capture causal dependencies explicitly when related events live in different systems | joins across streams (unfriend event then message-send event) | otherwise a notification service may process events out of causal order; starting points: logical timestamps, logging the state the user saw with a unique event ID that later events reference, conflict resolution (works for state, "not if actions have external side effects") | p.543-544 |
| Write derivations as deterministic, pure functions with immutable inputs and append-only outputs | batch and stream jobs | good for fault tolerance and "simplifies reasoning about the dataflows in an organization" | p.544 |
| Maintain derived systems asynchronously, not inside the writing transaction | derived indexes, caches, cross-shard secondary indexes | asynchrony "allows a fault in one part of the system to be contained locally"; distributed transactions "abort if any one participant fails" and "amplify failures"; cross-shard index maintenance is "most reliable and scalable if the index is maintained asynchronously" | p.544-545 |
| Use stream processing for low-delay views and batch reprocessing to derive new views from history | maintaining derived data | streams reflect input changes "with low delay"; batch "allows large amounts of accumulated historical data to be reprocessed" | p.545 |
| Use reprocessing rather than in-place migration for schema changes beyond additive ones | restructuring a dataset into a different model | without reprocessing, evolution "is limited to simple changes like adding a new optional field" | p.545 |
| Migrate gradually: keep old and new schema as two derived views side by side, shift a small share of users, grow it, then drop the old view | any risky restructuring | "every stage of the process is easily reversible"; reducing irreversible damage lets you "move faster" (railway dual-gauge analogy) | p.545-546 |
| Avoid the lambda architecture; unify batch and stream in one engine (kappa) that can replay history, give exactly-once semantics and window by event time | choosing a processing architecture | lambda "had a number of problems" and "has fallen out of use"; processing time "is meaningless when reprocessing historical events" | p.546 |
| Treat CREATE INDEX, follower setup and CDC bootstrap as the same operation: consistent snapshot, backlog, then continuous updates | bootstrapping any derived view | the database "reprocesses the existing dataset and derives the index as a new view onto the existing data" | p.548 |
| Use federation (polystore, foreign data wrappers, Trino) to unify reads; use unbundling (CDC, event logs) to unify writes | composing heterogeneous stores | federation "does not have a good answer to synchronizing writes"; unbundling is "unbundling a database's index maintenance features" across technologies | p.548-549 |
| When data crosses a technology boundary use an ordered event log with idempotent consumers, not a distributed transaction; transactions inside one system are fine | writes from a stream processor to a key-value store or search index | no standardized transaction protocol across groups; a log with idempotent consumers is "a much simpler abstraction and thus is much more feasible to implement across heterogeneous systems" | p.549 |
| Rely on the log as a buffer so a slow or failed consumer does not affect the rest | operating log-based integration | "the producer and any other consumers ... continue running unaffected"; the faulty consumer "can catch up when it is fixed"; synchronous transactions "escalate local faults into large-scale failures" | p.550 |
| Let different teams own different derived systems with the event log as the interface | organizational design | logs are "powerful enough to capture fairly strong consistency properties (because of durability and ordering)" yet "general enough to be applicable to almost any kind of data" | p.550 |
| Deploy as few moving parts as possible; if one product does everything you need, use it, and keep databases for processor state and serving | deciding whether to unbundle | each piece has "a learning curve and its own configuration issues and operational quirks"; integrated products can give "better and more predictable performance"; unbundling is "about breadth, not depth" and helps "only when no single piece of software satisfies all your requirements"; unbundling "will not replace databases" | p.550-551 |
| Do not build for scale you do not need | sizing the architecture | "wasted effort and may lock you into an inflexible design ... a form of premature optimization" | p.550 |
| Think of the organization's dataflow as a spreadsheet: when a record changes, every dependent index, cache and aggregation should refresh automatically | designing derived data | "most data systems still have something to learn from the features that VisiCalc already had in 1979" | p.551 |
| Put custom derivation logic in application code on deployment platforms (Kubernetes etc.), not in database triggers or stored procedures | derivations that are not cookie-cutter (full-text tuning, ML features, UI caches) | in-database code "has been somewhat of an afterthought"; databases lack "dependency and package management, version control, rolling upgrades ... monitoring" | p.552 |
| Separate stateless application logic from state management ("separation of Church and state") | application architecture | "not putting application logic in the database and not putting persistent state in the application" | p.552-553 |
| Prefer subscribing to changes over polling | detecting state changes | databases "inherited this passive approach to mutable data"; often "your only option is to poll" | p.553 |
| Require stable ordering and fault-tolerant delivery from the message broker | maintaining derived data | several views "need to process the events in the same order"; "losing just a single message causes the derived dataset to go permanently out of sync" | p.554 |
| Replace synchronous RPC lookups with a subscribed local copy of the other service's data, and handle the time dependence when reprocessing | currency conversion needing exchange rates, any join with reference data | "The fastest and most reliable network request is no network request at all!"; faster and "more robust to the failure of another service"; reprocessing needs the historical rate at the original time | p.554-555 |
| Choose where to draw the write-path/read-path boundary (index, cache, materialized view) by trading write-time work against read-time work | designing serving layers | indexes, caches and views "shift the boundary between the read path and the write path"; no index means grep-like scans; precomputing all queries is impossible | p.556-557 |
| Cache only a fixed set of the most common queries and serve the rest from the index | search-like workloads | the cache is a materialized view that "would need to be updated when new documents appear" | p.557 |
| Treat on-device state as a replica of server state and design for offline work | mobile apps and single-page web apps | "The pixels on the screen are a materialized view of model objects"; model objects are "a local replica of state in a remote datacenter" | p.557-558 |
| Push state changes to clients (server-sent events, WebSockets) and reuse consumer-offset recovery for offline devices | reducing client staleness | extends the write path "all the way to the end user"; initial state via read path, then a stream; each device is "a small subscriber to a small stream of events" | p.558-559 |
| Expose stream-processor state to queries, or route read requests as events, when you need provenance or multishard joins | advanced serving and causal tracking | reads through the processor are a stream-table join; a log of reads lets you "reconstruct what the user saw before they made a particular decision" | p.559-560 |
| Do not route single-shard queries through streams; use a database with multishard joins if one exists | simple queries, multishard joins | streaming reads are "perhaps overkill" for single-shard queries; a database with the feature is "probably simpler" | p.560-561 |
| Do not assume an isolation level or replication config is safe for your application | configuring databases | "very difficult to determine"; Jepsen shows "stark discrepancies" between claimed and actual guarantees under faults | p.561 |
| Prefer immutable, append-only data | guarding against application bugs | serializable transactions do not stop buggy code from writing wrong data or deleting; immutability removes "the ability of faulty code to destroy good data" | p.562 |
| Make retried operations idempotent; track operation IDs and use fencing for operations that are not naturally idempotent | retries after faults | processing twice "is a form of data corruption" (double charge, double count) | p.562-563 |
| Pass a client-generated request ID (UUID in a hidden form field, or a hash of the form fields) end to end and enforce it with a database uniqueness constraint | any retried request (form POST, money transfer) | TCP dedup stops at the connection; 2PC does not stop a user resubmitting; Example 13-2 aborts duplicates at INSERT | p.563-564 |
| Use a database uniqueness constraint rather than application check-then-insert | enforcing uniqueness | databases "maintain a uniqueness constraint correctly, even at weak isolation levels", while check-then-insert "may fail under nonserializable isolation" | p.564 |
| Let the requests table double as an event log and derive balance updates downstream | event sourcing / CDC designs | the updates "are redundant and could be derived from the request event" as long as it is "processed exactly once", enforced by request ID | p.565 |
| Apply the end-to-end argument: duplicate suppression, integrity checksums and encryption must be implemented at the application endpoints | whenever relying on TCP, database transactions, stream exactly-once, Ethernet/TLS checksums, WiFi encryption | low-level features are useful as "a performance enhancement" but "cannot entirely rule out" duplicates, endpoint software corruption or server compromise | p.565-566 |
| Enforce strict uniqueness with consensus: a single leader or sharding by the unique value; never with asynchronous multi-leader replication | usernames, seats, file names, non-negative balances, stock | conflicting writes need one decider; "If you want to be able to immediately reject any writes that would violate the constraint, synchronous coordination is unavoidable" | p.567 |
| Enforce constraints in a log: hash-shard requests by the constrained value, let a single-threaded stream processor decide first-wins, let clients watch the output stream | scalable uniqueness without a central database | "any writes that may conflict are routed to the same shard and processed sequentially"; scales "by increasing the number of shards" | p.567-568 |
| Implement multishard operations as stages over differently sharded logs carrying the request ID, instead of cross-shard atomic commit; prefer exactly-once semantics where available | payments touching payer, payee and fees accounts | atomic commit "forces it into a total order" and hurts throughput; atomicity comes from "writing the initial request event to the source account log"; needs strict log order, at-least-once delivery and deterministic processors; exactly-once keeps local state "consistent with the set of messages it has processed" | p.568-570 |
| Separate timeliness from integrity and prioritize integrity | defining consistency requirements | "violations of timeliness are allowed under eventual consistency, whereas violations of integrity result in perpetual inconsistency"; integrity violations "can be catastrophic" | p.571-572 |
| Build integrity from one atomically written message, deterministic derivations, an end-to-end request ID, and immutable reprocessable messages | dataflow correctness | this combination preserves integrity "without requiring distributed transactions and an atomic commit protocol" | p.572-573 |
| Loosen constraints where the business already has an apology/compensation workflow: write optimistically, check afterwards, validate synchronously only before irrecoverable actions | overselling stock, overbooking, overdrafts, inter-bank settlement | the "apology workflow already needs to be part of your business processes anyway" (forklift example); compensating transactions; "Whether the cost of the apology is acceptable is a business decision" | p.573-574 |
| Avoid coordination by default; add synchronous coordination only where strictly needed; run serializable transactions at small scope | multi-region, high-availability systems | coordination-avoiding systems get "better performance and fault tolerance"; can run multi-leader across datacenters with strong integrity and weak timeliness; "no need for everything to pay the cost of coordination" | p.574-575 |
| Balance apologies for inconsistencies against apologies for outages | choosing a consistency level | coordination reduces the first and increases the second; "You cannot reduce the number of apologies to zero" | p.575 |
| Treat the system model as probabilistic; at scale, assume rare corruption happens | large deployments | data corrupts in memory, on disk and on the network; "even very unlikely things do happen" | p.575 |
| Assume bugs in databases and far more in application code; actually use foreign-key and uniqueness constraints | correctness planning | MySQL unique-index bug, PostgreSQL serializable write skew; "Many applications don't even correctly use the features that databases offer for preserving integrity" | p.576 |
| Audit: continuously read data back and compare; test backup restores | operating storage | HDFS and S3 "do not fully trust disks"; "If you want to be sure that your data is still there, you have to read it and check"; "Don't just blindly trust that it is all working" | p.576-577 |
| Design for auditability with event sourcing and deterministic derivations; hash the log; rerun or run redundant derivations | provenance and integrity checking | the same log through the same code "will result in the same state updates"; enables "time-travel debugging" | p.577 |
| Check integrity end to end and continuously | derived data pipelines | more systems in one check means "fewer opportunities ... for corruption to go unnoticed"; confidence "allows you to move faster", like automated testing | p.577-578 |
| Use lightweight cryptographic tools (Merkle trees, certificate-transparency-style logs) rather than blockchains | tamper-evident audit logs | blockchains have "too high an overhead"; certificate transparency "avoids needing a consensus protocol by having a single leader per log" | p.578 |

## Metrics and numbers

| metric or quantity | definition / how measured | values or thresholds the book gives | caveats | page |
|---|---|---|---|---|
| Single-leader ordering ceiling | event throughput one leader node can totally order | shard the log once throughput "is greater than a single machine can handle"; then "the order of events in two shards is ... ambiguous" | consensus algorithms "do not provide a mechanism for multiple nodes to share the work of ordering" | p.542 |
| Small-item count a filesystem vs a database copes with | number of items in one directory or table | "10 million small files" is a problem for many filesystems; "10 million small records is completely normal" for a database | illustrates philosophy difference, not a hard limit | p.546-547 |
| End-to-end state-change latency to the UI | time from an interaction on one device to the UI update on another | "fairly low delay--say, under one second end to end" | aspirational; needs a move from request/response to publish/subscribe | p.559 |
| Loss from a retried non-idempotent transfer | money moved when Example 13-1 is retried | "$22 could be transferred instead of the desired $11" | happens when the client times out after COMMIT and retries | p.563 |
| Acceptable statement lag (timeliness) | delay before a transaction appears on a credit card statement | a transaction made "within the last 24 hours" not yet appearing is "not surprising" | integrity must still hold: balance equals previous balance plus sum of transactions | p.572 |
| Space of possible search queries | number of distinct queries one could precompute | "infinite (or at least exponential in the number of terms in the corpus)" | why precomputing all results is impossible; cache only common queries | p.557 |
| Shards touched by one transfer | distinct shards in Example 13-2 | "potentially three shards" (request ID, payee, payer) | they "could just as well be in the same shard--it doesn't matter" | p.568, p.570 |
| Age of ACID as the correctness tool | years transactions have been "the tools of choice" | "approximately four decades" | "those foundations are weaker than they seem" | p.561 |
| Overdraft exposure bound | how a bank bounds risk when allowing overdrawn withdrawals | "limiting the total withdrawals per day" | principle only, no amount given | p.573 |
| Cost of an apology | cost of compensating after a constraint violation | double charge: "processing fees and perhaps a customer complaint"; ATM payout cannot be directly recovered | "a business decision" | p.574 |
| Exactly-once semantics | output identical "as if no faults had occurred, even if faults did in fact occur" | requires "discarding the partial outputs of any failed tasks" | about integrity, not timeliness | p.546 |
| Migration rollout share | fraction of users routed to the new derived view | start with "a small number of users", "gradually ... increase the proportion", then drop the old view | no percentages given | p.546 |
| Historical anchors | dates used as reference points | standard railway gauge 1846; Unix and relational model early 1970s; VisiCalc 1979; end-to-end argument 1984; lambda architecture book 2015 | context, not engineering thresholds | p.545-547, p.551, p.565 |

## Failure modes and anti-patterns

| failure mode | cause | consequence | mitigation the book gives | page |
|---|---|---|---|---|
| Dual writes to database and search index | application writes directly to both stores | concurrent conflicting writes processed in different orders; stores "become permanently inconsistent" | single system of record decides order; derive the index via CDC in that order | p.541 |
| Heterogeneous distributed transactions (XA) | using atomic commit across different technologies | "poor fault tolerance and performance"; any participant failure aborts; faults "amplify" across the system | log-based derived data with idempotent consumers | p.542, p.544, p.549-550 |
| Lost causal dependency | friendship and messages stored in different systems with no total order | ex-partner receives a notification for a message sent after being unfriended | logical timestamps; record the state the user saw with an event ID; conflict resolution for state (not for side effects) | p.543-544 |
| Lost message in derivation pipeline | unreliable delivery or derived-state update | derived dataset "permanently out of sync with its data source" | log-based brokers with stable ordering and fault-tolerant processing | p.554 |
| Lambda architecture | maintaining separate batch and stream code paths | "a number of problems"; "has fallen out of use" | unified engine with replay, exactly-once, event-time windows | p.546 |
| Windowing by processing time | using wall clock when reprocessing history | results meaningless on replay | window by event time (e.g., Beam on Flink or Dataflow) | p.546 |
| Application code inside the database | triggers, stored procedures, UDFs as deployment vehicle | no package management, version control, rolling upgrades, monitoring, external calls | run code on deployment platforms; keep state in databases | p.552 |
| Polling for changes | databases treat data as a passive mutable variable | stale readers, wasted queries | subscribe to change streams | p.553 |
| Synchronous RPC for reference data | querying an exchange-rate service during purchase processing | slower; fails when the other service fails | subscribe to the rate stream and keep a local copy; stream join | p.554-555 |
| Ignoring time dependence of the join | reprocessing purchases with current rates | cannot reconstruct original output | obtain the historical rate at the original time | p.555 |
| Stale client state | browser reads once, never subscribes (RSS is "a basic form of polling") | user does not see server changes until reload | push via server-sent events or WebSockets; extend write path to the client | p.558 |
| Request/response baked into the stack | databases, libraries, frameworks assume stateless clients | hard to subscribe to changes; UIs less responsive, poor offline support | rethink toward publish/subscribe dataflow | p.559 |
| Streaming single-shard reads | sending trivial queries through a stream processor | "overkill" | only for multishard or provenance needs | p.560 |
| Hand-built multishard join on a stream processor | reimplementing warehouse-style query execution | unnecessary complexity | "probably simpler to use a database that provides this feature" | p.560-561 |
| Too many moving parts | unbundling when one product would do | learning curves, config issues, operational quirks, less predictable performance | "deploying as few moving parts as possible"; use the single product | p.550 |
| Building for unneeded scale | speculative architecture | "wasted effort", lock-in, "premature optimization" | size to actual requirements | p.550 |
| Trusting weak isolation or quorum configs | hard-to-understand settings | subtle bugs appear "in more demanding circumstances" (Jepsen findings) | assume configs are unsafe until verified | p.561 |
| Buggy application corrupts or deletes data despite serializable transactions | application bug | serializability "aren't going to save you" | immutable, append-only data | p.562 |
| Processing a message twice | retry after unconfirmed success | double charge, overstated counter | idempotent operations; operation IDs; fencing on failover | p.562-563 |
| Non-idempotent transaction retried after COMMIT timeout (Example 13-1) | client reconnects and reruns | "$22 could be transferred instead of the desired $11"; "real banks do not work like this" | request ID with uniqueness constraint (Example 13-2) | p.563-564 |
| 2PC assumed to give exactly-once | coordinator dedup only covers DB client to server | user resubmits form after POST timeout ("Are you sure you want to submit this form again?"); Post/Redirect/Get does not help | end-to-end request ID from client to database | p.563-564 |
| Application-level check-then-insert | enforcing uniqueness in app code | fails under nonserializable isolation (write skew, phantoms) | database UNIQUE constraint | p.564 |
| Relying on low-level checksums only | Ethernet/TCP/TLS checksums | miss software bugs at endpoints and disk corruption | end-to-end checksums | p.565 |
| Reimplementing fault tolerance in application code | refusing distributed transactions without an alternative abstraction | "most application-level mechanisms do not work correctly"; "lost or corrupted data" | explore fault-tolerance abstractions with end-to-end properties | p.566 |
| Asynchronous multi-leader replication for unique values | leaders accept conflicting writes concurrently | "values are no longer unique" | single leader or shard by the unique value | p.567 |
| Cross-shard atomic commit for every transfer | traditional transaction over three shards | forces total order; "throughput is likely to suffer" | staged processing over sharded logs with request ID | p.568 |
| Stream processor crash mid-request | at-least-once replay | duplicate output events | deterministic processing; downstream dedup by request ID | p.570 |
| User reads account before processor runs | asynchronous consumers | does not see the payment just requested (timeliness violation) | subscribe to the output stream and wait for the outgoing or declined event | p.570, p.572 |
| Hard constraints where the business does not need them | validating every constraint before writing | unnecessary restriction and coordination | optimistic write, check afterwards, compensate (apologize) | p.573-574 |
| Over-coordination | enforcing strict constraints everywhere | lower performance and availability; more "apologies ... for outages" | find the sweet spot between inconsistencies and outages | p.575 |
| Binary system model | assuming some faults never happen | at scale "even very unlikely things do happen" (memory, disk, network corruption) | probabilistic view; auditing | p.575 |
| Database bugs | mature software still fails (MySQL uniqueness, PostgreSQL SSI write skew) | corrupted data during the bug window | do not assume absolute guarantees; audit | p.576 |
| Not using database integrity features | apps skip FK and uniqueness constraints | integrity cannot be guaranteed | use the constraints; audit | p.576 |
| Blind trust in disks and backups | no read-back, never restoring | discover corruption or broken backups "when it is too late" | background scrubbing (HDFS, S3); periodic restore tests | p.576-577 |
| Opaque mutations | transaction logs show inserts and deletes but not why | poor auditability; reasons "cannot be reproduced" | event sourcing with deterministic derivation; time-travel debugging | p.577 |
| Not checking integrity | assuming components are fault-free | corruption found only after downstream damage, "much harder and more expensive to track down" | continuous end-to-end integrity checks | p.577-578 |
| Separate audit table | application-level audit logging | integrity of audit log versus database state still hard; HSM signing "does not guarantee that the right transactions went into the log" | event-sourced provenance; cryptographic logs | p.578 |
| Blockchain for ordinary applications | adopting distributed ledgers | "too high an overhead to be useful" | Merkle trees, certificate-transparency-style logs | p.578 |

## Elicitation questions

1. Which system is the official source of truth for each kind of data, and which copies (search, reports, caches, recommendations) are allowed to lag behind it? [system of record vs derived data, p.541]
2. Are there places today where your app or your staff enter the same information into two systems separately? [dual writes / single ordered input, p.541]
3. After you save something, how quickly must you or your customers see it in search, dashboards, or the mobile app: instantly, within seconds, or by the next day? [timeliness, read-your-writes, p.542, p.571]
4. Which actions must never be lost or applied twice even if a server or network fails halfway (payments, bookings, stock movements)? [integrity, exactly-once, p.562]
5. When a customer clicks submit twice or retries after a timeout, what must happen to the second attempt? [end-to-end request ID, idempotency, p.563-564]
6. Which values must be strictly unique (usernames, seat numbers, invoice numbers), and must a duplicate be refused instantly or can it be sorted out afterwards? [uniqueness requires consensus vs loose constraints, p.567, p.573]
7. For stock, seats, rooms or balances: is overselling tolerable if you can apologize or compensate, and what does one apology cost you? [compensating transactions, p.573-574]
8. Which actions are impossible to undo (paying out money, shipping goods, sending emails) and therefore must be checked before they happen? [validate before irrecoverable actions, p.574]
9. Do you need to keep operating from several regions or when a whole datacenter is down? [coordination avoidance, multi-leader, p.574-575]
10. Do you expect to change how data is structured, indexed or displayed later, and could old and new versions run side by side during a switch? [reprocessing, gradual migration, p.545-546]
11. How far back must we keep the raw history of changes so we can rebuild or re-check derived data? [immutable log, reprocessing, auditing, p.572-573, p.577]
12. Do users need to work offline or on poor connections, and should changes made by others appear live without refreshing? [offline-capable clients, push to clients, p.557-559]
13. Do you need to know exactly what a user saw (price, delivery date, stock) at the moment they made a decision? [reads as events, provenance, p.560]
14. Which business rules depend on the order of two events that happen in different parts of the system (for example unfriend then post)? [causality capture, p.543]
15. Which outgoing side effects (emails, notifications, payouts) must never be sent twice or in the wrong order? [side effects and idempotence, p.544, p.562]
16. Which teams will own which parts of the system, and must each be able to deploy on its own schedule? [unbundling, loose coupling, p.550]
17. Is there one product that already covers everything you need, or do you truly have several different kinds of access to the same data? [do not unbundle unless necessary, p.550-551]
18. What volume and growth do you realistically expect over the next few years? [avoid building for scale you do not need, p.550]
19. How would you find out today if data had silently gone wrong, and who reconciles figures with banks or partners? [auditing, trust but verify, p.576-578]
20. How often do you actually restore from a backup to prove it works? [backup restore testing, p.577]
21. Do regulators or auditors need to see why a change was made, not only what changed? [auditability, event sourcing, p.577]
22. Do you need records that can be proven not to have been tampered with? [Merkle trees, certificate transparency, p.578]
23. Does any decision depend on a value looked up from another service at that moment (exchange rate, price list, risk score), and must a later re-run use the value from that time? [stream join, time dependence, p.554-555]
24. Which queries need to combine data about many customers or regions at once (fraud scoring, audience reach)? [multishard processing, p.560-561]
25. Which is worse for your business: showing slightly stale information or being briefly unavailable? [apologies trade-off, p.575]

## Verifiable properties

| property | how to test | page |
|---|---|---|
| Derived store matches system of record | periodically rederive the view from the system of record (or replay the log through the derivation code) and diff against the live derived store; zero differences | p.541, p.577 |
| Redundant derivation agrees | run two independent instances of the derivation in parallel and compare outputs | p.577 |
| Event log is uncorrupted | store hashes of events (or a hash chain) and verify them on a schedule | p.577 |
| Only the CDC consumer can write to derived stores | permissions test: an application-level write to the index or cache is rejected; code scan finds no direct writes | p.541 |
| Derivation is deterministic | replay the same log segment twice through the same code version; derived state identical byte for byte | p.570, p.577 |
| Consumers are idempotent | rewind the consumer offset and redeliver events; derived state unchanged | p.541, p.549 |
| End-to-end duplicate suppression | submit the same request_id N times over new connections; exactly one row in requests, balances change once, duplicates fail on the UNIQUE constraint | p.564 |
| Request ID propagates through every stage | trace a request; every emitted downstream event carries the originating request_id | p.569-570 |
| Crash-retry safety | kill the stream processor mid-request and restart; net effect per request_id is exactly once on payer, payee and fees accounts | p.570 |
| Conservation invariants (integrity) | continuous check that sum of credits equals sum of debits plus fees, and statement balance equals previous balance plus transactions | p.572 |
| Uniqueness under concurrency | fire concurrent claims for one username from many clients; exactly one success event, all others rejected, no duplicate names stored | p.567-568 |
| Validation precedes irreversible actions | payout or email cannot execute unless the corresponding approved event exists | p.574 |
| Timeliness bound is met | measure write-to-visible latency in each derived store and to pushed clients against the agreed bound (book's example: under one second) | p.559 |
| Views are rebuildable from scratch | rebuild the derived view from log or snapshot plus backlog; rebuild completes and matches the live view | p.545, p.548 |
| Event-time windows are replay-stable | reprocess historical data at a different wall-clock time; window aggregates identical | p.546 |
| Exactly-once output under faults | inject failures during processing; final output equals the fault-free run, no partial outputs | p.546 |
| Fault containment | stop one consumer; producer and other consumers keep processing; restarted consumer catches up with no gaps | p.550 |
| Offline client catch-up | disconnect a client, make server changes, reconnect; client receives all missed events in order | p.558-559 |
| Backups restore and reconcile | restore into a fresh environment and run the reconciliation check against the system of record | p.577 |
| Storage scrubbing | background job reads every file or replica, compares checksums across replicas, alerts on mismatch | p.576 |
| Migration is reversible | traffic split between old and new derived views can be switched back; both stay maintained from the same input | p.546 |
| Read provenance | for a sampled decision event the system returns the exact read results shown to the user beforehand | p.560 |
| Tamper evidence | Merkle inclusion proof verifies for every audit record; a modified entry fails verification | p.578 |

## Terms

- **system of record**: the authoritative source of truth where changes are written first; other datasets are derived from it (glossary p.607; p.541).
- **derived data**: data created from other data by a repeatable process that could be run again; indexes, caches, materialized views, ML models (glossary p.604; p.544).
- **data integration**: getting data "in the right form in all the right places" across several specialized systems (p.544).
- **change data capture (CDC)**: capturing a database's changes and applying them in order to derived systems (p.541).
- **event sourcing**: representing user input as immutable events from which all state updates are derived (p.541, p.577).
- **total order broadcast**: delivering all events to all nodes in the same order; equivalent to consensus (p.543).
- **consensus**: several nodes agreeing on something, e.g. a leader or an order; needed for strict uniqueness (glossary p.604; p.567).
- **state machine replication**: deriving replicas by processing the same writes in the same order (p.541).
- **deterministic**: a function that always gives the same output for the same input, independent of time, randomness or network (glossary p.604; p.544).
- **idempotent**: an operation that can be retried safely because executing it several times has the same effect as once (glossary p.605; p.562).
- **exactly-once (effectively-once) semantics**: output as if no faults occurred even though retries happened (p.546, p.562).
- **logical timestamps / logical clocks**: coordination-free total ordering that still requires handling out-of-order delivery (p.543).
- **compensating transaction**: a later change that corrects a mistake, i.e. an apology after a violated constraint (p.574).
- **lambda architecture**: separate batch and stream layers; "has fallen out of use" (p.546).
- **kappa architecture**: one engine for both reprocessing history and processing live events (p.546).
- **event time vs processing time**: time an event happened versus time it is processed; only event time is meaningful on replay (p.546).
- **federated database / polystore**: one query interface over many storage engines; unifies reads (p.548).
- **unbundled database**: composing storage systems through CDC and event logs so writes synchronize across technologies; unifies writes (p.549).
- **incremental view maintenance**: engines that precompute and update caches of complex queries as inputs change (p.551).
- **materialized view**: a precomputed cache of query results kept up to date (glossary "materialize" p.606; p.547, p.557).
- **secondary index**: a derived structure for finding records by field value; built by CREATE INDEX from a snapshot plus backlog (glossary p.607; p.548).
- **dataflow programming**: automatically recomputing dependents when inputs change, as in a spreadsheet (p.551).
- **observer pattern**: hand-written notification of readers when a variable changes (p.553).
- **separation of Church and state**: keep stateless application logic separate from state management (p.553).
- **stream operator**: application code run inside a stream processor, consuming and producing streams of state changes (p.554).
- **write path**: eager, precomputed part of the data's journey, updating derived datasets as data arrives (p.555-556).
- **read path**: lazy part executed when someone queries; meets the write path at the derived dataset (p.556).
- **cache of common queries**: precomputed results for frequent queries, itself a materialized view (p.557).
- **local-first software / sync engine**: persistent client state that works offline and syncs in the background (p.558).
- **server-sent events / WebSockets**: protocols letting the server push state changes to a connected browser (p.558).
- **consumer offset**: position in a log that lets a disconnected consumer (or device) catch up without missing messages (p.558-559).
- **stream-table join**: joining a stream of read or write events against stored state; serving a read is a join (p.560).
- **distributed RPC (Storm)**: executing a multishard query through stream-processing infrastructure (p.560).
- **end-to-end argument**: a function can be implemented completely and correctly only at the application endpoints (Saltzer, Reed, Clark 1984) (p.565).
- **duplicate suppression**: detecting and dropping repeated requests, at TCP, transaction or application level (p.563).
- **request ID**: client-generated unique identifier (UUID or hash of fields) passed to the database and checked with a UNIQUE constraint (p.564).
- **Post/Redirect/Get**: web pattern that avoids resubmit warnings but does not help when a POST times out (p.564).
- **fencing**: preventing a failed-over node from acting on stale leadership during idempotent retries (p.563).
- **write skew / phantoms**: anomalies that break application-level check-then-insert under weak isolation (p.564).
- **strict serializability**: committed writes are immediately visible to other transactions (p.571).
- **timeliness**: users observe an up-to-date state; violations are temporary (p.571).
- **integrity**: absence of corruption, loss, or contradictory data; violations are permanent without repair (p.571).
- **linearizability**: the CAP sense of consistency, a strong form of timeliness (p.571; glossary p.605).
- **coordination-avoiding data system**: maintains integrity without atomic commit, linearizability or synchronous cross-shard coordination (p.574).
- **system model**: the set of assumptions about which faults can and cannot happen (p.575).
- **auditing**: checking the integrity of data to detect and repair corruption (p.576).
- **scrubbing**: background re-reading and cross-replica comparison of stored data (HDFS, S3, Ceph) (p.576).
- **time-travel debugging**: reproducing the exact circumstances of an unexpected event from a deterministic event log (p.577).
- **Byzantine fault tolerance**: continuing to work when some nodes have corrupted data or behave arbitrarily; what blockchains add (glossary p.603; p.578).
- **Merkle tree**: tree of hashes that efficiently proves a record appears in a dataset (p.578).
- **certificate transparency**: cryptographically verified append-only logs with Merkle trees and a single leader per log (p.578).

## Chapter summary (condensed)

- No single tool can serve all use cases efficiently, so applications must compose several pieces of software; the data integration problem is solved by using batch processing and event streams to let data changes flow between systems (p.579).
- Some systems are designated systems of record; indexes, materialized views, ML models, statistical summaries and more are derived from them through transformations (p.579).
- Making these derivations asynchronous and loosely coupled keeps a problem in one area from spreading to unrelated areas, increasing robustness and fault tolerance of the whole (p.579).
- Expressing dataflows as dataset-to-dataset transformations helps applications evolve: to change a step such as the structure of an index or cache, rerun the new code over the whole input to rederive the output; if something goes wrong, fix the code and reprocess to recover (p.579).
- Because this mirrors what databases do internally, dataflow applications are recast as unbundling the components of a database and composing them as loosely coupled parts (p.579).
- Derived state is updated by observing changes in the underlying data and can itself be observed downstream, all the way to the end-user device, giving UIs that update dynamically and keep working offline (p.579).
- Correctness under faults: strong integrity guarantees can be implemented scalably with asynchronous event processing, end-to-end request identifiers that make operations idempotent, and asynchronous constraint checking (p.579).
- Clients can wait for a check to pass or go ahead without waiting and risk apologizing for a constraint violation; this is "much more scalable and robust" than distributed transactions and matches how many business processes actually work (p.579).
- Structuring applications around dataflow with asynchronous constraint checks avoids most coordination and yields systems that keep integrity while performing well, even geographically distributed and under faults (p.579).
- Audits verify integrity and detect corruption; the techniques of blockchains resemble event-based systems (p.579-580).

## Second-edition-specific

Identified from the text itself (chapter framing, cross-references to sections that exist only in the 2nd edition, and references dated after the 2017 first edition); a side-by-side comparison with the first edition was not part of the source files, so treat these as "looks new".

- The chapter is retitled "A Philosophy of Streaming Systems" and explicitly builds on Chapter 12's "streaming/event-driven architecture ideas"; the ethics discussion is split out into its own Chapter 14 (p.539, p.585).
- Named federated query engines now include Trino, Hoptimator and Xorq alongside PostgreSQL foreign data wrappers, and the "polystore" term is used (p.548).
- New closing paragraph on composition tooling: Debezium for change streams, "Kafka's protocol is becoming a de facto standard for event streams", and incremental view maintenance engines, cross-referenced to a 2nd-edition section "Incremental View Maintenance" on page 516 (p.551).
- The lambda architecture is declared to have "fallen out of use" and the unified approach is named the kappa architecture; stream processors reading from "object storage" is mentioned (p.546).
- Cross-references to 2nd-edition-only material: "Sync Engines and Local-First Software" (p.558), "Case Study: Social Network Home Timelines" on page 34 with the remark "After 500 pages, we have come full circle!" (p.557), "Event-Driven Architectures" on page 189 (p.554), "ID Generators and Logical Clocks" (p.543).
- Kubernetes is listed first among the deployment platforms for application code (p.552).
- Raft is named as the example consensus algorithm for leader election in constraint enforcement (p.567).
- The multishard payment example is backed by the authors' 2019 CACM paper "Online Event Processing" [47] (p.569).
- References dated after 2017 mark updated material: Spotify's event delivery migration 2021 [9] (gradual migration, p.546); McKinney "The Road to Composable Data Systems" 2023 [15] (p.546); Bellemare "Building Event-Driven Microservices, 2nd edition" 2025 [28] (p.554); Ceph scrubbing 2022 [53] (p.576).
- ML models are treated as derived data whose output is "indirectly" derived from training data, with feature engineering flagged as application-specific (p.552).
