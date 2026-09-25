#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$ROOT/tests/hosting.test.cjs" "$ROOT"
REQUIRE_ACCEPTANCE_PLAN=1 bash "$ROOT/scripts/score-requirements.sh" validate "$ROOT/tests/fixtures/requirements/valid.spec.yaml" >/dev/null 2>&1 && exit 1
exit 0
