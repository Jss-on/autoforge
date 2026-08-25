# Codebase Summary

## Overview

AutoForge v2.1.0 ships as a modular, multi-platform autonomous iteration framework. The canonical source lives in `.claude/`; `scripts/transform.sh` produces OpenCode and Codex distributions. There is no compiled code and near-zero runtime dependencies.

## File Inventory

| Directory | Purpose | Primary Types |
|-----------|---------|---------------|
| `.claude/commands/` | Core loop + 13 subcommand files (self-contained) | `.md` |
| `.claude/skills/forge/` | Thin routing SKILL.md + 3 reference files | `.md` |
| `.opencode/commands/` | OpenCode distribution (underscore naming) | `.md` |
| `.opencode/skills/forge/` | OpenCode skill + reference copies | `.md` |
| `plugins/forge/` | Codex plugin: skill, references, command files, plugin.json | `.md`, `.json` |
| `.agents/skills/forge/` | Codex agents: skill, references, commands | `.md` |
| `guide/` | User-facing documentation and tutorials | `.md` |
| `guide/scenario/` | Real-world scenario walkthroughs (10 domains) | `.md` |
| `docs/` | Project documentation | `.md` |
| `scripts/` | Platform transform and installer | `.sh`, `.md` |
| Root | README, LICENSE, COMPARISON, CONTRIBUTING | `.md` |

## Key Files

| File | Purpose |
|------|---------|
| `.claude/skills/forge/SKILL.md` | Thin routing table (41 lines) — loaded by Claude Code per invocation |
| `.claude/commands/forge.md` | Core loop command — self-contained protocol, ~110 lines |
| `.claude/commands/forge/evals.md` | NEW: one-shot TSV analysis — trends, plateaus, regressions |
| `.claude/skills/forge/references/predict-personas.md` | 5 default expert personas used by predict subcommand |
| `.claude/skills/forge/references/reason-judge-protocol.md` | Blind judge scoring protocol for reason subcommand |
| `.claude/skills/forge/references/security-checklist.md` | STRIDE + OWASP checklist used by security subcommand |
| `claude-plugin/.claude-plugin/plugin.json` | Claude Code plugin metadata — version 2.1.0 |
| `plugins/forge/.codex-plugin/plugin.json` | Codex plugin metadata — version 2.1.0-codex.0 |
| `scripts/transform.sh` | Single script that generates all platform distributions from `.claude/` source |
| `scripts/install.sh` | Guided interactive installer |
| `README.md` | Project README with installation, usage, FAQ |
| `COMPARISON.md` | Karpathy's autoresearch vs Claude AutoForge |
| `CONTRIBUTING.md` | Contribution guidelines |

## Subcommand Registry

| Command | Loop Shape | Default Iterations |
|---------|-----------|-------------------|
| `/forge` | commit → verify → keep/discard | 25 |
| `/forge:plan` | one-shot wizard | N/A |
| `/forge:debug` | hypothesis iteration | 15 |
| `/forge:fix` | commit → verify → revert (error count) | 20 |
| `/forge:security` | attack vector iteration | 15 |
| `/forge:ship` | linear 8-phase pipeline | N/A |
| `/forge:scenario` | 12-dimension exploration | 20 |
| `/forge:predict` | one-shot 5-persona debate | N/A |
| `/forge:learn` | doc → validate → fix loop | 10 |
| `/forge:reason` | adversarial refinement | 8 |
| `/forge:probe` | round-based interrogation | 15 |
| `/forge:improve` | saturation research + PRD generation | 15 |
| `/forge:evals` | one-shot TSV analysis | N/A |

## Key Dependencies

| Dependency | Type | Purpose |
|------------|------|---------|
| Claude Code CLI | Runtime (host) | Plugin system, skill loading, command registration |
| OpenCode CLI | Runtime (host) | OpenCode skill and command runtime |
| Codex CLI | Runtime (host) | Codex skill runtime |
| Git | Runtime (system) | State management, rollback, memory, staleness detection |
| Bash/Zsh | Runtime (system) | Shell scripts, verify/guard commands |
| GitHub CLI (`gh`) | Optional | PR creation and release management in ship workflow |

No `package.json`, `requirements.txt`, `Cargo.toml`, or Python wrapper CLI. The v2.0.x Python wrapper (`forge_cli.py`) was removed in v2.1.0.

## Output Directories

All subcommands write to `forge/{subcommand}-{YYMMDD}-{HHMM}/`:

| Output File | Written By |
|-------------|-----------|
| `*-results.tsv` | All looping subcommands |
| `handoff.json` | All subcommands (chain integration) |
| `evals-summary.md` | evals command, or any command with `--evals` flag |
| `evals-summary.json` | evals command with `--format json` |
| `security-report.md` | security subcommand |
| `ship-log.md` | ship subcommand |
| `scenario-results.md` | scenario subcommand |
| `predict-report.md` | predict subcommand |
| `learn/` subdirectory | learn subcommand: `learn-results.tsv`, `summary.md`, `validation-report.md` |
| `probe-spec.md`, `constraints.tsv` | probe subcommand |
| `research-findings.md`, `improvement-plan.md`, `prd-*.md` | improve subcommand |

TSV files include a `# metric_direction: higher_is_better|lower_is_better` comment on line 1. Status values: `baseline`, `keep`, `keep (reworked)`, `discard`, `crash`, `no-op`, `hook-blocked`, `metric-error`.

See also: [Project Overview](project-overview-pdr.md) | [System Architecture](system-architecture.md) | [Code Standards](code-standards.md)
