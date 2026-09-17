# Stack-selection protocol — evidence-based technology selection, owner-approved

Companion contract for `requirements` Phase 2b and `build` Phase 2. The tech stack is the most
consequential one-way door in a greenfield build: it is chosen once, every later phase inherits
it, and a wrong pick becomes a rewrite years later. Today's failure mode is silent: a `Stack:`
hint or the model's training-data prior becomes the spec's `stack:` block with no evidence, no
alternatives and no owner decision. This protocol replaces that with a **research → knock-out →
compare → recommend with reasons and citations → owner approves → build confirms by spike** loop
whose release is decided by `scripts/score-requirements.sh stack <dir>` (`STACK_DECISION: READY |
BLOCKED`), never by "looks reasonable". Evidence discipline is inherited verbatim from
`references/research-protocol.md` (source tiers §1, computing evidence hierarchy §2, search
playbook §3, confidence rubric §5, ledger schemas §7): **no score without a source, no source
without an accessed locator, no number without its conditions, no approval without the owner.**

## §0 Premises (what the literature says a good record needs)

- **A decision record, not a matrix printout.** Nygard's ADR (context · decision · status ·
  consequences, "all consequences, not just the positive ones") and MADR 4.0 (decision-makers,
  decision drivers, considered options, decision outcome with justification, pros and cons of the
  options, confirmation) are the industry shapes; GOV.UK's ADR framework adds "stakeholders
  consulted" and "links to supporting documents" as required fields. The record below is MADR
  (MIT/CC0) with those fields, kept Nygard-short.
- **Drivers are refutable scenarios.** ATAM: a quality goal that has no operational meaning ("the
  stack shall be scalable") is untenable; each driver is a stimulus + measurable response + threshold
  taken from an NFR, prioritised H/M/L because stakeholders cannot reliably rank finer than that.
- **A weighted total is never the decision.** Pugh controlled convergence: the matrix exists to
  eliminate dominated options, expose unknown cells that need more information or a spike, and
  converge over runs; column totals presented as "the answer" create unwarranted faith in rough
  estimates, weights and datum choice can steer a ranking, and normalising scores against the
  option set flips winners when a candidate is added (rank reversal). Hence: fixed anchors per
  driver, weights locked before scoring, a sensitivity sweep, and a `Robustness:` verdict.
- **The builder is an LLM.** Functionally equivalent libraries show up to 84 % spread in the
  quality of LLM-generated code (arXiv 2509.11132, preprint) — "how well the harness writes this
  stack" is a real driver no classical framework carries. It is weighted, never a knock-out, and the
  model's self-preference for high-training-data stacks is disclosed in the record.
- **Boring by default.** Every non-default component spends an innovation token: the record names
  the requirement that spends it and what was tried with the boring option first (McKinley).
- **Ceremony scales with reversibility.** Language/runtime, primary datastore, hosting model and
  auth provider are one-way doors (full protocol); UI kit, test runner, linter, formatter are
  two-way doors (one-line Y-statement each, approved in bulk as one A-n decision).

## §1 When it runs, and what a `Stack:` hint means

- `requirements` runs it as **Phase 2b**, after Analysis (NFRs and constraints exist) and before
  Specification (the spec's `stack:` block is its output). `build` runs it only when a supplied spec
  carries no approved decision (`decision:` absent or `stack` gate BLOCKED) — before its charter is
  committed, never silently pinning an unjustified stack.
- A **`Stack:` hint is a candidate carrying a constraint, never a bypass.** It always enters the
  option set; it is still scored against real alternatives with evidence. If the owner says "this is
  decided" the path is **owner-mandated** (§8): fitness validated, risks recorded, alternatives
  shown, approval recorded with provenance `stated` — the harness never overrules the owner and
  never hides what the mandate costs.
- Two-way-door components are decided inside the same run without the full ceremony: one
  Y-statement per component in the record's *More information* section, one bulk A-n approval.

## §2 Inputs that must be ELICITED before any scoring (refuse to score otherwise)

These live in `client-review.md` as `A-n` decisions (elicitation-protocol §4 areas *Connections &
technical constraints*, *Environments & deployment*, *Maintenance & handover*). While any is open the
matrix cell that needs it is `?` and the gate cannot pass; a spec-kit style `NEEDS CLARIFICATION`
marker in the spec's stack block fails `validate` under `REQUIRE_STACK_DECISION=1`.

| input | why it is unfillable by search |
|---|---|
| **Usage model** — requests/day, concurrent users at peak, storage GB, egress GB, region, growth | hosting cost and the performance driver are meaningless without it |
| **Support horizon** in years (first release → planned retirement/major revisit) | the EOL knock-out gate compares against it |
| **Delivering team AND receiving/ops team skills** (who runs it after handover — 18F hand-off fit) | familiarity/ops burden have no external evidence; this is the owner's world |
| **Licence policy** (e.g. no AGPL/SSPL/BSL; commercial-use OK) | the licence gate is policy, not fact |
| **Compliance regime + data residency** (jurisdictions, HIPAA/GDPR/SOC 2, residency region) | hosting-layer gate; provider compliance pages answer only once the regime is named |
| **Existing systems / hosting the stack must fit** (current VPS, cloud account, identity provider, devices) | a "best" stack the owner cannot host is not best |
| **Budget ceiling** for hosting and third-party services per month | knock-out for paid tiers |

## §3 Candidate generation (no straw men)

- Decompose the stack into **layers**: runtime/language · web/API framework · data access ·
  datastore · auth · frontend/rendering · hosting model · CI/test toolchain. Score **whole
  candidate stacks** (coherent combinations), 3–5 of them; compare at one abstraction level (never
  a language against a product).
- **The boring default for the project class is always a candidate and is the Pugh datum**
  (the harness's proven combinations for the archetype — server-rendered CRUD, SPA + API, realtime,
  static/marketing, game, mobile-first — count as boring here). An **owner-mandated or hinted stack
  is always a candidate.** At least one candidate comes from a **different paradigm** (e.g. a
  Python/HTMX monolith against two Node stacks) so the comparison is real.
- **Pin every component to a major version** — EOL, advisories and licence are version-specific.
- **No dummy alternatives** (an option added to lose), no options nobody would seriously run for
  this owner, no re-litigating a two-way door as if it were the stack.
- Non-boring components are budgeted: **≤1 innovation token per candidate**; each spend names the
  requirement it serves and records what the boring option would have cost (§7 failure-mode checks).

## §4 Decision drivers (criteria) and knock-out gates

**Knock-out gates run first, pass/fail, before any scoring.** A candidate failing one is eliminated
(or, for an owner-mandated stack, carried forward with the failure recorded as an *explicitly
accepted risk* — never silently passed):

1. Licence of every pinned component normalised to an SPDX id and inside the owner's policy
   (deps.dev declared licence, ClearlyDefined declared-vs-discovered cross-check).
2. Runtime + framework EOL date lies **outside the support horizon** (endoflife.date, spot-checked
   against the vendor release policy for the winner).
3. Repository not archived; OpenSSF Scorecard `Maintained` > 0 (GitHub-only heuristic — disclose).
4. **Zero unpatched *reviewed* advisories** for the pinned major (OSV `querybatch` / GitHub Advisory
   DB `affects=pkg@ver&type=reviewed`; NVD is deprioritised since 2026-04 — never count keyword hits).
5. Hard platform/compliance constraints: target platform (browser matrix, offline/PWA, SSR need,
   mobile), accessibility (a stack that cannot meet WCAG AA is out), hosting compliance scope and
   data residency for the named regime (provider compliance pages; FedRAMP Marketplace when relevant).

**Drivers** are derived from the SRS, one row per NFR-shaped concern, each a **refutable scenario**
(stimulus → measurable response → threshold) with **importance H/M/L → weight 3/2/1**, locked as an
`A-n` decision **before** scoring and traced (`traces` column) to the NFR/FR/A/C ids it serves. Cover
every family below or record `N-A-because` (ISO/IEC 25010 is the completeness checklist —
functional suitability, performance efficiency, compatibility, interaction capability, reliability,
security, maintainability, flexibility/portability — plus the delivery-specific rows):

| family | driver shape (example) | evidence that can fill it |
|---|---|---|
| Functional fit | realtime / offline / file handling / native needs each have a first-class path | official docs (T3), reference implementations |
| Performance at the stated load model | p95 < X ms at Y concurrent under the usage model | **the feasibility spike** (§9); frozen synthetic benchmarks at `low` only, labelled |
| Support horizon | LTS window ≥ horizon; release cadence; major-upgrade cost history | endoflife.date, release policy pages, changelogs |
| Security posture | advisories open/patched; fix latency; security policy | OSV, GHSA reviewed, Scorecard `Vulnerabilities`, SECURITY.md |
| Ecosystem maturity + API stability | breaking changes per major; maintainers ≥ N; governance | Scorecard, registry packument (`maintainers`, `time`), foundation pages |
| Viability | relicensing history (Redis, Terraform/BSL, Elastic); single-vendor vs foundation; bus factor | LICENSE git history, foundation project pages |
| Team + ops familiarity | delivering + receiving teams already run it; hiring pool (ordinal) | **elicited** (A-n); surveys as ordinal context only |
| Operational burden | managed-service default; component count; on-call surface for no-ops-team owners | provider docs, post-mortems (T4, survivorship-biased) |
| Hosting/TCO at target load | list-price cost under the usage model; lock-in/contract terms | price APIs (AWS/Azure/GCP), dated PaaS page snapshots (T3-volatile) |
| Exit path | data portability, open standards, migration route per one-way component | docs, standards |
| Reuse coverage | battle-tested packages exist for every solved problem in scope (auth, ORM, validation, money/date, uploads) | registries, deps.dev |
| Harness delivery risk / AI proficiency | the harness has converged this stack before; LLM proficiency evidence | run records; arXiv 2509.11132 (directional); **the spike settles it** |

"Language X is safer/higher quality" claims score ≈ 0: the reproduction of the large-scale GitHub
study found only tiny, mostly non-significant language–defect associations (Berger et al. 2019).

## §5 Evidence playbook (what to fetch, its tier, its bias, its freshness)

Ledgers are the research protocol's `sources.tsv` (9 cols) and `claims.tsv` (6 cols) — every
matrix cell cites `[S-nn]`, every criterion has ≥1 claim, `queries.tsv` logs the sweep. Use
`RQ-n` = driver id so `score-research.sh claims` validates coverage and tier floors unchanged.

| source | what it gives | tier | bias / caveat | fresh within |
|---|---|---|---|---|
| deps.dev API v3 (one call per package) | SPDX licence, OSV advisories, dependency graph, Scorecard, stars | T2 | index, not a legal determination | 7 d |
| OSV.dev `querybatch`; GitHub Advisory DB (`type=reviewed`) | advisories per pinned version | T2 | count *unpatched for the pinned version*, never raw totals | 7 d |
| endoflife.date API v1 | LTS/EOL per cycle, release policy link | T3 | community-curated, beta; spot-check winner | 7 d |
| OpenSSF Scorecard | 18 maintenance/security checks 0–10 | T2 | GitHub-only heuristics; `Maintained` penalises finished libraries | 30 d |
| SPDX licence list; ClearlyDefined | licence identity; declared vs discovered | T1 / T2 | identity problem across registries | 30 d |
| Registry stats (npm point API, PyPI BigQuery `installer=pip`, pypistats) | downloads, maintainers, publish cadence | T3 | CI/mirror-inflated, > 50/day noise floor — **ordinal only** | 30 d |
| Developer surveys (SO 2025 n≈49k; State of JS 2024 n≈14k; PSF/JetBrains 2024 n>25k) | usage + retention sentiment | T2 (methodology) / T3 (numbers) | self-selected, unweighted; never market share; current edition only | edition |
| Official docs / release policies / changelogs | capabilities, LTS, breaking changes | T3 | vendor voice | 30 d |
| Vendor benchmarks and "X vs Y" comparison pages | directional | **T4** | conflict of interest — never the sole source for a cell | — |
| TechEmpower Framework Benchmarks | frozen synthetic micro-benchmarks | T3 | **archived 2026-03-24**, leaderboard-tuned; `low` only, labelled FROZEN | n/a |
| Cloud price APIs (AWS Price List, Azure Retail Prices, GCP Billing Catalog) | list prices per SKU | T3 | no discounts/egress surprises; PaaS pages have no API — snapshot with date | 30 d |
| Company post-mortems, migration stories | operational failure modes | T4 | single-case, self-reported, survivorship-biased; fetch the known rebuttal or mark `contested` | — |
| Peer-reviewed evaluations, standards | the only `high`-grade support | T1 | rare for stack questions — say so | — |

Rules: **(a)** popularity is ordinal context, never a score; **(b)** two independent sources for
anything that swings the ranking (rows sharing a root source count once); **(c)** a one-sided
post-mortem needs its rebuttal fetched or the claim is `contested`; **(d)** every row carries the
accessed date — stale rows (table) are re-fetched or dropped; **(e)** the model's own prior toward
high-training-data stacks is disclosed in the record's failure-mode checks; **(f)** a
**disconfirmation pass per candidate** ("problems with X", "migrating away from X", breaking-change
history, relicensing, retractions) is logged in the record — an empty result is logged too;
**(g)** research-protocol depth honesty applies (cite what was read at the depth it was read).
**Stopping rule:** the sweep ends when the driver set is answered for every candidate, or two
consecutive query rounds add no new T1–T3 source (scarcity note per uncovered driver). One-way-door
components get the full set; two-way doors get one query each.

## §6 Scoring — Pugh controlled convergence, not a bare weighted sum

1. **Anchors are fixed per driver** (the threshold in the scenario), scores 0–5 against the anchor —
   **never relative to the other candidates** (rank-reversal guard); re-run the matrix whenever a
   candidate is added or removed.
2. **Unknown = `?`**, never a guess. A `?` cell is a work item: more evidence, an elicited input, or
   a spike question pre-registered for build Phase 2. The gate rejects an uncited cell, so `?` cells
   block approval by construction.
3. **Run 1** eliminates dominated candidates against the datum (boring default); **run 2** uses the
   strongest survivor as datum. Weighted totals appear as a *secondary view* row and are labelled so.
4. **Sensitivity sweep** (recorded): flex each weight ±1 · drop each driver once · swap the datum ·
   unweighted run. Winner unchanged everywhere → `Robustness: robust`; otherwise `fragile — <which
   flip changes it>`. A fragile decision is still approvable: the owner sees exactly what flips it.
5. **Confidence** of the recommendation: `high` only when every load-bearing cell rests on T1/T2 and
   survived disconfirmation; `moderate` with T3 support; `low` when the ranking rests on vendor or
   frozen benchmarks — say what would upgrade it (usually: the spike).

## §7 The record — `stack-decision.md` (MADR-shaped; the gate's contract)

Lives in the run dir `forge/requirements-…/stack/` beside `sources.tsv`, `claims.tsv`,
`queries.tsv`, `evidence/S-*.md`; `build` copies the record to the output repo as
`docs/adr/0001-tech-stack.md`. Header lines are exact (the gate greps them); sections carry the
tables it parses. Fixture: `tests/fixtures/requirements/stack-ready/`.

```
# Stack decision — <project>
Status: proposed | approved | owner-mandated | superseded by <path>
Date: <YYYY-MM-DD>
Decision-makers: owner (client) · consulted: <who/what> · informed: build
Recommendation: O-<n>
Confidence: high | moderate | low — <why>
Robustness: robust | fragile — <what flips it>
Approval: pending | approved by owner — client-review rev <N> (A-<n>), <date>, ledger:<sha256-16>
                 | owner-mandated (A-<n>, <date>) — fitness validated, risks recorded, ledger:<sha256-16>

**Y-statement:** In the context of <use>, facing <concern>, we decided for O-n and neglected O-m…,
to achieve <quality>, accepting <downside>.

## Context and problem statement      ← forces in neutral language: FR/NFR/A/C ids, team, hosting, budget; reversibility class per component
## Knock-out gates                    ← table: gate | O-1 | O-2 | O-3 | evidence [S-nn]   (pass/fail; mandated failures = accepted risk)
## Decision drivers                   ← table: | RQ-n | refutable scenario + threshold | weight | traces |   (locked, A-n)
## Considered options                 ← `### O-n <name>` headings, one per whole stack, majors pinned
## Comparison matrix                  ← table: | RQ-n | <score> [S-nn] | … |  every cell cited; `weighted total` row = secondary view
## Decision outcome                   ← chosen option + justification (k.o. criterion / resolves force / comes out best), incl. the spike it still needs
## Pros and cons of the options       ← why not the others — Good/Bad per rejected option, cited
## Consequences                       ← `- Good:` / `- Bad:` / `- Risk:` lines with mitigation + revisit trigger; exit path per one-way component
## Failure-mode checks                ← résumé-driven? microservice/polyglot envy? innovation tokens spent (≤1)? rewrite trap (life ≥ horizon)? LLM self-preference disclosed?
## Disconfirmation log                ← per option: what was searched against it, what came back
## Confirmation                       ← pre-registered spike: hypotheses, load model, thresholds, ≥5 runs, identical hardware; build appends results; lockfile check
## More information                   ← ledgers; "no good evidence exists for …" (owner judgment calls); two-way-door Y-statements
```

`scripts/score-requirements.sh stack <dir>` → `STACK_DECISION: READY` iff: both ledgers valid
(`score-research.sh sources|claims`) · ≥3 options · ≥3 weighted, traced drivers · every driver has a
matrix row with one cited cell per option and no orphan citation · every driver covered by ≥1 claim
· `Recommendation:` names an option · `Confidence:` and `Robustness:` declared · ≥1 `- Bad:`/`- Risk:`
consequence · `Approval:` is `approved …`/`owner-mandated …` **and pins the current ledger hash**
(`cat sources.tsv claims.tsv | tr -d '\r' | sha256sum | cut -c1-16` — CR-stripped so LF and CRLF
checkouts agree). Zimmermann's ADR anti-patterns are what
these rows catch: Sprint (one option), Fairy Tale (no cons), Free Lunch (no consequences), Dummy
Alternative, Magic Tricks (numbers without measurement), undisclosed confidence.

## §8 Owner approval — playback, choices, state machine

Playback in the client's language (elicitation-protocol §7 register), **never the ledger dump**:
1. the Y-statement; 2. the top-3 drivers with one sentence of evidence each and its source; 3. the
accepted downsides and the top risks with mitigations; 4. what the runner-up would give and cost;
5. the money and hosting consequences under the owner's usage model; 6. the reversibility class and
exit path; 7. the `Robustness:` verdict in plain words ("if you cared more about X, the answer
flips to O-3"); 8. the **"no good evidence exists for …"** list — the questions the owner decides on
judgment (team familiarity, hiring, 5-year viability, day-to-day productivity); 9. the weights table
the owner may change.

One `AskUserQuestion` (recommended default first):
- **Approve O-n** → `Approval: approved by owner — rev N (A-n), date, ledger:<hash>`; `A-n` in
  `client-review.md` with provenance `default-confirmed`.
- **Revise weights / criteria** → the owner's weights replace the locked set (new `A-n`), the matrix
  and sweep re-run, playback again.
- **Need more evidence on X / run the spike first** → the driver becomes a `?` work item; sweep
  continues or the spike question is pre-registered in *Confirmation*; playback again.
- **Mandate another stack** → owner-mandated path below.

**Owner-mandated path.** The mandate is a force in *Context*, never overruled. Run the same gates
and matrix on it; answer the 18F questions in the record (why this stack; which stacks the delivery
and receiving teams actually know; which alternatives were considered); list every negative
consequence with mitigation and a revisit trigger; run a one-paragraph premortem ("it is a year
later and this stack failed us because …"). A knock-out failure is recorded as an accepted risk
with the owner's words. `Approval: owner-mandated (A-n, date) … ledger:<hash>`, provenance `stated`.

**What reopens the decision:** a material change to any driver's NFR/constraint, a new or removed
candidate, a changed weight, an edited ledger (the pinned hash no longer matches → gate BLOCKED), or
a failed spike. Reopening → `Status: superseded by <new record>`; a new record is written (accepted
records are immutable), the playback runs again, sign-off waits. Requirements sign-off (Phase 4)
and spec generation (Phase 5, `REQUIRE_STACK_DECISION=1`) are blocked while the gate is not READY.

## §9 Handoff to build, and the spike that confirms the decision

- The spec's `stack:` block carries the pinned components **and** `decision: <run-dir>/stack`
  (the gate re-runs on intake) and `adr: docs/adr/0001-tech-stack.md`; no `NEEDS CLARIFICATION`
  remains. `handoff.json` `config.stack_decision` = the verdict + record path.
- **build Phase 2 (Feasibility) is the record's *Confirmation*:** the spike runs the **pre-registered**
  hypotheses — identical hardware and load model for every candidate still in play, thresholds
  written before the run, ≥5 runs reported as a distribution (p50/p95), the harness's proficiency
  asymmetry disclosed (it writes its favourite stack's spike better) — and appends the measured
  results to the record. A miss against a pre-registered threshold **supersedes the decision**:
  build stops, shows the numbers, and re-asks the owner (approve anyway as accepted risk / switch to
  the runner-up / re-scope) — it never pins a stack that failed its own test.
- build commits the record to the output repo (`docs/adr/0001-tech-stack.md`) at the Phase 2 gate;
  later phases cite it (HLD "tech stack" = the record; code review checks new dependencies against
  the rejected options; the lockfile contains the chosen framework and none of the rejected ones).

## §10 Sources this protocol rests on (accessed 2026-09-18)

- Nygard, *Documenting Architecture Decisions* (2011) — https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- MADR 4.0 template (MIT OR CC0-1.0) — https://adr.github.io/madr/
- GOV.UK *Architectural Decision Record Framework* (2025) — https://www.gov.uk/government/publications/architectural-decision-record-framework/architectural-decision-record-framework
- GOV.UK Service Manual, *Choosing technology: an introduction*; *Technology Code of Practice* — https://www.gov.uk/service-manual/technology/choosing-technology-an-introduction · https://www.gov.uk/guidance/the-technology-code-of-practice
- 18F Engineering Guide, *Languages and runtimes*; de-risking interview questions — https://guides.18f.org/engineering/languages-runtimes/
- Kazman, Klein, Clements, *ATAM: Method for Architecture Evaluation* (SEI 2000) — https://www.sei.cmu.edu/documents/629/2000_005_001_13706.pdf
- Frey et al., *An Evaluation of the Pugh Controlled Convergence Method* (ASME 2007) — https://web.mit.edu/2.009/www/resources/PughFrey.pdf
- Burge, *The Pugh Matrix* v1.1 (practitioner guide) — https://www.burgehugheswalsh.co.uk/uploaded/1/documents/pugh-matrix-v1.1.pdf
- Zimmermann, *ADR creation anti-patterns* (2023); MADR primer (2022) — https://ozimmer.ch/practices/2023/04/03/ADRCreation.html
- Bezos, 2015 shareholder letter (one-way vs two-way doors) — https://s2.q4cdn.com/299287126/files/doc_financials/annual/2015-Letter-to-Shareholders.PDF
- McKinley, *Choose Boring Technology* (2015) — https://mcfunley.com/choose-boring-technology
- Fritzsch et al., *Résumé-Driven Development* (ICSE-SEIS 2021) — https://arxiv.org/abs/2101.12703
- Berger et al., *On the Impact of Programming Languages on Code Quality: A Reproduction Study* (TOPLAS 2019) — https://arxiv.org/abs/1901.10220
- *Rethinking Technology Stack Selection with AI Coding Proficiency* (arXiv 2509.11132, preprint) — https://arxiv.org/abs/2509.11132
- Antognolli & Petrillo, the *Undocumented Architectural Experiment* anti-pattern (arXiv 2604.05835) — https://arxiv.org/abs/2604.05835
- AWS Well-Architected PERF01 (benchmark before committing; cost in the decision) — https://docs.aws.amazon.com/wellarchitected/latest/framework/perf-01.html
- AWS Prescriptive Guidance, ADR process (immutability, rejection reasons) — https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html
- deps.dev API v3 — https://docs.deps.dev/api/v3/ · OSV.dev API — https://google.github.io/osv.dev/api/ · GitHub Advisory DB REST — https://docs.github.com/en/rest/security-advisories/global-advisories
- endoflife.date API v1 — https://endoflife.date/api/v1/products/nodejs/ · OpenSSF Scorecard checks — https://github.com/ossf/scorecard/blob/main/docs/checks.md
- SPDX licence list — https://spdx.org/licenses/ · npm download-count semantics — https://blog.npmjs.org/post/92574016600/numeric-precision-matters-how-npm-download-counts-work · PyPI download analysis — https://packaging.python.org/en/latest/guides/analyzing-pypi-package-downloads/
- NIST NVD enrichment prioritisation (2026) — https://www.nist.gov/itl/nvd · TechEmpower FrameworkBenchmarks archival (2026-03-24) — https://github.com/TechEmpower/FrameworkBenchmarks
- Survey methodologies: Stack Overflow 2025 — https://survey.stackoverflow.co/2025/methodology · State of JS 2024 — https://2024.stateofjs.com/en-US/about/ · Python Developers Survey 2024 — https://lp.jetbrains.com/python-developers-survey-2024/
- Thoughtworks Radar rings + *Microservice envy* — https://www.thoughtworks.com/en-us/radar/faq · https://www.thoughtworks.com/radar/techniques/microservice-envy
- github/spec-kit plan template (`NEEDS CLARIFICATION` gate) — https://github.com/github/spec-kit/blob/main/templates/plan-template.md
