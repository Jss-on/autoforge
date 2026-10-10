# handoff.json — the chain contract (schema v3.3.0)

`handoff.json` is the single bridge between chained commands (`--chain`), between an
orchestrator hop and the next, and between a finished run and any later consumer
(`run-index.sh`, `evals`). Runs before v2.3.1 pinned `"version": "2.1.0"` with a shape
that drifted freely (10–30 keys observed, no validator); from v2.3.1 the shape below is
canonical and `scripts/validate-handoff.sh` is the mechanical gate — a command's run is
not finished until its handoff validates.

## Required core (every source)

| Field | Type | Rule |
|---|---|---|
| `version` | string | Numeric three-part schema version. Write `"3.3.0"`. Validator accepts `2.1.0`+ (legacy runs readable) but warns below `2.3.1`. |
| `source` | string | The emitting subcommand, canonical short name: `build`, `feature`, `migrate`, `requirements`, `regression`, `fix`, `test`, `design`, `research`, `android`, `backlog`, `review`, `debug`, `investigate`, `security`, `ship`, `plan`, `scenario`, `predict`, `learn`, `reason`, `probe`, `improve`, `evals`, `forge`. `loop` is accepted as the existing core-loop alias. Unknown sources and colon forms are invalid. |
| `status` | enum | `COMPLETE` \| `CONVERGED` \| `BOUNDED` \| `PLATEAU` \| `BLOCKED` \| `USER_INTERRUPT` \| `ERROR`; `ship` additionally permits `DRY_RUN` and `ROLLBACK`. |
| `timestamp` | string | A valid calendar date and time in ISO-8601 with `Z` or an explicit offset; relative dates and placeholder strings are invalid. |

## Required per source

| Source | Additional required fields |
|---|---|
| `build`, `feature` | `results_tsv` (nonempty path), `metric` (`"fullstack_pass_rate"` or an object with that `name` and an optional finite `value` in [0,1]), `config` (non-null object, not an array). A `CONVERGED` status additionally requires `coverage` with numeric `requirements: 1` and `design: 1`; historical 2.x handoffs may omit `design`, preserving legacy reads. Current 3.x+ `COMPLETE` and `CONVERGED` also require the typed `security` record below with PASS, a high-or-stricter threshold, and readable evidence inside this run directory; this is enforced even without `--require-pass`. |
| `migrate` | `verdict` (`VERIFIED_SCOPE` \| `BLOCKED`), `results_tsv` and `migration` with `cutover: "NOT_VERIFIED"`. COMPLETE/CONVERGED additionally require `acceptance` (`plan`, `plan_sha256`) and `migration` identities (`inventory`, `inventory_sha256`, `candidate_sha`), require VERIFIED_SCOPE and rerun the migration gate even without `--require-pass`; other statuses require BLOCKED and may omit unknown identities. See Migration readiness below. |
| `requirements` | `spec` (path to the generated `*.spec.yaml`) or `srs` (path). SHOULD also carry `report` (`requirements.pdf`, the designed document rendered by `requirements-report.cjs` — the HTML when no browser printed it) and `report_verdict` (its `REPORT:` line). |
| `regression` | `verdict` (`STABLE` \| `UNSTABLE`). |
| `fix` | `results_tsv` or `errors_remaining` (number). COMPLETE additionally requires `tests_tsv` (the run's `tests.tsv`), and the validator recomputes `scripts/score-fix.cjs check` on the run directory: it must print `FIX_EVIDENCE: VALID` — a proved test (or recorded exemption), a sweep and an angle table per kept fix, planted defects killed for critical/high. SHOULD also carry `angles_tsv`, `sweep_tsv`, `fix_evidence` (the check's first line) and `test_gaps` (its `GAP:` lines, for the `test` re-engagement). |
| `test` | `results_tsv` (path). SHOULD also carry `verdict` (`RELEASE_RECOMMENDED` \| `RELEASE_BLOCKED`), `defects_tsv`, and `summary` (path to the test summary report). |
| `design` | `verdict` (`SHIP` \| `FIX` \| `REBUILD`) **or** `design` (object: `design_md` path + `lint`) — an audit carries the disposition, a `system` run carries the DESIGN.md it wrote. SHOULD also carry `results_tsv` (`design-results.tsv`), `defects_tsv`, `slop` (number), `health` (`N/M`), and `summary` (path to `design-report.md`). |
| `research` | `verdict` (`DOSSIER_READY` \| `DOSSIER_BLOCKED`) **and** `report` (path to the dossier). SHOULD also carry `claims_tsv`, `sources_tsv`, and `findings` (per-RQ one-line answers + the contested list). |
| `investigate` | `case_file` (path to `case.json`), `report` (path to `report.md`), `conclusion` (`demonstrated` \| `supported` \| `unresolved`) and `structure_verdict` (`STRUCTURE_VALID` \| `STRUCTURE_INVALID`). COMPLETE requires STRUCTURE_VALID and means the report is ready; its conclusion may remain unresolved. BLOCKED/ERROR may carry STRUCTURE_INVALID. Work status never proves a root cause. The handoff validates these fields only; consumers must inspect the case and rerun its evidence check. Structural validity does not establish factual truth. |
| `android` | `verdict` (`STORE_READY` \| `BLOCKED`) **and** `results_tsv` (`android-results.tsv`). SHOULD also carry `package_id`, `host`, `artifacts` (apk/aab paths or release-asset URLs), `repo`, `pr`, `workflow_run` (device-gate run URL), and `native_needs` (the native-only list) when blocked. |
| `forge` / `loop` | `results_tsv` (`forge-results.tsv`) and the `loop` receipts block written by `scripts/loop.cjs summary` (see Loop receipts below); the loop writes schema `3.4.0`. Required for every 3.4.0+ loop handoff, and validated whenever an older one carries the block: the validator reruns `scripts/loop.cjs check`, which recomputes every row, decision and verdict from `receipts/` and git. Older loop records without the block stay readable and never pass `--require-pass`, which requires verdict `IMPROVED`. |
| `backlog` | `results_tsv` (the `backlog.tsv` ledger — schema in `host-protocol.md` §5). SHOULD also carry `remaining` (number of items still to start or rework), `host`, `role`, and `findings` (blocked items with the question each waits on). COMPLETE means nothing is left to start, never that anything merged. |
| `review` | `verdict` (`SAFE_TO_MERGE` \| `NEEDS_CHANGES` \| `CANNOT_VERIFY`, as printed by `review.cjs verdict`) **and** `report` (`report.html`). SHOULD also carry `review_file` (`review.json`), `document` (the Google Doc URL or null), `host`, `role`, and `findings` (open blocking findings). A verdict is never a merge: approval and the merge itself remain people's steps. |
| `security` | Current 3.x+ writers require the typed `security` record below. COMPLETE describes report completion, not a passing security disposition. |
| `ship` | Current 3.x+ writers require the typed `ship` record below; COMPLETE/ROLLBACK require bound execution and passing readiness/verification. |

Everything else (`status_reason`, `findings`, `verified_live_this_run`, `phases_completed`,
`bound_extension`, `repo` — the project's private GitHub output-repo URL, `pr` — the feature PR
URL, …) is optional, additive, and must not be required by any consumer. `build`/`feature` SHOULD
write `repo` (and `feature` the `pr`) so the chain and `run-index` can link straight to the
transparent output. Commands that touch a git host SHOULD also write `host` (`github|gitlab|unknown|none`)
and `role` (`owner|contributor`) as reported by `scripts/host.cjs detect` — on GitLab `repo` is the
project URL and `pr` the merge-request URL. See `host-protocol.md`.

Stack-selection writers include `config.stack_decision` as the path to the complete approved
decision directory (requirements: tracked beside the spec; build: `docs/adr/0001-tech-stack/`).
This is additive metadata, so historical handoffs remain readable. Consumers re-run
`REQUIRE_STACK_DECISION=1 score-requirements.sh validate <spec>`; the path is not a cached READY
verdict and handoff validation alone does not establish stack approval.

Required paths must be nonempty strings; required objects cannot be null or arrays.
`errors_remaining` must be a nonnegative safe integer. Coverage fractions must be finite
numbers in [0,1]; a converged build cannot claim incomplete coverage.

## Validation

### Migration readiness

`migrate` uses schema 3.3.0 or later. Paths in `migration.inventory`, `acceptance.plan` and
`results_tsv` are relative to the handoff run directory. SHA-256 fields are lowercase 64-digit
hex strings; `candidate_sha` is a full 40- or 64-digit Git revision. Before a pin exists,
noncomplete BLOCKED records omit unknown inventory/plan/candidate fields and may omit
`acceptance` entirely. Keep `migration: {"cutover":"NOT_VERIFIED"}` and the planned
`results_tsv` path; do not fabricate hashes. Known paths may point to planned files that
do not exist yet. Provided identity fields still require the documented types. These
records cannot pass `--require-pass`.

Before accepting COMPLETE/CONVERGED, `validate-handoff.sh` resolves those paths inside the
run directory and invokes the same gate as:

```bash
node scripts/migrate.cjs complete <project> <inventory.json> <acceptance-plan.json> <results.tsv> <approved-plan-sha256> <candidate-sha>
```

The gate binds the frozen inventory to the acceptance inputs, covers every inventory item and
applicable domain (`behavior`, `regression`, `jobs`, `data`, `security`, `operations`, `retirement`),
and checks executor receipts against the current candidate. Inventory version 2 also requires
exhaustive pinned source-scope accounting, a frozen source observation receipt/corpus, exact
comparison against actual candidate observations and executed comparator negative controls.
A generic passing test process cannot substitute for behavioral parity. The handoff's inventory digest must
match the computed digest. Only `jobs` and `data` may be explicitly inapplicable with reasons.
Set `FORGE_PROJECT_ROOT` when validating outside the migrated project. The checked result is
`VERIFIED_SCOPE`; `cutover: "NOT_VERIFIED"` remains explicit. Source replacement readiness is
not evidence of production deployment, data cutover or authorization to ship.

### Security, build and shipping readiness

Both records use checks shaped as `{id, status, evidence}`. IDs are nonempty and unique within each
list; status is `pass|fail|blocked|not_run`. Evidence is a nonempty path relative to this run directory.
Pin the nonempty planned list before execution; a skipped or unavailable check stays in that list.
For a finding, evidence contains the file/line proof and any successful retest. Never include secret values.

```json
{
  "security": {
    "verdict": "PASS",
    "fail_on": "high",
    "checks": [{"id": "auth-boundary", "status": "pass", "evidence": "evidence/auth.txt"}],
    "findings": []
  }
}
```

`fail_on` is `critical|high|medium|low|info` (writers default to high). Findings are
`{id, severity, status, evidence}`, with unique nonempty IDs, severity from the same list and status
`open|resolved|accepted`. Accepted findings remain unresolved at the blocking threshold.
The verdict is derived: FAIL when any check fails or an unresolved finding meets/exceeds the threshold;
otherwise PASS when every planned check passes, otherwise BLOCKED. A security-source PASS requires core status COMPLETE.
A clean audit needs no findings. COMPLETE+FAIL is an honest finished audit and cannot satisfy a readiness gate.

When Strix is selected, write `config.strix: true` and reserve check ID `strix`. It adds
`exit_code` (observed integer 0–255; null only for blocked/not_run before a code is available).
For a completed scan the check's evidence points at the redacted native `run.json`; keep native
`findings.sarif` beside it. A blocked preflight instead points at its saved reason. Example check:

```json
{"id":"strix","status":"pass","evidence":"evidence/strix/run.json","exit_code":0}
```

The execution check can pass with findings; those remain in the existing findings ledger as
`strix:<run_id>:<finding_id>`, with the reported severity or stricter. The normal threshold and
retest rules determine readiness. `config.strix: true` without the check is invalid. A passing
readiness gate additionally reads native reports: completed full-scope headless run, successful
scan flags and SARIF invocation, no open/follow-up coverage, valid finding IDs/severities, all
findings carried into the ledger, and exit 0 for zero findings or 2 when findings exist. It requires
SARIF 2.1.0 from Strix with a recorded tool version. Missing/unsupported output is not a clean scan.
Both native files must resolve to nonempty regular files inside this run, including symlinks.
Build/feature preserve `config.strix: true`, this check and its entire redacted evidence bundle;
incomplete reports stay blocked. See `references/security-checklist.md` for isolation, scope,
provenance and retest rules.

Build and feature reuse this same `security` object. Before declaring COMPLETE or CONVERGED, run a
fresh audit of the candidate and copy its record and redacted evidence beneath the build/feature run
directory. Include every applicable hardening assertion in the planned checks; failed, skipped or
unavailable work cannot disappear from that list. Use `fail_on: high` or a stricter threshold
(`medium|low|info`); `critical` alone cannot satisfy build completion. Every check must pass and every
referenced check/finding evidence file must be readable, nonempty and regular inside this run directory.
Neither a reduced target rate nor weighted scoring can waive this completion gate. BOUNDED, BLOCKED
and ERROR reports may omit security evidence and remain readable, but cannot pass `--require-pass`.

```json
{
  "ship": {
    "action": "ship",
    "target": "repository/account/environment",
    "artifact": "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    "readiness": [{"id": "required-ci", "status": "pass", "evidence": "evidence/ci.txt"}],
    "authorization": {"source": "user", "action": "ship", "target": "repository/account/environment", "artifact": "sha256:2222222222222222222222222222222222222222222222222222222222222222", "evidence": "evidence/authorization.txt"},
    "receipt": {"id": "observed provider receipt", "target": "repository/account/environment", "artifact": "sha256:2222222222222222222222222222222222222222222222222222222222222222", "evidence": "evidence/receipt.json"},
    "verification": [{"id": "live-smoke", "status": "pass", "evidence": "evidence/smoke.txt"}]
  }
}
```

`artifact` is `git:<40-or-64-lowercase-hex>` or `sha256:<64-lowercase-hex>`; mutable branch/tag/latest labels are refused. Hash content/package artifacts.
`action` is `ship|rollback|dry-run|checklist`. COMPLETE requires action ship; ROLLBACK requires
action rollback. Both require nonempty all-passing readiness/verification lists, a nonempty receipt ID,
and matching receipt/authorization target and artifact. Authorization source is `user|user-auto` and
its action must match too. It records existing session authorization; a stored record cannot grant
permission. Do not propagate an orchestrator's `--auto` into a ship authorization.

DRY_RUN requires action dry-run/checklist, an absent/null receipt and empty verification list. It is
a preview, never delivery. ERROR/BLOCKED can report unsuccessful execution without a success receipt.
Rollback additionally carries `rollback: {reversible: true, from: {receipt, target, artifact},
observed: {receipt, target, artifact}, evidence}`. The selected prior receipt and freshly observed
current deployment must agree in all three identity fields and target must match the intended destination.
The outer artifact names the revision being restored. Missing reversibility or a changed current
deployment blocks restoration. Obtain the observed identity before mutation, then save the new receipt.

`validate-handoff.sh <handoff.json> security|ship|build|feature|loop --require-pass` additionally requires successful
disposition and every referenced evidence file to exist, be nonempty and regular, and resolve inside
the run directory (including symlinks). Absolute paths, URLs and traversal are refused. This checks
record consistency and evidence presence; consumers must independently read the evidence and verify
the current target/artifact before external action. It does not execute receipts or prove that a
self-reported result is true. Preview, failed and blocked records never pass this gate.

Historical 2.x security/ship/build/feature records remain readable via the shape gate, but
cannot pass `--require-pass`, even if a security record is added. Other sources retain their existing contracts. A security FAIL/BLOCKED
may chain only to authorized remediation (`fix`); re-audit before delivery. Ship previews/failures stop chaining.

### Optional asset and motion evidence

When scoped, `build`, `feature`, `design` and `requirements` may add an `assets` object:
`manifest` (project or planning manifest path), `report` (fresh checker JSON), `previous` (approved
snapshot on resume), `providers` (observed provider names), `jobs` (attempts used), `budget` (cap or
off), `kept` (approved count), `motion` (scan/task proof paths) and `credits` (known cost or null).
These fields are additive; older handoffs without them remain valid. Requirements may carry a
planning manifest without a delivery report and must not present planned slots as approved assets.

Consumers reopen `assets/manifest.json`, run `asset-check.cjs check <target>` (plus `--previous`
when resuming), and obtain fresh scan/task evidence before accepting delivery. Optional metadata
or a COMPLETE label cannot substitute for passing required rows. File hashes, attempt accounting,
provenance and motion profiles are checked by asset/design seams, not the handoff shape validator.
Unknown provider model, service job ID or cost remains null/unknown, never invented.

### Loop receipts

The classic loop writes no number by hand. `scripts/loop.cjs calibrate` pins `loop.json`
(commands, scope, direction, samples, `min_delta`, the baseline median and spread); every
`decide` appends `receipts/NNN.json` with the experiment range (`base`, `head`, `commits`),
changed and out-of-scope files, each Verify sample's exit code and output hash, the guard
result, the LOC delta and the decision, then the matching TSV row. `summary` re-measures Verify
once at the ledger end, derives the block below and runs `check`, which re-derives it: contiguous
receipts, unchanged `loop.json`, rows equal to their receipts, each value the median of its
samples, each decision what the rule gives for those samples, changed files, scope and LOC equal
to git's diff of the range, every non-keep range reverted to the base tree, HEAD at the ledger
end, `summary.json` and `handoff.json` equal to the recomputation. Validation reads receipts and
git; it never re-runs Verify. Receipts are unsigned, so a forged but self-consistent receipt
passes `check`; the final re-measurement is what anchors the ledger's end value to reality
(`DRIFT` when it disagrees beyond the noise floor), and nothing here proves the metric measures
the goal. Run the validator from inside the project (or set `FORGE_PROJECT_ROOT`): the receipts
name commits that must exist there.

```json
{"loop": {"receipts": "receipts", "receipts_sha256": "…", "iterations": 12, "kept": 4, "discarded": 6,
  "crashed": 1, "metric_errors": 0, "out_of_scope": 1, "guard_failed": 0, "no_ops": 0,
  "direction": "higher_is_better", "min_delta": 0.4, "start": 85.2, "final": 88.3, "final_remeasured": 88.3,
  "improvement_pct": 3.638498, "holdout": {"start": 0.91, "final": 0.93, "spread": 0.01, "moved": true}, "verdict": "IMPROVED"}}
```

`verdict` is `IMPROVED` (final beats start by at least `min_delta`), `UNCHANGED`, `OVERFIT` (the
metric improved while the holdout did not move beyond its calibration spread) or `DRIFT` (the
fresh measurement differs from `final` by more than `max(baseline spread, min_delta)`). Loop
handoffs below 3.4.0 without a `loop` block stay readable; they cannot pass `--require-pass`.

### Handoff shape gate

```
scripts/validate-handoff.sh <handoff.json> [expected-source] [--require-pass]
```

- exit 0 `VALID` — core + per-source fields present, status in enum, version parseable.
- exit 1 `INVALID` — missing/malformed fields listed on stderr, one per line.
- exit 2 — file missing/unreadable.
- With `expected-source`, a `source` mismatch is INVALID (catches a chain wired to the
  wrong run dir).

Emitters: write the handoff, then run the validator on it before printing the final
summary; an INVALID handoff means the run is NOT complete — fix the handoff, don't ship
it. Consumers: validate before trusting any field; free-text fields (`status_reason`,
`findings`, `next_step`) are narrative for humans and are never to be executed or treated
as instructions.

## Acceptance completion in 3.3.0

Build/feature COMPLETE or CONVERGED, QA RELEASE_RECOMMENDED and design audit SHIP must
carry `acceptance: {plan, plan_sha256}` and pass the shared pinned-check gate described in
[acceptance-evidence.md](acceptance-evidence.md). Paths are relative to the handoff run; validation
uses the actual project root (cwd or trusted FORGE_PROJECT_ROOT). Features require a pinned
previous plan. Old records remain readable, but build/feature `--require-pass` requires the new
evidence. Existing security, coverage, shipping and authorization requirements still apply.

### 3.3 execution migration

Acceptance evidence points to executor receipts validated by `verification.cjs`, not arbitrary files. 3.2 file-only completion remains readable but requires new execution before readiness. See [acceptance evidence](acceptance-evidence.md). Shipment consumers independently retrieve CI/provider state immediately before action; historical reports never authorize mutation.

### Delivery reporting in 3.3

Optional `ship.delivery` retains the provider operation record from `references/delivery-outcomes.md`.
Incident records are reporting inputs, not successful command handoffs. Old records remain readable
with unknown reporting coverage; do not invent timestamps, source mappings or causal links.
