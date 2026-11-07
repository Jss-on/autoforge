# /forge — The Autonomous Loop

## What It Does

`/forge` is the core command. It runs an autonomous modify → verify → keep/discard loop for 25 iterations by default (override with `Iterations: N` or `Iterations: unlimited`). You give it a goal, a scope of files it can touch, a shell command that outputs a numeric metric, and an optional guard that must stay green. Claude picks the highest-impact change, commits it, measures the result, and either keeps the improvement or reverts the commit — repeating until iterations are exhausted or the goal is met. It learns from its own history: what worked in earlier iterations informs what it tries next.

---

## Full Syntax

```
/forge
Goal:       <what you want to improve>
Scope:      <file globs Claude can modify>
Metric:     <what number to track> (<direction>)
Verify:     <shell command whose last output line is the metric>
Guard:      <optional command that must always pass>
Iterations: <N | unlimited — default: 25>
```

### Universal Flags

| Flag | Purpose |
|------|---------|
| `Iterations: N` | Run exactly N iterations (default: 25) |
| `Iterations: unlimited` | Run forever until goal met or Ctrl+C |
| `--evals` | Run evals analysis at end of loop |
| `--evals-interval N` | Run evals every N iterations mid-loop |
| `--chain <targets>` | Hand off to next command(s) after loop |

### Config Fields

| Field | Required | Description |
|-------|----------|-------------|
| `Goal` | Yes | Plain-language target. Include a concrete number when possible. |
| `Scope` | Recommended | Glob patterns for files Claude may modify. |
| `Metric` | Recommended | Number being tracked. Always specify direction. |
| `Verify` | Recommended | Shell command whose last stdout line is the metric value (a bare number, `%` allowed). |
| `Guard` | Optional | Must exit 0 after every kept change. |
| `Samples` | Optional | Verify runs per measurement; the median counts. Default 3 at calibration, repeated per iteration only while the metric is noisy. |
| `MinDelta` | Optional | Smallest improvement that counts as a keep. Default: twice the spread calibrate measured (0 for a deterministic metric). |
| `Holdout` | Optional | Second command in the same direction, measured only at calibration and in the summary. Metric moved while the holdout stayed flat = `OVERFIT`. |
| `Iterations` | Optional | Default: 25. Use `unlimited` for overnight runs. |

---

## What Happens Each Iteration

1. Read codebase, git history, and results log
2. Pick highest-impact change based on prior results
3. Make ONE atomic change — explainable in one sentence
4. Commit (so rollback is always clean)
5. Run `Verify`, extract the metric
6. Run `Guard` (if set)
7. Improved by at least `MinDelta` and guard passed → **keep** | equal result with less code → **keep (simpler)** | anything else (`discard`, `crash`, `metric-error`, `out-of-scope`, `guard-fail`) → `git revert` of the whole experiment, by the script
8. The script appends the TSV row and a receipt (`receipts/NNN.json`: commits, every sample, guard output, decision), move to next iteration

Steps 5–8 are one call: `node scripts/loop.cjs decide <run-dir> "<description>"`. Iteration 0 comes
from `node scripts/loop.cjs calibrate`: Verify runs `Samples` times on the untouched tree, the median is
the baseline and the spread sets `MinDelta`. Commands are safety-screened and a Verify that prints no
number is refused before the loop starts, not discovered at iteration 7.

---

## Examples

### Increase test coverage (bounded)

```
/forge
Iterations: 20
Goal: Increase test coverage from 72% to 90%
Scope: src/**/*.test.ts, src/**/*.ts
Metric: coverage % (higher is better)
Verify: npm test -- --coverage | grep "All files" | awk -F'|' '{print $2}'
```

### Reduce bundle size

```
/forge
Iterations: 15
Goal: Reduce production bundle size below 200KB
Scope: src/**/*.tsx, src/**/*.ts
Metric: bundle size in KB (lower is better)
Verify: npm run build 2>&1 | grep "First Load JS" | awk '{print $(NF-1)}'
Guard: npm test
```

### Eliminate TypeScript `any` types

```
/forge
Iterations: 25
Goal: Eliminate all TypeScript `any` types
Scope: src/**/*.ts
Metric: count of `any` occurrences (lower is better)
Verify: grep -r ":\s*any" src/ --include="*.ts" | wc -l
Guard: tsc --noEmit
```

### API performance (p95 latency)

```
/forge
Iterations: 20
Goal: API response time under 100ms (p95)
Scope: src/api/**/*.ts, src/services/**/*.ts
Metric: p95 response time in ms (lower is better)
Verify: npm run bench:api | grep "p95" | awk '{print $NF}' | tr -d 'ms'
Guard: npm test
```

### pytest coverage (Python)

```
/forge
Iterations: 30
Goal: Increase pytest coverage from 68% to 90%
Scope: tests/**/*.py, app/**/*.py
Metric: coverage % (higher is better)
Verify: pytest --cov=app --cov-report=term-missing 2>&1 | grep "TOTAL" | awk '{print $4}'
```

### Go test coverage

```
/forge
Iterations: 25
Goal: Increase test coverage to 85%
Scope: **/*.go
Metric: coverage % (higher is better)
Verify: go test ./... -coverprofile=cover.out && go tool cover -func=cover.out | grep "total:" | awk '{print $3}'
```

### ML training loss

```
/forge
Iterations: unlimited
Goal: Reduce validation loss (val_bpb)
Scope: train.py, model.py
Metric: val_bpb (lower is better)
Verify: uv run train.py --epochs 1 2>&1 | grep "val_bpb" | tail -1 | awk '{print $NF}'
```

### SEO content optimization

```
/forge
Iterations: 25
Goal: Maximize SEO score for target keywords
Scope: content/blog/*.md
Metric: SEO score (higher is better)
Verify: node scripts/seo-score.js --file content/blog/target-post.md
```

### With evals checkpoint every 5 iterations

```
/forge
Iterations: 25
Goal: Reduce lint errors to zero
Scope: src/**/*.ts
Metric: lint error count (lower is better)
Verify: npx eslint src/ 2>&1 | grep -c "error" || true
--evals
--evals-interval 5
```

---

## Guard Patterns

Guard prevents regressions while you optimize a different metric.

```
# Bundle size without breaking tests
Guard: npm test

# Performance without breaking types and tests
Guard: tsc --noEmit && npm test

# Lighthouse without breaking e2e tests
Guard: npx playwright test
```

**Recovery flow when guard fails:**
1. Metric improves, guard fails
2. Revert immediately
3. Read guard output to understand what broke
4. Rework the optimization (max 2 attempts)
5. If both fail — discard, move to next iteration

---

## Bounded vs Unbounded

| | Bounded (`Iterations: N`) | Unbounded (`Iterations: unlimited`) |
|---|---|---|
| **Stops when** | N iterations complete | Goal met or Ctrl+C |
| **Best for** | Sprints, CI, fixed budgets | Overnight runs |
| **CI usage** | Yes | Only with external timeout |
| **Default** | 25 | n/a |

**Guideline:** Run `Iterations: 10` first to calibrate. If results look good, increase or remove the limit.

---

## Results TSV

```tsv
# metric_direction: higher_is_better
iteration  timestamp             commit   metric  delta   guard  guard-metric  status    description
0          2026-10-09T08:00:11Z  a1b2c3d  85.2    0.0     pass   -             baseline  initial state
1          2026-10-09T08:03:40Z  b2c3d4e  87.1    +1.9    pass   -             keep      add auth edge case tests
2          2026-10-09T08:06:02Z  -        86.5    -0.6    -      -             discard   refactor helpers
3          2026-10-09T08:09:55Z  c3d4e5f  88.3    +1.2    pass   -             keep      add error handling tests
```

Every row is written by `scripts/loop.cjs`, never by hand. `receipts/NNN.json` beside the TSV holds
each row's commits, samples, guard output and revert; `node scripts/loop.cjs check <run-dir>` fails on
any row, receipt or commit that no longer agrees with git or with the decision rule. `summary`
re-measures Verify once at the ledger end (a result it cannot reproduce is `DRIFT`), recomputes the
final report from the receipts and writes `handoff.json`, which `validate-handoff.sh <run>/handoff.json loop`
audits the same way before any chained command may consume it.

Use `/forge:evals` after a run to analyze trends, plateaus, and velocity from the TSV.

---

## When to Use Other Commands

| Situation | Command |
|-----------|---------|
| You have a measurable metric to improve | `/forge` |
| You don't know what metric to use | `/forge:plan` |
| Requirements are unclear | `/forge:probe` |
| Tests are failing, types broken, lint is red | `/forge:fix` |
| Bugs but you don't know where | `/forge:debug` |
| Pre-release security review | `/forge:security` |
| Ready to ship | `/forge:ship` |
| Explore edge cases before building | `/forge:scenario` |
| Want expert opinions first | `/forge:predict` |

---

## Tips

- Write a tight `Verify` command. One number, cleanly extracted with `grep`/`awk`/`jq`.
- Run your `Verify` command manually before starting — know your baseline. `calibrate` then runs it three times and prints the spread; a noisy metric gets a `MinDelta` floor automatically, or set `Samples:` / `MinDelta:` yourself.
- A metric the agent can game inside `Scope` (coverage via trivial tests, latency via a cache that drops correctness) needs a `Holdout:` or a `Guard:` that catches the shortcut — the loop proves the number moved, not that the goal did.
- Use `Guard: npm test` liberally when your metric isn't test pass rate.
- Run `Iterations: 10` first on an unfamiliar codebase, then scale up.
- `git log` after a run shows exactly what changed and why. `git revert <hash>` undoes any single change.

---

## Related Guides

- [/forge:plan](forge-plan.md) — when you need help choosing Scope and Metric
- [/forge:fix](forge-fix.md) — when errors need fixing before you can optimize
- [/forge:evals](forge-evals.md) — analyze results TSV after a run
- [Chains & Combinations](chains-and-combinations.md) — combining with debug, security, ship
- [Advanced Patterns](advanced-patterns.md) — custom verification scripts, MCP, CI/CD
