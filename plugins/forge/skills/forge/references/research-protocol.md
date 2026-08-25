# Research Protocol — the contract behind `/forge:research`

The command file says *when*; this file says *how*. Everything here is consumed by the phases of
`research.md` and enforced, where mechanical, by `scripts/score-research.sh`.

## §1 Source tiers (assigned by publication class, never by agreement)

| Tier | What it is | Examples | May support |
|---|---|---|---|
| **T1** | Peer-reviewed literature & formal standards | journal articles, systematic reviews, meta-analyses, conference proceedings with review (NeurIPS, SIGMOD…), published standards (ISO, IEEE, SAE), statutes & court opinions (primary law) | any confidence; required for `high` |
| **T2** | Pre-review scholarship & official bodies | arXiv/bioRxiv/SSRN preprints, WHO/CDC/NIH/NIST/NTSB/FAA publications, government statistics, authoritative textbooks & handbooks | any confidence; required for `high` (with T1 or a second independent T2) |
| **T3** | Edited secondary | quality journalism with named sources, vendor documentation, edited references (encyclopedias), university courseware, practitioner books | `moderate` (converging, ≥2) or `low` |
| **T4** | Unedited web | blogs, forums, social posts, wikis without editorial control, marketing copy | context and leads ONLY — never sole support for any claim (validator rejects T4-only) |

Tier is a property of the **venue**, not the author or the claim. A Nobel laureate's blog post is
T4; an obscure journal's peer-reviewed case report is T1 (its *weight* is handled by the evidence
hierarchy below, not by tier inflation). Predatory-journal check: if a "peer-reviewed" venue is on
no major index (MEDLINE, Scopus, DOAJ) and shows predatory markers, demote to T4 and say why in the
source note.

## §2 Evidence hierarchy — weighting *within* tiers, by domain

Tier says where it was published; the hierarchy says how much a design can prove. Note the design
in every reading note; the synthesis weighs accordingly.

- **Medical / injury / biomechanics:** meta-analysis & systematic review > RCT > prospective
  cohort > case-control > case series/report > cadaver & dummy (ATD) studies > animal & finite-
  element models > mechanistic reasoning > expert opinion. Cadaver/ATD/FE work is *how* impact
  biomechanics is actually measured — treat it as strong for physics quantities (accelerations,
  HIC, BrIC), weak for clinical outcomes; clinical literature covers outcomes.
- **Physics / engineering:** standards & handbooks (settled) > replicated experiments > single
  experiments > simulations (validated) > simulations (unvalidated) > back-of-envelope.
- **Computing:** reproduced benchmarks > peer-reviewed evaluations > vendor benchmarks (conflict
  of interest — note it) > blog benchmarks.
- **Law / policy:** primary law (statute, regulation, controlling precedent, with jurisdiction
  ALWAYS attached) > official guidance > law-review commentary > practitioner summaries. A legal
  claim without its jurisdiction is invalid.
- **Markets / industry:** audited filings & regulator data > paid analyst research > trade press >
  company press releases (claims about themselves: T3 at best).

## §3 Search playbook (breadth before depth; each modality blind to the others)

Modalities — run several per RQ, log every query in `queries.tsv`:
1. **Scholarly index:** Google Scholar / Semantic Scholar / PubMed / arXiv with field vocabulary
   (find the field's own terms first — "TBI biomechanics", "rotational kinematics", "HIC" — a
   layman's phrasing finds layman sources).
2. **Reviews-first anchor:** `systematic review OR meta-analysis <topic>`; textbooks/handbooks for
   settled fields. Anchors orient the field, name its landmark studies, and expose its vocabulary.
3. **Snowball (1 hop):** the reference lists and "cited by" of every anchor. Exhaustive depth
   snowballs every T1 kept, not just anchors.
4. **Institutional:** `site:cdc.gov`, `site:nih.gov`, `site:nist.gov`, `site:ntsb.gov`,
   `site:*.edu filetype:pdf`, the relevant standards body's index.
5. **Adversarial (Phase 4):** `"evidence against" <claim>`, `<claim> criticism|refuted|"failed
   replication"`, `<paper> retraction|erratum|PubPeer`.
6. **Recency sweep:** repeat the winning queries restricted to the recency window, so the newest
   work is never missed behind classic highly-cited results.

Triage rule: title/abstract skim → keep if it can bear on an RQ → `sources.tsv` row immediately
(id `S-01…`, tier, `status=read` only after its note exists). Dedup on DOI/PMID. Stop a modality
when a full results page adds nothing new (saturation), not at an arbitrary count.

## §4 Reading notes — `evidence/S-<id>.md`

```markdown
# S-07 — <Authors> (<year>). <Title>. <Venue>. <locator>
depth: full | abstract | secondary        accessed: <ISO date>
design: <study design / document type>    n/specimen: <population or apparatus>
## Findings (numbers keep units + conditions)
- <finding>: <value ± CI> <units> under <conditions> (§/p. anchor)
## Limitations (theirs, stated; and ours, observed)
## Verbatim quotes
> "<exact text>" (§3.2 / p. 114)
```

**Depth honesty (hard rule):** `full` = the full text was fetched and read this run. `abstract` =
abstract only (paywall) — it may support claims but never *alone* at `high`, and the note says
abstract-only. `secondary` = known through another source's description — cite the secondary
source as the support, at ITS tier. An abstract cited as if full-read, or a paper cited for what a
blog said about it (**citation laundering**), invalidates the engagement's honesty guarantee.

## §5 Confidence rubric + disconfirmation

| Confidence | Mechanical floor (validator-enforced) | Judgment layer (synthesis) |
|---|---|---|
| `high` | ≥2 independent T1/T2 sources | consistent findings, strong designs per §2, survived disconfirmation |
| `moderate` | ≥1 T1/T2 | single strong source, or several converging T3 |
| `low` | T3 permitted | plausible, weakly sourced; say what would upgrade it |
| `contested` | ≥2 sources incl. a T1/T2 | credible sources genuinely disagree — present both sides with citations; NEVER average into a fake middle |

"Independent" = different author groups AND not one citing the other as its sole basis.

**Disconfirmation pass (every load-bearing claim):** search against it (§3.5); check retractions/
errata; check supersession (has newer, larger, or better-designed work revised the number?). Record
in the claim's evidence note what was searched and what came back — an empty adversarial result is
itself evidence and is logged. Findings against: downgrade, flip to `contested`, or reverse the
claim; prominence in the dossier equals the confirming side's.

## §6 Numbers carry their conditions

A magnitude enters `claims.tsv` and the dossier only with: **value (± interval when given) ·
units · the conditions it was measured under** (population/specimen, loading condition, test
protocol, jurisdiction, year). "Concussion occurs at 60–120 g" is not a claim; "peak linear head
accelerations of X g (measured on instrumented ATD headforms under condition Y [S-nn]) associate
with Z% concussion risk in study population W [S-mm]" is. Unit discipline: convert once, show both
when the literature mixes (g and m/s², rad/s and rad/s²).

## §7 Ledger schemas (the validator's contract)

`sources.tsv` — 9 columns, header optional:
`id  tier  type  year  title  venue  locator  depth  status`
- `id` `S-` + number, unique · `tier` T1|T2|T3|T4 · `type` free vocabulary (meta-analysis, rct,
  cohort, cadaver-study, standard, preprint, official, textbook, news, docs, web…)
- `locator` one of `doi:|pmid:|pmcid:|arxiv:|isbn:|url:http…` — resolvable as accessed
- `depth` full|abstract|secondary · `status` read|cited|rejected|unverified
- `unverified` = the locator could not be accessed this run — the row may exist as a lead, but no
  claim may cite it.

`claims.tsv` — 6 columns:
`id  rq  claim  confidence  sources  evidence`
- `id` `C-` + number, unique · `rq` `RQ-<n>` matching the plan · `claim` one atomic falsifiable
  sentence · `confidence` high|moderate|low|contested
- `sources` comma-joined S-ids — every id must exist, none `rejected`/`unverified`; tier floors
  per §5 (T4-only = invalid row)
- `evidence` `evidence:<relpath>` into the reading notes

## §8 Dossier template — `report.md`

1. **Executive summary** — each RQ answered in one paragraph, confidence label leading.
2. **Scope of use** — mandatory verbatim register note for sensitive domains (§9).
3. **Per-RQ synthesis** — narrative with `[S-nn]` on every factual sentence; conflicting evidence
   inline, not in a footnote.
4. **Consensus vs contested table** — claim · status · who says what.
5. **Magnitudes table** — value · units · conditions · source(s).
6. **Limitations & unknowns** — as prominent as the findings: what the literature does not
   establish, scarcity notes, what new evidence would change.
7. **Methodology appendix** — queries run (from `queries.tsv`), selection criteria, tier policy,
   dates, engines.
8. **Bibliography** — every source: authors, year, title, venue, locator, accessed date, depth.

## §9 Sensitive-domain register (medical · legal · financial · safety)

When Audience/use touches these, the plan AND the dossier carry a scope note stating, in plain
language:
- The dossier reports **what the published literature says** — it is not medical advice, a legal
  opinion, an engineering certification, or investment advice.
- **Case-specific conclusions require case-specific inputs and qualified professionals** — for an
  injury: the person's own imaging, records, and treating clinicians; for litigation: retained
  expert witnesses (e.g. a biomechanical engineer, a neurologist) interpreting the case record.
- **Litigation support explicitly:** courts admit qualified expert testimony, not research
  printouts — the dossier's role is to help counsel understand the field, formulate questions, and
  brief experts (per the applicable expert-evidence standard in that jurisdiction). It never claims
  what happened in the specific incident; it reports mechanisms, ranges, and findings from the
  literature, cited so an expert can verify every line.
- General-population findings do not diagnose an individual (base rates ≠ this case).
The register also *raises rigor*: tier floor prefers T1 systematic reviews; hedged language
matches the evidence ("associated with", "in cadaver studies", "risk increases by"); no
extrapolation past the studied conditions.

## §10 User-context quarantine

User-supplied narrative (an incident, a thesis, prior beliefs) lives in `research-plan.md
§Context`, marked user-provided. It shapes *which questions are asked*, never *which answers are
found*: it is not a source, is never cited, and no personal identifying detail from it enters any
search query — queries stay generic ("pedestrian struck by bus mirror head impact biomechanics",
never a name, date, or place from the case). Confirmation bias is the failure mode this section
exists to prevent: the engagement researches the question as asked AND its disconfirmation, and
reports whichever way the evidence lands.
