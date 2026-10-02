# Paper Templates — arXiv + IEEE emission for `/forge:research`

Consumed by `research.md` Phase 5 when `Format:` requests a paper. The dossier (`report.md`) stays
the canonical deliverable; a paper is a **typeset projection of the same ledger** — same claims,
same `[S-nn]` anchoring (as `\cite{S-nn}`), same limitations prominence, same scope-of-use register.
Emitted papers are validated by `scripts/score-research.sh paper` (cite/bib cross-check + required
sections) before they count as deliverables.

## §1 Section mapping (dossier → paper, both formats)

| Dossier part | Paper section |
|---|---|
| Executive summary (per-RQ answers) | **Abstract** (≤250 words, confidence labels kept) + **Conclusion** |
| Plan §Context + intended use | **Introduction** (motivation, the RQ-1…RQ-n list verbatim) |
| Methodology appendix | **Methods** (search strategy, tier policy, selection criteria, dates — a reader can replay the sweep) |
| Per-RQ synthesis | **Results** — one subsection per RQ, every factual sentence keeps its `\cite{S-nn}` |
| Magnitudes table | **Results** table (`booktabs`; value · units · conditions · source) |
| Consensus-vs-contested table | **Discussion** table + narrative (both sides cited, never averaged) |
| Limitations & unknowns | **Limitations** — its own `\section`, never folded into Discussion; as prominent as Results |
| Scope-of-use note (sensitive domains) | **Scope of Use** subsection immediately after the abstract-adjacent Introduction — mandatory when the register is active |
| Bibliography | `references.bib` — one entry per **cited** source, key = the source id (`S-01`…) |

Hard rules carried over from the protocol: numbers keep units + conditions; contested claims appear
two-sided; depth honesty survives typesetting (an abstract-only source is cited with its
`note = {Abstract only}`); no `\cite` key that is not a citable `sources.tsv` row.

## §2 BibTeX generation (`sources.tsv` → `references.bib`)

Key = source id verbatim (`@article{S-01,`). Entry type from the `type` column:

| `type` | BibTeX entry |
|---|---|
| meta-analysis, rct, cohort, study, review, article, case-report | `@article` |
| preprint | `@misc` + `eprint`/`archivePrefix={arXiv}` when `locator` is `arxiv:` |
| conference | `@inproceedings` |
| standard, official, report | `@techreport` (institution = `venue`) |
| book, textbook | `@book` |
| news, docs, web | `@misc` + `howpublished={\url{…}}` |

Locator mapping: `doi:` → `doi = {…}` · `arxiv:` → `eprint` + `archivePrefix` · `pmid:`/`pmcid:` →
`note = {PMID: …}` plus the PubMed URL · `isbn:` → `isbn` · `url:` → `url = {…}`. Every entry
carries the accessed date (`note = {Accessed: YYYY-MM-DD}` — works in both natbib and IEEEtran).
Only **cited** sources enter the .bib; the full triage ledger stays in `sources.tsv`.

## §3 arXiv preprint skeleton — `paper/arxiv/main.tex`

arXiv has no mandated class; the convention is a clean `article` preprint. Compiles on TeX Live /
Overleaf / arXiv AutoTeX with no exotic packages.

```latex
\documentclass[11pt]{article}

% --- arXiv preprint preamble (deliberately boring: AutoTeX-safe) ---
\usepackage[margin=1in]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{booktabs}
\usepackage{microtype}
\usepackage[numbers,sort&compress]{natbib}
\usepackage[hidelinks]{hyperref}
\usepackage{authblk}

\title{<Dossier title — the topic, stated as the finding, not the question>}
\author[1]{<Author>}
\affil[1]{<Affiliation>}
\date{<YYYY-MM-DD — the engagement date>}

\begin{document}
\maketitle

\begin{abstract}
% Executive summary, <=250 words: one confidence-labeled sentence per RQ,
% then the strongest magnitude with its conditions, then the top limitation.
\end{abstract}

\section{Introduction}
% Motivation from the plan's intended use. End with the research questions verbatim:
% RQ-1 ... RQ-n. Sensitive domains: the Scope of Use subsection follows immediately.
\subsection*{Scope of Use}
% MANDATORY when the sensitive-domain register is active (protocol §9): literature
% background supporting qualified professionals; not advice, not case-specific
% opinion, not admissible evidence on its own. Delete this subsection otherwise.

\section{Methods}
% Methodology appendix: engines + queries (queries.tsv), recency window, tier
% policy (protocol §1), selection criteria, dates. Reviews-first + snowball noted.

\section{Results}
% One subsection per RQ. Every factual sentence carries \cite{S-nn}.
\subsection{RQ-1: <question>}
\subsection{RQ-2: <question>}

\begin{table}[t]
\centering\small
\caption{Reported magnitudes with measurement conditions.}
\begin{tabular}{llll}\toprule
Quantity & Value & Conditions & Source \\ \midrule
<quantity> & <value $\pm$ CI, units> & <population/protocol> & \cite{S-01} \\ \bottomrule
\end{tabular}
\end{table}

\section{Discussion}
% Consensus vs contested. Contested claims presented two-sided with citations;
% never averaged into a false middle.

\section{Limitations}
% As prominent as Results: what the literature does not establish, scarcity
% notes per RQ, what new evidence would change the answers.

\section{Conclusion}
% Per-RQ answers restated at their graded confidence. No claim beyond the ledger.

\bibliographystyle{unsrtnat}
\bibliography{references}
\end{document}
```

## §4 IEEE skeleton — `paper/ieee/main.tex`

`IEEEtran` (standard TeX Live class). Conference profile by default; switch to
`\documentclass[journal]{IEEEtran}` for the journal layout — structure is unchanged.

```latex
\documentclass[conference]{IEEEtran}

\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{booktabs}
\usepackage[hidelinks]{hyperref}
\usepackage{cite}

\begin{document}

\title{<Dossier title>}
\author{\IEEEauthorblockN{<Author>}
\IEEEauthorblockA{<Affiliation>\\<email>}}
\maketitle

\begin{abstract}
% Executive summary, <=250 words, confidence labels kept.
\end{abstract}

\begin{IEEEkeywords}
<4--6 keywords from the domain vocabulary discovered in the sweep>
\end{IEEEkeywords}

\section{Introduction}
% Motivation + the research questions RQ-1...RQ-n verbatim.
\subsection*{Scope of Use}
% MANDATORY when the sensitive-domain register is active (protocol §9).
% Delete this subsection otherwise.

\section{Methods}
% Search strategy, tier policy, selection criteria, dates — replayable.

\section{Results}
% One subsection per RQ; every factual sentence carries \cite{S-nn}.
\subsection{RQ-1: <question>}

\begin{table}[t]
\centering\small
\caption{Reported magnitudes with measurement conditions.}
\begin{tabular}{llll}\toprule
Quantity & Value & Conditions & Source \\ \midrule
<quantity> & <value $\pm$ CI, units> & <conditions> & \cite{S-01} \\ \bottomrule
\end{tabular}
\end{table}

\section{Discussion}
% Consensus vs contested, two-sided.

\section{Limitations}
% Own section, never folded away.

\section{Conclusion}

\bibliographystyle{IEEEtran}
\bibliography{references}
\end{document}
```

## §5 Emission & validation rules

- Layout: `paper/arxiv/main.tex` and/or `paper/ieee/main.tex`, each with a sibling
  `references.bib` (identical content is fine — each directory stays self-contained for upload).
- Fill every `<placeholder>`; a shipped paper with an unfilled `<…>` is a defect.
- **Validate (mechanical):** `scripts/score-research.sh paper <main.tex> <references.bib>
  [sources.tsv]` → `PAPER: VALID` required per emitted format. Checks: every `\cite` key resolves
  in the .bib (orphans fail) · every bib key maps to a **citable** ledger row when `sources.tsv`
  is given · abstract + a Limitations section + a bibliography present. Unused bib keys are
  reported but do not fail.
- **Compile when a toolchain resolves** (`tectonic` | `latexmk` | `pdflatex`, in that order):
  produce `main.pdf` as evidence. No toolchain → ship sources with a note that arXiv/Overleaf
  compile them as-is; never fake a PDF.
- The paper inherits the engagement's safety posture: it is a deliverable **to the user** —
  never submitted, uploaded, or posted anywhere by the command.
