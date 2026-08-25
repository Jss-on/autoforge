#!/usr/bin/env bash
# score-research.sh — mechanical seams for the /forge:research engagement.
#
#   sources <sources.tsv>                       → source-ledger validation + tier counts
#   claims  <claims.tsv> <sources.tsv>          → claims-ledger validation (citation anchoring,
#                                                 confidence tier floors, orphan detection)
#   verdict <claims.tsv> <sources.tsv> [plan.md]
#                                               → VERDICT: DOSSIER_READY | DOSSIER_BLOCKED
#
# The contract lives in references/research-protocol.md (§7 schemas, §5 rubric):
#
# sources.tsv (9 tab-separated cols, header optional):
#   id  tier  type  year  title  venue  locator  depth  status
#   tier    ∈ T1|T2|T3|T4
#   locator ∈ doi:|pmid:|pmcid:|arxiv:|isbn:|url:http(s)…   — resolvable as accessed
#   depth   ∈ full|abstract|secondary                       — what was actually read
#   status  ∈ read|cited|rejected|unverified                — unverified/rejected are uncitable
#
# claims.tsv (6 tab-separated cols, header optional):
#   id  rq  claim  confidence  sources  evidence
#   confidence ∈ high|moderate|low|contested
#   sources    = comma-joined S-ids; every id must exist and be citable
#   tier floors: high ≥2 distinct T1/T2 · moderate ≥1 T1/T2 · contested ≥2 sources incl a T1/T2
#                T4-only support is invalid at ANY confidence
#   evidence   = evidence:<relpath> into the reading notes
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
# sources: validate the source ledger and print tier counts.
#   stdout: SOURCES: VALID|INVALID total=N t1=N t2=N t3=N t4=N unverified=N
#   stderr: each validation error
#   exit:   0 valid · 1 invalid · 2 unreadable
# ---------------------------------------------------------------------------
sources() {
  local file="${1:?usage: sources <sources.tsv>}"
  [[ -f "$file" ]] || { echo "SOURCES: INVALID total=0 t1=0 t2=0 t3=0 t4=0 unverified=0"; echo "file not found: $file" >&2; return 2; }

  local out
  out="$(awk -v FS='\t' '
    BEGIN {
      split("T1 T2 T3 T4", tArr, " ");           for (i in tArr) tOK[tArr[i]] = 1;
      split("full abstract secondary", dArr, " "); for (i in dArr) dOK[dArr[i]] = 1;
      split("read cited rejected unverified", sArr, " "); for (i in sArr) sOK[sArr[i]] = 1;
      errs = 0; total = 0; unv = 0;
    }
    /^#/ { next }
    $1 == "id" && $2 == "tier" { next }   # header
    NF == 0 || $0 ~ /^[[:space:]]*$/ { next }
    {
      total++;
      if (NF < 9)         { print "row " NR ": expected 9 columns, got " NF > "/dev/stderr"; errs++; next }
      if (seen[$1]++)     { print "row " NR ": duplicate id " $1 > "/dev/stderr"; errs++ }
      if (!($2 in tOK))   { print "row " NR ": bad tier \"" $2 "\" (T1|T2|T3|T4)" > "/dev/stderr"; errs++ }
      if ($4 !~ /^(1[89]|20)[0-9][0-9]$/) { print "row " NR ": bad year \"" $4 "\"" > "/dev/stderr"; errs++ }
      if ($7 !~ /^(doi|pmid|pmcid|arxiv|isbn):./ && $7 !~ /^url:https?:\/\//) {
        print "row " NR ": bad locator \"" $7 "\" (doi:|pmid:|pmcid:|arxiv:|isbn:|url:http…)" > "/dev/stderr"; errs++
      }
      if (!($8 in dOK))   { print "row " NR ": bad depth \"" $8 "\" (full|abstract|secondary)" > "/dev/stderr"; errs++ }
      if (!($9 in sOK))   { print "row " NR ": bad status \"" $9 "\" (read|cited|rejected|unverified)" > "/dev/stderr"; errs++ }
      tc[tolower($2)]++;
      if ($9 == "unverified") unv++;
    }
    END {
      printf "SOURCES: %s total=%d t1=%d t2=%d t3=%d t4=%d unverified=%d\n",
        (errs == 0 ? "VALID" : "INVALID"), total, tc["t1"], tc["t2"], tc["t3"], tc["t4"], unv;
      exit (errs == 0 ? 0 : 1);
    }
  ' "$file")"
  local rc=$?
  printf '%s\n' "$out"
  log_invocation "sources" "$file" "$out"
  return $rc
}

# ---------------------------------------------------------------------------
# claims: validate the claims ledger against the source ledger.
#   stdout: CLAIMS: VALID|INVALID total=N high=N moderate=N low=N contested=N orphans=N
#   stderr: each validation error (orphan citations, tier-floor violations, …)
#   exit:   0 valid · 1 invalid · 2 unreadable
# ---------------------------------------------------------------------------
claims() {
  local cfile="${1:?usage: claims <claims.tsv> <sources.tsv>}"
  local sfile="${2:?usage: claims <claims.tsv> <sources.tsv>}"
  [[ -f "$cfile" ]] || { echo "CLAIMS: INVALID total=0 high=0 moderate=0 low=0 contested=0 orphans=0"; echo "file not found: $cfile" >&2; return 2; }
  [[ -f "$sfile" ]] || { echo "CLAIMS: INVALID total=0 high=0 moderate=0 low=0 contested=0 orphans=0"; echo "file not found: $sfile" >&2; return 2; }

  local out
  out="$(awk -v FS='\t' '
    BEGIN {
      split("high moderate low contested", cArr, " "); for (i in cArr) cOK[cArr[i]] = 1;
      errs = 0; total = 0; orphans = 0;
    }
    FNR == NR {   # first file: sources.tsv → tier + citability maps
      if ($0 ~ /^#/ || ($1 == "id" && $2 == "tier") || NF == 0 || $0 ~ /^[[:space:]]*$/) next;
      if (NF >= 9) { srcTier[$1] = $2; srcStatus[$1] = $9 }
      next;
    }
    /^#/ { next }
    $1 == "id" && $2 == "rq" { next }   # header
    NF == 0 || $0 ~ /^[[:space:]]*$/ { next }
    {
      total++;
      if (NF < 6)        { print "row " FNR ": expected 6 columns, got " NF > "/dev/stderr"; errs++; next }
      if (seen[$1]++)    { print "row " FNR ": duplicate id " $1 > "/dev/stderr"; errs++ }
      if ($2 !~ /^RQ-[0-9]+$/) { print "row " FNR ": bad rq \"" $2 "\" (RQ-<n>)" > "/dev/stderr"; errs++ }
      if (!($4 in cOK))  { print "row " FNR ": bad confidence \"" $4 "\"" > "/dev/stderr"; errs++ }
      if ($6 !~ /evidence:/) { print "row " FNR ": missing evidence: ref" > "/dev/stderr"; errs++ }
      if ($5 == "")      { print "row " FNR ": no sources cited" > "/dev/stderr"; errs++; next }

      n = split($5, refs, ",");
      t12 = 0; cited = 0; delete uniq;
      for (i = 1; i <= n; i++) {
        r = refs[i]; gsub(/^[ \t]+|[ \t]+$/, "", r);
        if (r == "" || (r in uniq)) continue;
        uniq[r] = 1;
        if (!(r in srcTier)) {
          print "row " FNR ": orphan citation " r " (not in sources.tsv)" > "/dev/stderr"; errs++; orphans++; continue;
        }
        if (srcStatus[r] == "rejected" || srcStatus[r] == "unverified") {
          print "row " FNR ": cites " r " with status=" srcStatus[r] " (uncitable)" > "/dev/stderr"; errs++; continue;
        }
        cited++;
        if (srcTier[r] == "T1" || srcTier[r] == "T2") t12++;
      }
      if (cited > 0 && t12 == 0 && $4 != "low") {
        print "row " FNR ": T3/T4-only support requires confidence=low (got " $4 ")" > "/dev/stderr"; errs++;
      }
      if (cited > 0 && t12 == 0) {
        allT4 = 1;
        for (r in uniq) if ((r in srcTier) && srcTier[r] != "T4") allT4 = 0;
        if (allT4) { print "row " FNR ": T4-only support is invalid at any confidence" > "/dev/stderr"; errs++ }
      }
      if ($4 == "high"      && t12 < 2) { print "row " FNR ": high requires >=2 distinct T1/T2 (got " t12 ")" > "/dev/stderr"; errs++ }
      if ($4 == "moderate"  && t12 < 1) { print "row " FNR ": moderate requires >=1 T1/T2 (got " t12 ")" > "/dev/stderr"; errs++ }
      if ($4 == "contested" && (cited < 2 || t12 < 1)) { print "row " FNR ": contested requires >=2 sources incl a T1/T2" > "/dev/stderr"; errs++ }
      conf[$4]++;
    }
    END {
      printf "CLAIMS: %s total=%d high=%d moderate=%d low=%d contested=%d orphans=%d\n",
        (errs == 0 ? "VALID" : "INVALID"), total, conf["high"], conf["moderate"], conf["low"], conf["contested"], orphans;
      exit (errs == 0 ? 0 : 1);
    }
  ' "$sfile" "$cfile")"
  local rc=$?
  printf '%s\n' "$out"
  log_invocation "claims" "$cfile" "$out"
  return $rc
}

# ---------------------------------------------------------------------------
# verdict: the dossier gate. Both ledgers valid, every plan RQ covered (or
# explicitly scarcity-noted in the plan), and the T1/T2 support floor met.
#   stdout: VERDICT: DOSSIER_READY | DOSSIER_BLOCKED   (single line)
#   stderr: each criterion with its measured value and PASS/FAIL
#   exit:   0 ready · 1 blocked · 2 usage/tooling error
#   env:    RESEARCH_T12_FLOOR (default 0.60) — min fraction of claims with ≥1 T1/T2 source
# ---------------------------------------------------------------------------
verdict() {
  local cfile="${1:?usage: verdict <claims.tsv> <sources.tsv> [research-plan.md]}"
  local sfile="${2:?usage: verdict <claims.tsv> <sources.tsv> [research-plan.md]}"
  local plan="${3:-}"
  local floor="${RESEARCH_T12_FLOOR:-0.60}"
  [[ -f "$cfile" ]] || { echo "VERDICT: DOSSIER_BLOCKED"; echo "claims file not found: $cfile" >&2; return 2; }
  [[ -f "$sfile" ]] || { echo "VERDICT: DOSSIER_BLOCKED"; echo "sources file not found: $sfile" >&2; return 2; }

  local blocked=0

  # 1. Source ledger valid.
  local sline
  sline="$(sources "$sfile" 2>/dev/null)"
  if [[ "$sline" == SOURCES:\ VALID* ]]; then
    echo "criterion source-ledger: $sline PASS" >&2
  else
    echo "criterion source-ledger: $sline FAIL" >&2; blocked=1
  fi

  # 2. Claims ledger valid (anchoring + tier floors + no orphan/uncitable refs).
  local cline
  cline="$(claims "$cfile" "$sfile" 2>/dev/null)"
  if [[ "$cline" == CLAIMS:\ VALID* ]]; then
    echo "criterion claims-ledger: $cline PASS" >&2
  else
    echo "criterion claims-ledger: $cline FAIL" >&2; blocked=1
  fi

  # 3. RQ coverage — every RQ-n named in the plan has ≥1 claim, or the plan
  #    carries an explicit scarcity note on a line naming that RQ.
  if [[ -n "$plan" ]]; then
    if [[ ! -f "$plan" ]]; then
      echo "criterion rq-coverage: plan file not found: $plan FAIL" >&2; blocked=1
    else
      local missing=0 covered=0 rq
      while IFS= read -r rq; do
        [[ -n "$rq" ]] || continue
        if awk -v FS='\t' -v q="$rq" '$1 ~ /^C-/ && $2 == q { found = 1 } END { exit (found ? 0 : 1) }' "$cfile"; then
          covered=$((covered + 1))
        elif grep -i "scarcity" "$plan" | grep -q "$rq\b"; then
          covered=$((covered + 1))
          echo "  note: $rq covered by an explicit evidence-scarcity note" >&2
        else
          echo "  $rq: no claims and no scarcity note" >&2
          missing=$((missing + 1))
        fi
      done < <(grep -o 'RQ-[0-9]\+' "$plan" | sort -u)
      if [[ "$missing" -eq 0 && "$covered" -gt 0 ]]; then
        echo "criterion rq-coverage: $covered/$covered PASS" >&2
      elif [[ "$covered" -eq 0 && "$missing" -eq 0 ]]; then
        echo "criterion rq-coverage: plan names no RQ-n ids FAIL" >&2; blocked=1
      else
        echo "criterion rq-coverage: $missing RQ(s) uncovered FAIL" >&2; blocked=1
      fi
    fi
  fi

  # 4. T1/T2 support floor across the claims ledger.
  local frac
  frac="$(awk -v FS='\t' '
    FNR == NR {
      if ($0 ~ /^#/ || ($1 == "id" && $2 == "tier") || NF < 9) next;
      srcTier[$1] = $2; next;
    }
    $0 ~ /^#/ || ($1 == "id" && $2 == "rq") || NF < 6 { next }
    $0 ~ /^[[:space:]]*$/ { next }
    {
      total++;
      n = split($5, refs, ",");
      hit = 0;
      for (i = 1; i <= n; i++) {
        r = refs[i]; gsub(/^[ \t]+|[ \t]+$/, "", r);
        if ((r in srcTier) && (srcTier[r] == "T1" || srcTier[r] == "T2")) hit = 1;
      }
      if (hit) t12++;
    }
    END { if (total == 0) print "0.00"; else printf "%.2f", t12 / total }
  ' "$sfile" "$cfile")"
  if awk -v f="$frac" -v t="$floor" 'BEGIN { exit (f + 0 >= t + 0 ? 0 : 1) }'; then
    echo "criterion t12-floor: $frac >= $floor PASS" >&2
  else
    echo "criterion t12-floor: $frac < $floor FAIL (too much of the dossier rests on secondary sources)" >&2
    blocked=1
  fi

  local v
  if [[ "$blocked" -eq 0 ]]; then v="VERDICT: DOSSIER_READY"; else v="VERDICT: DOSSIER_BLOCKED"; fi
  echo "$v"
  log_invocation "verdict" "$cfile" "$v t12=$frac claims=$cline"
  [[ "$blocked" -eq 0 ]]
}

case "${1:-}" in
  sources) shift; sources "$@" ;;
  claims)  shift; claims  "$@" ;;
  verdict) shift; verdict "$@" ;;
  *) echo "usage: $0 {sources <sources.tsv> | claims <claims.tsv> <sources.tsv> | verdict <claims.tsv> <sources.tsv> [research-plan.md]}" >&2; exit 64 ;;
esac
