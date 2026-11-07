#!/usr/bin/env node
// Verifies references/data-intensive-section-ledger.md: one row per section of the book's table of contents
// (tests/fixtures/data/ddia2-toc.tsv: chapter, page, title), each stating the mechanism the section teaches and
// the forge artifact that encodes it. Every encoding cell must name at least one artifact that exists:
//  - a protocol anchor (§n or §n.m present in data-intensive-protocol.md), or a digest (digest-chNN),
//  - a DATA.md key (group or group.key from the protocol's §4 schema / the fixture DATA.md),
//  - a seam verdict (DATA_LINT, DATA_SLO, DATA_INDEXES, MIGRATION_SAFETY, DATA_RECONCILE, DATA_COVERAGE, RECOVERED),
//  - a canonical acceptance row id (data-…, from protocol §6) or a build dimension/row named in the protocol,
//  - the stack-selection protocol, the hardening checklist, or a seam script name.
// Rows may not say "n/a"; the mechanism cell must be a sentence of at least six words.
//   node tests/book-ledger-verify.cjs <forge-root>
'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = process.argv[2] || '.';
const R = path.join(root, '.claude', 'skills', 'forge', 'references');
const ledger = fs.readFileSync(path.join(R, 'data-intensive-section-ledger.md'), 'utf8').replace(/\r\n/g, '\n');
const proto = fs.readFileSync(path.join(R, 'data-intensive-protocol.md'), 'utf8');
const toc = fs.readFileSync(path.join(root, 'tests', 'fixtures', 'data', 'ddia2-toc.tsv'), 'utf8').replace(/\r\n/g, '\n').split('\n').slice(1).filter(Boolean).map(l => { const [chapter, page, title] = l.split('\t'); return { chapter: Number(chapter), page: Number(page), title }; });
const norm = s => s.toLowerCase().replace(/[‑–—-]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// artifact vocabulary
const anchors = new Set([...proto.matchAll(/§(\d+(?:\.\d+)?)/g)].map(m => '§' + m[1]));
const keys = new Set(); for (const m of proto.matchAll(/`((?:workload|slo|model|integrity|evolution|durability|derived|retention)(?:\.[a-z_]+)*)`/g)) keys.add(m[1]);
for (const g of ['workload', 'slo', 'model', 'integrity', 'evolution', 'durability', 'derived', 'retention']) keys.add(g);
const fixture = path.join(root, 'tests', 'fixtures', 'data', 'DATA.md'); if (fs.existsSync(fixture)) for (const m of fs.readFileSync(fixture, 'utf8').matchAll(/^\s{0,4}([a-z_]+):/gm)) keys.add(m[1]);
const verdicts = ['DATA_LINT', 'DATA_SLO', 'DATA_INDEXES', 'MIGRATION_SAFETY', 'DATA_RECONCILE', 'DATA_COVERAGE', 'RECOVERED', 'STACK_DECISION', 'SLOP_GATE', 'REQ_COVERAGE'];
const rowIds = new Set([...proto.matchAll(/`(data-[a-z0-9-]+)`/g)].map(m => m[1]));
const scripts = ['data-score.cjs', 'data-load.cjs', 'operational.cjs', 'score-build.sh', 'score-requirements.sh', 'score-design.sh', 'design-scan.cjs', 'semver.cjs'];
const refs = ['stack-selection-protocol', 'fullstack-hardening-checklist', 'security-checklist', 'operational-recovery', 'ci-protocol', 'design-protocol', 'data-intensive-book-map', 'data-intensive-metrics-research'];
const dims = ['`logic`', '`functional`', '`ux`', '`devops`', '`monitoring`', '`hardening`', '`data`', 'Tier B'];
const recognizes = cell => {
  const found = [];
  for (const a of anchors) if (cell.includes(a)) found.push(a);
  for (const k of keys) if (new RegExp('`' + k.replace(/\./g, '\\.') + '(?:\\.[a-z_]+)*`').test(cell)) found.push(k);
  for (const v of verdicts) if (cell.includes(v)) found.push(v);
  for (const r of rowIds) if (cell.includes('`' + r + '`')) found.push(r);
  for (const s of scripts) if (cell.includes(s)) found.push(s);
  for (const r of refs) if (cell.includes(r)) found.push(r);
  for (const d of dims) if (cell.includes(d)) found.push(d);
  if (/digest-ch\d\d/.test(cell)) found.push('digest');
  return found;
};
const rows = ledger.split('\n').filter(l => /^\| *\d+ *\| *\d+ *\|/.test(l)).map(l => { const c = l.split('|').map(x => x.trim()); return { chapter: Number(c[1]), page: Number(c[2]), title: c[3], mechanism: c[4] || '', encoding: c[5] || '' }; });
let ok = 0; const problems = [];
for (const e of toc) {
  const r = rows.find(x => x.chapter === e.chapter && x.page === e.page && norm(x.title) === norm(e.title)) || rows.find(x => x.chapter === e.chapter && norm(x.title) === norm(e.title));
  if (!r) { problems.push(`missing row: ch.${e.chapter} p.${e.page} ${e.title}`); continue; }
  if (r.page !== e.page) { problems.push(`page mismatch: ch.${e.chapter} ${e.title} ledger p.${r.page} toc p.${e.page}`); continue; }
  if (/\bn\/a\b/i.test(r.encoding) || /\bn\/a\b/i.test(r.mechanism)) { problems.push(`n/a: ch.${e.chapter} p.${e.page} ${e.title}`); continue; }
  if (r.mechanism.split(/\s+/).length < 6) { problems.push(`mechanism too thin: ch.${e.chapter} p.${e.page} ${e.title}`); continue; }
  const found = recognizes(r.encoding); if (!found.length) { problems.push(`encoding names no existing artifact: ch.${e.chapter} p.${e.page} ${e.title} — "${r.encoding.slice(0, 80)}"`); continue; }
  ok++;
}
const extra = rows.filter(r => !toc.some(e => e.chapter === r.chapter && norm(e.title) === norm(r.title)));
console.log(`BOOK_LEDGER: toc_entries=${toc.length} rows=${rows.length} verified=${ok} problems=${problems.length} extra_rows=${extra.length} vocabulary: anchors=${anchors.size} keys=${keys.size} row_ids=${rowIds.size}`);
for (const p of problems.slice(0, 40)) console.log('  ' + p);
for (const x of extra.slice(0, 10)) console.log(`  extra row not in toc: ch.${x.chapter} p.${x.page} ${x.title}`);
const pass = problems.length === 0 && extra.length === 0 && toc.length >= 200;
console.log(`BOOK_LEDGER_VERIFY: ${pass ? 'PASS' : 'FAIL'} sections=${toc.length} verified=${ok}`);
process.exit(pass ? 0 : 1);
