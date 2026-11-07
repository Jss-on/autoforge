---
name: forge:semver
description: "Give a repository you own semantic versioning: backfill the version history semantic-release would have produced (a tag, a CHANGELOG section and a GitHub Release per past release point), then install semantic-release so every push CI passes is versioned from Conventional Commits"
argument-hint: "[Target: <dir|owner/repo>[, …]] [Initial: X.Y.Z] [--dry-run] [--no-releases] [--no-merge]"
---

EXECUTE IMMEDIATELY.

The **release engineer** of the pipeline, for projects that were built before forge versioned its
output (every `build` now installs semantic-release in its DevOps slice; this command brings the
older ones level). It answers one question per repository: **what would semantic-release have
released here if it had been running from the first commit?** — and makes the repository say so:
a `vX.Y.Z` tag on each past release point, a `CHANGELOG.md` section and a GitHub Release for each,
the manifest version in step, and semantic-release configured so every later push to the default
branch that CI passes is versioned automatically. The rules are semantic-release's defaults over
[Conventional Commits](https://www.conventionalcommits.org/): **breaking → major, `feat` → minor,
`fix`/`perf`/a git revert → patch, the first release is `1.0.0`**, and a revert cancels the commit it
reverts when both land in the same release. The mechanics live in `scripts/semver.cjs`
(`scan` · `plan` · `apply` · `check`, and `init` which `build` shares); the judgement — what a
commit that is not a Conventional Commit actually was — is yours, recorded per commit and checked.

**Iron law: tags before the merge.** The adoption pull request installs the release workflow. If it
merged before the backfilled tags reached the remote, semantic-release's first run would find no
tags and release the entire history as `1.0.0`. `apply --push` pushes every tag before it pushes
the branch; never merge an adoption PR whose tags are not on the remote.

**Whose repository?** Run `node scripts/host.cjs detect <repo>` first (`references/host-protocol.md`).
Only `role: owner` is versioned. In a repository you contribute to (`role: contributor`), its
release process is its owners' — stop with `BLOCKED` and say so; never tag, release or open a
release-tooling PR there. On GitLab (`host: gitlab`) `scan` and `plan` work and the plan is the
deliverable; the remote steps (`apply --push`, releases, the squash-merge setting) are GitHub-only
and reported `blocked` (host-protocol §2).

## Seam & reference resolution (read once)
Resolve `AR_ROOT` exactly as in `build`: first existing of `${CLAUDE_PLUGIN_ROOT}/skills/forge`,
`.claude/skills/forge`, the directory containing this command file, else glob
`**/skills/forge/scripts/semver.cjs` and take its grandparent. Every `scripts/<x>` below means
`$AR_ROOT/scripts/<x>`. `<run>` is `forge/semver-<YYMMDD>-<HHMM>/` in the invoking workspace; each
target gets `<run>/<slug>/`. Every derived shell command is screened via
`scripts/orchestrate.sh screen-cmd`.

## Parse Arguments
- `Target:` / `--target` — a local repository path or `owner/repo`; several, comma-separated, are
  processed one after another with one summary (default: the repository you are in).
- `Initial:` / `--initial` — the first version when a repository has no `v`-tag yet (default
  `1.0.0`, semantic-release's own first release; `0.1.0` keeps an unfinished project in 0.x — the
  first breaking change then releases `1.0.0`). Ignored when a `v`-tag already exists: the history
  continues from the highest one reachable from the default branch.
- `--dry-run` — Phases 0–3 only: the plan, the changelog preview and the version table; nothing
  is tagged, committed or pushed.
- `--no-releases` — tags, changelog and configuration, but no GitHub Release objects.
- `--no-merge` — open the adoption PR and stop; the owner merges it.

## Phase 0 — Workspace (never the user's working copy)
- Clone the target fresh into `<run>/<slug>/repo` (`gh repo clone <owner/repo>` or `git clone
  <path>`) on its default branch. The user's own clone may hold uncommitted work or a topic branch;
  it is never switched, tagged or committed in. A local target whose default branch is ahead of its
  remote is reported (`N unpushed commits`) and stops: the remote's history is what gets tagged.
- `node scripts/host.cjs detect <run>/<slug>/repo` → owner, host. `gh repo view --json visibility`:
  **PUBLIC → ask once before Phase 4** — tags and releases on a public repository are publishing.
- Already adopted? `node scripts/semver.cjs check <repo>` printing `SEMVER: ADOPTED` with no
  history after the latest tag to backfill → record `ADOPTED`, nothing to do.

## Phase 1 — Scan
`node scripts/semver.cjs scan <repo> --out <run>/<slug>/ledger.tsv` → `SCAN: commits=… auto=…
todo=… pairs=… base=…`. One row per commit since the highest `v`-tag (all history when there is
none): what semantic-release reads on its own is `auto` (Conventional Commits, its upper-case `FEAT:`
/ `FIX:`, a merge titled as one, a revert git wrote); other merges are `merge`; a revert and the
commit whose header and full sha it names are `pair:<sha>` (they cancel when one release holds both —
no class needed); everything else — forge's `experiment:` commits, free text, unknown types like
`qa:` or `Feat:` — is `todo`.

## Phase 2 — Classify (the judgement, written down)
For every `todo` row decide what the commit was, reading `git show --stat <sha>` (and the diff when
the subject does not settle it). Write `<run>/<slug>/classes.json`, keyed by sha (≥ 7 characters):
`{"<sha>": {"type": "feat", "note": "one changelog line", "scope": "", "breaking": false}}`.
- **feat** — adds or extends something a user or operator can do or see: a screen, workflow,
  report, endpoint, export, integration, setting.
- **fix** — corrects behaviour someone would notice, including security fixes and upgrading a
  vulnerable dependency.
- **perf** — faster or lighter with the same behaviour.
- **no release** (`refactor`, `test`, `docs`, `ci`, `build`, `style`, `chore`) — test fixtures and
  harnesses, probes, reports, documentation, CI, scaffolding, internal restructuring.
- **breaking: true** — only when an existing contract others rely on is removed or changed
  incompatibly (a public route or API, a data format needing manual migration). Never to mark a
  milestone: `1.0.0` is the first release's job.
- forge's own shapes are hints, not verdicts: `experiment: fix DEF-n — …` is usually `fix` (`test`
  when it only touched fixtures or harness); `experiment: <dimension> — <slice>` from a build is
  `feat` when the slice added behaviour, `fix` when it closed a hole, `ci`/`build`/`chore` for
  pipeline and scaffolding; `experiment: feature/<slug>` is usually `feat`.
- **A merge-commit PR whose branch is noisy experiments** may be classified once, at the PR: give
  the merge row the PR's net type and its title as the note, and mark its branch commits `chore`.
  One changelog line per user-visible change — never the same change twice.
- **Notes** are what changed for the user, present tense, no `experiment:`/dimension prefix
  (`running totals on every invoice`, `deny anonymous API callers before method dispatch (DEF-4)`).
  `feat`, `fix`, `perf` and breaking classes need one; hidden types do not.
- In doubt between two types, take the lower bump (`fix` over `feat`, no release over `fix`) and
  say so in the note. Do not reclassify `auto` rows unless the commit's label is plainly wrong —
  `plan` lists every override.

## Phase 3 — Plan
`node scripts/semver.cjs plan <repo> <run>/<slug>/ledger.tsv --classes <run>/<slug>/classes.json
[--initial X.Y.Z] --out <run>/<slug>/plan.json --changelog <run>/<slug>/CHANGELOG.md`
→ `PLAN: READY releases=… latest=…` and one line per release (tag, commit, date, bump, PR or
direct). Release points are the integration points of the default branch's first-parent history:
each squash-merged or merged PR, and the last commit of each run of direct commits; a point with
nothing releasable rolls into the next, as it would have on the branch. `PLAN: BLOCKED` lists every
commit still needing a class (a revert split from its target by a release boundary brings its target
back), every tag that already exists elsewhere, and every commit after the newest planned tag that
semantic-release would still release by its raw message (an `experiment!:`, a stray `BREAKING
CHANGE:` line) — classify it releasable so a backfilled tag covers it; resolve each, re-plan. Read the changelog
preview; a wrong line is a wrong class, fixed in `classes.json`. `--dry-run` stops here: verdict
`PLANNED`.

## Phase 4 — Apply
`node scripts/semver.cjs apply <repo> <run>/<slug>/plan.json --push --releases` (drop `--releases`
for `--no-releases`). In order, and idempotent on a re-run: lightweight tags on the planned commits
(an existing tag on the same commit is kept; one elsewhere refuses) → a `semver/adopt-<date>` branch
committing the backfilled `CHANGELOG.md`, the manifest version (with its `Cargo.lock` / `uv.lock`
entry) and `init`'s `.releaserc.json` + `.github/workflows/release.yml` as `ci: adopt semantic-release`
(a symlinked target is refused before anything changes) → the tags pushed, the plan's base tag
included → the repository's
squash-merge commit title set to the PR title (so a one-commit PR never releases under its
`experiment:` subject) → the branch pushed and the PR opened → one GitHub Release per tag, oldest
first, the newest marked latest. Then the PR: its CI green and `MERGEABLE` → `gh pr merge <n>
--squash --delete-branch` (owner auto-merge, as in `fix`; `--no-merge` or branch protection → leave
it open and say so). After the merge, wait for the Release workflow's run on the default branch: it
must succeed and create **no** new tag (`git ls-remote --tags origin` shows nothing beyond the
plan's latest) — a new tag there means the history was released twice; stop and report it.

## Phase 5 — Verify
`git -C <repo> switch <default> && git -C <repo> pull --ff-only`, then
`node scripts/semver.cjs check <repo> <run>/<slug>/plan.json --remote` → `SEMVER: ADOPTED latest=…
next=…`: configuration valid and releasing from the default branch, the release workflow waiting
on a CI workflow that exists, every planned tag on its commit locally and on the remote, every
version in `CHANGELOG.md`, the manifest equal to the latest tag, squash merges titled by the PR.
`INCOMPLETE` names each gap — fix and re-check; it is never reported as adopted.

## What a later push does
From the merge on, the repository versions itself: a squash-merged PR titled `feat: …` releases a
minor, `fix: …` a patch, `feat!: …` (or a `BREAKING CHANGE:` line in the body) a major; `docs:`,
`chore:`, `ci:`, `test:`, `refactor:` and forge's `experiment:` commits release nothing. The release
job runs only after CI passes on the pushed commit, writes `CHANGELOG.md` and the manifest version
back as `chore(release): X.Y.Z [skip ci]`, tags it and publishes the GitHub Release. Tag-triggered
workflows (`android-release.yml`) are dispatched by the release job, since a tag pushed with
`GITHUB_TOKEN` starts no workflow.

## Safety Invariants
- **Owner role only**; contributor → `BLOCKED`, nothing written to their repository.
- **Tags before the merge** (above). Never move, delete or force-push a tag, never rewrite history:
  an existing `v`-tag is the base the plan continues from, and a conflicting one blocks the plan.
- **Public repository → the user's yes before anything is pushed.** Private output repos are the
  standard loop (`build`'s contract).
- **A model is never an author.** Tags, the adoption commit, the PR and release notes go out under
  the clone's git identity alone — no co-author trailer, no "Generated with …" footer.
- The user's working copy is never touched; the run's clone and artifacts stay in `<run>/`, which
  is gitignored (`/forge/`).

## Summary
Print one row per target: repository, host and role, base (`v`-tag or none), the releases created
(`first → latest`, count), commits classified by you (and overrides), next release `check` predicts,
the PR URL and whether it merged, GitHub Releases created, verdict. Then the reminder for every
local clone of a versioned repository: `git fetch --tags && git pull` (the default branch gained the
adoption commit and, from now on, `chore(release)` commits).

## Chain Handoff
Write `<run>/semver.tsv` (tab-separated, header `repo · dir · verdict · base · latest · releases ·
pr`, one row per target; `dir` is `<slug>`, the verdict `ADOPTED | PLANNED | BLOCKED`) and handoff.json: version "3.3.0",
source "semver", timestamp, status (COMPLETE | BLOCKED | USER_INTERRUPT | ERROR), verdict (the
weakest row: `BLOCKED` < `PLANNED` < `ADOPTED`), results_tsv (`semver.tsv`), findings (blocked
targets with their reason, overrides, warnings), config{targets, initial, releases: true|false,
merge: true|false}. Validate with `scripts/validate-handoff.sh <run>/handoff.json semver` — it
re-runs `semver.cjs check` for every `ADOPTED` row; on `INVALID` fix the run before the summary.
