---
name: forge:research
description: "Deep research engagement — decompose questions, sweep scholarly + web sources, read the primary literature, build a source-anchored claims ledger with graded confidence, synthesize a cited dossier gated by a mechanical citation verdict; optionally typeset as an arXiv preprint or IEEE paper"
argument-hint: "[Topic: <question|file>] [Recency: <window>] [Audience: <who/purpose>] [Format: md|arxiv|ieee] [Iterations: N] [--depth standard|exhaustive] [--chain reason|requirements]"
---

EXECUTE IMMEDIATELY.

The **research analyst** of the pipeline. Where `learn` documents a codebase and `improve` scouts a
market, `research` answers **questions about the world**: a complete literature-and-web research
engagement run the way a professional analyst runs one — question decomposition → **multi-modal
source sweep** (scholarly databases, institutional publishers, standards bodies, quality secondary
press) → **deep reading of the primary literature** → a machine-validated **claims ledger** where
every claim cites the sources that support it at a graded confidence → an **adversarial
disconfirmation pass** → a synthesized **research dossier** whose release is decided by
`scripts/score-research.sh verdict`, never by "looks thorough". The harness's evidence discipline,
applied to knowledge: **no claim without a source, no source without an accessed locator, no number
without its conditions, no verdict without the seam.** Companion contract:
`references/research-protocol.md` (source-tier table, evidence hierarchy, search playbook,
confidence rubric, reading-note and dossier templates, sensitive-domain register).

## Seam & reference resolution (read once)
Resolve `AR_ROOT` exactly as in `build`: first existing of `${CLAUDE_PLUGIN_ROOT}/skills/forge`,
`.claude/skills/forge`, the directory containing this command file, else glob
`**/skills/forge/scripts/score-research.sh` and take its grandparent. Every `scripts/<x>` below
means `$AR_ROOT/scripts/<x>`; every `references/<x>` means `$AR_ROOT/references/<x>`. Run
`bash $AR_ROOT/scripts/doctor.sh` at Phase 0 — this command needs only CORE tools plus the
model-side WebSearch/WebFetch surface; if web access is unavailable, STOP and say so — a research
engagement without live sources is fiction.

## Parse Arguments
- `Topic:` / `--topic` — the research question or subject (inline text or a file with background,
  e.g. a brief, an incident description, a draft to fact-check). Required; if absent, ask.
- `Recency:` — the recency window that matters (e.g. `5y`, `10y`, `any`). Default: derived from the
  field's pace (fast-moving science/tech → 5y anchor with landmark exceptions; settled physics →
  any). Recorded in the plan either way.
- `Audience:` — who consumes the dossier and for what decision (e.g. "engineering team choosing a
  queue", "general reader", "counsel preparing to brief a biomechanics expert"). Calibrates register
  and depth; triggers the **sensitive-domain register** (below) when the use is medical, legal,
  financial, or safety-critical.
- `Format:` — output format(s) for the final report: `md` (default, always written) plus `arxiv`
  and/or `ieee` (comma-separable, e.g. `Format: arxiv,ieee`). Paper formats typeset the SAME ledger
  per `references/paper-templates.md` — never new claims.
- `Iterations:` — bound on the claims/synthesis loop (default 15). `--depth standard|exhaustive` —
  exhaustive widens the sweep (more modalities, 1-hop citation snowball on every anchor, per-claim
  disconfirmation) and raises the tier floor.
- `--chain <targets>` — commonly `reason` (adversarial debate on the contested claims) or
  `requirements` (the dossier becomes domain recon for an SRS). `--evals`.

## Run directory & deliverables (machine-readable where it counts)
`forge/research-{YYMMDD}-{HHMM}/` containing:
- `research-plan.md` — decomposed research questions (RQ-1…RQ-n, each one answerable-by-evidence),
  intended use + audience, recency window, tier policy, stop criteria, and the sensitive-domain
  flag with its scope note when triggered.
- `queries.tsv` — the search log: `n phase engine query date kept` (auditability: the sweep can be
  replayed).
- `sources.tsv` — the source ledger, **9 tab-separated columns**, validated by
  `scripts/score-research.sh sources`:
  `id tier type year title venue locator depth status`
  (tier ∈ T1–T4 per the protocol's table; locator `doi:|pmid:|pmcid:|arxiv:|isbn:|url:<http…>`;
  depth ∈ full|abstract|secondary — **what was actually read**; status ∈ read|cited|rejected|unverified).
- `evidence/S-<id>.md` — one reading note per read source: bibliographic line, method/population,
  key findings **with numbers, units, and conditions**, limitations, verbatim quotes with
  section/page anchors. A source cited at depth `full` without its note does not count.
- `claims.tsv` — the claims ledger, **6 tab-separated columns**, validated by
  `scripts/score-research.sh claims`:
  `id rq claim confidence sources evidence`
  (confidence ∈ high|moderate|low|contested per the protocol rubric; `sources` = comma-joined S-ids;
  `evidence` = `evidence:<relpath>` into the reading notes).
- `report.md` — the dossier (template in the protocol): executive summary answering each RQ at its
  confidence; per-RQ synthesis with inline `[S-nn]` on every factual sentence; consensus-vs-contested
  table; magnitudes table (value · units · conditions · source); limitations and open unknowns;
  scope-of-use note; methodology appendix; full bibliography with accessed dates.
- `paper/arxiv/main.tex` + `references.bib` and/or `paper/ieee/main.tex` + `references.bib` — when
  `Format:` requests them: the dossier typeset per `references/paper-templates.md` (arXiv `article`
  preprint · `IEEEtran`), bibliography generated from the **cited** `sources.tsv` rows (key =
  source id, accessed dates kept), validated by `scripts/score-research.sh paper`; compiled to
  `main.pdf` when a LaTeX toolchain (`tectonic`|`latexmk`|`pdflatex`) resolves, otherwise shipped
  as sources with a compile note — never a faked PDF.
- `iterations.tsv`, `score-log.tsv`, `handoff.json`.

## Phase 1 — Scoping & question decomposition
Parse the topic. Decompose into **RQ-1…RQ-n** (≤8 for standard depth): each RQ a question evidence
can answer, not a heading ("What peak linear/rotational head accelerations does a fall of this type
produce?" — never "The brain"). Separate **user-supplied context** (an incident description, a
draft, prior beliefs) into the plan's Context section — it frames the questions and is **never
citable as evidence**. Declare intended use + audience; set the recency window; pick the tier
policy. **Sensitive-domain register:** when the use touches medicine, law, finance, or safety,
the plan and the dossier both carry the protocol's scope note — the dossier is a literature
background that supports qualified professionals (physicians, licensed engineers, attorneys,
retained expert witnesses); it is **not** professional advice, a case-specific opinion, or evidence
admissible on its own — and case-specific conclusions additionally require the case's own records
and a qualified expert. Interactive sessions confirm the RQ set with ONE `AskUserQuestion`
(decomposition + recency + audience, recommended defaults); non-interactive runs log the derivation
as explicit assumptions. **Gate:** `research-plan.md` written; every RQ answerable-by-evidence;
intended use declared.

## Phase 2 — Multi-modal source sweep (breadth before depth)
Per RQ, search **multiple modalities** — each blind to what the others surface (protocol §3
playbook): scholarly indexes (Google Scholar, PubMed/MEDLINE, arXiv, Semantic Scholar, Crossref),
institutional and statutory publishers (WHO, CDC, NIH, NIST, NTSB, ISO, .gov/.edu), standards and
handbooks, then quality secondary press. **Reviews first:** anchor each RQ on systematic
reviews/meta-analyses/authoritative textbooks where they exist, then walk to primary studies;
snowball 1 hop through the anchors' reference lists (every hop logged in `queries.tsv`). Triage hits
into `sources.tsv`: tier assigned by **publication class, never by agreement with any thesis**
(T1 peer-reviewed primary/secondary literature & standards · T2 preprints, official bodies,
authoritative texts · T3 quality journalism, vendor docs, edited references · T4 blogs/forums —
context only, never sole support). Dedup by DOI/PMID. **Gate (mechanical):**
`scripts/score-research.sh sources sources.tsv` → `SOURCES: VALID`; every RQ has ≥2 independent
T1/T2 candidates or the plan records an explicit **evidence-scarcity note** for that RQ.

## Phase 3 — Deep reading (the literature, not the snippets)
For each triaged source, fetch what is actually reachable: full text (HTML, open-access PDF,
publisher page) → `depth=full`; abstract-only behind a paywall → `depth=abstract`; known only
through another work's description → `depth=secondary`. Write `evidence/S-<id>.md` per the
protocol's note template — extract findings **with their conditions attached** (population/specimen,
n, methodology, magnitudes with units, confidence intervals, stated limitations), and verbatim
quotes only from text actually fetched, each with a section/page anchor. **Depth honesty is a hard
rule:** an abstract is never cited as if the full text was read; a secondary description is cited as
the secondary source; `depth` in the ledger states the truth and the confidence rubric consumes it.
**Gate:** every T1/T2 source that any claim will cite has a reading note; no quote without a fetch.

## Phase 4 — Claims ledger & adversarial loop (the forge loop; bounded)
Per iteration, exactly one focused slice:
1. **Extract** claims for the least-covered RQ into `claims.tsv` — atomic, falsifiable statements
   ("frontal impacts at Δv X produce peak angular accelerations of Y–Z rad/s² in cadaver studies
   [S-03, S-07]"), never vibes ("the impact is serious").
2. **Grade** confidence by the protocol rubric — mechanical, tier-and-depth aware: **high** = ≥2
   independent T1/T2 sources, consistent findings; **moderate** = one T1/T2, or several converging
   T3; **low** = T3-only support (T4-only support is *invalid*, the validator rejects it);
   **contested** = credible T1/T2 sources genuinely disagree — record both sides with their
   citations, never average them into false consensus.
3. **Disconfirm** — for every load-bearing claim, run the adversarial pass: search *against* it
   ("evidence against …", "criticism of …", "failed replication"), check for retractions and
   errata, check whether newer work supersedes it (protocol §5). A claim that survives records
   what was searched; one that doesn't is downgraded or flipped to contested — this pass is why
   the dossier can be trusted.
4. **Anchor numbers** — every magnitude keeps units, range, and the conditions it was measured
   under; a number stripped of its population/conditions is misinformation and may not enter
   `claims.tsv`.
5. **Score** — `scripts/score-research.sh claims claims.tsv sources.tsv` after every cycle
   (orphan citations, tier-rule violations, uncovered RQs → next iteration's work list); log the
   iteration to `iterations.tsv`, append-only.
Repeat until every RQ is covered at the best supportable confidence and the claims validator is
clean, or the `Iterations` bound hits (`scripts/score-build.sh bound iterations.tsv <N>`;
`BOUND: EXCEEDED` blocks a COMPLETE status without a recorded user-approved extension).

## Phase 5 — Dossier & verdict
Write `report.md` from the ledger (protocol template): executive summary that **answers each RQ in
one confidence-labeled paragraph**; per-RQ synthesis where every factual sentence carries its
`[S-nn]` citations; the consensus-vs-contested table; the magnitudes table; **limitations stated as
prominently as findings** (what the literature does not establish, where evidence is scarce, what
would change the answer); the scope-of-use note (mandatory for sensitive domains); the methodology
appendix (queries, selection criteria, tier policy, dates); the full bibliography (authors, year,
title, venue, locator, accessed date — every entry resolvable). Then the mechanical gate:
`scripts/score-research.sh verdict claims.tsv sources.tsv research-plan.md`
→ prints per-criterion PASS/FAIL (ledgers valid · every RQ covered or scarcity-noted · T1/T2
support floor met, default `RESEARCH_T12_FLOOR=0.60` · zero orphan or unverified citations) and the
verdict: **`DOSSIER_READY` or `DOSSIER_BLOCKED`**. A blocked dossier ships to the user only labeled
as blocked, with the failing criteria and the scarcity map — never silently as done.
**Paper emission (when `Format:` includes `arxiv`/`ieee`):** project the dossier into the requested
skeleton(s) per `references/paper-templates.md` — section mapping §1, BibTeX rules §2, every
`[S-nn]` becomes `\cite{S-nn}`, the Limitations section survives as its own `\section`, the
scope-of-use note becomes the mandatory Scope of Use subsection for sensitive domains, and every
`<placeholder>` is filled. Each emitted format must pass
`scripts/score-research.sh paper paper/<fmt>/main.tex paper/<fmt>/references.bib sources.tsv`
(`PAPER: VALID` — orphan `\cite` keys, uncitable bib entries, or a missing Limitations/abstract/
bibliography block it). A paper is a typeset projection of the ledger: it may not introduce one
claim, number, or citation the dossier does not carry.

## GitHub flow (transparency contract)
Research artifacts are evidence — commit the run directory (plan, ledgers, notes, dossier) to the
invoking workspace as `research: <topic slug> dossier` so the engagement is reviewable and
replayable. Nothing is pushed anywhere else; no external service receives the dossier.

## Safety Invariants
- **No fabricated scholarship.** Every `sources.tsv` row's locator was actually accessed this run
  (or the row is `status=unverified`, which no claim may cite — the validator enforces it). Every
  verbatim quote comes from fetched text. Citation laundering — citing a paper for what a blog said
  about it — is a depth-honesty violation: cite what was read, at the depth it was read.
- **Read-only toward the world.** Search and fetch only: no posting, no crawling behind
  authentication, no paywall or robots evasion; paywalled content is used at `abstract` depth or via
  legitimately accessible versions (publisher OA, PubMed Central, arXiv).
- **Sensitive domains stay in their lane.** Medical/legal/financial/safety dossiers always carry
  the scope note; findings are presented as what the literature says, never as a diagnosis, a legal
  opinion, or a case-specific expert conclusion. When the audience is litigation support, the
  dossier says plainly: courts hear qualified expert witnesses interpreting case-specific records —
  this document is background that helps counsel and experts work, not a substitute for either.
- **User context is quarantined.** User-supplied facts (an incident narrative, a draft's thesis)
  appear only in the plan's Context section and the dossier's framing — never in `sources.tsv`,
  never as support for a claim. The engagement researches the question, not the desired answer;
  disconfirming evidence is reported at the same prominence as confirming.
- **Privacy.** No personal names or identifying details from the user's context enter any search
  query — queries are generic ("pedestrian struck by vehicle mirror head injury biomechanics",
  never a named person). Nothing from the run is transmitted beyond the searches themselves.

## Summary
Print: verdict (**DOSSIER_READY | DOSSIER_BLOCKED**) with each criterion's measured value; RQ list
with per-RQ answer confidence; claims by confidence (high/moderate/low/contested); sources by tier
and depth (full/abstract/secondary split); disconfirmation passes run and what they changed;
evidence-scarcity notes; deliverables checklist (plan · queries · sources · notes · claims ·
dossier · papers when requested, each with its `PAPER:` line and PDF-or-compile-note — each
present/missing); the dossier path; the scope-of-use reminder when the sensitive register is
active.

## Eval Checkpoint (--evals)
Interval: floor(max_iterations / 3), min 1. Print claims-per-RQ coverage, confidence mix trend
(rising `high` share = converging; rising `contested` = a genuinely disputed field — report it,
don't sand it), sources read vs triaged, disconfirmation hit-rate. A flat coverage curve two
checkpoints running → recommend narrowing the RQ set or accepting a scarcity note, never padding.

## Chain Handoff
Write handoff.json: version "3.1.0", source "research", timestamp, status
(COMPLETE|BOUNDED|BLOCKED|USER_INTERRUPT|ERROR), verdict (DOSSIER_READY|DOSSIER_BLOCKED), report
(dossier path), findings = per-RQ one-line answers + the contested list + scarcity notes,
config{topic, rqs, recency, audience, depth, iterations}. Validate with
`scripts/validate-handoff.sh <run>/handoff.json research` before printing the summary. Chain
commonly `--chain reason` (blind-judge debate on the contested claims) or `--chain requirements`
(the dossier is domain recon for an SRS). Propagate `--evals`.
