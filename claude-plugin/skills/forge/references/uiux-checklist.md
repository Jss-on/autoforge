# UI/UX Checklist — the `ux` acceptance dimension

UI/UX is a first-class, weighted acceptance dimension (`ux`, weight 0.20). A working-but-ugly,
inaccessible, or generic-looking app is capped, never "done". The design system is a committed
**`DESIGN.md`** (DESIGN.md format spec — YAML frontmatter tokens + prose; see
`references/design-protocol.md` §4) — the single source of UI tokens the app is built from and
verified against. `build` designs the interface in SDLC Phase 4 (via the direction protocol) and
verifies it in Phase 6 (via the design QA protocol) — e2e, axe, the mechanical design floor
(`scripts/design-scan.cjs`) and DESIGN.md conformance all run against the **running** app through
**Playwright** (headless Chromium, a project devDependency — see `doctor.sh`), so the same suite
runs unchanged on a workstation and on CI. `/forge:design` is the dedicated command for the
system (Phase 4), the audit (Phase 6 / any existing app) and the bounded remediation loop.

## 0. Mode + archetype (decide first)

- [ ] Every surface has a **visitor mode** (Persuade · Operate · Read · Experience) recorded in the
      spec's `design.mode` / surface brief; the mode's rule deltas (protocol §1) apply — Operate is
      the default for app UI: earned familiarity, restrained color, one workhorse family, no
      decorative motion, no modal-first.
- [ ] Every screen maps to a **surface archetype** (dashboard, list+CRUD, record, form/wizard,
      POS/kiosk, settings, auth, onboarding/empty, landing, docs …) and carries that archetype's
      required patterns as `ux` rows (protocol §2).

## 1. Design system (Phase 4 artifact) — `design:type` · `design:color` · `design:spacing` · `design:radius` · `design:motion` · `design:states`

- [ ] **Typography** — a defined role scale (display/headline/title/body/label/data: size, weight,
      line-height), ≤2 families (Operate: one), tabular numerals for data
- [ ] **Color** — semantic roles (background/surface/on-surface/primary/on-primary/error/success/…);
      every text token clears WCAG contrast on **every** surface it sits on (≥4.5:1 body, ≥3:1
      large/controls); one accent; never pure #000/#fff; light/dark chosen from the use scene
- [ ] **Spacing** — one 4-unit scale; no magic one-off margins; more space above headings than below
- [ ] **Radius** — one radius system (`rounded:`), applied consistently
- [ ] **Motion** — durations + easing declared (exponential ease-out; no bounce), one authored moment
      at most, `prefers-reduced-motion` honored with feedback preserved
- [ ] **Component states** — every interactive family specifies default / hover / focus / active /
      disabled / **loading / empty / error / success**
- [ ] `scripts/score-design.sh lint DESIGN.md` → `DESIGN_LINT: VALID` (schema + contrast pairs)

## 2. Responsive

- [ ] Layout works at mobile (375–390px), tablet (768px), desktop (1280–1440px) — no horizontal
      scroll, no overlap/clipping; responsive is structural (collapse/reflow), not fluid type
- [ ] Tap targets ≥ 24px (WCAG 2.5.8) everywhere, ≥ 44px on mobile; content reflows rather than
      truncating; long tokens wrap (`overflow-wrap: anywhere`); chips wrap or expose `+n`
- [ ] `min-h-[100dvh]` for full-height sections; viewport meta present and zoom never disabled

## 3. Accessibility (WCAG 2.2 AA)

- [ ] Every input has a programmatic **label** (never placeholder-only); images have alt text
- [ ] Full **keyboard** operability incl. dialogs (focus trap, Esc, focus return); visible **focus**
      indicator; logical order; focus not obscured by sticky bars; drag has a keyboard alternative
- [ ] Correct semantics / **aria** roles; landmarks; heading order without skips; live regions for
      async status; error summary focused after failed submit
- [ ] **axe** scan (via Playwright) reports zero serious/critical violations on every page + state
- [ ] Color is never the sole carrier of meaning; auth allows paste + password managers

## 4. End-to-end user flow

- [ ] The primary flow works click-by-click in a real browser via Playwright (create → see →
      edit → reload persists → delete)
- [ ] No console errors during the flow
- [ ] Empty, loading, and error states render correctly when exercised (no data; failed request;
      slow network)

## 5. The craft floor (anti-slop) — `design:floor`

- [ ] `node scripts/design-scan.cjs --url <every primary route> --mode <mode> --design DESIGN.md`
      then `scripts/score-design.sh scan` → **`SLOP_GATE: PASS`** (zero error/warn findings; any
      waiver named with its reason in the row's `detail`)
- [ ] No emoji-as-icons; icons from one library, one stroke; no placeholder names / buzzwords /
      "Oops"; no em-dash UI copy; no kicker on every heading; no nested cards / stat-tile walls /
      identical card grids as page structure (Persuade); no purple gradients, glow halos, side
      stripes, gradient text; no reflex cream+oxblood / navy+blue-shadcn / near-black+neon palette
      unless the brief chose it
- [ ] Visual hierarchy clear; alignment + spacing consistent; interactions feel responsive
      (feedback < 100 ms, no layout shift on action); no lorem / unstyled defaults / clashing styles

## 6. DESIGN.md conformance + design QA (Phase 6)

- [ ] `DESIGN.md` committed and `DESIGN_LINT: VALID`; app style tokens are **derived from** it
- [ ] Live computed styles **match** the frontmatter (Playwright + `design-scan.cjs --design`:
      no `design-*-drift` findings; no off-system "slop" colors/faces/radii)
- [ ] Component states follow the DESIGN.md `## States` patterns
- [ ] A **design audit** ran against the live app (protocol §7): valid captures at every viewport,
      `SLOP_GATE: PASS`, heuristic critique (`DESIGN_HEALTH` ≥ Acceptable), persona walk, ledger,
      `scripts/score-design.sh verdict …` → **`DESIGN_VERDICT: SHIP`** (or FIX rounds until it is)
- [ ] The screenshots were actually **viewed** (Read the PNGs) — green gates have hidden error
      overlays, wrong-color renders and blank regions before

**Design coverage (no orphan tokens).** Each DESIGN.md token group is a stable trace tag the build's
`ux` acceptance rows must reference, so nothing in the design is left unbuilt:
`design:type` · `design:color` · `design:spacing` · `design:radius` · `design:motion` ·
`design:states` · `design:floor`. `scripts/score-build.sh coverage` computes `DESIGN_COVERAGE` =
groups traced by ≥1 `ux` row ÷ total groups; the Phase 4 gate and convergence both require `1.00`.
Add the matching tag to each `ux` assertion's `traces` (TSV col 7); an unmapped group fails the gate.

## Scoring

Declare `ux` assertions in the spec's `acceptance.ux` block (responsive, a11y/axe, e2e flow, states,
design-system conformance, **floor**: `SLOP_GATE`, archetype patterns). The scorer (`score-build.sh
pass-rate`) weights `ux` at 0.20 and renormalizes over the dimensions that ran; `score-build.sh
coverage` separately requires every `design:<group>` tag to be traced by a `ux` row
(`DESIGN_COVERAGE == 1.00`). Mark an assertion `skip` only when genuinely not applicable —
env-limited checks (no browser) should be run on a host where Playwright is available rather than
silently skipped, and any skip is reported, never hidden.
