# UI/UX skills assessment — taste-skill · impeccable · ui-ux-pro-max → what AutoForge adopted

Date: 2026-08-19 · Scope: the three GitHub repos below, read in full (SKILL files, references,
detector source, data catalogs), measured against AutoForge's actual build outputs
(`build-output/*` screenshots + `DESIGN.md`s), and distilled into `/autoresearch:design`
(v2.5.0). Result summary at the end.

| Repo | Version read | Shape | Size | License |
|---|---|---|---|---|
| [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | HEAD 2026-08-18 (`taste-skill` v2 experimental + v1 + 8 sibling skills) | 10 prompt-only `SKILL.md`s (1.2k lines main), 3 image-gen skills, a research folder | 60 files | MIT |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | 3.6.0 (2026-08-17) | 1 skill · 23 command references · 4 subagents · **59-rule deterministic detector** (regex / static-HTML / browser / visual engines) · live-browser variant mode · CLI + Chrome extension · 14 harness targets | 3.3k files | Apache-2.0 |
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 2.x (2026-08-19) | Python BM25 search over CSV catalogs (79 styles · 192 product palettes/reasoning rules · 74 font pairs · 119 UX guidelines · 105 icons · 17 GSAP presets · 25 chart types · 22 stack files) + `--design-system` generator + 6 sibling skills (design-system tokens, brand, slides…) | 660 files | MIT |

## 1. What each one is, honestly

### taste-skill — an opinionated aesthetic prompt for landing pages
- **Scope it declares:** landing pages, portfolios, redesigns. **Explicitly not** dashboards, data
  tables, wizards, product UI (§13). That is most of what AutoForge builds.
- **Structure:** brief inference (page kind, vibe words, references, audience, constraints) → a
  one-line "Design Read" → three dials (`VARIANCE` / `MOTION` / `DENSITY`) → an honest map from
  brief to real design systems (Material, Fluent, Carbon, Polaris, Atlassian, Primer, GOV.UK, USWDS,
  Radix, shadcn, Bootstrap, Tailwind — "install the official package, never re-create it") →
  directives (typography, color, layout, states, images, density, quotes, theme lock) → forbidden
  patterns ("AI tells", incl. a very long production-tested list) → a 60-box pre-flight checklist.
- **Strengths:** the sharpest catalog of *specific* AI tells anywhere (kicker/eyebrow rationing with a
  mechanical count, hero stack discipline, section-layout repetition cap, "no div-built fake
  screenshots", the premium-consumer palette ban naming the exact cream/oxblood/brass hexes, the
  em-dash ban, "no fake-precise numbers", copy self-audit); the design-system honesty map; the
  redesign protocol (audit before touching, what never changes silently — slugs, nav labels, field
  names, wordmark, legal copy); canonical GSAP skeletons for the two scroll effects models get wrong.
- **Weaknesses:** prompt-only, no verification tooling — every rule is "tick honestly"; contradictory
  across its own siblings (Inter banned in taste, allowed in brutalist; Fraunces/Instrument Serif
  banned in v2, recommended in stitch-skill's DESIGN.md); the "AI purple ban" and serif rules are
  taste stated as law; heavy Tailwind/Next/Motion stack assumptions; long-tail rules that only apply
  to marketing pages. Nothing on Operate-mode product UI, usability, states beyond a bullet, or
  a11y beyond contrast + reduced motion.

### impeccable — the engineered one
- **Scope:** every surface. Its founding move is the **visitor mode** — Persuade / Operate / Read /
  Experience — chosen per surface, gating every other rule (a tool's landing page is Persuade; its
  app is Operate).
- **Structure:** `context.mjs` boot → the one command reference that owns the request (23:
  init/document/extract/shape/critique/audit/polish/bolder/quieter/distill/harden/onboard/animate/
  colorize/typeset/layout/delight/overdrive/clarify/adapt/optimize/live) → **craft-floor.md** loaded
  right before editing UI (a *Verify* list — contrast, depth, spacing, type, motion, states, browser
  surfaces, copy, coverage — and a *Refuse* list of category defaults) → new-work's direction
  procedure (seven candidate worlds from the audience's actual culture, a dice-roll `concept-seed`,
  a decision page in the browser, comps via image generation, a **direction contract** written as the
  first HTML comment: THESIS · OWN-WORLD · STORY · FIRST VIEWPORT · FORM · FINISH) → build with full
  commitment → **finish reviewer** as a *separate agent with no browser and no builder context*
  returning one of four dispositions (`recapture` · `rebuild` · `fix` · `ship`) → **documenter**
  writing DESIGN.md *from the built world*.
- **The detector** is the standout: 59 deterministic rules (AI slop: side-tab borders, overused
  fonts, flat type hierarchy, gradient text, AI/cream palettes, nested cards, monotonous spacing,
  bounce easing, pulsing dots, glow/halo/spotlight, marquee, icon-tile stacks, italic-serif display,
  hero eyebrows, kickers, numbered section labels, em-dash saturation, buzzwords, aphoristic cadence,
  oversized h1, crushed tracking; quality: script errors, content hidden at rest, edge-flush cards,
  text occlusion, first-viewport column overflow, gray-on-color, low contrast (with a pixel-sampling
  visual fallback), layout-property animation, line length, cramped padding, viewport-edge text, tight
  leading, skipped headings, heading rhythm, justified text, tiny/undersized text, all-caps body, wide
  tracking, overflow, repeated container text, clipped popovers, **DESIGN.md drift for
  font/color/radius/font-size**). Runs as CLI, hook (per-edit + Stop deep pass), Chrome extension, or
  injected into a live page (`window.impeccableDetect`). Advisory tier never counts.
- **Strengths:** modes; Operate-mode depth (earned familiarity, one family, fixed rem scale,
  restrained color, all states, 150–250 ms motion, no page-load choreography, no modal-first, no
  reinvented affordances); the craft floor as a load-before-edit contract; **DESIGN.md as the
  google-labs spec** with normative YAML frontmatter (`colors`, `typography`, `rounded`, `spacing`,
  `components`) — machine-checkable; critique = Nielsen 0–4 + cognitive-load eight + five personas +
  P0–P3, run as *two isolated assessments* (LLM review before detector output — the detector anchors
  judgment); capture-validity discipline; the reviewer independence + disposition vocabulary; the
  harden/onboard/clarify checklists (long text, i18n, error codes, empty-state anatomy, copy that
  names what failed and how to recover).
- **Weaknesses:** heavy machinery (decision pages served in a browser, image-gen comps, live variant
  mode) that assumes an attended session and a specific harness; DESIGN.md written *after* the build
  conflicts with a pipeline that needs the tokens as an acceptance target *before* code; the
  overused-font rule fires on Inter/Geist even in Operate mode where its own operate.md says
  system/familiar faces are fine (mode-gating is left to the reader); the SKILL prose is dense and
  self-referential; Bun/Node 22 toolchain.

### ui-ux-pro-max — the catalog
- **Scope:** all platforms/stacks; "design intelligence" as searchable data.
- **Structure:** SKILL routes to `search.py` (`--design-system` for a new project, `--domain` for a
  concern, `--stack` for a framework); a priority table (accessibility → touch → performance → style
  → layout → typography/color → animation → forms → navigation → charts); `references/quick-reference.md`
  = 119 UX guidelines with **WCAG 2.2 / Apple HIG / Material provenance** (target size 24 px, focus
  not obscured, dragging alternative, redundant entry, accessible authentication, live-badge
  announcements, chip reflow, heading balance, cancellable transitions); `pro-rules.md` = mobile-app
  polish rules + a canonical pre-delivery checklist; sibling `design-system` skill with a
  primitive→semantic→component token architecture and two small validators (hard-coded hex/px in
  code; token compliance in slide HTML).
- **Strengths:** the guideline catalog's provenance and breadth (forms: error summary focused after
  submit, validate on blur, autofill, password toggle, autosave; navigation: back preserves state,
  ≤5 items, deep links, focus to main on route change; charts: legend/tooltip/table alternative/
  empty+loading+error); the product-type → pattern/style/palette/typography/anti-pattern reasoning
  (192 rows) as a starting point; stack files for 22 frameworks; the density dial rewiring the
  spacing scale.
- **Weaknesses:** everything routes through a landing-page frame — asked for a payroll bureau
  *operations dashboard* the generator returned "Trust & Authority + Conversion" with a hero →
  proof → CTA pattern and "Calistoga / Inter"; palettes are the shadcn slate/blue family with a
  descriptive name; BM25 over CSVs is retrieval, not judgment (no verification, no browser); Python
  dependency; the "premium" split leaves the token/brand tooling thin; slides/logo/CIP scope is
  noise for this pipeline.

## 2. Measured against AutoForge's own outputs

Real screens from `build-output/` — all of which passed the mechanical `ux` gates (axe, responsive,
tokens conform):

| Build | What the screenshot shows | Which catalog names it |
|---|---|---|
| ph-payroll-bureau dashboard | cream page ground, oxblood accent, three identical stat tiles (uppercase kicker + big number), emoji nav glyphs (👥📋🧾⚙️), "Welcome back — Acme Manufacturing Inc." (em dash + placeholder tenant name + repeats the header), 60 % dead space | taste §4.2 premium-consumer palette ban (cream + oxblood *exactly*), §4.7 eyebrow restraint, §9.G em-dash, §9.D "Acme"; impeccable `cream-palette`, `kicker-above-heading`, hero-metric refuse item, `repeated-container-text`, glyph-icons refuse item; ui-ux-pro-max `no-emoji-icons` |
| fireworks-pos checkout | clean shadcn defaults, emoji logo, empty-state card *inside* the cart card, an 80 %-empty product panel (no product grid / keypad / scanner-first entry) | impeccable `nested-cards`, "never ship shadcn in default state" (taste §2.A / §9.E); no POS archetype anywhere in the pipeline |
| hanai-intake landing (from a Stitch export) | eyebrow "WHAT HAPPENS NEXT", section numbers 01/02/03, decoration strip "NO AGILE BLOAT. JUST EXECUTION.", three identical process cards, footer "HANAI — WELL ALIGNED", left column dead below the fold at desktop; Space Grotesk + Inter | impeccable `numbered-section-labels`, `aphoristic-cadence`, `first-viewport-column-overflow`, `overused-font`; taste §9.C three-equal-cards ban, §9.F decoration text strip + em dash |
| root `DESIGN.md` (Stitch "Industrial Utilitarian") | 47 colors, 9 type roles, **no motion, no component states** | fails the new `score-design.sh lint` — exactly the groups the checklist demanded but nothing verified |

Conclusion: the pipeline verified the *floor* (contrast, labels, viewports, token equality) and
nothing about *tells* or *usability*. The gap was measurable — and two of the three skills already
knew how to measure it.

## 3. Adoption matrix

| Idea | Source | Verdict | Where it landed |
|---|---|---|---|
| Visitor modes gate rules; Operate depth | impeccable | **Adopt** | protocol §1, `design.mode` in the spec, `--mode` in the scanner (rules fire warn in Persuade, advisory in Operate) |
| Deterministic slop/quality detector | impeccable (59 rules) | **Adopt + re-implement** the mechanical core in `design-scan.cjs` (Playwright, ~40 rules, no new deps); **use the original as a superset** when a project has it (`--engine both`) | `scripts/design-scan.cjs`, `score-design.sh scan` → `SLOP_GATE`, `design:floor` coverage row |
| DESIGN.md as the google-labs spec with normative frontmatter | impeccable / DESIGN.md spec | **Adopt**; lint it mechanically incl. computed contrast pairs; keep AutoForge's *tokens-before-code* order and add `--refresh` from the built world at finish | protocol §4, `score-design.sh lint`, build Phase 4 gate |
| Craft floor: Verify list + Refuse list, loaded before editing UI | impeccable | **Adopt** (merged with taste's tell list) | protocol §5, build Phase 5.6 |
| Independent finish review with dispositions | impeccable | **Adopt** as `design audit` (app source read-only) with `SHIP \| FIX \| REBUILD` (+ `RECAPTURE` for evidence) — the same independence model as `test` ↔ `fix` | design.md, `score-design.sh verdict` |
| Critique: Nielsen 0–4 + cognitive-load 8 + personas + P0–P3, detector-after-judgment | impeccable | **Adopt**; ledger validated by `score-design.sh critique`; subjective health never gates on its own — only bands Poor/Critical force `REBUILD` | protocol §7, `design-critique.tsv` |
| Capture validity (settle motion, full page, open every PNG, blank = recapture) | impeccable + prior AutoForge lesson (dino3d overlay) | **Adopt** | protocol §7.1, design.md Phase 1 |
| Direction procedure: audience's world, seven candidates, dice roll, contract comment, standing exit | impeccable | **Adopt lightly**: `score-design.sh seed` (sha256 of the brief mod n, reproducible), the contract comment, the standing exit only when a human is present; **reject** decision pages / comps / live mode (attended-only machinery) | protocol §3, design.md `system` |
| Brief inference → Design Read; dials; honest design-system map | taste-skill | **Adopt** | protocol §3.1–3.4 |
| The tell lists (hero stack, eyebrow count, section repetition, fake screenshots, premium palette, em-dash, generic names/numbers, decoration strips, scroll cues, version stamps) | taste-skill (+ impeccable) | **Adopt** as Refuse items; the mechanical ones become scanner rules (kicker count vs sections, em-dash in UI copy, generic copy, hero fits viewport, oversized h1, section repetition) | protocol §5, `design-scan.cjs` |
| Redesign protocol (audit first; what never changes silently) | taste-skill | **Adopt** | protocol §3.10, `--fix` safety invariants |
| Serif/Inter/purple bans as absolutes | taste-skill | **Reject as law, keep as calibration**: mode-gated ("Inter is fine in Operate"), phrased as "already spent unless the brief names it" | protocol §3.6–3.7 |
| GSAP skeletons, image-generation skills, brand kits | taste-skill | **Reject** (out of scope for a build pipeline that must be unattended and stack-agnostic) | — |
| 119 UX guidelines with WCAG 2.2/HIG/MD provenance; forms/navigation/charts checklists | ui-ux-pro-max | **Adopt** as archetype required patterns → `ux` acceptance rows | protocol §2, §6, uiux-checklist §2–3 |
| Product-type → pattern/style/palette reasoning | ui-ux-pro-max | **Adapt**: the *idea* (surface archetypes with required patterns) without the landing-page frame or the CSV/BM25 dependency | protocol §2 |
| Design dials rewiring spacing scale by density | ui-ux-pro-max / taste | **Adopt** (dials in the protocol) | protocol §0/§1 |
| Token validators (hard-coded hex/px scan) | ui-ux-pro-max design-system | **Superseded** by live computed-style drift checks against the DESIGN.md frontmatter (`design-*-drift`) | `design-scan.cjs --design` |
| Python search tool, slides/logo/CIP/brand generation | ui-ux-pro-max | **Reject** (dependency + scope) | — |
| Orchestrator routing for "make the UI look professional" | AutoForge gap | **Add** `polish-ui` archetype → audit → `--fix` → regression | `orchestrate.sh classify`, routing reference |

## 4. What AutoForge now has (v2.5.0)

- **`/autoresearch:design`** (19th command): `system` · `audit` · `--fix` — see `guide/autoresearch-design.md`.
- **`references/design-protocol.md`** — the distilled contract (modes, archetypes, direction protocol,
  DESIGN.md schema, craft floor + rule table, states/hardening/onboarding/copy, design QA, remediation).
- **`scripts/design-scan.cjs`** + **`scripts/score-design.sh`** — the mechanical seams; the fixture pair
  `tests/fixtures/design/{slop,clean}.html` proves the floor fires on the tells and stays quiet on a
  clean Operate page (0 counted findings) — `tests/test-design.sh`, 177 asserts.
- Wired into `build` (Phase 4/5/6 + convergence), `feature`, `requirements`, `test`, the orchestrator,
  handoff schema, manifests and every distribution tree.

## 5. Open ends (deliberately not done)

- The scanner's contrast rule is *approximate* (nearest opaque background; images/gradients skipped) —
  axe remains the WCAG authority; the two overlap by design.
- Kicker detection is a heuristic (small + uppercase + tracked block directly above a heading);
  legitimate table/status labels can trip it — waive with `--ignore kicker-label` and a recorded reason.
- Heuristic critique remains a model judgment written into a ledger; the seam validates shape and
  band, not truth. A `reason`-style blind panel is recommended in the protocol, not enforced.
- Image-generation-driven comps and impeccable's live variant mode were left out on purpose; if a
  future run wants comp-led builds, `visualize.md` in impeccable is the reference to port.
- No auto-install of the impeccable package: it is picked up when the project has it (Apache-2.0),
  never pulled in silently.
