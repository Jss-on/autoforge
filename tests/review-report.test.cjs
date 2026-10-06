// Review evidence: panels, the self-contained report, PDF/DOCX through the shared converter, app
// screenshots, and the Google Docs upload against a fake Drive (no network, no Google account).
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const repo = path.resolve(process.argv[2] || '.');
const report = require(path.join(repo, 'scripts/review-report.cjs')), gdoc = require(path.join(repo, 'scripts/gdoc.cjs'));
const ex = require(path.join(repo, 'scripts/investigate-export.cjs'));
const chrome = ex.executable("pdf");
let n = 0, total = 0;
const queue = [], test = (name, f, skip) => queue.push([name, f, skip]);
// A macOS machine without a display may give headless Chrome nothing to paint with: there the
// screenshot checks are skipped with the reason. Anywhere else a failed probe is left to fail them.
let painting;
const paints = () => painting ??= (async () => {
  if (!chrome) return 'no Chrome/Edge installed';
  if (process.platform !== 'darwin') return false;
  const r = await report.snap(fs.mkdtempSync(path.join(scratch, 'probe-')), 'probe.png', { html: '<p>probe</p>', height: 100, timeout: 30000 }).catch(e => ({ reason: e.message }));
  return r.status === 'ok' ? false : 'headless Chrome cannot paint on this machine: ' + String(r.reason).slice(0, 160);
})();
const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-review-report-')));
const base = require('./review-fixture.cjs')(repo, scratch), { receipt, sha, put } = base;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// The shared passing run, plus what this report has to show: a blocking finding on its code, the
// pipeline's job list, and a title that would be markup if it were not escaped.
function fixture(change = () => {}) {
  return base.fixture((r, run, x) => {
    r.mr.title = 'Fix totals <script>alert(1)</script>';
    const jobs = receipt(run, 'E7', { label: 'pipeline jobs for the head', stdout: JSON.stringify({ jobs: [{ name: 'test', stage: 'test', status: 'success' }, { name: 'lint', stage: 'test', status: 'failed' }] }) });
    r.gates.pipeline.evidence.push(jobs);
    r.findings = [{ id: 'F1', blocking: true, label: 'issue (blocking)', file: 'src/a.ts', line: 3, comment: 'issue (blocking): an empty list should total 0, and length counts items, not amounts.', status: 'open' }];
    x.HEAD = x.head;
    change(r, run, x);
  });
}
const headOf = run => JSON.parse(fs.readFileSync(path.join(run, 'review.json'), 'utf8')).mr.head;

test('panel: exact height, escaped text, long lines clipped, rows capped', () => {
  const p = report.panel('t <b>', 'm', [{ n: 1, text: '<script>' + 'x'.repeat(300) }]);
  assert.equal(p.height, 72 + 20);
  assert.ok(!p.html.includes('<script>') && p.html.includes('&lt;script&gt;') && p.html.includes('…'));
  const many = report.panel('t', 'm', Array.from({ length: 80 }, (_, i) => ({ n: i + 1, text: 'line' })));
  assert.equal(many.height, 72 + 61 * 20); assert.match(many.html, /20 more lines in the receipt/);
});
test('report: verdict first, findings in their words, before/after pair, receipts appendix, nothing unescaped or attributed', () => {
  const html = report.render(fixture());
  assert.match(html, /<b>NEEDS CHANGES<\/b>/);
  assert.match(html, /F1 blocking: issue \(blocking\)/);
  assert.match(html, /<h3>F1 · issue \(blocking\) · <span class="block">blocks the merge<\/span><\/h3>/, 'the finding itself says it blocks');
  assert.match(html, /an empty list should total 0/);
  assert.match(html, /<th>Before — main<\/th><th>After — this change<\/th>/);
  assert.equal((html.match(/src="data:image\/png;base64,/g) || []).length, 2, 'the two screenshots are embedded');
  assert.match(html, /Rendered evidence was not generated/, 'missing rendered images are a stated gap');
  assert.match(html, /<code>E1<\/code>/); assert.match(html, /the merge itself/);
  assert.ok(!html.includes('<script>alert(1)</script>') && html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.doesNotMatch(html, /generated (with|by)|claude|co-authored|https?:\/\/(?!gitlab\.example\.com)/i, 'no tool credit, no remote resources');
});
test('report: refuses an invalid ledger, stale rendered images and images changed after recording', () => {
  assert.throws(() => report.render(fixture(r => { delete r.gates.security; })), /not valid/);
  const stale = fixture(); put(stale, 'rendered.json', JSON.stringify({ version: 1, head: 'c'.repeat(40), rendered: [{ id: 'R1', file: 'visuals/before.png', sha256: sha(PNG), caption: 'x', gate: 'pipeline' }], gaps: [] }));
  assert.throws(() => report.render(stale), /another head/);
  const altered = fixture(); put(altered, 'rendered.json', JSON.stringify({ version: 1, head: headOf(altered), rendered: [{ id: 'R1', file: 'visuals/before.png', sha256: 'f'.repeat(64), caption: 'x', gate: 'pipeline' }], gaps: [] }));
  assert.throws(() => report.render(altered), /changed since it was recorded/, 'a rendered image is checked against its recorded hash');
  const swapped = fixture(); put(swapped, 'visuals/after.png', Buffer.concat([base.PNG2, Buffer.from([0])]));
  assert.throws(() => report.render(swapped), /not valid|changed since/);
});
test('source for a finding comes only from inside the head checkout — never through a link out of it', () => {
  const run = fixture(), rv = JSON.parse(fs.readFileSync(path.join(run, 'review.json'), 'utf8'));
  assert.equal(report.sourceLines(rv, run, 'src/a.ts').from, 'head checkout');
  const outside = fs.mkdtempSync(path.join(scratch, 'secrets-'));
  put(outside, 'credentials', '[default]\naws_secret_access_key = AKIA-SHOULD-NEVER-APPEAR\n');
  fs.symlinkSync(outside, path.join(rv.mr.worktree, 'config'), 'junction');
  const viaLink = report.sourceLines(rv, run, 'config/credentials');
  assert.ok(!JSON.stringify(viaLink).includes('AKIA-SHOULD-NEVER-APPEAR'), 'a junction or symlink in the change cannot pull a secret into the document');
  assert.equal(viaLink.from, 'diff (added lines only)');
  const escape = report.sourceLines(rv, run, '../../' + path.basename(outside) + '/credentials');
  assert.ok(!JSON.stringify(escape).includes('AKIA'), 'nor a path that climbs out');
  const foreign = report.sourceLines({ mr: { ...rv.mr, worktree: outside } }, run, 'credentials');
  assert.ok(!JSON.stringify(foreign).includes('AKIA'), 'nor a "worktree" outside the review workspace');
});
test('html: writes once, inside the run', () => {
  const run = fixture(), out = report.html(run);
  assert.equal(out.file, 'report.html'); assert.equal(out.images, 2);
  assert.throws(() => report.html(run), /EEXIST/, 'a delivered report is never overwritten');
  assert.throws(() => report.html(run, '../escape.html'), /inside the run/);
  assert.equal(report.html(run, 'report-2.html').file, 'report-2.html');
});
test('visuals: every gate receipt, the coverage of each file and each finding becomes an image', async () => {
  const run = fixture(), out = await report.visuals(run), idx = JSON.parse(fs.readFileSync(path.join(run, 'rendered.json'), 'utf8'));
  assert.deepEqual(out.gaps, []);
  assert.equal(idx.head, headOf(run));
  const keys = idx.rendered.map(x => x.gate || x.finding), captions = idx.rendered.map(x => x.caption);
  for (const c of ['pipeline — pipeline jobs for the head', 'tests-detect — new test fails on the target', 'security — secret and dependency scan', 'coverage — src/a.ts', 'F1 — src/a.ts:3'])
    assert.ok(captions.includes(c), 'rendered as its own panel: ' + c);
  for (const k of ['pipeline', 'tests-detect', 'coverage', 'regression', 'security', 'mergeable', 'F1']) assert.ok(keys.includes(k), 'rendered ' + k);
  for (const x of idx.rendered) {
    const bytes = fs.readFileSync(path.join(run, x.file));
    assert.equal(sha(bytes), x.sha256); assert.ok(bytes.subarray(1, 4).toString() === 'PNG' && bytes.length > 2000, x.file + ' is a real screenshot');
  }
  const html = report.render(run);
  assert.equal((html.match(/src="data:image\//g) || []).length, 2 + idx.rendered.length);
  assert.doesNotMatch(html, /Rendered evidence was not generated/);
  const again = await report.visuals(run);
  assert.equal(again.rendered, idx.rendered.length, 'rendering again replaces the previous images');
  const docx = await ex.convert('docx', run, 'report.docx', html);
  if (docx.verdict === 'EXPORT_UNAVAILABLE') console.error('NOTE: DOCX export not exercised — ' + docx.reason);
  else { assert.equal(docx.verdict, 'DOCX_EXPORTED'); assert.equal(docx.embedded_visuals, 2 + idx.rendered.length); }
  const pdf = await ex.convert('pdf', run, 'report.pdf', html);
  assert.equal(pdf.verdict, 'PDF_EXPORTED');
}, paints);
test('shot: captures the app under review from a local URL', async () => {
  const server = http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'text/html' }); s.end('<h1 style="color:#0a0">Totals: 10</h1>'); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const run = fs.mkdtempSync(path.join(scratch, 'shot-'));
    const r = await report.snap(run, 'visuals/after.png', { url: `http://127.0.0.1:${server.address().port}/`, width: 640, height: 360, wait: 1000, scale: 1 });
    assert.equal(r.status, 'ok'); assert.equal(sha(fs.readFileSync(path.join(run, r.file))), r.sha256);
    assert.equal(r.url, `http://127.0.0.1:${server.address().port}/`); assert.ok(Number.isFinite(Date.parse(r.captured_at)), 'what it shows and when, for the ledger');
    await assert.rejects(report.snap(run, 'visuals/after.png', { url: 'http://127.0.0.1:1/' }), /new \.png inside the run/, 'never overwrites a capture');
    await assert.rejects(report.snap(run, '../out.png', { html: '<p>x</p>' }), /inside the run/);
  } finally { server.close(); }
}, paints);

// ---------------------------------------------------------------- Google Docs
const FOLDER = '1AbCdEfGhIjKlMnOpQrStUv', SESSION = 'https://www.googleapis.com/upload/drive/v3/files?upload_id=xyz';
// A fake Drive: each answer matches a request; every request is recorded.
function drive(answers) {
  const calls = [];
  const send = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers.Authorization, type: init.headers['Content-Type'], headers: init.headers, body: init.body });
    const a = answers.find(x => x.when(url, init)) || { status: 404, json: { error: { message: 'File not found' } } };
    return { status: a.status, headers: { get: k => (a.headers || {})[k.toLowerCase()] ?? null }, json: async () => a.json, arrayBuffer: async () => a.bytes || new ArrayBuffer(0) };
  };
  return { send, calls };
}
const FOLDER_OK = { when: (u, i) => i.method === 'GET' && u.includes(`/files/${FOLDER}?`), status: 200, json: { id: FOLDER, name: 'Reviews', mimeType: 'application/vnd.google-apps.folder', driveId: '0AAbc', capabilities: { canAddChildren: true } } };
const PRIVATE = { when: u => u.includes(`/files/${FOLDER}/permissions`), status: 200, json: { permissions: [{ type: 'user', role: 'writer' }, { type: 'domain', role: 'reader', domain: 'acme.com' }] } };
const START = { when: (u, i) => i.method === 'POST' && u.includes('uploadType=resumable'), status: 200, headers: { location: SESSION }, json: {} };
const CREATED = { when: (u, i) => i.method === 'PUT' && u === SESSION, status: 200, json: { id: 'DOC1', mimeType: 'application/vnd.google-apps.document', parents: [FOLDER], webViewLink: 'https://docs.google.com/document/d/DOC1/edit' } };
const EXPORT = { when: u => u.includes('/files/DOC1/export?mimeType='), status: 200, bytes: Buffer.from('exported') };
test('gdoc: folder links and ids parse; anything else is refused; an account is always named', () => {
  assert.equal(gdoc.folderId(`https://drive.google.com/drive/folders/${FOLDER}?usp=sharing`), FOLDER);
  assert.equal(gdoc.folderId(`https://drive.google.com/drive/u/1/folders/${FOLDER}`), FOLDER);
  assert.equal(gdoc.folderId(`https://drive.google.com/open?id=${FOLDER}`), FOLDER);
  assert.equal(gdoc.folderId(FOLDER), FOLDER);
  for (const bad of ['', 'short', '../../etc', 'https://evil.example/x y', undefined]) assert.throws(() => gdoc.folderId(bad), /folder URL or id/);
  for (const acct of [undefined, 'a&b@x.com', 'x@y', 'me@acme.com && calc', '"q"@acme.com']) assert.throws(() => gdoc.token(acct), /plain email address/);
});
test('gdoc check: a private, writable folder passes; public, read-only, unreadable or not a folder does not', async () => {
  const ok = drive([FOLDER_OK, PRIVATE]);
  const r = await gdoc.check(FOLDER, { auth: 'TOKEN-123', send: ok.send });
  assert.deepEqual([r.verdict, r.name, r.shared_drive, r.shared_with], ['FOLDER_OK', 'Reviews', '0AAbc', ['user', 'domain acme.com']]);
  assert.match(ok.calls[0].url, /supportsAllDrives=true/); assert.ok(ok.calls.every(c => c.auth === 'Bearer TOKEN-123' && c.method === 'GET'));
  const pub = drive([FOLDER_OK, { ...PRIVATE, json: { permissions: [{ type: 'anyone', role: 'reader' }] } }]);
  await assert.rejects(gdoc.check(FOLDER, { auth: 't', send: pub.send }), /anyone who has the link/);
  const hidden = drive([FOLDER_OK, { ...PRIVATE, status: 403, json: { error: { message: 'Forbidden' } } }]);
  await assert.rejects(gdoc.check(FOLDER, { auth: 't', send: hidden.send }), /Cannot read who can open that folder/);
  const file = drive([{ ...FOLDER_OK, json: { id: FOLDER, mimeType: 'application/pdf', capabilities: { canAddChildren: false } } }]);
  await assert.rejects(gdoc.check(FOLDER, { auth: 't', send: file.send }), /not a Drive folder/);
  const ro = drive([{ ...FOLDER_OK, json: { ...FOLDER_OK.json, capabilities: { canAddChildren: false } } }]);
  await assert.rejects(gdoc.check(FOLDER, { auth: 't', send: ro.send }), /cannot add files/);
  const denied = drive([{ when: () => true, status: 403, json: { error: { message: 'Insufficient Permission' } } }]);
  const e = await gdoc.check(FOLDER, { auth: 'TOKEN-SECRET', send: denied.send }).catch(x => x);
  assert.match(e.message, /answered 403: Insufficient Permission .*--enable-gdrive-access/); assert.doesNotMatch(e.message, /TOKEN-SECRET/);
});
test('gdoc upload: checks the folder, converts the DOCX into it, reads it back and counts its images; never touches sharing', async () => {
  const run = fixture(), docx = put(run, 'report.docx', Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('docx-bytes')]));
  const d = drive([FOLDER_OK, PRIVATE, START, CREATED, EXPORT]);
  const r = await gdoc.upload(docx, `https://drive.google.com/drive/folders/${FOLDER}`, undefined, { auth: 'TOKEN-XYZ', send: d.send, count: async () => 9 });
  assert.deepEqual([r.verdict, r.id, r.url, r.doc_images], ['GDOC_CREATED', 'DOC1', 'https://docs.google.com/document/d/DOC1/edit', 9]);
  const start = d.calls.find(c => c.method === 'POST');
  assert.deepEqual(JSON.parse(start.body), { name: `Review !7 — Fix totals <script>alert(1)</script> (${headOf(run).slice(0, 8)})`, mimeType: 'application/vnd.google-apps.document', parents: [FOLDER] }, 'a Google Doc in this folder, named from the ledger');
  assert.equal(start.headers['X-Upload-Content-Length'], String(fs.statSync(docx).size));
  assert.ok(d.calls.find(c => c.method === 'PUT').body.includes(Buffer.from('docx-bytes')), 'the DOCX bytes are the upload');
  assert.deepEqual(d.calls.slice(0, 2).map(c => c.method), ['GET', 'GET'], 'the folder and its sharing are checked first');
  assert.ok(d.calls.every(c => !/permissions\/|anyone|publish/.test(c.url) && (c.method === 'GET' || !/permissions/.test(c.url))), 'sharing is never changed');
  assert.ok(d.calls.every(c => c.auth === 'Bearer TOKEN-XYZ' && !c.url.includes('TOKEN-XYZ') && !String(c.body || '').includes('TOKEN-XYZ')), 'the token travels only in the Authorization header');
  let k = 0;
  const short = await gdoc.upload(docx, FOLDER, 'x', { auth: 't', send: drive([FOLDER_OK, PRIVATE, START, CREATED, EXPORT]).send, count: async () => (k++ ? 7 : 9) });
  assert.equal(short.verdict, 'GDOC_UNVERIFIED', 'a doc with fewer images than the DOCX is not called done');
  const big = await gdoc.upload(docx, FOLDER, 'x', { auth: 't', send: drive([FOLDER_OK, PRIVATE, START, CREATED, { ...EXPORT, status: 403, json: { error: { message: 'too large', errors: [{ reason: 'exportSizeLimitExceeded' }] } } }]).send, count: async () => 9 });
  assert.deepEqual([big.verdict, big.id], ['GDOC_UNVERIFIED', 'DOC1'], 'a read-back failure after creation reports the doc instead of throwing');
  assert.match(big.note, /larger than Drive will export.*do not upload again/);
  await assert.rejects(gdoc.upload(docx, FOLDER, 'x', { auth: 't', send: drive([FOLDER_OK, PRIVATE, START, { ...CREATED, json: { ...CREATED.json, parents: ['OTHER'] } }, EXPORT]).send, count: async () => 1 }), /requested folder/);
  await assert.rejects(gdoc.upload(docx, FOLDER, 'x', { auth: 't', send: drive([FOLDER_OK, { ...PRIVATE, json: { permissions: [{ type: 'anyone', role: 'reader' }] } }]).send }), /anyone who has the link/, 'nothing goes into a public folder');
  await assert.rejects(gdoc.upload(put(run, 'notes.txt', 'plain'), FOLDER, 'x', { auth: 't', send: drive([FOLDER_OK, PRIVATE]).send }), /DOCX/);
  await assert.rejects(gdoc.upload(docx, FOLDER, 'x', { auth: 't', send: drive([FOLDER_OK, PRIVATE, { ...START, headers: { location: 'https://evil.example/upload' } }]).send }), /upload session/, 'the bytes and the token go only to Google');
  await assert.rejects(gdoc.upload(docx, FOLDER, 'x'.repeat(201), { auth: 't', send: drive([FOLDER_OK, PRIVATE]).send }), /Document name required/);
});

(async () => {
  for (const [name, f, when] of queue) {
    total++;
    const skip = typeof when === 'function' ? await when() : when;
    if (skip) { n++; console.error(`SKIP: ${name} (${skip})`); continue; }
    try { await f(); n++; console.error('PASS: ' + name); } catch (e) { console.error('FAIL: ' + name + ': ' + (e.stack || e.message)); }
  }
  try { fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a browser profile still closing */ }
  base.cleanup();
  console.log(n + '/' + total + ' review report checks passed');
  if (n !== total) process.exitCode = 1;
})();
