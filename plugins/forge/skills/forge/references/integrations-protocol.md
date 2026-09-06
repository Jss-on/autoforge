# Integrations Protocol — generative media, design bridge, tracker sync

Companion to `build` / `feature` / `design` / `requirements` / `test` / `fix` for the three
**optional MCP integration families** the pipeline can exploit when the running platform has them
connected: **generative media** (Higgsfield-class — real pictures, animation, 3D, audio for the
product being built), the **design bridge** (Figma-class — design files as machine-readable
DESIGN.md sources and review targets), and **tracker sync** (Linear-class — the engagement's
projects, phases and defect ledgers mirrored where the client's team already works).

Everything here is **availability-gated**: probe, use what is present, degrade to the named
fallback when absent — never a hard dependency, never a silent skip. The acceptance model is
unchanged; these integrations feed it (real assets into `ux` rows, real tracker rows out of defect
ledgers), they never replace a gate.

## 0. Doctrine — detect, gate, degrade, record

| Family | Capability probe (by tool shape, not server name) | Fallback when absent |
|---|---|---|
| **Media** | image/video/audio generation tools (e.g. `generate_image`, `generate_image_batch`, `jobs_wait`, `upscale_image`, `remove_background` — Higgsfield-class) | the asset sourcing ladder (`game-assets-protocol.md` §1): CC0 packs → procedural → labeled placeholder slots |
| **Design bridge** | design-file context tools (e.g. `get_design_context`, `get_variable_defs`, `get_screenshot` — Figma-class) | `Design:` catalog slug / file / `generate`; a Figma URL without the bridge is an unreachable source — say so |
| **Tracker** | issue/project tools (e.g. `save_issue`, `save_project`, `save_status_update` — Linear-class) | GitHub issues on the output repo (the standing default) |

- **Probe once per run** (platform tool search / tool listing; a server that fails to load is
  absent). Match by capability shape — server names vary across installs.
- **Record the decision**: `integrations.json` in the run dir — per family: `present` (bool),
  `server`, `enabled` (bool + why), `budget`/`spent` (media), `tracker` choice. Handoff carries the
  optional `tracker` and `assets` fields (additive; schema unchanged otherwise).
- **Availability is not approval.** Detection alone never triggers spend or outward writes. Each
  family names its own arming rule below (mode-required imagery arms media; `Tracker: linear` arms
  tracker sync; `--figma-out` arms outbound design push).
- **Cost is real.** Media generation spends account credits; tracker and design-file writes are
  visible to the client's team. Budgets, caps and dedupe rules below are contract, not advice.

## 1. Generative media (Higgsfield-class) — real pictures, animation, 3D, audio

The craft floor already demands it: Persuade surfaces require **real imagery** (gen tool → real
photo → labeled placeholder slot — protocol §1), and div-built fake screenshots are a tell. This
section is the "gen tool" rung made concrete.

### 1.1 When it arms
- **On by default** (media present) for surfaces whose mode requires imagery: Persuade heroes and
  section imagery, Experience showcase material, empty-state illustration sets, and asset-heavy
  targets (sprites, tiles, textures) per `game-assets-protocol.md`.
- **Only when scoped** (spec/brief/user names it): video loops and motion imagery, 3D props
  (`generate_3d` → GLB), audio (SFX/music), character sets. Expensive media is never a reflex.
- **Never**: UI icons (icons stay one library, one stroke), real-person likeness, real-brand logos
  or marks, replacing client-supplied brand assets, laundering third-party media through
  regeneration. `Assets: off` disables the family for the run.

### 1.2 Asset plan before any job
Write `assets/PLAN.md` first: one row per slot — slot name · surface/route · subject · tool +
model · candidates (2–4 for key slots, 1 for minor) · post-production steps. Check the account
balance before executing; the run's job cap is **12 generation jobs** by default (`Assets: N`
overrides). **Reuse first**: search existing generations (the service's library) and `assets/`
before creating anything new. Plan exceeds cap → cut minor slots to labeled placeholders, say so.

### 1.3 Prompt discipline — the world writes the prompt
Derive one **style contract** paragraph from `DESIGN.md` — thesis, named colors (the actual hex
values), material family, scene light, mood — and reuse it verbatim in every prompt, plus a
per-slot subject line. Generic prompt adjectives ("professional, modern, clean, high quality") are
banned; the direction's own vocabulary is the prompt. Recurring subjects (mascot, product hero,
game protagonist) go through the service's character/consistency workflow so every appearance is
the same subject. Unsure which model fits → use the service's recommend/explore call, don't guess.

### 1.4 Execution
Batch independent jobs (`generate_*_batch` + the wait call), then fetch results once. **Open and
read every generated asset** before wiring it in — reject on: text artifacts or pseudo-lettering,
anatomy defects, palette outside the DESIGN.md world, watermark-like traces, wrong aspect for the
slot. A rejected candidate is re-rolled within the slot's candidate budget, never patched around.
Record kept job ids in `assets/PLAN.md`.

### 1.5 Post-production (dedicated tools over regeneration)
Upscale the hero/marquee assets (2K web, 4K only for print-class needs) · `remove_background` for
real cutouts (this replaces the geometric-mask fake-cutout tell) · `reframe` for aspect variants of
one approved asset · `outpaint` to extend composition — never stretch or crop-and-pray.

### 1.6 Delivery discipline (existing budgets stand)
Images → WebP (PNG only where alpha is needed), sized per slot with `srcset` where responsive.
Video → ≤10 s seamless loop, muted, WebM + MP4, poster frame, `prefers-reduced-motion` swaps to
the poster, lazy-load below the fold. 3D → GLB (Draco when large). Audio → OGG/M4A. The repo and
payload budgets from `game-assets-protocol.md` §2 are unchanged (no file ≥ 50 MB, initial payload
budget as a mechanical `devops` row) — generated media obeys them like any other asset.

### 1.7 Vector honesty
Generation outputs are **raster**. A flat "vector-style" illustration is a raster illustration —
fine for imagery slots, never a substitute for SVG where scaling or theming demands true vectors
(icons, logos, diagrams). Icons remain the icon-library path; diagrams remain code/SVG.

### 1.8 Provenance + pinning
Every kept asset gets a `assets/CREDITS.md` row: file(s) · `generated — <service>/<model>` ·
job id · date · prompt pointer (`assets/PROMPTS.md` holds the style contract + per-slot prompts).
The existing hardening row (ledger covers every file under `assets/`) now covers generated files
too. **Approved assets are pinned**: `fix` / `design --fix` iterations never re-roll imagery;
regeneration happens only through a ledger defect naming what is wrong with the current asset.

## 2. Design bridge (Figma-class) — design files in, review files out

### 2.1 Inbound — a Figma file as the design source
`Design: <figma-url>` (accepted by `requirements`, `build`, `design system`): pull the file's
design context + variable definitions (+ screenshots of the key frames), then **normalize into the
standard DESIGN.md** — variables → `colors` / `typography` / `spacing` / `rounded` frontmatter,
component inventory → `components`, frames → surface archetypes (protocol §2). Prose sections are
written from what the file actually contains; the lint gate is unchanged (`DESIGN_LINT: VALID` or
loop). The client's file is **starting material with authority** — where the build must deviate
(missing states, contrast failures, absent tokens), the deviation is recorded in DESIGN.md prose,
never silent. Key-frame screenshots land in the run dir as direction references.

### 2.2 Audit fidelity (when a Figma source exists)
`design audit` on an app whose DESIGN.md traces to a Figma source MAY additionally export the
source frames and judge fidelity route-by-route (judged rows, filed like any finding). The
mechanical drift rules (`design-*-drift`) still run against the frontmatter — the bridge adds
evidence, it never replaces the scan.

### 2.3 Outbound — code-to-design (human-gated)
`--figma-out`: push the built app's key screens into a **new** design file for stakeholder review
(never editing a client's existing file). This is an outward write like `ship` — it runs only on an
explicit flag with a human confirmation, never unattended.

### 2.4 Degrade
No bridge tools → a Figma URL is an unreachable design source: say so and fall back to
`Design:` catalog/file/`generate`. Never scrape or guess tokens from a URL you cannot read.

## 3. Tracker sync (Linear-class) — the engagement where the team works

### 3.1 Tracker of record — exactly one
GitHub issues on the output repo is the **default** (the standing contract). Linear becomes the
tracker of record only when armed: `Tracker: linear` argument or the spec's `tracker: linear`
field. Never dual-file the same defect in two trackers; `handoff.json` records the choice
(`tracker` field). `Tracker: github` / unset → today's behavior, unchanged.

### 3.2 Mapping (forge → tracker)

| Forge event | Tracker operation |
|---|---|
| Engagement start (`build`/`feature`/`test`/`design` run) | **project** — name = spec/run name; description = charter summary + output-repo URL + run id |
| Phase gate reached (build) / verdict issued (test, design) | **status update** on the project — phase, gate result, pass-rate / verdict word |
| Found-but-deferred defect · unresolved critical/high at engagement end | **issue** — title `[<defect-id>] <summary>`; body = evidence pointer, repro, run id; label `autoforge`; severity map critical→urgent, high→high, medium→normal, low→low |
| `fix` / `design --fix` marks a defect `fixed` | comment + move issue to the team's in-review state (never straight to done) |
| Re-audit grants `verified` | close the issue (done state) |
| SRS / research dossier delivered | **document** attached to the project |

### 3.3 Dedupe + idempotency
Every forge-created issue body carries the marker line `forge:<run-id>/<defect-id>`. Before
creating, search the team's issues for that marker — found → update/comment, never duplicate.
Re-runs of the same engagement update the same project.

### 3.4 Team resolution
List teams once per engagement: exactly one → use it; several → one AskUserQuestion (recorded in
the run config + `integrations.json`); unattended with no `tracker.team` in the spec → **fall back
to GitHub and say so** — never guess a team in someone's workspace.

### 3.5 Safety
Never delete issues, projects or documents. Never modify items that lack the forge marker. Never
change workspace/team membership or visibility. Unattended runs write to the tracker only when
`Tracker: linear` was explicit in the invocation or spec.

## 4. Cross-cutting invariants
- **Gates never move.** Generated imagery still passes the craft floor (contrast over images,
  alt text, sized dimensions); bridged DESIGN.md still passes lint; tracker rows mirror the ledger,
  they never substitute for `*-defects.tsv` (the TSV stays the source of truth in the run dir).
- **Spend is reported.** The run summary prints per-family lines: media jobs used/cap + credits
  spent when the balance call exposes it; tracker rows created/updated; bridge pulls/pushes.
- **Failures degrade, not block.** A media job that errors after one retry → the slot falls back
  down the ladder (labeled placeholder at worst) and the run continues; a tracker write that fails
  → the GitHub fallback fires and the miss is named in the summary; a bridge pull that fails → the
  source is treated as absent. An integration outage is never a reason a build stops.
