#!/usr/bin/env bash
# Test harness for forge:backlog and the git-host layer it rests on: GitHub or GitLab, your
# repository or someone else's. Gates the host seam (scripts/host.cjs), the command contract, the
# host protocol, the wiring of the GitHub-worded commands, handoff + routing, and distribution parity.
set -uo pipefail

export AR_SCORE_LOG=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SPEC="$REPO_ROOT/claude-plugin/commands/forge/backlog.md"
PROTO="$REPO_ROOT/claude-plugin/skills/forge/references/host-protocol.md"
HOST="$REPO_ROOT/scripts/host.cjs"
ORCH="$REPO_ROOT/scripts/orchestrate.sh"
VH="$REPO_ROOT/claude-plugin/skills/forge/scripts/validate-handoff.sh"
DOC="$REPO_ROOT/scripts/doctor.sh"

PASS=0; FAIL=0; TOTAL=0
pass() { printf '  PASS: %s\n' "$1"; PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); }
fail() { printf '  FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); }
assert_eq() { if [[ "$1" == "$2" ]]; then pass "$3"; else fail "$3 (expected '$1', got '$2')"; fi; }
spec_has()  { grep -qiE -- "$1" "$SPEC"  && pass "$2" || fail "$2 (spec missing /$1/)"; }
proto_has() { grep -qiE -- "$1" "$PROTO" && pass "$2" || fail "$2 (protocol missing /$1/)"; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

# ============================================================================
printf '\n--- seam: host.cjs with injected host answers (no network, no gh/glab) ---\n'
# ============================================================================
if node "$REPO_ROOT/tests/host.test.cjs" "$REPO_ROOT" > "$T/host.txt" 2>&1; then
  pass "host seam: $(tail -n 1 "$T/host.txt")"
else
  fail "host seam: $(tail -n 1 "$T/host.txt")"
  grep '^FAIL' "$T/host.txt" | sed 's/^/    /'
fi

# ============================================================================
printf '\n--- seam: host.cjs against real git repositories ---\n'
# ============================================================================
mkrepo() { # $1 dir, $2 remote url (optional)
  mkdir -p "$1"
  git -C "$1" init -q
  if [[ -n "${2:-}" ]]; then git -C "$1" remote add origin "$2"; fi
}
field() { node -e 'const j=JSON.parse(process.argv[1]);process.stdout.write(String(j[process.argv[2]]))' "$1" "$2"; }

mkrepo "$T/local"
D_LOCAL="$(node "$HOST" detect "$T/local" 2>/dev/null)"
assert_eq "none"  "$(field "$D_LOCAL" host)" "detect: a repository with no remote has no host"
assert_eq "owner" "$(field "$D_LOCAL" role)" "detect: no remote is yours (nothing leaves the machine)"

# .test never resolves, so a logged-in glab on a developer machine cannot answer for it either.
mkrepo "$T/company" "https://oauth2:glpat-SECRETTOKEN@gitlab.example.test/acme/platform/api.git"
D_CO="$(node "$HOST" detect "$T/company" 2>/dev/null)"
assert_eq "gitlab"                  "$(field "$D_CO" host)"     "detect: GitLab remote recognised"
assert_eq "gitlab.example.test"     "$(field "$D_CO" hostname)" "detect: hostname parsed from the remote"
assert_eq "acme/platform/api"       "$(field "$D_CO" project)"  "detect: nested group path parsed"
assert_eq "glab"                    "$(field "$D_CO" cli)"      "detect: GitLab uses glab"
assert_eq "contributor"             "$(field "$D_CO" role)"     "detect: unverified identity fails closed to contributor"
case "$D_CO" in *SECRETTOKEN*|*oauth2*) fail "detect: a token in the remote URL must never be printed" ;; *) pass "detect: token in the remote URL is dropped" ;; esac

# A `git init` inside their checkout has no remote of its own, but it is not a fresh repository of yours.
mkrepo "$T/company/services/new"
D_NEST="$(node "$HOST" detect "$T/company/services/new" 2>/dev/null)"
assert_eq "gitlab"      "$(field "$D_NEST" host)" "detect: a nested repository reports the outer host"
assert_eq "contributor" "$(field "$D_NEST" role)" "detect: a nested repository takes the outer role"

mkrepo "$T/ssh" "git@github.com:acme/app.git"
D_SSH="$(node "$HOST" detect "$T/ssh" 2>/dev/null)"
assert_eq "github"   "$(field "$D_SSH" host)"    "detect: scp-style GitHub remote recognised"
assert_eq "acme/app" "$(field "$D_SSH" project)" "detect: scp-style path parsed"

mkrepo "$T/other" "https://code.example.test/acme/api.git"
D_OTHER="$(FORGE_HOST= node "$HOST" detect "$T/other" 2>/dev/null)"
assert_eq "unknown"     "$(field "$D_OTHER" host)" "detect: unrecognised host stays unknown"
assert_eq "contributor" "$(field "$D_OTHER" role)" "detect: unknown host is someone else's repository"
D_FORCED="$(FORGE_HOST=gitlab node "$HOST" detect "$T/other" 2>/dev/null)"
assert_eq "gitlab" "$(field "$D_FORCED" host)" "detect: FORGE_HOST settles a self-managed hostname"

# exclude: forge's run directory is ignored locally, their .gitignore is never touched, and it is idempotent.
TREE_BEFORE="$(git -C "$T/company" status --porcelain)"
node "$HOST" exclude "$T/company" >/dev/null 2>&1; RC=$?
assert_eq 0 "$RC" "exclude: exits 0 on their repository"
git -C "$T/company" check-ignore -q forge/backlog-260930-0900/backlog.tsv \
  && pass "exclude: files under forge/ are ignored" || fail "exclude: forge/ is not ignored"
node "$HOST" exclude "$T/company" >/dev/null 2>&1
assert_eq 1 "$(grep -c '^/forge/$' "$T/company/.git/info/exclude")" "exclude: running it twice adds one line"
mkdir -p "$T/company/forge/backlog-260930-0900"
printf 'ledger\n' > "$T/company/forge/backlog-260930-0900/backlog.tsv"
[[ ! -e "$T/company/.gitignore" && "$(git -C "$T/company" status --porcelain)" == "$TREE_BEFORE" ]] \
  && pass "exclude: a run directory leaves their tree and .gitignore untouched" || fail "exclude: their tree changed"
mkrepo "$T/theirs"
mkdir -p "$T/theirs/forge"
printf 'their own tool\n' > "$T/theirs/forge/anvil.txt"
git -C "$T/theirs" add forge/anvil.txt 2>/dev/null
git -C "$T/theirs" -c user.name=t -c user.email=t@example.test commit -q -m "add forge dir" 2>/dev/null
node "$HOST" exclude "$T/theirs" >/dev/null 2>"$T/exclude.err"; RC=$?
assert_eq 2 "$RC" "exclude: refuses when they already track a forge/ directory"
grep -q 'already tracks a forge/ directory' "$T/exclude.err" && pass "exclude: says why it refused" || fail "exclude: refusal has no reason"

# The user's own pin, in the clone's local git config, is the one thing that overrules detection.
git -C "$T/company" config forge.role owner
D_PIN="$(node "$HOST" detect "$T/company" 2>/dev/null)"
assert_eq "owner" "$(field "$D_PIN" role)" "detect: git config forge.role owner pins the role for that clone"
case "$(field "$D_PIN" basis)" in forge.role=owner*) pass "detect: the pin is named in the basis" ;; *) fail "detect: pinned role has no basis" ;; esac
assert_eq "owner" "$(field "$(node "$HOST" detect "$T/company/services/new" 2>/dev/null)" role)" "detect: a nested repository follows the outer repository, pin included"
git -C "$T/company/services/new" config forge.role owner
git -C "$T/company" config --unset forge.role
assert_eq "contributor" "$(field "$(node "$HOST" detect "$T/company/services/new" 2>/dev/null)" role)" "detect: a nested repository cannot pin itself"
git -C "$T/company" config forge.role admin
node "$HOST" detect "$T/company" >/dev/null 2>&1; RC=$?
assert_eq 2 "$RC" "detect: a junk pin is an error, not a guess"
git -C "$T/company" config --unset forge.role

mkdir -p "$T/plain"
node "$HOST" detect "$T/plain" >/dev/null 2>&1; RC=$?
assert_eq 2 "$RC" "detect: not a git repository → exit 2"
node "$HOST" issues "$T/other" >/dev/null 2>"$T/issues.err"; RC=$?
assert_eq 2 "$RC" "issues: unknown host → exit 2"
grep -q 'supply the backlog as a file' "$T/issues.err" && pass "issues: unknown host names the file fallback" || fail "issues: unknown host gives no way forward"
node "$HOST" mr abc "$T/company" >/dev/null 2>&1; RC=$?
assert_eq 2 "$RC" "mr: a non-numeric merge request id → exit 2"

# The ledger through the real command line: counts, and --live refusing a claim this repository cannot vouch for.
mkdir -p "$T/run/evidence"
printf 'proof\n' > "$T/run/evidence/green.txt"
printf 'id\ttype\tpriority\tstatus\ttitle\turl\tbranch\tmr\tevidence\n' > "$T/run/backlog.tsv"
printf '3\tbug\tP2\tin-review\tNull total\thttps://gitlab.example.test/acme/api/-/issues/3\t3-null-total\thttps://gitlab.example.test/acme/api/-/merge_requests/30\tevidence/green.txt\n' >> "$T/run/backlog.tsv"
printf '4\tunknown\t-\ttodo\tExport\thttps://gitlab.example.test/acme/api/-/issues/4\t-\t-\t-\n' >> "$T/run/backlog.tsv"
L_OUT="$(node "$HOST" ledger "$T/run/backlog.tsv" 2>/dev/null)"; RC=$?
assert_eq 0 "$RC" "ledger: a well-formed ledger exits 0"
assert_eq "LEDGER: VALID total=2 remaining=1 open=1 in_review=1 done=0 blocked=0 dropped=0" "$L_OUT" "ledger: counts remaining work and open merge requests"
node "$HOST" ledger "$T/run/backlog.tsv" --live "$T/local" >"$T/live.out" 2>"$T/live.err"; RC=$?
assert_eq 1 "$RC" "ledger --live: a claim the host cannot back is drift (exit 1)"
grep -q '^LEDGER: DRIFT' "$T/live.out" && grep -q 'outside this repository' "$T/live.err" \
  && pass "ledger --live: a merge request of another repository cannot vouch" || fail "ledger --live: foreign merge request accepted"
printf '5\tbug\tP1\tdone\tBump\thttps://gitlab.example.test/acme/api/-/issues/5\t5-bump\t-\tevidence/green.txt\n' >> "$T/run/backlog.tsv"
node "$HOST" ledger "$T/run/backlog.tsv" >/dev/null 2>"$T/done.err"; RC=$?
assert_eq 1 "$RC" "ledger: done without a merge request is INVALID"
grep -q 'done needs its branch and merge request URL' "$T/done.err" && pass "ledger: done must cite the merged request" || fail "ledger: done accepted without a merge request"

# ============================================================================
printf '\n--- spec: the backlog command contract ---\n'
# ============================================================================
spec_has "^name: forge:backlog"                        "spec: command name"
spec_has "host-protocol"                               "spec: companion contract referenced"
spec_has "AR_ROOT"                                     "spec: seam resolution (AR_ROOT)"
spec_has "host.cjs detect"                             "spec: host and role detected first"
spec_has "every session"                               "spec: role re-detected every session, not once per engagement"
spec_has "host.cjs issues"                             "spec: intake through the seam"
spec_has "<run>/backlog.tsv --live"                    "spec: ledger reconciled against the host"
spec_has "> <run>/backlog.tsv"                         "spec: the ledger is written under the run directory, not their tree"
spec_has "adopt what is already yours"                 "spec: own open merge requests adopted (nothing started twice)"
spec_has "never as a finished backlog"                 "spec: an empty intake is not a finished backlog"
spec_has "host.cjs mr"                                 "spec: merge-request gate through the seam"
spec_has "Backlog:"                                    "spec: file intake for trackers forge cannot read"
spec_has "info/exclude"                                "spec: run directory kept out of their history"
spec_has "host.cjs exclude"                            "spec: exclusion done by the seam (the safety hook blocks hand edits under .git)"
spec_has "conventions.md"                              "spec: their conventions recorded before work"
spec_has "baseline"                                    "spec: Guard judged against a recorded baseline"
spec_has "one branch and one merge request"            "spec: one item, one branch, one merge request"
spec_has "Red first"                                   "spec: reproduce or fail-first before changing code"
spec_has "root cause"                                  "spec: root-cause iron law"
spec_has "experiment: <id>"                            "spec: experiment commits (git memory)"
spec_has "git revert"                                  "spec: auto-revert on regress"
spec_has "never leave this machine"                    "spec: experiment commits are squashed before any push"
spec_has "Never weaken the net"                        "spec: never weaken tests or CI to pass"
spec_has "suppression comments"                        "spec: no suppression comments, allow_failure or raised retries"
spec_has "the ticket saying so is not enough"          "spec: a test or CI edit needs the user's confirmation, not the ticket's"
spec_has "by explicit path"                            "spec: staging by explicit path, never add -A"
spec_has "Still yours to start"                        "spec: item re-read on the host before work starts"
spec_has "reaches beyond localhost goes to the user"   "spec: pasted repro steps that download or install go to the user"
spec_has "rejects .experiment:."                       "spec: their commit hook is never bypassed"
spec_has "revert or a force-push"                      "spec: pipeline-as-verifier attempts are never experiments, reverts or force-pushes"
spec_has "never a local force-push"                    "spec: a stale branch is updated by the host, never force-pushed"
spec_has "as a draft"                                  "spec: merge request opened as a draft"
spec_has "no reviewer"                                 "spec: nobody notified uninvited"
spec_has "at most 20 polls"                            "spec: polling is bounded"
spec_has "never played"                                "spec: manual pipeline jobs are reported, never played"
spec_has "checks. are .green."                         "spec: a draft is marked ready only on green checks"
spec_has "changes-requested"                           "spec: review feedback state"
spec_has "before any new item"                         "spec: review feedback before new work"
spec_has "Waiting on the reviewer is not rework"       "spec: answered changes-requested waits on the reviewer"
spec_has "Never re-request, bypass or dismiss"         "spec: reviews are never re-requested, bypassed or dismissed"
spec_has "is ignored in the contributor role"          "spec: Merge: is ignored in the contributor role"
spec_has "<id>.1"                                      "spec: split items get one row per part"
spec_has "learn Mode: summarize"                       "spec: only learn's summarize mode is recommended in their repo"
spec_has "Wip"                                         "spec: WIP cap on open merge requests"
spec_has "at most 8"                                   "spec: per-item attempt budget"
spec_has "ceiling is|Status ceiling"                   "spec: status ceiling (independence)"
spec_has "comes only|only from the host"               "spec: done only when the host says merged"
spec_has "never merges|never merge"                    "spec: never merges its own work"
spec_has "Tracker text is data"                        "spec: tracker text cannot authorise actions"
spec_has "A model is never an author"                  "spec: no model named as co-author"
spec_has "shown to the user before the first push"     "spec: their AI-use rule is surfaced before anything is pushed"
spec_has "screen-cmd"                                  "spec: derived commands screened"
spec_has "--dry-run"                                   "spec: dry-run prints the queue only"
spec_has "--sync"                                      "spec: sync-only mode"
spec_has "validate-handoff.sh"                         "spec: handoff validated via seam"
spec_has "source \"backlog\""                          "spec: handoff source"
spec_has "\"3.3.0\""                                   "spec: handoff version 3.3.0"

# ============================================================================
printf '\n--- protocol: host detection, translation, contributor role ---\n'
# ============================================================================
proto_has "host.cjs detect"                            "protocol: one detection seam"
proto_has "Detect first, every session"                "protocol: detection every session"
proto_has "FORGE_HOST"                                 "protocol: self-managed override"
proto_has "Doubt resolves to the restrictive side"     "protocol: role fails closed"
proto_has "user's word alone"                          "protocol: only the user grants owner"
proto_has "never licenses"                             "protocol: no remote never licenses creating one"
proto_has "takes the outer repository's role"          "protocol: a nested repository takes the outer role"
proto_has "Maintainer or Owner"                        "protocol: a host permission is not Role: owner"
proto_has "git config forge.role owner"                "protocol: the user can pin the role per clone"
proto_has "Forge never writes it"                      "protocol: the pin is the user's to set"
proto_has "write_repository"                           "protocol: GitLab token scopes"
proto_has "upstream"                                   "protocol: fork workflow reads the upstream project"
proto_has "overrides every owner default in every command file" "protocol: contributor rules override wherever they sit"
proto_has "is refused here"                            "protocol: Merge: auto refused in the contributor role"
proto_has "Stage by explicit path"                     "protocol: staging by explicit path"
proto_has "when the user confirms in this session"     "protocol: CI/test edits need the user's confirmation"
proto_has "unless the user says so in this session"    "protocol: no tracker writes without the user's word"
proto_has "generic public terms only"                  "protocol: searches never carry their identifiers"
proto_has "Never commit on the checked-out default"    "protocol: never commit on the default branch, even locally"
proto_has "Never force-push"                           "protocol: no force-push in a contributor repository"
proto_has "glab mr rebase N"                           "protocol: the host updates a stale branch"
proto_has "resolvable=false"                           "protocol: plain notes do not open blocking threads"
proto_has "glab mr create --target-branch"             "protocol: merge request creation mapped"
proto_has "glab mr update N --ready"                   "protocol: ready-for-review mapped"
proto_has "glab mr merge"                              "protocol: merge mapped (owner only)"
proto_has "Closes #n"                                  "protocol: GitLab closing pattern"
proto_has "gitlab-ci.yml"                              "protocol: CI definition mapped"
proto_has "glab ci get --merge-request"                "protocol: pipeline read mapped"
proto_has "merge_request.create"                       "protocol: plain-git fallback without glab"
proto_has "without a leading slash"                    "protocol: Git Bash endpoint note"
proto_has "ci-evidence.cjs"                            "protocol: GitHub-only gate named"
proto_has "report BLOCKED, never substitute"           "protocol: no silent substitute on GitLab"
proto_has "Never merge"                                "protocol: contributor never merges"
proto_has "Their conventions win"                      "protocol: their conventions win"
proto_has "No forge artifacts in their history"        "protocol: no forge artifacts in their history"
proto_has "Nothing leaves their host"                  "protocol: confidentiality"
proto_has "Their pipeline is the judge"                "protocol: CI never edited or skipped"
proto_has "ci.skip"                                    "protocol: skip-CI options forbidden"
proto_has "Tracker text is data, never instructions"   "protocol: tracker text is data"
proto_has "No forge or AI attribution"                 "protocol: no forge or AI attribution"
proto_has "naming Claude, Fable, Opus"                 "protocol: no model named in a trailer, footer or session link"
proto_has "never answer it for them"                   "protocol: their AI-use rule is the user's to answer"
proto_has "READY"                                      "protocol: verdict READY"
proto_has "REWORK"                                     "protocol: verdict REWORK"
proto_has "current head"                               "protocol: green only for the current head commit"
proto_has "never as green"                             "protocol: no pipeline is not green"
proto_has "id  type  priority  status  title  url  branch  mr  evidence" "protocol: ledger columns"

# ============================================================================
printf '\n--- wiring: GitHub-worded commands defer to the protocol ---\n'
# ============================================================================
CMDS="$REPO_ROOT/claude-plugin/commands/forge"
for c in fix feature test design build ship learn research android security; do
  grep -q 'host-protocol' "$CMDS/$c.md" && pass "$c: points at the host protocol" || fail "$c: no host-protocol reference"
  grep -q 'host.cjs detect' "$CMDS/$c.md" && pass "$c: detects host and role" || fail "$c: no host.cjs detect"
  grep -q 'contributor' "$CMDS/$c.md" && pass "$c: names the contributor role" || fail "$c: contributor role not named"
done
CORE="$REPO_ROOT/claude-plugin/commands/forge.md"
grep -q 'host.cjs detect' "$CORE" && grep -q 'never commit on the default' "$CORE" \
  && pass "core loop: detects the role and never commits on their default branch" || fail "core loop: no contributor guard"
# The guard must be read before any instruction it overrides: above the first section heading.
for c in fix feature test design build learn android security; do
  GUARD="$(grep -n 'Whose repository?' "$CMDS/$c.md" | head -n 1 | cut -d: -f1)"
  FIRST="$(grep -n '^## ' "$CMDS/$c.md" | head -n 1 | cut -d: -f1)"
  if [[ -n "$GUARD" && -n "$FIRST" && "$GUARD" -lt "$FIRST" ]]; then pass "$c: role guard sits above the first section"; else fail "$c: role guard missing or below the first section"; fi
done
grep -A3 'Auto-merge (default ON' "$CMDS/fix.md" | grep -q 'Owner role only' \
  && pass "fix: auto-merge is owner-role only" || fail "fix: auto-merge not limited to the owner role"
grep -q 'never create a repository or add a remote' "$CMDS/feature.md" \
  && pass "feature: never creates a repo for someone else's code" || fail "feature: repo creation not guarded"
ROUTER="$REPO_ROOT/.claude/skills/forge/SKILL.md"
grep -q 'contributor role' "$ROUTER" && pass "router: contributor-role safety invariant" || fail "router: no contributor invariant"
grep -q 'Host: github' "$ROUTER" && pass "router: Host: flag" || fail "router: no Host: flag"
grep -q 'Role: owner' "$ROUTER" && pass "router: Role: flag" || fail "router: no Role: flag"
for tree in .claude claude-plugin .agents plugins/forge .opencode; do
  grep -q 'A model is never an author' "$REPO_ROOT/$tree/skills/forge/SKILL.md" \
    && pass "router ($tree): no model is named as author" || fail "router ($tree): no-AI-authorship invariant missing"
done
grep -q 'Co-Authored-By' "$CORE" && pass "core loop: commit carries no AI trailer" || fail "core loop: commit phase silent on AI trailers"
grep -q 'host-protocol' "$REPO_ROOT/claude-plugin/skills/forge/references/integrations-protocol.md" \
  && pass "integrations: tracker of record follows the host" || fail "integrations: tracker still GitHub-only"

# ============================================================================
printf '\n--- handoff: backlog source ---\n'
# ============================================================================
printf '{"version":"3.3.0","source":"backlog","timestamp":"2026-09-30T00:00:00+08:00","status":"BOUNDED","results_tsv":"backlog.tsv","remaining":2,"host":"gitlab","role":"contributor"}' > "$T/handoff.json"
bash "$VH" "$T/handoff.json" backlog >/dev/null 2>&1; RC=$?
assert_eq 0 "$RC" "handoff: backlog with results_tsv → VALID"
printf '{"version":"3.3.0","source":"backlog","timestamp":"2026-09-30T00:00:00+08:00","status":"COMPLETE"}' > "$T/handoff-bad.json"
bash "$VH" "$T/handoff-bad.json" backlog >/dev/null 2>&1; RC=$?
assert_eq 1 "$RC" "handoff: backlog without its ledger → INVALID"
bash "$VH" "$T/handoff.json" fix >/dev/null 2>&1; RC=$?
assert_eq 1 "$RC" "handoff: expected-source mismatch → INVALID"
SCHEMA="$REPO_ROOT/claude-plugin/skills/forge/references/handoff-schema.md"
grep -q '`backlog`' "$SCHEMA" && pass "handoff-schema documents the backlog source" || fail "handoff-schema missing backlog"

# ============================================================================
printf '\n--- orchestrator routing: clear-backlog archetype ---\n'
# ============================================================================
classify() { bash "$ORCH" classify "$1" 2>/dev/null; }
assert_eq "clear-backlog" "$(classify "fix and complete the backlog")"            "classify: backlog wins over an incidental fix"
assert_eq "clear-backlog" "$(classify "work through the issues assigned to me")"  "classify: assigned to me → clear-backlog"
assert_eq "clear-backlog" "$(classify "implement my GitLab issues")"              "classify: GitLab issues → clear-backlog"
assert_eq "clear-backlog" "$(classify "ship my open tickets this sprint")"        "classify: my tickets wins over ship"
assert_eq "harden"        "$(classify "audit the backlog for security holes")"    "classify: security keeps priority over backlog"
assert_eq "fix-broken"    "$(classify "fix the issues in the login flow")"        "classify: bare 'issues' stays fix-broken"
assert_eq "build-feature" "$(classify "build a support ticket app")"              "classify: bare 'ticket' stays build-feature"
printf '{"goal":"g","archetype":"clear-backlog","predicate":"true","terminal_choice":"stop","cycle":0,"units_remaining":[],"pipeline_log":[]}' > "$T/state.json"
assert_eq "valid" "$(bash "$ORCH" validate-state "$T/state.json" 2>/dev/null)" "validate-state: clear-backlog is a known archetype"
grep -q 'clear-backlog' "$REPO_ROOT/claude-plugin/skills/forge/references/orchestrator-routing.md" \
  && pass "routing reference lists clear-backlog" || fail "routing reference missing clear-backlog"

# ============================================================================
printf '\n--- doctor: host CLI rows ---\n'
# ============================================================================
D_OUT="$(bash "$DOC" 2>/dev/null)"
case "$D_OUT" in *glab*GitLab*) pass "doctor: glab row" ;; *) fail "doctor: no glab row" ;; esac
case "$D_OUT" in *gh*GitHub*)   pass "doctor: gh row names host operations" ;; *) fail "doctor: gh row stale" ;; esac

# ============================================================================
printf '\n--- distribution: mirror parity (5 surfaces byte-identical) ---\n'
# ============================================================================
for m in ".claude/commands/forge/backlog.md" ".agents/skills/forge/backlog.md" \
         "plugins/forge/skills/forge/backlog.md" ".opencode/commands/forge_backlog.md"; do
  if [[ -f "$SPEC" && -f "$REPO_ROOT/$m" ]] && diff -q "$SPEC" "$REPO_ROOT/$m" >/dev/null 2>&1; then
    pass "mirror parity: $m"
  else
    fail "mirror parity: $m (missing or diverged)"
  fi
done
for d in .claude/skills/forge claude-plugin/skills/forge .agents/skills/forge plugins/forge/skills/forge .opencode/skills/forge; do
  if [[ -f "$PROTO" ]] && diff -q "$PROTO" "$REPO_ROOT/$d/references/host-protocol.md" >/dev/null 2>&1; then
    pass "protocol parity: $d"
  else
    fail "protocol parity: $d (missing or diverged)"
  fi
  for s in host.cjs acceptance.cjs validate-handoff.sh orchestrate.sh doctor.sh; do
    if diff -q "$REPO_ROOT/scripts/$s" "$REPO_ROOT/$d/scripts/$s" >/dev/null 2>&1; then
      pass "seam parity: $d/scripts/$s"
    else
      fail "seam parity: $d/scripts/$s (missing or diverged)"
    fi
  done
done
grep -q 'host\.cjs' "$REPO_ROOT/scripts/transform.sh" \
  && pass "transform.sh syncs host.cjs" || fail "transform.sh missing host.cjs in runtime set"
# The bundled copy must run from an installed tree, with no checkout-relative path.
BUNDLED="$(node "$REPO_ROOT/claude-plugin/skills/forge/scripts/host.cjs" detect "$T/local" 2>/dev/null)"
assert_eq "none" "$(field "$BUNDLED" host)" "bundled host.cjs runs from the plugin tree"

# ============================================================================
printf '\n--- distribution: manifests + routers ---\n'
# ============================================================================
for mf in "$REPO_ROOT/.claude-plugin/marketplace.json" \
          "$REPO_ROOT/claude-plugin/.claude-plugin/plugin.json" \
          "$REPO_ROOT/plugins/forge/.codex-plugin/plugin.json"; do
  name="${mf#$REPO_ROOT/}"
  grep -q "22 commands" "$mf" && pass "manifest count 22: $name" || fail "manifest count 22: $name"
  grep -q "android, backlog" "$mf" && pass "manifest lists backlog: $name" || fail "manifest lists backlog: $name"
done
grep -q '/forge:backlog' "$REPO_ROOT/.claude/skills/forge/SKILL.md" \
  && pass "claude router uses colon naming" || fail "claude router missing /forge:backlog"
grep -q '/forge:backlog' "$REPO_ROOT/claude-plugin/skills/forge/SKILL.md" \
  && pass "claude plugin router lists backlog" || fail "claude plugin router missing /forge:backlog"
grep -q '\$forge backlog' "$REPO_ROOT/.agents/skills/forge/SKILL.md" \
  && pass "codex router uses \$forge naming" || fail "codex router missing \$forge backlog"
grep -q '\$forge backlog' "$REPO_ROOT/plugins/forge/skills/forge/SKILL.md" \
  && pass "codex plugin router lists backlog" || fail "codex plugin router missing \$forge backlog"
grep -q '/forge_backlog' "$REPO_ROOT/.opencode/skills/forge/SKILL.md" \
  && pass "opencode router uses underscore naming" || fail "opencode router missing /forge_backlog"

# ============================================================================
printf '\n--- docs: README, guide, changelog, agents ---\n'
# ============================================================================
grep -q '`/forge:backlog`' "$REPO_ROOT/README.md" && pass "README command table row" || fail "README missing /forge:backlog row"
grep -q 'GitLab' "$REPO_ROOT/README.md" && pass "README names GitLab" || fail "README does not mention GitLab"
[[ -f "$REPO_ROOT/guide/forge-backlog.md" ]] && pass "guide/forge-backlog.md exists" || fail "guide/forge-backlog.md missing"
grep -q 'forge-backlog\.md' "$REPO_ROOT/guide/README.md" && pass "guide index links forge-backlog" || fail "guide index missing forge-backlog"
grep -q 'forge:backlog' "$REPO_ROOT/docs/project-changelog.md" && pass "changelog records forge:backlog" || fail "changelog missing forge:backlog"
grep -q 'forge:backlog' "$REPO_ROOT/AGENTS.md" && pass "AGENTS.md lists forge:backlog" || fail "AGENTS.md missing forge:backlog"

# ============================================================================
printf '\n=== %d/%d passed (%d failed) ===\n' "$PASS" "$TOTAL" "$FAIL"
# ============================================================================
[[ "$FAIL" -eq 0 ]]
