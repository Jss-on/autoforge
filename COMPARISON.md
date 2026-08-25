<div align="center">

# Karpathy's Autoresearch vs Claude AutoForge

**The original ML research loop vs the universal autonomous improvement engine**

*How a 630-line Python training script inspired a domain-agnostic skill system built on Claude Code*

</div>

---

## The Origin Story

In March 2026, **[Andrej Karpathy](https://github.com/karpathy)** released [autoresearch](https://github.com/karpathy/autoresearch) — a 630-line Python script that let AI agents autonomously optimize a GPT language model overnight. In 2 days, a single agent ran **700 experiments**, discovered **20 optimizations**, and achieved an **11% speedup** on already-optimized code. The repo hit 26,000 GitHub stars in under a week.

**[Claude AutoForge](https://github.com/Jss-on/autoforge)** — built on **[Udit Goenka](https://udit.co)**'s autoresearch engine — takes Karpathy's core principles — constraint, mechanical metric, autonomous iteration — and generalizes them into a **Claude Code skill system** with 14 commands that work on **any domain**: code, content, marketing, sales, security, DevOps, HR, or anything with a measurable number.

The philosophy is the same. The scope is radically different.

---

## At a Glance

| | **Karpathy's Autoresearch** | **Claude AutoForge** |
|---|---|---|
| **What it is** | Python script for autonomous ML training optimization | Claude Code skill for autonomous improvement of anything measurable |
| **Created by** | Andrej Karpathy (ex-Tesla AI, OpenAI) | Jss-on — engine by Udit Goenka |
| **Released** | March 2026 | March 2026 |
| **Language** | Python (PyTorch) | Markdown (Claude Code skill system) |
| **LOC** | ~630 (train.py) | ~1,750 across 14 self-contained command files + routing table |
| **Runtime** | Python + NVIDIA GPU + CUDA | Claude Code (any OS, any project, any language) |
| **Domain** | ML model training only | Any domain with a measurable metric |
| **Metric** | val_bpb (validation bits per byte) | Any mechanical metric you define |
| **Scope** | Single file (train.py) | Any glob pattern (e.g., `src/**/*.ts`) |
| **Commands** | 1 (run the script) | 14 subcommands + flags |
| **Setup** | Manual (edit program.md) | Interactive wizard (`/forge:plan`) |
| **Hardware** | Requires NVIDIA GPU (H100/A100/RTX) | No special hardware — runs wherever Claude Code runs |
| **Cost** | GPU compute ($2-5/hour for H100) | Claude API tokens only |
| **License** | MIT | MIT |

---

## The Core Loop: Same DNA, Different Expression

Both projects implement the same fundamental pattern — what the community calls **"The Karpathy Loop"**:

```
AGENT + CONSTRAINED_SCOPE + SCALAR_METRIC + FAST_VERIFICATION = AUTONOMOUS_IMPROVEMENT
```

### Karpathy's Loop

```
1. Agent reads train.py (630 lines)
2. Agent hypothesizes an improvement
3. Agent modifies train.py
4. Git commit
5. Train for exactly 5 minutes
6. Evaluate val_bpb
7. If improved → keep. If not → git reset.
8. Repeat forever.
```

### Claude AutoForge Loop

```
1. Claude reads all in-scope files + git history + results log
2. Claude picks the next change (based on patterns from history)
3. Claude makes ONE focused change
4. Git commit (before verification)
5. Run mechanical verification (any command)
6. Run guard command (optional safety net)
7. If improved + guard passes → keep. If worse → git revert. If crashed → fix or skip.
8. Log to TSV. Repeat forever (or N iterations).
```

**Key differences in the loop:**

| Aspect | Karpathy | Claude AutoForge |
|--------|----------|---------------------|
| **Scope reading** | Single file (train.py) | All in-scope files + git history + results log |
| **History awareness** | Git log only | Git log + TSV results log + pattern analysis |
| **Verification** | 5-minute training run (fixed wall-clock) | Any shell command (typically seconds) |
| **Rollback** | `git reset` | `git revert` (preserves failed experiments in history) |
| **Guard** | None | Optional guard command prevents regressions |
| **Stuck detection** | None | Auto-escalates after 5 consecutive discards |
| **Crash recovery** | Manual | Auto-fix (max 3 attempts), then move on |
| **Noise handling** | None | Multi-run median, min-delta thresholds |
| **Logging** | TSV (basic) | TSV with delta, guard status, and 10-iteration summaries |

---

## Shared Principles: The 7 Universals

Both projects are built on the same philosophical foundation. Karpathy discovered them in ML; Claude AutoForge applies them everywhere:

| # | Principle | Karpathy's Expression | Claude AutoForge's Expression |
|---|-----------|----------------------|--------------------------------|
| 1 | **Constraint = Enabler** | 630-line file, 5-min budget, one metric | User-defined scope (glob), iteration budget, single metric |
| 2 | **Strategy ≠ Tactics** | Human writes program.md (what), agent codes train.py (how) | Human sets Goal/Metric (what), Claude iterates (how) |
| 3 | **Mechanical Metrics** | val_bpb — vocabulary-independent, compression-based | Any command that outputs a number (`npm test --coverage`, `wc -l`, etc.) |
| 4 | **Fast Verification** | 5-min training cycle (~12 experiments/hour) | Seconds-level verify commands (~360 experiments/hour possible) |
| 5 | **Iteration Cost → Behavior** | 5-min cost enables bold exploration | <30s cost enables even bolder exploration |
| 6 | **Git as Memory** | Experimental branches, date-tagged commits | `experiment:` prefix commits, `git revert` preserves history, agent reads `git log` + `git diff` every iteration |
| 7 | **Honest Limitations** | Cannot change tokenizer, limited to one architecture | Explicitly states constraints at setup, stops if it hits a wall |

---

## The Generalization: From ML to Everything

Karpathy's question #7 in his unresolved questions was:

> *"Could forge pattern apply to software engineering (bug fixing, refactoring)? Could it work for non-differentiable systems? What domains satisfy the 'scalar metric + fast eval' requirement?"*

Claude AutoForge answers: **all of them.**

### Domain Comparison

| Domain | Karpathy's Autoresearch | Claude AutoForge |
|--------|------------------------|---------------------|
| **ML Training** | ✅ Primary and only domain | ✅ Supported (with Python verify commands) |
| **Software Engineering** | ❌ Not supported | ✅ Test coverage, bundle size, type errors, lint, LOC |
| **API Performance** | ❌ Not supported | ✅ p95 latency, throughput, error rates |
| **Frontend** | ❌ Not supported | ✅ Lighthouse score, Core Web Vitals, accessibility |
| **Security** | ❌ Not supported | ✅ Dedicated `/forge:security` command |
| **Content/SEO** | ❌ Not supported | ✅ Readability, keyword density, SEO score |
| **Sales/Marketing** | ❌ Not supported | ✅ Email open rate, CTR, conversion metrics |
| **DevOps** | ❌ Not supported | ✅ Query time, deployment success, uptime |
| **HR/Operations** | ❌ Not supported | ✅ Process cycle time, error rate, SLA compliance |
| **Data Science** | ❌ Not supported (only trains models) | ✅ Accuracy, F1, BLEU, custom metrics |

### Metric Comparison

| | Karpathy | Claude AutoForge |
|---|----------|---------------------|
| **Number of metrics** | 1 (val_bpb) | Unlimited (user-defined) |
| **Direction** | Lower is better (fixed) | Higher or lower (user-specified) |
| **Guard/safety** | None | Optional guard command |
| **Extraction** | Built into prepare.py | `grep`, `awk`, `jq`, or custom script |
| **Noise handling** | None | Multi-run median, min-delta thresholds |
| **Examples** | `val_bpb: 1.26` | `coverage: 87.3%`, `p95_ms: 42`, `bundle_kb: 180` |

---

## Command Surface: 1 vs 12

### Karpathy: One Script, One Way

```bash
uv run train.py    # That's it. The entire interface.
```

Configuration via `program.md` (a markdown file the agent reads for instructions). No flags, no modes, no interactive setup.

### Claude AutoForge: 12 Specialized Commands

| Command | What It Does | Karpathy Equivalent |
|---------|-------------|---------------------|
| `/forge` | Core autonomous improvement loop | `uv run train.py` (closest match) |
| `/forge:plan` | Interactive wizard: Goal → Scope, Metric, Verify | Manual editing of program.md |
| `/forge:debug` | Autonomous bug-hunting with scientific method | ❌ No equivalent |
| `/forge:fix` | Autonomous error crusher until zero errors | ❌ No equivalent |
| `/forge:security` | STRIDE + OWASP security audit with red-team personas | ❌ No equivalent |
| `/forge:ship` | Universal shipping workflow (9 ship types) | ❌ No equivalent |
| `/forge:scenario` | Scenario explorer — 12 dimensions, 5 domains | ❌ No equivalent |
| `/forge:predict` | Multi-persona swarm prediction (5 expert debate) | ❌ No equivalent (Karpathy's vision: "SETI@home for ML") |
| `/forge:learn` | Autonomous documentation engine — scout, generate, validate, fix | ❌ No equivalent |
| `/forge:reason` | Adversarial refinement — blind judge debate for subjective domains | ❌ No equivalent (Karpathy's Q7: "non-differentiable systems") |
| `/forge:probe` | Adversarial requirement / assumption interrogation — 8 personas probe user + codebase to mechanical saturation, emits ready-to-run forge config | ❌ No equivalent |
| `/forge:evals` | Analyze iteration results — trends, plateaus, regressions, adaptive checkpoints | ❌ No equivalent |

### Command Chaining (Claude AutoForge Only)

Commands chain together — each command's output feeds the next:

```
predict → scenario → debug → fix → ship     (full quality pipeline)
plan → loop → security → ship                 (feature lifecycle)
debug → fix → ship                             (production incident)
predict --adversarial → security → fix         (pre-deploy hardening)
learn → security → ship                        (docs + audit + release)
reason → predict → fix                           (debate → validate → implement)
reason → scenario,debug,fix                       (converge → explore → test → fix)
probe → plan,forge                        (interrogate → config → loop)
probe → reason                                    (interrogate → debate → converge)
probe → scenario,debug,fix                       (interrogate → enumerate → test → fix)
```

Karpathy's autoresearch has no concept of chaining — it's a single continuous loop.

---

## Setup Experience

### Karpathy: Manual, ML-Expert Level

```bash
# 1. Clone
git clone https://github.com/karpathy/autoresearch
cd autoresearch

# 2. Install dependencies (requires NVIDIA GPU + CUDA 12.8)
uv sync

# 3. Prepare data (~2 min, downloads OpenWebText ~2GB)
uv run prepare.py

# 4. Edit program.md with your instructions
vim program.md

# 5. Run (requires AI agent like Claude or GPT-4 connected externally)
uv run train.py
```

**Requires:** NVIDIA GPU, CUDA 12.8+, Python 3.10+, PyTorch 2.9.1, dataset download, external AI agent connection.

### Claude AutoForge: Interactive, Zero-Config

```bash
# 1. Install (one command in Claude Code)
/plugin marketplace add Jss-on/autoforge
/plugin install forge@forge

# 2. Run (Claude asks you what you need)
/forge

# Or use the wizard:
/forge:plan
Goal: Increase test coverage to 90%
```

**Requires:** Claude Code. That's it. No GPU, no dataset, no Python, no CUDA. Works on any OS, any project, any programming language.

---

## Architecture: Script vs Skill System

### Karpathy: Monolithic Python Script

```
forge/
├── train.py          ← The ONLY modifiable file (630 LOC)
├── prepare.py        ← Fixed: data prep, tokenizer, evaluation
├── program.md        ← Human instructions for the agent
├── pyproject.toml    ← Dependencies
└── (git branches)    ← Experimental results
```

**Three immutable components:**
- `prepare.py` — dataset, tokenizer, evaluation function (NEVER modified)
- `train.py` — model architecture, optimizer, training loop (AGENT MODIFIES THIS)
- `program.md` — high-level strategy (HUMAN WRITES THIS)

### Claude AutoForge: Modular Skill System (v2.1.0)

```
forge/
├── .claude/
│   ├── skills/forge/
│   │   ├── SKILL.md                        ← Thin routing table (41 lines)
│   │   └── references/
│   │       ├── security-checklist.md       ← STRIDE + OWASP checklist
│   │       ├── predict-personas.md         ← 5 expert personas
│   │       └── reason-judge-protocol.md    ← Adversarial refinement protocol
│   └── commands/
│       ├── forge.md                 ← Core loop (self-contained, 110 lines)
│       └── forge/
│           ├── plan.md                     ← /forge:plan
│           ├── debug.md                    ← /forge:debug
│           ├── fix.md                      ← /forge:fix
│           ├── security.md                 ← /forge:security
│           ├── ship.md                     ← /forge:ship
│           ├── scenario.md                 ← /forge:scenario
│           ├── predict.md                  ← /forge:predict
│           ├── learn.md                    ← /forge:learn
│           ├── reason.md                   ← /forge:reason
│           ├── probe.md                    ← /forge:probe
│           └── evals.md                    ← /forge:evals (NEW)
├── .opencode/                              ← OpenCode port (via transform.sh)
├── .agents/ + plugins/                     ← Codex port (via transform.sh)
├── scripts/transform.sh                    ← Single platform transform
├── guide/                                  ← Comprehensive guides (one per command)
└── README.md
```

**Key architectural difference:** Karpathy's autoresearch IS the script. Claude AutoForge is a PROTOCOL — each command file is self-contained with full instructions (~100 lines each, ~5-8K tokens). Only the needed command loads per invocation (95% token reduction from v2.0.x monolith).

---

## Feature-by-Feature Deep Comparison

### The Core Loop

| Feature | Karpathy | Claude AutoForge |
|---------|----------|---------------------|
| Loop type | Infinite (until Ctrl+C) | Infinite OR bounded (`Iterations: N`) |
| Iteration cost | 5 minutes (fixed, GPU-bound) | Seconds to minutes (depends on verify command) |
| Experiments/hour | ~12 | Up to ~360 (with fast verify) |
| Experiments overnight | ~100 | Up to ~2,880 (with 10s verify cycle) |
| Scope | Single file (train.py, 630 LOC) | Any file pattern (`src/**/*.ts`, `content/*.md`, etc.) |
| Multi-file edits | ❌ Not allowed | ✅ Any files within scope |
| Modification approach | Rewrite portions of train.py | Surgical edits via Claude Code's Edit tool |
| Rollback mechanism | `git reset` (destructive, loses history) | `git revert` (preserves failed experiments in history) |
| Results format | TSV (basic columns) | TSV (iteration, commit, metric, delta, guard, status, description) |
| Progress summaries | ❌ None | ✅ Every 10 iterations + final summary |

### Verification & Safety

| Feature | Karpathy | Claude AutoForge |
|---------|----------|---------------------|
| Verify command | Built-in: train for 5 min, evaluate val_bpb | User-defined: any shell command that outputs a number |
| Guard command | ❌ None | ✅ Optional safety net (e.g., `npm test`) |
| Guard recovery | N/A | Reworks optimization to avoid regression (max 2 attempts) |
| Crash recovery | ❌ Manual (agent may keep iterating on broken code) | ✅ Auto-fix (max 3 attempts), then skip and continue |
| Noise handling | ❌ None (single evaluation per experiment) | ✅ Multi-run median, min-delta thresholds, confirmation runs |
| Stuck detection | ❌ None | ✅ Auto-escalates after 5 consecutive discards |
| Stuck strategy | N/A | Re-reads all files, combines near-misses, tries radical changes |
| Precondition checks | ❌ None | ✅ Clean git tree, no stale locks, not detached HEAD, baseline established |

### Git Integration

| Feature | Karpathy | Claude AutoForge |
|---------|----------|---------------------|
| Branch strategy | Experimental branches (`forge/mar5`) | Works on current branch (no special branching) |
| Commit prefix | Agent-chosen message | `experiment:` prefix |
| Failed experiments | `git reset` — erased from branch | `git revert` — preserved in history for learning |
| History reading | Agent reads train.py (sees cumulative changes) | Agent reads `git log --oneline -20` + `git diff HEAD~1` every iteration |
| Pattern learning | Implicit (through code state) | Explicit (reads results log + git diff to identify successful patterns) |

### Interactive Setup

| Feature | Karpathy | Claude AutoForge |
|---------|----------|---------------------|
| Setup wizard | ❌ None — edit program.md manually | ✅ `/forge:plan` — 7-step interactive wizard |
| Codebase analysis | ❌ None | ✅ Detects tech stack, test runner, linter, build tools |
| Metric suggestion | ❌ None | ✅ Suggests metrics based on goal + detected tooling |
| Verify dry-run | ❌ None | ✅ Runs verify command, confirms it outputs a number, records baseline |
| Scope validation | ❌ None | ✅ Confirms glob resolves to files, warns if too broad |

### Specialized Workflows

| Workflow | Karpathy | Claude AutoForge |
|----------|----------|---------------------|
| **Bug hunting** | ❌ Not supported | ✅ `/forge:debug` — scientific method, 7 investigation techniques |
| **Error fixing** | ❌ Not supported | ✅ `/forge:fix` — iterative repair until zero errors |
| **Security audit** | ❌ Not supported | ✅ `/forge:security` — STRIDE + OWASP + 4 red-team personas |
| **Shipping** | ❌ Not supported | ✅ `/forge:ship` — 9 ship types (code, content, marketing, etc.) |
| **Scenario exploration** | ❌ Not supported | ✅ `/forge:scenario` — 12 dimensions, 5 domains |
| **Multi-persona analysis** | ❌ Not supported (Karpathy's stated vision) | ✅ `/forge:predict` — 5 expert personas debate before action |
| **Documentation** | ❌ Not supported | ✅ `/forge:learn` — scout, generate, validate, fix loop |
| **Command chaining** | ❌ Not supported | ✅ `predict → debug → fix → ship` and many more |

### Platform & Compatibility

| Feature | Karpathy | Claude AutoForge |
|---------|----------|---------------------|
| **Operating Systems** | Linux (primary), macOS (via fork), Windows (via fork) | Any OS that runs Claude Code (macOS, Linux, Windows) |
| **Hardware** | NVIDIA GPU required (H100/A100/RTX) | No special hardware |
| **GPU required** | ✅ Yes (CUDA 12.8+) | ❌ No |
| **Programming languages** | Python only | Any language (TypeScript, Python, Go, Rust, Java, Ruby, etc.) |
| **Dependencies** | PyTorch 2.9.1, CUDA, numpy, tqdm | Claude Code only |
| **Installation** | git clone + uv sync + data prep | `/plugin marketplace add Jss-on/autoforge` |
| **Cost model** | GPU compute ($2-5/hour for H100) | Claude API tokens |
| **Offline capable** | ✅ Yes (after data prep) | ❌ Requires Claude API |
| **CI/CD integration** | ❌ Not designed for CI | ✅ GitHub Actions, GitLab CI, pre-commit hooks |
| **MCP server support** | ❌ N/A | ✅ Any configured MCP server (databases, analytics, APIs) |

---

## What Claude AutoForge Adds (Built-In Features Not in Karpathy's Version)

### 1. Interactive Planning (`/forge:plan`)
Karpathy's setup requires editing `program.md` by hand. Claude AutoForge walks you through 7 steps: capture goal → analyze codebase → define scope → define metric → set guard → define direction → validate verify command (dry-run). Every gate is mechanical — scope must resolve to files, metric must output a number, verify must pass a dry-run.

### 2. Guard Commands
Karpathy's loop has no safety net. If the agent improves val_bpb but breaks something else, there's no detection. Claude AutoForge adds `Guard:` — a command that must always pass. Metric improves but guard fails? Claude reworks the optimization (max 2 attempts). This enables safe optimization of one metric without regressing another.

### 3. Bounded Iterations (`Iterations: N`)
Karpathy's loop runs until interrupted. Claude AutoForge supports bounded runs: `Iterations: 25` means "run exactly 25 iterations, then stop and print a summary." Essential for CI/CD integration and time-boxed sessions.

### 4. Bug Hunting (`/forge:debug`)
Scientific method meets the forge loop. Gather symptoms → recon → hypothesize → test → classify → log → repeat. Uses 7 investigation techniques: binary search, differential debugging, minimal reproduction, trace execution, pattern search, working backwards, rubber duck. Chain with `/forge:fix` to auto-repair findings.

### 5. Error Crushing (`/forge:fix`)
Takes a broken state and iteratively repairs it. Auto-detects what's broken (tests, types, lint, build), prioritizes (blockers first), fixes ONE thing per iteration, verifies error count decreased, keeps or reverts. Stops automatically when error count hits zero.

### 6. Security Auditing (`/forge:security`)
STRIDE threat modeling + OWASP Top 10 sweeps + 4 adversarial red-team personas. Read-only by default (add `--fix` for auto-remediation). Every finding requires code evidence (file:line + attack scenario). Supports `--diff` (delta mode), `--fail-on` (CI/CD gating), and structured report output.

### 7. Universal Shipping (`/forge:ship`)
8-phase workflow: identify → inventory → checklist → prepare → dry-run → ship → verify → log. Auto-detects ship type (code PR, deployment, content, marketing email, sales deck, research paper, design assets). Every checklist item is mechanically verifiable.

### 8. Scenario Exploration (`/forge:scenario`)
Takes a seed scenario and generates situations across 12 dimensions: happy path, error, edge case, abuse, scale, concurrent, temporal, data variation, permission, integration, recovery, state transition. 5 domain modes (software, product, business, security, marketing). Outputs a structured scenario map.

### 9. Multi-Persona Prediction (`/forge:predict`)
5 expert personas (Architect, Security Analyst, Performance Engineer, Reliability Engineer, Devil's Advocate) independently analyze code, debate findings, and reach consensus. Chains directly to any other command. This is the closest implementation of Karpathy's stated vision for "SETI@home for ML" — multiple perspectives before action.

### 10. Autonomous Documentation (`/forge:learn`)
4-mode documentation engine: init (create from scratch), update (refresh existing), check (read-only health report), summarize (quick overview). Scouts codebase, detects project type, generates docs with Mermaid diagrams and cross-references, then validates and iteratively fixes until docs match reality. Auto-generates conditional docs (API reference, testing guide, config guide, changelog) when signals detected.

### 11. Iteration Analytics (`/forge:evals`)
One-shot analysis of iteration results. Reads `*-results.tsv` files, dynamically detects columns, identifies trends, plateaus, regressions, and diminishing returns. Adaptive mid-loop checkpoints (`floor(max_iterations/3)`) provide real-time feedback during long runs. Backward compatible with v2.0.x TSV format. Karpathy's loop produces raw TSV but has no built-in analytics.

### 12. Noise Handling
Real-world metrics fluctuate (benchmark times, Lighthouse scores). Claude AutoForge supports multi-run verification (run verify 3-5 times, use median), minimum delta thresholds (only keep if improvement exceeds noise floor), and confirmation runs.

### 13. Crash Recovery Protocol
| Failure | Karpathy | Claude AutoForge |
|---------|----------|---------------------|
| Syntax error | Agent may keep iterating on broken code | Fix immediately, don't count as iteration |
| Runtime error | Manual intervention required | Auto-fix (max 3 tries), then move on |
| Resource exhaustion | Loop hangs | Revert, try smaller variant |
| Infinite loop | Loop hangs indefinitely | Kill after timeout, revert |
| External dependency | Loop fails | Skip, log, try different approach |

### 14. Stuck Escalation
After 5 consecutive discards, Claude auto-escalates:
1. Re-reads ALL in-scope files from scratch
2. Re-reads the original goal statement
3. Reviews the entire results log for patterns
4. Combines 2-3 successful changes from earlier iterations
5. Tries the OPPOSITE approach
6. Tries a radical architectural change

Karpathy's loop has no stuck detection — it just keeps trying.

### 15. CI/CD Integration
GitHub Actions, GitLab CI, and pre-commit hook examples for automated nightly optimization, security gates on PRs, and auto-fix workflows. None of this exists in Karpathy's version.

### 16. MCP Server Integration
Claude AutoForge can use any MCP server during the loop — databases (PostgreSQL), analytics platforms, external APIs, Puppeteer/Playwright, Slack, Stripe, Sentry, Cloudflare. This enables real-time data-driven iteration against live systems.

---

## What Karpathy's Version Has That Claude AutoForge Doesn't

| Feature | Why It Matters |
|---------|---------------|
| **Real GPU training** | Karpathy's loop actually trains neural networks. Claude AutoForge runs verification commands but doesn't directly train models (though it can invoke training scripts via verify). |
| **Model architecture optimization** | Karpathy's agent modifies attention patterns, optimizers, learning rates — actual ML architecture decisions. Claude AutoForge is metric-agnostic and doesn't have built-in ML knowledge. |
| **Validated ML results** | 700 experiments, 20 improvements, 11% speedup — peer-reviewable ML results. Claude AutoForge results depend on the user's domain and verify command. |
| **Immutable evaluation** | val_bpb evaluation is in prepare.py (agent cannot modify it). Claude AutoForge trusts the user's verify command — a user could accidentally create a verify command that's gameable. |
| **Offline operation** | Karpathy's loop runs entirely offline after data prep. Claude AutoForge requires the Claude API. |
| **GPU-accelerated training** | 5-minute training cycles on H100 produce real model improvements. Claude AutoForge doesn't directly leverage GPU compute. |

---

## The Philosophy Divergence

### Karpathy: Minimal, Opinionated, ML-Focused

> *"One GPU, One File, One Metric"*

Karpathy's design is deliberately minimal. The constraints aren't limitations — they're the point. By restricting the agent to a single 630-line file and a single metric, the loop achieves:
- Full context understanding (agent reads ALL modifiable code every iteration)
- Unambiguous success criteria (val_bpb went down or it didn't)
- Fast iteration (5-minute cycles, ~12 experiments/hour)
- Transferable results (improvements stack and transfer to larger models)

The cost: it only works for ML training optimization on a single GPU.

### Claude AutoForge: Generalized, Modular, Domain-Agnostic

> *"Set the GOAL → Claude runs the LOOP → You wake up to results"*

Claude AutoForge's design trades ML-specific depth for universal breadth. The same 7 principles apply, but scope, metric, and verify are user-defined — making it work for any domain. The 11 subcommands (including the core loop) add specialized workflows that don't exist in Karpathy's version:

- **Debugging** and **fixing** are fundamentally different from optimization — they have different loop structures, different success criteria, and different strategies.
- **Security auditing** is adversarial — it requires threat modeling, not metric improvement.
- **Scenario exploration** is divergent — it generates possibilities, not improvements.
- **Multi-persona prediction** is collaborative — it synthesizes expert perspectives before acting.

The cost: it doesn't directly train models or leverage GPU compute.

---

## When to Use Which

| Scenario | Use |
|----------|-----|
| Optimizing neural network training | **Karpathy's** — purpose-built for this |
| Improving test coverage in a TypeScript project | **Claude AutoForge** |
| Reducing API response times | **Claude AutoForge** |
| Finding and fixing bugs | **Claude AutoForge** (`debug → fix`) |
| Security audit before deployment | **Claude AutoForge** (`security`) |
| Optimizing val_bpb on a GPT model | **Karpathy's** |
| Improving Lighthouse score | **Claude AutoForge** |
| Exploring edge cases for a feature | **Claude AutoForge** (`scenario`) |
| Shipping a PR with confidence | **Claude AutoForge** (`ship`) |
| Getting expert opinions before acting | **Claude AutoForge** (`predict`) |
| Generating or refreshing project docs | **Claude AutoForge** (`learn`) |
| Running overnight ML experiments on H100 | **Karpathy's** |
| Improving ANY metric in ANY project | **Claude AutoForge** |

---

## Community & Ecosystem

### Karpathy's Ecosystem
- **26,000+ GitHub stars** in first week
- **8.6 million X views** on announcement post
- Forks: forge-mlx (Apple Silicon), forge-macos, forge-win-rtx, forge-rl
- Academic paper: "Perpetual Self-Evaluating RL Agents" (arXiv:2603.07300)
- Industry adoption: Shopify CEO achieved 19% gain on 37 experiments
- Media: Fortune, VentureBeat, The New Stack, Medium coverage

### Claude AutoForge Ecosystem
- **Claude Code plugin marketplace** — one-command install
- **11 subcommands** with comprehensive guides
- **50+ copy-paste examples** across 12+ domains
- **CI/CD templates** for GitHub Actions and GitLab CI
- **MCP server integrations** for databases, analytics, and APIs
- **Chain patterns** for multi-stage quality pipelines

---

## The Bottom Line

**Karpathy's autoresearch** proved that autonomous iteration works — a 630-line script, one metric, one file, and the discipline to let the agent run. It's a breakthrough demonstration focused on ML training.

**Claude AutoForge** takes that proof and asks: *what if this worked for everything?* It generalizes the principles into a skill system with 12 specialized commands, interactive setup, guard safety nets, noise handling, crash recovery, and command chaining — all running inside Claude Code on any project, any language, any domain.

Same philosophy. Same loop. Radically different scope.

> *"Autonomy scales when you constrain scope, clarify success, mechanize verification, and let agents optimize tactics while humans optimize strategy."*

---

<div align="center">

**[Claude AutoForge](https://github.com/Jss-on/autoforge)** | **[Karpathy's Autoresearch](https://github.com/karpathy/autoresearch)** | **[Guide](guide/)** | **[Examples](guide/examples-by-domain.md)**

</div>
