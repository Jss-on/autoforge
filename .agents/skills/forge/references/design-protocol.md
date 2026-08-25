# Design Protocol — direction, DESIGN.md, the craft floor, and design QA

The companion contract for `/forge:design` and for the design work inside `build` (Phase 4
+ Phase 6), `feature` (design delta) and `test` (usability/a11y pass). It is the distilled,
forge-shaped synthesis of the three reference skills the pipeline was assessed against —
taste-skill (anti-slop discipline for landing/portfolio surfaces), impeccable (visitor modes, the
craft floor, deterministic slop detection, independent finish review) and ui-ux-pro-max (product-type
reasoning, the 119-rule UX guideline catalog, WCAG 2.2 / HIG / Material provenance) — plus the
mechanical seams that make it measurable: `scripts/design-scan.cjs` (live-DOM floor rules) and
`scripts/score-design.sh` (lint · scan · critique · defects · verdict · seed).

Everything below is **contextual, mode-gated, and mechanical where it can be**. Taste never gates
convergence on its own; the floor and the ledger do.

## 0. Vocabulary

| Term | Meaning |
|---|---|
| **Visitor mode** | What success looks like on THIS surface: **Persuade** (decide + act: landing, pricing, campaign) · **Operate** (complete a task: app UI, dashboards, POS, forms, settings, admin) · **Read** (understand: docs, help, changelog) · **Experience** (be inside the work: portfolio, gallery, showcase, game shell). Chosen per surface, not per product — a tool's landing page is Persuade, its app is Operate. |
| **Surface archetype** | The job-shaped template inside a mode (dashboard, list+CRUD, record detail, form/wizard, POS/kiosk, settings, auth, onboarding/empty, landing, docs …) — each carries required patterns + acceptance rows (§2). |
| **Direction** | The committed visual world: thesis, palette strategy, type, material, first-viewport composition, signature interaction, honest risk. Recorded as `DESIGN.md` + a contract comment. |
| **Craft floor** | The mechanical minimum every surface clears regardless of taste: contrast, spacing, type, states, browser surfaces, copy, and the **Refuse list** of AI tells. Enforced by `design-scan.cjs` (`SLOP_GATE`). |
| **Slop / tell** | A pattern that identifies generated UI regardless of subject: emoji icons, cream + oxblood, three identical stat tiles, kicker eyebrows on every heading, purple gradients, glow halos, side-stripe callouts, em-dash copy, "Acme", "Oops!". |
| **Dials** | `VARIANCE` (1 symmetric → 10 asymmetric), `MOTION` (1 static → 10 cinematic), `DENSITY` (1 airy → 10 cockpit). Set from the mode + brief; never asked of the user as numbers. |
| **Disposition** | The design QA verdict word — `SHIP` · `FIX` · `REBUILD` (+ `RECAPTURE` when evidence itself failed). Derived by `score-design.sh verdict`, never felt. |

## 1. Visitor modes — the rule that gates every other rule

Decide the mode from the requested surface (§0), record it in the surface's brief / the spec's
`design.mode`, and apply the deltas:

| | Persuade | Operate | Read | Experience |
|---|---|---|---|---|
| Wins | attention → belief → one action | task completion, scanability, familiarity | comprehension, wayfinding | the artifact leads; UI recedes |
| Dials (baseline) | 7 / 6 / 3 | 3 / 2 / 5–7 | 4 / 2 / 4 | 8 / 7 / 3 |
| Color strategy | Restrained → Committed/Full/Drenched allowed | **Restrained** floor (neutrals + one accent; accent = action/selection/state only) | Restrained | Committed+ allowed |
| Type | display face with a point of view; ≤2 families | **one workhorse family**, fixed rem scale (ratio 1.125–1.2), tabular numerals for data | reading measure 60–75ch first | display may carry voice |
| Layout | asymmetric/fluid composition earns its place; ≥4 layout families across 8 sections; hero fits the viewport | predictable structure, stable density, standard nav (top bar + side nav / tabs / breadcrumbs / command palette), responsive is **structural** (collapse, reflow), not fluid type | linear, one reading path, TOC | artifact first viewport |
| Motion | one authored focal moment; scroll-reveal ok; ≤1 marquee | 150–250 ms state transitions only; **no page-load choreography**, no decorative motion | none beyond feedback | may be the material |
| Imagery | real imagery required (gen tool → real photo → labeled placeholder slot); no div-built fake screenshots | none required; icons from one library, one stroke | diagrams when they explain | the work itself |
| Kickers/eyebrows | **banned** | rationed: ≤ ceil(sections/3), never above every heading | rare | rare |
| Cards | identical icon+heading+text grids and hero-metric tiles are tells | KPI tiles allowed when the numbers ARE the content; still no nested cards | avoid | avoid |
| Modal | for interruption/protected focus only | **modal-first is laziness**: inline / slide-over / progressive disclosure first | no | no |

Operate is autoforge's home mode (payroll, POS, intake, admin). Its failure mode is not flatness
but **strangeness without purpose** — over-decorated buttons, mismatched controls, display faces in
labels, invented affordances for standard tasks. The bar is **earned familiarity**: a category-fluent
user trusts it immediately and never pauses at a subtly-off component. Familiar and effective is a
legitimate destination there; expression lives in precise details (a considered accent, a good empty
state, tabular numbers, a fast keyboard path).

## 2. Surface archetypes — required patterns → acceptance rows

Every archetype below names the patterns a surface must have; each bullet is a candidate `ux` row
(mechanical, Playwright-driven) unless marked *(judged)*.

**Operate**
- **Dashboard** — the 1–3 numbers that matter first with units + period + comparison; charts carry legend, tooltip, axis units, empty + loading + error states, and a table alternative for a11y; **no** stat-tile wall as the whole page; every tile links to its detail; refresh/period control; nothing below the fold that the primary role needs first.
- **List + CRUD** — search/filter with visible active filters + clear; sortable columns with `aria-sort`; pagination or virtual scroll ≥50 rows; row → detail; create/edit/delete each with confirmation for destructive + **undo** where safe; bulk actions when the entity is bulk-managed; empty state (first-use vs no-results distinguished) with the create action; skeleton loading; error with retry.
- **Record detail** — identity header (name/status/primary actions), grouped fields, edit inline or in a drawer, activity/history, back preserves list scroll + filters.
- **Form / wizard** — persistent labels (never placeholder-only), helper text under complex inputs, validation on blur, error text under the field + `aria-describedby`, **error summary focused after failed submit**, required marking consistent, semantic input types + `autocomplete`, password toggle, autosave for long forms, step indicator + back for wizards, unsaved-changes guard, ≥44px input height on mobile.
- **POS / kiosk / operator console** — product/action grid with big targets (≥48px, ≥8px gaps), keyboard/scanner-first entry with a visible SKU field, numeric keypad for cash, running total always visible, one primary action per screen, offline/slow-network state, receipt/print state.
- **Settings** — account (name, email, password, MFA), org/workspace, danger zone visually separated, save feedback per section, read-only vs disabled distinguished.
- **Auth** — password managers + paste allowed, non-cognitive path (magic link/OTP) or clear recovery, error names the fix, MFA step keyboard-operable, no zoom lock.
- **Onboarding / empty** — every empty state answers *what will be here · why it matters · how to start* (+ template/import when it applies); first-use ≠ no-results ≠ no-permission ≠ error; skip allowed; nothing shown twice once dismissed.
- **Notifications / toasts** — `aria-live="polite"`, never steal focus, 3–5 s auto-dismiss for transient, persistent for errors, undo where relevant.

**Persuade** — hero fits the first viewport (headline ≤2 lines desktop, subtext ≤20 words, one primary CTA + ≤1 secondary, no trust strip/tagline inside the hero); logo wall under the hero with real marks; ≥4 layout families across the page; no two CTAs with the same intent; real imagery; quotes ≤3 lines with name + role; pricing/legal/privacy reachable; ≤1 marquee; motion motivated per element *(judged)*.

**Read** — TOC/breadcrumb + current-location marker, 60–75ch measure, code blocks themed, search reachable, prev/next, headings h1→h6 without skips.

**Experience** — the work leads from the first viewport *(judged)*; controls recede; keyboard + reduced-motion path still complete.

**Game HUD** — see `references/game-assets-protocol.md`; the HUD is Operate (legibility, contrast, no motion that blocks input).

Cross-archetype product truths (from `forge-real-product-not-demo`): create → persists across restart; fresh account starts empty; settings save; every core entity has create/edit/delete.

## 3. Direction protocol (`design system`) — read the room, then commit

1. **Read the brief.** Product mechanism (one sentence), the audience's real scene (who, where, under what light — this decides light/dark, never the category), the mode per surface, existing brand assets (logo, palette, type: starting material, not optional), quiet constraints (regulated, public-sector, accessibility-first, kids → these override aesthetics), the client's **dislikes** from `requirements`' artifact-reaction loop, and the stack (component library already chosen?).
2. **Declare the Design Read** in one line before anything else: *"Reading this as: <surface> in <mode> for <audience>, <density/scene>, leaning toward <system or aesthetic family>."*
3. **Set the dials** from §1 baselines ± brief signals ("dense operator console" → density 8; "calm, trust-first" → variance 3, motion 2).
4. **Pick the foundation honestly.** If the brief reads as a real design system (Material, Fluent, Carbon, Polaris, Atlassian, Primer, GOV.UK, USWDS, Radix Themes, shadcn/ui, Bootstrap), install and use the **official package** and its tokens — never re-create it by hand, never mix two systems, never ship shadcn/Radix in default state (customize radius/color/type to the world). If the brief is an aesthetic (glass, bento, brutalist, editorial, dark-tech), build with native CSS/Tailwind and label borrowed inspiration honestly (Apple "Liquid Glass" has no web package — it is an approximation).
5. **Choose a color strategy before choosing colors**: Restrained (neutrals + one accent — Operate/Read default) · Committed (one saturated color owns 30–60% of the surface) · Full palette (3–4 named roles) · Drenched (the surface IS the color). Color commits at page scale (fields owning regions), not accents sprinkled on neutral. Max one accent in Restrained; saturation < 80%; **never pure #000/#fff**; **one accent, one radius system, one theme per page** (no light section inside a dark page); tint shadows to the ground.
6. **Choose type like an object from the subject's world.** Operate/Read: a workhorse UI family (system stack, Inter/Geist-class faces are *fine* here — familiarity is the feature) with a fixed rem scale and tabular numerals. Persuade/Experience: a face with a point of view; treat as **already spent** the training-data reflexes (Inter-as-display, Space Grotesk, DM Sans/Serif, Plus Jakarta, Outfit, Fraunces, Playfair, Cormorant, Lora, Instrument Serif/Sans, Syne, IBM Plex, Space Mono) unless the brief names one; serif only when the brand or a genuinely editorial/luxury register asks and you can say why this serif; emphasis inside a headline = italic/bold of the same family, never a random serif word.
7. **Calibrate against the saturated looks.** The three attractors any model lands in when the brief is free: *warm cream + high-contrast serif + terracotta/oxblood accent* · *near-black + one neon accent + glowing edges* · *broadsheet hairlines + italic serif + tracked mono labels*. Legitimate when chosen; a **failure of the self-check** when reached by reflex. Test: *could someone guess this aesthetic from the category alone (payroll → navy/blue shadcn; cookware → cream/brass; AI → purple glow)? or from category-plus-avoidance?* If yes to either, rework from the audience's actual world (its notation, publications, identity programs, screens it reads daily, physical objects), spanning ≥3 material families before choosing.
8. **List 5–7 candidate directions**, each: thesis (one idea + the category default it refuses) · palette strategy + 3 named colors · type · material/depth · first-viewport composition · signature interaction · honest risk. Keep the category's predictable page AND its predictable opposite out of the list (they are the rut).
9. **Roll**: `scripts/score-design.sh seed "<spec name + brief hash text>" <n>` → the 1-based index picks the direction to build. The roll breaks the ranking rut while staying reproducible; a user- or brief-pinned direction always beats the roll; re-roll only on **named product-truth grounds** (the direction cannot carry the task), never taste. Present the pick + the standing exit (the category standard, played straight, never recommended) when a human is in the loop; unattended, build the roll and record the assumption.
10. **Commit and record.** Write `DESIGN.md` per §4 (tokens + prose + named rules + Do/Don't), and put the **direction contract** as the first HTML comment in the root layout: `THESIS · OWN-WORLD · STORY · FIRST VIEWPORT · FORM (candidate index + seed key) · FINISH ("unreviewed and undocumented is unfinished")` — ≤150 words, must survive the production build (grep the built output for the seed key). Then `scripts/score-design.sh lint DESIGN.md` → `DESIGN_LINT: VALID` is the Phase 4 gate. In a redesign, the old look is evidence of what the subject is, never authority over what it becomes; a coherent world already in code (even without a DESIGN.md) is inherited and documented, not replaced.

## 4. DESIGN.md — the machine-readable design source

Follows the DESIGN.md format spec (google-labs-code/design.md): YAML frontmatter carries the
normative tokens; prose explains where and why. `score-design.sh lint` and `design-scan.cjs
--design` both parse the frontmatter, so **the frontmatter is the contract**, not the prose.

```yaml
---
name: <Project> — <world name>
description: <one line>
mode: operate                      # default visitor mode of the app surfaces (persuade|operate|read|experience)
colors:                            # hex; semantic roles; every on-X has an X; text tokens clear 4.5:1 on EVERY ground/surface
  background: '#0f1218'
  surface: '#161b23'
  surface-container: '#1c222c'
  on-surface: '#e7eaf0'            # primary text
  on-surface-variant: '#a9b1bf'    # muted text — budget it to clear 4.5:1 on the LIGHTEST surface it sits on
  primary: '#3d7bff'               # the accent: actions, selection, state — not decoration
  on-primary: '#ffffff'
  error: '#ff6b6b'
  on-error: '#1a0000'
  success: '#3ccf7a'
  warning: '#ffb84d'
  outline: '#2a323f'
typography:                        # roles, not values; fontFamily + fontSize required per role
  display:  { fontFamily: "IBM Plex Sans", fontSize: 32px, fontWeight: 600, lineHeight: 1.2, letterSpacing: -0.01em }
  headline: { fontFamily: "IBM Plex Sans", fontSize: 24px, fontWeight: 600, lineHeight: 1.25 }
  title:    { fontFamily: "IBM Plex Sans", fontSize: 18px, fontWeight: 600, lineHeight: 1.3 }
  body:     { fontFamily: "IBM Plex Sans", fontSize: 16px, fontWeight: 400, lineHeight: 1.55 }
  label:    { fontFamily: "IBM Plex Sans", fontSize: 13px, fontWeight: 500, lineHeight: 1.2 }
  data:     { fontFamily: "IBM Plex Mono", fontSize: 14px, fontWeight: 400, lineHeight: 1.4, fontVariation: tabular-nums }
spacing:   { base: 4px, xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 40px, gutter: 24px }
rounded:   { sm: 4px, md: 8px, lg: 12px, pill: 9999px }   # `rounded`, not `radius` (spec key)
components:                        # optional; 8 sub-props: backgroundColor textColor typography rounded padding size height width
  button-primary: { backgroundColor: "{colors.primary}", textColor: "{colors.on-primary}", rounded: "{rounded.md}", padding: "10px 16px" }
---
# Design System: <name>
## Overview            — Creative North Star (one named metaphor), 2–3 paragraphs, Key Characteristics, mode + dials + scene
## Colors              — role per token, the accent rule, dark/light behaviour, contrast budget (named rule)
## Typography          — families + hierarchy + measure + numerals (named rule)
## Layout              — grid/container/breakpoints (375/768/1024/1440)/density/spacing rhythm/responsive collapse per archetype
## Elevation & Depth   — flat vs tonal vs shadow; the shadow vocabulary; tinted shadows
## Shapes              — the ONE radius system; borders; form language
## Components          — buttons/inputs/nav/table/chip/card/dialog: shape, color, states (default hover focus active disabled loading error success)
## Motion              — durations (100–150 feedback · 150–300 state · 300–500 overlay/view), easing (exponential ease-out; no bounce), the ONE authored moment (Persuade), prefers-reduced-motion behaviour
## States              — loading (skeleton, not spinner-in-content) · empty (what/why/how) · error (what failed/why/recover) · success — per component family
## Do's and Don'ts     — grounded in the chosen world; ≥3 each; the Refuse list items that apply
```

Named rules stick (`**The One Voice Rule.** The accent appears on ≤10% of any screen; its rarity is the
point.`). Descriptive first, exact value in parens. Never duplicate a token value in prose with a
different number. **Coverage tags** — the seven groups every `ux` acceptance set must trace
(`score-build.sh coverage` → `DESIGN_COVERAGE`): `design:type` · `design:color` · `design:spacing` ·
`design:radius` · `design:motion` · `design:states` · `design:floor` (the mechanical floor: `SLOP_GATE`).

DESIGN.md is written **before** UI code (build Phase 4) so tokens are the acceptance target, and
**re-documented from the built world at finish** (`design system --refresh`) so it never describes a
layout that no longer exists — the conformance scan (`design-scan.cjs --design DESIGN.md`) is what keeps
the two honest with each other.

## 5. The craft floor — verify list, refuse list, mechanical rules

Load this before editing UI. A pinned brief or the committed world overrides any item; habit does not.

**Verify (checks on the built result, run together in one batched inspection round):**
contrast (body/placeholder ≥4.5:1, large ≥3:1, controls/focus ≥3:1; on colored surfaces derive secondary text from the hue, never gray) · depth (shadows carry offset + soft blur; a zero-offset colored halo is decoration) · spacing (tight groups, generous separation, more space above a heading than below; one 4-unit scale, no one-offs) · type (measure 45–80ch, ≥16px body web / 12px floor / 11px functional floor, tracking floor -0.04em, `text-wrap: balance` on short headings, tabular numerals in data) · motion (one authored moment or none; exponential ease-out; exit faster than enter; reduced-motion path keeps feedback) · states (default hover focus active disabled loading error empty success — all of them) · browser surfaces (selection, caret, focus ring, scrollbars, underline offset themed from the palette) · copy (controls name their outcome; errors name what failed + how to recover; no exclamation marks; sentence case; product's own words) · coverage (every brief requirement findable within seconds).

**Refuse (category defaults; the brief's own words can earn any of them):**
same-size icon+heading+text card grids as page structure · nested cards · the hero-metric template as a page · kicker/eyebrow above headings (Persuade: banned) · numbered section markers · modal by reflex · gradient text · glass/blur as decoration · colored `border-left` stripes · hard offset block shadows outside neobrutalism · sparklines/rings/rounded rectangles standing in for content · monospace as a "technical" costume · a system display face as the voice of an own-world page · unicode/emoji glyphs standing in for an icon system · geometric masks faking photographic cut-outs · light/dark picked by category · purple/violet gradients, cyan-on-dark, glow halos, radial spotlight haze · cream/beige as the reflex "tasteful" ground and oxblood/brass/terracotta as the reflex premium accent · pure #000/#fff · Lucide/Feather-only iconography by default (allowed when the project already uses it) · placeholder names ("John Doe", "Acme"), fake-round numbers (99.99%), buzzwords (seamless, elevate, unleash, next-gen, revolutionize, supercharge, world-class, empower, streamline), "Oops!", bare "Something went wrong", "Quietly trusted by", scroll cues, version stamps on marketing pages, aphoristic rebuttal cadence ("X. No Y."), em/en dashes in UI copy · `h-screen`/`100vh` heroes (`min-h-[100dvh]`) · `window.addEventListener('scroll')` animation drivers, layout-property transitions, bounce/elastic easing, infinite pulsing dots, more than one marquee.

**Mechanical rules (`design-scan.cjs`)** — severity `error`/`warn` count toward `SLOP`; `advisory` is
reported only. Mode-gated rules fire as `warn` in Persuade/Experience and `advisory` in Operate/Read.

| Rule | Fires when | Severity |
|---|---|---|
| `viewport-meta` / `zoom-disabled` | no viewport meta · `user-scalable=no` / `maximum-scale=1` | error |
| `horizontal-overflow` | document wider than the viewport | error |
| `console-error` / `page-unreachable` / `http-error` | JS or page errors on load · non-2xx | error |
| `img-alt` · `broken-image` · `unsized-image` | alt missing · empty/failed src · no dimensions | error · error · advisory |
| `unlabelled-input` | input/select/textarea without label/aria-label (placeholder-only) | error |
| `no-focus-style` | no `:focus`/`:focus-visible` rule in any accessible stylesheet | warn |
| `tap-target-24` · `tap-target-44` | interactive target < 24px (WCAG 2.5.8) · < 44px on mobile | warn · advisory |
| `low-contrast` | text < 4.5:1 (3:1 large) vs nearest opaque background (approx.) | error |
| `tiny-text` | functional text < 11px (sup/sub/sr-only/code exempt) | error |
| `line-length` · `all-caps-body` · `clipped-text` | prose > ~90 chars/line · uppercase passages > 60 chars · nowrap overflow without ellipsis | warn |
| `no-h1` · `skipped-heading` | missing h1 · heading levels skip | warn |
| `emoji-icon` | emoji used as a structural glyph in nav/buttons/headings/labels | error |
| `dash-in-ui-copy` · `em-dash-overuse` | em/en dashes in headings/nav/buttons/labels · ≥6 in body | warn · advisory |
| `generic-copy` | placeholder names, buzzwords, "Oops", bare "Something went wrong", "Quietly trusted", scroll cues, performative labels | warn |
| `aphoristic-cadence` · `numbered-section-labels` | ≥3 rebuttal sentences · ≥3 small numeric section markers | advisory |
| `kicker-label` | tracked-uppercase small label directly above a heading; > allowance (0 Persuade, ceil(sections/3) otherwise) | warn (else advisory) |
| `nested-cards` · `identical-card-grid` · `hero-metric-cards` | card in card · ≥3 same-size sibling cards · ≥3 stat tiles | warn · mode-gated · mode-gated |
| `side-stripe` · `gradient-text` · `glow-shadow` · `ai-purple-gradient` · `radial-spotlight-glow` | the surface tells | warn |
| `cream-default-palette` · `pure-black-bg` | reflex ground colors | advisory |
| `bounce-easing` · `layout-property-transition` · `marquee` · `pulsing-dot` | motion tells | warn · warn · advisory · advisory |
| `hero-overflows-viewport` · `oversized-h1` · `section-layout-repetition` | Persuade composition | warn · warn · advisory |
| `design-font-drift` · `design-color-drift` · `design-radius-drift` | live computed styles outside the DESIGN.md frontmatter (needs `--design`) | warn · warn · advisory |
| `content-hidden-at-rest` | > 20% of text at opacity 0 after settle + scroll sweep (failed reveal) | warn |
| `imp:*` | the impeccable detector's rules when the package is resolvable (superset) | its severity |

Waivers are explicit and named: `--ignore <rule,…>` in the scan invocation recorded in the run's
`evidence/`, with the reason in the acceptance row's `detail` — never a silent skip. A rule the brief
genuinely earns (a real neobrutalist world, a documented brand purple) is waived with that evidence.

## 6. States, hardening, onboarding, copy — the finish that separates product from demo

- **Every interactive component ships all states**: default · hover · focus-visible · active (tactile: `scale(0.98)`/`-1px`) · disabled (semantic attribute + reduced emphasis, not just opacity) · loading (skeleton matching layout, button disabled + spinner) · error · success. Read-only ≠ disabled.
- **Empty states** teach: what appears here · why it matters · the create/import action; first-use / cleared / no-results / no-permission / failed-to-load are different screens.
- **Harden against reality**: long names (100+ chars) wrap or clamp with an accessible full value; 0 / 1 / 1000+ items; emoji + RTL + CJK input; German-length labels (+30%) never break chrome; large numbers/currency/dates via `Intl` with locale; API 400/401/403/404/429/500 each render a specific state with a recovery action; double-submit prevented; offline/slow shows state; refresh mid-flow preserves input; concurrent edit conflicts explained.
- **Copy** is design material: labels name the action's outcome ("Save changes", "Delete 3 employees"); confirmations name the object + consequence and prefer undo; errors = what failed · why (when known) · what to do; loading names the operation; success is brief and only mentions consequences that change the next step; sentence case; no exclamation marks; consistent terminology (one noun per concept); translatable whole sentences.
- **Navigation**: current location always marked; back preserves scroll/filter/input; ≤5 top-level items or grouped; deep links to every key screen; destructive actions separated from nav; focus moves to main on route change.
- **Accessibility (WCAG 2.2 AA)** beyond axe: full keyboard operability incl. dialogs (focus trap, Esc, return focus); focus not obscured by sticky bars; target ≥24px; drag actions have a pointer/keyboard alternative; redundant entry avoided; accessible authentication (paste + password managers); no color-only meaning; live regions for async status; auto-rotating content stoppable; zoom 200% intact.

## 7. Design QA protocol (`design audit`) — independent, evidence-first

The reviewer is **not the builder**: fresh context, app source read-only, screenshots + scan + a
persona walk are the inputs; the builder's summary is never evidence.

1. **Capture validity first.** Settle motion (`prefers-reduced-motion: reduce`, wait for network idle + settle), full-page from the document top, every required viewport (desktop 1280×800, mobile 390×844, + the user's reported width when known), open every PNG and confirm it shows what its name claims (no blank/black regions, no half-loaded state, right route). A malformed capture invalidates the round → `RECAPTURE`; never score on broken evidence.
2. **Mechanical scan** — `node scripts/design-scan.cjs --url … --mode <mode> --design DESIGN.md --shots <run>/evidence/screens --out <run>/evidence/design-scan.json` on every primary route (authenticated ones via `--storage-state`); then `scripts/score-design.sh scan …` → `SLOP: N`, `SLOP_GATE`. Also run axe via Playwright for the WCAG rows.
3. **Heuristic critique** — score Nielsen's ten 0–4 (be honest: most real UIs land 20–32/40; a 4 is genuinely excellent; `na` only for heuristics the mode cannot apply, e.g. 7 and 10 on Persuade/Experience, renormalizing the max) with one **key issue** per row; run the **cognitive-load** eight (single focus · chunking ≤4 · grouping · hierarchy · one thing at a time · ≤4 visible options per decision · no working-memory bridge · progressive disclosure; 0–1 fails low, 2–3 moderate, 4+ high); write `design-critique.tsv` (`item kind score max note`; H1..H10 required). Where a `reason`-style blind panel is available, let two isolated assessors score before seeing the detector output — detector findings anchor judgment.
   Heuristic reminders: H1 status (feedback on every action, progress, current location) · H2 real-world language · H3 control/freedom (undo, cancel, back, clear filters) · H4 consistency (same control = same look everywhere) · H5 error prevention (confirm destructive, constrain input, autosave) · H6 recognition over recall (visible options, labels on icons, recents) · H7 flexibility (shortcuts, bulk, power paths) · H8 minimalist (every element earns its pixel) · H9 error recovery (plain, specific, actionable, preserves work) · H10 help (contextual, task-focused).
4. **Persona walk** — pick 2–3 by surface (dashboard/admin → Alex power user + Sam screen-reader/keyboard; forms/onboarding/checkout → Jordan first-timer + Sam + Casey one-thumb mobile; landing → Jordan + Riley stress-tester + Casey; data-heavy → Alex + Sam; add 1–2 project personas from the SRS stakeholders). Walk the primary task as each; report **specific red flags** (the exact element that failed them), never generic descriptions.
5. **Ledger** — every finding becomes a `design-defects.tsv` row (`id severity priority status test_id summary evidence`; severity critical|high|medium|low; priority P1–P4; evidence `evidence:<relpath>#locator` = the screenshot/scan line that proves it) — a `[rebuild]` tag in the summary when fidelity failed wholesale (wrong world, contradicted contract, imitation material). Map: P0 blocking (task impossible / a11y blocker) → critical · P1 major (WCAG AA fail, significant confusion, floor error) → high · P2 → medium · P3 polish → low. Structural repeats ("hard-coded colors in 15 components") are one systemic defect, not fifteen.
6. **Verdict** — `scripts/score-design.sh verdict design-defects.tsv evidence/design-scan.json DESIGN.md design-critique.tsv` → `DESIGN_VERDICT: SHIP | FIX | REBUILD`. Report the word verbatim; a table with open material findings is never announced as a pass. On a verdict pass after fixes, score each prior finding resolved / partial / unresolved against the **new** captures only (a claimed fix you cannot see is unresolved), name ≤3 regressions the fix batch introduced, and stop — no new hunt.
7. **Report** — `design-report.md`: mode + surfaces reviewed · captures (paths) · `SLOP` + rule table · Design Health table (10 rows + band) · cognitive-load result · persona red flags · P0–P3 findings with fix + evidence · what works (2–3, specific) · verdict. The report is the deliverable; the ledger is the backlog `--fix` / `fix` consume.

## 8. Remediation (`design --fix`) — the builder half, bounded

Runs only after an audit ledger exists; independence is preserved by role (audit never edits; fix
never re-scores its own work as `verified` — a re-audit does). Per iteration: read the ledger + git
log → pick the highest blocking item (order: task-blocking + a11y → missing states → flow/hierarchy →
floor tells → visual/motion consistency → cleanup) → **one slice** → `git commit -m "experiment:
design/<id> — <slice>"` before verify → recapture the affected routes + rescan → keep iff
`SLOP` did not rise, no ux acceptance row went red, regression floor `STABLE`, and the row's
evidence exists; else `git revert HEAD --no-edit`. Fix the cause at the narrowest correct level:
missing token → add to DESIGN.md + tokens; one-off implementation → shared component; conceptual
mismatch → say so and route to `design system --refresh` / redesign instead of smuggling one in;
local defect → fix locally. Never perfect one corner while the rest sits below the bar. Two rounds
is the unattended ceiling; a third needs the user's word.

## 9. Provenance

taste-skill (Leonxlnx, MIT): dials, design read, honest system map, hero/section/copy discipline, the
production tell list, redesign levers. impeccable (Paul Bakaus, Apache-2.0): visitor modes, Operate
depth, craft floor verify/refuse lists, deterministic detector rules (`imp:*` when installed),
critique (heuristics + cognitive load + personas), harden/onboard/clarify checklists, capture validity,
finish reviewer independence + dispositions, DESIGN.md spec usage. ui-ux-pro-max (nextlevelbuilder,
MIT): product-type reasoning, the 119 UX guidelines with WCAG 2.2 / Apple HIG / Material provenance,
archetype checklists (forms, navigation, charts, mobile). Standards: WCAG 2.2 AA, Nielsen's 10
heuristics, Cowan's working-memory limit, Core Web Vitals.
