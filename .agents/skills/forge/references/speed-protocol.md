# Speed protocol — fast by default, accurate by construction

Applies to `test`, `fix`, `design`, and the Playwright sweeps inside `build` / `feature`. The slow
runs were not slow because they verified too much — they verified the **same fact twice**, opened
**every capture as an image**, ran the **whole suite for a one-file change**, and narrated. This
protocol removes the repeats and keeps every gate. **Nothing here lowers a threshold, skips a gate,
or accepts a row without evidence.** `--thorough` restores the exhaustive form of every rule marked
↺ — use it for a final release audit, or whenever a fast-path result is contested (re-run, never
argue).

## 0. Two rules everything else follows from

- **Verify once per fact.** A fact = (artifact, commit, viewport/state). Evidence carries the commit
  it was produced at (`evidence/<name>@<sha7>.<ext>`, or an `@sha <sha7>` line in the file header);
  the same fact at the same commit is **cited, never re-produced**. Cross-run reuse is allowed —
  `design` cites a `test` run's captures for the same commit — and the citation names the file.
- **Cheapest sensor that can catch it.** Unit/API before browser; the mechanical scan before the
  model's eyes; the touched suite before the full suite; a text log before a screenshot; a contact
  sheet before individual images.

## 1. Cadence — what runs per slice, at a checkpoint, once per run

| Verification | Per slice (every iteration) | Checkpoint / gate | Once per run |
|---|---|---|---|
| Unit / integration | the **touched suite**: tests related to the changed files + rows tracing to the same FR/NFR (`vitest related`, `jest --findRelatedTests`, `pytest <paths>`), fail-fast | **full Guard** — every 5 kept slices, before any PR opens, before COMPLETE / DONE / a verdict | — |
| Browser (Playwright) | only the routes the slice touched | axe over the changed routes | the **full route list** (first sweep) |
| Captures + floor scan | `design-scan.cjs --prev <last scan.json>` → unchanged pages are **reused**, not re-shot | contact sheet of what changed | contact sheet of everything |
| Load / perf | — | one bounded run (30–60 s) at the declared concurrency | — |
| Seams (`pass-rate`, `defects`, `scan`, `verdict`, `exit-criteria`) | once per slice, every output line parsed from that one run | once | once |

A full-Guard failure at a checkpoint **bisects the kept batch**: revert the newest kept slice, re-run
the touched suite, repeat until green, then re-queue the reverted items. No slice is reported as
kept in a COMPLETE run that the full Guard has not covered. ↺ `--thorough`: full Guard per slice.

## 2. Captures — the eyes are the expensive sensor

- **One sweep, one session.** `design-scan.cjs` (captures + craft floor + DESIGN.md conformance)
  and axe run over the **same route list in the same Playwright session** — never three separate
  crawls. The app is booted **once per run** (pidfile), never per slice.
- **Contact sheet first.** `design-scan.cjs --shots evidence/screens --sheet evidence/screens/sheet.png`
  renders every capture as a labelled, top-cropped cell (route @ viewport · counted findings ·
  `reused`). Open the sheet — one image — to validate captures (right route, no blank/black region,
  no login wall, no half-loaded state) and to read the look. Open an **individual PNG only when**:
  its cell or the scan flags it (`page-unreachable`, `http-error`, `console-error`,
  `horizontal-overflow`, a blank/black cell), a defect is being filed against it (evidence must be
  seen before it is cited), or the slice under review touched that route. ↺ `--thorough`: every PNG
  opened individually.
- **Delta re-scans.** `--prev <previous design-scan.json>` reuses every page whose fingerprint
  (DOM + stylesheet text + resource sizes at that viewport) is unchanged — its findings and its
  screenshot are cited from the previous scan. `--fix` re-verification and the verdict pass are
  **delta audits** over the changed pages; the untouched pages' evidence is identical by
  construction. A fingerprint that differs for a volatile reason (timestamps, nonces) only costs a
  recapture — the failure direction is always "verify again", never "assume". ↺ `--thorough`:
  recapture everything.
- **States** (empty / filled / error / success / loading) are captured for the **primary flow**;
  other surfaces' states are covered by the archetype rows and the scan's state checks.
- **Viewports:** 1280×800 + 390×844 always; 768×1024 and the user's reported width only when the
  surface is tablet-heavy or a width was actually reported. Never add a viewport "to be safe".

## 3. Judgement passes — every lens in one pass

- The heuristic critique (Nielsen 10 + cognitive-load 8) and the persona walk are produced **in one
  pass from the same evidence** (scan JSON + contact sheet + one keyboard walk): walk the primary
  task once with keyboard + reduced motion, record every failure with its element, then attribute
  the flags per persona. No per-persona re-walk, no blind assessor panel — unless ↺ `--thorough` or
  the design bar (`Bar: full`) names the panel.
- Directions (`design system`): the 5–7 candidates go in a **table** (thesis · palette strategy ·
  type · material · first viewport · signature interaction · honest risk), one row each; only the
  rolled direction is expanded into prose.

## 4. Test engagements

- **Harvest before you write.** Run the Target's own suite first; a passing existing unit/API test
  **is** the execution of the designed case it covers — cite it (`evidence:unit@<sha7>.txt#<name>`),
  never rewrite it. Write new automated cases only for designed cases nothing covers, **one batch per
  area**, then run the batch once.
- **Intake by structure.** Read the route table / router, the schema, the SRS and the existing test
  layout — not every source file. Source is read when a case is designed against it.
- **Exploratory sessions** end at the **findings plateau** (two consecutive probes with no new
  Problem / Question / Idea) or the timebox, whichever comes first; one session sheet per area.
- **Defect-report depth follows severity.** Full 29119 incident anatomy for critical/high; medium/low
  carry the ledger row plus a 3-line repro (steps · expected · actual) and the evidence file. Every
  defect still has a repro and an evidence file — depth changes, the rule does not.
- Compatibility = the pairwise-reduced matrix scaled to what the product serves; perf = one bounded
  run at the declared concurrency; a green NFR pass is never repeated within the same run.

## 5. Fix engagements

- **One slice = one root cause**, which may close several ledger rows: cluster defects that share a
  root cause (same failing function, same missing guard, same token) and fix at the **shared
  caller** — the ladder's rule (one guard where every caller routes through). Each DEF row still
  gets its own red → green repro evidence and its own status change.
- **The repro becomes the regression test once** — on first reproduction, script it as an added
  test or probe; every later verification runs that, never the manual steps again.
- **Root cause from the evidence first.** Grep the callers and read the touched code before
  reaching for `debug`'s hypothesis loop; the loop is for causes the red evidence does not show.
- **Tracker rounds are batched.** A push per kept fix stays (cheap, recoverable); issue comments
  post in one pass when the PR opens (or on abort) — same content per defect, one network round.
- In **error mode** the `Target` command is the metric and runs per slice as before; the cadence in
  §1 governs the separate `Guard`.

## 6. Narration and tokens (the ponytail mechanics, restated)

Read each file once; ranges past ~300 lines; never paste a full log or file into the transcript —
tee to `evidence/`, read the tail and the failing lines; batch independent commands; narrate the
phase and the gate, not the keystrokes; the `iterations.tsv` line is the explanation
(`[change] → skipped: X, add when Y`, three lines per slice).

## 7. What the fast path never touches (accuracy invariants)

Thresholds and gates (`Target-rate`, `SLOP_GATE`, zero unresolved critical/high, coverage 1.00,
axe zero serious/critical), the evidence rule (no `pass` without a file the scorer can open), the
independence rules (`test` never fixes, `fix` never verifies, `audit` never edits), the iron law
(root cause before fix, no weakened tests), the repro-per-defect rule, security and accessibility
checks, capture validity (`RECAPTURE` on a malformed capture), the full Guard before COMPLETE / a PR
/ a verdict, the requirement-satisfaction audit, and anything the user or the spec explicitly
requests. `--thorough` is the escalation path; silence is not.
