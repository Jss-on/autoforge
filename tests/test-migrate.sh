#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for tree in .claude/skills/forge claude-plugin/skills/forge .opencode/skills/forge .agents/skills/forge .cursor/skills/forge plugins/forge/skills/forge; do
  cmp "$ROOT/scripts/migrate.cjs" "$ROOT/$tree/scripts/migrate.cjs"
  cmp "$ROOT/scripts/migration-parity.cjs" "$ROOT/$tree/scripts/migration-parity.cjs"
done
node "$ROOT/tests/migration-parity.test.cjs" "$ROOT"
node "$ROOT/tests/migrate.test.cjs" "$ROOT"
