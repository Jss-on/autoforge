#!/usr/bin/env bash
# doctor.sh — environment preflight for the AutoForge build pipeline.
#
# Verifies every external tool the 17 commands actually invoke, split by tier:
#   CORE      — required for any command to work (bash/node/git/coreutils)
#   BUILD     — required for the build/feature pipeline's verification gates
#               (Playwright drives the ux dimension; docker the devops one)
#   OPTIONAL  — needed only when a spec declares the matching rows
#
# Usage:
#   bash scripts/doctor.sh              # full report; exit 1 if any CORE tool missing
#   bash scripts/doctor.sh --require-build   # also exit 1 if a BUILD tool is missing
#   bash scripts/doctor.sh --help
set -uo pipefail

REQUIRE_BUILD=0
case "${1:-}" in
  --require-build) REQUIRE_BUILD=1 ;;
  --help|-h)
    grep '^#' "$0" | sed 's/^# \{0,1\}//' | sed -n '2,14p'
    exit 0 ;;
  "") ;;
  *) echo "unknown flag: $1" >&2; exit 64 ;;
esac

CORE_MISSING=0
BUILD_MISSING=0

row() { printf '  %-12s %-10s %s\n' "$1" "$2" "$3"; }

check() {
  # $1 tier, $2 name, $3 command to probe, $4 purpose
  local tier="$1" name="$2" probe="$3" purpose="$4"
  if command -v "$probe" >/dev/null 2>&1; then
    row "$name" "ok" "$purpose"
  else
    row "$name" "MISSING" "$purpose"
    case "$tier" in
      core)  CORE_MISSING=$((CORE_MISSING + 1)) ;;
      build) BUILD_MISSING=$((BUILD_MISSING + 1)) ;;
    esac
  fi
}

printf 'AutoForge doctor — environment preflight\n\n'

printf 'CORE (required for all commands)\n'
check core bash bash          "shell for all seam scripts"
check core node node          "hooks + verification helpers (.cjs)"
check core git git            "experiment ledger, ratchet, worktrees"
check core awk awk            "scorer arithmetic"
check core sed sed            "seam text processing"
check core sha256sum sha256sum "score-log evidence hashing"
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [[ "${NODE_MAJOR:-0}" -lt 18 ]]; then
    row "node>=18" "MISSING" "found major=$NODE_MAJOR — hooks need Node 18+"
    CORE_MISSING=$((CORE_MISSING + 1))
  else
    row "node>=18" "ok" "major=$NODE_MAJOR"
  fi
fi

printf '\nBUILD PIPELINE (build/feature verification gates)\n'
# Playwright drives every live-browser gate (e2e, axe, DESIGN.md conformance). It is a
# project devDependency rather than a global binary, so accept a local install, a global
# one, or a downloaded browser cache — anything `npx playwright` can resolve.
if command -v playwright >/dev/null 2>&1 \
  || node -e "require.resolve('playwright')" >/dev/null 2>&1 \
  || node -e "require.resolve('playwright-core')" >/dev/null 2>&1 \
  || [[ -d "$HOME/.cache/ms-playwright" ]] || [[ -d "$HOME/AppData/Local/ms-playwright" ]]; then
  row "playwright" "ok" "live e2e + axe + DESIGN.md conformance drive the ux dimension"
else
  row "playwright" "MISSING" "REQUIRED: install with 'npm i -D playwright && npx playwright install --with-deps chromium'"
  BUILD_MISSING=$((BUILD_MISSING + 1))
fi
check build docker docker     "devops dimension (containers, compose, healthchecks)"

printf '\nOPTIONAL (needed when the spec declares matching rows)\n'
check opt axe axe             "a11y scans for ux rows (axe CLI)"
check opt k6 k6               "perf SLO load tests (or autocannon)"
check opt autocannon autocannon "perf SLO load tests (alternative)"
check opt gh gh               "release tooling / private marketplace auth"

printf '\n'
if [[ "$CORE_MISSING" -gt 0 ]]; then
  printf 'RESULT: FAIL — %d core tool(s) missing. Fix these before running any command.\n' "$CORE_MISSING"
  exit 1
fi
if [[ "$REQUIRE_BUILD" -eq 1 && "$BUILD_MISSING" -gt 0 ]]; then
  printf 'RESULT: FAIL — %d build-pipeline tool(s) missing (playwright/docker). The ux/devops dimensions cannot be verified without them.\n' "$BUILD_MISSING"
  exit 1
fi
if [[ "$BUILD_MISSING" -gt 0 ]]; then
  printf 'RESULT: OK with warnings — %d build-pipeline tool(s) missing; build/feature runs will not be able to verify ux/devops rows.\n' "$BUILD_MISSING"
  exit 0
fi
printf 'RESULT: OK — environment ready for the full pipeline.\n'
exit 0
