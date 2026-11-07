#!/usr/bin/env node
// Content-level coverage of the book in forge (stdlib only). Title presence (tests/book-map-verify.cjs) is not
// content presence, so this check takes every section of the book's table of contents, extracts the section's
// most distinctive terms (tf × idf across sections, stemmed) from the body text, and asks how many of them occur
// in forge's data-intensive corpus: the protocol, the book map, the fourteen chapter digests, the metrics
// research ledger, the stack and operational protocols, the requirements/build commands and the data seams.
// A section counts as covered when ≥ 50 % of its distinctive terms are in the corpus, or when a chapter digest
// cites a page inside the section (its rule was read and recorded even if the section's vocabulary is example
// identifiers or a reference list). Chapter summaries bound the last section of each chapter and are not
// themselves checked (they restate the sections).
//   node tests/book-concepts-verify.cjs <pages.json> <forge-root>   (pages.json: {pages:[{pdf_page,text}]}, extracted locally)
// Gate: every section covered and mean term coverage ≥ 90 %.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const [, , pagesFile, forgeRoot] = process.argv;
if (!pagesFile || !forgeRoot) { console.error('usage: book-concepts-verify.cjs <pages.json> <forge-root>'); process.exit(2); }
const { pages } = JSON.parse(fs.readFileSync(pagesFile, 'utf8'));
const firstBody = pages.find(p => /CHAPTER 1\b/.test(p.text) && /Trade-?Offs in Data Systems Architecture/i.test(p.text));
if (!firstBody) { console.error('cannot locate chapter 1 in the pages file'); process.exit(2); }
const offset = firstBody.pdf_page - 1;
const bookPage = n => pages[n + offset - 1] ? pages[n + offset - 1].text : '';
const STOP = new Set(('a an and are as at be been being but by can could do does for from had has have how if in into is it its may might more most must no not of on or our over should so some such than that the their them then there these they this those to under up use used using very was we were what when where which while who will with within without would you your also however example figure figures chapter section like many one two first second case cases called known shown way make makes each other because between both after before about still just much every any all only even see say says said well need needs often per via etc new old same different another either neither rather usually sometimes typically generally particular particularly especially simply quite less least several various kind kinds part parts point points thing things term terms means mean described discussed discuss discussion look looks instead already whether ever never always itself themselves version versions number numbers value values set sets get gets take takes give gives put puts end ends start starts lot lots later earlier large small long short high low good bad better best worse worst important possible impossible available problem problems approach approaches process processes processing system systems data database databases application applications').split(/\s+/));
const stem = w => w.replace(/(ization|izations|isation|ations|ation|ingly|ities|ity|ies|ing|ers|er|ed|es|s|ly)$/, '').replace(/(.)\1$/, '$1');
const tokens = text => text.toLowerCase().replace(/[‑–—-]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)).map(stem).filter(w => w.length >= 3);
// table of contents → sections, with chapter summaries kept as boundaries
const tocText = pages.slice(0, 20).map(p => p.text).join('\n');
const toc = tocText.split('\n').map(l => l.trim()).filter(l => /^[A-Z0-9].*\s\d{1,3}$/.test(l) && !/^(Preface|Glossary|Index)/.test(l) && !/Table of Contents/.test(l))
  .map(l => { const m = /^(.*?)[\s.]*(\d{1,3})$/.exec(l); return { title: m[1].replace(/\.+$/, '').trim(), page: Number(m[2]) }; }).filter(e => e.page >= 1 && e.page <= 601 && e.title.length > 3);
let chapter = 0; for (const e of toc) { const m = /^(\d+)\.\s/.exec(e.title); if (m) { chapter = Number(m[1]); e.isChapter = true; } e.chapter = chapter; e.isSummary = /^Summary$/.test(e.title); }
const entries = toc.filter(e => !e.isChapter);
const sections = entries.filter(e => !e.isSummary);
const bounds = new Map(); entries.forEach((e, i) => { const nx = entries[i + 1]; bounds.set(e, nx && nx.chapter === e.chapter ? nx.page : e.page + 6); });
const texts = sections.map(e => { let t = ''; for (let n = e.page; n < Math.max(e.page + 1, bounds.get(e)); n++) t += ' ' + bookPage(n); return tokens(t); });
const df = new Map(); for (const toks of texts) for (const w of new Set(toks)) df.set(w, (df.get(w) || 0) + 1);
const N = texts.length;
// forge corpus and the digests' page citations
const R = path.join(forgeRoot, '.claude', 'skills', 'forge', 'references'), C = path.join(forgeRoot, '.claude', 'commands', 'forge');
const files = [path.join(R, 'data-intensive-protocol.md'), path.join(R, 'data-intensive-book-map.md'), path.join(R, 'data-intensive-metrics-research.md'), path.join(R, 'stack-selection-protocol.md'), path.join(R, 'operational-recovery.md'), path.join(R, 'ci-protocol.md'), path.join(R, 'security-checklist.md'), path.join(R, 'fullstack-hardening-checklist.md'), path.join(C, 'build.md'), path.join(C, 'requirements.md'), path.join(forgeRoot, 'scripts', 'data-score.cjs'), path.join(forgeRoot, 'scripts', 'data-load.cjs'), path.join(forgeRoot, 'scripts', 'operational.cjs'), path.join(forgeRoot, 'tests', 'fixtures', 'data', 'DATA.md')];
const digests = fs.readdirSync(R).filter(f => /^data-intensive-digest-ch\d\d\.md$/.test(f)).map(f => path.join(R, f));
const present = files.filter(f => fs.existsSync(f)).concat(digests);
const corpusText = present.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const corpus = new Set(tokens(corpusText));
const citedPages = new Set(); for (const m of digests.map(f => fs.readFileSync(f, 'utf8')).join('\n').matchAll(/\bp\.(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/g)) { const a = Number(m[1]), b = Number(m[2] || m[1]); if (b >= a && b - a <= 60) for (let n = a; n <= b; n++) citedPages.add(n); }
const K = 10; const perChapter = {}; const weak = []; let total = 0, byTerms = 0, byCitation = 0;
sections.forEach((e, i) => {
  const tf = new Map(); for (const w of texts[i]) tf.set(w, (tf.get(w) || 0) + 1);
  const terms = [...tf.entries()].filter(([, c]) => c >= 2).map(([w, c]) => [w, c * Math.log(N / (df.get(w) || 1))]).sort((a, b) => b[1] - a[1]).slice(0, K).map(([w]) => w);
  const cov = terms.length ? terms.filter(w => corpus.has(w)).length / terms.length : 1; total += cov;
  let cited = false; for (let n = e.page; n < bounds.get(e); n++) if (citedPages.has(n)) { cited = true; break; }
  const covered = cov >= 0.5 || cited; if (cov >= 0.5) byTerms++; else if (cited) byCitation++;
  (perChapter[e.chapter] ||= []).push(cov);
  if (!covered) weak.push({ chapter: e.chapter, page: e.page, title: e.title, cov, missing: terms.filter(w => !corpus.has(w)) });
});
const mean = total / sections.length;
console.log(`BOOK_CONCEPTS: sections=${sections.length} corpus_files=${present.length} vocabulary=${corpus.size} digest_pages_cited=${citedPages.size}`);
for (const [ch, covs] of Object.entries(perChapter)) console.log(`  chapter ${String(ch).padStart(2)}: mean ${(covs.reduce((a, b) => a + b, 0) / covs.length * 100).toFixed(0)} % over ${covs.length} sections, under 50 % by terms: ${covs.filter(c => c < 0.5).length}`);
console.log(`  covered by terms: ${byTerms}; covered by a digest citing the section's pages: ${byCitation}; uncovered: ${weak.length}`);
for (const w of weak) console.log(`  UNCOVERED ch.${w.chapter} p.${w.page} ${w.title}: ${(w.cov * 100).toFixed(0)} % (missing ${w.missing.join(', ')})`);
const ok = mean >= 0.9 && weak.length === 0 && sections.length > 150;
console.log(`BOOK_CONCEPTS_VERIFY: ${ok ? 'PASS' : 'FAIL'} mean=${(mean * 100).toFixed(0)}% uncovered=${weak.length}`);
process.exit(ok ? 0 : 1);
