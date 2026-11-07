<!-- forge reference: a page-cited digest of Designing Data-Intensive Applications, 2nd ed. (Kleppmann & Riccomini, O'Reilly 2026), chapter 1. Written while reading the chapter; every rule, number, failure mode, question and property carries its page. The condensed layer is references/data-intensive-protocol.md (§0-§8); the row-level map is references/data-intensive-book-map.md; this file is the full layer the requirements data round and the build Phase 4 review consult for the chapters a DATA.md group cites. -->

# Digest: Chapter 1 - Trade-Offs in Data Systems Architecture

Source: Kleppmann and Riccomini, Designing Data-Intensive Applications, 2nd ed. (O'Reilly 2026), pp. 1-31.

## Thesis

"There are no solutions; there are only trade-offs" (Sowell epigraph, p.1). An application is data-intensive when data management - storing and processing large volumes, managing change, keeping consistency under failures and concurrency, staying highly available - is a primary challenge (p.1). Such applications are glued together from standard building blocks (databases, caches, search indexes, stream and batch processing), and the hard problem is choosing and combining them: "no one approach is fundamentally better than others; everything has pros and cons" (p.2). The chapter frames four axes of choice - operational vs analytical systems, cloud vs self-hosting, distributed vs single-node, business needs vs the rights of the people in the data - and fixes the vocabulary (OLTP/OLAP, warehouse/lake, system of record vs derived data, cloud native, microservices/serverless) used by the rest of the book (p.3). The goal is to "ask the right questions to evaluate and compare data systems" for your particular application (p.2).

## Decision rules

| rule | when it applies | why (mechanism) | page |
|---|---|---|---|
| Treat an application as data-intensive (and reason with this book) when data management - volume, change, consistency under failure/concurrency, availability - is a primary challenge | Any new application | Compute-intensive systems face a different problem: "parallelizing a very large computation" | p.1 |
| Stay on a single machine (even a spreadsheet) while data fits; distribute only as data volume or query rate grows | Small data, low query rate | Distribution "introduces many challenges"; small data "is often fairly easy to deal with" | p.1-2 |
| Build from standard building blocks (databases, caches, search indexes, stream processing, batch processing) glued together with application code | Commonly needed functionality | Easy when you use a system for what it was designed; hard when "a single tool cannot do alone" what you need | p.2 |
| Make each team's goals for a shared dataset explicit | Several teams, one dataset | Unarticulated goals "lead to misunderstandings and disagreement about the right approach" | p.2 |
| Keep backend application code stateless; persist cross-request state on the client or in server-side data infrastructure | Backend services over HTTP/WebSocket | Stateless code "forgets everything about that request" once handled | p.3 |
| Separate operational (OLTP) systems, where data is created and modified, from analytical (OLAP) systems holding a read-only copy | Analysts and data scientists need the data | Different access patterns, audiences, data represented (latest state vs history), and dataset sizes | p.4-6 |
| Do not let end users of operational systems run custom SQL; bake a fixed query set into application code, with one-off queries only for maintenance | OLTP systems | Custom SQL could "read or modify data that they do not have permission to access" and run expensive queries that hurt other users | p.6 |
| Give analysts the freedom to write arbitrary SQL or generate it from BI tools (Tableau, Looker, Power BI) | Analytical databases | Ad-hoc exploration is the purpose of OLAP | p.6 |
| Use product/real-time analytics systems (Pinot, Druid, ClickHouse) when aggregate queries are embedded in a user-facing product | Low-latency analytics inside a product | They "ingest data in real time and are optimized for low-latency query responses", unlike traditional OLAP (batch ingest, high throughput) | p.6 |
| Do not run analytics directly on OLTP databases; build a separate data warehouse fed by ETL | Enterprise with many OLTP systems | Data silos; OLTP schemas poorly suited to analytics; expensive queries impact OLTP users; OLTP may sit on a restricted network | p.7 |
| Choose between ETL and ELT (transform inside the warehouse after loading) | Loading the warehouse | The order of transform and load can be swapped | p.7 |
| Use specialist connector services (Fivetran, Singer, Airbyte) to pull data from external SaaS products (CRM, email marketing, card processing) | Source reachable only via a vendor API | Enables "analyses that are not possible via the SaaS API" | p.8 |
| Treat HTAP as a complement to the warehouse, not a replacement; use it when one application needs both large scans and low-latency single-record reads/writes (e.g., fraud detection) | Mixed workload in one application | Many HTAP systems are internally "an OLTP system coupled with a separate analytical system"; the enterprise still needs one warehouse to combine sources | p.8-9 |
| Give each operational system its own database, but keep a single enterprise data warehouse | Enterprise architecture | Operational independence vs analysts' need to "combine data from several operational systems in a single query" | p.8-9 |
| Expect to adopt more specialized systems as scale grows; general-purpose systems suffice for small volumes | Growing scale | "the greater the scale, the more specialized systems tend to become" | p.9 |
| Provide a data lake (files in any format, typically on object storage) when data scientists need raw, non-relational data: feature vectors, text, images, video, sensor readings, genomes | ML, NLP, computer vision work | Feature engineering "commonly requires custom code that is difficult to express using SQL"; data scientists prefer Pandas, scikit-learn, R, Spark; object stores are cheaper than relational storage | p.9-10 |
| Keep data raw in the lake and let each consumer transform it ("sushi principle: raw data is better") | Pipelines with many consumers | "each consumer of the data can transform the raw data into the form that best suits their needs" | p.10 |
| Use stream processing when analytics must react within seconds (e.g., blocking fraud or abuse); periodic file reruns suffice for daily cadence | Time-sensitive analytics | Streams let analytical systems respond "on the order of seconds" vs daily reruns | p.10 |
| Push analytical outputs (trained ML models, recommendations) back into operational systems via reverse ETL and tools such as TFX, Kubeflow, MLflow | Data-driven product features | A model trained in the analytical system must be deployed to production to serve users | p.10 |
| Designate one system of record (source of truth) per fact; on discrepancy it is correct "by definition"; represent each fact exactly once (normalized) | Any multi-system architecture | Gives an authoritative source and clarifies the flow of data | p.11 |
| Treat caches, indexes, materialized views, denormalized values, transformed representations, and trained models as derived data that can be re-created from the source | Read-performance optimizations | Derived data is redundant but "often essential for getting good performance on read queries"; losing it is recoverable | p.11 |
| Be explicit about which data is derived from which; the distinction depends on how you use a tool, not on the tool | Architecture documentation | "A database is just a tool"; clarity about derivation "can bring clarity to an otherwise confusing system architecture" | p.11 |
| Establish a process (data pipeline) for updating derived data when the system of record changes | Multiple systems | Many databases assume "your application will always need to use only that one database" and do not help propagate updates | p.11 |
| Build in-house what is a core competency or competitive advantage; buy or outsource what is non-core, routine, or commonplace | Build vs buy | Business-priority rule of thumb; "most companies do not fabricate their own CPUs" | p.12 |
| Self-host when you already know how to set up and operate the system and load is predictable | Experienced team, steady load | "it's often cheaper to buy your own machines and run the software on them yourself" | p.13 |
| Adopt a cloud service when you do not know how to deploy and operate the system | Unfamiliar technology | Hiring and training staff "can get very expensive"; outsourcing basic sysadmin frees the team for higher-level concerns | p.13 |
| Self-host when you must configure and tune for your particular workload | Specialized workload | A cloud service "would not likely be willing to make such customizations on your behalf" | p.13 |
| Prefer cloud when load varies a lot over time; expect smaller benefit for small datasets | Bursty load; large interactive analytics | Provisioning for peak leaves resources idle; cloud lets you "return unused resources to the provider" | p.13 |
| Enqueue and schedule predefined queries (daily reports) to smooth analytical load | Scheduled reporting | Smooths demand; interactive queries remain inherently variable ("the faster you want them to complete, the more variable the workload") | p.13 |
| Keep in-house systems for specialist requirements (high-frequency trading needing full hardware control) and for older systems that predate the cloud | Latency-critical or legacy | Existing cloud services cannot meet these needs | p.14 |
| Prefer services with compatible or standard APIs to limit vendor lock-in | Choosing cloud services | If the vendor shuts down, raises prices, or changes the product, "you are at their mercy"; standard APIs lower switching cost | p.14 |
| Weigh the provider's jurisdiction and trustworthiness | Cross-border providers; regulated data | Sanctions during a political conflict can lock you out; the provider must be trusted with security, complicating compliance | p.14 |
| Prefer an existing higher-level cloud abstraction when it matches your use case; build from lower-level components only when nothing fits | Choosing a layer in the cloud stack | Higher-level abstractions are more use-case specific but give "much less hassle" when they fit | p.16 |
| Treat local instance disks as an ephemeral cache, not long-term storage | Cloud native systems on VMs | Local disk "becomes inaccessible if the associated instance fails" or is replaced by a different size | p.16 |
| Avoid virtual block devices (EBS, managed disks, persistent disks) in systems designed for the cloud; build on dedicated storage services | Cloud native databases | Block emulation adds overhead and "every I/O operation on the virtual block device is a network call" | p.16 |
| Manage small values in a separate service and pack many values into large blocks for the object store | Cloud native databases | Object stores target files from "hundreds of kilobytes to several gigabytes"; individual rows are much smaller | p.16 |
| Plan for disaggregated storage and compute, including the network transfer between them | Cloud analytics (S3 plus separate compute) | "S3 only stores files"; analysis must run elsewhere | p.17 |
| Engineer multitenant services so one customer cannot affect another's performance or security | Shared hardware | Multitenancy improves utilization, scalability, and manageability but "requires careful engineering" | p.17 |
| Follow DevOps/SRE practice: automation over manual one-off jobs, ephemeral VMs, frequent updates, learning from incidents, preserving organizational knowledge | Operations | The shift from managing machines to managing services | p.18 |
| Treat capacity planning as financial planning and performance optimization as cost optimization; know which resources serve which purpose | Cloud with metered billing | Metered billing removes classic capacity planning but makes it easy to "waste money on cloud resources that are not needed" | p.18 |
| Learn cloud quotas and limits (e.g., maximum concurrent processes) before you run into them | Cloud services | Resource limits exist and must be planned for | p.18 |
| Keep in-house responsibility for application and library security, inter-service interactions, load monitoring, and root-causing outages or degradations | Any cloud deployment | These "cannot fully be outsourced to cloud services" | p.18 |
| Go distributed only for a concrete reason: inherent distribution, cross-service data flow, fault tolerance/HA, scalability, geographic latency, elasticity, specialized hardware, data residency law, sustainability | Deciding on distribution | Each reason names a benefit a single node cannot deliver | p.19-20 |
| Default to a single node (DuckDB, SQLite, KuzuDB) when the workload fits; do not rush into distribution | Workload fits one machine | "performing a task on a single machine is often much simpler and cheaper"; CPUs, memory, disks have grown "larger, faster, and more reliable" | p.21, p.26 |
| Bring computation to the data instead of shipping large data to a separate processing machine | Large data volumes | Calls over the network are "vastly slower than calling a function in the same process" | p.20 |
| Design every network request for the case where it times out and you cannot know whether it was received; do not assume retries are safe | Any networked call | Network interruption, overload, or crash means "any request may time out without receiving a response" | p.20 |
| Instrument distributed systems with observability and tracing (OpenTelemetry, Zipkin, Jaeger) | Distributed systems | Otherwise "how do you figure out where the problem lies?" | p.20-21 |
| Avoid distributed transactions across microservices; handle cross-service consistency in the application | Database-per-service designs | They "run counter to the goal of making services independent" and many databases do not support them | p.21 |
| Give each microservice one well-defined purpose, one owning team, a network API, and its own database that is never shared | Microservices | A shared database makes "the entire database structure a part of the service's API" and lets one service's queries hurt another | p.21-22 |
| Skip microservices in a small company with few teams; implement the application in the simplest way possible | Small organizations | Microservices are "primarily a technical solution to a people problem"; without many teams they are "unnecessary overhead" | p.22 |
| Use API description standards (OpenAPI, gRPC) to manage client-server API evolution | Evolving service APIs | Adding or removing fields "can cause clients to fail", often discovered only in staging or production | p.22 |
| Use serverless/FaaS when you want metered billing for code execution and can accept execution time limits, restricted runtimes, and slow cold starts | Bursty, short-lived work | The provider "automatically allocates and frees hardware resources as needed" | p.22 |
| Use cloud techniques for continually available services; use HPC techniques (checkpoint, stop whole cluster, restart) only for batch scientific compute | Choosing a paradigm | Online services cannot stop the entire cluster to repair a node | p.23 |
| Treat basic legal and ethical awareness as foundational knowledge for every engineer working on systems that store data about people | Personal data | Automated decisions have "profound consequences for individuals"; GDPR, CCPA, EU AI Act constrain design | p.24 |
| Design for deletion on request even with immutable append-only logs and derived datasets such as ML training data | GDPR right to erasure | Immutability conflicts with "the right to be forgotten"; this "creates new engineering challenges" | p.24 |
| Count liability, breach, fines, compelled disclosure, and user-safety risks in the cost of storing data; practice data minimization (delete what is not worth keeping) | Any personal data | GDPR: collect only for a "specified, explicit purpose", never repurpose, never keep "longer than necessary"; location or IP logs can endanger users | p.25 |
| Comply with PCI when processing payments and SOC 2 when buyers require it; expect independent third-party audits | Payments; B2B vendors | Auditors "verify continued compliance" | p.25 |

## Metrics and numbers

| metric or quantity | definition / how measured | values or thresholds the book gives | caveats | page |
|---|---|---|---|---|
| Dataset size, OLTP vs OLAP | Total data held by the system | OLTP: "Gigabytes to terabytes"; OLAP: "Terabytes to petabytes" | "typical characteristics"; the distinction "is not always clear-cut" | p.5-6 |
| Query volume and shape | Count and complexity of queries | OLTP: "Lots of small queries"; OLAP: "Few queries, each is complex" | Table 1-1 | p.6 |
| Main read pattern | Records touched per query | OLTP: point queries by key; OLAP: aggregate over a large number of records | | p.6 |
| Main write pattern | How data enters | OLTP: create/update/delete individual records; OLAP: bulk import (ETL) or event stream | | p.6 |
| Data represented | Temporal shape of the dataset | OLTP: latest state at a point in time; OLAP: history of events over time | | p.6 |
| Analytics freshness | Time from event to analytical response | File-based reruns: periodic (e.g., daily); stream processing: "on the order of seconds" | Value depends on the application's time-sensitivity | p.10 |
| Number of OLTP systems per enterprise | Count of operational systems and databases | "dozens, even hundreds" of OLTP systems; "potentially hundreds of separate operational databases"; "a single data warehouse" | Each system needs its own team | p.7-9 |
| Load predictability | Fluctuation in machines needed | Self-hosting is often cheaper if the machine count "does not fluctuate wildly" | Also depends on existing skills | p.13 |
| Cloud native advantages | Comparison with self-hosted designs run as managed services | Better performance on the same hardware, faster recovery from failures, quick scaling to match load, larger datasets | Qualitative, from Aurora, Socrates, Snowflake papers | p.15 |
| Object-store file size | Size range the service is designed for | "hundreds of kilobytes to several gigabytes" | Individual rows are much smaller, hence a separate small-value service | p.16 |
| Virtual disk block size | Unit of block-device emulation | "typically 4 KiB" | Every block I/O is a network call | p.16 |
| Metered billing | Charge basis | Storage: pay for space used; serverless: pay "only for the time that your application code is running" | Capacity planning becomes financial planning | p.17-18, p.22 |
| Cloud quotas | Provider-imposed resource limits | Example: "the maximum number of processes you can run concurrently" | Must be known before you hit them | p.18 |
| Remote call vs local call | Relative latency | A call to another service is "vastly slower than calling a function in the same process" | Datacenter networks are fast, but still | p.20 |
| Single node vs cluster | Relative performance | A simple single-threaded program on one computer can beat "a cluster with over 100 CPU cores" | "in some cases" | p.20 |
| Serverless constraints | Limits of FaaS platforms | Time limit on function execution; limited runtime environments; "slow start times when a function is first invoked" | Executions may land on different servers | p.22 |
| Bisection bandwidth | "a commonly used measure of a network's overall performance" | Clos topologies in cloud datacenters give high bisection bandwidth | HPC prefers meshes and toruses for known communication patterns | p.23 |
| GDPR in force | Regulatory timeline | "Since 2018" | Similar laws elsewhere (CCPA); EU AI Act adds restrictions | p.24 |
| True cost of storing data | Full cost-benefit | Storage bill plus liability and reputational damage from leaks, legal costs and fines, compelled hand-over, user safety risks | Goes beyond "the bill you pay for S3" | p.25 |
| Personal-data retention bound | How long data may be kept | GDPR: not "longer than necessary for the purposes for which it was collected" | Purpose must be "specified, explicit"; no later repurposing | p.25 |

## Failure modes and anti-patterns

| failure mode | cause | consequence | mitigation the book gives | page |
|---|---|---|---|---|
| Analytics on the OLTP database | Expensive aggregate scans share resources with transactions | Degraded performance for application users | Separate data warehouse fed by ETL | p.7 |
| Data silos | Data of interest spread across many independent operational systems | "difficult to combine those datasets in a single query" | One enterprise warehouse via ETL | p.7 |
| End users writing custom SQL on OLTP | Query freedom on the operational database | Reading or modifying data without permission; expensive queries hurt others | Fixed queries baked into application code | p.6 |
| Stale or inconsistent derived data | No process to propagate changes from the system of record; databases assume they are the only store | Caches, indexes, warehouse disagree with the source | Data pipelines for integration (Ch. 11); the system of record wins on discrepancy | p.11 |
| Hidden two-system HTAP | HTAP sold as one system but internally OLTP plus analytical engine | Misunderstanding how the system behaves | Keep the OLTP/OLAP distinction in mind | p.8 |
| Idle over-provisioned hardware | Provisioning for peak with variable load | "less cost-effective" | Cloud elasticity; enqueue and schedule predefined queries | p.13 |
| No control over a cloud service | Missing feature, outage, bug, or performance problem in a vendor service | Can only ask the vendor or wait; no OS metrics or server logs to diagnose | Self-host or hybrid where control matters | p.14 |
| Vendor shutdown, price hike, or unwanted product change | Dependence on a proprietary service without standard APIs | Forced migration; "you are at their mercy"; running the old version "is usually not an option" | Prefer compatible APIs; weigh lock-in cost | p.14 |
| Sanctions lock-out | Provider in another country during political conflict | Loss of access to the service | Consider provider jurisdiction | p.14 |
| Compliance complication | Having to trust the provider with data security | Harder to comply with privacy and security regulations | Evaluate provider trust against regulations | p.14 |
| Local disk data loss | Instance fails or is replaced by a different size on another physical machine | Local disk inaccessible | Treat local disks as ephemeral cache; use storage services | p.16 |
| Virtual disk fragility | Block-device emulation over the network | Overhead plus sensitivity to "network glitches" on every I/O | Cloud native designs use dedicated storage services (object store plus small-value service) | p.16 |
| Tenant interference | Multitenant shared hardware | One customer's activity affects others' performance or security | Careful isolation engineering | p.17 |
| Cloud cost waste | Metered billing without tracking purpose | Paying for unneeded resources | Capacity planning as financial planning; cost optimization | p.18 |
| Surprise quota exhaustion | Unknown provider limits | Service blocked at the limit | Know quotas and plan ahead | p.18 |
| Integration sprawl | Many vendors and services, no integration standards | "significant manual effort"; ETL is "only part of the story" | Budget for integration work | p.18 |
| Ambiguous timeout | Network interruption, overload, or crash | Unknown whether the request was processed; naive retry "might not be safe" | Design for failure (Ch. 9) | p.20 |
| Shipping big data to compute | Transferring data to a separate processing machine | Slow | Bring the computation to the machine that has the data | p.20 |
| Unnecessary cluster | Assuming more nodes are faster | A single-threaded program can outperform a 100+ core cluster | Stay single-node when possible; single-node databases | p.20-21 |
| Undiagnosable slowness | Many services, no tracing | Cannot locate the slow component | Observability and tracing tools | p.20-21 |
| Cross-service inconsistency | Each service owns its database | Consistency "becomes the application's problem"; distributed transactions rarely usable | Application-level approaches in later chapters | p.21 |
| Shared database between services | Several services read and write one schema | Schema becomes part of the API and is hard to change; one service's queries slow another | One database per service | p.21-22 |
| Microservice overhead | Many small services | Hard local testing (all dependencies needed); per-service deployment, scaling, logging, monitoring, alerting | Orchestration frameworks (Kubernetes); avoid microservices in small companies | p.22 |
| Breaking API change | Adding or removing fields clients depend on | Client failures discovered late in staging or production | OpenAPI and gRPC descriptions | p.22 |
| Serverless surprises | Provider-imposed limits | Execution time limits, runtime restrictions, cold starts; successive executions on different servers | Understand constraints before adopting | p.22 |
| Stop-the-world recovery | HPC checkpoint/restart model applied to online services | Users see interruptions | Cloud fault-tolerance techniques for continually available services | p.23 |
| Trusted-network assumptions | Shared memory and RDMA assume trust among users | Unsafe among mutually untrusting tenants | Resource isolation (VMs), encryption, authentication | p.23 |
| Immutable data vs right to erasure | Append-only logs and derived datasets (ML training data) | Cannot easily delete "some data in the middle of a file that is supposed to be immutable" | Open engineering challenge; examine technologies through this lens | p.24 |
| Speculative data hoarding | "big data" philosophy of storing data in case it becomes useful | Leak liability, fines, compelled disclosure, real safety risks (location or IP logs revealing criminalized behavior) | Data minimization (Datensparsamkeit); delete data not worth storing | p.25 |
| Harmful automated decisions | Systems deciding loans, insurance, interviews, crime suspicion | "profound consequences for individuals"; societal effects (news consumption, elections) | Shared ethical responsibility; Ch. 14 on bias and discrimination | p.24 |
| No compliance recipe | GDPR sets high-level principles, not technologies | "no simple answer" to what is GDPR compliant | Interpret principles; keep the question in mind throughout | p.24 |

## Elicitation questions

| question (client language) | concept it decides | page |
|---|---|---|
| Who will use this data: your customers through the app, or your own analysts and data scientists? | Operational vs analytical systems | p.4 |
| Do your analysts need to combine information from several of your systems in one report? | Data silos, data warehouse | p.7 |
| Should analysts be able to ask any question they like, or only run predefined reports? | OLAP ad-hoc freedom vs fixed OLTP queries | p.6 |
| Do you need live statistics inside the product that customers see instantly? | Real-time/product analytics vs batch OLAP | p.6 |
| Which of your data lives in outside services (CRM, email marketing, payments) you only reach through their API? | ETL via connector services | p.8 |
| Do any analyses need both big scans and instant single-record lookups in the same application (e.g., fraud checks)? | HTAP | p.8-9 |
| Will data scientists work with raw text, images, video, sensor data, or ML features rather than tables? | Data lake vs warehouse | p.9-10 |
| How quickly must analytics react to new events: next day, next hour, or within seconds? | Batch vs stream processing | p.10 |
| Do you want results from analysis (recommendations, ML scores) to flow back into the product? | Reverse ETL, ML deployment | p.10 |
| For each kind of data, which system is the official truth when two copies disagree? | System of record | p.11 |
| Which data could be rebuilt from other data if it were lost? | Derived data | p.11 |
| Is running this kind of infrastructure part of what makes your business special, or a routine chore? | Build vs buy | p.12 |
| Does your team already know how to operate the database or platform you need? | Cloud vs self-hosting | p.13 |
| Is your traffic steady, or does it spike (seasons, events, interactive analysis)? | Elasticity; cloud economics | p.13 |
| Do you need to tune the system to your specific workload? | Self-hosting for customization | p.13 |
| If the vendor raises prices, deprecates the product, or goes down, what happens to you? Is there a compatible alternative? | Vendor lock-in, standard APIs | p.14 |
| Would you be comfortable not seeing inside the service when something breaks? | Loss of control in the cloud | p.14 |
| Is any part of the system so latency-sensitive that you need full control of the hardware? | In-house vs cloud | p.14 |
| Which countries may your providers be in, and must data stay inside a given country? | Sanctions risk; data residency | p.14, p.20 |
| Who will handle operations, cost tracking, security patching, and incident diagnosis after launch? | Operations in the cloud era | p.17-18 |
| Do you know the usage limits of your cloud accounts? | Quotas | p.18 |
| Do users interact with each other across different devices? | Inherent distribution | p.19 |
| Must the service keep working if one machine, the network, or a whole datacenter fails? | Fault tolerance / high availability | p.19 |
| Do you expect more data or traffic than one powerful machine can handle, and when? | Scalability vs single node | p.19, p.21 |
| Are your users spread around the world and sensitive to delay? | Geographic latency | p.19 |
| Do parts of the work need special hardware (GPUs for ML, many disks for storage)? | Specialized hardware | p.19-20 |
| Can jobs be shifted in time or place to use cheaper or renewable power? | Sustainability | p.20 |
| How many teams will build and run this, and must they ship independently? | Microservices vs simplest implementation | p.22 |
| Do any teams expect to share one database? | Database per service | p.21-22 |
| Are workloads short, bursty tasks that could run as pay-per-use functions? | Serverless/FaaS | p.22 |
| Do you store data about people? Which laws apply (GDPR, CCPA, EU AI Act)? | Law and society | p.24 |
| If a person asks to be deleted, can you remove them from every copy, including logs, backups, and trained models? | Right to erasure vs immutability | p.24 |
| For each dataset: why do you keep it, how long is it needed, and what harm if it leaked or were subpoenaed? | Data minimization | p.25 |
| Do you process card payments, or sell to buyers who demand SOC 2? | PCI, SOC 2 | p.25 |
| Does the system make automated decisions about people (credit, hiring, insurance)? | Ethical responsibility | p.24 |

## Verifiable properties

| property | how to test | page |
|---|---|---|
| Operational services expose only a fixed query set; no user-supplied SQL reaches the OLTP database | Static scan of the service for string-built SQL; integration test that user input cannot alter query structure | p.6 |
| BI/analytics tools never connect to OLTP databases | Check credentials and network ACLs: analyst accounts can reach only the warehouse | p.7 |
| Warehouse freshness within the agreed cadence (daily or seconds) | Compare max event timestamp in source vs warehouse; assert lag below threshold | p.7, p.10 |
| Every derived store can be rebuilt from the system of record | Wipe cache/index/materialized view, rebuild from source, compare to the previous contents | p.11 |
| On discrepancy, the system of record wins | Inject a divergent value into a derived store; verify reconciliation restores the source value | p.11 |
| Writes to the system of record propagate to derived systems within a bound | Write a record, poll derived stores, assert visibility within N seconds | p.11 |
| Backend code is stateless | Kill and restart the service between two requests of one session; the second request still succeeds | p.3 |
| Each fact is represented exactly once in the system of record | Schema review for normalization; duplicate-detection query returns zero rows | p.11 |
| Each service has its own database; none is shared | Inventory of DB credentials per service; assert no schema is referenced by two services | p.21-22 |
| Network calls time out and retries are safe | Fault injection: drop responses; assert idempotent handling (no duplicate side effects) | p.20 |
| Local instance disks hold no unique data | Terminate an instance; verify no data loss after replacement | p.16 |
| Quota headroom is monitored | Alert fires when any quota reaches a set fraction of its limit | p.18 |
| Every cloud resource is attributable to a purpose | Tag audit: zero untagged resources in billing export | p.18 |
| API changes do not break clients | Contract tests against the OpenAPI/gRPC schema in CI; backward-compatibility check on field removal | p.22 |
| Cross-service requests are traceable | Every outbound call carries a trace context (OpenTelemetry); traces reconstruct the full call path | p.20-21 |
| Right to erasure is complete | After a deletion request, the subject's identifiers are absent from the system of record, derived stores, logs, and training sets | p.24 |
| Retention limits are enforced | Automated TTL job; query for personal data older than its declared purpose returns zero | p.25 |
| Data residency is honored | Assert storage region of each record matches the user's jurisdiction | p.20 |
| Tenants are isolated | Load one tenant to saturation; other tenants' latency and access stay within bounds | p.17 |
| Single node is tried first | Benchmark the workload on one machine before approving a cluster; record the comparison | p.20-21 |
| Serverless functions fit platform limits | Measure max execution time against the provider's limit; cold-start latency within requirement | p.22 |

## Terms

| term | definition | page |
|---|---|---|
| data-intensive application | Application where data management is "one of the primary challenges" | p.1 |
| compute-intensive system | System whose challenge is "parallelizing a very large computation" | p.1 |
| frontend / backend | Client-side code (browser, mobile app) vs server-side code handling user requests | p.3 |
| data infrastructure | Databases, caches, message queues, etc. that backend code reads and writes | p.3 |
| stateless | Application code that forgets a request once it is handled | p.3 |
| operational system | Backend services and data infrastructure "where data is created", reading and modifying data for users | p.4 |
| analytical system | Read-only copy of operational data, optimized for analysts and data scientists | p.4 |
| business intelligence (BI) | Reports about the organization's activities to help management decide | p.4 |
| data engineer | Integrates operational and analytical systems; owns data infrastructure | p.4 |
| analytics engineer | Models and transforms data for analysts and data scientists | p.4 |
| transaction | A group of reads and writes forming a logical unit; used loosely here for low-latency reads and writes | p.5 |
| point query | Looking up a small number of records by key | p.5 |
| OLTP | Online transaction processing: interactive, key-based reads and writes | p.5 |
| OLAP | Online analytical processing: scans over many records computing aggregates | p.5 |
| product analytics / real-time analytics | Analytical systems embedded in user-facing products with real-time ingest and low-latency queries (Pinot, Druid, ClickHouse) | p.6 |
| data warehouse | Separate database holding a read-only copy of all OLTP data for analysts | p.7 |
| data silos | Data spread across systems, hard to combine in one query | p.7 |
| ETL / ELT | Extract, transform, load into the warehouse; ELT transforms after loading | p.7 |
| HTAP | Hybrid transactional/analytical processing in one system | p.8 |
| data lake | Centralized repository of files in any format, model, or schema for analysis | p.9-10 |
| features / feature engineering | Numerical vectors or matrices derived from data for ML; the craft of producing them | p.9 |
| data pipeline | Generalization of ETL processes moving data between systems | p.10 |
| sushi principle | "raw data is better": keep raw data and let consumers transform it | p.10 |
| DataOps | Management and operations practices for analytical systems and pipelines | p.10 |
| reverse ETL | Making analytical outputs available to operational systems | p.10 |
| system of record / source of truth | Authoritative, canonical version of data; first written here; each fact once | p.11 |
| derived data | Data produced by transforming other data; re-creatable (caches, indexes, materialized views, models) | p.11 |
| materialized view | Precomputed query result stored as derived data | p.11 |
| build vs buy | In-house vs outsourced software and operations | p.12 |
| on premises | Self-hosted on your own hardware (even in a rented rack) | p.12 |
| IaaS | Infrastructure as a service: VMs in the cloud you administer yourself | p.12 |
| vendor lock-in | High switching cost caused by non-standard APIs | p.14 |
| hybrid approach | Cloud services for some aspects of a system, in-house for others | p.14 |
| cloud native | Architecture designed to take advantage of cloud services, built on lower-level cloud services | p.14-15 |
| managed service | Self-hostable software offered and operated as a cloud service | p.14 |
| object storage | Services (S3, Azure Blob, R2) storing large files behind a limited API, distributed across machines | p.15 |
| RAID | Redundant array of independent disks on one machine | p.16 |
| virtual disk / block device | Network service emulating a disk of 4 KiB blocks (EBS, managed disks, persistent disks) | p.16 |
| separation of storage and compute (disaggregation) | Storage and computation provided by different services/machines | p.17 |
| multitenant | Several customers' data and computation on the same shared hardware and service | p.17 |
| DBA / sysadmin | Traditional roles managing server-side data infrastructure | p.17 |
| DevOps / SRE | Shared development-and-operations responsibility; SRE is Google's implementation | p.17 |
| metered billing | Charging by resources actually used instead of provisioned capacity | p.17 |
| capacity planning | Anticipating resource needs; becomes financial planning in the cloud | p.17-18 |
| distributed system | Several machines communicating via a network | p.19 |
| node | A process participating in a distributed system | p.19 |
| inherent distribution | Distribution forced by multiple users on multiple devices | p.19 |
| elasticity | Scaling resources up and down with demand, paying only for what is used | p.19 |
| data residency laws | Rules requiring data about a jurisdiction's people to be stored and processed there | p.20 |
| observability | Collecting and querying execution data to analyze metrics and individual events | p.20 |
| tracing | Tracking which client called which server for which operation and how long it took | p.20-21 |
| distributed transactions | Transactions spanning multiple databases/services; rarely used with microservices | p.21 |
| service-oriented architecture (SOA) / microservices | Decomposition into network-callable services, each with one purpose and one owning team | p.21 |
| orchestration framework | Infrastructure for deploying and managing services (Kubernetes) | p.22 |
| serverless / FaaS | Provider allocates and frees resources per request; billed by execution time | p.22 |
| HPC / supercomputing | Large batch scientific computation with checkpoint-restart and specialized networks | p.23 |
| RDMA | Remote direct memory access: high-bandwidth, low-latency networking assuming trust | p.23 |
| Clos topology / bisection bandwidth | Datacenter network layout and the measure of its overall throughput | p.23 |
| GDPR / CCPA / EU AI Act | European and Californian privacy regulations; EU rules on AI use of personal data | p.24 |
| right to be forgotten | GDPR right to have personal data erased on request | p.24 |
| data minimization (Datensparsamkeit) | Storing only data worth its risks; deleting the rest | p.25 |
| PCI / SOC 2 | Payment Card Industry standards; Service Organization Control Type 2 standards, both audited | p.25 |

## Chapter summary (condensed)

The theme is trade-offs: many questions "do not have one right answer, but several possibilities that each have pros and cons" (p.25). The chapter introduced the most important architectural choices and the terminology used throughout the book.

It first distinguished operational (OLTP) from analytical (OLAP) systems, which differ in data, access patterns, and audiences; along the way it introduced the data warehouse and data lake, fed from operational systems via ETL. Chapter 4 will show that the two use very different internal data layouts because of the queries they serve (p.26).

It then compared cloud services, "a comparatively recent development", with the traditional self-hosted paradigm. Which is more cost-effective "depends a lot on your particular situation", but cloud native approaches are undeniably changing how data systems are architected - for example by separating storage and compute (p.26).

Cloud systems are intrinsically distributed; the chapter examined trade-offs of distributed systems versus a single machine. Sometimes distribution is unavoidable, "but it's advisable not to rush into making a system distributed if it's possible to keep it on a single machine". Chapter 9 covers distributed-systems challenges in depth (p.26).

Finally, architecture is shaped not only by the business but by privacy regulations protecting the people whose data is processed - "an aspect that many engineers are prone to ignoring". Translating legal requirements into technical implementations "has not yet been formalized", but the question should stay in mind through the rest of the book (p.26).

## Second-edition-specific

Material that appears new or substantially expanded relative to the first edition (whose opening chapter covered reliability, scalability, and maintainability, and whose OLTP/OLAP discussion sat in the storage chapter):

- The whole "Cloud Versus Self-Hosting" section (p.12-18): build-vs-buy framing, the outsourcing spectrum (Figure 1-2), cloud pros and cons including vendor lock-in and sanctions risk, and the claim that cloud services "will not subsume all in-house data systems" (p.14).
- Cloud native architecture: layering of services on object stores (S3, Azure Blob, Cloudflare R2; Snowflake on S3), separation of storage and compute, local disks as ephemeral cache, virtual disks as network calls, small-value service plus object-store blocks, multitenancy (p.14-17). Table 1-2 of self-hosted vs cloud native systems (Aurora, Hyperscale, Spanner, Snowflake, BigQuery, Synapse) (p.15).
- "Operations in the Cloud Era": DevOps/SRE, metered billing replacing capacity planning, "capacity planning becomes financial planning", quotas, lack of integration standards (p.17-18).
- Microservices and Serverless/FaaS as explicit architectural options, including API evolution via OpenAPI/gRPC and "serverless" as autoscaling/usage-billing terminology (p.21-22).
- Cloud computing vs supercomputing (HPC) comparison (p.23).
- The single-node renaissance: DuckDB, SQLite, KuzuDB; "more nodes are not always faster"; bringing computation to the data; "Use One Big Server" and "Big Data Is Dead" references (p.20-21).
- Observability and tracing tools (OpenTelemetry, Zipkin, Jaeger) (p.20-21).
- Expanded analytics landscape: data lake, sushi principle, data pipelines, DataOps, reverse ETL, feature engineering, ML deployment tools (TFX, Kubeflow, MLflow), real-time/product analytics (Pinot, Druid, ClickHouse), HTAP, SaaS ETL connectors (Fivetran, Singer, Airbyte), data engineer and analytics engineer roles (p.4, p.6-10).
- Distribution motivations new to this edition: data residency laws, sustainability (running jobs where renewable power is available), specialized hardware such as GPUs (p.19-20).
- Local-first software reference: frontends "sometimes manage data locally on the user's device" (p.3).
- "Data Systems, Law, and Society" (p.24-25): GDPR, CCPA, EU AI Act, the right to be forgotten vs immutable logs and ML training data, data minimization, compelled disclosure and user safety (abortion, homosexuality), PCI and SOC 2 audits, and the promise of Chapter 14 on ethics, bias, and discrimination.
