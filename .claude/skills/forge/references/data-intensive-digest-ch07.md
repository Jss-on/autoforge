<!-- forge reference: a page-cited digest of Designing Data-Intensive Applications, 2nd ed. (Kleppmann & Riccomini, O'Reilly 2026), chapter 7. Written while reading the chapter; every rule, number, failure mode, question and property carries its page. The condensed layer is references/data-intensive-protocol.md (§0-§8); the row-level map is references/data-intensive-book-map.md; this file is the full layer the requirements data round and the build Phase 4 review consult for the chapters a DATA.md group cites. -->

# DDIA 2nd edition - Chapter 7 "Sharding" - digest

Source: ch07.txt (book pages 251-275; references on p.273-275). Page refs are p.NN.

## Thesis

Sharding splits a dataset so that each record belongs to exactly one shard, so that data volume and write throughput can exceed what a single node handles; it is "a heavyweight solution that is mostly relevant at large scale", and a single-shard database is better while one machine copes (p.251, p.253).
The goal is to spread data and query load evenly and avoid hot spots; this requires a partition-key scheme suited to the data (key range vs hash), a rebalancing approach that moves as little data as possible, request routing that knows the key-to-shard and shard-to-node mapping, and a strategy for secondary indexes (local vs global) (p.255-256, p.271-272).
Every shard "operates mostly independently"; writes that span shards need distributed transactions, which are slower and may bottleneck the whole system (p.253, p.272).
Beyond scalability, the second edition treats sharding as a tool for multitenancy: isolation, per-tenant backup, regulatory compliance and data residency (p.254-255).

## Decision rules

| rule | when it applies | why (mechanism) | page |
|---|---|---|---|
| Shard only when data volume or write throughput exceeds one node; if read throughput is the problem, use read scaling (replication) instead | deciding whether to shard at all | sharding spreads data and writes across nodes; replicas already handle read-heavy load | p.253 |
| Prefer a single-shard database while one machine can cope ("a single machine can do a lot nowadays") | small and medium scale | sharding "adds complexity": partition key choice, misses become "an inefficient search across all shards", and "the sharding scheme is also difficult to change" | p.253 |
| Choose the partition key so that every access path you care about knows it | any sharded design | access is fast if you know the shard; otherwise all shards must be searched | p.253 |
| Expect sharding to fit key-value data well and relational data badly | data model choice | relational data wants secondary-index search and joins across shards | p.253 |
| Avoid writes that must update related records in several shards | schema and transaction design | cross-shard consistency requires a distributed transaction, "usually much slower" and a possible system-wide bottleneck | p.253 |
| Use per-core sharding (one single-threaded process per CPU core) even on one machine when you want CPU parallelism or NUMA locality | in-memory engines like Redis, VoltDB, FoundationDB | spreads load across cores and memory banks close to each CPU | p.254 |
| Use sharding to implement multitenancy: one shard per tenant, or small tenants grouped | SaaS with self-contained per-customer datasets | gives resource isolation, permission isolation, cell-based fault isolation, per-tenant backup and restore, GDPR/CCPA export and deletion, data residency, gradual schema rollout | p.254-255 |
| Apply a cell-based architecture: group the services and storage for a set of tenants into a self-contained cell | multitenant services wanting fault isolation | "a fault in one cell remains limited to that cell" | p.254 |
| Use per-tenant shards only if every tenant fits on one node; otherwise shard within the big tenant as well | tenants of very different sizes | per-tenant sharding "assumes that each individual tenant is small enough to fit on a single node" | p.255 |
| Group many small tenants into bigger shards, but design how to move a tenant to another shard as it grows | many small tenants | one shard per tiny tenant "may incur too much overhead" | p.255 |
| Avoid per-tenant sharding if you need features that connect data across tenants | cross-tenant features | they require joins across shards | p.255 |
| Roll schema migrations out one tenant at a time to reduce risk, knowing it is hard to do transactionally | multitenant sharding | problems are detected before all tenants are affected | p.255 |
| Use key-range sharding when records with nearby keys should be grouped (range scans, concatenated-index lookups) | time series, sorted access | keys are stored sorted in each shard (B-tree or SSTables), so range scans are easy | p.257 |
| Let shard boundaries adapt to the data instead of spacing them evenly | key-range sharding | data is not evenly distributed (encyclopedia volume 1 holds A-B, volume 12 holds T-Z) | p.256 |
| Never use a monotonically increasing value (timestamp) as the first element of the partition key in key-range sharding; prefix it with e.g. sensor ID | write-heavy time series | all current writes land on the shard for "this month" while others sit idle | p.257 |
| Accept that prefixing with sensor ID costs one range query per sensor when fetching many sensors over a time range | after the previous rule | key order becomes sensor ID then timestamp | p.257 |
| Pre-split an empty database when you can predict the key distribution | HBase and MongoDB initial setup | avoids starting with one range; needs knowledge of boundaries | p.257 |
| Split a shard when it reaches a configured size or sustained write throughput; merge adjacent small shards after large deletes | key-range and hash-range sharding | like the top level of a B-tree; a hot shard may be split even if it holds little data | p.257-258 |
| Budget for shard splitting as an expensive, load-amplifying operation | auto-splitting systems | all data is rewritten into new files "similarly to a compaction"; the shard needing a split is often already under high load | p.258 |
| Use hash sharding when key adjacency does not matter (e.g. tenant IDs) | skewed or non-range workloads | a good hash "takes skewed data and makes it uniformly distributed" | p.258 |
| Use a non-cryptographic but process-stable hash (MD5, Murmur3); never Java Object.hashCode() or Ruby Object#hash | hash sharding | language hash functions may give the same key different values in different processes | p.258 |
| Avoid hash(key) mod number-of-nodes | hash sharding | changing N moves most keys between nodes: "very inefficient rebalancing" | p.259 |
| Create a fixed number of shards far larger than the node count (e.g. 1,000 shards on 10 nodes) and move whole shards on rebalance | hash sharding with predictable scale (Citus, Riak, Elasticsearch, Couchbase) | only the shard-to-node assignment changes; moving whole shards is cheaper than splitting | p.259-260 |
| Keep serving reads and writes from the old assignment while a shard transfer is in progress | fixed-shard rebalancing | transferring a large amount of data over the network takes time | p.260 |
| Pick a shard count divisible by many factors | fixed shards | the dataset can be split evenly across various node counts, not only powers of 2 | p.260 |
| Assign more shards to more powerful nodes | mismatched hardware | stronger nodes take a greater share of load | p.260 |
| Do not use fixed shards if dataset size is highly variable or you may need more nodes than shards | uncertain growth | resharding is expensive: every shard split and rewritten, lots of extra disk, sometimes no concurrent writes | p.260 |
| Aim for shards that are "just right" in size | any scheme | very large shards make rebalancing and recovery expensive; very small shards incur overhead | p.260-261 |
| Use hash-range sharding when the shard count cannot be predicted | adaptive scale (YugabyteDB, DynamoDB, MongoDB option) | each shard owns a range of hash values and can be split as needed | p.261-262 |
| Under hash sharding use compound keys: partition key first, sort columns after, so range queries stay inside one shard | need range queries plus even distribution | all records with the same partition key are in the same shard | p.261 |
| Use several hash ranges per node with random boundaries (Cassandra 16, ScyllaDB 256 per node) | Cassandra/ScyllaDB style | imbalances between randomly sized ranges "tend to even out" | p.262-263 |
| Choose a consistent hashing variant (range split vs rendezvous/highest random weight vs jump) depending on whether a new node should take subranges or scattered keys | rebalancing design | all keep keys roughly equal per shard and move as few as possible | p.263 |
| Do not assume uniform key distribution means uniform load | skewed workloads (celebrity user) | request rate and data volume per key vary | p.263 |
| Use range-based shards (key or hash range) so a hot key can be isolated in its own shard or on a dedicated machine | known hot keys | flexible boundaries allow single-key shards | p.264 |
| Split a hot key's writes by appending random digits (two digits = 100 keys), only for the few hot keys, and track which keys are split | write-hot keys | distributes writes, but reads must read all 100 keys and combine; cold keys gain nothing | p.264 |
| Use different strategies for read-hot and write-hot keys and expect hotness to change over time | viral content | random suffix splits only write load; a viral post calms "after a couple of days" | p.264 |
| Prefer a human in the loop (system suggests, admin commits) over fully automatic rebalancing | operations | automatic rebalancing is expensive and unpredictable, and with automatic failure detection can cascade | p.264-265 |
| Rebalance manually ahead of known surges (Cyber Monday, World Cup ticket sales) | predictable events | preemptive capacity avoids rebalancing under peak load | p.265 |
| Pick one routing approach: any node forwards, a routing tier, or shard-aware clients | request routing | each must know key-to-shard and shard-to-node assignment | p.266 |
| Keep shard assignment in a consensus-based coordination service (ZooKeeper, etcd) or built-in Raft (Kafka, YugabyteDB, TiDB, ScyllaDB) | fault-tolerant routing | consensus gives fault tolerance and split-brain protection; routers subscribe to changes | p.267 |
| Accept gossip-based assignment (Riak) only in leaderless databases with weak guarantees | leaderless systems | gossip "is possible to have split brain" | p.267 |
| Use DNS to find the IPs of nodes or the routing tier | routing | these change slowly compared to shard assignment | p.268 |
| Expect analytical databases to query many shards in parallel rather than route to one | OLAP | queries aggregate and join across shards | p.268 |
| Do not hand-roll a secondary index on a key-value store without multi-object transactions | key-value models | race conditions and partial write failures let index and data drift apart | p.269 |
| Use local (document-partitioned) secondary indexes when writes dominate or the partition key is usually known | MongoDB, Riak, Cassandra, Elasticsearch, SolrCloud, VoltDB | a write touches one shard; a full query must hit all shards | p.269-270 |
| If you need only some results, send a local-index query to any single shard; if you know the partition key, query only that shard | local indexes | avoids querying every shard | p.269 |
| Use global (term-partitioned) secondary indexes when read throughput exceeds write throughput and postings lists are short | CockroachDB, TiDB, YugabyteDB, DynamoDB | a single-condition query reads one index shard; writes may hit many index shards | p.270-271 |
| Shard the global index by term (range or hash), independently of the primary key | global indexes | the term is the index's partition key | p.270-271 |
| Update global index shards with a distributed transaction, or accept stale reads from asynchronous updates (DynamoDB) | global index write path | one record write can touch many index shards | p.271 |
| Beware multi-term AND queries on a global index with long postings lists | multi-condition search | intersecting long lists across the network is slow | p.271 |
| Treat the sharding scheme and the replication scheme as independent choices; each shard has one leader and followers on other nodes | architecture | each node leads some shards and follows others | p.251, p.253 |

## Metrics and numbers

| metric or quantity | definition / how measured | values or thresholds the book gives | caveats | page |
|---|---|---|---|---|
| Ideal scale-out factor | capacity of N nodes vs one node | 10 nodes handle 10x data and 10x read/write throughput "in theory" | ignores replication; assumes every node takes a fair share | p.255 |
| Extreme skew | load concentration on one shard | all load on one shard, "9 out of 10 nodes are idle" | bottleneck is the single busy node | p.256 |
| HBase default split size | shard size that triggers an automatic split | 10 GB | other systems also split on persistent write throughput | p.258 |
| Hash output range | 32-bit hash function | 0 to 2^32 - 1 | need not be cryptographic; must be stable across processes | p.258 |
| Fixed-shard example | shards per node | 1,000 shards on 10 nodes = 100 per node; shard = hash(key) % 1,000 | cannot have more nodes than shards | p.259-260 |
| 16-bit hash example | hash-range buckets | 0 to 65,535; 16,384 values per shard in Figure 7-5 | real hashes are 32 bits or more | p.261 |
| Cassandra ranges per node | default token ranges per node | 16 | random boundaries; imbalances even out | p.262-263 |
| ScyllaDB ranges per node | default | 256 | same mechanism | p.263 |
| Figure 7-6 illustration | hash space and ranges | 0 to 1024, 3 ranges per node | illustrative only | p.262 |
| Hot-key random suffix | digits appended to key | two digits spread writes over 100 keys | reads must read all 100 and combine | p.264 |
| Hot-key duration | how long a viral key stays hot | "a couple of days" | then likely calms down | p.264 |
| DynamoDB autoscaling | time to add or remove shards | "within a matter of minutes" | "promoted as", i.e. vendor claim | p.265 |
| Encyclopedia key ranges | example of adaptive boundaries | 12 volumes; volume 1 = A-B, volume 12 = T-Z | boundaries must adapt to data | p.256 |
| Shard transfer time | duration of moving a shard | "takes some time to transfer a large amount of data over the network" | old assignment serves meanwhile | p.260 |
| Split cost | data rewritten on split | all of the shard's data rewritten to new files, like compaction | exacerbates load on a hot shard | p.258 |
| Resharding cost | changing a fixed shard count | each shard split and written out; "a lot of additional disk space"; some systems forbid concurrent writes | downtime risk | p.260 |
| Postings list length | size of the ID list per term | "short" lists fine; "long" lists slow to intersect over the network | no numeric threshold | p.271 |
| Tail latency amplification | latency of scatter/gather queries | prone to it even when shards are queried in parallel | cross-reference to response-time metrics in Chapter 2 | p.270 |
| Query throughput with local index | throughput vs number of shards | adding shards stores more data but "doesn't increase your query throughput" | every shard processes every query | p.270 |
| Celebrity load | followers of a hot user | "millions of followers" cause a storm of reads and writes to one key | reference title cites 3% of Twitter servers for one user | p.263, p.274 |
| Nodes vs shards | constraint of fixed-shard scheme | nodes <= shards | otherwise resharding | p.260 |
| Rebalancing under write load | shard splitting vs incoming writes | near maximum write throughput, splitting "might not even be able to keep up" | argues for human in the loop | p.265 |
| PostgreSQL partitioning vs sharding | terminology | partition = files on one machine; shard = across machines | other systems use the words interchangeably | p.252 |

## Failure modes and anti-patterns

| failure mode | cause | consequence | mitigation the book gives | page |
|---|---|---|---|---|
| Skewed shards | unfair data or load distribution | some nodes overloaded, others idle; sharding "much less effective" | choose scheme adapted to data; rebalance; hash skewed keys | p.255-256 |
| Hot shard from monotonic key | timestamp as first key element under key-range sharding | all writes hit the current time range | prefix key with sensor ID or similar | p.257 |
| Hot key | celebrity user or viral post | storm of reads and writes to one key | isolate key in own shard or machine; random suffix for writes; automated heat management | p.263-264 |
| Random-suffix read amplification | splitting a hot key into 100 keys | reads must fetch and combine all 100; extra bookkeeping | apply only to the few hot keys; track which keys are split | p.264 |
| Mod-N rebalancing churn | hash(key) % number of nodes | most keys move when N changes | fixed number of shards or consistent hashing | p.259 |
| Nondeterministic hash | Java Object.hashCode(), Ruby Object#hash | same key routed differently in different processes | use MD5, Murmur3 or similar | p.258 |
| Wrong fixed shard count | scale outgrows shards or dataset size varies widely | expensive resharding, extra disk, possible downtime | estimate well up front, or use adaptive hash-range sharding | p.260-261 |
| Shards too large or too small | fixed count with variable data | large: expensive rebalancing and recovery; small: overhead | keep shards "just right"; adaptive splitting | p.260-261 |
| Split of a hot shard | shard needing split is already under load | split cost risks overloading it | manual or carefully throttled splitting | p.258 |
| Automatic rebalancing overload | moving large data plus rerouting | network or node overload; harms other requests; splitting cannot keep up with writes | human in the loop; preemptive manual rebalancing | p.265 |
| Cascading failure | automatic rebalancing plus false failure detection on a slow node | load moved onto other nodes, which are then also suspected dead | human in the loop | p.265 |
| Split brain in shard assignment | coordinator failover without consensus, or gossip protocols | two coordinators or cluster parts disagree on shard ownership | consensus-based coordination service or built-in Raft | p.266-267 |
| In-flight requests during cutover | shard moves while old requests still pending | requests to old node after new node took over | routing must handle the cutover period | p.267 |
| Scatter/gather on local index | query without partition key | all shards queried; tail latency amplification; throughput does not scale with shards | know partition key, accept partial results, or use global index | p.269-270 |
| Global index write complexity | one record write touches many index shards | index out of sync with data | distributed transaction, or async updates with stale reads | p.271 |
| Stale global index reads | asynchronous index maintenance (DynamoDB) | reads may be out of date | similar to replication lag handling | p.271 |
| Long postings-list intersection | multi-term AND on a term-partitioned index | slow network transfer to compute intersection | keep postings lists short; favor global index for single-condition reads | p.271 |
| Hand-rolled secondary index drift | application-maintained value-to-ID map on key-value store | race conditions and partial failures desync index | multi-object transactions | p.269 |
| Cross-shard writes | related records in different shards | needs distributed transaction, much slower, system bottleneck | choose partition key so related data co-locates | p.253 |
| Oversized tenant | one tenant too big for a node under per-tenant sharding | tenant must be sharded internally | shard within tenant for scalability | p.255 |
| Too many tiny tenants | separate shard per tenant | overhead | group tenants into shards; plan migration as they grow | p.255 |
| Cross-tenant joins | features connecting tenants under per-tenant sharding | hard to implement across shards | avoid per-tenant sharding if such features are central | p.255 |
| Permission bug leaks tenant data | shared storage across tenants | one tenant sees another's data | physical separation per tenant limits blast radius | p.254 |
| Schema migration across tenants | gradual rollout | hard to do transactionally | roll out one tenant at a time to limit risk | p.255 |
| Inefficient range queries | hash sharding scatters consecutive keys | range over partition key hits all shards | compound key with partition key first | p.261 |
| Hot analytical queries misrouted | treating OLAP like OLTP routing | analytical queries need parallel multi-shard execution | different query execution (Chapter 11) | p.268 |

## Elicitation questions

| question (client language) | concept it decides |
|---|---|
| How much data and how many writes per second do you expect today and in two or three years? Could one large server handle it? | whether to shard at all (p.253) |
| Is the pressure on reading or on writing? | read replicas vs sharding (p.253) |
| What is the natural grouping of your records (customer, device, user, order)? Do you always know that grouping when you look something up? | partition key choice (p.253, p.255) |
| Do you need to fetch consecutive items, like all readings from one month or all events in a time window? | key-range vs hash sharding (p.257, p.261) |
| Are there a few customers, products or accounts that get vastly more traffic than the rest? Could a sudden event make one item go viral? | hot keys and skew (p.263-264) |
| Will growth be steady or spiky and unpredictable? Are there known peak events (sales, ticket releases)? | fixed vs adaptive shard count; manual preemptive rebalancing (p.260-261, p.265) |
| Are your customers separate businesses whose data must never mix? Is any one customer huge, or are there thousands of tiny ones? | sharding for multitenancy (p.254-255) |
| Do you need to restore one customer's data without touching others? | per-tenant backup and restore (p.254) |
| Must you delete or export a person's data on request, or keep certain customers' data in a specific country? | regulatory compliance and data residency (p.255) |
| Do you want to try changes on a few customers first before everyone? | gradual schema rollout (p.255) |
| Do you need reports or features that combine data across all customers? | cross-tenant joins (p.255) |
| Besides lookup by ID, what searches will users run (filter by attribute, full text)? Do they need all matches or only the first few? | local vs global secondary indexes (p.269-271) |
| Is searching or writing heavier in your workload? Do searches combine several conditions at once? | global index suitability, postings-list intersection (p.271) |
| Is it acceptable if search results lag a few seconds behind the latest writes? | asynchronous global index (p.271) |
| Does one user action need to change several records that belong to different customers or groups at once? | cross-shard writes and distributed transactions (p.253) |
| Do you have operations staff to approve data moves, or do you want the system to rebalance itself? How do you feel about operational surprises? | automatic vs manual rebalancing (p.264-265) |
| Is scheduled downtime acceptable if we ever need to change how data is split? | resharding cost of fixed shards (p.260) |
| Will you run heavy reports that scan everything? | analytical vs OLTP query routing (p.268) |
| Are your servers all the same size? | weighted shard assignment (p.260) |

## Verifiable properties

| property | how to test | page |
|---|---|---|
| Every record maps to exactly one shard | for a sample of keys, the routing function returns one shard; the same key never maps to two shards | p.251 |
| Hash function is stable across processes and restarts | compute hashes of the same keys in two separate processes and after restart; assert equality | p.258 |
| Data and load are balanced within tolerance | load synthetic keys; measure records and requests per shard; assert max/mean ratio below a threshold | p.255-256 |
| Adding a node moves a minimal fraction of keys | compute key-to-node mapping before and after adding a node; assert roughly 1/N of keys moved, not most | p.259, p.263 |
| No hot shard under time-ordered writes | benchmark inserts keyed by timestamp (or sensor ID + timestamp); assert write rate per shard is spread, not concentrated on one | p.257 |
| Shard splits at the configured threshold | grow a shard past the configured size (e.g. 10 GB) or write rate; assert a split occurs and both halves are contiguous subranges | p.257-258 |
| Shard count is divisible by many factors; nodes never exceed shards | unit check on configuration | p.260 |
| Range query within one partition key touches one shard | trace shards contacted for a query on (partition key, sort-key range); assert one | p.261 |
| Routing updates propagate on reassignment | change an assignment in the coordination service; assert routing tier or client observes the new mapping | p.267 |
| No split brain in assignment | partition the coordinator; assert no two nodes are simultaneously accepted as owner of the same shard | p.266-267 |
| Writes during shard move are not lost | move a shard under continuous writes; assert all acknowledged writes are readable afterwards | p.260, p.267 |
| Local index: a write touches one shard; a full secondary query touches all shards | count shards contacted per operation | p.269 |
| Global index: single-term query touches one index shard; after a write, every affected term shard is updated (or converges within a bound if asynchronous) | write a record with several indexed terms; query each term; measure staleness window | p.270-271 |
| Secondary index stays consistent under failure | inject failure after primary write and before index update; assert index and data match or are repaired | p.269 |
| Tenant isolation | tenant A's credentials cannot read tenant B's shard; restoring tenant A's backup leaves tenant B unchanged | p.254 |
| Hot-key splitting preserves correctness | write via 100 suffixed keys; read path aggregates to the same total as a single-key baseline | p.264 |
| Throughput sustained during rebalancing | run write load at a fixed rate during a rebalance; assert no error spike and no backlog growth | p.265 |
| Manual rebalancing requires explicit commit | with human-in-the-loop mode, assert suggested assignment does not take effect until an administrator commits it | p.264 |

## Terms

| term | one-line definition |
|---|---|
| Shard / partition | a subset of the data such that each record belongs to exactly one; called partition, range, region, vBucket, vnode, token-range or tablet depending on the system (p.251-252) |
| Partition key | the record attribute (key or first part of the key, or a column) that determines which shard holds the record (p.253, p.256) |
| Skew | unfair sharding where some shards have more data or queries than others (p.255) |
| Hot shard / hot spot | a shard with disproportionately high load (p.256) |
| Hot key | a single key with particularly high load, e.g. a celebrity (p.256) |
| Key-range sharding | assigning a contiguous range of partition keys to each shard, keys stored sorted (p.256-257) |
| Pre-splitting | configuring an initial set of shards on an empty database (p.257) |
| Shard split / merge | dividing a shard into subranges when too big or hot; merging adjacent small shards (p.257-258) |
| Hash sharding | hashing the partition key before mapping it to a shard (p.258) |
| Hash mod N | assigning shard = hash(key) % number of nodes; rebalances badly (p.258-259) |
| Fixed number of shards | creating many more shards than nodes and moving whole shards between nodes (p.259) |
| Hash-range sharding | each shard owns a contiguous range of hash values, split as needed (p.261) |
| Consistent hashing | hash-to-shard mapping with roughly equal keys per shard and minimal key movement when shard count changes; unrelated to replica or ACID consistency (p.263) |
| Rendezvous (highest random weight) hashing, jump consistent hashing | consistent hashing variants where a new node receives individual keys scattered from all others (p.263) |
| Rebalancing | redistributing shards or load when nodes are added or removed (p.255) |
| Resharding | changing the number of shards; expensive (p.260) |
| Heat management / adaptive capacity | Amazon's automated handling of hot shards (S3, DynamoDB) (p.264) |
| Request routing | determining which node (IP and port) serves a given key; akin to service discovery (p.265) |
| Routing tier | a shard-aware load balancer that forwards requests but handles none itself (p.266) |
| Coordination service | ZooKeeper or etcd holding the authoritative shard-to-node map via consensus (p.267) |
| Split brain | two coordinators or cluster parts making contradictory shard assignments (p.266-267) |
| Gossip protocol | node-to-node dissemination of cluster state with weak consistency (Riak) (p.267) |
| Cutover period | the window during a shard move when requests to the old node may still be in flight (p.267) |
| Multitenancy / tenant | a customer with a self-contained dataset in a SaaS product (p.254) |
| Cell-based architecture | services and storage for a set of tenants grouped into an independently running cell (p.254) |
| Data residency | requirement that a tenant's data be stored in a particular jurisdiction (p.255) |
| Secondary index | an index for searching occurrences of a value rather than identifying a record uniquely (p.268) |
| Local secondary index (document-partitioned) | each shard indexes only its own records (p.268-269) |
| Global secondary index (term-partitioned) | an index covering all shards, itself sharded by the indexed value (p.270) |
| Term | any value you can search for in a secondary index, generalized from full-text search (p.270) |
| Postings list | the list of record IDs under one index entry (p.269) |
| Tail latency amplification | a parallel query being as slow as its slowest shard (p.270) |
| Cluster columns / micro-partitions | data warehouse terms (BigQuery, Snowflake) for sort order within a partition and automatic partition assignment (p.262) |
| NUMA | nonuniform memory access, where some memory banks are closer to one CPU (p.254) |
| Horizontal scaling / scale-out | growing capacity by adding more smaller machines (p.253) |
| Network partition (netsplit) | a network fault between nodes; unrelated to data partitioning (p.252) |

## Chapter summary (condensed)

Sharding is necessary when data is too large to store and process on one machine (p.271).
The goal is to spread data and query load evenly across machines and avoid hot spots, which requires a sharding scheme appropriate to the data plus rebalancing when nodes are added or removed (p.271).
Key-range sharding: keys are sorted and a shard owns a min-to-max range; efficient range queries, but hot spots if the application accesses nearby keys; rebalanced by splitting a range when a shard gets too big (p.271-272).
Hash sharding: a hash is applied to each key and a shard owns a range of hash values (or another consistent hashing algorithm maps hashes to shards); destroys key ordering so range queries are inefficient, but distributes load more evenly (p.272).
With hash sharding it is common to create a fixed number of shards in advance, assign several to each node, and move whole shards when nodes change; splitting is also possible (p.272).
It is common to use the first part of the key as the partition key and sort records within the shard by the rest, keeping efficient range queries among records sharing a partition key (p.272).
Request routing sends queries to the right shard, often using a coordination service to track shard-to-node assignment (p.272).
Secondary indexes must be sharded too. Local secondary indexes live in the same shard as the primary data: one shard updated per write, but a lookup reads all shards (p.272).
Global secondary indexes are sharded separately by indexed value: a write may update several index shards, but a postings-list read is served from one shard (fetching the records still needs several shards) (p.272).
Every shard operates mostly independently, which is what lets a sharded database scale; operations that write to several shards are problematic (one succeeds, another fails), which the following chapters address (p.272).

## Second-edition-specific

| material that looks new vs the first edition | page |
|---|---|
| "Sharding and Partitioning" sidebar: cross-system terminology (Kafka partition, CockroachDB range, HBase/TiDB region, Couchbase vBucket, Riak vnode, Cassandra token-range, Bigtable/YugabyteDB/ScyllaDB tablet) and the PostgreSQL partitioning-vs-sharding distinction; "shard" etymology from Ultima Online | p.252 |
| Sharding within a single machine, one process per core, NUMA (Redis, VoltDB, FoundationDB) | p.254 |
| Whole section "Sharding for Multitenancy": resource and permission isolation, cell-based architecture, per-tenant backup/restore, GDPR/CCPA, data residency, gradual schema rollout, and the three challenges (oversized tenant, tiny tenants, cross-tenant joins); Citus schema-based sharding and pg_karnak references | p.254-255 |
| Hot-shard splitting triggered by write throughput, not only size; shard count adapting to data volume | p.258 |
| Explicit "Sharding by hash range" subsection and the Cassandra/ScyllaDB multiple-random-ranges variant with per-node counts (16, 256) | p.261-263 |
| Data warehouse sidebar: BigQuery partition key and cluster columns, Snowflake micro-partitions and cluster keys, Delta Lake | p.262 |
| Consistent hashing variants named: highest random weight (rendezvous) and jump consistent hashing | p.263 |
| Amazon "heat management" and "adaptive capacity" as automated hot-shard handling | p.264 |
| Cascading-failure warning for automatic rebalancing combined with failure detection; DynamoDB minute-scale autoscaling; preemptive manual rebalancing for known events | p.265 |
| Routing coordination via built-in Raft (Kafka, YugabyteDB, TiDB, ScyllaDB), Kubernetes etcd, and the split-brain caveat for gossip (Riak) | p.267 |
| Pointer to Chapter 11 for parallel query execution in analytical sharded databases | p.268 |
| Global secondary indexes in CockroachDB, TiDB, YugabyteDB and DynamoDB (asynchronous, stale reads); guidance to use them when reads exceed writes and postings lists are short | p.271 |
| Industry references: Notion sharding Postgres, Slack Vitess, Facebook Shard Manager, S3 heat management, ScyllaDB Raft topology changes | p.273-275 |
