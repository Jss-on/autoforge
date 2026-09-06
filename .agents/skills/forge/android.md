---
name: forge:android
description: "Convert a forge web app into a store-ready Android app — Trusted Web Activity lane: PWA-ify the deployed app, prove site↔app trust with Digital Asset Links, build + sign the AAB/APK with Bubblewrap, verify on a real emulator in CI, ship artifacts + store pack; STORE_READY|BLOCKED verdict, native-only needs reported honestly"
argument-hint: "[Target: <app dir>] [Url: <https://host>] [Package: <reverse.dns.id>] [Name: <app name>] [Fingerprints: <sha256,…>] [Track: none|internal] [Iterations: N] [--chain ship|test] [--thorough]"
---

EXECUTE IMMEDIATELY.

The **Android packager** of the pipeline. `build` makes a web app; `android` makes that same app a
first-class Android app **without re-implementing it**: a **Trusted Web Activity** (TWA) — Chrome
itself renders the deployed origin full-screen inside a signed Android package, so cookies,
sessions, CSRF checks, server components and the nonce CSP all keep working unchanged and
fidelity is a property, not a hope. The conversion is therefore (1) make the app a compliant PWA,
(2) prove the site↔app trust (Digital Asset Links), (3) build and sign, (4) verify on a real
emulator in CI, (5) ship a signed bundle, a release workflow and a store-listing pack. What the
web platform cannot do natively (background location, foreground services, telephony…) is
**detected and reported as `BLOCKED`, never faked**. Every gate is mechanical:
`scripts/score-android.sh` decides, evidence anchors every ledger row, and the verdict is
`STORE_READY` or `BLOCKED`. Companion contract: `references/android-protocol.md` (TWA crash
criteria, DAL rules, native-needs matrix, every file template, the CI workflows, the
device-relay script).

## Seam & reference resolution (read once)
Resolve `AR_ROOT` exactly as in `build`: first existing of `${CLAUDE_PLUGIN_ROOT}/skills/forge`,
`.claude/skills/forge`, the directory containing this command file, else glob
`**/skills/forge/scripts/score-android.sh` and take its grandparent. Every `scripts/<x>` below
means `$AR_ROOT/scripts/<x>`; every `references/<x>` means `$AR_ROOT/references/<x>`. Run
`bash $AR_ROOT/scripts/doctor.sh` at Phase 0 — CORE tools are required; the `bubblewrap` /
`keytool` OPTIONAL rows say whether a **local** build is possible. A missing local toolchain is
not a blocker: the output repo's CI builds the bundle either way (Phase 6/7); local builds are
extra evidence.

## Parse Arguments
- `Target:` / `--target` — the built app's directory (a forge output: carries `charter.md` or
  `build-results.tsv`, or is the cwd). Required; if absent and cwd is not a forge output, ask.
- `Url:` — the **production** HTTPS origin the app is deployed at (e.g. `https://app.example.com`).
  Required — a TWA wraps one fixed host; preview deployments have other hosts and must not be
  used. Must answer an anonymous GET; otherwise stop with `BLOCKED` (deploy first: `ship`).
- `Package:` — Android application id, reverse-DNS (`com.example.app`). Default derived from
  the origin (`com.<domain-reversed>.app`), confirmed in Phase 1.
- `Name:` — display name (default: the manifest/charter name). `launcherName` ≤ 12 characters.
- `Fingerprints:` — extra SHA-256 certificate fingerprints to trust beyond the upload key, i.e.
  the **Play App Signing** key fingerprint from Play Console → Setup → App integrity. Comma-separated,
  uppercase colon form accepted in any case.
- `Track:` — `none` (default: artifacts only) or `internal` (arms the human-gated Play internal-track
  upload in the release workflow; needs the `PLAY_SERVICE_ACCOUNT_JSON` secret AND environment
  approval — never automatic).
- `Iterations:` — bound on the fix loop over red ledger rows (default 12). `--thorough` restores
  the exhaustive form of every fast-path rule (every PNG opened, full Guard per slice).
- `--chain <targets>` — commonly `ship` (Play track promotion / release notes) or `test`. `--evals`.

## Run directory & deliverables (machine-readable where it counts)
`forge/android-{YYMMDD}-{HHMM}/` containing:
- `native-needs.md` — the native-needs matrix: every capability the SRS/spec/code implies →
  the Chrome-on-Android web API that provides it → TWA ok? / Play feature / **native-only**.
- `android-results.tsv` — the ledger, **7 tab-separated columns**, the same shape as
  `build-results.tsv`: `spec dimension assertion weight status detail traces`, dimensions
  `pwa · trust · package · fidelity · device · release`, validated by
  `scripts/score-android.sh verdict android-results.tsv --strict-evidence`. A row is `pass` only with
  `detail = evidence:<relpath>` resolving to a real file under `evidence/`; `skip` needs a reason
  and is never accepted for a required gate.
- `evidence/` — seam transcripts (`manifest.txt`, `assetlinks.txt`, `twa.txt`, `csp.txt`,
  `live.txt`, `dal-check.json`), fingerprint outputs (`keytool.txt`, `apksigner.txt`), the mobile
  contact sheet + PNGs (`mobile/`), the CI device evidence (`device/app-links.txt`,
  `device/launch.png`, `device/resumed-activity.txt`), workflow run URLs.
- `iterations.tsv`, `score-log.tsv`, `handoff.json`.
In the **Target** app (committed on a branch, PR'd): `app/manifest.ts`, `public/sw.js`,
`app/offline/page.tsx`, `public/icons/*.png`, `public/.well-known/assetlinks.json`, the middleware
allowlist + CSP lines, `next.config` headers for `/sw.js`, `e2e/pwa.spec.ts`, `android/`
(`twa-manifest.json`, the generated Gradle project, `store/`), `.github/workflows/android-device-gate.yml`,
`.github/workflows/android-release.yml`, `.gitignore` entries — never the keystore, never a password.

## Phase 0 — Preflight
`doctor.sh`; resolve `Target`; anonymous GET of `Url` (final status 200; a login redirect to a 200
page is fine, 404/5xx is `BLOCKED`); add `@bubblewrap/cli` as a **devDependency of the app** (the
same rule as Playwright: CI and the workstation run the identical tool); `npx @bubblewrap/cli doctor`.
Bubblewrap needs **JDK 17 exactly** and the Android command-line tools; when they are missing it
offers to download both into `~/.bubblewrap/` — that prompt is interactive, so print the one command
for the user to run themselves (`! npx @bubblewrap/cli doctor`, answer yes twice) and **continue**:
Phases 1–5 need no toolchain and the release workflow builds the bundle on the runner. Record the
toolchain state in `iterations.tsv`. **Gate:** origin answers; Target resolved; doctor CORE green.

## Phase 1 — Native-needs gate (honesty before packaging)
Read the app's requirements (`forge/requirements-*/requirements.md`, `evals/fullstack/<slug>.spec.yaml`,
`charter.md`, `DESIGN.md`) and grep the source for capability markers (geolocation, camera, push,
Bluetooth, NFC, payments, file access, background work). Write `native-needs.md` per the protocol
matrix: camera/mic → `getUserMedia`; location while open → Geolocation; push → Web Push (works in
Chrome Android); biometrics → WebAuthn; USB/BLE/NFC reading → WebUSB/Web Bluetooth/Web NFC;
in-app purchases → Play Billing through `features.playBilling` in `twa-manifest.json`. **Native-only**
(no web API in a TWA): background location / tracking, foreground services, telephony or SMS
access, NFC card emulation, home-screen widgets, Wear/Auto/TV surfaces, a vendor payment SDK
with no web checkout. Any native-only need → `status: BLOCKED`, `native_needs` listed in the
handoff, the matrix delivered, and the run stops — a TWA that silently lacks a required feature is
not an accurate conversion. Interactive sessions confirm the package id, display name, colors
(from `DESIGN.md` tokens) and `Track` with ONE `AskUserQuestion`; non-interactive runs log the
derivation as explicit assumptions. **Gate:** matrix written; zero native-only rows.

## Phase 2 — PWA-ify the app (the TWA quality criteria)
Chrome crashes a TWA visibly when Digital Asset Links fail, when an offline request is not answered
with HTTP 200, or when a navigation returns 404/5xx — so the app must be installable and offline-safe
first. Next.js App Router path (templates in the protocol):
1. `app/manifest.ts` returning `MetadataRoute.Manifest`: `name`, `short_name`, `start_url: '/'`,
   `display: 'standalone'`, `theme_color` + `background_color` from `DESIGN.md`, icons **192 and 512 png
   plus a maskable 512** rendered with Playwright from the app's logo/favicon (no new dependency).
2. `public/sw.js`: install precaches `/offline` + icons; navigations network-first with the offline
   fallback; `skipWaiting` + `clients.claim`. Registered from a **bundled client component** (nonce-safe
   under `'strict-dynamic'`), `updateViaCache: 'none'`.
3. `app/offline/page.tsx` — a real page, styled from the design system, no network dependency.
4. `next.config` headers for `/sw.js`: `Content-Type: application/javascript`, `Cache-Control:
   no-cache, no-store, must-revalidate`.
5. **Middleware**: the anonymous-auth gate gets an **allowlist** for `/.well-known/`, `/sw.js`,
   `/manifest.webmanifest`, `/offline`, `/icons/`; the CSP gains `worker-src 'self'` and
   `manifest-src 'self'` — a nonce + `'strict-dynamic'` script-src ignores host sources, and a
   service-worker request carries no nonce (`scripts/score-android.sh csp "<header>"` → `CSP: OK`).
6. `e2e/pwa.spec.ts` in the app's Playwright suite: manifest 200 + required fields, `sw.js` 200 +
   JS type + no-cache, `/offline` 200, `/.well-known/assetlinks.json` 200 + JSON + **no redirect** —
   so the app's own CI guards these surfaces forever.
Vite apps: `vite-plugin-pwa` (already the client-only shape); other stacks: static manifest + `sw.js`
under the public root. **Gate (mechanical):** `scripts/score-android.sh manifest <manifest>` →
`MANIFEST: VALID`; `csp` → `CSP: OK`; ledger rows `pwa-manifest`, `pwa-sw-offline`, `pwa-icons-maskable`.

## Phase 3 — Trust: keystore + Digital Asset Links
- **Upload keystore** (once per app): `keytool -genkeypair -v -keystore android/upload.keystore
  -alias upload -keyalg RSA -keysize 2048 -validity 10000 -storepass <pw> -keypass <pw> -dname
  "CN=<Name>, O=<org>, C=<cc>"` with a node-generated password written to `.env.android` — both
  paths in `.gitignore` before anything else (`android/upload.keystore`, `.env.android`, `*.apk`,
  `*.aab`, `android/app/build/`, `android/.gradle/`). Secrets reach CI through `gh secret set`
  (`ANDROID_KEYSTORE_B64` = base64 of the keystore, `BUBBLEWRAP_KEYSTORE_PASSWORD`,
  `BUBBLEWRAP_KEY_PASSWORD`) piped from the file — **never echoed, never committed, never in a log**.
  An existing keystore is reused; a lost keystore is a new app id (Play never re-keys an upload key
  silently — say so).
- **Fingerprint:** `keytool -list -v -keystore android/upload.keystore -alias upload` →
  `scripts/score-android.sh fingerprint keytool.txt` → `FINGERPRINT: AA:…` (uppercase colon SHA-256).
- **`public/.well-known/assetlinks.json`**: one `android_app` statement for `Package` with relation
  `delegate_permission/common.handle_all_urls` and **every** fingerprint: the upload key plus each
  `Fingerprints:` entry. **Play App Signing** re-signs the bundle Google ships, so after the first Play
  upload the app-signing certificate's fingerprint (Play Console → Setup → App integrity) is added via
  `Fingerprints:` and the site redeployed — until then the Play-built APK verifies only on the upload
  key, and the ledger says so. Rules: HTTPS, `Content-Type: application/json`, **no redirect**, no
  login, root of the origin. **Gate:** `scripts/score-android.sh assetlinks <file> <Package> <fp,…>` →
  `ASSETLINKS: VALID fingerprints=N`.

## Phase 4 — Package: twa-manifest.json + Bubblewrap
`android/twa-manifest.json` (protocol template): `host` = bare host of `Url`, `packageId`, `name`,
`launcherName`, `startUrl: '/'`, absolute `iconUrl`/`maskableIconUrl` on the deployed host,
`themeColor`/`navigationColor`/`backgroundColor` from the manifest, `signingKey: {path:
'./upload.keystore', alias: 'upload'}`, `appVersion` = the app's `package.json` version,
**`appVersionCode` = `git rev-list --count HEAD`** (monotone, never reused — Play rejects a repeat),
`fingerprints` = every trusted fingerprint, `features.playBilling` when the matrix needs it,
`enableNotifications` when push is in scope, `minSdkVersion` 21+. Then `bubblewrap update
--skipVersionUpgrade` regenerates the Gradle project (committed) and, when the toolchain resolves
locally, `bubblewrap build --skipPwaValidation` with the two password env vars →
`app-release-signed.apk` + `app-release-bundle.aab`. **Gate:** `scripts/score-android.sh twa
android/twa-manifest.json <Url>` → `TWA: VALID`; after a build, `apksigner verify --print-certs`
(or `keytool -printcert -jarfile`) → `fingerprint` → must equal the assetlinks entry — ledger rows
`package-signed`, `package-fingerprint-match`.

## Phase 5 — Deploy the web changes + live trust
Branch `android/<stamp>` in the Target app: PR with the PWA files, assetlinks, `android/`, the
workflows and the e2e spec; it merges itself on green CI exactly like `build`'s PRs (merging is how
forge apps deploy through their Vercel/Git integration — `ship` stays human-gated for anything
beyond the app's own repo). Then poll the production origin: `scripts/score-android.sh live <Url>
<Package> <fp>` → `ANDROID_LIVE: M/M` (assetlinks 200 + JSON + no redirect + fingerprint present,
manifest, `sw.js`, `/offline`, start URL, and the Google API `assetlinks:check` → `linked: true`).
A deploy that never lands within the bound → `BOUNDED` with the exact next step, never a silent
pass. Ledger rows `trust-assetlinks-live`, `trust-dal-linked` (evidence: `live.txt`, `dal-check.json`).

## Phase 6 — Fidelity: mobile web + real device
- **Mobile web (the app as the TWA will render it):** the app's Playwright suite under
  `devices['Pixel 7']` (a `mobile` project when the config is `@playwright/test`), plus
  `scripts/design-scan.cjs --url <every primary route> --viewports 390x844,360x640 --design DESIGN.md
  --shots evidence/mobile --sheet evidence/mobile/sheet.png`. Open the **contact sheet** (one image;
  individual PNGs only when a cell or the scan flags them — `references/speed-protocol.md`): zero
  error-level findings (`viewport-meta`, `zoom-disabled`, `horizontal-overflow`), `tap-target-44`
  advisories reported. Ledger row `fidelity-mobile-web`.
- **Device gate (CI, never this workstation):** `.github/workflows/android-device-gate.yml` from
  the protocol template — `ubuntu-latest`, the **KVM** udev rule, `setup-java` temurin 17 + the
  runner's Android SDK, the bundle built with the secrets, then `reactivecircus/android-emulator-runner`
  with `api-level: 34`, **`target: google_apis`** (the AOSP `default` image has no Chrome → no TWA),
  `arch: x86_64`, `profile: pixel_7`; the script dismisses Chrome's **first-run** (FRE) screen via
  `uiautomator dump` + `input tap`, installs the APK, runs `pm set-app-links --package <pkg> 0 all`,
  `pm verify-app-links --re-verify <pkg>`, then `pm get-app-links <pkg>` (must print `<host>: verified`),
  launches `am start -n <pkg>/.LauncherActivity`, waits, `screencap` + `dumpsys activity activities`
  (`mResumedActivity` must be Chrome's `CustomTabActivity`/TWA, not a browser fallback), and uploads
  `device-evidence/`. Trigger with `gh workflow run`, wait with `gh run watch`, pull evidence with
  **`gh run download`** into `evidence/device/`, and **view the screencap**: the app's first screen,
  full-bleed, no URL bar. Ledger rows `device-applinks-verified`, `device-launch` (evidence:
  `device/app-links.txt`, `device/launch.png`, `device/resumed-activity.txt`).
- **Phone evidence (optional):** the user's own device through the **device-relay** routine — one
  batched adb script from the protocol (`adb install -r`, the app-links commands, `screencap`); pasted
  output becomes extra evidence rows, never a substitute for the CI gate.

## Phase 7 — Release: workflow + store pack (human-gated)
- `.github/workflows/android-release.yml` (protocol template): on tag `v*` → build
  `app-release-bundle.aab` + `app-release-signed.apk` with the secrets → attach both to a GitHub
  Release. The Play upload step (`upload-google-play`, internal track) runs only when
  `Track: internal` was requested, `PLAY_SERVICE_ACCOUNT_JSON` exists, **and** the `play-internal`
  GitHub Environment with required reviewers approves — the human gate lives in GitHub, not in a
  prompt. Ledger row `release-workflow` (evidence: the green run URL of the workflow's dry-run on
  `workflow_dispatch`).
- **Store pack** `android/store/`: `listing.md` (title ≤ 30, short description ≤ 80, full description
  ≤ 4000 — from the charter and SRS, no marketing filler), `icon-512.png`, `feature-graphic.png`
  **1024×500** (a Playwright render of a `DESIGN.md`-token banner), `screenshots/phone-*.png` (≥ 2,
  9:16, from the Pixel 7 captures), `data-safety.md` (what the app collects, from the SRS data
  inventory — the Play Data safety form is filled from it), `content-rating-notes.md`, and the
  **privacy** policy URL (the app's existing `/privacy` route; if none exists a minimal page is
  generated from the SRS and PR'd with the rest). Ledger row `release-store-pack`.
- **Tagging is human-gated:** ONE `AskUserQuestion` — "tag `v<version>` and run the release workflow
  now?" — non-interactive runs stop at `BOUNDED` with the tag command as the next step. Publishing
  to Play beyond the internal track is `ship`'s job and needs explicit user approval there.

## Phase 8 — Loop, verdict, handoff (the forge loop; bounded)
Per iteration exactly one red ledger row, cheapest sensor first (`references/speed-protocol.md`):
re-run only the seam that judges it, recapture only the route that changed, re-trigger the device
gate only after a package or trust change. Log every iteration to `iterations.tsv`, append-only;
`scripts/score-build.sh bound iterations.tsv <N>` — `BOUND: EXCEEDED` blocks a COMPLETE status
without a recorded user-approved extension. Then the mechanical gate:
`scripts/score-android.sh verdict android-results.tsv --strict-evidence` → **`ANDROID_VERDICT:
STORE_READY`** only when all eleven required gates (`pwa-manifest`, `pwa-sw-offline`,
`trust-assetlinks-live`, `trust-dal-linked`, `package-signed`, `package-fingerprint-match`,
`fidelity-mobile-web`, `device-applinks-verified`, `device-launch`, `release-workflow`,
`release-store-pack`) are `pass` with resolving evidence and no row anywhere failed; otherwise
**`BLOCKED`** with the failing gates named. A blocked run ships to the user only labeled as blocked.

## GitHub flow (transparency contract)
All app changes go through a PR on the app's **own private output repo** (`build`'s repo) —
never to the forge skill tree. The run directory (matrix, ledger, evidence, handoff) is committed
to the invoking workspace as `android: <slug> TWA packaging`. Nothing is published outside that repo
without explicit user approval; GitHub Release assets on a private repo are not a publication.

## Safety Invariants
- **Secrets never leave the machine in the clear.** Keystore and passwords are gitignored, pushed to
  CI only through `gh secret set`, never printed, never pasted into a prompt or a ledger.
- **Human-gated release.** Tags, Play uploads and any track promotion require explicit user approval
  (the GitHub Environment's required reviewers for the workflow, an `AskUserQuestion` here); the
  loop never passes `--auto` to `ship`.
- **Honest verdicts.** Native-only needs → `BLOCKED` with the matrix; a red gate is a red gate; `skip`
  is never accepted for a required gate; unproven rows are not `pass`.
- **Minimal footprint in the app.** Only the PWA files, the trust file, the middleware allowlist + two
  CSP directives, the `/sw.js` headers, `android/`, the two workflows and one e2e spec — no
  architectural change, no static export, no origin change; the server keeps its cookies, CSRF and CSP.
- **Real Chrome, real emulator.** Fidelity evidence comes from Chrome on a `google_apis` emulator in CI
  (or a real phone), never from a WebView, never from this workstation.

## Summary
Print: verdict (**STORE_READY | BLOCKED**) with every required gate's status; the native-needs
matrix outcome; PWA surfaces (manifest, sw, offline) and the `MANIFEST:`/`CSP:` lines; trust
(`ASSETLINKS:`, `ANDROID_LIVE: M/M`, `linked`); package (`TWA:`, versionName/versionCode, fingerprint
match); fidelity (mobile findings, device gate run URL + whether `verified` was printed and the
screencap looked right); release (workflow, store pack contents, what remains human-gated); the
PR URL; the run directory; the artifacts' paths; the next step when blocked or bounded.

## Eval Checkpoint (--evals)
Interval: floor(max_iterations / 3), min 1. Print required gates green/total, ledger pass-rate under
`--strict-evidence`, live surfaces M/M, device-gate runs triggered vs green, remaining red rows by
dimension. A flat gate count two checkpoints running → recommend the exact human step blocking
(deploy, Play fingerprint, toolchain) rather than more iterations.

## Chain Handoff
Write handoff.json: version "3.1.0", source "android", timestamp, status
(COMPLETE|BOUNDED|BLOCKED|USER_INTERRUPT|ERROR), verdict (STORE_READY|BLOCKED), results_tsv
(`android-results.tsv`), package_id, host, artifacts{apk, aab} (paths or release-asset URLs),
repo, pr, workflow_run (device-gate run URL), native_needs (list, when blocked), findings = red
gates + human steps outstanding, config{target, url, package, name, fingerprints, track,
iterations}. Validate with `scripts/validate-handoff.sh <run>/handoff.json android` before printing
the summary. Chain commonly `--chain ship` (release notes, Play track promotion under approval) or
`--chain test` (a QA engagement on the mobile surface). Propagate `--evals`.
