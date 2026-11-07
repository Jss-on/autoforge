# Contributing to AutoForge

Whether you're fixing a typo, adding examples, creating a new sub-command, or improving the loop protocol — this guide will get you up and running.

## Quick Start

AutoForge is Markdown files that Claude Code, OpenCode, Codex, and Cursor discover from `skills/` and `commands/` directories. No build step, no compilation — edit a `.md` file, invoke the skill, see your changes.

```bash
# 1. Clone the repo
git clone https://github.com/Jss-on/autoforge.git
cd autoforge

# 2. Install via guided installer
./scripts/install.sh --claude --global   # Claude Code
./scripts/install.sh --opencode --global # OpenCode
bash scripts/install.sh --cursor --global # Cursor native skill
codex plugin marketplace add .          # Codex local plugin source
codex plugin add forge@forge-local

# 3. Or symlink for live editing (recommended for development)
ln -s $(pwd)/.claude/skills/forge ~/.claude/skills/forge
ln -s $(pwd)/.claude/commands/forge ~/.claude/commands/forge
ln -s $(pwd)/.claude/commands/forge.md ~/.claude/commands/forge.md
```

### Multi-Platform Sync

The canonical source is `.claude/`. After making changes, run the transform to sync all platforms:

```bash
./scripts/transform.sh              # sync to OpenCode + Codex + Cursor
./scripts/transform.sh --opencode   # OpenCode only
./scripts/transform.sh --codex      # Codex only
./scripts/transform.sh --cursor     # Cursor only
```

### Codex plugin development

The native plugin lives in `plugins/forge/`; `.agents/plugins/marketplace.json` registers it as
`forge@forge-local`. From this checkout, run `codex plugin marketplace add .` once, then
`codex plugin add forge@forge-local`. Use a new thread in another repository to test the installed
bundle independently of this repository's `.agents/skills/forge` copy.

Edit canonical commands and references under `.claude/`, then run `bash scripts/transform.sh --codex`
and `bash tests/test-codex-plugin.sh` (Git Bash on Windows). Command contracts and references stay
identical to canonical source; the generated Codex router binds invocation syntax, questions and
resource paths. Both Codex distribution trees include the same scripts and `agents/openai.yaml`.

After an edit, refresh the plugin manifest's `+codex.<timestamp>` build metadata using Codex's
Plugin Creator cachebuster helper, then run `codex plugin add forge@forge-local` again and start a
new thread. Product releases still use `scripts/release.sh`. For a GitHub installation, use the
[README update commands](README.md#codex-quick-start) instead of the local development marketplace.

### Cursor skill development

Edit canonical commands and references under `.claude/`, then run
`bash scripts/transform.sh --cursor` and `bash tests/test-cursor.sh`.
The generated `.cursor/skills/forge/` bundle uses the shared
Codex/Cursor generator: command contracts are copied unchanged, with a small Cursor router for
`/forge <subcommand>`, questions and resource paths. Do not edit the generated bundle directly.

Install with `bash scripts/install.sh --cursor --global`, or from another project's root run
`bash /path/to/autoforge/scripts/install.sh --cursor --local` to test a project installation.
Reload/reopen Cursor, start Agent chat in that project, and invoke `/forge design` or another
workflow. Git, Node.js and Bash are required; use Git Bash on Windows. Claude Code hooks are
not installed. See [Cursor skills](https://cursor.com/docs/skills).

## Repository Structure (v2.1.0)

```
forge/
├── .claude/                                       ← CANONICAL SOURCE — edit here first
│   ├── skills/forge/
│   │   ├── SKILL.md                               ← Thin routing table (41 lines)
│   │   └── references/                            ← 3 focused reference files
│   └── commands/
│       ├── forge.md                        ← Core loop (self-contained, ~110 lines)
│       └── forge/                          ← 12 subcommand files (self-contained)
├── .opencode/                                     ← OpenCode port (generated via transform.sh)
├── .agents/ + plugins/                            ← Codex port (generated via transform.sh)
├── .cursor/skills/forge/                           ← Cursor port (generated via transform.sh)
├── claude-plugin/                                 ← Distribution package (Claude Code plugin install)
├── scripts/
│   ├── install.sh                                 ← Guided installer (4 platforms)
│   ├── transform.sh                               ← .claude/ → .opencode/ + .agents/ + plugins/ + .cursor/ sync
│   ├── release.sh                                 ← Release automation
│   └── release.md                                 ← Release checklist
├── guide/                                         ← Guides — one per command + advanced patterns
├── docs/                                          ← Project docs (architecture, changelog, standards)
├── COMPARISON.md                                  ← Karpathy vs Claude AutoForge
└── CONTRIBUTING.md                                ← You are here
```

### What Each File Does

| File | Purpose | Edit when... |
|------|---------|-------------|
| `.claude/skills/forge/SKILL.md` | Thin routing table — subcommand list, defaults, universal flags | Adding subcommands, changing defaults |
| `.claude/commands/forge.md` | Core loop — self-contained instructions (~110 lines) | Changing loop behavior |
| `.claude/commands/forge/*.md` | Subcommand files — each self-contained with full instructions | Modifying any subcommand |
| `references/security-checklist.md` | STRIDE + OWASP checklist (loaded by security command) | Adding security checks |
| `references/predict-personas.md` | 5 expert personas (loaded by predict command) | Adding/modifying personas |
| `references/reason-judge-protocol.md` | Adversarial refinement protocol (loaded by reason command) | Changing judge/critic behavior |
| `scripts/transform.sh` | Platform transform (.claude/ → .opencode/ + .agents/ + plugins/ + .cursor/) | Adding new commands or reference files |
| `claude-plugin/` | Distribution package — synced from .claude/ during release | Don't edit directly — edit .claude/ |

## What to Contribute

### High-Value

| Type | Examples | Difficulty |
|------|----------|-----------|
| **New domain examples** | Add to `guide/examples-by-domain.md` | Easy |
| **Verification script templates** | Reusable verify/guard commands for common metrics | Easy |
| **Bug fixes** | Loop edge cases, incorrect behavior | Medium |
| **New sub-commands** | `/forge:refactor`, `/forge:test` | Medium |
| **OWASP/STRIDE additions** | New security checks | Medium |
| **Protocol improvements** | Better stuck-detection, smarter ideation | Hard |
| **MCP integration patterns** | Database, API, analytics verification examples | Hard |

### Low-Value (Please Don't)

- Reformatting or restructuring files without functional changes
- Adding comments to explain obvious things
- Whitespace-only changes

## Adding a New Sub-Command

### 1. Create the command file

```
.claude/commands/forge/yourcommand.md
```

Self-contained file with: YAML frontmatter (`name`, `description`, `argument-hint`), argument parsing, setup gate, loop/phases, output, chain handoff. Target: 80-120 lines.

### 2. Register in SKILL.md

Add one row to the subcommands table:
```markdown
| `/forge:yourcommand` | Description | Default iterations |
```

### 3. Create reference file (only if needed by 3+ commands)

Only create a reference in `references/` if shared by multiple commands. Single-command logic stays in the command file.

### 4. Run transform + update docs

```bash
./scripts/transform.sh   # sync to OpenCode + Codex + Cursor
```

Update: README.md (commands table), guide/ (new guide file), COMPARISON.md (subcommand count).

## Commit Messages

[Conventional commits](https://www.conventionalcommits.org/):

| Prefix | When |
|--------|------|
| `feat:` | New feature or sub-command |
| `fix:` | Bug fix |
| `docs:` | Documentation-only |
| `refactor:` | Restructuring without behavior change |
| `chore:` | Maintenance, version bumps |

## Pull Request Guidelines

1. **One PR = one feature.** Don't bundle unrelated changes.
2. **Branch from `master`.** Target `master` as base.
3. **Run `scripts/transform.sh`** after any changes to `.claude/`.
4. **Update docs** — README, guide, COMPARISON as needed.
5. **Don't bump the version.** Maintainers handle via `scripts/release.sh`.

## Testing

The harness has automated behavioral suites in `tests/test-*.sh`, a deterministic execution/handoff
seam in `scripts/smoke-seam.sh`, and installed-agent evaluations with an external oracle. Run affected
suites while editing, regenerate bundles with `scripts/transform.sh`, and run the full suite before
release. Use Node 24 and Bash (Git Bash on Windows). CI runs every suite and the seam smoke on
Linux, Windows and macOS; macOS uses system Bash and BSD tools. Shell files stay LF via
`.gitattributes`, including on Windows. Run `bash tests/test-install.sh` and
`bash tests/test-portability.sh` when changing platform support.

Required release evaluations use `AR_SMOKE_MODEL_REQUIRED=1` with `FORGE_EVAL_AGENT=claude|codex`;
a missing CLI, authentication, sandbox or oracle blocks the run. See
[the evaluation guide](guide/installed-evaluation.md) for setup, evidence and release policy.
Manual workflow checks remain useful:

1. Symlink your working tree (see Quick Start)
2. Open Claude Code in a real project
3. Invoke the command (`/forge`, `/forge:plan`, etc.)
4. Verify behavior matches your changes
5. Try edge cases — wrong metric? 0 files in scope? Guard always fails?

## Release Process

Contributors don't need to bump versions; maintainers release with the scripts below.

These terminal scripts maintain **AutoForge itself** at `Jss-on/autoforge`. Use `$forge ship`
for an application's own repository or deployment. Run the scripts from an AutoForge checkout
with Bash, Git, Node, the [harness prerequisites](README.md#prerequisites), and authenticated Git access.
Versioned releases also require the `gh` CLI and repository write access.
Both publication paths also require fresh installed Claude/Codex evaluations and independently
verified CI evidence for the prepared bundle. Missing or skipped required evaluations block release;
see the [installed evaluation guide](guide/installed-evaluation.md).

| Intent | Command | Result |
|--------|---------|--------|
| Publish committed product changes | `bash scripts/publish-autoforge.sh "publish: describe the change"` | One verified product commit on `master`; local source history is not published. |
| Prepare and release a new version | `bash scripts/release.sh X.Y.Z --title "Release title"` | Version updates, a reviewed PR, verified merge, version tag, and GitHub release. |

### Publish committed changes

Review and commit only the intended product files first. The publisher checks the **entire tracked
tree**, so keeping private/client output in an earlier commit's current tree still blocks publication.
Its credential gate checks filenames and PEM private-key headers; review content and use a dedicated
secret scanner for broader detection.

```bash
git status --short
git log -1 --oneline
git show --stat HEAD
bash scripts/publish-autoforge.sh "publish: harden security and shipment checks"
```

The last line performs a remote write after its gates pass. The script uses the `autoforge`
remote, creates that remote with the canonical URL if absent, and validates effective fetch and
push URLs against `Jss-on/autoforge`. The `origin` remote is not a publication destination.

Publication requires a fresh fetch of product `master` and proof that its tree appears in the
candidate's local ancestry. It rejects tracked client run directories, credential artifacts,
hidden index flags, and changes to HEAD, index, or tracked files during verification. Every
`tests/test-*.sh` suite and `scripts/smoke-seam.sh` must pass; `AUTOFORGE_SKIP_TESTS` cannot bypass them.

The publisher pushes a commit containing the exact verified tree with the fetched product commit
as its parent, then checks the remote receipt. The published commit ID can differ from local HEAD.
If the marketplace version has no remote tag, its tag and the commit are pushed atomically.
Existing version tags are preserved and unrelated local tags are not pushed. If the tree already
matches product `master`, the verified run reports that there is nothing to publish.

### Create a versioned release

Start in a clean product checkout with `master` at the freshly fetched `autoforge/master` commit.
A separate clone is useful when your development checkout contains private source history:

```bash
git clone --origin autoforge --branch master https://github.com/Jss-on/autoforge.git autoforge-release
cd autoforge-release
gh auth status
node -p "require('./claude-plugin/.claude-plugin/plugin.json').version"
# Choose an unused version greater than the one printed above.
bash scripts/release.sh 3.6.1 --title "Security and shipment hardening"
```

`3.6.1` is an example: replace it with the next intended version. Versions must increase, use
`X.Y.Z` without leading zeros, and have no existing release tag; an initial `v` is accepted.
Authenticate with `gh auth login` if needed before starting.

1. The script creates `release/X.Y.Z`, updates the three manifests, all generated skill versions, and
   version badges, then pauses for document review. Review `README.md`, `guide/`, `CONTRIBUTING.md`,
   and `COMPARISON.md`; press Enter to continue or type `abort` to retain local changes and stop.
2. It stages only release/documentation paths, commits them, runs all harness suites and the seam
   smoke, then pushes the verified release branch and creates a PR against product `master`.
3. Review the PR. Enter `merge` to continue; any other response leaves it open. The script waits
   for CI, requires a successful GitHub Actions `Harness test suites` check on that exact head,
   and checks that the PR is non-draft, cleanly mergeable, and has no blocking review decision.
4. It publishes a merge containing the verified tree and reviewed parents, verifies GitHub's
   merge receipt, tags that exact merge, and creates the GitHub release. Existing repository
   permissions and branch rules still apply; the script does not change or bypass them.

### Resolve a blocked publication

| Stop condition | How to proceed |
|----------------|----------------|
| Dirty tracked files or hidden index flags | Review the changes/flags, commit only intended files, and verify again. |
| Private output or credentials in the tree | Prepare a clean product candidate containing only intended distribution files. |
| Product changes absent from source history | Reconcile product changes or apply the intended commits on a fresh product checkout. |
| Tests fail, or the candidate changes during tests | Fix the failure, commit the candidate, and rerun publication gates. |
| PR head or product base advances | Update the candidate and rerun verification against the new revisions. |
| CI is pending, failed, or lacks the required harness success | Resolve the exact-head CI result before release. |
| Remote denies the push | Follow the repository's permitted merge workflow; do not bypass its rules. |
| Push, receipt lookup, tag, or release creation is interrupted | Inspect remote `master`, PR, tag, and release state before retrying; an earlier write may have succeeded. |

Neither script force-pushes, deletes branches, or automatically resets failed work. See the
[release and publication runbook](scripts/release.md) for the complete gate and retry contract.


## Getting Help

- **Questions?** Open an [issue](https://github.com/Jss-on/autoforge/issues)
- **Ideas?** Open an issue with `[Idea]` prefix
- **Discussion?** Tag [@Jss-on](https://github.com/Jss-on) in your PR

Thanks for contributing!

## Hook Development

### Adding a New Hook

1. Create `.claude/hooks/forge/{name}.cjs`
2. Use the shared library: `require('./lib/ar-hook-utils.cjs')`
3. Follow the pattern:
   ```js
   'use strict';
   const { isEnabled, safeParseStdin, log, block, allow, inject } = require('./lib/ar-hook-utils.cjs');
   try {
     if (!isEnabled('hook-name')) process.exit(0);
     const stdin = safeParseStdin();
     if (!stdin) process.exit(0);
     // ... hook logic ...
     process.exit(0);
   } catch {
     process.exit(0); // fail-open
   }
   ```
4. Register in `hooks.json` under the correct event
5. Run `bash scripts/transform.sh` to update the plugin distribution
6. Run `bash tests/test-hooks.sh` to verify

### Hook Rules

- **Fail-open:** Always wrap in try/catch, always exit 0 on error
- **No console.log:** Corrupts stdout JSON. Use `process.stderr.write()` for debug
- **No external deps:** Pure Node.js builtins only (exception: vendored `lib/ignore.cjs`)
- **Exit codes:** 0 = allow/inject, 2 = block. No other exit codes
- **State:** Use `/tmp/ar-session-{hash}.json` via `loadSessionState()` / `saveSessionState()`

### Testing Hooks

```bash
# Syntax check
node --check .claude/hooks/forge/my-hook.cjs

# Manual test
echo '{"tool_name":"Read","tool_input":{"file_path":"test.txt"}}' | node .claude/hooks/forge/my-hook.cjs
echo "Exit code: $?"

# Full test suite
bash tests/test-hooks.sh
```
