#!/usr/bin/env node
// Is every quoted passage in the metrics research ledger really in its source? This fetches each cited source whole
// (no summarization), saves the text, then locates every "quoted passage" of the ledger's rows verbatim —
// whitespace-, quote- and emphasis-insensitive — in a fetched source or in the book's page text, and generates
// the ledger's "Source reading log" from the fetch manifest (what was fetched, when, how big, how many quotes it
// carries). Nothing in the log is written by hand.
//   node tests/book-research-verify.cjs <ledger.md> <pages.json> <sources-dir> [--fetch] [--write-log]
//   --fetch      fetch the sources into <sources-dir> (network); without it, the saved texts are used
//   --write-log  replace the ledger's "## Source reading log" section with the generated one
'use strict';
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2), flags = new Set(args.filter(a => a.startsWith('--')));
const [ledgerFile, pagesFile, dir] = args.filter(a => !a.startsWith('--'));
if (!ledgerFile || !pagesFile || !dir) { console.error('usage: book-research-verify.cjs <ledger.md> <pages.json> <sources-dir> [--fetch] [--write-log]'); process.exit(2); }
const raw = fs.readFileSync(ledgerFile, 'utf8'), crlf = raw.includes('\r\n'), ledger = raw.replace(/\r\n/g, '\n');
const urls = [...new Set([...ledger.matchAll(/https?:\/\/[^\s)>`]+/g)].map(m => m[0].replace(/[.,]$/, '')))];
const decode = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&hellip;/g, '…').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
const toText = (body, type) => /html/i.test(type) ? decode(body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')) : body;
const norm = s => s.toLowerCase().replace(/[“”"‘’'`*_]/g, '').replace(/[–—‑-]/g, '-').replace(/\s+/g, '');
const fileFor = u => path.join(dir, u.replace(/^https?:\/\//, '').replace(/[^A-Za-z0-9.]+/g, '_').slice(0, 120) + '.txt');
const get = async u => { const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (forge research-ledger verification)', accept: 'application/vnd.github.raw+json, text/html, text/plain, */*' }, redirect: 'follow' }); return { status: r.status, body: await r.text(), type: r.headers.get('content-type') || '' }; };
async function fetchAll() {
  fs.mkdirSync(dir, { recursive: true });
  const manifest = { fetched_at: new Date().toISOString(), sources: [] };
  for (const u of urls) {
    const entry = { url: u };
    try {
      let { status, body, type } = await get(u); let text = toText(body, type); entry.status = status; entry.bytes = body.length;
      const gh = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(u); // a repository page: its README comes whole through the API
      if (gh) { const r = await get(`https://api.github.com/repos/${gh[1]}/${gh[2]}/readme`); entry.readme_status = r.status; entry.readme_bytes = r.body.length; if (r.status === 200) text += '\n' + r.body; }
      fs.writeFileSync(fileFor(u), text); entry.text_chars = text.length; entry.file = path.basename(fileFor(u));
    } catch (e) { entry.status = 'ERR'; entry.error = String(e.cause && (e.cause.code || e.cause.message) || e.message).slice(0, 100); }
    manifest.sources.push(entry);
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
(async () => {
  const manifest = flags.has('--fetch') ? await fetchAll() : JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  console.log(`SOURCES: ${manifest.sources.length} fetched ${manifest.fetched_at}`);
  const texts = {}; for (const s of manifest.sources) if (s.file && fs.existsSync(path.join(dir, s.file))) texts[s.url] = norm(fs.readFileSync(path.join(dir, s.file), 'utf8'));
  const { pages } = JSON.parse(fs.readFileSync(pagesFile, 'utf8')); texts.book = norm(pages.map(p => p.text).join(' '));
  // the checked region: from the first row section to the generated log; table rows contribute every cell but the first (the candidate label)
  const lines = ledger.split('\n'); const start = lines.findIndex(l => /^## Row /.test(l)); const end = lines.findIndex((l, i) => i > start && /^## Source reading log/.test(l));
  let total = 0, found = 0; const missing = [], perSource = {}; let section = '';
  for (const line of lines.slice(start, end < 0 ? undefined : end)) {
    if (/^## /.test(line)) { section = line.replace(/^## /, '').slice(0, 44); continue; }
    if (/^\|\s*-+\s*\|/.test(line) || /^\| Candidate \|/.test(line)) continue;
    const scope = line.startsWith('|') ? line.split('|').slice(2).join('|') : line;
    for (const q of scope.matchAll(/"([^"]{10,})"/g)) for (const frag of q[1].split(/…|\.\.\./).map(s => norm(s).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')).filter(s => s.length >= 10)) {
      total++; const hit = Object.keys(texts).find(k => texts[k].includes(frag));
      if (hit) { found++; perSource[hit] = (perSource[hit] || 0) + 1; } else { missing.push({ section, frag: q[1].slice(0, 100) }); console.log(`  MISSING [${section}] ${q[1].slice(0, 110)}`); }
    }
  }
  console.log(`QUOTES: ${found}/${total} quoted fragments located verbatim in a fetched source or the book; missing=${missing.length}`);
  const rows = manifest.sources.map(s => `| ${s.url} | ${s.status}${s.readme_status ? ` (README via API ${s.readme_status})` : ''} | ${s.text_chars ?? '-'} | ${perSource[s.url] || 0} |`);
  const log = [`## Source reading log`, ``, `Generated by \`tests/book-research-verify.cjs --fetch --write-log\` on ${manifest.fetched_at}: every source below was fetched whole (no summarization) and saved; every quoted passage in the rows above was then located verbatim — whitespace-, quote- and emphasis-insensitive — in a fetched text or in the book's page text (${found}/${total} fragments; book: ${perSource.book || 0}). A source with 0 fragments is cited for a rule name or a definition rather than quoted. Re-run the command to refresh this table.`, ``, `| Source | HTTP | Text chars | Quoted fragments located here |`, `|---|---|---|---|`, ...rows, ``].join('\n');
  if (flags.has('--write-log')) {
    const next = lines.findIndex((l, i) => i > end && /^## /.test(l));
    const out = [...lines.slice(0, end), ...log.split('\n'), ...lines.slice(next)].join('\n');
    fs.writeFileSync(ledgerFile, crlf ? out.replace(/\n/g, '\r\n') : out); console.log('LOG: written into the ledger');
  }
  const ok = missing.length === 0 && manifest.sources.every(s => s.status === 200);
  console.log(`BOOK_RESEARCH_VERIFY: ${ok ? 'PASS' : 'FAIL'} sources=${manifest.sources.filter(s => s.status === 200).length}/${manifest.sources.length} quotes=${found}/${total}`);
  process.exit(ok ? 0 : 1);
})();
