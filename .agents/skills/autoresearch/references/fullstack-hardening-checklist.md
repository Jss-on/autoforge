# Full-Stack Hardening Checklist

Canonical acceptance contract for `autoresearch:build`. Every greenfield full-stack
app the build mode produces is graded on six **dimensions**. The scorer
(`scripts/score-build.sh pass-rate`) reduces a `build-results.tsv` of per-assertion
outcomes to a single weighted `fullstack_pass_rate` (higher_is_better). Ops + UX dimensions
gate the number — "the app boots" alone caps at the functional weight, not 1.00 — and the
**`logic` dimension is a hard gate**: while any business-rule golden case is red, the headline
pass-rate is capped at 0.50, so correct domain math is a precondition for "done", never a
tradeable component.

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

- [ ] **Dockerfile** — multi-stage, pinned base image, runs as a **non-root** user, has a `HEALTHCHECK`
- [ ] **CI pipeline** (GitHub Actions or equivalent) runs lint → test → build → dependency-scan, all green
- [ ] **Compose / IaC** — `docker-compose.yml` (or Terraform/k8s manifests) brings up app + datastore
- [ ] **DB migrations** — versioned, forward-only by default, run on deploy
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

- [ ] **No hardcoded secrets** — credentials/keys only via env or secret manager; secret-scan clean
- [ ] **Security headers** — CSP, HSTS, X-Content-Type-Options, X-Frame-Options (e.g. via helmet)
- [ ] **Input validation** — schema-validate every request body/param at the boundary; reject on fail
- [ ] **Dependency scan clean** — no known CVEs above the agreed severity (npm audit / pip-audit / trivy)
- [ ] **Rate limiting** — per-IP / per-token limiter on public endpoints
- [ ] **AuthN/AuthZ** — protected routes require a valid principal; authorization checked **per resource** (no IDOR)
- [ ] **CSRF + SSRF guards** — state-changing routes CSRF-protected; outbound fetches validated against an allowlist
- [ ] **TLS-ready** — no plaintext-only assumptions; secrets redacted from logs and error responses
- [ ] **OWASP Top 10 pass** — reuse `/autoresearch:security` for an injection / auth / access-control sweep

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
