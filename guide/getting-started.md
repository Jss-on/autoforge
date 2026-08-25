# Getting Started with AutoForge

AutoForge turns [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [OpenCode](https://opencode.ai), or [OpenAI Codex](https://developers.openai.com/codex) into an autonomous improvement engine. AutoForge is the product; `forge` is its command namespace — every command is `/forge:*` (renamed from `/autoresearch:*` in v3.0.0). Based on [Karpathy's autoresearch](https://github.com/karpathy/autoresearch):

**Set a goal. Define a metric. Let Claude loop until it's done.**

Each iteration: make ONE change → measure → keep if better → revert if worse → repeat. Every improvement stacks. Every failure auto-reverts. Everything is logged.

Works on anything with a measurable outcome — code coverage, bundle size, API performance, sales emails, SEO content, security posture, and more.

---

## Installation

AutoForge is distributed from a **private repository** — [Jss-on/autoforge](https://github.com/Jss-on/autoforge). Authenticate git first (`gh auth login`, or SSH access to the repo).

### Claude Code (Recommended)

Inside Claude Code:

```
/plugin marketplace add Jss-on/autoforge
/plugin install forge@autoforge
```

All 19 commands are available after restarting Claude Code. Update later with `/plugin marketplace update autoforge`.

Local-clone alternative: `git clone https://github.com/Jss-on/autoforge && cd autoforge`, then `/plugin marketplace add .` and the same install command.

### Manual — Project-Level

```bash
git clone https://github.com/Jss-on/autoforge
cp -r autoforge/.claude/skills/forge .claude/skills/forge
cp -r autoforge/.claude/commands/forge .claude/commands/forge
```

### Manual — Global

```bash
git clone https://github.com/Jss-on/autoforge
cp -r autoforge/.claude/skills/forge ~/.claude/skills/forge
cp -r autoforge/.claude/commands/forge ~/.claude/commands/forge
```

### OpenCode

```bash
git clone https://github.com/Jss-on/autoforge
cd autoforge
./scripts/transform.sh --opencode --global
```

> **OpenCode commands use underscores:** `/forge_debug`, `/forge_fix`, etc.

### Codex

```bash
git clone https://github.com/Jss-on/autoforge
cd autoforge
./scripts/transform.sh --codex --global
```

> **Codex uses `$` mention syntax:** `$forge`, `$forge debug`, `$forge fix`, etc.

### Verify Installation

- **Claude Code:** Type `/forge` — if the setup wizard appears, you are ready.
- **OpenCode:** Type `/forge` — same wizard, underscore subcommands.
- **Codex:** Type `$forge` or run `/skills` to confirm it is listed.

---

## The 18 Commands

The root `/forge` command has two modes:

- **Classic loop** — supply `Metric:` / `Verify:` inline and it iterates against that metric (25 iterations by default). This is the original behavior, unchanged.
- **Autonomous orchestrator** — type a plain-language goal instead (e.g., `/forge help me fix the login bug`) and the system classifies your goal, derives a Success predicate, confirms it once, then loops across subcommands until done. No manual chaining required. See [/forge — Orchestrator](forge-orchestrator.md) for the full guide.

The 18 subcommands below are unchanged. The orchestrator is a mode of the root command, not an additional subcommand.

| Command | Does | Default Iterations |
|---------|------|--------------------|
| `/forge` | Iterate against metric (classic) or autonomous orchestrator (free-form goal) | 25 / goal-bounded |
| `/forge:plan` | Goal → config wizard (also run internally by orchestrator for `optimize-metric` goals) | one-shot |
| `/forge:requirements` | Client brief → validated build spec (interview, no assumptions) | one-shot |
| `/forge:build` | Greenfield full-stack build via the full SDLC (6 weighted dims, logic-gated) | 40 |
| `/forge:feature` | Add a feature to an existing app — delta acceptance + non-regression ratchet | 25 |
| `/forge:test` | Full QA engagement on existing software — risk-based plan, RTM, formal test design, execution + defect ledger, exit-criteria verdict (ISO 29119/ISTQB-aligned) | 20 |
| `/forge:design` | UI/UX designer + design QA — mode-aware direction protocol → machine-readable `DESIGN.md` (`system`); independent audit of a running app: valid captures, mechanical anti-slop floor (`SLOP_GATE`), heuristic critique, personas, defect ledger, `SHIP|FIX|REBUILD` verdict (`audit`); bounded remediation (`--fix`) | 12 (`--fix`) |
| `/forge:debug` | Hunt bugs scientifically | 15 |
| `/forge:fix` | Crush errors to zero | 20 |
| `/forge:security` | STRIDE + OWASP audit | 15 |
| `/forge:ship` | 8-phase shipping | linear |
| `/forge:scenario` | Edge cases × 12 dimensions | 20 |
| `/forge:predict` | 5 expert personas debate | one-shot |
| `/forge:learn` | Scout → generate → validate docs | 10 |
| `/forge:reason` | Adversarial debate + blind judges | 8 |
| `/forge:probe` | 8 personas interrogate requirements | 15 |
| `/forge:improve` | Research ICP, discover improvements, PRDs | 15 |
| `/forge:evals` | Analyze results TSV | one-shot |
| `/forge:regression` | Stability gate — baseline diff, ship/no-ship | gate |

---

## Your First Run

```
/forge
Goal: Increase test coverage from 72% to 90%
Scope: src/**/*.test.ts, src/**/*.ts
Metric: coverage % (higher is better)
Verify: npm test -- --coverage | grep "All files"
```

That's it. Claude reads all files, establishes a baseline, and starts iterating.

### Bounded Run (Recommended to Start)

```
/forge
Iterations: 10
Goal: Increase test coverage from 72% to 90%
Scope: src/**/*.test.ts, src/**/*.ts
Metric: coverage % (higher is better)
Verify: npm test -- --coverage | grep "All files"
```

Run 10 iterations first. Review the TSV log. If the approach looks right, remove the limit.

### Don't Know What Metric to Use?

```
/forge:plan
Goal: Make the API respond faster
```

The wizard scans your stack, suggests Scope/Metric/Verify, dry-runs the command, and hands you a ready-to-paste config.

---

## Core Concepts

### The Loop

```
LOOP (each iteration):
  1. Review   — read codebase + git history + results log
  2. Ideate   — pick next change based on past results
  3. Modify   — make ONE focused change
  4. Commit   — git commit (before verification)
  5. Verify   — run mechanical metric
  6. Guard    — run safety command (if set)
  7. Decide   — keep / discard / rework
  8. Log      — append to TSV
  9. Repeat
```

### Bounded Defaults

Every looping command has a default iteration count. Override inline:

```
Iterations: N          # run exactly N iterations
Iterations: unlimited  # run forever (or until Ctrl+C)
```

| Default | Command |
|---------|---------|
| 25 | `/forge` |
| 15 | `/forge:debug`, `/forge:security`, `/forge:probe` |
| 20 | `/forge:fix`, `/forge:scenario` |
| 10 | `/forge:learn` |
| 8 | `/forge:reason` |

### Metric vs Guard

| | Metric (Verify) | Guard |
|--|-----------------|-------|
| **Purpose** | "Did we improve?" | "Did we break anything?" |
| **Required** | Yes | No (optional) |
| **Example** | `coverage %`, `bundle size KB` | `npm test`, `tsc --noEmit` |
| **On failure** | Revert change | Rework (max 2 attempts), then discard |

Use Guard when your metric is not your test suite. Optimizing bundle size? Set `Guard: npm test`.

### Chain Handoff

Commands pass context forward via `handoff.json`. No copy-pasting between stages:

```
/forge:probe --chain plan
/forge:predict --chain scenario,debug,fix,ship
/forge:reason --chain predict,fix
```

### Evals Checkpoints

Add `--evals` to any looping command to analyze results mid-loop, or run `/forge:evals` after any run to inspect the TSV:

```
/forge
Iterations: 25
Goal: Reduce bundle size below 200KB
--evals
--evals-interval 5
```

### Results Log

Every iteration is tracked in TSV format:

```tsv
iteration  commit   metric  delta   guard  status    description
0          a1b2c3d  85.2    0.0     -      baseline  initial state
1          b2c3d4e  87.1    +1.9    pass   keep      add auth edge case tests
2          -        86.5    -0.6    -      discard   refactor helpers
3          c3d4e5f  88.3    +1.2    pass   keep      add error handling tests
```

---

## Platform Syntax Reference

| Platform | Subcommand syntax | Example |
|----------|-------------------|---------|
| Claude Code | `/forge:debug` | `/forge:fix --category type` |
| OpenCode | `/forge_debug` | `/forge_fix --category type` |
| Codex | `$forge debug` | `$forge fix --category type` |

---

## FAQ

**Q: How do I stop the loop?**
`Ctrl+C` or add `Iterations: N`. Claude commits before verifying, so your last good state is always in git.

**Q: Does this work with any language?**
Yes. The loop is language-agnostic. The verify command adapts to your tooling.

**Q: Can I use this for non-code tasks?**
Yes. Sales emails, SEO content, HR policies — anything with a measurable metric.

**Q: What if Claude makes things worse?**
Every change is committed before verification. If worse, it is instantly `git revert`ed.

**Q: Can I chain commands?**
Yes. See [Chains & Combinations](chains-and-combinations.md).

**Q: Does `/forge:security` modify my code?**
No. Read-only by default. Use `--fix` to opt into auto-remediation.

---

<div align="center">

**AutoForge** — built on the forge engine by Udit Goenka (MIT) — see [NOTICE](../NOTICE) | [GitHub](https://github.com/Jss-on/autoforge)

*"Set the GOAL → Claude runs the LOOP → You wake up to results"*

</div>
