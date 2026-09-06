# /forge:android — Web App → Android App (Trusted Web Activity)

The Android packager of the pipeline. `build` makes a web app; `android` makes that same app a
first-class Android app **without re-implementing it**. The lane is a **Trusted Web Activity**:
Chrome renders the deployed origin full-screen inside a signed Android package, so sessions,
cookies, CSRF checks, server components and the nonce CSP keep working unchanged — fidelity is a
property of the packaging, not a per-screen judgement. Everything the web platform cannot do
(background location, foreground services, telephony…) is **detected and reported as `BLOCKED`**,
never approximated.

## Invocation

```
/forge:android Target: build-output/hanai-intake Url: https://hanai.example.com
/forge:android Url: https://pos.example.com Package: com.example.pos Name: "DJN POS" Track: internal
/forge:android Url: https://pos.example.com Fingerprints: 12:34:…:F0     # add the Play App Signing key after the first upload
```

| Argument | Meaning |
|---|---|
| `Target:` | The built app's directory (a forge output, or the cwd). |
| `Url:` | The **production** HTTPS origin the app is deployed at. A TWA wraps one fixed host — never a preview URL. Required. |
| `Package:` | Android application id (reverse-DNS). Derived from the origin when omitted, confirmed once. |
| `Name:` | Display name; the launcher name is trimmed to 12 characters. |
| `Fingerprints:` | Extra certificate fingerprints to trust — the Play App Signing key from Play Console → Setup → App integrity. |
| `Track:` | `none` (default, artifacts only) or `internal` — arms the human-gated Play upload in the release workflow. |
| `Iterations:` | Bound on the fix loop over red ledger rows (default 12). `--thorough` opens every capture. |
| `--chain ship\|test` | Promote a track under approval, or run a QA engagement on the mobile surface. |

## The engagement

0. **Preflight** — doctor, the origin must answer anonymously, `@bubblewrap/cli` becomes a devDependency
   of the app (same rule as Playwright). Bubblewrap needs JDK 17 exactly and the Android command-line
   tools; its first run offers to download both into `~/.bubblewrap/` — that prompt is yours to answer
   once (`npx @bubblewrap/cli doctor`). Local builds are optional evidence; CI builds the bundle either way.
1. **Native-needs gate** — the SRS, spec and source are read into `native-needs.md`: each capability →
   the Chrome-Android web API that provides it. Camera, location-while-open, push, biometrics, USB/BLE/NFC
   reading and Play Billing are fine in a TWA. Background location, foreground services, SMS, NFC card
   emulation, widgets, Wear/Auto/TV are not → `BLOCKED` with the matrix.
2. **PWA-ify** — `app/manifest.ts`, icons (192, 512, maskable — rendered with Playwright from the app's
   logo), `public/sw.js` with an offline fallback, `/offline`, the `/sw.js` headers, a middleware allowlist
   for the trust surfaces, `worker-src 'self'` + `manifest-src 'self'` in the CSP (a nonce +
   `'strict-dynamic'` policy otherwise blocks the service worker), and `e2e/pwa.spec.ts` in the app's own suite.
3. **Trust** — an upload keystore (gitignored; passwords reach CI only through `gh secret set`) and
   `public/.well-known/assetlinks.json` carrying the upload key **and** every `Fingerprints:` entry.
   Served as JSON, no redirect, anonymous — Android refuses anything else.
4. **Package** — `android/twa-manifest.json` (host, package, colors from `DESIGN.md`, `appVersionCode` =
   `git rev-list --count HEAD`), `bubblewrap update`, and a local `bubblewrap build --skipPwaValidation`
   when the toolchain resolves → `app-release-bundle.aab` + `app-release-signed.apk`; the APK's certificate
   fingerprint must equal the assetlinks entry.
5. **Deploy + live trust** — a PR on the app's private repo (auto-merges on green like `build`'s); then the
   production origin is polled until every trust surface answers and Google's `assetlinks:check` says
   `linked: true`.
6. **Fidelity** — the app's Playwright suite under `devices['Pixel 7']` + design-scan at 390×844 / 360×640
   with a contact sheet; and the **device gate**: `.github/workflows/android-device-gate.yml` boots a
   `google_apis` emulator on a KVM runner, dismisses Chrome's first-run screen, installs the APK, proves
   `pm get-app-links` prints `<host>: verified`, launches the app and screencaps it — the evidence is
   downloaded and viewed. A phone via the device-relay routine adds evidence but is never the gate.
7. **Release** — `.github/workflows/android-release.yml` builds the bundle on `v*` tags and attaches it to a
   GitHub Release; the Play internal-track upload runs only behind a GitHub Environment with required
   reviewers. The store pack (`android/store/`: listing within Play's limits, 512 icon, 1024×500 feature
   graphic, phone screenshots, data-safety sheet, privacy policy URL) is generated from the charter,
   SRS and design system. Tagging is asked, never assumed.
8. **Verdict** — `android-results.tsv` is scored with `scripts/score-android.sh verdict --strict-evidence`.

## The seam

```
scripts/score-android.sh manifest    public/manifest.webmanifest            # MANIFEST: VALID icons=3
scripts/score-android.sh csp         "<Content-Security-Policy value>"      # CSP: OK
scripts/score-android.sh fingerprint keytool.txt                            # FINGERPRINT: AB:CD:…
scripts/score-android.sh assetlinks  assetlinks.json com.example.app AB:…   # ASSETLINKS: VALID fingerprints=2
scripts/score-android.sh twa         android/twa-manifest.json https://app.example.com   # TWA: VALID
scripts/score-android.sh live        https://app.example.com com.example.app AB:…        # ANDROID_LIVE: 9/9
scripts/score-android.sh verdict     android-results.tsv --strict-evidence  # ANDROID_VERDICT: STORE_READY
```

Eleven required gates decide `STORE_READY`: `pwa-manifest`, `pwa-sw-offline`, `trust-assetlinks-live`,
`trust-dal-linked`, `package-signed`, `package-fingerprint-match`, `fidelity-mobile-web`,
`device-applinks-verified`, `device-launch`, `release-workflow`, `release-store-pack` — each `pass` only
with an `evidence:` file that exists; `skip` is never proof. Anything else is `BLOCKED`, with the gates named.

## What stays human

- Answering Bubblewrap's one-time toolchain prompt on the workstation.
- Creating the Play developer account, the service-account JSON, and the `play-internal` environment reviewers.
- Copying the Play App Signing fingerprint back after the first upload (`Fingerprints:`).
- Approving the tag, the Play upload, and any track promotion (`ship`).

See `references/android-protocol.md` for the crash criteria, the native-needs matrix, every file
template, both workflows, the device-relay script and the ledger catalogue.
