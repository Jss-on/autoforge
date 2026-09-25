#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export FORGE_TEST_BASH="$BASH"
node "$ROOT/tests/release-eval.test.cjs" "$ROOT"
node "$ROOT/tests/installed-auth.test.cjs" "$ROOT"
node "$ROOT/tests/hosted-ci.test.cjs" "$ROOT"
