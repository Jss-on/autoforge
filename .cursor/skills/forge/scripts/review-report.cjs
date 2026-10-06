'use strict';
// Evidence images and the report for /forge:review. Rendered panels (the pipeline's jobs, command
// output, each finding on its code, changed-line coverage) and app screenshots go through an
// installed Chrome/Edge; the report is one self-contained HTML file, exported to PDF/DOCX by the
// shared converter. Nothing here uploads anything; gdoc.cjs does that, to an approved folder only.
const fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url');
const a = require('./acceptance.cjs'), v = require('./verification.cjs'), review = require('./review.cjs'), ex = require('./investigate-export.cjs');

const LINE = 20, WIDTH = 1100, CLIP = 140, MAX_ROWS = 60, PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clip = s => { const t = String(s).replace(/\t/g, '  ').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ''); return t.length > CLIP ? t.slice(0, CLIP - 1) + '…' : t; };
const json = file => { const t = fs.readFileSync(file, 'utf8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t); };
const parse = s => { try { return JSON.parse(s); } catch { return null; } };
const inside = (root, file) => { const rel = path.relative(root, file); return rel && !rel.startsWith('..') && !path.isAbsolute(rel); };

// One panel: a title bar and numbered monospace rows. Height is exact, so a viewport-sized
// screenshot holds the whole panel and nothing else.
function panel(title, meta, rows) {
  const shown = rows.length > MAX_ROWS ? [...rows.slice(0, MAX_ROWS), { text: `… ${rows.length - MAX_ROWS} more lines in the receipt`, tone: 'dim' }] : rows;
  const body = shown.map(r => `<div class="r ${r.tone || ''}"><span class="n">${r.n ?? ''}</span><span class="t">${esc(clip(r.text))}</span>${r.note ? `<span class="note">${esc(clip(r.note))}</span>` : ''}</div>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#fff;color:#1f2328;font:14px/20px Consolas,"DejaVu Sans Mono",Menlo,monospace}
.h{height:40px;padding:8px 16px;background:#24292f;color:#fff;font:600 15px/20px "Segoe UI",system-ui,sans-serif;overflow:hidden;white-space:nowrap}
.h small{display:block;color:#c9d1d9;font-weight:400;font-size:12px;line-height:20px}
.b{padding:8px 0}.r{display:flex;height:20px;white-space:pre;padding:0 16px;overflow:hidden}
.n{width:56px;flex:none;color:#8c959f;text-align:right;padding-right:12px}.t{flex:1;overflow:hidden}
.hit{background:#dafbe1}.miss{background:#ffebe9}.mark{background:#fff8c5;box-shadow:inset 4px 0 #bf8700}.dim{color:#8c959f}
.note{flex:none;margin-left:12px;padding:0 8px;background:#bf8700;color:#fff;border-radius:4px;font:600 12px/20px "Segoe UI",system-ui,sans-serif}
</style><div class="h">${esc(clip(title))}<small>${esc(clip(meta))}</small></div><div class="b">${body}</div>`;
  return { html, height: 56 + 16 + shown.length * LINE };
}

// Screenshot a page (a rendered panel, or the app under review) with an installed Chrome/Edge.
async function snap(root, out, { html, url, width = WIDTH, height = 800, wait = 0, scale = 1.5, timeout = 120000 }) {
  const chrome = ex.executable('pdf');
  if (!chrome) return { status: 'unavailable', reason: 'Chrome/Edge/Chromium not found; FORGE_CHROME may name an installed executable' };
  const target = path.resolve(root, out);
  a.need(inside(root, target) && /\.png$/i.test(target) && !fs.existsSync(target), 'Screenshot output must be a new .png inside the run');
  const tmp = fs.mkdtempSync(path.join(root, '.review-render-'));
  try {
    if (html) fs.writeFileSync(path.join(tmp, 'page.html'), html);
    const shot = path.join(tmp, 'shot.png');
    // A screenshot waits for a painted frame; without a display (a macOS VM) there is no vsync to wait for.
    const argv = [chrome, ...ex.CHROME_ARGS, '--disable-gpu-vsync', '--hide-scrollbars', '--user-data-dir=' + path.join(tmp, 'profile'), `--window-size=${width},${Math.min(Math.max(height, 100), 16000)}`, `--force-device-scale-factor=${scale}`,
      '--screenshot=' + shot, ...(wait ? ['--virtual-time-budget=' + wait] : []), url || pathToFileURL(path.join(tmp, 'page.html')).href];
    const r = await v.run(argv, { cwd: tmp, env: process.env, timeout_ms: timeout, output_limit: 1 << 20 });
    a.need(!r.error && !r.signal && r.exit_code === 0 && fs.existsSync(shot), 'Chrome screenshot failed: ' + (r.error || r.signal || 'exit ' + r.exit_code) + ' ' + v.redact(r.stderr, []).slice(0, 300));
    const bytes = fs.readFileSync(shot);
    a.need(bytes.subarray(0, 8).equals(PNG), 'Screenshot is not a PNG');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { flag: 'wx' });
    return { status: 'ok', file: path.relative(root, target).replace(/\\/g, '/'), sha256: a.sha(bytes), ...(url ? { url, captured_at: new Date().toISOString() } : {}) };
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a browser still closing its profile; the folder is inert */ } }
}

// What each piece of evidence looks like as a panel.
function receiptRows(r) {
  const jobs = (j => Array.isArray(j) ? j : Array.isArray(j?.jobs) ? j.jobs : null)(parse(r.stdout));
  if (jobs && jobs.length && jobs.every(x => x && typeof x.name === 'string')) {
    return jobs.map(x => { const s = String(x.status || x.state || x.conclusion || x.bucket || 'unknown').toLowerCase();
      return { text: `${(x.stage || x.workflow || '').toString().padEnd(14).slice(0, 14)} ${x.name.padEnd(48).slice(0, 48)} ${s}`, tone: /^(success|pass|passed|completed)$/.test(s) ? 'hit' : /^(fail|failed|failure|error|canceled|cancelled|timed_out)$/.test(s) ? 'miss' : '' }; });
  }
  const m = parse(r.stdout);
  if (m && 'checks' in m && 'head' in m) return ['verdict', 'checks', 'pipeline', 'merge', 'settled', 'conflicts', 'head', 'url'].filter(k => k in m).map(k => ({ text: `${k.padEnd(10)} ${typeof m[k] === 'string' ? m[k] : JSON.stringify(m[k])}`, tone: k === 'checks' ? (m.checks === 'green' ? 'hit' : 'miss') : '' }));
  const all = (r.stdout + (r.stderr ? '\n' + r.stderr : '')).replace(/\r/g, '').replace(/\n+$/, '').split('\n');
  return all.slice(-40).map((text, i) => ({ n: all.length - Math.min(all.length, 40) + i + 1, text,
    tone: /^\s*(FAIL|not ok|✗|×|ERROR)\b/i.test(text) ? 'miss' : /^\s*(PASS|ok\b|✓)/i.test(text) ? 'hit' : '' }));
}

// The lines of a changed file as the head has them. Read only from the review checkout, and only
// when the file really lives inside it: a symlink or junction in the change could otherwise pull a
// credentials file into the evidence document.
function sourceLines(rv, root, file) {
  const base = rv.mr.worktree, work = review.workspace(root).root;
  try {
    const real = fs.realpathSync(base), f = fs.realpathSync(path.resolve(real, file));
    if (inside(fs.realpathSync(work), real) && inside(real, f) && fs.statSync(f).isFile())
      return { lines: fs.readFileSync(f, 'utf8').replace(/\r/g, '').replace(/\n$/, '').split('\n'), from: 'head checkout' };
  } catch { /* no checkout, or the path leaves it: fall back to the diff */ }
  const diff = path.join(root, 'diff.patch');
  if (!fs.existsSync(diff)) return null;
  const added = review.lines(fs.readFileSync(diff, 'utf8')).get(file) || [], lines = [];
  for (const l of added) lines[l.n - 1] = l.text;
  return { lines, from: 'diff (added lines only)' };
}

// Render every derived image the ledger points at; agent-captured screenshots stay as they are.
async function visuals(runDir) {
  const c = review.check(runDir);
  a.need(c.valid, 'review.json is not valid: ' + c.errors.join('; '));
  const root = c.root, rv = c.review, outDir = path.join(root, 'visuals', 'rendered'), index = path.join(root, 'rendered.json');
  if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
  if (fs.existsSync(index)) fs.unlinkSync(index);
  const made = [], gaps = [];
  const add = async (key, title, meta, rows, extra) => {
    const p = panel(title, meta, rows), id = 'R' + (made.length + 1), file = `visuals/rendered/${id}-${key.replace(/[^\w.-]+/g, '-')}.png`;
    const s = await snap(root, file, { html: p.html, height: p.height });
    if (s.status !== 'ok') { gaps.push(`${title}: ${s.reason}`); return; }
    made.push({ id, file: s.file, sha256: s.sha256, caption: title, ...extra });
  };
  for (const g of review.GATES) {
    const gate = rv.gates[g];
    if (!['pass', 'fail'].includes(gate.status)) continue;
    for (const e of gate.evidence) {
      if (/^receipts\/[^/]+\.json$/.test(e)) {
        const r = json(path.join(root, e));
        await add(g, `${g} — ${r.label}`, `exit ${r.exit_code ?? '?'} · ${r.started_at || ''} · ${e} sha256 ${String(r.stdout_sha256).slice(0, 12)}`, receiptRows(r), { gate: g, source: e });
      } else if (g === 'coverage' && /\.json$/.test(e)) {
        const cov = json(path.join(root, e));
        for (const f of (cov.files || []).filter(x => x.status !== 'not-code').slice(0, 8)) {
          const src = sourceLines(rv, root, f.file), hit = new Set(f.covered), miss = new Set(f.uncovered);
          const changed = [...f.covered, ...f.uncovered].sort((x, y) => x - y);
          if (!changed.length) continue;
          const rows = changed.map(n => ({ n, text: src?.lines[n - 1] ?? '', tone: hit.has(n) ? 'hit' : miss.has(n) ? 'miss' : 'dim' }));
          await add('coverage', `coverage — ${f.file}`, `${f.covered.length} of ${changed.length} changed lines ran under the tests · green ran, red never ran · ${f.status}`, rows, { gate: 'coverage', source: e });
        }
      } else if (/\.json$/.test(e)) {
        const j = json(path.join(root, e));
        await add(g, `${g} — ${e}`, 'recorded result', JSON.stringify(j, null, 2).split('\n').map(text => ({ text })), { gate: g, source: e });
      }
    }
  }
  for (const f of rv.findings.filter(x => x.file && x.status !== 'withdrawn')) {
    const src = sourceLines(rv, root, f.file);
    if (!src) { gaps.push(`${f.id}: neither the head checkout nor diff.patch has ${f.file}`); continue; }
    const from = Math.max(1, f.line - 6), to = Math.min(src.lines.length || f.line, f.line + 6), rows = [];
    for (let n = from; n <= to; n++) if (src.lines[n - 1] !== undefined || n === f.line) rows.push({ n, text: src.lines[n - 1] ?? '', tone: n === f.line ? 'mark' : '', note: n === f.line ? f.label : '' });
    await add(f.id, `${f.id} — ${f.file}:${f.line}`, `${f.label}${f.blocking ? ' · blocks the merge' : ''} · from the ${src.from} at ${rv.mr.head.slice(0, 12)}`, rows, { finding: f.id });
  }
  fs.writeFileSync(index, JSON.stringify({ version: 1, head: rv.mr.head, rendered: made, gaps }, null, 2) + '\n');
  return { rendered: made.length, gaps };
}

// The report: verdict first, then the gates with their images, findings on their code, the app
// before and after, and an appendix of receipts with hashes. Self-contained; no remote resources.
function render(runDir) {
  const root = fs.realpathSync(runDir), result = review.verdict(root);
  a.need(result.verdict !== 'INVALID', 'review.json is not valid: ' + result.reasons.join('; '));
  const rv = json(path.join(root, 'review.json')), idx = fs.existsSync(path.join(root, 'rendered.json')) ? json(path.join(root, 'rendered.json')) : { rendered: [], gaps: ['Rendered evidence was not generated (review-report.cjs visuals).'] };
  a.need(idx.rendered.length === 0 || idx.head === rv.mr.head, 'Rendered images belong to another head; render them again');
  const img = (file, sha, alt) => {
    const bytes = fs.readFileSync(path.join(root, file));
    a.need(a.sha(bytes) === sha, 'Image changed since it was recorded: ' + file);
    const type = bytes[0] === 0xff ? 'jpeg' : bytes[0] === 0x89 ? 'png' : 'webp';
    return `<img alt="${esc(alt)}" src="data:image/${type};base64,${bytes.toString('base64')}">`;
  };
  const tone = { SAFE_TO_MERGE: '#1a7f37', NEEDS_CHANGES: '#cf222e', CANNOT_VERIFY: '#9a6700' }[result.verdict];
  const status = s => ({ pass: '✔ pass', fail: '✘ fail', missing: '? no evidence', 'n/a': '— not applicable' })[s];
  const figures = list => list.map(x => `<figure>${img(x.file, x.sha256, x.caption)}<figcaption>${esc(x.caption)}</figcaption></figure>`).join('');
  const gateRows = review.GATES.map(g => { const gate = rv.gates[g], w = (rv.waivers || []).find(x => x.gate === g);
    return `<tr><td>${esc(g)}</td><td>${esc(status(gate.status))}${w ? ' — waived by the user' : ''}</td><td>${esc(gate.reason || gate.note || '')}</td><td>${(gate.evidence || []).map(e => `<code>${esc(e)}</code>`).join('<br>')}</td></tr>`; }).join('');
  const before = (rv.visuals || []).filter(x => x.gate === 'app' && x.side === 'before'), after = (rv.visuals || []).filter(x => x.gate === 'app' && x.side === 'after');
  const pairs = Array.from({ length: Math.max(before.length, after.length) }, (_, i) => `<tr><td>${before[i] ? figures([before[i]]) : ''}</td><td>${after[i] ? figures([after[i]]) : ''}</td></tr>`).join('');
  const other = (rv.visuals || []).filter(x => !(x.gate === 'app' && x.side));
  const findings = rv.findings.filter(f => f.status !== 'withdrawn').map(f => `<section class="finding"><h3>${esc(f.id)} · ${esc(f.label)}${f.blocking ? ' · <span class="block">blocks the merge</span>' : ''}${f.status === 'resolved' ? ' · resolved' : ''}</h3>
<p class="where">${f.file ? `<code>${esc(f.file)}:${f.line}</code>` : 'General'}</p><pre class="comment">${esc(f.comment)}</pre>${figures(idx.rendered.filter(x => x.finding === f.id))}</section>`).join('') || '<p>No findings.</p>';
  const receipts = fs.existsSync(path.join(root, 'receipts')) ? fs.readdirSync(path.join(root, 'receipts')).filter(f => f.endsWith('.json')).sort().map(f => {
    const r = json(path.join(root, 'receipts', f));
    return `<tr><td><code>${esc(r.id)}</code></td><td>${esc(r.label)}</td><td><code>${esc(r.argv.join(' ').slice(0, 160))}</code></td><td>${esc(r.exit_code ?? r.error ?? '')}</td><td><code>${esc(String(r.stdout_sha256).slice(0, 16))}</code></td></tr>`; }).join('') : '';
  const gaps = [...(idx.gaps || []), ...(rv.visual_gaps || [])];
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(`Review: ${rv.mr.title}`)}</title><style>
body{font:15px/1.5 "Segoe UI",system-ui,sans-serif;color:#1f2328;max-width:1000px;margin:24px auto;padding:0 16px}
h1{font-size:24px;margin:0 0 4px}h2{border-bottom:1px solid #d0d7de;padding-bottom:4px;margin-top:32px}h3{margin:16px 0 4px}
.verdict{border-left:8px solid ${tone};background:#f6f8fa;padding:12px 16px;margin:16px 0}.verdict b{color:${tone};font-size:20px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #d0d7de;padding:6px 8px;vertical-align:top;text-align:left}
img{max-width:100%;border:1px solid #d0d7de}figure{margin:8px 0}figcaption{color:#57606a;font-size:13px}
pre.comment{white-space:pre-wrap;background:#f6f8fa;padding:8px 12px;border-radius:6px}.block{color:#cf222e}code{font-size:13px}
</style><h1>${esc(`Review: ${rv.mr.title}`)}</h1>
<p><a href="${esc(rv.mr.url)}">${esc(rv.mr.url)}</a><br>Reviewed head <code>${esc(rv.mr.head)}</code> against <code>${esc(rv.mr.target)}</code> (merge base <code>${esc(rv.mr.base.slice(0, 12))}</code>) · review mode: ${esc(rv.review_mode)}</p>
<div class="verdict"><b>${esc(result.verdict.replace(/_/g, ' '))}</b><ul>${result.reasons.map(x => `<li>${esc(x)}</li>`).join('') || '<li>Every gate that applies passed and nothing blocking is open.</li>'}</ul>
${result.waived.length ? `<p>Waived by the user: ${result.waived.map(esc).join(', ')}</p>` : ''}<p>Still for people: ${esc(result.still_human)}.</p></div>
<h2>Gates</h2><table><tr><th>Gate</th><th>Result</th><th>Note</th><th>Evidence</th></tr>${gateRows}</table>
${(rv.waivers || []).map(w => `<p><b>Waiver — ${esc(w.gate)}:</b> “${esc(w.user_response)}” (${esc(w.reason)})</p>`).join('')}
<h2>Findings</h2>${findings}
<h2>Validation evidence</h2>${review.GATES.map(g => { const list = idx.rendered.filter(x => x.gate === g); return list.length ? `<h3>${esc(g)}</h3>${figures(list)}` : ''; }).join('')}
${pairs ? `<h2>The app, before and after</h2><table><tr><th>Before — ${esc(rv.mr.target)}</th><th>After — this change</th></tr>${pairs}</table>` : ''}
${other.length ? `<h2>Other captures</h2>${figures(other)}` : ''}
${gaps.length ? `<h2>Gaps</h2><ul>${gaps.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
<h2>Appendix — receipts</h2><p>Each receipt keeps the full output with its SHA-256; the images above are renderings of these receipts.</p>
<table><tr><th>Id</th><th>What it shows</th><th>Command</th><th>Exit</th><th>stdout sha256</th></tr>${receipts}</table></html>`;
}

function html(runDir, output = 'report.html') {
  const root = fs.realpathSync(runDir), file = path.resolve(root, output);
  a.need(inside(root, file) && /\.html$/i.test(file), 'Report must be an .html file inside the run');
  const text = render(root);
  fs.writeFileSync(file, text, { flag: 'wx' });
  return { file: path.relative(root, file).replace(/\\/g, '/'), sha256: a.sha(text), images: (text.match(/src="data:image\//g) || []).length };
}

module.exports = { panel, snap, visuals, render, html, sourceLines };

if (require.main === module) (async () => {
  const [cmd, ...args] = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  let out;
  if (cmd === 'visuals') out = await visuals(args[0]);
  else if (cmd === 'shot') {
    const [run, url, file] = args;
    a.need(run && /^https?:\/\//.test(url || '') && file, 'usage: review-report.cjs shot <run> <http(s)-url> <visuals/name.png> [--width W] [--height H] [--wait ms]');
    out = await snap(fs.realpathSync(run), file, { url, width: Number(opt('--width') || 1280), height: Number(opt('--height') || 800), wait: Number(opt('--wait') || 3000), scale: 1 });
  } else if (cmd === 'html') out = html(args[0], args[1]);
  else if (cmd === 'pdf' || cmd === 'docx') out = await ex.convert(cmd, args[0], args[1] || 'report.' + cmd, render(args[0]));
  else { console.error('usage: review-report.cjs visuals <run> | shot <run> <url> <out.png> [--width W --height H --wait ms] | html <run> [out.html] | pdf|docx <run> [out]'); process.exitCode = 2; return; }
  console.log(JSON.stringify(out));
  if (out.status === 'unavailable' || out.verdict === 'EXPORT_UNAVAILABLE') process.exitCode = 3;
})().catch(e => { console.error('Review report blocked: ' + e.message); process.exitCode = 2; });
