---
name: forge
description: "Autonomous iteration loop: modify, verify, keep/discard against any metric"
argument-hint: "[Goal: <text>] [Scope: <glob>] [Metric: <text>] [Verify: <cmd>] [Guard: <cmd>] [Holdout: <cmd>] [Samples: N] [MinDelta: X] [Iterations: N] [--evals]"
---

EXECUTE IMMEDIATELY — do not deliberate before reading this protocol.

**Whose repository?** Before the first commit run `node scripts/host.cjs detect`. `role: contributor`
(an employer's, a client's or a community's repository) → `references/host-protocol.md` §3 governs
this loop: branch first — never commit on the default or integration branch; stage by explicit
path; keep `forge/` out of their history (`node scripts/host.cjs exclude`); push and merge nothing.

## Parse Arguments

Extract from $ARGUMENTS:
- `Goal:` — what to improve
- `Scope:` or `--scope` — file globs, comma or space separated, in git glob syntax (`**` crosses
  directories, `*` does not, no braces): `src/**/*.ts`, `train.py`, `**/*.go`
- `Metric:` — what to measure
- `Direction:` — higher_is_better (default) or lower_is_better
- `Verify:` — shell command whose last stdout line is a number (`%` suffix allowed); extract it
  with `awk`/`jq`, a prose line such as `All files | 85.2 | …` is a `metric-error`
- `Guard:` — optional safety command (must always pass)
- `Holdout:` — optional second command in the same direction, measured only at calibration and in
  the summary; never used to keep or discard
- `Samples:` — Verify runs per measurement (default 3); the median counts
- `MinDelta:` — smallest improvement that counts as a keep (default: twice the calibration spread)
- `Iterations:` or `--iterations` — integer N for bounded mode (default: 25). "unlimited" for unbounded.
- `--evals` — enable mid-loop checkpoints
- `--evals-interval N` — checkpoint frequency override
- `--chain <targets>` — comma-separated downstream commands

Every `scripts/<x>` below is the skill's bundled seam script, resolved as SKILL.md describes (first
existing of `${CLAUDE_PLUGIN_ROOT}/skills/forge/scripts/`, `.claude/skills/forge/scripts/`, `scripts/`).

## Setup (if required context missing)

If Goal, Scope, Metric, or Verify missing → use AskUserQuestion (single batched call):
  Q1 (Goal): "What do you want to improve?"
  Q2 (Scope): "Which files?" — suggest globs from project
  Q3 (Metric+Verify): "How to measure? Provide a shell command that outputs a number"
  Q4 (Guard): "Safety command that must always pass?" — options: test cmd, build cmd, skip
If ALL provided inline → skip setup, proceed directly.

## Precondition Checks

1. Verify git repo exists (`git rev-parse --git-dir`)
2. Clean tree (`git status --porcelain` empty) — calibrate and decide refuse modified or untracked
   files, because an uncommitted file is measured but never reverted; commit, ignore (`forge/`
   belongs in `.gitignore`) or remove them first
3. Check for stale lock files, detached HEAD
4. Fail fast on any critical issue. Warn on non-critical.

## Establish Baseline (Iteration 0) — `scripts/loop.cjs calibrate`

```
node scripts/loop.cjs calibrate forge/loop-{YYMMDD}-{HHMM} --verify "<Verify>" [--guard "<Guard>"] [--holdout "<Holdout>"] \
  --scope "<Scope>" --direction higher|lower [--samples N] [--min-delta X] [--timeout-ms N] --goal "<Goal>" --metric "<Metric>"
```

The script, not the model: screens every command (`orchestrate.sh screen-cmd`), refuses a dirty
tree, runs Verify `Samples` times on the untouched HEAD, records the median as iteration 0 and the
spread as the noise floor (`MinDelta` defaults to twice the spread; a deterministic metric gets 0
and one sample per iteration), runs Guard once (it must pass), measures Holdout, and writes
`loop.json`, `receipts/000.json`, `forge-results.tsv` (`# metric_direction: {direction}` comment,
then the `iteration timestamp commit metric delta guard guard-metric status description` header)
and a `.gitignore` of `*` so the ledger can never enter an experiment commit. Each Verify run is
bounded by `--timeout-ms` (default 10 minutes) and 4 MB of output; over either limit is a `crash`.
A Verify that exits non-zero or whose last line is not a finite number is refused here, not
discovered mid-run. Never write the TSV or derive a metric by hand: every row comes from the script.

## Iteration Loop

For each iteration (1 to max_iterations, or unbounded):

### Phase 1: Review (read git history as memory)
- Read last 10-20 lines of results TSV
- Run `git log --oneline -20` — see what worked/failed
- If last iteration was "keep" → run `git diff HEAD~1` to see what improved metric
- Identify: what worked, what failed, what's untried
- Retrieve applicable `loop` procedures via `scripts/lessons.cjs select <project> loop` once at
  task start, and again if applicability inputs change. Follow `references/procedural-lessons.md`;
  record selection separately from actual use. When a reusable recovery is proposed, freeze its
  candidate and verifier files and collect a real failing baseline before modifying the code.

### Phase 2: Modify
- Based on review, make ONE focused change to improve the metric
- Change must be atomic — one logical unit of work

### Phase 3: Commit
- Stage and commit with `experiment: {description}` prefix
- The message ends there: no `Co-Authored-By` trailer or "Generated with …" footer naming Claude,
  Fable, Opus or any other model (SKILL.md safety invariant)
- Record commit SHA

### Phase 4: Decide — `scripts/loop.cjs decide`

```
node scripts/loop.cjs decide forge/loop-{YYMMDD}-{HHMM} "<one-sentence description of the change>"
```

The script, not the model:
- refuses modified or untracked files (exit 2, nothing recorded); HEAD unchanged since the last
  receipt → `no-op`
- lists every file changed since the last recorded result; any file outside Scope → `out-of-scope`,
  Verify is not run; the run directory inside the range → exit 2 with the command that removes it
- runs Verify `samples_per_iteration` times and takes the median; non-zero exit → `crash`; no
  finite number on the last line → `metric-error`
- computes the delta against the incumbent (the best kept value so far); an improvement in the
  configured direction of at least MinDelta is a candidate; a delta inside the noise band with more
  lines removed than added is `keep (simpler)` (rule 6)
- runs Guard on candidates only; failure → `guard-fail`
- any status other than `keep` / `keep (simpler)` → `git revert --no-edit` of the whole experiment
  range, recorded as `reverted_head`; a range git cannot revert cleanly (merge or empty commit) is
  refused with nothing recorded: squash it into plain commits and run decide again
- writes `receipts/NNN.json` (base, head, commits, changed files, every sample's exit code and
  output hash, guard result, LOC delta, decision) and appends the TSV row

Exit 0 = kept, 1 = not kept (reverted, or `no-op`), 2 = blocked: fix the stated reason and run
decide again. Statuses: `keep` · `keep (simpler)` · `discard` · `crash` · `metric-error` ·
`out-of-scope` · `guard-fail` · `no-op`. A git hook that blocks the commit leaves staged changes
behind, so decide exits 2 until they are committed or discarded.

### Phase 5: Log
The row is already appended; read the DECISION line and move on.
For a reusable kept recovery, collect matching recovery, independent holdout and guard receipts
and promote through `scripts/lessons.cjs` per `references/procedural-lessons.md`. An improved metric
alone cannot promote a lesson. If a retrieved procedure was actually used, run its `reuse` check
and record its ID/version and outcome; selection alone is not use. Preserve normal iteration bounds.

### Eval Checkpoint
If --evals: check if current_iteration % interval == 0 → run checkpoint analysis.

### Bounded Check
If bounded: current_iteration >= max_iterations → exit loop, print summary.

## Summary (after loop ends) — `scripts/loop.cjs summary`

```
node scripts/loop.cjs summary forge/loop-{YYMMDD}-{HHMM} --status COMPLETE|BOUNDED|USER_INTERRUPT|BLOCKED|ERROR
```

Requires HEAD to be the ledger end. Recomputes iterations, kept/discarded counts, start → final,
improvement %, and the top 3 kept changes from the receipts; re-measures Verify once more at the
ledger end and Holdout; writes `summary.json` and `handoff.json`; then runs `check`, which
re-derives every row, decision and verdict from `receipts/` and git and fails on any mismatch.
Verdict: `IMPROVED` (final beats start by at least MinDelta), `UNCHANGED`, `OVERFIT` (the metric
moved but Holdout did not move beyond its own spread), or `DRIFT` (the fresh measurement disagrees
with the ledger's final value beyond the noise floor: the result is not reproducible as recorded).
Print the block it outputs verbatim; never restate numbers from memory.

## Eval Checkpoint (--evals flag)

If --evals present:
- Compute interval: floor(max_iterations / 3), min 1. Fixed 10 if unbounded. Override: --evals-interval N.
- Every {interval} iterations, pause and analyze current results TSV.
- Print: `--- Eval Checkpoint (iterations {X}-{Y}) ---\nMetric: {start} → {end} ({delta}) | Kept: {n}/{total} | Trend: {up/flat/down}\n{one-line recommendation}\n---`
- If plateau 3+ checkpoints → recommend early stop.
- At loop end → full evals summary to evals-summary.md in output directory.

## Chain Handoff

`summary` writes handoff.json: version "3.4.0", source "loop", timestamp, status, results_tsv
`forge-results.tsv`, metric{name, value}, findings (top kept changes), config{goal, scope, metric,
direction, verify, guard, holdout, samples, min_delta} and the `loop` receipts block
(`references/handoff-schema.md`).
Validate it before chaining: `bash scripts/validate-handoff.sh <run>/handoff.json loop` reruns
`loop.cjs check`; `--require-pass` additionally requires verdict `IMPROVED`. An INVALID handoff means
the run is not finished. Invoke next target in --chain order. Propagate --evals flag.
