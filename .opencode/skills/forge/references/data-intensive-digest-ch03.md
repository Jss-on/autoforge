<!-- forge reference: a page-cited digest of Designing Data-Intensive Applications, 2nd ed. (Kleppmann & Riccomini, O'Reilly 2026), chapter 3. Written while reading the chapter; every rule, number, failure mode, question and property carries its page. The condensed layer is references/data-intensive-protocol.md (§0-§8); the row-level map is references/data-intensive-book-map.md; this file is the full layer the requirements data round and the build Phase 4 review consult for the chapters a DATA.md group cites. -->

# DDIA 2nd ed. - Chapter 3: Data Models and Query Languages (digest)

Source: ch03.txt (pdftotext extraction), book pages p.65-p.114 (body p.65-p.108, references p.108-p.114).

## Thesis

- Data models are "perhaps the most important part of developing software": they shape both how the code is written and how we think about the problem. Every application layers one model on another, and each layer hides the layer below behind a clean model (p.65-66).
- The chapter compares relational, document, graph (property graph and triple store), event sourcing/CQRS and DataFrame models, plus their query languages (SQL, MongoDB aggregation, Cypher, SPARQL, Datalog, GraphQL), so that you can "decide when to use which model" (p.66).
- The deciding variable is the shape of the relationships: a tree of one-to-many -> document; many-to-one and many-to-many needing joins -> relational; "anything is potentially related to everything" with multi-hop queries -> graph; a complex business domain needing several read shapes -> event log plus derived views; wide numeric data for ML -> DataFrames and arrays (p.80, p.84, p.101, p.105, p.107).
- Normalization versus denormalization is a trade-off between read cost, write cost and consistency, "not inherently good or bad" (p.75). Declarative query languages let the database improve execution without changing queries (p.66).
- The models are converging: SQL databases added JSON and graph data, document databases added joins; "Relational-document hybrids are a powerful combination" (p.84, p.107-108).

## Decision rules

| rule | when it applies | why (mechanism) | page |
|---|---|---|---|
| Prefer a declarative query language (SQL, Cypher, SPARQL, Datalog) over hand-coding the algorithm | Any query against a database that offers one | You specify the pattern and transformations, not the steps; the optimizer picks indexes, join order and parallelism, so "performance improvements" need no query changes | p.66 |
| Use an ORM only for the simple, repetitive object-to-row translation; write complicated queries outside it | OLTP application code on a relational store | ORMs cut boilerplate but "can't completely hide the differences" between the object and relational models | p.68-69 |
| Tell the ORM to fetch related rows together (a join) instead of per-item lookups | Rendering a list of N items that each need a parent lookup | Otherwise N+1 queries, "which is slower than performing the join in the database" | p.68-69 |
| Design the relational schema deliberately even when an ORM is used | Data that is also used for analytics or by other systems | Data engineers "need to work with the underlying relational representation"; auto-generated schemas can be awkward and inefficient | p.68 |
| Use the document model when the data is a tree of one-to-many relationships that is loaded whole | Profiles, resumes, self-contained records | Locality: all relevant information is "in one place", one query instead of several queries or a "messy multiway join" | p.71, p.80 |
| Do not "shred" a document-like structure into many tables | Same as above | Shredding "can lead to cumbersome schemas and unnecessarily complicated application code" | p.80 |
| Embed only one-to-few; use the relational approach for genuinely large collections | A few positions on a resume vs "many thousands" of comments on a post | Embedding thousands of items makes the document "too unwieldy" | p.71 |
| Store a standardized ID instead of free text for shared concepts; keep plain strings only when the UI really is a free-text field | Regions, organizations, schools chosen from a list | Consistent spelling, no ambiguity, one place to update, localization, better search; a free-text field has nothing to reference | p.72 |
| Let IDs carry no human meaning so they never need to change | Any cross-reference | "Anything that is meaningful to humans may need to change"; duplicated copies then all need updating | p.72 |
| Normalize when writes must be cheap; denormalize when reads must be cheap | Choosing a representation | Normalized is "faster to write ... but slower to query"; denormalized is "faster to read ... but more expensive to write" and uses more disk | p.74 |
| Treat denormalized copies as derived data with an explicit update process | Any duplicated field | You "need to set up a process for updating the redundant copies of the data" | p.74 |
| Prefer normalization in OLTP and at small to moderate scale; denormalize in analytics and only at very large scale where join cost bites | Operational vs analytical systems; capacity planning | OLTP needs fast reads and updates, and at modest scale "the cost of performing joins is acceptable" with no copies to keep consistent; analytics updates in bulk and read performance dominates | p.74 |
| Precompute expensive joins (fan-out) but store only IDs for fast-changing data | Timelines where like counts and avatars change constantly | The view must show the latest values; denormalizing them would be stale and raise storage cost | p.74-75 |
| Do not treat read-time joins as a scalability blocker | Hydrating IDs at read time | Hydration "parallelizes well" and its cost "doesn't depend on the number of accounts you are following or the number of followers you have" | p.75 |
| Decide denormalization field by field from change frequency and read/write cost, watching outliers | Social-network style fan-out | The most scalable design "may involve denormalizing some things and leaving others normalized" | p.75 |
| Represent many-to-one and many-to-many relationships normalized, by reference | Organizations and schools shared by many people | They "do not easily fit within one self-contained JSON document" | p.75-76 |
| Store a many-to-many relationship once and index both sides rather than storing IDs on both documents | Relationship queried "in both directions" | Two copies "could become inconsistent with each other"; secondary indexes give both directions from one copy | p.76-77 |
| Index fields nested inside documents when you query by them | Document model with references (org_id inside the positions array) | Many document and JSON-capable relational databases can index values inside a document | p.77 |
| Use a star schema (fact table plus dimension tables) for data warehouses | Business analytics | Facts are events; dimensions are "the who, what, where, when, how, and why of the event" | p.77-78 |
| Capture facts as individual events, not pre-aggregated | Fact table design | "maximum flexibility of analysis later", at the cost of a very large table | p.78 |
| Model date and time as dimension tables | Warehouse queries by holiday, weekday etc. | Extra attributes such as public holidays can be attached to dates | p.79 |
| Prefer star over snowflake unless the extra normalization is needed | Warehouse schema choice | Snowflake is more normalized but star schemas "are simpler for analysts to work with" | p.79 |
| Consider one big table (OBT) when query speed matters more than storage | Analytics | Precomputes the fact-dimension join; "requires more storage space" but "sometimes enables faster queries" | p.79 |
| Denormalize freely in analytics | Historical log data | The data "is not going to change", so consistency and write-overhead problems "are not as pressing" | p.79 |
| Use the relational approach when you must reference a nested item directly | Items addressed by their own ID from elsewhere | In a document you can only say "the second item in the list of positions for user 251" | p.80 |
| Use the document model for user-reorderable lists | Drag-and-drop to-do lists, issue ordering | A JSON array stores the order; relational databases need "tricks" (integer renumbering, linked lists, fractional indexing) | p.80 |
| Use schema-on-read when records are heterogeneous or externally controlled | Many object types; structure set by external systems that "may change at any time" | A schema "may hurt more than it helps" | p.81 |
| Use schema-on-write when all records are expected to share one structure | Homogeneous collections | Schemas are "a useful mechanism for documenting and enforcing that structure" | p.81-82 |
| Avoid heavy migrations: add a NULL-default column (fast) and fill it in at read time | Changing data format on a large table | Adding a column with a default is "fast and unproblematic"; UPDATE of every row and type changes rewrite the whole table | p.81 |
| Keep documents fairly small and avoid frequent small updates | Document stores | The database typically loads and rewrites the entire document | p.82 |
| Rely on document locality only when you need large parts of the document at once | Access patterns | Loading a whole document for a small field "can be wasteful" | p.82 |
| Get locality inside a relational model via interleaved tables, cluster tables or column families when needed | Spanner, Oracle, Bigtable/HBase/Accumulo | Locality "is not limited to the document model" | p.82 |
| Combine relational and document features in one database | Most applications | Document data needs references, relational data has sections needing flexibility; "Relational-document hybrids are a powerful combination" | p.84 |
| Move to a graph model when many-to-many relationships are very common and connections complex | Social graphs, web graphs, road networks, knowledge graphs | Relational handles simple many-to-many; complex connections become "more natural" as a graph | p.84 |
| Use adjacency lists for traversals and adjacency matrices for machine learning | Choosing a graph representation | Lists follow neighbors edge by edge; matrices feed linear algebra | p.85 |
| Store many different object types in one graph using labels | Heterogeneous data (people, locations, events, check-ins, comments) | Labels keep "a clean data model" while any vertex can connect to any other | p.85, p.87 |
| Index edges on both tail_vertex and head_vertex | Property graph stored in relational tables | Lets you traverse "both forward and backward" efficiently | p.87 |
| Represent three-way or higher relationships with an extra vertex per join row, or a hypergraph | A relationship involving more than two entities | A graph edge "can associate only two vertices with each other" | p.88 |
| Choose a graph when the data structure must keep evolving | Features added over time (allergens, foods) | "a graph can easily be extended to accommodate changes in the application's data structures" | p.88 |
| Use Cypher, SPARQL or Datalog for variable-length traversals; expect SQL recursive CTEs to be clumsy | "follow a WITHIN edge, zero or more times" | A 4-line Cypher query needs 31 lines of SQL; cycles and traversal order add more complexity | p.90-92 |
| Let the planner start from indexed vertices and work backward | Graph query execution | An index on name finds the Location vertices; then follow incoming edges instead of scanning all people | p.90 |
| Namespace predicates with URIs when combining datasets | RDF and internet-wide data exchange | Avoids conflicts when another party uses "within" with a different meaning | p.95 |
| Build complex queries as small, reusable and possibly recursive Datalog rules | Complex or recursive queries | Rules derive virtual tables and "can also invoke themselves", like functions calling each other | p.97-98 |
| Use GraphQL for UI-driven OLTP queries from client devices | Mobile and web frontends requesting JSON shaped for rendering | Clients "rapidly change queries in client code without changing server-side APIs" | p.98-99 |
| Keep GraphQL restrictive: no recursion, no arbitrary search unless explicitly offered | Queries arrive from untrusted sources | Prevents users from causing "a denial-of-service condition" with expensive queries | p.99 |
| Accept duplicated data in GraphQL responses | Sender info repeated per message, replyTo content copied | Larger response, but "much simpler to work with the data" and no extra round trips | p.100 |
| Expose only joins declared in the GraphQL schema, over whatever database you have | GraphQL server design | The server resolves IDs; clients cannot request undeclared joins; GraphQL "can be implemented on top of any type of database" | p.101 |
| Use event sourcing plus CQRS when no single representation serves all reads | Complex domains (conference seat availability) | Write-optimized immutable log; read-optimized derived views | p.101-102 |
| Validate commands before appending; the log must hold only valid events | Request handling | A consumer building a view "is not allowed to reject an event" | p.102-103 |
| Name events in the past tense | Event modeling | An event is "a record of the fact that something has happened"; later changes are separate events | p.103 |
| Make views fully reproducible from the log; keep a view only in memory if recomputing on restart is acceptable | View maintenance code | "delete the materialized views and recompute them by processing the same events in the same order, using the same code" | p.103 |
| Correct mistakes with a subsequent deletion event rather than editing history | An event written in error | Downstream views incorporate it automatically; fewer irreversible actions | p.104 |
| Make event processing deterministic: embed external values or query them as of the event timestamp | Exchange rates, prices | Otherwise recomputing the view "on another date" gives a different result | p.104 |
| Plan for personal-data deletion in immutable logs | GDPR-style deletion requests | Per-user logs, data stored outside the event, or crypto-shredding (each with recompute drawbacks) | p.104 |
| Guard externally visible side effects during replay | Confirmation emails, payments | You "don't want to resend confirmation emails every time you rebuild a materialized view" | p.104 |
| Require the event store to deliver events to every view in identical order | Distributed event storage | "The only important requirement"; "not always easy to achieve in a distributed system" | p.105 |
| Use DataFrames for wrangling and for turning relational data into matrices | ML training, statistics, exploration, financial time series | Operations "go far beyond what relational databases offer"; a sparse matrix with thousands of columns "would therefore not fit well in a relational database" | p.105-106 |
| One-hot encode small fixed categorical sets | Genre-like columns feeding ML | Matrices hold only numbers; the encoding generalizes to multi-valued items | p.106 |
| Use an array database for large multidimensional numeric arrays | Geospatial raster, medical imaging, telescope observations | Specialized storage such as TileDB | p.107 |
| Reach for a specialist model for sequence similarity, ledgers and full-text search | Genome data, double-entry accounting, text retrieval | "None of the databases described here can handle this kind of usage" | p.108 |

## Metrics and numbers

| metric or quantity | definition / how measured | values or thresholds the book gives | caveats | page |
|---|---|---|---|---|
| Queries per page (N+1 problem) | Database round trips to render N items that each need a parent lookup | Handwritten join: 1 query; naive ORM: N+1 queries | Fix by telling the ORM to fetch related data together | p.68-69 |
| Items embedded per document (one-to-few) | Count of child items inside one document | Resume positions: "a small number"; comments on a celebrity post: "many thousands" is too unwieldy | Threshold is qualitative; use tables beyond "few" | p.71 |
| Copies updated per logical change | Write cost of normalized vs denormalized data | Normalized: "only one copy"; denormalized: "more copies to update, more disk space" | Denormalized reads avoid joins | p.74 |
| Materialized timeline depth | Posts precomputed per user | ORDER BY posts.timestamp DESC LIMIT 1000 | Entries hold only post ID, sender ID and repost/reply markers, not text | p.74 |
| Change rate of counters on popular posts | How often like/reply counts change | "multiple times per second" | Reason not to denormalize counts into timelines | p.75 |
| Hydration cost | Cost of resolving IDs at read time | Independent of follow and follower counts; parallelizes well | Still two lookups per timeline read (post content, sender profile) | p.75 |
| Fact table size | Event-history volume in a warehouse | "many petabytes of transaction history" for a big enterprise | Mostly fact tables | p.78 |
| Fact table width | Number of columns | "over a hundred columns, sometimes several hundred" | Dimension tables are also wide | p.79 |
| Schema migration cost | Time to alter a large table | Add column with default: "fast and unproblematic"; UPDATE every row: "likely to be slow"; type change: whole table copied | Online tools exist but migrations remain "operationally challenging" | p.81 |
| Query length for a recursive traversal | Lines of query text for the same question | 4 lines of Cypher vs 31 lines of SQL with WITH RECURSIVE | Measures expressiveness, not speed | p.92 |
| Tuple arity in "triple" stores | Components per stored statement | Neptune: quads (4-tuples, graph ID); Datomic: 5-tuples (transaction ID plus deletion flag) | Book still calls them triple stores | p.92 |
| GraphQL page size in the example | Messages requested per channel | recentMessages(latest: 50) | Reply content is duplicated to avoid a second request if the parent is outside the 50 | p.99-100 |
| GraphQL response duplication | Repeated sender name and image per message | Accepted by design | Larger response size for simpler UI rendering | p.100 |
| Event log write throughput | Writes absorbed per unit time | "higher write throughput than databases because of their sequential access patterns" | Views "catch up at their own pace" | p.104 |
| Rating scale in the matrix example | Range of cell values | 1 to 5 | Matrix is sparse (many empty user-movie cells) | p.106 |
| Matrix width | Columns in the pivoted user-movie matrix | "many thousands of columns" | "would therefore not fit well in a relational database" | p.106 |
| Age of the relational model | Years since Codd (1970) | "more than half a century"; RDBMS and SQL dominant by the mid-1980s | Still dominates warehousing and analytics | p.67, p.107 |
| GQL standard | ISO graph query language based on Cypher | Published 2024 | "not widely adopted yet" | p.92 |

## Failure modes and anti-patterns

| failure mode | cause | consequence | mitigation the book gives | page |
|---|---|---|---|---|
| Impedance mismatch | Objects in code vs tables, rows and columns in storage | "awkward translation layer" between the two models | ORMs reduce boilerplate; document model "reduces the impedance mismatch" for tree-shaped data | p.68, p.71 |
| N+1 query problem | ORM loads a list, then one query per item for a related record | N+1 round trips, slower than a join | Tell the ORM to fetch the related data together | p.68-69 |
| ORM-generated schema | Letting the ORM auto-generate tables | Schemas "awkward" for direct users and "inefficient on the underlying database"; customizing negates the ORM benefit | Design the relational schema deliberately | p.68 |
| Oversized embedded collections | Embedding thousands of children in one document | Document "too unwieldy" | Use separate tables / references | p.71 |
| Duplicated human-meaningful data | Storing text (city name, logo URL) in every record | Every change needs "more code, more write operations, and more disk space, and it risks inconsistencies" | Normalize behind an ID | p.72-73 |
| Partial update of denormalized copies | Process crashes halfway through updating copies | Inconsistent database | Atomic transactions, or stream processing to keep copies consistent | p.74 |
| Denormalizing fast-changing data into a view | Copying like counts or profile photos into timelines | Stale display and significantly higher storage cost | Store IDs only and hydrate at read time | p.75 |
| Storing a many-to-many relationship on both sides | Resume lists org IDs and organization lists resume IDs | The two copies "could become inconsistent with each other" | Store once; use secondary indexes for both directions | p.76-77 |
| Shredding document-like data | Splitting a tree into many relational tables | "cumbersome schemas and unnecessarily complicated application code" | Use the document model for tree-shaped data | p.80 |
| Unaddressable nested items | Document model | Cannot refer to a nested item except by position ("the second item in the list") | Use the relational approach with per-item IDs | p.80 |
| Reorderable lists in relational tables | No standard representation of user-defined order | Renumbering on insert, linked-list or fractional-indexing tricks | Document model stores order in a JSON array | p.80 |
| "Schemaless" misunderstanding | Treating no enforced schema as no schema | Reading code still assumes a structure; "clients have no guarantees as to what fields the documents may contain" | Think schema-on-read; document the implicit schema | p.80 |
| Perpetual old-format handling | Schema-on-read after a format change | "every part of your application that reads from the database now needs to deal with documents in old formats" | Accept, or migrate on write | p.81 |
| Slow or risky migrations | Schema-on-write UPDATE over a large table or column type change | Every row rewritten; whole table copied; operationally challenging | Add NULL-default column, fill at read time; online migration tools | p.81 |
| Wasted locality | Loading a large document to read a small part; small frequent updates rewrite the whole document | Extra I/O and write cost | Keep documents small, avoid frequent small updates | p.82 |
| Joins pushed into application code | Document databases with weak or no join support | Two or more queries per lookup; normalization "inconvenient" | Use $lookup-style operators or a hybrid database | p.73 |
| Binary-only edges | Graph edge connects exactly two vertices | Three-way relationships are not directly expressible | Extra vertex per join-table row, or hypergraph | p.88 |
| Clumsy recursive SQL | Variable-length traversal in SQL | 31 lines vs 4; cycle handling and traversal order add complexity | Use Cypher, SPARQL or Datalog; GQL standard may help | p.92 |
| Predicate name clashes | Combining RDF data from different parties | Same word, different meaning | URI-namespaced predicates | p.95 |
| GraphQL denial of service | Expensive or recursive queries from untrusted clients | Server overload | Language forbids recursion and arbitrary search unless offered | p.99 |
| GraphQL operational overhead | Adopting GraphQL in front of REST/gRPC services | Need for translation tooling; "Authorization, rate limiting, and performance challenges" | Plan tooling and policies up front | p.99 |
| Extra client round trip for referenced records | Returning only the ID of a replied-to message | Client must re-request if the parent is outside the returned page | Duplicate the content in the response | p.100 |
| Nondeterministic event replay | Fetching external data (exchange rate) during event processing | Different result when the view is rebuilt later | Store the rate in the event or query the historical value by timestamp | p.104 |
| Immutable log vs right to erasure | Personal data inside shared event logs | Cannot delete without breaking immutability | Per-user logs; store personal data outside events; crypto-shredding (harder recomputation) | p.104 |
| Repeated side effects on replay | Rebuilding views that trigger emails or payments | Users receive duplicate confirmations | Make side effects replay-aware | p.104 |
| Out-of-order event processing | Views consuming events in different orders | Nonsense state (cancellation before booking) | Event store must deliver the same order to all views | p.103, p.105 |
| View rejecting events | Validation done in the consumer instead of on the command | Views diverge from the log | Validate commands first; log only valid events | p.102-103 |
| Irreversible updates | Direct update/delete in a mutable database | A committed transaction "is often difficult to reverse" | Event sourcing with compensating deletion events | p.104 |
| Wide sparse matrices in relational tables | Thousands of movie columns | "would therefore not fit well in a relational database" | DataFrames and sparse-array libraries | p.106 |
| Model hype cycles | Network, hierarchical, object, XML databases, NoSQL | "Each competitor to the relational model generated a lot of hype in its time, but none lasted" | SQL absorbs other models; evaluate on fit, not fashion | p.67 |

## Elicitation questions

| question (client language) | concept it decides | page |
|---|---|---|
| When you open a record such as a customer profile, do you usually need all of it at once, or just a piece of it? | Locality: document vs relational storage | p.71, p.82 |
| How many sub-items can one record have: a handful, or potentially thousands (like comments on a post)? | One-to-few embedding vs separate tables | p.71 |
| Do you need to look at the same relationship from both sides (all employees of a company and all companies of a person)? | Many-to-many representation, secondary indexes | p.75-77 |
| Which pieces of information change often (names, photos, counters) and which almost never change? | Normalization vs denormalization, hydration of IDs | p.72, p.75 |
| If a shared name, logo or label changes, must every place it appears update immediately? | Normalized reference vs duplicated copy; derived data | p.72-74 |
| Should values like region or company come from a fixed list the user picks, or be typed freely? | ID references vs free text | p.72 |
| Will the product be translated into other languages? | Standardized lists enabling localization | p.72 |
| Do all records of a type look the same, or do they vary a lot or come from outside systems you do not control? | Schema-on-read vs schema-on-write | p.81 |
| How often will the shape of the data change, and can you tolerate maintenance windows for migrations? | Schema evolution strategy | p.81 |
| Do users need to reorder items by drag and drop? | Reorderable lists (document arrays vs relational tricks) | p.80 |
| Do you need to point at one specific sub-item from elsewhere (for example, "the second job in this profile")? | Addressability of nested items | p.80 |
| Is the heart of your product the connections between things, with questions that hop through several links? | Graph model and recursive queries | p.84, p.90 |
| Will the kinds of things and relationships you track keep growing as the product evolves? | Graph evolvability, heterogeneous vertices | p.85, p.88 |
| Is this system for day-to-day operations, or for reports and analysis over history? | OLTP normalization vs analytics denormalization | p.74, p.79 |
| What are the business events you want to analyze (sales, clicks), and by what attributes will you slice them (who, what, where, when)? | Fact and dimension tables, star schema | p.77-78 |
| Is it acceptable for reports to run on data that is copied and flattened, trading storage for speed? | Snowflake vs star vs one big table | p.79 |
| Do you need an audit trail of exactly what happened and when, or the ability to reconstruct past states? | Event sourcing as audit log | p.104 |
| Do different parts of the business need very different views of the same data (dashboard, badge printing, booking status)? | CQRS materialized views | p.102-103 |
| When something was entered wrongly, can it simply be edited, or must the correction itself be recorded? | Immutable events with deletion events | p.104 |
| Do you store personal data that people may ask you to erase completely? | Immutable logs vs erasure; crypto-shredding | p.104 |
| Do any calculations depend on outside values that change over time (exchange rates, prices)? | Deterministic event processing | p.104 |
| Do actions trigger emails, payments or other things that must never be repeated? | Side effects on replay | p.104 |
| Will mobile or web clients need to choose exactly which fields they fetch, and do you trust those clients? | GraphQL and its restrictions | p.98-99 |
| Will analysts or data scientists need to pull data into spreadsheets, matrices or ML pipelines? | DataFrames, matrices, one-hot encoding | p.105-106 |
| Does your data include unusual kinds such as DNA sequences, accounting ledgers, or text that must be searched by keyword? | Specialist data models | p.108 |
| Who besides the application reads the data (analysts, data engineers, other services)? | Relational schema design even with an ORM | p.68 |
| How big will this get, and are there outliers (accounts with millions of followers)? | Scale thresholds for joins vs denormalization | p.74-75 |

## Verifiable properties

| property | how to test | page |
|---|---|---|
| Every ID reference resolves (no dangling foreign keys) | Join each referencing column to its target table and assert zero orphan rows | p.72-73 |
| No N+1 queries on list pages | Count SQL statements while rendering a list with 1 item and with 100 items; the count must not grow with N | p.68-69 |
| Embedded collections stay small | Assert the length of embedded arrays and total document size are under a configured limit on write | p.71, p.82 |
| Many-to-many lookups use indexes in both directions | Run EXPLAIN on the forward and reverse queries and assert an index on user_id and on org_id (or the nested org_id) is used | p.77 |
| Denormalized copies match their source | For every redundant field (for example a logo URL) compare against the canonical entity and assert equality | p.73 |
| Denormalized updates are atomic | Inject a crash mid-update and assert either all copies or none changed | p.74 |
| Fast-changing values are not denormalized into materialized views | Inspect the timeline schema: only IDs and markers, no like counts or display names | p.74-75 |
| Readers handle old-format documents | Fixture documents written before the format change (only name, no first_name) must render correctly | p.81 |
| Column additions do not rewrite the table | Time ALTER TABLE ... ADD COLUMN ... DEFAULT NULL on a large table and assert it completes within a tight bound | p.81 |
| Graph edges are indexed on both ends | Assert indexes exist on edges(tail_vertex) and edges(head_vertex) | p.87 |
| Recursive queries terminate on cyclic data | Insert a WITHIN cycle and assert the traversal query returns rather than looping | p.92 |
| GraphQL rejects recursive or unbounded queries and undeclared joins | Submit a deeply nested or recursive query and an undeclared relationship; assert rejection | p.99, p.101 |
| The event log is append-only | Assert no UPDATE or DELETE privileges or statements against the events table | p.101-102 |
| Event names are in the past tense | Lint event type names against a past-tense pattern | p.103 |
| Only valid events reach the log | Issue an invalid command (overbooking) and assert no event is appended | p.102-103 |
| Materialized views are reproducible | Delete a view, replay the log, assert the rebuilt view equals the original byte for byte | p.103 |
| Replay is deterministic over time | Replay the same log on two different dates (mocked clock, live external services) and assert identical views | p.104 |
| Replay causes no side effects | Replay with a mocked mailer/payment gateway and assert zero outbound calls | p.104 |
| Deletion events purge downstream views | Append a deletion event and assert the data disappears from every view | p.104 |
| All views consume events in log order | Record the sequence each consumer processed and assert it equals the log order | p.105 |
| Star schema integrity | Every fact row's dimension keys resolve; each dimension row is unique per entity | p.78 |
| One-hot encoding is well formed | Each single-genre row has exactly one 1; multi-genre rows have one 1 per genre and 0 elsewhere | p.106 |

## Terms

| term | definition |
|---|---|
| data model | A way of representing data at one layer (objects, JSON, tables, graph) in terms of the layer below (p.65) |
| declarative query language | Specifies the pattern and transformation of the result, not the steps to compute it; SQL, Cypher, SPARQL, Datalog (p.66) |
| relational model | Codd's 1970 model: data as relations (tables) that are unordered collections of tuples (rows) (p.67) |
| NoSQL / NewSQL | 2010s labels for new data models, schema flexibility, scalability and open source; NewSQL aimed at NoSQL scalability with relational guarantees; both terms have faded (p.67) |
| document model | Data stored as self-contained (usually JSON) documents; popularized by MongoDB and Couchbase (p.67) |
| impedance mismatch | The awkward translation between application objects and relational tables (p.68) |
| ORM | Object-relational mapping framework (ActiveRecord, Hibernate) that reduces translation boilerplate (p.68) |
| N+1 query problem | One query for N items plus one query per item for related data (p.68-69) |
| one-to-many / one-to-few | A parent with several children; "one-to-few" stresses that the count is small (p.71) |
| locality | Related data stored contiguously so it is fetched together (p.71, p.82) |
| normalization | Human-meaningful information stored once and referenced by ID (p.72) |
| denormalization | Human-meaningful information duplicated into every record that uses it (p.72) |
| join | Resolving an ID into the referenced record inside the database (p.72) |
| $lookup | MongoDB aggregation operator that performs a join (p.73) |
| derived data | Data computed from a system of record, such as denormalized copies or materialized timelines (p.74) |
| hydrating IDs | Looking up human-readable information by ID at read time; a join in application code (p.75) |
| many-to-one / many-to-many | Many records referencing one entity; entities referencing each other in both directions (p.75) |
| associative (join) table | Relational table whose rows pair IDs from two tables (p.75) |
| secondary index | Index on a non-primary field enabling queries in both directions of a relationship (p.77) |
| star schema | Fact table at the center with foreign keys to surrounding dimension tables (p.77-79) |
| fact table | Table whose rows are individual events (a sale, a page view) (p.77-78) |
| dimension table | Table describing the who/what/where/when/how/why of a fact (p.78) |
| snowflake schema | Star schema whose dimensions are broken into subdimensions (p.79) |
| dimensional modeling | Kimball-style warehouse schema design convention (p.77) |
| one big table (OBT) | Fact table with dimension attributes folded into denormalized columns (p.79) |
| ETL | Process translating operational data into the warehouse schema (p.77) |
| shredding | Splitting a document-like structure into multiple relational tables (p.80) |
| fractional indexing | A trick for user-defined ordering in relational databases (p.80) |
| schemaless | Misleading label for databases that do not enforce a schema (p.80) |
| schema-on-read | Structure implicit, interpreted when data is read; like dynamic typing (p.80-81) |
| schema-on-write | Explicit schema enforced when data is written; like static typing (p.80-81) |
| BSON | MongoDB's binary variant of JSON (p.82) |
| interleaved tables / cluster tables / column families | Relational and wide-column mechanisms for locality (Spanner, Oracle, Bigtable) (p.82) |
| XQuery, XPath, JSON Pointer, JSONPath | Query/path languages for XML and JSON documents (p.82) |
| aggregation pipeline | MongoDB's JSON-syntax query language with $match, $group, $lookup stages (p.83) |
| nonsimple domains | Codd's term for nested relations as values, comparable to JSON support in SQL (p.84) |
| graph | Vertices (nodes, entities) connected by edges (relationships, arcs) (p.84) |
| adjacency list / adjacency matrix | Graph representations: per-vertex neighbor IDs vs a 0/1 matrix (p.85) |
| knowledge graph | Graph of facts about entities used by search engines; Wikidata publishes one (p.85) |
| property graph (labeled property graph) | Vertices and edges each with a unique ID, label and key-value properties; edges have tail and head vertices (p.86) |
| hypergraph | Graph whose edges can connect more than two vertices (p.88) |
| Cypher / openCypher | Property-graph query language from Neo4j, later an open standard; arrow pattern syntax (p.88) |
| GQL | ISO graph query language standard based on Cypher, published 2024 (p.92) |
| recursive common table expression | SQL WITH RECURSIVE construct for variable-length traversals (p.90) |
| triple store | Stores (subject, predicate, object) statements; Datomic, AllegroGraph, Blazegraph (p.92) |
| Turtle / Notation3 | Compact text formats for RDF triples (p.93) |
| Semantic Web | Early-2000s effort for machine-readable internet-wide data exchange; legacy in JSON-LD, Open Graph, Schema.org (p.94) |
| RDF | Resource Description Framework, data model for the Semantic Web; URIs for subjects, predicates and objects (p.94-95) |
| SPARQL | Query language for RDF triple stores; Cypher borrowed its pattern matching (p.95) |
| Datalog | 1980s rule-based query language, subset of Prolog; facts and rules deriving virtual tables; strong at recursion (p.96-98) |
| fact / rule (Datalog) | A fact is a row in a table; a rule derives new facts when all right-hand patterns match (p.96-97) |
| GraphQL | Restrictive OLTP query language letting clients request a JSON document shaped for their UI (p.98-99) |
| event sourcing | Using an append-only log of immutable events as the source of truth (p.101-102) |
| CQRS | Command query responsibility segregation: separate write-optimized and read-optimized representations (p.102) |
| command | A user request that must be validated before it becomes an event (p.102-103) |
| event | A validated fact that something happened, named in the past tense (p.103) |
| materialized view / projection / read model | Derived representation updated as events are appended (p.102) |
| crypto-shredding | Encrypting personal data with a key that can later be deleted (p.104) |
| DataFrame | Table-like structure manipulated by a sequence of commands (R, Pandas, Spark, Dask, ArcticDB) (p.105) |
| merge | DataFrame term for a join (p.105) |
| one-hot encoding | One 0/1 column per possible categorical value (p.106) |
| sparse matrix | Matrix with many empty cells, handled by libraries such as NumPy (p.106) |
| array database | Database for large multidimensional numeric arrays, such as TileDB (p.107) |
| ledger | Double-entry accounting data model (TigerBeetle); distributed ledgers underlie blockchains (p.108) |
| full-text search | Keyword search over text, a data model usually used alongside databases (p.108) |

## Chapter summary (condensed)

- Data models are "a huge subject"; the chapter is a quick look at a broad variety to help you find the model that fits your requirements (p.107).
- The relational model, "more than half a century old", remains important, especially in data warehousing and business analytics where star and snowflake schemas and SQL "are ubiquitous" (p.107).
- The document model targets self-contained JSON documents where inter-document relationships are rare (p.107).
- Graph models go the opposite way: "anything is potentially related to everything" and queries traverse multiple hops, met by recursive queries in Cypher, SPARQL or Datalog (p.107).
- DataFrames generalize relational data to large numbers of columns and bridge to the multidimensional arrays behind ML, statistics and scientific computing (p.107).
- One model can often be emulated in another (graph data in a relational database), but the result can be awkward, as the SQL recursive-query example showed (p.107).
- Specialist databases exist per model, yet databases keep expanding into neighboring niches: JSON columns in relational databases, joins in document databases, improving graph support in SQL (p.107-108).
- Event sourcing represents data as an append-only log of immutable events, advantageous for complex business domains; the log is good for writing, and CQRS translates it into read-optimized materialized views (p.108).
- Nonrelational models typically do not enforce a schema, easing adaptation to changing requirements, but the application still assumes a structure; the question is only whether the schema is explicit (enforced on write) or implicit (assumed on read) (p.108).
- Some models were not covered: genome sequence-similarity search (GenBank), double-entry ledgers (TigerBeetle) and blockchain distributed ledgers, and full-text search, which the book touches on with search indexes and vector search in Chapter 4 (p.108).

## Second-edition-specific

- Event sourcing and CQRS get a full section in the data-models chapter (conference example, commands vs events, past-tense naming, reproducible views, GDPR and crypto-shredding, side effects on replay, EventStoreDB/MartenDB/Axon/Kafka) (p.101-105).
- DataFrames, matrices and arrays appear as a data model (Pandas, Spark, Dask, ArcticDB; one-hot encoding; TileDB array databases; financial time series) (p.105-107).
- GraphQL is covered as a restrictive OLTP query language, including its denial-of-service rationale and the 2024 "over GraphQL" critique (p.98-101).
- NoSQL and NewSQL are described as terms that "have faded", with the convergence of relational and document databases as the lasting outcome (p.67, p.83-84).
- Object databases are distinguished from cloud object storage "for large files" (p.67).
- The GQL ISO standard (2024), PGQL, GSQL and GQL/SQL-PGQ pattern matching are mentioned (p.92).
- One big table (OBT) is added alongside star and snowflake schemas (p.79).
- The social-network timeline case study and "hydrating the IDs" from X/Twitter inform the denormalization discussion (p.74-75).
- Reorderable lists via fractional indexing (Figma, Observable references) (p.80).
- Online schema migration tooling (pt-online-schema-change, gh-ost, pg-osc, pgroll) and the add-NULL-column-fill-on-read pattern (p.81).
- Stream processing is named as a way to keep denormalized copies consistent (p.74).
- Quads and 5-tuples in Neptune and Datomic; KuzuDB, Memgraph, Apache AGE, CozoDB, LinkedIn LIquid as current graph and Datalog systems (p.85, p.88, p.92, p.96).
- Semantic Web legacy framed through JSON-LD, biomedical ontologies, Open Graph link unfurling, Wikidata and Schema.org (p.94).
- JSONPath RFC 9535 (2024) and JSON Pointer as JSON path languages (p.82).
- Forward pointers to vector search and full-text search in Chapter 4, and to TigerBeetle ledgers and blockchains as unmentioned models (p.108).
- Recent references (2023-2025): "SQL Needed Structure" (2025), Stonebraker and Pavlo "What Goes Around Comes Around... And Around..." (2024), Spring single-query loading (2023) (p.108-114).
