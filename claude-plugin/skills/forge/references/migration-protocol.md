# Migration contract and verification

Use with `forge:migrate`. The unit of completion is an inventoried capability and its acceptance
checks, not a translated file count. Reuse `acceptance-evidence.md` for snapshots, execution
receipts and completion; this document adds the source-to-target mapping.

## Inventory

`inventory.json` is an immutable input of the acceptance snapshot. Version 2:

```json
{
  "version": 2,
  "source": {"stack": "Python / incumbent framework, pinned versions", "revision": "<full-source-commit>"},
  "target": {"stack": "Rust / selected framework, pinned versions"},
  "scope": {"paths": ["backend/orders.py"], "exclusions": []},
  "parity": {
    "corpus": "forge/migrate-example/corpus.json",
    "baseline": "forge/migrate-example/source-observations.json",
    "baseline_receipt": "forge/migrate-example/source-receipt.json",
    "check": {"spec": "migration", "id": "orders-contract"},
    "negative_control": {"spec": "migration", "id": "parity-controls"}
  },
  "items": [
    {
      "id": "orders-api",
      "disposition": "migrate",
      "source_paths": ["backend/orders.py"],
      "target_paths": ["backend/src/orders.rs"],
      "checks": [{"spec": "migration", "id": "orders-contract"}]
    }
  ],
  "domains": {
    "behavior": {"applicable": true, "checks": [{"spec": "migration", "id": "orders-contract"}]},
    "regression": {"applicable": true, "checks": [{"spec": "migration", "id": "existing-acceptance"}]},
    "jobs": {"applicable": false, "reason": "Source entrypoints and deployment registry contain no workers or scheduled jobs."},
    "data": {"applicable": true, "checks": [{"spec": "migration", "id": "state-compatibility"}]},
    "security": {"applicable": true, "checks": [{"spec": "migration", "id": "auth-negative"}]},
    "operations": {"applicable": true, "checks": [{"spec": "migration", "id": "artifact-boot"}]},
    "retirement": {"applicable": true, "checks": [{"spec": "migration", "id": "target-only"}]}
  }
}
```

Replace the example with the discovered system. All seven domain entries are required. Only
`jobs` and `data` allow non-applicability with an evidence-based reason; a missing service or test
is not non-applicability. A library still has behavior, consumers, security boundaries, packaging
and retirement checks, even if it has no server. UI, CLI, integrations, streaming and events are
inventoried under behavior and their relevant operational/security domains.

`scope.paths` is a nonempty list of literal source files or directory roots; `.` means the whole
repository. Roots must exist at the pinned source commit and cannot overlap. Derive them from
the requested Target plus supporting paths, not from the list of files successfully ported.
The checker enumerates their Git-tree entries and requires every entry to belong to exactly one
item or an exact-file exclusion `{path, reason}`. Exclusions need reviewed reasons and cannot
hide requested capabilities. An absent worker or launcher cannot disappear from the denominator.
An exclusion outside scope, an item outside scope or an empty effective scope is invalid.
Retained and excluded entries must keep their original Git content and mode. A changed entry
needs an explicit migration/removal disposition and the associated checks; exclusions cannot
hide changes made during the port.
At least one item must actually migrate. Legacy version-1 inventories need rebaselining; adding
`version: 2` without the source coverage and parity evidence cannot authorize completion.

Items have unique IDs, nonempty `source_paths` and nonempty `checks`. Every reference is a
`{spec, id}` pair naming an applicable **required** acceptance check. Inventory paths are literal
Git-root-relative regular file paths, not directories, globs, absolute paths or `..`. Expand
directory scope to its files. Source paths must exist in the fixed source revision; target paths
must exist as tracked content in the candidate. Each source file belongs to one item; group
capabilities sharing a source module into that item with multiple check references so its
migrate/retain/remove disposition is unambiguous.
Symlinks and submodule entries are not regular-file inventory rows. Account for those boundaries
with exact exclusions, the plan and required executable checks; inventory the implementation files in the repository
that owns them. If that repository is outside the authorized scope, report the remaining boundary
explicitly instead of claiming it migrated.

- `migrate`: nonempty `target_paths`; source paths not also named as target paths must be gone.
  Same-path framework rewrites use matching source/target paths; execution checks prove that
  old imports/runtime dependencies are gone. Inventory individual files within shared directories.
- `retain`: reason required; `target_paths` equals `source_paths` and those files remain. Use for approved external contracts,
  shared files, data migration history and out-of-scope components. Explain exactly why the
  retained component does not require the replaced runtime inside the migration scope.
- `remove`: reason required and no target paths; source paths must be absent. Map a check that
  proves removal did not orphan consumers or lose required behavior. An unwanted component can
  be removed; a required capability cannot be silently dropped by changing its disposition.

The checker rejects unaccounted source entries inside the pinned scope. It cannot infer whether
the user intended additional scope, whether an exclusion reason is true, or whether a file hides
another capability. Review scope, mappings and exclusions against source manifests, runtime
registration, references, deployed entrypoints and operator knowledge. Use executable checks
for runtime dependencies and each behavioral surface.

## Required verification surfaces

| Domain | Derive concrete assertions from the incumbent |
|---|---|
| behavior | Routes, methods, headers/status/errors, serialization, CLI exits/stdout, event schemas, streams, integrations, domain rules, UI/browser journeys and accessibility where scoped. Include failures and boundary inputs. |
| regression | Preserve every previously accepted behavior and unaffected consumer contract. Rehost source-specific harnesses while preserving their IDs/expectations. No deleted, skipped or silently loosened checks. |
| jobs | Schedules, time zones, retries/backoff, acknowledgement, ordering, idempotency, concurrency, cancellation, poison messages and graceful draining. Account for duplicate/lost work during coexistence and cutover. |
| data | Read existing records, write compatible state, transactions/isolation, constraints/cascades, generated IDs, decimal/time encodings, backfill and resume, restore or forward recovery. Verify content/invariants as well as counts. |
| security | Existing passwords/tokens/sessions, cookie/CSRF/CORS, authorization/tenancy, validation, injection boundaries, dependencies and secrets. Negative access tests are required; preserve applicable existing audit checks. |
| operations | Locked clean build, target artifact, configuration/env defaults, CI, startup/readiness, logs/metrics/traces, shutdown, resource/performance budgets and deployment/rollback rehearsal. |
| retirement | Fresh target-only install/build/start and all entrypoints with old runtime/service unavailable; inspect artifact dependencies, imports, launch commands, CI, documentation and temporary bridges. |

Language changes need explicit probes for numeric precision/overflow, null versus omitted,
Unicode/bytes, dates/time zones, exception/error semantics, ordering, async cancellation and
resource ownership where used. Framework changes also probe middleware ordering, validation
coercion, route precedence, ORM behavior, authentication/session formats and lifecycle hooks.
Frontend changes preserve navigation, SSR/hydration, browser APIs, assets, SEO and the established
DESIGN.md rather than initiating an unrelated redesign.

Pin performance/load expectations from measured source behavior and user budgets. Compare
equivalent environments and representative workloads, with sufficient repeats to distinguish
noise. Faster language choice is not evidence of a performance improvement.

## Oracle and execution

### Frozen corpus and real observations

The `parity` fields are project-relative paths and two distinct applicable required check
references. The corpus, source observations and historical source receipt must all be immutable
acceptance inputs. Each migrated item references the parity check and is exercised by at least
one `normal` and one `boundary` or `error` case. Every corpus item ID must name a migrated item.
These case counts are a minimum guard, not a sufficient test strategy: select additional cases
from the actual branches, contracts and failure modes.

```json
{
  "version": 1,
  "cases": [
    {"id": "order-create", "items": ["orders-api"], "kind": "normal", "input": {"amount": "12.50"}},
    {"id": "order-invalid", "items": ["orders-api"], "kind": "error", "input": {"amount": "-1.00"}}
  ]
}
```

Both adapters emit a single JSON document, with one observation per exact corpus ID:

```json
{
  "version": 1,
  "revision": "<full-source-or-candidate-commit>",
  "corpus_sha256": "<sha256-of-raw-corpus-file>",
  "cases": [
    {"id": "order-create", "input": {"amount": "12.50"},
     "output": {"status": 201, "data": {"amount": "12.50"}, "errors": [], "effects": [{"event": "order.created", "amount": "12.50"}]}},
    {"id": "order-invalid", "input": {"amount": "-1.00"},
     "output": {"status": 422, "data": null, "errors": ["invalid amount"], "effects": []}}
  ]
}
```

`status` is a string or finite number, `data` is JSON, and `errors`/`effects` are arrays. Include
actual persisted-state changes and emitted events in `effects`. CLI/library adapters use domain
outcomes in `status`; transport-specific fields can be added and are also compared. Exact money,
large integers and high-precision decimals use strings. Duplicate JSON keys and numeric literals
that would lose information in the comparator are refused instead of silently rounded.
Extra observables must be inside each `output`; unknown top-level or case fields are rejected.
Use synthetic credentials and nonsecret validation results or content digests. Observations
containing `[REDACTED]` are rejected because matching masks cannot prove matching behavior.

Object-key order is irrelevant; types, missing versus null, array order, values and every output
field must match. Missing, extra or duplicate cases, altered inputs, wrong corpus hashes and wrong
revisions fail. The comparator offers no field masks, loose equality or automatic tolerances.
Only narrowly justified, reviewed deterministic adapter normalization is permitted. Pin those
adapters and retain raw evidence for any normalized field. Preserve raw source expectations;
an authorized behavior change needs a separately recorded decision and required target assertion,
not an edited observation made to look like source output. Resolve such a contract change before
rebaselining the unchanged-behavior corpus; never reproduce a security defect to obtain parity.

### Capture once, execute the target, challenge the comparator

Run a source adapter through the existing `verification.cjs` against the original clean source
worktree. Its execution inputs must include the corpus and every migrated source file. Validate
that receipt while the source environment is still available, then copy the receipt and its
**exact stdout bytes** into `baseline_receipt` and `baseline`. Freeze both in the candidate's
acceptance snapshot. The corpus path/hash in the source receipt must match the parity corpus.
Use source files whose bytes match the pinned Git blobs. On Windows, create the isolated oracle
worktree with `git -c core.autocrlf=false worktree add ...` and check repository attributes/filters;
materialize original blob bytes there if checkout transformations changed them. Do not change
the user's checkout settings. If source code or a required source service cannot run, report
accuracy as BLOCKED rather than deriving expectations from the new implementation.

The source receipt is historical: its source revision, source-input hashes, corpus hash and
stdout must match the frozen baseline. It does not need to match the candidate revision or the
candidate's current freshness window. Its verifier and acceptance helper hashes must match the
current trusted capture implementation; recapture after a helper change rather than accepting
an old receipt from a runner that could lose output information. Each candidate parity receipt
must match the current candidate and freshness window: its adapter must
actually execute the current target, print the observation document and include the corpus,
baseline and all migrated target files in `execution.inputs`. Logs belong on stderr. The
completion gate validates that execution receipt and independently compares its stdout to the
source; a target adapter exiting zero with wrong results is still BLOCKED.

Copy the bundled standalone `migration-parity.cjs` into the run directory, pin it as an
acceptance input, and define the negative-control check with this exact argument shape:

```json
["<node-executable>", "<project-relative-helper-copy>", "self-test", "<corpus-path>", "<baseline-path>", "<full-source-commit>"]
```

Use the same Node executable as the completion gate. Pin the helper/corpus/baseline in this
check's execution inputs. The gate verifies the helper against the bundled implementation and
checks its actual receipt. Its self-test mutates status, data, errors and effects for each case
and requires the same comparator to identify the expected one-case/one-field mismatch. A crash,
schema error or unchanged output does not count. For manual diagnosis, the helper also supports:

```bash
node "$AR_ROOT/scripts/migration-parity.cjs" compare "$CORPUS" "$BASELINE" "$TARGET_OBSERVATIONS" "$SOURCE_SHA" "$CANDIDATE"
```

This prints MATCH or MISMATCH in JSON and exits 0 or 1; invalid inputs exit 2. The candidate
observation file here is optional diagnostic output; completion reads the actual execution
receipt's stdout directly. There is no separate observation-file freshness claim to trust.

### Shared acceptance execution

1. Preserve a runnable source commit/artifact in a separate worktree/environment. Capture source
   observations and versioned fixtures before implementation; include edge and negative cases.
   Do not generate expected results by running only the new implementation.
2. Run source and candidate against equivalent **separate disposable state**, isolated ports and
   sandbox/stub integrations. Replaying both sides against a live queue/payment/email endpoint
   can duplicate effects. A shadow comparator is read-only or suppresses effects explicitly.
3. Compare externally meaningful output, resulting database state, emitted messages and error
   behavior. Pin narrow normalization rules for declared nondeterminism (clock, IDs, ordering
   only when unordered by contract). Broad stripping of fields or tolerances added after a
   mismatch cannot turn a regression into parity. Intentional differences carry a decision and
   their own required assertions; never require parity with a known vulnerability.
4. Define `checks.json` with the shared acceptance fields and an `execution` object per applicable
   check. Use the existing six dimensions, not new dimension labels. The migration domains map
   to these checks. The same check may cover multiple related inventory items if its verifier
   actually exercises them; a single generic success command does not establish completeness.
5. Pin immutable source expectations, comparator and verifier/config files in the snapshot:

   ```bash
   node "$AR_ROOT/scripts/acceptance.cjs" snapshot "$PROJECT" \
     "$RUN_REL/checks.json" "$RUN_REL/acceptance-plan.json" \
     "$RUN_REL/inventory.json" "$RUN_REL/plan.md" tests/migration-contract.mjs
   ```

   `RUN_REL` is relative to PROJECT. Include corpus, baseline, source receipt, comparator copy,
   and all oracle/fixture dependencies, not only the shown
   verifier. The snapshot output must not exist. Store its SHA-256 outside candidate write scope
   before implementation. Existing reviewed acceptance can be preserved with `--previous` per
   `acceptance-evidence.md`; compare the resulting full ID set to the original baseline.
6. `execution.inputs` lists candidate source, lockfiles, fixture/config descriptors and relevant
   build artifact identity. A verifier must actually build/probe the selected candidate; passing
   against a stale server on a port is not a candidate test. Receipts bind the Git root candidate,
   executable, input hashes and declared environment. Pin the appropriate timeout, output bound
   and `max_age_ms` before execution. Long suites need a realistic freshness bound.
7. Execute each assertion with `verification.cjs run <project> <plan> <spec> <id> <receipt>`.
   Save receipts at unique paths, and derive TSV statuses from actual receipt outcomes. TSV uses
   `spec dimension assertion weight status detail traces` separated by tabs;
   `detail` is `evidence:<path-relative-to-results-directory>`. Rerun for the final candidate.

Use the existing `score-build.sh pass-rate --strict-evidence` for experiment selection. The
completion checker calls the shared `acceptance.complete`, so missing required rows, skipped
applicable checks, missing/stale receipts and altered snapshot inputs cannot pass.

```bash
node "$AR_ROOT/scripts/migrate.cjs" complete "$PROJECT" "$RUN/inventory.json" \
  "$RUN/acceptance-plan.json" "$RUN/results.tsv" "$PLAN_SHA256" "$CANDIDATE"
```

Exit 0 means `VERIFIED_SCOPE`, 1 means unresolved work, and 2 means invalid contract/input. Check
the exit code and the JSON report. Candidate is the full current commit hash; tracked changes
must be clean and no nonignored untracked files may remain. Locally exclude run artifacts before
this gate. Commit every implementation file and include required generated artifacts in execution
identity. Ignored build outputs must be reproducible in the fresh-checkout verification; ignored
uncommitted source is not a delivered implementation.
Local receipts and hashes establish consistency, not independent trust against a dishonest
author. Use independently reviewed verifiers and trusted CI before a production release.

## State transition and cutover

Default to preserving the data format/schema where possible. Where change is required, plan
expand/backfill/validate/switch/contract, mixed-version compatibility and the point after which
the source cannot safely resume. Rehearse interruption/resume, content checks and restore on
isolated data. Backups without tested recovery are insufficient. Reuse
`operational-recovery.md`; a destructive down migration is not a default rollback strategy.

The run's `plan.md` carries the concrete artifact, configuration, health/performance thresholds,
traffic/job ownership switch, observation window and rollback or forward-recovery triggers.
Do not retire the only working deployment or make irreversible data changes to prove local
completion. Preserve a recoverable source artifact through the chosen observation window.

`VERIFIED_SCOPE` and a COMPLETE migration handoff mean the **declared repository migration**
passed its required checks. The migration record always says `cutover: NOT_VERIFIED`. A production
cutover has its own authorized `ship` record, current target/artifact identity and live verification.
When production was requested, finish that authorized work too; do not call the overall request
complete while cutover or required observation remains pending.
