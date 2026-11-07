# CI protocol — the generated pipeline finishes in minutes

Applies to every repository forge owns: `build` output, and `feature` / `fix` / `test` / `design`
engagements on it. In the **contributor role** (`references/host-protocol.md` §4) their pipeline is
the judge — never restructure it; at most say, in the handoff, where it is over this budget.

Measured on 29 forge-built repos (2026-11; 23 with a workflow, 18 of them one job): the pipeline that runs lint → unit → build →
`playwright install` → e2e in sequence, with `workers: 1`. The e2e step is 60–95 % of the wall
time (265 s to 886 s), browsers download again on every run (25 s), docker builds run without a
layer cache (244 s). A 15-minute pipeline on a 4-core runner is a serial pipeline.

## 0. Budget

- **Wall-clock ≤ 8 min** on hosted runners for a push to the default branch, measured from the
  run (`gh run view <id> --json jobs`), not estimated. The devops CI evidence row names the run
  id and its wall minutes.
- Over budget → shard e2e further (§3); still over → the slowest suites move to a nightly
  workflow and the `build-results` row says which. Never trade coverage for the budget silently.

## 1. Shape — jobs side by side; the critical path is the longest job, not the sum

| Job | Runs | Needs a browser / DB |
|---|---|---|
| `checks` | lint, typecheck, unit, dependency scan | no |
| `e2e` (matrix `shard: [1..N]`) | build → start the app → `playwright test --shard=i/N` | yes, one database service **per shard** |
| `container` (container hosting only) | `docker build` with the GHA layer cache, `push: false` | no |

Header on every workflow: `permissions: contents: read`; `concurrency` grouped by ref with
`cancel-in-progress` for everything except the default branch; `timeout-minutes` ≤ 15 per job.
`npm run verify`-style wrappers that chain check → unit → build → e2e stay for local use; CI calls
the stages as separate jobs so they overlap.

## 2. Cache — nothing downloads twice

- Dependencies: `actions/setup-node` `cache: npm` (or `pnpm`), `actions/setup-python` `cache: pip`,
  `Swatinem/rust-cache` for Cargo.
- Playwright browsers: `actions/cache` on `~/.cache/ms-playwright`, key = runner OS + the
  Playwright version from the lockfile. Cache hit → `npx playwright install-deps chromium` (OS
  libraries only); miss → `npx playwright install --with-deps chromium`. **Chromium only.**
- Docker: `docker/build-push-action` with `cache-from: type=gha` and `cache-to: type=gha,mode=max`.

## 3. e2e — serial inside a shard, parallel across shards

- `workers: 1` with a shared database stays: it keeps state assertions honest. Parallelism comes
  from **shards** — each shard job has its own database service and app instance, so shards never
  share state and the suite needs no change.
- `N = ceil(serial e2e minutes / 3)`, min 1, max 4. Measure on the first green run, set N, and
  re-measure whenever e2e grows. One `playwright test` invocation per shard; `--shard` splits
  the files, so a suite of three large spec files gains nothing from N = 4 — split the files first.
- When every test creates its own tenant (which `build` requires of the product), `fullyParallel:
  true` with `workers: 2` inside a shard is allowed; say so in the config comment, with the reason.

## 4. Skeleton (copy, then fill)

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request:
permissions: { contents: read }
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != format('refs/heads/{0}', github.event.repository.default_branch) }}
jobs:
  checks:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - run: npm ci --no-audit --no-fund
      - run: npm run lint && npm run typecheck && npm test
      - run: npm audit --omit=dev --audit-level=high
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    strategy:
      fail-fast: false
      matrix: { shard: [1, 2] }          # N per §3; [1] while serial e2e is under 3 min
    services:
      postgres:
        image: postgres:17-alpine
        env: { POSTGRES_DB: app, POSTGRES_USER: app, POSTGRES_PASSWORD: ci-disposable }
        ports: ['5432:5432']
        options: --health-cmd "pg_isready -U app" --health-interval 5s --health-timeout 3s --health-retries 20
    env: { DATABASE_URL: 'postgres://app:ci-disposable@127.0.0.1:5432/app' }
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - run: npm ci --no-audit --no-fund
      - id: pw
        run: echo "version=$(node -p "require('@playwright/test/package.json').version")" >> "$GITHUB_OUTPUT"
      - uses: actions/cache@v6
        id: pw-cache
        with: { path: ~/.cache/ms-playwright, key: 'pw-${{ runner.os }}-${{ steps.pw.outputs.version }}' }
      - if: steps.pw-cache.outputs.cache-hit != 'true'
        run: npx playwright install --with-deps chromium
      - if: steps.pw-cache.outputs.cache-hit == 'true'
        run: npx playwright install-deps chromium
      - run: npm run build
      - run: npx playwright test --shard=${{ matrix.shard }}/${{ strategy.job-total }}
      - uses: actions/upload-artifact@v7
        if: failure()
        with: { name: 'e2e-${{ matrix.shard }}', path: test-results/, retention-days: 7 }
  container:                               # container hosting only
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v4
      - uses: docker/build-push-action@v7
        with: { context: ., push: false, cache-from: type=gha, cache-to: 'type=gha,mode=max' }
```

Python stacks keep the same three jobs: `checks` runs `ruff` + `pytest` under `setup-python`
`cache: pip`; `e2e` shards drive the app with Playwright exactly as above. Pin action tags to
commit SHAs when the owner's policy asks for it (`references/vercel-delivery.md` does).

## 5. Evidence

The devops `CI pipeline` row in `build-results.tsv` passes only with: the run id of a green run on
the output repository, its wall minutes within §0, and the jobs listed in §1 present (the
`container` job only for container hosting). GitLab (`.gitlab-ci.yml`) maps one to one: stages
run in parallel by default, `cache:` keyed on the lockfile, `parallel: N` for the e2e shards.
