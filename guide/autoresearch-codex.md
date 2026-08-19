# AutoForge for Codex — v2.3.0

Codex distribution of AutoForge's `autoresearch` engine. Same 19 commands, same flags, same output contracts as the Claude Code version. Entry point: `$autoresearch <command>`.

---

## Install

Requires access to the private repo [Jss-on/autoforge](https://github.com/Jss-on/autoforge) (`gh auth login`, or SSH):

```bash
git clone https://github.com/Jss-on/autoforge
cd autoforge
./scripts/install.sh --codex --global
```

Or via transform script if self-hosting:

```bash
./scripts/transform.sh
# Regenerates the Codex trees: plugins/autoresearch/ and .agents/
```

---

## Invocation Syntax

Codex uses `$autoresearch` prefix:

| Claude Code | Codex |
|-------------|-------|
| `/autoresearch` | `$autoresearch` |
| `/autoresearch:debug` | `$autoresearch debug` |
| `/autoresearch:security` | `$autoresearch security` |
| `/autoresearch:evals` | `$autoresearch evals` |
| `/autoresearch:ship` | `$autoresearch ship` |

All 19 commands follow the same pattern: `$autoresearch <command> [flags]`.

---

## All 18 Commands

| Command | Default Iterations | Purpose |
|---------|-------------------|---------|
| `$autoresearch` | 25 | Core metric optimization loop |
| `$autoresearch plan` | one-shot | Structured planning wizard |
| `$autoresearch requirements` | one-shot | Client brief → validated build spec |
| `$autoresearch build` | 40 | Greenfield full-stack build via the full SDLC (6 weighted dims, logic-gated) |
| `$autoresearch feature` | 25 | Feature addition — delta acceptance + non-regression ratchet |
| `$autoresearch test` | 20 | Full QA engagement on existing software — risk-based plan, RTM, formal test design, execution + defect ledger, exit-criteria verdict (ISO 29119/ISTQB-aligned) |
| `$autoresearch debug` | 15 | Root cause investigation |
| `$autoresearch fix` | 20 | Root-cause-first repair |
| `$autoresearch security` | 15 | STRIDE + OWASP audit |
| `$autoresearch ship` | linear | Deployment pipeline |
| `$autoresearch scenario` | 20 | Edge case + dimension exploration |
| `$autoresearch predict` | one-shot | Multi-persona foresight |
| `$autoresearch learn` | 10 | Documentation generation |
| `$autoresearch reason` | 8 | Adversarial design refinement |
| `$autoresearch probe` | 15 | Requirements interrogation |
| `$autoresearch improve` | 15 | ICP research → improvement PRDs |
| `$autoresearch evals` | one-shot | Results TSV analysis |
| `$autoresearch regression` | gate | Stability gate — STABLE/UNSTABLE verdict |

---

## Usage Examples

### Core loop

```
$autoresearch
Iterations: 20
Goal: Reduce bundle size below 200KB
Scope: src/**/*.ts
Metric: bundle size in KB (lower is better)
Verify: npm run build 2>&1 | grep "First Load JS"
Guard: npm test
```

### Debug with auto-fix

```
$autoresearch debug --fix
Scope: src/**/*.ts
Symptom: Payment confirmations silently failing
Iterations: 20
```

### Security audit (CI mode)

```
$autoresearch security --fail-on critical --diff
Iterations: 15
```

### Evals after loop

```
$autoresearch evals --format json --recommend
```

### Full chain

```
$autoresearch predict --chain scenario,debug,fix,ship
Scope: src/**
Goal: Full quality pipeline for v2.0 release
```

---

## Universal Flags (all commands)

| Flag | Purpose |
|------|---------|
| `Iterations: N` | Hard cap on loop iterations |
| `Iterations: unlimited` | Run until goal or convergence |
| `--evals` | Run evals analysis after loop |
| `--evals-interval N` | Checkpoint analysis every N iterations |
| `--chain <targets>` | Chain to next command(s) via handoff.json |

---

## File Layout (Codex)

`transform.sh` regenerates two Codex trees in the repo; `install.sh --codex` copies the skill to `~/.codex/skills/`:

```
plugins/autoresearch/                ← Codex plugin package
├── .codex-plugin/plugin.json        ← plugin manifest
└── skills/autoresearch/
    ├── SKILL.md                     ← thin router
    ├── autoresearch.md              ← core loop
    ├── <command>.md                 ← 18 subcommand files (19 commands total)
    └── references/                  ← on-demand reference files

.agents/                             ← Codex agent tree (same skill, agent layout)
└── skills/autoresearch/
```

No `autoresearch-command-spec.json` — each command file is self-contained.

---

## Platform Differences

| Concept | Claude Code | Codex |
|---------|-------------|-------|
| Slash command | `/autoresearch:debug` | `$autoresearch debug` |
| Skills dir | `.claude/skills/` | `~/.codex/skills/` (installed from `.agents/`) |
| User questions | `AskUserQuestion` | Direct question batch |
| Chain handoff | `handoff.json` | `handoff.json` (identical) |
| Results TSV | Same format | Same format |
| Output dirs | Same structure | Same structure |

`handoff.json` and all `*-results.tsv` files are identical across platforms — cross-platform chains work without modification.

---

## Related Guides

- [getting-started.md](getting-started.md) — all 3 platform installs
- [chains-and-combinations.md](chains-and-combinations.md) — pipeline patterns (syntax-agnostic)
- [advanced-patterns.md](advanced-patterns.md) — transform.sh, CI/CD, multi-platform
