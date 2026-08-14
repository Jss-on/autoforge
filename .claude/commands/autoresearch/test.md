---
name: autoresearch:test
description: "Full QA engagement on existing software — risk-based test plan, RTM, formal test design, execution with evidence, defect ledger, mechanical exit-criteria verdict (ISO/IEC/IEEE 29119 + ISTQB-aligned)"
argument-hint: "[Target: <dir>] [Requirements: <file>] [Types: <functional,a11y,security,perf,compat>] [Iterations: N] [Target-rate: 0.95] [--chain fix]"
---

EXECUTE IMMEDIATELY.

The **independent QA engineer** of the pipeline. Where `build` creates and `feature` extends, `test`
**assesses**: a complete, standards-aligned testing engagement on an EXISTING application, run the way
a professional software test engineer runs one — requirements analysis → risk-based **test plan** →
**requirements traceability matrix (RTM)** → formal test-case design → execution across the **test
pyramid** with evidence → a machine-validated **defect ledger** → an **exit-criteria** verdict. The
process follows **ISTQB** test-process activities (planning → monitoring & control → analysis →
design → implementation → execution → completion) and produces the **ISO/IEC/IEEE 29119-3** document
set (test plan, test cases, execution log, incident reports, test completion report); quality
coverage is organized by the **ISO/IEC 25010** product-quality characteristics. **Independence is the
point**: this command never fixes what it finds — tester and builder stay separate (remediation
chains to `fix`/`feature`), and "release-ready" is decided by `scripts/score-test.sh exit-criteria`,
never by opinion. Companion contract: `references/qa-testing-protocol.md` (technique catalog,
severity/priority model, deliverable templates, standards mapping).

## Seam & reference resolution (read once)
Resolve `AR_ROOT` exactly as in `build`: first existing of `${CLAUDE_PLUGIN_ROOT}/skills/autoresearch`,
`.claude/skills/autoresearch`, the directory containing this command file, else glob
`**/skills/autoresearch/scripts/score-test.sh` and take its grandparent. Every `scripts/<x>` below
means `$AR_ROOT/scripts/<x>`; every `references/<x>` means `$AR_ROOT/references/<x>`. Run
`bash $AR_ROOT/scripts/doctor.sh --require-build` at Phase 0 — a missing Playwright/docker means E2E and
compatibility rows cannot be verified; surface that in the test plan as a scope limitation, not at
iteration 15.

## Parse Arguments
- `Target:` / `--target` — the application directory under test (default: current repo if it contains
  a runnable app; otherwise STOP and ask).
- `Requirements:` / `--requirements` — the oracle: `requirements.md` (SRS), a PRD, or an
  `evals/fullstack/<name>.spec.yaml`. Auto-detected from the Target (`requirements.md`, `docs/`,
  `README`). **If none exists, reverse-engineer a provisional requirements inventory** from the code,
  routes, and UI (feature list with FR-n IDs) and get the user's explicit confirmation before
  designing tests against it — testing without an agreed oracle is guessing.
- `Types:` — restrict scope (default: all that apply): `functional, regression, a11y, security, perf,
  compat, exploratory`.
- `Iterations:` / `--iterations` — execution-loop bound, default 20. `Target-rate:` — strict-evidence
  pass-rate threshold for exit (default 0.95; exported as `TEST_TARGET_RATE`).
- `--chain <targets>` — commonly `fix` (defect remediation) then `test` again (re-engagement). `--evals`.

## Run directory & deliverables (the 29119-3 set, machine-readable where it counts)
`autoresearch/test-{YYMMDD}-{HHMM}/` containing:
- `test-plan.md` — scope in/out, risk register, levels & types, environments/data, entry/exit criteria.
- `test-cases.md` — designed cases: ID, technique tag, precondition, steps, expected result, priority,
  requirement link.
- `test-results.tsv` — the execution log, **same 7-column schema as build**
  (`spec dimension assertion weight status detail traces`): dimension ∈ logic/functional/ux/devops/
  monitoring/hardening, `traces` carries FR/NFR IDs (this IS the RTM's executed side), `detail`
  carries `evidence:<relpath>` — scored by `scripts/score-build.sh pass-rate --strict-evidence`.
- `defects.tsv` — the incident ledger (`id severity priority status test_id summary evidence`),
  validated by `scripts/score-test.sh defects`; prose twin `defect-reports.md` with full repro anatomy.
- `evidence/` — raw outputs: test-runner stdout + exit codes, probe responses, Playwright screenshots,
  axe reports, load-test summaries. A row or defect without its evidence file does not count.
- `exploratory/session-<n>.md` — SBTM session sheets (charter, timebox, PQIP notes, debrief).
- `test-summary.md` — the test completion report + go/no-go. `score-log.tsv`, `handoff.json`.

## Phase 1 — Intake & static review (testing starts before running anything)
Read the requirements, the code layout, the git history, and any prior run artifacts. Do what a QA
engineer does in refinement: **challenge the requirements** — undefined boundaries ("large file"?),
missing error behavior, unstated permission rules, conflicting acceptance criteria. Emit an
ambiguity/question list; resolve with the user what is scope-defining, record answers in the plan.
Establish the **oracle** per requirement (spec clause, golden value, invariant, or "confirmed with
user"). **Gate:** requirements inventory (FR-n/NFR-n) exists and is confirmed; ambiguities either
answered or logged as explicit assumptions in `test-plan.md`.

## Phase 2 — Risk analysis & test plan
Build a risk register: per feature/area, likelihood (1–5) × impact (1–5) with one-line rationale.
Depth follows risk — **High: full formal techniques + exploratory sessions + sad-path/concurrency
probing · Medium: standard cases on core paths + common errors · Low: smoke-level only.** Write
`test-plan.md` (29119-3 shape): scope in/out, test levels (unit/integration/API/E2E) and types
(functional, regression, and the non-functional set below), environment + test-data needs (per-role
accounts, resettable seed state), **entry criteria** (build boots, integrations up, accounts
provisioned) and **exit criteria** (executed 100% of planned cases; strict pass-rate ≥ Target-rate;
zero unresolved critical/high defects; RTM coverage 1.00; NFR gates met). Map planned coverage to the
**nine ISO/IEC 25010:2023 characteristics** (functional suitability, performance efficiency,
compatibility, interaction capability, reliability, security, maintainability, flexibility, safety —
2023 names; see the protocol's mapping table) so gaps are visible by name; mark N/A characteristics
explicitly. **Gate:** `test-plan.md` committed with risk register + explicit exit criteria.

## Phase 3 — Test design (formal techniques, matched to feature shape)
Design cases per `references/qa-testing-protocol.md`, technique-tagged:
- **Equivalence partitioning** on every input domain; **boundary value analysis** layered wherever
  ranges/lengths/dates/pagination have edges (bugs cluster at min−1/min/max/max+1).
- **Decision tables** where outputs depend on condition combinations (pricing, discounts,
  eligibility, permission grids).
- **State transition** for lifecycle behavior (auth/session, order/payment/approval state machines):
  valid transitions, then **invalid** transitions.
- **Pairwise** for config matrices (browser × role × payment …) instead of exhaustive combos.
- **Use-case/scenario** cases for end-to-end journeys; **error guessing** checklist everywhere
  (empty/null/whitespace, 0/negative/max+1, unicode/emoji, script injection strings, double-submit,
  back-button, expired session, offline mid-transaction).
- Business-rule computations get **`logic` golden rows** (exact input → expected output) — same
  must-pass semantics as `build`; wrong domain math can never be outweighed by green UI rows.
Seed `test-results.tsv` with every designed case as a `fail` row carrying its `traces` requirement
IDs. **Gate (mechanical):** `scripts/score-build.sh coverage test-results.tsv <requirements>` →
`REQ_COVERAGE: 1.00`, no orphan traces — every requirement has ≥1 designed case, every case serves a
requirement (bidirectional RTM).

## Phase 4 — Environment, data, smoke gate
Boot the Target (its own README/compose; never guess destructive commands — everything derived is
screened via `scripts/orchestrate.sh screen-cmd`). Provision per-role test accounts and known-state
seed data with a reset path; verify entry criteria. Then the **smoke gate**: a breadth-first pass over
the critical paths (login, core CRUD, the money path) — automated, bounded. **Any smoke failure =
BUILD_REJECTED**: file the blocking defects, write the summary with verdict `RELEASE_BLOCKED`, stop
the engagement (chain `fix`); testing depth on a broken build is wasted spend. **Gate:** smoke rows
green with evidence.

## Phase 5 — Execution cycles (the autoresearch loop; bounded, evidence-anchored)
Per iteration, exactly one focused slice:
1. **Pick** the highest-risk not-yet-executed area (risk register order; while any `logic` golden row
   is red, it goes first).
2. **Execute at the lowest layer that can catch the bug** — unit/API-level where the behavior lives
   there; a **live Playwright E2E** (Playwright fallback) for anything user-facing; per-role authz
   sweeps for permission rows. Implement automated test code under `<target>/tests/` or `qa/` when
   needed — **added, never edited into app source**.
3. **Record**: tee raw output to `evidence/`; flip executed rows pass/fail with
   `evidence:<relpath>` detail; recompute
   `scripts/score-build.sh pass-rate --strict-evidence test-results.tsv` (unproven pass rows are
   demoted mechanically; invocations hash-logged to `score-log.tsv`).
4. **File defects as found** — one row in `defects.tsv` (severity by technical impact: critical =
   crash/data-loss/security/blocked core flow; high = major function broken w/ workaround; medium;
   low — priority P1–P4 by business urgency, proposed for triage) plus a full report in
   `defect-reports.md`: title (symptom + condition), environment, numbered repro steps with exact
   values, expected vs actual with the oracle cited, evidence ref, reproducibility, isolation notes,
   regression flag. Validate the ledger each cycle: `scripts/score-test.sh defects defects.tsv`.
5. **Log** the iteration to `iterations.tsv`; append, never rewrite history.
Interleave, per the plan:
- **Exploratory sessions (SBTM)** on high-risk and defect-dense areas: charter ("Explore <area> with
  <resources> to discover <information>"), 60–120-minute timebox equivalent, PQIP-categorized notes
  (Problem → defect row, Question → user, Idea → backlog, Praise), session sheet + debrief. Hunt what
  scripted cases miss: sad paths, hostile-user moves (other users' IDs in URLs, tampered client
  prices), confused-user moves (back button, refresh mid-transaction, two tabs), concurrency and
  idempotency races (double-submit, simultaneous edits — verify who wins and what the loser sees).
- **Non-functional passes** mapped to 25010: **accessibility** (axe scan + keyboard-only navigation +
  focus management against WCAG 2.2 AA — one bad token can be ~20 nodes/page), **security-functional**
  (OWASP Top 10 checklist at QA depth: authz matrix per role, IDOR probes, input validation, header +
  session checks — deep audit remains `/autoresearch:security`), **performance** (k6/autocannon load
  at a realistic concurrency model against declared p95 SLOs — a physically impossible load model
  makes the gate fiction), **compatibility** (viewport/browser matrix scaled to what the product
  serves).
- **Fix verification** when fixes land mid-engagement: retest the exact defect scenario (fixed →
  verified/reopened), then targeted **regression** around the change; a retried-flaky pass is
  recorded as flaky, not green.
Repeat until every planned case is executed (pass or fail — execution completeness, not greenness,
ends the loop) or the `Iterations` bound hits (`scripts/score-build.sh bound iterations.tsv <N>`;
`BOUND: EXCEEDED` blocks a COMPLETE status without a recorded user-approved extension).

## Phase 6 — Completion: exit criteria, summary, verdict
Run the mechanical gate:
`TEST_TARGET_RATE=<rate> scripts/score-test.sh exit-criteria test-results.tsv defects.tsv <requirements>`
→ prints per-criterion PASS/FAIL (strict pass-rate ≥ threshold, logic gate, RTM coverage 1.00, defect
ledger valid, **zero unresolved critical/high** — a critical may never be deferred) and the verdict:
**`RELEASE_RECOMMENDED` or `RELEASE_BLOCKED`**. Write `test-summary.md` (test completion report):
executive summary with the verdict and top 3 risks; planned/executed/passed/failed/blocked counts;
pass rate + RTM coverage; defect counts by severity and status with the open list + workarounds;
per-25010-characteristic coverage notes; **what was NOT tested, stated as prominently as what was**;
residual-risk statement. The command **recommends; the human decides** — never present
RELEASE_RECOMMENDED as a deploy action (shipping stays `ship`, human-gated).

## GitHub flow (transparency contract)
Test artifacts are evidence — push them. Commit the run directory to the invoking workspace; when the
Target is its own output repo (per `build`'s Output repository contract), copy `test-summary.md` +
`defects.tsv` into `<target>/qa/` on a `qa/test-<stamp>` branch, push, and open a PR so the QA report
rides CI and review. **That report PR merges itself** (`gh pr merge --squash --delete-branch`) once
its checks are green and it is `MERGEABLE` — the report is evidence, and evidence belongs on the base
branch whatever the verdict was; a `RELEASE_BLOCKED` verdict blocks the *release*, never the record of
it. `--no-merge` opts out; branch protection wins if it requires a review. **File every unresolved critical/high defect as a GitHub issue** on the Target's
repo (label `qa`, body = the full defect report) — deferred findings must live where the fix work
happens, not in a summary nobody reopens.

## Safety Invariants
- **The application source is read-only.** This command may ADD test code and QA artifacts
  (`<target>/tests/`, `<target>/qa/`, the run dir); it never modifies, refactors, or "quick-fixes"
  app source, config, or data schemas. Every fix is a chained `fix`/`feature` engagement — tester
  independence is what makes the verdict credible.
- **Never deploy, push to production, or publish.** Local execution + the Target's own private repo
  only; `ship` stays human-gated.
- Every derived shell command is screened via `scripts/orchestrate.sh screen-cmd`; DB URLs obey the
  localhost/`_test` allowlist; test data is synthetic or masked — never production PII.
- Evidence discipline: no pass without a stored artifact, no defect without a repro, no verdict
  without the seam.

## Summary
Print: verdict (**RELEASE_RECOMMENDED | RELEASE_BLOCKED**) with each exit criterion's measured value;
strict pass-rate + logic gate; RTM coverage; cases planned/executed/passed/failed/blocked; defects by
severity (open vs resolved, deferred list); exploratory sessions run + top PQIP findings; NFR results
(a11y, security-functional, perf vs SLO, compat); NOT-tested list; deliverables checklist (plan ·
cases · results TSV · defect ledger · session sheets · summary — each present/missing); GitHub
issue/PR links.

## Eval Checkpoint (--evals)
Interval: floor(max_iterations / 3), min 1. Print pass-rate trend, execution progress
(executed/planned), defect arrival curve (new-per-cycle should flatten), open critical/high trend.
A rising arrival curve at the bound → recommend extension or RELEASE_BLOCKED, never silent exit.

## Chain Handoff
Write handoff.json: version "2.4.0", source "test", timestamp, status
(COMPLETE|BOUNDED|BLOCKED|USER_INTERRUPT|ERROR), results_tsv, defects_tsv, verdict
(RELEASE_RECOMMENDED|RELEASE_BLOCKED), summary (path), metric (fullstack_pass_rate), coverage,
findings = unresolved defects + not-tested list, config{target, requirements, types, iterations}.
Validate with `scripts/validate-handoff.sh <run>/handoff.json test` before printing the summary.
Chain commonly `--chain fix` (remediation from the defect ledger) then `test` (re-engagement);
`feature` when findings are scope gaps rather than defects. Propagate `--evals`.
