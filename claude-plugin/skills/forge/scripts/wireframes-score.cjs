#!/usr/bin/env node
/**
 * wireframes-score.cjs — the throwaway-wireframe seam for /forge:requirements
 * (elicitation-protocol §5: reference sweep → wireframes cloned from popular peers → reaction loop).
 *
 *   sweep "<category>" [--min-stars 500] [--months 24] [--limit 10] [--asof YYYY-MM-DD]
 *         → TSV rows for wireframes/references.tsv from `gh search repos` — popular + alive only;
 *           look at each one, then fill screen · capture · notes
 *   score <wireframes-dir> [--require SC-1,SC-2] [--capture] [--asof YYYY-MM-DD]
 *         → WIREFRAMES: PASS|FAIL wqd=N/M coverage=F diversity=F refs=N bytes_max=K
 *
 * Layout of <run-dir>/wireframes/:
 *   references.tsv            slug  repo  stars  license  pushed  category  screen  capture  notes
 *   refs/<slug>-<screen>.png  the captured reference screens (the capture column points here)
 *   <screen>-<variant>.html   one throwaway wireframe, cloned from a ledger row (contract below)
 *   <screen>-<variant>.png    its render (Playwright, 1280×800, full page; --capture makes them)
 *
 * Wireframe contract (per HTML file):
 *   hard — THROWAWAY banner text · <meta name="lineage" content="<slug>:<screen>"> resolving to a
 *          valid ledger row · self-contained (no http(s) in link/script/img/iframe/media src|href,
 *          url() or @import — it must render offline, so it is reproducible and fast)
 *   soft — <meta name="screen"> · <meta name="sc" content="SC-n,…"> · viewport meta · <nav> ·
 *          <main> · [data-primary] · [data-state="empty"] · [data-state="error"] · ≤ 64 KiB
 *
 * The headline is a quality–diversity score (QD-score, Mouret & Clune 2015): quality = soft checks
 * met / 9 (0 when any hard check fails); wireframes of one screen whose renders are < 32 bits apart
 * under a 192-bit perceptual fingerprint (average hash + horizontal and vertical difference hashes
 * of a 9×9 luminance grid; Krawetz 2011/2013) share a niche and only the best one counts, so three
 * recolours of one layout score ≈ 1, not 3. diversity = mean pairwise fingerprint distance / 192
 * inside a screen group (novelty, Lehman & Stanley 2011), reported as the minimum over groups.
 * PASS iff ≥ 3 valid references (stars ≥ 500, pushed within 24 months before --asof, a license and
 * an existing capture), every hard check holds, coverage = 1.00 for --require, every screen has
 * ≥ 2 variants from ≥ 2 lineages and ≥ 32 bits apart, and wqd ≥ 0.8 × wireframe count.
 *
 * Deterministic: the PNGs are inputs, no browser is needed to score; --asof pins the liveness clock.
 *   exit 0 PASS · 1 FAIL · 2 unusable input
 */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), cp = require('child_process');

// NICHE_BITS calibrated on Playwright renders of real wireframes: recolour 0 · copy-only change 17 ·
// different layouts 72–100 of 192 bits — one sixth sits between "same layout" and "a real choice".
const MIN_STARS = 500, MAX_MONTHS = 24, MAX_BYTES = 64 * 1024, HASH_BITS = 192, NICHE_BITS = 32, WQD_FLOOR = 0.8, MIN_REFS = 3;
const SOFT = ['screen', 'sc', 'viewport', 'nav', 'main', 'primary', 'empty', 'error', 'bytes'];
const COLS = ['slug', 'repo', 'stars', 'license', 'pushed', 'category', 'screen', 'capture', 'notes'];

function parseArgs(argv) {
  const o = { _: [], require: [], capture: false, asof: new Date().toISOString().slice(0, 10), minStars: MIN_STARS, months: MAX_MONTHS, limit: 10 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--require') { o.require.push(...String(v).split(',').map(s => s.trim()).filter(Boolean)); i++; }
    else if (k === '--capture') o.capture = true;
    else if (k === '--asof') { o.asof = v; i++; }
    else if (k === '--min-stars') { o.minStars = +v; i++; }
    else if (k === '--months') { o.months = +v; i++; }
    else if (k === '--limit') { o.limit = +v; i++; }
    else if (k === '-h' || k === '--help') { usage(); process.exit(0); }
    else if (k.startsWith('--')) throw new Error('unknown flag ' + k);
    else o._.push(k);
  }
  return o;
}
function usage() { console.error(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 11).map(l => l.replace(/^ \* ?/, '')).join('\n')); }
function cutoffDate(asof, months) { const d = new Date(asof); if (isNaN(d)) throw new Error('--asof must be YYYY-MM-DD'); d.setMonth(d.getMonth() - months); return d; }

// ---------------------------------------------------------------------------
// PNG → luminance → 64-bit difference hash. Playwright writes 8-bit non-interlaced RGBA; gray,
// gray+alpha and RGB are accepted too. Palette/16-bit/interlaced PNGs are refused with the reason.
// ---------------------------------------------------------------------------
function decodePng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let p = 8, w = 0, h = 0, depth = 0, type = 0; const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; if (data[12]) throw new Error('interlaced PNG unsupported'); }
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (!ch || depth !== 8 || !w || !h) throw new Error(`unsupported PNG (depth ${depth}, color type ${type})`);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, out = Buffer.alloc(h * stride);
  for (let y = 0, i = 0; y < h; y++) {
    const f = raw[i++], row = out.subarray(y * stride, (y + 1) * stride), prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? row[x - ch] : 0, b = prev ? prev[x] : 0, c = x >= ch && prev ? prev[x - ch] : 0, v = raw[i++];
      let pr = 0;
      if (f === 1) pr = a; else if (f === 2) pr = b; else if (f === 3) pr = (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      row[x] = (v + pr) & 255;
    }
  }
  const lum = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) { const o = i * ch; lum[i] = ch >= 3 ? 0.299 * out[o] + 0.587 * out[o + 1] + 0.114 * out[o + 2] : out[o]; }
  return { w, h, lum };
}

// 9×9 box-mean luminance grid → 192 bits: average hash of the 8×8 core (where the ink masses sit)
// + difference hash across rows + difference hash down columns (where the edges are, both ways —
// a plain horizontal dHash reads a dark-left sidebar and a dark-top header as the same page).
function dhash({ w, h, lum }) {
  const G = 9, grid = [];
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const x0 = Math.floor(gx * w / G), x1 = Math.max(x0 + 1, Math.floor((gx + 1) * w / G));
    const y0 = Math.floor(gy * h / G), y1 = Math.max(y0 + 1, Math.floor((gy + 1) * h / G));
    let s = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += lum[y * w + x]; n++; }
    grid.push(s / n);
  }
  const cell = (x, y) => grid[y * G + x];
  let mean = 0, bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) mean += cell(x, y);
  mean /= 64;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += cell(x, y) > mean ? '1' : '0';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += cell(x, y) > cell(x + 1, y) ? '1' : '0';
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) bits += cell(x, y) > cell(x, y + 1) ? '1' : '0';
  return bits;
}
const hamming = (a, b) => { let d = 0; for (let i = 0; i < HASH_BITS; i++) if (a[i] !== b[i]) d++; return d; };
const hex = bits => bits.match(/.{4}/g).map(n => parseInt(n, 2).toString(16)).join('');

// ---------------------------------------------------------------------------
// references.tsv — the reference sweep ledger
// ---------------------------------------------------------------------------
function readLedger(dir, o) {
  const file = path.join(dir, 'references.tsv'), errs = [], rows = [];
  if (!fs.existsSync(file)) return { rows, errs: ['references.tsv missing (run `wireframes-score.cjs sweep "<category>"`, then capture each reference screen)'] };
  const cutoff = cutoffDate(o.asof, o.months);
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || line.startsWith('#')) return;
    const c = line.split('\t').map(s => s.trim());
    if (c[0] === 'slug' && c[1] === 'repo') return;
    const n = i + 1;
    if (c.length < 8) { errs.push(`references.tsv row ${n}: expected 9 columns (${COLS.join(' ')}), got ${c.length}`); return; }
    const [slug, repo, stars, license, pushed, category, screen, capture] = c;
    const r = { slug, repo, stars: +stars, license, pushed, category, screen, capture, ok: true };
    const bad = m => { errs.push(`references.tsv row ${n} (${slug || '?'}): ${m}`); r.ok = false; };
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(slug)) bad('slug must be lowercase [a-z0-9._-]');
    if (!/^https?:\/\//.test(repo)) bad('repo must be a URL');
    if (!(r.stars >= o.minStars)) bad(`stars ${stars} < ${o.minStars} (not popular enough to be evidence)`);
    if (!license) bad('license empty (record it even when it is "other" or "none")');
    const d = new Date(pushed);
    if (isNaN(d)) bad('pushed is not a date'); else if (d < cutoff) bad(`pushed ${pushed} is older than ${o.months} months before ${o.asof} (abandoned)`);
    if (!screen) bad('screen empty (which screen was captured?)');
    if (!capture || !fs.existsSync(path.join(dir, capture))) bad(`capture "${capture}" not found under ${dir} (a reference without a captured screen was not looked at)`);
    rows.push(r);
  });
  return { rows, errs };
}

// ---------------------------------------------------------------------------
// one wireframe → contract result
// ---------------------------------------------------------------------------
function checkHtml(dir, file, ledger) {
  const html = fs.readFileSync(path.join(dir, file), 'utf8'), bytes = Buffer.byteLength(html);
  const meta = n => { const m = new RegExp(`<meta\\s+name=["']${n}["']\\s+content=["']([^"']*)["']`, 'i').exec(html) || new RegExp(`<meta\\s+content=["']([^"']*)["']\\s+name=["']${n}["']`, 'i').exec(html); return m ? m[1].trim() : ''; };
  const hard = [], soft = {};
  if (!/THROWAWAY/.test(html)) hard.push('no THROWAWAY banner');
  const lineage = meta('lineage'), [slug, lscreen] = lineage.split(':');
  if (!lineage) hard.push('no <meta name="lineage" content="<slug>:<screen>"> (which reference was this cloned from?)');
  else if (!ledger.some(r => r.ok && r.slug === slug && r.screen === lscreen)) hard.push(`lineage "${lineage}" matches no valid references.tsv row`);
  const ext = html.match(/<(?:link|script|img|iframe|source|video|audio|object|embed)\b[^>]*\b(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\/|url\(\s*["']?\s*(?:https?:)?\/\/|@import\s+["'(]*\s*(?:https?:)?\/\//gi) || [];
  if (ext.length) hard.push(`${ext.length} external resource(s) — a wireframe renders offline (inline everything)`);
  soft.screen = !!meta('screen');
  soft.sc = /\bSC-\d+\b/.test(meta('sc'));
  soft.viewport = !!meta('viewport');
  soft.nav = /<nav[\s>]|role=["']navigation["']/i.test(html);
  soft.main = /<main[\s>]|role=["']main["']/i.test(html);
  soft.primary = /data-primary/i.test(html);
  soft.empty = /data-state=["']empty["']/i.test(html);
  soft.error = /data-state=["']error["']/i.test(html);
  soft.bytes = bytes <= MAX_BYTES;
  const missing = SOFT.filter(k => !soft[k]);
  return { file, bytes, lineage, slug: slug || '', screen: meta('screen') || file.replace(/(-[^-]*)?\.html$/i, ''), sc: meta('sc').match(/\bSC-\d+\b/g) || [], hard, missing, quality: hard.length ? 0 : (SOFT.length - missing.length) / SOFT.length };
}

// ---------------------------------------------------------------------------
// --capture: render each wireframe with the project's Playwright (cwd or AR_PLAYWRIGHT_CWD)
// ---------------------------------------------------------------------------
async function capture(dir, files) {
  let pw = null;
  for (const c of [process.cwd(), process.env.AR_PLAYWRIGHT_CWD].filter(Boolean)) { try { pw = require(require.resolve('playwright', { paths: [c] })); break; } catch { /* next */ } }
  if (!pw) throw new Error('playwright not resolvable from cwd or AR_PLAYWRIGHT_CWD — render the PNGs from a project that has it');
  const browser = await pw.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    for (const f of files) {
      await page.goto(require('url').pathToFileURL(path.resolve(dir, f)).href, { waitUntil: 'load' });
      await page.screenshot({ path: path.join(dir, f.replace(/\.html$/i, '.png')), fullPage: true });
    }
  } finally { await browser.close(); }
}

// ---------------------------------------------------------------------------
// score
// ---------------------------------------------------------------------------
async function score(o) {
  const dir = o._[0];
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) { console.log('WIREFRAMES: FAIL'); console.error('usage: score <wireframes-dir> [--require SC-1,SC-2] [--capture] [--asof YYYY-MM-DD]'); return 2; }
  const files = fs.readdirSync(dir).filter(f => /\.html$/i.test(f)).sort();
  if (!files.length) { console.log('WIREFRAMES: FAIL'); console.error(`no *.html wireframes in ${dir}`); return 2; }
  const { rows, errs: excluded } = readLedger(dir, o), errs = [];
  const okRefs = rows.filter(r => r.ok);
  if (o.capture) await capture(dir, files);
  const wf = files.map(f => checkHtml(dir, f, okRefs));
  for (const w of wf) {
    for (const h of w.hard) errs.push(`${w.file}: ${h}`);
    const png = path.join(dir, w.file.replace(/\.html$/i, '.png'));
    if (!fs.existsSync(png)) { errs.push(`${w.file}: no render ${path.basename(png)} (screenshot it, or pass --capture)`); continue; }
    try { w.hash = dhash(decodePng(fs.readFileSync(png))); } catch (e) { errs.push(`${w.file}: ${path.basename(png)}: ${e.message}`); }
  }
  const groups = new Map();
  for (const w of wf) { if (!groups.has(w.screen)) groups.set(w.screen, []); groups.get(w.screen).push(w); }
  let wqd = 0, divMin = null;
  for (const [screen, g] of groups) {
    const parent = g.map((_, i) => i), find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
    let sum = 0, pairs = 0;
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      if (!g[i].hash || !g[j].hash) continue;
      const d = hamming(g[i].hash, g[j].hash); sum += d; pairs++;
      if (d < NICHE_BITS) { parent[find(i)] = find(j); errs.push(`${screen}: ${g[i].file} and ${g[j].file} render ${d} bits apart (< ${NICHE_BITS}) — the same layout twice is not a choice`); }
    }
    const niches = new Map();
    g.forEach((w, i) => { const r = find(i); niches.set(r, Math.max(niches.get(r) || 0, w.quality)); });
    for (const q of niches.values()) wqd += q;
    const div = pairs ? sum / pairs / HASH_BITS : null;
    if (div !== null && (divMin === null || div < divMin)) divMin = div;
    const lineages = new Set(g.map(w => w.slug).filter(Boolean));
    if (g.length < 2) errs.push(`${screen}: ${g.length} variant (need ≥ 2 so the client chooses rather than approves)`);
    else if (lineages.size < 2) errs.push(`${screen}: every variant is cloned from "${[...lineages][0] || '?'}" (need ≥ 2 lineages)`);
    console.error(`screen ${screen}: variants=${g.length} lineages=${lineages.size} niches=${niches.size} diversity=${div === null ? 'n/a' : div.toFixed(2)}`);
  }
  const covered = new Set(wf.flatMap(w => w.sc)), req = o.require.length ? o.require : [...covered];
  for (const s of req) if (!covered.has(s)) errs.push(`required scenario ${s} has no wireframe`);
  const coverage = req.length ? req.filter(s => covered.has(s)).length / req.length : 0;
  if (!req.length) errs.push('no scenario ids on any wireframe (<meta name="sc" content="SC-n,…">)');
  if (okRefs.length < MIN_REFS) errs.push(`references: ${okRefs.length} valid (need ≥ ${MIN_REFS} popular, alive, captured)`);
  if (wqd < WQD_FLOOR * wf.length) errs.push(`wqd ${wqd.toFixed(2)} < ${WQD_FLOOR} × ${wf.length} wireframes`);
  for (const w of wf) console.error(`${w.file}: quality=${w.quality.toFixed(2)} lineage=${w.lineage || '-'} sc=${w.sc.join(',') || '-'} bytes=${w.bytes} hash=${w.hash ? hex(w.hash) : '-'}${w.missing.length ? ' missing=' + w.missing.join(',') : ''}`);
  for (const e of excluded) console.error('  excluded: ' + e);
  for (const e of errs) console.error('  ' + e);
  console.error(`asof=${o.asof} refs_valid=${okRefs.length}/${rows.length}`);
  const bytesMax = Math.max(...wf.map(w => w.bytes));
  console.log(`WIREFRAMES: ${errs.length ? 'FAIL' : 'PASS'} wqd=${wqd.toFixed(2)}/${wf.length} coverage=${coverage.toFixed(2)} diversity=${divMin === null ? 'n/a' : divMin.toFixed(2)} refs=${okRefs.length} bytes_max=${Math.ceil(bytesMax / 1024)}k`);
  return errs.length ? 1 : 0;
}

// ---------------------------------------------------------------------------
// sweep — `gh search repos` → ledger rows (popular + alive), the agent fills the rest after looking
// ---------------------------------------------------------------------------
function filterCandidates(list, o) {
  const cutoff = cutoffDate(o.asof, o.months);
  return list.filter(r => r.stargazersCount >= o.minStars && new Date(r.pushedAt) >= cutoff).map(r => ({
    slug: String(r.fullName).split('/').pop().toLowerCase().replace(/[^a-z0-9._-]/g, '-'),
    repo: r.url, stars: r.stargazersCount, license: (r.license && (r.license.key || r.license.name)) || 'none',
    pushed: String(r.pushedAt).slice(0, 10), notes: String(r.description || '').replace(/\s+/g, ' ').trim().slice(0, 120),
  }));
}
function sweep(o) {
  const q = o._[0];
  if (!q) { console.error('usage: sweep "<category>" [--min-stars 500] [--months 24] [--limit 10]'); return 2; }
  const out = cp.execFileSync('gh', ['search', 'repos', q, '--sort', 'stars', '--order', 'desc', '--limit', String(o.limit), '--json', 'fullName,stargazersCount,license,pushedAt,url,description'], { encoding: 'utf8' });
  const all = JSON.parse(out), rows = filterCandidates(all, o);
  console.log(COLS.join('\t'));
  for (const r of rows) console.log([r.slug, r.repo, r.stars, r.license, r.pushed, q, '', '', r.notes].join('\t'));
  console.error(`sweep "${q}": ${rows.length} of ${all.length} candidates are popular (>= ${o.minStars} stars) and alive (pushed within ${o.months} months of ${o.asof}); fill screen · capture · notes after looking at each`);
  return rows.length ? 0 : 1;
}

async function main() {
  const [sub, ...rest] = process.argv.slice(2);
  let o; try { o = parseArgs(rest); } catch (e) { console.error(e.message); return 2; }
  if (sub === 'score') return score(o);
  if (sub === 'sweep') return sweep(o);
  usage(); return sub ? 64 : 2;
}
if (require.main === module) main().then(c => process.exit(c)).catch(e => { console.error(e.message); process.exit(2); });
module.exports = { decodePng, dhash, hamming, hex, readLedger, checkHtml, filterCandidates, score, parseArgs, HASH_BITS, NICHE_BITS, SOFT };
