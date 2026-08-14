---
name: autoresearch:fix
description: "Remediate defects and errors to zero: root-cause first, evidence-anchored, defect-ledger driven — the builder half of the test↔fix independence loop"
argument-hint: "[Target: <cmd>] [Defects: <defects.tsv|run-dir|auto>] [Scope: <glob>] [Guard: <cmd>] [Iterations: N] [--from-test] [--from-debug] [--evals] [--chain test]"
---

EXECUTE IMMEDIATELY.

The **maintenance/remediation engineer** of the pipeline — the builder half of the tester↔builder
independence loop. Where `test` **assesses** and never fixes, `fix` **remediates** and never
self-certifies: it consumes a defect ledger (from a `test` engagement, a `debug` run, or a raw
error-producing command), drives each item **root-cause → fix → re-verified-locally**, and hands the
result BACK to `test` for independent verification. **Iron law: no fix without an identified root
cause** — never patch a symptom, never weaken a test to get green. Two intake modes share one bounded
loop:
- **Defect remediation** (`--from-test` / `Defects:`) — the work queue is a validated `defects.tsv`
  (schema of `scripts/score-test.sh defects`); the metric is the **blocking count** (unresolved
  critical/high) driven to zero, then total open defects.
- **Error burn-down** (`Target:` command) — classic mode: the metric is the **error count** of a
  command's output (tests, types, lint, build) driven to zero.
Both end with the same discipline: evidence per fix, ledger updated, GitHub issues answered, handoff
validated, and commonly `--chain test` so the re-engagement — not this command — declares defects
`verified`.

## Seam & reference resolution (read once)
Resolve `AR_ROOT` exactly as in `build`: first existing of `${CLAUDE_PLUGIN_ROOT}/skills/autoresearch`,
`.claude/skills/autoresearch`, the directory containing this command file, else glob
`**/skills/autoresearch/scripts/score-test.sh` and take its grandparent. Every `scripts/<x>` below
means `$AR_ROOT/scripts/<x>`; every `references/<x>` means `$AR_ROOT/references/<x>`. Run
`bash $AR_ROOT/scripts/doctor.sh` at setup; if a defect's verification needs a tool the doctor reports
missing (docker, gstack), surface that as a scope limitation now. Every derived shell command is
screened via `scripts/orchestrate.sh screen-cmd`.

## Parse Arguments
Extract from $ARGUMENTS:
- `Target:` / `--target` — command that shows errors (e.g., `npm test`, `tsc --noEmit`, `npm run build`).
- `Defects:` / `--defects` — a `defects.tsv`, a test/debug run directory containing one, or `auto`
  (newest `autoresearch/test-*/defects.tsv` for the Scope's project).
- `--from-test` — shorthand for `Defects: auto`; also reads that run's `handoff.json`,
  `defect-reports.md` (repro anatomy), `test-results.tsv` (affected rows), and `requirements.md`
  (the oracle fixes must not violate).
- `--from-debug` — read a `debug` run's handoff.json for scope + root-cause findings.
- `Scope:` / `--scope` — file globs the fix may modify (when remediating a `test` engagement on an
  output repo, default: that repo's source tree).
- `Guard:` / `--guard` — safety command that must always pass (default when a test suite exists:
  run it).
- `Requirements:` / `--requirements` — the oracle (SRS); defaults from the test run. A fix that makes
  an error disappear by changing specified behavior is a new defect, not a fix.
- `Iterations:` / `--iterations` — default 20. "unlimited" for unbounded. `--category` — filter:
  test, type, lint, build. `--evals`, `--evals-interval N`, `--chain <targets>` (commonly `test`).

## Setup (if required context missing)
If Target, Defects, and Scope all missing:
1. Look for the newest test/debug handoff; if found, propose defect-remediation mode.
2. Else auto-detect failures (test suite, type checker, linter, build) and present via
   AskUserQuestion (single batched call): Fix what / Guard / Scope / Launch.
If provided → skip setup.

## Precondition Checks
git repo exists, clean working tree, no lock files, no detached HEAD. Resolve the working repo (the
defect ledger's target for `--from-test`). **Never modify the autoresearch skill tree or the test
run's artifacts in place** — the run dir under repair is evidence; work from a copy (below).

## Work queue & baseline (Iteration 0)
Create `autoresearch/fix-{YYMMDD}-{HHMM}/` containing `iterations.tsv`, `evidence/`, and — in
defect mode — `defects.tsv`, a **copy** of the source ledger that this run updates (the original
stays frozen as the tester's record).
- **Defect mode:** validate the ledger — `scripts/score-test.sh defects defects.tsv` must print
  `VALID`. Baseline metric = its `blocking` count (direction: lower_is_better; secondary: total
  unresolved). Order the queue: **unblock-first** — a defect that blocks other work (build broken,
  boot failure, red CI) precedes everything; then severity (critical → high → medium → low), then
  priority (P1 → P4), then easiest-first within a tier.
- **Error mode:** run Target → count errors (metric = error count, lower_is_better). Order:
  crash/fatal → test failures → type errors → lint → warnings; single-file before cross-file.
- TSV header: `# metric_direction: lower_is_better` + columns
  `iteration timestamp item root_cause commit metric delta guard status description` (item =
  `DEF-n` or error id).

## Iteration Loop (until metric zero or max_iterations)

### Phase 1 — Pick ONE item
Read `iterations.tsv` + git log; take the queue head not yet resolved. Metric already zero → exit
loop (SUCCESS).

### Phase 2 — Reproduce RED (defect mode)
Run the defect report's exact repro steps first; tee raw output to `evidence/def-<id>-red.txt`. Mark
the ledger row `in-progress`. **Cannot reproduce** → do NOT self-reject: record the attempt in
`evidence/`, note it in the ledger's summary column, leave status `open` for the tester to
adjudicate on re-engagement, and move on. (In error mode the failing Target output IS the red state —
tee it.)

### Phase 3 — Root cause (iron law)
Hypothesize → test → falsify until the cause is identified (reuse `debug`'s loop for anything
non-obvious). Record one line of root cause in `iterations.tsv` — a fix commit with an empty
root-cause field is invalid. **Fix the implementation, not the test** — deleting/skipping a failing
test or loosening an assertion to get green is forbidden, with ONE exception: the defect's
root-caused location IS the test (a broken fixture, a wrong expected value contradicting the oracle)
— then fixing the test is the fix, and the report must say so.

### Phase 4 — Fix ONE thing
Minimal, focused diff inside Scope; atomic (exactly one item). **Reuse before build**: when the root
cause is a hand-rolled solved problem, prefer adopting the stack's battle-tested package over
patching the hand-roll. Respect the oracle — behavior specified in `requirements.md` may not change
to make an error disappear (that's a `feature`/requirements conversation, not a fix).

### Phase 5 — Commit before verify
`git commit -m "experiment: fix <item> — <description>"` BEFORE measuring, so every attempt is
recoverable. Git is the experiment ledger.

### Phase 6 — Verify mechanically, leave evidence
- Defect mode: re-run the exact repro → tee `evidence/def-<id>-green.txt`; then **targeted
  regression** — re-run the test rows from `test-results.tsv` that trace to the same requirement(s)
  and anything sharing the touched files.
- Error mode: run Target → count errors → delta (expected: decreased, nothing new appeared).
- Run Guard. Guard red → the fix is wrong regardless of the item going green.

### Phase 7 — Decide
- **keep** — item green AND metric decreased/held AND guard passes → defect status `open/in-progress
  → fixed` (append fix commit + evidence path to the ledger row's evidence column).
- **keep (reworked)** — second attempt after adjustment worked.
- **discard** — metric flat/worse, regression appeared, or guard red → `git revert HEAD --no-edit`,
  status back to `open`.
- **crash / hook-blocked / metric-error** — as discard; record the reason.
**Status ceiling (independence): this command may set `in-progress` and `fixed` — NEVER `verified`,
`closed`, `rejected`, or `duplicate`.** Those are resolved states that lift the release block in
`score-test.sh`, and only the independent `test` re-engagement (or the human) may grant them. A fix
run that self-certifies its own defects closed has proven nothing.

### Phase 8 — Log & validate
Append the iteration row; in defect mode re-validate the ledger
(`scripts/score-test.sh defects defects.tsv` must stay `VALID`) and recompute the blocking count.
Eval checkpoint if `--evals` and interval hit. Bounded check: `scripts/score-build.sh bound
iterations.tsv <N>` — `BOUND: EXCEEDED` blocks a COMPLETE status without a recorded user-approved
extension.

## GitHub flow (transparency contract)
When the working repo is an output repo (per `build`'s contract), fixes ride the standard lifecycle:
- Work on branch **`fix/<stamp>`**; push at every kept fix; final commits squashed/reworded to
  conventional `fix: <summary> (DEF-n)` messages.
- **Open a PR** when the queue is done (or the bound hits): body = per-defect table (root cause →
  fix commit → evidence), one **`Fixes #<issue>`** line per remediated GitHub issue so the `qa`
  issues close on merge. The PR's **CI check must be green** — a red-CI fix branch is not done
  (and when the defect WAS the red CI, the green run is the proof).
- **Comment on each `qa` issue** as its fix lands: root cause + commit + evidence path + "awaiting
  independent verification by `/autoresearch:test`".
- Merge stays with review/human. The re-engagement `test` can target the `fix/<stamp>` branch
  pre-merge.
Commit the fix run directory to the invoking workspace as usual.

## Safety Invariants
- **Never deploy, tag releases, or publish** — `ship` stays human-gated. Pushing the fix branch + PR
  to the private output repo is standard-loop.
- Scope-only writes; never mutate the skill tree, the frozen test run dir, or unrelated trees.
- Never weaken the safety net: no deleted/skipped tests, no loosened assertions, no lowered
  coverage floors, no silenced errors (`|| true`, broad try/catch) to move the metric.
- Derived commands screened via `scripts/orchestrate.sh screen-cmd`; DB URLs obey the anchored
  localhost/`_test` allowlist; never touch a production datastore — a defect reproducible only
  against prod is remediated against a local stand-in.
- Secrets stay out of commits, evidence files, and issue comments (redact before writing).

## Summary
Print: mode + metric trajectory (baseline → final: blocking count / error count); per-defect table —
id, severity, root cause (one line), status (`fixed` | still `open` + why); errors fixed by type
(error mode); iterations used, kept vs discarded; guard + regression outcomes; evidence checklist;
branch + PR + issue links; and the explicit reminder that `fixed ≠ verified` — the next step is the
`test` re-engagement.

## Eval Checkpoint (--evals flag)
Interval: floor(max_iterations / 3), min 1 (fixed 10 if unbounded; override `--evals-interval N`).
Print: metric trend, kept/discarded ratio, re-opened count. A rising re-opened count or a plateau
across 3+ checkpoints → recommend stepping back to `debug` (root-cause quality problem), never
silent grinding.

## Chain Handoff
Write handoff.json: version "2.4.0", source "fix", timestamp, status
(COMPLETE|BOUNDED|USER_INTERRUPT|ERROR), results_tsv (iterations.tsv) and/or errors_remaining,
defects_tsv (the updated ledger copy, defect mode), findings = items still open (with the
cannot-reproduce list) + any oracle conflicts discovered, config{target, defects_source, scope,
guard}, repo/branch/PR links. Validate with `scripts/validate-handoff.sh <run>/handoff.json fix`;
on `INVALID`, fix the handoff before printing the summary. Invoke next target in `--chain` order —
commonly `test` (independent re-engagement that turns `fixed` into `verified`/`reopened`). Propagate
--evals.
