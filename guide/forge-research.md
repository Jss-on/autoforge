# /forge:research — Deep Research Engagement

The research analyst of the pipeline. Where `learn` documents a codebase and `improve` scouts a
market, `research` answers **questions about the world** — a technology decision, a scientific
question, a standards landscape — with the harness's evidence discipline applied to knowledge:
**no claim without a source, no source without an accessed locator, no number without its
conditions, no verdict without the seam.**

## Invocation

```
/forge:research Topic: "What ordering guarantees do modern message queues provide?" Audience: "eng team choosing infra"
/forge:research Topic: incident-brief.md Recency: 10y Audience: "counsel preparing to brief a biomechanics expert"
/forge:research Topic: "state of local LLM inference on 4GB VRAM" --depth exhaustive --chain reason
```

| Argument | Meaning |
|---|---|
| `Topic:` | The research question or a file with background (brief, incident description, draft to fact-check). Required. |
| `Recency:` | The window that matters (`5y`, `10y`, `any`). Defaults by field pace. |
| `Audience:` | Who consumes the dossier, for what decision. Triggers the sensitive-domain register (medical/legal/financial/safety). |
| `Format:` | `md` (default) plus `arxiv` and/or `ieee` — typeset the dossier as an arXiv preprint (`article`) or IEEE paper (`IEEEtran`), bibliography generated from cited sources, validated by `score-research.sh paper`, compiled to PDF when a LaTeX toolchain resolves. |
| `Iterations:` | Bound on the claims/synthesis loop (default 15). |
| `--depth standard\|exhaustive` | Exhaustive widens the sweep, snowballs every anchor, disconfirms per-claim. |
| `--chain reason\|requirements` | Debate the contested claims, or feed the dossier into an SRS as domain recon. |

## The engagement

1. **Scope** — decompose into answerable research questions (RQ-1…RQ-n); declare intended use,
   audience, recency window. User-supplied context is quarantined: it shapes the questions, never
   the answers, and no identifying detail enters any query.
2. **Sweep** (breadth) — multiple modalities per RQ: scholarly indexes, institutional publishers,
   standards bodies, quality press. Reviews first, then primary studies, 1-hop citation snowball.
   Every hit triaged into `sources.tsv` with a tier assigned by publication class (T1 peer-reviewed
   & standards · T2 preprints & official bodies · T3 edited secondary · T4 unedited web — leads
   only, never support).
3. **Read** (depth) — fetch what is reachable; one reading note per source with verbatim quotes and
   anchors. **Depth honesty:** `full | abstract | secondary` records what was actually read; an
   abstract is never cited as a full read.
4. **Claims loop** (bounded) — atomic falsifiable claims into `claims.tsv`, each citing its S-ids at
   a graded confidence (**high** = ≥2 independent T1/T2; T4-only is mechanically invalid;
   **contested** = credible disagreement, both sides reported). Every load-bearing claim gets an
   **adversarial disconfirmation pass**: search against it, check retractions, check supersession.
5. **Dossier** — `report.md`: executive summary answering each RQ at its confidence, inline `[S-nn]`
   on every factual sentence, consensus-vs-contested table, magnitudes table (value · units ·
   conditions), limitations as prominent as findings, methodology appendix, full bibliography.

## The seam

```
scripts/score-research.sh sources sources.tsv            # ledger schema + tier counts
scripts/score-research.sh claims  claims.tsv sources.tsv # anchoring, tier floors, orphans
scripts/score-research.sh verdict claims.tsv sources.tsv research-plan.md
```

```
criterion source-ledger: SOURCES: VALID total=24 t1=9 t2=7 t3=6 t4=2 unverified=0 PASS
criterion claims-ledger: CLAIMS: VALID total=18 high=7 moderate=6 low=3 contested=2 orphans=0 PASS
criterion rq-coverage: 6/6 PASS
criterion t12-floor: 0.72 >= 0.60 PASS
VERDICT: DOSSIER_READY
```

`DOSSIER_READY | DOSSIER_BLOCKED` is decided by the seam — every plan RQ covered (or explicitly
scarcity-noted), both ledgers valid, and at least `RESEARCH_T12_FLOOR` (default 0.60) of claims
resting on T1/T2 sources. A blocked dossier ships only labeled as blocked, with the failing
criteria and the scarcity map.

## Paper formats

`Format: arxiv,ieee` emits `paper/arxiv/main.tex` and/or `paper/ieee/main.tex` with a generated
`references.bib` (key = source id, accessed dates kept). The paper is a typeset projection of the
claims ledger — it may not introduce a claim, number, or citation the dossier does not carry —
and `scripts/score-research.sh paper` gates it: every `\cite` must resolve, every bib key must map
to a citable ledger row, and abstract/Limitations/bibliography must be present. See
`references/paper-templates.md` for the skeletons and the dossier-to-section mapping.

## Sensitive domains

Medical, legal, financial, and safety-critical topics trigger the protocol's register
(`references/research-protocol.md` §9): the dossier always carries a scope-of-use note — it reports
what the published literature says, as background that supports qualified professionals
(physicians, licensed engineers, attorneys, retained experts). It is not advice, not a
case-specific opinion, and not evidence admissible on its own; courts hear qualified expert
witnesses interpreting case-specific records, and the dossier's role is to help counsel and
experts work with the field, cited so every line can be verified.

## Chains

- `research → reason` — blind-judge adversarial debate on the contested claims.
- `research → requirements` — the dossier becomes Phase-0 domain recon for an SRS.
- `requirements → build` already runs a bounded domain-recon pass; point it at a finished research
  run for a far deeper foundation.
