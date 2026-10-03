# Migrate languages and frameworks with Forge

`migrate` replaces an existing implementation while preserving the required behavior of the
declared scope. It inventories the system, records a source baseline, pins acceptance checks,
migrates in verified slices and verifies that the target runs without the replaced stack.

For example, in Codex:

```text
$forge migrate
Target: services/backend
From: Python / FastAPI
To: Rust / Axum
Scope: services/backend, tests/backend, deploy/backend, .github/workflows/backend.yml
Iterations: 40
```

Or migrate a framework without changing language:

```text
$forge migrate
Target: apps/web
From: Vue 3
To: React
Preserve existing routes, browser behavior, accessibility and DESIGN.md.
Iterations: 40
```

These are example destinations, not universal stack recommendations. Forge checks the actual
versions, dependencies and official migration documentation before implementation. Use
`/forge:migrate` in Claude Code, `/forge migrate` in Cursor, and `/forge_migrate` in OpenCode.

## Inputs

| Input | Default and purpose |
|---|---|
| `Target:` / `--target` | Existing application, default current directory. |
| `From:` / `--from` | Detected source stack and versions. |
| `To:` / `--to` | Requested destination; required if the request does not already name it. |
| `Scope:` / `--scope` | Entire target and its supporting build/test/deployment paths; explicit limits are respected. |
| `Guard:` / `--guard` | Repository checks derived from CI unless supplied. |
| `Iterations:` / `--iterations` | 25 experiments; a positive bound or explicit `unlimited`. |
| `--plan-only` | Inspect and write the inventory/plan; no application edits, commits, installs or external changes. |
| `--resume <run>` | Continue the saved inventory/contract after checking source and candidate identities. |
| `--chain <targets>` | Continue to requested Forge workflows; does not grant production authorization. |

Forge asks when a missing choice changes the scope or expected behavior. It shows its plan and
continues under your instruction to migrate. Removing a required feature, changing a public
contract or switching production needs your decision if you have not already supplied it.

## What a complete migration covers

The inventory includes public interfaces, business rules, background work, stored state,
authentication, integrations, frontend behavior where scoped, CI and deployment entrypoints.
For each capability, Forge maps source paths to target paths and required executable checks.
Approved retained/removed components carry explicit reasons and their own checks.
The gate enumerates the pinned source scope, so a forgotten file cannot silently disappear from
the migration. Each file needs a disposition or an explicit reviewed exclusion.

The source implementation and captured expectations remain the comparison oracle. Tests compare
responses and side effects using separate disposable state. Known defects are documented;
security defects are not copied merely to match the source. Deliberate behavior changes need
explicit expectations. Numeric precision, null handling, time zones, concurrency and framework
defaults receive targeted probes where relevant.

Accuracy requires actual source-versus-target evidence. Before porting, Forge runs a frozen
corpus against the original implementation and saves its execution receipt. Each migrated
capability needs normal and boundary/error cases. The target then runs those same cases; the
completion gate compares actual status, data, errors and state/event effects. Missing cases,
wrong types, precision loss or mismatched results block completion even when the test process
exits successfully. The comparator must also reject deliberately corrupted results. If the
source cannot run, the command reports accuracy as unverified and does not claim completion.

Each slice is committed, verified and kept only with measurable progress and no regression of
accepted behavior. Failed slices are reverted. New findings cannot silently shrink the inventory
or loosen tests. At the iteration bound, unfinished work is reported as BOUNDED and remains
available for the next run:

```text
$forge migrate --resume forge/migrate-<timestamp> Iterations: 40
```

Final verification uses a clean candidate and a fresh target-only environment. Old interpreters,
services and fallback proxies are disabled. A Rust API that still needs a Python billing worker
is incomplete when the whole backend is in scope. Database history or an unrelated tool can
remain when explicitly accounted for and verified compatible with the declared migration.

## Evidence and completion

Runs live under `forge/migrate-<timestamp>/` in the Git root:

| Artifact | Purpose |
|---|---|
| `plan.md` | Scope, version/dependency decisions, differences, slice order, budgets, cutover and recovery plan. |
| `inventory.json` | Frozen source-to-target capability and domain mapping. |
| `corpus.json`, source observations and source receipt | Frozen inputs and actual original behavior, linked to the source commit. |
| `checks.json`, `acceptance-plan.json` | Expected checks, verifier inputs and their pinned digest. |
| `results.tsv`, `evidence/` | Actual check outcomes and candidate-bound execution receipts. |
| `iterations.tsv` | Kept/reverted experiments and remaining gaps. |
| `handoff.json` | Validated result for later workflows. |

The bundled `migrate.cjs complete` gate verifies complete source-scope accounting, actual behavioral
comparisons, comparator negative controls, source and target paths, candidate identity and existing
acceptance receipts. Only `VERIFIED_SCOPE` permits COMPLETE. Inventory version 2 is required;
earlier inventories must be rebaselined with this evidence.
Missing checks, stale receipts, required skipped work and residual source paths block that gate.
Target-only assertions prove removal of runtime dependencies that a file inventory cannot infer.

This is verification against an explicitly reviewed contract, not a guarantee that any possible
behavior has been discovered. Independent inventory review, held-out cases and trusted CI improve
confidence. The detailed [migration protocol](../.claude/skills/forge/references/migration-protocol.md)
describes the schema and checker commands.

## Production and data

A completed code migration always reports `cutover: NOT_VERIFIED`. It includes a concrete plan
for data compatibility, backfill, traffic and job ownership, monitoring and rollback or forward
recovery. Stateful transitions are rehearsed on isolated data; a code revert alone does not undo
database writes or sent messages.

When you also request deployment, Forge continues through `ship` with the authorization already
provided and fresh artifact/target checks. Production delivery has a separate receipt and live
verification. Pending production work is reported explicitly instead of being hidden behind a
successful code migration.
