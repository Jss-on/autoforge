# Pinned acceptance and completion

The weighted pass-rate chooses experiments. Completion also requires the expected check set:
`score-build.sh completion <results.tsv> <acceptance-plan.json> [project-root] [plan-sha256]`.
Exit 0 means `COMPLETION: COMPLETE`, 1 means blocked, and 2 means invalid input/execution.
Consumers must check the exit code. Neither a lower target nor `--soft-gates` waives this gate.

At requirements/build intake, export the reviewed spec's complete check list to `checks.json`:

```json
{"checks":[{"spec":"app","id":"FR-1","dimension":"functional","weight":1,"required":true,"applicable":true}]}
```

Review its correspondence to the source spec before pinning; do not infer missing YAML fields.
Keep definitions in the project, then run the bundled
`node scripts/acceptance.cjs snapshot <project> <checks.json> <run/acceptance-plan.json> <requirements.md> [verifier/config-input...]`.
Paths after project are project-relative. The output is exclusive: use a fresh run, never overwrite
the approved snapshot. It pins source hashes and the exact definitions; source changes require
the requirements-change process. Pin the plan digest before implementation, outside candidate
write scope. Hash consistency alone does not establish approval or independent execution.

For a feature, add `--previous <incumbent-plan.json> <approved-sha256>` to snapshot. Carry forward
all prior IDs, dimensions, weights, required flags and applicability. The baseline digest comes
from the verified incumbent, not the candidate. Bootstrap an older application's acceptance plan
by reviewing and re-verifying its existing requirements before beginning the feature delta.

TSV columns remain `spec, dimension, assertion, weight, status, detail, traces` (tab-separated).
The assertion is the stable check ID. IDs are unique within a spec; weights must be positive and
finite. Unknown values, malformed rows, duplicate IDs and changed dimensions/weights are errors.
Applicable `fail`, `blocked`, `flaky`, and `not_run` rows earn zero weight but remain in the
denominator. A required row in any of those states prevents completion. Missing expected rows
prevent completion; extra rows are invalid. `skip` is permitted only for an explicitly
non-applicable pinned check with a reason. At least one applicable required check must exist.
Logic checks are always required when applicable. Existing security gates remain mandatory.

A passing row still needs confined, nonempty `evidence:<relative-path>` beneath the results
directory. This initial file check is consistency evidence; trusted execution receipts and CI
verification supply the execution boundary. Legacy `pass-rate` is an exploratory score and
cannot independently establish readiness.

Current build/feature completion, QA `RELEASE_RECOMMENDED`, and design audit `SHIP` handoffs use
schema `3.3.0` and include `acceptance: {plan, plan_sha256}`. Both `plan` and `results_tsv` point
inside the handoff run directory. Run validation from the actual project root, or set the trusted
consumer's `FORGE_PROJECT_ROOT`. A feature additionally needs the previous-plan reference.
`score-test.sh exit-criteria <results> <defects> [requirements] [plan] [project]` invokes the same
gate; `BUILD_ACCEPTANCE_PLAN` and `FORGE_PROJECT_ROOT` provide the latter defaults.

Older records remain readable for historical reporting. They cannot satisfy the strengthened
`--require-pass` build/feature readiness gate; create fresh evidence instead of rewriting history.
Design-system documentation runs without an audit verdict are distinct from a release-ready audit.

## Execution receipts (handoff 3.3.0)

File presence no longer completes an assertion. Each applicable check pins an `execution` object: `argv` (explicit executable and arguments, no implicit shell), `inputs` (implementation, verifier, lockfiles, artifact/config descriptors), `environment` (non-secret names), `secret_env` (secret name to rotation-version variable), `timeout_ms`, and `output_limit`. A numeric command also pins `expect: {min, max}`. Pin `max_age_ms` when the five-minute local freshness default is unsuitable. Checks with unidentifiable external dependency/secret changes must rerun; never declare a cache hit.

```bash
node "$AR_ROOT/scripts/verification.cjs" run "$PROJECT" "$PLAN" app FR-1 "$RUN/evidence/FR-1.json"
node "$AR_ROOT/scripts/verification.cjs" check "$PROJECT" "$PLAN" app FR-1 "$RUN/evidence/FR-1.json"
```

Derive the TSV status from the returned receipt status; reference that receipt in `detail` with `evidence:...` relative to the results directory. Completion independently recomputes identity and outcome. Nonzero, signal, missing executable, timeout and overflow cannot pass. Receipt commands are data and are never replayed by validation. Secret values are withheld except for explicitly declared child inputs; retained output is bounded and redacted before hashing. Redaction is tested mitigation, not proof against every application leak. Keep evidence private, use native CI retention (pilot: seven days), and retain only the redacted representation.

Schema 3.1 and 3.2 records remain historical reports. Do not relabel them 3.3; rerun their assertions to obtain new receipts. Local hashes prove consistency, not authenticity against the candidate author. Release jobs must run trusted code and fetch reviewed workflow/verifier files independently.

## Independent CI gate

`node "$AR_ROOT/scripts/ci-evidence.cjs" "$TRUSTED_CI_POLICY" "$CANDIDATE_SHA"` retrieves GitHub evidence itself using authenticated `gh api`. The policy is supplied by the release operator or protected job, outside candidate control. It pins `repository`, `head`, `run_id`, `attempt`, `workflow`, exact `required_jobs`, `protected_ref` (reviewed commit), `protected_files` (workflow plus oracle path to SHA-256), `max_age_ms`, and an `artifact: {name, digest}` when deploying CI output. The reader compares protected files at the reviewed and candidate commits, rejects cancelled/skipped/missing jobs, stale attempts, expired artifacts, truncated lists, and API errors. A verifier update requires review of a new protected reference. Re-fetch immediately before mutation; a stored receipt alone cannot authorize a later release. Credential-bearing jobs must not execute untrusted candidate scripts.

API contracts: [workflow runs](https://docs.github.com/en/rest/actions/workflow-runs), [jobs](https://docs.github.com/en/rest/actions/workflow-jobs), [artifacts](https://docs.github.com/en/rest/actions/artifacts).
