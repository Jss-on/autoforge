---
name: forge
description: "Autonomous iteration loop: modify, verify, keep/discard against any metric"
metadata:
  version: 3.6.0
---

# AutoForge — Autonomous Goal-directed Iteration

## Safety Invariants (all subcommands)
- Never deploy to production, publish packages/publicly, or change repo visibility without explicit user approval. `build`/`feature` push to the project's **own private output repo** as part of the standard loop (that is how its CI runs); everything beyond that repo is human-gated.
- Every subcommand runs `node scripts/host.cjs detect` before its first write, commit or host call. In a repository the user does not own (**contributor role** — an employer's, a client's or a community's; doubt means contributor) `references/host-protocol.md` §3 overrides every sentence of the command file: never merge, never commit on or push to a default or protected branch, never change its CI, settings, secrets or tracker, never copy its code or tracker content off its host, and keep forge run artifacts out of its history.
- **A model is never an author.** Commits, tags, pull/merge requests, release notes, issues and comments go out under the git identity the clone already has and nothing else: never set `user.name`, `user.email` or `--author` (a clone with no identity is a question for the user), no `Co-Authored-By` (or any other) trailer naming Claude, Fable, Opus or any other model, assistant or agent, no "Generated with …" footer, no session link — in either role, whatever the harness default says. A disclosure of AI use is written only when the user dictates it, in their words. Under Claude Code the `dangerous-cmd-block` hook refuses authorship credit mechanically.
- Bounded by default. Override with `Iterations: unlimited`.
- All results logged to `forge/{subcommand}-{YYMMDD}-{HHMM}/` directory.
- Chain handoff via `handoff.json`. Evals reads `*-results.tsv`.

## Procedural memory (all workflows)

Before work, use `scripts/lessons.cjs select <project> <workflow>` to retrieve applicable verified
procedures; read [references/procedural-lessons.md](references/procedural-lessons.md) when matches
exist or a reusable failure/recovery emerges. After a verified recovery, promote only with real
baseline, recovery, holdout and guard receipts. After actually applying a retrieved procedure,
record its checked reuse outcome. Lessons remain scoped data; `/forge learn` still generates docs.

## Cursor command loading

- Set `AR_ROOT` to the absolute directory containing this loaded `SKILL.md`. Read bundled `scripts/` and `references/` from that directory. This binding takes precedence over the shared contracts' Claude path examples and project-local copies.
- Treat text after `/forge` as the invocation. If its first word is a subcommand listed below, read `<subcommand>.md` beside this file and execute that contract with the remaining text as `$ARGUMENTS`. Do this before bare-goal dispatch. Load only the selected contract and references it needs; use the same dispatch for chained commands.
- For a bare invocation, use the dispatch table below; read `forge.md` for Classic or Setup wizard mode. A natural-language goal uses the Orchestrator section.
- Command and reference files are shared across agents: interpret canonical slash/colon Forge invocations as `/forge <subcommand>`. `$ARGUMENTS` means user input, not a shell variable to evaluate.
- In shared contracts, `AskUserQuestion` means the available Cursor question tool, or a concise chat question when no tool is available. Translate other tool examples to actual session tools; never assume a Claude-only tool exists. Use Agent mode for file edits and terminal execution. Claude Code hooks are not installed by this skill; required verification gates still run through the bundled scripts.
- Run project commands in the user's repository and write project output there. Quote absolute bundle paths. On Windows use Git Bash for `.sh` scripts; PowerShell's `bash` may resolve to an unconfigured WSL installation.

## Dispatch (bare `/forge`)

Parse the invocation in this order:

| Condition | Mode |
|---|---|
| `Metric:` or `Verify:` present | **Classic** — existing metric loop, unchanged |
| Free-form natural-language goal, no metric/verify | **Orchestrator** — see Orchestrator section |
| Nothing | **Setup wizard** — interactive config builder |
| `--classic` flag | Force Classic regardless of goal text |
| `--auto` flag | Force Orchestrator regardless of goal text |

Print a banner on every invocation: `[forge] mode: classic | orchestrator | wizard`.

## Subcommands

| Command | Does | Default Iterations |
|---|---|---|
| `/forge` | Iterate against a metric: modify → verify → keep/discard | 25 |
| `/forge plan` | Convert a goal into validated Scope, Metric, Verify config | N/A |
| `/forge requirements` | Turn client requirements into a validated SRS + a ready `build` spec (standard RE process) | N/A |
| `/forge build` | Build greenfield full-stack apps + harden (DevOps, monitoring, security) to passing acceptance | 40 |
| `/forge feature` | Add a feature to existing software — delta acceptance + hard non-regression ratchet, conforms to DESIGN.md | 25 |
| `/forge debug` | Hunt bugs: hypothesize → test → falsify → repeat | 15 |
| `/forge investigate` | Interview, show the plan and expected results, wait for approval, then investigate and research with captured evidence and plain-language findings; `--audit <run>` checks an existing case | 12 |
| `/forge fix` | Remediate defects to zero: root-cause first, evidence-anchored, defect-ledger driven | 20 |
| `/forge security` | STRIDE + OWASP audit with red-team personas | 15 |
| `/forge ship` | Ship through 8 phases: checklist → dry-run → deploy → verify | N/A |
| `/forge scenario` | Generate edge cases across 12 dimensions | 20 |
| `/forge predict` | 5 expert personas debate before implementation | N/A |
| `/forge learn` | Scout codebase → generate docs or wiki → validate → fix loop | 10 |
| `/forge reason` | Adversarial debate with blind judges until convergence | 8 |
| `/forge probe` | 8 personas interrogate requirements until saturation | 15 |
| `/forge improve` | Research ICP challenges, discover improvements, generate PRDs | 15 |
| `/forge evals` | Analyze iteration results: trends, plateaus, regressions | N/A |
| `/forge regression` | Regression stability gate: baseline vs candidate, verdict STABLE/UNSTABLE | N/A |
| `/forge test` | Full QA engagement on existing software (ISO 29119/ISTQB-aligned): risk-based plan → RTM → formal test design → execution + defect ledger → exit-criteria verdict | 20 |
| `/forge design` | UI/UX designer + design QA: mode-aware direction protocol → machine-readable `DESIGN.md` (`system`); independent audit of a running app — valid captures, mechanical anti-slop floor (`SLOP_GATE`), heuristic critique, personas, defect ledger, `SHIP|FIX|REBUILD` verdict (`audit`); bounded remediation (`--fix`) | 12 (`--fix`) |
| `/forge research` | Deep research engagement: decompose questions → multi-modal scholarly + web sweep → deep reading of primary literature → source-anchored claims ledger with graded confidence → cited dossier gated by `DOSSIER_READY|DOSSIER_BLOCKED` verdict | 15 |
| `/forge android` | Web app → Android app (Trusted Web Activity): native-needs gate → PWA-ify the deployed app → Digital Asset Links trust → Bubblewrap-signed AAB/APK → live trust + real-emulator gate in CI → release workflow + store pack; `STORE_READY|BLOCKED` verdict, native-only needs reported honestly | 12 |
| `/forge backlog` | Work a tracker backlog on a repository you contribute to (GitLab or GitHub — an employer's or client's): intake → triage → one item, one branch, one merge request → their pipeline green → review handoff; ledger checked against the host, never merges its own work | 25 |

## Universal Flags

| Flag | Applies To | Purpose |
|---|---|---|
| `Iterations: N` | All looping | Set iteration count |
| `Iterations: unlimited` | All looping | Opt-in unbounded |
| `--evals` | All looping | Mid-loop checkpoints + final summary |
| `--evals-interval N` | All looping | Override checkpoint frequency |
| `--chain <targets>` | All | Sequential handoff after completion |
| `--<subcommand>` | All | Shorthand for `--chain <subcommand>` |
| `--dry-run` | Orchestrator | Print derived config + planned pipeline; no execution |
| `--max-cycles N` | Orchestrator | Hard ceiling on orchestration cycles (default 50) |
| `--classic` | Bare `/forge` | Force Classic metric-loop mode |
| `--auto` | Bare `/forge` | Force Orchestrator mode |
| `Tracker: github\|linear` | `build`, `feature`, `test`, `design`, `fix` | Tracker of record for projects/phases/defects (default `github` = the repo host's own issues, GitLab's on a GitLab remote; `linear` arms tracker sync) |
| `Host: github\|gitlab` | `build`, `feature`, `fix`, `test`, `design`, `ship`, `backlog` (`android` is GitHub-only) | Git host (default: detected from the remote by `scripts/host.cjs detect`). The GitHub-worded contracts translate to `glab` / merge requests / pipelines per `references/host-protocol.md` |
| `Role: owner\|contributor` | every command that writes, commits or calls the host | Whose repository this is (default: detected — `owner` only for a non-fork repo in your own namespace; a Maintainer permission on someone else's project is not ownership). `contributor`: their conventions, no merge, nothing leaves their host. The user can pin it per clone with `git config forge.role owner` |
| `Assets: N\|off` | `build`, `feature`, `design`, `requirements` | Generation-attempt budget (default 12 with suitable native/MCP tools; off preserves reuse, icons, motion and checks) |
| `Ponytail: lite\|full\|ultra\|off` | `build` | Lazy-senior-dev discipline level — ladder (skip → reuse → stdlib → native → installed dep → one line → minimum), shortest working diff, `ponytail:` debt harvest (default `ultra`) |
| `--thorough` | `test`, `fix`, `design` | Restores the exhaustive form of every fast-path rule (every PNG opened, full Guard per slice, per-persona walks + blind panel); the default is the fast path per `references/speed-protocol.md` |
| `Track: none\|internal` | `android` | Play track for the release workflow's upload step (default `none` = artifacts only; `internal` arms the human-gated upload behind a GitHub Environment with required reviewers) |

## Optional MCP integrations and native image tools

Asset management applies to scoped images, icons and UI motion in design/build/feature/requirements.
Reuse verified assets first; prefer Codex-native imagegen for new rasters, then matching media MCP
tools. Icons stay SVG/code, UI motion uses native CSS/Web Animations. Probe actual session tools;
a shell doctor or missing MCP does not decide native availability. Contract: `references/integrations-protocol.md`.

Use `assets/manifest.json`, `asset-check.cjs select/check`, fresh `score-design.sh assets`, and
`design-scan.cjs --assets <target>` for managed assets/motion. Generation copies inspected files
into the project, records receipts/prompts, counts every attempt and pins approved hashes. Required
slots stay unmet during outages; both motion preferences and the keyboard task need evidence.

| Family | Gives the pipeline | Absent → |
|---|---|---|
| **Generative media** (Codex-native / media MCP) | Scoped raster generation and edits, copied project assets, real receipts, capped attempts and approved hashes; video/audio/3D only when scoped and supported | Checked reuse, licensed sources, native vectors/motion, named optional placeholders; required slots remain unmet |
| **Design bridge** (Figma-class) | `Design: <figma-url>` → variables/components/frames normalized into `DESIGN.md`; audit fidelity vs source frames; `--figma-out` review push (human-gated) | catalog / file / `generate` sources |
| **Tracker sync** (Linear-class) | `Tracker: linear` → engagement = project, phase gates = status updates, defect ledgers = issues (marker-deduped, severity-mapped, fixed→in-review, verified→done) | The repo host's own issues — GitHub or GitLab (default) |

## Orchestrator

Activated when a plain-language goal is given without `Metric:`/`Verify:`. Classifies the goal into a **Goal archetype** — see `references/orchestrator-routing.md` for the archetype table and router decision table.

**Two modes based on archetype:**
- **Orchestration loop** — predicate-bearing archetypes (ship-ready, optimize-metric, fix-broken, harden, build-feature, explore, polish-ui). Goal has a mechanical Success predicate; the loop runs until that predicate is met (polish-ui: `score-design.sh verdict` → `SHIP`).
- **Single-pass dispatch** — subjective/terminal archetypes (document, what-to-build, decide-design). Routes once to the fitting subcommand (learn / improve / reason), lets it self-terminate, then reports. No loop, no Plateau, no ship gate.

### Orchestration Loop Steps

Backed by `scripts/orchestrate.sh` (deterministic seam — all routing logic lives there). Subcommands exposed: `classify`, `next-hop`, `units`, `plateau`, `screen-cmd`, `verdict`, `validate-state`, `screen-state-predicate`. Seam scripts ship with the skill: resolve `scripts/…` to the first existing of `${CLAUDE_PLUGIN_ROOT}/skills/forge/scripts/`, `.claude/skills/forge/scripts/`, `scripts/` (this repo), or the `scripts/` dir next to this SKILL.md.

1. **Classify** — `scripts/orchestrate.sh classify "<goal>"` → archetype label + mode.
2. **Derive predicate** — reuse `plan` logic to produce a concrete Success predicate: exact shell command + expected output. For `optimize-metric`, run the full plan/wizard derivation internally.
3. **Confirm** — ONE `available question tool` showing: archetype, mode, concrete predicate (command + expected output), terminal choice (stop-at-verified vs proceed-to-ship). Misclassifications are caught here, not mid-run.
4. **Round-0 dry-run** — prove the predicate command runs and returns a value; safety-screen every derived command via `screen-cmd`; print projected cycle budget. Stop here if `--dry-run`.
5. **Loop** until predicate satisfied:
   a. Assess state via cheap signals (last `handoff.json`, regression verdict, error count) + affected-test verify.
   b. `scripts/orchestrate.sh next-hop orchestrator-state.json` → next subcommand.
   c. Run subcommand (its own bounded inner loop).
   d. Record per-hop outcome ∈ {progressed, no-op, failed, blocked}.
   e. Fold hop's `handoff.json` into `orchestrator-state.json`.
   f. `scripts/orchestrate.sh units` → recompute **Units remaining**.
6. **Stop conditions** (checked after each hop):
   - Predicate met → ship gate (only if ship is in the pipeline) else `CONVERGED`.
   - `scripts/orchestrate.sh plateau orchestrator-state.json` → true → stop + report `PLATEAU`.
   - Cycles > ceiling (default 50, override `--max-cycles N`) → stop + report `CEILING`.
   - Hop outcome `blocked`/`failed` with no alternative route → checkpoint + stop + report `BLOCKED`.

### Orchestrator State

`orchestrator-state.json` — orchestrator-owned, additive. Tracks: goal, archetype, predicate, terminal-choice, `units_remaining` history, cycle count, per-hop pipeline log with outcomes, current incumbent. Each hop's `handoff.json` is unchanged (single-hop bridge); the orchestrator reads it and folds it in. Two clearly-owned state objects, no overlap.

### Orchestrator Safety Invariants

- **Never auto-approve ship/deploy/push.** The orchestrator never passes `--auto` to `ship`; deploy always requires explicit user approval.
- **Data-migration behind anchored DB-URL allowlist.** Reuses regression's allowlist — host must be `localhost`/`127.0.0.1`/container hostname, or database name carries `_test`/`_ci` suffix. Bare substring match does not qualify. Anything else refused.
- **screen-cmd on every derived command** — run before the loop starts AND on every command read from a persisted state file on resume. Persisted commands are never trusted; resume re-screens the pinned predicate via `screen-state-predicate` and refuses on `refuse`.
- **No un-screened commands mid-loop.** The autonomous loop cannot introduce new shell commands that bypass `screen-cmd`.
- **Predicate pinned, not re-derived.** Round-0 writes the derived Success predicate verbatim into `orchestrator-state.json`; every cycle and every resume reuses that exact string so "done" is reproducible across runs.
- **Validate the ledger before routing.** `validate-state` gates `orchestrator-state.json` (required fields + coarse types); a malformed ledger is not trusted to route from.
- **Independent verify before convergence.** High-impact changes accepted on the working signal set `pending_verify`; `next-hop` routes to a `verify` hop (held-out / adversarial check) before `DONE` or ship. The verify hop never auto-approves ship.
- **Unknown-units cycles excluded from Plateau counter.** A cycle where `units` returns `unknown` (e.g. runner crash) is not counted as zero-progress; repeated `unknown` routes to `BLOCKED`.
