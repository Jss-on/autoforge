# Game & Asset-Heavy Build Protocol

Companion to `/forge:build` / `feature` for targets whose value lives in **assets** — games
first (sprites, tilemaps, models, audio, fonts, animations), but equally media-heavy sites, map apps,
and data-viz with large bundled datasets. The six-dimension acceptance model applies unchanged; this
protocol pins the four places asset-heavy builds fail differently.

## 1. Asset sourcing ladder (in order — licensing is a gate, not a vibe)

1. **CC0 / public-domain packs first.** Kenney.nl (CC0, thousands of coherent sprites/tiles/audio/UI),
   OpenGameArt + itch.io filtered to CC0, Google Fonts (OFL), CC0 sections of freesound/Pixabay.
   A coherent pack beats mixed sources — one art style, one license, done.
2. **Procedural / code-generated.** SVG or canvas-drawn sprites, generated tilemaps, WebAudio-
   synthesized SFX (jsfxr-style), CSS/JS particle effects. Tiny, license-free, deterministic, and
   restylable — prefer this for UI chrome, effects, and placeholder-to-final pipelines.
3. **CC-BY only with the attribution actually rendered** — in-game credits screen + `CREDITS.md`,
   not a dead file.
4. **NEVER:** ripped/extracted assets from shipped games, "found on Google" images, marketplace
   assets without a purchase the client made, fonts without a license file. An asset with unknown
   provenance is a defect, not a freebie.

**License ledger (mandatory):** `assets/CREDITS.md` — one row per asset/pack: file(s) · source URL ·
author · license · attribution-required? The hardening dimension gets one acceptance row asserting the
ledger exists and covers every file under `assets/` (a script can diff the tree against the ledger).

## 2. Repo & size discipline (the output-repo contract still applies)

Every build ships to its own GitHub repo — asset bloat breaks that contract fast.

- **Hard rules:** no single file ≥ 50 MB in git (GitHub warns at 50, blocks at 100); repo total
  target ≤ 300 MB. Source files (`.psd`, `.blend`, `.wav` masters) stay OUT of git — commit the
  exported runtime formats only.
- **Runtime formats:** images → WebP/PNG-8 (atlas-packed), audio → OGG/M4A (never WAV in the
  bundle), models → glTF/GLB (Draco-compressed when large), fonts → WOFF2 subsets.
- **Budgets are acceptance rows, not aspirations:** initial payload to first playable frame
  ≤ ~5 MB (loading screen with real progress after that), total shipped assets budgeted in the spec.
  A `devops` row asserts the built bundle is under budget — mechanically, from the build output.
- **When assets legitimately exceed limits:** Git LFS (declare in `.gitattributes` BEFORE the first
  large commit — LFS-migrating history later is the visionseek purge all over again), or a
  fetch-at-build script for public packs (URL + checksum pinned; the repo stays reproducible).
- **Atlas + manifest:** pack sprites into atlases; ship an asset **manifest** (path, type, bytes,
  hash, preload-vs-lazy). The manifest is what the loading screen, the budget row, and the license
  ledger diff all read — one source of truth.

## 3. Determinism & testability (canvas is opaque to Playwright — design around it)

A canvas/WebGL game shows Playwright one big pixel rectangle. Untestable games rot; build the seams
in from slice one:

- **Seeded RNG everywhere.** One injectable PRNG (seed in the URL/query or test hook), never bare
  `Math.random` in game logic. Same seed → same run — this is what makes golden vectors and replay
  tests possible.
- **`window.__game` test API (dev/test builds only):** expose read-only state (score, entity
  counts, current scene, fps) + deterministic drivers (advance N ticks, inject input, force spawn).
  E2e asserts against this API + screenshots, not pixel-hunting.
- **Logic/render split.** The rules engine (damage, scoring, spawn tables, economy, collision
  outcomes, level progression) is pure and headless — it runs in vitest without a browser. **The
  `logic` dimension lives here:** golden vectors like `(attack 7, defense 3, crit seed X) → 11 dmg`,
  `wave 5 spawn table → exactly [...]`, `score combo chain → N points`. The gating rule is
  unchanged: red rules math caps the build at 0.50 no matter how pretty the sprites are.
- **Screenshot checkpoints:** fixed seed + fixed tick count → screenshot → visual assert (and READ
  the PNG — green gates once hid an error overlay and a green-tinted desert on dino3d).
- **Fps as a hardening row:** measured on the headless profile with a stated scene (e.g. ≥ 55 fps
  at wave 10, 200 entities). Headless-specific: software-GL fps is dominated by MSAA — disable
  `antialias` and cap `devicePixelRatio` in the perf profile before believing a number.

## 4. Acceptance mapping (what the six dimensions mean for a game)

| Dimension | For a game means |
|---|---|
| **logic** (gating) | Pure rules engine golden vectors: combat/scoring math, spawn/loot tables, economy, progression thresholds, collision outcome classes — plus one e2e vector proving the engine is wired into the live loop |
| functional | The playable loop end-to-end via the test API: boot → menu → play → score → game-over → restart; save/load if scoped; pause/resume; input paths (keyboard + touch where scoped) |
| ux | Menus/HUD readable + navigable (real DOM where possible — DOM UI over canvas is more accessible AND more testable than canvas-drawn text); responsive canvas letterboxing; loading state with progress; volume/mute controls; key remapping if scoped; reduced-motion respected |
| devops | Bundle-size budget row; asset manifest integrity (every manifest entry exists, every file is in the manifest); CI builds + serves + runs the headless smoke |
| monitoring | Fps counter + error capture in dev; a crash on boot is detectable mechanically (console error budget = 0 on the smoke path) |
| hardening | License ledger complete; fps floor under the stated scene; no source-format leaks (`.wav`/`.psd`) in the bundle; save-data handling (no PII, localStorage quota handled) |

**Anti-demo, game edition:** games opt out of accounts/CRUD — but NOT out of "real product". The
game-shaped equivalents stay in: progress **persists** (localStorage/save slots survive a reload),
a fresh player gets a coherent **first-run** (tutorial/instructions), and settings (volume, controls)
**save**. A game that resets everything on refresh is still a demo.

## 5. Elicitation extras (requirements phase, when the brief is a game)

Ask via artifacts per the elicitation protocol, plus game-specific facets: reference games ("plays
like X, feels like Y" — mechanics vs aesthetics separated), art direction (pixel/vector/3D + 2–3
visual references, which existing CC0 pack is closest), scope shape (session length, level count,
procedural vs authored), difficulty/failure model, platforms + input (mobile touch changes
everything — elicit it FIRST, not as a port), audio expectations (music loops? SFX only?), and the
juice bar (screen shake / particles / tweening expectations — "game feel" is a requirement, name it).
