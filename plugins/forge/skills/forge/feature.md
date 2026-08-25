---
name: forge:feature
description: "Add a feature to existing software via the forge loop — delta acceptance, a hard non-regression ratchet, conforming to the app's DESIGN.md"
argument-hint: "[Feature: <text>] [Target: <dir>] [Spec: <file>] [Iterations: N] [--chain <targets>]"
---

EXECUTE IMMEDIATELY.

The **brownfield** sibling of `build`. Software is an iteration process: `build` gets you to first-green;
`feature` continues the *same forge loop* on a **growing acceptance set** with a **hard
non-regression ratchet** — every feature stacks, nothing backslides (compounding gains). It modifies an
existing app, not a fresh repo. Loop engine + metric are shared with `build`
(`scripts/score-build.sh pass-rate`); the floor is `forge:regression`.

## Parse Arguments
- `Feature:` / `--feature` — what to add (a sentence or a brief).
- `Target:` / `--target` — the existing app directory (e.g. `build-output/money-tracker`).
- `Spec:` / `--spec` — the app's existing `evals/fullstack/<app>.spec.yaml` to extend (auto-detected from Target if omitted).
- `Iterations:` / `--iterations` — default 25. "unlimited" to opt out.
- `Target-rate:` — pass-rate to stop at (default 1.00). `--chain`, `--evals`.

## Autonomy — greenfield vs brownfield (decide, don't ask)
Inspect `Target`:
- **Empty / missing / no app** → this is greenfield → **hand to `forge:build`** (don't scaffold here).
- **Existing app present** → feature mode below.
This is also how the orchestrator routes the `build-feature` archetype: greenfield → `build`, existing
code → `feature`.

## Precondition
Git repo, clean working tree, on a branch (not detached). The incumbent app **builds + passes its
current acceptance** — confirm the baseline is green before adding to it (you cannot ratchet off a red
baseline). Read the app: source, `git log`, current `build-results.tsv`, and its **`DESIGN.md`**.

## Phase 1 — Requirements delta
Derive the feature's acceptance (reuse `requirements`/`probe`): new, mechanical assertions across the
**six** dimensions (**logic** + functional + **ux incl design-conformance** + devops + monitoring +
hardening), weighted by MoSCoW. **Any new business rule ships its `logic` golden vectors first** (exact
`input → expected output` rows) — the same 0.50 logic-gate cap from `build` applies to the union, so a
feature with wrong domain math cannot converge on polish. **Append** them to the app's spec +
`build-results.tsv` as new `fail` rows. Existing rows are untouched — they are the **regression
floor**. Re-baseline: `scripts/score-build.sh pass-rate` dips (new fails); that drop is the work to
recover.

## Phase 2 — Design delta
Extend **within the existing `DESIGN.md`** — reuse its tokens (color, type, spacing, components/states);
a feature inside an established surface inherits that surface’s visitor mode and world, never a new
identity (`references/design-protocol.md` §1/§3). Do NOT introduce a new design system; new UI must pass
`design-conformance` against the same DESIGN.md **and the craft floor**: run
`node scripts/design-scan.cjs --url <touched routes> --mode <mode> --design DESIGN.md` on every touched
route and keep `SLOP` at zero (a `design:floor` `ux` row in the delta) — no emoji icons, kickers, nested
cards, placeholder copy, off-token colors/faces. Missing tokens the feature genuinely needs are added to
`DESIGN.md` (re-lint: `scripts/score-design.sh lint`), never improvised inline. When the feature adds a
whole new surface archetype (a dashboard to a CRUD app), its required patterns (§2) join the delta rows,
and `design audit` runs on it before the ratchet.

## Phase 3 — Implement (the forge loop)
Per iteration, exactly as `build`:
1. **Read before write** — `git log`/`diff` of recent `experiment:` commits + `build-results.tsv`; pick
   the lowest-scoring *new* assertion.
2. **One change** — one atomic slice toward that assertion.
3. **Commit before verify** — `git commit -m "experiment: feature/<slice>"` (git is the ledger).
4. **Verify mechanically, leave evidence** — build/boot/probe + test pyramid + Playwright
   e2e/axe/conformance; tee raw outputs into `<run-dir>/evidence/`; a row flips to `pass` only with
   `detail` = `evidence:<relpath>` naming its proof file; recompute
   `scripts/score-build.sh pass-rate --strict-evidence` (unproven pass rows are demoted; invocations
   are hash-logged to `score-log.tsv`). Seam scripts + references resolve exactly as in `build`'s
   "Seam & reference resolution" section.

## GitHub flow (the output repo is the workbench)
The app's private output repo (`build` created it; if missing, create it now per `build`'s
"Output repository" section) is where this feature is visible end-to-end: work on a
`feat/<slug>` branch, push it, **open a PR** with the delta acceptance rows in the description,
let the repo's CI run, and merge only after Phase 4's ratchet is STABLE and CI is green. Deferred
findings become issues on that repo. Record the PR URL in `handoff.json`.

## Phase 4 — Regression ratchet (HARD gate)
Every iteration, after the feature verify, run the floor:
`scripts/score-regression.sh verdict <results.tsv>` (baseline = incumbent greens, candidate = now).
- **Any existing assertion green→red → auto-revert the slice** `git revert HEAD --no-edit`. No exceptions —
  a feature may never break what already worked. The baseline only rises.
- **keep** iff new-assertion pass-rate increased **AND** regression `STABLE` **AND** guard green.
- **simplicity wins**; **discard** otherwise (revert). Append the outcome to `iterations.tsv`.

## Phase 5 — Verify + Ratchet (convergence)
When the feature's assertions are green and `regression` is `STABLE`:
- **Independent verify** on a fresh boot (held-out) to avoid overfitting a flaky pass.
- **Ratchet**: fold the new assertions permanently into `evals/fullstack/<app>.spec.yaml` (they are now
  baseline). The next feature starts from this higher floor — compounding. Bounded by `Iterations`.

## Safety Invariants
- **Never deploy to production, publish packages, or make a repo public** — that stays human-gated
  (`ship`). Pushing the feature branch to the app's own private output repo and opening a PR is part
  of the standard loop (see "GitHub flow" below).
- **Mutate only the `Target` app** (its declared dir); git is the safety net — every slice is an
  `experiment:` commit, auto-reverted on regression. Never touch the skill repo or unrelated trees.
- Derived shell commands safety-screened via `scripts/orchestrate.sh screen-cmd`.

## Summary
Print: feature, baseline→final pass-rate (over the union), new assertions green/total, regression verdict
(must be STABLE), iterations, kept vs reverted slices, and confirmation the delta was ratcheted into the spec.

## Chain Handoff
Write handoff.json: version "3.1.0", source "feature", status
(COMPLETE|CONVERGED|BOUNDED|BLOCKED|USER_INTERRUPT|ERROR), results_tsv, metric (fullstack_pass_rate),
regression_verdict, findings = remaining red, config{feature, target, spec}. Schema:
`references/handoff-schema.md`; after writing, `scripts/validate-handoff.sh <run-dir>/handoff.json
feature` must print VALID before the summary. Chain commonly
`regression` → `ship` (human-gated). Propagate `--evals`.
