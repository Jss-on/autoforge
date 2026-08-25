# Building a Fully Working Software System with AutoForge

**A comprehensive playbook for taking a software product from a one-line idea to a tested,
hardened, shippable system — using the AutoForge command suite.**

> AutoForge generalizes Karpathy's insight — *constraint + mechanical metric + autonomous
> iteration = compounding gains* — into a full software-development lifecycle. This guide shows
> how to use the build pipeline (`requirements → build → feature → regression → ship`) to build
> real, complex software, why each step works, and how to scale it from a weekend app to a
> multi-service system.

---

## Table of Contents

1. [Who this is for](#1-who-this-is-for)
2. [The core idea: software is an iteration loop](#2-the-core-idea-software-is-an-iteration-loop)
3. [The first principle (8 rules) and the loop](#3-the-first-principle-8-rules-and-the-loop)
4. [The command suite at a glance](#4-the-command-suite-at-a-glance)
5. [Core concepts you must understand](#5-core-concepts-you-must-understand)
6. [The build pipeline architecture](#6-the-build-pipeline-architecture)
7. [Phase 1 — Requirements engineering](#7-phase-1--requirements-engineering)
8. [Phase 2 — Design and DESIGN.md](#8-phase-2--design-and-designmd)
9. [Phase 3 — Greenfield build](#9-phase-3--greenfield-build)
10. [Phase 4 — Feature addition (the ratchet)](#10-phase-4--feature-addition-the-ratchet)
11. [Phase 5 — Regression gate and shipping](#11-phase-5--regression-gate-and-shipping)
12. [The acceptance model in depth](#12-the-acceptance-model-in-depth)
13. [End-to-end walkthrough: building "TaskFlow"](#13-end-to-end-walkthrough-building-taskflow)
14. [Building large, complex systems](#14-building-large-complex-systems)
15. [Best-practice playbook](#15-best-practice-playbook)
16. [Failure modes and troubleshooting](#16-failure-modes-and-troubleshooting)
17. [Safety and guardrails](#17-safety-and-guardrails)
18. [Reference: artifacts, schemas, cheat-sheet](#18-reference-artifacts-schemas-cheat-sheet)
19. [FAQ](#19-faq)
20. [Glossary](#20-glossary)

---

## 1. Who this is for

You want to build working software — an API, a web app, a full-stack product — and you want an AI
agent to do it *reliably*, not produce a plausible-looking pile that falls over the first time you
run it. You are comfortable describing what you want and reviewing results, but you do not want to
babysit every line.

AutoForge is for you if any of these is true:

- You have an idea ("a money tracker", "an internal expense tool") and want a real, tested app.
- You have a finished app and want to add features without breaking what works.
- You care about more than "it compiles" — you want accessibility, observability, security, and a
  deployable artifact, verified, not promised.
- You are tired of AI output that is confident and wrong. You want a mechanical metric to decide
  "done", and automatic rollback when a change makes things worse.

This guide assumes the AutoForge plugin is installed (see the project README's Quick Start) and
that you are working inside a git repository.

---

## 2. The core idea: software is an iteration loop

Most "AI builds an app" tools do one big generation pass and hand you the result. That works for a
demo and fails for a system, because real software is not produced — it is *converged on*. You
write something, run it, see what is broken, fix one thing, run it again. The loop is the unit of
work, not the keystroke.

AutoForge makes that loop the primitive:

```
LOOP until done or out of budget:
  1. Read the current state + git history + the results log
  2. Pick the next change (what worked, what failed, what is untried)
  3. Make ONE focused change
  4. git commit  (BEFORE verifying — git is the experiment ledger)
  5. Run mechanical verification (build, tests, probes, a real browser)
  6. Improved? keep.   Worse? git revert.   Crashed? revert or fix.
  7. Log the result (one row per iteration)
  8. Repeat.
```

Building a whole system is the same loop, scaled across three observations:

1. **A system has many acceptance criteria, not one number.** AutoForge reduces them to a single
   weighted metric (`fullstack_pass_rate`) so the loop still has one scalar to climb.
2. **Greenfield (empty repo) and brownfield (existing app) are the same loop** with different
   starting incumbents. Greenfield starts at 0.00; brownfield starts from a working baseline.
3. **Features must not break each other.** Brownfield iteration adds a *ratchet*: the existing
   passing set can never go red. Each feature stacks; nothing backslides. That is how gains compound
   instead of drifting.

Everything else in this guide is the machinery that makes those three observations practical.

---

## 3. The first principle (8 rules) and the loop

Every AutoForge command — including the build pipeline — obeys eight rules. Internalize them;
they explain *why* the system behaves the way it does.

| # | Rule | Why it matters when building software |
|---|------|---------------------------------------|
| 1 | **Bounded by default** | Every loop has an iteration ceiling (e.g. `build` defaults to 40). You opt into `Iterations: unlimited`. No runaway agents. |
| 2 | **Read before write** | Each iteration reads `git log`/`git diff` and the results log first. The agent never edits blind. |
| 3 | **One change per iteration** | Atomic slices. If a change breaks something, you know exactly which one. |
| 4 | **Mechanical verification only** | "Done" is a number from a command, never a subjective "looks good". Acceptance is verified by *running it*. |
| 5 | **Automatic rollback** | A change that lowers the metric or trips the guard is `git revert`ed instantly. The incumbent never gets worse. |
| 6 | **Simplicity wins** | Equal metric with less code → keep the simpler version. |
| 7 | **Git is memory** | Experiments are committed with an `experiment:` prefix *before* verification, so the agent can read its own history and recover any attempt. |
| 8 | **When stuck, think harder** | On a plateau, re-read history, combine near-misses, try a bigger change before giving up. |

The build pipeline adds two software-specific properties on top:

- **Acceptance as a weighted metric** across six dimensions (logic, functional, UI/UX, devops,
  monitoring, hardening) — so "it works" is never enough on its own, and domain math (`logic`) is
  must-pass: while any business-rule golden case is red, the headline score is hard-capped at 0.50.
- **The non-regression ratchet** for features — rule 5 (rollback) extended across the *whole*
  existing acceptance set, not just the current change.

---

## 4. The command suite at a glance

AutoForge ships 19 commands. For building software you mostly use the **build pipeline** (bold),
with the others as supporting tools.

| Command | Role in building software |
|---|---|
| `/forge` | The classic metric loop / autonomous orchestrator. Routes plain-language goals. |
| `/forge:plan` | Turn a goal into a validated `Scope`/`Metric`/`Verify` config. |
| **`/forge:requirements`** | **Interview a brief → a validated build spec (no assumptions).** |
| **`/forge:build`** | **Greenfield: build a new app via the full SDLC to passing acceptance.** |
| **`/forge:feature`** | **Brownfield: add a feature to an existing app under a non-regression ratchet.** |
| `/forge:debug` | Hunt bugs via falsifiable hypotheses (reused inside build's debug phase). |
| `/forge:fix` | Crush errors to zero (reused to clear build failures). |
| `/forge:regression` | Stability gate: prove no green→red across 8 dimensions. The ratchet's engine. |
| `/forge:test` | Full QA engagement on existing software — risk-based plan, RTM, formal test design, execution + defect ledger, exit-criteria verdict (ISO 29119/ISTQB-aligned). |
| `/forge:design` | UI/UX designer + design QA — direction protocol → machine-readable `DESIGN.md` (`system`); independent design audit of a running app with the mechanical anti-slop floor, heuristic critique, personas, defect ledger and a `SHIP|FIX|REBUILD` verdict (`audit`); bounded `--fix` remediation. |
| `/forge:security` | STRIDE + OWASP red-team audit (deepens the hardening dimension). |
| `/forge:ship` | 8-phase shipping workflow. Human-gated. |
| `/forge:scenario` | Generate edge cases across 12 dimensions (feeds acceptance). |
| `/forge:predict` | 5-expert pre-mortem before building. |
| `/forge:probe` | 8-persona requirement interrogation (reused by requirements). |
| `/forge:reason` | Adversarial debate for design decisions (reused in the design phase). |
| `/forge:learn` | Generate/refresh documentation. |
| `/forge:improve` | Research what to build next (PRDs). |
| `/forge:evals` | Analyze a run's TSV: trends, plateaus, convergence. |

The pipeline reuses the others rather than reinventing them: `requirements` borrows `probe`, the
design phase borrows `reason`, the debug phase borrows `debug`, the ratchet borrows `regression`.

---

## 5. Core concepts you must understand

### 5.1 The mechanical metric: `fullstack_pass_rate`

A built app is graded by one number in `[0, 1]`, computed by
`scripts/score-build.sh pass-rate <results.tsv>` from a tab-separated results file (the path is
explicit — the scorer never goes looking for one; see §12.4). It is a weighted average over six
**dimensions**:

| Dimension | Weight | What it gates |
|---|---|---|
| `logic` | 0.30 | Business-rule golden vectors (exact `input → expected output`); **must-pass** — while any is red the headline is hard-capped at 0.50. |
| `functional` | 0.30 | The app does what it should (CRUD, endpoints, tests, coverage). |
| `ux` | 0.20 | Responsive, accessible (WCAG AA / axe), real e2e flow, component states, DESIGN.md conformance. |
| `devops` | 0.15 | Reproducible build, container, CI, compose/IaC, migrations. |
| `monitoring` | 0.15 | Health/readiness, metrics, structured logs, tracing. |
| `hardening` | 0.20 | No secrets, security headers, input validation, rate-limit, authz, dependency scan. |

The declared weights sum to 1.30 by design; the score is renormalized over the dimensions that ran,
so with all six running the effective weights are ≈ 0.231 / 0.231 / 0.154 / 0.115 / 0.115 / 0.154.
Three properties make it honest:

- **Renormalization over dimensions that ran.** If a spec declares no `monitoring` assertions, the
  remaining weights are renormalized so the score is computed only over what was actually measured.
  Absent ≠ failing; but a *declared-then-failing* assertion drops that dimension's score. (This is
  also why adding `logic` never rescored legacy specs: a spec that declares no `logic` rows simply
  renormalizes over the other five, with the logic gate reported `n/a`.)
- **`skip` is excluded.** An assertion marked `skip` (genuinely not applicable, or environment-
  blocked) counts in neither numerator nor denominator — and every skip is reported, never hidden.
- **The logic gate.** `logic` rows pin business rules to golden vectors and are must-pass: while any
  is red, the headline is capped at `LOGIC_GATE_CAP` (default 0.50). Complex, multi-rule domains —
  payroll, accounting, POS — otherwise converge on *stub math*: the app boots, screens render,
  ops and UX polish accumulate, and the numbers are wrong. The cap makes domain correctness a
  precondition for "done", not a component you can trade against polish.

UI/UX is first-class at weight 0.20: a working-but-ugly or inaccessible app is capped, never "done".

### 5.2 Acceptance is run, not claimed

Every acceptance row is verified by *executing* the app: build the image or bundle, boot it, probe
endpoints, run the test pyramid, and drive a **real browser** via gstack `/browse` for end-to-end
flows, accessibility (axe), responsiveness, and DESIGN.md conformance. The agent does not get to
say "looks good." A row is `pass`, `fail`, or `skip` based on observed behavior.

Since v2.3.1 that is enforced rather than trusted: every verification tees its raw output into the
run's `evidence/` directory, a row may flip to `pass` only with a `detail` of
`evidence:<relpath>[#locator]` naming the file that proves it, and convergence is scored with
`score-build.sh pass-rate --strict-evidence`, which demotes any `pass` row whose evidence file does
not exist. Every scorer invocation is hash-logged to `score-log.tsv` (§12.4).

### 5.3 The ratchet (compounding gains)

When you add a feature to an existing app, the existing passing assertions become a **floor**. Every
iteration runs `regression`; if any existing green assertion goes red, the slice is auto-reverted.
The baseline can only rise. Over many features, quality compounds rather than eroding — the central
promise of forge applied to a codebase over time.

### 5.4 DESIGN.md (design as a source of truth)

UI is built from a committed `DESIGN.md` — a markdown design system (tokens for color, type,
spacing, radius, motion; component patterns; rules) following the Google DESIGN.md spec. Reference
systems live in the getdesign.md catalog / VoltAgent's `awesome-design-md`. You can adopt one from
the catalog, point at a file/URL, or generate one with gstack `design-consultation`. The `ux`
dimension then checks **conformance** mechanically: `/browse` reads the live computed styles and
asserts they match the DESIGN.md tokens; off-system "slop" values fail.

### 5.5 Git as memory; bounded by default

Each kept or attempted slice is an `experiment:` commit. The agent reads its own commit history each
iteration. Loops are bounded (`Iterations: N`) unless you opt out — and the bound is enforced
mechanically at convergence: `score-build.sh bound iterations.tsv <N>` must print `BOUND: OK`, so a
run that overshot its budget cannot report CONVERGED (§12.4). Your last good state is always in
git, so `Ctrl+C` is always safe.

### 5.6 Guard vs Verify vs Regression

- **Verify** answers "did the metric improve?" (the goal).
- **Guard** answers "did anything else break?" (a safety command that must always pass, e.g. the
  existing test suite). A change that improves the metric but trips the guard is reworked or reverted.
- **Regression** is the *cross-feature* guard: a tiered verdict (STABLE/UNSTABLE) over 8 dimensions
  that only counts green→red transitions as regressions.

---

## 6. The build pipeline architecture

```
                ┌─────────────────────────────────────────────────────────────┐
   one-line     │                                                             │
   idea / brief │   /forge:requirements   (interview, no assumptions)  │
        │       │            │  emits  evals/fullstack/<name>.spec.yaml        │
        ▼       │            ▼                                                 │
   ┌────────┐   │   ┌──────────────────┐        ┌──────────────────────────┐  │
   │ client │──▶│   │ /forge:    │  new   │  build-output/<name>/    │  │
   │  needs │   │   │     build         │───────▶│  working, tested app     │  │
   └────────┘   │   │  (greenfield SDLC)│        └──────────────────────────┘  │
                │   └──────────────────┘                    │                 │
                │            ▲                               │ add features    │
                │            │ greenfield                    ▼                 │
                │   ┌────────┴─────────┐        ┌──────────────────────────┐  │
                │   │ orchestrator      │  exists│ /forge:feature    │  │
                │   │ routes by archetype│──────▶│  (brownfield + ratchet)  │  │
                │   └──────────────────┘        └──────────────────────────┘  │
                │                                           │                 │
                │                                           ▼                 │
                │         /forge:regression  ─▶  /forge:ship    │
                │              (stability gate)          (8 phases, HUMAN-GATED)│
                └─────────────────────────────────────────────────────────────┘
```

**Autonomy.** A bare goal (`/forge build me a notes app`) is classified by the orchestrator
into the `build-feature` archetype, which routes **greenfield → `build`** and **existing app →
`feature`**. You can also call the stages directly.

**Shared substrate.** All stages write the same artifacts (`build-results.tsv`, `iterations.tsv`,
`handoff.json`) and use the same scorers, so they chain cleanly and you can inspect any run.

---

## 7. Phase 1 — Requirements engineering

`/forge:requirements` turns a brief into a validated build spec. It is **interactive and
makes no assumptions** about scope-defining questions — it interviews you until requirements
saturate, then emits a spec only when a mechanical gate passes.

### 7.1 The process

It follows the classical requirements-engineering lifecycle:

1. **Elicitation (multi-round interview).** Round 1 frames who it is for, the core features, the
   data, and the scale. Round 2 deepens: auth/identity, data sensitivity & compliance, platforms,
   integrations, the desired look & feel (a DESIGN.md reference), and hard constraints. Round 3+
   closes gaps. It never guesses on a scope-defining question — it asks.
2. **Analysis & classification.** Functional requirements vs non-functional requirements (NFRs).
   Each NFR maps to a build dimension (usability/a11y → ux; performance/observability → monitoring;
   security/compliance → hardening; deployability → devops; behavior → functional; computed
   business rules → `logic` golden vectors). Ambiguities and
   conflicts go *back* to you. MoSCoW prioritization (Must / Should / Could / Won't).
3. **Specification.** An SRS with user stories (INVEST), FR-n, NFR-n, constraints, assumptions,
   out-of-scope, acceptance criteria in Given/When/Then form, and a traceability matrix.
4. **Validation (sign-off gate).** It plays the full requirements back to you and waits for explicit
   sign-off before generating anything.
5. **Generate the spec.** Emits `evals/fullstack/<name>.spec.yaml` with `stack`, an optional
   `design:` block, and an `acceptance:` block across all six dimensions — golden `logic` vectors
   for every computed business rule, plus the five operational dimensions — weighted by MoSCoW
   (Must = 2, Should = 1).
6. **Mechanical validate-until-VALID.** Runs `scripts/score-requirements.sh validate <spec>`. The
   spec is released to `build` only when it prints `VALIDATION: VALID`: the five operational
   dimensions present and weighted, plus — for computational domains, validated with
   `REQUIRE_LOGIC=1` — a `logic:` block carrying at least one `gate: true` golden row (a declared
   `logic:` block must carry one either way). This is the first-principle applied to a single-pass
   command: a mechanical gate, not opinion, decides "done".

### 7.2 Usage

```
/forge:requirements Brief: "internal expense tracker with SSO and CSV export"
# ... it interviews you across a few rounds, you sign off ...
# → evals/fullstack/expense-tracker.spec.yaml  (VALIDATION: VALID)
# → /forge:build Spec: evals/fullstack/expense-tracker.spec.yaml Iterations: 40
```

Add `--chain build` to flow straight into the build once the spec is validated.

### 7.3 Why "no assumptions" matters

A one-line brief is a *starting point*, not a specification. "Build a money app" can mean a personal
budget tracker, a team expense system, an investment portfolio, or a bank-linked aggregator — wildly
different builds. Guessing wastes the entire downstream build. The interview front-loads the cheap
decisions (questions) before the expensive ones (code).

---

## 8. Phase 2 — Design and DESIGN.md

Before any UI code, the build commits a `DESIGN.md` and an architecture sketch. This is what makes
the `ux` dimension *measurable* instead of subjective.

### 8.1 Architecture

Modules, data model, API contract, dependency boundaries (repository pattern so storage can be
swapped and tested). For genuinely contested decisions ("event sourcing or not?"), the design phase
can invoke `/forge:reason` — an adversarial debate judged by a blind panel — to pick an
approach on the merits.

### 8.2 The design system: DESIGN.md

Resolution order for the design source:

1. The `Design:` argument (`Design: linear`, a file path, a URL, or `generate`).
2. The spec's `design:` block.
3. Otherwise **generate** one via gstack `design-consultation`.

Sources:

- **Catalog** — a slug from getdesign.md / `awesome-design-md` (e.g. `linear`, `stripe`, `notion`).
  The free, open source is the `awesome-design-md` GitHub repo; the website's per-brand pages are
  sign-in/install-gated.
- **File / URL** — your own DESIGN.md.
- **Generate** — `design-consultation` proposes a complete system (aesthetic, typography, color,
  spacing, motion) and writes DESIGN.md.

All UI tokens are then **derived from** DESIGN.md, never improvised. In the build's Testing phase
(SDLC Phase 6), conformance is checked mechanically.

---

## 9. Phase 3 — Greenfield build

`/forge:build` builds a brand-new app from an empty target directory through the full SDLC,
executed as an forge loop. It builds into `build-output/<name>/` (or a declared `Scope:`),
never into the skill repo.

### 9.1 The SDLC phases (each phase-gated)

The standard 8-phase model, each phase exiting with its named deliverable:

| Phase | What happens | Deliverable | Exit gate |
|---|---|---|---|
| 1. Planning / Initiation | vision, in/out scope, iteration budget, risk register | project charter (`charter.md`) | charter committed |
| 2. Feasibility | go/no-go spike: toolchain boots, schedule sane, licenses ok | feasibility verdict (in charter) | verdict GO, stack pinned |
| 3. Requirements Analysis | Spec → enumerated acceptance (incl `logic` golden vectors from the rule matrix), seeded as `fail` in `build-results.tsv` | SRS (`requirements.md`) + RTM (`traces`) | `REQ_COVERAGE` 1.00; baseline `pass_rate` = 0.00 |
| 4. Design | HLD + LLD (domain engine + rule matrix) + DB schema + DESIGN.md + tokens | HLD/LLD + `DESIGN.md` | `DESIGN.md` committed; `DESIGN_COVERAGE` 1.00 |
| 5. Implementation (TDD) | red→green ladder, lowest-scoring dimension first | source + CI | slices kept by the loop |
| ‡ Defect loop (debugging) | root-cause loop on failures (no symptom patches), inside 5–6 | defect records (`iterations.tsv`) | failing assertions traced |
| 6. Testing | unit + integration + e2e (`/browse`) + a11y (axe) + visual + coverage | test plan + test summary report | every layer green |
| 7. Deployment | release plan + notes + user manual, hand to `ship` (human-gated) | `RELEASE_NOTES.md` + user manual | — |
| 8. Operations / Maintenance | runbook + change-request path (`feature`/`fix`/`improve`) | `RUNBOOK.md` | verified commands/endpoints; feeds back into planning |

Before Phase 1, the build preflights the environment with `bash scripts/doctor.sh --require-build`
(the gate scripts, doctor included, ship in `skills/forge/scripts/` — see §18.2). gstack
(`/browse`) and docker are hard requirements: without them the `ux` and `devops` dimensions cannot
be *verified*, which blocks convergence — doctor surfaces that at iteration 0, not at iteration 30.

### 9.2 The iteration loop (the forge core)

Within Phases 5–6, every change goes through the loop:

```
1. Read    — git log/diff of recent experiment: commits + build-results.tsv; pick the
             lowest-scoring dimension that still has red rows — but while any logic
             (golden) row is red, fix it FIRST: only logic lifts the 0.50 cap.
2. One     — one atomic slice toward that dimension.
3. Commit  — git commit -m "experiment: <dimension> — <slice>"   (before verify)
4. Verify  — build, boot, probe, run the test pyramid + /browse e2e/axe; tee every raw
             output into <run-dir>/evidence/; flip a row to pass only with
             detail = evidence:<relpath>[#locator] naming its proof file; recompute
             scripts/score-build.sh pass-rate --strict-evidence build-results.tsv
             (unproven pass rows are demoted; the call is hash-logged to score-log.tsv).
5. Decide  — keep if pass_rate rose AND guard green; simplicity wins on ties; else git revert.
6. Log     — append the iteration to iterations.tsv.
7. Repeat  — until strict pass_rate >= Target-rate (default 1.00) with logic_gate PASS,
             REQ_COVERAGE = DESIGN_COVERAGE = 1.00, and `bound` printing BOUND: OK —
             or the Iterations budget is hit.
```

A **floor-guard** keeps scaffolding commits that compile and add no failures but pass zero
assertions (so the project can be stood up before any assertion is satisfiable).

### 9.3 Verification order within a build

Implementation proceeds lowest-scoring dimension first — except that `logic` is attacked before any
ops/UX polish while it has red rows (the headline is capped at 0.50 until every golden case is
green, so only logic lifts the ceiling), and functional before ops while functional has reds (a
`/metrics` endpoint on a broken app is worthless). Typical order: scaffold → logic (the pure domain
engine, golden-tested before any shell leans on it) → functional → devops → monitoring → UX →
hardening, but the loop reorders based on observed scores.

### 9.4 Independent verify before convergence

Before declaring done at the target rate, acceptance is re-run on a **fresh boot** (cold container,
clean state) — a held-out check separate from the inner-loop signal — to avoid overfitting a flaky
pass. High-impact slices route a `verify` pass (`reason`/`predict`) before convergence.

### 9.5 Usage

```
/forge:build Spec: evals/fullstack/expense-tracker.spec.yaml Iterations: 40
# or from prose, deriving a spec on the fly:
/forge:build Goal: "a URL shortener with analytics" Stack: node+postgres+react
# or pin a design:
/forge:build Spec: ...spec.yaml Design: linear
```

---

## 10. Phase 4 — Feature addition (the ratchet)

`/forge:feature` is the brownfield sibling of `build` — the same loop, on an existing app,
adding one capability without breaking anything. This is how software grows over time.

### 10.1 What changes vs greenfield

| | Greenfield `build` | Feature on existing app |
|---|---|---|
| Incumbent | empty repo (0.00) | the working app + its passing acceptance |
| Delta | all assertions | only the new feature's assertions, appended as `fail` |
| Metric | `fullstack_pass_rate` | same, over the **union** (existing + new) |
| Floor | the guard | **+ regression gate**: any existing green→red auto-reverts |
| Done | all green | new green **and** `regression` STABLE → fold the delta into the spec |

### 10.2 The loop with the ratchet

Each iteration runs the build loop on the *new* assertions, then the floor:

```
... build loop slice ...
Regression: scripts/score-regression.sh verdict <results.tsv>
   baseline = incumbent greens, candidate = now
   any existing assertion green→red  →  git revert HEAD --no-edit   (HARD gate, no exceptions)
keep iff: new-assertion pass_rate rose  AND  regression STABLE  AND  guard green
```

The delta spans the same six dimensions: any new business rule ships its `logic` golden vectors
first, and the 0.50 logic-gate cap applies to the **union** — a feature with wrong domain math
cannot converge on polish. Verification carries `build`'s evidence contract too: raw outputs teed
into `<run-dir>/evidence/`, rows flipped to pass only with an `evidence:` detail, and the union
scored with `pass-rate --strict-evidence`.

On convergence the new assertions are **ratcheted into** `evals/fullstack/<app>.spec.yaml` — they
are now permanent baseline, and the next feature starts from the higher floor. Improvements compound.

### 10.3 Autonomy

If the `Target` directory is empty or absent, `feature` hands off to `build` (it is greenfield). The
orchestrator uses the same rule, so a bare goal "self-routes" to the right command.

### 10.4 Usage

```
/forge:feature Feature: "recurring transactions" Target: build-output/money-tracker
/forge:feature Feature: "CSV export"             Target: build-output/expense-tracker --chain regression
```

---

## 11. Phase 5 — Regression gate and shipping

### 11.1 Regression

`/forge:regression` captures baseline behavior from a `git worktree` of the base ref, runs
the candidate, and emits a single **STABLE / UNSTABLE** verdict. Its core invariant: a regression is
a **green→red transition only**. Pre-existing failures (red→red), new tests (absent→red), and flaky
tests (flake→red) are classified and excluded — never counted as regressions.

Tiered verdict:

- **HARD gate** (any green→red = UNSTABLE): `functional`, `api-contract`, `data-migration`,
  `integration-e2e`.
- **SCORE** (0–100, noise-tolerant, weighted; UNSTABLE below threshold 95): `flakiness` 0.30,
  `performance` 0.30, `resource` 0.20, `visual-ui` 0.20.

This is the engine behind the feature ratchet, and a standalone pre-push gate.

### 11.2 Shipping

`/forge:ship` runs an 8-phase workflow — Identify → Inventory → Checklist → Prepare →
Dry-run → Ship → Verify → Log — with domain-specific, mechanically verifiable checklists.

**Deployment is always human-gated.** No command in the pipeline deploys, pushes, or publishes on
its own. `ship` will prepare everything and stop for your approval. This is a hard safety invariant,
not a setting.

---

## 12. The acceptance model in depth

### 12.1 The results TSV

Acceptance lives in a tab-separated file, one row per assertion:

```
# metric_direction: higher_is_better
spec	dimension	assertion	weight	status	detail	traces
todo-api	logic	golden: 3 of 12 tasks due < now → overdue badge "3"	2	pass	evidence:logic-goldens.txt#overdue	FR-3
todo-api	functional	GET /todos returns 200	1	pass	evidence:probe-todos.txt	FR-1
todo-api	ux	axe zero serious/critical	2	pass	evidence:axe-home.txt	NFR-2,design:states
todo-api	monitoring	/metrics prometheus	1	fail	endpoint missing	NFR-4
todo-api	devops	forward-only migration	1	skip	needs live postgres	NFR-5
```

- `dimension` ∈ `logic | functional | ux | devops | monitoring | hardening`.
- `weight` — per-assertion weight within its dimension (MoSCoW: Must = 2, Should = 1).
- `status` ∈ `pass | fail | skip`. `skip` = not applicable / environment-blocked; excluded from the
  score and always reported.
- `detail` — for a `pass` row, must name its proof: `evidence:<relpath>[#locator]`, a file under the
  run's `evidence/` store. Strict scoring demotes any pass row whose file is missing (§12.4).
- `traces` (col 7, comma-separated `FR-n` / `NFR-n` / `design:<group>`) — what the row satisfies;
  read by the coverage gate, which also fails on traces pointing at requirements that do not exist.

### 12.2 The scoring math

`scripts/score-build.sh pass-rate build-results.tsv` (the TSV path is required — pass it explicitly
or set `BUILD_RESULTS`) computes, for each dimension that ran:

```
dim_score   = sum(weight of pass) / sum(weight of pass + fail)     # skip excluded
```

then a weighted average, renormalized over the dimensions that ran, with the logic gate applied last:

```
pass_rate   = Σ ( dim_weight[d] * dim_score[d] )  /  Σ dim_weight[d]    for d in dims_that_ran
if logic ran and dim_score[logic] < 1.00:  pass_rate = min(pass_rate, 0.50)   # LOGIC_GATE_CAP
```

Output is one line — `PASS_RATE: 0.NN` — floored to two decimals (so a near-miss never displays as
a perfect pass); the per-dimension breakdown and `logic_gate=PASS|CAPPED@0.50|n/a` go to stderr.
Worked example, all six dimensions running (declared weights sum 1.30, so each is renormalized by
÷1.30):

| Dim | declared weight | effective weight | dim_score | contribution |
|---|---|---|---|---|
| logic | 0.30 | ≈ 0.231 | 1.00 | 0.231 |
| functional | 0.30 | ≈ 0.231 | 1.00 | 0.231 |
| ux | 0.20 | ≈ 0.154 | 1.00 | 0.154 |
| devops | 0.15 | ≈ 0.115 | 1.00 | 0.115 |
| monitoring | 0.15 | ≈ 0.115 | 0.667 (2 of 3 weight green) | 0.077 |
| hardening | 0.20 | ≈ 0.154 | 1.00 | 0.154 |
| **total** | 1.30 | 1.00 | | **0.96** |

That 0.96 is a real signal: every dimension perfect except `monitoring`, which carries one failed
assertion. The loop's job is to find the slice that turns that red row green without dropping any
other dimension. Had a `logic` golden row been red instead, the headline would print 0.50 no matter
how much polish accumulated elsewhere — a complex domain cannot converge "done" on stub math, and
only a fully green `logic` dimension lifts the cap.

### 12.3 The spec.yaml schema

```yaml
name: <slug>
summary: <one line>
stack:
  language: typescript
  framework: fastify
  datastore: postgres
  frontend: react
  test: vitest
design:                      # optional; build adopts as DESIGN.md
  source: catalog            # catalog | file | url | generate
  ref: linear                # slug / path / url
acceptance:
  logic:      [ { id, assert, weight, gate: true } , ... ]   # business-rule golden vectors: exact input → expected output; must-pass
  functional: [ { id, assert, weight } , ... ]
  ux:         [ { id, assert, weight } , ... ]   # responsive, a11y, e2e, states, design-conformance
  devops:     [ { id, assert, weight } , ... ]   # docker, CI, compose, migrations
  monitoring: [ { id, assert, weight } , ... ]   # health, metrics, logs, tracing
  hardening:  [ { id, assert, weight } , ... ]   # secrets, headers, validation, rate-limit, authz
```

The five operational dimensions must be present and weighted for `score-requirements.sh validate`
to return VALID; for computational domains, validate with `REQUIRE_LOGIC=1` so a `logic:` block
with at least one `gate: true` golden row is also required (a declared `logic:` block must carry
one either way — a pure-CRUD app may simply omit the block and renormalize over the other five).
Each `assert` is a single mechanical check derived from a Given/When/Then acceptance criterion.

### 12.4 Evidence, coverage, and the bound (what CONVERGED requires)

v2.3.1 closed the gap between "the loop says it passed" and "a third party can check it".
Convergence now requires the strict pass-rate at `Target-rate` with `logic_gate=PASS`, plus every
gate below:

1. **Strict evidence.** Every verification tees its raw output into `<run-dir>/evidence/` —
   test-runner stdout with exit code, probe responses, `/browse` screenshot paths, axe reports; one
   file per suite/probe (e.g. `evidence/unit-tests.txt`, `evidence/e2e-checkout.txt`). A row flips
   to `pass` only with `detail = evidence:<relpath>[#locator]` naming its proof file, and
   convergence is scored with `score-build.sh pass-rate --strict-evidence`, which demotes any `pass`
   row whose evidence file does not exist (marking it `EVIDENCE-MISSING`) before scoring. "The model
   says it passed" stops being scoreable currency.
2. **A hash-anchored audit trail.** Every scorer invocation (`pass-rate`, `coverage`) appends a line
   to `<run-dir>/score-log.tsv`: UTC timestamp, subcommand, file, sha256 content hash, headline —
   so anyone can re-run the scorer on the stored ledger and confirm the number matches.
3. **No implicit results discovery.** `score-build.sh` requires an explicit TSV path (or
   `BUILD_RESULTS`); given neither, it prints the honest `PASS_RATE: 0.00` baseline. The old
   conventional-location fallback could silently score a *different project's* stale ledger as 1.00.
4. **Coverage.** `score-build.sh coverage build-results.tsv requirements.md` must report
   `REQ_COVERAGE: 1.00` (every `FR-`/`NFR-` ID traced by ≥1 row) **and** `DESIGN_COVERAGE: 1.00`
   (every DESIGN.md token group traced by ≥1 `ux` row), with no orphan traces — a green pass-rate
   can never hide an unbuilt requirement or an invented assertion.
5. **The bound.** `score-build.sh bound iterations.tsv <N>` must print `BOUND: OK`.
   `BOUND: EXCEEDED` mechanically blocks a CONVERGED report — the run either stops as BOUNDED, or
   you grant an explicit extension, recorded (your approval + the new bound) in `handoff.json`.

The final run directory therefore contains `build-results.tsv`, `iterations.tsv`, `evidence/`, and
`score-log.tsv` — a self-auditing ledger, not a claim.

---

## 13. End-to-end walkthrough: building "TaskFlow"

Let us build a real system: **TaskFlow**, a team task manager — users, projects, tasks, assignment,
comments — with a web UI, deployable to a container. We will go from idea to shipped, then add a
feature under the ratchet.

### 13.1 Requirements

```
/forge:requirements Brief: "team task manager — projects, tasks, assignment, comments"
```

The interview settles (after your answers) on: multi-user with email+password auth, web (responsive),
Node + Fastify + Postgres + React, a `linear` design reference, production-grade. TaskFlow computes
progress roll-ups and due-soon flags, so the spec is validated with `REQUIRE_LOGIC=1` and carries
gated golden vectors. It emits and validates `evals/fullstack/taskflow.spec.yaml`:

```yaml
name: taskflow
stack: { language: typescript, framework: fastify, datastore: postgres, frontend: react, auth: jwt, test: vitest }
design: { source: catalog, ref: linear }
acceptance:
  logic:
    - { id: progress-rollup, assert: "golden: 7 done of 9 active tasks -> project progress 77% (floor)", weight: 2, gate: true }
    - { id: due-soon,        assert: "golden: due 2026-03-02T09:00+08:00, now 2026-03-01T18:00Z -> flagged due-soon", weight: 2, gate: true }
  functional:
    - { id: auth,         assert: "signup+login returns JWT; protected routes require it", weight: 2 }
    - { id: projects-crud,assert: "create/list/delete projects scoped to the user's team", weight: 2 }
    - { id: tasks-crud,   assert: "CRUD tasks under a project; assign to a member",        weight: 2 }
    - { id: tests-green,  assert: "vitest passes, coverage >= 80",                          weight: 1 }
  ux:
    - { id: responsive,   assert: "board works 375/768/1280",                              weight: 1 }
    - { id: a11y,         assert: "axe zero serious/critical via /browse",                  weight: 2 }
    - { id: e2e-flow,     assert: "/browse: login -> create task -> assign -> see it",      weight: 2 }
    - { id: design-conformance, assert: "computed styles match DESIGN.md tokens",           weight: 1 }
  devops:
    - { id: dockerfile,   assert: "multi-stage, non-root, HEALTHCHECK",                     weight: 2 }
    - { id: ci,           assert: "CI lint+test+build+dep-scan green",                       weight: 1 }
    - { id: compose,      assert: "docker-compose brings up api + postgres",                weight: 1 }
    - { id: migrations,   assert: "forward-only migrations create the schema",               weight: 1 }
  monitoring:
    - { id: health,       assert: "/healthz + /readyz (readyz gated on postgres)",          weight: 2 }
    - { id: metrics,      assert: "/metrics prometheus",                                     weight: 1 }
    - { id: logs,         assert: "structured JSON logs with request id",                    weight: 1 }
  hardening:
    - { id: authz,        assert: "a user cannot read another team's projects (403)",        weight: 2 }
    - { id: validation,   assert: "invalid bodies -> 400",                                    weight: 2 }
    - { id: no-secrets,   assert: "no hardcoded secrets; .env.example; scan clean",          weight: 1 }
    - { id: rate-limit,   assert: "login rate-limited (429)",                                 weight: 1 }
```

### 13.2 Build

```
/forge:build Spec: evals/fullstack/taskflow.spec.yaml Iterations: 40
```

Iteration 0 seeds every row as `fail` → `pass_rate = 0.00`. The loop then climbs. A slice of the
`iterations.tsv` ledger:

```
iter  commit    dimension    slice                              pass_rate  delta  guard  status
0     a1b2c3d   -            baseline (all fail)                0.00       0.00   -      keep
1     b2c3d4e   functional   scaffold + fastify app + vitest    0.00       0.00   pass   keep(scaffold)
2     c3d4e5f   logic        pure engine: progress + due-soon   0.23       +0.23  pass   keep
4     e5f6a7b   functional   auth + JWT + per-team isolation    0.29       +0.06  pass   keep
9     1a2b3c4   functional   projects + tasks CRUD; suite green 0.46       +0.17  pass   keep
12    4d5e6f7   monitoring   /healthz /readyz /metrics + logs   0.57       +0.11  pass   keep
16    7a8b9c0   devops       Dockerfile + compose + migrations  0.69       +0.12  pass   keep
19    0d1e2f3   ux           design system from DESIGN.md       0.71       +0.02  pass   keep
21    3a4b5c6   ux           a11y fixes (labels, contrast)      0.71       -      pass   discard  (axe still 2)
22    6d7e8f9   ux           a11y fixes round 2 (aria, focus)   0.76       +0.05  pass   keep
27    9a0b1c2   hardening    authz + validation + rate-limit    0.92       +0.16  pass   keep
31    2d3e4f5   ux           e2e flow + design-conformance      1.00       +0.08  pass   keep
```

Iteration 2 is logic-first discipline: the pure domain engine (progress roll-up, due-soon window)
goes golden-green before any shell leans on it — until both golden rows passed, the headline was
hard-capped at 0.50, so no amount of ux/devops polish could have reached the target. Every flip to
`pass` cites its proof (e.g. `detail = evidence:logic-goldens.txt#progress`), and each re-score
appends a hashed line to `score-log.tsv`.

At iteration 31 the cold-boot independent verify passes under `pass-rate --strict-evidence`,
coverage reports `REQ_COVERAGE: 1.00` / `DESIGN_COVERAGE: 1.00`, and
`score-build.sh bound iterations.tsv 40` prints `BOUND: OK used=31 max=40` — the run converges at
`pass_rate = 1.00`. Note iteration 21: an accessibility slice did not move the metric (axe still
flagged two issues), so it was reverted — the incumbent never got worse — and iteration 22 found
the slice that worked.

The app now lives in `build-output/taskflow/`, with a real Dockerfile, CI, migrations, `/healthz`,
`/metrics`, axe-clean accessible UI conforming to the Linear-style DESIGN.md, and authz tested by a
real browser flow.

### 13.3 Add a feature (the ratchet in action)

Later, you want task comments.

```
/forge:feature Feature: "task comments with @mentions" Target: build-output/taskflow
```

`feature` reads the incumbent (all the TaskFlow assertions are green — the floor), derives the
comment feature's delta acceptance, appends it as `fail`, and `pass_rate` over the union dips. The
loop drives the new rows green. Then the ratchet bites:

```
iter  slice                                 new_pass_rate  regression  status
3     comments table + POST/GET endpoints   0.40           STABLE      keep
5     mention parsing                        0.55           STABLE      keep
7     comments UI panel                      0.70           UNSTABLE    discard  (broke tasks-crud e2e)
8     comments UI panel (scoped re-render)   0.85           STABLE      keep
11    a11y + design-conformance for panel    1.00           STABLE      keep
```

Iteration 7 is the whole point: a comments-panel change broke the existing "create task → see it"
e2e flow — an existing green went red. `regression` returned UNSTABLE, so the slice was
auto-reverted, *even though the comment feature itself was progressing*. Iteration 8 found a
non-breaking implementation. On convergence the comment assertions are folded into
`taskflow.spec.yaml` — permanent baseline.

### 13.4 Gate and ship

```
/forge:regression --chain ship
```

Regression confirms STABLE across all 8 dimensions; `ship` runs its 8 phases and **stops for your
approval** before doing anything irreversible.

---

## 14. Building large, complex systems

A single spec describes one app or service. Large systems are built by composing the same loop.

### 14.1 Decompose into specs

Use `/forge:requirements` once per bounded context / service. A SaaS might be:

```
evals/fullstack/
  taskflow-api.spec.yaml        # the core API + data
  taskflow-web.spec.yaml        # the web client
  taskflow-billing.spec.yaml    # billing service
  taskflow-notifications.spec.yaml
```

Each has its own six-dimension acceptance — with `logic` golden vectors wherever the service owns
business rules — and its own `DESIGN.md` reference (share one DESIGN.md across front-ends for
consistency).

### 14.2 Sequence by dependency

Build foundational services first (auth, data), then dependents. The order is a simple topological
sort of "service B needs service A's contract":

```
build taskflow-api        →  green baseline (the contract other services depend on)
build taskflow-web        →  consumes the API contract
build taskflow-billing    →  depends on auth + users
feature: notifications, exports, dashboards ...   (ratchet onto the relevant service)
```

### 14.3 Grow by features, never by rewrites

Once a service has a green baseline, *never* rebuild it greenfield to add capability — use
`/forge:feature`. The ratchet guarantees existing behavior survives, and the spec accretes a
complete, executable description of the system over time. This is the difference between a codebase
that compounds and one that rots.

### 14.4 Cross-service regression

Run `/forge:regression` at the system boundary (integration/e2e dimension) before shipping
any service, so a change in one service that breaks a consumer is caught as a green→red transition.

### 14.5 Let the orchestrator route

For a fuzzy, system-level goal, hand it to the bare orchestrator and let it classify and route:

```
/forge add team-level billing limits to TaskFlow
# → build-feature archetype → existing app → /forge:feature on taskflow-billing
```

---

## 15. Best-practice playbook

**Requirements**
- Answer the interview honestly; the cheapest decision is a question, the most expensive is a wrong
  assumption baked into a build.
- Push Won't-haves to out-of-scope explicitly — it keeps the spec (and the build) bounded.
- Prefer measurable NFRs ("p95 < 200ms", "WCAG 2.1 AA", "0 high CVEs") over vibes.
- Pin every computed business rule to `logic` golden vectors (exact `input → expected output`)
  during the interview — the logic gate is only as sharp as its rule matrix.

**Design**
- Pick a DESIGN.md early; consistency is far cheaper to start with than to retrofit.
- Reuse one DESIGN.md across all front-ends of a system.

**Build**
- Preflight with `bash scripts/doctor.sh --require-build` before the first build on a machine —
  gstack and docker are required to verify the `ux`/`devops` dimensions, and a missing tool blocks
  convergence; find out before iteration 1, not iteration 30.
- Start with a generous `Iterations:` for the first build (40+); features need fewer (20–25).
- Keep specs honest: if you cannot run a dimension in your environment (no Docker daemon, etc.),
  expect `skip` rows — and run the build on a host that can clear them before you call it shipped.
- Read `iterations.tsv` and run `/forge:evals` if progress stalls.

**Features**
- One feature per `feature` invocation. Resist bundling — the ratchet and the metric are clearest
  when the delta is small.
- Let the ratchet do its job; do not override a regression revert without understanding it.

**Across the board**
- Commit/branch discipline: the pipeline lives on `experiment:` commits; keep them on a feature
  branch and squash on merge.
- Ship only when `regression` is STABLE and `pass_rate` is at target — and remember `ship` is
  human-gated by design.

---

## 16. Failure modes and troubleshooting

Real builds hit real walls. The pipeline is built to surface them honestly rather than fake a green.

| Symptom | Cause | What the pipeline does / what to do |
|---|---|---|
| `pass_rate` stuck below 1.00 | a dimension has a genuine red | read the failing rows in `build-results.tsv`; the loop targets the lowest dimension. Run `/forge:evals`. |
| `pass_rate` pinned at exactly 0.50 | a `logic` golden row is still red — the logic gate cap | fix the domain engine first; only a fully green `logic` dimension lifts the cap. |
| a green row demoted `EVIDENCE-MISSING` | strict scoring found no `evidence:` file behind a `pass` row | re-run the verification, tee its output into `<run-dir>/evidence/`, set `detail = evidence:<relpath>`. |
| `PASS_RATE: 0.00` + `reason=no-results-tsv` | scorer called without an explicit TSV path | pass the path (or set `BUILD_RESULTS`) — the scorer never discovers results implicitly. |
| `BOUND: EXCEEDED` at convergence | more iterations used than the declared bound | the run may not report CONVERGED — stop as BOUNDED, or record a user-approved extension in `handoff.json`. |
| `skip` rows for docker/compose/migrations | Docker daemon not running | env limit, not a defect — `bash scripts/doctor.sh --require-build` catches it at Phase 0. Run on a host with Docker; specs validate, image just isn't built. |
| `skip` for SIGTERM/graceful shutdown | OS can't deliver the signal (e.g. Windows) | code is correct; verify on Linux/CI. |
| a11y dimension won't go green | chart/canvas/SVG widgets without names | mark decorative subtrees `inert` + provide a text/table alternative; re-run axe via `/browse`. |
| tests crash only in jsdom | a component needs real browser layout (e.g. charts) | mock the heavy lib in unit tests; verify the real thing in the `/browse` e2e phase. |
| bundle-size assertion fails | a heavy dependency in the main chunk | lazy-load it (dynamic import / code-split). |
| a feature slice keeps reverting | it breaks an existing green (UNSTABLE) | that is the ratchet working — find a non-breaking implementation. |
| metric output unparseable | verify command changed shape | the iteration is treated as a crash and reverted; fix the verify command. |

Crash recovery is built in: syntax errors are fixed without counting an iteration; runtime errors
get up to 3 fix attempts then are skipped; hangs are killed and reverted; the last good state is
always in git.

---

## 17. Safety and guardrails

The pipeline is autonomous but fenced:

- **Never deploys, pushes, or publishes.** Build + local verify only; `ship` is human-gated. This is
  an invariant across `build`, `feature`, and the orchestrator — the orchestrator never passes
  `--auto` to `ship`.
- **Writes only into the target.** `build` scaffolds into `build-output/<name>/` (or the declared
  `Scope:`); `feature` mutates only the `Target` app. The skill repo and unrelated trees are never
  touched.
- **Every derived shell command is safety-screened** via `scripts/orchestrate.sh screen-cmd` —
  blocking `rm -rf`, fork bombs, `curl|sh`, raw device writes, credential patterns, and more, before
  execution and again on resume from any persisted state.
- **Data-migration is hard-guarded.** Migrations run only against an ephemeral/allowlisted DB
  (`localhost`, `127.0.0.1`, a container hostname, or a `_test`/`_ci` database), forward-only by
  default. Anything else is refused.
- **No real secrets.** Throwaway dev credentials via environment only; never committed. Hardening
  asserts no hardcoded secrets and a clean dependency scan.
- **Session hooks** block reading `.env`/SSH keys/credentials, block dangerous git commands, and
  cap file size before shipping — on every session, not just during a command.

---

## 18. Reference: artifacts, schemas, cheat-sheet

### 18.1 Artifacts every run writes

| File | Written by | Purpose |
|---|---|---|
| `evals/fullstack/<name>.spec.yaml` | requirements | the acceptance contract (and the ratchet's growing record) |
| `build-results.tsv` | build / feature | per-assertion pass/fail/skip; reduced to `pass_rate` |
| `iterations.tsv` | build / feature | one row per iteration: change, pass_rate, delta, guard, keep/discard — the ledger `bound` checks |
| `<run-dir>/evidence/` | build / feature | raw verification outputs; every `pass` row's `evidence:` detail names its proof file here |
| `<run-dir>/score-log.tsv` | score-build.sh | hash-anchored audit trail: one line (UTC time, subcommand, file, sha256, headline) per scorer invocation |
| `handoff.json` | every command | chain bridge: version "2.3.1", source, status, metric, coverage, config, findings (and any approved `bound_extension`) |
| `forge/<cmd>-<YYMMDD>-<HHMM>/` | every command | the run's log directory |
| `DESIGN.md` | build / feature | committed design source in the built app |
| `regression/<date>-<slug>/` | regression | stability report + per-dimension detail |

### 18.2 Scorer contracts and where the scripts live

The mechanical gates ship inside `skills/forge/scripts/` wherever the skill is installed.
Commands resolve them in order: `${CLAUDE_PLUGIN_ROOT}/skills/forge` (installed plugin) →
`.claude/skills/forge` (project-local) → in this repo, plain `scripts/`. Preflight the
environment once with `bash scripts/doctor.sh --require-build` — gstack (`/browse`) and docker are
required to verify the `ux`/`devops` dimensions.

- `scripts/score-build.sh pass-rate [--strict-evidence] <results.tsv>` → `PASS_RATE: 0.NN` (stdout,
  one line; per-dimension breakdown + `logic_gate=PASS|CAPPED@0.50|n/a` on stderr). The TSV path is
  required (or `BUILD_RESULTS`) — there is no implicit discovery. `--strict-evidence` demotes
  unproven `pass` rows; every invocation is hash-logged to `score-log.tsv`.
- `scripts/score-build.sh coverage <results.tsv> <requirements.md>` → `REQ_COVERAGE: N.NN` +
  `DESIGN_COVERAGE: N.NN`; exit 0 only when both are 1.00 with no orphan traces.
- `scripts/score-build.sh bound <iterations.tsv> <max>` → `BOUND: OK|EXCEEDED|UNKNOWN`; `OK` is
  required to report CONVERGED.
- `scripts/score-build.sh rubric <build.md>` → `SCORE: N` (spec-quality grep rubric).
- `scripts/score-requirements.sh validate <spec.yaml>` → `VALIDATION: VALID|INVALID|ERROR` + dims
  (`REQUIRE_LOGIC=1` makes a gated `logic:` block mandatory for computational domains).
- `scripts/score-regression.sh verdict <results.tsv>` → `VERDICT: STABLE|UNSTABLE` + score, exit code.
- `bash scripts/doctor.sh [--require-build]` → CORE / BUILD / OPTIONAL tool report;
  `--require-build` fails when gstack or docker is missing.

### 18.3 Command cheat-sheet

```
# Preflight (once per machine)
bash scripts/doctor.sh --require-build      # gstack + docker required to verify ux/devops

# Idea → spec
/forge:requirements Brief: "<what you want>" [--chain build]

# New app
/forge:build Spec: evals/fullstack/<name>.spec.yaml [Design: <slug|file|url|generate>] [Iterations: N]
/forge:build Goal: "<prose>" Stack: "<hint>"

# Add a feature
/forge:feature Feature: "<capability>" Target: build-output/<app> [--chain regression]

# Gate + ship
/forge:regression [--predict --fix] [--chain ship]
/forge:ship [--dry-run | --checklist-only]

# Autonomous
/forge <plain-language goal>        # routes greenfield→build, existing→feature

# Inspect
/forge:evals [--file <results.tsv>]

# Score a ledger by hand (explicit TSV path — no implicit discovery)
bash scripts/score-build.sh pass-rate --strict-evidence <run-dir>/build-results.tsv
bash scripts/score-build.sh coverage <run-dir>/build-results.tsv requirements.md
bash scripts/score-build.sh bound <run-dir>/iterations.tsv 40
```

### 18.4 Universal flags

`Iterations: N` · `Iterations: unlimited` · `--evals` · `--evals-interval N` · `--chain <targets>` ·
`--<subcommand>` shorthand · `Guard: <cmd>` · `Target-rate: 0.NN`.

---

## 19. FAQ

**Q: Greenfield vs feature — which do I run?**
Greenfield (empty dir) → `build`. Existing app → `feature`. Or run the bare orchestrator and let it
route. `feature` auto-delegates to `build` if the target is empty.

**Q: Do I need a spec, or can I just describe it?**
Both. `build Goal: "..."` derives a spec on the fly; `requirements` produces a validated, reviewed
spec — preferred for anything you intend to ship or grow.

**Q: What if my environment can't run part of the acceptance (no Docker, etc.)?**
Run `bash scripts/doctor.sh --require-build` first — it fails fast when gstack or docker is missing,
since those verify the `ux`/`devops` dimensions. Rows you genuinely cannot run become `skip`
(excluded from the score, always reported). Run on a host that can clear them before you treat the
build as shippable. The pipeline never fakes a pass.

**Q: How is UI/UX actually graded, not just claimed?**
A committed DESIGN.md defines the tokens; `/browse` reads the live computed styles and asserts they
match (conformance), runs axe for accessibility, checks responsiveness, and drives the real user
flow. All mechanical.

**Q: What stops the agent from just claiming a row passed?**
The evidence contract. A `pass` row must cite its proof — `detail = evidence:<relpath>[#locator]`,
pointing at a real file of raw verification output in the run's `evidence/` store — and convergence
is scored with `pass-rate --strict-evidence`, which demotes any unproven pass. Every scorer run is
hash-logged to `score-log.tsv`, so the final ledger can be re-audited by a third party.

**Q: Why is my build stuck at exactly 0.50?**
A `logic` golden row is red. Business-rule vectors are must-pass and cap the headline at 0.50
(`LOGIC_GATE_CAP`) until every one is green — a complex domain cannot converge on stub math. Fix
the domain engine; the cap lifts on its own.

**Q: Will adding a feature break my app?**
Not silently. The hard non-regression ratchet auto-reverts any slice that turns an existing green
assertion red. The baseline only rises.

**Q: Does anything deploy automatically?**
No. Deployment is human-gated everywhere. `ship` prepares and stops for approval.

**Q: How big a system can this build?**
As large as you can decompose into specs. Build foundational services first, grow the rest by
features, gate at the system boundary with regression.

---

## 20. Glossary

- **Acceptance dimension** — one of `logic | functional | ux | devops | monitoring | hardening`;
  each has a weight and a set of assertions.
- **Golden vector (golden case)** — a business rule pinned to an exact `input → expected output`;
  the unit of the `logic` dimension.
- **Logic gate** — the must-pass rule for `logic` rows: while any is red, the headline pass-rate is
  capped at 0.50 (`LOGIC_GATE_CAP`).
- **`fullstack_pass_rate`** — the single mechanical metric in `[0,1]`; weighted average of dimension
  scores, renormalized over dimensions that ran, hard-capped at 0.50 while any `logic` row is red.
- **Incumbent** — the current best state (for greenfield, the last kept commit; for a feature, the
  whole working app + its passing acceptance).
- **Delta** — the new assertions a feature appends to the spec.
- **Ratchet** — the hard rule that no existing green assertion may go red; auto-reverts violating
  slices so quality compounds.
- **DESIGN.md** — the committed markdown design system (Google DESIGN.md spec) the UI is built from
  and verified against.
- **Guard** — a safety command that must always pass (e.g. the existing test suite).
- **Regression (green→red)** — the only thing counted as a regression; pre-existing reds, new tests,
  and flakes are excluded.
- **Skip** — an assertion not applicable / not runnable in this environment; excluded from the score
  and always reported.
- **Evidence store** — `<run-dir>/evidence/`, the raw verification outputs; a `pass` row must cite
  one via `evidence:<relpath>[#locator]`, and `--strict-evidence` demotes rows that cannot.
- **`score-log.tsv`** — the hash-anchored scorer audit trail: one line (timestamp, subcommand, file,
  sha256, headline) per invocation.
- **Bound** — the mechanical iteration-budget check (`score-build.sh bound iterations.tsv <N>`);
  `BOUND: OK` is required for CONVERGED, and exceeding it needs a user-approved extension recorded
  in the handoff.
- **handoff.json** — the structured bridge file that chains one command's output into the next.

---

*Build it as a loop. Measure it mechanically. Let failures revert and successes stack. That is how
you get a fully working software system — and keep it working as it grows.*
