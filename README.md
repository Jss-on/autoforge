<div align="center">

# AutoForge

**Turn [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [OpenCode](https://opencode.ai), or [OpenAI Codex](https://developers.openai.com/codex) into a relentless improvement engine.**

AutoForge is the product; `forge` is its command namespace — every command is `/forge:*` (renamed from `/autoresearch:*` in v3.0.0).

Based on [Karpathy's autoresearch](https://github.com/karpathy/autoresearch) — constraint + mechanical metric + autonomous iteration = compounding gains.

[![Claude Code Skill](https://img.shields.io/badge/Claude_Code-Skill-blue?logo=anthropic&logoColor=white)](https://docs.anthropic.com/en/docs/claude-code)
[![OpenCode](https://img.shields.io/badge/OpenCode-Skill-purple)](https://opencode.ai)
[![Codex](https://img.shields.io/badge/Codex-Skill-green?logo=openai&logoColor=white)](https://developers.openai.com/codex)
![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)

[![Based on](https://img.shields.io/badge/Based_on-Karpathy's_Autoresearch-orange)](https://github.com/karpathy/autoresearch)

<br>

*"Set the GOAL → The agent runs the LOOP → You wake up to results"*

*You don't need AGI. You need a goal, a metric, and a loop that never quits.*

**Supports Claude Code, OpenCode, and OpenAI Codex. 20 commands. 9 safety hooks. Thin-router token architecture — command bodies load only when invoked.**

> **v3.0.0 — The `forge` rename.** Every command moved from the `autoresearch` namespace to `forge`: `/forge:build`, `/forge:test`, `/forge:fix`, … (`forge_*` on OpenCode, `$forge` on Codex). Same engine, same protocol — new name matching the product. Run outputs now land in `forge/<cmd>-<timestamp>/`; pre-3.0 `autoresearch/` run dirs stay valid as history. Reinstall the plugin (`/plugin marketplace add Jss-on/autoforge`, then install `forge`) to pick up the new commands. Env vars keep the `AR_` prefix.
>
> **v2.4 — The unattended delivery loop.** `/forge:test` runs a full **QA engagement** (ISO 29119/ISTQB-shaped: risk-based plan, RTM, formal test design, evidence-anchored execution, defect ledger, mechanical `RELEASE_RECOMMENDED | RELEASE_BLOCKED` verdict) and `/forge:fix` is its **builder counterpart** — defect-ledger remediation, root-cause iron law, an independence ceiling (fix may mark `fixed`, only a `test` re-engagement grants `verified`). PRs the loop opens **merge themselves once every CI check is green** (branch protection always wins; deploying stays human-gated). `requirements` now runs a **latent-intent elicitation protocol** — domain recon before the first question, day-in-the-life walkthroughs, the Kano must-be checklist, throwaway-wireframe reaction rounds — so what the client *couldn't articulate* still lands in the SRS. All browser verification runs on **Playwright**, so the same gates pass on a workstation and in CI. You supply requirements and a command; the loop does the rest.
>
> **v2.3 — Logic-first acceptance:** the build pipeline grades **six weighted dimensions** with a **gating `logic` dimension** — golden vectors derived from the SRS must all compute correctly, or the headline score is hard-capped at 0.50. See **[Logic-first (v2.3)](#logic-first-v23)**.
>
> **v2.2 — Autonomous Orchestrator:** Type a plain-language goal to `/forge` and it classifies your goal, derives a Success predicate, confirms it once, then loops across subcommands until done. `Metric:`/`Verify:` invocations run the classic loop unchanged. See [guide/forge-orchestrator.md](guide/forge-orchestrator.md).
>
> **Build pipeline:** a full **SDLC engine** for building complex software — `/forge:requirements` → `/forge:build` (greenfield) or `/forge:feature` (existing app) → `/forge:test` ↔ `/forge:fix` (independent QA ↔ remediation) → `regression` → `ship`. Builds to **passing acceptance across six weighted dimensions** (logic · functional · UI/UX · devops · monitoring · hardening), conforms to a `DESIGN.md`, and verifies live in a real browser with **Playwright**. See **[Building Complex Software](#building-complex-software)**.

<br>

[How It Works](#how-it-works) · [Commands](#commands) · [Build Software](#building-complex-software) · [Quick Start](#quick-start) · [Guides](guide/) · [FAQ](#faq)

</div>

---

```
     PLAN             LOOP            DEBUG             FIX             SECURE            SHIP
 ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
 │   Goal   │     │  Modify  │     │   Find   │     │   Fix    │     │  STRIDE  │     │  Stage   │
 │  Metric  │────▶│  Verify  │────▶│   Bugs   │────▶│  Errors  │────▶│  OWASP   │────▶│  Deploy  │
 │  Scope   │     │Keep/Drop │     │  Trace   │     │  Repair  │     │ Red Team │     │ Release  │
 └──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
 /forge:   /forge    /forge:   /forge:   /forge:   /forge:
   plan                              debug            fix              security         ship

 ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
 │  Probe   │     │ Scenario │     │ Predict  │     │  Reason  │
 │ Require- │     │   Edge   │     │ 5-Expert │     │  Debate  │
 │  ments   │     │  Cases   │     │  Swarm   │     │ Converge │
 └──────────┘     └──────────┘     └──────────┘     └──────────┘
 /forge:   /forge:   /forge:   /forge:
   probe            scenario         predict          reason

 ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
 │  Learn   │     │ Improve  │     │   Eval   │     │ Baseline │
 │   Docs   │     │ Research │     │ Analyze  │     │   Diff   │
 │   Gen    │     │   PRDs   │     │ Results  │     │ Verdict  │
 └──────────┘     └──────────┘     └──────────┘     └──────────┘
 /forge:   /forge:   /forge:   /forge:
   learn            improve          evals            regression

   ── Build pipeline (full SDLC) ──────────────────────────────

 ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
 │ Require- │     │  Build   │     │ Feature  │     │   Test   │     │   Fix    │
 │  ments   │────▶│Greenfield│────▶│ Brownfld │────▶│ QA / RTM │────▶│  Defect  │
 │  → spec  │     │full SDLC │     │ +ratchet │  ┌─▶│ Verdict  │     │  Ledger  │──┐
 └──────────┘     └──────────┘     └──────────┘  │  └──────────┘     └──────────┘  │
 /forge:   /forge:   /forge:│  /forge:   /forge:│
   requirements     build            feature     │    test             fix         │
                                                 └─────── verified ◀───────────────┘
```

---

## Why This Exists

[Karpathy's autoresearch](https://github.com/karpathy/autoresearch) demonstrated that a 630-line Python script could autonomously improve ML models overnight — **100 experiments per night** — by following simple principles: one metric, constrained scope, fast verification, automatic rollback, git as memory.

**AutoForge generalizes these principles to ANY domain.** Not just ML — code, content, marketing, sales, HR, DevOps, or anything with a number you can measure.

**v2.1.0 was a major architecture rebuild.** The monolithic SKILL.md, loaded in full on every invocation, was replaced with a thin router (~8KB, always resident) plus self-contained command files (~3–35KB, loaded only when invoked) and reference files pulled on demand — the same capability surface at a fraction of the tokens.

---

## How It Works

```
LOOP (N iterations or until done):
  1. Review current state + git history + results log
  2. Pick the next change (based on what worked, what failed, what's untried)
  3. Make ONE focused change
  4. Git commit (before verification)
  5. Run mechanical verification (tests, benchmarks, scores)
  6. If improved → keep. If worse → git revert. If crashed → fix or skip.
  7. Log the result
  8. Repeat until N iterations complete or goal is met.
```

Every improvement stacks. Every failure auto-reverts. Progress is logged in TSV format.

### The Setup Phase

Before looping, Claude performs a one-time setup:

1. **Read context** — reads all in-scope files
2. **Define goal** — extracts or asks for a mechanical metric
3. **Define scope** — which files can be modified vs read-only
4. **Establish baseline** — runs verification on current state (iteration #0)
5. **Confirm and go** — shows setup, then begins the loop

### 8 Critical Rules

| # | Rule |
|---|------|
| 1 | **Bounded by default** — every command has a default iteration count; unlimited is opt-in via `Iterations: unlimited` |
| 2 | **Read before write** — understand full context before modifying |
| 3 | **One change per iteration** — atomic changes; if it breaks, you know why |
| 4 | **Mechanical verification only** — no subjective "looks good"; use metrics |
| 5 | **Automatic rollback** — failed changes revert instantly |
| 6 | **Simplicity wins** — equal results + less code = keep |
| 7 | **Git is memory** — experiments committed with `experiment:` prefix; agent reads `git log` + `git diff` before each iteration |
| 8 | **When stuck, think harder** — re-read, combine near-misses, try radical changes |

---

## Hooks & Safety

v2.1.1 ships a 9-hook safety system that protects your sessions automatically. Hooks fire on every session — not just during forge commands.

### What's Protected

| Hook | What it does | Event |
|------|-------------|-------|
| **scout-block** | Blocks node_modules/, .git/, __pycache__/, etc. from filling your context | PreToolUse |
| **privacy-block** | Blocks .env, SSH keys, credentials from being read in sessions | PreToolUse |
| **dangerous-cmd-block** | Blocks force-push, `rm -rf`, `git reset --hard` | PreToolUse |
| **iteration-context** | Injects recent TSV iteration data after context compaction | UserPromptSubmit |
| **subagent-context** | Gives subagents awareness of active loop state | SubagentStart |
| **dev-rules-reminder** | Re-injects plan path and code standards after compaction | UserPromptSubmit |
| **simplify-gate** | Warns at 400 LOC, blocks at 800 LOC before shipping | UserPromptSubmit |
| **session-init** | Sets up project context at session start | SessionStart |
| **stop-notify** | Terminal notification + optional webhook on session end | SessionEnd |

### Configuration

All hooks are **on by default**. Disable individually:

```bash
# Disable a specific hook
export AR_DISABLE_SCOUT_BLOCK=1
export AR_DISABLE_PRIVACY_BLOCK=1
export AR_DISABLE_DANGEROUS_CMD_BLOCK=1
# ... etc for each hook name
```

Optional webhook for session completion notifications:

```bash
export AR_NOTIFY_WEBHOOK=https://hooks.slack.com/services/...
```

Customize blocked directories with a `.ckignore` file (gitignore syntax) at your project root.

See [guide/hooks.md](guide/hooks.md) for full reference.

---

## Commands

| Command | What it does | Default Iterations |
|---------|--------------|--------------------|
| `/forge` | **Classic:** Core iterate loop: modify → verify → keep/discard · **Orchestrator:** free-form goal → auto-select pipeline → loop until predicate met | 25 / goal-bounded |
| `/forge:plan` | Convert goal into validated config | one-shot |
| `/forge:requirements` | Interview client (no assumptions) → validated build spec via a mechanical gate | one-shot |
| `/forge:build` | Build greenfield full-stack software via the full SDLC to passing acceptance (6 weighted dims, logic-gated) | 40 |
| `/forge:feature` | Add a feature to existing software — delta acceptance + hard non-regression ratchet | 25 |
| `/forge:test` | Full QA engagement on existing software — risk-based plan, RTM, formal test design, execution + defect ledger, exit-criteria verdict (ISO 29119/ISTQB-aligned) | 20 |
| `/forge:design` | UI/UX designer + design QA — mode-aware direction protocol → machine-readable `DESIGN.md` (`system`); independent audit of a running app: valid captures, mechanical anti-slop floor (`SLOP_GATE`), heuristic critique, personas, defect ledger, `SHIP|FIX|REBUILD` verdict (`audit`); bounded remediation (`--fix`) | 12 (`--fix`) |
| `/forge:research` | Deep research engagement — decompose questions, sweep scholarly + web sources, read the primary literature, build a source-anchored claims ledger, synthesize a cited dossier gated by `DOSSIER_READY|DOSSIER_BLOCKED` | 15 |
| `/forge:debug` | Hunt bugs via hypothesis iteration | 15 |
| `/forge:fix` | Remediate defects to zero, root-cause first | 20 |
| `/forge:security` | STRIDE + OWASP audit with red-team | 15 |
| `/forge:ship` | Ship through 8 phases | linear |
| `/forge:scenario` | Generate edge cases across 12 dimensions | 20 |
| `/forge:predict` | 5 expert personas debate | one-shot |
| `/forge:learn` | Scout → generate docs → validate → fix | 10 |
| `/forge:reason` | Adversarial debate with blind judges | 8 |
| `/forge:probe` | 8 personas interrogate requirements | 15 |
| `/forge:improve` | Research ICP, discover improvements, generate PRDs | 15 |
| `/forge:evals` | Analyze iteration results: trends, plateaus | one-shot |
| `/forge:regression` | Stability gate: baseline vs candidate, verdict STABLE/UNSTABLE | one-shot |

**Universal flags:** `Iterations: N`, `Iterations: unlimited`, `--evals`, `--evals-interval N`, `--chain <targets>`, `--<subcommand>` shorthand.

**All commands use interactive setup when invoked without arguments.** Just type the command — the agent asks for what it needs with smart defaults based on your codebase.

> **OpenCode users:** Commands use underscore naming (`/forge_debug`, `/forge_fix`, etc.). All 20 commands available.
>
> **Codex users:** Invoke via `$forge` mention syntax. Subcommands are keywords: `$forge debug`, `$forge plan`, etc.

### Quick Decision Guide

| I want to... | Use |
|--------------|-----|
| Build a new full-stack app from scratch (full SDLC) | `/forge:build` |
| Turn a client brief into a validated build spec | `/forge:requirements` |
| Add a feature to an existing app without regressions | `/forge:feature` |
| Run a full QA engagement on an existing app (plan → RTM → verdict) | `/forge:test` |
| Research a topic into a cited, source-anchored dossier | `/forge:research` |
| Give a plain-language goal, let it self-orchestrate | `/forge <goal>` (bare, no Metric/Verify) |
| Improve test coverage / reduce bundle size / any metric | `/forge` |
| Run bounded iterations | Add `Iterations: N` to any command |
| Don't know what metric to use | `/forge:plan` |
| Run a security audit | `/forge:security` |
| Ship a PR / deployment / release | `/forge:ship` |
| Optimize without breaking existing tests | Add `Guard: npm test` |
| Hunt all bugs in a codebase | `/forge:debug` |
| Fix all errors (tests, types, lint) | `/forge:fix` |
| Remediate a QA engagement's defect ledger | `/forge:fix --from-test` |
| Run the full QA ↔ remediation loop unattended | `/forge:test Target: <app> --chain fix` |
| Debug then auto-fix | `/forge:debug --fix` |
| Check if something is ready to ship | `/forge:ship --checklist-only` |
| Explore edge cases for a feature | `/forge:scenario` |
| Generate test scenarios | `/forge:scenario --format test-scenarios` |
| Get expert opinions before starting | `/forge:predict` |
| Analyze from multiple angles then debug | `/forge:predict --chain debug` |
| Generate docs for a new codebase | `/forge:learn --mode init` |
| Update existing docs after changes | `/forge:learn --mode update` |
| Debate an architecture decision | `/forge:reason --domain software` |
| Surface hidden constraints before starting | `/forge:probe` |
| Pre-flight a fuzzy goal then loop | `/forge:probe --chain plan,forge` |
| Discover what to build next for your ICP | `/forge:improve` |
| Research competitors and generate PRDs | `/forge:improve --depth deep` |
| Probe requirements then research improvements | `/forge:probe --improve` |
| Analyze trends and plateaus across past runs | `/forge:evals` |
| Check if a run has stalled | `/forge:evals --file *-results.tsv` |
| Verify a change won't regress before pushing | `/forge:regression` |
| Gate a PR: predict, fix, re-gate, then ship | `/forge:regression --predict --fix --ship` |

---

## Building Complex Software

Four commands turn forge into a full **software-development-lifecycle engine**. Software is an
iteration process — so building it is just the forge loop applied to a *growing* acceptance set.

> 📘 **Full playbook (15–20 pages):** [guide/building-software-with-forge.md](guide/building-software-with-forge.md) — end-to-end walkthrough, the acceptance model in depth, building large multi-service systems, troubleshooting, and a complete worked example.

### The pipeline

```
/forge:requirements  ─▶  /forge:build  ─▶  /forge:regression  ─▶  /forge:ship
   client brief → spec           greenfield, full SDLC      stability gate                human-gated
                                       │
   grow it later  ─────────────────────┴────▶  /forge:feature  (brownfield, +ratchet) ─▶ regression → ship
```

### The six acceptance dimensions

Every app is graded by one mechanical metric — `fullstack_pass_rate` (`scripts/score-build.sh`) — a
weighted sum over six dimensions:

| Dimension | Weight | Gates |
|---|---|---|
| **logic** | 0.30 | domain logic computes correctly — **golden vectors** from the SRS (gating; see below) |
| functional | 0.30 | it works — CRUD, endpoints, tests, coverage ≥ 80% |
| **ux** | 0.20 | responsive · WCAG AA (axe) · e2e flow · loading/empty/error states · **DESIGN.md conformance** |
| devops | 0.15 | Docker / build · CI (lint+test+build+scan) · compose / IaC · migrations |
| monitoring | 0.15 | health / readiness · metrics · structured logs · tracing |
| hardening | 0.20 | no secrets · security headers · input validation · rate-limit · authz · dep-scan |

Declared weights sum to 1.30 and are **renormalized over the dimensions present in a run** — with all
six declared, the effective weights are ≈ 0.231 / 0.231 / 0.154 / 0.115 / 0.115 / 0.154.

A working-but-ugly or insecure app is **capped**, never "done". Acceptance is verified by *running it*
(build, boot, probe, the test pyramid, Playwright e2e + axe) — never self-reported.

### Logic-first (v2.3)

The `logic` dimension is **gating**, not merely weighted. During requirements, the SRS's core business
rules are captured as **golden vectors** — concrete input → expected-output rows (payroll math, pricing,
state machines). While **any** `logic` golden-vector row fails, the headline score is hard-capped at
**0.50** (`LOGIC_GATE_CAP` in `scripts/score-build.sh`) — no amount of UI polish or infrastructure can
mask broken domain logic. Convergence additionally requires `REQ_COVERAGE == 1.00` and
`DESIGN_COVERAGE == 1.00` (`score-build.sh coverage`) and the iteration bound respected.

### Step 1 — Requirements (no assumptions — and no reliance on the client knowing everything)

```
/forge:requirements Brief: "<what the client wants>"
```
Researches the domain first, then interviews you back-and-forth until requirements saturate — via the
latent-intent elicitation protocol: day-in-the-life walkthroughs, the must-be checklist, throwaway
wireframes you react to, an ambiguity audit, and a provenance ledger so every derived requirement is
read back for confirmation. Classifies functional vs non-functional, maps NFRs to the six dimensions,
prioritizes with MoSCoW, and emits a validated `evals/fullstack/<name>.spec.yaml`. A **mechanical
gate** releases the spec only when all six dimensions are present + weighted.

### Step 2 — Build (greenfield)

```
/forge:build Spec: evals/fullstack/<name>.spec.yaml
```
Runs the standard SDLC as an forge loop: plan (charter) → feasibility (go/no-go spike) →
requirements (SRS + RTM) → design (HLD/LLD + a `DESIGN.md`) → implement
(TDD) → debug (root-cause) → comprehensive test → deploy (human-gated) → operate/maintain (runbook +
change-request path). One atomic slice per iteration,
`git commit experiment:` before verify, keep if `pass_rate` rises + guard green else auto-revert.

### Step 3 — Feature (brownfield — the ratchet)

```
/forge:feature Feature: "<new capability>" Target: <app dir>
```
The same loop, continued on an existing app. Appends only the feature's acceptance (the **delta**),
drives it green, and enforces a **hard non-regression ratchet**: any existing green→red **auto-reverts**.
On convergence the feature ratchets into the spec — baseline only rises → **compounding gains**.

### Step 4 — Independent QA ↔ remediation (test / fix)

```
/forge:test Target: build-output/<app> --chain fix
```
`test` runs the full QA engagement (risk-based plan → RTM → formal design → evidence-anchored
execution → defect ledger → mechanical `RELEASE_RECOMMENDED | RELEASE_BLOCKED` verdict) and **never
fixes what it finds**. `fix` remediates the ledger root-cause-first, opens the PR, auto-merges on
green CI, and hands back — only a `test` re-engagement turns `fixed` into `verified`. Tester and
builder stay separate; that independence is what makes the verdict worth anything.

### Step 5 — Gate + Ship

`/forge:regression` proves no green→red across 8 dimensions (STABLE / UNSTABLE).
`/forge:ship` runs the 8-phase shipping workflow — **deployment is always human-gated**; nothing
deploys or pushes autonomously.

### DESIGN.md + the design floor (UI/UX)

The design system is a committed, **machine-readable** `DESIGN.md` (DESIGN.md format spec — YAML
frontmatter tokens + prose; reference catalog at [getdesign.md](https://getdesign.md) /
`awesome-design-md`). `/forge:design system` produces it through a **mode-aware direction
protocol** (Persuade · Operate · Read · Experience — a payroll dashboard and a marketing page are
different jobs; strategy before values; calibrated against the AI palette/type attractors; a
deterministic **seed roll** picks among 5–7 candidate directions so builds don't converge on the
category default), and `score-design.sh lint` checks schema + computed contrast pairs. `build` /
`feature` derive **all** UI tokens from it and verify **conformance mechanically** with Playwright;
the **craft floor** (`design-scan.cjs` → `SLOP_GATE`: emoji icons, kickers on every heading, nested
cards, purple gradients, glow halos, side stripes, em-dash copy, placeholder names, tiny/low-contrast
text, unlabelled inputs, zoom locks, overflow, off-token colors/faces …) is a `ux` acceptance row,
and `/forge:design audit` closes Phase 6 with valid captures, a heuristic critique, a persona
walk, a defect ledger and a `SHIP | FIX | REBUILD` verdict.

### Autonomy

A bare goal routes itself: `/forge build me a notes app` → orchestrator classifies the
`build-feature` archetype → **greenfield → `build`, existing app → `feature`**. No manual chaining.

### Worked example

```
# 1. Requirements → validated spec (interactive, no assumptions)
/forge:requirements Brief: "personal money tracker, offline"

# 2. Build the app to passing acceptance
/forge:build Spec: evals/fullstack/money-tracker.spec.yaml Iterations: 40

# 3. Add a feature later, without breaking anything
/forge:feature Feature: "recurring transactions" Target: build-output/money-tracker

# 4. Independent QA -> remediation -> re-engagement (defects flow as GitHub issues + auto-merged PRs)
/forge:test Target: build-output/money-tracker --chain fix

# 5. Gate + ship (human-gated)
/forge:regression --chain ship
```

### Building something large

1. **Decompose** into specs (one per app/service) with `requirements`.
2. **Build the core** greenfield with `build` — reach a green baseline fast.
3. **Grow by features** with `feature` — each stacks under the ratchet; the regression floor keeps the
   whole system stable as it compounds.
4. **Gate every increment** with `regression`; **ship** when green.

Every stage obeys the forge first principle — a mechanical metric, bounded iteration, one atomic
change, git-as-memory, automatic rollback. That is what makes building *complex* software tractable: you
never hold the whole thing in your head; the metric + the ratchet do.

---

## Prerequisites

AutoForge is distributed from a **private repository** — [Jss-on/autoforge](https://github.com/Jss-on/autoforge).
Your git must be able to reach it: authenticate with `gh auth login`, or set up SSH access, before installing.

| Requirement | Needed for |
|---|---|
| bash + POSIX tools (Git Bash on Windows) | scripts, hooks, scorers |
| Node.js >= 18 | hooks, verification probes |
| git | the loop itself — commit / revert is the memory |
| Playwright | **required for the build pipeline** — headless Chromium for live e2e, axe a11y and DESIGN.md conformance (the ux dimension). Installed per project: `npm i -D playwright && npx playwright install --with-deps chromium` |

Optional, per spec: `docker` (devops dimension), `axe` CLI (accessibility), `k6` or `autocannon` (perf SLOs), `gh` (release tooling).

Run the environment preflight any time:

```bash
bash scripts/doctor.sh
```

---

## Quick Start

### Claude Code

**Option A — Plugin install (recommended):**

Inside Claude Code:

```
/plugin marketplace add Jss-on/autoforge
/plugin install forge@autoforge
```

> **Note:** Start a new Claude Code session after installing. Reference files aren't resolvable in the same session where installation happened — this is a Claude Code platform limitation.

**Updating (no reinstall needed):**
```
/plugin marketplace update autoforge
```

Run `/reload-plugins` to activate. No need to uninstall or re-clone.

**Option B — Local clone:**
```bash
git clone https://github.com/Jss-on/autoforge
cd autoforge
```

Then inside Claude Code (from the clone directory):

```
/plugin marketplace add .
/plugin install forge@autoforge
```

**Option C — Manual copy:**
```bash
git clone https://github.com/Jss-on/autoforge

# Copy skill + subcommands to your project
cp -r autoforge/.claude/skills/forge .claude/skills/forge
cp -r autoforge/.claude/commands/forge .claude/commands/forge
cp autoforge/.claude/commands/forge.md .claude/commands/forge.md
```

Or install globally:
```bash
cp -r autoforge/.claude/skills/forge ~/.claude/skills/forge
cp -r autoforge/.claude/commands/forge ~/.claude/commands/forge
cp autoforge/.claude/commands/forge.md ~/.claude/commands/forge.md
```

**Option D — Guided installer:**
```bash
git clone https://github.com/Jss-on/autoforge
cd autoforge
./scripts/install.sh --claude --global
```

### OpenCode Quick Start

**Option A — Guided installer (recommended):**
```bash
git clone https://github.com/Jss-on/autoforge
cd autoforge
./scripts/install.sh --opencode --global
```

**Option B — Manual copy:**
```bash
git clone https://github.com/Jss-on/autoforge

cp -r autoforge/.opencode/skills/forge .opencode/skills/forge
cp autoforge/.opencode/commands/forge*.md .opencode/commands/
```

Or globally:
```bash
cp -r autoforge/.opencode/skills/forge ~/.config/opencode/skills/forge
cp autoforge/.opencode/commands/forge*.md ~/.config/opencode/commands/
```

> All 20 commands available as `/forge_debug`, `/forge_fix`, `/forge_improve`, etc.

### Codex Quick Start

**Option A — Guided installer (recommended):**
```bash
git clone https://github.com/Jss-on/autoforge
cd autoforge
./scripts/install.sh --codex --global
```

**Option B — Manual copy:**
```bash
git clone https://github.com/Jss-on/autoforge
cp -r autoforge/.agents/skills/forge ~/.codex/skills/forge
```

> Invoke via `$forge` mention syntax. Subcommands are keywords: `$forge plan`, `$forge debug`, `$forge evals`, etc.

### Run It

```
/forge
Goal: Increase test coverage from 72% to 90%
Scope: src/**/*.test.ts, src/**/*.ts
Metric: coverage % (higher is better)
Verify: npm test -- --coverage | grep "All files"
Iterations: 25
```

Claude reads all files, establishes a baseline, and starts iterating — one change at a time. Keeps improvements, auto-reverts failures, logs everything. Stops after N iterations or when you interrupt.

---

## /forge:plan — Goal to Config

The hardest part isn't the loop — it's defining Scope, Metric, and Verify correctly. `/forge:plan` converts your plain-language goal into a validated, ready-to-execute configuration.

```
/forge:plan
Goal: Make the API respond faster
```

Walks through 5 steps: capture goal → define scope → define metric → define direction → validate verify command (dry-run). Every gate is mechanical — scope must resolve to files, metric must output a number, verify must pass a dry-run. Emits a `handoff.json` for chaining.

---

## /forge:requirements — Requirements Engineering

Turn a client brief into a validated build spec — **no assumptions, and no reliance on the client
knowing what they want.** A raw interview captures only *stated* intent; the expensive misses are the
must-be needs clients assume ("obviously it has refunds"), the taste they cannot verbalize, and the
domain rules neither party said out loud. The command runs `references/elicitation-protocol.md`
against all three:

- **Domain recon before the first question** — category table-stakes, glossary, the statutory layer
  with citations; derived items enter the interview as one-click confirmations, not open questions.
- **Day-in-the-life walkthroughs** per role — the unhappy paths, the end-of-shift/month rituals, the
  paper trail. Each becomes a numbered scenario → SRS use case → e2e acceptance journey.
- **Must-be (Kano) checklist** dispositioned item by item — password reset, permissions, correction
  paths, exports, audit trail, backup, import, offline… silently absent = protocol violation.
- **Artifact-reaction loop for design** — taste by selection and correction, never adjectives:
  reference triage plus throwaway HTML wireframes screenshotted via Playwright, reactions per screen.
- **Ambiguity audit** — adjective→number (with a load model), rule→boundary, workflow→failure path,
  mutation→correction path, pronoun test.
- **Provenance ledger + client-language playback** — every requirement tagged `stated` /
  `derived-domain` / `default-confirmed`; sign-off happens on re-told scenarios, screenshots and
  worked-example tables, never on the SRS document itself.

```
/forge:requirements Brief: "internal expense tracker with SSO" --chain build
```

Then: classify functional vs non-functional, map NFRs to the six build dimensions, prioritize with
MoSCoW, emit + mechanically validate `evals/fullstack/<name>.spec.yaml`. The **mechanical** `validate`
gate (all six dimensions present + weighted, golden `logic` rows for computational domains) releases
the spec — never a subjective "looks complete".

---

## /forge:build — Greenfield Full-Stack Builder

Builds new software via the **standard SDLC** — plan → feasibility → requirements → design
(HLD/LLD + `DESIGN.md`) → implement (TDD, with a root-cause defect loop) → comprehensive test →
deploy → operate/maintain — every phase gated with its named deliverable (project charter, SRS + RTM,
test summary, release notes, runbook) — to **passing acceptance across six weighted
dimensions** with the gating `logic` golden vectors, verified live in a real browser with Playwright.

```
/forge:build Spec: evals/fullstack/<name>.spec.yaml Iterations: 40
```

| Flag | Purpose |
|------|---------|
| `Spec:` | eval spec (stack + per-dimension acceptance) |
| `Goal:` | derive a spec from prose when no `Spec` given |
| `Design:` | `DESIGN.md` source — catalog slug / file / URL / `generate` |
| `Scope:` | build directory (default `build-output/<name>/`, never the skill repo) |
| `Target-rate:` | pass-rate to stop at (default 1.00) |

Runs as an forge loop: one atomic slice per iteration → `git commit experiment:` before verify →
keep if `pass_rate` rises + guard green, else auto-revert → log `iterations.tsv`. The SDLC phase-gate
table + principles are folded into the build command; companion references: `uiux-checklist.md`,
`fullstack-hardening-checklist.md`.

---

## /forge:feature — Iterative Feature Addition (brownfield)

Adds a feature to an **existing** app under a **hard non-regression ratchet** — the same loop, on a
delta, conforming to the app's `DESIGN.md`. This is how software grows: every feature stacks, nothing
backslides.

```
/forge:feature Feature: "recurring transactions" Target: build-output/money-tracker
```

Appends only the feature's acceptance, drives it green, and **auto-reverts any slice that turns an
existing green assertion red** (reuses `regression`). On convergence the feature ratchets permanently
into the spec — the baseline only rises (**compounding gains**). Greenfield targets are auto-handed to
`build`.

---

## /forge:test — Independent QA Engagement

The **QA engineer** of the pipeline. Where `build` creates and `feature` extends, `test` **assesses**:
a complete, standards-aligned engagement on an existing app, run the way a professional test engineer
runs one — and it **never fixes what it finds** (tester ↔ builder independence is what makes the
verdict credible).

```
/forge:test Target: build-output/<app> --chain fix
```

ISTQB process + ISO/IEC/IEEE 29119-3 document set: static requirements review with an ambiguity list →
risk register (likelihood × impact drives depth) → test plan with entry/exit criteria → formal test
design (EP, BVA, decision tables, state transition, pairwise, error guessing; `logic` golden rows
must-pass) with a **bidirectional RTM gate** → smoke gate → evidence-anchored execution across the
pyramid → SBTM exploratory sessions → non-functional passes (WCAG 2.2 AA via axe, OWASP-checklist
security, percentile SLO load) → a machine-validated **defect ledger** (severity/priority decoupled;
a critical may never be deferred) → the mechanical verdict:

```
criterion pass-rate: 0.83 < 0.95 (strict evidence)  FAIL
criterion rtm-coverage: REQ_COVERAGE=0.41           FAIL
criterion open-defects: blocking=3                  FAIL
VERDICT: RELEASE_BLOCKED
```

`RELEASE_RECOMMENDED | RELEASE_BLOCKED` is decided by `score-test.sh exit-criteria`, never by opinion —
and **what was NOT tested is reported as prominently as what was**. Artifacts ride the transparency
contract: the QA report lands as a PR on the target's own repo, every unresolved critical/high defect
becomes a GitHub issue (label `qa`) with full repro anatomy.

---

## /forge:design — UI/UX Designer + Design QA

The **designer and design reviewer** of the pipeline. Three jobs, one command:

```
/forge:design system Brief: requirements.md Mode: operate      # → DESIGN.md (build Phase 4)
/forge:design audit Url: http://localhost:3000 Routes: /,/runs,/settings   # independent review
/forge:design audit Target: build-output/<app> --fix --chain regression   # audit → bounded remediation
```

**system** — the direction protocol: read the room (audience, scene, **visitor mode** per surface,
brand assets, the client's dislikes), declare the Design Read, set the dials, pick the foundation
honestly (an official design-system package when the brief reads as one), choose color/type
**strategy** before values (Operate = restrained, one workhorse family, tabular data), calibrate
against the saturated AI looks (cream+oxblood · navy+blue shadcn · near-black+neon), list 5–7
directions, roll (`score-design.sh seed`), commit — then write a **machine-readable `DESIGN.md`**
(frontmatter tokens with every `on-X` contrast pair, prose sections, named rules, Do/Don't) that
`score-design.sh lint` validates.

**audit** — independent (app source read-only), evidence-first: **valid captures** at every viewport
(settled motion, full page, every PNG opened — a blank capture is RECAPTURE, never scored) →
`design-scan.cjs` (the mechanical floor + DESIGN.md conformance; the impeccable detector rides along
when the project has it) → `SLOP: N` / `SLOP_GATE` → axe + keyboard walk → Nielsen's ten scored 0–4
+ the cognitive-load eight (`DESIGN_HEALTH: 28/40 (Good)`) → persona walk (power user, first-timer,
screen-reader user, stress tester, one-thumb mobile) → `design-defects.tsv` (same ledger as `test`) →

```
criterion blocking-defects: 2 open critical/high  FAIL
criterion slop-gate: SLOP: 7                     FAIL
criterion design-lint: VALID                     PASS
criterion design-health: 26/40 (Acceptable)      PASS
DESIGN_VERDICT: FIX
```

**--fix** — the builder half: one slice per iteration, commit-before-verify, recapture + rescan,
keep only if `SLOP` didn't rise, no acceptance row went red and regression is `STABLE`; a fix is
`fixed`, never `verified` — a re-audit grants that. `REBUILD` means the world failed: re-run
`system --refresh`, don't patch. Goals like "make the UI look professional" route here from the
orchestrator (`polish-ui` archetype).

---

## /forge:research — Deep Research Engagement

The **research analyst** of the pipeline. Answers questions about the world — technology choices,
scientific literature, standards, markets — with the same evidence discipline the build pipeline
applies to code: **no claim without a source, no source without an accessed locator, no number
without its conditions, no verdict without the seam.**

```
/forge:research Topic: "What do modern message queues guarantee about ordering?" Audience: "eng team choosing infra"
/forge:research Topic: brief.md Recency: 5y --depth exhaustive --chain reason
```

**How it works:** decompose the topic into answerable research questions (RQ-n) → multi-modal
sweep (scholarly indexes, institutional publishers, standards bodies, quality press — reviews
first, 1-hop citation snowball) → deep-read the primary literature into per-source notes with
verbatim quotes and depth honesty (`full|abstract|secondary` — what was actually read) → build
`claims.tsv`, where every claim cites its sources at a graded confidence (**high** needs ≥2
independent T1/T2 sources; T4-only support is mechanically invalid) → run the **adversarial
disconfirmation pass** on every load-bearing claim (search against it, retractions, supersession)
→ synthesize the dossier with inline `[S-nn]` citations, a consensus-vs-contested table, a
magnitudes table, and limitations stated as prominently as findings.

```
criterion source-ledger: SOURCES: VALID total=24 t1=9 t2=7 t3=6 t4=2 unverified=0 PASS
criterion claims-ledger: CLAIMS: VALID total=18 high=7 moderate=6 low=3 contested=2 orphans=0 PASS
criterion rq-coverage: 6/6 PASS
criterion t12-floor: 0.72 >= 0.60 PASS
VERDICT: DOSSIER_READY
```

`scripts/score-research.sh` is the seam: `sources` and `claims` validate the ledgers (schema,
tier floors, orphan and uncitable-status detection), `verdict` decides `DOSSIER_READY |
DOSSIER_BLOCKED` — never "looks thorough". Sensitive domains (medical, legal, financial,
safety) trigger a mandatory scope-of-use register: the dossier is literature background that
supports qualified professionals, never advice or case-specific expert opinion. Chain
`--chain reason` to debate the contested claims or `--chain requirements` to feed an SRS.

`Format: arxiv,ieee` additionally typesets the dossier as an **arXiv preprint** (`article` class)
and/or an **IEEE paper** (`IEEEtran`) — same ledger, `[S-nn]` becomes `\cite{S-nn}`, bibliography
generated from the cited `sources.tsv` rows, Limitations kept as its own section — validated by
`score-research.sh paper` (orphan cite keys and uncitable bib entries block) and compiled to PDF
when a LaTeX toolchain resolves.

---

## /forge:debug — Autonomous Bug Hunter

Scientific method meets forge loop. Doesn't stop at one bug — iteratively hunts ALL bugs using falsifiable hypotheses, evidence-based investigation, and 7 investigation techniques.

```
/forge:debug
Scope: src/api/**/*.ts
Symptom: API returns 500 on POST /users
Iterations: 15
```

**How it works:** Gather symptoms → Recon → Hypothesize (specific, testable) → Test (one experiment per iteration) → Classify (confirmed/disproven/inconclusive) → Log → Repeat.

Every finding requires code evidence (file:line + reproduction steps). Every disproven hypothesis is logged — equally valuable.

| Flag | Purpose |
|------|---------|
| `--fix` | After hunting, auto-switch to `/forge:fix` |
| `--scope <glob>` | Limit investigation scope |
| `--symptom "<text>"` | Pre-fill symptom |
| `--severity <level>` | Minimum severity to report |

---

## /forge:fix — Defect Remediation (the builder half of test ↔ fix)

Two intake modes, one bounded loop — root-cause first, evidence-anchored, auto-reverting:

```
/forge:fix --from-test              # remediate a QA engagement's defect ledger
/forge:fix Target: "npm test"       # classic error burn-down (tests, types, lint, build)
```

**Defect mode** consumes a validated `defects.tsv`; the metric is the **blocking count** (unresolved
critical/high) driven to zero, queue ordered **unblock-first** (build/CI blockers before severity →
priority). Per defect: reproduce RED (evidence file) → root cause (**iron law: no fix without an
identified root cause** — and fix the implementation, not the test, with one stated exception: the
defect *is* the test) → one atomic fix → commit before verify → repro GREEN + targeted regression +
guard → ledger updated. Un-reproducible defects stay `open` with the attempt recorded — never
self-rejected.

**Independence ceiling:** fix may set `in-progress` and `fixed` — never `verified`/`closed`. A `fixed`
critical still blocks release until the chained `test` re-engagement confirms it. A fix run cannot
self-certify.

**GitHub flow, hands-off to the end:** work on `fix/<stamp>`, PR with a per-defect root-cause table
and `Fixes #<issue>` lines, a comment on each `qa` issue as its fix lands — then the PR **merges
itself** (`--squash --delete-branch`) once every CI check is green, the branch is `MERGEABLE`, and the
diff stays in scope. After merging it verifies the **base branch's own CI** (PR-green/main-red
re-opens the loop) and confirms the linked issues closed. Branch protection and required reviews
always win; `--no-merge` opts out; merging is never deploying.

| Flag | Purpose |
|------|---------|
| `Defects: <tsv\|run-dir\|auto>` / `--from-test` | Defect-remediation intake |
| `--target <command>` / `--guard <command>` | Error burn-down verify + safety commands |
| `--category <type>` | Only fix a type (test, type, lint, build) |
| `--from-debug` | Read findings from the latest debug session |
| `Merge: auto\|manual` / `--no-merge` | Auto-merge policy (default: auto) |

**The loop:** `/forge:test --chain fix` → fix remediates the ledger → `test` re-engages and
turns `fixed` into `verified` (or `reopened`).

---

## /forge:security — Autonomous Security Audit

Read-only security audit using STRIDE threat modeling, OWASP Top 10 sweeps, and red-team adversarial analysis with 4 hostile personas.

```
/forge:security
Iterations: 15
```

Codebase recon → asset inventory → trust boundaries → STRIDE threat model → attack surface map → autonomous testing loop → structured report. Every finding requires code evidence (file:line + attack scenario).

| Flag | Purpose |
|------|---------|
| `--diff` | Only audit files changed since last audit |
| `--fix` | Auto-fix confirmed Critical/High findings |
| `--fail-on <severity>` | Exit non-zero for CI/CD gating |

**Output:** Creates `security/{date}-{slug}/` with 7 structured report files.

---

## /forge:ship — Universal Shipping Workflow

Ship anything through 8 phases: **Identify → Inventory → Checklist → Prepare → Dry-run → Ship → Verify → Log.**

```
/forge:ship --auto
```

Auto-detects what you're shipping (code PR, deployment, blog post, email campaign, sales deck, research paper, design assets) and generates domain-specific checklists — every item mechanically verifiable.

| Flag | Purpose |
|------|---------|
| `--dry-run` | Validate everything but don't ship |
| `--auto` | Auto-approve if checklist passes |
| `--force` | Skip non-critical items (blockers still enforced) |
| `--rollback` | Undo last ship action |
| `--monitor N` | Post-ship monitoring for N minutes |
| `--checklist-only` | Just check readiness |

**9 supported types:** code-pr, code-release, deployment, content, marketing-email, marketing-campaign, sales, research, design.

---

## /forge:scenario — Scenario Explorer

Autonomous scenario exploration engine. Takes a seed scenario and iteratively generates situations across 12 dimensions — happy paths, errors, edge cases, abuse, scale, concurrency, temporal, data variation, permissions, integrations, recovery, and state transitions.

```
/forge:scenario
Scenario: User attempts to checkout with multiple payment methods
Iterations: 20
```

Seed analysis → Decompose into 12 dimensions → Generate ONE situation per iteration → Classify (new/variant/duplicate) → Expand edge cases → Log → Repeat.

| Flag | Purpose |
|------|---------|
| `--domain <type>` | software, product, business, security, marketing |
| `--depth <level>` | shallow (10), standard (20), deep (50+) |
| `--format <type>` | use-cases, user-stories, test-scenarios, threat-scenarios |
| `--focus <area>` | edge-cases, failures, security, scale |

---

## /forge:predict — Multi-Persona Prediction

Before you debug, fix, or ship — get 5 expert perspectives in 2 minutes.

Simulates a team (Architect, Security Analyst, Performance Engineer, Reliability Engineer, Devil's Advocate) who independently analyze your code, debate findings, and reach consensus.

```
/forge:predict --chain debug
```

- `--chain debug` — pre-ranked hypotheses before debugging
- `--chain security` — multi-persona red team analysis
- `--chain scenario,debug,fix` — full quality pipeline

---

## /forge:learn — Autonomous Documentation Engine

Scout codebase → generate docs → validate → fix → repeat. 4 modes: init (create from scratch), update (refresh existing), check (read-only health report), summarize (quick overview).

```
/forge:learn --mode init --depth deep
Iterations: 10
```

Dynamic doc discovery, project-type detection, validation-fix loop, git-diff scoping for updates, selective single-doc update with `--file`. Auto-generates Mermaid architecture diagrams, API reference, testing guide, config guide, and cross-reference links.

---

## /forge:reason — Adversarial Refinement

Extends forge to **subjective domains** where no objective metric exists. The blind judge panel is the fitness function.

```
/forge:reason
Task: Should we use event sourcing for our order management system?
Domain: software
Iterations: 8
```

**How it works:** Generate-A → Critic attacks → Author-B responds → Synthesizer merges → Blind judge panel (randomized labels) picks winner → Winner becomes new A → Repeat until convergence. Every agent is a cold-start fresh invocation — no history bleed.

| Flag | Purpose |
|------|---------|
| `--judges N` | Judge count (3-7, odd preferred) |
| `--convergence N` | Consecutive wins to converge (default 3) |
| `--mode <mode>` | convergent (default), creative, debate |
| `--domain <type>` | software, product, business, security, research, content |
| `--chain <targets>` | Chain converged output to any forge command |

**Output:** Creates `reason/{date}-{slug}/` with lineage.md, candidates.md, judge-transcripts.md, reason-results.tsv, handoff.json.

---

## /forge:probe — Adversarial Requirement Interrogation

Eight adversarial personas interrogate user and codebase together until net-new constraints saturate. Output is the 5 forge primitives (Goal/Scope/Metric/Direction/Verify) plus a `handoff.json` ready to feed any downstream command.

```
/forge:probe --chain plan,forge
Topic: Add multi-tenant isolation to the database layer
```

**The 8 personas:** Skeptic, Edge-Case Hunter, Scope Sentinel, Ambiguity Detective, Contradiction Finder, Prior-Art Investigator, Success-Criteria Auditor, Constraint Excavator.

| Flag | Purpose |
|------|---------|
| `--depth <level>` | shallow (5 rounds), standard (15), deep (30) |
| `--adversarial` | Rotate Skeptic + Contradiction Finder + Edge-Case Hunter to front |
| `--mode <mode>` | interactive (default) or autonomous |
| `--chain <targets>` | plan, predict, debug, scenario, reason, fix, ship, learn |

**Output:** Creates `probe/{date}-{slug}/` with probe-spec.md, constraints.tsv, forge-config.yml, handoff.json.

---

## /forge:improve — Product Improvement Engine

Research what to build next. Discovers ICP challenges via deep multi-source research, scores and ranks improvements, generates per-feature PRDs with evidence chains.

```
/forge:improve
Goal: Improve onboarding conversion
ICP: B2B SaaS product managers at 50-500 person companies
```

**How it works:** Resolve product context → Research across 5 categories (ICP challenges, competitor gaps, market trends, UX & experience, revenue & growth) → Saturate → ICP binary gate → Tiered ranking (Must-have / Nice-to-have / Moonshot) → User selects features → Generate PRDs.

| Flag | Purpose |
|------|---------|
| `--icp "<text>"` | Ideal customer profile |
| `--discover` | Force codebase scan even with existing context |
| `--no-discover` | Skip auto-discover |
| `--depth <level>` | shallow (5), standard (15), deep (30+) |
| `--seeds <categories>` | Override default research categories |

**Output:** Creates `improve/{date}-{slug}/` with research-findings.md, improvement-plan.md, per-feature PRDs, summary.md, improve-results.tsv, handoff.json.

**Terminal emitter** — improve is the last link in any forge chain. PRDs are consumed by external tools (`/ck:plan`, `/ck:cook`), not by other forge commands.

**Chain into improve:** `/forge:probe --improve`, `/forge:predict --improve`, `/forge:debug --improve`.

---

## /forge:evals — Results Analyzer

Analyzes `*-results.tsv` files from any forge run. Surfaces trends, plateau detection, convergence signals, and iteration efficiency. Backward compatible with v2.0.x TSV format.

```
/forge:evals
/forge:evals --file coverage-results.tsv
```

**Adaptive checkpoints:** floor(max_iterations/3), minimum 1 checkpoint. Reports per-checkpoint delta, stall detection, best iteration, and a recommendation (continue / stop / change strategy).

**Inline evals during a run:**
```
/forge
Goal: Reduce bundle size below 200kb
Iterations: 30
--evals-interval 10
```

Prints a checkpoint report every 10 iterations without interrupting the loop.

---

## /forge:regression — Stability Gate

Before you push, prove the change didn't break what already worked. Captures baseline behavior from a `git worktree` of the base ref, diffs the candidate across **8 dimensions**, and emits a single **STABLE / UNSTABLE** verdict.

```
/forge:regression --predict --evals --fix --ship
```

**Core invariant:** a regression is a **green→red transition only**. Pre-existing failures (red→red), new tests (absent→red), and flaky tests (flake→red) are classified and excluded — never counted as regressions.

**Tiered verdict:**
- **HARD gate** (any green→red = UNSTABLE): `functional`, `api-contract`, `data-migration`, `integration-e2e`
- **SCORE** (0–100, noise-tolerant, weighted; UNSTABLE below threshold 95): `flakiness` .30, `performance` .30, `resource` .20, `visual-ui` .20

| Flag | Purpose |
|------|---------|
| `--select auto` | Use detected affected-test mapper (jest `--findRelatedTests`, nx affected) else FULL suite — never a silent subset |
| `--samples N` / `--noise-band %` | Tune the perf statistical gate (default 7 samples/side, Mann–Whitney U) |
| `--fix` / `--fix-cycles N` | Re-gate after fixing; each cycle must strictly shrink the blocking-set (max 3) |
| `--predict` | Pre-empt likely regressions before the gate runs |
| `--reason` | Adversarial root-cause when a regression's cause is ambiguous |
| `--debug` | Force the bisect Hunter (HARD dims passing 3/3 reproduction) |
| `--max-runs N` | Ceiling on dims×axes×samples×cells (warn+confirm past 200) |

**Output:** Creates `regression/{date}-{slug}/` with regression-results.tsv, stability-report.md, dimensions/<dim>.md, baseline/, evals-summary.md, handoff.json.

> **data-migration is hard-guarded:** opt-in, and refuses any DB URL that isn't ephemeral/allowlisted (`*test*`, `*ci*`, container). Migrations are forward-only by default.

---

## Guard — Prevent Regressions

When optimizing a metric, the loop might break existing behavior. **Guard** is an optional safety net.

```
/forge
Goal: Reduce API response time to under 100ms
Verify: npm run bench:api | grep "p95"
Guard: npm test
```

- **Verify** = "Did the metric improve?" (the goal)
- **Guard** = "Did anything else break?" (the safety net)

If the metric improves but the guard fails, Claude reworks the optimization (up to 2 attempts). Guard/test files are never modified.

> **Credit:** Guard was contributed to the upstream forge engine by [@pronskiy](https://github.com/pronskiy) (JetBrains).

---

## Results Tracking

Every iteration is logged in TSV format:

```tsv
iteration  commit   metric  delta   status    description
0          a1b2c3d  85.2    0.0     baseline  initial state
1          b2c3d4e  87.1    +1.9    keep      add tests for auth edge cases
2          -        86.5    -0.6    discard   refactor test helpers (broke 2 tests)
3          c3d4e5f  88.3    +1.2    keep      add error handling tests
```

Run `/forge:evals` at any time to analyze trends across any TSV file. Adaptive checkpoints fire at floor(max_iterations/3) intervals.

---

## Crash Recovery

| Failure | Response |
|---------|----------|
| Syntax error | Fix immediately, don't count as iteration |
| Runtime error | Attempt fix (max 3 tries), then move on |
| Resource exhaustion | Revert, try smaller variant |
| Infinite loop / hang | Kill after timeout, revert |
| External dependency | Skip, log, try different approach |

---

## Repository Structure

```
autoforge/
├── README.md
├── AGENTS.md                                      ← drop-in agent contract for any project
├── COMPARISON.md                                  ← Karpathy's vs AutoForge
├── LICENSE                                        ← proprietary license
├── NOTICE                                         ← upstream MIT attribution (forge engine)
├── guide/                                         ← guides — one per command + the build playbook
├── docs/                                          ← design + release documentation
├── evals/fullstack/                               ← build specs (*.spec.yaml)
├── tests/                                         ← harness self-tests (parity, hooks, scorers)
├── scripts/
│   ├── install.sh                                 ← guided installer (Claude Code + OpenCode + Codex)
│   ├── doctor.sh                                  ← environment preflight (core / build / optional tiers)
│   ├── transform.sh                               ← single transform: .claude/ → .opencode/ + .agents/ + plugins/
│   ├── orchestrate.sh                             ← orchestrator seam (classify / route / units / screen)
│   ├── score-build.sh                             ← fullstack_pass_rate scorer + logic gate + coverage + strict evidence
│   ├── score-test.sh                              ← defect-ledger validator + exit-criteria verdict (test)
│   ├── score-design.sh · design-scan.cjs           ← DESIGN.md lint · live-DOM design floor (SLOP_GATE) · critique/verdict (design)
│   ├── score-requirements.sh                      ← build-spec validator (requirements)
│   ├── score-regression.sh                        ← regression stability verdict
│   ├── validate-handoff.sh                        ← chain-handoff contract validator
│   ├── run-index.sh · smoke-seam.sh · smoke-model.sh  ← run inventory + seam/model smokes
│   └── release.sh · publish-autoforge.sh          ← release + test-gated publish automation
├── .claude/
│   ├── skills/forge/
│   │   ├── SKILL.md                               ← thin routing table
│   │   └── references/                            ← focused contracts: elicitation-protocol,
│   │                                                qa-testing-protocol, design-protocol, handoff-schema,
│   │                                                security, personas, orchestrator routing, ux + hardening
│   └── commands/
│       ├── forge.md                        ← core loop (self-contained)
│       └── forge/                          ← 19 subcommand files (20 commands total)
├── .claude-plugin/marketplace.json                ← marketplace manifest (marketplace name: autoforge)
├── claude-plugin/                                 ← Claude Code plugin package (skills + commands + hooks)
├── .opencode/                                     ← OpenCode port (via transform.sh)
│   ├── skills/forge/
│   └── commands/                                  ← 19 command files (forge_*.md)
├── .agents/                                       ← Codex port (via transform.sh)
│   └── skills/forge/
└── plugins/forge/                          ← Codex plugin package
    ├── .codex-plugin/plugin.json                  ← plugin manifest
    └── skills/forge/
```

---

## FAQ

**Q: I don't know what metric to use.**
A: Run `/forge:plan` — it analyzes your codebase, suggests metrics, and dry-runs the verify command before you launch.

**Q: How do I build a whole app, not just optimize one metric?**
A: Use the build pipeline — `/forge:requirements` (brief → validated spec via the latent-intent elicitation protocol) → `/forge:build` (greenfield, full SDLC, six weighted acceptance dimensions with the gating `logic` golden vectors, `DESIGN.md`, verified live with Playwright) → `/forge:feature` to add features under a hard non-regression ratchet → `/forge:test --chain fix` (independent QA engagement ↔ defect remediation, PRs auto-merged on green CI) → `/forge:regression` → `/forge:ship` (human-gated). See [Building Complex Software](#building-complex-software).

**Q: What changed in v2.3?**
A: Logic-first acceptance. The build pipeline now grades **six** weighted dimensions — logic, functional, ux, devops, monitoring, hardening. The new `logic` dimension is **gating**: golden vectors derived from the SRS must all compute correctly, and while any fails the headline score is hard-capped at 0.50. Convergence additionally requires `REQ_COVERAGE == 1.00` and `DESIGN_COVERAGE == 1.00`. The requirements → build → feature chain carries these gates end-to-end: `requirements` emits the golden vectors, `build` drives them green, `feature` ratchets them.

**Q: What changed in v2.2.0?**
A: The root `/forge` command now supports an autonomous orchestrator mode. Type a plain-language goal (e.g., `/forge help me fix the login bug`) instead of `Metric:`/`Verify:` and the orchestrator classifies your goal, derives a verifiable Success predicate, confirms it once, then loops across subcommands until done. Classic metric-loop behavior is unchanged when `Metric:` or `Verify:` are present.

**Q: What changed in v2.1.0?**
A: Architecture rebuild. The monolithic SKILL.md was replaced with a thin router that stays resident (~8KB) plus self-contained command files — now 20 commands whose bodies (~3–35KB each) load only when invoked, with reference files pulled on demand. A new `/forge:evals` command analyzes iteration results. Every looping command now has a bounded default instead of running unlimited.

**Q: How do bounded defaults work?**
A: Every looping command ships with a sensible default (e.g., `/forge` defaults to 25 iterations). Override inline: `Iterations: 50` for more, `Iterations: unlimited` for the old unbounded behavior.

**Q: How does /forge:evals work?**
A: Point it at any `*-results.tsv` file from a previous run. It reports trends, plateau detection, and a recommendation. Use `--evals-interval N` during a live run to get checkpoint reports without interrupting the loop.

**Q: Does this work with any project?**
A: Yes. Any language, framework, or domain. Install via plugin (Claude Code), installer script, or manual copy.

**Q: Does this work with OpenCode?**
A: Yes. Run `./scripts/install.sh --opencode --global` or manually copy `.opencode/` files. Commands use underscore naming (`/forge_debug`, `/forge_evals`, etc.). All 20 commands available.

**Q: Does this work with OpenAI Codex?**
A: Yes. Run `./scripts/install.sh --codex --global` or copy `.agents/skills/forge/` to `~/.codex/skills/forge`. Invoke via `$forge` mention syntax.

**Q: How do I stop the loop?**
A: `Ctrl+C` or add `Iterations: N` to your inline config. Claude commits before verifying, so your last successful state is always in git.

**Q: Can I use this for non-code tasks?**
A: Absolutely. Sales emails, marketing copy, HR policies, runbooks — anything with a measurable metric. See [Examples by Domain](guide/examples-by-domain.md).

**Q: Does /forge:security modify my code?**
A: No. Read-only by default. Use `--fix` to opt into auto-remediation of confirmed Critical/High findings.

**Q: What's the difference between /forge:predict and /forge:reason?**
A: Predict is a one-shot analysis — 5 experts debate your existing code. Reason is an iterative refinement loop — competing candidates are generated, critiqued, synthesized, and blind-judged over multiple rounds until convergence. Use predict for analysis before acting; use reason for decisions where no objective metric exists.

**Q: What is handoff.json?**
A: A structured file emitted by plan, probe, reason, and other commands that carries Goal/Scope/Metric/Verify config for downstream commands. When you `--chain plan,forge`, the chain reads handoff.json automatically.

---

## Contributing

Private repository — internal contributions only. Open an issue in
[Jss-on/autoforge](https://github.com/Jss-on/autoforge/issues) to propose changes.

---

## License

Proprietary — see [LICENSE](LICENSE).

Built on the [autoresearch](https://github.com/uditgoenka/autoresearch) engine by Udit Goenka (MIT) — see [NOTICE](NOTICE).

---

## Credits

- **[Andrej Karpathy](https://github.com/karpathy)** — for [autoresearch](https://github.com/karpathy/autoresearch)
- **[Anthropic](https://anthropic.com)** — for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and the skills system
- **[OpenCode](https://opencode.ai)** — for the OpenCode terminal agent
- **[OpenAI](https://openai.com)** — for [Codex](https://developers.openai.com/codex) and the agent skills standard
