<!-- forge reference: a page-cited digest of Designing Data-Intensive Applications, 2nd ed. (Kleppmann & Riccomini, O'Reilly 2026), chapter 9. Written while reading the chapter; every rule, number, failure mode, question and property carries its page. The condensed layer is references/data-intensive-protocol.md (§0-§8); the row-level map is references/data-intensive-book-map.md; this file is the full layer the requirements data round and the build Phase 4 review consult for the chapters a DATA.md group cites. -->

# Digest: Chapter 9 - The Trouble with Distributed Systems (DDIA 2nd ed., pp.345-399)

## Thesis

Distributed systems are defined by partial failure: some parts break unpredictably while others keep working, and the failures are nondeterministic, so "you may not even know whether something succeeded" (p.346). The three sources of trouble are an asynchronous network that may lose or arbitrarily delay messages, clocks that drift, jump, or are plain wrong, and processes that pause for unbounded time and resume without noticing (p.388). A node can learn about other nodes only through messages, so it cannot distinguish a dead node from a slow one or from a broken network (p.371); hence "suspicion, pessimism, and paranoia pay off" (p.346). The way out is to state a system model (partially synchronous with crash-recovery faults is the most useful, p.381), require safety properties to hold always and liveness only under caveats (p.383), replace single-node judgment with quorums (p.372), fence off zombies with monotonically increasing tokens (p.375), and verify with formal methods, fault injection, and deterministic simulation (p.384-387). Unreliability is a cost trade-off, not a law of nature: bounded delays and hard real-time guarantees are possible but expensive, so "most non-safety-critical systems choose cheap and unreliable over expensive and reliable" (p.389).

## Decision rules

| rule | when it applies | why (mechanism) | page |
|---|---|---|---|
| Prefer a component that crashes completely over one that returns a wrong result | designing any node or subsystem | "wrong results are difficult and confusing to deal with"; a crash is a clean, detectable fault | p.346 |
| Consider a wide range of faults, even unlikely ones, and artificially create them in your test environment | before implementing fault tolerance | "in a large enough system, one-in-a-million events happen every day"; you must know which faults you are tolerating | p.345-346 |
| Treat the network as an asynchronous packet network: a request may be lost, queued, or delayed, and so may the reply | every network request | the network "gives no guarantees as to when it will arrive or whether it will arrive at all"; the only signal you have is "you haven't received a response yet" | p.347-348 |
| Use a timeout to stop waiting, but never infer that the request was not processed | handling a missing response | a timed-out request may still be queued and delivered to the recipient later | p.348 |
| Do not take TCP "reliability" as proof of processing; require a positive response from the application itself | any request whose success matters | a TCP ack means only the remote kernel received the data; the application may have crashed before handling it | p.349 |
| Expect duplicate data when an application reconnects and retransmits | retry logic across connections | TCP deduplication and retransmission apply only within a single connection | p.349 |
| Assume messages may be delayed arbitrarily, even by minutes | setting any timing assumption | RTTs of several minutes across regions and delays over a minute within one datacenter have been observed | p.350 |
| Do not assume that a link working in one direction works in the other, or that connectivity is transitive | failure detection and routing logic | interfaces exist that drop all inbound packets but send outbound; A-B and B-C can work while A-C cannot | p.350 |
| Define and test the error handling for network faults | any distributed component | undefined handling has caused permanently deadlocked clusters and deletion of all data | p.351 |
| Handling a fault need not mean tolerating it: showing users an error during a network problem is valid if the network is normally reliable | choosing the scope of fault tolerance | you must still "know how your software reacts to network problems and ensure that the system can recover" | p.351 |
| Use explicit failure signals when available (TCP RST/FIN, crash-notification scripts as in HBase, switch management interfaces, ICMP Destination Unreachable) but never count on them | fault detection | "in general you have to assume that you will get no response at all"; rapid feedback is a bonus | p.351-352 |
| Balance the timeout: too short declares live nodes dead, too long delays recovery | choosing a failure-detection timeout | a prematurely dead node may have an action "performed twice"; its transferred load can overload others | p.352 |
| Avoid declaring nodes dead when the system is already under high load | overloaded clusters | transferring a merely slow node's load can cause a cascading failure in which "all nodes declare each other dead" | p.352 |
| Prefer UDP over TCP when delayed data is worthless (VoIP, videoconferencing) | latency-sensitive media | UDP skips flow control and retransmission, removing some sources of delay variability; "the retry happens at the human layer" | p.354 |
| Choose timeouts experimentally: measure the RTT distribution over an extended period and across many machines | multitenant clouds and shared networks | noisy neighbors make delay highly variable; "there's no 'correct' value for timeouts" | p.355, p.357 |
| Better: continually measure response times and jitter and adjust timeouts automatically (Phi Accrual failure detector, used in Akka and Cassandra) | production failure detection | the response-time distribution shifts with load; TCP retransmission timeouts work the same way | p.355 |
| Accept variable delay as the price of utilization; buy bounded delay only through static resource partitioning (dedicated hardware, exclusive bandwidth) | choosing between cheap shared infrastructure and guaranteed latency | packet switching maximizes wire utilization but queues; circuits reserve bandwidth and waste it when idle | p.356-357 |
| Do not expect QoS or circuit-like guarantees in multitenant datacenters, public clouds, or the internet | planning network assumptions | such mechanisms "are not currently enabled" there; assume congestion, queueing, and unbounded delays | p.357 |
| Use a monotonic clock for durations (timeouts, response times); use a time-of-day clock only for points in time | any time measurement | time-of-day clocks can be forcibly reset backward by NTP or jump at leap seconds; a monotonic clock "is guaranteed to always move forward" | p.359-360 |
| Never compare monotonic clock values from two different machines | distributed timing logic | the absolute value is arbitrary (e.g., nanoseconds since boot) | p.360 |
| Always use UTC as the time zone | storing or comparing wall-clock times | UTC has no Daylight Saving Time jumps | p.359 |
| Take the OS guarantee of monotonicity "with a pinch of salt" on multi-socket servers | high-precision timing on large servers | separate per-CPU timers are not necessarily synchronized | p.360 |
| Do not trust hardware clocks on devices you do not control (mobile, embedded) | client-generated timestamps | users deliberately set wrong clocks, e.g., to cheat in games | p.361 |
| If software requires synchronized clocks, monitor the clock offsets between all machines and remove any node that drifts too far | any clock-dependent system | faulty clocks go unnoticed because "most things will seem to work fine"; the result is "silent and subtle data loss" | p.362 |
| Do not order cross-node events by time-of-day timestamps; use logical clocks (and version vectors for causality) | conflict resolution, event ordering | a causally later write can carry an earlier timestamp with under 3 ms skew, and LWW then drops it | p.363-364 |
| If you must use LWW, ensure the overwriting value always gets a higher timestamp than the overwritten one (costs an extra read) | LWW stores (Cassandra and ScyllaDB skip this round trip) | otherwise a node with a lagging clock cannot overwrite a faster node's writes until the skew has elapsed | p.363 |
| Treat a clock reading as a confidence interval, not a point in time | any reasoning about "now" | with +/-100 ms uncertainty "the microsecond digits in the timestamp are essentially meaningless" | p.365 |
| Prefer clock APIs that return [earliest, latest] (Spanner TrueTime, Amazon ClockBound) when correctness depends on time | clock-dependent databases | clock_gettime gives no error bound, so "you don't know whether its confidence interval is five milliseconds or five years" | p.365 |
| To use clock timestamps as transaction IDs, wait out the confidence interval before committing (Spanner commit wait); accurate clock hardware only shortens the wait | distributed snapshot isolation | non-overlapping intervals guarantee ordering; "the important thing is to have a confidence interval" | p.366 |
| Do not compare a lease expiry computed on another machine against the local clock | lease-based leadership | the two clocks may be out of sync by seconds | p.367 |
| Do not assume little time passes between checking a lease (or any condition) and acting on it | any check-then-act with a deadline | a 15 s pause around lease.isValid lets the lease expire mid-request | p.367 |
| Assume a thread can be paused at any point for a long time and resume without noticing | all distributed code | GC, VM suspend, laptop lid, context switch and steal time, synchronous disk I/O, page faults, SIGSTOP | p.367-369 |
| Disable swapping on servers; prefer killing a process to thrashing | server configuration | a page fault pauses the thread on slow I/O; under memory pressure the OS "may spend most of its time swapping" | p.368 |
| Reserve hard real-time engineering (RTOS, documented worst-case execution times, restricted allocation) for safety-critical embedded systems | choosing a platform | it "severely restricts the range of programming languages, libraries, and tools" and may lower throughput; "not economical or appropriate" for most server-side systems | p.369-370 |
| Limit GC impact: tune the collector, use a GC-free language (Rust, Swift, Mojo), pool objects or allocate off-heap, treat GC as a planned mini-outage and shift traffic away, or restart processes before a full GC | latency-sensitive services on managed runtimes | these cannot prevent pauses but reduce the high percentiles of response time | p.370-371 |
| Rely on a quorum, not any single node, for decisions, including declaring nodes dead | leader election, failure detection | "a node cannot necessarily trust its own judgment"; there can be only one majority | p.372-373 |
| A node declared dead by the quorum must step down even if it feels alive | leaders and leaseholders | otherwise two nodes act as owner (split brain) | p.372 |
| Before using a lease, decide what happens if several nodes simultaneously believe they hold it | locks and leases | wasted compute (duplicate batch work) is acceptable; a duplicate leader or concurrent writers means "lost or corrupted data" | p.373 |
| Do not rely on STONITH-style shutdown (network disconnect, VM kill, power off) as your fencing | zombie leaseholders | it does not protect against delayed requests, "all the nodes could shut one another down," and detection may come too late | p.375 |
| Fence with a token that increases on every lease grant; storage rejects writes carrying a lower token than one already seen; the new holder writes immediately | shared resources protected by leases | zombies and delayed requests carry an old token and are rejected permanently (unlike retryable OCC failures) | p.375-376 |
| Reuse existing monotonic counters as fencing tokens: ZooKeeper zxid or cversion, etcd revision plus lease ID, Hazelcast FencedLock, Chubby sequencers, Kafka epoch numbers, Paxos ballot or Raft term | picking a lock service | they already increase with every grant | p.375-376 |
| Or use conditional writes (S3 conditional writes, Azure Blob conditional headers, GCS request preconditions) as a CAS-style check | object storage behind a lease | the write succeeds only if the object has not been written since the client last read it | p.376 |
| If clients write to only one store that supports conditional writes, skip the separate lock service | simple single-store designs | the lease can be implemented on the store directly; tokens pay off when fencing across multiple services or replicas | p.376 |
| For leaderless LWW replicas, put the fencing token in the most significant bits of the write timestamp | fencing across multiple replicas | every timestamp from the new holder exceeds any from the old one even if the old writes happen later; quorum reads and anti-entropy clean up stragglers | p.376-377 |
| Assume nodes are "unreliable but honest"; do not deploy Byzantine fault tolerance in ordinary datacenter systems | server-side data systems | BFT protocols are expensive; your organization controls all nodes; tenants are isolated by firewalls and virtualization, not BFT | p.377-379 |
| Use BFT only where it is warranted: aerospace (radiation), mutually untrusting multi-party systems (blockchains), peer-to-peer networks | special environments | memory can be corrupted by radiation; parties may defraud each other; there is no central authority | p.378-379 |
| Treat browsers and other end-user clients as potentially malicious via input validation, sanitization, and output escaping; make the server the authority | web applications | prevents SQL injection and XSS without BFT protocols | p.379 |
| Do not expect any protocol to protect against bugs or compromises when every node runs the same software; keep traditional security controls | security planning | BFT needs over two-thirds correct nodes and independent implementations; an attacker who compromises one node "can probably compromise all of them" | p.379 |
| Guard against weak forms of lying: application-level checksums or TLS, range and size checks even for internal services, several NTP servers with outlier rejection | pragmatic reliability | corrupted packets sometimes evade TCP/UDP checksums; a misconfigured NTP server is excluded as an outlier | p.379-380 |
| Model real systems as partially synchronous with crash-recovery faults | choosing the system model for an algorithm | it allows unbounded delay, pauses, and slow nodes while staying tractable | p.381 |
| Require safety properties in all situations; allow caveats on liveness (e.g., only if a majority is up and the network eventually recovers) | specifying algorithm correctness | a violated safety property "cannot be undone"; a liveness property can still be satisfied later | p.382-383 |
| Keep code for cases the model says cannot happen, even if it just stops and lets a human clean up | implementing an algorithm from a model | stable storage can be corrupted or wiped; a node with amnesia breaks the quorum condition | p.383-384 |
| Combine formal verification with randomized empirical testing (property-based testing, fuzzing, deterministic simulation) | verifying distributed algorithms | proofs catch design flaws hidden for years; implementations still diverge from the model | p.384 |
| Use a model checker with a specification language (TLA+, Gallina, FizzBee), bound the state space, and check that model and implementation stay equivalent | protocol design | real state spaces are infinite; "your specification and your implementation go out of sync" | p.384-385 |
| Use a fault-injection framework (Jepsen) in a production-like environment instead of ad hoc kill/umount/firewall scripts | integration testing | many tools are needed to trigger faults; Jepsen "has been remarkably effective at finding critical bugs" | p.385-386 |
| Build for deterministic simulation testing: mock network, I/O, clocks, and scheduling at the application (FoundationDB Flow, TigerBeetle), runtime (FrostDB, MadSim), or machine level (Antithesis) | systems that must be testable under faults | failures replay exactly; simulated time runs faster than wall-clock | p.386-387 |
| Hunt residual nondeterminism (hash-table iteration order, memory and stack limits) | making code deterministic | it survives even after mocking I/O, clocks, and random numbers | p.388 |
| If you can keep a problem on a single machine (e.g., an embedded storage engine), do so | scoping a system | avoids "opening Pandora's box"; "a single computer can do a lot nowadays" | p.389 |
| Go distributed for fault tolerance and low latency, not only scalability; still protect configuration rollouts | justifying distribution | a bad configuration change rolled out to all nodes "will still bring a distributed system to its knees" | p.389 |
| Use extensively tested, production-grade distributed systems rather than rolling your own | build vs buy | they manage these problems for you | p.389 |

## Metrics and numbers

| metric or quantity | definition / how measured | values or thresholds the book gives | caveats | page |
|---|---|---|---|---|
| Network faults per month | count in a study of a medium-sized datacenter | about 12 per month; half disconnected one machine, half an entire rack | redundant gear does not reduce faults as much as expected; human error is a major cause | p.350 |
| Cross-region round-trip time | high-percentile RTT between cloud regions | up to several minutes | messages must be assumed arbitrarily delayed | p.350 |
| In-datacenter packet delay | delay during a network topology reconfiguration after a switch software upgrade | more than a minute | triggered by routine maintenance | p.350 |
| Timeout bound 2d + r | maximum one-way network delay d plus maximum processing time r | a reasonable timeout only if both bounds are guaranteed | "most systems we work with have neither of those guarantees" | p.353 |
| VM scheduling pause | time a VM is paused while another VM uses the CPU core | tens of milliseconds | shows up as queued network data and as the clock jumping forward | p.353, p.361 |
| ISDN circuit allocation | fixed bandwidth reserved per call | 4,000 frames per second; 16 bits per frame per direction, i.e., 16 bits every 250 microseconds | bounded delay comes from static reservation | p.355 |
| Trunk capacity | simultaneous call slots on a telephone wire | 10,000 calls | each circuit gets the same bandwidth whether 1 or 10,000 slots are in use | p.356 |
| Legacy time-of-day resolution | step size of older Windows clocks | 10 ms steps | less of a problem on recent systems | p.359 |
| NTP slew limit | maximum rate adjustment to the monotonic clock | up to 0.05% faster or slower | NTP cannot make the monotonic clock jump | p.360 |
| Monotonic clock resolution | smallest measurable interval | microseconds or less | per-CPU timers may be unsynchronized | p.360 |
| Quartz drift | rate error Google assumes for its servers | 200 ppm; equals 6 ms drift with resync every 30 s, or 17 s drift with resync once a day | varies with temperature; bounds the best achievable accuracy | p.360 |
| NTP accuracy over the internet | minimum achievable synchronization error | about 35 ms; spikes to around a second with network delay | large delays can make the NTP client give up entirely | p.361 |
| Misconfigured NTP servers | error reported by some public servers | off by hours | clients query several servers and ignore outliers | p.361 |
| Leap second | length of the affected minute | 59 or 61 seconds | has crashed many large systems; smearing spreads it over a day; no more leap seconds from 2035 | p.361 |
| MiFID II clock requirement | regulatory sync accuracy for high-frequency trading | within 100 microseconds of UTC | needs GPS or atomic clocks, PTP, careful monitoring; GPS can be jammed | p.361 |
| Clock skew in Figure 9-3 | skew between nodes 1 and 3 in the LWW example | less than 3 ms | "probably better than you can expect in practice"; still reorders causally related writes | p.363 |
| Clock accuracy by time source | best-case accuracy of a time-of-day clock | several ms drift even with a LAN NTP server every minute; tens of ms with public internet NTP; errors over 100 ms under congestion | at that uncertainty the microsecond digits are meaningless | p.364-365 |
| Confidence interval example | clock reading expressed as a range | 95% confident that now is between 10.3 and 10.5 s past the minute; +/-100 ms | most APIs (clock_gettime) do not expose the uncertainty | p.365 |
| Spanner clock uncertainty | synchronization achieved with a GPS receiver or atomic clock in each datacenter | about 7 ms | the commit wait equals the interval length; a smaller interval means a shorter wait | p.366 |
| Lease parameters in the example code | renewal buffer and lease term | renew when fewer than 10 s remain; expiry computed as now + 30 s | a 15 s pause defeats the 10 s buffer | p.367 |
| Stop-the-world GC pause | worst case historically vs a tuned modern collector | "several minutes" in the past; "no more than a few milliseconds" when properly tuned | still noticeable; GC and I/O pauses can combine | p.368, p.370 |
| Paused-node scenario | pause long enough to be declared dead | one minute | the node resumes unaware that time has passed | p.372 |
| Majority quorum tolerance | faulty nodes tolerated by a more-than-half quorum | 3 nodes tolerate 1 fault; 5 nodes tolerate 2 | only one majority can exist at a time | p.372-373 |
| Fencing token example | lock-grant counter | client 1 gets 33, client 2 gets 34; a later write with 33 is rejected once 34 has been seen | fencing is permanent, unlike retryable OCC failures | p.375-376 |
| BFT supermajority | correct nodes required by most Byzantine algorithms | more than two-thirds; with 4 nodes at most 1 may malfunction | to use it against bugs you would need 4 independent implementations | p.379 |
| Limping network interface | throughput collapse from a driver bug | Gigabit interface dropping to 1 Kb/s | the node still answers health checks (gray failure) | p.381 |
| Phi Accrual failure detector | adaptive timeout from the observed response-time distribution | no fixed value; used in Akka and Cassandra | TCP retransmission timeouts adapt similarly | p.355 |
| Model-checker execution bound | cap on the explored state space | e.g., a maximum number of messages sent | bugs that need longer executions are not found | p.385 |
| Network packet size | maximum size of one packet | "generally a few kilobytes" | larger messages need a stream protocol like TCP | p.348 |

## Failure modes and anti-patterns

| failure mode | cause | consequence | mitigation the book gives | page |
|---|---|---|---|---|
| Missing response is ambiguous | request lost, queued, remote crashed, remote paused, response lost, or response delayed | sender cannot tell which happened or whether the request was processed | timeout, then handle "do not know" explicitly; require positive application-level response | p.347-349 |
| TCP ack mistaken for success | ack means the remote kernel received the data | application may have crashed before handling it; after a connection error you cannot know how much was processed | end-to-end application acknowledgment | p.349 |
| Duplicated data after reconnect | TCP dedup covers one connection only | application retries duplicate writes | treat as a known hazard (deduplication discussed in later chapters) | p.349 |
| Physical and human network faults | unplugged cables, misconfigured switches, cows, beavers, sharks, scavenging, sabotage | links down for arbitrary periods | assume faults; redundancy helps less than expected because misconfiguration dominates | p.350 |
| Asymmetric or partial connectivity | interface drops inbound but sends outbound; A-B and B-C up while A-C down | a healthy node is declared dead; inconsistent views of membership | quorum-based decisions; the declared-dead node steps down | p.350, p.372 |
| Long aftermath of a brief interruption | repercussions outlast the fault | extended degradation | test recovery after faults | p.350 |
| Undefined network-fault handling | software put in an unanticipated situation | cluster deadlocked even after the network recovers; "it could potentially delete all of your data" | define and test error handling; deliberately trigger faults | p.351 |
| Premature death declaration | timeout too short or node merely slow | duplicate actions (email sent twice); cascading failure as load shifts to struggling nodes | balance timeout; adaptive detectors; quorum decisions | p.352 |
| Switch queue overflow | several senders target one link | packets dropped "even though the network is functioning fine," then resent after timeout | spare capacity; accept variable delay | p.353 |
| Noisy neighbor | shared links, switches, NICs, CPUs in multitenant clouds | highly variable delays with no visibility into the cause | measure timeouts experimentally over long periods | p.355 |
| Clock jumps backward or forward | NTP forcibly resets a clock too far off; leap seconds; VM pause | elapsed-time measurements go negative or huge | monotonic clock for durations | p.359-361 |
| Node firewalled off from NTP | misconfiguration unnoticed | drift accumulates to large discrepancies | monitor clock offsets; remove drifting nodes | p.360, p.362 |
| Wrong NTP server | misconfigured server reports time off by hours | clients follow a wrong time source | query multiple servers and drop outliers | p.361, p.380 |
| Leap-second crashes | systems assume 60-second minutes | many large systems have crashed | smear the leap second over a day | p.361 |
| Virtualized clock jump | VM paused while another VM runs | clock appears to jump forward; NTP client misreports accuracy | treat clock readings as uncertain | p.361 |
| Untrusted device clocks | users set phones or embedded devices to wrong times | wildly inaccurate client timestamps | do not trust device clocks | p.361 |
| GPS jamming | interference near military facilities and elsewhere | loss of the high-accuracy time source | do not rely on GPS alone | p.361 |
| Silent data loss from clock reliance | software assumes synchronized clocks that quietly drift | "silent and subtle data loss" rather than a crash | monitor offsets; avoid clock-dependent correctness | p.362 |
| LWW drops a causally later write | timestamp order disagrees with causal order (Figure 9-3) | increment lost; write by client B discarded as "older" | logical clocks, version vectors | p.363 |
| Writes "mysteriously disappear" | a node with a lagging clock cannot overwrite a faster node's values | arbitrary amounts of data silently dropped without error | read the greatest existing timestamp before writing; avoid clock-based LWW | p.363 |
| Timestamp collisions | millisecond resolution on two nodes | ties need a tiebreaker (large random number), which can itself violate causality | logical clocks | p.364 |
| Packet appears to arrive before it was sent | sender's clock ahead of receiver's | impossible orderings even with tight NTP sync | clock error would need to be far below network delay, which is impossible | p.364 |
| Overlapping transaction timestamps | clock uncertainty across datacenters | snapshot not consistent with causality | Spanner waits out the confidence interval before committing | p.366 |
| Lease checked against the wrong clock | expiry set by another machine compared with local time | "strange things" once clocks differ by seconds | use local monotonic measurements; fencing | p.367 |
| Pause between lease check and action | GC, VM suspend, scheduling, I/O, swapping, SIGSTOP | request processed after the lease expired and another leader took over | fencing tokens; assume pauses anywhere | p.367-369 |
| Thread contention on shared locks or queues | many cores, hard-to-diagnose contention (Roblox incident cited) | long waits that look like pauses | design for pauses | p.367 |
| Lazy classloading or network block devices stall | Java loads classes on first use; EBS adds network latency to "disk" | surprise I/O pauses that can compound with GC pauses | expect pauses; off-heap or pooled allocation | p.368 |
| Thrashing | paging under memory pressure | OS spends most of its time swapping | disable paging; kill processes instead | p.368 |
| Accidental SIGSTOP | operator presses Ctrl-Z or sends the signal | process frozen until SIGCONT | treat as another pause source | p.369 |
| Zombie leader | paused or semi-disconnected node resumes believing it is still leader | acts on expired lease; split brain | fencing tokens; quorum declares it dead and it steps down | p.372-375 |
| Split-brain file corruption | expired lease plus continued writing (HBase had this bug) | two clients write the same file | fencing tokens; new holder writes immediately | p.373-375 |
| Delayed write from a crashed client | write delayed in the network beyond lease expiry | arrives after a new leaseholder has written, corrupting the file | storage rejects writes with stale tokens | p.374-375 |
| STONITH cannot stop it | shutting down the old node does not stop in-flight messages | delayed requests still land; nodes may shut each other down (GitHub incident cited) | token-based fencing | p.375 |
| Fake fencing token | a node deliberately subverts the protocol | fencing defeated | out of scope: Byzantine faults assumed absent | p.377 |
| Radiation-induced corruption | aerospace environments | nodes respond arbitrarily | Byzantine fault-tolerant flight control | p.378 |
| Corrupted packets that pass checksums | hardware, driver, or OS bugs (ZooKeeper "poison packet" cited) | malformed data accepted | application-level checksums; TLS; basic protocol-parser checks | p.379-380 |
| Denial of service via huge inputs | unbounded string sizes or values | large memory allocations | limit sizes and ranges even for internal services | p.380 |
| Limping node / gray failure / fail-slow | NIC at 1 Kb/s, GC-bound process, worn SSDs, heat, loose connectors, firmware | passes health checks but does no useful work; "even more difficult to deal with than a cleanly failed node" | recognize degraded performance as a fault class | p.381 |
| Partial process failure | background thread crashed or deadlocked | some functions stop while others continue | detect partial failures explicitly | p.381 |
| Stable storage lost | disk corrupted or wiped; firmware fails to see drives after reboot | node "amnesia" breaks quorum correctness | handle the "impossible" case, even by stopping for human cleanup | p.383-384 |
| Spec-implementation drift | model checker verifies a simplified model, not the code | verified model, buggy system | instrument the implementation to compare behaviors | p.385 |
| Ambiguous prose specification | viewstamped replication described informally | TLA+ showed potential data loss | formal specification | p.385 |
| Bounded model checking misses deep bugs | execution capped (e.g., max messages) | bugs needing longer runs not found | complement with DST and fault injection | p.385 |
| Residual nondeterminism in "deterministic" tests | hash-table iteration order, memory or stack limits | replays diverge | remove or control these sources | p.388 |
| Global bad configuration | change rolled out to all nodes at once | the whole distributed system goes down despite node-level fault tolerance | careful rollout (rolling upgrades one node at a time) | p.346, p.389 |

## Elicitation questions

- If one of our servers becomes unreachable for a minute, is it acceptable to show users an error message, or must everything keep working seamlessly? [fault tolerance scope vs error display, p.351]
- How quickly must we notice that a server has failed, and which is worse for you: reacting slowly, or occasionally treating a healthy server as dead? [timeout trade-off, p.352]
- Are there actions that must happen exactly once (sending an email, charging a card, posting an order)? What is the harm if one happens twice? [premature death declaration and duplicates, p.349, p.352]
- Do you need accurate wall-clock timestamps for legal, audit, or regulatory reasons (for example financial rules requiring microsecond accuracy)? To what precision? [clock accuracy, MiFID II, p.361]
- When two people change the same record at the same time from different places, which change should win, and is it acceptable for a change to be silently lost? [LWW and ordering by clocks, p.363]
- Is there anything that must have exactly one owner at a time (one active process per customer, one editor per document, one handler per file)? What happens if two briefly act as owner? [leases, fencing, p.373]
- Would the system run on devices you do not control (phones, kiosks, embedded hardware) whose clocks may be set wrongly? [untrusted clocks, p.361]
- Will the service run across several regions, or in a shared public cloud? How much variation in response time can your users tolerate? [variable delays, noisy neighbors, p.355]
- Does any part of the product control physical equipment or need a guaranteed reaction time? [hard real-time vs best effort, p.369]
- Can you accept occasional pauses of a few seconds in a server, or must response times be tightly bounded? [GC and process pauses, p.368-371]
- Are all the machines in the system operated by you, or do outside parties participate who might cheat? [Byzantine faults, p.377-379]
- Is the system reachable from the public internet, or only from inside your network? [input validation, weak forms of lying, p.379-380]
- Which is worse for you: the system stopping for a while, or the system continuing but producing a wrong answer? [safety vs liveness, p.382-383]
- How many machines may fail at the same time while the service must keep working? [quorum sizing, p.372-373]
- If a server loses its disk contents, must the system still be correct, or is restoring from backup with some loss acceptable? [crash-recovery model and stable storage, p.381, p.383]
- May we deliberately inject failures (kill servers, cut network links) in a staging environment, or even in production, to test recovery? [fault injection, chaos engineering, p.385]
- Is it acceptable to restart servers one at a time for upgrades while the service continues? [rolling upgrades, p.346]
- Could the whole workload reasonably run on one machine, or do you need geographic spread or multi-machine fault tolerance? [single node vs distributed, p.389]
- Do you depend on time-based expiry (sessions, caches, reminders) where a wrong clock would cause user-visible damage? [time-of-day vs monotonic clocks, p.358-360]

## Verifiable properties

| property | how to test | page |
|---|---|---|
| Fencing token uniqueness: no two requests return the same token | request many tokens concurrently and under injected crashes; assert all distinct | p.382 |
| Monotonic sequence: if request x completed before y began, token x < token y | record completion and start times; check ordering of returned tokens | p.382 |
| Availability (liveness): a non-crashed requester eventually receives a token | run with partitions and a majority alive; assert eventual response | p.382-383 |
| Storage rejects writes whose token is lower than one already seen | replay an old-token write after a new-token write; expect rejection | p.375-376 |
| New leaseholder's writes win on every replica, including stragglers | token in the most significant bits of the timestamp; quorum read returns the new holder's value; anti-entropy converges | p.376-377 |
| Safety properties hold even if all nodes crash or the network fails entirely | inject total failures; assert no wrong result was ever returned | p.383 |
| Timeouts and durations are measured with a monotonic clock | step the time-of-day clock backward during a test; durations must stay non-negative | p.359-360 |
| Clock offsets are monitored and a node that drifts beyond a threshold is removed | skew one node's clock; assert it is declared dead and removed | p.362 |
| Causal order of writes is never inverted by timestamps | reproduce Figure 9-3 (write, replicate, increment) with skewed clocks; the increment must survive | p.363 |
| Error handling for network faults is defined: cluster recovers after a partition heals and no data is deleted | partition the cluster, heal it, verify progress and data integrity | p.351 |
| A paused leaseholder cannot corrupt data | SIGSTOP the holder past lease expiry, let another take over, SIGCONT, verify no clashing writes | p.367, p.369, p.373 |
| Delayed request from a former holder is rejected | hold a write in a proxy until the lease expires and another holder writes; the late write must fail | p.374-375 |
| Quorum of more than n/2 is required for membership and leadership decisions | split into minority and majority; only the majority may decide; the minority leader steps down | p.372 |
| Conditional writes on object storage behave as CAS | two clients write with preconditions; exactly one succeeds | p.376 |
| Application-level checksums detect corrupted payloads | flip bits in transit; the receiver must reject | p.380 |
| Input size and range limits are enforced | send oversize strings and out-of-range values; expect rejection without large allocations | p.380 |
| NTP configuration uses multiple servers with outlier rejection | point one server at a wrong time; the client must ignore it | p.380 |
| Invariants hold in a bounded model check (TLA+, Gallina, FizzBee) | run the model checker with an execution bound; no invariant violation | p.384-385 |
| Model and implementation behave equivalently | instrument the implementation and compare traces with the model | p.385 |
| System survives injected faults in a production-like environment | Jepsen-style harness: kill processes, umount disks, firewall links; check invariants | p.385-386 |
| Deterministic simulation: same seed reproduces the same failure | run randomized executions with mocked network, I/O, clock; replay a failing seed | p.386-387 |
| Property-based tests and fuzzing find no invariant violations | randomized inputs and interleavings against stated properties | p.384 |
| Code is deterministic given deterministic inputs | run twice with identical mocks; outputs identical; no hash-order dependence | p.388 |
| GC pauses stay within budget | measure pause times under load; assert "no more than a few milliseconds" for a tuned collector | p.370 |
| Rolling restart keeps the service available | restart one node at a time with traffic shifted away; no failed requests | p.346, p.371 |

## Terms

- Partial failure: some parts of a system broken unpredictably while others work (p.346).
- Nondeterminism: the same distributed operation may sometimes work and sometimes fail (p.346).
- Shared-nothing architecture: machines with their own memory and disk communicating only over the network (p.347).
- Asynchronous packet network: delivers packets with no guarantee of timing or arrival (p.347).
- Timeout: giving up waiting for a response after some time, without learning what happened (p.348).
- TCP: connection protocol that splits streams into packets, retransmits, reorders, checksums (p.348-349); QUIC, SCTP, uTP are related transports (p.348).
- Congestion control / flow control / backpressure: rate adaptation so as not to overload network or receiver (p.349).
- Network partition (netsplit): one part of the network cut off from the rest; unrelated to sharding (p.351).
- Fault detection: deciding that a node is dead, usually by timeout (p.351-352).
- Unbounded delay: no upper limit on packet delivery time (p.353).
- Network congestion: packets queued at a switch for a busy link (p.353).
- Noisy neighbor: another tenant's usage inflating your delays on shared resources (p.355).
- Jitter: variability of response times (p.355).
- Phi Accrual failure detector: adaptive timeout based on the observed response-time distribution (p.355).
- Synchronous network: circuit-based network with reserved bandwidth and bounded delay (p.355).
- Circuit: fixed bandwidth allocated end to end for a call (p.355).
- Bounded delay: fixed maximum end-to-end latency (p.355).
- Packet switching: dynamic sharing of bandwidth optimized for bursty traffic (p.356).
- Quality of service (QoS): prioritization, scheduling, admission control to emulate circuits (p.357).
- L4S: Low Latency, Low Loss, and Scalable Throughput, a congestion-control approach (p.357).
- Time-of-day clock (wall-clock time): seconds since the epoch, NTP-synchronized, may jump (p.359).
- Monotonic clock: always moves forward; good for durations; absolute value meaningless (p.359-360).
- NTP: Network Time Protocol for adjusting clocks from server time (p.358).
- Slewing: NTP adjusting the clock rate rather than jumping it (p.360).
- Clock drift: a quartz clock running fast or slow, measured in ppm (p.360).
- Leap second: a 59- or 61-second minute (p.361); smearing: spreading the adjustment over a day (p.361).
- PTP: Precision Time Protocol for high-accuracy synchronization (p.361).
- Confidence interval: range [earliest, latest] within which the true time lies (p.365).
- TrueTime / ClockBound: Spanner and Amazon APIs that report the clock's confidence interval (p.365).
- Commit wait: Spanner delaying commit for the confidence-interval length (p.366).
- Logical clock: counter-based clock giving only relative ordering (p.364).
- Physical clock: time-of-day or monotonic clock measuring elapsed time (p.364).
- Last write wins (LWW): keep the write with the greatest timestamp, discard others (p.363).
- Version vectors: causality-tracking mechanism to detect concurrent writes (p.364).
- Lease: a lock with a timeout that must be periodically renewed (p.366).
- Process pause: a thread stopped for an arbitrary time by GC, VM, OS, I/O, or signals (p.367-369).
- Stop-the-world GC: collector pausing all threads (p.368).
- Steal time: CPU time spent in other VMs on the same core (p.368).
- Thrashing: OS spending most time swapping pages (p.368).
- SIGSTOP / SIGCONT: Unix signals that pause and resume a process (p.369).
- Hard real-time system: must respond by a specified deadline (p.369).
- RTOS: real-time operating system with guaranteed CPU scheduling (p.370).
- Quorum: minimum number of votes required for a decision; usually a majority (p.372).
- Split brain: two nodes both believing they are leader (p.373).
- Zombie: former leaseholder that has not yet learned it lost the lease (p.374).
- Fencing: preventing a zombie from doing damage (p.374).
- STONITH: "shoot the other node in the head," fencing by shutting down the node (p.375).
- Fencing token: number increasing with each lock grant, checked by the resource (p.375).
- Sequencer (Chubby), epoch number (Kafka), ballot number (Paxos), term number (Raft): fencing-token equivalents (p.375).
- zxid, cversion (ZooKeeper), revision (etcd): usable fencing tokens (p.376).
- Conditional writes / conditional headers / request preconditions: CAS-like checks in S3, Azure Blob Storage, GCS (p.376).
- Optimistic concurrency control (OCC): retryable check at commit; fencing is the permanent analogue (p.376).
- Byzantine fault: a node sending arbitrary faulty or corrupted responses (p.377).
- Byzantine Generals Problem: consensus with traitors; generalization of the two generals problem (p.378).
- Byzantine fault-tolerant: keeps working despite nodes not obeying the protocol (p.378).
- Weak forms of lying: invalid messages from hardware issues, bugs, misconfiguration (p.379).
- System model: abstraction describing an algorithm's assumptions about faults (p.380).
- Synchronous model: bounded delay, pauses, and clock error (p.380).
- Partially synchronous model: synchronous most of the time, with occasional unbounded excursions (p.380-381).
- Asynchronous model: no timing assumptions and no clock (p.381).
- Crash-stop (fail-stop): nodes fail only by crashing and never return (p.381).
- Crash-recovery: nodes may crash and later recover with stable storage intact (p.381).
- Stable storage: nonvolatile storage preserved across crashes (p.381).
- Limping node / gray failure / fail-slow: node responding but too slow to be useful (p.381).
- Safety property: nothing bad happens; a violation is identifiable and cannot be undone (p.382-383).
- Liveness property: something good eventually happens; often contains "eventually" (p.382-383).
- Formal verification: mathematical proof that an algorithm satisfies its properties (p.384).
- Model checker: tool exploring an algorithm's states to check invariants (p.384).
- TLA+, Gallina, FizzBee: specification languages for model checking (p.384).
- Fault injection: deliberately introducing faults into a running system (p.385).
- Chaos engineering / Chaos Monkey: production fault injection popularized by Netflix (p.385).
- Jepsen: fault-injection framework with prebuilt injectors (p.386).
- Deterministic simulation testing (DST): randomized executions of real code with mocked nondeterminism (p.386).
- Flow (FoundationDB), MadSim (Rust), FrostDB, Antithesis: DST tooling at application, runtime, and machine level (p.386-387).
- Property-based testing, fuzzing: randomized testing techniques (p.384).
- State machine replication: replicas executing the same deterministic sequence (p.387).

## Chapter summary (condensed)

- Packets may be lost or arbitrarily delayed, and so may replies; without a reply "you have no idea whether the message got through" (p.388).
- A node's clock may be badly out of sync despite NTP, may jump forward or back, and you most likely lack a good measure of its confidence interval (p.388).
- A process may pause for a long time at any point, be declared dead, and come back "without realizing that it was paused" (p.388).
- Such partial failures are "the defining characteristic of distributed systems"; anything involving other nodes may fail, go slow, or time out, and we build tolerance so the whole keeps working (p.388).
- Detecting faults is hard: most systems lack an accurate failure detector and rely on timeouts, which cannot distinguish network from node failure; limping nodes are even harder (p.388).
- Tolerating faults is hard too: there is no shared memory or common knowledge; nodes "can't even agree on what time it is"; information flows only over the unreliable network (p.388).
- Major decisions cannot be made safely by a single node; protocols must enlist other nodes and get a quorum to agree (p.389).
- Moving from the deterministic single computer to distributed reality is a shock; conversely, a problem solvable on one machine is "trivial," and keeping things on a single machine (e.g., an embedded storage engine) is generally worth it (p.389).
- Fault tolerance and low latency, not just scalability, motivate distribution; in principle such systems can run forever at the service level, though a bad config pushed everywhere still brings them down (p.389).
- Unreliability of networks, clocks, and processes is not a law of nature: hard real-time and bounded delays are possible but very expensive and reduce utilization, so most non-safety-critical systems "choose cheap and unreliable over expensive and reliable" (p.389).
- The chapter is about problems; the gain comes from using extensively tested, production-grade systems, and Chapter 10 turns to solutions (p.389).

## Second-edition-specific

- A whole new section "Formal Methods and Randomized Testing": formal verification, model checking with TLA+, Gallina, and FizzBee, bounded exploration, and spec-implementation drift (p.384-385).
- "Fault injection" as a named technique with Chaos Monkey, chaos engineering, kill/umount/firewall tooling, and Jepsen as a framework (p.385-386).
- "Deterministic simulation testing" with the three strategies (application-level FoundationDB Flow and TigerBeetle; runtime-level FrostDB and MadSim; machine-level Antithesis), replayability, and faster-than-wall-clock simulation (p.386-387).
- Sidebar "The Power of Determinism" tying DST to event sourcing, durable-execution workflow engines, and state machine replication (p.387-388).
- "The Limitations of TCP" subsection with QUIC, SCTP, and uTP, the socket-buffer and ack explanation, and the "positive response from the application itself" rule (p.348-349).
- Modern network references: Facebook's 2021 outage, cows, beavers, cable sabotage, Cloudflare's 2020 incident, Kubernetes network stalls; L4S and Linux TC under "Combining circuit switching and packet switching" (p.350, p.357).
- Clock material updated for the cloud: Amazon ClockBound alongside TrueTime, YugabyteDB on AWS, cloud providers offering high-accuracy clock sync for VMs, PTP at Meta, GPS jamming, leap seconds ending in 2035 (p.361-362, p.365-366).
- Fencing expanded: Kafka epoch numbers, etcd revision plus lease ID, Hazelcast FencedLock, the observation that a lock service is redundant if the one store supports conditional writes (S3, Azure Blob Storage, GCS), and "Fencing with multiple replicas" with the token in the timestamp's most significant bits (p.375-377).
- Preference against STONITH terminology ("we prefer not to use such violent terminology") while explaining why shutdown-based fencing is ineffective (p.375).
- Garbage-collection update: ZGC, Shenandoah, Epsilon, Go's collector; GC-free languages Rust, Swift, Mojo; "no more than a few milliseconds" for tuned collectors (p.370).
- Node-fault model gains "Degraded performance and partial functionality": limping node, gray failure, fail-slow, crashed background threads (p.381).
- Byzantine section updated with blockchains as BFT consensus, datacenters in orbit, peer-to-peer BFT references, and the point that multitenancy is handled by isolation rather than BFT (p.378-379).
- "Weak forms of lying" lists ZooKeeper's poison packet and NTP multi-server outlier rejection (p.379-380).
- Chapter summary now explicitly recommends staying on a single machine via an embedded storage engine when possible, and warns about global configuration rollouts (p.389).
