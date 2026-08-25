#!/usr/bin/env bash
# score-test.sh — mechanical seams for the /forge:test QA engagement.
#
#   defects       <defects.tsv>                    → ledger validation + severity/status counts
#   exit-criteria <results.tsv> <defects.tsv> [requirements.md]
#                                                  → VERDICT: RELEASE_RECOMMENDED | RELEASE_BLOCKED
#
# Reuse-first: pass-rate and RTM coverage are NOT reimplemented — exit-criteria
# calls the sibling score-build.sh (same dir in every distribution tree), so the
# strict-evidence and traceability semantics stay identical to build/feature.
#
# defects.tsv schema (7 tab-separated cols, header optional):
#   id  severity  priority  status  test_id  summary  evidence
#   severity ∈ critical|high|medium|low        priority ∈ P1|P2|P3|P4
#   status   ∈ open|in-progress|fixed|retest|verified|closed|reopened|deferred|rejected|duplicate
#   evidence: `evidence:<relpath>[#locator]` — required except for rejected/duplicate
#
# Release-blocking rule (mirrors standard QA exit criteria):
#   critical: blocks unless verified|closed|rejected|duplicate (a critical may NOT be deferred)
#   high:     blocks unless verified|closed|rejected|duplicate|deferred
#   medium/low: never block release by severity (they appear in counts + the summary report)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCORE_BUILD="$SCRIPT_DIR/score-build.sh"

log_invocation() {
  local sub="$1" file="$2" headline="$3" dir ts sha
  [[ "${AR_SCORE_LOG:-1}" == "1" ]] || return 0
  dir="$(dirname "$file")" || return 0
  [[ -d "$dir" && -w "$dir" ]] || return 0
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)" || ts="unknown"
  sha="$(sha256sum "$file" 2>/dev/null | cut -c1-16)" || sha=""
  printf '%s\t%s\t%s\t%s\t%s\n' "$ts" "$sub" "$(basename "$file")" "${sha:-nohash}" "$headline" \
    >> "$dir/score-log.tsv" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# defects: validate the ledger and print counts.
#   stdout: DEFECTS: VALID|INVALID total=N blocking=N
#   stderr: per-severity/status breakdown + each validation error
#   exit:   0 valid · 1 invalid · 2 unreadable
# ---------------------------------------------------------------------------
defects() {
  local file="${1:?usage: defects <defects.tsv>}"
  [[ -f "$file" ]] || { echo "DEFECTS: INVALID total=0 blocking=0"; echo "file not found: $file" >&2; return 2; }

  local out
  out="$(awk -v FS='\t' '
    BEGIN {
      split("critical high medium low", sevArr, " ");
      for (i in sevArr) sevOK[sevArr[i]] = 1;
      split("P1 P2 P3 P4", priArr, " ");
      for (i in priArr) priOK[priArr[i]] = 1;
      split("open in-progress fixed retest verified closed reopened deferred rejected duplicate", stArr, " ");
      for (i in stArr) stOK[stArr[i]] = 1;
      errs = 0; total = 0; blocking = 0;
    }
    /^#/ { next }
    $1 == "id" && $2 == "severity" { next }   # header
    NF == 0 || $0 ~ /^[[:space:]]*$/ { next }
    {
      total++;
      if (NF < 7)            { print "row " NR ": expected 7 columns, got " NF > "/dev/stderr"; errs++; next }
      if (seen[$1]++)        { print "row " NR ": duplicate id " $1 > "/dev/stderr"; errs++ }
      if (!($2 in sevOK))    { print "row " NR ": bad severity \"" $2 "\"" > "/dev/stderr"; errs++ }
      if (!($3 in priOK))    { print "row " NR ": bad priority \"" $3 "\"" > "/dev/stderr"; errs++ }
      if (!($4 in stOK))     { print "row " NR ": bad status \"" $4 "\"" > "/dev/stderr"; errs++ }
      if ($5 == "")          { print "row " NR ": missing test_id linkage" > "/dev/stderr"; errs++ }
      if ($7 !~ /evidence:/ && $4 != "rejected" && $4 != "duplicate") {
        print "row " NR ": missing evidence: ref (required except rejected/duplicate)" > "/dev/stderr"; errs++
      }
      sev[$2]++; st[$4]++;
      resolved = ($4 == "verified" || $4 == "closed" || $4 == "rejected" || $4 == "duplicate");
      if ($2 == "critical" && !resolved) blocking++;
      else if ($2 == "high" && !resolved && $4 != "deferred") blocking++;
    }
    END {
      for (s in sev) printf "  severity %s=%d\n", s, sev[s] > "/dev/stderr";
      for (s in st)  printf "  status %s=%d\n",   s, st[s]  > "/dev/stderr";
      printf "DEFECTS: %s total=%d blocking=%d\n", (errs == 0 ? "VALID" : "INVALID"), total, blocking;
      exit (errs == 0 ? 0 : 1);
    }
  ' "$file")"
  local rc=$?
  printf '%s\n' "$out"
  log_invocation "defects" "$file" "$out"
  return $rc
}

# ---------------------------------------------------------------------------
# exit-criteria: the release gate. Combines strict-evidence pass-rate, RTM
# coverage (when a requirements file is given), and the defect-ledger blocking
# rule into one mechanical verdict — the QA lead's go/no-go, minus the opinion.
#   stdout: VERDICT: RELEASE_RECOMMENDED | RELEASE_BLOCKED   (single line)
#   stderr: each criterion with its measured value and PASS/FAIL
#   exit:   0 recommended · 1 blocked · 2 usage/tooling error
#   env:    TEST_TARGET_RATE (default 0.95)
# ---------------------------------------------------------------------------
exit-criteria() {
  local results="${1:?usage: exit-criteria <results.tsv> <defects.tsv> [requirements.md]}"
  local defects_file="${2:?usage: exit-criteria <results.tsv> <defects.tsv> [requirements.md]}"
  local reqs="${3:-}"
  local target="${TEST_TARGET_RATE:-0.95}"
  [[ -f "$results" ]]      || { echo "VERDICT: RELEASE_BLOCKED"; echo "results file not found: $results" >&2; return 2; }
  [[ -f "$defects_file" ]] || { echo "VERDICT: RELEASE_BLOCKED"; echo "defects file not found: $defects_file" >&2; return 2; }
  [[ -x "$SCORE_BUILD" || -f "$SCORE_BUILD" ]] || { echo "VERDICT: RELEASE_BLOCKED"; echo "missing seam: $SCORE_BUILD" >&2; return 2; }

  local blocked=0

  # 1. Strict-evidence pass-rate — unproven pass rows are already demoted here.
  local rate_line rate gate_line
  rate_line="$(bash "$SCORE_BUILD" pass-rate --strict-evidence "$results" 2>"$results.exitcrit.err")"
  rate="$(printf '%s' "$rate_line" | awk '{print $2}')"
  gate_line="$(grep -o 'logic_gate=[A-Za-z@0-9.]*' "$results.exitcrit.err" | head -1)"
  rm -f "$results.exitcrit.err"
  if awk -v r="${rate:-0}" -v t="$target" 'BEGIN { exit (r + 0 >= t + 0 ? 0 : 1) }'; then
    echo "criterion pass-rate: $rate >= $target (strict evidence) PASS" >&2
  else
    echo "criterion pass-rate: ${rate:-none} < $target (strict evidence) FAIL" >&2
    blocked=1
  fi
  if [[ -n "$gate_line" && "$gate_line" != "logic_gate=PASS" && "$gate_line" != "logic_gate=n/a" ]]; then
    echo "criterion logic-gate: $gate_line FAIL (golden business-rule cases red)" >&2
    blocked=1
  fi

  # 2. RTM coverage — every requirement exercised by at least one executed test.
  if [[ -n "$reqs" ]]; then
    if [[ ! -f "$reqs" ]]; then
      echo "criterion rtm-coverage: requirements file not found: $reqs FAIL" >&2
      blocked=1
    else
      local cov
      cov="$(bash "$SCORE_BUILD" coverage "$results" "$reqs" 2>/dev/null | sed -n 's/^REQ_COVERAGE: //p')"
      if [[ "$cov" == "1.00" ]]; then
        echo "criterion rtm-coverage: REQ_COVERAGE=1.00 PASS" >&2
      else
        echo "criterion rtm-coverage: REQ_COVERAGE=${cov:-unknown} (< 1.00) FAIL" >&2
        blocked=1
      fi
    fi
  fi

  # 3. Defect ledger — valid, and no unresolved critical/high.
  local dline dcount
  dline="$(defects "$defects_file" 2>/dev/null)" || {
    echo "criterion defect-ledger: $dline FAIL (ledger invalid)" >&2
    blocked=1
  }
  dcount="$(printf '%s' "$dline" | grep -o 'blocking=[0-9]*' | cut -d= -f2)"
  if [[ "${dcount:-0}" -gt 0 ]]; then
    echo "criterion open-defects: $dline FAIL (unresolved critical/high)" >&2
    blocked=1
  else
    echo "criterion open-defects: $dline PASS" >&2
  fi

  local verdict
  if [[ "$blocked" -eq 0 ]]; then verdict="VERDICT: RELEASE_RECOMMENDED"; else verdict="VERDICT: RELEASE_BLOCKED"; fi
  echo "$verdict"
  log_invocation "exit-criteria" "$results" "$verdict rate=${rate:-none} defects=$dline"
  [[ "$blocked" -eq 0 ]]
}

case "${1:-}" in
  defects)       shift; defects       "$@" ;;
  exit-criteria) shift; exit-criteria "$@" ;;
  *) echo "usage: $0 {defects <defects.tsv> | exit-criteria <results.tsv> <defects.tsv> [requirements.md]}" >&2; exit 64 ;;
esac
