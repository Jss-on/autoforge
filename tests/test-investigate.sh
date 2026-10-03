#!/usr/bin/env bash
# Behavioral checks for capture, evidence references, and honest unresolved cases.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$REPO_ROOT/tests/investigate.test.cjs" "$REPO_ROOT"
node "$REPO_ROOT/tests/investigate-report.test.cjs" "$REPO_ROOT"
node "$REPO_ROOT/tests/investigate-export.test.cjs" "$REPO_ROOT"
