#!/usr/bin/env node
// Content-level coverage of the book in forge (stdlib only). Title presence (tests/book-map-verify.cjs) is not
// content presence, so this check takes every section of the book's table of contents, extracts the section's
// most distinctive terms (tf × idf across sections, stemmed) from the body text, and asks how many of them occur
// in forge's data-intensive corpus: the protocol, the book map, the fourteen chapter digests, the stack and
// operational protocols, the requirements/build commands and the data seams.
//   node tests/book-concepts-verify.cjs <pages.json> <forge-root>   (pages.json: {pages:[{pdf_page,text}]}, extracted locally)
// Gate: mean coverage ≥ 90 % and at most 3 sections under 50 % (the residue is citation lists and example identifiers).
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
const tocText = pages.slice(0, 20).map(p => p.text).join('\n');
const toc = tocText.split('\n').map(l => l.trim()).filter(l => /^[A-Z0-9].*\s\d{1,3}$/.test(l) && !/^(Preface|Glossary|Index)/.test(l) && !/Table of Contents/.test(l))
  .map(l => { const m = /^(.*?)[\s.]*(\d{1,3})$/.exec(l); return { title: m[1].replace(/\.+$/, '').trim(), page: Number(m[2]) }; }).filter(e => e.page >= 1 && e.page <= 601 && e.title.length > 3 && !/^Summary$/.test(e.title));
let chapter = 0; for (const e of toc) { const m = /^(\d+)\.\s/.exec(e.title); if (m) { chapter = Number(m[1]); e.isChapter = true; } e.chapter = chapter; }
const sections = toc.filter(e => !e.isChapter);
const texts = sections.map((e, i) => { const next = sections[i + 1] && sections[i + 1].chapter === e.chapter ? sections[i + 1].page : e.page + 6; let t = ''; for (let n = e.page; n < Math.max(e.page + 1, next); n++) t += ' ' + bookPage(n); return tokens(t); });
const df = new Map(); for (const toks of texts) for (const w of new Set(toks)) df.set(w, (df.get(w) || 0) + 1);
const N = texts.length;
const R = path.join(forgeRoot, '.claude', 'skills', 'forge', 'references'), C = path.join(forgeRoot, '.claude', 'commands', 'forge');
const files = [path.join(R, 'data-intensive-protocol.md'), path.join(R, 'data-intensive-book-map.md'), path.join(R, 'stack-selection-protocol.md'), path.join(R, 'operational-recovery.md'), path.join(R, 'ci-protocol.md'), path.join(R, 'security-checklist.md'), path.join(R, 'fullstack-hardening-checklist.md'), path.join(C, 'build.md'), path.join(C, 'requirements.md'), path.join(forgeRoot, 'scripts', 'data-score.cjs'), path.join(forgeRoot, 'scripts', 'data-load.cjs'), path.join(forgeRoot, 'scripts', 'operational.cjs'), path.join(forgeRoot, 'tests', 'fixtures', 'data', 'DATA.md')];
for (const f of fs.readdirSync(R)) if (/^data-intensive-digest-ch\d\d\.md$/.test(f)) files.push(path.join(R, f));
const present = files.filter(f => fs.existsSync(f));
const corpus = new Set(tokens(present.map(f => fs.readFileSync(f, 'utf8')).join('\n')));
const K = 10; const perChapter = {}; const weak = []; let total = 0;
sections.forEach((e, i) => {
  const tf = new Map(); for (const w of texts[i]) tf.set(w, (tf.get(w) || 0) + 1);
  const terms = [...tf.entries()].filter(([, c]) => c >= 2).map(([w, c]) => [w, c * Math.log(N / (df.get(w) || 1))]).sort((a, b) => b[1] - a[1]).slice(0, K).map(([w]) => w);
  const cov = terms.length ? terms.filter(w => corpus.has(w)).length / terms.length : 1; total += cov;
  (perChapter[e.chapter] ||= []).push(cov);
  if (cov < 0.5) weak.push({ chapter: e.chapter, page: e.page, title: e.title, cov, missing: terms.filter(w => !corpus.has(w)) });
});
const mean = total / sections.length;
console.log(`BOOK_CONCEPTS: sections=${sections.length} corpus_files=${present.length} vocabulary=${corpus.size}`);
for (const [ch, covs] of Object.entries(perChapter)) console.log(`  chapter ${String(ch).padStart(2)}: mean ${(covs.reduce((a, b) => a + b, 0) / covs.length * 100).toFixed(0)} % over ${covs.length} sections, under 50 %: ${covs.filter(c => c < 0.5).length}`);
for (const w of weak) console.log(`  weak ch.${w.chapter} p.${w.page} ${w.title}: ${(w.cov * 100).toFixed(0)} % (missing ${w.missing.join(', ')})`);
const ok = mean >= 0.9 && weak.length <= 3 && sections.length > 150;
console.log(`BOOK_CONCEPTS_VERIFY: ${ok ? 'PASS' : 'FAIL'} mean=${(mean * 100).toFixed(0)}% weak=${weak.length}`);
process.exit(ok ? 0 : 1);
