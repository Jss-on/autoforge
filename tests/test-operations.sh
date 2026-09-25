#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$ROOT/tests/operations.test.cjs" "$ROOT"
node "$ROOT/tests/pilot-signals.cjs" "$ROOT"
