#!/usr/bin/env bash
# Optional smoke may skip; required installed evaluation never does.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "${AR_SMOKE_MODEL_REQUIRED:-0}" != 1 && "${AR_SMOKE_MODEL:-0}" != 1 ]]; then
  echo "SMOKE-MODEL: SKIPPED (set AR_SMOKE_MODEL=1 or AR_SMOKE_MODEL_REQUIRED=1)"
  exit 0
fi
export FORGE_EVAL_AGENT="${FORGE_EVAL_AGENT:-claude}"
exec node "$SCRIPT_DIR/installed-eval.cjs"
