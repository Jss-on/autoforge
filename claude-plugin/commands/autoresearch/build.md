---
name: autoresearch:build
description: "Build greenfield full-stack software via the standard SDLC — plan → feasibility → requirements → design (incl UI/UX) → implement → comprehensive test → deploy → operate/maintain, every phase gated with its named deliverable — to passing weighted acceptance"
argument-hint: "[Spec: <file|glob>] [Goal: <text>] [Scope: <glob>] [Stack: <hint>] [Iterations: N] [--evals] [--chain <targets>]"
---

EXECUTE IMMEDIATELY.

Greenfield full-stack builder that follows the **standard software-engineering lifecycle** (the
ISO/IEC 12207-backed phase model: planning → feasibility → requirements → design → implementation →
testing → deployment → operations/maintenance), not a one-shot scaffold. Every phase exits through a
gate carrying its **named deliverable** (project charter, feasibility verdict, SRS + RTM, HLD/LLD +
`DESIGN.md`, source + CI, test plan/summary, release notes + user manual, runbook) — kept
**agile-right-sized**: just-enough living artifacts, never phase-gate tomes. This is the dedicated
command the orchestrator hands `build-feature` greenfield scope to. "Done" is **passing acceptance across six weighted dimensions** —
**logic 0.30** · functional 0.30 · **ux 0.20** · devops 0.15 · monitoring 0.15 · hardening 0.20 — measured
by `scripts/score-build.sh pass-rate`. **`logic` is first-class for complex, multi-rule domains**
(payroll, accounting, POS): business-rule computations are pinned to **golden cases** (exact
`input → expected output`) and are **must-pass** — while any `logic` row is red the pass-rate is
**capped at 0.50**, so a build can never ride ux/devops polish to "done" with wrong math. UI/UX is also
first-class: a working-but-ugly or inaccessible app is capped, never shipped as "done". A **seed-only
demo** — pre-seeded read-only data with no create/persist path, or a store that resets on restart — is
likewise **not "done"**: a real product runs on the user's **own, durably-persisted data** (accounts,
full CRUD, settings, onboarding from an empty state), not fixtures. **Done also
requires full coverage** — every PRD requirement (`FR-`/`NFR-`) and every `DESIGN.md` token group
traces to ≥1 acceptance assertion (`scripts/score-build.sh coverage`), so a green pass-rate can never
hide an unbuilt requirement. **Coverage is necessary but not sufficient — every requirement must also be
EXERCISED at the right level.** The logic dimension's **wired-in rule generalizes to all user-facing
FRs** (a workflow, an output, a screen): a FR is satisfied only by a **live Playwright e2e that drives it
through the running app** — a generator / engine / unit test never called from the UI does **not**
satisfy it ("defined but never called"). Before convergence, a **requirement-satisfaction audit**
re-reads `requirements.md` and confirms every **goal (G-n) + FR + NFR** is genuinely met by such an
exercise — not merely traced. **Self-contained** — the SDLC phase-gate table + principles are folded in
at the end of this doc. Companion contracts: `references/uiux-checklist.md`,
`references/fullstack-hardening-checklist.md`.

## Seam & reference resolution (read once, applies to every `scripts/…` and `references/…` mention)

The mechanical gates (`score-build.sh`, `score-requirements.sh`, `score-regression.sh`,
`orchestrate.sh`, `doctor.sh`) ship in `skills/autoresearch/scripts/` and the companion contracts in
`skills/autoresearch/references/`, wherever this skill is installed. Resolve `AR_ROOT` to the FIRST
that exists, then read every `scripts/<x>` below as `$AR_ROOT/scripts/<x>` and every
`references/<x>` as `$AR_ROOT/references/<x>`:
1. `${CLAUDE_PLUGIN_ROOT}/skills/autoresearch` — installed Claude Code plugin.
2. `.claude/skills/autoresearch` — project-local install (or this repo's canonical tree).
3. The directory containing this command file — OpenCode/Codex merged layouts.
4. Last resort: glob `**/skills/autoresearch/scripts/score-build.sh` and take its grandparent.
If nothing resolves, STOP and tell the user to reinstall (`bash scripts/install.sh`) — the gates are
mechanical requirements of this pipeline, not optional helpers. Run `bash $AR_ROOT/scripts/doctor.sh
--require-build` once at Phase 0: a missing Playwright/docker means the ux/devops dimensions cannot be
verified, which blocks convergence later — surface that now, not at iteration 30.

## Output repository — every build lives on GitHub (transparency contract)

Every project this command builds gets its **own private GitHub repository** under the
authenticated `gh` account, created in Phase 0 right after the local `git init`:
`gh repo create <account>/<slug> --private` (slug = the spec/scope name; `Repo:` argument
overrides). Then wire `origin` and push. This is non-optional plumbing, not shipping: the full
GitHub lifecycle — Actions CI, PRs, issues, code review, merge conflicts, releases/pre-releases —
must be exercisable on the ACTUAL output, so the client/owner can inspect what was built in a
transparent, standard way. A generated `ci.yml` that never executes on GitHub is theater — the
devops dimension's CI assertion is only satisfiable by a **workflow run on the output repo**.

Cadence:
- **Push at every phase gate** (minimum) and at every green milestone — CI runs accumulate as
  evidence alongside `evidence/`.
- **Branch + PR for feature-scale slices** once main is green; the PR's CI check is part of the
  verify step. Small inner-loop experiment commits may push straight to the working branch.
- **PRs merge themselves** (`gh pr merge --squash --delete-branch`, preferring `--auto`) once every
  CI check is green, the branch is `MERGEABLE`, and the diff stays inside Scope with no secrets —
  the loop does its own repo chores. Then confirm the base branch's own CI run is green; a
  PR-green/main-red split re-opens the loop. Blocked by branch protection or a required review →
  say so and leave it open (the owner's rule stands). `--no-merge` opts out. Merging is not
  deploying: `ship` stays human-gated.
- **Found-but-deferred defects become GitHub issues** on the output repo (label `autoforge`),
  not lost notes in the summary.
- **Releases are `ship`'s job** (human-gated): tag + `gh release create` (`--prerelease` until
  acceptance is fully converged). `build` never tags releases on its own.
- Record the repo URL in `handoff.json` (`repo` field) and in the run summary.
The repo stays **private** and its visibility is never changed by the loop. If `gh` is
unauthenticated, say so and continue local-only — do not silently skip the contract.

## Reuse before build (efficiency principle)

For every already-solved problem — input validation, auth/JWT/TOTP, password hashing, money/decimal
and date math, ORM + migrations, file upload/storage, rate limiting, logging — **prefer the stack's
battle-tested package over hand-rolled code** (e.g. zod, jose, otplib, bcrypt, decimal.js, Prisma).
Check the ecosystem registry (npm/PyPI/crates.io) before writing any utility module. Hand-roll ONLY
the domain layer the `logic` golden vectors own — tax/payroll/pricing/ledger business rules are the
product; primitives are not. A hand-rolled implementation of a solved problem is a defect, not
diligence: it adds untested surface that the hardening dimension must then re-verify from zero.
Record each major library choice with a one-line rationale in the HLD (Phase 4 deliverable).

## Asset-heavy targets (games, media-heavy apps)
When the spec is a game or the target bundles significant assets (sprites, models, audio, fonts,
large datasets), follow `references/game-assets-protocol.md` from Phase 1 on. Non-negotiables:
**sourcing ladder** (CC0 packs → procedural/code-generated → CC-BY with rendered attribution; never
unlicensed/ripped assets) with a **license ledger** (`assets/CREDITS.md`, one hardening row asserts
it covers every asset file); **size discipline** (no file ≥ 50 MB in git, runtime formats only —
WebP/OGG/GLB/WOFF2, initial-payload budget as a mechanical `devops` row, LFS declared BEFORE the
first large commit when needed); **determinism seams built in from slice one** (seeded RNG, a
`window.__game` test API, a pure headless rules engine carrying the `logic` golden vectors —
canvas is opaque to Playwright, so the game must expose its own truth); and the **game edition of
anti-demo**: progress persists across reload, first-run teaches, settings save — a game that resets
everything on refresh is still a demo.

## Parse Arguments

Extract from $ARGUMENTS:
- `Spec:` / `--spec` — eval spec file/glob (`evals/fullstack/*.spec.yaml`). Declares stack + acceptance.
- `Goal:` / `--goal` — free-text product description when no spec file is given (a PRD is derived).
- `Scope:` / `--scope` — directory the build may write into (default: a fresh subdir, never the skill repo).
- `Stack:` / `--stack` — stack hint (e.g. `node+postgres+react`).
- `Design:` / `--design` — DESIGN.md source: a catalog slug (getdesign.md / `awesome-design-md`,
  e.g. `linear`), a file path, a URL, or `generate`. Default: the spec's `design:` block, else generate.
- `Iterations:` / `--iterations` — default 40. "unlimited" for unbounded.
- `Target-rate:` — pass-rate to stop at (default 1.00).
- `--evals`, `--evals-interval N`, `--chain <targets>`, `--<subcommand>`

## Setup (if required context missing)

If neither Spec nor Goal is provided, AskUserQuestion (single batch):
  Q1 (What): "What should I build?" — open text
  Q2 (Stack): node+postgres+react, python+fastapi+postgres, your call, let me choose
  Q3 (UX bar): full WCAG AA + design system, basic responsive, minimal
  Q4 (Launch): build until passing acceptance (bounded 40), unlimited, dry-run
If a spec file is provided → derive everything from it and skip setup.

## Precondition Checks

git repo exists, working tree clean (or target is an isolated subdir), no detached HEAD. Resolve the
build target dir. **Never scaffold into the autoresearch skill tree** — build into the declared Scope
or a fresh `build-output/<name>/`. Fail fast on a dirty unrelated tree.

---

# The SDLC Pipeline (phase-gated)

The **standard eight SDLC phases**, each with an **exit gate**; the loop does not advance until the
gate passes. Phases map onto the autoresearch subcommands so each reuses a proven bounded loop.
**Standard phases, agile execution (hybrid):** the iteration loop re-slices the phases so every slice
touches requirements → test at small scale; deliverables are kept but **right-sized** — just-enough,
just-in-time living documents; **working software is the primary measure of progress** (the pass-rate,
not document completion, is the metric), and the convergence criteria are the **Definition of Done**.
Full gate criteria + principles: the **Phase-gate protocol** section at the end of this doc.

## Phase 1 — Planning / Initiation
Define what is being built, why, and how — before any requirement is enumerated. Produce the
**Project Charter** (`charter.md`, agile-right-sized to ~1 page): objectives + product vision (the
elevator pitch), explicit **in/out scope** lists, stakeholders/ICP, the **iteration budget** (the
`Iterations:` bound is the schedule/budget analog), constraints (stack hints, compliance), and a
**risk register** (top technical + domain risks, each with a mitigation). Reuse `plan` to convert the
Goal into a validated Scope / Metric / Direction / Verify config; `predict` personas flag delivery
risks early. When a Spec file or a `requirements` handoff already covers an item, derive the charter
from it instead of re-asking.
**Gate:** `charter.md` committed with objectives, in/out scope, iteration budget, and ≥3 risks with
mitigations; build target dir resolved (never the skill repo).

## Phase 2 — Feasibility
A lightweight **go/no-go spike**, not a study (the agile adaptation of the Feasibility Study /
Business Case): prove the build can succeed in THIS environment before iterations are committed.
- **Technical** — the toolchain boots: runtime + package manager resolve, DB/docker reachable (or a
  fallback picked), a hello-world of the target stack compiles and runs.
- **Operational** — ports free, throwaway dev creds obtainable via env, Playwright available for e2e.
- **Schedule** — acceptance-row estimate vs the iteration budget (a 200-row rule matrix does not fit
  10 iterations); surface the mismatch now, not at iteration 39.
- **Legal/licensing** — direct dependencies carry permissive licenses (no copyleft surprise).
**Gate:** verdict recorded in `charter.md` as **GO** (chosen stack pinned) or **NO-GO** →
AskUserQuestion to re-scope/re-stack. Never enter Phase 3 on an unproven toolchain.

## Phase 3 — Requirements Analysis
Turn the Spec/Goal into a concrete **SRS/PRD** + an enumerated **acceptance** list (every assertion tagged
with a dimension + weight). Give every PRD requirement a **stable ID** — `FR-n` (functional) / `NFR-n`
(non-functional), per the `requirements` command's SRS/spec rules. **Seed the `logic` dimension from the
spec's `logic:` block** — one acceptance row per **golden case** (a concrete `input → expected output`
for a business rule: a tax bracket, a contribution band/cap, an overtime multiplier, a ledger
invariant), each must-pass. Reuse `probe` / `predict` to interrogate ambiguity and **enumerate the
rule matrix + edge cases** (boundary + interaction cases — ceiling snaps, proration, compound
multipliers, rounding — each become more golden rows). Every acceptance row carries a **`traces`**
field (TSV col 7) naming the requirement ID(s) it satisfies — **no requirement without an assertion,
no assertion without a requirement**.
**Gate:** `requirements.md` written (the SRS — IEEE 830 / ISO 29148-shaped via the `requirements`
command's rules); acceptance rows seeded into `build-results.tsv` as `fail` (baseline) **with `traces`
filled** — the `traces` column + coverage report IS the **Requirements Traceability Matrix (RTM)**;
full traceability — `scripts/score-build.sh coverage build-results.tsv requirements.md` reports
`REQ_COVERAGE: 1.00` (every `FR-`/`NFR-` traced; an orphan requirement or an assertion tracing to
nothing = gate FAIL). Baseline metric:
`scripts/score-build.sh pass-rate build-results.tsv` → expect `0.00`.

## Phase 4 — Design (HLD + LLD + UI/UX + data)
Design the system **and** the interface before coding:
- **HLD (high-level design)** — modules, data model, API contract, data flow, dependency boundaries
  (repository pattern), tech stack.
- **LLD — domain model (logic-heavy apps)** — identify bounded contexts and a **pure, side-effect-free
  calculation engine** (tax / contribution / ledger / pricing rules) separate from the app shell.
  Write the **rule matrix** — tables, formulas, multipliers, caps — with source citations; this is
  what the `logic` golden cases assert. The **state machines + decision flowcharts from requirements**
  drive the engine's control flow — implement one transition/branch at a time, each with its golden
  case. The engine is implemented and golden-tested before any UI.
- **Database design** — the concrete schema/ER + a forward-only migration plan derived from the
  domain model.
- **Adopt a `DESIGN.md`** — the canonical design source (Google DESIGN.md spec). Resolve in order:
  the `Design:` arg → the spec's `design:` block → else **generate** one (derive tokens + component
  states from the product's needs and write them straight into `DESIGN.md`). Sources: a **catalog** slug from getdesign.md / `awesome-design-md`
  (e.g. `linear`, `stripe`), a **file**, a **URL**, or **generate**. Copy the chosen one to the project
  root as `DESIGN.md`.
- **Tokens FROM DESIGN.md** — translate its typography scale, color palette (with contrast targets),
  spacing, radius, motion, and component states (loading / empty / error / success) into the app's
  style tokens. The UI is built from these tokens, never improvised. Per `references/uiux-checklist.md`.
**Gate:** `DESIGN.md` committed + design tokens derived from it; full design traceability —
`scripts/score-build.sh coverage` reports `DESIGN_COVERAGE: 1.00`, i.e. every DESIGN.md token group
(`design:type` · `design:color` · `design:spacing` · `design:radius` · `design:motion` ·
`design:states`) is traced by ≥1 `ux` acceptance row (orphan token = gate FAIL). (Reuse `reason` to
pick between options.)

## Phase 5 — Implementation (TDD)
Build in a **red → green** TDD ladder, one slice per iteration. Pick the lowest-scoring dimension
first — **but the gating `logic` dimension is attacked before ops/UX polish** while it has red rows,
since the pass-rate is capped at 0.50 until every golden case is green. Order within a build:
1. **Scaffold** — skeleton, dependency manifest, linter/formatter, test runner.
2. **Logic (domain engine first)** — implement the **pure, dependency-free calculation engine** and
   drive **every `logic` golden case** red → green against its exact expected output. Then add one
   **end-to-end golden case** that runs real input through the live app path and asserts the same
   number — this proves the engine is **wired in**, catching "function defined but never called" (the
   classic multi-rule failure). The engine is green before the functional shell leans on it.
3. **Functional (real product, not a demo)** — wire the app to the **real datastore end-to-end**
   (UI → API → DB + migrations); data created in the UI **persists** (survives a restart). Build the
   **full CRUD** surface (create / edit / delete) for each core entity, **accounts + auth**, **settings**
   (account + org), and **onboarding** so a **fresh account/tenant starts EMPTY** and creates its own
   data. Seeded rows are **fixtures for tests only — never the app's only data path** (an in-memory /
   seed-only store that resets is a demo, not a product). Frontend wired to the design system → tests green.
4. **DevOps** — multi-stage **Dockerfile** (non-root, `HEALTHCHECK`), compose/IaC, CI (lint+test+build+dep-scan),
   forward-only migrations, `SIGTERM` graceful shutdown, env config + `.env.example`.
5. **Monitoring** — `/healthz`, `/readyz`, `/metrics` (Prometheus), structured JSON logs, trace/correlation IDs.
6. **UX** — implement the design system; responsive layouts; **accessibility** (WCAG 2.1 AA: labels,
   contrast, keyboard nav, focus order, aria); the four component states.
7. **Hardening (security + performance layers)** —
   - **Security layer** — no hardcoded **secret**s; security headers (CSP/HSTS/X-CTO/X-Frame); input
     validation at the boundary; authN + **per-resource** authZ (no IDOR); CSRF + SSRF guards;
     rate-limiting; dependency scan clean; secrets redacted from logs; TLS-ready. Reuse
     `/autoresearch:security` for an **OWASP Top 10** pass (`references/security-checklist.md`).
   - **Performance layer** — meet the **p95 latency SLO under expected load** (load test: k6 /
     autocannon / locust); **no N+1** (JOIN/batch); every collection endpoint **paginated + bounded**
     (`LIMIT`/cursor); indexes on hot filter/join/sort columns; **caching** on expensive reads with
     correct invalidation; response compression; frontend **bundle budget + Core Web Vitals**
     (LCP/CLS/INP) measured via Playwright.
A floor-guard keeps scaffolding commits that compile and add no failures but pass zero assertions.

## Defect Loop — Debugging (cross-phase, runs inside Phases 5–6)
On any failing assertion, run a systematic root-cause loop (reuse `debug`): hypothesize → test →
falsify → fix. **Iron law: no fix without an identified root cause** — never patch a symptom. Each
defect gets a minimal record (symptom → falsified hypotheses → root cause → fix commit) — the
IEEE-829-style incident report, right-sized to its `iterations.tsv` line.

## Phase 6 — Testing (comprehensive: the test pyramid)
"Tests pass" is not enough — the suite must be **comprehensive**:
- **Golden oracle (domain logic)** — the pure engine computes **every golden vector's exact expected
  output** across the rule matrix and its edge/boundary/interaction cases (ceiling snaps, proration,
  compound multipliers, rounding). At least one **end-to-end** golden case drives real input through
  the running app and asserts the same number, proving the engine is wired into the live flow. Maps to
  the gating `logic` dimension — all golden cases must be green to lift the 0.50 cap.
- **Unit** — pure logic, repos, middleware, validators.
- **Integration** — API endpoints against the real router + a test repo (supertest / httpx).
- **Real-product (anti-demo)** — a record **created through the UI persists across a restart** (durable
  store, not in-memory); a **fresh account/tenant starts empty** (no pre-seed); each core entity's
  **create / edit / delete** round-trips; **settings** save. An app that only renders seeded, read-only
  data fails this layer.
- **e2e (end-to-end)** — drive the running app in a real browser with **Playwright** (headless
  Chromium, installed as a project devDependency so CI runs the same suite): the primary user flow
  must actually work click-by-click.
- **Accessibility** — run **axe** against rendered pages via Playwright; zero serious/critical violations.
- **Visual** — screenshot the primary views; flag layout/contrast/slop regressions.
- **DESIGN.md conformance** — Playwright reads computed styles and asserts color / type scale / spacing
  match the committed `DESIGN.md` tokens; flag off-system ("slop") values. Then run a **screenshot
  self-review pass** — read the captured views back and fix visual inconsistency, hierarchy and slop,
  re-verifying with fresh screenshots.
- **Performance** — run a **load test** (k6 / autocannon / locust) asserting the p95 latency SLO and
  **zero N+1** on the primary flows; check frontend bundle budget + Core Web Vitals via Playwright.
- **Security** — an **OWASP Top 10** pass (reuse `/autoresearch:security`): headers, input validation,
  per-resource authZ, secret-scan, and dependency-scan all clean.
- **Coverage** — unit+integration coverage ≥ the project floor (default 80%).
Deliverables, right-sized per IEEE 829's intent: the **Test Plan** is the acceptance TSV + this
pyramid (scope, approach, item pass/fail criteria); **test cases** are the executable suites;
**defect reports** are the Defect Loop's records; the **Test Summary Report** is the final
per-dimension breakdown (written into `evals-summary.md` / the Summary).
**Gate:** every layer green; coverage ≥ floor; e2e + axe clean; UI conforms to `DESIGN.md`.

## Phase 7 — Deployment
Write the release deliverables, then hand to `autoresearch:ship` (8-phase: checklist → dry-run →
deploy → verify) then a canary check:
- **Deployment/Release plan** — ship's checklist: steps, environments, env vars, rollback.
- **Release Notes** (`RELEASE_NOTES.md`) — features, fixes, known issues for stakeholders/users.
- **User manual** — a user-facing quickstart (in `README.md` or `docs/`): first-run onboarding, the
  primary workflows, settings.
**Deployment is human-gated** — `build` never deploys to production, tags releases, or publishes on
its own (pushing to the private output repo per the "Output repository" contract is standard-loop, not
deployment).

## Phase 8 — Operations / Maintenance
The SDLC is a **cycle** — maintenance feeds back into planning. Build's share is docs + wiring (build
never operates prod):
- **Runbook** (`RUNBOOK.md`) — boot/stop commands, the health (`/healthz`, `/readyz`) + `/metrics`
  endpoints to watch, datastore backup/restore, common failures → fixes, log locations +
  correlation-ID usage. Every command/endpoint named in it is **verified against the running app**.
- **Change-request path** — post-release changes are new work items: `feature` (delta acceptance +
  the hard non-regression ratchet), `fix` (error burn-down), `improve` (ICP research → PRDs) — each
  re-enters this pipeline with the shipped acceptance baseline as the regression floor.
**Gate:** `RUNBOOK.md` committed with verified commands/endpoints; release notes + user manual
current; maintenance path recorded in the handoff.

---

## Iteration Loop — the autoresearch first principle
The SDLC phases above are *executed as an autoresearch loop*: a **mechanical metric**
(`fullstack_pass_rate`) driven up by **bounded, atomic, auto-reverting** iterations with **git as
memory**. The phases say *what* to build; this loop is *how* every change is made and judged. Each
iteration:

1. **Read before write** — read `build-results.tsv` + `git log`/`git diff` of recent `experiment:`
   commits to see what's been tried, what worked, what regressed; pick the lowest-scoring dimension
   that still has red rows — **but while any `logic` (golden) row is red, fix it first**: the headline
   pass-rate is capped at 0.50 until the `logic` dimension is 100% green, so logic is the only
   dimension that lifts the ceiling.
2. **One change** — make ONE focused slice (atomic; if it breaks, you know exactly which change did it).
3. **Commit before verify** — `git commit -m "experiment: <dimension> — <slice>"` BEFORE measuring, so
   every attempt is recoverable. Git is the experiment ledger.
4. **Verify mechanically (run it, don't self-report) — and leave evidence.** Build, boot, probe
   endpoints, run the test pyramid + Playwright e2e/axe; **tee every verification's raw output into
   `<run-dir>/evidence/`** (test-runner stdout with exit code, probe responses, Playwright screenshot
   paths, axe reports — one file per suite/probe, e.g. `evidence/unit-tests.txt`,
   `evidence/e2e-checkout.txt`). A row may only be flipped to `pass` with its `detail` column set to
   `evidence:<relpath>[#locator]` naming the file that proves it. Then recompute
   `scripts/score-build.sh pass-rate --strict-evidence` — strict mode **demotes any `pass` row whose
   evidence file does not exist**, and every scorer invocation is auto-logged (timestamp + TSV content
   hash) to `<run-dir>/score-log.tsv`. No subjective "looks good" — only the metric + guard decide,
   and the metric only believes rows it can check.
5. **Keep or roll back automatically** —
   - **keep** — pass-rate increased AND guard (existing tests) green.
   - **keep (scaffold)** — floor-guarded scaffold slice that compiles and adds no new failures.
   - **simplicity wins** — equal pass-rate with less code → keep the simpler version.
   - **discard** — pass-rate flat/lower, a green assertion went red, or build/probe crashed →
     `git revert HEAD --no-edit`. Failures revert instantly; the incumbent is never left worse.
6. **Log** — append the iteration (change, pass_rate, delta, guard, keep/discard) to `iterations.tsv`.
7. **Repeat** until (`pass-rate --strict-evidence >= Target-rate` **AND** `logic_gate == PASS` **AND**
   `REQ_COVERAGE == 1.00` **AND** `DESIGN_COVERAGE == 1.00` **AND** the requirement-satisfaction audit
   passes **AND** `scripts/score-build.sh bound iterations.tsv <N>` prints `BOUND: OK`) or the bound
   (`Iterations: N`, default 40) is reached — **bounded by default**; `Iterations: unlimited` opts out.
   The bound is itself mechanical: `BOUND: EXCEEDED` means the run may NOT report CONVERGED — either
   stop as BOUNDED, or ask the user for an explicit extension and record their approval + the new bound
   in `handoff.json` (`bound_extension`). The cap makes the logic gate mechanical:
   a `Target-rate` of 1.00 is unreachable while any golden case is red, so a complex domain cannot
   converge "done" on stub math. A green pass-rate with coverage < 1.00 is **not** done — an unmapped
   requirement/token is unbuilt work, so add the missing assertion and keep going. When stuck, re-read
   git history and combine near-misses before trying a bigger change.

**Independent verify before convergence:** before declaring DONE at `Target-rate`, re-run acceptance on
a fresh boot (cold container, clean DB) — a held-out check separate from the inner-loop signal — to
prevent overfitting a flaky pass. High-impact slices set `pending_verify`; route a verify pass
(`reason`/`predict`) before convergence.

**Requirement-satisfaction audit (mandatory before DONE):** re-read `requirements.md` and walk **every
goal (G-n) + FR + NFR**, confirming the LIVE app satisfies each via the *right* exercise — `logic`
golden for computations; a **live Playwright e2e for every user-facing FR** (the run create→calculate→
approve→pay workflow, file generate/download, CRUD, timesheets, leave, settings, onboarding); real-DB
integration for persistence; the `hardening` checks for each NFR. A requirement met **only** by an
isolated unit/generator test, where the FR implies a user-facing workflow or output, is **UNSATISFIED**
("defined but never called") — add the e2e acceptance row, build the missing UI/wiring, and keep
going. Convergence is blocked until **no FR is engine-only** and every goal is exercised end-to-end. A
sub-requirement that is built-but-not-applied (e.g. an encryption helper that no write path calls) fails
its NFR.

## Coverage — every requirement + token is built (no orphans)
Pass-rate alone can read `1.00` while a PRD line or a design token was never turned into an assertion.
Two **structural** gates close that gap — both mechanical counts (not judgement), computed by
`scripts/score-build.sh coverage build-results.tsv requirements.md`:
- **`REQ_COVERAGE`** = (`FR-`/`NFR-` IDs in `requirements.md` named by ≥1 row's `traces`) ÷ (total
  `FR-`/`NFR-` IDs). Must be `1.00` from the Phase 3 gate onward.
- **`DESIGN_COVERAGE`** = (DESIGN.md token groups traced by ≥1 `ux` row) ÷ (total groups). Must be
  `1.00` from the Phase 4 gate onward.
- **`traces` column** (TSV col 7, comma-separated `FR-n`/`NFR-n`/`design:<group>`; the `detail` col may
  be empty but the tab must be present) — every acceptance row names what it satisfies. The reverse is
  enforced too: a trace pointing to a requirement/token that does not exist is an **invented** assertion
  (`orphan_traces`) and fails the gate — delete or re-point it.

Convergence (DONE) requires `pass-rate --strict-evidence >= Target-rate` **and** both coverages
`== 1.00` **and** `BOUND: OK` **and** the requirement-satisfaction audit — every goal/FR/NFR exercised
end-to-end in the live app, **no user-facing FR satisfied by an engine/unit test alone**. The evidence
store closes the loop: the final `<run-dir>` must contain `evidence/` (raw verification outputs),
`score-log.tsv` (hashed scorer invocations), `build-results.tsv`, and `iterations.tsv` — a third party
can re-run the scorer on the stored ledger and check every pass row's evidence file. This is what makes
"satisfy all PRD + design requirements" mechanical rather than a matter of opinion.

## Safety Invariants
- **Never deploy to production, publish packages, or make a repo public.** Those stay human-gated
  (`ship`). Pushing to the project's **own private output repo** (created in Phase 0, below) is NOT
  publishing — it is part of the standard loop and is how the generated CI actually runs.
- **Build into the declared Scope only** — never mutate the skill repo or unrelated trees.
- Every derived shell command is safety-screened via `scripts/orchestrate.sh screen-cmd`. DB URLs obey
  the anchored localhost/_test allowlist. No real secrets — throwaway dev creds via env, never committed.

## Summary
Print: final pass-rate, **logic_gate (PASS|CAPPED)**, **REQ_COVERAGE + DESIGN_COVERAGE**, per-dimension
scores (incl **logic** + **ux**), assertions green/total, **requirement-satisfaction audit verdict**,
phases completed (of the 8 SDLC phases), iterations used, kept vs discarded slices, build output
path, and a **deliverables checklist** (charter · SRS + RTM · HLD/LLD + `DESIGN.md` · test summary ·
release notes · user manual · runbook — each present/missing). List still-red
assertions — **golden/`logic` failures first** — and any untraced requirements/tokens **plus any FR
satisfied engine-only (audit gaps)** as remaining work.

## Eval Checkpoint (--evals flag)
Interval: floor(max_iterations / 3), min 1 (fixed 10 if unbounded; override `--evals-interval N`). Every
interval, print pass-rate trend + per-dimension breakdown (F/ux/D/M/H). Plateau across 3+ checkpoints →
recommend a spec/stack/design rethink. At loop end → `evals-summary.md` in the output directory.

## Chain Handoff
Write handoff.json: version "2.4.0", source "build", timestamp, status
(COMPLETE|BOUNDED|CONVERGED|BLOCKED|USER_INTERRUPT|ERROR), results_tsv, metric (fullstack_pass_rate),
coverage{requirements, design}, phases_completed, findings = remaining red assertions + untraced
requirements/tokens, config{spec, scope, stack, target_rate}.
The handoff shape is the chain contract — `references/handoff-schema.md`. After writing it, run
`scripts/validate-handoff.sh <run-dir>/handoff.json build`; on `INVALID`, fix the handoff before
printing the summary — a run with an invalid handoff is NOT finished.
Invoke next target in --chain order (commonly `regression` then `ship`). Propagate --evals.

---

# Phase-gate protocol (canonical)

The build follows the **standard software-engineering lifecycle** (ISO/IEC 12207 lineage; the
widely-taught 8-phase model). Each phase has an **exit gate** and a **named deliverable**; the loop
does not advance until the gate's criteria are met. Phases reuse existing autoresearch subcommands so
each is a proven bounded loop. Deliverables follow the agile adaptation — just-enough, just-in-time,
living — never heavyweight documents for their own sake.

| # | Phase | Reuses | Key deliverables | Exit gate (must all pass) |
|---|---|---|---|---|
| 1 | **Planning / Initiation** | `plan`, `predict` | **Project charter** (`charter.md`): vision, in/out scope, stakeholders/ICP, iteration budget, risk register | charter committed with objectives, in/out scope, iteration budget, ≥3 risks + mitigations; build target dir resolved (never the skill repo) |
| 2 | **Feasibility** | — | **Feasibility verdict** in `charter.md` (spike results: technical, operational, schedule, licensing) | toolchain spike boots (runtime + DB/docker + Playwright); acceptance-size vs iteration budget sane; licenses permissive; verdict **GO** with stack pinned (NO-GO → re-scope with the user) |
| 3 | **Requirements Analysis** | `probe`, `predict` | **SRS** (`requirements.md`, IEEE 830 / ISO 29148-shaped) + **RTM** (the `traces` column + coverage report) | every requirement carries a stable `FR-`/`NFR-` ID; **for logic-heavy domains, logic diagrams (ER + state machines + sequence + decision flowcharts) with every state transition / decision branch mapped to a golden vector**; every acceptance assertion enumerated + tagged `dimension`+`weight`+`traces`; `REQ_COVERAGE == 1.00` (every ID traced, no orphan assertion); baseline `build-results.tsv` seeded (`fail`) → pass-rate `0.00` |
| 4 | **Design** | `reason` | **HLD** (architecture) + **LLD** (domain engine + rule matrix, diagrams) + **DB schema** + **UI/UX system** (`DESIGN.md` + tokens + wireframes) | `DESIGN.md` (architecture: modules, data model, API contract; **for logic-heavy domains, a pure calculation engine + the rule matrix with citations**) **and** UI/UX design system (tokens: type, color+contrast, spacing, motion, component states, wireframes) committed; `DESIGN_COVERAGE == 1.00` (every token group traced by ≥1 `ux` assertion) |
| 5 | **Implementation** | TDD ladder | **Source code + build artifacts + CI** (lint, tests, container) | domain engine built first and **every `logic` golden case green** (incl one end-to-end case proving it is wired in); each accepted slice turns a red assertion green; guard green; no green→red regression; the app is wired to a **real persisted datastore** (UI→API→DB) with full CRUD + accounts + settings + onboarding (**fresh account starts empty**), not a seed-only/in-memory demo; headline pass-rate stays capped at 0.50 until the `logic` gate clears |
| ‡ | **Defect loop (debugging — cross-phase, inside 5–6)** | `debug` | **Defect records** (symptom → root cause → fix, in `iterations.tsv`) | every failing assertion traced to a **root cause** before a fix lands (iron law: no symptom patches) |
| 6 | **Testing** | — | **Test plan** (acceptance TSV + pyramid) + **test cases** (suites) + **Test summary report** (`evals-summary.md`) | test pyramid green: **golden oracle (every rule-matrix vector + edge cases, incl end-to-end)** + unit + integration + e2e (Playwright) + accessibility (axe) + visual + **load/perf (p95 SLO, no N+1)** + **security (OWASP Top 10)** + **real-product (anti-demo): a UI-created record persists across a restart, a fresh account starts empty, CRUD + settings round-trip**; **requirement-satisfaction audit — every goal/FR/NFR exercised end-to-end in the live app, no user-facing FR met by an engine/unit test alone**; coverage ≥ floor (80%) |
| 7 | **Deployment** | `ship` | **Deployment/release plan** + **Release notes** (`RELEASE_NOTES.md`) + **user manual** (quickstart) | checklist → dry-run → deploy → verify + canary — **human-gated**, never automatic |
| 8 | **Operations / Maintenance** | `feature`, `fix`, `improve` | **Runbook** (`RUNBOOK.md`) + **change-request path** (handoff to feature/fix/improve) | runbook committed with commands/endpoints **verified against the running app**; maintenance path in handoff — the cycle feeds back into planning |

## Principles
- **Gates are hard by default.** A phase that fails its gate blocks the next; the loop iterates within
  the failing phase (its own bounded sub-loop) until the gate clears or the budget is hit.
  `--soft-gates` downgrades a blocking gate to advisory.
- **Plan before requirements.** Phases 1–2 make scope, risks, and feasibility explicit before the
  acceptance list is enumerated — a build that can't boot its toolchain or fit its iteration budget
  fails in the cheap spike, not at iteration 39.
- **Requirements precede code.** No implementation slice runs before the Phase 3 acceptance list exists
  — the list IS the metric's denominator.
- **Deliverables kept, right-sized.** Every standard SDLC deliverable exists — charter, feasibility
  verdict, SRS + RTM, HLD/LLD, `DESIGN.md`, test plan/summary, release notes, user manual, runbook —
  as a just-enough, just-in-time **living** artifact. Working software stays the primary measure of
  progress; a document never substitutes for the metric.
- **Full coverage, no orphans.** Every PRD requirement (`FR-`/`NFR-`) and every `DESIGN.md` token group
  traces to ≥1 acceptance assertion, and every assertion traces back to a real requirement/token;
  `REQ_COVERAGE` + `DESIGN_COVERAGE` must be `1.00` before convergence.
- **Real product, not a demo.** Unless the user scoped a throwaway / prototype / game / static site,
  the app runs on the user's **own, durably-persisted data**: a real datastore wired end-to-end
  (UI-created data survives a restart), accounts + auth, full CRUD of core entities, settings, and
  onboarding from an **empty** state. Seeded data is fixtures-for-tests only — a read-only, seed-only
  app that resets on restart is not a product and does not converge.
- **Wired-in, end-to-end (every requirement).** The logic dimension's "defined but never called" guard
  generalizes to all requirements: a user-facing FR is satisfied only by a **live Playwright e2e** that
  drives it through the running app, and an NFR only when its control is **applied** (an encryption
  helper that no write path calls does not satisfy "encrypt at rest"). Coverage (every FR *traced*) is
  necessary; *exercised* is sufficient. The pre-convergence **requirement-satisfaction audit** re-reads
  `requirements.md` and walks every goal/FR/NFR — no FR converges as engine-only.
- **Domain logic precedes the app shell.** For computational domains, a pure side-effect-free engine is
  built and **golden-tested before** the data/API/UI lean on it — names + numbers from a cited rule
  matrix, not improvised. This makes the `logic` dimension measurable.
- **Business rules are golden-tested and gated.** Each rule is pinned to golden cases
  (`input → exact output`) + boundary/interaction edge cases + one end-to-end case (catching "defined
  but never called"). `logic` is **must-pass**: the headline pass-rate is capped at 0.50 until every
  golden case is green, so a complex domain cannot converge "done" on shallow or disconnected math.
- **Design precedes UI code.** The design system (tokens + states) is committed before frontend slices,
  so UX is built to a spec. This makes the `ux` dimension measurable.
- **Root cause before fix.** The defect loop forbids symptom patching; a fix references the falsified
  hypothesis.
- **Comprehensive ≠ "tests pass".** Phase 6 requires the whole pyramid (unit→integration→e2e→a11y→visual),
  not just unit green. e2e + a11y run against the *running* app via Playwright.
- **Deployment is human-gated.** Phase 7 reuses `ship`; `build` never deploys to production or cuts
  releases on its own — pushes to the private output repo are the standard loop, everything beyond is `ship`'s.
- **Maintenance closes the cycle.** Phase 8 documents operations (runbook) and routes change requests
  to `feature`/`fix`/`improve` with the shipped acceptance baseline as the regression floor —
  maintenance feeds back into planning.

## Mapping to the metric
Phases 5–6 (with the cross-phase defect loop) drive `fullstack_pass_rate` (logic + functional + ux +
devops + monitoring + hardening). The
**`logic` dimension is gated** — while any business-rule golden case is red the pass-rate is capped at
0.50, so domain correctness is a precondition for convergence, not a tradeable component. Phases 1–4
produce the artifacts (`charter.md` incl the feasibility verdict, `requirements.md` incl the rule
matrix + golden vectors, `DESIGN.md`, tokens)
the rubric + gates check; Phases 7–8 are post-convergence + human-gated. Convergence also requires
`logic_gate == PASS`, `REQ_COVERAGE == 1.00`, and `DESIGN_COVERAGE == 1.00`. A run reports
`phases_completed`, `logic_gate`, `REQ_COVERAGE`, and `DESIGN_COVERAGE` in its handoff.
