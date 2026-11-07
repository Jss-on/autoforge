#!/usr/bin/env bash
# Classic loop receipts: calibrate → decide → summary → check, and the handoff gate they feed.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export FORGE_TEST_BASH="$BASH"
node "$ROOT/tests/loop.test.cjs" "$ROOT"
