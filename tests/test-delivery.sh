#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$ROOT/tests/delivery.test.cjs" "$ROOT"
for tree in .claude claude-plugin .opencode .agents plugins/forge; do
  cmp "$ROOT/.github/workflows/forge-pilot.yml" "$ROOT/$tree/skills/forge/references/vercel-pilot.yml"
  cmp "$ROOT/scripts/vercel-delivery.cjs" "$ROOT/$tree/skills/forge/scripts/vercel-delivery.cjs"
done
