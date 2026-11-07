#!/usr/bin/env node
// Does the artifact a ledger row names actually carry that section's substance? For every section of the book,
// this resolves the artifacts its section-ledger row names (protocol § anchors → that section's text; digests;
// DATA.md keys → the protocol paragraphs that define them plus the fixture record; seam verdicts → the seam's
// source; references; scripts; Tier B → the protocol's Tier B text) and measures how many of the section's most
// distinctive terms (tf × idf over the body text) occur inside THOSE artifacts only — not anywhere in forge.
//   node tests/book-substance-verify.cjs <pages.json> <forge-root>
// Terms: the section's most distinctive stems by tf × idf, with proper nouns set aside mechanically (a stem whose cased
// occurrences in the section are mostly capitalized: the products, people and places of the book's worked examples);
// the raw figure including them is reported beside the concept figure.
// Gate: every section ≥ 30 % of its concept terms within its own artifacts and concept mean ≥ 60 %.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const [, , pagesFile, forgeRoot] = process.argv;
if (!pagesFile || !forgeRoot) { console.error('usage: book-substance-verify.cjs <pages.json> <forge-root>'); process.exit(2); }
const { pages } = JSON.parse(fs.readFileSync(pagesFile, 'utf8'));
const firstBody = pages.find(p => /CHAPTER 1\b/.test(p.text) && /Trade-?Offs in Data Systems Architecture/i.test(p.text));
if (!firstBody) { console.error('cannot locate chapter 1 in the pages file'); process.exit(2); }
const offset = firstBody.pdf_page - 1;
const bookPage = n => pages[n + offset - 1] ? pages[n + offset - 1].text : '';
const STOP = new Set(('a an and are as at be been being but by can could do does for from had has have how if in into is it its may might more most must no not of on or our over should so some such than that the their them then there these they this those to under up use used using very was we were what when where which while who will with within without would you your also however example figure figures chapter section like many one two first second case cases called known shown way make makes each other because between both after before about still just much every any all only even see say says said well need needs often per via etc new old same different another either neither rather usually sometimes typically generally particular particularly especially simply quite less least several various kind kinds part parts point points thing things term terms means mean described discussed discuss discussion look looks instead already whether ever never always itself themselves version versions number numbers value values set sets get gets take takes give gives put puts end ends start starts lot lots later earlier large small long short high low good bad better best worse worst important possible impossible available problem problems approach approaches process processes processing system systems data database databases application applications').split(/\s+/));
const stem = w => w.replace(/(ization|izations|isation|ations|ation|ingly|ities|ity|ies|ing|ers|er|ed|es|s|ly)$/, '').replace(/(.)\1$/, '$1');
const tokens = text => text.toLowerCase().replace(/[‑–—-]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)).map(stem).filter(w => w.length >= 3);
const norm = s => s.toLowerCase().replace(/[‑–—-]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// sections (summaries as boundaries, not checked)
const toc = fs.readFileSync(path.join(forgeRoot, 'tests', 'fixtures', 'data', 'ddia2-toc.tsv'), 'utf8').replace(/\r\n/g, '\n').split('\n').slice(1).filter(Boolean).map(l => { const [chapter, page, title] = l.split('\t'); return { chapter: Number(chapter), page: Number(page), title, isSummary: title === 'Summary' }; });
const sections = toc.filter(e => !e.isSummary);
const bounds = new Map(); toc.forEach((e, i) => { const nx = toc[i + 1]; bounds.set(e, nx && nx.chapter === e.chapter ? nx.page : e.page + 6); });
const rawTexts = sections.map(e => { let t = ''; for (let n = e.page; n < Math.max(e.page + 1, bounds.get(e)); n++) t += ' ' + bookPage(n); return t; });
const texts = rawTexts.map(t => tokens(t));
// a stem is a proper noun (a product, a person, a place in a worked example) when most of its cased occurrences are capitalized
const properStems = raw => { const cap = new Map(), all = new Map(); for (const w of raw.replace(/[‑–—-]/g, ' ').split(/[^A-Za-z0-9]+/)) { if (w.length < 4) continue; const k = stem(w.toLowerCase()); if (STOP.has(w.toLowerCase()) || k.length < 3) continue; all.set(k, (all.get(k) || 0) + 1); if (/^[A-Z]/.test(w)) cap.set(k, (cap.get(k) || 0) + 1); } const out = new Set(); for (const [k, n] of all) if ((cap.get(k) || 0) / n >= 0.5) out.add(k); return out; };
const df = new Map(); for (const toks of texts) for (const w of new Set(toks)) df.set(w, (df.get(w) || 0) + 1);
const N = texts.length;
// artifacts
const R = path.join(forgeRoot, '.claude', 'skills', 'forge', 'references'), C = path.join(forgeRoot, '.claude', 'commands', 'forge');
const read = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : '';
const proto = read(path.join(R, 'data-intensive-protocol.md'));
const protoLines = proto.split('\n');
const headingAt = i => { const m = /^(#{2,3})\s+(§\d+(?:\.\d+)?|(\d+\.\d+))/.exec(protoLines[i]); return m ? { level: m[1].length, id: m[2].startsWith('§') ? m[2] : '§' + m[2] } : null; };
const sectionText = anchor => { // § anchor → text from its heading to the next heading of the same or higher level
  for (let i = 0; i < protoLines.length; i++) { const h = headingAt(i); if (h && h.id === anchor) { let out = ''; for (let j = i; j < protoLines.length; j++) { const h2 = j > i ? headingAt(j) : null; if (h2 && h2.level <= h.level) break; out += protoLines[j] + '\n'; } return out; } }
  // a §n anchor also covers its §n.m subsections; a §n.m anchor with no heading falls back to lines mentioning it
  return protoLines.filter(l => l.includes(anchor)).join('\n');
};
const keyText = key => protoLines.filter(l => l.includes('`' + key)).join('\n') + '\n' + read(path.join(forgeRoot, 'tests', 'fixtures', 'data', 'DATA.md'));
const seamText = { DATA_LINT: 'data-score.cjs', DATA_SLO: 'data-score.cjs', DATA_INDEXES: 'data-score.cjs', MIGRATION_SAFETY: 'data-score.cjs', DATA_RECONCILE: 'data-score.cjs', DATA_COVERAGE: 'data-score.cjs', RECOVERED: 'operational.cjs', STACK_DECISION: 'score-requirements.sh', SLOP_GATE: 'score-design.sh', REQ_COVERAGE: 'score-build.sh' };
const refs = ['stack-selection-protocol', 'fullstack-hardening-checklist', 'security-checklist', 'operational-recovery', 'ci-protocol', 'design-protocol', 'data-intensive-book-map', 'data-intensive-metrics-research'];
const tierB = protoLines.filter(l => /Tier B/.test(l)).join('\n');
const resolve = cell => {
  let t = '';
  for (const m of cell.matchAll(/§(\d+(?:\.\d+)?)/g)) t += '\n' + sectionText('§' + m[1]);
  for (const m of cell.matchAll(/`((?:workload|slo|model|integrity|evolution|durability|derived|retention)(?:\.[a-z_*]+)*)`/g)) t += '\n' + keyText(m[1].split('.')[0]) + '\n' + keyText(m[1]);
  for (const [v, f] of Object.entries(seamText)) if (cell.includes(v)) t += '\n' + read(path.join(forgeRoot, 'scripts', f));
  for (const s of ['data-score.cjs', 'data-load.cjs', 'operational.cjs']) if (cell.includes(s)) t += '\n' + read(path.join(forgeRoot, 'scripts', s));
  for (const r of refs) if (cell.includes(r)) t += '\n' + read(path.join(R, r + '.md'));
  for (const m of cell.matchAll(/digest-ch(\d\d)/g)) t += '\n' + read(path.join(R, `data-intensive-digest-ch${m[1]}.md`));
  if (/Tier B/.test(cell)) t += '\n' + tierB;
  for (const d of ['`hardening`', '`monitoring`', '`devops`', '`ux`', '`logic`', '`functional`', '`data`']) if (cell.includes(d)) t += '\n' + sectionText('§6') + '\n' + read(path.join(R, 'fullstack-hardening-checklist.md'));
  if (/build command|runbook|build Phase|Phase [0-9]/.test(cell)) t += '\n' + read(path.join(C, 'build.md'));
  if (/§3 round|data round|§3 data/.test(cell)) t += '\n' + read(path.join(C, 'requirements.md'));
  return t;
};
const ledger = read(path.join(R, 'data-intensive-section-ledger.md'));
const rows = ledger.split('\n').filter(l => /^\| *\d+ *\| *\d+ *\|/.test(l)).map(l => { const c = l.split('|').map(x => x.trim()); return { chapter: Number(c[1]), page: Number(c[2]), title: c[3], encoding: c[5] || '' }; });
const K = 10; let total = 0, totalRaw = 0; const weak = []; const perChapter = {};
sections.forEach((e, i) => {
  const row = rows.find(r => r.chapter === e.chapter && norm(r.title) === norm(e.title));
  const tf = new Map(); for (const w of texts[i]) tf.set(w, (tf.get(w) || 0) + 1);
  const ranked = [...tf.entries()].filter(([, c]) => c >= 2).map(([w, c]) => [w, c * Math.log(N / (df.get(w) || 1))]).sort((a, b) => b[1] - a[1]).map(([w]) => w);
  const proper = properStems(rawTexts[i]);
  const rawTerms = ranked.slice(0, K), terms = ranked.filter(w => !proper.has(w)).slice(0, K); // concept terms: names of products, people and places in examples set aside
  const art = new Set(tokens(row ? resolve(row.encoding) : ''));
  const covRaw = rawTerms.length ? rawTerms.filter(w => art.has(w)).length / rawTerms.length : 1; totalRaw += covRaw;
  const cov = terms.length ? terms.filter(w => art.has(w)).length / terms.length : 1; total += cov;
  (perChapter[e.chapter] ||= []).push(cov);
  if (cov < 0.3) weak.push({ e, cov, missing: terms.filter(w => !art.has(w)), encoding: row ? row.encoding : '(no row)' });
});
const mean = total / sections.length, meanRaw = totalRaw / sections.length;
console.log(`BOOK_SUBSTANCE: sections=${sections.length} (concept terms per section ${K}, proper nouns of worked examples set aside; measured inside each row's own artifacts; raw mean incl. proper nouns ${(meanRaw * 100).toFixed(0)} %)`);
for (const [ch, covs] of Object.entries(perChapter)) console.log(`  chapter ${String(ch).padStart(2)}: mean ${(covs.reduce((a, b) => a + b, 0) / covs.length * 100).toFixed(0)} % over ${covs.length} sections, under 30 %: ${covs.filter(c => c < 0.3).length}`);
for (const w of weak) console.log(`  WEAK ch.${w.e.chapter} p.${w.e.page} ${w.e.title}: ${(w.cov * 100).toFixed(0)} % (missing ${w.missing.join(', ')}) ← ${w.encoding.slice(0, 90)}`);
const ok = mean >= 0.6 && weak.length === 0;
console.log(`BOOK_SUBSTANCE_VERIFY: ${ok ? 'PASS' : 'FAIL'} concept_mean=${(mean * 100).toFixed(0)}% raw_mean=${(meanRaw * 100).toFixed(0)}% weak=${weak.length}`);
process.exit(ok ? 0 : 1);
