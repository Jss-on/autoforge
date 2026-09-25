# Isolated delivery pilot

This durable fixture uses synthetic notes and a parameterized, text-only Neon HTTP query. It has no package dependencies. The protocol follows the [official Neon driver's HTTP transport](https://github.com/neondatabase/serverless/blob/main/src/httpQuery.ts); use the driver if expanding beyond this narrow probe. The runtime app role needs SELECT/INSERT only. Apply the SQL files through a separate migration principal on a new isolated Neon project/branch.

Build without deployment or database credentials:

```bash
node evals/devops/pilot/build.cjs forge/loop-<run>/pilot <candidate-commit>
```

The output is a Vercel Build Output API v3 artifact. Enable Vercel system environment variables so runtime identity includes `VERCEL_DEPLOYMENT_ID`. Configure `DATABASE_URL` and a random `FORGE_PILOT_KEY` as runtime secrets only. The guarded delivery runner injects the non-secret configuration identity. Keep `FORGE_INJECT_FAILURE` absent for healthy candidates; setting it to `1` is the approved synthetic unhealthy-candidate drill and changes configuration identity. No customer hostname/database is an allowed target.

Authenticated routes: GET `/api/identity`, GET `/api/readyz`, POST `/api/journey` (create then read one synthetic note). GET `/api/healthz` proves process liveness independently of the database. Never log the request key or database connection string. Structured journey logs contain only ID, outcome and elapsed time. The independent collector records transport failures as failed attempts, so a database outage cannot disappear from the denominator.

Use `operational.cjs observe` to collect the pinned 20 samples over 60 seconds; retain its raw redacted observations, rollout decision and local test-sink acknowledgement. The pilot SLO is 99.0% successful journey attempts over 30 days. The short run validates measurement, not a full-month SLO. At exhausted budget, allow repair work only; an emergency recovery still needs target/action authorization and fresh compatibility checks. Record the review date 30 days after first live observation and the executing operator as temporary pilot responder. Do not create a real on-call page.

Runbook: preserve the operation/CI/deployment IDs; stop promotion on HOLD; confirm `/readyz` separately from `/healthz`; reconcile any uncertain provider action; inspect schema/version and the old-app/new-schema test; run the approved rollback or forward/maintenance path through the same concurrency group; re-observe identity and the persisted journey; verify row counts/digests; record incident/recovery times. For the restore drill, branch from the pre-failure data point into a separate Neon destination, measure until the service is usable, and compare RTO 300s/RPO 60s. Do not overwrite the source branch. Export evidence before the free-tier retention window ends.

`tests/pilot-signals.cjs` uses a real local SQLite database and an actual loopback HTTP alert sink to exercise this runbook. That local evidence cannot close the managed-provider delivery, restore or alert requirements. `tests/restore-fixture.cjs` checks expand-only schema compatibility and isolated restore. A hosted pilot must repeat those assertions against its actual PostgreSQL branch and provider operation IDs.
