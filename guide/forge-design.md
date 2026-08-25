# /forge:design — The UI/UX Designer + Design QA

The command that owns how a build **looks, feels and reads**. Three jobs, one entry point:
`system` writes the design world into a machine-readable `DESIGN.md`; `audit` reviews a running app
the way a design director + an accessibility reviewer would, independently and with evidence;
`--fix` remediates the audit's ledger in a bounded loop. Companion contract:
`references/design-protocol.md`; checklist: `references/uiux-checklist.md`; seams:
`scripts/design-scan.cjs` (live-DOM floor + DESIGN.md conformance, driven by the project's own
Playwright) and `scripts/score-design.sh` (`lint` · `scan` · `critique` · `defects` · `verdict` ·
`seed`).

Why it exists: every mechanical `ux` gate was green while builds shipped the AI-generated
dashboard template — emoji nav icons, cream + oxblood, three identical stat tiles, kicker labels
above every heading, nested cards, em-dash copy, "Acme". Axe and responsive checks measure the
**floor**; nothing measured the **tells** or the **usability**. Now both are measured.

---

## The three verbs

```
/forge:design system Brief: requirements.md Mode: operate           # → <target>/DESIGN.md
/forge:design audit Url: http://localhost:3000 Routes: /,/runs,/settings
/forge:design audit Target: build-output/<app> --fix --chain regression
/forge:design system Target: build-output/<app> --refresh          # DESIGN.md from the built world
```

| Verb | Reads | Writes | Gate |
|---|---|---|---|
| `system` | brief / SRS / spec (`design.mode`, `dislikes`), brand assets, existing code + tokens | `DESIGN.md` (project root), direction contract comment in the root layout, `design-results.tsv` baseline `ux` rows | `score-design.sh lint DESIGN.md` → `DESIGN_LINT: VALID` |
| `audit` | the running app (routes × viewports), `DESIGN.md`, spec | `evidence/screens/*.png`, `evidence/design-scan.json`, `design-critique.tsv`, `design-defects.tsv`, `design-results.tsv`, `design-report.md` | `score-design.sh verdict …` → `DESIGN_VERDICT: SHIP \| FIX \| REBUILD` |
| `--fix` | the ledger + git log | `experiment: design/<id>` commits, recaptures, `iterations.tsv` | keep iff `SLOP` didn't rise ∧ no row went red ∧ regression `STABLE` |

`audit` never edits app source (it may add QA helpers under `<target>/qa/`); `--fix` marks defects
`fixed`, never `verified` — a re-audit grants that. Same independence model as `test` ↔ `fix`.

---

## Visitor modes gate everything

| Mode | The visitor… | Baseline | Typical surfaces |
|---|---|---|---|
| **Persuade** | decides and acts | one authored moment, real imagery, hero fits the viewport, ≥4 layout families, kickers **banned** | landing, pricing, campaign |
| **Operate** | completes a task | earned familiarity: restrained color (one accent = action/selection/state), one workhorse family, fixed rem scale, tabular data, 150–250 ms state motion only, no modal-first, every component state | dashboards, list+CRUD, forms, POS, settings, admin |
| **Read** | understands | 60–75ch measure, linear structure, TOC/current-location marker | docs, help, changelog |
| **Experience** | is inside the work | the artifact leads from the first viewport; UI recedes | portfolio, gallery, showcase |

Autoforge's home mode is **Operate**. Its failure mode is not flatness but *strangeness without
purpose*; familiar and effective is a legitimate destination, and expression lives in precise details.

---

## `system` — the direction protocol in one paragraph

Read the room (audience + physical scene, mode per surface, brand assets, the client's dislikes) →
declare the **Design Read** line → set the dials (VARIANCE / MOTION / DENSITY from the mode) → pick
the foundation honestly (official design-system package when the brief reads as one; the stack's
component library otherwise; never two systems, never default state) → choose **strategy before
values** (color: Restrained / Committed / Full / Drenched; type as an object from the subject's world;
light/dark from the scene) → **calibrate** against the saturated AI looks (cream + serif + oxblood ·
near-black + neon glow · broadsheet hairlines + italic serif; "could someone guess this from the
category alone?") → list 5–7 candidate directions → **roll** (`score-design.sh seed "<brief>" 7`,
deterministic, reproducible; a brief-pinned direction beats the roll) → commit → write `DESIGN.md`:

```yaml
---
name: Ledger — Quiet Workshop
mode: operate
colors:      { background: '#0f1218', surface: '#161b23', on-surface: '#e7eaf0',
               on-surface-variant: '#a9b1bf', primary: '#2456c8', on-primary: '#ffffff', … }
typography:  { display: {fontFamily: "IBM Plex Sans", fontSize: 32px, …}, body: {…}, data: {…} }
spacing:     { base: 4px, sm: 8px, md: 16px, lg: 24px }
rounded:     { sm: 4px, md: 8px }
---
## Overview · Colors · Typography · Layout · Elevation & Depth · Shapes · Components · Motion · States · Do's and Don'ts
```

`lint` checks the schema (colors ≥ 4, typography roles ≥ 2 with family + size, spacing, `rounded`),
hex validity, that motion + component states are declared, and **computes every contrast pair the
file implies** — `on-X` vs `X`, and every text/muted token against every ground and surface (the
`--text-3` lesson: the muted token must clear 4.5:1 on the lightest surface it sits on).

---

## `audit` — what gets measured

1. **Captures with validity rules** — 1280×800 + 390×844 (+ tablet / the user's width), motion settled,
   full page from the top, every PNG opened and confirmed. Blank/black/wrong-route = `RECAPTURE`.
2. **The floor** — `design-scan.cjs` runs ~40 deterministic rules against the live DOM (emoji icons,
   kickers, nested/identical/stat cards, side stripes, gradient text, glow halos, purple gradients,
   spotlight haze, cream/pure-black grounds, bounce easing, layout-property transitions, marquees,
   pulsing dots, tiny text, approx. contrast, line length, clipped labels, unlabelled inputs, missing
   focus styles, tap targets, zoom lock, overflow, heading order, generic copy, em-dash UI copy,
   aphoristic cadence, Persuade hero/section rules, **DESIGN.md token drift**, content hidden at rest,
   console errors) — and the impeccable browser detector rides along as a superset when the project
   has it. `score-design.sh scan` → `SLOP: N` / `SLOP_GATE`. Advisory findings never count.
3. **axe + keyboard walk** — WCAG 2.2 AA; dialogs trap/Esc/return focus; nothing obscured by sticky bars.
4. **Heuristic critique** — Nielsen's ten scored 0–4 with a key issue each (honest: most real UIs land
   20–32/40), the cognitive-load eight, → `DESIGN_HEALTH: 26/36 (Good)`.
5. **Persona walk** — Alex (power user), Jordan (first-timer), Sam (screen reader / keyboard),
   Riley (stress tester), Casey (one-thumb mobile) + 1–2 from the SRS; specific red flags only.
6. **Ledger + verdict** — `design-defects.tsv` (same schema and blocking rule as `test`; `[rebuild]`
   when the world/contract failed wholesale) → `score-design.sh verdict` →

```
criterion blocking-defects: 0 PASS
criterion slop-gate: SLOP: 0 PASS
criterion design-lint: VALID PASS
criterion design-health: 28/40 (Good) PASS
DESIGN_VERDICT: SHIP
```

`FIX` = fix rounds; `REBUILD` = the world failed — `system --refresh` or a redesign, never patches.

---

## Wiring into the pipeline

- **build Phase 4** runs `design system` (DESIGN.md + `DESIGN_LINT: VALID` + archetype `ux` rows +
  the seven `design:*` coverage groups incl. `design:floor`).
- **build Phase 5.6** builds under the mode rules with the craft floor loaded before editing UI.
- **build Phase 6** runs `design audit`; convergence requires `SLOP_GATE == PASS` and
  `DESIGN_VERDICT: SHIP`.
- **feature** keeps `SLOP` at zero on touched routes and inherits the surface's world.
- **requirements** captures `design.mode` + `dislikes` in the spec and requires a `design-floor` row.
- **test** folds the design floor into its a11y/usability pass.
- **orchestrator** routes "make the UI look professional / redesign / usability / accessibility"
  goals to the `polish-ui` archetype (audit → `--fix` → regression; predicate `DESIGN_VERDICT: SHIP`).

---

## Running the seams by hand

```bash
bash scripts/score-design.sh lint DESIGN.md
node scripts/design-scan.cjs --url http://localhost:3000/ --url http://localhost:3000/runs \
     --mode operate --design DESIGN.md --shots evidence/screens --out evidence/design-scan.json
bash scripts/score-design.sh scan evidence/design-scan.json
bash scripts/score-design.sh critique design-critique.tsv
bash scripts/score-design.sh verdict design-defects.tsv evidence/design-scan.json DESIGN.md design-critique.tsv
bash scripts/score-design.sh seed "ph payroll bureau | operator console, dark, dense" 7
```

Authenticated routes: log in once with Playwright, save `storageState`, pass `--storage-state
state.json`. Waivers: `--ignore <rule,…>` recorded in `evidence/` with the reason in the row's
`detail` — named, never silent.

---

## Origins

Distilled from a comprehensive assessment of three UI/UX skills — taste-skill (anti-slop discipline,
dials, production tell list), impeccable (visitor modes, craft floor, deterministic detector, finish
reviewer independence, DESIGN.md spec) and ui-ux-pro-max (product-type reasoning, the 119-rule UX
catalog with WCAG 2.2 / HIG / Material provenance) — see `docs/uiux-skills-assessment.md`.
