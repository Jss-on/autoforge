#!/usr/bin/env node
// Verifies references/data-intensive-book-map.md against the book's body text, both ways (stdlib only):
//  (a) every map row's section titles occur on the book pages the row cites (±1 page);
//  (b) every entry of the book's own table of contents is covered by a map row (page range or title).
// The book is copyrighted and not in this repository: pass a pages JSON extracted locally
// ({pages:[{pdf_page, text}]}, e.g. with pdf.js) as DDIA_PAGES_JSON. Without it, test-data.sh skips this check.
//   node tests/book-map-verify.cjs <pages.json> <book-map.md>   → exit 0 iff (a) and (b) are complete
'use strict';
const fs = require('node:fs');
const [, , pagesFile, mapFile] = process.argv;
if (!pagesFile || !mapFile) { console.error('usage: book-map-verify.cjs <pages.json> <book-map.md>'); process.exit(2); }
const { pages } = JSON.parse(fs.readFileSync(pagesFile, 'utf8'));
const md = fs.readFileSync(mapFile, 'utf8');
const norm = s => s.toLowerCase().replace(/[‑–—-]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const firstBody = pages.find(p => /CHAPTER 1\b/.test(p.text) && /Trade-?Offs in Data Systems Architecture/i.test(p.text));
if (!firstBody) { console.error('cannot locate chapter 1 in the pages file'); process.exit(2); }
const offset = firstBody.pdf_page - 1;
const bookPage = n => pages[n + offset - 1] ? norm(pages[n + offset - 1].text) : '';
const window = (a, b) => { let t = ''; for (let n = Math.max(1, a - 1); n <= b + 1; n++) t += ' ' + bookPage(n); return t; };
const STOP = new Set(['and', 'the', 'of', 'for', 'in', 'versus', 'with', 'data', 'a', 'to', 'by', 'on', 'vs', 'its', 'through', 'as', 'an', 'or', 'between']);
const keywords = title => norm(title).split(' ').filter(w => w.length >= 3 && !STOP.has(w));
const stem = w => w.replace(/(ies|ing|es|s|ed)$/, '');
const present = (text, title) => { const ks = keywords(title); if (!ks.length) return true; return ks.filter(k => text.includes(stem(k))).length >= Math.ceil(ks.length * 0.6); };
const rows = md.split(/\r?\n/).filter(l => /^\|/.test(l) && !/^\|\s*-/.test(l) && !/^\|\s*Section/i.test(l)).map(l => l.split('|').map(c => c.trim()).filter(Boolean));
let ok = 0; const miss = []; const cited = new Set();
for (const r of rows) {
  const cell = r[0].replace(/\*\*/g, ''); const refs = [...cell.matchAll(/\((\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\)/g)]; if (!refs.length) continue;
  const a = Number(refs[0][1]), b = Number(refs[refs.length - 1][2] || refs[refs.length - 1][1]); for (let n = a; n <= b; n++) cited.add(n);
  const titles = cell.replace(/\([^)]*\)/g, '').split(';').map(s => s.trim()).filter(Boolean); const text = window(a, b);
  const bad = titles.filter(t => !present(text, t)); if (bad.length) miss.push(`pp.${a}-${b}: ${bad.join(' ; ')}`); else ok++;
}
const tocText = pages.slice(0, 20).map(p => p.text).join('\n');
const toc = tocText.split('\n').map(l => l.trim()).filter(l => /^[A-Z].*\s\d{1,3}$/.test(l) && !/^(Preface|Glossary|Index)/.test(l) && !/Table of Contents/.test(l))
  .map(l => { const m = /^(.*?)[\s.]*(\d{1,3})$/.exec(l); return { title: m[1].replace(/\.+$/, '').trim(), page: Number(m[2]) }; }).filter(e => e.page >= 1 && e.page <= 601 && e.title.length > 3);
const mapText = norm(md); const uncovered = toc.filter(e => !cited.has(e.page) && !present(mapText, e.title.replace(/^\d+\.\s*/, '')));
console.log(`BOOK_MAP_ROWS: ${ok}/${ok + miss.length} titles found on their cited pages`); for (const m of miss) console.log('  unmatched ' + m);
console.log(`BOOK_MAP_TOC: ${toc.length - uncovered.length}/${toc.length} table-of-contents entries covered`); for (const u of uncovered) console.log(`  uncovered p.${u.page} ${u.title}`);
console.log(`BOOK_MAP_VERIFY: ${miss.length === 0 && uncovered.length === 0 && toc.length > 150 ? 'PASS' : 'FAIL'} pages_cited=${cited.size} body_pages=${pages.length - offset}`);
process.exit(miss.length === 0 && uncovered.length === 0 && toc.length > 150 ? 0 : 1);
