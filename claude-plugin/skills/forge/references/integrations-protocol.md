# Integrations Protocol — assets, native image tools, design bridge, tracker sync

Companion to `build` / `feature` / `design` / `requirements` / `test` / `fix`.
Asset management covers scoped images, icons and UI motion whether generation is available or
not. Generative media uses **Codex-native image tools first for raster work**, then available media
MCP tools. The other optional families are the Figma-class design bridge and Linear-class tracker.
All integrations are **availability-gated**; record a named fallback when absent. Required acceptance
rows remain unmet until their actual requirements are satisfied. Existing workflow gates still apply.

## 0. Doctrine — detect, gate, degrade, record

| Family | Capability probe (tool shape, not server name) | Fallback when absent |
|---|---|---|
| **Media** | Session-native `image_gen` / `imagegen` for raster creation/edits; media MCP generation tools for each supported kind | Reuse verified assets, licensed sources, code-native vectors/motion, then named optional placeholders |
| **Design bridge** | Design context, variables and screenshot tools | `Design:` catalog / file / `generate`; an unreadable Figma URL is an unreachable source |
| **Tracker** | Issue/project tools | GitHub issues on the output repo |

- Probe once per run using session tool discovery. A server that fails to load is absent. A shell
  doctor cannot establish whether a session-native image tool exists; never gate it on MCP presence.
- Record observed capabilities in run-local `integrations.json`: native image availability, media
  MCP kinds, chosen provider and reason, enabled status, budget/spent, tracker choice and bridge.
  Do not infer video, audio or 3D support from an image tool.
- **Availability is not approval.** A scoped generation need or mode-required imagery arms the
  bounded media pass; mere tool detection does not. Honor existing user authorization. An API key
  alone does not authorize an API fallback or a switch away from an explicitly requested provider.
- Keep actual receipts and report attempts/cap. Report model, service job ID, balance and cost as
  unknown when the tool does not expose them; do not invent values or require a native balance API.
  Tracker and outbound design writes retain their arming rules below.

## 1. Assets and media — one lifecycle in every workflow

### 1.1 Scope and provider selection

Read the brief, `DESIGN.md`, existing assets and icon imports first. Preserve client brand assets;
do not fabricate likenesses or regenerate third-party work to disguise its source. For an asset slot:

1. Reuse an approved, locally verified asset or the project's existing icon family.
2. Use SVG/code for icons and diagrams; CSS or the Web Animations API for UI interaction motion.
   Keep one icon family, stroke and size system. A generated raster cannot claim to be SVG.
3. For raster generation/editing, prefer the available **Codex-native image tool**, following the
   installed imagegen skill and the current tool schema. Next use a media MCP supporting that kind.
   Use an API generation path only when explicitly chosen/authorized; never silently switch providers.
4. Use licensed sources or procedural assets where suitable. An optional placeholder must name its
   reason; a required image/animation remains a failing acceptance row even during an outage.

Video loops, 3D and audio arm only when explicitly scoped and a matching provider exists. An
Operate screen needs no decorative hero just because a generator is present. `Assets: off` disables
new generation; it does not disable local asset checks, checked reuse, icons or CSS motion.

The shared, read-only selector is `node scripts/asset-check.cjs select <request.json>`:

```json
{
  "kind": "image", "required": true, "existing": null,
  "budget": { "jobs": 12, "spent": 0 },
  "capabilities": { "nativeImage": true, "mediaMcp": [], "apiImage": false },
  "apiApproved": false, "requestedProvider": "auto"
}
```

Supply observed booleans and MCP kinds, not guesses. `existing`, when supplied, contains
`approved`, project-relative `path`, and an actual checked `sha256`. Kinds include `image`, `svg`,
`icon`, `diagram`, `ui-motion`, `font`, `video`, `audio`, `model`, `data`; explicit providers are
`codex-native`, `media-mcp`, `openai-api`, or `auto`. Output action is `reuse`, `code`, `generate`,
`placeholder` or `blocked`, with provider and reason. This command never invokes a provider.

### 1.2 Plan and budget before any job

Write project-local `assets/manifest.json` and a concise `assets/PLAN.md` view: slot, route/selector,
subject, dimensions/aspect, required/optional, reuse decision, provider, candidate count and byte caps.
Default cap: **12 generation jobs** per engagement (`Assets: N` overrides). Start with one candidate
per slot unless the brief needs variants. Count **every attempt**, including retries, edits, failures
and rejected candidates; record pending before dispatch, then its real terminal outcome. Never
launch work beyond the remaining cap. Check account balance only if the chosen tool exposes it.

On resume, keep the existing manifest, receipts and spent count. Do not reset the cap, erase failed
jobs or re-roll approved assets. `Assets: off` on a resumed engagement sets the selector's job budget
to `off` while retaining the manifest's historical budget/receipts. A new manifest whose budget is
`off` permits zero generation jobs; it can still hold authored/sourced assets.

### 1.3 Prompt, execute, inspect

Store the DESIGN.md style contract and per-slot instructions in `assets/PROMPTS.md`: subject,
composition, aspect, materials, scene light, actual colors, text and preservation constraints.
Generic adjectives do not substitute for the brief. Use real reference files when editing; inspect
local references first and follow the tool's reference mechanism. Do not invent tool parameters,
model names, edit capabilities or provider job IDs.

For Codex, call the available native `image_gen` / `imagegen` tool directly. Follow its actual output
contract: **copy the generated file into the target project**, retain the original when instructed,
then inspect the copied raster before approving it. An image displayed in chat or saved only in a
global generator directory is not a delivered application asset. Reject artifacts, wrong subject,
unwanted text, watermark traces or a crop that misses the slot's purpose. If the provider exposes no
job ID, assign an explicitly local receipt ID tied to the observed tool result; record model as null.

### 1.4 Delivery

Reuse dedicated edit/cutout/reframe/upscale tools only when available and needed; extra attempts
still count. Prefer slot-sized WebP/AVIF for photos, PNG for transparency or a justified fixture,
SVG for true vectors; never rename an extension to claim conversion. Set intrinsic dimensions,
responsive sizes/srcset where useful, informative alt text or decorative empty alt, and eager/lazy
loading by placement. Verify actual image decoding and layout in the browser, including mobile.

Videos need a poster, muted playback where appropriate, controls/pause when required, and a reduced
motion alternative; audio and 3D keep their scoped formats and loading rules. No file ≥50 MB in git;
specify project-specific file, total shipped and initial-payload budgets. The checker measures local
file/total bytes; a separate `devops` row measures initial network payload from the running build.

### 1.5 Machine-readable inventory

`assets/manifest.json` **version 1** is the single inventory. PLAN/CREDITS are readable views;
PROMPTS stores generation instructions. Example empty inventory (create its declared runtime root):

```json
{
  "version": 1,
  "assetRoots": ["public/assets"],
  "budget": { "jobs": 12, "maxFileBytes": 2500000, "maxTotalBytes": 5000000 },
  "jobs": [], "assets": [], "motion": []
}
```

| Record | Required fields and meaning |
|---|---|
| Asset | Unique `id`; `kind` = image/svg/font/video/audio/model/data; `state` = planned/generated/approved/rejected/blocked; boolean `required`; nonempty `usage` of `{route, selector}` |
| Delivered file | Project-relative POSIX `path` inside a declared `assetRoots` directory, actual `bytes` and SHA-256 `sha256`, `loading` eager/lazy. Every runtime file under those roots must be registered; links may not escape the project |
| Image/SVG | Positive `width`/`height`, boolean `decorative`, `alt` (empty only when decorative). SVG and raster kinds must match their actual format |
| Authored source | `source: {type: "authored", creator, license}` using actual ownership/license |
| Sourced source | `source: {type: "sourced", creator, license, url}` with source URL and any required attribution rendered in the app |
| Generated source | `source: {type: "generated", provider, model, receipt, prompt}`; model is an exposed name or null, receipt refers to a job, prompt is a nonempty project file (optional section anchor) |
| Job | Unique `id`, `status` pending/complete/failed/cancelled; retain provider/tool and the actual result or local receipt pointer when available |
| Optional unfinished slot | May omit path only while unapproved and `required: false`; retain its `reason` and intended usage |
| Replacement | `replacement: {previousSha256, defect}` or `{previousSha256, request}` names the old approved hash and the authorized reason |

Required slots must be approved to pass; approved generations need completed receipts. A planning
manifest with unresolved required slots is intentionally not delivery-valid. During requirements or
design planning, emit failing future acceptance rows instead of pretending the application is built.

### 1.6 UI motion and browser evidence

Implement normal/reduced behavior together. Prefer transform/opacity for brief state feedback;
preserve keyboard focus, content and the task when motion is suppressed. No blanket animation-off
rule that leaves the result hidden. Avoid decorative page-load motion on Operate surfaces.

Each bounded CSS/Web Animation has a manifest `motion` record:

```json
{
  "id": "details-reveal", "route": "/", "selector": "#details",
  "trigger": { "type": "click", "selector": "#toggle" },
  "properties": ["transform", "opacity"], "maxDurationMs": 500,
  "essential": false, "reduced": "none"
}
```

Triggers: click/hover/focus with a selector, or load. Route is a pathname or full URL; omitted means
all scanned routes. Duration is a positive ceiling ≤60000 ms. Reduced behavior is `none`, `opacity`
or `preserve`; preserve requires a justified `essential: true`. The scan triggers each record in
fresh `no-preference` and `reduce` contexts at every applicable viewport. It requires the declared
normal properties, enforces reduced behavior and duration, and fails on trigger/runtime errors.
With `--shots`, it records captures after settling. Motion always reruns even with `--prev`.

This seam observes bounded CSS/Web Animations, not canvas, custom JS frame loops or full product
semantics. Those need application-owned tests. The `design:motion` row also asserts the actual task
outcome and focus by keyboard in both preferences, with normal/reduced captures opened and checked.
Essential continuous media needs its own pause/control tests; a frozen screenshot is not proof.

### 1.7 Completion gates in the existing workflow

From the target project, with `AR_ROOT` resolved by the command's existing seam rules:

```bash
node "$AR_ROOT/scripts/asset-check.cjs" check . --previous "<run>/assets-before.json"
bash "$AR_ROOT/scripts/score-design.sh" assets . > "<run>/evidence/assets.json"
node "$AR_ROOT/scripts/design-scan.cjs" --assets . --url http://localhost:3000/ \
  --viewports 1280x800,390x844 --design DESIGN.md --shots "<run>/evidence/screens" \
  --out "<run>/evidence/design-scan.json"
bash "$AR_ROOT/scripts/score-design.sh" verdict "<run>/design-defects.tsv" \
  "<run>/evidence/design-scan.json" DESIGN.md "<run>/design-critique.tsv" .
```

Omit `--previous` on first adoption; snapshot the approved manifest before any resumed work.
Checker stdout is JSON; exits: 0 valid, 1 unmet, 2 unreadable/usage. Run it fresh before accepting
delivery. `--assets` binds capture fingerprints to validated manifest/content hashes; same-size file
changes invalidate cached evidence. The optional fifth verdict argument reruns the asset gate and
requires both motion profiles with matching manifest evidence at every scanned applicable viewport.
Existing projects without a scoped manifest retain the legacy command forms and gates.

Map proof into the existing six dimensions: `ux` for images/icons/motion and task outcomes,
`hardening` for provenance, `devops` for file and payload budgets. Retain all seven design coverage
tags, SLOP_GATE, lint, axe and regression checks. Tool outage or a pending job never turns a required
row green. Record providers, attempts/cap, kept assets, failed/optional slots and proof paths in the
summary and optional handoff `assets` object.

### 1.8 Provenance + pinning

Every kept file appears in `assets/CREDITS.md` with source/creator/license or generated provider,
actual receipt, prompt pointer and date. **Approved assets are pinned** by path and SHA-256.
`fix`, `design --fix` and feature resumes use `check --previous`; replacements require a named
defect or explicit request and the previous hash. Required slots cannot disappear or become
optional to pass. Preserve existing icon families and do not spend on unchanged approved media.


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
- **Failures retain acceptance truth.** Record failed media attempts and select a suitable fallback
  within the remaining cap. Optional slots may use named placeholders; required slots stay unmet
  until delivered. Continue independent work and report BLOCKED when an unmet requirement cannot
  proceed. Tracker/bridge failures retain their named fallback and are reported in the summary.
