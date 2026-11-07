# Build with images, icons and UI motion

```text
$forge build
Spec: evals/fullstack/<app>.spec.yaml
Scope: build-output/<app>
Assets: 12
Iterations: 40
```

Put required image slots, icon/style constraints, motion behavior and byte budgets in the spec.
Phase 4 records them in `assets/manifest.json` and `assets/PLAN.md` alongside DESIGN.md. Existing
approved assets and icon families come first. For new rasters, Forge prefers an available
Codex-native imagegen tool, then a matching media MCP; API fallback requires explicit authorization.
Icons stay SVG/code and interface motion stays CSS/Web Animations. `Assets: off` disables new
generation while retaining checked reuse and local asset/motion work.

Every generation attempt counts, including failed jobs and edits. Forge inspects kept outputs,
copies them into the app, and records actual receipts and prompts. Required missing assets remain
unmet; optional placeholders name their reason. Fix/resume preserves approved file hashes.

Phase 6 runs the existing design, axe and regression checks plus fresh `score-design.sh assets`,
`design-scan.cjs --assets <target>` and the fifth asset-root argument to the design verdict. The
browser checks normal/reduced motion at desktop/mobile sizes, image decoding and the actual
keyboard task. Provenance and file/payload budgets remain acceptance rows in the existing six
dimensions. See the shared [asset protocol](../claude-plugin/skills/forge/references/integrations-protocol.md)
for the schema, provider decision and exact seam commands.

## The data architecture is designed first, then measured

Every build that keeps its own durable data carries a `DATA.md` beside `DESIGN.md` — the
machine-readable record of the eight decisions in the
[data-intensive protocol](../claude-plugin/skills/forge/references/data-intensive-protocol.md)
(after Kleppmann & Riccomini, *Designing Data-Intensive Applications*, 2nd ed.): **workload** (the
peak in numbers), **slo** (client-side p50 / p95 / p99 under an *open* arrival-rate load, error ratio,
window), **model** (the data model by the shape of the relationships, the store, one index per hot
access pattern), **integrity** (isolation level, every read-modify-write with its invariant and the
technique protecting it, the idempotency key, the constraints the database enforces), **evolution**
(backward + forward compatibility, expand/contract migrations), **durability** (replication, lag budget,
read-your-writes, failover, backup RPO/RTO), **derived** (every cache, index, view, export or model with
its source, change-stream mechanism, freshness and reconcile check — never a dual write) and
**retention** (personal data with purpose and retention; erasure that reaches every copy within 30 days).

Phase 4 adopts the record from the requirements run (`Data:` argument or the spec's `data:` block) and
gates it: `node scripts/data-score.cjs lint DATA.md` → `DATA_LINT: VALID`, and
`scripts/score-build.sh coverage build-results.tsv requirements.md DATA.md` → `DATA_COVERAGE: 1.00`
(every applicable group traced by a `data` acceptance row). Phase 5 builds the data slice before
polish — schema and constraints, durable acknowledgements, the idempotency key in the same transaction
as its effect, expand/contract migrations, the index per hot query, each derived dataset's single
writer, the deletion path. Phase 6 measures it:

```text
node scripts/data-score.cjs slo evidence/data/k6-summary.json --data DATA.md
DATA_SLO: PASS p50=98.40 p95=312.70 p99=702.30 n=4812 errors=0.0004 dropped=0 model=open source=k6
node scripts/data-load.cjs run http://localhost:3000/sales/1 --rate 50 --duration 60s --out evidence/data/samples.tsv   # no k6: the open-model generator
node scripts/data-score.cjs slo evidence/data/samples.tsv --data DATA.md
DATA_SLO: PASS p50=9.97 p95=17.30 p99=20.84 n=3000 errors=0.0000 dropped=0 model=open source=samples
node scripts/data-score.cjs explain evidence/data/plans.json
DATA_INDEXES: PASS plans=3 seq_scans=0 max_seq_rows=1000
node scripts/data-score.cjs migrations prisma/migrations
MIGRATION_SAFETY: PASS files=3 statements=10 unsafe=0 annotated=1 dialect=postgres
node scripts/data-score.cjs reconcile evidence/data/products.tsv evidence/data/search-index.tsv --key id
DATA_RECONCILE: PASS source=4 derived=4 missing=0 extra=0 mismatched=0
```

plus the project's own concurrent tests (lost update, write skew, uniqueness, idempotent retry,
`SIGKILL` durability), the restore drill (`operational.cjs recovery` → `RECOVERED` within RPO/RTO) and
the erasure test. The `data` dimension (weight 0.20) is gated like `logic`: while any of its rows is
red the headline pass-rate prints `data_gate=CAPPED@0.50`. A closed-loop load test, a mean latency, a
dual-written cache or a 90-day erasure SLA never passes the lint — those are the book's rules, not
style.
