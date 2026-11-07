<!-- forge reference: a page-cited digest of Designing Data-Intensive Applications, 2nd ed. (Kleppmann & Riccomini, O'Reilly 2026), chapter 8. Written while reading the chapter; every rule, number, failure mode, question and property carries its page. The condensed layer is references/data-intensive-protocol.md (§0-§8); the row-level map is references/data-intensive-book-map.md; this file is the full layer the requirements data round and the build Phase 4 review consult for the chapters a DATA.md group cites. -->

# DDIA 2nd edition - Chapter 8 "Transactions" - digest

Source: ch08.txt (book pages 277-344; references on p.337-344). Page refs are p.NN.

## Thesis

A transaction groups reads and writes into a unit that either commits or aborts, so the application can treat partial failures and many concurrency problems as "a simple transaction abort" and retry (p.277-278, p.335).
ACID is "mostly a marketing term": atomicity really means abortability, consistency is the application's invariant to keep, durability is risk reduction rather than a guarantee, and isolation is where "the devil is in the details" (p.279-284).
Most databases run weak isolation (read committed, snapshot isolation) that leaves lost updates, write skew and phantoms to the developer; only serializable isolation prevents all race conditions, and serial execution, two-phase locking and serializable snapshot isolation are the three ways to get it (p.288-289, p.308, p.335-337).
Atomic commit across nodes needs two-phase commit; it works well inside one database, but heterogeneous XA transactions are fragile, and idempotence delivers exactly-once semantics without them (p.324, p.333-335).
The NoSQL belief that transactions cannot scale "has turned out to be wrong" thanks to NewSQL systems (p.279).

## Decision rules

| rule | when it applies | why (mechanism) | page |
|---|---|---|---|
| Use transactions when several objects must stay in sync: foreign keys, denormalized copies, secondary indexes | relational, document and graph models alike | without atomicity error handling gets complicated; without isolation a record can appear in one index but not another | p.287, p.335 |
| Applications that only read and write single records "can probably manage without transactions" | very simple access patterns | single-object atomicity and isolation are provided by almost all storage engines | p.286, p.335 |
| Do not take "ACID compliant" at face value; check the actual isolation guarantees | selecting a database | "one database's implementation of ACID does not equal another's" | p.279 |
| Declare invariants as constraints (foreign key, uniqueness, check); use triggers or materialized views for complex ones; otherwise consistency is the application's job | ACID consistency | the database cannot stop bad data you did not declare invariants for | p.281 |
| Treat durability as risk reduction: fsync, write-ahead log, checksums, replication to remote machines, and backups "can and should be used together" | any database | disks, SSD firmware, fsync and filesystems all fail in practice; correlated faults kill all replicas | p.282-284 |
| In a replicated database, acknowledge commit only after writes reach the required number of nodes | replicated durability | otherwise recent writes may be lost on leader failure | p.283 |
| Prefer built-in atomic operations (increment) or conditional writes over read-modify-write for single objects | concurrent updates of one object | removes the race in Figure 8-1 | p.286 |
| Do not mistake a multi-put API for a transaction | key-value stores | the command "may succeed for some keys and fail for others" | p.285-286 |
| Group a transaction's operations on one TCP connection between BEGIN TRANSACTION and COMMIT; abort if the connection drops | relational databases | the connection identifies which operations belong together | p.285 |
| Retry aborted transactions (ORMs such as ActiveRecord and Django do not by default) | error handling | "the whole point of rolling back transactions is to enable safe retries" | p.288 |
| Retry only after transient errors (deadlock, isolation violation, network interruption, failover); never after permanent errors (constraint violation) | retry policy | a permanent error will recur | p.288 |
| Limit retries, use exponential backoff, and treat overload errors differently | contention or overload | retries make overload worse (feedback cycle) | p.288 |
| Add application-level deduplication where a commit acknowledgment can be lost | retry after network timeout | the retry may perform the transaction twice | p.288 |
| Do not assume external side effects (sending email) are rolled back on abort; use 2PC or idempotent design | transactions with side effects | side effects happen even if the transaction aborts | p.288, p.330 |
| Assume an attacker may send bursts of concurrent requests; prevent concurrency bugs systematically | public APIs handling money or points | "ACIDRain" style attacks exploit races | p.289 |
| Isolation matrix - Read uncommitted: dirty writes prevented; dirty reads, read skew, phantoms, lost updates, write skew all possible | lowest level | returns latest written value without storing two versions; "can also reduce the probability of (but not prevent) lost updates" | p.293, p.335 |
| Isolation matrix - Read committed: dirty reads and dirty writes prevented; read skew, phantoms, lost updates, write skew possible | default in Oracle, PostgreSQL, SQL Server | row-level write locks held to commit; readers get the old committed value | p.290-293, p.335 |
| Isolation matrix - Snapshot isolation: dirty reads, read skew and (read-only) phantoms prevented; lost updates "depends" on implementation; write skew possible | PostgreSQL "repeatable read", Oracle "serializable", SQL Server "snapshot" | each transaction reads a consistent snapshot via MVCC; write skew is not detected | p.294-297, p.305, p.335 |
| Isolation matrix - Serializable: dirty reads, read skew, phantoms, lost updates and write skew all prevented | strongest level | result equals some serial order | p.308, p.335 |
| Dirty writes are prevented by "almost all transaction implementations" | all levels above read uncommitted | second writer waits for first transaction to commit or abort | p.291, p.336 |
| Use snapshot isolation for long-running read-only work: backups, analytics, integrity checks | reporting and operations | "readers never block writers, and writers never block readers" | p.294-295 |
| Do not prevent dirty reads with read locks; prefer keeping the old committed value (MVCC) | implementing read committed | one long write transaction would stall all readers (Db2, SQL Server with read_committed_snapshot=off do lock) | p.292-293 |
| Lost updates: prefer atomic write operations (UPDATE counters SET value = value + 1) whenever the change is expressible | counters, balances, JSON sub-document edits (MongoDB), Redis data structures | the database locks the object or runs the op single-threaded | p.300 |
| Audit ORM code for accidental unsafe read-modify-write cycles | any ORM-based app | ORMs make it easy to bypass atomic operations | p.300 |
| Lost updates: use explicit locking (SELECT ... FOR UPDATE) when application logic cannot be a database query (game rules) | validation before update | other transactions wait for the lock; handle deadlocks by retrying | p.300-301 |
| Lost updates: rely on automatic detection in PostgreSQL repeatable read, Oracle serializable and SQL Server snapshot isolation, but not MySQL/InnoDB repeatable read; still retry aborted transactions | snapshot isolation databases | detection is less error-prone than remembering locks; MySQL is argued not to provide true SI | p.301 |
| Lost updates without transactions: use compare-and-set (WHERE content = 'old content') or a version-number column ("optimistic locking"); check whether the update took effect and retry | databases without transactions | the update applies only if the value is unchanged since read | p.302 |
| Verify CAS semantics under MVCC: safety "may or may not" hold depending on whether WHERE sees other transactions' writes | MVCC databases | many MVCC implementations make UPDATE/DELETE WHERE clauses see newer values as an exception | p.302 |
| Locks and conditional writes do not work with multi-leader or leaderless replication; use commutative merges (CRDTs) and avoid LWW | replicated databases with concurrent writes | no single up-to-date copy exists; LWW "is prone to lost updates" | p.302-303 |
| Write skew: atomic single-object operations do not help | two transactions update different objects after reading the same ones | multiple objects are involved | p.304 |
| Write skew: snapshot isolation's lost-update detection does not catch it (PostgreSQL, MySQL, Oracle, SQL Server); automatic prevention needs true serializable isolation | any check-then-write pattern | the premise changes between read and commit | p.305 |
| Write skew: express the rule as a database constraint if possible (uniqueness for usernames); multi-object constraints may need triggers or materialized views | invariants across rows | the database aborts the violating transaction | p.305-306 |
| Write skew: if serializable is unavailable, "the second-best option" is to lock the rows the decision depends on with SELECT ... FOR UPDATE | rows checked exist (doctors on call) | locking the premise rows serializes the conflicting transactions | p.305 |
| Phantoms: SELECT FOR UPDATE cannot protect absence checks (room free, username unused, balance positive); use serializable isolation or materialize conflicts | check for no matching rows then insert | "SELECT FOR UPDATE can't attach locks to anything" if no rows match | p.307 |
| Materialize conflicts (a pre-populated lock table such as room-time slots) only as a last resort; prefer serializable isolation | phantoms with no serializable option | it leaks concurrency control into the data model and is error-prone | p.308 |
| Pick serializable isolation when you cannot tell by inspecting code that a weaker level is safe | large applications | "no good tools to help us detect race conditions"; isolation levels inconsistently implemented | p.308 |
| Serial execution: use it when the active dataset fits in memory, every transaction is small and fast, and write throughput fits one core or shards cleanly | VoltDB/H-Store, Redis, Datomic | removes concurrency entirely; one slow transaction stalls everything | p.309, p.313 |
| Never hold a transaction open waiting for a user; commit within one HTTP request | all OLTP | idle transactions would need huge concurrency | p.310 |
| Serial execution requires stored procedures or single-statement transactions, not interactive multi-statement ones | single-threaded databases | network round trips would dominate and throughput "would be dreadful" | p.310 |
| Write stored procedures in general-purpose languages (Java, Groovy, Clojure, Lua, JavaScript), keep them deterministic when they are replicated (VoltDB state machine replication) | modern stored-procedure systems | deterministic replicas produce the same result; use special APIs for date/time | p.312 |
| Embed validation in stored procedures when a GraphQL proxy exposes the database directly and cannot validate | GraphQL architectures | otherwise a validation service is needed between proxy and database | p.312 |
| Shard so each transaction touches one shard; cross-shard transactions are "vastly slower" (VoltDB about 1,000 cross-shard writes/sec, not improved by more machines) | scaling serial execution | each shard runs its own thread; cross-shard needs lockstep coordination | p.312-313 |
| 2PL: choose it for serializability only if you can tolerate much worse throughput, unstable high-percentile latency and frequent deadlocks; use transaction timeouts and slow query monitoring | MySQL/InnoDB serializable, SQL Server serializable, Db2 repeatable read | readers block writers and vice versa; whole-table shared locks for scans | p.314-316 |
| Keep 2PL and 2PC separate in your head: 2PL = serializable isolation, 2PC = atomic commit | terminology | "very different things" | p.313 |
| Ensure a suitable index exists for predicates that must be protected; otherwise 2PL falls back to a shared lock on the whole table | 2PL with index-range (next-key) locks | predicate locks are too slow; index-range locks approximate them | p.316-317 |
| Prefer SSI when contention is moderate and spare capacity exists; avoid optimistic control under high contention or near maximum throughput | PostgreSQL serializable, CockroachDB, FoundationDB, Hekaton, HyPer, BadgerDB | high contention means many aborts and retries | p.318 |
| Reduce contention with commutative atomic operations (increments not read in the same transaction) | counters under SSI | order of application does not matter, so no conflict | p.319 |
| Keep read/write transactions short under SSI; long read-only transactions are fine | SSI workloads | long read/write transactions are likely to conflict and abort | p.322 |
| Prefer SSI over 2PL for predictable latency and read-heavy workloads; over serial execution when you need multi-core or multi-node throughput | choosing a serializable implementation | no blocking on locks; FoundationDB distributes conflict detection | p.322 |
| Distributed commit: never just send commit to every node; use an atomic commitment protocol | transactions over several shards or a global secondary index | commit may succeed on some nodes and fail on others and cannot be retracted | p.323-324 |
| 2PC participant: on prepare, write all data to disk and check constraints before voting yes; yes means surrendering the right to abort | implementing or operating 2PC | crash, power failure or disk full "is not an acceptable excuse" later | p.326 |
| 2PC coordinator: write the decision to its log (the commit point) before sending commit/abort, then retry forever | 2PC coordinators | the log is how in-doubt transactions are resolved after a crash | p.326-328 |
| An in-doubt participant must wait for the coordinator; it must not commit or abort on timeout | coordinator crash after prepare | unilateral decisions make nodes inconsistent | p.327 |
| Do not rely on 3PC; replace the single coordinator with a fault-tolerant consensus protocol | nonblocking atomic commit | 3PC assumes bounded network delay and response times | p.328 |
| Prefer database-internal distributed transactions (CockroachDB, TiDB, Spanner, FoundationDB, YugabyteDB, Kafka) over heterogeneous XA | choosing where distributed atomicity lives | internal protocols can replicate the coordinator, talk directly to shards, and couple with concurrency control | p.329, p.333 |
| Treat XA heuristic decisions as an emergency escape hatch only | stuck in-doubt XA transactions | heuristic means "probably breaking atomicity" | p.332 |
| Do not expect XA to detect cross-system deadlocks or to work with SSI | heterogeneous transactions | XA is a lowest common denominator with no inter-participant protocol | p.332-333 |
| Exactly-once message processing: store processed message IDs in the database inside the processing transaction, acknowledge after commit, delete the ID afterwards, and put a uniqueness constraint on the ID table | consumers of message brokers | makes processing idempotent so retries do not duplicate side effects; no cross-system atomic commit needed | p.334-335 |
| Use internal distributed transactions to scale the idempotency pattern across shards (IDs on one shard, data on others) | sharded databases | atomic commit across shards keeps ID and data consistent | p.335 |
| Expect "best effort" leaderless datastores not to undo partial work; the application must recover | leaderless replication | they do not abort | p.287-288 |
| Beware isolation-level names: "repeatable read" is snapshot isolation in PostgreSQL, weaker than SI in MySQL, and serializability in Db2; Oracle "serializable" is SI | portability | the SQL standard predates snapshot isolation and is ambiguous | p.282, p.298 |
| If a database offers snapshot isolation as its highest level (Oracle, TiDB, Aurora DSQL), plan manual write-skew protection | choosing such a system | write skew is not prevented by SI | p.295, p.305 |

## Metrics and numbers

| metric or quantity | definition / how measured | values or thresholds the book gives | caveats | page |
|---|---|---|---|---|
| Age of the transaction model | since IBM System R | 1975; "virtually the same for 50 years" | implementation details changed | p.278 |
| ACID term coined | Harder and Reuter | 1983 | has become "mostly a marketing term" | p.279 |
| Counter race example | two concurrent increments | 42 should become 44, becomes 43 | lost update, not prevented by read committed | p.281, p.291 |
| SSD bad blocks | fraction of drives with at least one bad block | 30% to 80% in the first four years | only some correctable by firmware | p.283 |
| Firmware time bomb | drive failure after fixed uptime | exactly 32,768 hours | firmware bug (HPE SAS SSDs) | p.283 |
| fsync misuse | duration PostgreSQL used fsync incorrectly | "over 20 years" | fsync "is hard to use" | p.283 |
| Unpowered worn SSD data loss | time to start losing data | weeks to months depending on temperature | less of a problem for low-wear drives | p.284 |
| Partial single-object write | document size example | 20 kB JSON, 10 kB fragment sent | storage engines provide single-object atomicity | p.286 |
| Read skew example | balances seen during a transfer | $1,000 total in two $500 accounts; $100 transfer; observer sees $500 + $400 = $900 | acceptable under read committed | p.293 |
| Backup duration | time to copy a large database | "may take hours" | needs snapshot isolation to be consistent | p.294 |
| PostgreSQL transaction IDs | txid width and wraparound | 32-bit; overflow after about 4 billion transactions | vacuum prevents overflow affecting data | p.295 |
| Materialized conflict table | granularity and horizon | 15-minute slots for the next six months | last resort technique | p.308 |
| Serial execution feasibility | when single-threaded loops became viable | 2000s, after 30 years of multithreading | enabled by cheap RAM and short OLTP transactions | p.309 |
| Stored procedures in SQL standard | SQL/PSM | since 1999 | vendor languages seen as archaic | p.311 |
| VoltDB cross-shard throughput | cross-shard writes per second | about 1,000, "orders of magnitude below" single-shard | cannot be increased by adding machines | p.313 |
| 2PL dominance | years as the only serializable algorithm | around 30 years | poor performance | p.313 |
| SSI age | first description | 2008 | "comparatively new" | p.318 |
| Default isolation level | Oracle, PostgreSQL, SQL Server | read committed | weaker than many assume | p.292 |
| 2PC performance cost | source of overhead | additional fsync operations and network round trips | leads many cloud services to omit distributed transactions | p.329 |
| XA standard | year introduced | 1991 | C API, not a network protocol | p.330 |
| In-doubt lock duration | locks held while coordinator down | 20 minutes if coordinator takes 20 minutes to restart; forever if its log is lost | requires manual resolution | p.331 |
| SSI abort rate | share of transactions aborted | "significantly affects the overall performance" | keep read/write transactions short | p.322 |
| Deadlock frequency | 2PL vs read committed | "much more frequently under 2PL" | retried work is wasted | p.315-316 |
| Transaction scope on the web | duration bound | one HTTP request | no spanning requests | p.310 |
| Table 8-1 | anomaly by isolation level | read uncommitted: all possible; read committed: dirty reads prevented; SI: dirty reads, read skew, phantoms prevented, lost updates depends; serializable: all prevented | dirty writes omitted because almost always prevented | p.335 |
| Financial losses from weak isolation | real incidents | bankrupted a Bitcoin exchange; auditor investigations; corrupted customer data | even "ACID" relational databases use weak isolation | p.289 |
| Email example | denormalized unread counter | mailbox shows one unread, counter shows zero | dirty read of the email | p.284-285 |

## Failure modes and anti-patterns

| failure mode | cause | consequence | mitigation the book gives | page |
|---|---|---|---|---|
| Partial failure without atomicity | crash, network cut, disk full or constraint violation mid-way | unknown which writes applied; retry duplicates data | atomic transactions: abort discards all writes, retry is safe | p.280 |
| Dirty read | reading uncommitted writes | users see half-updated state; cascading aborts if the writer rolls back | read committed or stronger | p.291 |
| Dirty write | overwriting an uncommitted value | car sold to Bryce, invoice sent to Aaliyah | row-level locks held until commit | p.291-292 |
| Read skew (nonrepeatable read) | reading different rows at different times | $100 appears to vanish; permanent inconsistencies in backups; nonsense analytics | snapshot isolation (MVCC) | p.293-294 |
| Lost update | concurrent read-modify-write | counter increments, JSON list edits, wiki saves lost | atomic ops, FOR UPDATE, automatic detection, CAS | p.299-302 |
| Write skew | two transactions read the same premise and update different objects | no doctor on call; double booking; illegal game move; duplicate username; negative balance | serializable isolation; constraints; FOR UPDATE on premise rows | p.303-306 |
| Phantom | a write changes another transaction's search result | FOR UPDATE on an empty result locks nothing; write skew via inserts | serializable isolation, index-range locks, materialized conflicts | p.307-308 |
| ORM pitfalls | frameworks hide concurrency | unsafe read-modify-write, no retry of aborts, SQL prone to write skew | use atomic ops, retry logic, serializable | p.288, p.300, p.307 |
| Retry storm | retrying on overload or contention | makes the problem worse | limit retries, exponential backoff, classify errors | p.288 |
| Duplicate after lost ack | network fails after a successful commit | transaction performed twice on retry | application-level deduplication | p.288 |
| Duplicated side effects | email or other external action inside a retried transaction | action repeated | 2PC across systems, or idempotent design | p.288, p.330 |
| Client crash during retry | process dies while retrying | the data it was writing is lost | (none beyond acknowledging the limit) | p.288 |
| Readers stalled by long writer | read locks for dirty-read prevention (Db2, SQL Server rcsi off) | read-only queries wait; knock-on slowdowns | MVCC old-value reads | p.292-293 |
| Undetected lost updates in MySQL | InnoDB repeatable read does not detect them | silent data loss despite "repeatable read" | explicit locks or atomic ops | p.301 |
| Isolation naming confusion | Oracle "serializable" = SI; PostgreSQL RR = SI; MySQL RR weaker; Db2 RR = serializable | wrong assumptions about guarantees | know the actual semantics; test (Hermitage) | p.282, p.298 |
| Unsafe compare-and-set under MVCC | WHERE clause may not see concurrent writes | CAS "may or may not be safe" | rely on documented visibility exception or version numbers | p.302 |
| Lost updates in replicated databases | LWW conflict resolution; locks assume single copy | concurrent writes discarded | commutative merges, CRDTs | p.302-303 |
| Concurrency control leaking into data model | materializing conflicts | ugly, hard to get right | serializable isolation instead | p.308 |
| Serial execution stall | one slow transaction, or data not in memory | all transaction processing halts | small fast transactions, in-memory data | p.313 |
| Interactive transactions on single thread | statement-at-a-time network round trips | "dreadful" throughput | stored procedures | p.310 |
| Bad stored procedure | memory or CPU hog, crash, untrusted tenant code | harms the shared database; security risk in multitenant systems | general-purpose languages, careful management | p.311-312 |
| Nondeterministic stored procedure | using current time etc. | replicas diverge under state machine replication | deterministic APIs | p.312 |
| 2PL table-wide lock | scan needs shared lock on entire table | writes unavailable for the duration of a big read | snapshot isolation or SSI for reads | p.315 |
| 2PL unstable latency | contention and lock waits | very slow high percentiles; "grind to a halt" | timeouts, slow query monitoring | p.315 |
| Deadlock churn under 2PL | many locks | aborted transactions redo their work | automatic deadlock detection plus retry | p.315-316 |
| Predicate lock overhead | checking many predicates per write | too slow | index-range (next-key) locks | p.317 |
| Missing index for range lock | no suitable index | fallback to whole-table shared lock | add indexes on predicate columns | p.317 |
| SSI under high contention | optimistic execution | high abort proportion; worse near max throughput | reduce contention; commutative ops; ensure spare capacity | p.318 |
| Coarse SSI tracking | tracking reads at table rather than index level | unnecessary aborts | finer granularity at bookkeeping cost | p.321-322 |
| Long read/write transaction under SSI | long window for conflicts | likely abort | keep read/write transactions short | p.322 |
| One-phase commit across nodes | independent commit requests | some nodes commit, others abort; cannot be retracted once visible | 2PC | p.323-324 |
| Coordinator crash after prepare | single coordinator | participants in doubt, holding locks, blocking others | coordinator log; wait for recovery; consensus-based coordinator | p.327-328, p.331 |
| Coordinator log lost or truncated | disk failure | no automatic recovery; may abort already-committed transactions | manual resolution by administrator | p.328 |
| Orphaned in-doubt transactions | coordinator cannot decide (log lost or corrupted) | locks held forever, even across database restarts | manual commit or rollback | p.331-332 |
| Heuristic decisions | participant decides unilaterally | atomicity probably broken | catastrophic use only | p.332 |
| XA coordinator and application as single points of failure | coordinator library lives in the application process | its local log becomes critical durable state; database cannot contact coordinator | database-internal transactions with replicated coordinators | p.331-332 |
| XA lowest common denominator | compatibility with many systems | no cross-system deadlock detection; no SSI | database-internal protocols | p.332-333 |
| 3PC in real networks | assumes bounded delay | cannot guarantee atomicity | consensus (Chapter 10) | p.328 |
| Durability illusions | fsync bugs, firmware bugs, filesystem interactions, undetected disk corruption spreading to replicas and backups, correlated faults, async replication | committed data lost or corrupted | combine disk, replication, backups; checksums; historical backups | p.283-284 |
| Partial multi-put | key-value multi-key operation without transaction semantics | some keys updated, others not | real transactions | p.286 |
| Duplicate email in exactly-once pipeline | email server not under 2PC | email sent two or more times on retry | roll back all side effects, or make them idempotent | p.330 |
| Leftover message IDs | crash after ack before deleting the ID | harmless storage use | tolerate | p.334 |

## Elicitation questions

| question (client language) | concept it decides |
|---|---|
| When a multi-step change fails halfway (order placed, stock reduced, invoice created), is it acceptable that only some steps happened? | atomicity and multi-object transactions (p.280, p.287) |
| Which totals must always add up, and which rules must never be broken (balances, stock counts, "at least one person on duty", "no double booking")? Who is harmed if they drift? | consistency invariants, constraints, write skew (p.281, p.303-306) |
| Do several people or systems often change the same record at the same time (counters, shared documents, inventory)? | lost updates (p.299) |
| Do you have "check first, then act" rules such as unique usernames, room availability, or spending limits? | write skew, phantoms, need for serializable isolation (p.306-308) |
| Do you need reports, exports or backups that reflect one moment in time? | snapshot isolation for long reads (p.294) |
| Is it acceptable if a user briefly sees an inconsistent total that corrects itself on refresh? | tolerance for read skew under read committed (p.293-294) |
| If the server crashes or loses power right after confirming a change, how bad is it to lose that change? How many copies do you need? | durability and replicated durability (p.282-284) |
| Do actions trigger things outside the database (emails, payments, shipping) that must never happen twice? | side effects, idempotency, exactly-once (p.288, p.330, p.334) |
| Is there money, credit or anything valuable an attacker could gain by hammering your system with simultaneous requests? | deliberate exploitation of race conditions (p.289) |
| Which systems does one business action touch (databases, queues, other vendors' products)? Are they all the same product? | heterogeneous vs database-internal distributed transactions (p.329, p.333) |
| How steady must response times be, and what peak load do you expect? | 2PL vs SSI vs serial execution trade-offs (p.315, p.318, p.322) |
| How much of your data is actively used? Would it fit in memory? | serial execution feasibility (p.309, p.313) |
| Who is on call when something is stuck at 3am? Can they manually resolve a blocked transaction? | XA in-doubt transactions and heuristic decisions (p.331-332) |
| When an operation fails for a transient reason, should the system retry automatically or ask the user again? | retry policy (p.288) |
| Are you comfortable with business logic living inside the database, and does your team have the tooling to version and deploy it? | stored procedures (p.311-312) |
| Will data be split across many machines, and do single actions cross those splits? | cross-shard transactions and 2PC (p.312-313, p.323) |
| Are you consuming events or messages where each must be applied exactly once? | message-ID idempotency table (p.334) |
| Which database products are you already committed to, and do you know their default isolation level? | default read committed and naming confusion (p.292, p.298) |
| Is an audit trail and human fraud review more important to you than strict consistency? | banking-style file exchange aside (p.289) |

## Verifiable properties

| property | how to test | page |
|---|---|---|
| No dirty reads | T1 sets x = 3 without committing; T2 reads x concurrently; assert T2 sees the old value (2) until T1 commits | p.290 |
| No dirty writes | two transactions each update a listings row and an invoices row in opposite order; after both commit, assert both rows name the same buyer | p.291 |
| Read skew absent under snapshot isolation | T1 transfers $100 between two $500 accounts; T2 reads account 1, pauses, reads account 2 during the transfer; assert the sum T2 sees is $1,000 (expect $900 under read committed) | p.293 |
| Lost updates prevented | N concurrent clients each do read, add 1, write on a counter starting at 42; assert final = 42 + N for each strategy: atomic UPDATE, SELECT FOR UPDATE, CAS with retry, and automatic detection (expect serialization errors to retry) | p.299-302 |
| Lost updates in replicated systems | concurrent increments on different replicas with CRDT merge converge to the correct total; with LWW some increments are lost | p.302-303 |
| Write skew prevented | doctors table with Aaliyah and Bryce on call; two transactions each check count >= 2 then set own on_call = false; assert at least one remains on call under serializable (expect zero under snapshot isolation) | p.303-305 |
| Phantom-based write skew prevented | two transactions each check no overlapping booking for room 123 noon-1pm, then insert; assert exactly one commits under serializable (expect both under SI) | p.306-307 |
| Username uniqueness | concurrent registrations of the same name; assert exactly one succeeds and the other fails with a constraint violation | p.306 |
| No double spend | concurrent tentative spend inserts whose sum exceeds the balance; assert the account never goes negative | p.306 |
| Materialized conflicts serialize bookings | pre-populate slot rows; concurrent bookings lock the same slot rows; assert no overlapping bookings committed | p.308 |
| MVCC visibility rules | start T12, then T13 moves $100 (delete $500 row, insert $400 row) and commits; assert T12 still reads $500; a transaction started after T13 commits reads $400 | p.296-297 |
| Readers never block writers | run a long read-only snapshot query; concurrently commit writes to the same rows; assert the writes complete without waiting | p.295 |
| 2PL blocking and deadlock detection | under serializable 2PL, writer waits on a reader's shared lock; two transactions lock rows in opposite order; assert one is aborted with a deadlock error and the other completes | p.314-315 |
| Retry classification | inject deadlock/serialization errors and a constraint violation; assert the former are retried with backoff and bounded count, the latter is not retried | p.288 |
| Idempotent message processing | redeliver a message with the same ID; assert side effects applied once; crash after commit before ack then redeliver; assert duplicate dropped; two concurrent deliveries of the same ID; assert the uniqueness constraint rejects one | p.334 |
| Multi-object atomicity on crash | kill the database mid-transaction after inserting the email but before incrementing the counter; after restart assert neither or both are present | p.285 |
| Single-object atomicity | cut the connection after 10 kB of a 20 kB document; assert stored value is entirely old or entirely new | p.286 |
| Durability of acknowledged commits | commit, then power-cycle the node; assert committed data present after restart (fsync and WAL) | p.282 |
| 2PC in-doubt behavior | participants vote yes, then kill the coordinator; assert participants neither commit nor abort and hold their locks; restart coordinator; assert all participants reach the same outcome from its log | p.326-328 |
| 2PC participant promise | participant votes yes and then crashes; on recovery it must still be able to commit when asked | p.326 |
| Commit point | coordinator crashes before writing its decision; on recovery assert the transaction is aborted everywhere | p.328 |
| Actual isolation semantics of a database | run the above anomaly tests against each advertised level (the book cites the Hermitage test suite); record which anomalies occur | p.289, p.298 |
| Stored procedure determinism | execute the same procedure with the same inputs on two replicas; assert identical state | p.312 |
| Transaction never spans requests | instrument the application; assert no transaction is open across two HTTP requests | p.310 |
| Serial execution stall | inject one slow transaction; measure latency of others; expect stall (documents the ceiling) | p.313 |

## Terms

| term | one-line definition |
|---|---|
| Transaction | a group of reads and writes executed as one logical unit that either commits or aborts (p.277-278) |
| Commit / abort (rollback) | successful completion vs discarding all of a transaction's writes (p.278) |
| Safety guarantees | error and concurrency scenarios the database handles so the application can ignore them (p.278) |
| ACID | atomicity, consistency, isolation, durability; coined 1983, now vague in practice (p.279) |
| BASE | basically available, soft state, eventual consistency; "not ACID" (p.279) |
| Atomicity (ACID) | all-or-nothing on faults; "abortability would have been a better term" (p.280) |
| Consistency (ACID) | application-defined invariants hold at commit; depends on the application (p.281) |
| Invariant / constraint | a statement that must always be true; declared via foreign-key, uniqueness, check constraints, triggers or materialized views (p.281) |
| Isolation | concurrent transactions cannot step on each other; formalized as serializability (p.282) |
| Durability | committed data survives crashes and hardware faults; disk fsync or replication to several nodes (p.282-283) |
| fsync / write-ahead log / checksum | forcing data to disk; log for crash recovery; detecting corrupt log entries (p.282) |
| Single-object operation | atomic and isolated write of one key or document; includes atomic increment and conditional write (p.286) |
| Multi-object transaction | atomic, isolated writes across several rows, documents or records (p.284) |
| Lightweight transactions | Cassandra/ScyllaDB linearizable single-object conditional writes without multi-object guarantees (p.286) |
| Weak isolation | nonserializable levels that allow some race conditions (p.288-289) |
| Read committed | no dirty reads and no dirty writes (p.290) |
| Dirty read | seeing another transaction's uncommitted write (p.290) |
| Dirty write | overwriting another transaction's uncommitted write (p.291) |
| Cascading aborts | aborting transactions that read data later rolled back (p.291) |
| Read uncommitted | prevents dirty writes but not dirty reads (p.293) |
| Read skew / nonrepeatable read | seeing different parts of the database at different points in time (p.293) |
| Snapshot isolation | each transaction reads from a consistent snapshot as of its start (p.294) |
| Repeatable read | SQL standard level; means SI in PostgreSQL, weaker in MySQL, serializable in Db2 (p.298) |
| MVCC | multiversion concurrency control; several committed versions of a row kept side by side (p.295) |
| txid, inserted_by, deleted_by | transaction ID tags that drive visibility; deletes are marks, updates are delete plus insert (p.295-296) |
| Visibility rules | which row versions a transaction may see, based on in-progress, later and aborted transactions (p.297) |
| Garbage collection / vacuum | removing row versions no transaction can see (p.295-296) |
| Copy-on-write B-tree | immutable tree where each write creates a new root that is a snapshot (CouchDB, Datomic, LMDB) (p.298) |
| Lost update | read-modify-write cycles where one modification clobbers another (p.299) |
| Atomic write operation | database-side update such as UPDATE ... SET value = value + 1 (p.300) |
| Explicit locking / SELECT FOR UPDATE | application locks rows it will update or depend on (p.300-301) |
| Deadlock | transactions waiting on each other's locks; detected and one aborted (p.301, p.315) |
| Lost update detection | transaction manager aborts a transaction whose update would be lost (p.301) |
| Conditional write / compare-and-set | update only if the value is unchanged since read (p.302) |
| Optimistic locking | version-number column checked on update (p.302) |
| Siblings / CRDT / LWW | conflicting concurrent versions; commutative merge datatypes; last write wins discarding others (p.303) |
| Write skew | two transactions read the same objects and update different ones, invalidating each other's premise (p.304) |
| Phantom | a write in one transaction changes the result of a search in another (p.307) |
| Materializing conflicts | adding lock rows so a phantom becomes a lock conflict (p.308) |
| Serializability | outcome equal to some serial execution; strongest isolation (p.308) |
| Actual serial execution | one transaction at a time on a single thread (p.309) |
| Stored procedure | transaction code submitted to the database ahead of time (p.310) |
| State machine replication | executing the same deterministic procedure on every replica (p.312) |
| Two-phase locking (2PL / SS2PL) | shared and exclusive locks held until commit; growing then shrinking phase (p.313-315) |
| Predicate lock | lock on all objects matching a search condition, including future ones (p.316) |
| Index-range (next-key) lock | approximation of a predicate lock attached to an index range (p.317) |
| Pessimistic vs optimistic concurrency control | wait when danger is possible vs proceed and check at commit (p.318) |
| Serializable snapshot isolation (SSI) | SI plus detection of serialization conflicts, aborting at commit (p.318-319) |
| Premise | the fact a transaction read and based its writes on (p.319) |
| Tripwire | SSI write-side notification that readers' data is outdated, without blocking (p.321) |
| Distributed transaction | a transaction touching multiple nodes, e.g. several shards or a global secondary index (p.323) |
| Commit record | log entry whose durable write is the single-node commit moment (p.323) |
| Atomic commitment problem | ensuring all nodes commit or all abort (p.324) |
| Two-phase commit (2PC) | prepare phase then commit/abort phase driven by a coordinator (p.324-325) |
| Coordinator / transaction manager | component collecting votes and deciding; e.g. Narayana, JOTM, BTM, MSDTC (p.325) |
| Participant | a database node in a distributed transaction (p.325) |
| Commit point | durable write of the coordinator's decision (p.326) |
| In doubt / uncertain | participant state after voting yes and before hearing the decision (p.327) |
| Blocking atomic commit protocol | protocol that can get stuck waiting for coordinator recovery (p.328) |
| Three-phase commit (3PC) | nonblocking variant assuming bounded delays; impractical (p.328) |
| Database-internal vs heterogeneous distributed transactions | all nodes same database software vs different technologies (p.329) |
| Exactly-once semantics | effects of processing a message take effect once despite retries (p.330) |
| X/Open XA, JTA | 1991 standard C API for 2PC across technologies; its Java binding (p.330) |
| Heuristic decision | participant unilaterally resolving an in-doubt transaction, probably breaking atomicity (p.332) |
| Orphaned transaction | in-doubt transaction the coordinator can never resolve (p.331) |
| Idempotent | safe to repeat without duplicating effects, e.g. via a processed-message-ID table (p.335) |
| NewSQL | CockroachDB, TiDB, Spanner, FoundationDB, YugabyteDB: sharding plus consensus with ACID at scale (p.279) |

## Chapter summary (condensed)

Transactions are an abstraction layer that lets an application pretend certain concurrency problems and hardware or software faults do not exist; a large class of errors becomes a simple abort and retry (p.335).
Applications with very simple access patterns (single-record reads and writes) can probably do without them, but for complex patterns transactions hugely reduce the error cases to reason about; without them denormalized data easily drifts out of sync (p.335).
The chapter went deep on concurrency control with read committed, snapshot isolation (sometimes called repeatable read) and serializable, characterized by race conditions summarized in Table 8-1 (p.335).
Dirty reads: reading another client's uncommitted writes; prevented by read committed and stronger (p.336).
Dirty writes: overwriting uncommitted data; prevented by almost all implementations (p.336).
Read skew: seeing different parts of the database at different times; prevented by snapshot isolation, usually implemented with MVCC (p.336).
Phantom reads: another client's write changes a search result; straightforward phantoms are prevented by snapshot isolation, but phantoms in write skew need special treatment such as index-range locks (p.336).
Lost updates: concurrent read-modify-write cycles; some snapshot isolation implementations prevent them automatically, others need a manual lock (SELECT FOR UPDATE) (p.336).
Write skew: a decision made on a premise that is no longer true at write time; only serializable isolation prevents it (p.336).
Weak isolation levels protect against some anomalies and leave the rest to the developer; only serializable protects against all (p.336).
Three ways to implement serializability: literal serial execution (simple and effective if transactions are very fast, typically via stored procedures, and throughput fits one core or can be sharded); two-phase locking (the standard for decades, avoided for poor performance); serializable snapshot isolation (newer, optimistic, checks at commit and aborts nonserializable executions) (p.336-337).
Distributed atomicity uses 2PC; across nodes running the same database software it can work quite well, but across different storage technologies (XA) it is very sensitive to coordinator and application faults and interacts poorly with concurrency control (p.337).
Idempotence can provide exactly-once semantics without atomic commit across technologies (p.337).
The examples used a relational model, but transactions are valuable whatever the data model (p.337).

## Second-edition-specific

| material that looks new vs the first edition | page |
|---|---|
| Post Office Horizon scandal attributed to probable lack of ACID transactions | p.278 |
| NewSQL framing: CockroachDB, TiDB, Spanner, FoundationDB, YugabyteDB show transactions scale via sharding plus consensus, overturning the NoSQL-era belief | p.279 |
| Expanded consistency overloading list including consistent snapshot defined via happens-before, consistent hashing and CAP | p.280-281 |
| "Replication and Durability" sidebar: SSD bad-block rates, 32,768-hour firmware failure, PostgreSQL fsync misuse for over 20 years, filesystem-storage interactions, corruption spreading to replicas, worn SSDs losing data unpowered, matrix.org corruption (2025) | p.283-284 |
| Aerospike strong consistency mode and Cassandra/ScyllaDB lightweight transactions as single-object linearizable ops that are not transactions | p.286 |
| Concurrency bugs as a security concern: attackers deliberately sending concurrent bursts (ACIDRain); financial losses including a Bitcoin exchange bankruptcy; banking's reliance on secure FTP text files and audit trails | p.289 |
| Oracle, TiDB and Aurora DSQL offering snapshot isolation as their highest level; BigQuery using SI for analytics | p.295 |
| MVCC internals: update as delete plus insert, versions in one heap as a linked list, PostgreSQL same-page optimization, delta storage, and copy-on-write B-trees in CouchDB, Datomic, LMDB | p.296-298 |
| Naming confusion detailed with MySQL repeatable read weaker than SI (Jepsen 2023) and the claim that "nobody really knows what repeatable read isolation means" | p.298 |
| Automatic lost update detection matrix: PostgreSQL, Oracle, SQL Server detect; MySQL/InnoDB does not | p.301 |
| MVCC exception making UPDATE/DELETE WHERE clauses see concurrent writes; CAS "may or may not be safe" | p.302 |
| "Conflict resolution and replication": locks and CAS do not apply under multi-leader or leaderless replication; CRDTs and commutativity; LWW prone to lost updates | p.302-303 |
| Additional write skew examples: double-spending; note that ORM-generated SQL is prone to write skew | p.306-307 |
| Stored procedures: GraphQL proxy validation use case, security risk of tenant-written procedures, VoltDB deterministic procedures as state machine replication, Lotus research on multishard transactions | p.312-313 |
| SSI adopters list: PostgreSQL, SQL Server Hekaton, HyPer, CockroachDB, FoundationDB, BadgerDB; FoundationDB distributing conflict detection; debate whether SI is still worth using (Brooker vs Neumann) | p.318, p.322 |
| Distributed transactions reframed: concurrency control generalizes (distributed 2PL, distributed serializability checkers) while atomicity is the new challenge; single-disk controller as the single-node commit device | p.323 |
| Three-phase commit dismissed for unbounded delays; consensus as the replacement for a single coordinator | p.328 |
| "Database-Internal Distributed Transactions" section: Kafka internal transactions; four fixes over XA (replicated coordinator, direct coordinator-shard communication, replicated shards, coupling with distributed concurrency control); SI and SSI across shards | p.333 |
| "Exactly-Once Message Processing Revisited": four-step idempotent message-ID algorithm requiring only database-local transactions, crash analysis, uniqueness constraint for concurrent duplicates, link to Kafka Streams, and scaling it with internal distributed transactions | p.334-335 |
| Durable execution and workflows referenced as the hypothetical way to make XA application code restartable | p.332 |
