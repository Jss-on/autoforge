#!/usr/bin/env bash
# validate-handoff.sh — mechanical gate for the chain contract (handoff.json).
# Schema: skills/forge/references/handoff-schema.md (v3.1.0).
#
#   validate-handoff.sh <handoff.json> [expected-source]
#
#   exit 0 VALID · exit 1 INVALID (missing fields on stderr) · exit 2 unreadable
#
# Parsing uses node's real JSON parser — node is already a hard CORE dependency
# of the harness (hooks, doctor), so there is no reason to hand-roll field
# extraction with grep. A file that is not valid JSON is INVALID outright.
set -uo pipefail

FILE="${1:?usage: validate-handoff.sh <handoff.json> [expected-source]}"
EXPECT_SRC="${2:-}"

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
               h("report")]
              .join(String.fromCharCode(31)));
' "$FILE" 2>/dev/null)"

if [[ "$PARSED" == "__PARSE_ERROR__" || -z "$PARSED" ]]; then
  echo "INVALID"; echo "not valid JSON: $FILE" >&2; exit 1
fi
IFS=$'\x1f' read -r VERSION SOURCE STATUS TS VERDICT \
  H_RESULTS H_METRIC H_CONFIG H_COVERAGE H_SPEC H_SRS H_GENSPEC H_ERRREM H_DESIGN H_REPORT <<< "$PARSED"

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
    *) err "status not in enum: $STATUS" ;;
  esac
fi

if [[ -n "$EXPECT_SRC" && -n "$SOURCE" && "$SOURCE" != "$EXPECT_SRC" ]]; then
  err "source mismatch: expected $EXPECT_SRC, got $SOURCE"
fi

case "$SOURCE" in
  build|feature)
    has_field results_tsv || err "missing: results_tsv (required for $SOURCE)"
    has_field metric      || err "missing: metric (required for $SOURCE)"
    has_field config      || err "missing: config (required for $SOURCE)"
    if [[ "$STATUS" == "CONVERGED" ]] && ! has_field coverage; then
      err "missing: coverage (a CONVERGED $SOURCE without coverage numbers is unverifiable)"
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

if [[ "$ERRORS" -gt 0 ]]; then
  echo "INVALID"; exit 1
fi

# Legacy-version warning is stderr-only; the file is still VALID.
case "$VERSION" in
  2.1.*|2.2.*|2.3.0) echo "warn: legacy handoff version $VERSION (current schema 3.1.0)" >&2 ;;
esac

echo "VALID"; exit 0
