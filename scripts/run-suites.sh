#!/usr/bin/env bash
# run-suites.sh — run every tests/test-*.sh concurrently, then print each suite's
# output in a stable order with its exit code and wall seconds. Exit 1 if any failed.
# Usage: bash scripts/run-suites.sh [repo-root]   (SUITE_JOBS=N, default 4)
set -uo pipefail
cd "${1:-$(dirname "${BASH_SOURCE[0]}")/..}" || exit 2
out="$(mktemp -d)"
ls tests/test-*.sh | xargs -P "${SUITE_JOBS:-4}" -I{} bash -c '
  n=$(basename "$1"); s=$SECONDS
  bash "$1" >"$2/$n.out" 2>&1; rc=$?
  echo "$rc $((SECONDS-s))" >"$2/$n.rc"' _ {} "$out"
fail=0
for t in tests/test-*.sh; do
  n=$(basename "$t"); read -r rc secs <"$out/$n.rc"
  echo "== $t (exit $rc, ${secs}s)"; cat "$out/$n.out"
  [[ "$rc" -eq 0 ]] || fail=1
done
rm -r "$out"
exit $fail
