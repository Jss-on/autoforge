#!/usr/bin/env bash
# orchestrate.sh — deterministic seam for the forge orchestrator loop.
#
#   classify   <goal-string>   → Goal archetype label (keyword heuristics; 11 archetypes)
#   next-hop   <state.json>    → Next subcommand from router decision table
#   units      <results.json>  → Units-remaining scalar (lower_is_better)
#   plateau    <history.txt>   → Exit 0 if last N computed values are flat-or-worse
#   screen-cmd <shell-string>  → "ok" exit 0 | "refuse" exit 1 safety gate
#   verdict    <state.json>    → CONVERGED|PLATEAU|CEILING|RUNNING|BLOCKED + ship-gate
#
# All subcommands are pure and CI-usable via exit codes.
set -uo pipefail

# ---------------------------------------------------------------------------
# classify: map a goal string to one of the 11 Goal archetype labels.
# Priority order matters: higher-stakes archetypes checked first so that
# "fix and add the broken feature" → fix-broken, not build-feature.
# ---------------------------------------------------------------------------
classify() {
  local goal="${1:?usage: classify <goal-string>}"
  local g
  g=$(printf '%s' "$goal" | tr '[:upper:]' '[:lower:]')

  # Security/hardening — above build because "secure" is higher stakes than "add".
  # Full trigger set from references/orchestrator-routing.md: security/audit/OWASP/CVE
  # ("security" does NOT contain "secure", so it needs its own alternative).
  if printf '%s' "$g" | grep -qE '(secure|security|harden|vuln|audit|owasp|cve|lock.?down)'; then
    echo "harden"; return 0
  fi

  # Android packaging — after harden (security keeps priority), before ship/fix: "publish the
  # apk", "convert to android", "fix the android build" all belong to the android command, which
  # owns its own trust/package/device-gate/release loop (single-pass dispatch).
  if printf '%s' "$g" | grep -qE '(android|\bapk\b|\baab\b|play store|google play|\btwa\b|trusted web activity)'; then
    echo "package-android"; return 0
  fi

  # Ship/release/deploy — checked before fix-broken per the router spec:
  # an explicit "ship" wins over an incidental fix mention ("fix the bug then ship").
  if printf '%s' "$g" | grep -qE '(ship|release|deploy)'; then
    echo "ship-ready"; return 0
  fi

  # Broken/bugfix
  if printf '%s' "$g" | grep -qE '(fix|bug|broken)'; then
    echo "fix-broken"; return 0
  fi

  # Product direction — requires a "what …" question so bare "next"/"build" in a
  # build-feature goal (e.g. "build the next-gen parser") doesn't mis-route here.
  if printf '%s' "$g" | grep -qE '(what.*build|what.*next)'; then
    echo "what-to-build"; return 0
  fi

  # Build/implement/add — "feature" alone is insufficient; any of these words qualify
  if printf '%s' "$g" | grep -qE '(build|implement|add)'; then
    echo "build-feature"; return 0
  fi

  # UI/UX quality — polish/redesign/usability goals route to the design command
  # (audit → --fix loop; predicate = score-design.sh verdict SHIP). Checked AFTER build so
  # "build the UI for X" stays greenfield work; bare "design" is NOT enough ("design
  # decision" is decide-design below) — the surface words are.
  if printf '%s' "$g" | grep -qE '(redesign|ui/ux|\bui\b|\bux\b|user interface|look and feel|looks? (bad|ugly|generic|dated|amateur)|ugly|polish the|slop|usability|accessib)'; then
    echo "polish-ui"; return 0
  fi

  # Metric optimization
  if printf '%s' "$g" | grep -qE '(faster|smaller|reduce|optimize|coverage)'; then
    echo "optimize-metric"; return 0
  fi

  # Documentation
  if printf '%s' "$g" | grep -qE '(document|docs)'; then
    echo "document"; return 0
  fi

  # Design decision — "should we" / "decide" / "approach"
  if printf '%s' "$g" | grep -qE '(should we|decide|approach)'; then
    echo "decide-design"; return 0
  fi

  # Default: open-ended investigation
  echo "explore"
}

# ---------------------------------------------------------------------------
# next-hop: cheap router over fields in a state JSON file.
# Decision order: errors → regression → untested gaps → ship/DONE.
# ---------------------------------------------------------------------------
next-hop() {
  local state_file="${1:?usage: next-hop <state.json>}"
  if [[ ! -f "$state_file" ]]; then
    echo "ERROR: missing state file" >&2; return 2
  fi

  # Parse with node's real JSON parser — node is already a hard CORE dependency
  # (hooks, doctor), so grep/sed pseudo-parsing was hand-rolling around a solved
  # problem: nested strings, reordered keys, and string-typed numbers all
  # mis-parsed silently. Invalid JSON is now a hard malformed-state error.
  # Fields join on unit-separator (charCode 31), NOT tab: tab is IFS-whitespace
  # and bash read collapses leading whitespace-delimited empty fields, shifting
  # values into the wrong variables.
  local parsed
  if ! parsed=$(node -e '
      const fs = require("fs");
      let j;
      try { j = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); }
      catch { process.exit(3); }
      const num = (k) => (typeof j[k] === "number" ? String(j[k]) : "");
      const str = (k) => (typeof j[k] === "string" ? j[k] : "");
      const boo = (k) => (typeof j[k] === "boolean" ? String(j[k]) : "");
      console.log([num("errors_remaining"), str("regression_verdict"),
                   num("untested_gaps"), str("archetype"),
                   boo("pending_verify"), str("terminal_choice")].join(String.fromCharCode(31)));
    ' "$state_file" 2>/dev/null); then
    echo "ERROR: malformed state file" >&2; return 2
  fi
  local errors regression gaps archetype pending terminal
  IFS=$'\x1f' read -r errors regression gaps archetype pending terminal <<< "$parsed"

  # Guard: a routable ledger must at least carry its archetype (the same field
  # validate-state requires), so a file that passes validate-state never ERRORs
  # here. The per-signal fields are OPTIONAL: absent errors/gaps default to 0 and
  # an absent regression verdict is treated as not-UNSTABLE — early cycles write
  # signals incrementally and must still route instead of dying "malformed".
  if [[ -z "$archetype" ]]; then
    echo "ERROR: malformed state file" >&2; return 2
  fi
  errors="${errors:-0}"
  gaps="${gaps:-0}"

  if [[ "$errors" -gt 0 ]]; then
    echo "fix"; return 0
  fi

  if [[ "$regression" == "UNSTABLE" ]]; then
    echo "regression"; return 0
  fi

  if [[ "$gaps" -gt 0 ]]; then
    echo "debug"; return 0
  fi

  # Gaps clear but an accepted high-impact change still needs a fresh, independent
  # acceptance check (separate from the signal used to choose it) → verify first.
  if [[ "$pending" == "true" ]]; then
    echo "verify"; return 0
  fi

  # A ship archetype is not permission: only the explicit terminal choice routes
  # to the human-gated ship workflow. Missing choices stop at verification.
  if [[ "$archetype" == "ship-ready" && "$terminal" == "proceed-to-ship" ]]; then
    echo "ship"; return 0
  fi

  echo "DONE"
}

# ---------------------------------------------------------------------------
# units: compute Units-remaining scalar from a results JSON file.
# Formula: failing_tests + open_hard_regressions + max(0, metric_delta / metric_target)
# Prints "unknown" and exits 2 when inputs are missing or uncomputable.
# ---------------------------------------------------------------------------
units() {
  local results_file="${1:?usage: units <results.json>}"
  # Validate and calculate in the same parser: metric overshoot cannot cancel
  # hard failures, and invalid numeric inputs never become a completion signal.
  if node -e '
      const fs = require("fs");
      let j;
      try { j = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); }
      catch { process.exit(3); }
      for (const k of ["failing_tests", "open_hard_regressions"])
        if (!Number.isSafeInteger(j[k]) || j[k] < 0) process.exit(3);
      const ratio = j.metric_delta / j.metric_target;
      if (![j.metric_delta, j.metric_target, ratio].every(Number.isFinite)) process.exit(3);
      const remaining = j.failing_tests + j.open_hard_regressions + Math.max(0, ratio);
      if (!Number.isFinite(remaining)) process.exit(3);
      console.log(remaining);
    ' "$results_file" 2>/dev/null; then return 0; fi
  echo "unknown"; return 2
}

# ---------------------------------------------------------------------------
# plateau: read newline list of unit values; determine if progress has stalled.
# Skips interleaved "unknown" cycles; N=5 consecutive trailing unknowns = BLOCKED.
# Exit 0 = plateau (no net progress); exit 1 = still improving; exit 3 = BLOCKED.
# ---------------------------------------------------------------------------
plateau() {
  local history_file="${1:?usage: plateau <history.txt>}"
  local n=5

  if [[ ! -f "$history_file" ]]; then
    echo "BLOCKED"; return 3
  fi

  awk -v n="$n" '
    {
      line = $0
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
      if (line == "unknown") { trailing_unknown++; next }            # crash/uncomputable cycle
      if (line ~ /^[0-9]/)   { vals[++count] = line + 0; trailing_unknown = 0 }
    }
    END {
      # A runner stuck emitting "unknown" must not read as progress: n consecutive
      # trailing unknowns (or no computed value at all) → BLOCKED, not "improving".
      if (trailing_unknown >= n) { print "BLOCKED"; exit 3 }
      if (count == 0)            { print "BLOCKED"; exit 3 }

      # Need at least n computed values before a plateau call.
      if (count < n) { exit 1 }

      # Net progress over the window = last value strictly below the first
      # (lower_is_better). Any oscillation that nets flat-or-worse is a plateau,
      # so a thrashing loop stops instead of running to the ceiling.
      start = count - n + 1
      if (vals[count] < vals[start]) { exit 1 }   # net improvement → still working
      exit 0                                       # flat or worse → plateau
    }
  ' "$history_file"
}

# ---------------------------------------------------------------------------
# screen-cmd: safety gate for shell strings before execution.
# Prints "ok" / "refuse". DB destinations must be loopback/plain container
# hostnames, or (PostgreSQL/MySQL only) have a _test or _ci database suffix.
# Bare substring "test" inside words like "latest" or "precision" must NOT qualify.
# ---------------------------------------------------------------------------
screen-cmd() {
  local cmd="${1:?usage: screen-cmd <shell-string>}"
  # Inspect static shell words as data, never eval/source them. Keep command
  # boundaries and quoted arguments together when checking URL/credential scope.
  # ponytail: lexical screening cannot resolve expansions, scripts or aliases;
  # the host sandbox and explicit execution approvals remain the real boundary.
  if ! cmd=$(MSYS2_ARG_CONV_EXCL='*' node - "$cmd" <<'NODE'
const raw = process.argv[2];
const tokenPattern = /(?:[^\s'"\\;&|()]+|\\[^\n]|"(?:\\.|[^"\\])*"|'[^']*')+|&&|\|\||[;&|()\n]/g;
const tokens = raw.match(tokenPattern) || [];
const word = (s) => s.replace(/'([^']*)'|"((?:\\.|[^"\\])*)"|\\(.)/gs,
  (_, single, double, escaped) => single ?? (double === undefined ? escaped : double.replace(/\\([$`"\\])/g, "$1")));
const base = (s) => (s || "").split("/").pop();
const allowedPassword = /^(POSTGRES|MYSQL|MARIADB|REDIS|PG)_PASSWORD$/;
const scheme = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?):\/\/[^\s'"<>;|()]+/gi;
let segment = [], downloaded = false;
function checkSegment() {
  const words = segment.map(word);
  const executable = words.slice();
  while (/^(if|then|else|do|while|until|!)$/.test(executable[0] || "")) executable.shift();
  while (executable.length) {
    if (/^[A-Za-z_]\w*=/.test(executable[0])) { executable.shift(); continue; }
    if (!/^(env|command|sudo|timeout|xargs)$/.test(base(executable[0]))) break;
    const wrapper = base(executable.shift());
    while (/^-/.test(executable[0] || "")) {
      const option = executable.shift();
      if (option === "--") break;
      if (wrapper === "env" && /^(?:-S|--split-string(?:=|$))/.test(option)) {
        const value = option.startsWith("-S") && option.length > 2 ? option.slice(2)
          : option.includes("=") ? option.slice(option.indexOf("=") + 1) : executable.shift();
        if (value === undefined || /[$`\\]/.test(value)) process.exit(1);
        const split = value.match(tokenPattern) || [];
        if (split.some(t => /^(?:&&|\|\||[;&|()\n])$/.test(t))) process.exit(1);
        executable.unshift(...split.map(word));
        break;
      }
      if (wrapper === "env" && /^(?:-C|--chdir|-u|--unset|-a|--argv0)$/.test(option)) {
        if (!executable.length) process.exit(1);
        executable.shift();
      }
    }
    if (wrapper === "timeout") executable.shift();
  }
  // Dynamic executable selection cannot be screened without evaluating it.
  if (!["[", "[["].includes(base(executable[0])) && /[$`*?\[\]{}]/.test(executable[0] || "")) process.exit(1);
  if (downloaded && /^(sh|bash|zsh|dash|fish|ksh|python[0-9.]*|perl|ruby|node|php)$/.test(base(executable[0]))) process.exit(1);
  if (/^(curl|wget)$/.test(base(executable[0]))) downloaded = true;
  const container = /^(docker|docker-compose|podman)$/.test(base(executable[0]));
  for (const value of words) {
    for (const m of value.matchAll(/([A-Za-z0-9_]*PASSWORD)\s*=/g))
      if (!allowedPassword.test(m[1]) || !container) process.exit(1);
    for (const match of value.matchAll(scheme)) {
      let url;
      try { url = new URL(match[0]); } catch { process.exit(1); }
      const host = url.hostname.toLowerCase();
      const local = /^(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/.test(host);
      let database;
      try { database = decodeURIComponent(url.pathname.slice(1)); } catch { process.exit(1); }
      // Connection overrides can replace an apparently local URL destination.
      if ([...url.searchParams.keys()].some(k => /^(host|hostaddr|service|dbname)$/i.test(k))) process.exit(1);
      const testDatabase = /^(postgres(?:ql)?|mysql):$/i.test(url.protocol) && /(?:_test|_ci)$/.test(database);
      if (!local && !testDatabase) process.exit(1);
    }
  }
  segment = [];
}
for (const token of tokens) {
  if (/^(?:&&|\|\||[;&|()\n])$/.test(token)) {
    checkSegment();
    if (token !== "|") downloaded = false;
  }
  else segment.push(token);
}
checkSegment();
// Normalize static quoted/escaped executable words (r"m", r\m, /bin/"rm").
// Keep code strings and spaced arguments intact; no shell evaluation occurs.
process.stdout.write(raw.replace(tokenPattern, token => {
  const value = word(token);
  return /^[A-Za-z0-9_./-]+$/.test(value) ? value : token;
}));
NODE
  ); then
    echo "refuse"; return 1
  fi
  # Shell operators delimit commands even without whitespace; do not let the
  # optional executable path swallow an operator and hide the next command.
  # ponytail: lexical screening; use host sandboxing for execution isolation.
  local command_start='(^|[[:space:];&|()])([^[:space:];&|()]*/)?'

  # rm with recursive AND force, in any flag arrangement: bundled (-rf/-Rf/-fr),
  # separate (-r -f), or long (--recursive --force). Both flags must be present.
  # The optional path prefix catches path-qualified invocations (/bin/rm, ./rm,
  # /usr/local/bin/rm) that a bare command-name anchor would miss.
  if printf '%s' "$cmd" | grep -qE "${command_start}rm([[:space:]]|$)"; then
    local rm_rec=0 rm_force=0
    printf '%s' "$cmd" | grep -qE -- '(^|[[:space:]])-[a-zA-Z]*[rR]|--recursive' && rm_rec=1
    printf '%s' "$cmd" | grep -qE -- '(^|[[:space:]])-[a-zA-Z]*[fF]|--force'     && rm_force=1
    if [[ "$rm_rec" -eq 1 && "$rm_force" -eq 1 ]]; then
      echo "refuse"; return 1
    fi
  fi

  # curl/wget piped to an interpreter (sh/bash/zsh/dash/fish/ksh/python/perl/ruby/
  # node/php), including a path-qualified one (| /bin/bash). Enumerated interpreters
  # rather than "refuse any curl pipe" so a legitimate derived predicate that pipes
  # curl output to a parser (jq/grep/awk) is not falsely refused.
  if printf '%s' "$cmd" | grep -qE '(curl|wget)[^|]*\|[[:space:]]*([^[:space:]]*/)?(sh|bash|zsh|dash|fish|ksh|python[0-9.]*|perl|ruby|node|php)([[:space:]]|$)'; then
    echo "refuse"; return 1
  fi

  # Common wrappers may still hand the downloaded payload to an interpreter.
  if printf '%s' "$cmd" | grep -qE '(curl|wget)[^|]*\|.*(xargs|env|command|sudo|timeout).*([[:space:]])([^[:space:]]*/)?(sh|bash|zsh|dash|fish|ksh|python[0-9.]*|perl|ruby|node|php)([[:space:]]|$)'; then
    echo "refuse"; return 1
  fi

  # Output piped to netcat exfiltrates data off-host.
  if printf '%s' "$cmd" | grep -qE '\|[[:space:]]*([^[:space:]]*/)?(nc|ncat|netcat)([[:space:]]|$)'; then
    echo "refuse"; return 1
  fi

  # Raw block-device write — dd target or shell redirect onto a disk device wipes it.
  # Scoped to real device families (incl. SD/eMMC mmcblk, mdadm md, device-mapper dm-)
  # so dd/redirect to /dev/null or a regular file stays ok.
  if printf '%s' "$cmd" | grep -qE '(of=|>[[:space:]]*)/dev/(sd|hd|vd|nvme|disk|mapper|loop|xvd|mmcblk|md|dm-)'; then
    echo "refuse"; return 1
  fi

  # Filesystem format destroys everything on a partition. Optional path prefix catches a
  # path-qualified invocation (/sbin/mkfs.ext4) that a bare-name anchor would miss.
  if printf '%s' "$cmd" | grep -qE "${command_start}(mkfs|mke2fs)"; then
    echo "refuse"; return 1
  fi

  # find ... -delete mass-removes matched files. Both tokens required so a plain find
  # search (no -delete) is not refused; optional path prefix catches /usr/bin/find.
  if printf '%s' "$cmd" | grep -qE "${command_start}find([[:space:]]|$)" \
     && printf '%s' "$cmd" | grep -qE '[[:space:]]-delete([[:space:]]|$)'; then
    echo "refuse"; return 1
  fi

  # shred overwrites then unlinks — irrecoverable.
  if printf '%s' "$cmd" | grep -qE "${command_start}shred([[:space:]]|$)"; then
    echo "refuse"; return 1
  fi

  # truncate to zero size destroys file contents in place. Non-zero sizes are allowed.
  # Optional path prefix catches /usr/bin/truncate; size matcher covers -s 0, -s0,
  # --size 0, and --size=0.
  if printf '%s' "$cmd" | grep -qE "${command_start}truncate([[:space:]]|$)" \
     && printf '%s' "$cmd" | grep -qE '(-s[[:space:]]*0|--size[[:space:]]*=?[[:space:]]*0)([[:space:]]|$)'; then
    echo "refuse"; return 1
  fi

  # Recursive chmod to a zero mode locks an entire tree out of access. Scoped to the
  # zero lock-out (000/00/0 octal short forms) so ordinary recursive permission changes
  # are not refused; optional path prefix catches /bin/chmod.
  if printf '%s' "$cmd" | grep -qE "${command_start}chmod([[:space:]]|$)" \
     && printf '%s' "$cmd" | grep -qE '(-R|--recursive)([[:space:]]|$)' \
     && printf '%s' "$cmd" | grep -qE '(^|[[:space:]])(000|00|0)([[:space:]]|$)'; then
    echo "refuse"; return 1
  fi

  # Fork bomb pattern
  if printf '%s' "$cmd" | grep -qF ':(){ :|:'; then
    echo "refuse"; return 1
  fi
  if printf '%s' "$cmd" | grep -qE ':\(\)\{'; then
    echo "refuse"; return 1
  fi

  # AWS credential patterns (key IDs start with AKIA, secret keys are 40-char base64)
  if printf '%s' "$cmd" | grep -qE 'AKIA[0-9A-Z]{16}'; then
    echo "refuse"; return 1
  fi

  # Private key headers — pattern starts with dashes so pass -- to avoid flag misparse
  if printf '%s' "$cmd" | grep -qE -- 'BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY'; then
    echo "refuse"; return 1
  fi

  echo "ok"; return 0
}

# ---------------------------------------------------------------------------
# verdict: synthesize a convergence verdict from state JSON.
# Reads: units, plateau, ceiling, pending_verify. Prints verdict + ship-gate line.
# Exit 0 = CONVERGED; exit 1 = not converged; exit 2 = error.
# ---------------------------------------------------------------------------
verdict() {
  local state_file="${1:?usage: verdict <state.json>}"
  if [[ ! -f "$state_file" ]]; then
    echo "BLOCKED"; echo "ship=no"; return 2
  fi

  local parsed units_val plateau_val ceiling_val pending_val ship_val
  if ! parsed=$(node -e '
      const fs = require("fs");
      let j;
      try { j = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); }
      catch { process.exit(3); }
      if (!Number.isFinite(j.units) || j.units < 0) process.exit(3);
      for (const k of ["plateau", "ceiling", "pending_verify"])
        if (k in j && typeof j[k] !== "boolean") process.exit(3);
      const boo = (k) => (typeof j[k] === "boolean" ? String(j[k]) : "");
      console.log([String(j.units), boo("plateau"), boo("ceiling"), boo("pending_verify"),
        String(j.archetype === "ship-ready" && j.terminal_choice === "proceed-to-ship")].join(String.fromCharCode(31)));
    ' "$state_file" 2>/dev/null); then
    echo "BLOCKED"; echo "ship=no"; return 2
  fi
  IFS=$'\x1f' read -r units_val plateau_val ceiling_val pending_val ship_val <<< "$parsed"

  if [[ -z "$units_val" ]]; then
    echo "BLOCKED"; echo "ship=no"; return 2
  fi

  if [[ "$plateau_val" == "true" ]]; then
    echo "PLATEAU"; echo "ship=no"; return 1
  fi

  if [[ "$ceiling_val" == "true" ]]; then
    echo "CEILING"; echo "ship=no"; return 1
  fi

  # The progress metric cannot waive the independent verification step.
  if [[ "$pending_val" == "true" ]]; then
    echo "RUNNING"; echo "ship=no"; return 1
  fi

  # units==0 with no pending verification or stop signal → converged
  if awk -v u="$units_val" 'BEGIN { exit (u == 0 ? 0 : 1) }'; then
    echo "CONVERGED"
    if [[ "$ship_val" == "true" ]]; then echo "ship=yes"; else echo "ship=no"; fi
    return 0
  fi

  # units > 0, no plateau/ceiling signal yet → the loop is mid-flight. This is
  # the normal case, not a failure — labeling it BLOCKED (as earlier versions
  # did) made a healthy loop indistinguishable from a dead one.
  echo "RUNNING"; echo "ship=no"; return 1
}

# ---------------------------------------------------------------------------
# validate-state: schema gate for orchestrator-state.json. The ledger is the
# loop's evidence trail; a malformed one must not be trusted to route from.
# Prints "valid" exit 0 | "invalid" exit 2. Uses Node for JSON validation.
# ---------------------------------------------------------------------------
validate-state() {
  local state_file="${1:?usage: validate-state <state.json>}"
  if [[ ! -f "$state_file" ]]; then
    echo "invalid"; return 2
  fi

  # Full structural validation in node's real parser: field presence, array
  # types, non-empty string predicate, non-negative integer cycle — and invalid
  # JSON itself is invalid (the grep version happily "validated" a truncated
  # ledger as long as the right substrings survived).
  if node -e '
      const fs = require("fs");
      let j;
      try { j = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); }
      catch { process.exit(2); }
      if (!j || typeof j !== "object" || Array.isArray(j)) process.exit(2);
      for (const f of ["goal", "archetype", "predicate", "terminal_choice"])
        if (typeof j[f] !== "string" || !j[f].trim()) process.exit(2);
      if (!["ship-ready", "optimize-metric", "fix-broken", "harden", "build-feature", "explore",
            "polish-ui", "document", "what-to-build", "decide-design", "package-android"].includes(j.archetype))
        process.exit(2);
      // "stop" is the existing short form in persisted state fixtures.
      if (!["stop-at-verified", "proceed-to-ship", "stop"].includes(j.terminal_choice)) process.exit(2);
      if (!Array.isArray(j.units_remaining) || !Array.isArray(j.pipeline_log)) process.exit(2);
      if (!Number.isSafeInteger(j.cycle) || j.cycle < 0) process.exit(2);
      if ("pending_verify" in j && typeof j.pending_verify !== "boolean") process.exit(2);
      for (const f of ["errors_remaining", "untested_gaps"])
        if (f in j && (!Number.isSafeInteger(j[f]) || j[f] < 0)) process.exit(2);
      if ("regression_verdict" in j && !["STABLE", "UNSTABLE"].includes(j.regression_verdict)) process.exit(2);
    ' "$state_file" 2>/dev/null; then
    echo "valid"; return 0
  fi
  echo "invalid"; return 2
}

# ---------------------------------------------------------------------------
# screen-state-predicate: extract the pinned predicate from a persisted state
# file and re-run it through screen-cmd. Persisted commands are never trusted —
# a poisoned state file must not re-enter the loop with an unscreened command.
# Delegates the verdict (ok/refuse + exit) to screen-cmd; "invalid" exit 2 when
# the state has no pinned predicate.
# ---------------------------------------------------------------------------
screen-state-predicate() {
  local state_file="${1:?usage: screen-state-predicate <state.json>}"
  if [[ ! -f "$state_file" ]]; then
    echo "invalid"; return 2
  fi

  # JSON.parse decodes escaped quotes natively — the previous sed reconstruction
  # existed only because the parser was hand-rolled. A poisoned predicate now
  # reaches screen-cmd exactly as the JSON encodes it, or the state is invalid.
  local pred
  if ! pred=$(node -e '
      const fs = require("fs");
      try {
        const j = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
        if (typeof j.predicate === "string" && j.predicate.length > 0) {
          process.stdout.write(j.predicate);
          process.exit(0);
        }
      } catch {}
      process.exit(2);
    ' "$state_file" 2>/dev/null); then
    echo "invalid"; return 2
  fi

  screen-cmd "$pred"
}

case "${1:-}" in
  classify)               shift; classify               "$@" ;;
  next-hop)               shift; next-hop               "$@" ;;
  units)                  shift; units                  "$@" ;;
  plateau)                shift; plateau                "$@" ;;
  screen-cmd)             shift; screen-cmd             "$@" ;;
  verdict)                shift; verdict                "$@" ;;
  validate-state)         shift; validate-state         "$@" ;;
  screen-state-predicate) shift; screen-state-predicate "$@" ;;
  *) echo "usage: $0 {classify|next-hop|units|plateau|screen-cmd|verdict|validate-state|screen-state-predicate}" >&2; exit 64 ;;
esac
