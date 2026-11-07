<!-- forge reference: a page-cited digest of Designing Data-Intensive Applications, 2nd ed. (Kleppmann & Riccomini, O'Reilly 2026), chapter 2. Written while reading the chapter; every rule, number, failure mode, question and property carries its page. The condensed layer is references/data-intensive-protocol.md (§0-§8); the row-level map is references/data-intensive-book-map.md; this file is the full layer the requirements data round and the build Phase 4 review consult for the chapters a DATA.md group cites. -->

# Digest: Chapter 2 - Defining Nonfunctional Requirements

Source: Kleppmann and Riccomini, Designing Data-Intensive Applications, 2nd ed. (O'Reilly 2026), pp. 33-64.

## Thesis

Functional requirements say what the app does; nonfunctional requirements say it must be "fast, reliable, secure, legally compliant, and easy to maintain". They often go unwritten "because they may seem somewhat obvious", yet "an app that is unbearably slow or unreliable might as well not exist" (p.33). The chapter gives teams the vocabulary to articulate four of them: performance (response time as a distribution measured in percentiles, throughput as the driver of cost), reliability ("continuing to work correctly, even when things go wrong" - tolerate faults so they do not become failures), scalability (not a label but a set of questions about how load grows and what it costs to keep performance), and maintainability (operability, simplicity, evolvability) (p.33, p.43, p.49, p.53). A social-network timeline case study grounds the ideas in fan-out, materialized views, and load numbers (p.34-36).

## Decision rules

| rule | when it applies | why (mechanism) | page |
|---|---|---|---|
| Write nonfunctional requirements down explicitly next to functional ones | Every project | They "might not be explicitly written down, because they may seem somewhat obvious", yet are "just as important as the app's functionality" | p.33 |
| Push new data from the server to online clients instead of letting clients poll | Timely feeds with many online users | Polling by 10 million online users every 5 s means "running the query 2 million times per second" | p.35 |
| Precompute (materialize) expensive read queries and serve reads from a cache; accept more work on writes | Read-heavy, latency-sensitive queries | A materialized view "speeds up reads, but in return we have to do more work on writes" | p.35-36 |
| Enqueue fan-out deliveries during write spikes and accept delayed visibility rather than slowing reads | Bursts such as special events | Timelines "remain fast to load, since we simply serve them from a cache" | p.36 |
| Drop (sample) materialized-view writes for users who follow very many high-volume accounts | Extreme read-side fan-in | Such a user "is not likely reading all the posts in their timeline" | p.36 |
| Never drop celebrity posts; store them separately and merge them into the timeline at read time | Accounts with millions of followers | Writing into millions of timelines is too costly, but dropping those writes "is not OK" | p.36 |
| Measure performance with two metric types - response time (seconds) and throughput ("somethings per second") - and optimize response time for users while using throughput to size hardware and cost | Any performance discussion | "the response time is usually what users care about the most, whereas the throughput determines the required computing resources" | p.37-38 |
| Call a system scalable only if its maximum throughput "can be significantly increased by adding computing resources" | Capacity growth | Definition of scalability | p.38 |
| Keep headroom: expect response time to rise sharply as throughput approaches capacity | Loaded services | Queueing: an arriving request waits while the CPU handles earlier ones; delays "increase sharply" near the maximum | p.37 |
| Use exponential backoff with randomized intervals for client retries | Any client retry logic | Prevents retry storms that push an overloaded service into a vicious cycle | p.38 |
| Use a circuit breaker or token bucket to stop sending to a service that has recently errored or timed out | Service-to-service calls | Temporarily removes load from a struggling dependency | p.38 |
| Shed load proactively on the server, send backpressure asking clients to slow down, and choose queueing and load-balancing algorithms deliberately | Servers approaching overload | Rejecting early and slowing producers break the feedback loop that causes metastable failure | p.38 |
| Measure response times on the client side, not only service time on the server | Performance monitoring | Queueing delay "is not part of the service time"; head-of-line blocking makes fast requests look slow to the client | p.39 |
| Treat response time as a distribution, not a single number | Reporting performance | Random delays (context switches, packet loss and TCP retransmission, GC pauses, page faults, rack vibration) create outliers | p.39-40 |
| Use the arithmetic mean only to estimate throughput limits, not to describe typical user experience | Choosing metrics | The mean "doesn't tell you how many users actually experienced that delay" | p.40 |
| Use the median (p50) for typical wait and p95, p99, p999 to quantify outliers | SLO design | Half of requests are faster than the median; higher percentiles bound the slow tail | p.40 |
| Prioritize tail latency (e.g., p999) when the slowest requests belong to your most valuable users | Ecommerce and similar | Customers with the most data have the slowest requests and "are the most valuable customers" (Amazon) | p.40-41 |
| Do not optimize p9999 | Very high percentiles | "deemed too expensive"; dominated by "random events outside of your control"; diminishing benefits | p.41 |
| Treat latency-to-revenue statistics skeptically and control for content | Justifying performance work | Google 2006 vs 2009 figures conflict; the Akamai study is confounded by fast-loading 404 pages and "probably not meaningful" | p.41 |
| Watch high percentiles especially in backend services called many times per end-user request | Fan-out of backend calls | Tail latency amplification: "It takes just one slow call to make the entire end-user request slow", even in parallel | p.41 |
| Express SLOs as percentiles and error ratios; make SLAs contracts that say what happens when the SLO is missed | Service commitments | Example SLO: median < 200 ms, p99 < 1 s, 99.9% of valid requests non-error; SLA may entitle customers to a refund | p.42 |
| Compute percentiles over a rolling window (e.g., last 10 minutes, refreshed every minute); use HdrHistogram, t-digest, OpenHistogram, or DDSketch if sorting the full list is too slow | Monitoring dashboards | Approximation algorithms give good percentiles "at minimal CPU and memory cost" | p.42 |
| Never average percentiles; aggregate by adding histograms | Combining machines or time buckets | Averaging percentiles "is mathematically meaningless" | p.42 |
| Distinguish faults (one part stops working correctly) from failures (the system misses its SLO) | Reliability design | Same thing at different levels; fault tolerance stops faults from escalating | p.43 |
| Eliminate single points of failure | Any part whose fault escalates | A SPOF fault "escalates to cause the failure of the whole system" | p.43 |
| When another machine takes over a crashed one, neither miss nor duplicate work (exactly-once semantics) | Fault-tolerant processing such as fan-out | Takeover must happen "without missing any posts ... and without duplicating any posts" | p.43-44 |
| Bound fault tolerance to a stated number and type of faults | Reliability requirements | E.g., two disks failing at once or one of three nodes; "It would not make sense to tolerate any number of faults" | p.44 |
| Deliberately inject faults (randomly kill processes) and practice chaos engineering | Fault-tolerant systems | "Many critical bugs are actually due to poor error handling"; exercising the machinery raises confidence | p.44 |
| Prefer tolerating faults over preventing them, except where no cure exists (security breaches) | Choosing a reliability strategy | A compromise of sensitive data "cannot be undone" | p.44 |
| In small systems just replace faulty hardware; in large systems treat hardware faults as normal operation | Depends on fleet size | Rare per component, frequent across 10,000 disks | p.45 |
| Add hardware redundancy (RAID, dual power supplies, hot-swappable CPUs, batteries and generators) to reduce single-machine failure rate | Individual machines | Can "keep a machine running uninterrupted for years" | p.45 |
| Rely on redundancy only to the extent faults are independent; expect rack- and datacenter-level correlation | Redundancy design | "significant correlations between component failures" are observed | p.45 |
| Tolerate faulty nodes at the software level and spread across availability zones, racks, and datacenters | Cloud systems | Co-located resources "are more likely to fail at the same time"; software-level tolerance survives a whole datacenter | p.45-46 |
| Use multi-node fault tolerance to do rolling upgrades instead of planned downtime | Patching and maintenance | Restart "one node at a time, without affecting the service for users" | p.46 |
| Assume software faults are highly correlated and plan for all nodes failing together | Any fleet running the same code | Same software, same bugs (2012 leap second; SSDs dying at 32,768 hours) | p.46 |
| Mitigate software faults with many small measures: question assumptions and interactions, test thoroughly, isolate processes, let processes crash and restart, avoid feedback loops, measure and monitor production | Software reliability | "The problem of systematic faults in software has no quick solution" | p.47 |
| Do not stop at "human error"; treat it as a symptom of the sociotechnical system | Incident analysis | "blaming people for mistakes is counterproductive"; configuration changes are the leading cause of outages | p.47 |
| Invest in handwritten and property-based tests, rollback mechanisms, gradual rollouts, clear monitoring, observability, and interfaces that encourage the right thing | Reducing the impact of mistakes | Technical measures limit the blast radius of inevitable mistakes | p.47 |
| Run blameless postmortems and be suspicious of simplistic answers | After incidents | Neither "Bob should have been more careful" nor "We must rewrite the backend in Haskell" is productive; learn how the sociotechnical system really works | p.48 |
| Prioritize durability over uptime: minutes or hours of outage are often tolerable, permanent data loss or corruption is catastrophic | Setting reliability priorities | Photo-app example; the user may not know how to restore from backup | p.48 |
| Make it a conscious decision when cutting reliability corners (e.g., a prototype for an unproven market) | Early-stage products | "we should be very conscious of when we are cutting corners and keep in mind the potential consequences" | p.49 |
| For a new product with few users, keep the system simple and flexible and do not engineer for hypothetical scale; start scalability work once real load reveals the bottlenecks | Startups and new products | Premature scaling is "wasted effort and premature optimization" at best and locks you "into an inflexible design" at worst | p.49-50 |
| Never say "X is scalable"; ask instead what options exist for a given growth, how to add resources, and when current limits will be hit | Scalability discussions | "Scalability is not a one-dimensional label" | p.49 |
| Describe current load with concrete parameters (requests/s, GB/day, checkouts/hour, peak online users, read/write ratio, cache hit rate, items per user) before discussing growth | Load modeling | "What happens if our load doubles?" needs a baseline; bottlenecks may be average-case or a few extreme cases | p.50 |
| Analyze growth two ways - performance at fixed resources, and resources needed to hold performance - and target the SLA at minimum cost | Capacity planning | Resources drive cost; hardware cost-effectiveness changes over time | p.50 |
| Aim for linear scalability but expect cost to grow faster than linearly | Planning growth | More data makes each write more work; sublinear cost from economies of scale is the exception | p.50-51 |
| Use vertical scaling (shared-memory) as the simplest first step, knowing cost grows superlinearly and bottlenecks cap it | Choosing a scaling model | Twice the hardware "costs significantly more than twice as much" and is "unlikely to actually be able to handle twice the load" | p.51 |
| Avoid shared-disk (NAS/SAN) architectures for scalability | Scaling data warehouses | "contention and the overhead of locking limit the scalability" | p.51 |
| Use shared-nothing (horizontal scaling) when you need near-linear scaling, best price/performance hardware, elastic resources, and multi-region fault tolerance; accept explicit sharding and distributed-systems complexity | Large scale | Coordination happens "at the software level, via a conventional network" | p.51 |
| Accept cloud native storage/compute separation as a modern shared-disk variant when the storage service exposes a database-specific API | Cloud databases | Avoids "the scalability problems of older systems" built on filesystem or block abstractions | p.51 |
| Do not expect a generic scalable architecture ("magic scaling sauce") | Architecture | 100,000 x 1 kB requests/s differs completely from 3 x 2 GB requests/min despite identical 100 MB/s | p.52 |
| Plan to rethink architecture at every order of magnitude of load; do not plan more than one order ahead | Fast-growing services | An architecture for one load level "is unlikely to cope with 10 times that load"; needs evolve | p.52 |
| Break the system into smaller components that operate largely independently (microservices, sharding, stream processing, shared-nothing) | Scalability | Independence enables parallel growth; "The challenge lies in knowing where to draw the line" | p.52 |
| Prefer a single-machine database if it does the job; prefer manual scaling when load is predictable; prefer 5 services to 50 | Avoiding complexity | "not to make things more complicated than necessary"; manual scaling "may have fewer operational surprises" | p.52 |
| Design for maintenance (operability, simplicity, evolvability) because maintenance dominates software cost and every valuable system becomes legacy | All systems | "the majority of the cost of software is not in its initial development but in its ongoing maintenance" | p.52-53 |
| Automate at scale but keep a skilled operations team and manual controls; find the automation sweet spot | Operations | Edge cases that cannot be automated "tend to be the most complex"; an automated system gone wrong is harder to troubleshoot | p.53-54 |
| Build operability in: key metrics and observability, no dependency on individual machines, documentation with a clear operational model, good defaults with overrides, self-healing with manual override, predictable behavior | Data systems | Makes routine tasks easy so operations can "focus on high-value activities" | p.54 |
| Pursue simplicity and use good abstractions to hide implementation detail and enable reuse | Managing complexity | Complexity "slows down everyone" and raises bug risk; SQL hides on-disk structures, concurrency, crash inconsistencies | p.54-55 |
| Build on general-purpose abstractions (transactions, indexes, event logs); apply design patterns and DDD on top | Application architecture | Quality improvements in a shared abstraction "benefit all applications that use it" | p.55 |
| Favor loosely coupled, simple systems and Agile practices (TDD, refactoring) for evolvability | Changing requirements | "Loosely coupled, simple systems are usually easier to modify than tightly coupled, complex ones" | p.55-56 |
| Minimize irreversibility; take irreversible actions (e.g., migrations without a way back) very carefully | Migrations and major changes | If you cannot switch back, "the stakes are much higher" | p.56 |

## Metrics and numbers

| metric or quantity | definition / how measured | values or thresholds the book gives | caveats | page |
|---|---|---|---|---|
| Post rate | Posts per day / per second across the service | 500 million posts/day; 5,800 posts/s average; spikes to 150,000 posts/s | Assumed numbers for a simplified X-style network | p.34 |
| Follow graph | Average follows and followers per user | Average user follows 200 and has 200 followers; celebrities over 100 million followers | "a very wide range"; most have a handful | p.34 |
| Timeline query size | Rows returned by the home-timeline SQL | LIMIT 1000 most recent posts | Ignores ads and suggested posts | p.35 |
| Timeliness requirement | Delay from post to visibility for followers | Within 5 seconds | Drives the polling frequency | p.35 |
| Concurrent online users | Users logged in at the same time | 10 million | Peak of a variable quantity | p.35 |
| Polling query rate | Online users / polling interval | 2 million timeline queries per second | "Even if we were to poll less frequently, this is a lot" | p.35 |
| Per-sender lookups under polling | Queries/s x followed accounts | 2 million x 200 = 400 million lookups per second | Average case; some users follow tens of thousands | p.35 |
| Fan-out factor | Downstream requests per initial request | 200 (average followers per post) | Celebrities blow this up | p.35-36 |
| Timeline writes under materialization | Posts/s x fan-out | 5,800 x 200 = "just over 1 million home timeline writes per second" | Still a saving vs 400 million lookups/s | p.36 |
| Response time | Elapsed time from request to answer, as seen by the client | Unit: seconds, ms, or microseconds | Includes all delays anywhere in the system | p.37-38 |
| Throughput | Requests or data volume per second | "some-things per second"; hardware sets a maximum | Determines required resources and cost | p.37-38 |
| Service time | Time the service actively processes a request | - | Excludes queueing delay | p.38 |
| Queueing delay | Waiting for CPU or for outbound network buffer | Accounts for "a large part of the variability in response times" | Measure on the client to capture it | p.38-39 |
| Mean response time | Sum of response times / number of requests | Useful "for estimating throughput limits" | Poor indicator of typical experience | p.40 |
| Median (p50) | Halfway point of sorted response times | Example: 200 ms median means half of requests return in under 200 ms | Good measure of typical wait | p.40 |
| p95 / p99 / p999 | Value below which 95%, 99%, 99.9% of requests fall | Example: p95 of 1.5 s means 95 of 100 requests under 1.5 s, 5 of 100 at or above | Called tail latencies | p.40 |
| Amazon tail target | Percentile used for internal service requirements | 99.9th percentile (1 in 1,000 requests) | 99.99th (1 in 10,000) "deemed too expensive" | p.40-41 |
| Google 2006 latency study | Traffic/revenue change vs added latency | 400 ms to 900 ms slowdown "associated with a 20% drop in traffic and revenue" | Described as unreliable | p.41 |
| Google 2009 latency study | Searches per day vs added latency | +400 ms gave "only 0.6% fewer searches per day" | Conflicts with 2006 figure | p.41 |
| Bing 2009 study | Ad revenue vs load time | +2 s load time reduced ad revenue by 4.3% | Newer data not public | p.41 |
| Akamai study | Conversion rate vs response time | +100 ms reduced ecommerce conversion "by up to 7%" | Confounded: fast 404 pages also show low conversion; "probably not meaningful" | p.41 |
| Yahoo study | Click-through on fast vs slow search results | 20%-30% more clicks on fast searches when the difference is 1.25 s or more | Controlled for result quality | p.41 |
| Example SLO | Targets for response time and errors | Median < 200 ms; p99 < 1 s; at least 99.9% of valid requests non-error | Defining good availability metrics "is not straightforward" | p.42 |
| Percentile window | Rolling window and refresh for dashboards | Last 10 minutes, recomputed every minute | Sorting the full list may be too slow; use sketches | p.42 |
| Fault tolerance bound | Maximum simultaneous faults tolerated | E.g., two hard drives at once, or one of three nodes | Must be stated; cannot tolerate everything | p.44 |
| Hard drive annual failure rate | Fraction of HDDs failing per year | 2%-5%; in a 10,000-disk cluster "one disk failure per day" on average | Disks getting more reliable but rates "remain significant" | p.44 |
| SSD annual failure rate | Fraction of SSDs failing per year | 0.5%-1%; uncorrectable errors "approximately once per year per drive" | Uncorrectable error rate higher than HDDs, even for new drives | p.44 |
| Faulty CPU cores | Machines with a core that occasionally computes wrong results | "Approximately 1 in 1,000 machines" | May crash or silently return wrong results | p.45 |
| RAM uncorrectable errors | Machines with an uncorrectable ECC error per year | "more than 1% of machines" | Typically crashes the machine; module must be replaced; access patterns can flip bits | p.45 |
| Leap second incident | Correlated software fault | June 30, 2012: many Java applications hung from a Linux kernel bug | Took down several internet services | p.46 |
| SSD firmware lifetime bug | Correlated firmware fault | Certain SSD models fail after precisely 32,768 hours (under four years); data unrecoverable | All drives of the model fail together | p.46 |
| Outage causes | Share of outages by cause in large internet services | Operator configuration changes the leading cause; hardware faults in only 10%-25% of cases | One study | p.47 |
| Post Office Horizon | Duration and scale of harm | 1999-2019; "hundreds of people" convicted; many convictions overturned | Legal presumption that computers operate correctly | p.48-49 |
| Tolerable outage | Downtime many applications accept | "a few minutes or even a few hours" | Permanent data loss or corruption is catastrophic | p.48 |
| Load growth examples | Concurrent users | 10,000 to 100,000; 1 million to 10 million | Also larger data volumes | p.49 |
| Load parameters | Quantities describing load | Requests/s, GB of new data per day, checkouts per hour, peak simultaneous users, read/write ratio, cache hit rate, items (followers) per user | Which matters "depends on the details of your particular application" | p.50 |
| Linear scalability | Load handled per unit of resources | Doubling resources handles twice the load at the same performance | Usually cost grows faster than linearly; occasionally slower (economies of scale, peak distribution) | p.50-51 |
| Vertical scaling cost | Price of a machine with 2x resources | "significantly more than twice as much"; unlikely to handle 2x load | Bottlenecks | p.51 |
| Equal data throughput, different systems | Requests/s x request size | 100,000 req/s x 1 kB vs 3 req/min x 2 GB, both 100 MB/s | Architectures "look very different" | p.52 |
| Order-of-magnitude rule | Load increase requiring architectural rethink | Every 10x; plan no more than one order ahead | Needs evolve | p.52 |
| Service count | Number of services as a simplicity proxy | "A system with 5 services is simpler than one with 50" | Pragmatic mixture is usual | p.52 |
| Maintenance share of cost | Fraction of software cost after initial development | "the majority of the cost of software" | Includes bugs, operations, debt, new features | p.52 |

## Failure modes and anti-patterns

| failure mode | cause | consequence | mitigation the book gives | page |
|---|---|---|---|---|
| Polling at scale | Clients re-run the timeline query every 5 s | 2 million queries/s, 400 million lookups/s | Server push plus precomputed timelines | p.35 |
| Expensive join for heavy followers | Users following tens of thousands of accounts | Query "very expensive to execute and difficult to make fast" | Materialized timeline | p.35 |
| Write amplification for heavy followers | Materialized timeline updated for every post by many followed accounts | High write rate per user | Drop some writes; show a sample | p.36 |
| Celebrity fan-out | One post to millions of followers | Millions of timeline inserts per post | Store celebrity posts separately; merge at read time; still "a lot of infrastructure" | p.36 |
| Queueing collapse near capacity | Throughput approaching the hardware maximum | Response time "increases dramatically" | Headroom; capacity expansion | p.37 |
| Retry storm | Timeouts cause clients to resend | Request rate rises further, worsening overload | Exponential backoff with randomization; circuit breaker; token bucket | p.38 |
| Metastable failure | Overload-induced inefficiency feeding on itself | System stays overloaded "until it is rebooted or otherwise reset" even after load drops | Load shedding; backpressure; queueing and load-balancing choices | p.38 |
| Head-of-line blocking | Few slow requests occupy limited CPU cores | Fast requests see slow response times | Measure on the client; account for queueing | p.39 |
| Random latency outliers | Context switches, packet loss and TCP retransmission, GC pauses, page faults, rack vibration | Response-time variance (jitter) | Use percentiles; see "Timeouts and Unbounded Delays" | p.39 |
| Mean as "typical" latency | Reporting the arithmetic mean | Hides how many users experienced delays | Median and higher percentiles | p.40 |
| Tail latency amplification | Multiple backend calls per end-user request | One slow call slows the whole request; the slow fraction grows with call count | Tight high-percentile targets on backend services | p.41 |
| Chasing p9999 | Optimizing 1-in-10,000 requests | Too expensive; little benefit; random external events dominate | Stop at p999 (Amazon) | p.41 |
| Misleading latency studies | Uncontrolled confounders (empty 404 pages load fast) | False conclusions about revenue impact | Control for content quality (Yahoo study) | p.41 |
| Averaging percentiles | Combining per-machine or per-interval percentiles by averaging | "mathematically meaningless" results | Add histograms | p.42 |
| Single point of failure | A part whose fault the system cannot tolerate | Whole-system failure | Redundancy and software-level fault tolerance | p.43 |
| Fan-out worker crash | Machine updating timelines dies mid-task | Missed or duplicated posts | Takeover with exactly-once semantics | p.43-44 |
| Poor error handling | Untested fault paths | "Many critical bugs" | Fault injection; chaos engineering | p.44 |
| Security breach | Attacker gains access | "cannot be undone" | Prevention rather than tolerance | p.44 |
| Disk and SSD failures | 2%-5% HDD and 0.5%-1% SSD annual failure; uncorrectable SSD bit errors | Data loss, machine downtime | RAID, redundancy, replication across machines | p.44 |
| Silent CPU miscomputation | Manufacturing defects in roughly 1 in 1,000 machines | Crashes or wrong results | Awareness; fault tolerance | p.45 |
| Memory corruption | Cosmic rays, physical defects, pathological access patterns | Uncorrectable errors crash machines (>1% per year even with ECC) | Replace modules; tolerate node loss | p.45 |
| Datacenter loss | Power outage, network misconfiguration, fire, flood, earthquake, solar storm | Catastrophic if the service cannot tolerate losing a datacenter | Multi-datacenter, multi-zone fault tolerance | p.45-46 |
| Correlated hardware failures | Shared rack or datacenter | Redundancy less effective than independence assumes | Availability zones; geographic separation | p.45-46 |
| Planned downtime for patching | Single-server system | Service interruption to apply OS patches | Rolling upgrades on multi-node systems | p.46 |
| Correlated software bug | Same software on every node (leap second; 32,768-hour SSD firmware) | All nodes fail at the same time | Testing; process isolation; monitoring; assumptions review | p.46-47 |
| Runaway process | One process exhausts CPU, memory, disk, bandwidth, or threads; buggy client library floods requests | Process killed or service overloaded | Process isolation; crash and restart | p.46 |
| Dependency degradation | A dependent service slows, hangs, or returns corrupted responses | Failure propagates | Circuit breakers; fault tolerance | p.46 |
| Emergent cross-system behavior | Interactions absent when systems are tested in isolation | Unforeseen failures | Think about interactions; test in production-like conditions | p.46 |
| Cascading failure | One component's problem overloads the next | Chain of component failures | Avoid feedback loops; load shedding | p.47 |
| Dormant assumption | Software assumes something about its environment that eventually stops being true | Latent bug triggers under unusual circumstances | Carefully examine assumptions; monitor production | p.47 |
| Operator configuration change | Leading cause of outages in one study | Service outage | Rollback mechanisms; gradual rollouts; clear monitoring; good interfaces | p.47 |
| Blaming "human error" | Treating the person as root cause | Counterproductive; hides the sociotechnical problem | Blameless postmortems; learn from frontline staff | p.47-48 |
| Features over testing, then blame | Organizational priorities favor revenue over resilience | Preventable incidents; misdirected blame | Postmortems that revisit priorities and incentives | p.48 |
| Simplistic incident conclusions | "Bob should have been more careful" or "rewrite in Haskell" | No real improvement | Study how the system works for the people using it | p.48 |
| Permanent data loss or corruption | Database corruption without usable backup | Catastrophic for users (family photos) | Prioritize durability; test restore | p.48 |
| Trusting software output as evidence | Legal presumption that computers operate correctly (Horizon) | Wrongful convictions, bankruptcies, suicides | Reliability taken seriously; conscious corner-cutting only | p.48-49 |
| Premature scalability work | Engineering for hypothetical future load | Wasted effort or an inflexible design | Keep new products simple and flexible | p.49 |
| Superlinear cost growth | More data makes each operation more expensive | Cost grows faster than load | Understand load; measure both growth questions | p.50-51 |
| Shared-memory ceiling | Vertical scaling on one big machine | Cost far more than 2x; bottlenecks prevent 2x load | Shared-nothing when needed | p.51 |
| Shared-disk contention | NAS/SAN shared by many machines | Locking overhead limits scalability | Shared-nothing or cloud native storage API | p.51 |
| "Magic scaling sauce" | Belief in a generic scalable architecture | Architecture mismatched to workload | Application-specific design | p.52 |
| Architecture outgrown | Load grows 10x | Existing architecture "unlikely to cope" | Rethink per order of magnitude | p.52 |
| Autoscaling surprises | Automatic resource changes with predictable load | Operational surprises | Manual scaling when load is predictable | p.52 |
| Legacy knowledge loss | Outdated technology (mainframes, COBOL); people leave | Hard, expensive maintenance | Design with maintenance in mind; documentation | p.53 |
| Irony of automation | Only the hardest cases are left to humans; automated failures are opaque | Need for more skilled operators; harder troubleshooting | Find the automation sweet spot; keep manual control | p.53-54 |
| Big ball of mud | Accumulated complexity | Overrun budgets and schedules; more bugs; hidden assumptions overlooked | Simplicity; abstraction | p.54 |
| Irreversible migration | No way back to the old system | Much higher stakes if the new system fails | Minimize irreversibility; keep a rollback path | p.56 |

## Elicitation questions

| question (client language) | concept it decides | page |
|---|---|---|
| Beyond what the system must do, how fast, how reliable, and how available must it be - and can we write those targets down? | Functional vs nonfunctional requirements | p.33 |
| How soon after someone adds or changes something must other users see it (seconds, minutes, next day)? | Timeliness; push vs poll; materialization | p.35 |
| Which screens or queries will be hit most often, and which ones are expensive to compute? | Read/write patterns; materialized views | p.35-36 |
| Are there a few "celebrity" items or power users with vastly more connections or data than average? | Fan-out extremes | p.34, p.36 |
| Is it acceptable to occasionally skip low-value updates for very heavy users? | Lossy delivery | p.36 |
| What response time is acceptable for the main operations: typically, and in the worst case you would still tolerate? | p50 and p99/p999 targets | p.40 |
| Who are your most valuable users, and do they tend to have the most data? | Tail-latency priority | p.40-41 |
| How many requests per second and how much new data per day do you have today, and what are the peaks? | Throughput and load parameters | p.37, p.50 |
| How many people are online at your busiest moment? | Peak concurrency | p.35, p.50 |
| Will you promise performance or availability to customers in a contract with penalties? | SLO vs SLA | p.42 |
| What fraction of requests may fail or be slow before you consider the service broken? | Availability SLO; fault vs failure | p.42-43 |
| What does an outage cost you after 5 minutes, an hour, a day? | Reliability tolerance | p.48 |
| What happens if data is permanently lost or corrupted? Could users or you recover it from a backup? | Durability priority | p.48 |
| Which breakages must the system survive without users noticing: one disk, one server, one datacenter, a whole region? | Fault-tolerance scope | p.44-46 |
| Do you depend on outside services that could slow down or fail, and may they take you down with them? | Dependency faults; circuit breakers | p.38, p.46 |
| May we deliberately break things in a controlled way to prove the system copes? | Fault injection; chaos engineering | p.44 |
| Can maintenance happen without downtime windows? | Rolling upgrades | p.46 |
| Who will operate the system, how skilled are they, and who gets paged at night? | Operability; automation sweet spot | p.53-54 |
| When something goes wrong, how does your organization review it - to assign blame or to learn? | Blameless postmortems | p.47-48 |
| How often do you change configuration or code, and can you undo a change within minutes? | Rollback; gradual rollouts | p.47 |
| Do the system's outputs carry legal or financial weight (accounts, evidence, payroll)? | Reliability consequences (Horizon) | p.48-49 |
| Is this a prototype for an unproven market or something people will depend on? | Conscious reliability trade-offs | p.49 |
| How much growth do you expect in users and data over the next year or two - 2x, 10x? | Order-of-magnitude planning | p.49, p.52 |
| Is your load predictable (daily cycles) or unpredictable (viral spikes)? | Autoscaling vs manual scaling | p.52 |
| What is the ratio of reads to writes, and how much data belongs to a single user? | Load parameters | p.50 |
| How many teams and services do you expect; could it be done with fewer? | Simplicity; 5 services vs 50 | p.52 |
| How long should this system live, and who will maintain it in five or ten years? | Maintainability; legacy | p.52-53 |
| Which choices would be hard to undo (vendor, database, data format), and do we need a way back? | Irreversibility | p.56 |
| What do operators need to see on a dashboard to know the system is healthy? | Monitoring and observability | p.42, p.54 |

## Verifiable properties

| property | how to test | page |
|---|---|---|
| New posts reach online followers within 5 s | Load test: measure post-to-visibility delay; assert p99 under 5 s | p.35 |
| Timeline reads are served from the materialized view | Assert read latency independent of the number of followed accounts; cache hit rate near 100% | p.35-36 |
| Reads stay fast under write spikes | Inject a 150,000 posts/s burst; read latency unchanged; delivery queue grows then drains | p.36 |
| Celebrity posts are never dropped | For accounts above the follower threshold, verify 100% delivery to sampled followers | p.36 |
| Response time is measured client-side | Client-side timers feed the dashboards, not only server service time | p.39 |
| Percentiles are reported, not means | Dashboards show p50, p95, p99, p999 over a rolling 10-minute window refreshed every minute | p.40, p.42 |
| SLO assertions hold | CI or canary check: p50 < 200 ms, p99 < 1 s, error rate below 0.1% of valid requests | p.42 |
| Percentile aggregation merges histograms | Unit test: merged histogram percentiles equal percentiles of the combined raw data; no averaging of percentiles | p.42 |
| Clients back off exponentially with jitter | Inspect retry intervals under injected failures: increasing and randomized | p.38 |
| Circuit breaker opens after errors or timeouts | Fail a dependency; assert calls stop for the cooldown period | p.38 |
| Server sheds load and signals backpressure near capacity | Overload test: requests rejected early or clients told to slow down; no unbounded queue | p.38 |
| No metastable state | After an overload episode ends, throughput and latency recover without a restart | p.38 |
| Tail latency amplification is bounded | End-user p99 within budget when a request fans out to N backend calls | p.41 |
| Fan-out takeover is exactly-once | Kill a fan-out worker mid-batch; verify zero missed and zero duplicated deliveries | p.43-44 |
| No single point of failure within the stated fault budget | Kill any one node (or two disks, per the stated bound); service continues to meet its SLO | p.43-44 |
| Availability-zone loss is tolerated | Disable one zone; service remains available | p.46 |
| Rolling upgrade causes no failed requests | Restart nodes one at a time under load; error count stays zero | p.46 |
| Runaway processes are contained | Exhaust a resource in one process; others keep serving (isolation and limits) | p.46 |
| Configuration changes can be rolled back quickly | Timed drill: revert a config change within the target window | p.47 |
| Gradual rollout gates exist | New code reaches a fraction of nodes first; promotion requires healthy metrics | p.47 |
| Property-based tests exist for core logic | Test suite includes randomized-input properties alongside handwritten tests | p.47 |
| Backups are restorable | Periodic restore drill recreates a user's data from backup | p.48 |
| Linear scalability within the target range | Double resources and load; latency percentiles unchanged | p.50 |
| Headroom for one order of magnitude | Load test at 10x current load to locate the breaking point | p.52 |
| Key metrics are exposed | Monitoring endpoint publishes throughput, latency percentiles, error rate | p.54 |
| Any machine can be taken down for maintenance | Remove a node; system continues uninterrupted | p.54 |
| Operational model is documented | Runbook states "If I do X, Y will happen" for routine operations | p.54 |
| Defaults are overridable | Administrators can override defaults and take manual control of self-healing | p.54 |
| Migrations have a tested way back | Rollback path exercised before an irreversible cutover | p.56 |
| Hardware failure rates are tracked | Observed disk failure rate compared against the 2%-5% expectation; alert on deviation | p.44 |

## Terms

| term | definition | page |
|---|---|---|
| functional requirements | What the application must do: screens, buttons, operations | p.33 |
| nonfunctional requirements | Qualities such as fast, reliable, secure, legally compliant, maintainable | p.33 |
| home timeline | Recent posts by the people a user follows | p.34 |
| polling | Client repeatedly re-running a query to detect changes | p.35 |
| fan-out | Factor by which one request becomes several downstream requests | p.35 |
| materialization | Precomputing and updating the results of a query | p.36 |
| materialized view | Stored, precomputed query result (e.g., the timeline cache) | p.36 |
| response time | Elapsed time from a user's request to receiving the answer; what the client sees | p.37-38 |
| throughput | Requests or data volume processed per second | p.37 |
| queueing | Requests waiting for a busy resource; grows sharply near capacity | p.37 |
| retry storm | Timed-out clients resending requests, amplifying load | p.38 |
| metastable failure | Overloaded state that persists after load drops until reset | p.38 |
| exponential backoff | Increasing, randomized delay between retries | p.38 |
| circuit breaker | Temporarily stopping requests to a failing service | p.38 |
| token bucket | Rate-limiting algorithm used to curb retries | p.38 |
| load shedding | Server proactively rejecting requests when nearing overload | p.38 |
| backpressure | Responses asking clients to slow down | p.38 |
| scalable | Maximum throughput can be significantly increased by adding resources | p.38 |
| service time | Duration the service actively processes a request | p.38 |
| queueing delay | Time waiting for a CPU or network buffer; not part of service time | p.38-39 |
| latency | Time during which a request is latent, not being actively processed | p.39 |
| network latency / network delay | Time a request and response spend traveling through the network | p.39 |
| head-of-line blocking | A few slow requests holding up subsequent ones on limited cores | p.39 |
| jitter | Variation in network delay | p.40 |
| mean (average) | Sum of response times divided by count | p.40 |
| median / p50 | Halfway point of sorted response times | p.40 |
| percentile (p95, p99, p999) | Threshold below which that share of requests fall | p.40 |
| tail latency | High response-time percentiles | p.40 |
| tail latency amplification | Higher share of slow end-user requests when each needs many backend calls | p.41 |
| SLO | Service level objective: target such as median < 200 ms, p99 < 1 s, 99.9% non-error | p.42 |
| SLA | Service level agreement: contract specifying what happens if the SLO is missed | p.42 |
| HdrHistogram, t-digest, OpenHistogram, DDSketch | Open source percentile-estimation libraries | p.42 |
| reliability | "continuing to work correctly, even when things go wrong" | p.43 |
| fault | A part of the system stops working correctly | p.43 |
| failure | The system as a whole stops providing the required service (misses the SLO) | p.43 |
| fault-tolerant | Continues providing service despite certain faults | p.43 |
| single point of failure (SPOF) | A part whose fault escalates to whole-system failure | p.43 |
| exactly-once semantics | Takeover without missing or duplicating work | p.44 |
| fault injection | Deliberately triggering faults (e.g., randomly killing processes) | p.44 |
| chaos engineering | Discipline of experiments that build confidence in fault tolerance | p.44 |
| redundancy | Extra components so a faulty one does not cause failure | p.45 |
| RAID | Data spread across multiple disks in one machine | p.45 |
| availability zone | Cloud grouping of physically co-located resources | p.46 |
| rolling upgrade | Restarting one node at a time without service interruption | p.46 |
| correlated faults | Faults likely to occur together (shared software, shared location) | p.45-46 |
| runaway process | Process consuming a shared limited resource | p.46 |
| cascading failure | One component's problem overloading the next | p.47 |
| emergent behavior | Unexpected interactions between components | p.46-47 |
| sociotechnical system | People and technology together; "human error" is a symptom of its problems | p.47 |
| blameless postmortem | Incident review without fear of punishment, to learn | p.48 |
| property testing | Testing on lots of random inputs | p.47 |
| scalability | A system's ability to cope with increased load | p.49 |
| load / load parameters | Current demand described by throughput, peaks, ratios, items per user | p.50 |
| linear scalability | Double the resources handles double the load at the same performance | p.50 |
| vertical scaling / scaling up | Moving to a more powerful machine | p.51 |
| shared-memory architecture | Parallelism via threads sharing one machine's RAM | p.51 |
| shared-disk architecture | Several machines sharing a disk array over NAS or SAN | p.51 |
| shared-nothing / horizontal scaling / scaling out | Nodes with their own CPUs, RAM, disks, coordinating over the network | p.51 |
| sharding | Splitting data across shared-nothing nodes (Chapter 7) | p.51 |
| magic scaling sauce | The nonexistent generic one-size-fits-all scalable architecture | p.52 |
| autoscaling | Automatically adding or removing resources with demand | p.52 |
| maintainability | Ease of ongoing operation, understanding, and change | p.52-53 |
| legacy system | Long-running system on outdated technology with lost institutional knowledge | p.53 |
| operability | Making it easy for the organization to keep the system running | p.53 |
| simplicity | Easy for new engineers to understand; no unnecessary complexity | p.53 |
| evolvability | Easy to change and extend for unanticipated use cases | p.53, p.56 |
| big ball of mud | A project mired in complexity | p.54 |
| essential vs accidental complexity | Complexity inherent in the problem vs caused by tooling (a flawed but common split) | p.55 |
| abstraction | Hiding implementation detail behind a clean facade; enables reuse | p.55 |
| design patterns / domain-driven design (DDD) | Methodologies for application-level abstractions | p.55 |
| Agile, TDD, refactoring | Working patterns and tools for adapting to change | p.55 |
| irreversibility | Inability to undo a change; raises the stakes of mistakes | p.56 |

## Chapter summary (condensed)

The chapter examined four nonfunctional requirements - performance, reliability, scalability, and maintainability - and introduced principles and terminology used throughout the book (p.56).

It opened with a case study of social-network home timelines to show challenges that arise at scale. It then covered how to measure performance (response time percentiles) and load (throughput metrics), and how these feed SLAs. Scalability is closely related: it "focuses on ensuring that performance stays the same when the load grows". General principles include breaking a task into smaller parts that operate independently; later chapters go deeper into techniques (p.56).

Reliability is achieved through fault-tolerance techniques that keep a system providing its services even when a component - a disk, a machine, another service - is faulty. Hardware faults were distinguished from software faults, which "can be harder to deal with because they are often strongly correlated". Reliability also means resilience against human mistakes; blameless postmortems are a way to learn from incidents (p.56).

Maintainability has several facets: supporting operations teams, managing complexity, and making the application easy to evolve. "There are no easy answers", but building on well-understood building blocks that provide useful abstractions helps; the rest of the book covers a selection of such blocks "that have proved to be valuable in practice" (p.56).

## Second-edition-specific

Material that appears new or substantially expanded relative to the first edition's opening chapter on reliability, scalability, and maintainability:

- Updated case study framed around X (formerly Twitter) with 500 million posts/day, 5,800 posts/s average, 150,000 posts/s spikes, a 5-second timeliness goal, explicit push-vs-poll reasoning, and the Bluesky "lossy timelines" idea of dropping writes for heavy followers (p.34-36).
- "When an Overloaded System Won't Recover": metastable failures, retry storms, exponential backoff with jitter, circuit breakers, token buckets, load shedding, backpressure, queueing and load-balancing algorithm choice (p.38).
- Precise vocabulary separating response time, service time, queueing delay, latency, and network latency, with the message-diagram convention (p.38-39), and fail-slow hardware such as rack vibrations as a latency source (p.39).
- "The User Impact of Response Times" sidebar critically re-examining the Google, Bing, Akamai, and Yahoo latency studies (p.41).
- Expanded percentile tooling (OpenHistogram, DDSketch alongside HdrHistogram and t-digest) and the explicit SLO/SLA worked example (p.42).
- Richer hardware-fault data: SSD failure and uncorrectable-error rates, CPU "cores that don't count", DRAM uncorrectable ECC errors and bit-flipping access patterns, datacenter destruction by fire/flood/earthquake, solar storms (p.44-45).
- Cloud framing of fault tolerance: availability zones, tolerating faulty nodes in software rather than hardening machines, rolling upgrades (p.45-46).
- New correlated-software-fault examples: the 2012 leap second and SSDs dying at 32,768 hours; runaway client libraries (Halo 4) (p.46).
- Sociotechnical view of "human error" (Dekker), configuration changes as the leading outage cause, blameless postmortems, and warnings against simplistic incident conclusions (p.47-48).
- "How Important Is Reliability?" with the British Post Office Horizon scandal and the legal presumption that computers operate correctly (p.48-49).
- "Prefer tolerating faults over preventing them, except security" and the explicit fault-tolerance budget framing (p.44).
- "You're not Google or Amazon" maxim, choose-boring-technology stance, linear scalability and economies of scale (S3, multitenancy), and the order-of-magnitude planning rule (p.49-52).
- Shared-memory vs shared-disk vs shared-nothing discussion placed here, plus cloud native storage/compute separation (Socrates) as a modern shared-disk variant (p.51).
- Autoscaling vs manual scaling and "5 services is simpler than 50" (p.52).
- Maintainability additions: legacy systems as a people problem (Kill It with Fire), Bainbridge's ironies of automation, Brooker's "What Is a Simple System?", Dan Luu's critique of essential vs accidental complexity, and irreversibility as the enemy of evolvability (p.53-56).
