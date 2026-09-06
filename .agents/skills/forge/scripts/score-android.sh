#!/usr/bin/env bash
# score-android.sh — mechanical seam for /forge:android (forge web app → TWA Android app).
#
#   manifest    <manifest.webmanifest>                    → MANIFEST: VALID icons=N | MANIFEST: INVALID
#   assetlinks  <assetlinks.json> <packageId> <fp[,fp…]>  → ASSETLINKS: VALID fingerprints=N | ASSETLINKS: INVALID
#   twa         <twa-manifest.json> <origin>              → TWA: VALID | TWA: INVALID
#   csp         "<Content-Security-Policy header value>"  → CSP: OK | CSP: FLAGGED
#   fingerprint <keytool -list -v | apksigner output>     → FINGERPRINT: AA:BB:…:FF | FINGERPRINT: NONE
#   live        <origin> <packageId> <fp> [--start /p] [--offline /p]
#                                                         → ANDROID_LIVE: N/M   (ANDROID_DAL=0 skips the Google DAL API row)
#   verdict     <android-results.tsv> [--strict-evidence] → ANDROID_VERDICT: STORE_READY | ANDROID_VERDICT: BLOCKED
#
# Contract: exactly ONE stdout line per invocation (the headline); every reason goes to
# stderr as `bad: <rule>` / `check <name>: PASS|FAIL|SKIP`. exit 0 ok · 1 invalid/flagged/
# blocked · 2 file missing/unreadable · 64 usage. JSON is parsed with node's real parser —
# node is a CORE dependency of the harness (hooks, doctor, validate-handoff).
set -uo pipefail

SUB="${1:-}"
[[ -n "$SUB" ]] || { grep '^#' "$0" | sed 's/^# \{0,1\}//' | sed -n '2,16p' >&2; exit 64; }
shift

need_file() { # $1 path, $2 headline prefix printed on the missing-file path
  if [[ ! -f "$1" ]]; then echo "$2: INVALID"; echo "file not found: $1" >&2; exit 2; fi
}

# ---------------------------------------------------------------------------
# log_invocation: audit line in score-log.tsv next to the scored ledger
# (same shape as score-build.sh — ts · sub · file · content hash · headline).
# AR_SCORE_LOG=0 disables it (test suites scoring fixtures must not dirty the repo).
# ---------------------------------------------------------------------------
log_invocation() {
  local sub="$1" file="$2" headline="$3" dir ts sha
  [[ "${AR_SCORE_LOG:-1}" == "1" ]] || return 0
  dir="$(dirname "$file")" || return 0
  [[ -d "$dir" && -w "$dir" ]] || return 0
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)" || ts="unknown"
  sha="$(sha256sum "$file" 2>/dev/null | cut -c1-16)" || sha=""
  printf '%s\t%s\t%s\t%s\t%s\n' "$ts" "$sub" "$(basename "$file")" "${sha:-nohash}" "$headline" \
    >> "$dir/score-log.tsv" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# manifest: PWA installability floor — the TWA quality criteria start here.
# ---------------------------------------------------------------------------
manifest() {
  local f="${1:?usage: manifest <manifest.webmanifest>}"
  need_file "$f" "MANIFEST"
  node -e '
    const fs = require("fs");
    let j;
    try { j = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); }
    catch { console.error("bad: json"); console.log("MANIFEST: INVALID"); process.exit(1); }
    const bad = [];
    const str = (k) => typeof j[k] === "string" && j[k].trim() !== "";
    if (!str("name")) bad.push("name");
    if (!str("short_name")) bad.push("short_name");
    if (!str("start_url") || !(j.start_url.startsWith("/") || /^https:\/\//.test(j.start_url))) bad.push("start_url");
    if (!["standalone", "fullscreen", "minimal-ui"].includes(j.display)) bad.push("display");
    if (!str("theme_color")) bad.push("theme_color");
    if (!str("background_color")) bad.push("background_color");
    const icons = Array.isArray(j.icons) ? j.icons : [];
    const px = (i) => String(i.sizes || "").split(/\s+/).map((s) => parseInt(s, 10) || 0);
    const isPng = (i) => i.type === "image/png" || /\.png(\?|$)/i.test(String(i.src || ""));
    const has = (n) => icons.some((i) => isPng(i) && px(i).some((p) => p >= n));
    if (!has(192)) bad.push("icon-192");
    if (!has(512)) bad.push("icon-512");
    const maskable = icons.some((i) => /\bmaskable\b/.test(String(i.purpose || "")));
    console.error(`icons=${icons.length} maskable=${maskable ? "yes" : "no"}`);
    for (const b of bad) console.error("bad: " + b);
    console.log(bad.length ? "MANIFEST: INVALID" : `MANIFEST: VALID icons=${icons.length}`);
    process.exit(bad.length ? 1 : 0);
  ' "$f"
}

# ---------------------------------------------------------------------------
# assetlinks: the Digital Asset Links statement — package + every required
# fingerprint (upload key AND Play App Signing key) in uppercase colon form.
# ---------------------------------------------------------------------------
assetlinks() {
  local f="${1:?usage: assetlinks <assetlinks.json> <packageId> <fp[,fp…]>}"
  local pkg="${2:?packageId required}" fps="${3:?fingerprint list required}"
  need_file "$f" "ASSETLINKS"
  node -e '
    const fs = require("fs");
    const [file, pkg, fpList] = process.argv.slice(1);
    const FP = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
    const REL = "delegate_permission/common.handle_all_urls";
    let j;
    try { j = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch { console.error("bad: json"); console.log("ASSETLINKS: INVALID"); process.exit(1); }
    const bad = [];
    if (!Array.isArray(j)) { bad.push("array"); j = []; }
    const stmts = j.filter((s) => s && s.target && typeof s.target === "object");
    for (const s of stmts) {
      for (const fp of (s.target.sha256_cert_fingerprints || [])) {
        if (!FP.test(String(fp))) bad.push("fingerprint-format " + fp);
      }
    }
    const mine = stmts.filter((s) => s.target.namespace === "android_app" && s.target.package_name === pkg);
    if (!mine.length) bad.push("package " + pkg + " (no android_app statement)");
    const related = mine.filter((s) => Array.isArray(s.relation) && s.relation.includes(REL));
    if (mine.length && !related.length) bad.push("relation " + REL);
    const present = new Set();
    for (const s of related) for (const fp of (s.target.sha256_cert_fingerprints || [])) present.add(String(fp).toUpperCase());
    const required = fpList.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
    for (const fp of required) if (!present.has(fp)) bad.push("fingerprint-missing " + fp);
    for (const b of bad) console.error("bad: " + b);
    console.log(bad.length ? "ASSETLINKS: INVALID" : `ASSETLINKS: VALID fingerprints=${present.size}`);
    process.exit(bad.length ? 1 : 0);
  ' "$f" "$pkg" "$fps"
}

# ---------------------------------------------------------------------------
# twa: twa-manifest.json contract — host is the bare deployment host, keystore
# never under public/, versionCode an integer, required Bubblewrap fields present.
# ---------------------------------------------------------------------------
twa() {
  local f="${1:?usage: twa <twa-manifest.json> <origin>}" origin="${2:?origin required}"
  need_file "$f" "TWA"
  node -e '
    const fs = require("fs");
    const [file, origin] = process.argv.slice(1);
    let j, host;
    try { j = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch { console.error("bad: json"); console.log("TWA: INVALID"); process.exit(1); }
    try { host = new URL(origin).host; } catch { console.error("bad: origin " + origin); console.log("TWA: INVALID"); process.exit(1); }
    const bad = [];
    const str = (v) => typeof v === "string" && v.trim() !== "";
    for (const k of ["host", "packageId", "name", "iconUrl", "startUrl", "backgroundColor", "themeColor", "navigationColor"]) {
      if (!str(j[k])) bad.push(k + " (missing)");
    }
    if (!j.signingKey || !str(j.signingKey.path)) bad.push("signingKey.path (missing)");
    if (!j.signingKey || !str(j.signingKey.alias)) bad.push("signingKey.alias (missing)");
    if (str(j.host) && (j.host !== host || /[\/:]/.test(j.host))) bad.push(`host ${j.host} != ${host} (bare host of the deployment origin, no scheme, no path)`);
    if (str(j.startUrl) && !j.startUrl.startsWith("/")) bad.push("startUrl must start with /");
    if (str(j.packageId) && !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(j.packageId)) bad.push("packageId not reverse-DNS");
    if ("appVersionCode" in j && !(Number.isInteger(j.appVersionCode) && j.appVersionCode >= 1)) bad.push("appVersionCode must be a positive integer");
    if (j.signingKey && str(j.signingKey.path) && /(^|\/)public\//.test(j.signingKey.path.replace(/\\/g, "/"))) bad.push("signingKey-public (keystore under public/ would be served to the world)");
    if (str(j.iconUrl) && !/^https:\/\//.test(j.iconUrl)) bad.push("iconUrl must be an https URL on the deployed host");
    for (const b of bad) console.error("bad: " + b);
    console.log(bad.length ? "TWA: INVALID" : "TWA: VALID");
    process.exit(bad.length ? 1 : 0);
  ' "$f" "$origin"
}

# ---------------------------------------------------------------------------
# csp: does the app's Content-Security-Policy let a same-origin service worker
# and manifest load? worker-src falls to child-src → script-src → default-src;
# a nonce + strict-dynamic script-src ignores host sources, so a worker request
# (which carries no nonce) is blocked unless worker-src is explicit.
# ---------------------------------------------------------------------------
csp() {
  local header="${1-}"
  node -e '
    const header = process.argv[1] || "";
    if (!header.trim()) { console.error("note: no CSP header — nothing blocks workers or the manifest"); console.log("CSP: OK"); process.exit(0); }
    const d = {};
    for (const part of header.split(";")) {
      const t = part.trim().split(/\s+/); if (!t[0]) continue;
      d[t[0].toLowerCase()] = t.slice(1);
    }
    const allowsSelf = (src) => src.some((s) => ["'"'"'self'"'"'", "*", "https:"].includes(s));
    const bad = [];
    const workerName = ["worker-src", "child-src", "script-src", "default-src"].find((k) => k in d);
    if (workerName) {
      const src = d[workerName];
      if (workerName !== "worker-src" && src.includes("'"'"'strict-dynamic'"'"'")) bad.push(`worker-src falls through to ${workerName} with '"'"'strict-dynamic'"'"' — sw.js carries no nonce; add worker-src '"'"'self'"'"'`);
      else if (!allowsSelf(src)) bad.push(`worker-src falls through to ${workerName} which does not allow '"'"'self'"'"'`);
    }
    const manifestName = ["manifest-src", "default-src"].find((k) => k in d);
    if (manifestName && !allowsSelf(d[manifestName])) bad.push(`manifest-src falls through to ${manifestName} which does not allow '"'"'self'"'"'; add manifest-src '"'"'self'"'"'`);
    for (const b of bad) console.error("bad: " + b);
    console.log(bad.length ? "CSP: FLAGGED" : "CSP: OK");
    process.exit(bad.length ? 1 : 0);
  ' "$header"
}

# ---------------------------------------------------------------------------
# fingerprint: pull the SHA-256 certificate fingerprint out of keytool -list -v
# or apksigner verify --print-certs output and normalize it to AA:BB:…:FF.
# ---------------------------------------------------------------------------
fingerprint() {
  local f="${1:?usage: fingerprint <keytool|apksigner output file>}"
  need_file "$f" "FINGERPRINT"
  node -e '
    const fs = require("fs");
    const t = fs.readFileSync(process.argv[1], "utf8");
    const m = t.match(/SHA-?256(?:\s*digest)?\s*:\s*([0-9A-Fa-f:]{64,95})/);
    const hex = m ? m[1].replace(/:/g, "").toUpperCase() : "";
    if (!/^[0-9A-F]{64}$/.test(hex)) { console.error("bad: no SHA-256 fingerprint found"); console.log("FINGERPRINT: NONE"); process.exit(1); }
    console.log("FINGERPRINT: " + hex.match(/.{2}/g).join(":"));
  ' "$f"
}

# ---------------------------------------------------------------------------
# live: the deployed origin's trust surfaces, as Chrome and Android will see them.
# assetlinks must be 200 + application/json with NO redirect (Android refuses to
# follow); manifest/sw/offline/start must answer; the Google DAL API must say linked.
# ---------------------------------------------------------------------------
live() {
  local origin="${1:?usage: live <origin> <packageId> <fp> [--start /p] [--offline /p]}"
  local pkg="${2:?packageId required}" fp="${3:?fingerprint required}"
  shift 3
  local start="/" offline="/offline"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --start) start="$2"; shift 2 ;;
      --offline) offline="$2"; shift 2 ;;
      *) echo "unknown flag: $1" >&2; exit 64 ;;
    esac
  done
  # Git Bash (MSYS) rewrites POSIX-looking argv AND env values ("/offline" → "C:/Program
  # Files/Git/offline") when it launches a native exe such as node. Everything this call
  # hands to node is a URL path, never a filesystem path, so conversion is off for this one
  # invocation only (file-taking subcommands still need it). Plain http/https requests with
  # agent:false (no keep-alive, no undici dispatcher) so the process drains and exits
  # cleanly — fetch + process.exit trips a libuv assertion on Windows.
  MSYS_NO_PATHCONV=1 ANDROID_START="$start" ANDROID_OFFLINE="$offline" node -e '
    const http = require("http"), https = require("https");
    const [origin, pkg, fp, dal] = process.argv.slice(1);
    const start = process.env.ANDROID_START || "/", offline = process.env.ANDROID_OFFLINE || "/offline";
    const FP = fp.toUpperCase();
    const REL = "delegate_permission/common.handle_all_urls";
    const request = (url, hops) => new Promise((resolve) => {
      let u; try { u = new URL(url); } catch { return resolve({ status: 0, type: "", body: "", err: "bad-url" }); }
      const mod = u.protocol === "https:" ? https : http;
      const req = mod.request(u, { method: "GET", agent: false, headers: { "user-agent": "forge-android-live/1", accept: "*/*" } }, (res) => {
        const loc = res.headers.location;
        if (hops > 0 && [301, 302, 303, 307, 308].includes(res.statusCode) && loc) {
          res.resume(); res.on("end", () => resolve(request(new URL(loc, u).href, hops - 1))); return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"] || "", body: Buffer.concat(chunks).toString("utf8") }));
      });
      req.setTimeout(8000, () => req.destroy(new Error("timeout")));
      req.on("error", (e) => resolve({ status: 0, type: "", body: "", err: e.code || e.message }));
      req.end();
    });
    const get = (path, opts = {}) => request(origin.replace(/\/$/, "") + path, opts.manual ? 0 : 5);
    (async () => {
      const results = [];
      const rec = (name, ok, detail) => { results.push(ok); console.error(`check ${name}: ${ok ? "PASS" : "FAIL"}${detail ? " " + detail : ""}`); };
      const al = await get("/.well-known/assetlinks.json", { manual: true, body: true });
      rec("assetlinks-200-direct", al.status === 200, `status=${al.status}${al.err ? " " + al.err : ""}`);
      rec("assetlinks-json", al.status === 200 && /application\/json/i.test(al.type), `content-type=${al.type || "-"}`);
      let linkedLocal = false;
      try {
        const j = JSON.parse(al.body);
        linkedLocal = Array.isArray(j) && j.some((s) => s && s.target && s.target.namespace === "android_app" && s.target.package_name === pkg
          && Array.isArray(s.relation) && s.relation.includes(REL)
          && (s.target.sha256_cert_fingerprints || []).map((x) => String(x).toUpperCase()).includes(FP));
      } catch {}
      rec("assetlinks-fingerprint", linkedLocal, `package=${pkg}`);
      let mf = await get("/manifest.webmanifest");
      if (mf.status !== 200) mf = await get("/manifest.json");
      rec("manifest-200", mf.status === 200, `status=${mf.status}`);
      const sw = await get("/sw.js");
      rec("sw-200", sw.status === 200, `status=${sw.status}`);
      rec("sw-js-type", sw.status === 200 && /javascript/i.test(sw.type), `content-type=${sw.type || "-"}`);
      const off = await get(offline);
      rec("offline-200", off.status === 200, `${offline} status=${off.status}`);
      const st = await get(start);
      rec("start-200", st.status === 200, `${start} status=${st.status}`);
      if (dal === "0") {
        console.error("check dal-linked: SKIP (ANDROID_DAL=0)");
      } else {
        const site = origin.replace(/\/$/, "");
        const url = `https://digitalassetlinks.googleapis.com/v1/assetlinks:check?source.web.site=${encodeURIComponent(site)}&relation=${encodeURIComponent(REL)}&target.androidApp.packageName=${encodeURIComponent(pkg)}&target.androidApp.certificate.sha256Fingerprint=${encodeURIComponent(FP)}`;
        let ok = false, detail = "";
        const r = await request(url, 0);
        try {
          const j = JSON.parse(r.body);
          ok = j && j.linked === true;
          detail = `linked=${j && j.linked} ${j && j.debugString ? j.debugString.slice(0, 120) : ""}`.trim();
        } catch { detail = `status=${r.status}${r.err ? " " + r.err : ""}`; }
        rec("dal-linked", ok, detail);
      }
      const n = results.filter(Boolean).length, m = results.length;
      console.log(`ANDROID_LIVE: ${n}/${m}`);
      process.exitCode = n === m ? 0 : 1;
    })();
  ' "$origin" "$pkg" "$fp" "${ANDROID_DAL:-1}"
}

# ---------------------------------------------------------------------------
# verdict: STORE_READY only when every required gate row is `pass` (with resolving
# evidence under --strict-evidence) and no row anywhere failed. skip is not proof.
# TSV columns (tab): spec dimension assertion weight status detail [traces]
# ---------------------------------------------------------------------------
GATES="pwa-manifest,pwa-sw-offline,trust-assetlinks-live,trust-dal-linked,package-signed,package-fingerprint-match,fidelity-mobile-web,device-applinks-verified,device-launch,release-workflow,release-store-pack"

verdict() {
  local a args=() strict="${ANDROID_EVIDENCE_STRICT:-0}"
  for a in "$@"; do
    if [[ "$a" == "--strict-evidence" ]]; then strict=1; else args+=("$a"); fi
  done
  local f="${args[0]:-}"
  [[ -n "$f" ]] || { echo "usage: verdict <android-results.tsv> [--strict-evidence]" >&2; exit 64; }
  need_file "$f" "ANDROID_VERDICT"
  local headline
  headline="$(node -e '
    const fs = require("fs"), path = require("path");
    const [file, gatesCsv, strict, evdirEnv] = process.argv.slice(1);
    const gates = gatesCsv.split(",");
    const dir = path.dirname(file);
    const roots = [evdirEnv, dir, process.cwd()].filter(Boolean);
    const rows = [];
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line.trim() || line.startsWith("#") || line.startsWith("spec\t")) continue;
      const c = line.split("\t");
      if (c.length < 5) continue;
      rows.push({ id: c[2], status: c[4], detail: c[5] || "" });
    }
    let violations = 0;
    if (strict === "1") {
      for (const r of rows) {
        if (r.status !== "pass") continue;
        const m = r.detail.match(/evidence:([^#\s,;]+)/);
        const ok = m && roots.some((root) => fs.existsSync(path.join(root, m[1])));
        if (!ok) { r.status = "fail"; r.detail += "; EVIDENCE-MISSING"; violations++; }
      }
    }
    const bad = [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    let gatesPass = 0;
    for (const g of gates) {
      const r = byId.get(g);
      if (!r) { bad.push("missing gate: " + g); continue; }
      if (r.status === "pass") gatesPass++;
      else if (r.status === "skip") bad.push("gate skipped: " + g + " (skip is not proof)");
      else bad.push("gate failed: " + g + (r.detail ? " — " + r.detail : ""));
    }
    for (const r of rows) if (r.status === "fail" && !gates.includes(r.id)) bad.push("failed: " + r.id);
    const fails = rows.filter((r) => r.status === "fail").length, skips = rows.filter((r) => r.status === "skip").length;
    console.error(`gates=${gatesPass}/${gates.length} fails=${fails} skips=${skips} rows=${rows.length} evidence_violations=${violations}${strict === "1" ? " (strict)" : ""}`);
    for (const b of bad) console.error(b);
    console.log(bad.length ? "ANDROID_VERDICT: BLOCKED" : "ANDROID_VERDICT: STORE_READY");
  ' "$f" "$GATES" "$strict" "${ANDROID_EVIDENCE_DIR:-}")"
  local rc=$?
  [[ -n "$headline" ]] || { echo "ANDROID_VERDICT: BLOCKED"; echo "verdict: node evaluation failed" >&2; exit 1; }
  log_invocation "verdict" "$f" "$headline"
  echo "$headline"
  [[ "$headline" == "ANDROID_VERDICT: STORE_READY" ]] && exit 0 || exit 1
}

case "$SUB" in
  manifest)    manifest "$@" ;;
  assetlinks)  assetlinks "$@" ;;
  twa)         twa "$@" ;;
  csp)         csp "$@" ;;
  fingerprint) fingerprint "$@" ;;
  live)        live "$@" ;;
  verdict)     verdict "$@" ;;
  --help|-h)   grep '^#' "$0" | sed 's/^# \{0,1\}//' | sed -n '2,16p'; exit 0 ;;
  *)           echo "unknown subcommand: $SUB" >&2; exit 64 ;;
esac
