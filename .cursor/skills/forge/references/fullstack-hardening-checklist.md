# Full-Stack Hardening Checklist

Canonical acceptance contract for `forge:build`. Every greenfield full-stack
app the build mode produces is graded on six **dimensions**. The scorer
(`scripts/score-build.sh pass-rate`) reduces a `build-results.tsv` of per-assertion
outcomes to a single weighted `fullstack_pass_rate` (higher_is_better). Ops + UX dimensions
gate the number — "the app boots" alone caps at the functional weight, not 1.00 — and the
**`logic` dimension is a hard gate**: while any business-rule golden case is red, the headline
pass-rate is capped at 0.50, so correct domain math is a precondition for "done", never a
tradeable component.

**Security is a separate must-pass gate.** A weighted score, skipped hardening rows or a clean
dependency scan cannot establish security readiness. Build/feature completion or convergence requires the
current candidate's passing typed `security` evidence (see `references/handoff-schema.md`).

## Dimension Weights

| Dimension | Weight | Env override | Gates |
|---|---|---|---|
| logic | 0.30 | `BUILD_W_LOGIC` | business-rule math correct (golden cases) — **hard gate, must-pass** |
| functional | 0.30 | `BUILD_W_FUNCTIONAL` | app actually works (flows, CRUD, status codes) |
| ux | 0.20 | `BUILD_W_UX` | usable, accessible, on-design |
| devops | 0.15 | `BUILD_W_DEVOPS` | reproducible build + delivery |
| monitoring | 0.15 | `BUILD_W_MONITORING` | observable in production |
| hardening | 0.20 | `BUILD_W_HARDENING` | safe to expose |

Weights renormalize over the dimensions that ran. A spec that declares no `monitoring`
assertions is scored on the dims it does declare — absent ≠ failing, but a declared-then-
failing assertion drops that dimension's score. `logic` is additive: a legacy spec that
declares no `logic` rows renormalizes over the other five exactly as before (no rescore).

**Logic gate (`LOGIC_GATE_CAP`, default 0.50).** `logic` rows are golden cases — exact
`input → expected output` for a business rule — and are must-pass. While any is red, the
headline pass-rate is capped at the cap value; `score-build.sh` prints `logic_gate=CAPPED@0.50`
(or `PASS`, or `n/a` when no logic rows exist). This is what stops a build riding ux/devops
polish to a green number while the tax/ledger/pricing math is wrong or disconnected.

## Results TSV schema

Tab-separated, one row per acceptance assertion. Comment (`#`) and header rows ignored.

```
# metric_direction: higher_is_better
spec	dimension	assertion	weight	status	detail
todo-api	functional	GET /todos returns 200	1	pass	ok
todo-api	monitoring	/metrics exposes prometheus	1	fail	endpoint missing
```

- **dimension** ∈ `logic | functional | ux | devops | monitoring | hardening`
- **weight** — per-assertion weight within its dimension (default 1)
- **status** ∈ `pass | fail | skip` — `skip` = not applicable, excluded from numerator AND denominator

## 0. Logic (0.30) — business-rule golden oracle (hard gate)

For any domain with computation or stateful rules (payroll, accounting, POS, billing, scheduling):

- [ ] **Pure engine** — business rules live in a side-effect-free calculation module, separate from the
      app shell (no DB/HTTP/UI in the math path)
- [ ] **Rule matrix encoded** — every table/bracket/band/multiplier/cap is concrete data with a cited
      source (not "per the current tables")
- [ ] **Golden cases green** — each rule has ≥1 golden vector (`input → exact expected output`), all pass
- [ ] **Edge + interaction cases** — boundary snaps, proration, compound multipliers, rounding, stateful
      accrual (e.g. YTD) are each pinned by a golden case
- [ ] **End-to-end golden case** — real input driven through the live app path yields the same number as
      the engine, proving it is **wired in** (no "defined but never called")
- [ ] **Gate clear** — `score-build.sh` reports `logic_gate=PASS`; until then the pass-rate is capped at 0.50

## 1. Functional (0.30)

- [ ] Project builds from clean checkout (`docker build` or native build succeeds)
- [ ] App boots and binds its port; process stays up
- [ ] Every declared endpoint returns its expected status (happy path 2xx)
- [ ] Data layer round-trips: create → read → update → delete persists across restart
- [ ] Unit + integration test suite passes; coverage ≥ project floor
- [ ] Frontend renders the primary view and can drive one full user flow

## 2. DevOps (0.15)

- [ ] **Container hosting only: Dockerfile** — multi-stage, pinned base image, runs as a **non-root** user, has a `HEALTHCHECK`
- [ ] **CI pipeline** (GitHub Actions or equivalent) runs lint → test → build → dependency-scan, all green
- [ ] **Provisioning** ? native managed configuration for PaaS/static hosting; for containers, **Compose / IaC** — `docker-compose.yml` (or Terraform/k8s manifests) brings up app + datastore
- [ ] **Stateful services: DB migrations** — versioned, forward-only by default, run on deploy
- [ ] **Graceful shutdown** — handles `SIGTERM`, drains in-flight requests, closes pool
- [ ] **Config via environment** — no config baked into the image; `.env.example` documents every var

## 3. Monitoring (0.15)

- [ ] `GET /healthz` — liveness, returns 200 when the process is up
- [ ] `GET /readyz` — readiness, returns 200 only when dependencies (DB, cache) are reachable
- [ ] `GET /metrics` — Prometheus exposition format (request count, latency histogram, error count)
- [ ] **Structured logs** — one JSON object per line (level, timestamp, message, fields)
- [ ] **Trace / correlation IDs** — inbound request ID propagated through logs and downstream calls

## 4. Hardening (0.20) — Security + Performance layers

### 4a. Security layer

- [ ] **Owner-reviewed security requirements** — plain-language risks, affected people/data,
      roles, deployment and compliance assumptions have owners and measurable acceptance checks.
- [ ] **Applicable baseline pinned** — assess every row in `references/security-checklist.md`,
      record applicability/reasons and select versioned **ASVS 5.0.0** requirements. **OWASP Top
      10:2025** is a risk map, not a certification. Reuse framework/platform security controls.
- [ ] **Negative tests pass** — server-side cross-user/tenant authorization, sessions/admin MFA
      and recovery, injection/mass assignment, CSRF, and scoped uploads/webhooks/SSRF are exercised
      through the real application. Denied requests disclose no data and cause no side effects.
- [ ] **Deployment and recovery verified** — HTTPS, secure cookies/headers, private DB/storage/
      backups, least privilege, secret rotation, bounded requests/rate limiting, isolated restore
      proof, redacted security logs, tested alerts and a named incident responder. State the tested
      environment; production-only checks remain mandatory release readiness work, never a claimed
      build proof or a reason to skip applicable local/staging tests.
- [ ] **Supply chain checked** — secret/dependency/artifact scans and CI trust-boundary review
      are current for the candidate; no unresolved Critical/High findings (or stricter agreed bar).
- [ ] **Security evidence gate passes** — run `/forge:security` with the pinned checks; save real
      command results tied to the candidate/environment, then run
      `scripts/validate-handoff.sh <security-run>/handoff.json security --require-pass`.
      Every applicable planned check must pass. Failed, missing or skipped checks block readiness;
      accepted risk cannot resolve a finding at the blocking threshold. Re-audit affected paths
      after fixes and changes before convergence/release.

### 4b. Performance layer

- [ ] **Latency SLO** — p95 under target (e.g. < 200ms) on key endpoints under expected load (k6 / autocannon / locust)
- [ ] **No N+1 queries** — list/aggregate paths use JOIN or batch; query count bounded per request
- [ ] **Pagination + bounded queries** — every collection endpoint has `LIMIT` / cursor; no unbounded scans
- [ ] **Indexes** — hot filter / join / sort columns indexed; no full scans on the primary flows
- [ ] **Caching** — expensive / hot reads cached (HTTP cache headers or server cache) with correct invalidation
- [ ] **Compression + payload limits** — gzip/br on responses; request body size capped
- [ ] **Frontend budget** — bundle-size budget held; Core Web Vitals (LCP / CLS / INP) within target (via Playwright)

## Scoring notes

- A high-impact acceptance run is **independent-verify**'d before convergence: the
  `fullstack_pass_rate` used to *choose* a change must not be the only signal used to
  *accept* it (see `orchestrator-routing.md` → Independent Verify & Overfit Guard).
- `0.00` with `dims_ran=none` means nothing measurable was built yet — an honest baseline,
  never a green ship signal. Deploy stays human-gated regardless of pass-rate.

Hosting mechanisms follow the pinned approved stack decision. Stateful apps must retain persistence, compatible migrations, backup and a timed isolated restore; provider-managed backup alone is insufficient. Static hosting needs health/journey observation, configuration and recovery of the delivered artifact, without an invented database or container. Use `acceptance.cjs hosting` to validate the required outcomes.
