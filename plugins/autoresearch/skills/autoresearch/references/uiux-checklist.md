# UI/UX Checklist — the `ux` acceptance dimension

UI/UX is a first-class, weighted acceptance dimension (`ux`, weight 0.20). A working-but-ugly or
inaccessible app is capped, never "done". The design system is a committed **`DESIGN.md`** (Google
DESIGN.md spec; reference catalog at getdesign.md / `awesome-design-md`) — the single source of UI
tokens the app is built from and verified against. The build mode designs the interface in SDLC Phase 4
(Design) and verifies it in Phase 6 (Testing) — e2e + accessibility run against the **running** app
through gstack `/browse` when gstack is installed (the preferred driver — see `doctor.sh`);
Playwright is the supported fallback when it is not.

## 1. Design system (Phase 4 artifact)

- [ ] **Typography** — a defined type scale (sizes/weights/line-height), max ~2 families
- [ ] **Color** — palette with semantic roles (bg/fg/primary/danger/success); every text/bg pair meets
      WCAG contrast (≥ 4.5:1 body, ≥ 3:1 large)
- [ ] **Spacing** — consistent spacing scale (e.g. 4px base); no magic one-off margins
- [ ] **Motion** — transitions defined + `prefers-reduced-motion` honored
- [ ] **Component states** — every interactive surface specifies **loading / empty / error / success**

## 2. Responsive

- [ ] Layout works at mobile (~375px), tablet (~768px), desktop (~1280px) — no horizontal scroll, no overlap
- [ ] Tap targets ≥ 44px; content reflows rather than truncating

## 3. Accessibility (WCAG 2.1 AA)

- [ ] Every input has a programmatic **label**; images have alt text
- [ ] Full **keyboard** operability; visible **focus** indicator; logical focus/tab order
- [ ] Correct semantics / **aria** roles; landmark regions
- [ ] **axe** scan (via `/browse`) reports zero serious/critical violations
- [ ] Color is never the sole carrier of meaning

## 4. End-to-end user flow

- [ ] The primary flow works click-by-click in a real browser via `/browse` (e.g. add a todo → see it →
      complete it → reload persists)
- [ ] No console errors during the flow
- [ ] Empty and error states render correctly when exercised (no data; failed request)

## 5. Polish (anti-slop)

- [ ] Visual hierarchy is clear; alignment + spacing are consistent
- [ ] Interactions feel responsive (perceptible feedback < 100ms; no layout shift on action)
- [ ] No placeholder lorem, no default-framework "unstyled" look, no clashing ad-hoc styles

## 6. DESIGN.md conformance

- [ ] A `DESIGN.md` is committed (adopted from the getdesign.md / `awesome-design-md` catalog, a
      file/URL, or generated via gstack `design-consultation`).
- [ ] App style tokens (color, type scale, spacing, radius, motion) are **derived from** `DESIGN.md` —
      not improvised.
- [ ] Live computed styles **match** the `DESIGN.md` palette + type scale (checked via `/browse`); no
      off-system "slop" colors/sizes.
- [ ] Component states (loading / empty / error / success) follow the `DESIGN.md` patterns.
- [ ] gstack `/design-review` run on the live app — visual-consistency + slop issues fixed.

This is a **mechanical** check (token set ↔ rendered values), so `design-conformance` is a real `ux`
acceptance assertion the build loop keeps/discards against, not a matter of taste.

**Design coverage (no orphan tokens).** Each DESIGN.md token group is a stable trace tag the build's
`ux` acceptance rows must reference, so nothing in the design is left unbuilt:
`design:type` · `design:color` · `design:spacing` · `design:radius` · `design:motion` ·
`design:states`. `scripts/score-build.sh coverage` computes `DESIGN_COVERAGE` = groups traced by ≥1
`ux` row ÷ total groups; the Phase 4 gate and convergence both require `1.00`. Add the matching tag to
each `ux` assertion's `traces` (TSV col 7); an unmapped group fails the gate.

## Scoring

Declare `ux` assertions in the spec's `acceptance.ux` block (responsive, a11y/axe, e2e flow, states,
design-system). The scorer (`score-build.sh pass-rate`) weights `ux` at 0.20 and renormalizes over the
dimensions that ran; `score-build.sh coverage` separately requires every `design:<group>` tag to be
traced by a `ux` row (`DESIGN_COVERAGE == 1.00`). Mark an assertion `skip` only when genuinely not
applicable — env-limited checks
(no browser) should be run on a host where `/browse` is available rather than silently skipped, and any
skip is reported, never hidden.
