#!/usr/bin/env bash
# Publish the current tracked tree to the private AutoForge product repo
# (https://github.com/Jss-on/autoforge) as a single commit on the product
# lineage. Local branch history never leaves this machine.
#
# Usage: bash scripts/publish-autoforge.sh ["commit message"]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

REMOTE_URL="https://github.com/Jss-on/autoforge.git"
git remote get-url autoforge >/dev/null 2>&1 || git remote add autoforge "$REMOTE_URL"

if ! git diff-index --quiet HEAD --; then
  echo "ERROR: uncommitted changes to tracked files — commit first." >&2
  exit 1
fi

# Test gate: the product repo never receives a tree the suites reject.
# AUTOFORGE_SKIP_TESTS=1 is the explicit, logged escape hatch.
if [[ "${AUTOFORGE_SKIP_TESTS:-0}" != "1" ]]; then
  echo "Running test suites before publish..."
  for t in tests/test-*.sh; do
    if ! bash "$t" >/dev/null 2>&1; then
      echo "ERROR: $t failed — fix it or rerun with AUTOFORGE_SKIP_TESTS=1 (discouraged)." >&2
      bash "$t" 2>&1 | grep -E 'FAIL' | head -10 >&2
      exit 1
    fi
  done
  echo "All suites green."
else
  echo "WARNING: AUTOFORGE_SKIP_TESTS=1 — publishing untested tree." >&2
fi

git fetch autoforge master 2>/dev/null || true

TREE=$(git rev-parse 'HEAD^{tree}')
MSG="${1:-publish: $(git log -1 --format=%s)}"

if PARENT=$(git rev-parse --verify --quiet autoforge/master); then
  if [ "$(git rev-parse 'autoforge/master^{tree}')" = "$TREE" ]; then
    echo "No changes vs autoforge/master — nothing to publish."
    exit 0
  fi
  COMMIT=$(git commit-tree "$TREE" -p "$PARENT" -m "$MSG")
else
  COMMIT=$(git commit-tree "$TREE" -m "$MSG")
fi

git push autoforge "$COMMIT:refs/heads/master"
echo "Published $COMMIT -> autoforge/master"

# Tag the first publish of each marketplace version so releases are addressable.
VER="$(grep -m1 '"version"' .claude-plugin/marketplace.json | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
if [[ -n "$VER" ]] && ! git ls-remote --tags autoforge "refs/tags/v$VER" | grep -q .; then
  git tag -f "autoforge-v$VER" "$COMMIT"
  git push autoforge "refs/tags/autoforge-v$VER:refs/tags/v$VER" 2>/dev/null \
    && echo "Tagged v$VER on autoforge" \
    || echo "NOTE: tag push failed (non-fatal)"
fi
