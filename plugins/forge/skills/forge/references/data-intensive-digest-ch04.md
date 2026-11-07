<!-- forge reference: a page-cited digest of Designing Data-Intensive Applications, 2nd ed. (Kleppmann & Riccomini, O'Reilly 2026), chapter 4. Written while reading the chapter; every rule, number, failure mode, question and property carries its page. The condensed layer is references/data-intensive-protocol.md (§0-§8); the row-level map is references/data-intensive-book-map.md; this file is the full layer the requirements data round and the build Phase 4 review consult for the chapters a DATA.md group cites. -->

# DDIA 2nd ed. - Chapter 4: Storage and Retrieval (digest)

Source: ch04.txt (pdftotext extraction), book pages p.115-p.159 (body p.115-p.151, references p.151-p.159).

## Thesis

- A database must do two things: store the data you give it and give it back when asked. Application developers do not write storage engines, but must "select a storage engine that is appropriate" and have "a rough idea of what the storage engine is doing under the hood" to configure it (p.115).
- OLTP engines come in two families: log-structured engines that append immutable files (SSTables, LSM-trees: high write throughput) and update-in-place engines (B-trees: predictable, fast reads). Every index speeds some reads while costing disk space and write speed, so indexes are chosen by hand from query patterns (p.115, p.117, p.129, p.150).
- Analytical engines store facts column by column, compress and sort them, and execute queries with JIT compilation or vectorized batches to minimize both disk reads and CPU time; cloud warehouses decouple compute from object storage into query engine, storage format, table format and catalog (p.134-143, p.150).
- Beyond single-key range queries, multidimensional indexes (R-trees), inverted indexes for full-text search, and approximate vector indexes (IVF, HNSW) for semantic search cover queries with several simultaneous conditions (p.145-149).
- Rule of thumb throughout: measure with your own workload, because "benchmarks are often sensitive to details of the workload" (p.129).

## Decision rules

| rule | when it applies | why (mechanism) | page |
|---|---|---|---|
| Choose indexes manually from the application's typical query patterns; do not index everything | Any database | "every index consumes additional disk space and slows down writes, sometimes substantially" | p.117 |
| Expect appending to a log to be the fastest possible write | Write-path design | "it's hard to beat the performance of simply appending to a file" | p.117 |
| Use an in-memory hash index only when all keys fit in RAM and you need no range scans | Small key sets with point lookups | On-disk hash maps need random I/O, are expensive to grow and have fiddly collisions; range queries need a lookup per key | p.118-119 |
| Prefer key-sorted structures (SSTables) over hash tables for database indexes | General-purpose storage | Sorting enables sparse indexes, range queries and merge-based compaction | p.119 |
| Keep a sparse index (first key per block of a few KB) instead of indexing every key | SSTable design | After a seek to the nearest indexed key, a few-KB block "can be scanned very quickly" | p.119 |
| Compress SSTable blocks | Disk-space or I/O-bound workloads | Saves disk and I/O bandwidth "at the cost of using a bit more CPU time" | p.119 |
| Buffer writes in a memtable (red-black tree, skip list or trie), flush it as an SSTable at a few MB, and read newest-first (memtable, newest segment, older segments) | LSM engines | Inserts arrive in any order but are written out sorted; the latest value is found in the most recent place a key appears | p.120 |
| Keep a separate append-only log of every write until the memtable is flushed | Crash safety for the memtable | Restores the memtable after a crash; "the corresponding part of the log can be discarded" after each flush | p.120 |
| Merge and compact segments in the background, keeping only the most recent value per key | LSM maintenance | Mergesort-like pass with minimal memory; discards overwritten and deleted values | p.120 |
| Delete via tombstones and drop them once merged into the oldest segment | Deletes in LSM engines | The tombstone tells merges to discard earlier values of the key | p.121 |
| Treat segment files as immutable; switch readers to the merged file, then delete the inputs | LSM concurrency and recovery | Reads continue on input segments during a merge; unfinished files can simply be deleted after a crash | p.121-122 |
| Consider object storage for segment files | Cloud deployments (SlateDB, Delta Lake) | Written once and immutable, segments "are also well suited for writing to object storage" | p.122 |
| Put checksums in the write log and discard corrupted or incomplete entries | Crash or full disk mid-record | Partial records are detected rather than replayed | p.122 |
| Add a Bloom filter to every SSTable | Reads of missing keys or keys last updated long ago | Skips segments that definitely lack the key; a false positive only costs extra work | p.122-123 |
| Budget about 10 bits of Bloom filter per key for 1% false positives; add 5 bits per key for each further tenfold reduction | Sizing Bloom filters | Rule of thumb; use a calculator for exact parameters | p.123 |
| Use size-tiered compaction for write-mostly workloads | "mostly writes and few reads" | Data is rewritten "only a few times in larger sequential merges"; needs lots of temporary disk | p.124 |
| Use leveled compaction for read-dominated workloads or hot-key skew | Workload "dominated by reads", or "a small number of keys frequently and a large number of keys rarely" | Fixed-size, key-range-partitioned levels mean fewer SSTables to check per read and less disk space | p.124 |
| Use an embedded database when the data fits one machine and concurrency is low | Mobile apps; small, fully separate tenants | In-process library with no network API; one instance per tenant is possible | p.125 |
| Default to B-trees for general-purpose key-value indexing | Relational and many nonrelational databases | "the standard index implementation in almost all relational databases" | p.125 |
| Pick LSM for write-heavy and B-tree for read-heavy workloads, but benchmark your own workload and expect hybrids | Engine selection | "benchmarks are often sensitive to details of the workload"; engines blend both (multiple B-trees merged LSM-style) | p.129 |
| Expect predictable point reads on B-trees and costlier range queries on LSM | Query mix | A B-tree reads one page per level; LSM range scans must merge all segments and Bloom filters do not help | p.129 |
| Plan for backpressure in LSM engines under sustained write bursts | High write throughput | If compaction falls behind, engines such as RocksDB "suspend all reads and writes until the memtable has been written out" | p.129 |
| Design storage engines for parallel I/O on NVMe SSDs | Modern hardware | SSDs serve "many independent read requests in parallel", but only if the engine is designed for it | p.129 |
| Prefer sequential writes to random writes, even on SSDs | Throughput and drive wear | Flash writes 4 KiB pages but erases 512 KiB blocks; random writes force garbage collection and wear the drive faster | p.130 |
| Store large values separately from keys in LSM engines | Values much larger than keys | Compaction then rewrites only keys and references, cutting write amplification | p.130-131 |
| Count B-tree writes as at least double (WAL plus page), sometimes a whole page for a few changed bytes | Write-heavy B-tree workloads | Required so the tree "can be correctly recovered after a crash or power failure" | p.131 |
| Favor LSM engines when write amplification is the bottleneck | Disk-bandwidth-bound writes, SSD lifetime | LSM-trees "tend to have lower write amplification" (no whole-page writes, compressed chunks) | p.131 |
| Run write benchmarks long enough for compaction to appear | Measuring write throughput | An empty LSM-tree has all disk bandwidth free; later, writes share it with compaction | p.131 |
| Schedule a background page-moving process (vacuum) for B-trees | Many deletes | Freed pages stay inside the file and "can't easily be returned to the operating system" | p.131 |
| Expect smaller on-disk files from LSM engines, especially with leveled compaction | Disk-constrained systems | Block compression and no half-empty pages; size-tiered uses more space, "especially temporarily during compaction" | p.131-132 |
| Verify deletion latency when regulations require real deletion | Data protection compliance on LSM engines | Deleted records persist in higher levels "until the tombstone ... has been propagated through all the compaction levels" | p.132 |
| Use immutable segments for cheap snapshots | Backups, test copies | Write out the memtable, record the segment list, keep those files; no copying needed | p.132 |
| Build secondary indexes as postings lists or by appending the row ID to the key | Non-unique indexed values | Keeps each entry unique or lists all matching rows | p.132 |
| Choose clustered index, heap-file reference or covering index deliberately | Index design | Covering indexes answer queries from the index alone but duplicate data, "uses more disk space and slows down writes" | p.133 |
| Overwrite heap-file records in place only when the new value is not larger | Updating a value without changing the key | Otherwise the record moves and every index must be updated, or a forwarding pointer is left | p.133 |
| Use an in-memory database when the dataset fits in RAM and you need speed or rich data structures | Hot datasets, Redis-style queues and sets | Speed comes from avoiding "the overheads of encoding in-memory data structures in a form that can be written to disk", not from avoiding disk reads | p.134 |
| Give non-cache in-memory stores durability via an append-only log, periodic snapshots or replication | In-memory data that must survive restarts | Disk is "merely used as an append-only log"; files can be backed up and inspected | p.134 |
| Treat HTAP products as two engines behind one SQL interface | Mixed OLTP and analytics in one product | Vendors increasingly separate the storage and query engines | p.135 |
| Prefer cloud warehouses that decouple compute from object storage when elasticity matters | Variable analytical load | Storage and compute scale independently; better integration with cloud services | p.135 |
| Compose the analytics stack from a separate query engine, storage format, table format and data catalog | Data lakes on object storage | Previously integrated (Hive), now separable; other applications can read the same files and governance tools can read the catalog | p.135-136 |
| Put a table format (Iceberg, Delta) on top of immutable Parquet-style files | Inserts, deletes, time travel, transactions on a lake | Table formats define which files form a table and its schema | p.136 |
| Store fact tables column-oriented | Queries touch 4 or 5 of 100+ columns over trillions of rows | Only the needed columns are read and parsed | p.136-137 |
| Group columnar blocks by timestamp range | Date-restricted analytical queries | Only blocks overlapping the date range are loaded | p.138 |
| Use bitmap encoding with run-length or roaring compression for low-cardinality columns | 100,000 products over billions of rows | Sparse bitmaps compress well; IN and AND predicates become bitwise OR and AND | p.139-140 |
| Do not confuse column-oriented storage with wide-column (column-family) databases | Bigtable, HBase, Accumulo | Wide-column stores "are row-oriented, since they store all values from a row together" | p.140 |
| Sort whole rows (never columns independently) by the most-queried column first, then a grouping column | Column-store tuning | Range scans hit only matching rows; the first sort key compresses to "a few kilobytes" | p.140-141 |
| Write to column stores in bulk through an in-memory sorted row store merged LSM-style into new files | ETL loads | A single-row insert would "rewrite all the compressed columns from the insertion position onward" | p.141 |
| Use query compilation (JIT to machine code) or vectorized batch operators, not row-at-a-time interpretation | Scans over millions of rows | Interpretation "is too slow for many analytics purposes" | p.142 |
| Exploit CPU behavior: sequential memory access, tight inner loops, SIMD and operating on compressed data | Query engine design | Fewer cache misses, branch mispredictions, allocations and copies | p.143 |
| Use materialized views for queries repeated often, accepting more write work | Repeated dashboards and reports | Precomputed copy on disk vs a virtual view expanded on every read | p.143-144 |
| Use data cubes only as a performance boost; keep the raw data | Fixed aggregates over dimensions | Cubes cannot answer questions on attributes that are not dimensions (items costing more than $100) | p.144-145 |
| Use a concatenated index only for queries on its leading columns | (lastname, firstname) phone-book style | Sort order makes it "useless" for the trailing column alone | p.145 |
| Use a spatial or multidimensional index (R-tree, Bkd-tree, GiST, space-filling curve, grids) for simultaneous range conditions | Map bounding boxes, RGB color ranges, date plus temperature | A concatenated index can narrow by one dimension only | p.145-146 |
| Use an inverted index (postings lists or sparse bitmaps) for keyword search | Full-text search | Multi-term AND becomes a bitwise AND, like a vectorized warehouse query | p.146-147 |
| Add trigram indexes only when substring or regular-expression search is needed | Arbitrary substrings of 3+ characters | They "are quite large" | p.147 |
| Support typo tolerance with a Levenshtein automaton over the term dictionary | Fuzzy search | Efficient search for words within a given edit distance | p.147 |
| Use vector embeddings plus a vector index for search by meaning | RAG, help pages ("close my account" vs "canceling your subscription") | Semantically similar documents get nearby vectors; R-trees "don't work well for vectors with many dimensions" | p.147-148 |
| Pick a flat index for exactness, IVF or HNSW for speed with approximation; tune IVF probes | Vector search | Flat compares every vector; IVF clusters into centroids; HNSW layers a proximity graph; both approximate | p.148-149 |

## Metrics and numbers

| metric or quantity | definition / how measured | values or thresholds the book gives | caveats | page |
|---|---|---|---|---|
| Lookup cost in an unindexed log | Time to find a key by scanning the whole file | O(n): doubling the records doubles lookup time | Appends stay cheap | p.117 |
| SSTable block size | Bytes of key-value pairs per sparse-index entry | "a few kilobytes" | Scanned linearly after a seek; blocks may be compressed | p.119 |
| Memtable flush threshold | Memtable size at which it is written out as an SSTable | "typically a few megabytes" | Engine-configurable | p.120 |
| Segment file size | Size of immutable LSM segments | "typically several megabytes or more" | Contrast with fixed-size B-tree pages | p.125 |
| Bloom filter bits per key | Filter bits divided by number of keys | 10 bits/key -> about 1% false positives; each extra 5 bits/key cuts the rate tenfold | Depends on key count, bits set per key and total bits; use a calculator | p.123 |
| Bloom filter example | Figure 4-4 | 2 keys, 16 bits, 3 hash positions per key | Illustrative only; real filters have more of both | p.122 |
| Size-tiered merge example | Input vs output SSTable sizes | Four 256 MB SSTables -> one 898 MB SSTable (not 1,024 MB) | Shrinkage from deletions, overwrites and TTL expirations | p.124 |
| B-tree page size | Fixed block overwritten in place | Traditionally 4 KiB; PostgreSQL 8 KiB; MySQL 16 KiB by default | Page number times page size gives the file offset | p.125-126 |
| Branching factor | Child references per B-tree page | Figure example 6; "typically it is several hundred" | Depends on key and reference sizes; abbreviated keys raise it | p.126, p.128 |
| B-tree depth | Levels from root to leaf | O(log n); "three or four levels deep" for most databases | One page read per level | p.127 |
| B-tree capacity example | Data addressable by a tree | 4 levels, 4 KiB pages, branching factor 500 -> up to 250 TB | Rule-of-thumb arithmetic | p.127 |
| B-tree age | Years in use | Introduced 1970; "ubiquitous" less than 10 years later | - | p.125 |
| LSM-tree age | Publication | 1996 (building on log-structured filesystems); SSTable and memtable terms from the Bigtable paper | - | p.121 |
| HDD random write cost | Head movement plus platter rotation | "several milliseconds" | Why sequential writes dominate on spinning disks | p.130 |
| SSD page and erase block | Flash write unit vs erase unit | Page typically 4 KiB; erase block typically 512 KiB | Mixed valid/invalid pages force garbage collection before erase | p.130 |
| Write amplification | Bytes written to disk divided by bytes a plain append-only log would write (sometimes counted in I/O operations) | B-tree: at least 2x (WAL plus page), often whole pages; LSM: log, flush and every compaction, yet "tend to have lower write amplification" for typical workloads | Benchmarks must run long enough; also drives SSD wear | p.131 |
| B-tree minimum writes per datum | Copies written per logical write | "at least twice" | Full-page writes add more | p.131 |
| Fact table scale | Rows and bytes in a warehouse | "trillions of rows and petabytes of data" | Dimension tables are "millions of rows" | p.136 |
| Columns touched per analytical query | Columns read vs columns present | "four or five" of "over one hundred" | SELECT * is "rarely needed for analytics" | p.136 |
| Example 4-1 column usage | fact_sales columns the query needs | 3 (date_key, product_sk, quantity) | A row store would still load 100+ attributes per row | p.137 |
| Columnar block size | Rows per block | "thousands or millions of rows" | Often one timestamp range per block | p.138 |
| Column cardinality example | Distinct values vs rows | 100,000 distinct products vs billions of sales transactions | Drives bitmap-encoding efficiency | p.139 |
| Compressed size of the first sort column | Run-length encoded low-cardinality sorted column | "a few kilobytes - even if the table has billions of rows" | Only the first sort key compresses this well | p.141 |
| Data cube dimensionality | Number of grouping dimensions | 2 in Figure 4-10; 5 in the Figure 3-5 schema | Cannot query attributes that are not dimensions | p.144 |
| Example 2-D geo query | Latitude and longitude bounds | latitude 51.4946 to 51.5079; longitude -0.1162 to -0.1004 | A concatenated index cannot serve it efficiently | p.145 |
| Example 2-D weather query | Year plus temperature range | 25 to 30 degrees C within a given year | A 1-D index scans one attribute and filters the other | p.146 |
| n-gram length | Substring length indexed | Trigrams, n = 3 (hel, ell, llo); minimum searchable substring 3 characters | Indexes "quite large" | p.147 |
| Edit distance | Letters added, removed or replaced | Example: edit distance 1 | Implemented with Levenshtein automata in Lucene | p.147 |
| Embedding dimensionality | Floats per vector | Toy examples 3-dimensional; real models "often over 1,000 numbers" | Individual numbers are not interpretable | p.148 |
| Example embeddings | Points in 3-D space | agriculture [0.38, 0.83, 0.41]; vegetables [0.36, 0.64, 0.67]; star schemas [0.85, 0.10, -0.52] | Closer vectors mean more similar documents | p.148 |
| IVF probes | Number of partitions checked per query | More probes -> "more accurate but slower" | Results are approximate regardless | p.149 |

## Failure modes and anti-patterns

| failure mode | cause | consequence | mitigation the book gives | page |
|---|---|---|---|---|
| Disk fills up | Append-only log never frees overwritten entries | Out of disk space | Segment merging and compaction discard overwritten values | p.118, p.120 |
| Slow restarts | In-memory hash index is not persisted | Whole log scanned on every restart | Persist index structures with the segments (sparse index in SSTables) | p.118 |
| Index does not fit in memory | Hash table must be in RAM; on-disk hash maps perform poorly | Random I/O, costly growth, collision logic | Sorted SSTables with sparse indexes | p.118-119 |
| Inefficient range queries | Hash index | Each key in the range looked up individually | Key-sorted structures (SSTable, B-tree) | p.119 |
| Memtable lost on crash | Unflushed in-memory writes | Recent writes lost | Append every write to a separate log; discard after flush | p.120 |
| Partially written log records | Crash or full disk halfway through a write | Corrupt entries on recovery | Checksums; discard corrupted or incomplete entries | p.122 |
| Half-written SSTable or merge | Crash during flush or compaction | Unusable file | Immutability: "delete the unfinished SSTable and start afresh" | p.122 |
| Slow reads of absent or old keys | Several segments must be checked | Many disk reads per lookup | Bloom filter per segment | p.122-123 |
| Bloom filter false positive | Bits set by other keys coincide | Unnecessary block decode, then search continues | Harmless; tune bits per key | p.123 |
| Compaction needs lots of temporary disk | Size-tiered merging of very large SSTables | Space spikes during merges | Leveled compaction is more incremental and uses less space | p.124 |
| Latency spikes and stalls | Memtable fills faster than it can be flushed; compaction cannot keep up | Engine applies backpressure and "suspend[s] all reads and writes" | Size memtables and compaction for the burst profile; expect stalls | p.129 |
| Corrupted B-tree after crash | Page split overwrites several pages; crash midway | Orphan pages, "corrupted tree"; torn pages if hardware cannot write a page atomically | Write-ahead log applied before pages; recover from WAL | p.127-128 |
| Lost writes despite WAL | WAL not flushed | Data not durable | Durable only once "written to the WAL and flushed to disk using the fsync system call" | p.128 |
| SSD wear and lost bandwidth | Random writes mix valid and invalid pages in 512 KiB erase blocks | Garbage collection consumes write bandwidth and wears flash | Sequential write patterns (log-structured engines) | p.130 |
| High write amplification | B-tree whole-page writes; LSM rewrites on every compaction | Fewer writes per second within disk bandwidth; faster SSD wear | LSM compression, key-value separation for large values | p.130-131 |
| Misleading write benchmarks | Measuring an empty LSM-tree | Compaction has not started, throughput overstated | Run long enough for write amplification to show | p.131 |
| B-tree fragmentation | Many deleted keys leave unused pages mid-file | Space not returned to the OS | Background vacuum-style page moving | p.131 |
| Deleted data lingers | LSM tombstone not yet propagated through all levels | Compliance risk when deletion must be provable | Wait for full propagation; specialist engines propagate faster | p.132 |
| Costly snapshots | B-tree pages overwritten in place | Hard to snapshot efficiently | Immutable segments: record the file list | p.132 |
| Record relocation on update | Heap-file value grows beyond its slot | Record moves; all indexes must be updated or a forwarding pointer left | Keep updates in place when the new value is not larger | p.133 |
| Data lost on restart | Cache-only in-memory store (Memcached) | Contents gone after restart | Acceptable for caches; otherwise log, snapshots or replication | p.134 |
| Weak durability | Asynchronous disk writes (Redis, Couchbase) | Recent writes may be lost | Synchronous logging where required | p.134 |
| Reading whole rows for narrow queries | Row-oriented storage of 100+ column fact tables | Loads and parses every attribute of every matching row | Column-oriented storage | p.137 |
| Broken row reconstruction | Sorting each column independently | Cannot tell which values belong together | Sort whole rows; keep every column in the same row order | p.140 |
| Expensive single-row inserts | Writing one row into the middle of a sorted compressed column store | Rewrites all compressed columns from that point on | Bulk writes via an in-memory sorted store merged in batches | p.141 |
| Slow query operators | Row-at-a-time interpretation of the query plan | Too much CPU per row | Query compilation or vectorized processing | p.142 |
| Stale or costly materialized views | Underlying data changes | Views need updating; more work on writes | Automatic maintenance (some databases, Materialize) | p.143-144 |
| Inflexible aggregates | Data cube lacks a needed dimension | Cannot compute, for example, the share of items over $100 | Keep raw data; use cubes only as a boost | p.145 |
| Concatenated index misses | Query filters only on a non-leading column | Index "useless" for that query | Order columns by query pattern or add another index | p.145 |
| Inefficient 2-D range queries | Concatenated index on latitude, longitude | Narrows one dimension only | R-trees, Bkd-trees, space-filling curves, grids | p.145-146 |
| Oversized search indexes | Trigram indexes for substring and regex search | "quite large" | Use only when needed | p.147 |
| Spatial indexes fail on embeddings | R-trees on vectors with many dimensions | Poor performance | Specialized vector indexes (flat, IVF, HNSW) | p.148 |
| Slow exact vector search | Flat index compares every vector | Query time grows with collection size | IVF or HNSW | p.148 |
| Missed neighbors in approximate search | Query and document fall in different IVF partitions | Approximate results | Increase probes (slower) | p.149 |
| Slower UPDATEs from extra indexes | Partial, covering and multicolumn indexes | Every index is updated on every write | Index selectively | p.117, p.133 |

## Elicitation questions

| question (client language) | concept it decides | page |
|---|---|---|
| Roughly how many writes versus reads per second do you expect, and is the system mainly collecting data or mainly serving it? | LSM (write-heavy) vs B-tree (read-heavy) | p.129 |
| Do you fetch records mostly one at a time by ID, or in ranges (all orders between two dates, all names starting with L)? | Hash vs sorted indexes; range-query cost on LSM | p.119, p.129 |
| How spiky is the incoming data, and is a brief pause under a burst acceptable? | Memtable sizing, compaction, backpressure | p.129 |
| How fast and how predictable must each lookup be? | B-tree predictable reads vs LSM multi-segment reads | p.129 |
| Which searches will you run most often, on which fields? | Index selection and its write cost | p.117 |
| How large will the data get, and must it fit on one machine or in memory? | In-memory databases, embedded engines | p.125, p.134 |
| Will this run inside a phone or desktop app, or on servers serving many users at once? | Embedded storage engines | p.125 |
| Do you have many customers whose data must never be mixed? | One embedded database per tenant | p.125 |
| Do you have a legal duty to prove data is really gone within a set time after deletion? | Tombstone propagation in LSM engines | p.132 |
| Do you need point-in-time backups or copies of the live database for testing? | Snapshots via immutable segments | p.132 |
| Is this for daily transactions or for reports over large histories? | OLTP row storage vs analytical column storage | p.134, p.150 |
| How many fields does a typical report use, out of how many stored? How many rows does it scan? | Column-oriented storage | p.136-137 |
| Does data arrive as a continuous trickle of single records or in scheduled batch loads? | Column-store write path (bulk merges) | p.141 |
| Which time windows do reports usually cover (last day, last month)? | Sort key and block partitioning by date | p.138, p.140-141 |
| Which reports or dashboards run again and again with the same shape? | Materialized views and data cubes | p.143-144 |
| Will analysts need to ask new questions beyond the fixed dimensions? | Keeping raw data vs cubes | p.145 |
| Should compute and storage scale independently, and are you on a cloud provider? | Cloud data warehouses on object storage | p.135 |
| Will other tools or teams need to read the same data files directly? | Open storage formats, table formats, catalogs | p.135-136 |
| Do you need to query a table "as it was" at an earlier time? | Table-format time travel | p.136 |
| Do users search by location on a map, or by several numeric ranges at the same time (price and size, date and temperature)? | Multidimensional indexes | p.145-146 |
| Do you need keyword search over text? Must it tolerate typos, match partial words or patterns, and which languages are involved? | Full-text search, fuzzy search, trigram indexes, language processing | p.146-147 |
| Should users find things by meaning rather than exact words (help center, AI assistant over your documents)? | Vector embeddings and semantic search (RAG) | p.147-148 |
| Is a very good but not perfect search result acceptable, or must results be exact? | Flat vs IVF/HNSW approximate vector indexes | p.148-149 |
| Does the hardware use SSDs or spinning disks, and does drive lifetime matter? | Sequential vs random writes, write amplification | p.130-131 |
| Are stored values small (IDs, counters) or large (documents, blobs) relative to their keys? | Key-value separation in LSM engines | p.130-131 |
| Is extra disk usage acceptable to make specific queries faster? | Covering indexes, materialized views, compression trade-offs | p.133, p.143 |

## Verifiable properties

| property | how to test | page |
|---|---|---|
| Acknowledged writes survive a crash | Write, confirm WAL fsync, kill the process (SIGKILL), restart, assert every acknowledged key is readable | p.120, p.128 |
| Memtable restored from log | Kill before flush; after restart the unflushed keys are present | p.120 |
| Corrupted log tail is rejected, not replayed | Truncate or flip bytes in the last log record; restart; assert the bad record is dropped and earlier records intact | p.122 |
| Crash during flush or compaction leaves a consistent store | Kill mid-compaction; restart; assert reads return the same values as before and no unfinished segment is referenced | p.122 |
| Deleted keys stay deleted across compaction | Delete a key, read (absent), force compaction, read again (absent) | p.121 |
| Merged segments are sorted with one value per key | Parse a compacted segment; assert strictly increasing keys and that each value is the most recent | p.120 |
| SSTable invariants | For every segment file: keys sorted, no duplicates | p.119 |
| Bloom filter false-positive rate | Query 1,000,000 random absent keys; assert the segment-skip rate matches the configured bits per key (about 99% at 10 bits/key) | p.123 |
| Bloom filter has no false negatives | For every key in a segment, the filter answers "maybe present" | p.123 |
| Write amplification within budget | Measure bytes written to the device divided by logical bytes over a long run; assert below the target | p.131 |
| Benchmark duration covers compaction | Assert compaction counters are nonzero before accepting a write-throughput number | p.131 |
| Space reclaimed after deletes | Delete half the keys, compact (LSM) or vacuum (B-tree), assert file size shrinks or free pages are reused | p.131 |
| B-tree depth stays logarithmic | Load n keys; assert depth is at most ceil(log_b n) and at most 4 for the expected dataset | p.127 |
| No stalls above a latency bound under sustained writes | Load test at the planned write rate; assert p99 latency and zero backpressure stalls | p.129 |
| Range queries meet their latency target on the chosen engine | Benchmark range scans vs point reads on the real workload | p.129 |
| Secondary and covering indexes are used | EXPLAIN the key queries; assert index use and, for covering indexes, no heap lookup | p.132-133 |
| Snapshot consistency | Take a snapshot (record segment list), keep writing, assert the snapshot read set is unchanged and its files are not deleted | p.132 |
| Deletion is physically complete after full compaction | After deleting and compacting all levels, grep raw segment files for the value and assert absence | p.132 |
| Column pruning | Run a 3-column query on a wide table and assert bytes read are proportional to 3 columns, not the full row | p.137 |
| Block pruning by date | Query one month and assert only blocks overlapping that range are read | p.138 |
| Bitmap predicates are correct | For IN and AND predicates, assert bitmap results equal a brute-force row scan | p.140 |
| Sort order is honored | Read rows back and assert ordering by (date_key, product_sk); check first-column compression ratio | p.140-141 |
| Recent writes are visible | Insert rows, query immediately, assert they appear before any bulk merge | p.141 |
| Materialized view equals its query | After updates, compare the view contents to running the underlying query | p.143 |
| Data cube totals reconcile | Assert each cube cell equals the aggregate computed from raw facts, and marginals equal sums over the dimension | p.144 |
| Concatenated index behavior | EXPLAIN a lastname query (index used) and a firstname-only query (index not usable) | p.145 |
| Spatial index correctness | Bounding-box query via the spatial index returns the same set as a brute-force filter, with index use shown in EXPLAIN | p.145-146 |
| Inverted index correctness | Multi-term AND via bitmaps equals a brute-force document filter | p.146-147 |
| Trigram substring search | A 3+ character substring query returns every document containing it | p.147 |
| Fuzzy match within edit distance 1 | A one-letter misspelling finds the intended term | p.147 |
| Vector index recall | Compare IVF/HNSW top-k against flat-index ground truth; assert recall above target and that recall rises with more probes | p.148-149 |
| Embedding similarity ordering | Cosine similarity between related documents (agriculture, vegetables) exceeds that with an unrelated one (star schemas) | p.148 |

## Terms

| term | definition |
|---|---|
| log | An append-only sequence of records on disk, not necessarily human-readable (p.117) |
| index | An additional structure derived from the primary data that speeds reads at the cost of writes and space (p.117) |
| hash index | In-memory map from key to byte offset in the log (p.118) |
| SSTable (Sorted String Table) | File of key-value pairs sorted by key, each key once (p.119) |
| sparse index | Index storing only the first key of each block (p.119) |
| memtable | In-memory sorted structure (red-black tree, skip list, trie) buffering writes (p.120) |
| segment | An immutable on-disk SSTable file produced by flushing or merging (p.120) |
| compaction / merging | Background combination of segments that discards overwritten and deleted values (p.120) |
| tombstone | Special deletion record appended to mark a key as deleted (p.121) |
| LSM-tree | Log-Structured Merge-tree (1996); engines that merge and compact sorted files (p.121) |
| log-structured storage | Writes immutable files, appends and deletes files, never modifies in place (p.121, p.150) |
| Bloom filter | Bit array with hashed positions giving a fast, approximate membership test with no false negatives (p.122-123) |
| false positive | Filter says present when the key is absent (p.123) |
| size-tiered compaction | Newer, smaller SSTables merged into older, larger ones (p.124) |
| leveled compaction | Fixed-size SSTables grouped into key-range-partitioned levels L0, L1, ... (p.124) |
| embedded storage engine | In-process database library without a network API (RocksDB, SQLite, LMDB, DuckDB, KuzuDB) (p.125) |
| B-tree (B+ tree) | Update-in-place tree of fixed-size pages keeping keys sorted; standard relational index (p.125-126) |
| page | Fixed-size block (4, 8 or 16 KiB) identified by a page number (p.125-126) |
| branching factor | Number of child references per page (p.126) |
| leaf page | Page holding individual keys with inline values or references to values (p.126) |
| page split | Splitting a full page into two half-full pages and updating the parent (p.127) |
| torn page | Partially written page when hardware cannot write a page atomically (p.127) |
| write-ahead log (WAL) | Append-only file every B-tree modification goes to before the pages; "journaling" in filesystems (p.128) |
| fsync | System call that flushes written data to disk, making WAL entries durable (p.128) |
| copy-on-write | Writing modified pages to new locations and re-pointing parents (LMDB) (p.128) |
| backpressure | Suspending reads and writes until the memtable is flushed (p.129) |
| NVMe | SSD interface over PCIe allowing many parallel requests (p.129) |
| random vs sequential writes | Many small scattered writes vs fewer large writes (p.130) |
| garbage collection (SSD) | Moving valid pages before erasing a flash block (p.130) |
| write amplification | Bytes (or I/Os) written to disk divided by bytes an append-only log would write (p.131) |
| fragmentation | Unused pages inside a B-tree file after deletes (p.131) |
| vacuum | PostgreSQL background process that moves pages to reclaim space (p.131) |
| snapshot | Point-in-time copy made by recording the set of immutable segments (p.132) |
| primary key | Unique identifier of a row, document or vertex (p.132) |
| secondary index | Index on non-unique fields, via postings lists or row-ID-suffixed keys (p.132) |
| postings list | List of row or document IDs under one index entry (p.132, p.146) |
| clustered index | Index that stores the actual row data inside the index (InnoDB primary key) (p.133) |
| heap file | Unordered storage of rows referenced from indexes (PostgreSQL) (p.133) |
| covering index / included columns | Index storing some extra columns so queries can be answered from the index alone (p.133) |
| forwarding pointer | Marker left at an old heap location pointing to the moved record (p.133) |
| in-memory database | Database serving reads entirely from memory, with durability via logs, snapshots or replication (p.134) |
| HTAP | Hybrid transactional and analytical processing in one product (p.135) |
| cloud data warehouse | Warehouse built on object storage and serverless compute (BigQuery, Redshift, Snowflake) (p.135) |
| data lake | Analytical data stored as files on object storage (p.135) |
| query engine | Component that parses, optimizes and executes SQL (Trino, DataFusion, Presto) (p.135) |
| storage format | File encoding of table rows (Parquet, ORC, Lance, Nimble) (p.136) |
| table format | Specification of which files form a table plus schema, time travel, GC, transactions (Iceberg, Delta) (p.136) |
| data catalog | Service defining which tables exist in a database (Polaris, Unity Catalog, Iceberg catalog) (p.136) |
| time travel | Querying a table as it was at an earlier point in time (p.136) |
| row-oriented storage | All values of one row stored together (OLTP, documents) (p.137) |
| column-oriented (columnar) storage | All values of one column stored together (p.137) |
| shredding / striping | Dremel technique storing nested document data in columns (Parquet) (p.137) |
| bitmap encoding | One bitmap per distinct value, one bit per row (p.139) |
| run-length encoding | Storing counts of consecutive identical bits or values (p.139) |
| roaring bitmaps | Bitmaps that switch between representations for compactness (p.140) |
| wide-column (column-family) model | Rows with thousands of columns, stored row-oriented (Bigtable, HBase, Accumulo) (p.140) |
| sort key | Column(s) by which whole rows are ordered in a column store (p.140-141) |
| query plan / operator | Stages of an analytical query, possibly distributed across machines (p.142) |
| query compilation | Generating and JIT-compiling code (often via LLVM) for a specific query (p.142) |
| vectorized processing | Interpreting the query but processing a column batch at a time with predefined operators (p.142) |
| SIMD | Single-instruction, multiple-data CPU instructions (p.143) |
| materialized view | Query result stored on disk and kept up to date (p.143) |
| virtual view | A stored query expanded on the fly when read (p.143) |
| materialized aggregate | Precomputed COUNT/SUM/AVG/MIN/MAX results (p.144) |
| data cube (OLAP cube) | Grid of aggregates grouped by dimensions (p.144) |
| concatenated index | Multicolumn index formed by appending fields into one key (p.145) |
| multidimensional index | Index querying several columns simultaneously (p.145) |
| space-filling curve | Mapping of 2-D coordinates to one number for a regular B-tree (p.145) |
| R-tree / Bkd-tree | Spatial indexes grouping nearby points in the same subtree (p.145-146) |
| GiST | PostgreSQL Generalized Search Tree used by PostGIS for R-trees (p.146) |
| full-text search | Keyword search anywhere in a document collection (p.146) |
| term | A word that may appear in a text; one dimension of the search space (p.146) |
| inverted index | Map from term to postings list of document IDs (p.146) |
| n-gram / trigram | Substrings of length n (3) indexed for substring and regex search (p.147) |
| edit distance | Number of letters added, removed or replaced between two words (p.147) |
| Levenshtein automaton | Automaton that matches words within a given edit distance (p.147) |
| GIN index | PostgreSQL index using postings lists for full-text and JSON (p.147) |
| semantic search | Search that matches meaning and intent, not just words (p.147) |
| retrieval-augmented generation (RAG) | Feeding search results into an LLM's output (p.147) |
| embedding model | Model (often an LLM) translating a document into a vector (p.147) |
| vector embedding | Array of floats locating a document in a multidimensional space (p.147) |
| cosine similarity / Euclidean distance | Distance functions over embedding vectors (p.148) |
| multimodal model | One model embedding text, images and other media (p.148) |
| vector index | Index returning documents whose vectors are closest to a query vector (p.148) |
| flat index | Stores vectors as-is; exact but slow (p.148) |
| IVF index | Inverted file index clustering vectors into centroid partitions; probes set how many to check (p.149) |
| HNSW index | Hierarchical Navigable Small World graph with layered proximity edges; approximate (p.149) |
| Lucene | Full-text engine behind Elasticsearch and Solr using SSTable-like merged files (p.147) |

## Chapter summary (condensed)

- The chapter asks what happens when you store data and what the database does when you query it again (p.150).
- It builds on the OLTP versus analytics (OLAP) distinction introduced in "Operational Versus Analytical Systems" (p.150).
- Storage engines optimized for OLTP "look very different" from those optimized for analytics (p.150).
- OLTP systems handle a high volume of requests that each read and write a few records and need fast responses; records are reached via a primary key or secondary index, and these indexes are ordered key-to-record mappings that also support range queries (p.150).
- Data warehouses handle complex read queries scanning many records; they use column-oriented storage with compression to minimize data read from disk, and JIT query compilation or vectorization to minimize CPU time (p.150).
- On the OLTP side there are two schools: the log-structured approach appends to files and deletes obsolete ones but never updates a written file, giving high write throughput (SSTables, LSM-trees, RocksDB, Cassandra, HBase, ScyllaDB, Lucene) (p.150).
- The update-in-place approach treats the disk as fixed-size pages that can be overwritten; B-trees are used in all major relational OLTP databases and many nonrelational ones, and as a rule of thumb are better for reads, with higher read throughput and lower response times (p.150).
- Multi-condition indexes: multidimensional indexes such as R-trees search by latitude and longitude at once; full-text indexes search for several keywords in the same text (p.150).
- Vector databases serve semantic search over text and other media using high-dimensional vectors and similarity comparison (p.150).
- Knowing these internals helps you choose the right tool and imagine the effect of raising or lowering a tuning parameter; the chapter aims to give the vocabulary to make sense of your database's documentation (p.151).

## Second-edition-specific

- Segment files on object storage (SlateDB, Delta Lake) and the general "object storage is well suited" theme for both LSM segments and columnar files (p.122, p.141).
- Trie-based memtables and trie-indexed SSTable formats (Cassandra CEP-25) listed alongside red-black trees and skip lists (p.119-120).
- A dedicated "Compaction strategies" section comparing size-tiered and leveled compaction with workload rules of thumb (p.124).
- "Embedded Storage Engines" sidebar (RocksDB, SQLite, LMDB, DuckDB, KuzuDB) including per-tenant SQLite (Bluesky) (p.125).
- Explicit current page sizes (PostgreSQL 8 KiB, MySQL 16 KiB), torn-page terminology and the 250 TB capacity example (p.125-127).
- Backpressure and latency spikes in RocksDB (SILK reference) and NVMe/PCIe parallelism for read throughput (p.129).
- "Sequential Versus Random Writes on SSDs" sidebar on flash pages, erase blocks, garbage collection and wear (p.130).
- Formal definition of write amplification, key-value separation (WiscKey), and the advice to benchmark long enough for compaction (p.130-131).
- Timely deletion for data-protection compliance in LSM engines, and snapshots via immutable segments (p.132).
- Covering indexes / included columns and the heap-file forwarding-pointer discussion (p.133).
- HTAP databases described as "increasingly becoming two separate storage and query engines" (p.135).
- "Cloud Data Warehouses" section: BigQuery, Redshift, Snowflake; compute decoupled from object storage; the open stack split into query engine (Trino, DataFusion, Presto), storage format (Parquet, ORC, Lance, Nimble), table format (Iceberg, Delta) and data catalog (Polaris, Unity Catalog) (p.135-136).
- Parquet's document model via Dremel shredding; columnar adoption in DuckDB, Pinot, Druid, Arrow, Pandas/NumPy, InfluxDB IOx, TimescaleDB (p.137-138).
- Roaring bitmaps and bitmaps for social-graph queries (p.140).
- "Query Execution: Compilation and Vectorization" section on JIT code generation versus vectorized operators and CPU-aware design (p.142-143).
- Materialize as a dedicated materialized-view maintenance system (p.143).
- Bkd-trees, GiST/PostGIS, H3 hexagonal grids and non-geographic multidimensional examples (RGB, date plus temperature) (p.145-146).
- Full-text additions: postings lists as sparse bitmaps, trigram indexes for regex, Levenshtein automata for fuzzy search, PostgreSQL GIN (p.146-147).
- "Vector Embeddings" section: semantic search, RAG with LLMs, Word2Vec/BERT/GPT, multimodal models, cosine vs Euclidean distance, flat/IVF/HNSW indexes, Faiss and pgvector (p.147-149).
- Summary now closes with vector databases for semantic search as a third index family (p.150).
