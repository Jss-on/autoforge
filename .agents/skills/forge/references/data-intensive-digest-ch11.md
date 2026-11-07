<!-- forge reference: a page-cited digest of Designing Data-Intensive Applications, 2nd ed. (Kleppmann & Riccomini, O'Reilly 2026), chapter 11. Written while reading the chapter; every rule, number, failure mode, question and property carries its page. The condensed layer is references/data-intensive-protocol.md (§0-§8); the row-level map is references/data-intensive-book-map.md; this file is the full layer the requirements data round and the build Phase 4 review consult for the chapters a DATA.md group cites. -->

# Digest: Chapter 11 - Batch Processing (DDIA 2nd ed., pp.451-485)

## Thesis

Batch jobs read bounded, read-only input and regenerate output "from scratch every time the job runs" (p.451). Immutable inputs plus side-effect-free output give "human fault tolerance": a buggy run is fixed by rolling back the code and rerunning, or by switching back to retained old output ("time travel"), something read/write databases cannot offer (p.452). Distributed batch frameworks are "distributed operating systems" with a storage layer (DFS or object store), an orchestration layer (schedulers, resource managers, executors, plus workflow schedulers for DAGs) and a computation layer (MapReduce, dataflow engines, SQL and DataFrame front ends) built around the shuffle (p.457, p.481). Throughput is the primary performance measure, and batch fits "wherever there's a lot of data and data freshness isn't important" (p.452, p.476). Derived data goes back to production through streams or bulk loads, never record-at-a-time writes from inside the job (p.479-481).

## Decision rules

| rule | when it applies | why (mechanism) | page |
|---|---|---|---|
| Treat batch inputs as immutable and keep jobs free of side effects such as writing to external databases | every batch job | output is "derived from the input"; enables rerun after a bug, reuse of inputs by other jobs, efficient resource use | p.451-452 |
| Recover from buggy output by rolling back code and rerunning, or by switching back to retained old output ("time travel"), not by patching data in place | buggy job output discovered | object stores and open table formats keep old versions; in a read/write database "rolling back the code will do nothing to fix that data" | p.452 |
| Keep a monitoring job that reads the same inputs and compares the output to the previous run | validating output quality | immutable inputs let several jobs, including checks, read the same files and measure discrepancies | p.452 |
| Choose batch when there is a lot of data and freshness does not matter; do not use it for low-latency needs | batch vs stream | output usable only after the whole job finishes; any input change, "even a single byte", forces full reprocessing; throughput is the primary metric | p.452, p.476 |
| Choose stream processing when changes must be reflected shortly after they happen | batch vs stream | a stream job "continues watching the input" instead of finishing | p.453 |
| Prefer batch frameworks over OLTP databases or application servers for bulk computation | large computations | batch processing via online systems "can be much more expensive in terms of the resources required" | p.452 |
| Start with Unix tools (awk, sed, grep, sort, uniq, xargs) for analyses that fit one machine | data fits a single machine's disk | gigabytes of logs in seconds; many analyses "in a few minutes"; they "perform surprisingly well" | p.455 |
| Use an in-memory hash table when the working set (distinct keys plus counters) fits in memory | small to mid-sized key spaces (roughly 1 GB) | working set depends only on the number of distinct keys, not on event count | p.457 |
| Use sort-based aggregation when the working set exceeds memory | large key spaces | mergesort has sequential access patterns that suit disks; GNU sort spills to disk and parallelizes across cores | p.457 |
| Move to a distributed framework only when data does not fit in memory or on local disk | scale-out decision | Unix tools "run on a single machine"; before that the bottleneck is disk read rate | p.457 |
| Use large blocks in a DFS (HDFS 128 MB, object stores about 4 MB) | petabyte datasets | less metadata to track; lower seek overhead relative to the read | p.458 |
| Put storage behind a pluggable protocol such as the S3 API | choosing storage for batch | "any DFS may be used so long as it implements the protocol" (MinIO, R2, Tigris, B2) | p.459 |
| Prefer shared-nothing DFS or object storage on commodity hardware over NAS/SAN shared-disk | storage architecture | needs only a conventional datacenter network; replication tolerates machine and disk failures | p.459 |
| Use erasure coding (Reed-Solomon) rather than full copies when storage overhead matters | durability on commodity disks | recovers lost data "with lower storage overhead than full replication" | p.459-460 |
| Verify API, performance and consistency behavior before treating an object store as a filesystem | adopting FUSE or S3-as-filesystem | "their APIs, performance, and consistency guarantees are very different" even when APIs look the same | p.460 |
| Do not depend on directories, atomic renames, links or locks in object stores | laying out data on S3-style stores | prefix listing is recursive; empty directories impossible (zero-byte marker objects by convention); renames are copy then delete, per object | p.460-461 |
| Use key-value stores for small, frequent, low-latency values and DFS/object stores for large objects with fewer, larger reads | storage selection | each is optimized for its size and access profile; S3 Express One Zone is starting to blur this | p.461 |
| Accept separated compute and storage (object stores) when independent scaling matters; use data locality (HDFS-style) when task code is smaller than the data and bandwidth is scarce | storage/compute topology | modern networks are fast; decoupling scales CPU and memory independently of storage | p.461 |
| Isolate tasks with cgroups or equivalent | multi-tenant clusters | prevents unauthorized data access and resource interference between tasks | p.462 |
| Expect the centralized resource manager to be a scalability and availability bottleneck; back it with a coordination service (ZooKeeper, etcd) | large clusters | it holds the global view of cluster state | p.462 |
| Add application-specific schedulers (YARN ApplicationMaster, Kubernetes operators) for application-specific policies | e.g. autoscaling read replicas when a query threshold is reached | they work together with the central scheduler | p.463 |
| Avoid naive gang scheduling and unbounded waiting; use heuristic schedulers (FIFO, DRF, priority queues, capacity/quota, bin-packing) | cluster resource allocation | reserving cores idles nodes and risks deadlock; waiting risks starvation; preemption wastes work; optimal allocation is NP-hard | p.463-464 |
| Pass data directly between tasks inside one job (pipes, Spark/Flink task-to-task); write to a DFS or object store between jobs owned by different teams or run on different schedules | structuring workflows | direct passing avoids DFS writes with backpressure; file handoff "decouples the jobs from each other" | p.464-465 |
| Run a consuming job only after all jobs producing its inputs have completed successfully | multi-input jobs | standard workflow-scheduler semantics | p.465 |
| Use a workflow scheduler (Airflow, Dagster, Prefect) rather than the per-job orchestrator scheduler for DAGs | pipelines of many jobs (50-100 common) | YARN and Spark schedulers "do scheduling on a per-job basis" | p.465 |
| Run non-time-sensitive batch jobs on spot or preemptible instances | cost reduction | uses otherwise idle capacity; but tasks get preempted "more frequently than hardware faults" | p.465 |
| Retry at the granularity of individual tasks and delete partial output | task failures in long jobs | rerunning the whole job is wasteful; tasks are kept independent | p.466 |
| Pick an intermediate-data strategy: DFS writes (MapReduce; robust under preemption but many writes), in-memory with lineage recompute (Spark), or periodic checkpoints (Flink) | fault tolerance within a workflow | tradeoff between I/O cost and recomputation | p.466 |
| Keep mappers and reducers stateless, depending only on the data passed in | parallel execution and retry | framework can run calls in parallel and re-call with the same input on another node | p.467-468 |
| In MapReduce, implement a second sort as a second job; prefer dataflow engines so sorting happens only where required | MapReduce vs dataflow | MapReduce always sorts between map and reduce; dataflow engines sort on demand | p.467, p.469 |
| Prefer dataflow engines (Spark, Flink) over raw MapReduce | nearly all new batch jobs | operator fusion, locality, in-memory intermediate state, pipelining, process reuse, built-in joins; raw MapReduce joins must be written "from scratch" | p.468-469 |
| Route mapper output by hash of the key, sort within each partition file, merge at the reducer | distributed grouping | same key lands on the same reducer; merged input is consecutive by key | p.471 |
| Use a sort-merge join with secondary sort for two large sharded datasets | joining fact and dimension tables | reducer holds one dimension record in memory and "never needs to make any requests over the network" | p.472 |
| Use SQL as the default batch language | most ETL and analytics | less code than MapReduce; interactive use; cost-based optimizers choose join algorithms and order | p.473-474 |
| Use programmatic batch frameworks instead of SQL or warehouses for iterative graph algorithms, complex ML, multimodal AI data and row-by-row computation | workload not expressible or inefficient in SQL/columnar | "Row-by-row computation is less efficient when using column-oriented storage formats" | p.475 |
| Run large jobs on Spark/Flink rather than a cloud warehouse when cost dominates; otherwise decide by cost, convenience, ease of implementation, availability | batch system vs warehouse | cloud warehouses "tend to be more expensive than other batch processing systems" | p.475 |
| Expect semantic and performance differences when moving from Pandas to distributed DataFrames | migrating data-science code | local DataFrames are indexed and ordered, distributed ones generally are not; Spark builds a lazy query plan | p.475 |
| Use Arrow as a shared columnar model when mixing client-side and server-side execution | tools like Daft | one data model across both engines | p.475 |
| Rely on scheduler retries for transient ETL failures and on "marked as failed" status for persistent ones | ETL pipelines | mitigates transient issues; shows which job stopped working | p.476 |
| Inspect failed input files, fix the transformation or the upstream job, and rerun | ETL debugging | batch jobs are "easy to troubleshoot and fix" | p.477 |
| Adopt data mesh, data contract or data fabric practices when many teams publish and consume data | organization-wide pipelines | standards and tools to "safely publish their data" | p.477 |
| Pre-aggregate into OLAP cubes or data marts on a schedule; push to Druid or Pinot when real-time OLAP serving is needed | repeated analytical queries | pre-aggregation speeds up queries | p.477 |
| Use fast-executing batch query engines for ad hoc analysis | analysts iterating on questions | response times matter for exploration | p.478 |
| Use batch inference when datasets are large and real-time predictions are not required | ML serving choice | bulk prediction, including test-set evaluation | p.478 |
| Use BSP/Pregel-style frameworks (Giraph, GraphX, Gelly) for graph algorithms | recommendations, ranking | iterate edge traversal "until a metric converges" | p.478-479 |
| Use ML-oriented frameworks (Kubeflow, Flyte, Ray) for LLM data preparation, training, fine-tuning | AI workloads | built-in PyTorch, TensorFlow, XGBoost integrations | p.479 |
| Never write to a production database one record at a time from inside a batch job | serving derived data | orders of magnitude slower; parallel tasks overwhelm the DB; breaks the all-or-nothing guarantee; duplicates on task retry | p.479-480 |
| Push precomputed datasets to a stream (Kafka topic) and let serving systems ingest | serving derived data | sequential writes; buffer and consumer-side throttling; multiple consumers; DMZ security boundary | p.480 |
| Send a job-completion notification and have consumers keep ingested data invisible until it arrives | all-or-nothing through streams | streams alone do not provide the guarantee; behave like "read-committed isolation" | p.480 |
| Build a new database inside the job and bulk-load it (TiDB Lightning, Pinot import, RocksDB SST) for bootstrapping and full swaps | bootstrapping or version swaps | "very fast" and atomic switch between versions; incremental updates are hard | p.481 |
| Use hybrid stores (Venice) when both full swaps and incremental updates are needed | mixed load patterns | supports "batch row-based updates and full dataset swaps" | p.481 |

## Metrics and numbers

| metric or quantity | definition / how measured | values or thresholds the book gives | caveats | page |
|---|---|---|---|---|
| Throughput | data processed per unit of time; primary batch measure | none numeric | online systems measure response time instead | p.452 |
| Response time | primary measure for online systems | none numeric | batch systems do not optimize for it | p.451 |
| Job duration | wall time of one run | "minutes, hours, or even days"; scheduled e.g. once per day | | p.452 |
| Unix pipeline speed | time to analyze log files on one machine | "gigabytes of log files in a matter of seconds" | bottleneck is disk read rate | p.455, p.457 |
| Working set | memory needing random access = distinct keys plus counters | "(say) 1 GB" covers most small to mid-sized sites | independent of event count | p.457 |
| DFS block size | | HDFS 128 MB; JuiceFS and many object stores 4 MB; ext4 4,096 bytes | 900 MB file = seven 128 MB blocks plus one 4 MB block | p.458 |
| Dataset and cluster scale | | petabyte-sized datasets; "many petabytes" on clusters "of over 10,000 machines" | | p.458, p.473 |
| Object size profile | | key-value stores: kilobytes; DFS and object stores: megabytes to gigabytes | | p.461 |
| Object store latency | | S3 Express One Zone "single-millisecond latency", pricing closer to key-value stores | most stores remain large-object oriented | p.461 |
| Scheduling example | | 5 nodes, 160 cores; two jobs each wanting 100 cores | optimal allocation NP-hard | p.463-464 |
| Workflow size | jobs per workflow | "50 to 100 jobs are common" | | p.465 |
| Preemption frequency | | "preemptions occur more frequently than hardware faults" | on low-priority/spot tasks | p.465 |
| Map and reduce task counts | | map tasks = number of input shards; reduce tasks configured by the author | | p.470 |
| Startup overhead | | MapReduce launches a new JVM per task | dataflow engines reuse processes | p.469 |
| Direct per-record write cost | | "orders of magnitude slower" than batch task throughput | even with client-library batching | p.479 |
| Reprocessing cost | | any input change requires reprocessing the entire input | motivates stream processing | p.452 |
| Reference-cited scale | | "Apache Spark @Scale: A 60 TB+ Production Use Case"; "Command-Line Tools Can Be 235x Faster than Your Hadoop Cluster" | reference titles only, not discussed in the body | p.483-484 |

## Failure modes and anti-patterns

| failure mode | cause | consequence | mitigation the book gives | page |
|---|---|---|---|---|
| Bad data persisted by buggy code in a read/write database | in-place mutation | rolling back code does not repair data | batch immutability, time travel, keep old output in another directory | p.452 |
| Whole-input reprocessing on any change | batch model | inefficiency and staleness | stream processing (Chapter 12) | p.452-453 |
| Downstream jobs wait for the whole job to finish | file-based handoff | pipeline latency | dataflow engines start operators as soon as input is ready | p.452, p.469 |
| Out-of-memory aggregation | working set larger than RAM | job fails | sort-based approach that spills to disk | p.457 |
| Object store behaves unlike a filesystem | different APIs, performance, consistency | surprises after adoption | verify behavior before adopting | p.460 |
| Non-atomic rename, directory rename | copy then delete, per object | partial or inconsistent layouts | avoid rename-based protocols; zero-byte marker objects | p.460-461 |
| Resource manager bottleneck | centralized cluster state | scalability and availability limits | coordination service (ZooKeeper, etcd) | p.462 |
| Idle nodes and deadlock under gang scheduling | reserving cores until all are free | utilization drops | heuristic schedulers | p.463 |
| Starvation | other jobs grab cores first | job waits indefinitely | heuristics, priorities | p.463 |
| Wasted work from preemption | killed tasks restart later | lower cluster efficiency | preempt only low-priority work | p.463, p.465 |
| Task failures in long jobs | hardware faults, network interruptions, preemption | partial output | task-level retry; delete partial output | p.465-466 |
| Lost intermediate data | in-memory state (Spark) | recomputation needed | lineage tracking; Flink checkpoints; MapReduce writes to DFS | p.466 |
| Slow MapReduce jobs | file I/O prevents pipelining; JVM per task; sort always | long runtimes | dataflow engines | p.468-469 |
| Hand-written joins in raw MapReduce | low-level API | laborious | higher-level operators and SQL | p.468 |
| Performance surprises after Pandas-to-Spark migration | distributed frames unindexed and unordered; lazy plans | slow or incorrect assumptions | understand the semantic differences | p.475 |
| Inefficient row-by-row work in warehouses | columnar storage | cost and slowness | alternative warehouse APIs or a batch system | p.475 |
| Transformation breaks on missing field | upstream input change | job failure | inspect failed files; fix logic or upstream job; rerun | p.477 |
| Production DB overwhelmed by batch writes | many parallel tasks writing directly | degraded queries, cascading operational problems | push through a stream; downstream throttles its read rate | p.480 |
| Partial or duplicated results visible | external side effects from tasks; retries | inconsistent served data | completion notification; keep data invisible until notified | p.480 |
| Batch environment reaching into production network | direct DB access | security exposure | stream in a DMZ as boundary | p.479-480 |
| Hard incremental updates for bulk-built databases | full-rebuild model | cannot apply small changes | hybrid stores (Venice) | p.481 |
| Spot tasks killed at any moment | higher-priority task arrives | task restarts | use only for non-time-sensitive jobs | p.465 |

## Elicitation questions

- How soon after the data changes must the result be visible: next day, next hour, or within seconds? (batch vs stream)
- How much data is there today and in two years, and does it fit on one machine? (Unix tools vs distributed framework)
- How many distinct things are you counting or grouping by (users, URLs, products)? (sort-based vs in-memory aggregation)
- If a report turns out wrong, do you need to regenerate past results from the original inputs? How long must old inputs and old outputs be kept? (immutability, time travel, retention)
- Who else needs the output of this job, on what schedule, and which team owns them? (workflow DAG, file handoff vs direct task passing)
- Is there a deadline for each run, or can it be delayed if it is cheaper? (spot instances, preemption)
- Who will write and run the analyses: engineers, analysts in SQL, data scientists in notebooks? (SQL vs DataFrame vs programmatic API)
- Does the work involve iterating over a graph, training a model, or processing images, video or audio? (SQL/warehouse vs Spark/Flink/Ray)
- What is the budget, and do you already pay for a cloud warehouse? (batch system vs warehouse)
- Where do results need to appear: a production database, cache, search engine, dashboard? Can users keep seeing the old version while the new one is built? (serving derived data via streams or bulk load)
- Do results change a little each time or get fully recomputed? (incremental vs full-swap loading, hybrid stores)
- Is there a network boundary between the data platform and production systems? (DMZ with a stream as buffer)
- Do jobs need GPUs or special hardware? (orchestrator job request metadata)
- Will the data live in an object store or a filesystem, and does anything rely on renames, appends or file locks? (object store limitations)
- How will we know a run is correct before anyone uses it? Compare with last run? (monitoring jobs, discrepancy checks)
- How many teams publish data others consume, and who is accountable when a field disappears? (data mesh, data contracts)
- Which BI or visualization tools must connect to the results? (SQL connectors)

## Verifiable properties

| property | how to test | page |
|---|---|---|
| Rerunning a job on the same input produces byte-identical output | run twice, diff outputs | p.451-452 |
| Job tasks make no writes to external systems (no side effects) | static scan of job code; block network egress in a test run and confirm success | p.452, p.479 |
| Previous output versions remain readable after a rerun | rerun, then read prior version | p.452 |
| Partial output of a failed task never appears in final output | kill a task mid-run; compare final output with a clean run | p.466 |
| Downstream job does not start until all upstream jobs succeed | fail one upstream; assert downstream did not run | p.465 |
| Persistently failing job is marked failed after bounded retries | inject a persistent fault; check scheduler status | p.476 |
| Job request declares task count, memory, CPU, disk, GPU and code location | inspect submitted job spec | p.461-462 |
| Object layout does not rely on renames or empty directories | lint for rename calls; check for marker objects | p.460-461 |
| Records with the same key always reach the same reducer | property test on partitioning function | p.471 |
| Secondary sort delivers the dimension record before the facts | unit test on reducer input order | p.472 |
| Output pushed to a stream carries a completion marker and consumers hide data until it arrives | integration test: query during load shows old version only | p.480 |
| Bulk-load swap is atomic | concurrent queries during swap see only old or only new version | p.481 |
| Monitoring job flags discrepancies versus previous run | perturb input; expect alert | p.452 |
| Sort-based pipeline runs under a memory cap larger than its working set | run with constrained memory on large input | p.457 |
| Tasks run under resource isolation | exceed a cgroup limit in a task and observe enforcement | p.462 |

## Terms

- online system: request/response system measured by response time (p.451)
- offline system / batch processing job: processes bounded read-only input into output generated from scratch (p.451)
- derived data: output computed from inputs, re-creatable by rerunning (p.451)
- time travel: keeping old output versions to switch back to (p.452)
- human fault tolerance: ability to recover from buggy code by rerunning (p.452)
- throughput: data processed per unit time, primary batch metric (p.452)
- data integration: composing multiple data systems (p.452)
- ETL / ELT: extract, transform, load pipelines into downstream systems (p.453, p.476)
- MapReduce: Google's 2004 batch algorithm, now largely obsolete (p.453)
- dataflow API / DataFrame API: higher-level programming models for batch (p.453)
- working set: memory a job needs random access to (p.457)
- distributed filesystem (DFS): files split into large blocks across machines (p.458)
- data node: daemon serving blocks (HDFS DataNode) (p.458)
- NameNode: Hadoop metadata service (p.459)
- VFS / FUSE / NFS: OS filesystem abstraction and protocols for integrating DFSs (p.459)
- shared-nothing vs shared-disk (NAS, SAN): commodity network storage vs centralized appliances (p.459)
- erasure coding / Reed-Solomon: redundancy with less overhead than replication (p.459-460)
- object store: immutable objects in buckets addressed by key via get/put (p.460)
- bucket / key / prefix list: object store naming and pseudo-directory listing (p.460)
- job orchestrator: distributed equivalent of the OS kernel for running jobs (p.461)
- task executor: per-node daemon (NodeManager, kubelet) running tasks (p.462)
- resource manager: global view of node resources and task status (p.462)
- scheduler: assigns tasks to nodes (p.462)
- cgroups: Linux isolation used by YARN and Kubernetes (p.462)
- ApplicationMaster / operator: application-specific subschedulers (p.463)
- gang scheduling: run a job only when all its resources are available at once (p.463)
- starvation / preemption: never getting resources / being killed for a higher-priority task (p.463)
- FIFO, DRF, bin-packing: scheduling heuristics (p.464)
- workflow / DAG: jobs whose outputs feed other jobs (p.464)
- backpressure: producer blocked when a buffer fills (p.464)
- workflow scheduler: Airflow, Dagster, Prefect managing job dependencies (p.465)
- spot / preemptible instances: cheap low-priority VMs (p.465)
- mapper / reducer: MapReduce callbacks extracting key-values and aggregating per key (p.467)
- input format parser: breaks files into records (p.467)
- dataflow engine: Spark, Flink; treats a whole workflow as one job (p.468)
- shuffle: distributed sort with sharded input and output (p.469)
- secondary sort: ordering values within a key so the dimension record comes first (p.472)
- sort-merge join: join by shuffling on key and merging sorted inputs (p.472)
- fact table / dimension / star schema: analytics schema terms used in the join example (p.471)
- cost-based optimizer: chooses join algorithms and order (p.474)
- Pig, Morel, jq, JMESPath, JSONPath, Gremlin: alternative query languages (p.474)
- data lakehouse: SQL over object store files with table formats (Iceberg) and catalogs (Unity) (p.477)
- data mesh / data contract / data fabric: practices for publishing data across teams (p.477)
- pre-aggregation / OLAP cube / data mart: rolled-up data for fast queries (p.477)
- ad hoc queries: iterative analyst questions where response time matters (p.478)
- feature engineering / model training / batch inference: ML uses of batch (p.478)
- BSP / Pregel model: bulk synchronous parallel graph processing (p.478-479)
- fine-tuning: adjusting a foundation model for a use case (p.479)
- notebook: Jupyter or Hex cells of Markdown, Python, SQL (p.479)
- DMZ: network zone between batch and production environments (p.480)
- bulk import / SST files: loading prebuilt database files (p.481)
- hybrid store: supports both full swaps and row-based updates (Venice) (p.481)
- embarrassingly parallel: transformations that parallelize trivially (p.476)
- Apache Arrow: columnar model shared by client and server engines (p.475)

## Chapter summary (condensed)

The chapter began with the Unix toolchain (awk, sort, uniq) to show the batch primitives of sorting and counting (p.481). Distributed batch frameworks "process immutable, bounded input datasets to produce output data, allowing reruns and debugging without side effects" (p.481). Three components do the work: an orchestration layer deciding where and when jobs run, a storage layer persisting data, and a computation layer processing it (p.481). Distributed filesystems and object stores manage large files through block-based replication, caching and metadata services, exposed to frameworks through pluggable APIs (p.481). Job orchestrators schedule tasks, allocate resources and handle faults; workflow orchestrators manage collections of jobs in a dependency graph (p.481). Processing models progressed from MapReduce's map and reduce functions to dataflow engines such as Spark and Flink with simpler APIs and better performance, all resting on the shuffle, "a foundational operation that enables grouping, joining, and aggregation" (p.481). As operations matured, focus shifted to usability: SQL and DataFrame APIs let the framework decide how to execute efficiently on a cluster (p.481). Common use cases: ETL pipelines via scheduled workflows; analytics with both pre-aggregated and ad hoc queries; machine learning data preparation; and populating production-facing systems from batch outputs, "often via streams or bulk-loading tools" (p.482). The next chapter turns to unbounded inputs, where jobs are never complete; stream and batch are similar in some respects but unboundedness "has a significant impact on how we build systems" (p.482).

## Second-edition-specific

Judgment calls about what appears new relative to the first edition; the book does not label material as new.

- Object stores (S3, GCS, Azure Blob, Swift) as the batch storage layer displacing HDFS, with S3 API compatibility as a pluggable protocol, FUSE mounts, prefix-listing semantics, non-atomic renames, S3 Express One Zone appends and millisecond latency (p.453, p.459-461).
- Distributed job orchestration treated as a topic in its own right: Kubernetes and YARN components (executors, resource manager, scheduler), cgroups, application-specific schedulers, NP-hard resource allocation, DRF and bin-packing heuristics (p.461-464).
- Spot and preemptible instances and the observation that preemption outnumbers hardware faults (p.465).
- Workflow orchestrators Airflow, Dagster, Prefect replacing Oozie and Azkaban; distinction between batch workflows and durable-execution engines (p.453, p.464-465).
- MapReduce described as "largely obsolete and no longer used at Google"; dataflow engines framed as the default; shuffle services such as BigQuery's in-memory shuffle; Daft (p.453, p.469-471).
- DataFrames section: distributed DataFrame semantics, lazy planning in Spark, client/server execution, Apache Arrow (p.475).
- Convergence of batch processing with cloud data warehouses; data lakehouse, Iceberg, Unity catalog, Trino and DuckDB; BigQuery DataFrames and Snowpark (p.474-477).
- Machine learning use cases: feature engineering, training, batch inference, LLM data preparation, Kubeflow, Flyte, Ray (OpenAI's use of Ray), notebooks (Jupyter, Hex) (p.478-479).
- Serving derived data through Kafka topics into Elasticsearch, Pinot, Druid, Venice, ClickHouse; completion notifications; bulk import tools (TiDB Lightning, Pinot import, RocksDB SST); hybrid stores (p.479-481).
- Data mesh, data contracts and data fabric as organizational practices (p.477).
- Newer storage systems named: JuiceFS, DeepSeek 3FS over FoundationDB, Amazon EFS, Archil, MinIO, Cloudflare R2, Tigris, Backblaze B2 (p.458-459).
- Morel as a Pig-influenced language; JSON query languages jq, JMESPath, JSONPath (p.474).
- Updated examples and references through 2025 (NGINX log dated 2025, GNU Coreutils 9.7, payment tracking and demand forecasting case studies) (p.454, p.476, p.483-484).
