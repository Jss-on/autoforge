<!-- forge reference: a page-cited digest of Designing Data-Intensive Applications, 2nd ed. (Kleppmann & Riccomini, O'Reilly 2026), chapter 6. Written while reading the chapter; every rule, number, failure mode, question and property carries its page. The condensed layer is references/data-intensive-protocol.md (§0-§8); the row-level map is references/data-intensive-book-map.md; this file is the full layer the requirements data round and the build Phase 4 review consult for the chapters a DATA.md group cites. -->

# Digest: DDIA 2nd ed., Chapter 6 - Replication (pp.197-249)

## Thesis

- Replication keeps "a copy of the same data on multiple machines" for latency (data near users), availability and durability (survive failed parts), read scalability, and disconnected operation; if data never changed it would be trivial, so "all the difficulty in replication lies in handling changes to replicated data" (p.197, p.243).
- Three algorithm families cover almost all distributed databases: single-leader (simple, strong consistency, but failover is "fraught with things that can go wrong"), multi-leader (geo-distributed databases, sync engines and local-first apps, at the price of conflict resolution), and leaderless Dynamo-style quorums (resilient to slow or failed nodes, with probabilistic rather than absolute freshness) (p.199-237).
- The synchronous versus asynchronous choice decides what is lost when a node fails; asynchronous replication is fast but "a write is not guaranteed to be durable, even if it has been confirmed to the client" (p.201).
- Replication lag produces concrete anomalies; applications should decide which of read-after-write, monotonic reads and consistent prefix reads they need, or pick a strongly consistent database and "treat the database as if it had just a single node" (p.209-215).
- Convergence under concurrent writes requires detecting concurrency (version vectors, happens-before) and merging with LWW, manual siblings, or automatic algorithms (CRDTs, OT) that deliver strong eventual consistency (p.222-242).

## Decision rules

| rule | when it applies | why (mechanism) | page |
|---|---|---|---|
| Keep backups even when you replicate; for large datasets keep old snapshots in an object store and only current state in primary storage | Any replicated database | Replicas "quickly reflect writes" including accidental deletions; only a backup lets you go back in time; object stores are cheaper for infrequently accessed data | p.198 |
| Send all writes to the leader (exactly one leader per shard); read from the leader or any follower; say leader/follower, not master-slave | Single-leader (leader-based, primary-backup, active/passive) replication, sharded or not | Followers apply the leader's log "in the same order as they were processed on the leader"; shards may have leaders on different nodes; master-slave "is widely considered offensive" | p.199-200 |
| Never make all followers synchronous; use semisynchronous (one sync follower, others async, promote another if the sync one stalls) | Databases offering synchronous replication | A single unresponsive synchronous follower blocks all writes; semisync guarantees an up-to-date copy on at least two nodes | p.201 |
| Use a majority quorum of synchronous replicas (e.g., 3 of 5) when you need automatic leader election | Consensus-based or eventually consistent systems | Majority quorums underpin consensus protocols | p.201 |
| Accept fully asynchronous replication only if you accept losing unreplicated writes on leader failure | Many followers or geographically distributed followers | Leader keeps processing writes even if all followers lag; durability is weakened | p.201 |
| Set up a new follower from a consistent snapshot tied to an exact log position, then stream changes; do not copy live files or lock the database | Adding or replacing followers | A plain file copy sees different parts at different times; locking defeats high availability; the position (LSN, binlog coordinates, GTID) lets the follower catch up | p.202 |
| Archive the replication log plus periodic snapshots to object storage | Backups and disaster recovery | Bootstrapping a follower can download these (WAL-G for PostgreSQL/MySQL/SQL Server, Litestream for SQLite) | p.202 |
| Use object storage as a database tier when cost, multi-region durability, CAS-based leader election, or open-format integration (Parquet, Iceberg) matter; batch I/O and use tiered storage, a separate low-latency WAL store, or a zero-disk architecture | Cloud-native databases | Object stores have high latency, per-call fees, immutable objects, missing POSIX features | p.202-203 |
| Let a failed follower recover from its own log (catch-up recovery), and decide explicitly whether the leader retains logs for long-unavailable followers or discards them and rebuilds the follower from backup | Follower crash, network interruption, or long outage | The follower knows the last transaction processed and requests everything since; retaining logs risks leader disk exhaustion, discarding forces a backup restore | p.204 |
| Detect leader failure with a timeout (e.g., 30 seconds); use a safe handoff for planned maintenance | Automatic failover | "There is no foolproof way of detecting what has occurred, so most systems simply use a timeout" | p.205 |
| Promote the most up-to-date follower: the synchronous one if semisync, else the one with the highest log sequence number | Choosing a new leader | Minimizes data loss; a follower "behind by several days could be catastrophic" | p.205-206 |
| Make the old leader step down when it returns (fencing) | Failover and split brain | Two nodes accepting writes without conflict handling corrupt data | p.205-206 |
| Tune the failover timeout against both risks (longer means slower recovery, shorter means unnecessary failovers under load spikes or network glitches), and consider manual failover even if automatic is supported | Automatic failover | "An unnecessary failover is likely to make the situation worse, not better"; "these problems have no easy solutions" | p.206 |
| Avoid statement-based replication unless statements are made deterministic (fixed values for NOW/RAND; VoltDB-style deterministic transactions) | Relational replication log format | Nondeterministic functions, order-dependent updates, autoincrement and side effects diverge across replicas; MySQL switches to row-based on nondeterminism | p.206-207 |
| Prefer logical (row-based) log replication over WAL shipping when you need zero-downtime software upgrades (upgrade followers first, then fail over) or external consumers | Replication log format choice | WAL is tied to storage engine format so leader and followers must run the same version; logical logs stay backward compatible, let a follower run a newer version, and are easy to parse (change data capture) | p.207-208 |
| Scale reads by adding asynchronous followers; do not try synchronous read scaling | Read-mostly workloads | Synchronous replication to many followers makes writes fail when any node is down | p.209 |
| Ask what happens if replication lag grows to minutes or hours; if users would suffer, build a stronger guarantee instead of "pretending that replication is synchronous" | Any eventually consistent system | Lag is normally sub-second but "there is no limit to how far a replica can fall behind" | p.209, p.214-215 |
| Provide read-after-write by routing reads of user-modifiable data to the leader (e.g., own profile from leader, others' from followers) | Users view data they just submitted | The stale follower may not yet have the write | p.210-211 |
| If most data is user-editable, use time- or lag-based routing: read from the leader for one minute after the last update, or block followers more than one minute behind | Read-after-write at scale | Reading everything from the leader would negate read scaling | p.211 |
| Have the client remember the timestamp of its last write and require the serving replica to be at least that fresh (wait or reroute); prefer a logical timestamp such as the log sequence number | Read-after-write across arbitrary data | Real system clocks make clock synchronization critical | p.211 |
| For cross-device read-after-write, centralize last-write metadata and route all of a user's devices to the same region | Users on desktop and mobile | One device does not know the other's writes; different networks may route to different regions | p.211 |
| Deploy across multiple zones to survive zonal outages; deploy across regions only if you must survive regional outages and accept higher latency, lower throughput and network bills | Cloud deployments | Zones are separate datacenters with low-latency links; regional outages take all zones down | p.212 |
| Give each user a fixed replica (e.g., hash of user ID) to obtain monotonic reads | Users refreshing pages routed to random replicas | Reading from a fresher then a staler replica makes time "go backward" | p.212-213 |
| Write causally related records to the same shard, or track causal dependencies explicitly, to get consistent prefix reads | Sharded databases without global write order | Independent shards can show an answer before its question | p.213-214 |
| Choose a database with linearizability and ACID transactions (NewSQL) when you want the simplest programming model | Teams who would otherwise hand-code consistency in the application | App-level workarounds are "complex and easy to get wrong" | p.215 |
| Choose weaker replication only for its specific benefits: resilience to network interruptions and lower overhead | Applications that can tolerate weaker guarantees | Those are the remaining advantages over transactional systems | p.215 |
| Treat synchronous multi-leader as equivalent to single-leader; multi-leader means asynchronous | Multi-leader design | A synchronous link between leaders blocks writes exactly like a single leader | p.215-216 |
| Do not use multi-leader within a single region | Single-region deployments | "the benefits rarely outweigh the added complexity" | p.216 |
| Use multi-leader (a leader per region, leader-follower inside each region) for multi-region write latency, regional outage tolerance and inter-region network tolerance | Geo-distributed systems | Writes are processed locally and replicated asynchronously; regions continue independently | p.216-217 |
| Use single-leader when you must enforce constraints such as unique usernames or non-negative balances | Any system with global invariants | Leaders cannot know about each other's concurrent writes; "a fundamental limitation of distributed systems" | p.217 |
| Treat multi-leader as "dangerous territory" to avoid if possible; audit autoincrementing keys, triggers and integrity constraints | Databases where multi-leader is retrofitted (MySQL, Oracle, SQL Server, YugabyteDB, Redis Enterprise, EDB Postgres Distributed, pglogical) | Subtle configuration pitfalls and surprising interactions | p.217-218 |
| Prefer all-to-all topology for fault tolerance over circular or star; in any forwarding topology tag each write with the identifiers of nodes it has passed through | More than two leaders | In circular/star, one failed node interrupts replication until manually reconfigured; node tags prevent infinite replication loops | p.218-219 |
| Do not order multi-leader writes by timestamps; use version vectors, read the documentation and test the guarantees | All-to-all topologies where messages overtake each other | Clocks are not sufficiently synchronized; many systems lack good ordering techniques | p.219-220 |
| Use multi-leader (each device a leader) for apps that must work offline, expecting lag of hours or days; recognize real-time collaboration as multi-leader even without offline support | Calendar-style apps on multiple devices; Google Docs, Figma, Linear-style apps | Each device is a "region" with an extremely unreliable link; each browser tab is a replica applying edits before the server responds | p.220-221 |
| Use a sync engine when you need next-frame UI response (16 ms at 60 Hz), offline operation, a simpler declarative frontend model, or reactive real-time updates | Collaborative and mobile apps | Local reads and writes "almost never fail"; being offline is "the same as having a very large network delay" | p.221-222 |
| Do not use a sync engine when the user can access very large data (e.g., an ecommerce catalog) | Data that cannot be downloaded in advance | Sync engines work best when all needed data is stored persistently on the client | p.222 |
| For local-first software, use an open standard sync protocol with multiple providers and an open source backend (PouchDB/CouchDB, Automerge, Yjs) | Apps that must outlive the vendor's services | Proprietary backends (Firestore, Realm, Ditto) tie the app to one provider | p.221-222 |
| Avoid conflicts by routing all writes for a record through one leader (user "home" region) and by partitioning ID spaces across leaders (one odd, one even); accept that routing breaks down when the designated leader changes | Geo-replicated server systems; autoincrement across two leaders | From one user's view the system is single-leader; distinct ID ranges need no coordination; changing leaders mid-write creates conflicts | p.223-224 |
| Use LWW only when records are inserted with unique keys and never updated, or when lost updates are acceptable | Conflict resolution choice | LWW "randomly" picks a winner among concurrent writes and "silently" discards the rest | p.224 |
| Use logical clocks rather than real-time clocks for LWW timestamps | Any LWW system | A node with a fast clock causes later writes to be ignored | p.224-225 |
| If you keep siblings for manual resolution, prefer automatic merge over asking users, and order merges consistently | CouchDB-style systems | Manual UI is heavy and confusing; concurrent resolutions can create new conflicts (B/C vs C/B) | p.225-226 |
| Use automatic conflict resolution (CRDTs or OT) for text, ordered/unordered collections, counters and key-value maps; aim for strong eventual consistency | Collaborative and offline-first apps | Replicas with the same set of writes converge regardless of arrival order; "conflict resolution is inevitable, and automating it is often the best approach" | p.226-227 |
| Do not expect automatic merging to preserve global constraints (e.g., list of at most five items) | Constraint-bearing data | The only option may be to drop items | p.227 |
| Pick OT for real-time collaborative text editing (Google Docs) and CRDTs for distributed databases (Redis Enterprise, Riak, Cosmos DB); both work for JSON sync engines (Automerge, Yjs vs ShareDB) | Choosing a merge algorithm | Different design philosophies and performance characteristics; advantages can be combined | p.227-228 |
| Treat insert-based conflicts (overlapping room bookings) as conflicts even though no field is overwritten | Booking-style systems | Two inserts that both saw the room as free conflict; checked availability does not prevent it | p.228-229 |
| In leaderless systems, send writes to all n replicas in parallel and require w acknowledgments; send reads to all n and wait for r; tag values with versions and take the highest | Dynamo-style stores (Riak, Cassandra, ScyllaDB) | No failover exists; stale replicas are detected by comparing versions | p.230, p.233 |
| Rely on read repair for frequently read values, hinted handoff for rarely read values, and anti-entropy for the rest | Catching up replicas after outages | Read repair only fixes what is read; anti-entropy copies without order and with delay | p.231 |
| Choose w + r > n for reads that overlap the latest write; a common choice is odd n (3 or 5) and w = r = (n + 1) / 2 rounded up | Quorum configuration | At least one read replica must hold the latest write | p.231-232 |
| Tune away from the default only with eyes open: w = n, r = 1 for read-heavy workloads (one failed node blocks all writes); w + r <= n for lower latency and higher availability when stale reads are tolerable | Quorum tuning | Reads become fast at the cost of write availability; with relaxed quorums requests still go to all nodes but fewer responses are awaited | p.232-233 |
| Never treat quorums as absolute guarantees; use w and r to tune the probability of stale reads | Dynamo-style stores | Edge cases: restore from stale replica, rebalancing, concurrent read/write, partial write failure, clock-based LWW, concurrent writes | p.233-234 |
| Monitor replication lag (leader position minus follower position) and alert; for leaderless systems find some way to quantify "eventual" | Operations | Even if stale reads are tolerated, replication health must be visible | p.234-235 |
| Use leaderless replication where tail latency and gray failures matter; request hedging uses the fastest responses | Latency-sensitive services | No failover decision is needed; slow replicas are simply outvoted | p.235-236 |
| Keep quorums small in practice (seldom more than 4 of 7 or 5 of 9) | Large replica counts | Bigger r or w raises the chance of waiting on a slow replica | p.236 |
| Use sloppy quorums (consistency level ANY) only when a failed write is worse than an unreadable one | Large network interruptions | Any reachable replica accepts the write, but later reads may not see it | p.236 |
| In multi-region leaderless deployments, have the local coordinator forward to one replica per remote region and choose between global, per-region and local quorums | Cassandra and ScyllaDB multi-region | Local quorum avoids slow cross-region waits but returns stale results more often | p.236-237 |
| Define concurrency via happens-before: two operations are concurrent if neither knows about the other, regardless of wall-clock time | Conflict detection | Clocks cannot establish simultaneity; causal dependency is what matters | p.238-239 |
| Require clients to read before writing and to send back the version (causal context) they read, merging all siblings | Leaderless conflict detection | The server overwrites values at or below that version and keeps higher ones as siblings | p.239-240 |
| Use version vectors (dotted version vectors in Riak 2.0), not single version numbers, with multiple replicas; use version vectors rather than vector clocks when comparing replica state | Leaderless multi-replica stores | Per-replica, per-key version numbers distinguish overwrites from concurrent writes and make read-one-write-another safe | p.242 |

## Metrics and numbers

| metric or quantity | definition / how measured | values or thresholds the book gives | caveats | page |
|---|---|---|---|---|
| Replication apply time (normal) | Delay before followers apply a leader's change | "most database systems apply changes to followers in less than a second" | "no guarantee how long it might take" | p.200 |
| Replication lag (degraded) | Follower delay during recovery, near-capacity load or network trouble | "several minutes or more"; "several seconds or even minutes" | Lag is unbounded in principle | p.201, p.209 |
| Semisynchronous guarantee | Number of nodes with an up-to-date copy | At least two: leader plus one synchronous follower | Sync follower is swapped if slow or unavailable | p.201 |
| Majority quorum example | Synchronously updated replicas | 3 out of 5 including the leader | Used by consensus and eventually consistent systems | p.201 |
| Replication log position | Identifier tying a snapshot to the log | PostgreSQL log sequence number; MySQL binlog coordinates or GTIDs | Names vary by database | p.202 |
| Failover detection timeout | Time without response before declaring a leader dead | "say, 30 seconds" | Too short causes needless failovers; too long delays recovery | p.205-206 |
| Tolerable data loss at failover | Writes lost when promoting an async follower | "a fraction of a second's worth of writes may be tolerable"; "several days could be catastrophic" | Pick the follower with the highest log sequence number | p.206 |
| Statement-based replication default | MySQL behavior | Used before version 5.1; now switches to row-based on nondeterminism | VoltDB keeps statement-based with deterministic transactions | p.207 |
| Read-after-write time window | Period after a user's write during which reads go to the leader | One minute after the last update | Alternative: block followers more than one minute behind | p.211 |
| Follower lag cutoff | Maximum lag for a follower to serve reads | More than one minute behind: prevent queries | Requires lag monitoring | p.211 |
| Freshness token for reads | Client-remembered timestamp of last write | Logical timestamp (log sequence number) or system clock | System clock makes clock synchronization critical | p.211 |
| Region / zone structure | Cloud topology | Region = multiple zones; each zone a separate datacenter with own power and cooling | Multi-zone survives zonal, not regional, outages | p.212 |
| Sync engine replication lag | Delay between device replicas | "hours or even days" | Depends on internet access | p.220 |
| UI responsiveness target | Time to reflect input in the next frame | 16 ms at 60 Hz | Needs data locally on the client | p.221 |
| Quorum condition | Relationship between n, w, r | w + r > n | Guarantees overlap of write set and read set in at least one node | p.231 |
| Default quorum sizing | Common configuration | n odd (3 or 5); w = r = (n + 1) / 2 rounded up | Other assignments allowed | p.232 |
| Fault tolerance of quorums | Unavailable nodes tolerated | n = 3, w = 2, r = 2: one node; n = 5, w = 3, r = 3: two nodes; majority quorums tolerate n / 2 rounded down | If w < n writes continue; if r < n reads continue | p.232-233 |
| Read-heavy quorum | Alternative configuration | w = n, r = 1 | One failed node fails all writes | p.232 |
| Relaxed quorum | Configuration with w + r <= n (extraction dropped the "<=" sign) | Fewer responses awaited; lower latency, higher availability | Higher probability of stale reads | p.233 |
| Practical quorum size ceiling | Observed maximums | "seldom more than four out of seven nodes or five out of nine nodes" | Larger quorums increase tail latency | p.236 |
| Replication lag measurement (leader-based) | Leader log position minus follower log position | Exposed as database metrics | Possible because writes are applied in the same order | p.234-235 |
| Staleness health signal (leaderless) | Number of hints stored for handoff | Usable as a health measure | "difficult to interpret usefully" | p.235 |
| Version numbers per key | Incremented on every write to the key | Single-replica algorithm uses one counter per key | Multi-replica needs a version per replica per key (version vector) | p.239, p.242 |
| Consistency guarantees named | Read-after-write (read-your-writes), monotonic reads, consistent prefix reads, eventual consistency, strong eventual consistency, linearizability, serializable transactions | Qualitative definitions | Ordered from weaker to stronger: eventual < monotonic < strong | p.209-215, p.217, p.226 |
| Historical anchors | Origins | Replication principles studied in the 1970s; Dynamo 2007; Lotus Notes sync in the 1980s | - | p.198, p.222, p.229 |

## Failure modes and anti-patterns

| failure mode | cause | consequence | mitigation the book gives | page |
|---|---|---|---|---|
| Accidental deletion propagated | Replication copies every write, including deletes | Data gone on all replicas | Keep backups (snapshots, archived logs) | p.198 |
| Writes blocked by one follower | Synchronous follower crashed or unreachable | "The leader must block all writes" | Semisynchronous: one sync follower, swap on failure | p.201 |
| Whole system halts | All followers synchronous | Any node outage stops writes | Never make all followers synchronous | p.201 |
| Confirmed writes lost | Fully asynchronous replication and unrecoverable leader failure | Writes acknowledged to clients are not durable | Semisync or majority quorum if durability matters | p.201 |
| Inconsistent follower bootstrap | Copying live data files | Snapshot sees different parts at different times, "might not make any sense" | Consistent snapshot tied to a log position | p.202 |
| Leader disk exhaustion or follower unrecoverable | Long-unavailable follower vs log retention | Leader runs out of disk, or follower must be rebuilt from backup | Decide retention policy explicitly | p.204 |
| Catch-up overload | High write throughput or long follower outage | Heavy load on both leader and recovering follower | Plan capacity for catch-up | p.204 |
| Unreplicated writes discarded at failover | Asynchronous replication, new leader elected before receiving all writes | "writes you believed to be committed weren't durable after all" | Promote the most up-to-date follower; sync replication | p.205-206 |
| Primary key reuse (GitHub incident) | Out-of-date MySQL follower promoted; autoincrement counter lagged | Keys reused; MySQL and Redis inconsistent; "private data to be disclosed to the wrong users" | Avoid promoting stale followers; beware external systems keyed on DB counters | p.205 |
| Split brain | Two nodes believe they are leader | Data "lost or corrupted" if both accept writes | Fencing; shutdown of one node, carefully designed | p.205-206 |
| Both leaders shut down | Poorly designed split-brain safety catch | Total outage (GitHub 2012) | Careful design of the fencing mechanism | p.206 |
| Unnecessary failover | Timeout too short during load spike or network glitch | Failover worsens an already struggling system | Longer timeout; manual failover | p.206 |
| Slow recovery | Timeout too long | Long unavailability after real leader failure | Balance the timeout | p.206 |
| Replica divergence with statement-based replication | NOW/RAND, order-dependent updates, autoincrement, triggers and stored procedures | Different values or side effects per replica | Replace nondeterministic calls with fixed values; row-based replication; deterministic transactions | p.206-207 |
| Upgrade downtime | WAL shipping couples replication to storage format | Leader and followers cannot run different versions | Logical replication; upgrade followers first then fail over | p.207-208 |
| User sees own write missing | Read from a lagging follower right after a write | "it looks as though the data they submitted was lost" | Read-after-write consistency techniques | p.210-211 |
| Time appears to go backward | Successive reads from replicas with different lag | Comment appears then disappears | Monotonic reads: pin each user to one replica | p.212-213 |
| Answer before question | Shards replicate at different speeds; no global ordering | Causality violated for observers | Consistent prefix reads; same shard for causally related writes; track dependencies | p.213-214 |
| Hidden lag assumptions | Treating asynchronous replication as synchronous | "a recipe for problems down the line" | Design for lag of minutes or hours, or use stronger guarantees | p.214-215 |
| Error-prone app-level consistency | Hand-coding leader reads and freshness rules | "complex and easy to get wrong" | Use a linearizable, transactional database | p.215 |
| Slow or blocked multi-region writes | Single leader in one region | Every write crosses the internet; inter-region link failure blocks writes | Multi-leader per region | p.217 |
| Constraint violations | Multi-leader processing individually valid writes | Negative balances, duplicate usernames | Single-leader for constraints | p.217 |
| Retrofit pitfalls | Multi-leader added to databases designed for single leader | Autoincrement, trigger and integrity constraint surprises | Avoid if possible; audit features | p.217-218 |
| Replication flow interrupted | Node failure in circular or star topology | Other nodes cannot communicate until manual reconfiguration | All-to-all topology | p.219 |
| Infinite replication loop | Writes forwarded without provenance | Same write cycles forever | Tag writes with node identifiers; drop own | p.218-219 |
| Update before insert | Messages overtake on faster links in all-to-all topology | Update applies to a nonexistent row | Version vectors; not timestamps | p.219-220 |
| Untrustworthy ordering | Clocks assumed synchronized | Wrong causal order at some replicas | Test the database's actual guarantees | p.220 |
| Sync engine overload | User has access to very large data | Cannot download everything in advance | Do not use sync engines for catalog-scale data | p.222 |
| Concurrent conflicting updates | Two leaders change the same field (title A to B and A to C) | Conflict detected only after asynchronous replication | Avoidance, LWW, manual or automatic resolution | p.222-223 |
| Conflict avoidance breaks | Designated leader for a record changes during a write | Conflict appears despite routing | Need a fallback resolution method | p.224 |
| Silent data loss with LWW | Concurrent writes resolved by timestamp | One write randomly wins; others "silently discarded" | Insert-only unique keys, or richer merging | p.224 |
| Later write ignored | LWW with real-time clocks and a fast node clock | Newer write loses to an older one | Logical clocks | p.224-225 |
| Awkward sibling API | Manual resolution returns sets of values | Fields become sets; UI and code complexity; user confusion | Merge automatically where possible | p.225 |
| Deleted items reappear (Amazon cart) | Merging siblings by set union | Removed Book and DVD come back | Track deletions (tombstone-style) in CRDT merge: Cart = {Soap} | p.225-227 |
| Conflict resolution creates conflicts | Multiple nodes resolve concurrently and inconsistently (B/C vs C/B) | "B/C/C/B or something similarly surprising" | Order merges consistently; use convergent algorithms | p.225-226 |
| Constraint cannot be preserved | Concurrent adds exceed a list limit of five | Items must be dropped | Accept the limit of conflict resolution | p.227 |
| Double booking | Two inserts both saw the room as free | Overlapping bookings | No ready-made answer; later chapters | p.228-229 |
| Stale reads after node recovery | Leaderless node missed writes while down | Returns outdated values | Parallel reads with version comparison; read repair; hinted handoff; anti-entropy | p.230-231 |
| All writes fail on one failure | w = n configuration | Single unavailable node blocks writes | Use smaller w | p.232 |
| Quorum broken by restore | Node with new value restored from a stale replica | Fewer than w copies of the new value | Beware operational procedures | p.233 |
| Quorum broken by rebalancing | Nodes disagree which hold the n replicas | Read and write sets no longer overlap | Careful rebalancing (Chapter 7) | p.234 |
| Non-repeatable concurrent read | Read concurrent with a write | One read sees new value, a later read sees old | Linearizability needed (Chapter 10) | p.234 |
| Partial write not rolled back | Write succeeded on fewer than w replicas | Reported as failed yet may be visible later | Accept or use stronger systems | p.234 |
| Writes dropped by clock skew | Cassandra/ScyllaDB real-time LWW | Node with faster clock wins | Logical clocks (Chapter 9) | p.234 |
| Leader bottleneck and failover stalls | Reads from the leader; leader failure or slowness | Read throughput capped; users notice failover; leader slowness hits everyone | Leaderless or read replicas | p.235 |
| Handoff load during strain | Hinted handoff after recovery | Extra load when already under pressure | Monitor hints | p.236 |
| Slow quorums | Large r or w | Higher chance of waiting on a slow replica | Keep quorums small | p.236 |
| Quorum impossible | Large network interruption | Writes fail | Sloppy quorum / consistency level ANY (no read guarantee) | p.236 |
| Stale local quorum reads | Local-region quorum in multi-region Cassandra | More likely to return stale results | Global or per-region quorum | p.237 |
| Permanent inconsistency | Nodes overwrite on receipt with different arrival orders | Node 2 says B, others say A, forever | LWW, manual resolution or CRDTs to converge | p.237 |
| Write ignored as concurrent | Client writes without the version number from a prior read | Write never overwrites anything; becomes another sibling | Always read before write and return the version | p.240 |
| Silent data corruption | Software bugs or hardware errors | Not addressed by basic replication | Flagged as "more insidious" faults for later chapters | p.243 |

## Elicitation questions

1. If a server dies suddenly, how much recently saved data is acceptable to lose: none, a second's worth, minutes? [synchronous vs asynchronous replication; durability] (p.201, p.206)
2. Is it acceptable for the system to stop accepting changes while one copy is unreachable, if that guarantees nothing is lost? [synchronous replication blocking; semisynchronous] (p.201)
3. Where are your users located, and must the service keep working if an entire data center or region goes down? [multi-zone vs multi-region; multi-leader] (p.212, p.216-217)
4. After someone saves something, must they see it immediately when they reload? Also from a second device? [read-after-write; cross-device read-after-write] (p.210-211)
5. Would it be a problem if something a user just saw disappeared on the next refresh and came back later? [monotonic reads] (p.212-213)
6. Are there sequences where order must make sense to observers (question and answer, comment and reply, order and shipment)? [consistent prefix reads] (p.213-214)
7. Which rules must never be broken even for a moment: unique usernames, balances that never go negative, no double booking of a room? [single-leader for constraints; conflict types] (p.217, p.228-229)
8. Must the app keep working with no internet (field work, travel, poor mobile coverage)? For how long, and must changes made offline merge automatically later? [sync engines; offline-first; multi-leader lag of hours or days] (p.220-222)
9. Do several people edit the same record or document at the same time? When they disagree, should the last one win, should the edits be merged, or should someone be asked? [conflict resolution: LWW, automatic (CRDT/OT), manual siblings] (p.222-228)
10. Is it acceptable that some concurrent edits are silently discarded? [last write wins] (p.224)
11. If your software vendor shut down tomorrow, must the app keep working and syncing? [local-first; open sync protocol] (p.221)
12. How much data does one user need on their device? Could all of it be downloaded in advance? [sync engine suitability] (p.222)
13. How fast must the interface react to a user's action: instantly, or is a short wait for the server acceptable? [sync engine; 16 ms next-frame response] (p.221)
14. When the main database server fails, how quickly must service resume, and may a person decide on the switch or must it be automatic? [failover; timeout; manual vs automatic] (p.205-206)
15. Do you generate record IDs with counters, and do other systems (caches, search) store those IDs? [autoincrement reuse incident; conflict avoidance by odd/even IDs] (p.205, p.224)
16. Roughly how many reads versus writes, and could reads grow beyond what one machine can serve? [read scaling with followers; quorum tuning w = n, r = 1] (p.209, p.232)
17. Can you schedule downtime for database software upgrades, or must upgrades be invisible to users? [logical replication vs WAL shipping; zero-downtime upgrade] (p.207-208)
18. How far back must you be able to restore data that was deleted or corrupted by mistake? [backups vs replication] (p.198)
19. Do other systems (data warehouse, search index, caches) need to follow every database change? [change data capture; logical log] (p.208)
20. How much variation in response time can you tolerate; do slow outliers matter? [request hedging; leaderless resilience; gray failures] (p.235-236)
21. Do you need alerts when copies fall behind, and what delay counts as "too stale"? [replication lag monitoring; quantifying "eventual"] (p.234-235)
22. Is it better for a write to be accepted somewhere during a network outage even if it may not be readable right away, or to fail outright? [sloppy quorum; consistency level ANY] (p.236)
23. Are cloud storage and cross-region network costs a constraint? [object storage tiering; inter-zone fees; multi-region bills] (p.203, p.212)
24. Should the team hand-build consistency rules, or would you rather pay for a database that handles them (transactions, strong consistency)? [NewSQL; linearizability] (p.215)

## Verifiable properties

| property | how to test | page |
|---|---|---|
| Replication lag is measured and alerts fire | Export leader position minus follower position; inject lag; assert alert above threshold | p.234-235 |
| Semisynchronous acknowledgment | Block the sync follower; writes stall rather than acknowledge; after swap another follower becomes sync | p.201 |
| New follower bootstraps correctly | Snapshot plus log position; after catch-up follower data matches leader (checksum) while writes continue | p.202 |
| Follower catch-up recovery | Disconnect a follower, write to leader, reconnect; follower applies the backlog and matches | p.204 |
| Most up-to-date follower is promoted | Kill the leader with followers at different log positions; new leader has the highest LSN; measure lost writes | p.205-206 |
| Old leader is fenced | Restart the old leader after failover; it accepts no writes and follows the new leader | p.205-206 |
| Failover timeout behaves as configured | Pause the leader for less than the timeout: no failover; longer: failover | p.205-206 |
| Replication is deterministic | Replicas receiving statements with NOW/RAND or autoincrement produce identical data, or row-based logging is in effect | p.206-207 |
| Mixed-version replication | Follower on a newer software version replicates from an older leader (logical log) | p.207-208 |
| Read-after-write | Write via leader, immediately read via the follower path for the same user; the write is visible | p.210-211 |
| Monotonic reads | Repeated reads by one user never return an older version after a newer one | p.212-213 |
| Consistent prefix reads | Causally dependent writes (question then answer) are never observed in reverse | p.213-214 |
| Lag tolerance | Delay followers by minutes or hours in a test environment; the application degrades acceptably | p.214-215 |
| Loop prevention | In a circular or star topology a write is applied exactly once per node (node ID tags) | p.218-219 |
| Out-of-order delivery handled | Deliver an update before its insert to a leader; final state equals in-order delivery | p.219-220 |
| Convergence (strong eventual consistency) | Apply the same set of concurrent writes in different orders to replicas; all end in identical state | p.226 |
| Shopping cart merge | Concurrent removals of Book and DVD merge to Cart = {Soap}, not a union | p.225-227 |
| Counter merge | Concurrent increments and decrements across siblings sum exactly once | p.227 |
| Text merge | Replicas starting at "ice" with concurrent prepend "n" and append "!" both converge to "nice!" | p.227-228 |
| Quorum configuration invariant | Assert w + r > n in configuration; with n = 3, w = 2, r = 2 one node down still serves reads and writes | p.231-233 |
| Quorum read returns latest write | After a successful write, a quorum read includes at least one replica with the latest version | p.231-233 |
| Below-quorum error | With fewer than w (or r) nodes reachable, writes (or reads) return an error | p.233 |
| Partial write visibility | Fail a write on enough nodes to miss w; observe that the value may still be returned later (document, do not assume rollback) | p.234 |
| Read repair | Read a key whose stale replica lags; the stale replica is updated afterwards | p.231 |
| Hinted handoff | Take a replica down, write, bring it back; hints are delivered and then deleted | p.231 |
| Version-based overwrite rules | Write with version v overwrites values with version <= v and keeps higher ones as siblings; write without version becomes a sibling | p.239-240 |
| Version vectors across replicas | Read from replica A, write to replica B; siblings may form but no write is lost after merge | p.242 |
| Offline edits sync | Make edits while disconnected; on reconnect they reach the server and other devices | p.220 |
| Local read latency | Reads served from local client state render within 16 ms | p.221 |
| Backup restores deleted data | Delete a record; it is gone on all replicas but restorable from backup | p.198 |

## Terms

| term | definition | page |
|---|---|---|
| Replication | Keeping a copy of the same data on multiple networked machines | p.197 |
| Replica | Each node storing a copy of the database | p.198 |
| Leader (primary, source) | Replica that accepts writes and emits the replication log | p.199 |
| Follower (read replica, secondary, hot standby) | Replica applying the leader's log; read-only for clients | p.199 |
| Replication log / change stream | Ordered stream of data changes sent from leader to followers | p.199 |
| Single-leader (leader-based, primary-backup, active/passive) replication | All writes go through one leader per shard | p.199 |
| Synchronous replication | Leader waits for follower confirmation before reporting success | p.200 |
| Asynchronous (nonblocking) replication | Leader sends changes without waiting | p.200 |
| Semisynchronous | One synchronous follower, others asynchronous | p.201 |
| Quorum | Majority (or overlapping subset) of replicas required for an operation | p.201, p.231 |
| Consistent snapshot | Point-in-time copy of the database taken without locking | p.202 |
| Log sequence number / binlog coordinates / GTID | Database-specific replication log positions | p.202 |
| Caught up | Follower has processed the backlog since its snapshot | p.202 |
| Object storage | Cheap, highly durable cloud storage (S3, GCS, Azure Blob) with high latency | p.202-203 |
| Conditional write (CAS) | Object store compare-and-set used for transactions and leader election | p.203 |
| Tiered storage | Hot data on SSD/NVMe/memory, cold data on object storage | p.203 |
| Zero-disk architecture (ZDA) | All data persisted to object storage; disks and memory only cache | p.203 |
| FUSE | Filesystem in userspace used to mount object stores as filesystems | p.203 |
| Catch-up recovery | Follower recovering by replaying missed log entries | p.204 |
| Failover | Promoting a follower to leader and reconfiguring clients and followers | p.204 |
| Split brain | Two nodes both believing they are leader | p.205 |
| Fencing | Limiting or shutting down old leaders to guard against split brain | p.206 |
| Statement-based replication | Forwarding SQL statements to followers | p.206 |
| State machine replication | Executing deterministic statements in a fixed order on every replica | p.207 |
| Write-ahead log (WAL) shipping | Sending the storage engine's physical log to followers | p.207 |
| Logical (row-based) log | Replication log describing row-level changes, decoupled from storage internals | p.208 |
| Change data capture | Feeding database changes to external systems via the logical log | p.208 |
| Read scaling | Adding followers to serve more read requests | p.209 |
| Replication lag | Delay between a write on the leader and its visibility on a follower | p.209 |
| Eventual consistency | Followers eventually catch up if writes stop; deliberately vague | p.209 |
| Read-after-write (read-your-writes) consistency | Users always see their own submitted updates | p.210 |
| Cross-device read-after-write | Read-your-writes across a user's multiple devices | p.211 |
| Region / availability zone | Geographic location of datacenters / one datacenter within it | p.212 |
| Monotonic reads | A user never reads older data after reading newer data | p.212 |
| Consistent prefix reads | Readers see causally ordered writes in the same order | p.214 |
| NewSQL | Distributed databases offering strong consistency and transactions with scalability | p.215 |
| Linearizability | Strong consistency guarantee making replicas look like a single node (Chapter 10) | p.215 |
| Multi-leader (active/active, bidirectional) replication | Several nodes accept writes and forward changes to each other | p.215 |
| Geo-distributed (geo-replicated) | Replicas in several regions | p.216 |
| Replication topology | Communication paths for propagating writes (all-to-all, circular, star, tree) | p.218 |
| Sync engine | Library that captures local changes, syncs them, merges remote changes and updates the UI | p.221 |
| Offline-first | App that lets users keep editing while offline | p.221 |
| Local-first software | Collaborative app that also works if the developer shuts down its services | p.221 |
| Netcode | Game-development equivalent of a sync engine | p.222 |
| Concurrent writes | Writes neither of which was aware of the other when made | p.223 |
| Conflict avoidance | Routing all writes for a record through one leader | p.223 |
| Home region | Region whose leader handles a given user's reads and writes | p.223 |
| Last write wins (LWW) | Keep the write with the greatest timestamp; discard the others | p.224 |
| Siblings | Concurrently written values stored together for later resolution | p.225 |
| Convergence | All replicas with the same writes reach the same state regardless of order | p.226 |
| Strong eventual consistency | Eventual consistency plus a convergence guarantee | p.226 |
| Conflict-free replicated datatype (CRDT) | Datatype with automatic convergent merge, often via unique immutable element IDs | p.227-228 |
| Operational transformation (OT) | Merge technique transforming operation indexes for concurrent operations | p.227-228 |
| Leaderless (Dynamo-style) replication | Any replica accepts writes; clients write and read from several nodes | p.229 |
| Coordinator node | Node forwarding a client's writes in some leaderless systems | p.229 |
| Read repair | Client writes the newest value back to stale replicas it detects on read | p.231 |
| Hinted handoff | A replica stores writes on behalf of an unavailable one and forwards them later | p.231 |
| Anti-entropy | Background process copying missing data between replicas | p.231 |
| Quorum reads and writes | Operations satisfying the r and w thresholds | p.231 |
| n, w, r | Replicas per value, required write acks, required read responses | p.231 |
| Sloppy quorum / consistency level ANY | Any reachable replica may accept a write during partitions | p.236 |
| Request hedging | Using the fastest replica responses to cut tail latency | p.235 |
| Gray failure | Node degraded and slow but not down | p.235 |
| Happens-before | A happens before B if B knows about, depends on, or builds upon A | p.238 |
| Causally dependent | Operation that builds on an earlier one | p.238 |
| Version number | Per-key counter used to detect overwrites vs concurrency | p.239 |
| Version vector | Per-replica, per-key version numbers for multi-replica concurrency detection | p.242 |
| Dotted version vector | Variant used in Riak 2.0 | p.242 |
| Causal context | Riak's string encoding of the version vector returned to clients | p.242 |
| Vector clock | Related but distinct structure; version vectors are right for comparing replica state | p.242 |

## Chapter summary (condensed)

- Replication serves high availability (keeping the system running when a machine, a zone or an entire region goes down) and durability (not losing data even if a whole machine or region fails permanently) (p.243).
- It also serves disconnected operation (working despite a network interruption), latency (data geographically close to users) and scalability (a higher volume of reads than one machine could handle) (p.243).
- Despite the simple concept, replication "turns out to be a remarkably tricky problem": it demands careful thinking about concurrency and faults, at minimum unavailable nodes and network interruptions, not even counting silent data corruption from software bugs or hardware errors (p.243).
- Three approaches: single-leader (all writes to one node, change stream to followers, follower reads may be stale); multi-leader (several leaders accept writes and exchange change streams); leaderless (writes to several nodes, parallel reads to detect and correct stale nodes) (p.243).
- Single-leader is popular because it is "fairly easy to understand and offers strong consistency"; multi-leader and leaderless are more robust to faulty nodes, network interruptions and latency spikes, "at the cost of requiring conflict resolution and providing weaker consistency guarantees" (p.244).
- Synchronous versus asynchronous replication has "a profound effect on the system behavior when there is a fault"; asynchronous is fast when healthy, but you must work out what happens when lag grows and servers fail (p.244).
- If a leader fails and an asynchronously updated follower is promoted, "recently committed data may be lost" (p.244).
- Read-after-write consistency: users should always see data they submitted themselves (p.244).
- Monotonic reads: after seeing data at one point in time, users should not later see data from an earlier point in time (p.244).
- Consistent prefix reads: users should see data in a state that makes causal sense, e.g., a question and its reply in the correct order (p.244).
- Multi-leader and leaderless systems converge by using a version vector or similar algorithm to detect concurrent writes and a conflict resolution algorithm such as a CRDT to merge them; LWW and manual resolution are also possible (p.244).
- The chapter assumed every replica holds the whole database, "unrealistic for large datasets"; Chapter 7 relaxes this with sharding (p.244).

## Second-edition-specific

| topic | what the chapter adds (appears new relative to the first edition) | page |
|---|---|---|
| Backups and Replication sidebar | Replication does not replace backups; archived replication logs as backups; object stores for old snapshots | p.198 |
| Consensus-based single-leader systems | Raft in CockroachDB, TiDB, etcd, RabbitMQ quorum queues; DynamoDB described as single-leader Multi-Paxos, distinct from Dynamo | p.199, p.229 |
| Terminology update | "source" as leader synonym; explicit guidance to avoid master-slave | p.199-200 |
| Log archival tooling | WAL-G and Litestream for snapshot-plus-log backups and follower bootstrap | p.202 |
| Databases Backed by Object Storage sidebar | S3-style conditional writes (CAS) for transactions and leader election; tiered storage; separate low-latency WAL stores (EBS, Neon Safekeepers); zero-disk architecture (WarpStream, Confluent Freight, Bufstream, Redpanda Serverless, Turbopuffer, SlateDB); Parquet and Iceberg integration | p.202-203 |
| Controller-appointed leaders | Leader can be appointed by a controller node (pg_auto_failover reference) in addition to election | p.205 |
| Cross-device read-after-write with multi-region routing | Centralizing last-write metadata; routing all of a user's devices to one region | p.211 |
| Regions and Availability Zones sidebar | Definitions; multi-zone survives zonal outages only; multi-region costs latency, throughput and network bills | p.212 |
| Solutions for Replication Lag | Explicit recommendation to prefer linearizable, transactional (NewSQL) databases over app-level fixes; remaining reasons for weaker replication | p.214-215 |
| Multi-region comparison | Structured single-leader vs multi-leader comparison on performance, regional outage tolerance, network tolerance and consistency; newer products (YugabyteDB, EDB Postgres Distributed, pglogical, Redis Enterprise) | p.216-218 |
| Sync Engines and Local-First Software | New section: devices as leaders, real-time collaboration (Google Docs, Figma, Linear), sync engine definition, offline-first vs local-first, Git as local-first, pros and cons, Lotus Notes history, Firestore/Realm/Ditto vs PouchDB/CouchDB/Automerge/Yjs, netcode | p.220-222 |
| Conflict definition and avoidance detail | "Concurrent" defined by awareness, not wall-clock; home regions; odd/even ID partitioning; avoidance breaking when leaders change | p.223-224 |
| Automatic conflict resolution and strong eventual consistency | Convergence guarantee named; per-datatype merges (text, collections, counters, maps); limits with constraints | p.226-227 |
| CRDT vs OT worked example | "ice" to "nice!" via index transformation (OT) vs unique character IDs (CRDT); Eg-walker combining both; where each is used | p.227-228 |
| Types of conflict | Insert-based conflicts such as overlapping room bookings, pointing to Chapters 8 and 13 | p.228-229 |
| Single-Leader Versus Leaderless Replication Performance | Request hedging, tail latency, gray failures, hinted handoff load, practical quorum ceilings (4 of 7, 5 of 9), sloppy quorum vs consistency level ANY | p.235-236 |
| Multi-Region Operation for leaderless systems | Cassandra/ScyllaDB coordinator forwarding one copy per remote region; global, per-region and local quorum levels; Riak's region-local n with async cross-region replication | p.236-237 |
| Quorum flexibility | Quorums need only overlap, not be majorities (Flexible Paxos reference) | p.233 |
| Version vectors vs vector clocks | Explicit note that they differ and that version vectors are the right tool for comparing replica state | p.242 |
