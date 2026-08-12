---
name: autoresearch:requirements
description: "Turn raw client requirements into a validated SRS + a ready-to-run autoresearch:build spec via the standard requirements-engineering process"
argument-hint: "[Brief: <text|file>] [Name: <slug>] [Stack: <hint>] [--chain build]"
---

EXECUTE IMMEDIATELY.

The front end of the SDLC. Takes a client's full requirements (a brief, a transcript, a doc) and
runs the **standard requirements-engineering process** — elicitation → analysis → specification →
validation — then **generates the arguments for `/autoresearch:build`**: a validated
`evals/fullstack/<name>.spec.yaml` plus the exact build invocation. Output is documents and a spec,
never code. **Self-contained** — the full requirements-engineering process (elicitation → analysis →
specification → validation → generation) is defined below; no separate protocol file.

**Autoresearch first principle (single-pass form):** requirements is a single-pass dispatch — no
metric optimization loop — but it still obeys the principle. The interview iterates until
**saturation**, and the generated spec is released to `build` only when the **mechanical** `validate`
gate returns `VALID` — never on subjective judgment. Constraint (no assumptions) + mechanical gate +
bounded iteration, same as the core loop.

## Parse Arguments

- `Brief:` / `--brief` — the client requirements (inline text or a file path).
- `Name:` / `--name` — slug for the project + generated spec (derived from the brief if omitted).
- `Stack:` / `--stack` — preferred stack (asked/derived if omitted).
- `--chain build` — after generating + validating the spec, invoke `/autoresearch:build` with it.

## Interactive by design — NO assumptions

This command **interviews the user back-and-forth** to arrive at the final requirements. It does NOT
fill scope-defining gaps with assumptions. A one-line brief (e.g. "build a money app") is a starting
point, not the requirements — treat it as the first answer and keep asking until the picture is
complete and the user signs off. Proceed to specification ONLY after explicit user confirmation.

## Build a real product, not a demo (default stance)
The target is a **usable product a real user runs with their own data — not a seeded, read-only
demo.** Unless the user explicitly scopes a throwaway/prototype/game, every spec MUST treat these as
in-scope and elicit them (default them IN):
- **Durable persistence** — a real datastore wired end-to-end; data created in the UI **survives a
  restart**. An in-memory / seed-only store that resets is a demo, not a product.
- **Identity & accounts** — sign-up / sign-in; a **fresh account starts EMPTY** and creates its own data.
- **Management surface (full CRUD)** — users **create / edit / delete** the core entities through the
  UI, not just read a fixture list.
- **Settings** — account/profile settings (name, password, MFA) **and** org/workspace settings.
- **Onboarding** — the first-run path from empty → productive (create the first org / project /
  records). **Seeded data is for tests/fixtures only — never the app's only data path.**
"Demo data already there, nothing to create or manage, resets on restart" is the failure mode this
stance exists to prevent. (Pure games / static sites legitimately opt out — confirm with the user.)

---

## Phase 1 — Elicitation (iterative interview, until saturation)
Run a **multi-round** AskUserQuestion interview (same spirit as `probe` — interrogate until
saturation). Never assume on a scope-defining question — ask it.
- **Round 1 — frame:** who uses it + who it's for (scope), the core features they need, the data
  involved, and the money/scale shape. (≤4 questions.)
- **Round 2 — deepen:** based on Round 1, drill into auth/identity, data sensitivity & compliance,
  platforms (web/mobile/API), integrations, the **desired look & feel** (a `DESIGN.md` reference — a
  style from the getdesign.md catalog like `linear`/`stripe`, an existing site to match, or generate
  one), and any hard constraints (stack, budget, deadline).
- **Round 2 also — product surface (real product, not demo):** confirm durable **persistence**,
  **accounts + onboarding** (fresh account starts empty), the **CRUD management** surface for each core
  entity, and **settings** (account + org). Default these IN; only drop them if the user scopes a
  throwaway/game/static site.
- **Round 3+ — close gaps:** keep asking until no scope-defining question remains open. Surface
  ambiguities and conflicts back to the user and let them decide. Stop when the user confirms the
  picture is complete (saturation) — not before.
- Capture **stakeholders**, goals, explicit asks, and implicit needs from the answers (never invented).
- Each round: ONE AskUserQuestion call (batch its questions); always offer an "Other / not sure" path
  and a recommended default the user can accept — but the user, not the command, makes the call.

## Phase 2 — Analysis & Classification
- Split **functional requirements** (what the system does) from **non-functional requirements (NFRs)**
  (how well). Map each NFR to a build dimension:
  | NFR family | → build dimension |
  |---|---|
  | usability, accessibility, responsive | **ux** |
  | performance, observability, SLOs | **monitoring** |
  | security, privacy, compliance | **hardening** |
  | deployability, CI/CD, scaling, ops | **devops** |
  | behavior, data, app flows (CRUD, status codes) | **functional** |
  | **business-rule computations & invariants** (tax, payroll, pricing, double-entry, proration) | **logic** |
- Detect **ambiguities, conflicts, and scope creep** → take them BACK to the user (another round), do
  not resolve by assumption. Record **constraints**. Only client-confirmed defaults may be written down,
  labeled "confirmed with user" — never silent assumptions.
- **Prioritize with MoSCoW** (Must / Should / Could / Won't). "Won't" becomes out-of-scope.

## Phase 3 — Specification (write `requirements.md`)
Produce an SRS/PRD with:
- Overview + stakeholders + goals
- **User stories** in INVEST form: "As a <role>, I want <capability>, so that <benefit>"
- **Functional requirements** FR-1…FR-n (atomic, testable)
- **Product-completeness FRs (mandatory unless a confirmed throwaway/game/static site)** — explicit
  `FR-`s for **durable persistence**, **accounts + auth**, **full CRUD management** of each core entity
  (create/edit/delete, not read-only), **settings** (account + org), and **onboarding** (empty-state →
  first records). These exist so the build can't converge on a seeded read-only demo.
- **Non-functional requirements** NFR-1…NFR-n (measurable thresholds)
- **Logic spec (computational/stateful domains)** — for every business rule, the **rule matrix** as
  concrete data (tax brackets, contribution bands + caps, overtime/holiday multipliers, ledger
  invariants) **with source citations**, plus **golden vectors**: `input → exact expected output`,
  including boundary + interaction edge cases and one **end-to-end** case (e.g. attendance → full
  payslip). The falsifiable spec for the `logic` dimension — names + numbers, never "per current tables".
- **Logic diagrams (Mermaid)** — standard SRS models embedded in `requirements.md`: **ER**
  (`erDiagram`), **state machines** (`stateDiagram-v2`, e.g. payroll run
  `draft → calculated → approved → paid`), **sequence** (`sequenceDiagram`, the key flows), and
  **decision flowcharts** (`flowchart`, the branching rule logic). Tie them to correctness: **every
  state transition + every decision branch must map to a golden vector**, so the diagrams are the
  completeness checklist for the logic spec.
- **Constraints**, **assumptions**, **out-of-scope**
- **Stack & reuse constraints** — name the expected battle-tested packages for the solved problems in
  scope (validation, auth, money/date math, ORM, uploads) in the spec's `stack:` notes, so `build`
  adopts them instead of reinventing; hand-rolled code is reserved for the domain rules the `logic`
  golden vectors pin.
- **Acceptance criteria** per requirement in **Given/When/Then** form (mechanically verifiable)
- **Traceability**: every requirement → its acceptance criteria → the build dimension it maps to

## Phase 4 — Validation (explicit sign-off gate)
Play the full requirements back to the user (functional + NFRs + MoSCoW + out-of-scope) and get
**explicit sign-off** before generating anything. Check **complete, consistent, testable, feasible,
unambiguous** — every requirement verifiable and traced. If the user wants changes, loop back to
elicitation. Do NOT generate the spec until the user says the requirements are final.

## Phase 5 — Generate the build spec
Emit `evals/fullstack/<name>.spec.yaml` for `autoresearch:build`. Schema (consumed by `build` +
checked by `scripts/score-requirements.sh validate`):
```yaml
name: <slug>
summary: <one line>
stack: { language: <…>, framework: <…>, datastore: <…> }
design: { source: catalog|file|url|generate, ref: <slug/path/url> }   # build adopts as DESIGN.md
acceptance:
  logic:      [ { id, assert, weight, traces, gate } … ]  # golden cases: input→exact output; gate:true = must-pass
  functional: [ { id, assert, weight, traces } … ]        # incl anti-demo: persist-across-restart, fresh-empty, CRUD, settings
  ux:         [ { id, assert, weight, traces } … ]        # incl design-conformance (traces design:<group>)
  devops:     [ { id, assert, weight, traces } … ]
  monitoring: [ { id, assert, weight, traces } … ]
  hardening:  [ { id, assert, weight, traces } … ]        # SECURITY + PERFORMANCE layers
```
- `name`, `summary`, `stack` (chosen in analysis)
- `design:` — the chosen design reference from elicitation: `{ source: catalog|file|url|generate,
  ref: <slug/path/url> }`. `build` adopts this as the project's `DESIGN.md`. Omit/`generate` if none chosen.
- `acceptance:` block with **all six dimensions** — `logic`, `functional`, `ux`, `devops`,
  `monitoring`, `hardening` — each a list of `{id, assert, weight, traces}` derived directly from the
  acceptance criteria (Given/When/Then → a mechanical `assert`). Weight by MoSCoW (Must=2, Should=1).
  The **`logic` block** is one assertion per **golden vector** — `assert` states the exact
  `input → expected output` (e.g. "gross 30000 semi-monthly → SSS EE 675, withholding 1158.33, net …")
  so it is mechanically checkable; mark each `gate: true` (must-pass). **Required whenever the domain
  has business-rule computations**; omit only for pure-CRUD apps with no math. The **`functional`
  block MUST include anti-demo rows** (unless a confirmed throwaway): data created in the UI
  **persists across a restart**, a **fresh account/tenant starts empty** (no pre-seed), and each core
  entity has a working **create / edit / delete** path — a spec whose functional rows only *read*
  seeded data fails this bar. **Each assertion must EXERCISE its requirement at the right level**: pure
  computations → `logic` golden; **every user-facing FR (a workflow, an output, a screen) → a live
  `/browse` e2e assertion that drives the actual UI flow** (the run create→calculate→approve→pay
  workflow, file generate/download, CRUD, timesheets, leave, settings) — never just a unit test of an
  isolated function, since a generator/engine the UI never calls leaves the FR unbuilt. This is what
  lets `build`'s **requirement-satisfaction audit** confirm each goal/FR is *wired in*, not merely
  traced. The `ux` block MUST
  include a `design-conformance` assertion (the live UI matches the chosen `DESIGN.md` tokens). The
  **`hardening` block spans two layers** — **security** (secrets, headers, input validation,
  per-resource authZ, OWASP Top 10) and **performance** (p95 latency SLO, no N+1, pagination, caching,
  Core Web Vitals) — so a build is "safe to expose" only when it is also fast under load.
- **Validate (mechanical gate — loop until VALID):** run
  `scripts/score-requirements.sh validate evals/fullstack/<name>.spec.yaml` (resolve `scripts/…` to
  the shipped seam dir — first existing of `${CLAUDE_PLUGIN_ROOT}/skills/autoresearch/scripts/`,
  `.claude/skills/autoresearch/scripts/`, or repo `scripts/`; for a computational domain
  — payroll, accounting, POS, billing — run it with `REQUIRE_LOGIC=1` so a missing `logic` block is a
  hard failure). It MUST print `VALIDATION: VALID` (all five operational dimensions present + weighted;
  any declared `logic` block carries ≥1 `gate: true` golden row). If `INVALID`, fix the flagged
  dimension and re-run — repeat until VALID. The spec is handed to `build` only on the validator's VALID
  verdict, never on a subjective "looks complete" — the mechanical gate decides "done".

## Phase 6 — Emit build arguments + chain
Print the ready invocation:
```
/autoresearch:build Spec: evals/fullstack/<name>.spec.yaml Iterations: 40
```
Write handoff.json to the output dir (`autoresearch/requirements-{YYMMDD}-{HHMM}/`): version "2.3.1",
source "requirements", status COMPLETE, `spec` = generated spec path, config{name, stack}, traceability
summary. Schema: `references/handoff-schema.md`; after writing, `scripts/validate-handoff.sh
<run-dir>/handoff.json requirements` must print VALID.
If `--chain build` → invoke `/autoresearch:build` with the generated spec.

## Safety
Documents + spec only — no code, no deploy. **Never proceed on assumptions** — elicit interactively
and require the user's explicit sign-off before generating. Won't-haves stay out-of-scope. Deployment
downstream stays human-gated.

## Summary
Print: # functional reqs, # NFRs (by dimension), MoSCoW counts, generated spec path, validation verdict,
and the `/autoresearch:build` invocation. List unresolved assumptions as risks.
