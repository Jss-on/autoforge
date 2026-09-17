# Stack decision — sample-app (fixture; the shape references/stack-selection-protocol.md §4 prescribes)

Status: approved
Date: 2026-09-18
Decision-makers: owner (client) · consulted: Forge research pass, doctor.sh spike · informed: build
Recommendation: O-1
Confidence: moderate — every driver has T2/T3 support; performance rests on a frozen synthetic benchmark until the spike
Robustness: robust — winner unchanged under ±1 weight on every driver, drop-any-one-criterion, and O-3 as datum
Approval: approved by owner — client-review rev 4 (A-12), 2026-09-18, ledger:bc7029049a42b136

**Y-statement:** In the context of an internal expense tracker for ~40 staff on the owner's Node VPS,
facing a 3-year support horizon with no in-house ops team, we decided for O-1 (Node + Fastify +
Postgres + React) and neglected O-2 and O-3, to achieve a supportable stack the owner can already
host, accepting that Django's longer LTS lines would have given a wider support window.

## Context and problem statement

Internal expense tracker (FR-1…FR-9): ~40 staff, one office, hosted on the owner's existing
VPS (A-3), no in-house ops team (A-5), p95 < 300 ms at 20 concurrent users (NFR-2), 3-year
support horizon (NFR-5), permissive licensing only (C-1). Owner stated no stack preference (A-11).
Reversibility: language/runtime, datastore and hosting model are one-way doors (this record);
UI kit, test runner and linter are two-way doors (bulk-approved in A-13).

## Knock-out gates (pass/fail before any scoring)

| gate | O-1 | O-2 | O-3 | evidence |
|---|---|---|---|---|
| License permissive + SPDX-listed (C-1) | pass | pass | pass | [S-01, S-04, S-10] |
| Runtime/framework EOL outside the 3-year horizon (NFR-5) | pass | pass | pass | [S-07, S-04, S-10] |
| Zero unpatched reviewed advisories for the pinned major (NFR-4) | pass | pass | pass | [S-02, S-03] |

## Decision drivers (weighted criteria, locked before scoring — A-12)

| id | criterion (refutable scenario + threshold) | weight | traces |
|---|---|---|---|
| RQ-1 | Support horizon: LTS/EOL window covers the 3-year product life | 3 | NFR-5, A-5 |
| RQ-2 | Performance headroom for the stated load model (20 concurrent, p95 < 300 ms) | 2 | NFR-2 |
| RQ-3 | Security posture: open advisories and fix latency for the current major | 3 | NFR-4, C-2 |
| RQ-4 | Licensing: permissive, SPDX-listed | 2 | C-1 |

## Considered options

### O-1 Node + Fastify + Postgres + React (Vite)
### O-2 Next.js (app router) + Postgres
### O-3 Python + Django + Postgres + HTMX

## Comparison matrix (0–5 against the driver's fixed threshold, never relative to the other options; every cell cites its sources)

| criterion | O-1 | O-2 | O-3 |
|---|---|---|---|
| RQ-1 | 4 [S-04, S-07] | 2 [S-05] | 5 [S-10] |
| RQ-2 | 5 [S-06] | 3 [S-06] | 3 [S-06] |
| RQ-3 | 4 [S-02] | 3 [S-03] | 4 [S-10] |
| RQ-4 | 5 [S-01, S-04] | 5 [S-01] | 5 [S-01] |
| weighted total (secondary view, not the decision) | 44 | 30 | 43 |

## Decision outcome

O-1. Meets every driver at or above the runner-up except support horizon, where Django's explicit
3-year LTS lines score higher [S-10]; the gap is offset by the owner's existing Node hosting (A-3)
and the benchmark headroom [S-06]. The margin over O-3 is one weighted point on the secondary view;
the sensitivity sweep still keeps O-1 first because O-3 loses on the owner's hosting constraint
under every weighting tried.

## Pros and cons of the options (why not the others)

- O-2 — Good: one framework for UI + API. Bad: no published LTS policy beyond the current major
  [S-05]; heavier framework surface for an internal CRUD tool with no SEO need (A-4).
- O-3 — Good: strongest support story [S-10]. Bad: the owner's VPS and prior tooling are Node-based
  (A-3); switching runtimes adds operational surface with no in-house ops team (A-5).

## Consequences

- Good: the owner's existing hosting and tooling carry over unchanged (A-3).
- Bad: Fastify's major cadence is faster than Django's; mitigation — pin majors, `npm audit` in CI
  (traces NFR-4).
- Risk: the performance evidence is a frozen synthetic micro-benchmark, not a reproduced study
  [S-06]; the feasibility spike re-measures p95 under the NFR-2 load model before the stack is
  pinned. Revisit trigger: the spike misses p95 < 300 ms at 20 concurrent.
- Exit path: Postgres is shared by all three options — a runtime change later keeps the data.

## Failure-mode checks

- Résumé-driven? No — every component is in the owner's existing hosting (A-3).
- Microservice / polyglot envy? No — one process, one language.
- Innovation tokens spent: 0 of 1.
- Rewrite trap? No — every component has a support window past the 3-year horizon [S-07, S-10].

## Disconfirmation log

- O-1: searched "fastify problems", "migrating away from fastify", changelog breaking changes —
  one forum thread on a v4→v5 plugin break [S-09] (T4, context only); nothing superseding.
- O-2: searched "next.js app router issues" — resolved advisories in the current major [S-03].
- O-3: searched "django htmx limitations" — none load-bearing at this scale.

## Confirmation

doctor.sh: node 22 LTS + Postgres reachable + Playwright present; hello-world of O-1 boots
locally. build Phase 2 re-runs the spike under the NFR-2 load model and appends its measured p95
here before pinning; the lockfile must contain fastify and none of the rejected frameworks.

## More information

Evidence ledgers: `sources.tsv`, `claims.tsv`, `evidence/S-*.md` in this directory. No good
evidence exists for: the local hiring pool and the team's day-to-day productivity — the owner
decided those on judgment (A-12).
