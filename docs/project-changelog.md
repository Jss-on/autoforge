# Project Changelog

All notable changes to the autoresearch project are documented here.

## v2.4.1 — `/autoresearch:fix` rebuilt: defect remediation aligned with requirements/build/test (2026-08-14)

**Theme:** The old `fix` predated the evidence/seam/output-repo generation and only understood
compiler-style error counts. Rebuilt as the **builder half of the test↔fix independence loop**,
speaking the same contracts as `requirements`, `build`, and `test`.

### Changed
- **`/autoresearch:fix`** — two intake modes on one bounded loop:
  - **Defect remediation** (`--from-test` / `Defects:`): the work queue is a `score-test.sh
    defects`-validated ledger; metric = unresolved critical/high **blocking count** → 0, queue
    ordered unblock-first (build/CI blockers precede all) then severity → priority.
  - **Error burn-down** (`Target:` cmd) retained: tests, types, lint, build errors → 0.
  - **Remediation discipline:** reproduce RED first (`evidence/def-<id>-red.txt`), root-cause iron
    law (no fix without an identified root cause), fix-the-implementation-not-the-test (single
    exception: the root-caused defect IS the test, stated in the report), reuse-first, one atomic
    fix per iteration, commit-before-verify, repro-green + targeted regression + guard, auto-revert
    on regress. Un-reproducible defects are recorded and left `open` — never self-rejected.
  - **Independence ceiling:** fix may set `in-progress`/`fixed` only — never `verified`, `closed`,
    `rejected`, or `duplicate`. `fixed` still blocks release in `score-test.sh`; only the chained
    `test` re-engagement (or a human) lifts the block. A fix run cannot self-certify.
  - **Seam alignment:** AR_ROOT resolution, `doctor.sh` preflight, `orchestrate.sh screen-cmd`
    screening, `score-build.sh bound` iteration cap, `validate-handoff.sh <run> fix` gating the
    summary; ledger copy re-validated every cycle (the tester's original stays frozen).
  - **GitHub flow (transparency contract):** branch `fix/<stamp>` on the output repo, conventional
    `fix: <summary> (DEF-n)` commits, PR with per-defect root-cause table + `Fixes #<issue>` lines
    closing the `qa` issues on merge, green PR CI required, a comment on each issue as its fix
    lands; merge stays human-gated and `test` can re-engage the branch pre-merge.
- SKILL.md/README description updated ("Remediate defects to zero: root-cause first,
  evidence-anchored, defect-ledger driven").

### Added
- **`tests/test-fix.sh`** (53 asserts): spec invariants (intake, discipline, independence ceiling,
  GitHub flow), 5-surface mirror parity, manifest count, and seam smokes proving `fixed` rows still
  block (`blocking=2`) while `verified` lifts (`blocking=0`), plus fix-source handoff validation.
  Full battery now **633 asserts across 8 suites**.

## v2.4.0 — `/autoresearch:test`: the QA-Engineer Engagement (2026-08-13)

**Theme:** An 18th command that performs the full software-test-engineer role on existing software,
standards-aligned and evidence-anchored. Built from primary-source research: ISO/IEC/IEEE 29119
(-1:2022/-2:2021/-3:2021/-4:2021/-5:2024), ISTQB CTFL v4.0.1, ISO/IEC 25010:2023 (nine
characteristics, 2023 naming), WCAG 2.2 (55 AA criteria), OWASP Top 10 2021/2025 + ASVS 5.0.

### Added
- **`/autoresearch:test`** — a complete QA engagement: static requirements review + ambiguity
  interrogation → risk register (likelihood × impact drives test depth) → 29119-3 test plan with
  entry/exit criteria → formal test design (EP, BVA, decision tables, state transition, pairwise,
  scenario, error guessing; `logic` golden rows for business rules) with a bidirectional RTM gate →
  smoke gate (BUILD_REJECTED on failure) → bounded execution loop at the lowest-catching pyramid
  layer with strict-evidence scoring → SBTM exploratory sessions (charters, PQIP notes, PROOF
  debriefs) → non-functional passes (WCAG 2.2 AA, OWASP-checklist security-functional, percentile
  SLO load, compatibility) → machine-validated defect ledger → test completion report with a
  mechanical go/no-go. **Tester independence enforced**: app source is read-only; remediation chains
  to `fix`/`feature`. Unresolved critical/high defects become GitHub issues on the target's repo.
- **`scripts/score-test.sh`** — `defects` (ledger validation: severity/priority/status model,
  evidence requirement, duplicate detection; blocking rule: a critical may never be deferred) and
  `exit-criteria` (strict pass-rate ≥ TEST_TARGET_RATE + logic gate + RTM coverage 1.00 + zero
  unresolved critical/high → `RELEASE_RECOMMENDED`/`RELEASE_BLOCKED`). Reuses score-build for
  rate/coverage — no reimplementation.
- **`references/qa-testing-protocol.md`** — standards contract: ISTQB↔29119↔phase mapping, technique
  catalog with when-to-use, 25010:2023 nine-characteristic mapping to result dimensions, SBTM
  mechanics, hostile-user attack list, defect model, auditor-grade evidence/RTM expectations,
  regulated-industry deltas (IEC 62304, ISO 26262, PCI DSS v4.0.1, SOC 2).
- **`tests/test-qa.sh`** — 75 assertions: seam behaviors (blocking rules, verdict paths, threshold
  override), spec standards coverage, 5-tree parity, router rows, manifest counts, handoff rule.

### Changed
- Routers and manifests: 18 commands everywhere; handoff schema pins bumped to "2.4.0" across all
  command files; `validate-handoff.sh` gains the `test` source rule (results_tsv required).
- Docs swept: README (pipeline diagram gains the Test/QA stage), AGENTS.md, guides — all at 18.
- Suites: 503 → 580 assertions across seven files.

## v2.3.1 — AutoForge: Fatal-Flaw Remediation (2026-08-12)

**Theme:** The three critical audit findings — unfalsifiable acceptance evidence, an enforcement layer that never shipped, and a distribution still pointing at the upstream fork — resolved, plus the orchestrator seam gaps and a CI/publish gate. First release from the private product repo `Jss-on/autoforge`.

### Evidence anchoring (W-1)
- `score-build.sh` no longer discovers results TSVs implicitly — the old fallback could score a *different project's* stale ledger as `PASS_RATE: 1.00` with the logic gate silently `n/a`. Explicit path or `BUILD_RESULTS` only.
- New `pass-rate --strict-evidence` (or `BUILD_EVIDENCE_STRICT=1`): a `pass` row must carry `evidence:<relpath>` in its detail column naming an existing file under the run's `evidence/` store, or it is demoted to `fail`. `build`/`feature` now tee every verification's raw output into `<run-dir>/evidence/` and converge only under strict scoring.
- Every `pass-rate`/`coverage` invocation appends a hash-anchored audit line (UTC timestamp, subcommand, file, sha256-16, headline) to `<run-dir>/score-log.tsv`.
- New `score-build.sh bound iterations.tsv <max>`: `BOUND: EXCEEDED` mechanically blocks CONVERGED (the flagship DJN run had used 48 of a 40-iteration bound and still reported converged).

### Enforcement ships (W-2)
- The seam scripts (`score-build/requirements/regression/debug-fix.sh`, `orchestrate.sh`, new `doctor.sh`) now ship inside `skills/autoresearch/scripts/` in **all five** distribution trees; `install.sh` also installs the 9 hooks (previously never installed at all).
- Commands carry an explicit seam/reference resolution order (`${CLAUDE_PLUGIN_ROOT}/skills/autoresearch` → `.claude/skills/autoresearch` → merged layouts) — the bare `references/*.md` paths silently resolved to nothing on installed Claude Code plugins.
- All four mirror routers resynced from canonical (were stamped 2.2.1 and **missing the `requirements`/`build`/`feature` rows**); `transform.sh` sed tables replaced with generic rules so new commands can never be silently skipped again.
- New `scripts/doctor.sh` preflight: CORE (bash/node≥18/git/awk/sed/sha256sum), BUILD (gstack, docker), OPTIONAL (axe, k6/autocannon, gh); `build` Phase 0 runs it with `--require-build`.

### Distribution & docs (W-3)
- README/AGENTS.md/guide fully rebranded: install paths → `Jss-on/autoforge` (`/plugin marketplace add Jss-on/autoforge`, `/plugin install autoresearch@autoforge`), MIT badge/PayPal/star-history/upstream author block removed, license → Proprietary with the retained MIT attribution line, six-dimension acceptance model + 0.50 logic gate + Prerequisites section documented; upstream `context7.json` and the foreign `.claude/skills/.env.example` removed.
- Client artifacts untracked from the product tree (root `DESIGN.md` design tokens, `autoresearch/` run dirs); run dirs root-ignored.

### Orchestrator seam (W-4)
- `classify`: `security|audit|owasp|cve|lock-down` now reach `harden` ("run a security audit" previously classified as `explore`); explicit `ship` outranks an incidental fix mention per the router spec.
- `next-hop` accepts every `validate-state`-valid ledger (absent per-signal fields default benign; archetype still required) — the two subcommands previously demanded mutually exclusive schemas.
- `units`: negative `metric_delta` parses (was `unknown` → spurious BLOCKED) and net-negative clamps to 0. `verdict`: mid-flight loops report `RUNNING`, no longer mislabeled `BLOCKED`.
- `screen-cmd`: dev-container DB passwords (`POSTGRES_PASSWORD=… docker compose …`) allowed per build.md's own instruction; host allowlist extended to `mysql://`/`mongodb://`/`redis://` URLs.
- Hook fixes: session-state pruning uses `os.tmpdir()` (was hardcoded `/tmp` — files accumulated forever on Windows); hook runner preserves `SystemRoot`/`APPDATA`/`TEMP`/`CLAUDE_PLUGIN_ROOT` through `env -i`; PreToolUse decisions nested under `hookSpecificOutput` so the `APPROVED:` bypass actually works (and rewrites the correct input key per tool); `stop-notify` uses the http module for http: webhooks.

### P1 hardening (same release)
- **Handoff contract:** `references/handoff-schema.md` (schema v2.3.1) + `scripts/validate-handoff.sh` — required core (version/source/status-enum/timestamp) + per-source fields; a CONVERGED build without coverage numbers is INVALID; colon-form sources rejected; expected-source mismatch detection. All 16 command handoff pins bumped 2.1.0 → 2.3.1; build/feature/requirements must validate their handoff before finishing.
- **Run inventory:** `scripts/run-index.sh list|summary` — per-run rows (source, status, metric, results/evidence presence, score-log lines, iterations) + cross-run aggregation. First run against the repo's 34 historical dirs: 0 carried evidence — the pre-v2.3.1 gap, now measurable.
- **Seam smoke:** `scripts/smoke-seam.sh` — deterministic end-to-end pipeline check (evidence store → strict scoring → demotion of fabricated rows → coverage → bound → score-log → handoff validation → run index) in <1s; runs in CI's main job and in test-build.
- **Model-drift alarm:** `scripts/smoke-model.sh` — headless `claude -p` micro-build under scoped allowedTools; artifacts then verified from OUTSIDE the model (independent re-run of golden tests, strict scoring, coverage). Guarded (AR_SMOKE_MODEL=1 + manual CI dispatch). Verified live at release: 9/9.
- Both new runtime scripts ship in all five trees; suites now 503 assertions.

### CI & release (W-5/W-6)
- `.github/workflows/ci.yml` runs all six suites on every push/PR.
- `publish-autoforge.sh` refuses to publish a tree that fails any suite (`AUTOFORGE_SKIP_TESTS=1` escape, logged) and tags the first publish of each version.
- Suites grown 436 → 492 assertions: cross-mirror version parity (compared to canonical, not a literal), v2.3 rows in every router, seam scripts shipped in all trees, evidence strict mode, bound gate, fallback-kill regression, hook contract shape.

## v2.3.0 — Build Pipeline: Full-SDLC Software Engine (2026-06-28)

**Theme:** Autoresearch becomes a full software-development-lifecycle engine. Three new commands take a product from a one-line idea to a tested, hardened, shippable system — `requirements → build → feature → regression → ship` — with UI/UX as a first-class, mechanically-verified acceptance dimension. Command count 14 → 17.

### Added
- **`/autoresearch:build`** — greenfield full-stack builder. Runs the standard SDLC (requirements → design → implement (TDD) → debug → comprehensive test → deploy) as an autoresearch loop, to passing acceptance across **five weighted dimensions**: functional 0.30 · ux 0.20 · devops 0.15 · monitoring 0.15 · hardening 0.20. Acceptance is *run, not claimed* — build, boot, probe, the test pyramid, and a real browser via gstack `/browse` (e2e + axe a11y + responsive + DESIGN.md conformance). Default 40 iterations.
- **`/autoresearch:requirements`** — interactive requirements engineering. Interviews the user back-and-forth (**no assumptions** on scope-defining questions), classifies FR/NFR, maps NFRs to the five dimensions, prioritizes with MoSCoW, and emits a validated `evals/fullstack/<name>.spec.yaml`. A mechanical gate (`score-requirements.sh validate`) releases the spec only when all five dimensions are present + weighted.
- **`/autoresearch:feature`** — brownfield feature addition. The same build loop on an existing app, on a delta acceptance set, under a **hard non-regression ratchet**: every iteration runs `regression`; any existing green→red auto-reverts. On convergence the feature ratchets permanently into the spec — improvements compound.
- **`scripts/score-build.sh`** — `pass-rate` (weighted, renormalized over the dimensions that ran; `skip` excluded; single-division so an all-pass build scores exactly 1.00) + `rubric` (spec-quality grep). Shared metric for build + feature.
- **`scripts/score-requirements.sh`** — `validate` (a generated spec is a valid build input iff it has name + stack + all five weighted acceptance dimensions) + `rubric`.
- **Four reference docs** (mirrored across all 5 surfaces): `sdlc-protocol.md` (phase gates), `uiux-checklist.md` (the ux dimension + DESIGN.md conformance), `fullstack-hardening-checklist.md` (the five acceptance dimensions + results-TSV schema), `requirements-protocol.md` (the RE process + generated-spec schema).
- **DESIGN.md / UI-UX integration.** The design system is a committed `DESIGN.md` (Google DESIGN.md spec; getdesign.md / `awesome-design-md` catalog). build/feature adopt one (catalog slug · file · URL · or generate via gstack `design-consultation`), derive all UI tokens from it, and verify **conformance mechanically** via `/browse`. New `Design:` arg + spec `design:` block + a `ux` `design-conformance` assertion.
- **Seed eval specs** under `evals/fullstack/` (todo-api, url-shortener, notes-app, money-tracker, expense-tracker), each declaring stack + five-dimension acceptance + a `design:` reference.
- **Tests:** `tests/test-build.sh` (59), `tests/test-requirements.sh` (35), `tests/test-feature.sh` (27) + deterministic fixtures under `tests/fixtures/{build,requirements}/`.
- **Docs:** new `guide/building-software-with-autoresearch.md` (~16-page playbook) + a "Building Complex Software" section in the README.

### Changed
- **Command count 14 → 17** across all 3 plugin manifests + the marketplace manifest + 5 `SKILL.md` mirrors. New commands mirrored byte-identical across the 5 distribution surfaces (`.claude`, `.agents`, `plugins`, `.opencode`, `claude-plugin`).
- **`build` and `requirements` made first-principle-explicit.** `build.md` now states the autoresearch loop verbatim — read git → one atomic slice → `git commit experiment:` *before* verify → mechanical verify → keep/discard (simplicity wins) → log `iterations.tsv` → bounded; git-as-memory + automatic rollback. `requirements.md` states the single-pass form (constraint + mechanical gate + bounded; validate-until-VALID).
- **Orchestrator routing** (`orchestrator-routing.md`): the `build-feature` archetype now routes **greenfield → `build`, existing codebase → `feature`** (autonomy); `requirements` is the brief→spec front end.
- Version 2.2.1 → 2.3.0 across all 3 plugin manifests, the marketplace manifest, 5 `SKILL.md` mirrors, the README + guide version badges, and the `test-orchestrator.sh` version-parity assertion.

### Fixed
- **score-build float bug** — summing per-term `(weight/total)` floored a true 1.00 to 0.99; switched to a single weighted-numerator division so an all-pass build scores exactly 1.00.
- **`BUILD_RESULTS` is now authoritative** in the scorer — an explicit override that points nowhere yields the 0.00 baseline instead of silently discovering an unrelated results file.

## v2.2.1 — Orchestrator Seam Hardening (2026-06-23)

**Theme:** Harden the autonomous orchestrator's deterministic seam against the failure modes an unsupervised loop can hit — under-screened destructive commands, a re-derived or corrupted "done" definition, and a change that games its own metric.

### Added
- **Two new `scripts/orchestrate.sh` subcommands** (seam now exposes eight): `validate-state` gates `orchestrator-state.json` before routing (required fields present + coarse type checks: arrays are arrays, `cycle` numeric, `predicate` non-empty) and refuses to route from a malformed ledger; `screen-state-predicate` extracts the pinned predicate from a persisted state file and re-runs it through `screen-cmd` on resume, refusing on `refuse`. Predicate extraction honors backslash-escaped quotes so a poisoned predicate cannot truncate screening at an interior `\"` and slip its destructive tail past the gate.
- **Independent verify hop.** `next-hop` recognizes a `pending_verify` flag in the ledger and routes a high-impact accepted change to a fresh `verify` hop (held-out / adversarial acceptance check, dispatched to `reason`/`predict`) before declaring `DONE` or entering the ship gate. The verify hop is advisory to convergence — it never auto-approves ship, which stays human-gated. Backward-compatible: absent or `false` `pending_verify` preserves prior routing exactly.
- **Predicate pinning + overfit guard** documented in `orchestrator-routing.md`: the derived Success predicate is written verbatim into `orchestrator-state.json` at round-0 and reused every cycle and resume so "done" is reproducible; `optimize-metric` and `build-feature` acceptance now runs on a held-out set (`holdout-verify`) separate from the `units` signal used to choose the change.

### Changed
- **`screen-cmd` destructive-command coverage** expanded beyond `rm`/`curl|sh`: now also refuses output piped to netcat (`nc`/`ncat`/`netcat`), raw block-device writes (`of=`/redirect into `/dev/sd*`,`/dev/nvme*`,`/dev/mmcblk*`,`/dev/md*`,`/dev/dm-*`,`/dev/mapper/*`,…), filesystem format (`mkfs`/`mke2fs`), `find … -delete`, `shred`, `truncate` to zero (`-s 0`/`--size=0`), recursive `chmod` to a zero mode (`000`/`00`/`0`), and curl/wget routed through `xargs` into an interpreter. Path-qualified invocations (`/sbin/mkfs.ext4`, `/usr/bin/find`, `/bin/chmod`) are caught with the same optional-path-prefix anchor used by the `rm`/`shred` matchers. Known-good commands (parser pipes, normal `find`, non-recursive `chmod`, leading-zero modes like `0755`, non-zero `truncate`, redirect to `/dev/null`) still pass.
- Version 2.2.0 → 2.2.1 across all 3 plugin manifests, the marketplace manifest, and 5 `SKILL.md` mirrors (command count stays 14 — these are seam/routing hardening, not new subcommands).
- `tests/test-orchestrator.sh` grew to 154 assertions covering the new destructive-command holes (path-qualified binaries, extra block-device families, alternate flag forms), the escaped-quote predicate case, `validate-state`, `screen-state-predicate`, and `next-hop` verify routing.

### Fixed
- **Hook runtime logs no longer pollute (or risk being committed into) the user's project repos.** The hook `log()` helper wrote `hook-log.jsonl` to a `process.cwd()`-relative `.claude/hooks/.logs/` — so every project running the hooks grew its own untracked log under the repo, undocumented and easy to commit. Logs now go to a global, per-project-keyed path under `~/.claude/hooks/.logs/{project}-{hash}/`, matching the global `/tmp` session-state convention the same module already used. Logging stays fail-open and write-only; the location is now documented in `guide/hooks.md`. `tests/test-hooks.sh` grew to 107 assertions, asserting the log lands in the global location and the project working tree stays clean.

## v2.2.0 — Autonomous Goal-directed Orchestrator (2026-06-20)

**Theme:** Bare `/autoresearch` becomes a complete autonomous orchestrator — state a plain-language goal and it self-selects the subcommands, flags, and iteration counts needed to reach it, the way `/ck:cook` orchestrates implementation.

### Added
- **Orchestrator mode on bare `/autoresearch`** — classifies a free-form goal, derives a concrete success predicate (exact command + expected output), confirms once, then loops the right subcommands until the predicate holds
  - **Dispatch:** `Metric:`/`Verify:` present → classic metric loop (unchanged); free-form goal → orchestrator; nothing → setup wizard; `--classic`/`--auto` force the mode; mode printed in a banner
  - **9 goal archetypes** in two modes — *Orchestration loop* (ship-ready, optimize-metric, fix-broken, harden, build-feature, explore) loops until a mechanical predicate is met; *Single-pass dispatch* (document, what-to-build, decide-design) routes once to learn / improve / reason and self-terminates
  - **Bounded termination:** plateau detection (5 cycles no net progress) + hard ceiling (50, override `--max-cycles N`); repeated unknown-units cycles route to `BLOCKED`, never counted as progress
  - **Safety:** never auto-approves ship/deploy/push; every derived command is safety-screened (and re-screened on resume from persisted state); data-migration stays behind the anchored DB-URL allowlist reused from regression
  - `orchestrator-state.json` tracks goal, archetype, predicate, units-remaining history, per-hop outcomes; each hop's `handoff.json` is folded in unchanged
- `scripts/orchestrate.sh` — deterministic routing seam exposing `classify`, `next-hop`, `units`, `plateau`, `screen-cmd`, `verdict` (mirrors the `scripts/score-regression.sh` pattern)
- `tests/test-orchestrator.sh` (97 assertions) + fixtures under `tests/fixtures/orchestrator/`
- `.claude/skills/autoresearch/references/orchestrator-routing.md` — archetype table, preset pipelines, router decision table; new `guide/autoresearch-orchestrator.md` per-command guide

### Changed
- Bare `/autoresearch` dispatch is now mode-aware; classic Metric-loop behavior is unchanged when `Metric:`/`Verify:` are supplied
- Version 2.1.4 → 2.2.0 across all 3 plugin manifests and 5 `SKILL.md` mirrors (command count stays 14 — the orchestrator overloads the root command, it is not a new subcommand)

### Fixed
- `screen-cmd` hardened against two autonomous-loop command-screening bypasses: path-qualified `rm` (`/bin/rm`, `./rm`) and `curl`/`wget` piped to alt-shells/interpreters (zsh/dash/fish/ksh/python/perl/ruby/node/php), path-qualified or not; parser pipes (`curl | jq`/`grep`) remain allowed
- `scripts/transform.sh` — latent `:regression` colon-drift in the Codex/OpenCode adapters (the catch-all left a dangling colon); every family command now has an explicit rewrite rule in both adapter blocks

## v2.1.4 — Regression Stability Gate (2026-06-19)

**Theme:** A 14th family member — a heavy, layered regression-testing gate that proves a change is safe to push.

### Added
- `/autoresearch:regression` — stability gate that captures baseline behavior from a `git worktree` of the base ref, diffs the candidate across 8 dimensions, and emits a single STABLE / UNSTABLE verdict
  - **Classification phase** enforces the core invariant: a regression is a green→red transition only. red→red (pre-existing), absent→red (new coverage), and flake→red (flaky) are classified out, never counted. Tests matched by test-id then path.
  - **Tiered verdict:** HARD gate (`functional`, `api-contract`, `data-migration`, `integration-e2e`) — any green→red = UNSTABLE; SCORE 0–100 noise-tolerant weighted (`flakiness` .30, `performance` .30, `resource` .20, `visual-ui` .20), UNSTABLE below threshold 95
  - **4 input axes:** diff (default), repeat N×, full, matrix (opt-in)
  - **Baseline cache** keyed by full SHA (`baseline/<full-sha>/`), per-dim setup tiers; `--baseline-cache` on by default
  - **Statistical perf gate:** 7 independent-process samples/side, Mann–Whitney U, flagged only beyond `max(noise-band%, k·stdev)`; visual via pixel-ratio / SSIM ignoring anti-aliasing
  - **data-migration hard-guarded:** opt-in, forward-only by default, refuses any DB URL not matching the ephemeral/allowlisted set (`*test*`, `*ci*`, container)
  - **Hunter reproducibility gate:** bisect only for HARD dims passing 3/3 reproduction; SCORE / non-deterministic → differential root-cause
  - **`--fix` re-gate:** max 3 cycles, each must strictly shrink the blocking-set or STOP "not converging"; no HARD-gate bypass
  - Composable: `--predict`, `--reason`, `--probe`, `--debug`, `--fix/--fix-cycles`, `--evals`, `--chain`, `--max-runs`. Canonical combo `--predict --evals --fix --ship`
- `scripts/score-regression.sh` — scoring backend: `rubric` (spec quality gate) + `verdict` (TSV → STABLE/UNSTABLE, CI exit codes)
- `tests/test-regression.sh` + 10 golden TSV fixtures under `tests/fixtures/regression/`

### Changed
- Command count 13 → 14 across `marketplace.json`, `plugin.json`, all 5 `SKILL.md` routing tables, README, and COMPARISON
- Version 2.1.3 → 2.1.4

## v2.1.3 — Wiki Knowledge Base + Distribution Parity (2026-06-16)

**Theme:** A navigable knowledge base from `learn`, plus a clean, fully-synced distribution across all platforms.

### Added
- `/autoresearch:learn --mode wiki` — generates a navigable `wiki/` knowledge base instead of prescriptive `docs/`
  - `index.md`, `architecture.md` (Mermaid diagrams), per-module deep dives (`modules/`, cap 10), `glossary.md`, `onboarding.md`
  - Write-ahead `wiki-manifest.json` (gitignored) for resume-after-interruption; `--force` regenerates from scratch
  - `--modules <list>` overrides automatic module detection
  - Two-layer secrets filter — prompt instruction (extract env var names, not values) + post-generation regex scan (AWS keys, `sk-`/`ghp_` tokens, DB URIs, password assignments), non-blocking warning
  - Won't overwrite user-authored pages (skipped when `generated_by: autoresearch` frontmatter is absent)

### Changed
- Wiki examples and output-structure reference added to `guide/autoresearch-learn.md` (now 5 modes)
- All distributions regenerated from `.claude/` source via `scripts/transform.sh` (OpenCode, Codex) and synced to `claude-plugin/` (install source)

### Fixed
- Distribution parity — `claude-plugin/` install source now carries the `improve` command row (had drifted out of the distribution `SKILL.md`)
- Removed v2.1.0 wrapper-CLI leftovers that broke a fresh-clone test run (dead `bin/autoresearch` entrypoint and orphaned Python test modules)
- Aligned command count to 13 across `AGENTS.md`, `marketplace.json`, and the Codex plugin manifest
- Synced version fields across `marketplace.json` (was 2.1.0), the Codex plugin (was 2.1.0-codex.0), and both `SKILL.md` files

## v2.1.2 — Product Improvement Engine (2026-05-23)

**Theme:** Outward-looking product strategy — "what should we build next?"

### Added
- `/autoresearch:improve` — research ICP challenges, discover improvements, generate per-feature PRDs
  - 5 research categories: ICP challenges, competitor gaps, market trends, UX & experience, revenue & growth
  - Saturation-based termination (net-new < 2 for 3 consecutive non-reserved iterations)
  - Tiered ranking: ICP binary gate → Must-have / Nice-to-have / Moonshot → pairwise within Must-have
  - Conditional auto-discover when product context is zero (OR gate)
  - WebSearch triangulation with HIGH/MEDIUM/LOW confidence tags
  - Per-feature PRD generation with evidence chains, DECISION NEEDED markers, open questions
  - Terminal emitter — outputs PRDs for external tools, not autoresearch re-entry
- `CONTEXT.md` domain glossary with output types, loop shapes (+ Notes column), scoring systems, key concepts
- Upstream chain integration: `--improve` flag on probe, predict, debug, security

### Changed
- Subcommand count: 12 → 13
- SKILL.md updated with improve row
- `scripts/transform.sh` updated with improve sed rules for OpenCode + Codex
- `docs/system-architecture.md` updated with improve in directory listing
- `docs/project-overview-pdr.md` updated with improve in subcommands table
- `docs/development-roadmap.md` phases renumbered

### Design Decisions (11 locked via adversarial reasoning)
- D1: Opportunistic product context with conditional auto-discover
- D2: Structured insight schema with canonical normalization
- D3: 5 research categories with coverage guarantee
- D5: WebSearch as hypothesis generation with triangulation safeguards
- D8: Tiered ranking (not numeric scores)
- D10: 2 AskUserQuestion rounds (setup + feature selection)
- D11: Single-pass PRD with 5 guardrails

## v2.1.1 — Hook System (2026-05-22)

**Theme:** Safety, context injection, and session notifications.

### Added
- **9-hook safety system** — fires on every Claude Code session
  - `scout-block`: blocks node_modules/, .git/, __pycache__/ and other context-wasting directories (PreToolUse)
  - `privacy-block`: blocks .env, SSH keys, credentials with APPROVED: prefix override (PreToolUse)
  - `dangerous-cmd-block`: blocks force-push, rm -rf, git reset --hard (PreToolUse, regular git push allowed)
  - `iteration-context`: injects recent TSV data every 5th prompt after compaction (UserPromptSubmit)
  - `subagent-context`: gives spawned subagents ~150 tokens of loop awareness (SubagentStart)
  - `dev-rules-reminder`: re-injects plan path and code standards after compaction (UserPromptSubmit)
  - `simplify-gate`: warns at 400 LOC, blocks at 800 LOC when shipping verbs detected (UserPromptSubmit)
  - `session-init`: computes project root, branch, paths; persists session state (SessionStart)
  - `stop-notify`: terminal notification + optional webhook on session end (SessionEnd)
- **hooks.json** — auto-registers all hooks on plugin install
- **node-hook-runner.sh** — shell wrapper that silences profile noise for clean JSON output
- **lib/ar-hook-utils.cjs** — shared utilities (state management, TSV reading, logging)
- **lib/ignore.cjs** — vendored gitignore-spec pattern matcher (15KB, zero deps)
- **.ckignore** — baseline blocked patterns (gitignore syntax, customizable per project)
- **guide/hooks.md** — complete hook reference guide

### Changed
- `plugin.json` version bumped to 2.1.1
- `scripts/transform.sh` now copies hooks to `claude-plugin/hooks/`
- `.gitignore` updated with `!.claude/hooks/autoresearch/` exclusion
- `docs/system-architecture.md` updated with hook system architecture
- `CONTRIBUTING.md` updated with hook development guide

### Design Decisions
- SessionEnd event (not Stop) for notifications — Stop fires per-turn, SessionEnd fires once
- Force-push only blocking — regular `git push` allowed for `/autoresearch:ship` compatibility
- Smart Bash argument parsing — prevents false positives on string literals
- Session state via `/tmp/ar-session-{hash}.json` — hooks are subprocesses, can't share env vars
- Iteration-based throttling (every 5th) — matches loop cadence, not wall-clock time

## v2.1.0 — 2026-05-22

### Summary
Modular rebuild. Thin SKILL.md routing table replaces the 813-line monolith. Twelve self-contained command files replace the old minimal-registration + 13-reference-file pattern. Net result: ~95% token reduction per invocation (~5–8K tokens vs ~100K). New `/autoresearch:evals` subcommand added.

### Added
- `/autoresearch:evals` — one-shot analysis of any `*-results.tsv`: trends, plateaus, regressions, file hotspots, technique effectiveness, recommendations
- `--evals` flag on all looping commands — adaptive mid-loop checkpoints + final evals-summary.md
- `--evals-interval N` — override checkpoint frequency
- `# metric_direction: higher_is_better|lower_is_better` comment on TSV line 1 — enables evals auto-detection
- 3 new TSV status values: `keep (reworked)`, `hook-blocked`, `metric-error` (total: 8)
- `scripts/transform.sh` — single script generates OpenCode and Codex distributions from `.claude/` source
- `handoff.json` written by all subcommands for chain integration; `evals` reads `*-results.tsv` directly

### Changed
- `SKILL.md` reduced from 813 lines to 41 lines — routing table only, no protocol
- All 12 command files are now self-contained (94–120 lines each) — full protocol embedded, no reference file loading required for standard use
- Reference files reduced from 13 to 3: `predict-personas.md`, `reason-judge-protocol.md`, `security-checklist.md`
- Subcommand count: 11 → 12 (added evals)

### Removed
- `plugins/autoresearch/resources/autoresearch-command-spec.json` — command contracts now live in individual command files
- `scripts/sync-opencode.sh` and `scripts/sync-codex.sh` — replaced by `scripts/transform.sh`
- `plugins/autoresearch/scripts/autoresearch_cli.py` — Python wrapper CLI no longer needed
- 10 per-command workflow reference files (plan, debug, fix, security, ship, scenario, predict, learn, reason, probe workflows)

### Technical Details
- Per-invocation token cost: ~5–8K (down from ~100K in v2.0.x)
- All platform distributions generated from `.claude/` canonical source
- Codex plugin version: `2.1.0-codex.0`
- Backward compat: evals reads v2.0.03 TSV files (handles missing `timestamp` column)

## v2.0.0 — 2026-04-28

### Summary
Multi-platform GA release. Claude Code, OpenCode, and Codex all fully supported with strict YAML compliance, security-hardened scripts, and complete command metadata.

### Breaking
- Version jump from 1.10.0 to 2.0.0 — reflects multi-platform support, 11 subcommands, and maturity since v1.x

### Fixed
- SKILL.md YAML frontmatter uses folded block scalars — strict parsers (Codex CLI, PyYAML) no longer reject the description field (#69, #71)
- `scripts/sync-codex.sh` and `scripts/sync-opencode.sh` pass paths via `sys.argv` instead of shell string interpolation — eliminates script corruption when paths contain quotes (#77)
- `scripts/install.sh` `sync_dir()` validates destination path depth before `rm -rf` — rejects empty, root, or shallow paths (#78)

### Added
- `name` field to `.opencode/agents/docs-manager.md` for explicit agent registration (#74)
- `name` field to all 11 `.opencode/commands/*.md` files for schema compliance (#75)
- `allowed-tools` declaration to all Claude Code and claude-plugin command files (#76)

### Changed
- All version references unified to 2.0.0 across SKILL.md ×4, plugin.json, marketplace.json, README badge

### Contributors
- @xiaolai — NLPM audit (#79): 3 bugs + 2 security findings with PRs #74–#78
- @georgelichen — initial YAML frontmatter issue report (#69)
- @ch0udry — Codex loading error report (#71)
- @rexplx — YAML colon escape fix (#80)
- @haosenwang1018 — comprehensive YAML + sync script fix (#81)

## v1.10.0 — 2026-04-16

### Added
- `/autoresearch:probe` — adversarial multi-persona requirement interrogation engine
- probe-workflow.md reference (449 lines) — 10-phase protocol
- 8 personas: Skeptic, Edge-Case Hunter, Scope Sentinel, Ambiguity Detective, Contradiction Finder, Prior-Art Investigator, Success-Criteria Auditor, Constraint Excavator
- Mechanical saturation termination: net-new constraints below threshold for K consecutive rounds
- Output bundle: probe-spec.md, constraints.tsv, questions-asked.tsv, contradictions.md, hidden-assumptions.md, autoresearch-config.yml, summary.md, handoff.json

## v1.8.0 — 2026-03-21

### Added
- `/autoresearch:learn` — autonomous codebase documentation engine
- 4 modes: init, update, check, summarize
- Diff-based targeting for update mode: maps git changes to affected docs
- Validation-fix loop with mechanical verification (max 3 retries)
- Composite metric: `learn_score = validation%*0.5 + coverage%*0.3 + size_compliance%*0.2`

## v1.7.0 — 2026-03-18

### Added
- `/autoresearch:predict` — multi-persona swarm prediction
- 5 default personas: Architecture Reviewer, Security Analyst, Performance Engineer, Reliability Engineer, Devil's Advocate
- Adversarial debate mode (Red/Blue teams), anti-herd detection, budget enforcement
- Zero external dependencies — file-based knowledge representation

## v1.6.2 — 2026-03-10

### Added
- Expanded EXAMPLES.md, GUIDE.md, and CONTRIBUTING.md

## Previous Versions

See `docs/changelog.md` and git history for v1.3.0–v1.6.1 details.

See also: [Development Roadmap](development-roadmap.md) | [Project Overview](project-overview-pdr.md)
