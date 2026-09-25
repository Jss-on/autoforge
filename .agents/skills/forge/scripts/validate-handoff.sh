#!/usr/bin/env bash
# validate-handoff.sh — mechanical gate for the chain contract (handoff.json).
# Schema: skills/forge/references/handoff-schema.md (v3.3.0).
#
#   validate-handoff.sh <handoff.json> [expected-source] [--require-pass]
#
#   exit 0 VALID · exit 1 INVALID (missing fields on stderr) · exit 2 unreadable
#
# Parsing uses node's real JSON parser — node is already a hard CORE dependency
# of the harness (hooks, doctor), so there is no reason to hand-roll field
# extraction with grep. A file that is not valid JSON is INVALID outright.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FILE="${1:?usage: validate-handoff.sh <handoff.json> [expected-source]}"
EXPECT_SRC="${2:-}"
REQUIRE_PASS="${3:-}"
if [[ -n "$REQUIRE_PASS" && "$REQUIRE_PASS" != "--require-pass" ]]; then
  echo "usage: $0 <handoff.json> [expected-source] [--require-pass]" >&2; exit 2
fi

if [[ ! -f "$FILE" ]]; then
  echo "INVALID"; echo "file not found: $FILE" >&2; exit 2
fi

ERRORS=0
err() { echo "$1" >&2; ERRORS=$((ERRORS + 1)); }

# One parse, all fields and their types. Joined on unit-separator (charCode 31) — tab is
# IFS-whitespace and read collapses leading empty fields.
PARSED="$(node -e '
  const fs = require("fs");
  let j;
  try { j = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); }
  catch { console.log("__PARSE_ERROR__"); process.exit(0); }
  const s = (k) => {
    const v = j[k];
    if (typeof v !== "string" || /[\u0000-\u001f\u007f]/.test(v)) return "";
    if (k === "version") {
      const parts = v.split(".").map(Number);
      if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v) ||
          !parts.every(Number.isSafeInteger) || parts[0] < 2 || (parts[0] === 2 && parts[1] < 1)) return "";
    }
    if (k === "timestamp") {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) ||
          !Number.isFinite(Date.parse(v))) return "";
      // Date.parse normalizes impossible days such as February 30; reject them.
      if (new Date(v.slice(0, 10) + "T00:00:00Z").toISOString().slice(0, 10) !== v.slice(0, 10)) return "";
    }
    return v;
  };
  const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const fraction = (v) => Number.isFinite(v) && v >= 0 && v <= 1;
  const text = (v) => typeof v === "string" && v.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(v);
  const checks = (v) => Array.isArray(v) && v.length > 0 &&
    v.every(c => object(c) && text(c.id) && ["pass", "fail", "blocked", "not_run"].includes(c.status) && text(c.evidence)) &&
    new Set(v.map(c => c.id)).size === v.length;
  const passed = (v) => checks(v) && v.every(c => c.status === "pass");
  const levels = ["critical", "high", "medium", "low", "info"];
  const artifact = (v) => typeof v === "string" && /^(?:git:(?:[a-f0-9]{40}|[a-f0-9]{64})|sha256:[a-f0-9]{64})$/.test(v);
  const build = ["build", "feature"].includes(s("source"));
  const completedBuild = build && ["COMPLETE", "CONVERGED"].includes(s("status"));
  const legacy = /^2\./.test(s("version"));
  const evidence = [];
  let securityValid = false, shipValid = false, passValid = false;
  if (s("source") === "security" || build) {
    const a = j.security;
    securityValid = object(a) && ["PASS", "FAIL", "BLOCKED"].includes(a.verdict) &&
      levels.includes(a.fail_on) && checks(a.checks) && Array.isArray(a.findings) &&
      a.findings.every(f => object(f) && text(f.id) && levels.includes(f.severity) &&
        ["open", "resolved", "accepted"].includes(f.status) && text(f.evidence)) &&
      new Set(a.findings.map(f => f.id)).size === a.findings.length;
    if (securityValid) {
      const strix = a.checks.find(c => c.id === "strix");
      securityValid = (!object(j.config) || j.config.strix !== true || !!strix) &&
        (!strix || (Number.isInteger(strix.exit_code) && strix.exit_code >= 0 && strix.exit_code <= 255) ||
          (strix.exit_code === null && ["blocked", "not_run"].includes(strix.status)));
      const blocking = a.findings.some(f => f.status !== "resolved" && levels.indexOf(f.severity) <= levels.indexOf(a.fail_on));
      const failed = blocking || a.checks.some(c => c.status === "fail");
      const verdict = failed ? "FAIL" : passed(a.checks) ? "PASS" : "BLOCKED";
      securityValid = securityValid && a.verdict === verdict && (a.verdict !== "PASS" || build || s("status") === "COMPLETE");
      passValid = securityValid && a.verdict === "PASS" &&
        (!build || (completedBuild && a.fail_on !== "critical"));
      evidence.push(...a.checks.map(c => c.evidence), ...a.findings.map(f => f.evidence));
    }
  }
  if (s("source") === "ship") {
    const a = j.ship;
    const bound = (v) => object(v) && v.target === a.target && v.artifact === a.artifact;
    shipValid = object(a) && ["ship", "rollback", "dry-run", "checklist"].includes(a.action) &&
      text(a.target) && artifact(a.artifact) && checks(a.readiness) && Array.isArray(a.verification) &&
      (!a.verification.length || checks(a.verification));
    if (shipValid) {
      const preview = ["dry-run", "checklist"].includes(a.action);
      const success = ["COMPLETE", "ROLLBACK"].includes(s("status"));
      const receipt = bound(a.receipt) && text(a.receipt.id) && text(a.receipt.evidence);
      const authorized = object(a.authorization) && ["user", "user-auto"].includes(a.authorization.source) &&
        a.authorization.action === a.action && bound(a.authorization) && text(a.authorization.evidence);
      shipValid = !preview || (["DRY_RUN", "ERROR", "BLOCKED"].includes(s("status")) && a.receipt == null && a.verification.length === 0);
      if (s("status") === "DRY_RUN") shipValid = shipValid && preview;
      if (s("status") === "ROLLBACK") shipValid = shipValid && a.action === "rollback";
      if (s("status") === "COMPLETE") shipValid = shipValid && a.action === "ship";
      if (success) shipValid = shipValid && passed(a.readiness) && receipt && authorized && passed(a.verification);
      if (a.action === "rollback" && success) {
        const r = a.rollback;
        shipValid = shipValid && object(r) && r.reversible === true && object(r.from) && object(r.observed) &&
          ["receipt", "target", "artifact"].every(k => text(r.from[k]) && r.from[k] === r.observed[k]) &&
          r.from.target === a.target && artifact(r.from.artifact) && text(r.evidence);
        if (object(r)) evidence.push(r.evidence);
      }
      passValid = shipValid && success;
      evidence.push(...a.readiness.map(c => c.evidence), ...a.verification.map(c => c.evidence));
      if (receipt) evidence.push(a.receipt.evidence);
      if (authorized) evidence.push(a.authorization.evidence);
    }
  }
  if (process.argv[2] === "--require-pass" || (completedBuild && !legacy)) {
    // Evidence is data under this run directory, never a shell command or a remote URL.
    const path = require("path");
    try {
      const root = fs.realpathSync(path.dirname(path.resolve(process.argv[1])));
      const evidenceFile = (p) => {
        if (!text(p) || path.isAbsolute(p) || /[\\:]/.test(p) || p.split("/").some(x => !x || x === "." || x === "..")) throw Error("invalid evidence path");
        const file = fs.realpathSync(path.resolve(root, p));
        const relative = path.relative(root, file);
        const stat = fs.statSync(file);
        if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative) || !stat.isFile() || stat.size === 0) throw Error("unreadable in-run evidence");
        return file;
      };
      passValid = passValid && evidence.length > 0 && evidence.every(p => evidenceFile(p));
      const strix = passValid && (s("source") === "security" || build) ? j.security.checks.find(c => c.id === "strix") : null;
      if (passValid && strix) {
        // Native Strix output only; stopped/budget-limited scans can exit 0.
        const run = JSON.parse(fs.readFileSync(evidenceFile(strix.evidence), "utf8"));
        const sarif = JSON.parse(fs.readFileSync(evidenceFile(path.posix.join(path.posix.dirname(strix.evidence), "findings.sarif")), "utf8"));
        const scan = sarif.runs?.[0];
        passValid = path.posix.basename(strix.evidence) === "run.json" &&
          text(run.run_id) && run.status === "completed" && run.non_interactive === true && run.scope_mode === "full" &&
          text(run.start_time) && text(run.end_time) &&
          Number.isFinite(Date.parse(run.start_time)) && Number.isFinite(Date.parse(run.end_time)) &&
          Date.parse(run.end_time) >= Date.parse(run.start_time) &&
          run.scan_results?.scan_completed === true && run.scan_results?.success === true &&
          Array.isArray(run.targets_info) && run.targets_info.length > 0 &&
          sarif.version === "2.1.0" && Array.isArray(sarif.runs) && sarif.runs.length === 1 &&
          scan?.tool?.driver?.name === "Strix" && text(scan.tool.driver.version) &&
          Array.isArray(scan.invocations) && scan.invocations.length > 0 &&
          scan.invocations.every(i => i?.executionSuccessful === true) && Array.isArray(scan.results);
        if (passValid) {
          const findings = scan.results.filter(r => r?.kind == null || r.kind === "fail");
          passValid = scan.results.every(r => object(r) &&
            (r.kind == null || r.kind === "fail" ||
              (r.kind === "pass" && ["no_issue_found", "ruled_out"].includes(r.properties?.strix?.coverage_outcome)) ||
              (r.kind === "notApplicable" && r.properties?.strix?.coverage_outcome === "not_applicable"))) &&
            strix.exit_code === (findings.length ? 2 : 0) &&
            new Set(findings.map(r => r.properties?.strix?.id)).size === findings.length &&
            findings.every(r => {
              const f = r.properties?.strix;
              return object(f) && text(f.id) && levels.includes(f.severity) &&
                j.security.findings.some(saved => saved.id === `strix:${run.run_id}:${f.id}` &&
                  levels.indexOf(saved.severity) <= levels.indexOf(f.severity));
            });
        }
      }
    } catch { passValid = false; }
  }
  if (legacy && !("security" in j)) securityValid = true;
  if (legacy && !("ship" in j)) shipValid = true;
  if (legacy) passValid = false;
  // Current completion records bind the complete expected check set. Older records
  // remain readable but cannot satisfy strengthened acceptance readiness.
  let acceptanceValid = true;
  const parts = s("version").split(".").map(Number);
  const currentAcceptance = parts[0] > 3 || (parts[0] === 3 && parts[1] >= 3);
  const acceptedSource = build || (s("source") === "test" && s("verdict") === "RELEASE_RECOMMENDED") ||
    (s("source") === "design" && s("verdict") === "SHIP");
  const completed = ["COMPLETE", "CONVERGED"].includes(s("status"));
  if (acceptedSource && ((currentAcceptance && completed) || process.argv[2] === "--require-pass")) {
    try {
      const path = require("path"), a = require(path.join(process.argv[3], "acceptance.cjs"));
      const run = fs.realpathSync(path.dirname(path.resolve(process.argv[1]))), ref = j.acceptance;
      a.need(currentAcceptance && completed && object(ref) && a.digest(ref.plan_sha256), "Current pinned acceptance required");
      const project = fs.realpathSync(process.env.FORGE_PROJECT_ROOT || process.cwd());
      const plan = a.local(run, ref.plan), results = a.local(run, j.results_tsv);
      const p = a.loadPlan(project, plan, ref.plan_sha256);
      a.need(s("source") !== "feature" || object(p.plan.previous), "Feature requires its pinned previous floor");
      acceptanceValid = a.complete(project, plan, results, ref.plan_sha256).verdict === "COMPLETE";
      passValid = (build ? passValid : completed) && acceptanceValid;
    } catch { acceptanceValid = false; passValid = false; }
  }
  const h = (k) => {
    const v = j[k];
    let valid;
    if (k === "config" || k === "design") valid = object(v);
    else if (k === "metric")
      valid = v === "fullstack_pass_rate" || (object(v) && v.name === "fullstack_pass_rate" &&
        (!("value" in v) || fraction(v.value)));
    else if (k === "coverage") {
      // Historical 2.x handoffs may omit design coverage; current writers may not.
      const legacy = /^2\./.test(s("version"));
      valid = object(v) && fraction(v.requirements) &&
        ((legacy && !("design" in v)) || fraction(v.design)) &&
        (s("status") !== "CONVERGED" || (v.requirements === 1 &&
          ((legacy && !("design" in v)) || v.design === 1)));
    } else if (k === "errors_remaining") valid = Number.isSafeInteger(v) && v >= 0;
    else valid = typeof v === "string" && v.trim().length > 0;
    return valid ? "1" : "0";
  };
  console.log([s("version"), s("source"), s("status"), s("timestamp"), s("verdict"),
               h("results_tsv"), h("metric"), h("config"), h("coverage"),
               h("spec"), h("srs"), h("generated_spec"), h("errors_remaining"), h("design"),
               h("report"), securityValid ? "1" : "0", shipValid ? "1" : "0", passValid ? "1" : "0", acceptanceValid ? "1" : "0"]
              .join(String.fromCharCode(31)));
' "$FILE" "$REQUIRE_PASS" "$SCRIPT_DIR" 2>/dev/null)"

if [[ "$PARSED" == "__PARSE_ERROR__" || -z "$PARSED" ]]; then
  echo "INVALID"; echo "not valid JSON: $FILE" >&2; exit 1
fi
IFS=$'\x1f' read -r VERSION SOURCE STATUS TS VERDICT \
  H_RESULTS H_METRIC H_CONFIG H_COVERAGE H_SPEC H_SRS H_GENSPEC H_ERRREM H_DESIGN H_REPORT H_SECURITY H_SHIP H_PASS H_ACCEPTANCE <<< "$PARSED"

has_field() { # reads the pre-parsed presence-and-type flags
  case "$1" in
    results_tsv)      [[ "$H_RESULTS"  == "1" ]] ;;
    metric)           [[ "$H_METRIC"   == "1" ]] ;;
    config)           [[ "$H_CONFIG"   == "1" ]] ;;
    coverage)         [[ "$H_COVERAGE" == "1" ]] ;;
    spec)             [[ "$H_SPEC"     == "1" ]] ;;
    srs)              [[ "$H_SRS"      == "1" ]] ;;
    generated_spec)   [[ "$H_GENSPEC"  == "1" ]] ;;
    errors_remaining) [[ "$H_ERRREM"   == "1" ]] ;;
    design)           [[ "$H_DESIGN"   == "1" ]] ;;
    report)           [[ "$H_REPORT"   == "1" ]] ;;
    *) return 1 ;;
  esac
}

[[ -n "$VERSION" ]] || err "missing or invalid: version (numeric schema version >= 2.1.0 required)"
[[ -n "$SOURCE"  ]] || err "missing: source"
[[ -n "$STATUS"  ]] || err "missing: status"
[[ -n "$TS"      ]] || err "missing or invalid: timestamp (ISO-8601 with offset required)"
[[ "$H_ACCEPTANCE" == "1" ]] || err "current pinned acceptance plan, complete required checks and feature floor required"

if [[ -n "$SOURCE" ]] && printf '%s' "$SOURCE" | grep -q ':'; then
  err "source must be the short name, not a colon form (got: $SOURCE)"
fi

# The core loop currently emits "loop"; retain it as the documented forge alias.
case "$SOURCE" in
  ""|forge|loop|build|feature|requirements|regression|fix|test|design|research|android|debug|security|ship|plan|scenario|predict|learn|reason|probe|improve|evals) ;;
  *) err "source not in enum: $SOURCE" ;;
esac

if [[ -n "$STATUS" ]]; then
  case "$STATUS" in
    COMPLETE|CONVERGED|BOUNDED|PLATEAU|BLOCKED|USER_INTERRUPT|ERROR) ;;
    DRY_RUN|ROLLBACK) [[ "$SOURCE" == "ship" ]] || err "status $STATUS is only valid for ship" ;;
    *) err "status not in enum: $STATUS" ;;
  esac
fi

if [[ -n "$EXPECT_SRC" && -n "$SOURCE" && "$SOURCE" != "$EXPECT_SRC" ]]; then
  err "source mismatch: expected $EXPECT_SRC, got $SOURCE"
fi

case "$SOURCE" in
  security)
    [[ "$H_SECURITY" == "1" ]] || err "missing or invalid: security (typed checks, findings and derived verdict required)"
    ;;
  ship)
    [[ "$H_SHIP" == "1" ]] || err "missing or invalid: ship (bound target, artifact, readiness and verified execution required)"
    ;;
  build|feature)
    has_field results_tsv || err "missing: results_tsv (required for $SOURCE)"
    has_field metric      || err "missing: metric (required for $SOURCE)"
    has_field config      || err "missing: config (required for $SOURCE)"
    if [[ "$STATUS" == "CONVERGED" ]] && ! has_field coverage; then
      err "missing: coverage (a CONVERGED $SOURCE without coverage numbers is unverifiable)"
    fi
    if [[ "$VERSION" != 2.* && ( "$STATUS" == "COMPLETE" || "$STATUS" == "CONVERGED" ) && "$H_PASS" != "1" ]]; then
      err "passing security with high-or-stricter threshold and readable in-run evidence required for completed $SOURCE"
    fi
    ;;
  requirements)
    # generated_spec is the pre-2.3.1 field name — accepted for legacy runs.
    has_field spec || has_field srs || has_field generated_spec \
      || err "missing: spec or srs (required for requirements)"
    ;;
  regression)
    V="$VERDICT"
    case "$V" in
      STABLE|UNSTABLE) ;;
      "") err "missing: verdict (required for regression)" ;;
      *)  err "verdict not in enum: $V" ;;
    esac
    ;;
  fix)
    has_field results_tsv || has_field errors_remaining \
      || err "missing: results_tsv or errors_remaining (required for fix)"
    ;;
  test)
    has_field results_tsv || err "missing: results_tsv (required for test)"
    ;;
  design)
    # an audit carries the disposition; a `system` run carries the DESIGN.md it wrote
    if [[ -n "$VERDICT" ]]; then
      case "$VERDICT" in
        SHIP|FIX|REBUILD) ;;
        *) err "verdict not in enum for design: $VERDICT (SHIP|FIX|REBUILD)" ;;
      esac
    else
      has_field design || err "missing: verdict (SHIP|FIX|REBUILD) or design (object) — required for design"
    fi
    ;;
  research)
    case "$VERDICT" in
      DOSSIER_READY|DOSSIER_BLOCKED) ;;
      "") err "missing: verdict (DOSSIER_READY|DOSSIER_BLOCKED) — required for research" ;;
      *)  err "verdict not in enum for research: $VERDICT (DOSSIER_READY|DOSSIER_BLOCKED)" ;;
    esac
    has_field report || err "missing: report (dossier path — required for research)"
    ;;
  android)
    case "$VERDICT" in
      STORE_READY|BLOCKED) ;;
      "") err "missing: verdict (STORE_READY|BLOCKED) — required for android" ;;
      *)  err "verdict not in enum for android: $VERDICT (STORE_READY|BLOCKED)" ;;
    esac
    has_field results_tsv || err "missing: results_tsv (android-results.tsv — required for android)"
    ;;
esac

if [[ "$REQUIRE_PASS" == "--require-pass" && "$H_PASS" != "1" ]]; then
  err "passing security/ship/build/feature disposition with readable in-run evidence required"
fi

if [[ "$ERRORS" -gt 0 ]]; then
  echo "INVALID"; exit 1
fi

# Legacy-version warning is stderr-only; the file is still VALID.
case "$VERSION" in
  2.1.*|2.2.*|2.3.0) echo "warn: legacy handoff version $VERSION (current schema 3.3.0)" >&2 ;;
esac

echo "VALID"; exit 0
