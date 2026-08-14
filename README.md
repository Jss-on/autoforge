<div align="center">

# AutoForge

**Turn [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [OpenCode](https://opencode.ai), or [OpenAI Codex](https://developers.openai.com/codex) into a relentless improvement engine.**

AutoForge is the product; `autoresearch` is the engine and plugin it ships — every command stays `/autoresearch:*`.

Based on [Karpathy's autoresearch](https://github.com/karpathy/autoresearch) — constraint + mechanical metric + autonomous iteration = compounding gains.

[![Claude Code Skill](https://img.shields.io/badge/Claude_Code-Skill-blue?logo=anthropic&logoColor=white)](https://docs.anthropic.com/en/docs/claude-code)
[![OpenCode](https://img.shields.io/badge/OpenCode-Skill-purple)](https://opencode.ai)
[![Codex](https://img.shields.io/badge/Codex-Skill-green?logo=openai&logoColor=white)](https://developers.openai.com/codex)
![Version](https://img.shields.io/badge/version-2.3.0-blue.svg)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)

[![Based on](https://img.shields.io/badge/Based_on-Karpathy's_Autoresearch-orange)](https://github.com/karpathy/autoresearch)

<br>

*"Set the GOAL → The agent runs the LOOP → You wake up to results"*

*You don't need AGI. You need a goal, a metric, and a loop that never quits.*

**Supports Claude Code, OpenCode, and OpenAI Codex. 18 commands. 9 safety hooks. Thin-router token architecture — command bodies load only when invoked.**

> **v2.3 — Logic-first acceptance:** the build pipeline now grades **six weighted dimensions** with a **gating `logic` dimension** — golden vectors derived from the SRS must all compute correctly, or the headline score is hard-capped at 0.50. See **[Logic-first (v2.3)](#logic-first-v23)**.
>
> **v2.2.0 — Autonomous Orchestrator:** Type a plain-language goal to `/autoresearch` and it classifies your goal, derives a Success predicate, confirms it once, then loops across subcommands until done. No manual chaining required. `Metric:`/`Verify:` invocations run the classic loop unchanged. See [guide/autoresearch-orchestrator.md](guide/autoresearch-orchestrator.md).
>
> **Build pipeline:** a full **SDLC engine** for building complex software — `/autoresearch:requirements` → `/autoresearch:build` (greenfield) or `/autoresearch:feature` (existing app) → `regression` → `ship`. Builds to **passing acceptance across six weighted dimensions** (logic · functional · UI/UX · devops · monitoring · hardening), conforms to a `DESIGN.md`, and verifies live in a real browser via gstack `/browse`. See **[Building Complex Software](#building-complex-software)**.

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
 /autoresearch:   /autoresearch    /autoresearch:   /autoresearch:   /autoresearch:   /autoresearch:
   plan                              debug            fix              security         ship

 ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
 │  Probe   │     │ Scenario │     │ Predict  │     │  Reason  │
 │ Require- │     │   Edge   │     │ 5-Expert │     │  Debate  │
 │  ments   │     │  Cases   │     │  Swarm   │     │ Converge │
 └──────────┘     └──────────┘     └──────────┘     └──────────┘
 /autoresearch:   /autoresearch:   /autoresearch:   /autoresearch:
   probe            scenario         predict          reason

 ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
 │  Learn   │     │ Improve  │     │   Eval   │     │ Baseline │
 │   Docs   │     │ Research │     │ Analyze  │     │   Diff   │
 │   Gen    │     │   PRDs   │     │ Results  │     │ Verdict  │
 └──────────┘     └──────────┘     └──────────┘     └──────────┘
 /autoresearch:   /autoresearch:   /autoresearch:   /autoresearch:
   learn            improve          evals            regression

   ── Build pipeline (full SDLC) ──────────────────────────────

 ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
 │ Require- │     │  Build   │     │ Feature  │     │   Test   │
 │  ments   │────▶│Greenfield│────▶│ Brownfld │     │ QA / RTM │
 │  → spec  │     │full SDLC │     │ +ratchet │     │ Verdict  │
 └──────────┘     └──────────┘     └──────────┘     └──────────┘
 /autoresearch:   /autoresearch:   /autoresearch:   /autoresearch:
   requirements     build            feature          test
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

v2.1.1 ships a 9-hook safety system that protects your sessions automatically. Hooks fire on every session — not just during autoresearch commands.

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
| `/autoresearch` | **Classic:** Core iterate loop: modify → verify → keep/discard · **Orchestrator:** free-form goal → auto-select pipeline → loop until predicate met | 25 / goal-bounded |
| `/autoresearch:plan` | Convert goal into validated config | one-shot |
| `/autoresearch:requirements` | Interview client (no assumptions) → validated build spec via a mechanical gate | one-shot |
| `/autoresearch:build` | Build greenfield full-stack software via the full SDLC to passing acceptance (6 weighted dims, logic-gated) | 40 |
| `/autoresearch:feature` | Add a feature to existing software — delta acceptance + hard non-regression ratchet | 25 |
| `/autoresearch:test` | Full QA engagement on existing software — risk-based plan, RTM, formal test design, execution + defect ledger, exit-criteria verdict (ISO 29119/ISTQB-aligned) | 20 |
| `/autoresearch:debug` | Hunt bugs via hypothesis iteration | 15 |
| `/autoresearch:fix` | Remediate defects to zero, root-cause first | 20 |
| `/autoresearch:security` | STRIDE + OWASP audit with red-team | 15 |
| `/autoresearch:ship` | Ship through 8 phases | linear |
| `/autoresearch:scenario` | Generate edge cases across 12 dimensions | 20 |
| `/autoresearch:predict` | 5 expert personas debate | one-shot |
| `/autoresearch:learn` | Scout → generate docs → validate → fix | 10 |
| `/autoresearch:reason` | Adversarial debate with blind judges | 8 |
| `/autoresearch:probe` | 8 personas interrogate requirements | 15 |
| `/autoresearch:improve` | Research ICP, discover improvements, generate PRDs | 15 |
| `/autoresearch:evals` | Analyze iteration results: trends, plateaus | one-shot |
| `/autoresearch:regression` | Stability gate: baseline vs candidate, verdict STABLE/UNSTABLE | one-shot |

**Universal flags:** `Iterations: N`, `Iterations: unlimited`, `--evals`, `--evals-interval N`, `--chain <targets>`, `--<subcommand>` shorthand.

**All commands use interactive setup when invoked without arguments.** Just type the command — the agent asks for what it needs with smart defaults based on your codebase.

> **OpenCode users:** Commands use underscore naming (`/autoresearch_debug`, `/autoresearch_fix`, etc.). All 18 commands available.
>
> **Codex users:** Invoke via `$autoresearch` mention syntax. Subcommands are keywords: `$autoresearch debug`, `$autoresearch plan`, etc.

### Quick Decision Guide

| I want to... | Use |
|--------------|-----|
| Build a new full-stack app from scratch (full SDLC) | `/autoresearch:build` |
| Turn a client brief into a validated build spec | `/autoresearch:requirements` |
| Add a feature to an existing app without regressions | `/autoresearch:feature` |
| Run a full QA engagement on an existing app (plan → RTM → verdict) | `/autoresearch:test` |
| Give a plain-language goal, let it self-orchestrate | `/autoresearch <goal>` (bare, no Metric/Verify) |
| Improve test coverage / reduce bundle size / any metric | `/autoresearch` |
| Run bounded iterations | Add `Iterations: N` to any command |
| Don't know what metric to use | `/autoresearch:plan` |
| Run a security audit | `/autoresearch:security` |
| Ship a PR / deployment / release | `/autoresearch:ship` |
| Optimize without breaking existing tests | Add `Guard: npm test` |
| Hunt all bugs in a codebase | `/autoresearch:debug` |
| Fix all errors (tests, types, lint) | `/autoresearch:fix` |
| Debug then auto-fix | `/autoresearch:debug --fix` |
| Check if something is ready to ship | `/autoresearch:ship --checklist-only` |
| Explore edge cases for a feature | `/autoresearch:scenario` |
| Generate test scenarios | `/autoresearch:scenario --format test-scenarios` |
| Get expert opinions before starting | `/autoresearch:predict` |
| Analyze from multiple angles then debug | `/autoresearch:predict --chain debug` |
| Generate docs for a new codebase | `/autoresearch:learn --mode init` |
| Update existing docs after changes | `/autoresearch:learn --mode update` |
| Debate an architecture decision | `/autoresearch:reason --domain software` |
| Surface hidden constraints before starting | `/autoresearch:probe` |
| Pre-flight a fuzzy goal then loop | `/autoresearch:probe --chain plan,autoresearch` |
| Discover what to build next for your ICP | `/autoresearch:improve` |
| Research competitors and generate PRDs | `/autoresearch:improve --depth deep` |
| Probe requirements then research improvements | `/autoresearch:probe --improve` |
| Analyze trends and plateaus across past runs | `/autoresearch:evals` |
| Check if a run has stalled | `/autoresearch:evals --file *-results.tsv` |
| Verify a change won't regress before pushing | `/autoresearch:regression` |
| Gate a PR: predict, fix, re-gate, then ship | `/autoresearch:regression --predict --fix --ship` |

---

## Building Complex Software

Four commands turn autoresearch into a full **software-development-lifecycle engine**. Software is an
iteration process — so building it is just the autoresearch loop applied to a *growing* acceptance set.

> 📘 **Full playbook (15–20 pages):** [guide/building-software-with-autoresearch.md](guide/building-software-with-autoresearch.md) — end-to-end walkthrough, the acceptance model in depth, building large multi-service systems, troubleshooting, and a complete worked example.

### The pipeline

```
/autoresearch:requirements  ─▶  /autoresearch:build  ─▶  /autoresearch:regression  ─▶  /autoresearch:ship
   client brief → spec           greenfield, full SDLC      stability gate                human-gated
                                       │
   grow it later  ─────────────────────┴────▶  /autoresearch:feature  (brownfield, +ratchet) ─▶ regression → ship
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
(build, boot, probe, the test pyramid, `/browse` e2e + axe) — never self-reported.

### Logic-first (v2.3)

The `logic` dimension is **gating**, not merely weighted. During requirements, the SRS's core business
rules are captured as **golden vectors** — concrete input → expected-output rows (payroll math, pricing,
state machines). While **any** `logic` golden-vector row fails, the headline score is hard-capped at
**0.50** (`LOGIC_GATE_CAP` in `scripts/score-build.sh`) — no amount of UI polish or infrastructure can
mask broken domain logic. Convergence additionally requires `REQ_COVERAGE == 1.00` and
`DESIGN_COVERAGE == 1.00` (`score-build.sh coverage`) and the iteration bound respected.

### Step 1 — Requirements (no assumptions)

```
/autoresearch:requirements Brief: "<what the client wants>"
```
Interviews you back-and-forth until requirements saturate, classifies functional vs non-functional, maps
NFRs to the six dimensions, prioritizes with MoSCoW, and emits a validated
`evals/fullstack/<name>.spec.yaml`. A **mechanical gate** releases the spec only when all six
dimensions are present + weighted.

### Step 2 — Build (greenfield)

```
/autoresearch:build Spec: evals/fullstack/<name>.spec.yaml
```
Runs the standard SDLC as an autoresearch loop: plan (charter) → feasibility (go/no-go spike) →
requirements (SRS + RTM) → design (HLD/LLD + a `DESIGN.md`) → implement
(TDD) → debug (root-cause) → comprehensive test → deploy (human-gated) → operate/maintain (runbook +
change-request path). One atomic slice per iteration,
`git commit experiment:` before verify, keep if `pass_rate` rises + guard green else auto-revert.

### Step 3 — Feature (brownfield — the ratchet)

```
/autoresearch:feature Feature: "<new capability>" Target: <app dir>
```
The same loop, continued on an existing app. Appends only the feature's acceptance (the **delta**),
drives it green, and enforces a **hard non-regression ratchet**: any existing green→red **auto-reverts**.
On convergence the feature ratchets into the spec — baseline only rises → **compounding gains**.

### Step 4 — Gate + Ship

`/autoresearch:regression` proves no green→red across 8 dimensions (STABLE / UNSTABLE).
`/autoresearch:ship` runs the 8-phase shipping workflow — **deployment is always human-gated**; nothing
deploys or pushes autonomously.

### DESIGN.md (UI/UX)

The design system is a committed `DESIGN.md` (Google DESIGN.md spec; reference catalog at
[getdesign.md](https://getdesign.md) / `awesome-design-md`). `build` / `feature` adopt one (catalog ref ·
file · URL · or generate via gstack `design-consultation`), derive **all** UI tokens from it, and verify
**conformance mechanically** via `/browse` (computed styles match the tokens; no off-system "slop").
gstack `/design-review` auto-fixes visual issues.

### Autonomy

A bare goal routes itself: `/autoresearch build me a notes app` → orchestrator classifies the
`build-feature` archetype → **greenfield → `build`, existing app → `feature`**. No manual chaining.

### Worked example

```
# 1. Requirements → validated spec (interactive, no assumptions)
/autoresearch:requirements Brief: "personal money tracker, offline"

# 2. Build the app to passing acceptance
/autoresearch:build Spec: evals/fullstack/money-tracker.spec.yaml Iterations: 40

# 3. Add a feature later, without breaking anything
/autoresearch:feature Feature: "recurring transactions" Target: build-output/money-tracker

# 4. Gate + ship (human-gated)
/autoresearch:regression --chain ship
```

### Building something large

1. **Decompose** into specs (one per app/service) with `requirements`.
2. **Build the core** greenfield with `build` — reach a green baseline fast.
3. **Grow by features** with `feature` — each stacks under the ratchet; the regression floor keeps the
   whole system stable as it compounds.
4. **Gate every increment** with `regression`; **ship** when green.

Every stage obeys the autoresearch first principle — a mechanical metric, bounded iteration, one atomic
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
| gstack (separate plugin) | **required for the build pipeline** — provides `/browse`, `design-consultation`, `/design-review` (the ux dimension + live e2e verification) |

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
/plugin install autoresearch@autoforge
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
/plugin install autoresearch@autoforge
```

**Option C — Manual copy:**
```bash
git clone https://github.com/Jss-on/autoforge

# Copy skill + subcommands to your project
cp -r autoforge/.claude/skills/autoresearch .claude/skills/autoresearch
cp -r autoforge/.claude/commands/autoresearch .claude/commands/autoresearch
cp autoforge/.claude/commands/autoresearch.md .claude/commands/autoresearch.md
```

Or install globally:
```bash
cp -r autoforge/.claude/skills/autoresearch ~/.claude/skills/autoresearch
cp -r autoforge/.claude/commands/autoresearch ~/.claude/commands/autoresearch
cp autoforge/.claude/commands/autoresearch.md ~/.claude/commands/autoresearch.md
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

cp -r autoforge/.opencode/skills/autoresearch .opencode/skills/autoresearch
cp autoforge/.opencode/commands/autoresearch*.md .opencode/commands/
```

Or globally:
```bash
cp -r autoforge/.opencode/skills/autoresearch ~/.config/opencode/skills/autoresearch
cp autoforge/.opencode/commands/autoresearch*.md ~/.config/opencode/commands/
```

> All 18 commands available as `/autoresearch_debug`, `/autoresearch_fix`, `/autoresearch_improve`, etc.

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
cp -r autoforge/.agents/skills/autoresearch ~/.codex/skills/autoresearch
```

> Invoke via `$autoresearch` mention syntax. Subcommands are keywords: `$autoresearch plan`, `$autoresearch debug`, `$autoresearch evals`, etc.

### Run It

```
/autoresearch
Goal: Increase test coverage from 72% to 90%
Scope: src/**/*.test.ts, src/**/*.ts
Metric: coverage % (higher is better)
Verify: npm test -- --coverage | grep "All files"
Iterations: 25
```

Claude reads all files, establishes a baseline, and starts iterating — one change at a time. Keeps improvements, auto-reverts failures, logs everything. Stops after N iterations or when you interrupt.

---

## /autoresearch:plan — Goal to Config

The hardest part isn't the loop — it's defining Scope, Metric, and Verify correctly. `/autoresearch:plan` converts your plain-language goal into a validated, ready-to-execute configuration.

```
/autoresearch:plan
Goal: Make the API respond faster
```

Walks through 5 steps: capture goal → define scope → define metric → define direction → validate verify command (dry-run). Every gate is mechanical — scope must resolve to files, metric must output a number, verify must pass a dry-run. Emits a `handoff.json` for chaining.

---

## /autoresearch:requirements — Requirements Engineering

Turn a client brief into a validated build spec — **no assumptions**. Multi-round interview until
requirements saturate, classify functional vs non-functional, map NFRs to the six build dimensions,
prioritize with MoSCoW, then emit + mechanically validate `evals/fullstack/<name>.spec.yaml`.

```
/autoresearch:requirements Brief: "internal expense tracker with SSO" --chain build
```

Single-pass dispatch; the **mechanical** `validate` gate (all six dimensions present + weighted)
releases the spec — never a subjective "looks complete". The full requirements-engineering process is
self-contained in the command (no separate protocol file).

---

## /autoresearch:build — Greenfield Full-Stack Builder

Builds new software via the **standard SDLC** — plan → feasibility → requirements → design
(HLD/LLD + `DESIGN.md`) → implement (TDD, with a root-cause defect loop) → comprehensive test →
deploy → operate/maintain — every phase gated with its named deliverable (project charter, SRS + RTM,
test summary, release notes, runbook) — to **passing acceptance across six weighted
dimensions** with the gating `logic` golden vectors, verified live in a real browser via gstack `/browse`.

```
/autoresearch:build Spec: evals/fullstack/<name>.spec.yaml Iterations: 40
```

| Flag | Purpose |
|------|---------|
| `Spec:` | eval spec (stack + per-dimension acceptance) |
| `Goal:` | derive a spec from prose when no `Spec` given |
| `Design:` | `DESIGN.md` source — catalog slug / file / URL / `generate` |
| `Scope:` | build directory (default `build-output/<name>/`, never the skill repo) |
| `Target-rate:` | pass-rate to stop at (default 1.00) |

Runs as an autoresearch loop: one atomic slice per iteration → `git commit experiment:` before verify →
keep if `pass_rate` rises + guard green, else auto-revert → log `iterations.tsv`. The SDLC phase-gate
table + principles are folded into the build command; companion references: `uiux-checklist.md`,
`fullstack-hardening-checklist.md`.

---

## /autoresearch:feature — Iterative Feature Addition (brownfield)

Adds a feature to an **existing** app under a **hard non-regression ratchet** — the same loop, on a
delta, conforming to the app's `DESIGN.md`. This is how software grows: every feature stacks, nothing
backslides.

```
/autoresearch:feature Feature: "recurring transactions" Target: build-output/money-tracker
```

Appends only the feature's acceptance, drives it green, and **auto-reverts any slice that turns an
existing green assertion red** (reuses `regression`). On convergence the feature ratchets permanently
into the spec — the baseline only rises (**compounding gains**). Greenfield targets are auto-handed to
`build`.

---

## /autoresearch:debug — Autonomous Bug Hunter

Scientific method meets autoresearch loop. Doesn't stop at one bug — iteratively hunts ALL bugs using falsifiable hypotheses, evidence-based investigation, and 7 investigation techniques.

```
/autoresearch:debug
Scope: src/api/**/*.ts
Symptom: API returns 500 on POST /users
Iterations: 15
```

**How it works:** Gather symptoms → Recon → Hypothesize (specific, testable) → Test (one experiment per iteration) → Classify (confirmed/disproven/inconclusive) → Log → Repeat.

Every finding requires code evidence (file:line + reproduction steps). Every disproven hypothesis is logged — equally valuable.

| Flag | Purpose |
|------|---------|
| `--fix` | After hunting, auto-switch to `/autoresearch:fix` |
| `--scope <glob>` | Limit investigation scope |
| `--symptom "<text>"` | Pre-fill symptom |
| `--severity <level>` | Minimum severity to report |

---

## /autoresearch:fix — Autonomous Error Crusher

Takes a broken state and iteratively repairs it until everything passes. ONE fix per iteration. Atomic, committed, verified, auto-reverted on failure.

```
/autoresearch:fix
Iterations: 20
```

Auto-detects what's broken (tests, types, lint, build) → Prioritizes (blockers first) → Fixes ONE thing → Commits → Verifies error count decreased → Guard check → Keep/Revert → Repeat. **Stops automatically when error count hits zero.**

| Flag | Purpose |
|------|---------|
| `--target <command>` | Explicit verify command |
| `--guard <command>` | Safety command that must always pass |
| `--category <type>` | Only fix specific type (test, type, lint, build) |
| `--from-debug` | Read findings from latest debug session |

**Chain them:** `/autoresearch:debug` → `/autoresearch:fix --from-debug`

---

## /autoresearch:security — Autonomous Security Audit

Read-only security audit using STRIDE threat modeling, OWASP Top 10 sweeps, and red-team adversarial analysis with 4 hostile personas.

```
/autoresearch:security
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

## /autoresearch:ship — Universal Shipping Workflow

Ship anything through 8 phases: **Identify → Inventory → Checklist → Prepare → Dry-run → Ship → Verify → Log.**

```
/autoresearch:ship --auto
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

## /autoresearch:scenario — Scenario Explorer

Autonomous scenario exploration engine. Takes a seed scenario and iteratively generates situations across 12 dimensions — happy paths, errors, edge cases, abuse, scale, concurrency, temporal, data variation, permissions, integrations, recovery, and state transitions.

```
/autoresearch:scenario
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

## /autoresearch:predict — Multi-Persona Prediction

Before you debug, fix, or ship — get 5 expert perspectives in 2 minutes.

Simulates a team (Architect, Security Analyst, Performance Engineer, Reliability Engineer, Devil's Advocate) who independently analyze your code, debate findings, and reach consensus.

```
/autoresearch:predict --chain debug
```

- `--chain debug` — pre-ranked hypotheses before debugging
- `--chain security` — multi-persona red team analysis
- `--chain scenario,debug,fix` — full quality pipeline

---

## /autoresearch:learn — Autonomous Documentation Engine

Scout codebase → generate docs → validate → fix → repeat. 4 modes: init (create from scratch), update (refresh existing), check (read-only health report), summarize (quick overview).

```
/autoresearch:learn --mode init --depth deep
Iterations: 10
```

Dynamic doc discovery, project-type detection, validation-fix loop, git-diff scoping for updates, selective single-doc update with `--file`. Auto-generates Mermaid architecture diagrams, API reference, testing guide, config guide, and cross-reference links.

---

## /autoresearch:reason — Adversarial Refinement

Extends autoresearch to **subjective domains** where no objective metric exists. The blind judge panel is the fitness function.

```
/autoresearch:reason
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
| `--chain <targets>` | Chain converged output to any autoresearch command |

**Output:** Creates `reason/{date}-{slug}/` with lineage.md, candidates.md, judge-transcripts.md, reason-results.tsv, handoff.json.

---

## /autoresearch:probe — Adversarial Requirement Interrogation

Eight adversarial personas interrogate user and codebase together until net-new constraints saturate. Output is the 5 autoresearch primitives (Goal/Scope/Metric/Direction/Verify) plus a `handoff.json` ready to feed any downstream command.

```
/autoresearch:probe --chain plan,autoresearch
Topic: Add multi-tenant isolation to the database layer
```

**The 8 personas:** Skeptic, Edge-Case Hunter, Scope Sentinel, Ambiguity Detective, Contradiction Finder, Prior-Art Investigator, Success-Criteria Auditor, Constraint Excavator.

| Flag | Purpose |
|------|---------|
| `--depth <level>` | shallow (5 rounds), standard (15), deep (30) |
| `--adversarial` | Rotate Skeptic + Contradiction Finder + Edge-Case Hunter to front |
| `--mode <mode>` | interactive (default) or autonomous |
| `--chain <targets>` | plan, predict, debug, scenario, reason, fix, ship, learn |

**Output:** Creates `probe/{date}-{slug}/` with probe-spec.md, constraints.tsv, autoresearch-config.yml, handoff.json.

---

## /autoresearch:improve — Product Improvement Engine

Research what to build next. Discovers ICP challenges via deep multi-source research, scores and ranks improvements, generates per-feature PRDs with evidence chains.

```
/autoresearch:improve
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

**Terminal emitter** — improve is the last link in any autoresearch chain. PRDs are consumed by external tools (`/ck:plan`, `/ck:cook`), not by other autoresearch commands.

**Chain into improve:** `/autoresearch:probe --improve`, `/autoresearch:predict --improve`, `/autoresearch:debug --improve`.

---

## /autoresearch:evals — Results Analyzer

Analyzes `*-results.tsv` files from any autoresearch run. Surfaces trends, plateau detection, convergence signals, and iteration efficiency. Backward compatible with v2.0.x TSV format.

```
/autoresearch:evals
/autoresearch:evals --file coverage-results.tsv
```

**Adaptive checkpoints:** floor(max_iterations/3), minimum 1 checkpoint. Reports per-checkpoint delta, stall detection, best iteration, and a recommendation (continue / stop / change strategy).

**Inline evals during a run:**
```
/autoresearch
Goal: Reduce bundle size below 200kb
Iterations: 30
--evals-interval 10
```

Prints a checkpoint report every 10 iterations without interrupting the loop.

---

## /autoresearch:regression — Stability Gate

Before you push, prove the change didn't break what already worked. Captures baseline behavior from a `git worktree` of the base ref, diffs the candidate across **8 dimensions**, and emits a single **STABLE / UNSTABLE** verdict.

```
/autoresearch:regression --predict --evals --fix --ship
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
/autoresearch
Goal: Reduce API response time to under 100ms
Verify: npm run bench:api | grep "p95"
Guard: npm test
```

- **Verify** = "Did the metric improve?" (the goal)
- **Guard** = "Did anything else break?" (the safety net)

If the metric improves but the guard fails, Claude reworks the optimization (up to 2 attempts). Guard/test files are never modified.

> **Credit:** Guard was contributed to the upstream autoresearch engine by [@pronskiy](https://github.com/pronskiy) (JetBrains).

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

Run `/autoresearch:evals` at any time to analyze trends across any TSV file. Adaptive checkpoints fire at floor(max_iterations/3) intervals.

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
├── NOTICE                                         ← upstream MIT attribution (autoresearch engine)
├── guide/                                         ← guides — one per command + the build playbook
├── docs/                                          ← design + release documentation
├── evals/fullstack/                               ← build specs (*.spec.yaml)
├── tests/                                         ← harness self-tests (parity, hooks, scorers)
├── scripts/
│   ├── install.sh                                 ← guided installer (Claude Code + OpenCode + Codex)
│   ├── doctor.sh                                  ← environment preflight
│   ├── transform.sh                               ← single transform: .claude/ → .opencode/ + .agents/ + plugins/
│   ├── orchestrate.sh                             ← orchestrator seam (classify / route / units / screen)
│   ├── score-build.sh                             ← fullstack_pass_rate scorer + logic gate + coverage
│   ├── score-requirements.sh                      ← build-spec validator (requirements)
│   ├── score-regression.sh                        ← regression stability verdict
│   └── release.sh                                 ← release automation
├── .claude/
│   ├── skills/autoresearch/
│   │   ├── SKILL.md                               ← thin routing table (108 lines)
│   │   └── references/                            ← focused reference files (security, personas,
│   │                                                orchestrator routing, ux + hardening checklists)
│   └── commands/
│       ├── autoresearch.md                        ← core loop (self-contained)
│       └── autoresearch/                          ← 17 subcommand files (18 commands total)
├── .claude-plugin/marketplace.json                ← marketplace manifest (marketplace name: autoforge)
├── claude-plugin/                                 ← Claude Code plugin package (skills + commands + hooks)
├── .opencode/                                     ← OpenCode port (via transform.sh)
│   ├── skills/autoresearch/
│   └── commands/                                  ← 18 command files (autoresearch_*.md)
├── .agents/                                       ← Codex port (via transform.sh)
│   └── skills/autoresearch/
└── plugins/autoresearch/                          ← Codex plugin package
    ├── .codex-plugin/plugin.json                  ← plugin manifest
    └── skills/autoresearch/
```

---

## FAQ

**Q: I don't know what metric to use.**
A: Run `/autoresearch:plan` — it analyzes your codebase, suggests metrics, and dry-runs the verify command before you launch.

**Q: How do I build a whole app, not just optimize one metric?**
A: Use the build pipeline — `/autoresearch:requirements` (brief → validated spec, no assumptions) → `/autoresearch:build` (greenfield, full SDLC, six weighted acceptance dimensions with the gating `logic` golden vectors, `DESIGN.md`, verified live via `/browse`) → `/autoresearch:feature` to add features under a hard non-regression ratchet → `/autoresearch:regression` → `/autoresearch:ship` (human-gated). See [Building Complex Software](#building-complex-software).

**Q: What changed in v2.3?**
A: Logic-first acceptance. The build pipeline now grades **six** weighted dimensions — logic, functional, ux, devops, monitoring, hardening. The new `logic` dimension is **gating**: golden vectors derived from the SRS must all compute correctly, and while any fails the headline score is hard-capped at 0.50. Convergence additionally requires `REQ_COVERAGE == 1.00` and `DESIGN_COVERAGE == 1.00`. The requirements → build → feature chain carries these gates end-to-end: `requirements` emits the golden vectors, `build` drives them green, `feature` ratchets them.

**Q: What changed in v2.2.0?**
A: The root `/autoresearch` command now supports an autonomous orchestrator mode. Type a plain-language goal (e.g., `/autoresearch help me fix the login bug`) instead of `Metric:`/`Verify:` and the orchestrator classifies your goal, derives a verifiable Success predicate, confirms it once, then loops across subcommands until done. Classic metric-loop behavior is unchanged when `Metric:` or `Verify:` are present.

**Q: What changed in v2.1.0?**
A: Architecture rebuild. The monolithic SKILL.md was replaced with a thin router that stays resident (~8KB) plus self-contained command files — now 18 commands whose bodies (~3–35KB each) load only when invoked, with reference files pulled on demand. A new `/autoresearch:evals` command analyzes iteration results. Every looping command now has a bounded default instead of running unlimited.

**Q: How do bounded defaults work?**
A: Every looping command ships with a sensible default (e.g., `/autoresearch` defaults to 25 iterations). Override inline: `Iterations: 50` for more, `Iterations: unlimited` for the old unbounded behavior.

**Q: How does /autoresearch:evals work?**
A: Point it at any `*-results.tsv` file from a previous run. It reports trends, plateau detection, and a recommendation. Use `--evals-interval N` during a live run to get checkpoint reports without interrupting the loop.

**Q: Does this work with any project?**
A: Yes. Any language, framework, or domain. Install via plugin (Claude Code), installer script, or manual copy.

**Q: Does this work with OpenCode?**
A: Yes. Run `./scripts/install.sh --opencode --global` or manually copy `.opencode/` files. Commands use underscore naming (`/autoresearch_debug`, `/autoresearch_evals`, etc.). All 18 commands available.

**Q: Does this work with OpenAI Codex?**
A: Yes. Run `./scripts/install.sh --codex --global` or copy `.agents/skills/autoresearch/` to `~/.codex/skills/autoresearch`. Invoke via `$autoresearch` mention syntax.

**Q: How do I stop the loop?**
A: `Ctrl+C` or add `Iterations: N` to your inline config. Claude commits before verifying, so your last successful state is always in git.

**Q: Can I use this for non-code tasks?**
A: Absolutely. Sales emails, marketing copy, HR policies, runbooks — anything with a measurable metric. See [Examples by Domain](guide/examples-by-domain.md).

**Q: Does /autoresearch:security modify my code?**
A: No. Read-only by default. Use `--fix` to opt into auto-remediation of confirmed Critical/High findings.

**Q: What's the difference between /autoresearch:predict and /autoresearch:reason?**
A: Predict is a one-shot analysis — 5 experts debate your existing code. Reason is an iterative refinement loop — competing candidates are generated, critiqued, synthesized, and blind-judged over multiple rounds until convergence. Use predict for analysis before acting; use reason for decisions where no objective metric exists.

**Q: What is handoff.json?**
A: A structured file emitted by plan, probe, reason, and other commands that carries Goal/Scope/Metric/Verify config for downstream commands. When you `--chain plan,autoresearch`, the chain reads handoff.json automatically.

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
