---
name: forge:migrate
description: "Migrate existing software between languages, frameworks or runtimes with a frozen behavior inventory, differential verification, target-only acceptance and an explicit cutover handoff"
argument-hint: "[Target: <dir>] [From: <stack>] [To: <stack>] [Scope: <paths>] [Guard: <cmd>] [Iterations: N] [--plan-only] [--resume <run>] [--chain <targets>]"
---

EXECUTE IMMEDIATELY.

Replace an existing implementation while preserving its required behavior. This is a complete
migration of the declared scope, including its tests, jobs, data compatibility, integrations,
packaging and operational configuration. Compilation or translated source alone is insufficient.
Accuracy is the completion criterion: the target must preserve the source's required observable
behavior on an independently reviewed corpus, including state changes and failure paths. A green
build, a happy-path demo, stubs or a self-reported parity percentage cannot satisfy this command.
Use `feature` for new product behavior, `build` for a new application, and the repository's normal
schema workflow for an isolated database migration. Do not route an existing system through
greenfield `build` or redesign its interface as a side effect.

## Resolve and parse

Bind `AR_ROOT` to the loaded skill directory (Claude plugin: `${CLAUDE_PLUGIN_ROOT}/skills/forge`,
local Claude: `.claude/skills/forge`). All `scripts/` and `references/` below are bundled resources.
Read `references/migration-protocol.md` and `references/acceptance-evidence.md` before writing.
Run bundled `doctor.sh`; use Git Bash for shell scripts on Windows. Screen derived commands with
`scripts/orchestrate.sh screen-cmd`. Read target AGENTS.md and repository conventions.

- `Target:` / `--target`: existing app, default current directory. Resolve its Git root as
  `PROJECT`; acceptance runs from that root, even for a monorepo subdirectory.
- `From:` / `--from`: incumbent language/framework and version, auto-detect and confirm from files.
- `To:` / `--to`: requested destination and version constraints. Infer from the user's request;
  ask when absent or materially ambiguous. Research official compatibility/migration documentation
  for the actual versions before choosing replacements. Record links and unsupported features.
- `Scope:` / `--scope`: paths/components to replace; default the complete Target application and
  the build, test and deployment files it depends on. Inventory shared consumers before editing.
  Explicit scope limits remain limits; identify necessary changes outside them before proceeding.
- `Guard:` / `--guard`: existing required checks, otherwise derive from repository CI.
- `Iterations:` / `--iterations`: 25 experiments by default, positive integer or explicit
  `unlimited`. A bound is a checkpoint, never permission to omit remaining migration work.
- `--plan-only`: inventory, baseline observations and migration plan in the run directory only;
  no application edits, branch switches, commits, installs or external mutations. Report BOUNDED with a plan-only
  reason. Do not claim migration completion.
- `--resume <run>`: load its pinned contract and iteration ledger; verify hashes, source identity,
  current branch and candidate changes before continuing. Recheck changed/stale evidence.
- `--chain <targets>`, `--evals`: common Forge options. No implicit push, merge or production cutover.

## 1. Establish the source and the work boundary

Run `node scripts/host.cjs detect`; follow `references/host-protocol.md` for ownership, branch and
host conventions. For implementation work, use a migration branch. Preserve unrelated local edits: use an isolated
worktree when possible, or continue only in nonoverlapping paths; never stash/reset/discard others'
work. Final verification requires a clean repository, so use an isolated worktree before that
gate if unrelated changes remain; never require discarding or committing someone else's edits.
Record the exact committed source revision. If required source behavior exists only in
uncommitted changes, resolve that snapshot first instead of silently baselining an older commit.

Create `<PROJECT>/forge/migrate-<timestamp>/` (`RUN`) with `plan.md`, `inventory.json`, `checks.json`,
`acceptance-plan.json`, `results.tsv`, `iterations.tsv`, and `evidence/` as each becomes available.
Keep run files outside implementation commits using a local exclusion entry for this run;
resolve the exclusion file with `git rev-parse --git-path info/exclude` (worktrees may have a
`.git` file). For contributor repositories use the host protocol's local exclusion; do not change their
tracked ignore policy or send code/data to another host. Nonignored untracked implementation
blocks completion; commit all delivered files and verify from a fresh checkout.

Inspect routes, callers, dependency manifests/locks, schemas, jobs, integration adapters, CLI
entrypoints, tests, assets, CI, deployment and operational docs. Run the source's real baseline
using isolated fixtures and capture failures. Characterize undocumented behavior before changing
it. Missing services, credentials or a broken baseline stay visible; they are not passing tests.
Proceed with independent work, but unresolved required baseline behavior blocks completion.

## 2. Freeze what must survive

Write the source-to-target inventory and domain applicability using the protocol. Every source
capability is `migrate`, `retain`, or `remove`; retained/removed items need a specific reason, and
removing required behavior needs the user's existing or new explicit scope decision. Retaining the
replaced runtime inside the requested migration scope cannot satisfy a complete replacement.
Use inventory version 2. Pin scope roots from the requested Target and its supporting paths,
then enumerate the original Git tree under those roots. Every source entry must belong to an
inventory item or an explicit reviewed exclusion; never derive scope from just the files already
ported. Omitted workers, launchers and shared modules block completion. Exclusions cannot hide
requested behavior; symlink/submodule boundaries need explicit treatment.

Write `plan.md`: scope/exclusions, source/target versions, dependency equivalents and gaps,
behavioral differences, baseline findings, slice order, data transition, verification commands,
numeric performance budgets, deployment/cutover steps, rollback limits and completion criteria.
Show the plan and consequential assumptions. Proceed under the user's migration instruction;
ask only for a missing decision that materially changes behavior or scope. Do not add a blanket
approval pause. A requested plan-only run stops here.

Pin required acceptance checks for every inventory item and applicable domain. Use external
contract tests and source fixtures as the stable oracle across languages. Port a source-language
test harness where necessary without dropping check IDs, negative cases or expected semantics.
Baseline defects are documented; security defects or newly desired behavior use explicit expected
outcomes instead of reproducing a vulnerability to satisfy parity.

Before implementation, run the real source against a frozen case corpus. Map every migrated item
to normal and boundary/error cases; add failure, state, authorization, concurrency and integration
cases wherever those behaviors exist. Use `verification.cjs` to capture and validate the source
observation receipt, then freeze its exact stdout, corpus and receipt in the migration snapshot.
The protocol defines the `parity` record and JSON adapters. Each observation includes status,
data, errors and effects. Record real writes/events, not empty effect lists for convenience.
Without an executable source baseline, behavioral accuracy remains BLOCKED; do useful porting
work, but never invent expected output from the target implementation.

Copy the bundled `migration-parity.cjs` into the run directory and pin its bytes. The final parity
check must execute the target adapter on that same corpus and emit its actual observations.
The completion gate independently compares that receipt's stdout with the frozen source results.
A separate required self-test deliberately changes status, data, errors and effects for every
case; the same comparator must detect each specific mismatch. A crashed test is not a successful
negative control. Follow the exact executable contract in the protocol; generic green tests do
not substitute for either required check.

Snapshot with `acceptance.cjs` per the protocol, including `inventory.json`, `plan.md`, reviewed
fixtures and verifiers as immutable inputs. Preserve the approved digest outside candidate write
scope. Implementation and lockfiles belong in execution inputs, not frozen source hashes.
Keep previous required acceptance coverage; a changed runner needs a documented mapping and
independent review, not an unconditional reuse of source-runtime commands in target-only checks.

## 3. Migrate in vertical slices

Keep an immutable source worktree/artifact as the comparison oracle. Choose an in-place rewrite
for a small isolated component or a temporary side-by-side/strangler boundary for a larger system.
Temporary adapters and dual runtimes are migration work, not the finish line. Prove the riskiest
dependency/FFI/data/async behavior early; unsupported semantics are blockers, not silent substitutes.

For each experiment:

1. Read `git log`, `git diff` and `iterations.tsv`. Select one unmet contract or a prerequisite
   with a measurable check. Preserve the last accepted behavior floor.
2. Implement one coherent slice, including callers, error paths, tests and configuration it needs.
   Write idiomatic target code that preserves observable semantics rather than translating syntax.
3. Stage only this slice's explicit paths; commit using `experiment: migrate/<slice>` (or required
   repository format), under the user's Git identity without model trailers.
4. Run its pinned checks through `verification.cjs run` and compare identical fixtures against the
   fixed source and candidate. Check side effects and failure behavior, not just response bodies.
   Rerun affected regression checks and Guard; save redacted execution receipts in `RUN/evidence/`.
5. Keep only measurable progress with no lost previously accepted behavior and no new Guard
   failure. A prerequisite can count when its predeclared assertion becomes green. Otherwise revert
   only this experiment with `git revert <experiment-sha> --no-edit`; never bulk-reset. Reconcile
   test data/queues separately: a code revert cannot undo external writes.
6. Append iteration, commit, passed/required, delta, guard, keep/discard and next gap to the ledger.

Use the shared acceptance pass rate to choose work, never to waive a required check. Missing,
flaky, blocked and not-run results remain unresolved. Do not weaken the oracle, normalize a new
semantic difference, reduce scope, or lower a budget merely to keep a slice. If discovery adds
scope/checks, record why, preserve earlier requirements and pin a new reviewed snapshot/digest;
invalidate affected evidence. Resume from that version, retaining the old audit trail.

## 4. Complete the replacement

Reconcile inventory against the original source tree, registries and deployment entrypoints.
Independently review for missing capabilities, especially workers and secondary entrypoints.
Have a verifier who did not implement the port review corpus coverage and exercise held-out
inputs when delegation is available; otherwise do a separate verification pass. Challenge money
precision, missing/null values, errors, access denial, duplicate events and persisted state.
Add uncovered cases through the reviewed snapshot-change process and rerun all affected checks.
Then verify the entire target in a fresh environment: install from locks, build, boot and exercise
all required workflows with the replaced source runtime, process and fallback proxy unavailable.
Check the deployable artifact and all startup/job commands, not only the developer workstation.

Remove superseded implementation, temporary adapters, source-only dependencies and obsolete
configs from the candidate's active paths; update CI, docs, examples and operator instructions.
Keep the source commit/artifact for comparison and rollback. Historical database migrations or
approved out-of-scope tools may remain with explicit rationale and target compatibility checks.
Rehearse data migration/restore and rollout/rollback on isolated state where applicable. Run
functional, security, failure, performance and operational checks, including held-out cases, on
the final candidate. A human-only required check stays blocked until actual evidence is available.

Record `CANDIDATE` as the final clean implementation commit. Rerun all required receipts for that
candidate after cleanup, then run (paths can be absolute inside PROJECT):

```bash
node "$AR_ROOT/scripts/migrate.cjs" complete "$PROJECT" "$RUN/inventory.json" \
  "$RUN/acceptance-plan.json" "$RUN/results.tsv" "$PLAN_SHA256" "$CANDIDATE"
```

Only exit 0 with `VERIFIED_SCOPE` permits COMPLETE. This checks the pinned inventory, item/check
coverage, exhaustive original scope, exact source/target observations, comparator controls,
source/target paths, exact clean candidate and the existing acceptance execution receipts.
It proves consistency against the declared contract; inventory quality and independent tests still
matter. `cutover: NOT_VERIFIED` is explicit: this gate does not deploy or certify production state.

## 5. Report and hand off

Write schema `3.3.0` handoff with source `migrate`, status COMPLETE only after VERIFIED_SCOPE;
otherwise BOUNDED, BLOCKED, USER_INTERRUPT or ERROR and the remaining work. Include `results_tsv`,
`acceptance: {plan, plan_sha256}`, and the typed `migration` record from the handoff schema when
available; an early blocker or plan-only run omits identities not yet established instead of
inventing hashes. Always include `verdict` (VERIFIED_SCOPE for completion, otherwise BLOCKED), a
planned `results_tsv` path, and `migration: {cutover: "NOT_VERIFIED"}` at minimum. Completion
requires the full record. Validate
with `scripts/validate-handoff.sh <RUN>/handoff.json migrate` (add `--require-pass` for completion).

Summarize source → target, exact migrated scope, items/checks passed versus total, intentional
differences, residual dependencies, candidate revision, measured budgets and remaining blockers.
Link plan, results and rollback instructions. Say explicitly that production cutover is unverified.
When the user requested deployment too, continue through `ship` using existing authorization and
fresh readiness evidence; report its target/artifact/receipt separately. Production data writes,
traffic switching and destruction require authorization for those concrete actions. Missing that
authorization does not prevent completing and verifying the code migration first.
