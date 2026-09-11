#!/usr/bin/env bash
# Publish only a verified tree to the product lineage; never source history.
# Usage: bash scripts/publish-autoforge.sh ["commit message"]
set -euo pipefail

# These checks are also used by release.sh.
autoforge_remote_urls() {
  git remote get-url autoforge >/dev/null 2>&1 || git remote add autoforge https://github.com/Jss-on/autoforge.git
  local url urls
  for direction in fetch push; do
    if [[ "$direction" == push ]]; then urls=$(git remote get-url --push --all autoforge); else urls=$(git remote get-url --all autoforge); fi
    [[ -n "$urls" ]] || { echo 'ERROR: missing product remote URL.' >&2; return 1; }
    while IFS= read -r url; do
      case "$url" in
        https://github.com/Jss-on/autoforge|https://github.com/Jss-on/autoforge.git|git@github.com:Jss-on/autoforge.git|ssh://git@github.com/Jss-on/autoforge.git) ;;
        *) echo 'ERROR: autoforge fetch and push URLs must target Jss-on/autoforge.' >&2; return 1 ;;
      esac
    done <<< "$urls"
  done
  AUTOFORGE_FETCH_URL=$(git remote get-url autoforge)
  AUTOFORGE_PUSH_URL=$(git remote get-url --push autoforge)
}

autoforge_remote() {
  autoforge_remote_urls
  git fetch --no-tags "$AUTOFORGE_FETCH_URL" +refs/heads/master:refs/remotes/autoforge/master || { echo 'ERROR: product fetch failed.' >&2; return 1; }
  AUTOFORGE_BASE=$(git rev-parse --verify refs/remotes/autoforge/master)
}

autoforge_stable() {
  git ls-files -v -z | node -e '
const hidden=require("node:fs").readFileSync(0,"utf8").split("\0").filter(entry=>/^[a-zS] /.test(entry));
if(hidden.length){console.error("ERROR: clear assume-unchanged and skip-worktree flags before verification:\n"+hidden.map(entry=>entry.slice(2)).join("\n"));process.exit(1)}
' || return 1
  [[ "$(git rev-parse HEAD)" == "$1" ]] && git diff --quiet -- && git diff --cached --quiet -- || {
    echo 'ERROR: source HEAD, index, or tracked working files changed; verify again.' >&2; return 1;
  }
}

autoforge_tree_check() {
  node - "$1" <<'JS'
const {execFileSync} = require('node:child_process');
const tree = process.argv[2];
const files = execFileSync('git', ['ls-tree', '-rz', '--name-only', tree], {maxBuffer: 32 * 1024 * 1024}).toString().split('\0').filter(Boolean);
const bad = files.filter(file => {
  if (/^(forge|autoresearch|data|research|live-demo|build-output|plans|debug|learn|scenario|Users)\//i.test(file) || /^\.claude\/session-state\//.test(file)) return true;
  const name = file.split('/').at(-1);
  if (/^\.env(?:\.|$)/i.test(name)) return !/^\.env(?:\.[\w-]+)*\.(example|sample|template)$/i.test(name);
  return /^(id_(rsa|dsa|ecdsa|ed25519)|credentials(?:\.json)?|\.netrc|\.npmrc)$/i.test(name) || /\.(key|p12|pfx|jks|keystore)$/i.test(name);
});
if (bad.length) { console.error('ERROR: private run output or credential artifacts in publish tree:\n' + bad.join('\n')); process.exit(1); }
// ponytail: detect PEM private keys and credential filenames; use a dedicated scanner for broader secret detection.
const {spawnSync} = require('node:child_process');
const keys = spawnSync('git', ['grep', '-I', '-l', '-E', '^-----BEGIN ([A-Z0-9]+ )*PRIVATE KEY-----', tree, '--'], {encoding:'utf8'});
if (keys.status !== 1) { console.error(keys.status === 0 ? 'ERROR: private-key material in publish tree:\n' + keys.stdout : 'ERROR: credential scan failed.'); process.exit(1); }
JS
}

autoforge_gates() {
  [[ "${AUTOFORGE_SKIP_TESTS:-0}" == 0 ]] || { echo 'ERROR: publication verification cannot be skipped.' >&2; return 1; }
  local head="$1" test_file
  local tests=(tests/test-*.sh)
  [[ -f "${tests[0]}" && -f scripts/smoke-seam.sh ]] || { echo 'ERROR: test suites and seam smoke are required.' >&2; return 1; }
  autoforge_stable "$head"
  for test_file in "${tests[@]}"; do
    echo "== $test_file"
    bash "$test_file"
    autoforge_stable "$head"
  done
  bash scripts/smoke-seam.sh
  autoforge_stable "$head"
}

autoforge_publish() {
  [[ $# -le 1 ]] || { echo 'Usage: bash scripts/publish-autoforge.sh ["commit message"]' >&2; return 1; }
  cd "$(git rev-parse --show-toplevel)"
  local head tree remote_tree message version tag_result tag_status commit
  head=$(git rev-parse HEAD)
  tree=$(git rev-parse "$head^{tree}")
  autoforge_stable "$head"
  autoforge_tree_check "$tree"
  autoforge_remote
  remote_tree=$(git rev-parse "$AUTOFORGE_BASE^{tree}")
  # Product commits have a separate squash lineage; match trees, not commit ancestry.
  git log --format=%T "$head" | grep -Fx "$remote_tree" >/dev/null || {
    echo 'ERROR: product master contains changes absent from source history; reconcile before publishing.' >&2; return 1;
  }
  version=$(git show "$head:.claude-plugin/marketplace.json" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const v=JSON.parse(s).version;if(!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(v))process.exit(1);console.log(v)})')
  tag_status=0
  tag_result=$(git ls-remote --exit-code --tags "$AUTOFORGE_FETCH_URL" "refs/tags/v$version") || tag_status=$?
  [[ "$tag_status" == 0 || "$tag_status" == 2 ]] || { echo 'ERROR: could not verify remote release tag.' >&2; return 1; }
  autoforge_gates "$head"
  if [[ "$remote_tree" == "$tree" ]]; then echo 'Verified: no changes to publish.'; return 0; fi
  message="${1:-publish: $(git log -1 --format=%s "$head") }"
  commit=$(git commit-tree "$tree" -p "$AUTOFORGE_BASE" -m "$message")
  autoforge_stable "$head"
  autoforge_remote_urls
  if [[ "$tag_status" == 2 ]]; then
    git push --no-follow-tags --atomic "$AUTOFORGE_PUSH_URL" "$commit:refs/heads/master" "$commit:refs/tags/v$version"
  else
    git push --no-follow-tags "$AUTOFORGE_PUSH_URL" "$commit:refs/heads/master"
  fi
  [[ "$(git ls-remote "$AUTOFORGE_PUSH_URL" refs/heads/master | cut -f1)" == "$commit" ]] || {
    echo 'ERROR: remote master changed or could not be verified after push.' >&2; return 1;
  }
  echo "Published $commit -> Jss-on/autoforge master"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then autoforge_publish "$@"; fi
