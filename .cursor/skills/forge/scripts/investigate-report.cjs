// Portable visual investigation reports. Images are retained evidence, never generated here.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const a = require('./acceptance.cjs');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const id = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(value);
const inside = (root, file) => { const rel = path.relative(root, file); return !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep); };
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lines = value => value === '' ? [] : value.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');

function imageType(bytes) {
  if (bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
      bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(8) === 13 &&
      bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0 && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND') return 'image/png';
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) return 'image/jpeg';
  if (bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' &&
      bytes.readUInt32LE(4) + 8 === bytes.length && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16))) return 'image/webp';
  throw Error('Visual must have PNG, JPEG, or WebP image bytes; SVG/HTML and unknown formats are not accepted');
}

function validateVisuals(runDirectory, c) {
  const root = fs.realpathSync(runDirectory), visuals = c.visuals ?? [], result = new Map();
  a.need(Array.isArray(visuals) && visuals.length <= 32, 'visuals must be an array of at most 32 images');
  a.need(c.visual_gaps === undefined || (Array.isArray(c.visual_gaps) && c.visual_gaps.every(a.text)), 'visual_gaps must contain nonempty strings');
  const claims = new Set((c.claims ?? []).map(claim => claim.id));
  const occupied = new Set([...claims, ...(c.questions ?? []).map(question => question.id)]);
  let total = 0;
  for (const visual of visuals) {
    a.need(a.object(visual) && id(visual.id) && !occupied.has(visual.id) && !result.has(visual.id), 'Invalid or duplicate visual ID');
    a.need(['screenshot', 'reproduction', 'annotated', 'diagram'].includes(visual.kind) &&
      ['tool_capture', 'user_provided', 'agent_saved'].includes(visual.acquisition), 'Invalid visual kind or acquisition');
    a.need(['caption', 'source', 'scope', 'limitations'].every(key => a.text(visual[key])) &&
      typeof visual.captured_at === 'string' && (Number.isFinite(Date.parse(visual.captured_at)) ||
        (visual.captured_at === 'unknown' && visual.acquisition !== 'tool_capture')), 'Visual needs caption, source, captured_at, scope, and limitations');
    a.need(visual.include_in_report === undefined || typeof visual.include_in_report === 'boolean', 'include_in_report must be boolean');
    a.need(visual.alt === undefined || a.text(visual.alt), 'Visual alt must be a nonempty string');
    a.need(Array.isArray(visual.claims) && visual.claims.length > 0 && new Set(visual.claims).size === visual.claims.length && visual.claims.every(value => claims.has(value)), 'Visual needs unique existing claim references');
    a.need(a.digest(visual.sha256), 'Visual needs a SHA-256 digest');
    a.need(/\.(?:png|jpe?g|webp)$/i.test(visual.file ?? ''), 'Visual filename must end in .png, .jpg, .jpeg, or .webp');
    const file = a.local(root, visual.file), size = fs.statSync(file).size;
    total += size;
    a.need(size > 0 && size <= 8 * 1024 * 1024 && total <= 32 * 1024 * 1024, 'Visual bounds: 8 MiB per image and 32 MiB total');
    const bytes = fs.readFileSync(file), mime = imageType(bytes);
    a.need(a.sha(bytes) === visual.sha256, 'Altered visual bytes: ' + visual.id);
    a.need(({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' })[path.extname(file).toLowerCase()] === mime, 'Visual filename does not match image bytes');
    if (visual.kind === 'annotated' || visual.derived_from !== undefined) {
      a.need(result.has(visual.derived_from) && a.text(visual.transformations), 'Annotated/derived visual needs a retained earlier original and transformations');
      a.need(!['screenshot', 'reproduction'].includes(visual.kind), 'Derived images must be labelled annotated or diagram');
      a.need(visual.kind !== 'annotated' || result.get(visual.derived_from).kind !== 'diagram', 'A diagram cannot be promoted to source evidence through annotation');
    } else a.need(visual.transformations === undefined, 'Visual transformations require derived_from');
    result.set(visual.id, { ...visual, mime, bytes });
  }
  return result;
}

const EDIT_SCRIPT = `
const editButton = document.getElementById('edit'), saveButton = document.getElementById('save');
function markDraft() {
  document.getElementById('draft').hidden = false;
  document.title = 'UNVERIFIED HUMAN DRAFT — Investigation report';
}
editButton.addEventListener('click', () => {
  const editing = editButton.getAttribute('aria-pressed') !== 'true';
  editButton.setAttribute('aria-pressed', String(editing));
  editButton.textContent = editing ? 'Finish editing' : 'Edit narrative';
  document.querySelectorAll('[data-editable]').forEach(node => node.setAttribute('contenteditable', editing ? 'plaintext-only' : 'false'));
  if (editing) markDraft();
});
document.querySelectorAll('[data-editable]').forEach(node => node.addEventListener('input', markDraft));
document.getElementById('print').addEventListener('click', () => window.print());
saveButton.addEventListener('click', () => {
  markDraft();
  const copy = document.documentElement.cloneNode(true);
  copy.querySelectorAll('[data-editable]').forEach(node => { node.textContent = node.textContent; node.setAttribute('contenteditable', 'false'); });
  copy.querySelector('#edit').setAttribute('aria-pressed', 'false');
  copy.querySelector('#edit').textContent = 'Edit narrative';
  const url = URL.createObjectURL(new Blob(['<!doctype html>\\n' + copy.outerHTML], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'investigation-edited-draft.html'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
`;

function renderDocument(root, c, checked, visuals, interactive) {
  const prose = (value, editable = false) => `<p${editable ? ' data-editable contenteditable="false"' : ''}>${escape(value)}</p>`;
  const claimLinks = ids => ids.map(value => `<a href="#claim-${escape(value)}">${escape(value)}</a>`).join(', ');
  const excerpts = [];
  const citation = ref => {
    if (ref.visual) return `<a href="#visual-${escape(ref.visual)}">Visual ${escape(ref.visual)}</a>`;
    const receiptId = path.basename(ref.receipt, '.json'), receipt = json(a.local(root, ref.receipt));
    const label = ref.field ? ref.field : `${ref.stream} lines ${ref.start_line}–${ref.end_line}`;
    const excerpt = ref.field ? (receipt[ref.field] === '' ? '[empty stream]' : String(receipt[ref.field])) :
      lines(receipt[ref.stream]).slice(ref.start_line - 1, ref.end_line).map((line, index) => `${ref.start_line + index}: ${line}`).join('\n');
    const key = excerpts.length + 1;
    excerpts.push(`<article id="excerpt-${key}" class="evidence"><h3>${escape(receiptId)} · ${escape(label)}</h3>
      <dl><dt>Source</dt><dd>${escape(receipt.source)}</dd><dt>Scope</dt><dd>${escape(receipt.scope)}</dd>
      <dt>Acquisition</dt><dd>${escape(receipt.acquisition)} · completeness: ${escape(receipt.completeness)}</dd>
      <dt>Captured</dt><dd>${escape(receipt.started_at ?? receipt.captured_at)}</dd>
      ${receipt.argv ? `<dt>Executed argv</dt><dd><code>${escape(JSON.stringify(receipt.argv))}</code></dd><dt>Exit code</dt><dd>${escape(receipt.exit_code)}</dd>` : ''}</dl>
      <pre>${escape(excerpt)}</pre><p>Retained file: ${escape(ref.receipt)}. This excerpt is not editable in the report.</p></article>`);
    return `<a href="#excerpt-${key}">${escape(receiptId)}: ${escape(label)}</a>`;
  };
  const claims = c.claims.map(claim => `<article id="claim-${escape(claim.id)}" class="claim"><h3>${escape(claim.id)} <span class="badge">${escape(claim.kind)}</span></h3>
    ${prose(claim.text)}${claim.reasoning ? `<p><strong>Reasoning:</strong> ${escape(claim.reasoning)}</p>` : ''}
    <p><strong>Limits:</strong> ${escape(claim.limitations)}</p>
    <p><strong>Evidence:</strong> ${claim.evidence.length ? claim.evidence.map(citation).join('; ') : 'No evidence established; unknown.'}</p>
    ${claim.counterevidence?.length ? `<p><strong>Counterevidence:</strong> ${claim.counterevidence.map(citation).join('; ')}</p>` : ''}</article>`).join('\n');
  const figureLabels = { screenshot: 'Source screenshot / snapshot', reproduction: 'Reproduction capture — conditions may differ from incident', annotated: 'Annotated derivative — consult retained original', diagram: 'Explanatory diagram — not direct evidence of the incident' };
  const figures = [...visuals.values()].map(visual => visual.include_in_report === false ?
    `<article id="visual-${escape(visual.id)}" class="evidence"><h3>${escape(visual.id)} · Restricted retained original</h3><p>This visual is excluded from the report. Its image bytes and metadata are not embedded or printed. Review its approved derivative when available.</p></article>` :
    `<figure id="visual-${escape(visual.id)}" class="evidence"><h3>${escape(visual.id)} · ${escape(figureLabels[visual.kind])}</h3>
    <img src="data:${visual.mime};base64,${visual.bytes.toString('base64')}" alt="${escape(visual.alt ?? visual.caption)}">
    <figcaption>${escape(visual.caption)}</figcaption><dl>
    <dt>Source</dt><dd>${escape(visual.source)}</dd><dt>Captured</dt><dd>${escape(visual.captured_at)}</dd>
    <dt>Scope</dt><dd>${escape(visual.scope)}</dd><dt>Limits</dt><dd>${escape(visual.limitations)}</dd>
    <dt>Acquisition (declared)</dt><dd>${escape(visual.acquisition)}</dd><dt>Related claims</dt><dd>${claimLinks(visual.claims)}</dd>
    ${visual.derived_from ? `<dt>Retained original</dt><dd><a href="#visual-${escape(visual.derived_from)}">${escape(visual.derived_from)}</a></dd><dt>Transformations</dt><dd>${escape(visual.transformations)}</dd>` : ''}
    <dt>Retained file</dt><dd>${escape(visual.file)}</dd><dt>SHA-256</dt><dd><code>${escape(visual.sha256)}</code></dd></dl></figure>`).join('\n');
  const scriptHash = crypto.createHash('sha256').update(EDIT_SCRIPT).digest('base64');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; base-uri 'none'; form-action 'none'; object-src 'none'; connect-src 'none'">
<title>Investigation report</title><style>
:root{color-scheme:light;font:17px/1.6 system-ui,sans-serif;color:#172338;background:#eef2f6}body{margin:auto;max-width:1000px;padding:32px}main{background:white;padding:40px;border-radius:12px}h1,h2,h3{line-height:1.25}h2{margin-top:2em;border-top:1px solid #ccd5df;padding-top:1em}p{white-space:pre-wrap}a{color:#134e95}code{overflow-wrap:anywhere}pre{background:#f1f4f8;white-space:pre-wrap;overflow-wrap:anywhere;padding:16px}figure{margin:24px 0}img{display:block;max-width:100%;height:auto;border:1px solid #ccd5df}figcaption{font-weight:600;margin:12px 0}dt{font-weight:600}dd{margin-left:0;margin-bottom:8px;overflow-wrap:anywhere}.claim,.evidence{border:1px solid #ccd5df;padding:20px;border-radius:8px;margin:20px 0}.badge{font-size:.8em;border:1px solid #8097b2;border-radius:6px;padding:2px 8px}.notice{border-left:4px solid #b76a06;background:#fff6e9;padding:12px 20px}.toolbar{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px}button{font:inherit;padding:8px 14px;border:1px solid #5c718b;border-radius:6px;background:#fff;cursor:pointer}button:focus-visible,a:focus-visible,[contenteditable]:focus-visible{outline:3px solid #216fc6;outline-offset:3px}[contenteditable="plaintext-only"]{outline:2px dashed #4d77a9;outline-offset:4px}small{color:#42556d}[hidden]{display:none!important}@media print{body{max-width:none;padding:0;background:white;font-size:11pt}main{padding:0}.toolbar,.edit-help{display:none}img{max-height:220mm;object-fit:contain}figure,pre{break-inside:avoid}h2,h3{break-after:avoid}a{color:inherit}article{break-inside:auto}.claim,.evidence{padding:12px}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}@page{size:auto;margin:16mm}
@media print{h2{margin-top:1em;padding-top:.6em}h3{margin:.8em 0 .5em}p{margin:.55em 0}figure{break-inside:auto}img{max-height:170mm;break-inside:avoid;break-after:avoid}figcaption{break-before:avoid}dt{break-after:avoid}}
</style></head><body>
${interactive ? `<div class="toolbar"><button id="edit" aria-pressed="false">Edit narrative</button><button id="save">Save edited copy</button><button id="print">Print / save PDF</button></div>
<p class="edit-help">Edit the issue, answers, conclusion, and next actions, then save a separate HTML draft. Figures, claims, and evidence excerpts stay fixed. Your source investigation files are unchanged. Print / save PDF creates a reading copy.</p>` : ''}
<main><h1>Investigation report</h1>
${interactive ? '<aside id="draft" class="notice" hidden><strong>UNVERIFIED HUMAN DRAFT</strong><p>The narrative has been opened for editing or saved as an edited copy. Its changes have not been checked against the retained evidence. Structural verification below applies to the original case only.</p></aside>' : ''}
<p><strong>Conclusion assessment:</strong> ${escape(c.conclusion.status)} · analyst-assessed</p>
<h2>The issue and scope</h2>${prose(c.issue, true)}${prose(c.scope, true)}
<h2>Findings in plain language</h2>${prose(c.conclusion.text, true)}<p><strong>Supporting claims:</strong> ${claimLinks(c.conclusion.claims)}</p><p><strong>What remains uncertain:</strong> ${escape(c.conclusion.limitations)}</p>
<h2>Questions and answers</h2>${c.questions.map(q => `<article><h3>${escape(q.text)}</h3>${prose(q.answer, true)}<p>Supporting claims: ${claimLinks(q.claims)}</p></article>`).join('\n')}
${c.report ? `<h2>What the research explains</h2>${prose(c.report.research.text, true)}<p>Supporting claims: ${claimLinks(c.report.research.claims)}</p>` : ''}
<h2>Visual evidence and explanation</h2>${figures || '<p class="notice">No visual evidence attached. This report does not imply that screenshots were captured.</p>'}
${c.visual_gaps?.length ? `<h3>Visual evidence gaps</h3><ul>${c.visual_gaps.map(gap => `<li>${escape(gap)}</li>`).join('')}</ul>` : ''}
<p>Image provenance and capture time are declared by the investigator or provider. File hashes detect later changes; they do not authenticate a source or prove that a screenshot depicts the reported incident.</p>
<h2>Claims, interpretation, and limitations</h2><p>Reported: someone described it. Observed: retained evidence directly shows a scoped fact. Inferred: an explanation with reasoning. Hypothesis: a possibility requiring a test. Unknown: evidence does not answer it.</p>${claims}
<h2>Next actions</h2>${c.next_steps.length ? c.next_steps.map(step => prose(step, true)).join('\n') : '<p>No next action recorded.</p>'}
${c.report ? `<h2>Expected versus delivered results</h2>${prose(c.report.delivery, true)}<h2>Stakeholder reply draft</h2>${prose(c.report.stakeholder_reply.text, true)}<p>Supporting claims: ${claimLinks(c.report.stakeholder_reply.claims)}</p><p>This draft has not been sent to stakeholders.</p>` : ''}
<h2>Evidence appendix</h2>${excerpts.join('\n') || '<p>No command-output excerpts are cited.</p>'}
<h2>Review and verification</h2><p>Review mode: ${escape(c.review.mode)}</p>${prose(c.review.findings)}
<p>Original case structural check: ${escape(checked.verdict)}. ${escape(checked.verification_limitations)}</p>
${checked.warnings?.length ? `<ul>${checked.warnings.map(warning => `<li>${escape(warning)}</li>`).join('')}</ul>` : ''}
<p><small>Self-contained report generated ${escape(new Date().toISOString())}. Images and cited excerpts are embedded; external services are not contacted. Original case SHA-256: ${a.sha(fs.readFileSync(a.local(root, 'case.json')))}.</small></p>
</main>${interactive ? `<script>${EDIT_SCRIPT}</script>` : ''}</body></html>\n`;
}

function render(runDirectory, { interactive = true } = {}) {
  a.need(typeof interactive === 'boolean', 'interactive must be boolean');
  const root = fs.realpathSync(runDirectory);
  // Defer this import: the base checker also uses validateVisuals from this module.
  const checked = require('./investigate.cjs').check(root), c = json(a.local(root, 'case.json'));
  return renderDocument(root, c, checked, validateVisuals(root, c), interactive);
}

function html(runDirectory, output = 'report.html') {
  const root = fs.realpathSync(runDirectory), source = render(root);
  a.need(a.text(output) && /\.html$/i.test(output) && !/[\\:]/.test(output) && !path.isAbsolute(output) &&
    !output.split('/').some(part => ['', '.', '..'].includes(part)), 'Output must be a relative .html path inside the run');
  const out = path.resolve(root, output);
  a.need(inside(root, out) && inside(root, fs.realpathSync(path.dirname(out))), 'Report output escapes run directory');
  fs.writeFileSync(out, source, { flag: 'wx' });
  const visuals = json(a.local(root, 'case.json')).visuals ?? [];
  return { verdict: 'HTML_EXPORTED', file: output, sha256: a.sha(source), visual_count: visuals.length,
    embedded_visuals: visuals.filter(visual => visual.include_in_report !== false).length,
    editable: true, pdf: 'Open the HTML report and choose Print / save PDF.' };
}

module.exports = { validateVisuals, render, html };
if (require.main === module) {
  try {
    const [action, ...args] = process.argv.slice(2);
    a.need(action === 'html' && args.length >= 1 && args.length <= 2, 'html <run-dir> [output-relative.html]');
    console.log(JSON.stringify(html(...args)));
  } catch (error) { console.error(JSON.stringify({ verdict: 'REPORT_FAILED', error: error.message })); process.exitCode = 2; }
}
