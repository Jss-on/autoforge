#!/usr/bin/env bash
# validate-handoff.sh — mechanical gate for the chain contract (handoff.json).
# Schema: skills/autoresearch/references/handoff-schema.md (v2.3.1).
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

# One parse, all fields. Joined on unit-separator (charCode 31) — tab is
# IFS-whitespace and read collapses leading empty fields.
PARSED="$(node -e '
  const fs = require("fs");
  let j;
  try { j = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); }
  catch { console.log("__PARSE_ERROR__"); process.exit(0); }
  const s = (k) => (typeof j[k] === "string" ? j[k] : "");
  const h = (k) => (k in j ? "1" : "0");
  console.log([s("version"), s("source"), s("status"), s("timestamp"), s("verdict"),
               h("results_tsv"), h("metric"), h("config"), h("coverage"),
               h("spec"), h("srs"), h("generated_spec"), h("errors_remaining")]
              .join(String.fromCharCode(31)));
' "$FILE" 2>/dev/null)"

if [[ "$PARSED" == "__PARSE_ERROR__" || -z "$PARSED" ]]; then
  echo "INVALID"; echo "not valid JSON: $FILE" >&2; exit 1
fi
IFS=$'\x1f' read -r VERSION SOURCE STATUS TS VERDICT \
  H_RESULTS H_METRIC H_CONFIG H_COVERAGE H_SPEC H_SRS H_GENSPEC H_ERRREM <<< "$PARSED"

has_field() { # reads the pre-parsed presence flags
  case "$1" in
    results_tsv)      [[ "$H_RESULTS"  == "1" ]] ;;
    metric)           [[ "$H_METRIC"   == "1" ]] ;;
    config)           [[ "$H_CONFIG"   == "1" ]] ;;
    coverage)         [[ "$H_COVERAGE" == "1" ]] ;;
    spec)             [[ "$H_SPEC"     == "1" ]] ;;
    srs)              [[ "$H_SRS"      == "1" ]] ;;
    generated_spec)   [[ "$H_GENSPEC"  == "1" ]] ;;
    errors_remaining) [[ "$H_ERRREM"   == "1" ]] ;;
    *) return 1 ;;
  esac
}

[[ -n "$VERSION" ]] || err "missing: version"
[[ -n "$SOURCE"  ]] || err "missing: source"
[[ -n "$STATUS"  ]] || err "missing: status"
[[ -n "$TS"      ]] || err "missing: timestamp"

if [[ -n "$SOURCE" ]] && printf '%s' "$SOURCE" | grep -q ':'; then
  err "source must be the short name, not a colon form (got: $SOURCE)"
fi

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
esac

if [[ "$ERRORS" -gt 0 ]]; then
  echo "INVALID"; exit 1
fi

# Legacy-version warning is stderr-only; the file is still VALID.
case "$VERSION" in
  2.1.*|2.2.*) echo "warn: legacy handoff version $VERSION (current schema 2.4.0)" >&2 ;;
esac

echo "VALID"; exit 0
