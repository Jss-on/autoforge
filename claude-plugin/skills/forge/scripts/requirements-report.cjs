'use strict';
// The signed-off requirements as a designed document: a cover with the numbers, a contents page,
// one icon per section, requirement cards with priority and provenance badges, the SRS's Mermaid
// diagrams rendered to real SVG, the run's own images as a gallery, charts drawn from the counts —
// one self-contained HTML (no script, no network) and a PDF printed from it by an installed Chrome.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { pathToFileURL } = require('node:url');
const a = require('./acceptance.cjs'), v = require('./verification.cjs'), ex = require('./investigate-export.cjs');
process.env.NoDefaultCurrentDirectoryInExePath = '1';

const MERMAID = { version: '12.1.0', sha256: '6484afc32872a3aa16cac9a76ba1816a1ed4cc870a6593cc2e17757750f518b2', url: 'https://cdn.jsdelivr.net/npm/mermaid@12.1.0/dist/mermaid.min.js' };
const ID = /\b(FR|NFR|US|SC|UC|GV|TC|NF)-\d+[a-z]?\b/g, CARD_ID = /^(FR|NFR|US|SC|UC|GV|TC)-\d+[a-z]?$/;
const MOSCOW = { must: 'Must', should: 'Should', could: 'Could', "won't": "Won't", wont: "Won't" };
const CHIPS = { stated: 'prov', 'derived-domain': 'prov', 'default-confirmed': 'prov', logic: 'dim', functional: 'dim', ux: 'dim', devops: 'dim', monitoring: 'dim', hardening: 'dim' };
const IMAGE = /\.(?:png|jpe?g|webp)$/i;
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'section';

// ---------------------------------------------------------------- icons (24px, stroke paths) and sections
const ICONS = {
  target: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  layers: 'M12 3 2 8l10 5 10-5-10-5zM2 12l10 5 10-5M2 16l10 5 10-5',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  checklist: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  gauge: 'M12 14l4-4M3.3 17a9 9 0 1 1 17.4 0M12 3v2M4.2 9.5l1.8.8M19.8 9.5l-1.8.8',
  database: 'M12 3c-5 0-8 1.3-8 3s3 3 8 3 8-1.3 8-3-3-3-8-3zM4 6v12c0 1.7 3 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3 3 8 3s8-1.3 8-3',
  diagram: 'M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm12 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 9v3a3 3 0 0 0 3 3h6M18 15V9',
  palette: 'M12 3a9 9 0 0 0 0 18h1a2 2 0 0 0 1.5-3.3 2 2 0 0 1 1.5-3.3H18a4 4 0 0 0 4-4c0-4.4-4.5-7.4-10-7.4zM7 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm3-4a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm5 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  cpu: 'M8 8h8v8H8zM5 5h14v14H5zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4M12 15v2',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  book: 'M4 4a2 2 0 0 1 2-2h14v18H6a2 2 0 0 0-2 2zM4 4v16M8 6h8M8 10h8',
  shield: 'M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3zM9 12l2 2 4-4',
  flag: 'M5 21V4h11l-1 4 1 4H5M5 12h11',
  alert: 'M12 3 2 20h20L12 3zM12 10v4M12 17v1',
  chart: 'M3 21h18M6 17V9M11 17V5M16 17v-6M21 17V3',
  image: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M16 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  file: 'M6 2h8l5 5v15H6zM14 2v5h5M9 13h6M9 17h6',
  sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM5 18l.7 1.8 1.8.7-1.8.7L5 23l-.7-1.8-1.8-.7 1.8-.7zM19 3l.6 1.4L21 5l-1.4.6L19 7l-.6-1.4L17 5l1.4-.6z',
  calendar: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm12-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
};
const icon = (name, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name] || ICONS.file}"/></svg>`;
const SECTION_ICON = [[/glossar|vocabular|term/i, 'book'], [/purpose|goal|stakeholder|overview|summary/i, 'target'], [/scope|priorit/i, 'layers'], [/scenario|stor|day-in-the-life|journey|use.case/i, 'route'],
  [/non-functional|nfr|quality|performance/i, 'gauge'], [/functional|acceptance/i, 'checklist'], [/data|logic|rule|golden|model|comput/i, 'database'], [/diagram/i, 'diagram'],
  [/design|asset|brand/i, 'palette'], [/stack|reuse|technolog|platform/i, 'cpu'], [/secur|threat/i, 'shield'], [/constraint|assumption|won.t|out.of.scope|risk/i, 'lock'],
  [/traceab|validation|plan/i, 'link'], [/provenance|appendix|checklist|history/i, 'book'], [/user|role|persona|actor/i, 'users'], [/deliver|deploy|host|operat|timeline|schedule/i, 'calendar']];
const sectionIcon = title => (SECTION_ICON.find(([re]) => re.test(title)) || [null, 'file'])[1];

// ---------------------------------------------------------------- markdown (the SRS subset)
function parse(md) {
  const lines = md.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n'), blocks = [];
  let i = 0;
  const para = [];
  const flush = () => { if (para.length) { blocks.push({ type: 'para', text: para.join(' ') }); para.length = 0; } };
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if ((m = /^\s*(`{3,}|~{3,})\s*([\w+-]*)/.exec(line))) {
      flush(); const fence = m[1], lang = m[2].toLowerCase(), body = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) body.push(lines[i++]);
      i++; blocks.push({ type: 'code', lang, text: body.join('\n') }); continue;
    }
    if ((m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line))) { flush(); blocks.push({ type: 'heading', level: m[1].length, text: m[2] }); i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); blocks.push({ type: 'hr' }); i++; continue; }
    if ((m = /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/.exec(line))) { flush(); blocks.push({ type: 'image', alt: m[1], src: m[2] }); i++; continue; }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flush(); const cells = l => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
      const header = cells(line), rows = []; i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      blocks.push({ type: 'table', header, rows }); continue;
    }
    if (/^\s*>/.test(line)) {
      flush(); const inner = []; while (i < lines.length && /^\s*>/.test(lines[i])) inner.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ type: 'quote', blocks: parse(inner.join('\n')) }); continue;
    }
    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
      flush(); const items = [];
      while (i < lines.length && (/^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const it = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(lines[i]);
        if (it) items.push({ indent: it[1].length, ordered: it[3] !== undefined, text: it[4] });
        else items[items.length - 1].text += ' ' + lines[i].trim();
        i++;
      }
      blocks.push(nest(items)); continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    para.push(line.trim()); i++;
  }
  flush();
  return blocks;
}
// Deeper indentation opens a child list under the item before it; shallower closes it.
function nest(items) {
  const root = { type: 'list', ordered: items[0].ordered, items: [] }, stack = [{ indent: items[0].indent, list: root }];
  for (const it of items) {
    while (stack.length > 1 && it.indent < stack[stack.length - 1].indent) stack.pop();
    const top = stack[stack.length - 1];
    if (it.indent > top.indent && top.list.items.length) {
      const parent = top.list.items[top.list.items.length - 1];
      parent.children = { type: 'list', ordered: it.ordered, items: [{ text: it.text }] };
      stack.push({ indent: it.indent, list: parent.children });
    } else top.list.items.push({ text: it.text });
  }
  return root;
}
// Inline markup over escaped text: code spans first, then emphasis, links, and the ids every reader scans for.
function inline(text) {
  const codes = [];
  let s = escape(text).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>').replace(/(^|[\s(])_([^_\s][^_]*?)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => /^https?:\/\//.test(u) ? `<a href="${u}">${t}</a>` : `<span class="ref">${t}</span>`);
  s = s.replace(ID, m => `<span class="id id-${m.split('-')[0].toLowerCase()}">${m}</span>`);
  s = s.replace(/\b(Must|Should|Could|Won&#39;t)\b(?=\s*(?:<\/strong>)?(?:[\s.,;:)]|$))/g, m => `<span class="badge badge-${m === 'Won&#39;t' ? 'wont' : m.toLowerCase()}">${m.replace('&#39;', "'")}</span>`);
  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${codes[n]}</code>`);
}
const chip = text => { const k = text.trim().toLowerCase(); return CHIPS[k] ? `<span class="chip chip-${CHIPS[k]}">${escape(text.trim())}</span>` : null; };
const cellHtml = text => text.split(/\s*,\s*/).every(p => chip(p)) && text.trim() ? text.split(/\s*,\s*/).map(chip).join(' ') : inline(text);

// ---------------------------------------------------------------- rendering the blocks
function render(blocks, ctx) {
  const out = [];
  for (const b of blocks) {
    if (b.type === 'heading') {
      if (b.level === 1) { ctx.title ??= b.text; continue; }
      const id = `s-${ctx.sections.length + 1}-${slug(b.text)}`;
      if (b.level === 2) { ctx.sections.push({ id, title: b.text, icon: sectionIcon(b.text) }); out.push(`${ctx.open ? '</section>' : ''}<section class="sec" id="${id}"><h2>${icon(sectionIcon(b.text))}<span>${inline(b.text)}</span></h2>`); ctx.open = true; }
      else out.push(`<h${b.level}>${inline(b.text)}</h${b.level}>`);
    } else if (b.type === 'para') out.push(`<p>${inline(b.text)}</p>`);
    else if (b.type === 'hr') out.push('<hr>');
    else if (b.type === 'quote') out.push(`<blockquote>${render(b.blocks, ctx)}</blockquote>`);
    else if (b.type === 'list') out.push(list(b));
    else if (b.type === 'code') out.push(b.lang === 'mermaid' ? diagram(b.text, ctx) : `<pre class="code"><code>${escape(b.text)}</code></pre>`);
    else if (b.type === 'image') out.push(image(b, ctx));
    else if (b.type === 'table') out.push(table(b, ctx));
  }
  return out.join('\n');
}
const list = b => `<${b.ordered ? 'ol' : 'ul'}>${b.items.map(it => `<li>${inline(it.text)}${it.children ? list(it.children) : ''}</li>`).join('')}</${b.ordered ? 'ol' : 'ul'}>`;
function diagram(source, ctx) {
  const id = `d${ctx.diagrams.length + 1}`, kind = (source.trim().split(/\s+/)[0] || 'diagram').replace(/[^A-Za-z0-9-]/g, '');
  ctx.diagrams.push({ id, source, kind });
  return `<!--diagram:${id}-->`;
}
function image(b, ctx) {
  const file = ctx.file(b.src);
  if (!file) return `<p class="missing">${icon('image', 'icon-sm')} image not in the run: ${escape(b.src)}</p>`;
  ctx.used.add(path.basename(file));
  return `<figure class="shot"><img src="${dataUri(file)}" alt="${escape(b.alt)}">${b.alt ? `<figcaption>${inline(b.alt)}</figcaption>` : ''}</figure>`;
}
function dataUri(file) {
  const bytes = fs.readFileSync(file), mime = bytes[0] === 0x89 ? 'image/png' : bytes[0] === 0xff ? 'image/jpeg' : 'image/webp';
  a.need(bytes.length <= 8 * 1024 * 1024, 'image over 8 MiB: ' + path.basename(file));
  return `data:${mime};base64,${bytes.toString('base64')}`;
}
function table(b, ctx) {
  const cards = /^id$/i.test(b.header[0] || '') && b.rows.length && b.rows.every(r => CARD_ID.test(r[0] || ''));
  for (const r of b.rows) for (const c of r.slice(1)) { const m = /^\s*(?:\*\*)?(Must|Should|Could|Won't)(?:\*\*)?\s*$/i.exec(c); if (m) ctx.moscow[m[1].toLowerCase().replace("'", '')]++; for (const p of c.split(/\s*,\s*/)) if (CHIPS[p.trim().toLowerCase()] === 'dim') ctx.dims[p.trim().toLowerCase()] = (ctx.dims[p.trim().toLowerCase()] || 0) + 1; }
  if (!cards) return `<div class="tablewrap"><table><thead><tr>${b.header.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${b.header.map((_, j) => `<td>${cellHtml(r[j] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return `<div class="cards">${b.rows.map(r => {
    const id = r[0], kind = id.split('-')[0].toLowerCase(), body = r[1] ?? '', lead = /^\s*\*\*([^*]+)\*\*\s*/.exec(body);
    ctx.ids.add(id);
    const rest = lead ? body.slice(lead[0].length) : body;
    const extras = b.header.slice(2).map((h, j) => r[j + 2] ? `<div class="meta"><span class="meta-k">${inline(h)}</span>${cellHtml(r[j + 2])}</div>` : '').join('');
    return `<article class="req req-${kind}"><div class="req-id"><span class="id id-${kind}">${id}</span></div><div class="req-body">${lead ? `<h4>${inline(lead[1])}</h4>` : ''}<p>${inline(rest)}</p>${extras ? `<div class="metas">${extras}</div>` : ''}</div></article>`;
  }).join('')}</div>`;
}

// ---------------------------------------------------------------- charts (SVG from the counts)
function donut(counts) {
  const order = ['must', 'should', 'could', 'wont'], colors = { must: '#e11d48', should: '#f59e0b', could: '#0ea5e9', wont: '#94a3b8' }, total = order.reduce((s, k) => s + (counts[k] || 0), 0);
  if (!total) return '';
  let acc = 0; const r = 42, c = 2 * Math.PI * r;
  const arcs = order.filter(k => counts[k]).map(k => { const len = counts[k] / total * c, s = `<circle r="${r}" cx="60" cy="60" fill="none" stroke="${colors[k]}" stroke-width="18" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 60 60)"/>`; acc += len; return s; }).join('');
  const legend = order.filter(k => counts[k]).map((k, i) => `<g transform="translate(130 ${20 + i * 22})"><rect width="12" height="12" rx="3" fill="${colors[k]}"/><text x="18" y="11">${MOSCOW[k === 'wont' ? "won't" : k]} · ${counts[k]}</text></g>`).join('');
  return `<figure class="chart"><svg viewBox="0 0 260 120" role="img" aria-label="Priorities">${arcs}<text x="60" y="65" text-anchor="middle" class="big">${total}</text>${legend}</svg><figcaption>Priority (MoSCoW) of the tabled requirements</figcaption></figure>`;
}
function bars(dims) {
  const keys = Object.keys(dims).filter(k => dims[k]); if (!keys.length) return '';
  const max = Math.max(...keys.map(k => dims[k])), colors = { logic: '#7c3aed', functional: '#2563eb', ux: '#db2777', devops: '#0891b2', monitoring: '#059669', hardening: '#d97706' };
  const rows = keys.map((k, i) => `<g transform="translate(0 ${i * 24})"><text x="88" y="15" text-anchor="end">${k}</text><rect x="96" y="3" width="${Math.max(4, 150 * dims[k] / max)}" height="16" rx="4" fill="${colors[k] || '#64748b'}"/><text x="${102 + 150 * dims[k] / max}" y="15">${dims[k]}</text></g>`).join('');
  return `<figure class="chart"><svg viewBox="0 0 280 ${keys.length * 24 + 4}" role="img" aria-label="Requirements by build dimension">${rows}</svg><figcaption>Requirements by build dimension</figcaption></figure>`;
}

// ---------------------------------------------------------------- Mermaid, rendered once by Chrome into static SVG
function mermaidLibrary() {
  const custom = process.env.FORGE_MERMAID;
  if (custom) { a.need(fs.existsSync(custom), 'FORGE_MERMAID does not exist: ' + custom); return { file: custom, source: 'FORGE_MERMAID' }; }
  const dir = path.join(os.homedir(), '.cache', 'forge'), file = path.join(dir, `mermaid-${MERMAID.version}.min.js`);
  if (fs.existsSync(file) && a.sha(fs.readFileSync(file)) === MERMAID.sha256) return { file, source: 'cache' };
  return { file, source: 'download', dir };
}
async function fetchMermaid(lib) {
  if (lib.source !== 'download') return lib;
  try {
    const res = await fetch(MERMAID.url, { signal: AbortSignal.timeout(90000) });
    a.need(res.ok, `HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    a.need(a.sha(bytes) === MERMAID.sha256, 'the downloaded Mermaid build does not match the pinned hash');
    fs.mkdirSync(lib.dir, { recursive: true }); fs.writeFileSync(lib.file, bytes);
    return { file: lib.file, source: 'downloaded' };
  } catch (e) { return { file: null, source: 'unavailable', reason: `Mermaid ${MERMAID.version} could not be fetched (${e.message}); diagrams are shown as source` }; }
}
async function renderDiagrams(root, diagrams) {
  const svgs = new Map(); if (!diagrams.length) return { svgs, note: null };
  const chrome = ex.executable('pdf');
  if (!chrome) return { svgs, note: 'Chrome/Edge was not found; diagrams are shown as source (FORGE_CHROME may name an executable)' };
  const lib = await fetchMermaid(mermaidLibrary());
  if (!lib.file) return { svgs, note: lib.reason };
  const temporary = fs.mkdtempSync(path.join(root, '.requirements-report-'));
  try {
    const page = `<!doctype html><html><head><meta charset="utf-8"><script>${fs.readFileSync(lib.file, 'utf8')}</script></head><body>
${diagrams.map(d => `<pre class="mermaid" id="${d.id}">${escape(d.source)}</pre>`).join('\n')}
<script>mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', fontFamily: 'Segoe UI, Helvetica, Arial, sans-serif', themeVariables: { primaryColor: '#e0e7ff', primaryBorderColor: '#4f46e5', primaryTextColor: '#1e1b4b', lineColor: '#475569', secondaryColor: '#ccfbf1', tertiaryColor: '#fef3c7', fontSize: '14px' } });
mermaid.run({ querySelector: '.mermaid' }).then(() => document.body.setAttribute('data-done', 'yes')).catch(e => document.body.setAttribute('data-done', 'error: ' + e.message));</script></body></html>`;
    const input = path.join(temporary, 'diagrams.html'); fs.writeFileSync(input, page);
    const r = await v.run([chrome, ...ex.CHROME_ARGS, '--user-data-dir=' + path.join(temporary, 'profile'), '--virtual-time-budget=30000', '--dump-dom', pathToFileURL(input).href], { cwd: temporary, env: process.env, timeout_ms: 120000, output_limit: 64 * 1024 * 1024 });
    if (r.error || r.exit_code !== 0) return { svgs, note: 'Chrome could not render the diagrams: ' + (r.error || 'exit ' + r.exit_code) };
    for (const d of diagrams) {
      const m = new RegExp(`<pre[^>]*id="${d.id}"[^>]*>([\\s\\S]*?)</pre>`).exec(r.stdout), inner = m ? m[1] : '';
      if (/<svg[\s>]/.test(inner) && !/aria-roledescription="error"|Syntax error in text/i.test(inner)) svgs.set(d.id, inner.slice(inner.indexOf('<svg')));
    }
    return { svgs, note: svgs.size === diagrams.length ? null : `${diagrams.length - svgs.size} diagram(s) did not render and are shown as source` };
  } finally { try { fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a profile still closing */ } }
}

// ---------------------------------------------------------------- the document
const CSS = `
:root{--ink:#0f172a;--muted:#475569;--line:#e2e8f0;--paper:#fff;--wash:#f8fafc;--p:#4f46e5;--p2:#7c3aed;--t:#0d9488;--amber:#d97706;--rose:#e11d48;--sky:#0284c7}
*{box-sizing:border-box}html{color-scheme:light}body{margin:0;background:#e9edf3;color:var(--ink);font:11pt/1.55 "Segoe UI",system-ui,-apple-system,Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{background:var(--paper);max-width:210mm;margin:16px auto;padding:18mm 16mm;box-shadow:0 2px 14px rgba(15,23,42,.12)}
.cover{min-height:277mm;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(160deg,#312e81 0%,#4f46e5 45%,#0d9488 100%);color:#fff;border-radius:6px}
.cover .kicker{letter-spacing:.18em;text-transform:uppercase;font-size:9pt;opacity:.85}.cover h1{font-size:30pt;line-height:1.15;margin:.3em 0 .4em;max-width:16em}.cover .sub{font-size:12pt;opacity:.9;max-width:34em}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:22px}.tile{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);border-radius:10px;padding:12px 14px}.tile .n{font-size:24pt;font-weight:700;line-height:1.1}.tile .l{font-size:9pt;opacity:.9;display:flex;gap:6px;align-items:center}
.cover .foot{display:flex;justify-content:space-between;font-size:9pt;opacity:.9;border-top:1px solid rgba(255,255,255,.35);padding-top:10px}
.cover code{background:rgba(255,255,255,.18);color:#fff}.cover{position:relative;overflow:hidden}.cover .mark{position:absolute;right:-30mm;bottom:22mm;width:150mm;height:150mm;opacity:.14;color:#fff}.cover .mark svg{width:100%;height:100%;stroke-width:.9}.cover>div{position:relative}
.icon{width:22px;height:22px;flex:none}.icon-sm{width:14px;height:14px;vertical-align:-2px}
.toc{columns:1}.toc h2{margin-top:0}.toc ol{list-style:none;padding:0;margin:0;counter-reset:s}.toc li{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);counter-increment:s}.toc li::before{content:counter(s,decimal-leading-zero);font-weight:700;color:var(--p);width:2em}.toc li .icon{color:var(--t)}
.charts{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:12px 0 4px}.chart{margin:0;background:var(--wash);border:1px solid var(--line);border-radius:10px;padding:10px}.chart svg{width:100%;height:auto;font:9pt "Segoe UI",system-ui,sans-serif;fill:var(--ink)}.chart .big{font-size:20px;font-weight:700}.chart figcaption{font-size:8.5pt;color:var(--muted);margin-top:4px}
.sec{break-before:page}.sec:first-of-type{break-before:auto}h2{display:flex;align-items:center;gap:10px;font-size:18pt;color:#1e1b4b;margin:0 0 .5em;padding-bottom:.35em;border-bottom:3px solid var(--p)}h2 .icon{width:28px;height:28px;color:var(--p);background:#eef2ff;border-radius:8px;padding:4px}
h3{font-size:12.5pt;color:var(--p2);margin:1.2em 0 .4em;break-after:avoid}h4{margin:0 0 .25em;font-size:11pt}p{margin:.45em 0}a{color:var(--sky)}code{font:9.5pt/1.4 Consolas,"Cascadia Mono",Menlo,monospace;background:#f1f5f9;padding:1px 4px;border-radius:4px}
pre.code{background:#0f172a;color:#e2e8f0;padding:12px 14px;border-radius:8px;font:9pt/1.45 Consolas,"Cascadia Mono",Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere;break-inside:avoid}pre.code code{background:none;color:inherit;padding:0}
blockquote{margin:.8em 0;padding:8px 14px;border-left:4px solid var(--t);background:#f0fdfa;border-radius:0 8px 8px 0}hr{border:0;border-top:1px solid var(--line);margin:1.2em 0}
ul,ol{padding-left:1.4em}li{margin:.2em 0}
.tablewrap{margin:.6em 0;break-inside:auto}table{width:100%;border-collapse:collapse;font-size:9.5pt}th{text-align:left;background:#eef2ff;color:#1e1b4b;padding:7px 8px;border-bottom:2px solid var(--p)}td{padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}tbody tr:nth-child(even) td{background:var(--wash)}tr{break-inside:avoid}
.cards{display:grid;gap:10px;margin:.6em 0}.req{display:grid;grid-template-columns:72px 1fr;gap:10px;border:1px solid var(--line);border-left:5px solid var(--p);border-radius:10px;padding:10px 12px;background:#fff;break-inside:avoid}.req-nfr{border-left-color:var(--t)}.req-us,.req-sc{border-left-color:var(--amber)}.req-gv,.req-tc{border-left-color:var(--p2)}
.req-id .id{font-size:10pt}.req-body p{margin:.2em 0}.metas{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:6px;font-size:8.5pt;color:var(--muted)}.meta{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.meta-k{text-transform:uppercase;letter-spacing:.06em;font-size:7.5pt}
.id{display:inline-block;font-weight:700;font-size:8.5pt;padding:1px 7px;border-radius:999px;border:1px solid currentColor;white-space:nowrap}.id-fr{color:var(--p)}.id-nfr{color:var(--t)}.id-us,.id-sc{color:var(--amber)}.id-gv,.id-tc{color:var(--p2)}.id-nf{color:var(--t)}
.badge{display:inline-block;font-weight:700;font-size:8pt;padding:1px 8px;border-radius:999px;color:#fff;white-space:nowrap}.badge-must{background:var(--rose)}.badge-should{background:var(--amber)}.badge-could{background:var(--sky)}.badge-wont{background:#64748b}
.chip{display:inline-block;font-size:8pt;padding:1px 8px;border-radius:999px;white-space:nowrap}.chip-prov{background:#fef3c7;color:#78350f}.chip-dim{background:#dbeafe;color:#1e3a8a}.ref{color:var(--p2);text-decoration:underline dotted}
figure.diagram{margin:.9em 0;padding:12px;border:1px solid var(--line);border-radius:10px;background:#fff;break-inside:avoid;text-align:center}figure.diagram svg{max-width:100%;height:auto;max-height:240mm}figure.diagram figcaption{font-size:8.5pt;color:var(--muted);margin-top:6px;text-align:left}
figure.diagram-source{text-align:left}figure.diagram-source pre{background:#f8fafc;border-radius:6px;padding:10px;font:8.5pt/1.4 Consolas,"Cascadia Mono",Menlo,monospace;white-space:pre-wrap}
figure.shot{margin:.9em 0;break-inside:avoid}figure.shot img{max-width:100%;max-height:230mm;border:1px solid var(--line);border-radius:8px}figcaption{font-size:8.5pt;color:var(--muted);margin-top:5px}
.gallery{display:grid;grid-template-columns:1fr 1fr;gap:12px}.gallery figure{margin:0;break-inside:avoid}.gallery img{width:100%;border:1px solid var(--line);border-radius:8px}
.missing{color:var(--rose);font-size:9pt}.note{background:#fff7ed;border:1px solid #fed7aa;color:#7c2d12;padding:8px 12px;border-radius:8px;font-size:9pt}
.runhead{display:none}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none;padding:0}.cover{min-height:263mm;border-radius:0}.runhead{display:block;position:fixed;bottom:0;left:0;right:0;font-size:7.5pt;color:var(--muted);display:flex;justify-content:space-between;padding:0 2mm}}
@page{size:A4;margin:14mm 14mm 16mm}
`;
function document({ title, sections, body, stats, moscow, dims, gallery, note, generated, sourceName }) {
  const tiles = [['fr', 'Functional requirements', 'checklist'], ['nfr', 'Non-functional requirements', 'gauge'], ['stories', 'Stories & scenarios', 'route'], ['diagrams', 'Diagrams', 'diagram'], ['tables', 'Tables', 'file'], ['sections', 'Sections', 'layers']]
    .map(([k, l, i]) => `<div class="tile"><div class="n">${stats[k]}</div><div class="l">${icon(i, 'icon-sm')} ${l}</div></div>`).join('');
  const charts = [donut(moscow), bars(dims)].filter(Boolean).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; object-src 'none'">
<title>${escape(title)}</title><style>${CSS}</style></head><body>
<div class="runhead"><span>${escape(title)}</span><span>${escape(sourceName)} · ${escape(generated)}</span></div>
<div class="page cover"><div><div class="kicker">${icon('sparkles', 'icon-sm')} Software requirements specification</div><h1>${escape(title)}</h1><p class="sub">The agreed scope, the rules the product must follow and the evidence each requirement traces to — rendered from <code>${escape(sourceName)}</code> as signed off.</p>
<div class="tiles">${tiles}</div></div><div class="mark">${icon(sections[0]?.icon === 'target' ? 'layers' : 'target', '')}</div><div class="foot"><span>forge:requirements</span><span>${escape(generated)}</span></div></div>
<div class="page toc"><h2>${icon('layers')}<span>Contents</span></h2><ol>${sections.map(s => `<li>${icon(s.icon)}<span>${escape(s.title)}</span></li>`).join('')}${gallery ? `<li>${icon('image')}<span>Artifacts from the engagement</span></li>` : ''}</ol>
${charts ? `<div class="charts">${charts}</div>` : ''}${note ? `<p class="note">${icon('alert', 'icon-sm')} ${escape(note)}</p>` : ''}</div>
<div class="page body">${body}${gallery ? `<section class="sec" id="s-gallery"><h2>${icon('image')}<span>Artifacts from the engagement</span></h2><p>Images kept in the run — design directions, wireframe captures and playback material reviewed with the client. They are direction evidence, not approved product assets.</p><div class="gallery">${gallery}</div></section>` : ''}
<p class="foot-note" style="font-size:8pt;color:#64748b;margin-top:24px">Self-contained document generated ${escape(generated)} by forge:requirements. Diagrams and images are embedded; no external service is contacted when it is opened.</p></div>
</body></html>
`;
}

async function build(runDir, { source = 'requirements.md', gallery = true } = {}) {
  const root = fs.realpathSync(runDir);
  a.need(a.text(source) && fs.existsSync(path.join(root, source)), `source not in the run: ${source}`);
  const file = a.local(root, source), md = fs.readFileSync(file, 'utf8');
  const ctx = { sections: [], diagrams: [], ids: new Set(), used: new Set(), moscow: { must: 0, should: 0, could: 0, wont: 0 }, dims: {},
    file: src => { try { const f = a.local(root, src.replace(/^\.\//, '')); return IMAGE.test(f) ? f : null; } catch { return null; } } };
  const blocks = parse(md);
  let body = render(blocks, ctx);
  if (ctx.open) body += '</section>';
  const { svgs, note } = await renderDiagrams(root, ctx.diagrams);
  for (const d of ctx.diagrams) {
    const svg = svgs.get(d.id);
    body = body.replace(`<!--diagram:${d.id}-->`, svg ? `<figure class="diagram">${svg}<figcaption>${icon('diagram', 'icon-sm')} ${escape(d.kind)} diagram ${d.id.slice(1)}</figcaption></figure>`
      : `<figure class="diagram diagram-source"><pre>${escape(d.source)}</pre><figcaption>${icon('diagram', 'icon-sm')} ${escape(d.kind)} diagram ${d.id.slice(1)} — source (not rendered)</figcaption></figure>`);
  }
  const extra = gallery ? fs.readdirSync(root).filter(f => IMAGE.test(f) && !ctx.used.has(f) && fs.statSync(path.join(root, f)).size <= 8 * 1024 * 1024).sort().slice(0, 12) : [];
  const galleryHtml = extra.map(f => `<figure><img src="${dataUri(path.join(root, f))}" alt="${escape(f)}"><figcaption>${escape(f.replace(IMAGE, '').replace(/[-_]+/g, ' '))}</figcaption></figure>`).join('');
  const text = md, count = re => new Set(text.match(re) || []).size;
  const stats = { fr: count(/\bFR-\d+\b/g), nfr: count(/\bNFR-\d+\b/g), stories: count(/\b(?:US|SC|UC)-\d+\b/g), diagrams: ctx.diagrams.length, tables: blocks.filter(b => b.type === 'table').length, sections: ctx.sections.length };
  const title = ctx.title || path.basename(root), generated = new Date().toISOString().slice(0, 10);
  const html = document({ title, sections: ctx.sections, body, stats, moscow: ctx.moscow, dims: ctx.dims, gallery: galleryHtml, note, generated, sourceName: source });
  return { html, title, stats, diagrams: { total: ctx.diagrams.length, rendered: svgs.size, note }, images: extra.length + ctx.used.size, moscow: ctx.moscow };
}

function outputPath(root, out, ext) {
  a.need(a.text(out) && out.toLowerCase().endsWith(ext) && !/[\\:]/.test(out) && !path.isAbsolute(out) && !out.split('/').some(p => ['', '.', '..'].includes(p)), `Output must be a relative ${ext} path inside the run`);
  const f = path.resolve(root, out);
  a.need(path.relative(root, f) && !path.relative(root, f).startsWith('..'), 'Output escapes the run');
  return f;
}
async function html(runDir, { source, out, gallery, replace = false } = {}) {
  const root = fs.realpathSync(runDir), name = out ?? path.basename(source ?? 'requirements.md', '.md') + '.html', file = outputPath(root, name, '.html');
  const r = await build(root, { source, gallery });
  if (replace && fs.existsSync(file)) fs.unlinkSync(file);
  fs.writeFileSync(file, r.html, { flag: 'wx' });
  return { verdict: 'HTML_EXPORTED', file: name, sha256: a.sha(r.html), title: r.title, stats: r.stats, diagrams: r.diagrams, images: r.images };
}
async function pdf(runDir, { source, out, gallery, replace = false } = {}) {
  const root = fs.realpathSync(runDir), base = path.basename(source ?? 'requirements.md', '.md'), name = out ?? base + '.pdf';
  outputPath(root, name, '.pdf');
  const page = await html(root, { source, out: name.replace(/\.pdf$/i, '.html'), gallery, replace });
  if (replace && fs.existsSync(path.join(root, name))) fs.unlinkSync(path.join(root, name));
  const r = await ex.convert('pdf', root, name, fs.readFileSync(path.join(root, page.file), 'utf8'));
  if (r.verdict !== 'PDF_EXPORTED') return { ...r, html: page.file, title: page.title, stats: page.stats, diagrams: page.diagrams, images: page.images };
  const bytes = fs.readFileSync(path.join(root, name)), pages = (bytes.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
  return { verdict: 'PDF_EXPORTED', file: name, html: page.file, sha256: r.sha256, pages, title: page.title, stats: page.stats, diagrams: page.diagrams, images: page.images };
}

module.exports = { parse, inline, render, build, html, pdf, renderDiagrams, MERMAID, ICONS };

const USAGE = 'usage: requirements-report.cjs html|pdf <run> [--source requirements.md] [--out <file>] [--no-gallery] [--replace]';
if (require.main === module) (async () => {
  const [cmd, run, ...rest] = process.argv.slice(2), opt = f => { const i = rest.indexOf(f); return i >= 0 ? rest[i + 1] : undefined; };
  if (!['html', 'pdf'].includes(cmd) || !run) { console.error(USAGE); process.exitCode = 2; return; }
  const options = { source: opt('--source'), out: opt('--out'), gallery: !rest.includes('--no-gallery'), replace: rest.includes('--replace') };
  const r = await (cmd === 'pdf' ? pdf : html)(run, options), d = r.diagrams, s = r.stats;
  if (r.verdict === 'EXPORT_UNAVAILABLE') console.log(`REPORT: EXPORT_UNAVAILABLE ${r.reason} — the HTML is at ${r.html}`);
  else console.log(`REPORT: ${r.verdict} ${r.file}${r.pages ? ` pages=${r.pages}` : ''} sections=${s.sections} requirements=${s.fr}+${s.nfr} diagrams=${d.rendered}/${d.total} images=${r.images}${d.note ? ' — ' + d.note : ''}`);
  if (r.verdict === 'EXPORT_UNAVAILABLE') process.exitCode = 1;
})().catch(e => { console.error('requirements-report blocked: ' + e.message); process.exitCode = 2; });
