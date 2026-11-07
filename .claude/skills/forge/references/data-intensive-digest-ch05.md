<!-- forge reference: a page-cited digest of Designing Data-Intensive Applications, 2nd ed. (Kleppmann & Riccomini, O'Reilly 2026), chapter 5. Written while reading the chapter; every rule, number, failure mode, question and property carries its page. The condensed layer is references/data-intensive-protocol.md (§0-§8); the row-level map is references/data-intensive-book-map.md; this file is the full layer the requirements data round and the build Phase 4 review consult for the chapters a DATA.md group cites. -->

# Digest: DDIA 2nd ed., Chapter 5 - Encoding and Evolution (pp.161-196)

## Thesis

- Applications inevitably change, and "in most cases, a change to an application's features also requires a change to data that it stores" (p.161).
- Rolling upgrades of servers and slow updates of client apps mean old and new code and old and new data formats "may potentially coexist in the system at the same time", so every encoding must be backward compatible (newer code reads older data) and forward compatible (older code reads newer data) (p.162).
- Language-specific encodings fail on portability, security and versioning; textual JSON/XML/CSV are "good enough" for interchange but vague about numbers and binary strings; schema-driven binary formats (Protocol Buffers, Avro) are compact and have "clearly defined forward and backward compatibility semantics" (p.165-172, p.192).
- The same compatibility discipline governs every mode of dataflow: databases (where "data outlives code"), REST/RPC services (servers upgrade first, clients second), durable-execution workflows (deterministic replay plus idempotent side effects), and event-driven systems using message brokers and actors (p.178-192).
- Conclusion: "with a bit of care, backward/forward compatibility and rolling upgrades are quite achievable" (p.192).

## Decision rules

| rule | when it applies | why (mechanism) | page |
|---|---|---|---|
| Design for rolling upgrades (staged rollouts) and make all persisted and transmitted data compatible in both directions | Any server-side system deployed a few nodes at a time; any client app whose users may not update promptly | Old and new code and old and new data formats "may potentially coexist in the system at the same time" | p.161-162 |
| Check compatibility direction per API: an older client calling a newer service needs backward compat on the request and forward compat on the response; a newer client calling an older service needs the reverse | Service APIs with independently deployed clients and servers | Compatibility "is a relationship between one process that encodes the data and another process that decodes it" | p.162, p.178 |
| When older code reads, updates and writes back a record, keep unknown fields intact | Any read-modify-write path that may run on an older version | Decoding into a model object that does not preserve unknown fields loses data (Figure 5-1) | p.162 |
| Avoid language built-in encodings (java.io.Serializable, pickle, Marshal, Kryo) for anything other than "very transient purposes" | Any data that is stored or transmitted | Language lock-in; decoder must instantiate arbitrary classes (remote code execution); versioning and efficiency are afterthoughts | p.164-165 |
| Use JSON, XML or CSV for interchange between organizations when agreement matters more than efficiency | Cross-organization data exchange | "The difficulty of getting different organizations to agree on anything outweighs most other concerns" | p.166 |
| Do not rely on JSON numbers for integers above 2^53 that JavaScript may parse; also send them as decimal strings | 64-bit identifiers read by float-based parsers | IEEE 754 double cannot represent them exactly; X returns post IDs twice, as number and as string | p.165 |
| Carry binary data in JSON/XML as Base64 flagged by the schema, and budget the size cost | Binary payloads in textual formats | JSON/XML have no binary string type; Base64 "increases the data size by about a third" | p.165 |
| Use an external schema when numbers must be told apart from digit strings in XML or CSV | XML and CSV payloads | In those formats you "cannot distinguish between a number and a string that happens to consist of digits" | p.165 |
| Treat CSV as schemaless: handle added rows and columns manually, and verify your parser's escaping | Tabular exports and imports | CSV has no schema; "not all parsers implement [RFC 4180 escaping] correctly" | p.166 |
| Use a closed content model (additionalProperties: false) when the schema must say what is permitted; remember the default is open | JSON Schema design | Open model lets any undefined field exist with any type; default schemas define "what isn't permitted" rather than what is | p.166 |
| Model maps with integer-like keys via patternProperties plus additionalProperties: false | JSON Schema for ID-keyed maps | JSON objects always use string keys | p.166-167 |
| Keep JSON Schema and XML Schema simple; be wary of remote references and conditional if/else logic | Schemas that must evolve | Such features make it hard to "resolve remote schemas, reason about conditional rules, or evolve schemas" compatibly | p.167 |
| Do not expect large savings from binary JSON variants (MessagePack, CBOR, BSON, Smile...) | Choosing a wire format for JSON-shaped data | They still embed field names: 66 bytes vs 81 bytes for the sample record; "not clear whether such a small space reduction ... is worth the loss of human-readability" | p.167-169 |
| Use a schema-driven binary format (Protocol Buffers or Avro) when compactness and defined evolution rules matter | Internal services, storage, messaging | Field names omitted: 33 bytes (Protobuf) and 32 bytes (Avro) for the same record | p.169-172 |
| Protocol Buffers: never change a field's tag number; renaming is free | Any Protobuf schema change | Encoded data refers to tags, not names; changing a tag "would make all existing encoded data invalid" | p.171 |
| Protocol Buffers: add fields only with fresh tag numbers and make parsers skip and preserve unknown tags | Adding fields | The datatype annotation tells old code how many bytes to skip while preserving the field | p.171 |
| Protocol Buffers: never reuse a removed field's tag; record it as reserved | Removing fields | Old data may still carry the tag and "must be ignored by new code" | p.171 |
| Protocol Buffers: change a field's datatype only after checking the docs and accepting truncation risk | Type widening such as 32-bit to 64-bit integer | Old code holds a 32-bit variable; a value that does not fit "will be truncated" | p.171 |
| Avro: decode only with the exact writer's schema plus a reader's schema; never guess the layout | Any Avro decoding | Encoding has no field identifiers or types; "any mismatch in the schema between the reader and the writer would mean incorrectly decoded data" | p.172-174 |
| Avro: only add or remove fields that have a default value | Avro schema evolution | Missing fields are filled from the reader's default; without a default you break backward (add) or forward (remove) compatibility | p.175 |
| Avro: express nullability as a union with null as the first branch and default null | Avro field design | Avro has no nullable-by-default; the explicitness "helps prevent bugs" | p.175 |
| Avro: treat field renames (via reader aliases) and added union branches as backward compatible only | Avro schema evolution | Reader aliases match old writer names, but old readers cannot know new names or branches | p.175 |
| Avro: deliver the writer's schema by context - once at the head of an object container file; a version number per record plus a schema list in the database; negotiated at connection setup for RPC | Files, databases, network connections | Including the whole schema per record "would likely be much bigger than the encoded data" | p.175-176 |
| Keep a database (registry) of schema versions in any case; version by incrementing integer or schema hash | Any schema-driven system | It "acts as documentation and gives you a chance to check schema compatibility" before deployment | p.176, p.178 |
| Prefer Avro over Protocol Buffers when schemas are generated dynamically (e.g., dumping relational tables) | Export and ETL tooling | Avro matches fields by name; Protobuf tags "would likely have to be assigned by hand" and must never be reused | p.176-177 |
| Do not adopt ASN.1 for new applications | Choosing a binary schema language | "very complex and badly documented" | p.177 |
| Generate code from schemas in statically typed languages | Protobuf and Avro users | Enables compile-time type checking | p.178 |
| Keep the number of concurrent schema formats to a minimum | Operations | "to keep operations simple" | p.178 |
| Databases need backward compatibility always and usually forward compatibility too | Any database shared by processes on mixed versions | Writing is "sending a message to your future self"; newer code writes while older instances still read | p.178-179 |
| Prefer schema changes that do not rewrite data (add a column with null default) and let the engine migrate lazily | Relational stores and LSM-tree engines | "data outlives code"; rewriting a large dataset is expensive; compaction rewrites records in the latest format | p.179 |
| Plan application-level rewrites for complex changes (single-valued to multivalued, moving data to another table) | Complex schema changes | Such changes "still require data to be rewritten"; compatibility across them "remains a research problem" | p.179 |
| Encode archival dumps consistently in the latest schema; use Avro object container files or a column-oriented format such as Parquet | Backups and warehouse loads | The dump is written once and is immutable; analytics-friendly layout | p.179-180 |
| Make services independently deployable and evolvable with one owning team each; expect mixed versions in production | Service-oriented and microservices architectures | Teams release "without having to coordinate with other teams"; compatible APIs free internal migrations | p.180-181 |
| Define service APIs with an IDL (OpenAPI for JSON web services, Protocol Buffers for gRPC) | Any web service | Clients must learn endpoints and formats; IDL tools generate SDKs, docs, test GUIs and compatibility checks | p.181-182 |
| Use a service framework (Spring Boot, FastAPI, gRPC) rather than hand-rolling routing, metrics, caching, auth | Implementing services | Framework handles cross-cutting concerns; developers "focus on writing the business logic" | p.182 |
| Do not make a remote call look like a local function call (location transparency) | Any RPC design | Network requests are unpredictable, may time out with unknown outcome, have wildly variable latency, cannot pass pointers, and cross language type systems | p.183-184 |
| Retry failed network requests, but build deduplication (idempotence) into the protocol | Any client of a remote service | If only the response was lost, a retry "will cause the action to be performed multiple times" | p.183 |
| Choose discovery and load balancing by dynamism: static IP/port for the simplest case, DNS when instances change slowly, a registry (etcd, ZooKeeper) for dynamic fleets, a service mesh (Istio, Linkerd) under an orchestrator such as Kubernetes, purpose-built balancers for databases and messaging, software balancers (NGINX, HAProxy) for simpler deployments | Running multiple service instances | DNS caches and propagates slowly; registries carry heartbeats and metadata; meshes centralize TLS and observability | p.184-186 |
| For services assume servers are updated first and clients second: backward compat on requests, forward compat on responses | RPC and REST evolution | A "simplifying assumption" relative to database dataflow | p.186 |
| In REST, treat adding optional request parameters and adding response fields as the compatible changes | Evolving JSON APIs | "usually considered changes that maintain compatibility" | p.186 |
| Maintain compatibility indefinitely for external clients; if a breaking change is unavoidable, run multiple API versions side by side | Public and partner APIs | The provider "cannot force them to upgrade" | p.186 |
| Pick an explicit API versioning scheme: version in the URL, in the HTTP Accept header, or stored per API key and changed via an admin interface | Public REST APIs | "There is no agreement on how API versioning should work" | p.186 |
| Use a workflow engine with durable execution (Temporal, Restate) when a multi-service process must happen exactly once | Payments and similar cross-service workflows | You "can't simply wrap the two tasks in a database transaction"; the framework logs RPCs and state changes and replays while skipping completed calls | p.187-188 |
| Require idempotent external APIs and pass unique IDs from durable workflows | Third-party calls inside workflows | The framework cannot deduplicate on behalf of a non-idempotent third party | p.189 |
| Never modify an existing workflow's code in place; deploy a new version separately so in-flight invocations replay the old code | Workflow code changes | Replay expects the same RPCs in the same order; reordering "might introduce undefined behavior" | p.189 |
| Keep workflow code deterministic: use the framework's clock and random functions; run static analysis such as Temporal's Workflow Check | Durable execution | Replay requires "the same inputs produce the same outputs" | p.189 |
| Use a message broker rather than direct RPC when you need buffering, redelivery, fan-out, sender/recipient decoupling, or to avoid service discovery | Asynchronous integration | The broker stores messages temporarily and redelivers to crashed consumers | p.189-190 |
| Choose queue semantics (one of several consumers receives) or topic semantics (all subscribers receive) deliberately | Messaging design | The two dominant distribution patterns | p.190 |
| Deploy a schema registry alongside the broker; encode with Protobuf, Avro or JSON; describe messages with AsyncAPI | Messaging | Brokers "don't enforce any particular data model"; the registry stores valid versions and checks compatibility | p.190 |
| Configure indefinite retention if you intend to do event sourcing | Brokers that delete after consumption | Event sourcing needs the full history | p.190 |
| Consumers that republish messages must preserve unknown fields | Message pipelines | Same data-loss hazard as Figure 5-1 | p.191 |
| Distributed actor frameworks still need compatible message encodings for rolling upgrades | Akka, Orleans, Erlang/OTP clusters | Messages flow between nodes running different versions | p.192 |
| Consider zero-copy formats (Cap'n Proto, FlatBuffers) when the same bytes must serve at runtime and on disk or network | Performance-critical paths | Designed to be used "without an explicit conversion step" | p.164 |

## Metrics and numbers

| metric or quantity | definition / how measured | values or thresholds the book gives | caveats | page |
|---|---|---|---|---|
| Rolling upgrade granularity | Nodes receiving the new version at a time | "a few nodes at a time", monitored, then gradually all | Client-side apps: "at the mercy of the user" | p.161-162 |
| Compatibility directions | Backward: newer code reads older data; forward: older code reads newer data | Both required for mixed-version operation | Forward is "trickier" because old code must ignore additions | p.162 |
| Exact integer range in JSON parsed as double | Integers exactly representable in IEEE 754 double precision | Integers greater than 2^53 become inaccurate (extraction shows "253") | X uses 64-bit post IDs; sends them twice (number and string) | p.165 |
| Base64 overhead | Size growth when binary is encoded as text | "about a third" | Needs schema to mark the field as Base64 | p.165 |
| JSON Schema validation example | Numeric range constraint | Port field: minimum 1, maximum 65,535 | Validation is a separate specification layered on types | p.166 |
| MessagePack object header | Bits for type and field count | 4 bits type (0x80 object), 4 bits count; more than 15 fields uses a different type byte and 2 or 4 byte counts | - | p.168 |
| Sample record size, textual JSON | Example 5-2 with whitespace removed | 81 bytes | - | p.169 |
| Sample record size, MessagePack | Same record | 66 bytes | "only a little less"; field names still embedded | p.169 |
| Sample record size, Protocol Buffers | Same record | 33 bytes | Tags instead of names; type and tag packed in one byte | p.169-170 |
| Sample record size, Avro | Same record | 32 bytes, "the most compact" | No field identifiers or type markers at all | p.172 |
| Protobuf varint widths | Variable-length integer encoding with continuation bit | -64 to 63 in 1 byte; -8,192 to 8,191 in 2 bytes; 1337 takes 2 bytes | Least significant 7 bits stored first | p.170 |
| Protobuf defaults for absent fields | Value filled when old data lacks a new field | Empty string for strings, 0 for numbers | - | p.171 |
| Type widening truncation | 32-bit to 64-bit change | Old code truncates 64-bit values that do not fit in 32 bits | New code reading old data fills missing bits with 0 | p.171 |
| Avro compatibility definitions | Relationship between writer's and reader's schema versions | Forward: writer newer than reader; backward: writer older than reader | Only fields with defaults may be added or removed | p.175 |
| Schema version identifier | How a record points at its writer's schema | Incrementing integer or hash of the schema | Confluent Schema Registry and Espresso work this way | p.176 |
| Age spread of values in one database | Time since write | "five milliseconds ago" to "five years ago" | "data outlives code" | p.179 |
| Code deployment duration | Time to replace old version entirely (server-side) | "within a few minutes" | Database contents are not replaced | p.179 |
| Network request latency | Time for a remote call | "less than a millisecond" at good times; "many seconds" when congested or overloaded | Local function call takes "about the same time" each call | p.184 |
| Service registry heartbeat | Liveness signal from instance to discovery system | "periodically" (no interval given) | Registry carries host, port, shard ownership, datacenter metadata | p.185 |
| Compatibility obligations for services | Which direction each message type needs | Backward on requests, forward on responses | Assumes servers upgrade before clients | p.186 |
| API versions maintained | Number of versions when a breaking change is required | "multiple versions of the service API side by side", "perhaps indefinitely" | No agreed versioning mechanism | p.186 |
| Temporal activity timeout | start_to_close_timeout in Example 5-5 | 15 seconds | Illustrative example | p.188 |
| Workflow delivery guarantee | Semantics durable execution provides | Exactly-once semantics for workflows | Requires idempotent external APIs with unique IDs | p.188-189 |
| Message distribution patterns | Who receives a message | Queue: one of the consumers; topic: all subscribers | Delivery semantics vary by implementation and configuration | p.190 |
| Message durability and retention | Whether and how long brokers keep messages | Many write to disk; many delete after consumption; some can retain indefinitely | Indefinite retention needed for event sourcing | p.190 |
| Actor message delivery | Guarantee within actor frameworks | "not guaranteed; in certain error scenarios, messages will be lost" | Each actor processes one message at a time | p.191 |
| Historical dates | Origin of technologies | ASN.1 standardized 1984; Avro started 2009; RPC from the 1970s; statement-based items n/a | - | p.172, p.177, p.183 |

## Failure modes and anti-patterns

| failure mode | cause | consequence | mitigation the book gives | page |
|---|---|---|---|---|
| Lost new field on round trip (Figure 5-1) | Older code decodes a record into a model object that drops unknown fields, then writes it back | New field's data is lost | Preserve unknown fields; Protobuf type annotations let parsers skip and keep them; same care when republishing messages | p.162, p.171, p.191 |
| Remote code execution via deserialization | Language-specific decoder instantiates arbitrary classes from attacker-controlled bytes | Attacker can "do terrible things such as remotely executing arbitrary code" | Do not use built-in encodings beyond transient use | p.164 |
| Language lock-in | Data stored in a language-specific encoding | Committed to one language "for potentially a long time"; integration with other organizations precluded | Use language-independent formats | p.164 |
| Bloated, slow encoding | Java built-in serialization | "notorious for its bad performance and bloated encoding" | Use purpose-built formats | p.165 |
| Inaccurate large integers | JSON numbers above 2^53 parsed in JavaScript as doubles | IDs corrupted on parse | Duplicate the value as a decimal string | p.165 |
| Number vs digit-string ambiguity | XML and CSV lack types | Wrong interpretation without an external schema | Use a schema or a typed format | p.165 |
| No binary strings | JSON and XML support only Unicode text | Base64 workaround, "somewhat hacky", about one third larger | Use schema-driven binary formats where binary data is common | p.165 |
| Broken CSV parsing | Values containing commas or newlines; parsers not implementing RFC 4180 | Misparsed rows | Verify parsers; treat CSV as vague | p.166 |
| Unevolvable JSON/XML schemas | Remote references, conditional rules, complex validators | Hard to evolve compatibly | Keep schema languages simple | p.167 |
| Hardcoded encoding logic | Applications skip XML/JSON Schema although interpretation depends on it | Decoding rules scattered in code | Use schemas to carry interpretation | p.165-166 |
| Invalidated history | Changing a Protobuf field tag | "all existing encoded data invalid" | Never change tags; rename instead | p.171 |
| Misread old records | Reusing a retired Protobuf tag number | Old data with the tag misinterpreted | Reserve retired tags in the schema | p.171 |
| Silent truncation | Changing int32 to int64 while old readers remain | Old code truncates values that do not fit | Check docs; accept or avoid type changes | p.171 |
| Garbage decoding | Avro reader uses a schema that differs from the writer's without resolution | "incorrectly decoded data" | Always resolve with the actual writer's schema | p.172-174 |
| Broken backward compatibility | Adding an Avro field without a default | New readers cannot read old data | Add only fields with defaults | p.175 |
| Broken forward compatibility | Removing an Avro field without a default | Old readers cannot read new data | Remove only fields with defaults | p.175 |
| Space savings negated | Embedding the entire schema in every record | Schema "much bigger than the encoded data" | Container file header, version pointer plus registry, or connection negotiation | p.175-176 |
| Manual tag bookkeeping | Using Protobuf for dynamically generated schemas | Administrator must remap columns to tags on every change, risking reused tags | Use Avro, which matches by name | p.176-177 |
| Stale documentation | Manually maintained docs diverge from reality | Misleading API descriptions | Treat the required schema as documentation | p.177 |
| Operational sprawl | Too many concurrent schema formats | Complicated operations | Keep formats to a minimum | p.178 |
| Data outlives code | Five-year-old data in original encoding while code was replaced in minutes | Old encodings persist indefinitely | Lazy migration by storage engine; null-default columns; explicit rewrites for complex changes | p.179 |
| Unsolved complex migrations | Single-valued to multivalued, moving data between tables | Application-level rewrites; compatibility across them is a research problem | Plan explicit rewrites | p.179 |
| Location transparency illusion | RPC frameworks make remote calls look local | Unhandled network loss, timeouts with unknown outcome, duplicated actions on retry, variable latency, pointer passing impossible, type mismatches | Treat network calls as distinct; REST's state transfer view; idempotence | p.183-184 |
| Legacy RPC stacks | EJB/RMI (Java only), DCOM (Microsoft only), CORBA (no compat), SOAP/WS-* (complexity) | Vendor lock-in and compatibility problems | Prefer REST/gRPC with evolvable encodings | p.183 |
| Manual client reconfiguration | Clients configured with fixed IP and port | Server moves or overloads require reconfiguring clients | Load balancers, DNS, registries, meshes | p.184 |
| Stale DNS addresses | DNS caching and slow propagation | Clients connect to IPs with no server | Service discovery systems for dynamic environments | p.185 |
| Forced long-term compatibility | Clients belong to other organizations | Cannot force upgrades; breaking changes mean parallel API versions | Version via URL, Accept header or per-key setting | p.186 |
| Half-completed payment | Crash between credit card charge and bank deposit in a multi-service workflow | Charge without deposit; no database transaction spans services | Durable execution with logged RPCs and replay | p.188 |
| Brittle workflow code changes | Reordering RPC calls in a durable workflow | Replay mismatch, "undefined behavior" | Deploy new workflow versions separately | p.189 |
| Nondeterministic replay | Random numbers or system clock inside workflow code | Replay diverges | Framework-provided deterministic functions; static analysis (Workflow Check) | p.189 |
| Duplicate side effects at third parties | External API not idempotent | Repeated charges or calls | Idempotent APIs with unique IDs | p.189 |
| History deleted | Broker deletes messages after consumption | Event sourcing impossible | Configure indefinite retention | p.190 |
| Lost unknown fields in pipelines | Consumer republishes messages via a lossy model | Same as Figure 5-1 | Preserve unknown fields | p.191 |
| Lost actor messages | Actor model does not guarantee delivery | Messages dropped in error scenarios | Design assuming loss; still use compatible encodings | p.191-192 |

## Elicitation questions

1. How often do you want to release changes, and can the system ever be taken down to deploy, or must it stay up throughout? [rolling upgrades; two-way compatibility] (p.161-162)
2. Do you ship apps that run on customers' devices (mobile, desktop, browser) that you cannot force to update? How long do old versions stay in use? [forward compatibility; client-side lag] (p.162)
3. Who else must read this data: other teams, other companies, systems written in other programming languages? [language-independent formats; interchange] (p.164-166)
4. How many years must stored records remain readable (archives, regulation)? [data outlives code; backward compatibility; archival storage] (p.179-180)
5. Will any numbers be very large (64-bit IDs, counters) and will any JavaScript or web code read them? [JSON number precision] (p.165)
6. Do records need to carry raw files or binary blobs (images, keys, attachments)? [binary strings; Base64 overhead; binary formats] (p.165)
7. Is it important that people can read the raw data directly for debugging, support or audit? [textual vs binary trade-off] (p.169, p.192)
8. Do you need to validate values (ranges, patterns, required fields) or only the structure of the data? [JSON Schema validation vs Protobuf/Avro schemas] (p.166-167, p.177)
9. Who owns the definition of each data format, and should a central registry block incompatible changes before release? [schema registry; compatibility checks] (p.176, p.178, p.190) 
10. Are your data structures derived from a database or spreadsheet whose columns change often? [dynamically generated schemas; Avro] (p.176-177)
11. Which fields may be missing or empty, and what should the system assume when they are? [default values; nullability via union] (p.171, p.175)
12. Which partner or public APIs do you expose, and how long must each stay stable for its consumers? [API versioning; indefinite compatibility] (p.186)
13. When a call to another system times out, is it acceptable for the action to happen twice (double charge, duplicate order)? [idempotence; retries] (p.183)
14. Are there multi-step business processes spanning several systems that must complete exactly once, such as payments or fulfilment? [workflows; durable execution] (p.187-188)
15. Do those processes call third parties (payment gateways, banks)? Can those third parties accept a unique reference to prevent duplicates? [idempotent external APIs] (p.189)
16. Are some processes triggered on a schedule or by a human rather than by another system? [workflow triggers; orchestrator] (p.187-188)
17. When one part of the system is down or slow, should callers wait, fail, or should the work be queued for later? [synchronous RPC vs message broker buffering] (p.189-190)
18. Should each message be processed by exactly one worker, or delivered to everyone interested? [queue vs topic] (p.190)
19. Do you need a complete, permanent history of every change for audit or replay? [event sourcing; indefinite retention] (p.190)
20. How many copies of each service will run, and do they move, scale or restart frequently? [service discovery; load balancing] (p.184-186)
21. Do you run on Kubernetes or a similar orchestrator, and must traffic between internal services be encrypted? [service mesh; TLS at the mesh] (p.185-186)
22. Will database dumps feed analytics or a data warehouse? [Avro container files; Parquet] (p.179-180)
23. Who can submit data that your systems decode - only trusted systems or the public internet? [deserialization security] (p.164)
24. Can your team accept that remote calls have unpredictable latency and may fail, and what should users see when they do? [problems with RPC; error handling] (p.183-184)

## Verifiable properties

| property | how to test | page |
|---|---|---|
| Unknown fields survive a round trip through older code | Encode with schema v2, decode and re-encode with v1 code, decode with v2: the v2-only field is intact | p.162, p.171 |
| Every schema change passes backward and forward compatibility checks before deployment | Run the schema registry's compatibility check (or IDL tooling) in CI against all registered prior versions | p.176, p.178, p.182, p.190 |
| Protobuf tag numbers are stable | Diff each new .proto against the previous version: no tag changed, removed tags appear in reserved | p.171 |
| Avro added/removed fields all have defaults; nullable fields are unions with null first | Static check on the Avro JSON schema diff | p.175 |
| Avro resolution works in both directions | Encode with old writer schema, decode with new reader schema and vice versa; fields matched by name, defaults filled, extras ignored | p.173-175 |
| Encoded size budget holds | Assert encoded size of the reference record: JSON 81 bytes, MessagePack 66, Protobuf 33, Avro 32 | p.169-172 |
| Large integers are not emitted as bare JSON numbers | Scan API responses for integers above 2^53 without a string twin | p.165 |
| Closed content model where required | JSON Schema has additionalProperties: false on strict objects; validator rejects unknown fields | p.166 |
| No language-native serialization on persisted or network data | Static scan for java.io.Serializable, pickle, Marshal in storage and transport paths | p.164-165 |
| Request backward compatibility | Replay recorded requests from older client versions against the new server | p.162, p.186 |
| Response forward compatibility | Feed new server responses (with added fields) to older client parsers; they ignore the additions | p.162, p.186 |
| Idempotent remote operations | Send the same request twice (simulating a lost response); exactly one side effect | p.183 |
| Workflow determinism | Run Temporal Workflow Check or equivalent; no direct clock or random calls in workflow code | p.189 |
| Durable execution resumes without repeating completed calls | Crash the worker between tasks; on replay the completed RPC is not re-issued | p.188 |
| Workflow versioning | Changing workflow code produces a new version; in-flight invocations keep the old one | p.189 |
| Republished messages keep unknown fields | Publish a message with an extra field through a consumer that republishes; the field is present downstream | p.191 |
| Broker retention matches event-sourcing intent | Consumed messages remain readable from the beginning of the topic | p.190 |
| Additive DB migrations do not rewrite rows | Add a null-default column; row storage unchanged, old rows read back with nulls | p.179 |
| Archival dump uses one schema | Validate that every record in the dump decodes with the single header schema (Avro object container file) | p.175, p.179-180 |
| Dead instances leave discovery | Stop heartbeats; the registry removes the endpoint and clients stop routing to it | p.185 |
| IDL and implementation agree | Generated OpenAPI/Protobuf definition matches the deployed endpoints (generated from code or code generated from IDL) | p.181-182 |

## Terms

| term | definition | page |
|---|---|---|
| Evolvability | Building systems that make it easy to adapt to change | p.161 |
| Rolling upgrade (staged rollout) | Deploying a new version to a few nodes at a time without downtime | p.161 |
| Backward compatibility | Newer code can read data written by older code | p.162 |
| Forward compatibility | Older code can read data written by newer code | p.162 |
| Schema-on-read ("schemaless") | Database does not enforce a schema; mixed old and new formats coexist | p.161 |
| Schema migration | Changing a relational schema via ALTER statements | p.161 |
| Encoding (serialization, marshaling) | Translating in-memory data into a self-contained byte sequence | p.163 |
| Decoding (parsing, deserialization, unmarshaling) | Reverse of encoding | p.163 |
| Zero-copy format | Format usable at runtime and on disk/network without conversion (Cap'n Proto, FlatBuffers) | p.164 |
| Language-specific format | Built-in serializers such as java.io.Serializable, pickle, Marshal | p.164 |
| Base64 | Text encoding of binary data, about one third larger | p.165 |
| JSON Schema | Schema and validation language for JSON; used in OpenAPI, registries, databases | p.166 |
| Open / closed content model | Whether undefined fields are allowed (additionalProperties true/false) | p.166 |
| Binary JSON variants | MessagePack, CBOR, BSON, etc.; compact but keep field names | p.167 |
| Protocol Buffers (protobuf) | Google's schema-driven binary encoding with field tags; similar to Thrift | p.169 |
| Interface definition language (IDL) | Language for describing schemas or service APIs | p.169 |
| Field tag | Number identifying a field in Protobuf encoding; "like aliases for fields" | p.170 |
| Variable-length integer (varint) | Integer encoding whose top bit marks continuation | p.170 |
| Schema evolution | Changing schemas over time while keeping compatibility | p.171 |
| Reserved tag | Retired Protobuf tag recorded so it is never reused | p.171 |
| Avro | Hadoop-origin binary format with no tags; relies on writer's and reader's schemas | p.172 |
| Avro IDL | Human-editable Avro schema language (JSON form also exists) | p.172 |
| Writer's schema | Schema version used to encode data | p.173 |
| Reader's schema | Schema the decoding application expects; may differ from writer's | p.173 |
| Schema resolution | Avro's translation from writer's to reader's schema by field name | p.173-174 |
| Union type | Avro type allowing several alternatives; null must be first to default to null | p.175 |
| Alias | Reader-side alternative field name for matching renamed fields | p.175 |
| Object container file | Avro file format with the schema once at the beginning | p.176 |
| Schema registry | Database of schema versions (Confluent Schema Registry, Apicurio, Espresso) | p.166, p.176 |
| Dynamically generated schema | Schema produced automatically, e.g. from a relational schema | p.176 |
| ASN.1 / DER | 1984 schema language and binary encoding still used in X.509 certificates | p.177 |
| Data outlives code | Old data stays in its original encoding long after code is replaced | p.179 |
| Service | API exposed by a server over the network | p.180 |
| Web service | Service using HTTP as the underlying protocol | p.181 |
| REST / RESTful | Design philosophy using URLs for resources and HTTP features; APIs following it | p.181 |
| OpenAPI (Swagger) | IDL for JSON web services | p.181 |
| gRPC | RPC framework using Protocol Buffers service definitions | p.181 |
| Service framework | Library handling routing, metrics, caching, auth (Spring Boot, FastAPI, gRPC) | p.182 |
| Remote procedure call (RPC) | Making a network request look like a local function call | p.183 |
| Location transparency | Abstraction hiding whether a call is local or remote | p.183 |
| Idempotence | Deduplication so repeated requests have one effect | p.183 |
| Service discovery | Finding the network address of a service | p.184 |
| Load balancing | Spreading requests across service instances | p.184 |
| Service mesh | Load balancing plus discovery via in-process library or sidecar on client and server (Istio, Linkerd) | p.185 |
| Sidecar | Co-located process or container carrying mesh functionality | p.185 |
| API versioning | How a client indicates the API version it wants | p.186 |
| Workflow | Sequence (graph) of tasks across services | p.187 |
| Task (activity, durable function) | One step in a workflow | p.187 |
| Workflow engine | System that schedules and runs tasks (orchestrator plus executor) | p.187 |
| BPMN / BPEL | Graphical notation and markup language for workflows | p.187 |
| Durable execution | Framework that logs RPCs and state changes and replays to give exactly-once workflows (Temporal, Restate) | p.188 |
| Event / message | A request in an event-driven architecture | p.189 |
| Message broker (event broker, message queue, message-oriented middleware) | Intermediary that stores and forwards messages | p.189 |
| Queue vs topic | One consumer receives vs all subscribers receive | p.190 |
| AsyncAPI | Messaging equivalent of OpenAPI for message schemas | p.190 |
| Event sourcing | Keeping messages indefinitely as the source of truth | p.190 |
| Actor model | Concurrency model of isolated actors exchanging asynchronous messages | p.191 |
| Distributed actor framework | Actor model across nodes (Akka, Orleans, Erlang/OTP) | p.191 |

## Chapter summary (condensed)

- The chapter covered ways of turning data structures into bytes and showed that encoding details affect "not only their efficiency, but more importantly also the architecture of applications and your options for evolving them" (p.191).
- Many services need rolling upgrades, deploying a new version "to a few nodes at a time rather than to all nodes simultaneously"; releasing without downtime encourages "frequent small releases over rare big releases" (p.191-192).
- Rolling upgrades also make deployments less risky, "allowing faulty releases to be detected and rolled back before they affect a large number of users"; these properties are "hugely beneficial for evolvability" (p.192).
- During rolling upgrades, or for other reasons, different nodes run different code versions, so all data flowing around the system must be backward compatible (new code reads old data) and forward compatible (old code reads new data) (p.192).
- Programming language-specific encodings are restricted to one language and "often fail to provide forward and backward compatibility" (p.192).
- Textual formats (JSON, XML, CSV) are widespread; compatibility depends on usage; optional schema languages are "sometimes helpful and sometimes a hindrance"; they are vague about numbers and binary strings (p.192).
- Binary schema-driven formats (Protocol Buffers, Avro) are compact and efficient with clearly defined compatibility semantics; schemas help documentation and code generation; the downside is data must be decoded to be human-readable (p.192).
- Dataflow through databases: the process writing to the database encodes the data and the process reading from it decodes it (p.192).
- Dataflow through RPC and REST APIs: the client encodes a request, the server decodes the request and encodes a response, and the client finally decodes the response (p.192).
- Dataflow in event-driven architectures (message brokers or actors): nodes send each other messages encoded by the sender and decoded by the recipient (p.192).
- "With a bit of care, backward/forward compatibility and rolling upgrades are quite achievable. May your application's evolution be rapid and your deployments be frequent." (p.192)

## Second-edition-specific

| topic | what the chapter adds (appears new relative to the first edition) | page |
|---|---|---|
| Zero-copy formats | Mentions Cap'n Proto and FlatBuffers as formats used at runtime and on disk without conversion; notes query engines operating directly on compressed data | p.164 |
| JSON Schema section | New subsection: adoption in OpenAPI, Confluent and Apicurio registries, PostgreSQL pg_jsonschema, MongoDB $jsonSchema; open vs closed content models; patternProperties example; evolution pitfalls | p.166-167 |
| X identifiers | Twitter example updated to X; post IDs returned as number and string | p.165 |
| Protobuf proto3 and reserved tags | proto3 syntax example; explicit advice to reserve retired tag numbers | p.169, p.171 |
| Nullability as explicit union | Ties Avro's explicit null unions to Hoare's "billion dollar mistake" | p.175 |
| Migration research pointer | Cites Stripe online migrations and Project Cambria lenses: compatibility across complex migrations "remains a research problem" | p.179 |
| Parquet for archives | Recommends column-oriented Parquet alongside Avro container files for dumps | p.180 |
| OpenAPI and service frameworks | Worked OpenAPI YAML and FastAPI examples; code-first vs IDL-first generation; Spring Boot, FastAPI, gRPC frameworks | p.181-182 |
| Load balancers, service discovery, service meshes | New subsection comparing hardware/software balancers, DNS, registries (etcd, ZooKeeper), and meshes (Istio, Linkerd) with sidecars, TLS offload and observability | p.184-186 |
| API versioning options | URL or Accept header versioning plus Stripe-style per-API-key version pinning | p.186 |
| Durable Execution and Workflows | Entirely new section: workflows as task graphs, orchestrator/executor, engines (Airflow, Dagster, Prefect, Camunda, Orkes, Temporal, Restate), exactly-once via logged RPC replay, Temporal code example, determinism and versioning pitfalls, Workflow Check | p.187-189 |
| Event-Driven Architectures | Message-passing section reframed as event-driven; newer brokers and cloud services (NATS, Redpanda, Kinesis, Azure Service Bus, Pub/Sub); schema registry plus AsyncAPI; indefinite retention for event sourcing | p.189-191 |
| Determinism forward reference | "Making code deterministic is a powerful idea but tricky to do robustly" with a pointer to Chapter 9 | p.189 |
