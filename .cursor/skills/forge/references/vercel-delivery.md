# One native Vercel delivery path

Use the existing ship workflow with `scripts/vercel-delivery.cjs`; select this path only after the stack decision confirms Vercel and its actual account capabilities. The companion `.github/workflows/forge-pilot.yml` is disabled until explicitly configured for the isolated pilot. A disabled job is not delivery evidence.

Build/test in a separate, credential-free workflow. Obtain its completed run/attempt and artifact digest through `ci-evidence.cjs`, using reviewed workflow/oracle files outside candidate control. Package a Vercel Build Output API v3 directory as `.vercel/output/**`; do not place secrets in the archive. The delivery job checks the ZIP digest before confined extraction, then checks the unpacked bundle digest. It executes only the pinned trusted tooling, never candidate build scripts. Use native GitHub environment approval with an actually protected source branch, and the same `concurrency` group with `cancel-in-progress: false` for staging, promotion, migration, and recovery. Disable competing Vercel Git deployment paths and automatic domain assignment. Read actual protection configuration back from both providers.

The reviewed JSON policy contains `repository`, `environment`, `deployment_branch`, `team_id`, `project_id`, `denied_project_id`, `production_host`, `workspace`, `ci` (the complete independent CI policy), and `approved_request_sha256`. The denied project is an independently confirmed existing project outside the credential scope, never a fabricated nonexistent ID. The current implementation requires its lookup to be denied; a broad owner token is unsuitable. Vercel Hobby lacks the project role controls needed to establish this on a shared customer team. Prepare the workflow but keep live delivery blocked until a suitable restricted identity or dedicated account is available; do not silently install an owner token in CI.

For a private GitHub Pro pilot, the owner may explicitly choose `approval: { "mode": "workflow_dispatch", "actor": "OWNER_LOGIN" }` instead of native environment reviewers. Keep the environment restricted to protected branches. Dispatch `forge-pilot.yml` from the protected default branch with `request_sha256` matching `approved_request_sha256`. The executor checks the actual run, original and rerun actors, attempt, private repository, workflow, branch and pinned tooling commit before provider access. Its receipt records this authorization. Omitted approval mode retains the native reviewer requirement; unknown modes fail. This choice does not waive exact artifact authorization or provider-scoped access.

An approved request contains:

```json
{
  "operation_id": "unique-pilot-operation",
  "action": "promote",
  "deployment_id": "dpl_verified_staged_output",
  "expected_current": "dpl_observed_incumbent",
  "candidate": "40-character-source-commit",
  "bundle_sha256": "64-character-build-output-digest",
  "configuration_sha256": "64-character-provider-configuration-digest",
  "expires_at": "a-reviewed-future-ISO-timestamp"
}
```

These illustrative values intentionally fail validation. `action` is `stage`, `promote`, or `rollback`; stage creates an immutable production build with `--prebuilt --prod --skip-domain --no-wait`. Its `deployment_id` is discovered by the unique operation metadata. For an empty project, explicitly pin `expected_current: null`. `bundle()` exports a digest over sorted relative paths and file bytes; symlinks are refused. `configuration()` hashes provider runtime/settings and environment IDs/rotation timestamps, without secret values. A configuration-only change invalidates the request and affected checks. Unknown secret rotation identity requires re-verification.

Store the policy outside candidate control and pin its exact bytes with `FORGE_DELIVERY_POLICY_SHA256`. `approved_request_sha256` is SHA-256 of `JSON.stringify(request)` and represents the existing action/target/artifact authorization. A model-authored approval string is not permission. In the native workflow, reviewed environment variables supply the policy/request; native approval binds the deployment job to that configuration. The workflow verifies the destination and trusted tooling ref before extracting the artifact. Configure `FORGE_PILOT_ENABLED`, project ID, trusted tools ref and reviewed policy in the environment; install only restricted provider credentials there. Run directly only from equivalently trusted operator tooling:

```bash
node "$AR_ROOT/scripts/vercel-delivery.cjs" inspect "$POLICY"
node "$AR_ROOT/scripts/vercel-delivery.cjs" run "$POLICY" "$REQUEST" "$RUN/operation.json"
```

`VERCEL_CLI_PATH` points to the installed Vercel 50.37.0 `dist/vc.js`; credentials are environment inputs, never command arguments. Retain the provider deployment ID, source/build/configuration identities, CI attempt, request and observed-live times. Staging must observe the immutable deployment URL; promotion must observe the production hostname and the same deployment ID. The pilot exposes authenticated `/api/identity` and `/api/journey` checks. Promotion of an ordinary preview is rejected because that provider operation rebuilds; a rebuild needs new verification and authorization.

The executor first creates a durable native GitHub deployment journal entry keyed by operation ID, then mutates Vercel. A repeated operation reconciles its recorded deployment and never resends automatically, even on a new runner. Provider timeout, HTTP 429/error, incomplete listings, unknown state, missing telemetry or a changed incumbent block success. No command is read from a receipt. A local target lock supplements native concurrency; after a crashed local runner, inspect its process and native operation before removing only that operation's stale lock. Never automatically delete a lock or retry an uncertain write. The journal's initial 100-entry ceiling fails closed; add pagination if a service actually outgrows this pilot ceiling.

Rollback uses the same identity, authorization, concurrency and live-observation checks. It additionally requires the approved regression/recovery evidence to prove the old app works with the current schema. Hobby supports only the immediately previous production deployment; do not promise arbitrary historical rollback. Preserve the recovery deployment from provider retention until the drill and rollback window end.

The repository contains local API fakes to test denial/race/error behavior. They do not prove that a cloud account has protections or that a deployment happened. Live obligations remain open until the isolated service produces independent CI/provider/journey evidence. Keep redacted evidence private for seven days and preserve the recovery record before authorized teardown.

Provider contracts: [staged promotion](https://vercel.com/docs/deployments/promoting-a-deployment), [Build Output API](https://vercel.com/docs/build-output-api), [rollback limits](https://vercel.com/docs/cli/rollback), [access roles](https://vercel.com/docs/rbac/access-roles), [GitHub environment protections](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments).

The separate `vercel-pilot-build.yml` example builds the tracked synthetic pilot without deployment
credentials and retains its prebuilt output by run/attempt. Its offline SQLite compatibility fixture
is a regression guard, not live Neon schema or restore proof. Before rollback, include current managed
schema compatibility evidence in the protected recovery job; the example alone cannot authorize it.
