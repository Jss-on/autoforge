---
name: forge:fix
description: "Remediate defects and errors to zero: root-cause first, evidence-anchored, defect-ledger driven — the builder half of the test↔fix independence loop"
argument-hint: "[Target: <cmd>] [Defects: <defects.tsv|run-dir|auto>] [Scope: <glob>] [Guard: <cmd>] [Iterations: N] [--from-test] [--from-debug] [--evals] [--chain test]"
---

EXECUTE IMMEDIATELY.

The **maintenance/remediation engineer** of the pipeline — the builder half of the tester↔builder
independence loop. Where `test` **assesses** and never fixes, `fix` **remediates** and never
self-certifies: it consumes a defect ledger (from a `test` engagement, a `debug` run, or a raw
error-producing command), drives each item **root-cause → fix → re-verified-locally**, and hands the
result BACK to `test` for independent verification. **Iron law: no fix without an identified root
cause, and no kept fix without a committed test that fails without it** — never patch a symptom,
never weaken a test to get green, never leave a fix nobody can see regress. Two intake modes share
one bounded loop:
- **Defect remediation** (`--from-test` / `Defects:`) — the work queue is a validated `defects.tsv`
  (schema of `scripts/score-test.sh defects`); the metric is the **blocking count** (unresolved
  critical/high) driven to zero, then total open defects.
- **Error burn-down** (`Target:` command) — classic mode: the metric is the **error count** of a
  command's output (tests, types, lint, build) driven to zero.
Both end with the same discipline: evidence per fix, ledger updated, GitHub issues answered, handoff
validated, and commonly `--chain test` so the re-engagement — not this command — declares defects
`verified`.

**Whose repository?** Before the first write, commit or host call run
`node scripts/host.cjs detect` and read `references/host-protocol.md`. On GitLab every `gh` / PR /
issue / Actions step in this file maps to its `glab` / merge-request / pipeline equivalent (§1).
`role: contributor` — an employer's, a client's or a community's repository — puts §3 above every
owner default in this file, wherever it sits: their branch, commit and merge-request conventions;
no push per kept fix, only a reviewable topic branch; the run directory and every working file stay
uncommitted under `forge/`; no forge labels, markers or tracker comments; a test or CI file changes
only on the user's word; and **no auto-merge**. A tracker backlog there is `/forge:backlog`'s job.

## Seam & reference resolution (read once)
Resolve `AR_ROOT` exactly as in `build`: first existing of `${CLAUDE_PLUGIN_ROOT}/skills/forge`,
`.claude/skills/forge`, the directory containing this command file, else glob
`**/skills/forge/scripts/score-test.sh` and take its grandparent. Every `scripts/<x>` below
means `$AR_ROOT/scripts/<x>`; every `references/<x>` means `$AR_ROOT/references/<x>`. Run
`bash $AR_ROOT/scripts/doctor.sh` at setup; if a defect's verification needs a tool the doctor reports
missing (docker, Playwright), surface that as a scope limitation now. Every derived shell command is
screened via `scripts/orchestrate.sh screen-cmd`.

## Parse Arguments
Extract from $ARGUMENTS:
- `Target:` / `--target` — command that shows errors (e.g., `npm test`, `tsc --noEmit`, `npm run build`).
- `Defects:` / `--defects` — a `defects.tsv`, a test/debug run directory containing one, or `auto`
  (newest `forge/test-*/defects.tsv` for the Scope's project).
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
- `Merge:` / `--merge` — `auto` (default: squash-merge the PR once CI is green, see the GitHub flow)
  or `manual`. `--no-merge` is shorthand for `Merge: manual`.
- `--thorough` — restore the exhaustive form of every fast-path rule below (full Guard per slice).
  Default is the fast path.

## Fast path (default) — `references/speed-protocol.md`

The remediation is fast because it fixes each cause once and verifies each fact once:
- **One slice = one root cause** — cluster ledger rows that share a root cause (same function, same
  missing guard, same token) and fix at the **shared caller** (the ladder's rule: one guard where
  every caller routes through); each DEF row still gets its own red → green repro evidence and its
  own status change. Grep the callers and read the touched code before reaching for `debug`'s loop.
- **The repro becomes the regression test once** — on first reproduction, script it as a test in the
  project's own framework, committed with the fix (a probe only when the project has no runner —
  `no-runner` below); every later verification runs that, never the manual steps again.
- **Guard cadence** — per slice the **touched suite** (tests related to the changed files + rows
  tracing to the same requirement), fail-fast; the **full Guard** at checkpoints (every 5 kept
  fixes), before the PR opens and before COMPLETE. A checkpoint failure bisects the kept batch
  (revert the newest kept fix first, re-run, re-queue). In error mode the `Target` command is the
  metric and still runs per slice; the cadence applies to the separate `Guard`.
- **App stays booted** across iterations (pidfile); evidence is cited by commit, never re-produced
  for the same commit.
- **Tracker rounds batched** — a push per kept fix stays; issue comments post in one pass when the
  PR opens (or on abort) — same content per defect, one network round.
`--thorough` restores the full Guard per slice. The iron law, the status ceiling, the no-weakened-
tests rule and green-CI-before-merge are untouched.

## Tests that guard every fix — `scripts/score-fix.cjs`
A fix without a test is a fix nobody can see regress. Every kept item ends with the five records
below, kept in the run (`tests.tsv`, `angles.tsv`, `sweep.tsv`, receipts in `evidence/`) and checked
mechanically: `node scripts/score-fix.cjs check <run>` must print `FIX_EVIDENCE: VALID` before the
PR opens and before COMPLETE — `--repo <target>` when the run does not live inside the repository
it fixed, `--defects <source ledger>` so severities are the tester's, and `--rerun` before COMPLETE,
which executes every proof again (an edited exit code cannot survive it). Only the seam writes
`evidence/*-tests-*.json`, `*-sweep*.json` and `*-mutants.json` — never by hand; what it refuses
to prove stays a gap, said so. A receipt is still a file the agent could forge: the re-engagement
runs `check --rerun` itself, and the evidence document shows the raw outputs.
1. **A committed test, proved.** The regression test lives in the project's own test framework,
   **in the fix commit**. `score-fix.cjs prove <run> requests/<item>-prove.json` (`{item, repo,
   commit, tests, argv, signature}`; `link` names dependency folders a throwaway checkout borrows —
   default `node_modules`, `.venv`, `venv`, `vendor`; `copy` names git-ignored files such as
   `.env.test` — a source file the fix needs belongs in the commit) runs
   the tests in two throwaway checkouts: at the parent commit they must fail **on an assertion**, at
   the fix they must pass → `PROVE: DETECTS`. `NOT_PROVEN` names the reason (they pass before the
   fix; they fail to load rather than to assert; they fail after) — fix the test, not the ledger.
   **The red must be the reported failure, not just a failure.** `signature` quotes, verbatim, what
   the tester saw — the *actual* line of `defect-reports.md`: an error message, a status, `3 !== 6`
   — and the parent's output must carry it, or the test detects some other defect:
   `NOT_PROVEN — fails, but not with the reported failure`. Assert on what the tester observed (the
   message, the status, the value) so the red carries it. Every item of the run's `defects.tsv`
   needs one (`n/a: <why>` only for a failure no text shows, such as a visual one — a reported gap);
   `check --defects` pins the quote to the tester's report.
   `tests.tsv` (`item category tests mutation reason`) has one row per kept item: `proved`, or an
   exemption with its reason — `type`, `lint`, `build` (the checker is the test; the red and green
   evidence files prove it), `design-scan`, `no-runner` (no test framework: the probe in `evidence/`
   stays the only guard — a reported gap), `new-behaviour` (nothing existed to fail against; the
   re-engagement tests it from the requirements).
   A critical, high or medium defect is never a `type`/`lint`/`build` exemption.
2. **The angle table** — `angles.tsv` (`item dimension technique status test_id expected reason`):
   for each kept item, the ways the fixed code can still fail, one row per dimension of the
   twelve dimensions `scenario` uses (`happy-path`, `validation`, `permissions`, `concurrency`,
   `state`, `scale`, `failure`, `security`, `integration`, `data`, `ux`, `recovery`), each `tested`
   (its technique from `references/qa-testing-protocol.md` §2, the test's id, the **expected
   outcome** — a status, a reason, a value) or `n/a` with the reason. Depth follows severity:
   critical and high — all twelve; medium — `validation` and `data` (inputs and boundaries); low
   and error-mode items — the regression test alone. §5's attack list is the checklist for
   `validation`, `data` and `security`.
3. **Negative tests assert the refusal** — the status and the reason, never only that nothing
   threw. "no crash" is not an outcome: a token test that accepts junk "without a server error" has
   verified the acceptance of junk.
4. **The sweep.** A root cause is a pattern; search for it. `score-fix.cjs sweep <run>
   requests/<item>-sweep.json` (`{item, repo, commit, pattern, paths}`; the pattern is a POSIX
   extended regular expression — `\b` is not portable) records every hit at the fix commit, and
   `sweep.tsv` (`item file line disposition reference`) gives each one a disposition:
   `the-fix` (the line the fix changed), `fixed-here` (fixed and tested in the same change),
   `new-defect` (a `DEF-n` appended to the ledger as `open`), or `not-affected` with the reason. The
   callers of the fixed function are swept the same way.
5. **Planted defects (critical and high).** `score-fix.cjs mutate <run> requests/<item>-mutate.json`
   (`{item, repo, commit, argv, mutants: [{name, file, find, replace}]}`) plants three or more small
   defects in the source lines the fix changed, never in a test — the guard negated, the boundary
   off by one, the lock dropped — and
   runs the item's tests against each: all must be `killed`. A survivor means the tests do not pin
   the fix: add the case. `mutation` = `n/a: <why>` in `tests.tsv` needs its reason and is reported
   as a gap.

## Setup (if required context missing)
If Target, Defects, and Scope all missing:
1. Look for the newest test/debug handoff; if found, propose defect-remediation mode.
2. Else auto-detect failures (test suite, type checker, linter, build) and present via
   AskUserQuestion (single batched call): Fix what / Guard / Scope / Launch.
If provided → skip setup.

## Precondition Checks
git repo exists, clean working tree, no lock files, no detached HEAD. Resolve the working repo (the
defect ledger's target for `--from-test`). **Never modify the forge skill tree or the test
run's artifacts in place** — the run dir under repair is evidence; work from a copy (below).

## Work queue & baseline (Iteration 0)
Create `forge/fix-{YYMMDD}-{HHMM}/` containing `iterations.tsv`, `evidence/`, and — in
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
At task start, retrieve scoped `fix` procedures using `scripts/lessons.cjs select <project> fix`;
reselect if applicability inputs change. Read `references/procedural-lessons.md` for matches or
candidate capture. Apply only a procedure supported by this item's root cause and current Scope.

### Phase 2 — Reproduce RED (defect mode)
Run the defect report's exact repro steps first; tee raw output to `evidence/def-<id>-red.txt`.
**A red is a reproduction only when it is the reported failure:** the output must carry the *actual*
the tester recorded in `defect-reports.md` (`grep -F` the quote) — then mark the ledger row
`in-progress`. Some other failure in the output is a different defect, not this one: record it in
`evidence/` (a new `open` row if it is real), leave this item `open` and move on — a root cause hunted
on the wrong red fixes the wrong thing. **Cannot reproduce** → do NOT self-reject: record the attempt in
`evidence/`, note it in the ledger's summary column, leave status `open` for the tester to
adjudicate on re-engagement, and move on. (In error mode the failing Target output IS the red state —
tee it to `evidence/<item>-red.txt`; the clean output after the fix goes to `evidence/<item>-green.txt`.)

### Phase 3 — Root cause (iron law)
Hypothesize → test → falsify until the cause is identified (reuse `debug`'s loop for anything
non-obvious). Record one line of root cause in `iterations.tsv` — a fix commit with an empty
root-cause field is invalid. **Fix the implementation, not the test** — deleting/skipping a failing
test or loosening an assertion to get green is forbidden, with ONE exception: the defect's
root-caused location IS the test (a broken fixture, a wrong expected value contradicting the oracle)
— then fixing the test is the fix, and the report must say so.
When the diagnosed recovery is reusable, draft its candidate/procedure and freeze its verifier
files before the repair; collect a failing `baseline` receipt via `scripts/lessons.cjs check`.
Existing red text alone cannot promote it. If the oracle itself needs repair, correct it first and
collect fresh receipts against that oracle; do not reuse receipts from the faulty test.

### Phase 4 — Fix ONE thing
Minimal, focused diff inside Scope; atomic (exactly one item), **its tests in the same commit**.
**Reuse before build**: when the root
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
- **Prove the test** (both modes): `score-fix.cjs prove`, with the item's `signature` →
  `PROVE: DETECTS`, then the sweep; critical and high → the planted defects, all killed (the
  section above).
- Run Guard — fast path: the **touched suite** per slice, the **full Guard** at checkpoints (every 5
  kept fixes), before the PR and before COMPLETE (`--thorough`: full Guard per slice). Guard red →
  the fix is wrong regardless of the item going green.

### Phase 7 — Decide
- **keep** — item green AND metric decreased/held AND guard passes AND `PROVE: DETECTS` (or a
  recorded exemption) → defect status `open/in-progress → fixed` (append fix commit + evidence path
  to the ledger row's evidence column, the row to `tests.tsv`).
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
At every checkpoint and before the PR: `node scripts/score-fix.cjs check <run>` → `FIX_EVIDENCE:
VALID`; before COMPLETE, `check --rerun`. `INVALID` names the missing test, sweep, angle or mutant —
supply it, never the status. Eval checkpoint if `--evals` and interval hit. Bounded check: `scripts/score-build.sh bound
iterations.tsv <N>` — `BOUND: EXCEEDED` blocks a COMPLETE status without a recorded user-approved
extension.
For a kept reusable recovery with a captured baseline, follow `references/procedural-lessons.md`
to collect recovery, separate holdout and guard receipts and promote it. If a selected procedure
was actually applied, record its `reuse` check and ID/version in this run. Lesson promotion never
sets a defect to `verified`: the independent `test` re-engagement still owns that decision.

## GitHub flow (transparency contract)
Owner role — in a repository that is not yours, "Whose repository?" at the top of this file governs
instead. When the working repo is an output repo (per `build`'s contract), fixes ride the standard lifecycle:
- Work on branch **`fix/<stamp>`**; push at every kept fix; final commits squashed/reworded to
  conventional `fix: <summary> (DEF-n)` messages.
- **Open a PR** when the queue is done (or the bound hits): body = per-defect table (root cause →
  fix commit → evidence → the test that guards it), one **`Fixes #<issue>`** line per remediated GitHub issue so the `qa`
  issues close on merge. The PR's **CI check must be green** — a red-CI fix branch is not done
  (and when the defect WAS the red CI, the green run is the proof).
- **Tracker of record other than GitHub** (`Tracker: linear` armed on the originating engagement —
  integrations-protocol §3): mirror the same discipline onto the Linear issues carrying the
  `forge:<run-id>/<defect-id>` marker — comment root cause + commit + evidence as each fix lands,
  move `fixed` items to the team's in-review state (never straight to done; only a re-engagement's
  `verified` closes), and never touch unmarked issues.
- **Comment on each `qa` issue** as its fix lands: root cause + commit + evidence path + "awaiting
  independent verification by `/forge:test`".
Owner role: commit the fix run directory to the invoking workspace as usual.

### Auto-merge (default ON — the loop finishes its own PRs)
**Owner role only.** `role: contributor` (host-protocol §3) → never merge: open the PR/MR, get its
pipeline green (`node scripts/host.cjs mr <n>` → `READY`), hand it to their reviewers and stop.

The pipeline is meant to run hands-off: the human supplies requirements and a command, not repo
chores. So the PR **merges itself once it has earned it**. All of these must hold — every one is a
mechanical check, never a judgement call:
1. **Every CI check on the PR is green** (`gh pr checks --watch`; on `--required` repos the required
   set, else all). A red or still-running check never merges.
2. **Guard + targeted regression green** on the final commit (the run's own evidence).
3. **No item left `open`** in this run's ledger except ones explicitly recorded as
   not-reproducible/needs-adjudication (those merge only when the branch changes nothing about them).
4. **No unresolved merge conflict** with the base branch (`gh pr view --json mergeable` = `MERGEABLE`;
   on `CONFLICTING`, rebase onto base, re-run guard, push, re-check — never force-merge).
5. **Nothing in the diff outside Scope**, and no secret/credential added (re-screen the final diff).
Then: `gh pr merge <n> --squash --delete-branch`. Prefer `--auto` (GitHub merges when checks pass) and
fall back to a direct merge after `gh pr checks --watch` when the repo plan does not offer auto-merge;
if merging is blocked by branch protection or a required review, **say so and leave the PR open** —
that is the repo owner's rule, not a failure to work around.
After merging: confirm the **base branch's own CI run is green** (a PR-green/main-red split means the
merge surfaced something the PR never ran) and confirm the linked `qa` issues actually closed. A red
base branch immediately re-opens the loop as a new item — the run is not COMPLETE while `main` is red.
- **Escape hatches:** `--no-merge` (open the PR and stop), `Merge: manual`, or a repo where protection
  requires review. Merging is still never deploying: `ship` stays human-gated, releases are not tagged.
- A **contract change** or any finding needing the owner's adjudication does not block the merge — it
  is called out in the PR body, the issue comment, and the summary, and it stays reverted-in-one-click
  (squash merge = one commit to `git revert`).

## Safety Invariants
- **Never deploy, tag releases, or publish** — `ship` stays human-gated. Pushing the fix branch + PR
  to the private output repo is standard-loop.
- Scope-only writes; never mutate the skill tree, the frozen test run dir, or unrelated trees.
- Never weaken the safety net: no deleted/skipped tests, no loosened assertions, no lowered
  coverage floors, no silenced errors (`|| true`, broad try/catch) to move the metric.
- **No kept fix without a committed test** (or a recorded exemption): `tests.tsv` and the seam's
  receipts; `FIX_EVIDENCE: VALID` gates the PR and COMPLETE, and the `test` re-engagement reads
  the gaps.
- Derived commands screened via `scripts/orchestrate.sh screen-cmd`; DB URLs obey the anchored
  localhost/`_test` allowlist; never touch a production datastore — a defect reproducible only
  against prod is remediated against a local stand-in.
- Secrets stay out of commits, evidence files, and issue comments (redact before writing).

## Summary
Print: mode + metric trajectory (baseline → final: blocking count / error count); per-defect table —
id, severity, root cause (one line), status (`fixed` | still `open` + why), the test that guards it
(file · `DETECTS` or the exemption), angles tested / n-a, sweep hits and their dispositions,
mutants killed; the `GAP:` lines of `score-fix.cjs check`; errors fixed by type
(error mode); iterations used, kept vs discarded; guard + regression outcomes; evidence checklist;
branch + PR + issue links + **merge state** (merged / auto-merge armed / left open + the exact reason);
base-branch CI conclusion after the merge; anything flagged for the owner's adjudication; and the
explicit reminder that `fixed ≠ verified` — the next step is the `test` re-engagement.

## Eval Checkpoint (--evals flag)
Interval: floor(max_iterations / 3), min 1 (fixed 10 if unbounded; override `--evals-interval N`).
Print: metric trend, kept/discarded ratio, re-opened count. A rising re-opened count or a plateau
across 3+ checkpoints → recommend stepping back to `debug` (root-cause quality problem), never
silent grinding.

## Chain Handoff
Write handoff.json: version "3.3.0", source "fix", timestamp, status
(COMPLETE|BOUNDED|USER_INTERRUPT|ERROR), results_tsv (iterations.tsv) and/or errors_remaining,
defects_tsv (the updated ledger copy, defect mode), tests_tsv (`tests.tsv` — required for
COMPLETE; the validator recomputes `score-fix.cjs check` on the run), angles_tsv, sweep_tsv,
fix_evidence (the check's first line), test_gaps (its `GAP:` lines, for the re-engagement),
merge{state: merged|auto-armed|open, pr, sha, base_ci}, findings = items still open (with the
cannot-reproduce list) + any oracle conflicts discovered, config{target, defects_source, scope,
guard} (target and defects_source absolute, or relative to the workspace that holds `forge/` — the
validator passes them to `score-fix.cjs check`), repo/branch/PR links. Validate with `scripts/validate-handoff.sh <run>/handoff.json fix`;
on `INVALID`, fix the handoff before printing the summary. Invoke next target in `--chain` order —
commonly `test` (independent re-engagement that turns `fixed` into `verified`/`reopened`). Propagate
--evals.
