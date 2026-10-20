#!/usr/bin/env bash
# /forge:semver and semantic-release for every build — the seam (init, scan, plan, apply, check), the
# contract's safety pins, the build/feature/fix/ship wiring, the handoff gate, and distribution parity.
set -uo pipefail

export AR_SCORE_LOG=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SPEC="$REPO_ROOT/claude-plugin/commands/forge/semver.md"
CMD="$REPO_ROOT/claude-plugin/commands/forge"

PASS=0; FAIL=0; TOTAL=0
pass() { printf '  PASS: %s\n' "$1"; PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); }
fail() { printf '  FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); }
assert_eq() { if [[ "$1" == "$2" ]]; then pass "$3"; else fail "$3 (expected '$1', got '$2')"; fi; }
spec_has() { grep -qiE -- "$1" "$SPEC" && pass "$2" || fail "$2 (spec missing /$1/)"; }
file_has() { grep -qiE -- "$2" "$1" && pass "$3" || fail "$3 (${1#$REPO_ROOT/} missing /$2/)"; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

# ============================================================================
printf '\n--- seam: semver.cjs (init, scan, plan, apply, check, handoff gate) ---\n'
# ============================================================================
if FORGE_TEST_BASH="$BASH" node "$REPO_ROOT/tests/semver.test.cjs" "$REPO_ROOT" > "$T/semver.txt" 2>&1; then
  pass "semver: $(tail -n 1 "$T/semver.txt")"
else
  fail "semver: $(tail -n 1 "$T/semver.txt")"
  grep '^FAIL' "$T/semver.txt" | sed 's/^/    /'
fi
node "$REPO_ROOT/scripts/semver.cjs" nonsense >/dev/null 2>&1; assert_eq 64 "$?" "semver.cjs: unknown action prints usage"
node "$REPO_ROOT/scripts/semver.cjs" check "$T/not-a-repo" >/dev/null 2>&1; assert_eq 2 "$?" "semver.cjs: a directory that is not a repository is blocked, not judged"

# ============================================================================
printf '\n--- contract: /forge:semver ---\n'
# ============================================================================
spec_has "^name: forge:semver"                                          "frontmatter names the command"
spec_has "EXECUTE IMMEDIATELY"                                          "spec executes on invocation"
spec_has "what would semantic-release have"                             "the one question it answers"
spec_has "breaking → major, .feat. → minor"                             "semantic-release's default rules"
spec_has "the first release is .1\.0\.0."                               "first release is 1.0.0"
spec_has "Iron law: tags before the merge"                              "tags reach the remote before the adoption PR merges"
spec_has "release the entire history as .1\.0\.0."                      "says why the order matters"
spec_has "Only .role: owner. is versioned"                              "owner role only"
spec_has "never tag, release or open a"                                 "contributor repositories are never touched"
spec_has "PUBLIC → ask once"                                            "a public repository asks before pushing"
spec_has "never switched, tagged or committed in"                       "the user's working copy is never touched"
spec_has "lower bump"                                                   "doubt takes the lower bump"
spec_has "Never to mark a"                                              "breaking is never a milestone marker"
spec_has "never move, delete or force-push a tag"                       "existing tags are never moved"
spec_has "A model is never an author"                                   "no AI authorship"
spec_has "create \*\*no\*\* new tag"                                    "the first release run after adoption must release nothing"
spec_has "semver.cjs check <repo> <run>/<slug>/plan.json --remote"      "verification is the seam's check"
spec_has "source \"semver\""                                            "handoff source"

# ============================================================================
printf '\n--- wiring: build, feature, fix, ship, android, host protocol ---\n'
# ============================================================================
file_has "$CMD/build.md"   "semver\.cjs init <project>"                       "build: the DevOps slice runs semver.cjs init"
file_has "$CMD/build.md"   "squash_merge_commit_title=PR_TITLE"               "build: Phase 0 makes squash merges take the PR title"
file_has "$CMD/build.md"   "the first .feat. on[[:space:]]*$|the first .feat. on the default branch releases"  "build: the first feat releases v1.0.0"
file_has "$CMD/build.md"   "experiment:. commits and their reverts never release" "build: experiments never release"
file_has "$CMD/build.md"   "SEMVER: ADOPTED"                                   "build: a devops row pins the release automation"
file_has "$CMD/build.md"   "the \*\*version\*\* \(the latest .v.-tag"         "build: the summary prints the version"
file_has "$CMD/feature.md" "titled as a Conventional Commit \(.feat: <feature>.;" "feature: PR title carries the version signal"
file_has "$CMD/feature.md" "run ./forge:semver. on it first"                    "feature: unadopted repos go through semver, not init alone"
file_has "$CMD/fix.md"     "titled .fix: <summary>."                            "fix: PR title releases the patch"
file_has "$CMD/ship.md"    "never hand-tag beside it"                           "ship: no manual tags beside semantic-release"
grep -q -- '--prerelease while acceptance' "$CMD/ship.md" && fail "ship: the pre-release contract is gone" || pass "ship: the pre-release contract is gone"
grep -q "Releases are \`ship\`'s job" "$CMD/build.md" && fail "build: releases are no longer ship's job" || pass "build: releases are no longer ship's job"
file_has "$REPO_ROOT/claude-plugin/skills/forge/references/android-protocol.md" "gh release upload \"\\\$GITHUB_REF_NAME\"" "android: attaches to the release semantic-release created"
file_has "$REPO_ROOT/claude-plugin/skills/forge/references/host-protocol.md" "Release automation is GitHub Actions" "host protocol: release automation is GitHub-only"
file_has "$REPO_ROOT/claude-plugin/skills/forge/references/handoff-schema.md" "^\| .semver. \|" "handoff schema documents semver"
file_has "$REPO_ROOT/claude-plugin/skills/forge/SKILL.md" "semantic-release in that CI versions it" "safety invariant: versioning is part of the standard loop"

# ============================================================================
printf '\n--- distribution: six surfaces, seams, manifests, routers ---\n'
# ============================================================================
for m in ".claude/commands/forge/semver.md" ".agents/skills/forge/semver.md" "plugins/forge/skills/forge/semver.md" \
         ".opencode/commands/forge_semver.md" ".cursor/skills/forge/semver.md"; do
  if [[ -f "$REPO_ROOT/$m" ]] && diff -q "$SPEC" "$REPO_ROOT/$m" >/dev/null 2>&1; then pass "mirror parity: $m"; else fail "mirror parity: $m (missing or diverged)"; fi
done
for d in .claude/skills/forge claude-plugin/skills/forge .agents/skills/forge plugins/forge/skills/forge .opencode/skills/forge .cursor/skills/forge; do
  for s in semver.cjs validate-handoff.sh; do
    if diff -q "$REPO_ROOT/scripts/$s" "$REPO_ROOT/$d/scripts/$s" >/dev/null 2>&1; then pass "seam parity: $d/scripts/$s"; else fail "seam parity: $d/scripts/$s (missing or diverged)"; fi
  done
done
grep -q ' semver.cjs ' "$REPO_ROOT/scripts/transform.sh" && pass "transform.sh syncs semver.cjs" || fail "transform.sh runtime set misses semver.cjs"
mkdir -p "$T/bundled" && git -C "$T/bundled" init -q -b main && git -C "$T/bundled" -c user.name=t -c user.email=t@example.test commit -q --allow-empty -m "feat: a"
assert_eq "SEMVER: INCOMPLETE latest=- next=minor → v1.0.0" "$(node "$REPO_ROOT/claude-plugin/skills/forge/scripts/semver.cjs" check "$T/bundled" 2>/dev/null | head -n 1)" "bundled semver.cjs runs from the plugin tree"
for mf in "$REPO_ROOT/.claude-plugin/marketplace.json" "$REPO_ROOT/claude-plugin/.claude-plugin/plugin.json" "$REPO_ROOT/plugins/forge/.codex-plugin/plugin.json"; do
  name="${mf#$REPO_ROOT/}"
  grep -q "26 commands" "$mf" && pass "manifest count 26: $name" || fail "manifest count 26: $name"
  grep -q "review, semver, migrate" "$mf" && pass "manifest lists semver: $name" || fail "manifest lists semver: $name"
done
grep -q '`/forge:semver`' "$REPO_ROOT/claude-plugin/skills/forge/SKILL.md" && pass "claude router lists /forge:semver" || fail "claude router missing /forge:semver"
grep -q '`\$forge semver`' "$REPO_ROOT/plugins/forge/skills/forge/SKILL.md" && pass "codex router lists \$forge semver" || fail "codex router missing \$forge semver"
grep -q '`/forge_semver`' "$REPO_ROOT/.opencode/skills/forge/SKILL.md" && pass "opencode router lists /forge_semver" || fail "opencode router missing /forge_semver"
grep -q '`/forge semver`' "$REPO_ROOT/.cursor/skills/forge/SKILL.md" && pass "cursor router lists /forge semver" || fail "cursor router missing /forge semver"

# ============================================================================
printf '\n--- docs ---\n'
# ============================================================================
grep -q '/forge:semver' "$REPO_ROOT/README.md" && pass "README documents /forge:semver" || fail "README missing /forge:semver"
grep -q 'forge:semver' "$REPO_ROOT/AGENTS.md" && pass "AGENTS.md lists forge:semver" || fail "AGENTS.md missing forge:semver"
[[ -f "$REPO_ROOT/guide/forge-semver.md" ]] && grep -q 'tags pushed first' "$REPO_ROOT/guide/forge-semver.md" \
  && pass "guide/forge-semver.md explains the order" || fail "guide/forge-semver.md missing or incomplete"
grep -q 'forge-semver.md' "$REPO_ROOT/guide/README.md" && pass "guide index links the semver guide" || fail "guide index missing the semver guide"
grep -q '/forge:semver' "$REPO_ROOT/docs/project-changelog.md" && pass "changelog records /forge:semver" || fail "changelog missing /forge:semver"

printf '\n%d/%d passed\n' "$PASS" "$TOTAL"
[[ "$FAIL" -eq 0 ]]
