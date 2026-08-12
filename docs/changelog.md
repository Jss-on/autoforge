# Changelog

Generated from git history. Grouped by type using conventional commit parsing.

## v2.1.0

### Features
- `feat:` modular rebuild — thin SKILL.md routing table (41 lines) + 12 self-contained command files
- `feat:` add `/autoresearch:evals` subcommand — one-shot TSV trend and plateau analysis
- `feat:` `--evals` and `--evals-interval` flags on all looping commands
- `feat:` TSV `# metric_direction` comment for auto-detection by evals
- `feat:` 8 TSV status values — added `keep (reworked)`, `hook-blocked`, `metric-error`
- `feat:` `scripts/transform.sh` single multi-platform transform script

### Removed
- `chore:` remove `autoresearch-command-spec.json` — contracts live in command files
- `chore:` remove `scripts/sync-opencode.sh` and `scripts/sync-codex.sh` — replaced by transform.sh
- `chore:` remove Python wrapper CLI (`autoresearch_cli.py`)
- `chore:` collapse 13 reference files down to 3 focused references

### Release
- `release:` v2.1.0 — modular rebuild, evals, 95% token reduction

## v2.0.04

### Fixed
- `fix:` YAML colon escape issues in SKILL.md frontmatter across platforms
- `fix:` sync script path handling for edge cases with special characters

### Release
- `release:` v2.0.04 — YAML and sync script stability

## v2.0.0

### Features
- `feat:` multi-platform GA — Claude Code, OpenCode, Codex all fully supported
- `feat:` `allowed-tools` declaration on all Claude Code and claude-plugin command files

### Fixed
- `fix:` SKILL.md YAML frontmatter uses folded block scalars — strict parsers no longer reject description field
- `fix:` sync scripts pass paths via argv instead of shell string interpolation
- `fix:` install.sh validates destination path depth before rm -rf

### Release
- `release:` v2.0.0 — multi-platform GA

## v1.10.0

### Features
- `feat:` add `/autoresearch:probe` — adversarial multi-persona requirement interrogation engine
- `feat:` 8 personas, mechanical saturation termination, constraint extraction

### Release
- `release:` v1.10.0 — probe subcommand

## v1.8.0

### Features
- `feat:` add `/autoresearch:learn` — autonomous codebase documentation engine
- `feat:` 4 modes: init, update, check, summarize; diff-based targeting for update mode

### Release
- `release:` v1.8.0 — learn subcommand

## v1.7.6

### Documentation
- `docs:` add COMPARISON.md — Karpathy vs Claude Autoresearch
- `docs:` add 10 scenario-based guide examples in guide/scenario/

### Release
- `release:` v1.7.6 — scenario guides, comparison doc

## v1.7.0 — v1.7.5

### Features
- `feat:` add `/autoresearch:predict` — multi-persona swarm prediction (v1.7.0)

### Fixed
- `fix:` resolve ENAMETOOLONG recursive plugin caching
- `fix:` address 8 stability bugs from debug audit
- `fix:` streamline command files for faster trigger and live streaming

### Release
- `release:` v1.7.0 — predict subcommand

## v1.6.0 — v1.6.2

### Features
- `feat:` add `/autoresearch:scenario` subcommand
- `feat:` release workflow with PR-first flow and doc review gate

### Fixed
- `fix:` harden git-as-memory mechanism in autonomous loop

### Release
- `release:` v1.6.x — scenario subcommand

## v1.3.0 — v1.5.0

### Features
- `feat:` enforce mandatory AskUserQuestion gate for all commands
- `feat:` batched AskUserQuestion setup — ask 3-4 questions at once
- `feat:` add `/autoresearch:reason` adversarial refinement loop

### Fixed
- `fix:` replace /loop N with native Iterations: N config

See also: [Development Roadmap](development-roadmap.md) | [Project Overview](project-overview-pdr.md)
