# /forge:semver — What Would semantic-release Have Released?

Every project `build` creates is versioned by [semantic-release](https://semantic-release.gitbook.io/)
from its first `feat`. `semver` brings the projects built before that level: it works out the version
history semantic-release would have produced if it had been running from the first commit, makes the
repository say so — a `vX.Y.Z` tag on each past release point, a `CHANGELOG.md` section and a GitHub
Release for each, the manifest version in step — and installs semantic-release so the next push is
versioned automatically.

## The rules (semantic-release's defaults)

| Commit | Release |
|---|---|
| `feat!: …`, `chore!: …`, any header with `!`, or a `BREAKING CHANGE:` line in the body (any case) | major |
| `feat: …` (and the upper-case `FEAT: …`) | minor |
| `fix: …`, `FIX: …`, `perf: …`, a revert git wrote (`Revert "…"` + "This reverts commit <sha>.") | patch |
| `docs:`, `style:`, `refactor:`, `test:`, `build:`, `ci:`, `chore:`, `revert:` alone, `Feat:`, forge's `experiment:` | none |

The first release is `1.0.0` (`Initial:` changes it). A revert and the commit whose header and full
sha it names cancel when both land in the same release; a squash title with ` (#5)`, an abbreviated
sha, a merge revert ("…, reversing changes made to …") or `git revert --reference` do not, exactly as
semantic-release sees them. A merge commit titled as a Conventional Commit counts like any other. The
preset is `conventionalcommits`: the `angular` preset ignores `feat!:`.

## Before the first run

| Need | How |
|---|---|
| The GitHub CLI logged in, owner of the repository | `gh auth login` |
| A CI workflow on the default branch | The release job runs after it passes (`workflow_run`); without one, `init` warns |
| Nothing else locally | semantic-release runs in the repository's CI through `npx`; nothing is installed in the project |

## Invocation

```
/forge:semver --dry-run                       # plan only: version table + changelog preview
/forge:semver                                 # the current repository, end to end
/forge:semver Target: acme/payroll, acme/pos  # several repositories, one summary
/forge:semver Initial: 0.1.0 --no-releases    # 0.x, tags and changelog without GitHub Release objects
```

| Argument | Meaning |
|---|---|
| `Target:` | Local path or `owner/repo`; comma-separated for several |
| `Initial:` | First version when there is no `v`-tag (default `1.0.0`) |
| `--dry-run` | Scan, classify, plan; nothing tagged, committed or pushed (`PLANNED`) |
| `--no-releases` | No GitHub Release objects |
| `--no-merge` | Open the adoption PR and leave it for you |

## What happens

1. **Workspace** — a fresh clone in the run directory. Your own clone is never switched, tagged or
   committed in. Only repositories you own (`host.cjs detect` → `owner`); a public one asks first.
2. **Scan** — `semver.cjs scan <repo> --out ledger.tsv`: one row per commit since the highest `v`-tag.
   Conventional Commits are `auto`, merges `merge`, revert pairs `pair:<sha>`, everything else `todo`.
3. **Classify** — for each `todo` commit you decide what it was, from `git show --stat` and the diff,
   and write `classes.json`: `{"<sha>": {"type": "feat", "note": "running totals on every invoice"}}`.
   A `feat`, `fix`, `perf` or breaking class needs a note — it becomes the changelog line. In doubt,
   the lower bump. A merged PR full of experiments may be classified once, at the merge row.
4. **Plan** — `semver.cjs plan … --classes classes.json --out plan.json --changelog CHANGELOG.md`.
   Release points are the default branch's integration points: each merged or squash-merged PR and
   the last commit of each run of direct commits; a point with nothing releasable rolls into the next.
   `BLOCKED` lists every commit still needing a class and every tag that already exists elsewhere.
5. **Apply** — `semver.cjs apply <repo> plan.json --push --releases`: tags on the planned commits →
   the adoption commit (`CHANGELOG.md`, manifest version, `.releaserc.json`, `release.yml`) on a
   `semver/adopt-<date>` branch → **the tags pushed first** → squash merges titled by the PR → the
   branch pushed and the PR opened → a GitHub Release per tag, newest marked latest. The PR merges
   once its CI is green; the first release run then finds the newest tag and releases nothing.
6. **Verify** — `semver.cjs check <repo> plan.json --remote` → `SEMVER: ADOPTED latest=… next=…`.

## After adoption

| You merge | semantic-release releases |
|---|---|
| A PR titled `feat: monthly statements` | the next minor, with a Features line |
| A PR titled `fix: rounding of overtime` | the next patch, with a Bug Fixes line |
| A PR titled `feat!: drop the v1 API` | the next major, with a BREAKING CHANGES section |
| `docs:`, `chore:`, `test:`, `ci:`, `refactor:` | nothing |

The release job commits `CHANGELOG.md` and the manifest version as `chore(release): X.Y.Z [skip ci]`,
tags it and publishes the GitHub Release; pull before you branch. Tag-triggered workflows
(`android-release.yml`) are dispatched by the release job. Deploying stays `/forge:ship`'s, human-gated.

## Output

```
forge/semver-261018-1030/
├── semver.tsv                # one row per target: repo, dir, verdict, base, latest, releases, pr
├── handoff.json              # source "semver"; validate-handoff re-runs check for every ADOPTED row
└── payroll/
    ├── repo/                 # the clone the work happened in
    ├── ledger.tsv            # scan
    ├── classes.json          # your classifications
    ├── plan.json             # the releases, with their notes
    └── CHANGELOG.md          # the preview
```

## Limits

- GitHub only for the remote steps; on GitLab the plan is the deliverable (host protocol §2).
- Version fields: `package.json` (+ lockfile) through `@semantic-release/npm` with `npmPublish: false`;
  the `version` of `pyproject.toml`'s `[project]` (or `[tool.poetry]`) table or `Cargo.toml`'s
  `[package]` table — never another table's — with the project's own entry in `uv.lock` / `Cargo.lock`,
  and `<Version>` in `.csproj` / `Directory.Build.props`, through `sed`. A dynamic or absent version is
  left to the tags.
- The release job resolves its tool chain as it stood when forge pinned it (`npm_config_before`) and
  runs no install scripts: nothing published later runs with the repository's write token.
- Repository writes refuse a committed symlink (a `CHANGELOG.md` pointing outside the clone).
- History is never rewritten and no existing tag is moved; the plan continues from the highest
  `v`-tag reachable from the default branch.
