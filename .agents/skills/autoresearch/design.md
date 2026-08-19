---
name: autoresearch:design
description: "The UI/UX designer + design QA of the pipeline — mode-aware direction protocol → machine-readable DESIGN.md (system); independent design audit of a running app: valid captures, mechanical anti-slop floor, heuristic critique, persona walk, defect ledger, SHIP|FIX|REBUILD verdict (audit); bounded evidence-anchored remediation loop (--fix)"
argument-hint: "[system|audit] [Target: <dir>] [Url: <base-url>] [Routes: <path,…>] [Mode: persuade|operate|read|experience] [Brief: <text|file>] [Design: <DESIGN.md|catalog|url|generate>] [Iterations: N] [--fix] [--refresh] [--storage-state <file>] [--chain <targets>]"
---

EXECUTE IMMEDIATELY.

The **UI/UX designer and design QA** of the pipeline. Where `build` scaffolds and `test` assesses
function, `design` owns the **look, feel and usability**: it turns a brief into a committed visual
world recorded as a machine-readable **`DESIGN.md`** (`system`), it **audits** a running app the way
a design director + an accessibility reviewer would — independent, evidence-first, mechanical where
possible (`audit`, the default) — and, on request, it **remediates** the audit's ledger in a bounded
autoresearch loop (`--fix`). Two truths drive everything: **the visitor mode gates the rules**
(Persuade · Operate · Read · Experience — a payroll dashboard and a marketing page are different
jobs), and **taste never gates convergence on its own** — the mechanical floor (`SLOP_GATE`), the
DESIGN.md lint, the ledger and the verdict do. Companion contract: `references/design-protocol.md`
(modes, archetypes, direction protocol, DESIGN.md schema, craft floor, critique + persona + ledger
protocol, remediation rules); checklist: `references/uiux-checklist.md`.

## Seam & reference resolution (read once)
Resolve `AR_ROOT` exactly as in `build`: first existing of `${CLAUDE_PLUGIN_ROOT}/skills/autoresearch`,
`.claude/skills/autoresearch`, the directory containing this command file, else glob
`**/skills/autoresearch/scripts/score-design.sh` and take its grandparent. Every `scripts/<x>` below
means `$AR_ROOT/scripts/<x>`; every `references/<x>` means `$AR_ROOT/references/<x>`. Seams used
here: `scripts/score-design.sh` (`lint` · `scan` · `critique` · `defects` · `verdict` · `seed`),
`scripts/design-scan.cjs` (the live-DOM floor + DESIGN.md conformance probe, driven by the project's
own Playwright), plus `score-build.sh` / `score-test.sh` / `score-regression.sh` for rows, ledger and
floor. Run `bash $AR_ROOT/scripts/doctor.sh --require-build` at Phase 0 for `audit`/`--fix` — no
Playwright means no captures, no scan, no verdict; say so instead of "reviewing" from source.

## Parse Arguments
- Verb (first token): `system` — create/adopt/refresh `DESIGN.md` from a brief · `audit` (default
  when a Target/Url is given) — independent design review of a running app.
- `Target:` / `--target` — the app directory (default: current repo if it contains a runnable app).
- `Url:` / `--url` — the running app's base URL (default: boot the Target per its README/compose,
  never a guessed destructive command; every derived command is screened via
  `scripts/orchestrate.sh screen-cmd`). `Routes:` — comma-separated paths to review (default: every
  primary route discoverable from the router/nav + the SRS/spec screens; authenticated routes via
  `--storage-state <playwright-state.json>` produced by a login step, never by pasting credentials).
- `Mode:` — the default visitor mode (`persuade|operate|read|experience`); default from the spec's
  `design.mode`, else inferred per surface (protocol §0/§1) and recorded — never silently assumed.
- `Brief:` — text or file for `system` (the SRS `requirements.md`, `charter.md`, the spec, and the
  client's design **dislikes** from `requirements`' artifact-reaction loop are read automatically).
- `Design:` — for `system`: an existing `DESIGN.md` path (adopt + refresh), a catalog slug
  (getdesign.md / `awesome-design-md`), a URL/file, or `generate` (default). `--refresh` — rewrite an
  existing `DESIGN.md` **from the built world** (ground truth) instead of from the brief.
- `Iterations:` — bound for `--fix` (default 12). `--fix` — after the audit, run the remediation
  loop on the ledger. `--chain <targets>` — commonly `regression`, `test`, or `design` again for the
  verdict pass. `--evals`.

## Setup (if required context missing)
If neither a Target/Url nor a Brief is given, AskUserQuestion (single batch):
  Q1 (What): "Design a system for a new app, or audit a running one?" — system, audit, audit + fix
  Q2 (Where): "App directory / base URL / brief file?" — open text
  Q3 (Mode): "What is the main surface for?" — get a task done (Operate) · persuade a visitor
  (Persuade) · read/learn (Read) · experience the work (Experience) · mixed (per route)
  Q4 (Bar): "Design bar?" — full (floor + heuristics + personas + fix rounds), floor only, report only
If a `build`/`feature` invoked this command → derive everything from its run dir; skip setup.

## Run directory & deliverables
`autoresearch/design-{YYMMDD}-{HHMM}/` containing:
- `design-read.md` — the one-line Design Read, mode per surface, dials, scene, constraints, dislikes.
- `directions.md` (`system`) — the 5–7 candidate directions, the seed roll, the standing exit, the pick.
- `DESIGN.md` (`system`) — written into the **Target project root** (the artifact the app is built
  from and verified against) and copied into the run dir; the direction contract comment goes into
  the root layout. `DESIGN_LINT: VALID` recorded in `evidence/design-lint.txt`.
- `evidence/screens/<route>--<WxH>.png` — the captures (audit), `evidence/design-scan.json` (floor +
  conformance findings), `evidence/axe-*.json`, `evidence/design-lint.txt`.
- `design-critique.tsv` — heuristic ledger (`item kind score max note`; H1–H10, C1–C8, personas).
- `design-defects.tsv` — the defect ledger (`id severity priority status test_id summary evidence` —
  same schema and blocking rule as `test`; `[rebuild]` tag when fidelity failed wholesale) + prose
  `design-report.md` (the deliverable: verdict, health, floor table, findings with fixes, what works).
- `design-results.tsv` — `ux` acceptance rows in build's 7-column shape (`traces` carry `design:*`
  tags + FR/NFR IDs) so a `build`/`feature` run can fold them in; `iterations.tsv` (`--fix`),
  `score-log.tsv`, `handoff.json`.

---

# `system` — the direction protocol → DESIGN.md (build Phase 4)

1. **Read the room** (protocol §3.1–3.2): product mechanism, audience + physical scene, mode per
   surface, existing brand assets (starting material), quiet constraints (regulated, public-sector,
   accessibility-first, kids override aesthetics), the client's dislikes, the stack + component
   library. Print the **Design Read** line before anything else and write `design-read.md`.
2. **Dials + foundation**: set VARIANCE/MOTION/DENSITY from the mode baseline ± brief; pick the
   foundation honestly (official design-system package when the brief reads as one — installed and
   used, never re-created, never two systems, never left in default state; native CSS/Tailwind + an
   honest label for aesthetics). Reuse-first: the project's existing component library is the
   foundation unless the brief replaces it.
3. **Strategy before values**: color strategy (Operate/Read floor = Restrained), type as an object
   from the subject's world (Operate: one workhorse family, fixed rem scale, tabular data; the
   reflex-face list is already spent for Persuade/Experience unless the brief names one), light/dark
   from the scene, one accent · one radius system · one theme.
4. **Calibrate** (protocol §3.7): name the three saturated attractors and the category-default page;
   run the self-check ("could someone guess this from the category alone, or from category-plus-
   avoidance?"); derive candidates from the audience's actual world across ≥3 material families.
5. **List 5–7 directions** (thesis · palette strategy + 3 named colors · type · material · first
   viewport · signature interaction · honest risk), keep the rut out, and **roll**:
   `scripts/score-design.sh seed "<spec name>|<brief text>" <n>` → build the indexed direction. A
   user- or brief-pinned direction beats the roll; re-roll only on named product-truth grounds. With
   a human present, present the pick + the standing exit (the category standard, played straight,
   never recommended) via one AskUserQuestion; unattended, build the roll and record the assumption.
6. **Write `DESIGN.md`** per protocol §4 (frontmatter: `name`, `description`, `mode`, `colors`
   with every `on-X` pair + a muted text token budgeted for the lightest surface, `typography` roles
   with fontFamily+fontSize, `spacing`, `rounded`, optional `components`; sections Overview · Colors ·
   Typography · Layout · Elevation & Depth · Shapes · Components · Motion · States · Do's and Don'ts;
   named rules; ≥3 Do + ≥3 Don't grounded in the world). Put the **direction contract** comment
   (THESIS · OWN-WORLD · STORY · FIRST VIEWPORT · FORM with the seed key · FINISH) first in the root
   layout. `Design:` catalog/URL/file sources are copied to the project root as `DESIGN.md` and
   normalized to the same frontmatter schema (tokens extracted; prose kept) — a prose-only design
   file is not a contract.
7. **Gate**: `scripts/score-design.sh lint <target>/DESIGN.md` → `DESIGN_LINT: VALID` (tee to
   `evidence/design-lint.txt`); loop on INVALID (contrast pairs are computed — a muted token that
   fails on `surface-container-highest` is a real defect, fix the token). Then emit the `ux`
   acceptance rows every build must carry (protocol §2 archetype rows + the 7 `design:*` coverage
   groups incl. `design:floor` = `SLOP_GATE: PASS`) into `design-results.tsv` as `fail` baseline
   rows for `build`/`feature` to fold in.
8. **`--refresh`** (existing app): scan the incumbent — CSS custom properties, Tailwind theme,
   token files, the main button/input/nav/card/table components, and the **live computed styles**
   via Playwright — then rewrite the frontmatter from what is actually used (descriptive names, one
   canonical value per token, no invented components), confirm the qualitative language (north star,
   color character, elevation philosophy) with the user when present, keep prior named rules that
   still hold, and re-lint. Never overwrite a DESIGN.md silently — show the diff.

# `audit` — independent design QA (build Phase 6 · any existing app)

**Independence:** the reviewer never edits the app (source read-only; it may add QA artifacts and
Playwright helpers under `<target>/qa/`), never inherits the builder's framing (read the SRS/spec +
DESIGN.md + the app; not the build thread's summary), and never softens the disposition word.

1. **Phase 0 — orient**: `doctor.sh --require-build`; boot or reach the Url; enumerate routes +
   states (per role via `--storage-state`); read `DESIGN.md` (lint it — an INVALID or missing
   DESIGN.md is finding #1, filed as high) and the spec's `design.mode`; decide the mode per surface
   and write `design-read.md`. Reuse-first: if a `test` run's `evidence/` already holds valid
   captures/axe reports for the same commit, cite them instead of re-capturing.
2. **Phase 1 — capture (validity first)**: `design-scan.cjs` with `--shots evidence/screens` at
   1280×800 + 390×844 (+ 768×1024 for tablet-heavy surfaces, + the user's reported width): motion
   settled, full-page from the top. **Read every PNG** and confirm it shows what its name claims (no
   blank/black regions, right route, not a login wall, no half-loaded state) — a malformed capture
   is `RECAPTURE`, never scored. Also capture the primary flow's key states (empty, filled, error,
   success, loading if reachable) with the same discipline.
3. **Phase 2 — mechanical floor + conformance + a11y**: the same `design-scan.cjs` run writes
   `evidence/design-scan.json` (`--design <target>/DESIGN.md`, `--mode <mode>`; `--engine both`
   adds the impeccable detector when the project has it); `scripts/score-design.sh scan
   evidence/design-scan.json` → `SLOP: N` + `SLOP_GATE`. Run **axe** via Playwright on every route +
   state → `evidence/axe-*.json` (zero serious/critical is the row). Keyboard-only walk of the primary
   task (focus visible, order logical, dialogs trap + Esc + return focus, nothing obscured by sticky
   bars). Every counted finding becomes a defect row (structural repeats = one systemic defect).
4. **Phase 3 — heuristic critique**: score Nielsen's ten 0–4 with a key issue each (`na` only where
   the mode cannot apply, renormalized), the cognitive-load eight, and write `design-critique.tsv`;
   `scripts/score-design.sh critique design-critique.tsv` → `DESIGN_HEALTH: N/M (Band)`. Where a
   `reason`-style blind panel is available, two isolated assessors score before seeing the scan.
   Judge against the mode: Operate is scored on earned familiarity, states, scanability, task speed;
   Persuade on the first viewport doing its job (what · why · do) and on composition variety.
5. **Phase 4 — persona walk**: 2–3 personas by surface (protocol §7.4) + 1–2 from the SRS
   stakeholders; walk the primary task; report the exact element that failed each persona.
6. **Phase 5 — ledger + verdict**: `design-defects.tsv` (validate: `scripts/score-design.sh defects`),
   `design-results.tsv` (`ux` rows: floor, conformance, axe, archetype patterns, states — pass only
   with `evidence:`), then
   `scripts/score-design.sh verdict design-defects.tsv evidence/design-scan.json <target>/DESIGN.md design-critique.tsv`
   → **`DESIGN_VERDICT: SHIP | FIX | REBUILD`**. `REBUILD` = the world/contract failed wholesale
   (`[rebuild]` defect or health band Poor/Critical): route to `system --refresh` or a redesign, do not
   patch. Write `design-report.md` (protocol §7.7) — the report is the deliverable; print it, don't
   just file it.
7. **GitHub flow**: commit the run dir; when the Target is its own output repo, copy
   `design-report.md` + `design-defects.tsv` into `<target>/qa/design/` on a `qa/design-<stamp>`
   branch, push, open a PR that merges itself on green CI (`--no-merge` opts out; branch protection
   wins). File every unresolved critical/high design defect as a GitHub issue (label `design`).

# `--fix` — bounded remediation (the builder half)

Runs only on an existing ledger (this run's audit or a prior `design`/`test` run's). Per iteration:
read `design-defects.tsv` + `git log` of recent `experiment: design/…` commits → pick the highest
blocking item (order: task-blocking + a11y → missing states → flow/hierarchy → floor tells →
visual/motion consistency → cleanup) → **one slice** → `git commit -m "experiment: design/<id> —
<slice>"` **before** verify → recapture the affected routes + rescan + axe → **keep** iff `SLOP` did
not rise, no `ux`/functional acceptance row went red (`scripts/score-build.sh pass-rate
--strict-evidence`), `scripts/score-regression.sh verdict` is `STABLE`, and the row's evidence
exists; else `git revert HEAD --no-edit`. Mark the defect `fixed` (never `verified` — only a
re-audit grants that). Fix at the narrowest correct level (protocol §8): missing token → DESIGN.md +
tokens; one-off → shared component; conceptual mismatch → stop and route to `system --refresh`;
local defect → fix locally. Never perfect one corner while the rest sits below the bar. Stop at the
bound (`scripts/score-build.sh bound iterations.tsv <N>`), at `SLOP: 0` + zero blocking defects, or
when a round resolves nothing (plateau); two rounds is the unattended ceiling. Then run the **verdict
pass** as a fresh audit over the new captures (a claimed fix you cannot see is unresolved).

## Safety Invariants
- **`audit` never modifies app source, config, data, or DESIGN.md** — it adds QA artifacts only;
  the ledger routes remediation to `--fix` / `fix` / `feature`.
- **`--fix` mutates only the Target app** on `experiment:` commits, auto-reverted on any regression
  (`ux`, functional, `SLOP` rise); it never touches the skill repo or unrelated trees, and never
  changes IA/routes/slugs, form field names, brand wordmarks, or legal copy without explicit approval.
- Never deploy, publish, or change repo visibility (`ship` is human-gated). Derived commands are
  screened via `scripts/orchestrate.sh screen-cmd`; DB URLs obey the localhost/`_test` allowlist;
  logins for `--storage-state` use throwaway dev accounts, never pasted credentials.
- Evidence discipline: no capture → no finding; no evidence file → no `pass` row; no seam → no
  verdict. Waivers are named (`--ignore` recorded in `evidence/`, reason in the row's `detail`).

## Summary
Print: mode(s) + surfaces reviewed; `DESIGN_LINT`; **`SLOP: N` + `SLOP_GATE`** with the rule table;
axe serious/critical count; **`DESIGN_HEALTH: N/M (Band)`** table (10 rows + cognitive-load fails);
persona red flags; defects by severity (open/fixed/verified, `[rebuild]` list); `ux` rows green/total;
**`DESIGN_VERDICT: SHIP | FIX | REBUILD`**; for `--fix`: iterations, kept vs reverted slices, `SLOP`
before → after, health before → after; deliverables checklist (design-read · DESIGN.md/lint ·
captures · scan · critique · ledger · report — present/missing); GitHub PR/issue links.

## Eval Checkpoint (--evals)
Interval: floor(max_iterations / 3), min 1. Print `SLOP` trend, blocking-defect trend, health
band; a flat `SLOP` across 3 checkpoints → recommend `system --refresh` (the world, not the polish,
is the problem) rather than more slices.

## Chain Handoff
Write handoff.json: version "2.5.0", source "design", timestamp, status
(COMPLETE|CONVERGED|BOUNDED|BLOCKED|USER_INTERRUPT|ERROR), results_tsv (`design-results.tsv`),
defects_tsv, verdict (`SHIP|FIX|REBUILD`), design (path to DESIGN.md + `lint` result), slop (count),
health (`N/M`), summary (path to `design-report.md`), findings = open defects + waived rules,
config{verb, target, url, routes, mode, iterations}. Validate with
`scripts/validate-handoff.sh <run>/handoff.json design` before printing the summary. Chain commonly
`--chain regression` (after `--fix`), `test` (function after form), or `design` again (verdict pass).
Propagate `--evals`.
