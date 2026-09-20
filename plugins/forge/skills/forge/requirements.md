---
name: forge:requirements
description: "Show the client a plain-language understanding, assumptions and scenarios; refine them together into a validated SRS + forge:build spec"
argument-hint: "[Brief: <text|file>] [Name: <slug>] [Stack: <hint>] [--chain build]"
---

EXECUTE IMMEDIATELY.

The front end of the SDLC. Takes a client's brief, transcript or doc and runs
**understand → show assumptions and stories → correct together → select the stack on evidence →
specify → validate**, then **generates the arguments for `/forge:build`**: a validated
`evals/fullstack/<name>.spec.yaml` plus the exact build invocation. Output is documents and a spec,
never product code (throwaway elicitation mockups in the run dir are instruments, not product).

**Core premise: the client is the authority on their business and their taste, never on software
structure — and a raw interview captures only *stated* intent.** The expensive misses are the
must-be needs clients assume ("obviously it has refunds"), the taste they cannot verbalize, and the
domain rules neither party said out loud. The elicitation therefore follows
`references/elicitation-protocol.md`: an **initial client review before detailed questions**, domain
recon, **draft user stories and day-in-the-life scenarios** corrected by the owner, a **full
lifecycle + must-be (Kano) checklist**, an **artifact-reaction loop** for design intent, an
**ambiguity audit**, and a visible **provenance ledger** from the first reply through sign-off.

**AutoForge first principle (single-pass form):** requirements is a single-pass dispatch — no
metric optimization loop — but it still obeys the principle. The interview iterates until
**saturation**, and the generated spec is released to `build` only when the **mechanical** `validate`
gate returns `VALID` AND the owner has approved the latest review revision with zero open items.
The validator checks spec structure; it cannot establish owner understanding or approval.

## Parse Arguments

- `Brief:` / `--brief` — the client requirements (inline text or a file path).
- `Name:` / `--name` — slug for the project + generated spec (derived from the brief if omitted).
- `Stack:` / `--stack` — a preferred stack. It is a **candidate carrying a constraint,
  never a bypass**: Phase 2b still researches real alternatives with evidence and the owner still approves
  (`references/stack-selection-protocol.md` §1). "This is decided" → the owner-mandated path.
- `Assets: N|off` — attempt budget for scoped generation (default 12); inherit it into the build spec.
- `--chain build` — after generating + validating the spec, invoke `/forge:build` with it.

## Interactive by design — visible assumptions, never silent decisions

This command **shows a working diagnosis and refines it with the owner**. A one-line brief is enough
to draft an understanding, assumptions, stories and scenarios; missing facts stay visibly open.
Never promote an inference into a requirement without review. Use very simple words for the client,
including security, deployment and compliance decisions; explain their effects on daily work,
cost and risk. The owner corrects Forge's picture instead of having to invent a complete feature
list. Save a draft at any time; finalize requirements only after explicit approval of the current
playback. An earlier approval covers unchanged content, never new or changed scope.

## Build a real product, not a demo (default stance)
The target is a **usable product a real user runs with their own data — not a seeded, read-only
demo.** Surface the following as **visible recommended defaults, initially open**, with the cost
and effect of including or excluding each. They are not automatically in scope. Confirm relevant
product needs and record an explicit reason for exceptions (including a prototype/game/static
site, guest-only or single-user workflow):
- **Durable persistence** — a real datastore wired end-to-end; data created in the UI **survives a
  restart**. An in-memory / seed-only store that resets is a demo, not a product.
- **Identity & accounts** — sign-up / sign-in; a **fresh account starts EMPTY** and creates its own data.
- **Management surface (full CRUD)** — users **create / edit / delete** the core entities through the
  UI, not just read a fixture list.
- **Settings** — account/profile settings (name, password, MFA) **and** org/workspace settings.
- **Onboarding** — the first-run path from empty → productive (create the first org / project /
  records). **Seeded data is for tests/fixtures only — never the app's only data path.**
"Demo data already there, nothing to create or manage, resets on restart" is the failure mode this
stance exists to prevent. Do not force accounts, organizations or destructive deletion into a
workflow that does not need them; confirm the appropriate access and correction path instead.

---

## Phase 0 — First playback, then domain recon
Before detailed questions, create `forge/requirements-{YYMMDD}-{HHMM}/client-review.md` and present
the **draft understanding, all currently known assumptions and unknowns, user stories, and
step-by-step scenarios** in the conversation (protocol §0). Keep stable `A-n`, `US-n`, `SC-n` IDs.
Separate what the client said from what Forge inferred; include proposed defaults and exclusions.
Cover every lifecycle area in protocol §4, marking missing information open, and highlight the
highest-impact choices. This is a visible, revisable diagnosis, not an early technical SRS.

**Domain recon (research BEFORE the first detailed question):** one bounded pass on the stated domain — category
leaders, standard workflow vocabulary, and the **statutory/regulatory layer** (tax, receipts,
mandated discounts, retention, audit, accessibility law). Write the **domain brief** to the run dir:
table-stakes feature list for the category, domain glossary, regulatory checklist **with
citations**, date checked, jurisdiction/applicability and the 3–5 highest-risk questions. Update the
client review with discoveries. Research-derived needs remain proposals until reviewed; unknown
legal applicability stays open pending evidence and the responsible reviewer, never "compliant"
because the owner accepted a suggestion. Recommend defaults only when supported.

## Phase 1 — Elicitation (iterative interview, until saturation)
Run a **multi-round** interview per `references/elicitation-protocol.md`: start with corrections to
the first playback, then 1–3 related questions at a time using the available question tool or a short
conversational batch. Offer recommendations with consequences, and allow corrections or "I don't
know". Do not invent answers to factual questions or treat silence as acceptance.
After every answer, update `client-review.md` and show **what changed, affected stories/scenarios,
and remaining open items**. A changed assumption reopens affected decisions and flows for review;
retain unchanged confirmations. Preserve decision history and the review revision (protocol §2).
- **Round order (protocol §2):** vision & stakes (ladder every feature to its GOAL) → actors & roles
  (who may see/do/approve what) → **day-in-the-life walkthrough** → objects & lifecycle (create /
  states / edit-void-delete / correction path / retention per noun) → **money & rules** (exact
  rates, caps, boundaries, rounding — a **worked example per rule**, which becomes its golden
  vector) → design via artifacts → edges & elasticity (offline, concurrent edits, peak numbers,
  import from the old system) → delivery & life after launch → out-of-scope + MoSCoW.
- **User stories + day-in-the-life walkthrough (protocol §3): Forge drafts, owner corrects.** Start
  in Phase 0 for each known primary role, including owner/operator/support roles where relevant.
  Each story states who wants what and why; each scenario states the starting situation, numbered
  person-action → system-response steps, handoffs, saved result and notifications, plus a failure
  and recovery/correction path. Link assumptions to the steps they affect. Walk open to close, probing the
  **unhappy paths** (returns, fat-fingered entries, over/short drawer, dead internet mid-sale,
  absent approver), the **rhythms** (end-of-shift/day/month/year rituals), and the **paper** (every
  current physical artifact = a data model + report). Each walkthrough becomes a numbered scenario —
  later an SRS use case AND an e2e acceptance journey.
- **Must-be checklist (protocol §4):** disposition EVERY item — in / out / N-A-because — password
  reset, permissions, correction paths, search/filter, exports, receipts, audit trail,
  backup/restore, data import, empty states, offline, locale, pagination, the new-hire and
  someone-quit paths. Clients never state these because they assume them; silently absent =
  protocol violation. The product-surface proposals (persistence, accounts, management, settings,
  onboarding) need the same visible decisions; an excluded item retains its reason.
- **Full SDLC coverage (protocol §4):** purpose/scope/budget/feasibility; people/access; workflows
  and rules; UX/accessibility; data lifetime/import/export; integrations/technical constraints;
  testing/acceptance; environments/deployment/data migration/rollback; security/misuse;
  privacy/compliance/jurisdiction/evidence; reliability/backups/restore; monitoring/support;
  maintenance/handover; retirement/exit. Every concern has a linked assumption/decision, including
  non-applicability with a reason. Tell operational scenarios too: a bad release, a lost database,
  a staff member leaving, a support request and closing the service, where applicable. These are
  owner-visible questions about consequences, not hidden implementation defaults.
- **Security concern playback (protocol §4):** show concern → proposed protection → concrete check
  in the same client review. Identify private data, permissions, privileged actions, likely misuse,
  deployment exposure and the incident/recovery owner. Draft negative scenarios: another customer's
  record, a revoked session, a harmful upload/link, and failed recovery, where applicable. Use
  invented data; never collect real credentials. Keep security decisions linked to A-n / SC-n.
- **Game briefs:** add the facets from `references/game-assets-protocol.md` §5 — reference games
  (mechanics vs aesthetics separated), art direction + closest CC0 pack, session/scope shape,
  difficulty model, platforms + input (mobile touch elicited FIRST, never as a port), audio
  expectations, and the juice bar ("game feel" is a requirement — name it). Asset licensing and the
  size budget land in the spec's `hardening`/`devops` rows.
- **Artifact-reaction loop (protocol §5) for design intent:** show 3–5 named design directions and
  collect what they **dislike**; generate 2–3 **throwaway static HTML wireframes** of the 1–2
  highest-traffic screens in the run dir (THROWAWAY banner in-file, never reused by `build`),
  screenshot via Playwright, present the PNGs, capture reactions per screen. With native imagegen
  or a matching media MCP (`references/integrations-protocol.md` §1), ≤4 generated **moodboard images** (one per
  candidate direction, style-contract prompts, THROWAWAY — provenance rows still written) may join
  the wireframes as reaction artifacts. A client-shared **Figma link** is read through the design
  bridge (§2) and its key frames become reaction artifacts too. Outcome = the
  `DESIGN.md` source + density/navigation/states patterns, each traced to a client reaction —
  taste is captured by **selection and correction, never adjectives**.
- **Asset and motion brief** (design-protocol §3a, integrations-protocol §1): proactively consider
  a small, coherent set of real photos, illustrations or artworks for the primary entry/overview
  and appropriate content/empty states, even without an `Assets:` hint. Use the existing reaction
  loop to learn the preferred medium and subjects; inherit settled preferences instead of asking
  again. Keep dense work areas clear and record task-specific omissions. Record required/optional image slots,
  supplied brand files, the existing icon family, allowed sources, byte/attempt budgets, routes and
  loading/alt expectations. Elicit each meaningful interaction's trigger, duration, essentiality,
  reduced behavior and keyboard task outcome. Carry these into `assets/manifest.json` as a planning
  inventory in the run dir and into future acceptance rows. Optional moodboards use `asset-check.cjs
  select` with observed capabilities, prefer Codex-native raster tools, and retain copied files,
  prompts and receipts in the run dir. They are throwaway direction evidence, not approved product
  assets. `Assets: off` still permits planning, checked reuse, icons and code-native motion.
- **Round N — close gaps:** surface ambiguities and conflicts back to the client as closed-choice
  questions. **Saturation** = two consecutive rounds surface nothing scope-defining AND the must-be
  and full lifecycle checklists are dispositioned AND the client has reviewed the stories and
  scenarios (corrected them or explicitly said they are accurate). Unanswered rounds do not count.
- Capture **stakeholders**, goals and proposals in the visible assumptions ledger (protocol §0).
  Accepted requirements carry **provenance** (protocol §7): `stated` · `derived-domain` ·
  `default-confirmed`; an `open` item blocks sign-off. A proposed default is not `default-confirmed`.

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
  not resolve silently. Record **constraints**. Unconfirmed defaults stay in the visible draft
  ledger as open proposals, never final requirements. Carry owner-approved decisions into the
  analysis; any newly derived scope goes back into the review before acceptance.
- **Ambiguity audit (protocol §6, mechanical sweep of the draft):** adjective→**number** with a
  stated load model (a p95 without concurrency is not testable) · rule→**boundary** (inclusive?
  calendar or rolling window? behavior AT the edge, rounding mode) · workflow→**failure path** (who
  sees what on failure/timeout/double-submit) · every mutation→**correction path** · every
  list→**expected volume** · every integration→**contract + retry owner** · **pronoun test** (no
  ambiguous "the user"). Every hit goes back to the client as a closed-choice question — these are
  exactly the gaps a later `test` engagement would otherwise file as open SRS questions.
- **Prioritize with MoSCoW** (Must / Should / Could / Won't). "Won't" becomes out-of-scope.

## Phase 2b — Technology selection (evidence-based, owner-approved)
The stack is the build's biggest one-way door and it is **never chosen silently** — not from a
`Stack:` hint, not from the model's habit. Run `references/stack-selection-protocol.md` end to end
in `forge/requirements-{YYMMDD}-{HHMM}/stack/`; its release is decided by
`scripts/score-requirements.sh stack <dir>` → `STACK_DECISION: READY`, never by "looks reasonable".
- **Elicit first (protocol §2):** the usage model (requests/day, peak concurrency, storage, egress,
  region, growth), support horizon in years, the delivering **and** receiving/ops teams' skills,
  licence policy, compliance regime + data residency, existing hosting/systems the stack must fit,
  and the monthly budget ceiling — as `A-n` decisions in `client-review.md`. Refuse to score while
  any is open; a `?` cell is a work item, never a guess.
- **Candidates (protocol §3):** 3–5 whole stacks pinned to majors — the boring default for the
  archetype is always in and is the datum, an owner hint/mandate is always in, ≥1 comes from a
  different paradigm, no dummy alternatives, ≤1 innovation token per candidate.
- **Research the way `research` does (protocol §5):** `sources.tsv` / `claims.tsv` / `queries.tsv` /
  `evidence/S-*.md` with tiers, accessed dates and biases — deps.dev + OSV/GHSA (licence, advisories,
  Scorecard), endoflife.date (LTS vs horizon), registry stats (ordinal only), surveys (self-selected,
  context only), official release policies, price APIs under the owner's usage model, relicensing
  and governance history; vendor "X vs Y" pages are T4 and never a cell's sole source; TechEmpower
  is a frozen snapshot (archived 2026-03) at `low` only. Run the **disconfirmation pass per
  candidate** and log empty results too. Stop when every driver is answered for every candidate or
  two query rounds add nothing (scarcity note per gap).
- **Knock-out gates, then drivers (protocol §4):** licence policy · EOL outside the horizon ·
  maintained/not archived · zero unpatched reviewed advisories for the pinned major · platform,
  accessibility and compliance constraints — pass/fail before any scoring. Drivers = one refutable
  scenario per NFR-shaped concern (stimulus → response → threshold), weight H/M/L → 3/2/1 **locked as
  an `A-n` before scoring**, `traces` to NFR/FR/A/C ids, ISO 25010 families covered or `N-A-because`,
  plus reuse coverage and the harness's own delivery record / AI-proficiency (weighted, never a k.o.).
- **Score by Pugh convergence, not a bare weighted sum (protocol §6):** anchors fixed per driver,
  never relative to the other options; every cell cites `[S-nn]`; the weighted total is a labelled
  secondary view; run the sensitivity sweep (±1 weight · drop-a-driver · swap datum · unweighted) →
  `Robustness: robust | fragile — <what flips it>`; declare `Confidence: high | moderate | low`.
- **Write `stack-decision.md` (protocol §7 — MADR-shaped):** Y-statement, context, knock-out table,
  drivers, options, cited matrix, decision outcome, **pros and cons of the options (why not the
  others)**, consequences with `- Bad:`/`- Risk:` lines + mitigations + revisit triggers + exit path
  per one-way component, failure-mode checks (résumé-driven · microservice/polyglot envy ·
  innovation tokens · rewrite trap · LLM self-preference disclosed), disconfirmation log,
  **Confirmation** = the pre-registered spike build Phase 2 will run (hypotheses, load model,
  thresholds, ≥5 runs), and the "no good evidence exists for …" list the owner decides on judgment.
- **Owner approval (protocol §8) — the playback, in the client's words:** the Y-statement, the top-3
  drivers each with its evidence, the accepted downsides and risks, what the runner-up would give
  and cost, the money/hosting consequences under their usage model, reversibility and exit path,
  the robustness verdict in plain words, the judgment-call list, and the weights they may change.
  One `AskUserQuestion`: **approve** (`Approval: approved by owner — rev N (A-n), date,
  ledger:<hash>`, provenance `default-confirmed`) · **revise weights/criteria** (re-run, replay) ·
  **need more evidence / spike first** (`?` work item, replay) · **mandate another stack** → the
  owner-mandated path: same gates and matrix, the 18F questions answered, every negative
  consequence recorded, a one-paragraph premortem, knock-out failures recorded as accepted risk in
  the owner's words, `Approval: owner-mandated (A-n, date) … ledger:<hash>`, provenance `stated`.
  Set `Decision: O-n` to the option the owner selects (`Recommendation:` remains the researched
  recommendation), and set `Status: approved` or `owner-mandated` to match the answer. The approval
  **pins the ledgers and decision record**: use the `ledger:` hash printed by the gate's
  `approval-pin` diagnostic after the record is final, and write it only after the owner's answer.
  Editing either afterwards makes the gate BLOCKED until the playback runs again. Two-way-door
  components (UI kit, test runner, linter) get one Y-statement each and one bulk `A-n`.
- **Reopen on change:** a material change to a driver's NFR/constraint, a candidate added or
  removed, a changed weight, an edited ledger or a failed build spike supersedes the record
  (`Status: superseded by …`, a new record, playback again). Phase 4 sign-off and Phase 5 spec
  generation wait while the gate is not READY.
**Gate:** `scripts/score-requirements.sh stack <dir>` → `STACK_DECISION: READY`.
The gate prints each measured criterion and PASS/FAIL; follow protocol §7 for the record shape.

## Phase 3 — Specification (draft `requirements.md`)
Translate the reviewed flows into a draft SRS/PRD; Phase 4 approves the corresponding client
playback and finalizes this document. No new scope may enter through translation. Include:
- Overview + stakeholders + goals
- **Day-in-the-life scenarios** (the numbered walkthroughs from elicitation — the use-case set, each
  later an e2e acceptance journey), incl. the unhappy paths and periodic rituals they surfaced
- **User stories** in INVEST form: "As a <role>, I want <capability>, so that <benefit>"
- **Functional requirements** FR-1…FR-n (atomic, testable)
- **Product-completeness FRs (per the reviewed decisions and explicit exceptions)** — explicit
  `FR-`s for confirmed **durable persistence**, **accounts + auth**, **full CRUD management** of each core entity
  (create/edit/delete, not read-only), **settings** (account + org), and **onboarding** (empty-state →
  first records). These exist so the build can't converge on a seeded read-only demo.
- **Non-functional requirements** NFR-1…NFR-n (measurable thresholds)
- **Security requirements and threat model** — what needs protection, actors/trust boundaries,
  misuse scenarios, controls and owners. Use the applicable controls from
  `references/fullstack-hardening-checklist.md` and the versioned sources in
  `references/security-checklist.md`; cite selected ASVS requirement IDs, not a vague "OWASP pass".
  Each applicable control has a hardening assertion, expected denied/safe behavior, and evidence
  to collect; non-applicability has a reason. Separate proposed controls from verified protections.
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
- **Provenance appendix** — `client-review.md` revision and owner responses (final approval pending
  until Phase 4), every FR/NFR
  tagged `stated` / `derived-domain` / `default-confirmed`, linked A-n decisions and US-n/SC-n flows,
  plus the dispositioned full lifecycle + must-be checklist (in / out / N-A-because per item).
  Keep excluded/deferred items and their reasons outside the in-scope acceptance set.
- **Stack & reuse constraints** — the stack is the Phase 2b decision (`stack/stack-decision.md`,
  gate READY), summarised here as its Y-statement + the pinned majors + the accepted downsides, with
  a link to the record; name the expected battle-tested packages for the solved problems in scope
  (validation, auth, money/date math, ORM, uploads) in the spec's `stack:` notes, so `build`
  adopts them instead of reinventing; hand-rolled code is reserved for the domain rules the `logic`
  golden vectors pin. No stack claim enters the SRS that the record does not carry.
- **Acceptance criteria** per requirement in **Given/When/Then** form (mechanically verifiable)
- **Traceability**: reviewed assumption/decision → story/scenario where applicable → FR/NFR →
  acceptance criteria → build dimension. Operational NFRs may trace directly to an A-n decision.

## Phase 4 — Validation (playback in the client's language, then explicit sign-off)
Playback is **never the SRS document** (protocol §7). Present the latest `client-review.md` revision:
the understanding, complete assumptions/decisions, changes since the previous review, then (a) the stories and numbered
day-in-the-life scenarios re-told **with the system in place** ("Maria scans 3 items, the customer
shows an SC card, the screen shows ₱X because …"), (b) the wireframe screenshots, (c) the
worked-example table for every money rule, (d) the **derived-requirements list read back item by
item** — `derived-domain` provenance is where miscommunication lives, so each gets its own yes/no —
(e) the Won't/deferred list with consequences, (f) delivery, deployment, security/compliance,
operation and exit scenarios/decisions, and (g) the **stack decision** as approved in Phase 2b
(its Y-statement, accepted downsides and what would reopen it) — sign-off cannot proceed while
`score-requirements.sh stack` is not READY. Clients correct narratives and pictures far more reliably than clauses;
sign-off on the playback IS sign-off on the SRS. Check **complete, consistent, testable, feasible,
unambiguous** — every requirement verifiable, traced, and provenance-tagged with zero `open` items
or unresolved conflicts; all lifecycle concerns dispositioned and in-scope stories/scenarios reviewed.
Record explicit owner approval of this exact review revision, then finalize the SRS. Material changes
invalidate final approval until the affected playback is reviewed again; no need to re-ask unchanged decisions.
If the user wants changes, loop back to elicitation. Do NOT generate the spec until the user says
the requirements are final. Close with the **honesty clause** (protocol §8): the built app is the
best elicitation artifact there is — reactions to v1 land as issues on the tracker of record (the
project repo's GitHub issues, or Linear when the spec's `tracker:` arms it — integrations-protocol
§3) and re-enter through `feature`/`fix`; the goal here is that nothing *knowable today* is missing.
When Linear is the tracker, the signed-off SRS is also attached to the engagement's project as a
document.

## Phase 5 — Generate the build spec
Copy the approved `stack/` directory, including ledgers, reading notes, query log and the relevant
`client-review.md`, to tracked `evals/fullstack/<name>.stack/`; preserve the approved bytes.
Emit `evals/fullstack/<name>.spec.yaml` for `forge:build`. Schema (consumed by `build` +
checked by `scripts/score-requirements.sh validate`):
```yaml
name: <slug>
summary: <one line>
stack: { language: <…@major>, framework: <…@major>, datastore: <…>, hosting: <…>,
         decision: evals/fullstack/<name>.stack,           # tracked decision bundle — `stack` gate must be READY
         adr: docs/adr/0001-tech-stack/stack-decision.md }  # where build commits the bundle in the output repo
design: { source: catalog|file|url|generate, ref: <slug/path/url>, mode: operate|persuade|read|experience,
          dislikes: [ <reactions the client rejected> ] }   # build adopts as DESIGN.md via the direction protocol
                                                            # a Figma URL is source: url — build routes it through the design bridge
tracker: { record: github|linear, team: <team name> }       # optional; linear arms tracker sync (integrations-protocol §3)
assets: { budget: <N jobs|off>, manifest: <planning-manifest path> } # optional; default 12; copied/adopted into target by build
acceptance:
  logic:      [ { id, assert, weight, traces, gate } … ]  # golden cases: input→exact output; gate:true = must-pass
  functional: [ { id, assert, weight, traces } … ]        # incl anti-demo: persist-across-restart, fresh-empty, CRUD, settings
  ux:         [ { id, assert, weight, traces } … ]        # incl design-conformance (traces design:<group>)
  devops:     [ { id, assert, weight, traces } … ]
  monitoring: [ { id, assert, weight, traces } … ]
  hardening:  [ { id, assert, weight, traces } … ]        # SECURITY + PERFORMANCE layers
```
- `name`, `summary`, `stack` — the **Phase 2b decision**, never a hint copied through: every
  component pinned to a major, `decision:` pointing at the record dir (the `stack` gate re-runs on
  intake; the framework must match the selected `Decision:` option), `adr:` the path build
  commits it to. No `NEEDS CLARIFICATION` marker may remain in the block.
- `design:` — the chosen design reference from elicitation: `{ source: catalog|file|url|generate,
  ref: <slug/path/url>, mode, dislikes }`. `mode` is the app's default **visitor mode** (Operate for
  task UI, Persuade for a marketing surface — decided per surface, protocol §1 of
  `references/design-protocol.md`); `dislikes` are the directions/patterns the client rejected in the
  artifact-reaction loop (the direction protocol keeps them out). `build` adopts this as the project's
  `DESIGN.md` via `/forge:design system`. Omit/`generate` if none chosen.
- `acceptance:` block with **all six dimensions** — `logic`, `functional`, `ux`, `devops`,
  `monitoring`, `hardening` — each a list of `{id, assert, weight, traces}` derived directly from the
  acceptance criteria (Given/When/Then → a mechanical `assert`). Weight by MoSCoW (Must=2, Should=1).
  The **`logic` block** is one assertion per **golden vector** — `assert` states the exact
  `input → expected output` (e.g. "gross 30000 semi-monthly → SSS EE 675, withholding 1158.33, net …")
  so it is mechanically checkable; mark each `gate: true` (must-pass). **Required whenever the domain
  has business-rule computations**; omit only for pure-CRUD apps with no math. The **`functional`
  block MUST include the confirmed product-completeness rows** (respect recorded exceptions): data created in the UI
  **persists across a restart**, a **fresh account/tenant starts empty** (no pre-seed), and each core
  entity has a working **create / edit / delete** path — a spec whose functional rows only *read*
  seeded data fails this bar. **Each assertion must EXERCISE its requirement at the right level**: pure
  computations → `logic` golden; **every user-facing FR (a workflow, an output, a screen) → a live
  Playwright e2e assertion that drives the actual UI flow** (the run create→calculate→approve→pay
  workflow, file generate/download, CRUD, timesheets, leave, settings) — never just a unit test of an
  isolated function, since a generator/engine the UI never calls leaves the FR unbuilt. This is what
  lets `build`'s **requirement-satisfaction audit** confirm each goal/FR is *wired in*, not merely
  traced. The `ux` block MUST
  include a `design-conformance` assertion (the live UI matches the chosen `DESIGN.md` tokens) **and a
  `design-floor` assertion** (`scripts/score-design.sh scan` → `SLOP_GATE: PASS` on every primary route,
  tracing `design:floor`), plus the surface-archetype rows the product's screens require (dashboard,
  list+CRUD, form/wizard, POS, settings, auth, onboarding/empty — protocol §2). The
  **`hardening` block spans two layers** — **security** (secrets, headers, input validation,
  per-resource authZ, OWASP Top 10) and **performance** (p95 latency SLO, no N+1, pagination, caching,
  Core Web Vitals) — so a build is "safe to expose" only when it is also fast under load.
- Security assertions include the applicable negative scenarios from the reviewed threat model.
  Cross-user/tenant checks exercise direct API access, lists, downloads/exports and mutations;
  hiding a button is not authorization. Every security assertion joins the build's planned audit
  checks; it cannot disappear through `skip`, a lower weight or a lower Target-rate. Default the
  build/feature readiness threshold to High (or stricter): all planned checks must pass and no
  unresolved Critical/High finding may remain. Requirements plans this evidence; build produces it
  and runs `validate-handoff.sh ... build --require-pass` before reporting completion.
- For scoped assets/motion, add mechanical acceptance: `asset-check.cjs check <target>` for
  inventory/provenance and byte caps; `design-scan.cjs --assets <target>` for both motion profiles;
  browser image decoding/alt/loading and keyboard task outcomes in `ux` (motion traces
  `design:motion`); initial payload in `devops`; source/attribution in `hardening`. Required blocked
  slots remain failing build rows. A planning manifest may be incomplete: requirements validates
  the spec and traceability, while delivery checks run after build. Keep all existing workflow gates.
- **Validate (mechanical spec gate — loop until VALID):** run
  `scripts/score-requirements.sh validate evals/fullstack/<name>.spec.yaml` (resolve `scripts/…` to
  the shipped seam dir — first existing of `${CLAUDE_PLUGIN_ROOT}/skills/forge/scripts/`,
  `.claude/skills/forge/scripts/`, or repo `scripts/`; for a computational domain
  — payroll, accounting, POS, billing — run it with `REQUIRE_LOGIC=1` so a missing `logic` block is a
  hard failure). **Always run it with `REQUIRE_STACK_DECISION=1`** so a spec whose `stack.decision`
  is missing, BLOCKED (evidence or approval missing/stale) or still carries `NEEDS CLARIFICATION` is
  INVALID. It MUST print `VALIDATION: VALID` (all five operational dimensions present + weighted;
  any declared `logic` block carries ≥1 `gate: true` golden row; `stack_decision=ready`). If `INVALID`, fix the flagged
  dimension and re-run — repeat until VALID. The spec is handed to `build` only on the validator's VALID
  verdict AND the current owner-approved review. Fixing syntax needs no new interview; changing
  scope, a rule or an expected outcome returns to playback. VALID alone does not authorize handoff.

## Phase 6 — Emit build arguments + chain
Print the ready invocation:
```
/forge:build Spec: evals/fullstack/<name>.spec.yaml Iterations: 40
```
Write handoff.json to the output dir (`forge/requirements-{YYMMDD}-{HHMM}/`): version "3.1.0",
source "requirements", status COMPLETE, `spec` = generated spec path, config{name, stack,
stack_decision: <tracked decision-directory path>},
traceability summary. Schema: `references/handoff-schema.md`; after writing, `scripts/validate-handoff.sh
<run-dir>/handoff.json requirements` must print VALID.
Only emit COMPLETE, ready build arguments or `--chain build` after both the current owner approval
and VALID spec gate. If input is still needed, save the draft review and open items; do not label
the requirements complete or chain. Include the review path/revision in the traceability summary.

## Safety
Documents + spec only — no product code, no deploy. Throwaway wireframes may be static HTML in
the run dir, THROWAWAY-bannered, never copied into the build scope.
When the owner requests a spike before choosing a stack, a disposable feasibility experiment in
`<run-dir>/stack/spike/` may resolve that named uncertainty. Record the result, then replay the
decision; this exception does not authorize product scaffolding or a deployment.
Optional moodboard rasters and their planning manifest/prompts/receipts also stay in the run dir;
they are direction evidence, never automatically approved product assets.
**Never proceed on unconfirmed assumptions** — expose them immediately, refine the linked stories
and scenarios, and require the user's explicit sign-off before finalizing. Won't-haves stay
out-of-scope. Deployment downstream stays human-gated.

## Summary
Lead with the plain-language agreed scope, key decisions/exclusions and how the system will be used
and run. Link the approved client review and SRS. Then print: # functional reqs, # NFRs (by dimension), MoSCoW counts, **provenance counts (stated /
derived-domain / default-confirmed — zero open)**, must-be checklist disposition tally, # scenarios +
# wireframes reacted to, **the stack decision** (`STACK_DECISION` verdict, the recommended option's
Y-statement, confidence + robustness, # candidates / # drivers / # sources by tier, the approval line
— `approved` or `owner-mandated`, never "chosen by Forge"), generated spec path, validation verdict,
and the `/forge:build` invocation. Open assumptions mean the draft is unfinished; list them with the next needed answer,
never as risks attached to a COMPLETE handoff.
