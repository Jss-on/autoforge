#!/usr/bin/env bash
# /forge:review — the review seams (changed lines, coverage, receipts, verdict, evidence images,
# report, Google Docs upload), the contract's safety pins, handoff + routing, and distribution parity.
set -uo pipefail

export AR_SCORE_LOG=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SPEC="$REPO_ROOT/claude-plugin/commands/forge/review.md"
ORCH="$REPO_ROOT/scripts/orchestrate.sh"
VH="$REPO_ROOT/claude-plugin/skills/forge/scripts/validate-handoff.sh"

PASS=0; FAIL=0; TOTAL=0
pass() { printf '  PASS: %s\n' "$1"; PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); }
fail() { printf '  FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); }
assert_eq() { if [[ "$1" == "$2" ]]; then pass "$3"; else fail "$3 (expected '$1', got '$2')"; fi; }
spec_has() { grep -qiE -- "$1" "$SPEC" && pass "$2" || fail "$2 (spec missing /$1/)"; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

# ============================================================================
printf '\n--- seams: review.cjs, review-report.cjs, gdoc.cjs ---\n'
# ============================================================================
for t in review review-report; do
  if node "$REPO_ROOT/tests/$t.test.cjs" "$REPO_ROOT" > "$T/$t.txt" 2>&1; then
    pass "$t: $(tail -n 1 "$T/$t.txt")"
    grep -E '^(SKIP|NOTE)' "$T/$t.txt" | sed 's/^/    /'
  else
    fail "$t: $(tail -n 1 "$T/$t.txt")"
    grep '^FAIL' "$T/$t.txt" | sed 's/^/    /'
  fi
done
node "$REPO_ROOT/scripts/review.cjs" verdict "$T/no-such-run" >/dev/null 2>&1; assert_eq 2 "$?" "review.cjs: a missing run is blocked, not judged"
node "$REPO_ROOT/scripts/review.cjs" nonsense >/dev/null 2>&1; assert_eq 2 "$?" "review.cjs: unknown action prints usage"
node "$REPO_ROOT/scripts/review-report.cjs" nonsense >/dev/null 2>&1; assert_eq 2 "$?" "review-report.cjs: unknown action prints usage"
node "$REPO_ROOT/scripts/review-report.cjs" shot "$T" "file:///etc/passwd" "visuals/x.png" >/dev/null 2>&1; assert_eq 2 "$?" "review-report.cjs: shot takes http(s) URLs only"
node "$REPO_ROOT/scripts/gdoc.cjs" check --folder 'not a folder' >/dev/null 2>&1; assert_eq 2 "$?" "gdoc.cjs: a folder that is not a Drive link or id is refused before any sign-in"
node "$REPO_ROOT/scripts/gdoc.cjs" upload >/dev/null 2>&1; assert_eq 2 "$?" "gdoc.cjs: upload without a file, folder and name is refused"

# ============================================================================
printf '\n--- contract: claude-plugin/commands/forge/review.md ---\n'
# ============================================================================
spec_has "^name: forge:review"                                 "frontmatter names the command"
spec_has "EXECUTE IMMEDIATELY"                                 "spec executes on invocation"
spec_has "is this change safe to merge"                        "the one question it answers"
spec_has "missing evidence is .CANNOT_VERIFY., never a pass"   "missing evidence is never a pass"
spec_has "never[^.]*approves[^.]*merges"                       "never approves or merges"
spec_has "nothing is posted until the user says so"            "posts only on the user's word"
spec_has "untrusted until you have read it"                    "the change's code is untrusted until read"
spec_has "wait for the user's OK"                              "risky changes wait for the user before anything runs"
spec_has "allow-listed environment"                           "the change's code gets an allow-listed environment"
spec_has "Never production"                                    "production never touched"
spec_has "host.cjs reviews"                                    "conventions learned from their merged reviews"
spec_has "review-conventions.md"                               "conventions written down per run"
spec_has "cites two or more real comments"                     "conventions cite real comments"
spec_has "Conventional Comments"                               "default format when there is no precedent"
spec_has "their wording wins"                                  "the user's wording wins"
spec_has "in \*\*their\*\* format"                             "findings are written in their format"
spec_has "never touched"                                       "the user's own checkout is never touched"
spec_has "worktree add --detach \"<head>\""                    "head reviewed in its own worktree"
spec_has "worktree add --detach \"<base>\""                    "base reviewed in its own worktree"
spec_has "review.cjs workspace"                               "checkouts outside the run and the repository"
spec_has "review.cjs prescreen"                               "the pre-screen is mechanical"
spec_has "PRESCREEN: SHOW_USER"                               "a pre-screen hit waits for the user"
spec_has "TAMPERED"                                           "a tampered receipt stops the review"
spec_has "never the user.s own checkout"                      "commands never run in the user's checkout"
spec_has "no .env./.timeout./.xargs. wrappers"                "review commands are never wrapped"
spec_has "There is no sandbox"                                "the ceiling is stated"
spec_has "never another model provider"                       "the challenge stays with this assistant"
spec_has "review.cjs scrub"                                   "posted text is scrubbed"
spec_has "SCRUB: CLEAN"                                       "only clean text is posted"
spec_has "quick actions"                                      "GitLab quick actions are named"
spec_has "never inside a shell string"                        "bodies travel in files"
spec_has "commit_id. = the reviewed head"                     "a GitHub review is pinned to the reviewed head"
spec_has "old_path"                                           "GitLab positions carry the old path"
spec_has "only_allow_merge_if_all_discussions_are_resolved"   "non-blocking findings never block a merge"
spec_has "the only thing of theirs that leaves their host"    "the evidence document is the one exception"
spec_has "anyone with the link"                               "public folders are refused"
spec_has "recomputes the verdict"                             "the handoff verdict is recomputed"
for g in pipeline regression tests-detect coverage app security mergeable; do
  spec_has "\| \`$g\` \|"                                      "gate $g defined"
done
spec_has "for the reviewed head"                               "pipeline counts only for the reviewed head"
spec_has "fail on the base code and pass on the head"          "the change's tests must catch what it changes"
spec_has "review.cjs coverage"                                 "changed-line coverage through the seam"
spec_has "review-report.cjs shot"                              "app screenshots through the seam"
spec_has "regression., .security. and .mergeable. always apply" "the always-on gates cannot be n/a"
spec_has "Only the user can waive"                             "only the user waives a missing gate"
spec_has "a failing gate is[^.]*never waived"                  "a failing gate is never waived"
spec_has "a weakened test blocks the merge"                    "weakened tests block"
spec_has "REVIEW: VALID"                                       "the ledger is checked before the verdict"
spec_has "review.cjs verdict"                                  "the verdict comes from the seam"
spec_has "never the evidence"                                  "INVALID corrects the ledger, not the evidence"
spec_has "review-report.cjs visuals"                           "evidence images rendered by the seam"
spec_has "gdoc.cjs upload"                                     "the Google Doc through the uploader"
spec_has "GDOC_CREATED"                                        "a created doc is verified, not assumed"
spec_has "gdoc.cjs check"                                      "the folder is checked before anything goes in"
spec_has "in their Google Workspace"                           "company evidence stays in their Workspace"
spec_has "personal Drive only when the user says"              "personal Drive only on the user's word"
spec_has "enable-gdrive-access"                                "the sign-in command is handed to the user"
spec_has "Never another folder, never a public link, never changed sharing" "no public links or sharing changes"
spec_has "A different head means the review is stale"          "a stale head is re-reviewed, never posted"
spec_has "Never .APPROVE., never .REQUEST_CHANGES."            "no approval or request-changes state on GitHub"
spec_has "resolvable=false"                                    "the summary note opens no blocking thread"
spec_has "\-\-no-post"                                         "post nothing at all on --no-post"
spec_has "A model is never an author"                          "no AI authorship in comments or documents"
spec_has "Re-review"                                           "re-review after new commits"
spec_has "source \"review\""                                   "handoff source"
spec_has "validate-handoff.sh <run>/handoff.json review"       "handoff validated through the seam"
GUARD="$(grep -n 'Whose repository?' "$SPEC" | head -n 1 | cut -d: -f1)"
FIRST="$(grep -n '^## ' "$SPEC" | head -n 1 | cut -d: -f1)"
if [[ -n "$GUARD" && -n "$FIRST" && "$GUARD" -lt "$FIRST" ]]; then pass "role guard sits above the first section"; else fail "role guard missing or below the first section"; fi
grep -q '`backlog`, `review`' "$REPO_ROOT/claude-plugin/skills/forge/references/host-protocol.md" \
  && pass "host protocol names the review command" || fail "host protocol does not name review"

# ============================================================================
printf '\n--- handoff: review source ---\n'
# ============================================================================
# A real passing review run (shared fixture), so the validator can recompute its verdict.
RUN="$(node -e 'const os=require("os"),fs=require("fs"),path=require("path");const s=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"forge-review-handoff-")));process.stdout.write(require(process.argv[1])(process.argv[2],s).fixture().replace(/\\/g,"/"))' "$REPO_ROOT/tests/review-fixture.cjs" "$REPO_ROOT")"
handoff() { printf '{"version":"3.3.0","source":"review","timestamp":"2026-10-06T00:00:00+08:00","status":"COMPLETE"%s}' "$1" > "$RUN/handoff.json"; }
handoff ',"verdict":"SAFE_TO_MERGE","report":"report.html"'
bash "$VH" "$RUN/handoff.json" review >/dev/null 2>&1; assert_eq 0 "$?" "handoff: the verdict review.cjs computes + report → VALID"
handoff ',"verdict":"NEEDS_CHANGES","report":"report.html"'
bash "$VH" "$RUN/handoff.json" review >/dev/null 2>&1; assert_eq 1 "$?" "handoff: a verdict the ledger does not support → INVALID"
handoff ',"verdict":"SAFE_TO_MERGE"'
bash "$VH" "$RUN/handoff.json" review >/dev/null 2>&1; assert_eq 1 "$?" "handoff: no report → INVALID"
handoff ',"verdict":"MERGED","report":"report.html"'
bash "$VH" "$RUN/handoff.json" review >/dev/null 2>&1; assert_eq 1 "$?" "handoff: a verdict outside the enum → INVALID"
handoff ',"verdict":"SAFE_TO_MERGE","report":"report.html"'
bash "$VH" "$RUN/handoff.json" backlog >/dev/null 2>&1; assert_eq 1 "$?" "handoff: expected-source mismatch → INVALID"
printf '{"version":"3.3.0","source":"review","timestamp":"2026-10-06T00:00:00+08:00","status":"COMPLETE","verdict":"SAFE_TO_MERGE","report":"report.html"}' > "$T/h.json"
bash "$VH" "$T/h.json" review >/dev/null 2>&1; assert_eq 1 "$?" "handoff: no review.json to recompute from → INVALID"
node -e 'const fs=require("fs"),path=require("path"),run=process.argv[1];fs.rmSync(require(process.argv[2]).workspace(run).root,{recursive:true,force:true});fs.rmSync(path.dirname(path.dirname(path.dirname(run))),{recursive:true,force:true})' "$RUN" "$REPO_ROOT/scripts/review.cjs"
grep -q '`review`' "$REPO_ROOT/claude-plugin/skills/forge/references/handoff-schema.md" \
  && pass "handoff-schema documents the review source" || fail "handoff-schema missing review"

# ============================================================================
printf '\n--- orchestrator routing: review-change archetype ---\n'
# ============================================================================
classify() { bash "$ORCH" classify "$1" 2>/dev/null; }
assert_eq "review-change" "$(classify "review MR !231")"                        "classify: review MR !N"
assert_eq "review-change" "$(classify "code review the payment changes")"       "classify: code review"
assert_eq "review-change" "$(classify "review the pull requests waiting on me")" "classify: pull requests waiting on me"
assert_eq "review-change" "$(classify "review 42")"                             "classify: review N"
assert_eq "harden"        "$(classify "security review of PR 12")"              "classify: a security review stays harden"
assert_eq "clear-backlog" "$(classify "review the backlog")"                    "classify: backlog keeps priority"
assert_eq "fix-broken"    "$(classify "fix the review comments on my MR")"      "classify: answering a review is not reviewing"
printf '{"goal":"g","archetype":"review-change","predicate":"true","terminal_choice":"stop","cycle":0,"units_remaining":[],"pipeline_log":[]}' > "$T/state.json"
assert_eq "valid" "$(bash "$ORCH" validate-state "$T/state.json" 2>/dev/null)" "validate-state: review-change is a known archetype"
grep -q 'review-change' "$REPO_ROOT/claude-plugin/skills/forge/references/orchestrator-routing.md" \
  && pass "routing reference has the review-change row" || fail "routing reference missing review-change"
grep -q 'review-change' "$REPO_ROOT/CONTEXT.md" && pass "glossary lists review-change" || fail "glossary missing review-change"

# ============================================================================
printf '\n--- doctor: what review needs ---\n'
# ============================================================================
grep -q 'row "pandoc"' "$REPO_ROOT/scripts/doctor.sh" && pass "doctor runs Pandoc instead of trusting a shim" || fail "doctor has no Pandoc check"
grep -q 'check opt gcloud gcloud' "$REPO_ROOT/scripts/doctor.sh" && pass "doctor reports gcloud for Google Docs" || fail "doctor missing gcloud"
grep -q '25 commands' "$REPO_ROOT/scripts/doctor.sh" && pass "doctor header counts 25 commands" || fail "doctor header stale"

# ============================================================================
printf '\n--- distribution: six surfaces ---\n'
# ============================================================================
for m in ".claude/commands/forge/review.md" ".agents/skills/forge/review.md" "plugins/forge/skills/forge/review.md" \
         ".opencode/commands/forge_review.md" ".cursor/skills/forge/review.md"; do
  if [[ -f "$REPO_ROOT/$m" ]] && diff -q "$SPEC" "$REPO_ROOT/$m" >/dev/null 2>&1; then pass "mirror parity: $m"; else fail "mirror parity: $m (missing or diverged)"; fi
done
for d in .claude/skills/forge claude-plugin/skills/forge .agents/skills/forge plugins/forge/skills/forge .opencode/skills/forge .cursor/skills/forge; do
  for s in review.cjs review-report.cjs gdoc.cjs host.cjs investigate-export.cjs validate-handoff.sh orchestrate.sh; do
    if diff -q "$REPO_ROOT/scripts/$s" "$REPO_ROOT/$d/scripts/$s" >/dev/null 2>&1; then pass "seam parity: $d/scripts/$s"; else fail "seam parity: $d/scripts/$s (missing or diverged)"; fi
  done
done
for s in review.cjs review-report.cjs gdoc.cjs; do
  grep -q " $s " "$REPO_ROOT/scripts/transform.sh" && pass "transform.sh syncs $s" || fail "transform.sh runtime set misses $s"
done
printf '%s\n' '+++ b/src/a.js' '@@ -0,0 +1,2 @@' '+one' '+two' > "$T/d.patch"
assert_eq '{"src/a.js":[1,2]}' "$(node "$REPO_ROOT/claude-plugin/skills/forge/scripts/review.cjs" lines "$T/d.patch" 2>/dev/null)" "bundled review.cjs runs from the plugin tree"
for mf in "$REPO_ROOT/.claude-plugin/marketplace.json" "$REPO_ROOT/claude-plugin/.claude-plugin/plugin.json" "$REPO_ROOT/plugins/forge/.codex-plugin/plugin.json"; do
  name="${mf#$REPO_ROOT/}"
  grep -q "25 commands" "$mf" && pass "manifest count 25: $name" || fail "manifest count 25: $name"
  grep -q "backlog, review" "$mf" && pass "manifest lists review: $name" || fail "manifest lists review: $name"
done
grep -q '`/forge:review`' "$REPO_ROOT/claude-plugin/skills/forge/SKILL.md" && pass "claude router lists /forge:review" || fail "claude router missing /forge:review"
grep -q '`\$forge review`' "$REPO_ROOT/plugins/forge/skills/forge/SKILL.md" && pass "codex router lists \$forge review" || fail "codex router missing \$forge review"
grep -q '`/forge_review`' "$REPO_ROOT/.opencode/skills/forge/SKILL.md" && pass "opencode router lists /forge_review" || fail "opencode router missing /forge_review"
grep -q '`/forge review`' "$REPO_ROOT/.cursor/skills/forge/SKILL.md" && pass "cursor router lists /forge review" || fail "cursor router missing /forge review"

# ============================================================================
printf '\n--- docs ---\n'
# ============================================================================
grep -q '/forge:review' "$REPO_ROOT/README.md" && pass "README documents /forge:review" || fail "README missing /forge:review"
grep -q 'forge:review' "$REPO_ROOT/AGENTS.md" && pass "AGENTS.md lists forge:review" || fail "AGENTS.md missing forge:review"
[[ -f "$REPO_ROOT/guide/forge-review.md" ]] && grep -q 'SAFE_TO_MERGE' "$REPO_ROOT/guide/forge-review.md" \
  && pass "guide/forge-review.md explains the verdicts" || fail "guide/forge-review.md missing or incomplete"
grep -q 'forge-review.md' "$REPO_ROOT/guide/README.md" && pass "guide index links the review guide" || fail "guide index missing the review guide"
grep -q '/forge:review' "$REPO_ROOT/docs/project-changelog.md" && pass "changelog records /forge:review" || fail "changelog missing /forge:review"

printf '\n=== %d/%d passed (%d failed) ===\n' "$PASS" "$TOTAL" "$FAIL"
[[ "$FAIL" -eq 0 ]]
