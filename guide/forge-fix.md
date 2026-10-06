# /forge:fix — The Error Crusher

Takes a broken state and iteratively repairs it. ONE fix per iteration. Atomic, committed, verified, and auto-reverted on failure. Default: 20 iterations. Stops automatically when error count hits zero — even in unbounded mode.

---

## How It Works — 5 Steps Per Iteration

```
Step 1  DETECT      Auto-detect failures across all categories
                    Priority: build → tests → types → lint → warnings
Step 2  PRIORITIZE  Blockers first, then required, then polish
Step 3  FIX ONE     Atomic change — one file, one root cause, one commit
Step 4  COMMIT → VERIFY → GUARD
                    Keep if verify improves AND guard passes
                    Revert if verify regresses OR guard fails
Step 5  LOG         Kept changes accumulate; reverted changes go to blocked.md
```

**Auto-stop:** when all detectable errors reach zero, the loop exits cleanly.

---

## Priority Order

| Priority | Category | Examples |
|----------|----------|---------|
| 1 — Blocker | `build` | Compilation failure, missing import, syntax error |
| 2 — Required | `test` | Failing unit/integration tests |
| 2 — Required | `type` | TypeScript tsc errors, mypy, Rust type errors |
| 3 — Polish | `lint` | ESLint, pylint, clippy, go vet violations |
| 4 — Advisory | `warning` | Deprecation warnings, unused variables |

Fixing build errors first is deliberate — many type and test errors are cascade failures from a broken build.

---

## All Flags

| Flag | Purpose |
|------|---------|
| `Iterations: N` | Override default of 20 |
| `--target <command>` | Explicit verify command (overrides auto-detect) |
| `--guard <command>` | Safety command that must always pass |
| `--category <type>` | Only fix: `test`, `type`, `lint`, `build` |
| `--from-debug` | Read findings from latest debug session |
| `--evals` | Analyze fix-results.tsv after completion |
| `--chain <targets>` | Chain to next command(s) after completion |

---

## Anti-Patterns It Never Takes

- Never adds `@ts-ignore` or `eslint-disable` comments
- Never uses `any` to bypass type errors
- Never deletes failing tests to make the suite pass
- Never marks tests as `.skip` or `.todo`
- Never uses empty `catch` blocks to swallow errors
- Never lowers strictness thresholds (tsconfig, lint rules)

If a fix cannot be made cleanly, the iteration reverts and logs to `blocked.md` for manual review.

---

## Every Fix Leaves Tests Behind

A fix nobody can see regress is not finished. For every kept fix the run records five things, and
`scripts/score-fix.cjs check <run>` recomputes them from the receipts and the repository before the
PR opens; `check --rerun` executes every proof again before the run may call itself COMPLETE, and
the `test` re-engagement runs it once more. The handoff validator runs the plain check on COMPLETE
and BOUNDED runs, with the repository and source ledger the handoff names:

| Record | What it shows | How it is proved |
|---|---|---|
| `tests.tsv` | the regression test, committed in the fix commit | `score-fix.cjs prove` runs it in two throwaway checkouts: it must **fail on an assertion** at the parent commit and pass at the fix (`PROVE: DETECTS`) |
| `angles.tsv` | the ways the fixed code can still fail — the twelve dimensions `scenario` uses, each tested (technique, test id, **expected outcome**) or n/a with a reason | critical/high: all twelve; medium: inputs and boundaries; low: the regression test alone |
| `sweep.tsv` | where else the root cause's pattern occurs, and what was done about each hit | `score-fix.cjs sweep` records the hits with git grep; every hit gets a disposition |
| `evidence/<item>-mutants.json` | three or more small defects planted in the fixed lines, all caught by the new tests (critical/high) | `score-fix.cjs mutate` runs the tests against each mutant; a survivor means the tests do not pin the fix |
| the negative tests | they assert the refusal — status and reason — never only that nothing threw | the angle table's `expected` column refuses "no crash" |

Exemptions exist, each with its reason in `tests.tsv`: `type`, `lint`, `build` (the checker is the
test), `design-scan`, `no-runner` (the project has no test framework), `new-behaviour` (nothing
existed to fail against). A critical, high or medium defect is never a type/lint/build exemption.
What the seam cannot prove stays a `GAP:` line, carried in the handoff for the `test` re-engagement.

Throwaway checkouts live under the temp folder and borrow `node_modules`/`.venv`/`vendor` from the
repository; `copy` in a request brings untracked files such as `.env.test` along. Nothing runs in
your working tree.

---

## Examples

### Auto-detect and fix everything

```
/forge:fix
```

### Fix only test failures

```
/forge:fix --category test
Iterations: 20
```

### Fix only type errors

```
/forge:fix --category type
Iterations: 25
```

### Fix only lint errors

```
/forge:fix --category lint
Iterations: 15
```

### Fix from debug findings

```
/forge:debug
Scope: src/**/*.ts
Iterations: 15

/forge:fix --from-debug
Guard: npm test
Iterations: 30

# Shortcut:
/forge:debug --fix
```

### Fix with guard

```
/forge:fix
Target: tsc --noEmit
Guard: npm test
```

### Python — mypy strict

```
/forge:fix --target "mypy app/ --strict"
Guard: pytest
Iterations: 25
```

### Go — vet + staticcheck

```
/forge:fix --target "go vet ./... && staticcheck ./..."
Guard: go test ./...
Iterations: 15
```

### Rust — clippy

```
/forge:fix --target "cargo clippy -- -D warnings"
Guard: cargo test
Iterations: 20
```

### CI/CD pipeline failures

```
/forge:fix
Target: gh run view --log-failed
Scope: .github/workflows/*.yml
```

---

## Example Session Output

```
[Phase 1] Detected: 47 test failures, 12 type errors, 3 lint errors
[Phase 2] Priority: types first (may cascade-fix test failures)

[Iteration 1] Fix: auth.ts:42 — add return type annotation
  delta: -2 errors | guard: pass | STATUS: KEEP

[Iteration 2] Fix: db.ts:15 — handle nullable column
  delta: -1 error | guard: pass | STATUS: KEEP

[Iteration 3] Fix: api.test.ts — wrong approach
  delta: 0 errors | guard: - | STATUS: DISCARD (reverted)

=== Fix Complete (23 iterations) ===
Baseline: 62 errors → Final: 3 errors (-95.2%)
Keeps: 19 | Discards: 3 | Reworks: 1
Blocked: 1 (circular dependency — see blocked.md)
```

---

## Output Structure

```
forge/fix-{YYMMDD}-{HHMM}/
├── iterations.tsv      Iteration log: item, root cause, commit, metric, delta, status
├── defects.tsv         The ledger copy this run updates (defect mode)
├── tests.tsv           Per kept fix: proved | exemption, the test files, mutation, reason
├── angles.tsv          Per kept fix: the twelve failure angles, tested or n/a
├── sweep.tsv           Per sweep hit: file, line, disposition
├── requests/           The prove / sweep / mutate requests given to score-fix.cjs
├── evidence/           def-<id>-red/green.txt, <item>-tests-red/green.json, <item>-sweep.json, <item>-mutants.json
├── summary.md          Baseline vs final error counts, stats
└── blocked.md          Fixes that couldn't be made cleanly — manual review
```

`blocked.md` entries are typically circular dependencies, missing type definitions requiring a dependency install, or architectural decisions. Route them to `/forge:debug` for investigation.

---

## Chain Patterns

### security → fix → re-audit

```
/forge:security
Iterations: 15

/forge:fix --from-debug
Guard: npm test
Iterations: 20

/forge:security --diff
Iterations: 10

/forge:ship --type code-release
```

### fix → ship

```
/forge:fix
Guard: npm test
Iterations: 30

/forge:ship --type code-pr --auto
```

---

## Tips

- **Start unbounded for unknown codebases.** The fixer stops at zero errors automatically. Add `--guard` to prevent regressions.
- **Use `--category` when you have a deadline.** If you need tests green before a PR, `--category test` ignores type noise.
- **Fix build errors in isolation first.** Many test and type errors vanish once compilation succeeds.
- **Guard is your safety net.** Always set `Guard: npm test` when fixing types or lint.
- **Check blocked.md after each run.** Items there usually point to deeper architectural issues.

---

## Related Guides

- [/forge:debug](forge-debug.md) — find bugs before fixing
- [/forge:ship](forge-ship.md) — ship after fixing
- [/forge:evals](forge-evals.md) — analyze fix-results.tsv
