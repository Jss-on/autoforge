<!-- forge reference: a page-cited digest of Designing Data-Intensive Applications, 2nd ed. (Kleppmann & Riccomini, O'Reilly 2026), chapter 10. Written while reading the chapter; every rule, number, failure mode, question and property carries its page. The condensed layer is references/data-intensive-protocol.md (§0-§8); the row-level map is references/data-intensive-book-map.md; this file is the full layer the requirements data round and the build Phase 4 review consult for the chapters a DATA.md group cites. -->

# Digest: Chapter 10 - Consistency and Consensus (DDIA 2nd ed., pp.401-450)

## Thesis

Replication gives fault tolerance but creates inconsistencies; the two philosophies are eventual consistency (the application copes) and strong consistency (the system behaves "as if it were a single node") (p.401). The chapter makes "strong consistency" precise as linearizability: the system appears to hold a single copy of the data, every operation takes effect atomically at some point between its start and end, and once a new value has been read all later reads see it, i.e., "linearizability is a recency guarantee" (p.403-406). Linearizability is required for leader election and locks, hard uniqueness constraints, and cross-channel timing dependencies, but not for loosely enforced constraints or most reads (p.408-411); it is inherently slow because response time is at least proportional to network-delay uncertainty, and disconnected replicas must become unavailable (p.414-417). ID generators and logical clocks (Lamport, hybrid logical clocks) give causal ordering without fault-tolerant linearizability, and a linearizable fetch-and-add or CAS is where consensus becomes unavoidable (p.417-425). Consensus, with CAS, shared logs (total order broadcast), and atomic commitment all equivalent, is "single-leader replication done right": epochs, two overlapping quorum votes, majorities, automatic failover with no lost committed writes and no split brain (p.427-437). Coordination services such as ZooKeeper, etcd, and Consul package this for locks, leases, fencing, failure detection, and notifications (p.437-440).

## Decision rules

| rule | when it applies | why (mechanism) | page |
|---|---|---|---|
| Accept eventual consistency when users can make changes offline | sync engines, local-first apps | with offline edits "eventual consistency is inevitable" | p.402 |
| Prefer strong consistency when replicas sit in datacenters with fast, reliable communication, accepting its performance cost and that some faults an eventually consistent system tolerates cause outages | multi-replica deployments inside or across well-connected datacenters | "its cost is acceptable" there; the system behaves like a single node, so developers need not reason about replication lag, conflicts, or stale replicas | p.401-402 |
| Require linearizability for leases, locks, and leader election | single-leader systems avoiding split brain | "It shouldn't be possible for two nodes to acquire the lease at the same time" | p.408 |
| Build leases and leader election on a coordination service (ZooKeeper, etcd) and recipe libraries (Apache Curator) rather than from scratch | coordination tasks | they use consensus to implement linearizable operations fault-tolerantly; "many subtle details are involved" (fencing) | p.408-409 |
| Know your coordination service's read semantics: ZooKeeper writes are linearizable but reads may be stale; etcd 3 gives linearizable reads by default | reading from a coordination service | reads not served from the current leader can be stale | p.409 |
| Require linearizability for hard uniqueness constraints enforced at write time (usernames, email addresses, file paths) and for balance-never-negative, do-not-oversell, and seat-booking rules | concurrent creates or updates where one party must be rejected | equivalent to acquiring a lock or an atomic CAS on the name; all nodes must agree on one current value | p.409-410 |
| Relax linearizability when a constraint can be treated loosely (overbooking with compensation) | business rules with after-the-fact remedies | "linearizability may not be needed"; see Timeliness and Integrity (Chapter 13) | p.409 |
| Foreign-key and attribute constraints do not need linearizability | schema constraints other than uniqueness | they can be implemented without coordination | p.410 |
| When two communication channels exist between components (file storage plus message queue; push notification plus data fetch), either make the storage linearizable or control the extra channel with read-your-writes techniques | pipelines with side channels | the faster channel can overtake replication, so the consumer sees an old version or nothing | p.410-411 |
| With single-leader replication, perform all reads and writes on the leader, and be sure you know who the leader is | pursuing linearizability without consensus | a "delusional leader" serving requests violates linearizability | p.411 |
| Do not combine asynchronous replication with failover if you need linearizability or durability | single-leader failover | committed writes can be lost, "which violates both durability and linearizability" | p.411 |
| Sharding a single-leader database does not break linearizability, but cross-shard transactions are a separate problem | sharded strongly consistent stores | linearizability is a single-object guarantee | p.411 |
| In consensus-based systems, do not serve reads from a node without confirming it is still leader | reads on Raft/Zab systems | a new leader may have been elected; the read is stale | p.412 |
| Treat multi-leader replication as not linearizable | multi-leader systems | concurrent writes on multiple nodes with asynchronous replication produce conflicts | p.412 |
| Assume leaderless (Dynamo-style) replication is not linearizable even with w + r > n quorums | leaderless stores | variable network delay allows the Figure 10-6 race; LWW with time-of-day clocks is "almost certainly nonlinearizable" | p.412-413 |
| To make Dynamo-style reads and writes linearizable, do synchronous read repair before returning and read a quorum before writing to pick a greater timestamp; accept the performance penalty | leaderless stores that need recency | Riak skips synchronous read repair for performance; Cassandra does it but loses linearizability through clock timestamps | p.412-413 |
| Do not expect a linearizable CAS from a leaderless store | locks and uniqueness on Dynamo-style systems | CAS "requires a consensus algorithm" | p.413 |
| Use multi-leader replication if regions must keep working during an inter-region partition; use single-leader if linearizability matters more than availability in follower regions | multi-region design | with single-leader, follower regions cannot write or read linearizably while cut off from the leader | p.413-414 |
| If the application requires linearizability, disconnected replicas must wait or return errors (CP); if not, each replica can keep serving (AP) | any unreliable network, not only multi-region | this is the real content of the CAP trade-off | p.415 |
| Do not use CAP to design systems; if you must discuss it, say "either consistent or available when partitioned," because partitions are faults, not a choice | architecture discussions | formal CAP covers only linearizability and partitions (under 8% of incidents), ignores delays and dead nodes, and its availability definition is idiosyncratic; "it's best not to dwell on it" | p.415-416 |
| Recognize that dropping linearizability is usually about performance, not fault tolerance | choosing weaker consistency | even multi-core RAM is not linearizable for speed; linearizable systems are higher latency "all the time" | p.416-417 |
| Use weaker consistency models for latency-sensitive systems | when response time matters most | Attiya and Welch: linearizable response time is at least proportional to network-delay uncertainty; "a faster algorithm for linearizability does not exist" | p.417 |
| Use a 64-bit autoincrement for single-node IDs; avoid 32-bit unless the 4 billion limit is certain | primary keys | 32 bits "is risky" | p.417 |
| Use sharded IDs, preallocated blocks, random UUIDs (v4), or wall-clock-prefixed IDs (UUID v7, Snowflake, ULID, Flake ID, ObjectID) when uniqueness is enough and ordering can be approximate | distributed ID generation without coordination | all are unique with high probability but lose or weaken ordering; wall-clock IDs are "unlikely to be linearizable" | p.418-419 |
| Use a logical clock when IDs must be compact, unique, totally ordered, and consistent with causality | ordering events across nodes | counts events instead of measuring time | p.420 |
| Use Lamport timestamps (counter, node ID) for causal total order without special hardware; do not expect recency | causal ordering, distributed ID generator | each node increments its counter and adopts any larger counter it sees; node ID breaks ties | p.420-421 |
| Use a hybrid logical clock when you also need timestamps close to physical time (queries by date) and monotonicity despite clock jumps | systems like CockroachDB | HLC moves forward with the largest timestamp seen and increments on each generation; needs only roughly synchronized clocks | p.421-422 |
| Use Lamport or hybrid logical clocks for MVCC transaction IDs | snapshot isolation in distributed databases | the snapshot stays consistent with causality | p.422 |
| Use vector clocks only when you must detect concurrency; accept one integer per node of overhead | conflict detection | Lamport/HLC order concurrent events arbitrarily and cannot reveal concurrency | p.422 |
| Use a linearizable ID generator when writes to separate databases or shards must be ordered by real time (e.g., privacy setting then photo upload) | cross-shard snapshot reads with MVCC | a logical clock can lag on a shard that never read the other, exposing data | p.423-424 |
| Implement a linearizable ID generator as a single node that atomically increments, persists, and replicates the counter (TiDB/TiKV timestamp oracle, after Percolator) | fault-tolerant linearizable IDs | single-leader replication of a simple counter | p.424 |
| Hand out IDs in persisted, replicated batches; accept skipped IDs after a crash or failover | throughput of an ID generator | avoids a disk write and replication per request while never issuing duplicates or out-of-order IDs | p.424 |
| Do not shard or geo-distribute the linearizable ID generator; route all ID requests to one region | multi-region deployments | independent shards cannot keep a linearizable order; one node handles large throughput anyway | p.424 |
| Alternatively use Spanner-style clock uncertainty intervals with commit wait for linearizable IDs without communication | geo-distributed systems with tightly synchronized clocks | non-overlapping intervals order requests even across regions; needs hardware and software support | p.424-425 |
| Do not use a logical clock or ID generator alone to implement locks, leases, or uniqueness; use consensus for any contested decision that must be fault-tolerant | contested resources | a node cannot know its timestamp is lowest without hearing from every other node, so one failure halts the system; these problems are all instances of consensus | p.425-426 |
| Use non-Byzantine consensus (Viewstamped Replication, Paxos, Raft, Zab) inside your own infrastructure; reserve Byzantine consensus (less than one-third faulty) for blockchains | choosing an algorithm family | nodes are assumed to follow the protocol; BFT is out of scope | p.426 |
| Do not let FLP stop you: use timeouts or randomness so consensus terminates in practice | reasoning about impossibility | FLP assumes a deterministic algorithm with no clocks; timeouts make consensus solvable | p.426 |
| Run a separate consensus instance per decision (e.g., per bookable seat) | many independent decisions | single-value consensus decides one value | p.428 |
| Expect progress only while a majority is up; expect safety always | capacity and failure planning | termination needs a majority; agreement, integrity, validity hold "even if a majority of nodes fail" | p.428-429 |
| Prefer the shared-log (total order broadcast) formulation in practice | building replicated systems | Raft, VR, Zab, and Multi-Paxos provide logs; single-value consensus, CAS, fetch-and-add, and fencing tokens derive from it | p.433-434 |
| Use state machine replication: deterministic processing of the same log on every replica, including deterministic stored procedures for serializable transactions | replication, event sourcing, stream processing, actual serial execution | identical inputs in identical order yield consistent state and a serial transaction order | p.433 |
| Keep one log per shard for scalability, knowing cross-shard snapshots, foreign keys, and serializable transactions then need extra coordination | sharded strongly consistent databases | per-shard logs limit cross-shard guarantees | p.434 |
| Derive fencing tokens from the log sequence number (ZooKeeper zxid) | lease fencing on a consensus system | the log position increases monotonically | p.434 |
| Require leader uniqueness per epoch, not globally; the higher epoch prevails | leader election design | ballot (Paxos), view (VR), and term (Raft) numbers resolve conflicts between leaders | p.434-435 |
| Before appending, the leader collects votes from a quorum that must overlap with the election quorum | log replication | a node votes yes only if unaware of a higher epoch; overlap ensures a newer leader would be revealed | p.435 |
| Do not confuse consensus voting with 2PC | protocol comparison | any node can start an election and only a quorum must respond; 2PC needs the coordinator and every participant | p.435 |
| Require the new leader to be up to date with confirmed entries before it processes writes or linearizable reads; treat unclean leader election (Kafka option) and asynchronous replication as "thin ice" | failover configuration | a stale leader can overwrite entries, violating append-only; "the theory of consensus no longer applies" | p.436 |
| Put linearizable reads through a quorum vote like writes (as etcd does) | reads on consensus-replicated databases | confirms the self-declared leader is still current | p.436 |
| Use reconfiguration features to add or remove nodes, add regions, or migrate (add new, then remove old) | cluster membership changes | standard algorithms assume a fixed voting set | p.436 |
| Treat any automatic failover not based on a proven consensus algorithm as "likely to be unsafe" | evaluating replication products | proven algorithms prevent lost committed data and split brain | p.437 |
| Budget for consensus costs: strict majority (3 nodes for 1 failure, 5 for 2), quorum communication per operation, no throughput gain from more nodes, minority partitions blocked | sizing a consensus cluster | every operation talks to a quorum; "every node you add makes the algorithm slower" | p.437 |
| Tune failure-detection timeouts carefully in high-variance or multi-region networks | consensus deployment | too large delays recovery; too small causes constant leader elections | p.437 |
| Know that Raft can thrash with one consistently unreliable link; use pre-vote or leaderless protocols (EPaxos) where links are flaky | consensus at the network edge | leadership bounces or the leader is forced to resign repeatedly | p.437 |
| Use coordination services (ZooKeeper, etcd, Consul) for small, in-memory, slow-changing coordination data, not for high write volumes or general storage | choosing where state lives | they replicate a small dataset via consensus and are not designed as databases | p.437-438, p.440 |
| Outsource consensus to a fixed 3- or 5-node coordination service instead of running consensus over all application nodes | large clusters (thousands of shards) | consensus over thousands of nodes "would be terribly inefficient" | p.439 |
| Use a coordination service's atomic operations, ephemeral nodes, and notifications for leader election and shard assignment, ideally via Curator-style libraries | allocating work to nodes | automatic recovery without humans; still "much better than attempting to implement the necessary consensus algorithms from scratch" | p.439 |
| Store configuration in a coordination service only if you already run one; otherwise poll a file or URL | configuration management | configuration does not need consensus, only notifications | p.439 |
| For fast-changing internal state use a conventional database or Apache BookKeeper | state changing thousands of times per second | coordination data changes on a timescale of minutes or hours | p.440 |
| Do not require linearizability for service discovery; cache with TTLs, bypass the cache on connection failure, or use DNS-style layered caching; use ZooKeeper observers for read scale | service discovery | availability and speed matter more than recency; "without it everything would grind to a halt" | p.440 |
| Use leaderless or multi-leader replication plus logical clocks where strong consistency is not needed | availability- and performance-first systems | consensus "is not always the right tool" | p.443 |

## Metrics and numbers

| metric or quantity | definition / how measured | values or thresholds the book gives | caveats | page |
|---|---|---|---|---|
| Linearizability check cost | recording all request/response timings and searching for a valid sequential order | "possible (though computationally expensive)" | tools cited: Knossos, Elle | p.407 |
| Quorum condition | w + r > n for leaderless replication | example n = 3, w = 3, r = 2 still allows a nonlinearizable execution | meeting the condition does not give linearizability | p.412 |
| Partition share of incidents | network partitions as cause of incidents, per Google data | less than 8% | the only fault CAP considers | p.415 |
| Linearizable response time lower bound | Attiya and Welch result | at least proportional to the uncertainty of network delays | holds for reads and writes; no faster algorithm exists | p.417 |
| Autoincrement ID width | storage for a single-node counter | 64 bits, or 32 bits only if under 4 billion records | 32 bits "is risky" | p.417 |
| Preallocated ID blocks | ranges handed to nodes | node A 1 to 1,000, node B 1,001 to 2,000 | ordering across nodes is lost | p.418 |
| UUID size | random or timestamp-based identifiers | 128 bits | more space than autoincrement; v4 order is random | p.419 |
| Lamport timestamp example | (counter, node ID) ordering | (1, "Aaliyah") < (1, "Caleb") < (2, "Bryce") | equal counters mean the events were concurrent | p.421 |
| Vector clock size | one counter per node stored with each write | "potentially one integer for every node" | cost of detecting concurrency | p.422 |
| Spanner commit wait | delay before returning a timestamp | the length of the clock uncertainty interval | needs tightly synchronized clocks with computed uncertainty | p.424-425 |
| Byzantine fault bound | faulty nodes tolerated by BFT consensus | fewer than one-third | out of scope for the book | p.426 |
| Nodes needed for termination | functioning nodes required by any consensus algorithm | at least a majority | safety holds even with a majority down | p.428-429 |
| Consensus number | how many proposers an operation can decide among | fetch-and-add: 2; CAS and shared logs: infinity | fetch-and-add cannot solve general consensus | p.431-432 |
| Voting rounds | votes in leader-based consensus | two: elect a leader, then approve each appended entry | quorums for the two votes must overlap; typically majorities | p.435 |
| Replication before acknowledgment | copies of a log entry before confirming to the client | synchronously replicated to a quorum | ensures the entry survives leader failure | p.435 |
| Cluster sizing | nodes required to tolerate failures | 3 nodes tolerate 1 failure; 5 tolerate 2 | adding nodes slows the algorithm | p.437 |
| Coordination service size | voting nodes in ZooKeeper/etcd deployments | usually 3 or 5, regardless of application cluster size | runs on a fixed set of nodes | p.439 |
| Coordination data churn | rate of change suited to coordination services | minutes or hours between changes; not thousands per second | use a database or BookKeeper for fast-changing state | p.439-440 |
| Lease and heartbeat timeout | client session with periodic heartbeats | lease released if no heartbeat for longer than the lease timeout (ZooKeeper ephemeral nodes) | leases survive brief interruptions | p.438 |
| Consensus timeout tuning | failure-detection timeout in consensus systems | no fixed value; too large slows recovery, too small triggers needless elections | especially hard across regions | p.437 |
| Oracle RAC lock granularity | distributed locks in a shared-disk database | one lock per disk page; dedicated cluster interconnect | locks on the transaction critical path | p.409 |

## Failure modes and anti-patterns

| failure mode | cause | consequence | mitigation the book gives | page |
|---|---|---|---|---|
| Stale read after another user saw the new value | read served by a lagging replica (sports website) | linearizability violated; users confused | linearizable reads | p.403 |
| Value flip-flops between old and new during a write | reads concurrent with a write return either value with no ordering constraint | not what "a single copy of the data" would do | once any read returns the new value, all later reads must too | p.405 |
| Read returns an older value than an earlier completed read | B's read starts after A read 4 but returns 2 | the final read in Figure 10-4 is not linearizable | atomic linearization point moving forward in time | p.407 |
| Confusing linearizability with serializability | both sound like "sequential order" | linearizability does not prevent write skew; serializability allows stale reads | combine them as strict serializability when both are needed | p.407-408 |
| Two nodes hold the lease (split brain) | non-linearizable lease implementation | duplicate leaders | linearizable lease via consensus-based coordination service | p.408 |
| Delusional leader | node thinks it is leader but has been replaced | serves requests, violating linearizability | consensus with leadership checks on reads | p.411-412 |
| Lost committed writes on failover | asynchronous replication | durability and linearizability violated | synchronous replication to a quorum before acknowledgment | p.411, p.435 |
| Quorum read returns old value after another client saw new (Figure 10-6) | writes reach replicas at different times; w + r > n met | nonlinearizable despite quorums | synchronous read repair; read latest timestamp before writing | p.412 |
| LWW with time-of-day clocks | Cassandra and ScyllaDB conflict resolution | timestamps inconsistent with event order; not linearizable | avoid clock-based LWW for recency guarantees | p.412-413 |
| Transcoder processes an old or missing video | message queue overtakes storage replication (two channels) | original and transcoded videos "permanently inconsistent" | linearizable file storage or read-your-writes control of the queue channel | p.410-411 |
| Push notification arrives before the data | fetch goes to a lagging replica | app shows nothing for the notification | linearizable storage or routing the fetch appropriately | p.411 |
| Follower regions go dark during inter-region partition | single-leader replication with leader elsewhere | no writes or linearizable reads there until the link heals | multi-leader if availability matters more | p.414 |
| "Pick two of three" CAP reasoning | misreading CAP | partitions are faults, not a choice; systems misclassified as CP or AP | "consistent or available when partitioned"; do not dwell on CAP | p.416 |
| Non-linearizable RAM | per-core caches and store buffers | a thread may not see another core's write | memory barriers; understand the trade is for performance | p.416-417 |
| ID generator as single point of failure | one node assigns all IDs | outage, cross-region latency, write bottleneck | replicate the counter; batch IDs; or clock-uncertainty approach | p.418, p.424 |
| Sharded or block-allocated IDs misorder events | even/odd or block ranges per node | ID 16 vs 17 says nothing about order | linearizable generator or logical clocks | p.418-419 |
| Wall-clock IDs misordered | clock skew between nodes; nonmonotonic clock on one node | earlier event gets a later ID | logical clocks; HLC | p.419 |
| Lamport counters diverge | nodes that never communicate | events at the same time get wildly different counters; no date queries | hybrid logical clock | p.421 |
| Concurrency undetectable | Lamport and HLC order concurrent events arbitrarily | cannot tell concurrent from causally ordered | vector clocks | p.422 |
| Private photo exposed | photos shard's logical clock lags the accounts shard; viewer's MVCC snapshot falls between | viewer sees a photo despite the account being private | linearizable ID generator | p.423-424 |
| Lowest-timestamp lock protocol stalls | must hear from every node that might have a lower timestamp | one unreachable node halts the system | consensus | p.425 |
| Consensus never terminates (FLP) | deterministic algorithm in an asynchronous model | cannot guarantee a decision | timeouts or randomness | p.426 |
| Dictator node fails | hardcoding one decision-maker | no further decisions, like single-leader without failover | fault-tolerant consensus with termination | p.428 |
| All nodes crash | total failure | no algorithm can decide | tolerate only a minority of failures | p.428 |
| Fetch-and-add winner crashes before announcing | counter-based election with more than two proposers | others cannot decide; the winner may return and rightly decide | use CAS or a shared log (consensus number infinity) | p.431 |
| 2PC coordinator failure | coordinator is a single point of failure | participants stuck | atomic commitment via consensus | p.432 |
| Stale node becomes leader | leader not required to be up to date | overwrites entries already appended, breaking append-only; data loss or corruption | Raft requires a log at least as current as a majority; Paxos catches up before appending | p.435-436 |
| Unclean leader election | Kafka option allowing any replica to lead | "thin ice"; consensus theory no longer applies | require up-to-date leaders | p.436 |
| Stale linearizable reads | read served without a quorum check | leader may have been replaced | quorum vote for linearizable reads (etcd) | p.436 |
| Timeouts too large or too small | multi-region variance | slow recovery, or constant elections "spending more time choosing leaders than doing useful work" | careful tuning | p.437 |
| Raft leadership bouncing | one consistently unreliable link | system never makes progress | pre-vote phase; EPaxos | p.437 |
| Adding nodes to a consensus group | hoping for throughput | every operation still needs a quorum; the algorithm gets slower | keep the group small; outsource consensus | p.437, p.439 |
| Coordination service used as a database | high write volumes or large datasets | not designed for it | conventional database or BookKeeper for fast-changing state | p.438, p.440 |
| Service discovery blocked by consensus | linearizable lookups during a partition | "everything would grind to a halt" | caching, TTLs, DNS, observers | p.440 |
| Stale observer reads | observers do not vote | reads may be stale | acceptable for discovery, not for coordination | p.440 |
| Manual failover downtime | human-performed leader switch | significant downtime; fails termination | automatic leader election via consensus | p.434 |

## Elicitation questions

- After someone saves a change, must every other user see it on their very next refresh, even on another device or in another region, or is a short delay acceptable? [linearizability as recency guarantee, p.403-405]
- Are there names, codes, or identifiers that must be unique, where two people might grab the same one at the same moment? Must the loser be told immediately? [hard uniqueness constraint -> linearizability/consensus, p.409-410]
- If stock, seats, or balances are over-allocated, can you fix it afterwards (move the customer, refund, compensate), or must it never happen? [loose vs hard constraints, p.409]
- Do you send notifications, emails, or queue messages about data that the recipient then goes to read? Would reading an older version cause lasting damage? [cross-channel timing dependency, p.410-411]
- Must users be able to keep working while offline and sync later? [eventual consistency inevitable, p.402]
- If the connection between two of your regions breaks, should each region keep accepting changes, or should some users wait or see errors until it is fixed? [CP vs AP; multi-leader vs single-leader, p.413-415]
- How much extra response time per operation is acceptable in exchange for never seeing stale data? [cost of linearizability, p.417]
- Does the order of records (by ID or timestamp) need to match the real order of events across the whole system, or only roughly? [ID generators and logical clocks, p.418-422]
- When a user changes a permission or setting and then immediately does something else, possibly from another device, must the new setting always apply to that action? [linearizable ID generator / snapshot ordering, p.423-424]
- Do you need to find records by creation date using their ID, or is the ID just an opaque key? [HLC vs Lamport vs UUID, p.419-422]
- Do you need to know whether two edits were made independently at the same time (to merge them), or just which came first? [vector clocks vs Lamport/HLC, p.422]
- Must IDs be short (64-bit) and sequential, or are long random IDs acceptable? [autoincrement vs UUID, p.417-419]
- How many simultaneous server failures must the service survive without any human stepping in? [majority sizing 3/5, termination, p.428, p.437]
- Is it acceptable for an operator to perform failover manually, with the downtime that implies, or must failover be automatic? [consensus vs manual failover, p.434]
- Is it acceptable to lose the last few seconds of writes if a server dies, in exchange for faster recovery or higher availability? [unclean leader election, asynchronous replication, p.436]
- Do you already run Kubernetes, ZooKeeper, etcd, or Consul that we could reuse for coordination? [coordination service reuse, p.437-438]
- How often will the things we coordinate (which server owns which task, configuration values) actually change: minutes, hours, or many times per second? [coordination service suitability, p.439-440]
- Can service address lookups be a little stale as long as they are fast and always available? [service discovery without linearizability, p.440]
- Are all participating machines yours, or might some participants be adversarial? [non-Byzantine vs Byzantine consensus, p.426]

## Verifiable properties

| property | how to test | page |
|---|---|---|
| History is linearizable | record request and response timings for all clients; check that operations can be arranged into a valid sequential order (Knossos/Elle-style checker) | p.407 |
| A read that begins after a write completed returns the new value | concurrent readers polling during a write; the first read after the write's completion must return the new value | p.405 |
| Once any read returns the new value, no later read (any client) returns the old value | track the first read of the new value; assert all reads starting afterward match | p.405 |
| CAS fails if the value changed | issue CAS(x, old, new) after a concurrent change; expect Error and unchanged register | p.406-407 |
| At most one node holds the lease at any time | many nodes race for the lease; assert a single winner per epoch | p.408 |
| Concurrent creates of the same unique name: exactly one succeeds | fire concurrent registrations for one username; expect one OK and the rest errors | p.409 |
| Consensus safety: uniform agreement, integrity, validity | under partitions and crashes, no two nodes decide differently, no node changes its decision, every decided value was proposed | p.427-428 |
| Consensus termination with a majority alive | crash a minority; every surviving node eventually decides | p.428 |
| Safety preserved when a majority is down | partition off a majority; the minority must not decide inconsistently (it may block) | p.429 |
| Shared log: eventual append, reliable delivery, append-only, agreement, validity | nodes append concurrently with injected faults; every node reads the same prefix in the same order; no entry lost or reordered after a restart | p.430 |
| Atomic commitment: agreement, integrity, validity, nontriviality, termination | multi-shard transactions with a vote to abort or injected timeouts; all nodes commit or all abort; all-yes with no timeouts commits | p.432 |
| Lamport timestamps respect happens-before and are unique | generate events with causal dependencies; assert ts(A) < ts(B) when A happened before B; no duplicate (counter, node ID) pairs | p.420-421 |
| Hybrid logical clock is monotonic despite physical clock jumps | step the system clock backward; subsequent HLC timestamps must still increase | p.422 |
| Vector clocks identify concurrent writes | create concurrent writes on two nodes; the comparison must report concurrency | p.422 |
| Linearizable ID generator issues no duplicate or out-of-order IDs across crash and failover | kill the generator mid-batch and fail over; IDs must stay strictly increasing (gaps allowed) | p.424 |
| ID order matches real-time order across shards | perform a settings write then a photo write with completion before start; the second ID must be greater | p.423-424 |
| Linearizable reads go through a quorum | isolate a deposed leader; a linearizable read against it must fail or block, not return stale data | p.436 |
| New leader has all confirmed entries | crash the leader after a quorum-acknowledged write; the new leader's log must contain it | p.435-436 |
| Leader unique within an epoch; higher epoch wins | simulate two leaders in different epochs; the lower-epoch leader's appends are rejected | p.434-435 |
| Election and proposal quorums overlap | with Flexible-Paxos-style quorums, check that any proposal quorum intersects the last election quorum | p.435 |
| Minority partition cannot make progress; majority can | partition 2 of 5 nodes; writes succeed only on the majority side; no divergence after healing | p.437 |
| Ephemeral nodes vanish after the session timeout | stop a client's heartbeats; its ephemeral nodes disappear and watchers are notified | p.438 |
| Fencing tokens from the coordination service increase monotonically | acquire the lease repeatedly; zxid/revision values strictly increase | p.434, p.438 |
| Fetch-and-add decides correctly for exactly two proposers | two nodes exchange proposals then fetch-and-add; the reader of 0 decides its own value, the reader of 1 decides the other's | p.431 |
| Service discovery keeps working during a coordination-service partition | cut clients off from the service; cached endpoints with TTL still resolve | p.440 |

## Terms

- Eventual consistency: replication visible to the application, which handles conflicts (p.401).
- Strong consistency: the system behaves as if it were a single node (p.401).
- Linearizability (atomic consistency, strong consistency, immediate consistency, external consistency): appears as one copy with atomic operations; a recency guarantee (p.402-403).
- Recency guarantee: a read returns the most recent value, not a stale copy (p.403).
- Register: a single object (key, row, document) in distributed systems theory (p.404).
- Read(x) => v, Write(x, v) => r, CAS(x, vold, vnew) => r: register operations (p.404, p.406).
- Concurrent operations: operations whose time intervals overlap (p.405).
- Linearization point: the instant at which an operation appears to take effect atomically (p.406).
- Serializability: transaction isolation level equivalent to some serial order (p.407-408).
- Strict serializability (strong one-copy serializability, strong-1SR): serializability plus linearizability (p.408).
- Sequential consistency: a different model, not discussed (p.408).
- Read-after-write consistency, monotonic reads, consistent prefix reads: weaker consistency models included in linearizability (p.407).
- Split brain: two nodes both acting as leader (p.408).
- Lease: a lock with a timeout used for leader election (p.408).
- Coordination service: ZooKeeper, etcd, Consul; consensus-based service for locks, leases, notifications (p.408, p.437).
- Apache Curator: library of higher-level recipes on ZooKeeper (p.409, p.439).
- Oracle RAC: shared-disk database using a lock per disk page (p.409).
- Cross-channel timing dependency: race between two communication paths (storage and queue) (p.410).
- Quorum reads and writes: w + r > n in leaderless replication (p.412).
- Read repair: fixing stale replicas on read; must be synchronous for linearizability (p.412).
- Network partition: regions or nodes unable to communicate (p.413).
- CAP theorem: consistency or availability when partitioned; CP and AP classifications (p.414-416).
- PACELC: partition: availability vs consistency; else: latency vs consistency (p.415).
- Memory barrier (fence): instruction forcing visibility across CPU cores (p.416).
- Store buffer / cache: per-core copies that make RAM non-linearizable (p.416).
- Autoincrementing ID: single-node counter; linearizable but not fault-tolerant (p.417).
- Fetch-and-add: atomic increment returning the old value (p.417).
- Sharded ID assignment: shard number bits in the ID (p.418).
- Preallocated blocks of IDs: ranges handed to nodes (p.418).
- UUID / GUID: 128-bit identifiers; version 4 random, version 7 timestamp-prefixed (p.419).
- Snowflake, ULID, Flake ID, ObjectID: wall-clock-prefixed unique ID schemes (p.419).
- Physical clock: time-of-day or monotonic hardware clock (p.420).
- Logical clock: algorithm counting events; compact, unique, totally ordered, causal (p.420).
- Lamport clock / Lamport timestamp: (counter, node ID) pair with max-and-increment rule (p.420-421).
- Hybrid logical clock (HLC): physical time plus Lamport-style forwarding and increment (p.422).
- Vector clock: one counter per node, detects concurrency (p.422).
- Happens-before relation: causal ordering of operations (p.420).
- Timestamp oracle: TiDB/TiKV single-node linearizable ID generator, after Percolator (p.424).
- TrueTime-style uncertainty interval: clock API returning a timestamp range; Spanner waits it out (p.424-425).
- Consensus: getting multiple nodes to agree on a single value (p.426).
- Viewstamped Replication, Paxos, Multi-Paxos, Raft, Zab: best-known consensus algorithms (p.426, p.433).
- Byzantine consensus: tolerates fewer than one-third malicious nodes; used in blockchains (p.426).
- FLP result: no deterministic asynchronous algorithm always reaches consensus if a node may crash (p.426).
- Uniform agreement, integrity, validity, termination: properties of consensus (p.427-428).
- Single-value consensus: deciding one value among proposals (p.427).
- Total order broadcast (atomic broadcast, total order multicast): protocol implementing a shared log (p.430).
- Shared log: multiple nodes append; everyone reads the same entries in the same order (p.429).
- Eventual append, reliable delivery, append-only, agreement, validity: shared log properties (p.430).
- State machine replication: replicas apply the same deterministic log (p.433).
- Consensus number: how many proposers an operation can decide among (fetch-and-add 2, CAS infinity) (p.431-432).
- Atomic commitment: all participants commit or all abort (p.432).
- Nontriviality: all-yes votes without timeouts must commit (p.432).
- Two-phase commit (2PC): coordinator-driven commit protocol with a single point of failure (p.432, p.435).
- Epoch number (ballot number in Paxos, view number in VR, term number in Raft): numbering of leadership periods (p.434-435).
- Quorum overlap: proposal quorum must intersect the election quorum (p.435).
- Unclean leader election: Kafka option allowing a stale replica to become leader (p.436).
- Reconfiguration: adding or removing voting nodes (p.436).
- Pre-vote: Raft extension against leadership bouncing (p.437).
- Egalitarian Paxos (EPaxos): leaderless consensus robust to slow nodes or links (p.437).
- Chubby: Google's lock service that coordination services are modeled after (p.438).
- Ephemeral node: ZooKeeper entry removed when the client session times out (p.438).
- Change notification: subscription to key changes instead of polling (p.438).
- zxid, cversion, revision number: monotonic IDs usable as fencing tokens (p.438).
- Observer: ZooKeeper replica that receives the log but does not vote (p.440).
- Service discovery / service registry: finding the address of a service instance (p.440).
- TTL: time-to-live for cached discovery data (p.440).
- Apache BookKeeper: replication of fast-changing internal service state (p.440).

## Chapter summary (condensed)

- The chapter examines strong consistency in fault-tolerant systems, in depth via linearizability: replicated data appears as a single copy with atomic operations (p.440).
- Linearizability is useful when data must be up to date on read or when a race must be resolved, e.g., concurrent creation of files with the same name (p.440-441).
- It is easy to understand ("a variable in a single-threaded program") but slow, especially with large network delays, and many replication algorithms that look strongly consistent do not provide it (p.441).
- Applied to ID generators: a single-node counter is linearizable but not fault-tolerant; many distributed schemes do not order IDs by actual event order; Lamport and hybrid logical clocks give causal order but not linearizability (p.441).
- Consensus makes fault-tolerant linearizable replication possible by having nodes agree on one sequence of operations even with delayed messages and failed nodes, so the group behaves like a single node processing operations in order (p.441).
- Classic consensus decides a single value that all nodes agree on and cannot change; equivalent problems include linearizable CAS, locks and leases, uniqueness constraints, shared logs (via total order broadcast), atomic transaction commit, and linearizable fetch-and-add (which solves consensus only between two nodes) (p.441-442).
- All are straightforward on a single node or with one node vested with decision-making, which is why single-leader databases can offer linearizable operations, uniqueness constraints, and a replication log (p.442).
- If that leader fails or is unreachable, progress stops until a human fails over; Raft and Paxos are "essentially single-leader replication with built-in automatic leader election and failover" (p.442).
- Consensus ensures no committed writes are lost on failover and no split brain; every write and every linearizable read is confirmed by a quorum, usually a majority, which is expensive across regions but unavoidable (p.442).
- Coordination services like ZooKeeper and etcd build on consensus to offer locks, leases, failure detection, and change notifications; if you need something reducible to consensus and fault-tolerant, "it is advisable to use a coordination service" (p.442).
- Consensus theory since the 1980s makes it possible to tolerate all of Chapter 9's faults without corrupting data, "an amazing achievement" (p.442).
- Consensus is not always the right tool: where strong consistency is unnecessary, leaderless or multi-leader replication with weaker consistency, helped by logical clocks, gives higher availability and performance (p.443).

## Second-edition-specific

- A new major section "ID Generators and Logical Clocks": single-node autoincrement as a linearizable fetch-and-add, sharded IDs, preallocated blocks, UUID v4 and v7, Snowflake, ULID, Flake ID, MongoDB ObjectID (p.417-419).
- Hybrid logical clocks (CockroachDB) presented alongside Lamport clocks, and an explicit comparison of Lamport/HLC with vector clocks for MVCC transaction IDs (p.421-422).
- "Linearizable ID Generators" with the private-photo example (Figure 10-10), the TiDB/TiKV timestamp oracle after Percolator, batch persistence of IDs, and Spanner uncertainty intervals as the alternative (p.423-425).
- "Enforcing constraints using logical clocks" showing why a linearizable ID generator alone cannot implement locks and uniqueness fault-tolerantly (p.425).
- Testing linearizability by recording timings and checking for a valid sequential order, citing Knossos and Elle (p.407).
- Strict serializability discussed with CockroachDB (serializable, some recency, not strict), Spanner and FoundationDB (strict), plus the point that consistency model and isolation level can be chosen independently (p.408).
- etcd treated as a peer of ZooKeeper throughout, including "etcd since version 3 provides linearizable reads by default" and etcd quorum reads (p.409, p.436).
- CAP critique strengthened: partitions under 8% of incidents per Google data, PACELC, and the statement that CAP "has now been superseded by more precise results" (p.415).
- "The Many Faces of Consensus" with formal equivalences among single-value consensus, CAS, shared logs, fetch-and-add, and atomic commitment, including the consensus-number concept (fetch-and-add 2, CAS infinity) and atomic commitment's nontriviality property (p.427-433).
- Conditional writes on object storage cited as a distributed CAS example (p.429).
- Quorum detail from Flexible Paxos: proposal and election quorums need only overlap, "typically, but not always, a majority" (p.435).
- Raft vs Paxos practice: Raft requires an up-to-date leader, Paxos lets any node lead and catch up; Raft edge cases with one bad link, the pre-vote extension, EPaxos leaderless consensus (p.435-437).
- Sidebar "Consistency Versus Availability in Leader Election" on Kafka's unclean leader election and asynchronous replication as "thin ice" (p.436).
- Reconfiguration of consensus groups for adding regions and migrations (p.436).
- Coordination services in the cloud: Kubernetes on etcd, Spark and Flink on ZooKeeper, Consul, configuration management sidebar, service discovery via caching and DNS rather than consensus, ZooKeeper observers, BookKeeper for fast-changing state (p.437-440).
- Distributed transactions and 2PC are no longer covered here; the chapter refers to "Distributed Transactions" in Chapter 8 and treats atomic commitment only as a consensus variant (p.411, p.432).
- Forward references to Chapter 13 for avoiding linearizability without sacrificing correctness and to "Timeliness and Integrity" for loosely enforced constraints (p.409, p.417).
