#!/usr/bin/env bash
# validate-handoff.sh — mechanical gate for the chain contract (handoff.json).
# Schema: skills/autoresearch/references/handoff-schema.md (v2.3.1).
#
#   validate-handoff.sh <handoff.json> [expected-source]
#
#   exit 0 VALID · exit 1 INVALID (missing fields on stderr) · exit 2 unreadable
#
# grep/sed only (no jq) — same portability rule as orchestrate.sh. Field checks
# are presence + coarse-type, not full JSON parsing: good enough to catch every
# drift class observed in real runs (missing results_tsv, absent status, wrong
# source, converged-without-coverage) without a parser dependency.
set -uo pipefail

FILE="${1:?usage: validate-handoff.sh <handoff.json> [expected-source]}"
EXPECT_SRC="${2:-}"

if [[ ! -f "$FILE" ]]; then
  echo "INVALID"; echo "file not found: $FILE" >&2; exit 2
fi

ERRORS=0
err() { echo "$1" >&2; ERRORS=$((ERRORS + 1)); }

str_field() { # $1 field → prints value or empty
  grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$FILE" | head -1 \
    | sed -E 's/.*:[[:space:]]*"([^"]*)".*/\1/'
}
has_field() { grep -qE "\"$1\"[[:space:]]*:" "$FILE"; }

VERSION="$(str_field version)"
SOURCE="$(str_field source)"
STATUS="$(str_field status)"
TS="$(str_field timestamp)"

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
    V="$(str_field verdict)"
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
esac

if [[ "$ERRORS" -gt 0 ]]; then
  echo "INVALID"; exit 1
fi

# Legacy-version warning is stderr-only; the file is still VALID.
case "$VERSION" in
  2.1.*|2.2.*) echo "warn: legacy handoff version $VERSION (current schema 2.3.1)" >&2 ;;
esac

echo "VALID"; exit 0
