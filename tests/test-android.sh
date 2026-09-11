#!/usr/bin/env bash
# Test harness for /forge:android — score-android.sh (manifest, assetlinks, twa, csp,
# fingerprint, live, verdict), the android.md engagement spec, the android protocol,
# handoff wiring, orchestrator routing, doctor rows, mirror parity, manifests + routers
# at 3.6.0, docs.
#
# FROZEN SCORER. This suite is the Metric of the forge loop that ships the capability
# (forge/loop-260906-1629): Verify reads the footer "=== N/M ..." as N/M. Rows are
# rubric checks on the spec/protocol PLUS executable checks on good AND planted-defect
# fixtures, so a hollow seam or a stub command cannot score. Do not edit inside the loop.
set -uo pipefail

# Fixture scoring must not write score-log.tsv into the repo.
export AR_SCORE_LOG=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SA="$REPO_ROOT/scripts/score-android.sh"
VH="$REPO_ROOT/scripts/validate-handoff.sh"
ORCH="$REPO_ROOT/scripts/orchestrate.sh"
DOC="$REPO_ROOT/scripts/doctor.sh"
SPEC="$REPO_ROOT/claude-plugin/commands/forge/android.md"
PROTO="$REPO_ROOT/claude-plugin/skills/forge/references/android-protocol.md"
FIX="$REPO_ROOT/tests/fixtures/android"
GOOD="$FIX/good"; BAD="$FIX/bad"; SITE="$FIX/site"

PKG="com.example.forgeapp"
ORIGIN="https://app.example.com"
UPLOAD_FP="AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89"
PLAY_FP="12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0"
GHOST_FP="00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF"

PASS=0; FAIL=0; TOTAL=0
pass() { printf '  PASS: %s\n' "$1"; PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); }
fail() { printf '  FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); }

assert_eq()       { [[ "$1" == "$2" ]] && pass "$3" || fail "$3 (expected '$1', got '$2')"; }
assert_contains() { echo "$1" | grep -q -- "$2" && pass "$3" || fail "$3 (missing '$2')"; }

spec_has()  { grep -Eq -- "$1" "$SPEC"  2>/dev/null && pass "spec: $2"  || fail "spec: $2 (pattern '$1')"; }
proto_has() { grep -Eq -- "$1" "$PROTO" 2>/dev/null && pass "proto: $2" || fail "proto: $2 (pattern '$1')"; }

T="$(mktemp -d)"

# ============================================================================
printf '\n--- score-android: manifest (PWA installability) ---\n'
# ============================================================================

M_OUT=$(bash "$SA" manifest "$GOOD/manifest.webmanifest" 2>/dev/null); M_RC=$?
assert_contains "$M_OUT" "MANIFEST: VALID" "manifest: compliant manifest → VALID"
assert_eq 0 "$M_RC" "manifest: valid → exit 0"
M_LINES=$(bash "$SA" manifest "$GOOD/manifest.webmanifest" 2>/dev/null | wc -l | tr -d ' ')
assert_eq "1" "$M_LINES" "manifest: stdout is exactly one line"
M_ERR=$(bash "$SA" manifest "$GOOD/manifest.webmanifest" 2>&1 >/dev/null)
assert_contains "$M_ERR" "maskable=yes" "manifest: maskable icon reported on stderr"

M_ERR=$(bash "$SA" manifest "$BAD/manifest.webmanifest" 2>&1 >/dev/null); M_RC=$?
assert_eq 1 "$M_RC" "manifest: display=browser + no 512 icon → INVALID"
assert_contains "$M_ERR" "icon-512" "manifest: missing 512 icon named"
assert_contains "$M_ERR" "display" "manifest: display rule named"

bash "$SA" manifest "$T/nope.webmanifest" >/dev/null 2>&1; M_RC=$?
assert_eq 2 "$M_RC" "manifest: missing file → exit 2"

bash "$SA" bogus >/dev/null 2>&1; M_RC=$?
assert_eq 64 "$M_RC" "unknown subcommand → exit 64"

# ============================================================================
printf '\n--- score-android: assetlinks (Digital Asset Links statement) ---\n'
# ============================================================================

A_OUT=$(bash "$SA" assetlinks "$GOOD/assetlinks.json" "$PKG" "$UPLOAD_FP,$PLAY_FP" 2>/dev/null); A_RC=$?
assert_eq "ASSETLINKS: VALID fingerprints=2" "$A_OUT" "assetlinks: both fingerprints present → VALID"
assert_eq 0 "$A_RC" "assetlinks: valid → exit 0"

A_OUT=$(bash "$SA" assetlinks "$GOOD/assetlinks.json" "$PKG" "$UPLOAD_FP" 2>/dev/null); A_RC=$?
assert_eq 0 "$A_RC" "assetlinks: required subset present → VALID"

A_OUT=$(bash "$SA" assetlinks "$GOOD/assetlinks.json" "$PKG" "$(printf '%s' "$UPLOAD_FP" | tr 'A-F' 'a-f')" 2>/dev/null); A_RC=$?
assert_eq 0 "$A_RC" "assetlinks: required fingerprint argument is case-normalized"

A_ERR=$(bash "$SA" assetlinks "$GOOD/assetlinks.json" "$PKG" "$UPLOAD_FP,$GHOST_FP" 2>&1 >/dev/null); A_RC=$?
assert_eq 1 "$A_RC" "assetlinks: a required fingerprint absent → INVALID"
assert_contains "$A_ERR" "fingerprint-missing" "assetlinks: missing fingerprint rule named"

A_ERR=$(bash "$SA" assetlinks "$BAD/assetlinks.json" "$PKG" "$UPLOAD_FP" 2>&1 >/dev/null); A_RC=$?
assert_eq 1 "$A_RC" "assetlinks: lowercase fingerprint + wrong package → INVALID"
assert_contains "$A_ERR" "fingerprint-format" "assetlinks: format rule named (uppercase colon SHA-256)"
assert_contains "$A_ERR" "package" "assetlinks: package rule named"

bash "$SA" assetlinks "$GOOD/assetlinks.json" "com.example.other" "$UPLOAD_FP" >/dev/null 2>&1; A_RC=$?
assert_eq 1 "$A_RC" "assetlinks: statement for another package → INVALID"

bash "$SA" assetlinks "$T/nope.json" "$PKG" "$UPLOAD_FP" >/dev/null 2>&1; A_RC=$?
assert_eq 2 "$A_RC" "assetlinks: missing file → exit 2"

# ============================================================================
printf '\n--- score-android: twa (twa-manifest.json contract) ---\n'
# ============================================================================

W_OUT=$(bash "$SA" twa "$GOOD/twa-manifest.json" "$ORIGIN" 2>/dev/null); W_RC=$?
assert_eq "TWA: VALID" "$W_OUT" "twa: compliant twa-manifest → VALID"
assert_eq 0 "$W_RC" "twa: valid → exit 0"

W_ERR=$(bash "$SA" twa "$GOOD/twa-manifest.json" "https://other.example.com" 2>&1 >/dev/null); W_RC=$?
assert_eq 1 "$W_RC" "twa: host differs from the deployment origin → INVALID"
assert_contains "$W_ERR" "host" "twa: host rule named"

W_ERR=$(bash "$SA" twa "$BAD/twa-manifest.json" "$ORIGIN" 2>&1 >/dev/null); W_RC=$?
assert_eq 1 "$W_RC" "twa: planted defects → INVALID"
assert_contains "$W_ERR" "host" "twa: scheme+path in host flagged"
assert_contains "$W_ERR" "startUrl" "twa: relative startUrl without leading slash flagged"
assert_contains "$W_ERR" "signingKey-public" "twa: keystore under public/ flagged (would be served to the world)"
assert_contains "$W_ERR" "navigationColor" "twa: missing required field named"
assert_contains "$W_ERR" "appVersionCode" "twa: non-integer appVersionCode flagged"

bash "$SA" twa "$T/nope.json" "$ORIGIN" >/dev/null 2>&1; W_RC=$?
assert_eq 2 "$W_RC" "twa: missing file → exit 2"

# ============================================================================
printf '\n--- score-android: csp (worker/manifest sources survive strict-dynamic) ---\n'
# ============================================================================

C_OUT=$(bash "$SA" csp "$(cat "$GOOD/csp.txt")" 2>/dev/null); C_RC=$?
assert_eq "CSP: OK" "$C_OUT" "csp: worker-src + manifest-src 'self' → OK"
assert_eq 0 "$C_RC" "csp: ok → exit 0"

C_ERR=$(bash "$SA" csp "$(cat "$BAD/csp.txt")" 2>&1 >/dev/null); C_RC=$?
assert_eq 1 "$C_RC" "csp: strict-dynamic nonce script-src with no worker-src → FLAGGED"
assert_contains "$C_ERR" "worker-src" "csp: worker-src fall-through named"

C_OUT=$(bash "$SA" csp "default-src 'self'" 2>/dev/null); C_RC=$?
assert_eq "CSP: OK" "$C_OUT" "csp: default-src 'self' covers workers + manifest"

C_ERR=$(bash "$SA" csp "default-src 'none'; script-src 'self'" 2>&1 >/dev/null); C_RC=$?
assert_eq 1 "$C_RC" "csp: manifest falls to default-src 'none' → FLAGGED"
assert_contains "$C_ERR" "manifest-src" "csp: manifest-src fall-through named"

C_OUT=$(bash "$SA" csp "" 2>/dev/null); C_RC=$?
assert_eq "CSP: OK" "$C_OUT" "csp: no CSP header → OK (nothing blocks)"
C_ERR=$(bash "$SA" csp "" 2>&1 >/dev/null)
assert_contains "$C_ERR" "no CSP" "csp: absence noted on stderr"

# ============================================================================
printf '\n--- score-android: fingerprint (keytool / apksigner normalization) ---\n'
# ============================================================================

F_OUT=$(bash "$SA" fingerprint "$GOOD/keytool.txt" 2>/dev/null); F_RC=$?
assert_eq "FINGERPRINT: $UPLOAD_FP" "$F_OUT" "fingerprint: keytool -list -v SHA256 line extracted"
assert_eq 0 "$F_RC" "fingerprint: found → exit 0"

F_OUT=$(bash "$SA" fingerprint "$GOOD/apksigner.txt" 2>/dev/null)
assert_eq "FINGERPRINT: $UPLOAD_FP" "$F_OUT" "fingerprint: apksigner lowercase hex normalized to colon uppercase"

F_OUT=$(bash "$SA" fingerprint "$BAD/keytool.txt" 2>/dev/null); F_RC=$?
assert_eq "FINGERPRINT: NONE" "$F_OUT" "fingerprint: SHA1-only output → NONE"
assert_eq 1 "$F_RC" "fingerprint: none → exit 1"

bash "$SA" fingerprint "$T/nope.txt" >/dev/null 2>&1; F_RC=$?
assert_eq 2 "$F_RC" "fingerprint: missing file → exit 2"

# ============================================================================
printf '\n--- score-android: live (deployed-origin trust surfaces) ---\n'
# ============================================================================

serve_fixture() { # $1 port, $2 mode (good|bad) — self-exits after 60s
  node -e '
    const http=require("http"),fs=require("fs"),path=require("path");
    const root=process.argv[1], port=+process.argv[2], mode=process.argv[3];
    const types={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".webmanifest":"application/manifest+json",".json":"application/json"};
    http.createServer((q,r)=>{
      const u=q.url.split("?")[0];
      if(u==="/.well-known/assetlinks.json"&&mode==="bad"){r.writeHead(302,{location:"/assetlinks-moved.json"});r.end();return}
      if(u==="/manifest.webmanifest"&&mode==="bad"){r.writeHead(404,{"content-type":"text/plain"});r.end("nf");return}
      let f = u==="/"?"/index.html":(u==="/offline"?"/offline.html":u);
      fs.readFile(path.join(root,f),(e,d)=>{
        if(e){r.writeHead(404,{"content-type":"text/plain"});r.end("nf");return}
        r.writeHead(200,{"content-type":types[path.extname(f)]||"application/octet-stream","cache-control":"no-cache, no-store, must-revalidate"});r.end(d)});
    }).listen(port,"127.0.0.1");
    setTimeout(()=>process.exit(0),60000);
  ' "$SITE" "$1" "$2" >/dev/null 2>&1 &
  echo $!
}

SRV=$(serve_fixture 48732 good); sleep 1
L_OUT=$(ANDROID_DAL=0 bash "$SA" live "http://127.0.0.1:48732" "$PKG" "$UPLOAD_FP" 2>"$T/live-good.err"); L_RC=$?
assert_eq "ANDROID_LIVE: 8/8" "$L_OUT" "live: every trust surface answers on the fixture site → 8/8"
assert_eq 0 "$L_RC" "live: all green → exit 0"
assert_contains "$(cat "$T/live-good.err")" "check assetlinks-200-direct: PASS" "live: per-check PASS lines on stderr"
assert_contains "$(cat "$T/live-good.err")" "check dal-linked: SKIP" "live: DAL check skippable (ANDROID_DAL=0) and said so"
L_LINES=$(ANDROID_DAL=0 bash "$SA" live "http://127.0.0.1:48732" "$PKG" "$UPLOAD_FP" 2>/dev/null | wc -l | tr -d ' ')
assert_eq "1" "$L_LINES" "live: stdout is exactly one line"
kill "$SRV" 2>/dev/null; wait "$SRV" 2>/dev/null

SRV=$(serve_fixture 48733 bad); sleep 1
L_OUT=$(ANDROID_DAL=0 bash "$SA" live "http://127.0.0.1:48733" "$PKG" "$UPLOAD_FP" 2>"$T/live-bad.err"); L_RC=$?
assert_eq "ANDROID_LIVE: 4/8" "$L_OUT" "live: redirected assetlinks + missing manifest → 4/8"
assert_eq 1 "$L_RC" "live: any red surface → exit 1"
assert_contains "$(cat "$T/live-bad.err")" "check assetlinks-200-direct: FAIL" "live: 302 on assetlinks is a FAIL (no redirects allowed)"
assert_contains "$(cat "$T/live-bad.err")" "check manifest-200: FAIL" "live: missing manifest is a FAIL"
kill "$SRV" 2>/dev/null; wait "$SRV" 2>/dev/null

L_OUT=$(ANDROID_DAL=0 bash "$SA" live "http://127.0.0.1:1" "$PKG" "$UPLOAD_FP" 2>/dev/null); L_RC=$?
assert_eq "ANDROID_LIVE: 0/8" "$L_OUT" "live: unreachable origin → 0/8, never a crash"
assert_eq 1 "$L_RC" "live: unreachable → exit 1"

# ============================================================================
printf '\n--- score-android: verdict (the store-readiness gate) ---\n'
# ============================================================================

V_OUT=$(bash "$SA" verdict "$GOOD/android-results.tsv" 2>/dev/null); V_RC=$?
assert_eq "ANDROID_VERDICT: STORE_READY" "$V_OUT" "verdict: all gates pass with evidence → STORE_READY"
assert_eq 0 "$V_RC" "verdict: ready → exit 0"
V_LINES=$(bash "$SA" verdict "$GOOD/android-results.tsv" 2>/dev/null | wc -l | tr -d ' ')
assert_eq "1" "$V_LINES" "verdict: stdout is exactly one line"
V_ERR=$(bash "$SA" verdict "$GOOD/android-results.tsv" 2>&1 >/dev/null)
assert_contains "$V_ERR" "gates=11/11" "verdict: eleven required gates counted"

V_OUT=$(bash "$SA" verdict "$GOOD/android-results.tsv" --strict-evidence 2>/dev/null); V_RC=$?
assert_eq "ANDROID_VERDICT: STORE_READY" "$V_OUT" "verdict --strict-evidence: resolving evidence keeps STORE_READY"

V_ERR=$(bash "$SA" verdict "$BAD/android-results.tsv" 2>&1 >/dev/null); V_RC=$?
assert_eq 1 "$V_RC" "verdict: a failed gate row → BLOCKED"
assert_contains "$V_ERR" "device-applinks-verified" "verdict: the failing gate is named"

V_OUT=$(bash "$SA" verdict "$BAD/android-results-noevidence.tsv" 2>/dev/null)
assert_eq "ANDROID_VERDICT: STORE_READY" "$V_OUT" "verdict: non-strict trusts a pass row without evidence"
V_OUT=$(bash "$SA" verdict "$BAD/android-results-noevidence.tsv" --strict-evidence 2>"$T/strict.err"); V_RC=$?
assert_eq "ANDROID_VERDICT: BLOCKED" "$V_OUT" "verdict --strict-evidence: pass row without evidence → BLOCKED"
assert_eq 1 "$V_RC" "verdict: strict blocked → exit 1"
assert_contains "$(cat "$T/strict.err")" "evidence_violations=1" "verdict: violation count reported"

V_ERR=$(bash "$SA" verdict "$BAD/android-results-missing-gate.tsv" 2>&1 >/dev/null); V_RC=$?
assert_eq 1 "$V_RC" "verdict: a required gate never recorded → BLOCKED"
assert_contains "$V_ERR" "missing gate: device-launch" "verdict: missing gate named"

V_ERR=$(bash "$SA" verdict "$BAD/android-results-skipgate.tsv" 2>&1 >/dev/null); V_RC=$?
assert_eq 1 "$V_RC" "verdict: a required gate skipped → BLOCKED (skip is not proof)"
assert_contains "$V_ERR" "trust-dal-linked" "verdict: skipped gate named"

bash "$SA" verdict "$T/nope.tsv" >/dev/null 2>&1; V_RC=$?
assert_eq 2 "$V_RC" "verdict: missing ledger → exit 2"

mkdir -p "$T/run" && cp "$GOOD/android-results.tsv" "$T/run/" && cp -r "$GOOD/evidence" "$T/run/"
AR_SCORE_LOG=1 bash "$SA" verdict "$T/run/android-results.tsv" >/dev/null 2>&1
[[ -f "$T/run/score-log.tsv" ]] && pass "verdict: score-log.tsv written next to the ledger" || fail "verdict: score-log.tsv missing"
SL_HASH=$(tail -1 "$T/run/score-log.tsv" 2>/dev/null | awk -F'\t' '{print $4}')
[[ -n "$SL_HASH" && "$SL_HASH" != "nohash" ]] && pass "verdict: score-log line carries a content hash" || fail "verdict: score-log hash missing"

# ============================================================================
printf '\n--- android.md engagement spec ---\n'
# ============================================================================

[[ -f "$SPEC" ]] && pass "spec exists" || fail "spec missing: $SPEC"
spec_has "name: forge:android"                         "frontmatter name"
spec_has "EXECUTE IMMEDIATELY"                         "executes immediately"
spec_has "score-android\.sh"                           "seam script wired"
spec_has "android-protocol\.md"                        "protocol reference wired"
spec_has "doctor\.sh"                                  "doctor preflight"
spec_has "Target:"                                     "Target argument (the built app)"
spec_has "Url:"                                        "Url argument (production origin)"
spec_has "Package:"                                    "Package argument"
spec_has "Fingerprints:"                               "Fingerprints argument (Play App Signing loop)"
spec_has "Track:"                                      "Track argument (Play track)"
spec_has "Trusted Web Activity"                        "TWA lane named in full"
spec_has "native-needs\.md"                            "native-needs matrix deliverable"
spec_has "BLOCKED"                                     "native-only need → BLOCKED, never faked"
spec_has "manifest\.ts"                                "Next.js app/manifest.ts"
spec_has "sw\.js"                                      "service worker file"
spec_has "/offline"                                    "offline route"
spec_has "\.well-known/assetlinks\.json"               "assetlinks path"
spec_has "worker-src"                                  "CSP worker-src"
spec_has "manifest-src"                                "CSP manifest-src"
spec_has "allowlist"                                   "middleware allowlist for trust/PWA paths"
spec_has "pwa\.spec\.ts"                               "app-side e2e guards the PWA surfaces"
spec_has "keytool"                                     "keystore + fingerprint via keytool"
spec_has "gitignore"                                   "keystore + passwords gitignored"
spec_has "gh secret set"                               "secrets pushed via gh, never echoed"
spec_has "BUBBLEWRAP_KEYSTORE_PASSWORD"                "bubblewrap CI env passwords"
spec_has "twa-manifest\.json"                          "twa-manifest.json"
spec_has "appVersionCode"                              "versionCode field"
spec_has "rev-list --count"                            "versionCode monotone from git"
spec_has "bubblewrap update"                           "bubblewrap update regenerates the project"
spec_has "--skipPwaValidation"                         "bubblewrap build flag for CI"
spec_has "app-release-bundle\.aab"                     "AAB artifact"
spec_has "app-release-signed\.apk"                     "APK artifact"
spec_has "package-fingerprint-match"                   "ledger gate: package-fingerprint-match"
spec_has "assetlinks:check"                            "DAL API check"
spec_has "Play App Signing"                            "Play App Signing second fingerprint"
spec_has "android-results\.tsv"                        "results ledger"
spec_has "evidence:"                                   "evidence-anchored rows"
spec_has "Pixel 7|390x844"                             "mobile viewport fidelity"
spec_has "contact sheet"                               "contact sheet reviewed"
spec_has "android-device-gate\.yml"                    "device gate workflow"
spec_has "google_apis"                                 "emulator image with Chrome"
spec_has "KVM|kvm"                                     "KVM enablement"
spec_has "first-run|First-run|FRE"                     "Chrome first-run dismissal"
spec_has "pm get-app-links"                            "app-links verification command"
spec_has "verified"                                    "verified state asserted"
spec_has "gh run download"                             "device evidence pulled from CI"
spec_has "android-release\.yml"                        "release workflow"
spec_has "1024.?[x×].?500"                             "feature graphic size"
spec_has "data-safety"                                 "data safety sheet"
spec_has "privacy"                                     "privacy policy URL"
spec_has "human-gated|explicit user approval|EXPLICIT USER APPROVAL" "Play upload + tag human-gated"
spec_has "AskUserQuestion"                             "one confirmation question"
spec_has "speed-protocol\.md"                          "fast-path cadence"
spec_has "STORE_READY"                                 "verdict tokens"
spec_has "version \"3\.1\.0\""                         "handoff pins 3.1.0"
spec_has "validate-handoff\.sh.*android"               "handoff validated with android source"
spec_has "chain.*ship|--chain ship"                    "chains to ship"
spec_has "device-relay"                                "phone evidence via device-relay"
spec_has "score-build\.sh bound"                       "iteration bound reuses build seam"

# ============================================================================
printf '\n--- android protocol (the contract) ---\n'
# ============================================================================

[[ -f "$PROTO" ]] && pass "protocol exists" || fail "protocol missing: $PROTO"
proto_has "Digital Asset Links"                        "DAL explained"
proto_has "crash"                                      "TWA crash criteria"
proto_has "404|5xx"                                    "navigation 404/5xx criterion"
proto_has "offline"                                    "offline criterion"
proto_has "application/json"                           "assetlinks content-type rule"
proto_has "redirect"                                   "assetlinks no-redirect rule"
proto_has "uppercase"                                  "fingerprint format rule"
proto_has "Play App Signing"                           "Play App Signing loop"
proto_has "App integrity"                              "where the Play fingerprint lives"
proto_has "reactivecircus/android-emulator-runner"     "emulator runner action"
proto_has "99-kvm4all\.rules"                          "KVM udev rule"
proto_has "google_apis"                                "image with Chrome"
proto_has "pm verify-app-links"                        "re-verify command"
proto_has "uiautomator"                                "first-run dismissal mechanism"
proto_has "appVersionCode"                             "versionCode rule"
proto_has "4000"                                       "listing full-description limit"
proto_has "1024"                                       "feature graphic width"
proto_has "native-only|native-needs|Native needs"      "native-needs matrix"
proto_has "playBilling"                                "Play Billing via twa feature"
proto_has "BUBBLEWRAP_KEY_PASSWORD"                    "key password env"
proto_has "gh secret set"                              "secrets handling"
proto_has "manifest\.ts"                               "manifest.ts template"
proto_has "worker-src 'self'"                          "CSP line"
proto_has "device-relay"                               "phone evidence routine"
proto_has "STORE_READY"                                "verdict semantics"
proto_has "pwa\.spec\.ts"                              "app-side e2e template"
proto_has "foreground service|background location"    "native-only examples"
proto_has "skipWaiting|clients\.claim"                 "service worker template"
proto_has "setup-java"                                 "JDK 17 in CI"
proto_has "upload-google-play"                         "Play upload action"
proto_has "required reviewers|Required reviewers"      "GitHub environment human gate"
proto_has "assetlinks:check"                           "DAL API endpoint"

# ============================================================================
printf '\n--- handoff wiring: validate-handoff android case ---\n'
# ============================================================================

_h="$T/handoff.json"
printf '{"version":"3.1.0","source":"android","timestamp":"2026-01-01T00:00:00+00:00","status":"COMPLETE","verdict":"STORE_READY","results_tsv":"android-results.tsv"}' > "$_h"
H_OUT=$(bash "$VH" "$_h" android 2>/dev/null); H_RC=$?
assert_eq "VALID" "$H_OUT" "handoff: android with verdict + results_tsv → VALID"
assert_eq 0 "$H_RC" "handoff: valid → exit 0"

printf '{"version":"3.1.0","source":"android","timestamp":"2026-01-01T00:00:00+00:00","status":"BLOCKED","verdict":"BLOCKED","results_tsv":"a.tsv","native_needs":["background location"]}' > "$_h"
H_OUT=$(bash "$VH" "$_h" android 2>/dev/null)
assert_eq "VALID" "$H_OUT" "handoff: BLOCKED verdict is a valid handoff (honest stop)"

printf '{"version":"3.1.0","source":"android","timestamp":"t","status":"COMPLETE","verdict":"MAYBE","results_tsv":"a.tsv"}' > "$_h"
bash "$VH" "$_h" android >/dev/null 2>&1; H_RC=$?
assert_eq 1 "$H_RC" "handoff: verdict outside STORE_READY|BLOCKED → INVALID"

printf '{"version":"3.1.0","source":"android","timestamp":"t","status":"COMPLETE","verdict":"STORE_READY"}' > "$_h"
H_ERR=$(bash "$VH" "$_h" 2>&1 >/dev/null); H_RC=$?
assert_eq 1 "$H_RC" "handoff: missing results_tsv → INVALID"
assert_contains "$H_ERR" "results_tsv" "handoff: missing-results error names the field"

printf '{"version":"3.1.0","source":"android","timestamp":"t","status":"COMPLETE","results_tsv":"a.tsv"}' > "$_h"
bash "$VH" "$_h" android >/dev/null 2>&1; H_RC=$?
assert_eq 1 "$H_RC" "handoff: missing verdict → INVALID"

printf '{"version":"3.1.0","source":"android","timestamp":"t","status":"COMPLETE","verdict":"STORE_READY","results_tsv":"a.tsv"}' > "$_h"
bash "$VH" "$_h" ship >/dev/null 2>&1; H_RC=$?
assert_eq 1 "$H_RC" "handoff: expected-source mismatch → INVALID"

SCHEMA="$REPO_ROOT/claude-plugin/skills/forge/references/handoff-schema.md"
grep -q 'android' "$SCHEMA" && pass "handoff-schema documents android source" || fail "handoff-schema missing android source"
grep -q 'STORE_READY' "$SCHEMA" && pass "handoff-schema names the android verdict enum" || fail "handoff-schema missing STORE_READY"

# ============================================================================
printf '\n--- orchestrator routing: package-android archetype ---\n'
# ============================================================================

C_OUT=$(bash "$ORCH" classify "convert the web app to an android app" 2>/dev/null)
assert_eq "package-android" "$C_OUT" "classify: convert to android → package-android"
C_OUT=$(bash "$ORCH" classify "publish the apk to the play store" 2>/dev/null)
assert_eq "package-android" "$C_OUT" "classify: apk/play store → package-android"
C_OUT=$(bash "$ORCH" classify "wrap the PWA as a TWA for google play" 2>/dev/null)
assert_eq "package-android" "$C_OUT" "classify: TWA/google play → package-android"
C_OUT=$(bash "$ORCH" classify "harden the android app login" 2>/dev/null)
assert_eq "harden" "$C_OUT" "classify: security keeps priority over android"
C_OUT=$(bash "$ORCH" classify "fix the android build" 2>/dev/null)
assert_eq "package-android" "$C_OUT" "classify: android wins over an incidental fix mention"
grep -q 'package-android' "$REPO_ROOT/claude-plugin/skills/forge/references/orchestrator-routing.md" \
  && pass "routing reference lists package-android" || fail "routing reference missing package-android"

# ============================================================================
printf '\n--- doctor: android toolchain rows ---\n'
# ============================================================================

D_OUT=$(bash "$DOC" 2>/dev/null)
assert_contains "$D_OUT" "bubblewrap" "doctor: bubblewrap row"
assert_contains "$D_OUT" "keytool" "doctor: keytool row"
grep -q '21 commands' "$DOC" && pass "doctor: header counts 21 commands" || fail "doctor: header still not at 21 commands"

# ============================================================================
printf '\n--- distribution: mirror parity (5 surfaces byte-identical) ---\n'
# ============================================================================

MIRRORS=(
  "$REPO_ROOT/.claude/commands/forge/android.md"
  "$REPO_ROOT/.agents/skills/forge/android.md"
  "$REPO_ROOT/plugins/forge/skills/forge/android.md"
  "$REPO_ROOT/.opencode/commands/forge_android.md"
)
for m in "${MIRRORS[@]}"; do
  if [[ -f "$SPEC" && -f "$m" ]] && diff -q "$SPEC" "$m" >/dev/null 2>&1; then
    pass "mirror parity: ${m#$REPO_ROOT/}"
  else
    fail "mirror parity: ${m#$REPO_ROOT/} (missing or diverged)"
  fi
done

for d in .claude/skills/forge claude-plugin/skills/forge .agents/skills/forge plugins/forge/skills/forge .opencode/skills/forge; do
  if [[ -f "$PROTO" ]] && diff -q "$PROTO" "$REPO_ROOT/$d/references/android-protocol.md" >/dev/null 2>&1; then
    pass "protocol parity: $d"
  else
    fail "protocol parity: $d (missing or diverged)"
  fi
  for s in score-android.sh validate-handoff.sh orchestrate.sh doctor.sh; do
    if [[ -f "$REPO_ROOT/scripts/$s" ]] && diff -q "$REPO_ROOT/scripts/$s" "$REPO_ROOT/$d/scripts/$s" >/dev/null 2>&1; then
      pass "seam parity: $d/scripts/$s"
    else
      fail "seam parity: $d/scripts/$s (missing or diverged)"
    fi
  done
done

grep -q 'score-android\.sh' "$REPO_ROOT/scripts/transform.sh" \
  && pass "transform.sh syncs score-android.sh" || fail "transform.sh missing score-android.sh in runtime set"

# ============================================================================
printf '\n--- distribution: manifests + routers at 21 commands / 3.6.0 ---\n'
# ============================================================================

for mf in "$REPO_ROOT/.claude-plugin/marketplace.json" \
          "$REPO_ROOT/claude-plugin/.claude-plugin/plugin.json" \
          "$REPO_ROOT/plugins/forge/.codex-plugin/plugin.json"; do
  name="${mf#$REPO_ROOT/}"
  grep -q "21 commands" "$mf" && pass "manifest count 21: $name" || fail "manifest count 21: $name"
  grep -q "research, android" "$mf" && pass "manifest lists android: $name" || fail "manifest lists android: $name"
done
grep -q '"version": "3.6.0"' "$REPO_ROOT/.claude-plugin/marketplace.json" \
  && pass "marketplace at 3.6.0" || fail "marketplace not at 3.6.0"
grep -q '"version": "3.6.0"' "$REPO_ROOT/claude-plugin/.claude-plugin/plugin.json" \
  && pass "claude plugin at 3.6.0" || fail "claude plugin not at 3.6.0"
grep -q '"version": "3.6.0-codex.0"' "$REPO_ROOT/plugins/forge/.codex-plugin/plugin.json" \
  && pass "codex plugin at 3.6.0-codex.0" || fail "codex plugin not at 3.6.0-codex.0"

for sk in .claude/skills/forge/SKILL.md claude-plugin/skills/forge/SKILL.md \
          .agents/skills/forge/SKILL.md plugins/forge/skills/forge/SKILL.md \
          .opencode/skills/forge/SKILL.md; do
  grep -q 'android' "$REPO_ROOT/$sk" && pass "router lists android: $sk" || fail "router lists android: $sk"
  grep -q 'version: 3.6.0' "$REPO_ROOT/$sk" && pass "router at 3.6.0: $sk" || fail "router at 3.6.0: $sk"
done
grep -q '/forge:android' "$REPO_ROOT/.claude/skills/forge/SKILL.md" \
  && pass "claude router uses colon naming" || fail "claude router missing /forge:android"
grep -q '\$forge android' "$REPO_ROOT/.agents/skills/forge/SKILL.md" \
  && pass "codex router uses \$forge naming" || fail "codex router missing \$forge android"
grep -q '/forge_android' "$REPO_ROOT/.opencode/skills/forge/SKILL.md" \
  && pass "opencode router uses underscore naming" || fail "opencode router missing /forge_android"
grep -q 'Track:' "$REPO_ROOT/.claude/skills/forge/SKILL.md" \
  && pass "router documents the Track: flag" || fail "router missing Track: flag"

for ck in .claude/hooks/forge/.ckignore claude-plugin/hooks/.ckignore; do
  grep -q '^\.gradle/' "$REPO_ROOT/$ck" && pass "ckignore blocks .gradle/: $ck" || fail "ckignore missing .gradle/: $ck"
done

# ============================================================================
printf '\n--- docs: README, guide, changelog, agents ---\n'
# ============================================================================

grep -q '`/forge:android`' "$REPO_ROOT/README.md" && pass "README command table row" || fail "README missing /forge:android row"
grep -q 'All 21 commands' "$REPO_ROOT/README.md" && pass "README counts 21 commands" || fail "README still not at 21 commands"
grep -q '20 subcommand files (21 commands total)' "$REPO_ROOT/README.md" && pass "README structure counts updated" || fail "README structure count stale"
[[ -f "$REPO_ROOT/guide/forge-android.md" ]] && pass "guide/forge-android.md exists" || fail "guide/forge-android.md missing"
grep -q 'forge-android\.md' "$REPO_ROOT/guide/README.md" && pass "guide index links forge-android" || fail "guide index missing forge-android"
grep -q '^## v3\.6\.0' "$REPO_ROOT/docs/project-changelog.md" && pass "changelog has v3.6.0 entry" || fail "changelog missing v3.6.0"
grep -q '21 commands' "$REPO_ROOT/AGENTS.md" && pass "AGENTS.md counts 21 commands" || fail "AGENTS.md count stale"

rm -rf "$T"

# ============================================================================
printf '\n=== %d/%d passed (%d failed) ===\n' "$PASS" "$TOTAL" "$FAIL"
# ============================================================================
[[ "$FAIL" -eq 0 ]]
