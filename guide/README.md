<div align="center">

# AutoForge Guides

![Version](https://img.shields.io/badge/version-2.3.0-blue.svg)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](../LICENSE)

</div>

---

Everything you need to master autonomous iteration — from first run to advanced multi-command chains. Each guide is self-contained with examples, flags, chains, and tips.

> 📘 **Flagship playbook:** [Building Software with AutoForge](building-software-with-forge.md) — the end-to-end `requirements` → `build` → `feature` walkthrough: the acceptance model in depth, growing large systems under the ratchet, troubleshooting, and a complete worked example.

---

## Quick Start

Requires access to the private repo [Jss-on/autoforge](https://github.com/Jss-on/autoforge) — see [Getting Started](getting-started.md). Then, inside Claude Code:

```
/plugin marketplace add Jss-on/autoforge
/plugin install forge@autoforge
/forge
```

---

## Guide Index

| Guide | Description |
|-------|-------------|
| [Getting Started](getting-started.md) | Installation, first run, core concepts |
| **[Building Software with AutoForge](building-software-with-forge.md)** | **Flagship playbook — `requirements` → `build` → `feature`: full SDLC engine, six-dimension acceptance, the ratchet** |
| [/forge — Orchestrator](forge-orchestrator.md) | Autonomous orchestrator — type a plain-language goal, the system selects and loops the pipeline |
| [/forge](forge.md) | Core autonomous loop — modify, verify, keep/discard, repeat |
| [/forge:plan](forge-plan.md) | One-shot wizard — Goal → Scope, Metric, Verify |
| [/forge:debug](forge-debug.md) | Autonomous bug-hunting with scientific method |
| [/forge:fix](forge-fix.md) | Error crusher — tests, types, lint, build |
| [/forge:security](forge-security.md) | STRIDE + OWASP + red-team security audit |
| [/forge:ship](forge-ship.md) | 8-phase shipping workflow |
| [/forge:scenario](forge-scenario.md) | Scenario explorer — 12 dimensions |
| [/forge:predict](forge-predict.md) | 5 expert personas debate before you act |
| [/forge:learn](forge-learn.md) | Autonomous documentation engine |
| [/forge:reason](forge-reason.md) | Adversarial refinement with blind judges |
| [/forge:probe](forge-probe.md) | 8 personas interrogate requirements to saturation |
| [/forge:improve](forge-improve.md) | Research ICP challenges, discover improvements, generate PRDs |
| [/forge:evals](forge-evals.md) | Analyze results TSV — trends, plateaus, checkpoints |
| [/forge:regression](forge-regression.md) | Stability gate — baseline diff, STABLE/UNSTABLE verdict before you push |
| [/forge:test](../README.md#commands) | Full QA engagement on existing software — risk-based plan, RTM, formal test design, execution + defect ledger, exit-criteria verdict (ISO 29119/ISTQB-aligned) |
| [/forge:design](forge-design.md) | UI/UX designer + design QA — direction protocol → machine-readable `DESIGN.md`; independent design audit (anti-slop floor, heuristic critique, personas, ledger, `SHIP|FIX|REBUILD`); bounded `--fix` remediation |
| [/forge:research](forge-research.md) | Deep research engagement — scholarly + web sweep, primary-literature reading, source-anchored claims ledger, cited dossier with `DOSSIER_READY|DOSSIER_BLOCKED` verdict |
| [Chains & Combinations](chains-and-combinations.md) | Multi-command pipelines with all 20 commands |
| [Examples by Domain](examples-by-domain.md) | Real-world examples: software, sales, marketing, DevOps, ML, HR |
| [Advanced Patterns](advanced-patterns.md) | Guards, MCP, CI/CD, evals checkpoints, transform.sh |
| [Hooks Reference](hooks.md) | 9 auto-firing hooks: safety gates, context injection, notifications |
| **[Scenario Guides](scenario/)** | **Real-world scenario walkthroughs** |

---

## Quick Decision Guide

| I want to... | Use |
|--------------|-----|
| Give a plain-language goal, let it self-orchestrate | bare `/forge <goal>` |
| Improve test coverage / reduce bundle size / any metric | `/forge` |
| Don't know what metric to use | `/forge:plan` |
| Requirements are unclear — surface hidden constraints | `/forge:probe` |
| Run a security audit | `/forge:security` |
| Ship a PR / deployment / release | `/forge:ship` |
| Hunt all bugs in a codebase | `/forge:debug` |
| Fix all errors (tests, types, lint) | `/forge:fix` |
| Debug then auto-fix | `/forge:debug --fix` |
| Check if something is ready to ship | `/forge:ship --checklist-only` |
| Explore edge cases for a feature | `/forge:scenario` |
| Generate test scenarios | `/forge:scenario --format test-scenarios` |
| Run a full QA engagement on an existing app (plan → RTM → verdict) | `/forge:test` |
| Get expert opinions before starting | `/forge:predict` |
| Debate an architecture decision | `/forge:reason --domain software` |
| Generate docs for a new codebase | `/forge:learn --mode init` |
| Update existing docs after changes | `/forge:learn --mode update` |
| Discover what to build next for your ICP | `/forge:improve` |
| Analyze loop results, detect plateaus | `/forge:evals` |
| Verify a change is safe to push (catch regressions) | `/forge:regression` |
| Gate, auto-fix, then ship in one chain | `/forge:regression --predict --evals --fix --ship` |
| Optimize without breaking existing tests | `/forge` with `Guard: npm test` |
| Bound any looping command | Add `Iterations: N` inline |

---

<div align="center">

**AutoForge** — built on the forge engine by Udit Goenka (MIT) — see [NOTICE](../NOTICE) | [GitHub](https://github.com/Jss-on/autoforge)

</div>
