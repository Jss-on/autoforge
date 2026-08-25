#!/usr/bin/env bash
# run-index.sh — inventory + cross-run metrics for forge run directories.
#
#   run-index.sh list    [runs-root]   → TSV: one row per run dir (machine-readable)
#   run-index.sh summary [runs-root]   → aggregate: counts by source/status, evidence
#                                        adoption, latest run per source
#
# runs-root defaults to ./forge (the run-output convention). Answers the
# questions the repo previously could not: what runs exist, which converged,
# which carry evidence, did convergence quality move across runs.
# JSON via node's real parser (node = hard CORE dependency already); a handoff
# that fails to parse is reported as BAD_JSON rather than silently mis-read.
set -uo pipefail

MODE="${1:-list}"
ROOT="${2:-forge}"

parse_handoff() { # $1 file → "source<US>status<US>metric" (US = charCode 31)
  node -e '
    const fs = require("fs");
    const US = String.fromCharCode(31);
    let j;
    try { j = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); }
    catch { console.log(["BAD_JSON", "BAD_JSON", "n/a"].join(US)); process.exit(0); }
    const s = (v) => (typeof v === "string" && v ? v : "");
    let m = "n/a";
    if (j.metric && typeof j.metric === "object" && typeof j.metric.value === "number") m = String(j.metric.value);
    else if (typeof j.metric === "number") m = String(j.metric);
    else if (typeof j.value === "number") m = String(j.value);
    console.log([s(j.source) || "unknown", s(j.status) || "unknown", m].join(US));
  ' "$1" 2>/dev/null
}

emit_rows() {
  local d name handoff source status metric results evidence scorelog iters
  printf 'run\tsource\tstatus\tmetric\tresults_tsv\tevidence\tscore_log\titerations\thandoff\n'
  [[ -d "$ROOT" ]] || return 0
  for d in "$ROOT"/*/; do
    [[ -d "$d" ]] || continue
    name="$(basename "$d")"
    handoff=""
    for h in "$d/handoff.json" "$d/build-handoff.json"; do
      [[ -f "$h" ]] && { handoff="$h"; break; }
    done
    if [[ -n "$handoff" ]]; then
      IFS=$'\x1f' read -r source status metric <<< "$(parse_handoff "$handoff")"
      source="${source:-unknown}"; status="${status:-unknown}"; metric="${metric:-n/a}"
    else
      # No handoff — infer source from the dir-name convention <source>-<stamp>.
      source="$(printf '%s' "$name" | sed -E 's/-[0-9]{6}-[0-9]{4}$//; s/-[0-9]{6}$//')"
      status="NO_HANDOFF"; metric="n/a"
    fi
    results="no"
    ls "$d"/*results*.tsv >/dev/null 2>&1 && results="yes"
    evidence="no"
    [[ -d "$d/evidence" ]] && ls "$d/evidence" 2>/dev/null | grep -q . && evidence="yes"
    scorelog=0
    [[ -f "$d/score-log.tsv" ]] && scorelog="$(grep -c . "$d/score-log.tsv" 2>/dev/null || echo 0)"
    iters="n/a"
    if [[ -f "$d/iterations.tsv" ]]; then
      iters="$(awk '/^#/ { next } $1 ~ /^[0-9]+$/ { if ($1 + 0 > m) m = $1 + 0 } END { print m + 0 }' "$d/iterations.tsv")"
    fi
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$name" "$source" "$status" "$metric" "$results" "$evidence" "$scorelog" "$iters" \
      "${handoff:+yes}"
  done
}

case "$MODE" in
  list)
    emit_rows
    ;;
  summary)
    emit_rows | awk -F'\t' '
      NR == 1 { next }
      {
        total++
        bySource[$2]++
        byStatus[$3]++
        if ($6 == "yes") withEvidence++
        if ($7 + 0 > 0)  withScoreLog++
        latest[$2] = $1   # rows come in lexicographic (= chronological) dir order
      }
      END {
        printf "runs_total\t%d\n", total
        printf "runs_with_evidence\t%d\n", withEvidence + 0
        printf "runs_with_score_log\t%d\n", withScoreLog + 0
        for (s in bySource) printf "source\t%s\t%d\tlatest=%s\n", s, bySource[s], latest[s]
        for (s in byStatus) printf "status\t%s\t%d\n", s, byStatus[s]
      }'
    ;;
  *)
    echo "usage: $0 {list|summary} [runs-root]" >&2; exit 64
    ;;
esac
