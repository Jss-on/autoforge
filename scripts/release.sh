#!/usr/bin/env bash
# Release from a clean Jss-on/autoforge product checkout, with verified PR evidence.
# Usage: bash scripts/release.sh <X.Y.Z> [--title "Release title"]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/publish-autoforge.sh"

VERSION="" TITLE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --title) [[ $# -ge 2 && -n "$2" && -z "$TITLE" ]] || { echo 'ERROR: --title needs one value.' >&2; exit 1; }; TITLE="$2"; shift 2 ;;
    -*) echo "ERROR: unknown argument $1" >&2; exit 1 ;;
    *) [[ -z "$VERSION" ]] || { echo 'ERROR: only one version is accepted.' >&2; exit 1; }; VERSION="${1#v}"; shift ;;
  esac
done
[[ "$VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || { echo 'Usage: bash scripts/release.sh <X.Y.Z> [--title "Release title"]' >&2; exit 1; }
cd "$(git rev-parse --show-toplevel)"
command -v gh >/dev/null || { echo 'ERROR: gh CLI is required.' >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'ERROR: working tree must be clean.' >&2; exit 1; }
[[ "$(git branch --show-current)" == master ]] || { echo 'ERROR: run from the product master branch.' >&2; exit 1; }
HEAD_BEFORE=$(git rev-parse HEAD)
autoforge_tree_check "$HEAD_BEFORE^{tree}"
autoforge_remote
BASE="$AUTOFORGE_BASE"
[[ "$HEAD_BEFORE" == "$BASE" ]] || { echo 'ERROR: use a product checkout at autoforge/master; source history must not enter the release branch.' >&2; exit 1; }
REPO=Jss-on/autoforge
TAG="v$VERSION"
BRANCH="release/$VERSION"
TAG_STATUS=0
git ls-remote --exit-code --tags "$AUTOFORGE_FETCH_URL" "refs/tags/$TAG" >/dev/null || TAG_STATUS=$?
[[ "$TAG_STATUS" == 2 ]] || { echo 'ERROR: release tag exists or remote lookup failed.' >&2; exit 1; }
CURRENT=$(node -p "require('./claude-plugin/.claude-plugin/plugin.json').version")
node - "$CURRENT" "$VERSION" <<'JS'
const [old,next]=process.argv.slice(2).map(v=>v.split('.').map(BigInt));
const difference=next.findIndex((n,i)=>n!==old[i]);
if(difference<0 || next[difference]<old[difference]) { console.error('ERROR: release version must increase.'); process.exit(1); }
JS

git checkout -b "$BRANCH"
# Keep every shipped version in step without rewriting unrelated distribution content.
node - "$VERSION" <<'JS'
const fs=require('node:fs'),v=process.argv[2];
for(const f of ['.claude-plugin/marketplace.json','claude-plugin/.claude-plugin/plugin.json','plugins/forge/.codex-plugin/plugin.json']) {
  if(!fs.existsSync(f)) continue;
  const j=JSON.parse(fs.readFileSync(f,'utf8')); j.version=f.includes('.codex-plugin')?v+'-codex.0':v;
  if(Array.isArray(j.plugins)) for(const p of j.plugins) if(p.name==='forge') p.version=v;
  fs.writeFileSync(f,JSON.stringify(j,null,2)+'\n');
}
for(const root of ['.claude','claude-plugin','.agents','.opencode','plugins/forge']) {
  const f=root+'/skills/forge/SKILL.md';
  if(fs.existsSync(f)) fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/^version: .*$/m,'version: '+v));
}
for(const f of ['README.md','guide/README.md']) if(fs.existsSync(f)) fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/version-\d+\.\d+\.\d+-blue/g,'version-'+v+'-blue'));
JS

echo "Release $TAG: review README.md, guide/, CONTRIBUTING.md and COMPARISON.md now."
read -rp "Press ENTER after review (or 'abort' to stop before publishing): " DOC_RESPONSE
[[ "$DOC_RESPONSE" != abort ]] || { echo 'Stopped; local release changes are available for review.'; exit 0; }
[[ "$(git rev-parse HEAD)" == "$HEAD_BEFORE" ]] || { echo 'ERROR: source commit changed during document review.' >&2; exit 1; }
# The pause allows document edits, never arbitrary files to be swept into a release.
RELEASE_PATHS=(.claude-plugin/marketplace.json claude-plugin/.claude-plugin/plugin.json plugins/forge/.codex-plugin/plugin.json .claude/skills/forge/SKILL.md claude-plugin/skills/forge/SKILL.md .agents/skills/forge/SKILL.md .opencode/skills/forge/SKILL.md plugins/forge/skills/forge/SKILL.md README.md guide CONTRIBUTING.md COMPARISON.md)
for RELEASE_PATH in "${RELEASE_PATHS[@]}"; do
  if [[ -e "$RELEASE_PATH" ]] || git ls-files --error-unmatch -- "$RELEASE_PATH" >/dev/null 2>&1; then git add -- "$RELEASE_PATH"; fi
done
node - <<'JS'
const {execFileSync}=require('node:child_process');
const allowed=new Set(['.claude-plugin/marketplace.json','claude-plugin/.claude-plugin/plugin.json','plugins/forge/.codex-plugin/plugin.json',...['.claude','claude-plugin','.agents','.opencode','plugins/forge'].map(p=>p+'/skills/forge/SKILL.md'),'README.md','CONTRIBUTING.md','COMPARISON.md']);
const files=execFileSync('git',['diff','--cached','--name-only','-z']).toString().split('\0').filter(Boolean);
if(files.some(f=>!allowed.has(f)&&!f.startsWith('guide/'))) {console.error('ERROR: staged files outside release/documentation scope.');process.exit(1);}
JS
git diff --quiet -- || { echo 'ERROR: unrelated tracked edits appeared during review.' >&2; exit 1; }
git commit -m "chore: prepare release $TAG"
REVIEWED_HEAD=$(git rev-parse HEAD)
REVIEWED_TREE=$(git rev-parse HEAD^{tree})
autoforge_tree_check "$REVIEWED_TREE"
autoforge_gates "$REVIEWED_HEAD"
autoforge_remote
[[ "$AUTOFORGE_BASE" == "$BASE" ]] || { echo 'ERROR: product master moved during preparation; rebuild the release on the new base.' >&2; exit 1; }
autoforge_stable "$REVIEWED_HEAD"
autoforge_remote_urls
git push --no-follow-tags "$AUTOFORGE_PUSH_URL" "$REVIEWED_HEAD:refs/heads/$BRANCH"
BODY_FILE=$(mktemp)
trap 'rm -f -- "$BODY_FILE"' EXIT
cat > "$BODY_FILE" <<EOF
Release $TAG updates the plugin manifests, skill versions and documentation from $CURRENT to $VERSION.

All harness test suites and the seam smoke passed for $REVIEWED_HEAD. Merge requires passing required CI checks on this exact head.
EOF
PR_URL=$(gh pr create --repo "$REPO" --base master --head "$BRANCH" --title "${TITLE:-Release $TAG}" --body-file "$BODY_FILE")
echo "Review $PR_URL ($REVIEWED_HEAD)."
read -rp "Type 'merge' to merge this verified PR and create $TAG (anything else leaves the PR open): " MERGE_RESPONSE
[[ "$MERGE_RESPONSE" == merge ]] || { echo "PR left open: $PR_URL"; exit 0; }
gh pr checks "$PR_URL" --repo "$REPO" --watch --fail-fast
gh api "repos/$REPO/commits/$REVIEWED_HEAD/check-runs?per_page=100" > "$BODY_FILE"
node - "$BODY_FILE" "$REVIEWED_HEAD" <<'JS'
const checks=JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8'));
const rows=checks.check_runs,head=process.argv[3];
if(!Array.isArray(rows)||!rows.length||checks.total_count!==rows.length||rows.some(r=>r.head_sha!==head||r.status!=='completed'||!['success','skipped','neutral'].includes(r.conclusion))||!rows.some(r=>r.name==='Harness test suites'&&r.app?.slug==='github-actions'&&r.conclusion==='success')) {
  console.error('ERROR: successful Harness test suites CI is required on the reviewed head.'); process.exit(1);
}
JS
gh pr view "$PR_URL" --repo "$REPO" --json headRefOid,baseRefName,state,isCrossRepository,isDraft,mergeStateStatus,reviewDecision > "$BODY_FILE"
node - "$BODY_FILE" "$REVIEWED_HEAD" <<'JS'
const p=JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8'));
if(p.headRefOid!==process.argv[3] || p.baseRefName!=='master' || p.state!=='OPEN' || p.isCrossRepository!==false) {console.error('ERROR: PR identity changed after verification.');process.exit(1);}
if(p.isDraft!==false || p.mergeStateStatus!=='CLEAN' || !['','APPROVED'].includes(p.reviewDecision)) {console.error('ERROR: PR readiness requires a clean, non-draft PR with no blocking reviews.');process.exit(1);}
JS
autoforge_remote
[[ "$AUTOFORGE_BASE" == "$BASE" ]] || { echo 'ERROR: product master moved; update and reverify the PR.' >&2; exit 1; }
autoforge_stable "$REVIEWED_HEAD"
# The fixed parents make a concurrent base update fail the ordinary push.
MERGE_COMMIT=$(git commit-tree "$REVIEWED_TREE" -p "$BASE" -p "$REVIEWED_HEAD" -m "Merge $PR_URL for release $TAG")
autoforge_remote_urls
git push --no-follow-tags "$AUTOFORGE_PUSH_URL" "$MERGE_COMMIT:refs/heads/master"
RECEIPT_OK=0
for ATTEMPT in 1 2 3 4 5; do
  gh pr view "$PR_URL" --repo "$REPO" --json state,mergeCommit > "$BODY_FILE"
  if node - "$BODY_FILE" "$MERGE_COMMIT" <<'JS'
const p=JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8'));
process.exit(p.state==='MERGED' && p.mergeCommit?.oid===process.argv[3] ? 0 : 1);
JS
  then RECEIPT_OK=1; break; fi
  [[ "$ATTEMPT" == 5 ]] || sleep 2
done
[[ "$RECEIPT_OK" == 1 ]] || { echo 'ERROR: merge pushed, but GitHub PR receipt is unconfirmed; tagging stopped.' >&2; exit 1; }
autoforge_remote
git merge-base --is-ancestor "$MERGE_COMMIT" "$AUTOFORGE_BASE"
# Tag the verified merge, not whichever commit master happens to reach next.
autoforge_remote_urls
git push --no-follow-tags "$AUTOFORGE_PUSH_URL" "$MERGE_COMMIT:refs/tags/$TAG"
gh release create "$TAG" --repo "$REPO" --verify-tag --target "$MERGE_COMMIT" --title "${TITLE:-Release $TAG}" --generate-notes
echo "Released $TAG at $MERGE_COMMIT: https://github.com/$REPO/releases/tag/$TAG"
