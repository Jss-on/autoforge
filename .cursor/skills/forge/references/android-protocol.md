# Android protocol — forge web app → Trusted Web Activity (the contract for `/forge:android`)

Facts dated 2026-09-06 from the Bubblewrap README, web.dev "Using a PWA in your Android app",
developer.android.com App Links verification, the Digital Asset Links REST reference, the Next.js
PWA guide, and the GitHub changelog on hardware-accelerated Android virtualization. Re-verify
before relying on a number that matters (API levels, limits, action versions).

## 1. Why a Trusted Web Activity, and the three ways it crashes

A TWA is Chrome rendering one HTTPS origin full-screen inside a signed Android package. The web
app is not re-implemented, exported, or re-hosted: server components, HttpOnly cookies, same-origin
CSRF checks and a nonce CSP all keep working because the request still comes from the real origin.
That is what makes the conversion accurate by construction. The price is a short list of hard
criteria — Chrome shows a **visible crash** of the Android app when:

1. **Digital Asset Links fail to verify at launch** (wrong package, wrong or missing fingerprint,
   the file unreachable, redirected, or served with the wrong content type).
2. **An offline network request is not answered with HTTP 200** — the service worker must serve a
   cached page (a dedicated `/offline` page is enough) when the network is gone.
3. **A navigation returns HTTP 404 or 5xx** — the start URL and every in-app navigation must answer.

Play policy compliance applies on top (a TWA of a site you own is allowed; a WebView of someone
else's site is not). The app must also meet PWA installability: a valid manifest with 192 + 512 px
PNG icons, `display: standalone`, HTTPS.

**Native-only needs stop the lane.** The web platform in Chrome Android covers most product
surfaces (table in §3). It does not cover background location, foreground services, telephony,
NFC card emulation, widgets or Wear/Auto/TV. Those are reported as `BLOCKED` with the matrix —
never approximated.

## 2. Digital Asset Links (site ↔ app trust)

File: `https://<host>/.well-known/assetlinks.json` — served over HTTPS, `Content-Type:
application/json`, **no redirect**, no login, at the root of the exact origin the TWA opens.

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.example.app",
    "sha256_cert_fingerprints": [
      "AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89"
    ]
  }
}]
```

- **Fingerprint format:** the certificate's SHA-256, **uppercase**, colon-separated (32 pairs). From
  the upload keystore: `keytool -list -v -keystore android/upload.keystore -alias upload` → the
  `SHA256:` line; from a built APK: `apksigner verify --print-certs app.apk` (lowercase hex, no
  colons) — `scripts/score-android.sh fingerprint <output>` normalizes either.
- **Play App Signing loop:** Play re-signs the bundle with Google's *app signing key*. The APK users
  install therefore carries a different certificate than the upload key. After the first upload,
  copy the app-signing certificate fingerprint from Play Console → Setup → **App integrity** and re-run
  the command with `Fingerprints: <that fingerprint>` so `assetlinks.json` lists **both** keys; redeploy;
  re-verify. Until then only the locally built APK verifies.
- **Verify remotely** (no API key needed):
  `GET https://digitalassetlinks.googleapis.com/v1/assetlinks:check?source.web.site=https://<host>&relation=delegate_permission/common.handle_all_urls&target.androidApp.packageName=<pkg>&target.androidApp.certificate.sha256Fingerprint=<fp>`
  → `{"linked": true}`. `statements:list?source.web.site=…&relation=…` shows what Google sees.
- **Verify on a device** (Android 12+):
  `adb shell pm set-app-links --package <pkg> 0 all`, `adb shell pm verify-app-links --re-verify <pkg>`,
  then `adb shell pm get-app-links <pkg>` → `<host>: verified`. `legacy_failure` or `1026` means
  the statement did not match — fix the file, redeploy, re-verify; do not "retry until green".
- Middleware must let the file through anonymously (allowlist `/.well-known/`); a 302 to a login
  page is the most common silent failure.

## 3. Native-needs matrix (fill one row per capability the SRS, spec or code implies)

| Need | Web API in Chrome Android (works in a TWA) | Status |
|---|---|---|
| Camera / microphone | `getUserMedia`, `<input capture>` | ok |
| Location while the app is open | Geolocation API | ok |
| Push notifications | Web Push + Notifications API (`enableNotifications` in twa-manifest) | ok |
| Biometric / passkey sign-in | WebAuthn platform authenticator | ok |
| Offline reads, install to home screen | Service worker + manifest | ok (required) |
| Barcode / QR | `BarcodeDetector` or a JS decoder over `getUserMedia` | ok |
| Bluetooth peripherals (printers, scales) | Web Bluetooth (central role) | ok |
| USB devices | WebUSB | ok |
| NFC tag reading | Web NFC | ok |
| Share sheet, contacts picker, file save | Web Share, Contact Picker, File System Access (partial) | ok |
| In-app purchases / subscriptions | Play Billing through `features.playBilling` (Digital Goods API) | ok (feature flag) |
| Background location / continuous tracking | none | **native-only → BLOCKED** |
| Foreground service (long-running background work) | none (Periodic Background Sync is best-effort only) | **native-only → BLOCKED** |
| Telephony, SMS read/send, call screening | none | **native-only → BLOCKED** |
| NFC card emulation (HCE) | none | **native-only → BLOCKED** |
| Home-screen widgets, Wear OS, Android Auto, TV | none | **native-only → BLOCKED** |
| Vendor payment SDK with no web checkout | none | **native-only → BLOCKED** |

`native-needs.md` = this table filtered to the app, with the evidence for each row (the
requirement id or the source file that implies it). Zero native-only rows is the Phase 1 gate.

## 4. Templates (Next.js App Router; other stacks map 1:1 to public-root files)

### 4.1 `app/manifest.ts`
```ts
import type { MetadataRoute } from 'next'
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '<Name>', short_name: '<≤12 chars>', description: '<one line from the charter>',
    start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait',
    theme_color: '<DESIGN.md accent>', background_color: '<DESIGN.md surface>',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
```
Icons are rendered with Playwright (already a devDependency) from the app's logo/favicon: a
512×512 page with the mark centered, and the maskable variant with the mark inside the 80% safe
zone on the `background_color`. Served from `public/icons/`; the TWA also needs them at absolute
URLs (`iconUrl`, `maskableIconUrl`).

### 4.2 `public/sw.js`
```js
const CACHE = '<slug>-v1';
const PRECACHE = ['/offline', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;               // API calls and assets stay untouched
  e.respondWith(fetch(e.request).catch(() => caches.match('/offline')));
});
```
Registered from a bundled client component in the root layout (nonce-safe under
`'strict-dynamic'`): `navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })`.
Full offline caching (Serwist) only when the SRS asks for offline work — YAGNI otherwise.

### 4.3 `app/offline/page.tsx`
A real page from the design system: the app name, "You're offline", what still works, a retry
link. No data fetching, no client-only dependencies.

### 4.4 `next.config` headers for the worker
```js
{ source: '/sw.js', headers: [
  { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
  { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' } ] }
```

### 4.5 Middleware: allowlist + CSP
- Anonymous allowlist (before the auth gate): `/.well-known/`, `/sw.js`, `/manifest.webmanifest`,
  `/offline`, `/icons/`.
- CSP additions: `worker-src 'self'` and `manifest-src 'self'`. Reason: `worker-src` falls through
  child-src → script-src → default-src; a `script-src 'nonce-…' 'strict-dynamic'` ignores host
  sources and a worker request carries no nonce, so without the explicit directive registration
  fails silently and the TWA crashes offline. `frame-ancestors` is irrelevant to a TWA (not an iframe).
- Check: `scripts/score-android.sh csp "<header value>"` → `CSP: OK`.

### 4.6 `e2e/pwa.spec.ts` (the app's own guard, runs in its CI forever)
```ts
import { test, expect } from '@playwright/test'
test('manifest is installable', async ({ request }) => {
  const r = await request.get('/manifest.webmanifest'); expect(r.status()).toBe(200)
  const m = await r.json(); expect(m.display).toBe('standalone')
  expect(m.icons.some((i: any) => i.sizes === '512x512')).toBe(true)
})
test('service worker + offline page answer', async ({ request }) => {
  const sw = await request.get('/sw.js'); expect(sw.status()).toBe(200)
  expect(sw.headers()['content-type']).toContain('javascript')
  expect((await request.get('/offline')).status()).toBe(200)
})
test('assetlinks is served directly as JSON', async ({ request }) => {
  const r = await request.get('/.well-known/assetlinks.json', { maxRedirects: 0 })
  expect(r.status()).toBe(200); expect(r.headers()['content-type']).toContain('application/json')
})
```

### 4.7 `android/twa-manifest.json`
```json
{
  "packageId": "<Package>", "host": "<bare host of Url>", "name": "<Name>", "launcherName": "<≤12>",
  "display": "standalone", "orientation": "portrait",
  "themeColor": "<theme_color>", "navigationColor": "<theme_color>", "navigationColorDark": "<theme_color>",
  "backgroundColor": "<background_color>", "enableNotifications": <push in scope>,
  "startUrl": "/", "iconUrl": "https://<host>/icons/icon-512.png", "maskableIconUrl": "https://<host>/icons/icon-512-maskable.png",
  "splashScreenFadeOutDuration": 300, "signingKey": { "path": "./upload.keystore", "alias": "upload" },
  "appVersionName": "<package.json version>", "appVersionCode": <git rev-list --count HEAD>,
  "webManifestUrl": "https://<host>/manifest.webmanifest", "fallbackType": "customtabs",
  "features": { "playBilling": { "enabled": <in-app purchases in scope> } },
  "enableSiteSettingsShortcut": true, "isChromeOSOnly": false, "isMetaQuest": false,
  "fullScopeUrl": "https://<host>/", "minSdkVersion": 21,
  "fingerprints": [ { "name": "upload", "value": "<upload fp>" }, { "name": "play-app-signing", "value": "<Play fp>" } ]
}
```
Rules the seam enforces (`scripts/score-android.sh twa`): `host` is the bare host (no scheme, no
path) of the deployment origin; `startUrl` starts with `/`; `packageId` reverse-DNS; `appVersionCode`
a positive integer — **`git rev-list --count HEAD` at build time, never edited by hand, never
reused** (Play rejects a repeated code); the keystore path never under `public/`.

### 4.8 Keystore, `.gitignore`, secrets
```
keytool -genkeypair -v -keystore android/upload.keystore -alias upload -keyalg RSA -keysize 2048 \
  -validity 10000 -storepass "$PW" -keypass "$PW" -dname "CN=<Name>, O=<org>, C=<cc>"
```
`.gitignore`: `android/upload.keystore`, `.env.android`, `*.apk`, `*.aab`, `android/app/build/`,
`android/.gradle/`, `android/.cxx/`. The password is generated (`node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`),
written to `.env.android`, and pushed to CI **from the file**: `base64 -w0 android/upload.keystore |
gh secret set ANDROID_KEYSTORE_B64`, `gh secret set BUBBLEWRAP_KEYSTORE_PASSWORD < <(…)`,
`gh secret set BUBBLEWRAP_KEY_PASSWORD < <(…)`. Bubblewrap reads `BUBBLEWRAP_KEYSTORE_PASSWORD`
and `BUBBLEWRAP_KEY_PASSWORD` in CI, so `build` never prompts. Losing the upload key means a
new application id — say it in the summary, back the keystore up out of band.

### 4.9 Toolchain
Bubblewrap needs **JDK 17 exactly** (newer JDKs are incompatible with the Android command-line
tools) and the Android SDK; on first run it offers to download both into `~/.bubblewrap/`
(`config.json` → `jdkPath`, `androidSdkPath`). The prompt is interactive: the user runs
`npx @bubblewrap/cli doctor` once and accepts. In CI, write `~/.bubblewrap/config.json` from
`setup-java` (temurin 17) and the runner's preinstalled SDK (`$ANDROID_HOME`, usually
`/usr/local/lib/android/sdk`) so nothing prompts. Windows/Git Bash: URL paths passed to node must
not go through MSYS path conversion — the seam handles its own calls; callers pass `--start`
paths with `MSYS_NO_PATHCONV=1`.

## 5. CI workflows (generated into the app's `.github/workflows/`)

### 5.1 `android-device-gate.yml` — the fidelity gate on a real emulator
```yaml
name: android-device-gate
on:
  workflow_dispatch:
    inputs: { host: { required: true }, package: { required: true } }
  push: { paths: ['android/**', 'public/.well-known/**', '.github/workflows/android-device-gate.yml'] }
jobs:
  device:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4
      - name: Enable KVM
        run: |
          echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules
          sudo udevadm control --reload-rules
          sudo udevadm trigger --name-match=kvm
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '17' }
      - name: Bubblewrap config (no prompts)
        run: |
          mkdir -p ~/.bubblewrap
          printf '{"jdkPath":"%s","androidSdkPath":"%s"}\n' "$JAVA_HOME" "$ANDROID_HOME" > ~/.bubblewrap/config.json
      - name: Restore upload keystore
        run: echo "${{ secrets.ANDROID_KEYSTORE_B64 }}" | base64 -d > android/upload.keystore
      - name: Build APK
        env:
          BUBBLEWRAP_KEYSTORE_PASSWORD: ${{ secrets.BUBBLEWRAP_KEYSTORE_PASSWORD }}
          BUBBLEWRAP_KEY_PASSWORD: ${{ secrets.BUBBLEWRAP_KEY_PASSWORD }}
        run: |
          npm ci
          cd android && npx @bubblewrap/cli build --skipPwaValidation
      - name: Emulator gate
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          target: google_apis          # AOSP "default" images have no Chrome → no TWA
          arch: x86_64
          profile: pixel_7
          disable-animations: true
          emulator-options: -no-window -gpu swiftshader_indirect -noaudio -no-boot-anim -camera-back none
          script: bash android/scripts/device-gate.sh "${{ inputs.host || vars.ANDROID_HOST }}" "${{ inputs.package || vars.ANDROID_PACKAGE }}"
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: device-evidence, path: device-evidence/ }
```

`android/scripts/device-gate.sh` (committed with the project):
```bash
#!/usr/bin/env bash
set -uo pipefail
HOST="$1"; PKG="$2"; OUT=device-evidence; mkdir -p "$OUT"
tap_text() { # dismiss a dialog by the text of its button, via the UI hierarchy
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb shell cat /sdcard/ui.xml > "$OUT/ui.xml"
  local b; b=$(grep -o "text=\"$1\"[^>]*bounds=\"\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]\"" "$OUT/ui.xml" | head -1 | grep -o '\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]')
  [[ -n "$b" ]] || return 1
  local x1 y1 x2 y2; IFS='[],' read -r _ x1 y1 _ x2 y2 _ <<< "$b"
  adb shell input tap $(( (x1 + x2) / 2 )) $(( (y1 + y2) / 2 )); sleep 1
}
# Chrome first-run experience (FRE) would otherwise sit on top of the TWA
adb shell am start -n com.android.chrome/com.google.android.apps.chrome.Main >/dev/null 2>&1; sleep 6
for label in "Use without an account" "Accept &amp; continue" "No thanks" "Got it" "Skip"; do tap_text "$label" || true; done
adb shell am force-stop com.android.chrome
adb install -r android/app-release-signed.apk | tee "$OUT/install.txt"
adb shell pm set-app-links --package "$PKG" 0 all
adb shell pm verify-app-links --re-verify "$PKG"; sleep 8
adb shell pm get-app-links "$PKG" | tee "$OUT/app-links.txt"
grep -q "$HOST: verified" "$OUT/app-links.txt" || { echo "APP LINKS NOT VERIFIED" | tee -a "$OUT/app-links.txt"; }
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; sleep 12
adb shell dumpsys activity activities | grep -E 'ResumedActivity|mResumedActivity' | tee "$OUT/resumed-activity.txt"
adb exec-out screencap -p > "$OUT/launch.png"
grep -q 'verified' "$OUT/app-links.txt" && grep -q 'com.android.chrome' "$OUT/resumed-activity.txt"
```
The gate is green only when `pm get-app-links` printed `<host>: verified` **and** the resumed
activity is Chrome's (a TWA runs inside Chrome's CustomTabActivity; the app's own activity resumed
means the browser fallback). The screencap is viewed, not just stored: the app's first screen,
full-bleed, no URL bar.

### 5.2 `android-release.yml` — artifacts on tag, Play upload human-gated
```yaml
name: android-release
on:
  push: { tags: ['v*'] }
  workflow_dispatch:
    inputs: { track: { description: 'none | internal', default: 'none' } }
jobs:
  bundle:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }             # versionCode = git rev-list --count HEAD
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '17' }
      - run: |
          mkdir -p ~/.bubblewrap
          printf '{"jdkPath":"%s","androidSdkPath":"%s"}\n' "$JAVA_HOME" "$ANDROID_HOME" > ~/.bubblewrap/config.json
          echo "${{ secrets.ANDROID_KEYSTORE_B64 }}" | base64 -d > android/upload.keystore
          node -e "const f='android/twa-manifest.json',fs=require('fs'),j=JSON.parse(fs.readFileSync(f));j.appVersionCode=+process.argv[1];fs.writeFileSync(f,JSON.stringify(j,null,2))" "$(git rev-list --count HEAD)"
      - env:
          BUBBLEWRAP_KEYSTORE_PASSWORD: ${{ secrets.BUBBLEWRAP_KEYSTORE_PASSWORD }}
          BUBBLEWRAP_KEY_PASSWORD: ${{ secrets.BUBBLEWRAP_KEY_PASSWORD }}
        run: npm ci && cd android && npx @bubblewrap/cli update --skipVersionUpgrade && npx @bubblewrap/cli build --skipPwaValidation
      - uses: actions/upload-artifact@v4
        with: { name: android-artifacts, path: 'android/app-release-*' }
      - if: startsWith(github.ref, 'refs/tags/')
        run: gh release create "${GITHUB_REF_NAME}" android/app-release-bundle.aab android/app-release-signed.apk --generate-notes
        env: { GH_TOKEN: '${{ github.token }}' }
  play-internal:
    needs: bundle
    if: ${{ github.event.inputs.track == 'internal' }}
    runs-on: ubuntu-latest
    environment: play-internal            # configure Required reviewers on this environment — the human gate
    steps:
      - uses: actions/download-artifact@v4
        with: { name: android-artifacts, path: android }
      - uses: r0adkll/upload-google-play@v1
        env: { PLAY_JSON: '${{ secrets.PLAY_SERVICE_ACCOUNT_JSON }}' }
        if: ${{ env.PLAY_JSON != '' }}
        with:
          serviceAccountJsonPlainText: ${{ secrets.PLAY_SERVICE_ACCOUNT_JSON }}
          packageName: <Package>
          releaseFiles: android/app-release-bundle.aab
          track: internal
          status: draft
```
The Play step needs three human things that the command never fakes: a Play developer account, a
service-account JSON stored as `PLAY_SERVICE_ACCOUNT_JSON`, and a reviewer approving the
`play-internal` environment. Until then releases carry the artifacts only.

## 6. Phone evidence via device-relay (optional, never the gate)

One batched script for the user to run against their own phone (USB debugging on), pasted back
verbatim as evidence:
```bash
adb devices
adb install -r app-release-signed.apk
adb shell pm set-app-links --package <pkg> 0 all; adb shell pm verify-app-links --re-verify <pkg>; sleep 8
adb shell pm get-app-links <pkg>
adb shell monkey -p <pkg> -c android.intent.category.LAUNCHER 1; sleep 10
adb exec-out screencap -p > phone-launch.png
adb shell dumpsys activity activities | grep -E 'ResumedActivity'
```

## 7. Store pack + versioning

`android/store/`: `listing.md` — **title ≤ 30**, **short description ≤ 80**, **full description ≤ 4000**
characters, written from the charter and SRS (what it does, for whom, what data it needs — no
superlatives); `icon-512.png`; `feature-graphic.png` **1024 × 500** (a Playwright render of a banner
built from `DESIGN.md` tokens — name, one-line value, the accent surface); `screenshots/phone-*.png`
(≥ 2, portrait 9:16, 1080 × 2400 from the Pixel 7 captures, no device frames); `data-safety.md` (every
data type collected/shared, purpose, encryption in transit, deletion path — from the SRS data
inventory; it is the source for the Play Data safety form); `content-rating-notes.md`; the privacy
policy URL (existing `/privacy` route, else a minimal generated page).

Versioning: `appVersionName` = the app's `package.json` version; `appVersionCode` = `git rev-list
--count HEAD` computed in the release job — monotone, unique, never hand-edited.

## 8. Ledger + verdict

`android-results.tsv` (`spec dimension assertion weight status detail traces`), dimensions
`pwa · trust · package · fidelity · device · release`. Required gate ids (all must be `pass` with
`evidence:<relpath>` resolving; `skip` is never proof):

| gate | proves | evidence |
|---|---|---|
| `pwa-manifest` | `MANIFEST: VALID` on the deployed manifest | `evidence/manifest.txt` |
| `pwa-sw-offline` | `sw.js` registered, `/offline` served from cache with the network off (Playwright `context.setOffline(true)`) | `evidence/offline.txt` + PNG |
| `trust-assetlinks-live` | `ANDROID_LIVE` assetlinks rows green on the production origin | `evidence/live.txt` |
| `trust-dal-linked` | Google `assetlinks:check` → `linked: true` | `evidence/dal-check.json` |
| `package-signed` | `app-release-bundle.aab` + `app-release-signed.apk` built and signed | `evidence/apksigner.txt` |
| `package-fingerprint-match` | APK certificate fingerprint == assetlinks entry | `evidence/apksigner.txt` |
| `fidelity-mobile-web` | mobile-viewport suite + design-scan clean at 390×844 / 360×640 | `evidence/mobile/sheet.png` |
| `device-applinks-verified` | `pm get-app-links` printed `<host>: verified` on the emulator | `evidence/device/app-links.txt` |
| `device-launch` | TWA resumed in Chrome, screencap shows the app full-bleed | `evidence/device/launch.png`, `resumed-activity.txt` |
| `release-workflow` | `android-release.yml` green on `workflow_dispatch` | `evidence/workflow-run.txt` |
| `release-store-pack` | every store-pack file present and within limits | `evidence/store-pack.txt` |

Optional rows: `pwa-icons-maskable`, `release-play-upload` (`skip` with the human-gate reason is
correct until a Play account exists). Verdict: `scripts/score-android.sh verdict android-results.tsv
--strict-evidence` → `ANDROID_VERDICT: STORE_READY` (every required gate green, no failed row) or
`ANDROID_VERDICT: BLOCKED` (the failing/missing/skipped gates named on stderr). Handoff source
`android` carries `verdict` + `results_tsv` (required), `package_id`, `host`, `artifacts`, `repo`,
`pr`, `workflow_run`, `native_needs`.
