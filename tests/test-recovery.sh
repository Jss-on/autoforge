#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$ROOT/tests/recovery.test.cjs" "$ROOT"
node "$ROOT/tests/restore-fixture.cjs" "$ROOT"
