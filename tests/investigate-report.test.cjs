const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict'), cp = require('node:child_process'), crypto = require('node:crypto'), vm = require('node:vm');
const repo = path.resolve(process.argv[2] || '.'), r = require(path.join(repo, 'scripts/investigate-report.cjs')), a = require(path.join(repo, 'scripts/acceptance.cjs'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-investigate-report-'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
let sequence = 0, passed = 0, failed = 0;
function fixture() {
  const root = path.join(tmp, String(++sequence)); fs.mkdirSync(root); fs.mkdirSync(path.join(root, 'receipts')); fs.mkdirSync(path.join(root, 'visuals'));
  const put = (file, value) => fs.writeFileSync(path.join(root, file), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
  const data = { version: 1, issue: 'Synthetic test fixture: QA reports a failure', scope: 'Local synthetic test only',
    questions: [{ id: 'Q1', text: 'What was observed?', answer: 'The fixture includes a failure record.', claims: ['C1'] }],
    claims: [{ id: 'C1', text: 'The retained output records a failure.', kind: 'observed', evidence: [{ receipt: 'receipts/E1.json', stream: 'stdout', start_line: 1, end_line: 1 }], limitations: 'Synthetic fixture, not a real incident.' }],
    review: { mode: 'self', findings: 'Synthetic fixture reviewed by its author.' },
    conclusion: { status: 'supported', text: 'The fixture records a failure.', claims: ['C1'], limitations: 'Cause unknown.' }, next_steps: ['Inspect the actual incident.'],
    visuals: [{ id: 'V1', file: 'visuals/test.png', sha256: a.sha(png), kind: 'screenshot', caption: 'Synthetic fixture image, not a real screenshot', source: 'Local test fixture', captured_at: '2026-10-04T00:00:00Z', scope: 'Synthetic test', limitations: 'One-pixel fixture verifies embedding only.', claims: ['C1'], acquisition: 'user_provided' }] };
  const receipt = { version: 1, id: 'E1', acquisition: 'agent_saved', source: 'Synthetic fixture tool response', scope: data.scope, captured_at: '2026-10-04T00:00:00Z', completeness: 'unknown', stdout: 'request=42 status=500\n', stderr: '', exit_code: null };
  const saveReceipt = () => { receipt.stdout_sha256 = a.sha(receipt.stdout); receipt.stderr_sha256 = a.sha(receipt.stderr); put('receipts/E1.json', receipt); };
  put('visuals/test.png', png); saveReceipt(); const save = () => put('case.json', data); save();
  return { root, put, data, receipt, save, saveReceipt, render: () => { save(); return r.render(root); }, validate: () => r.validateVisuals(root, data) };
}
function test(name, run) { try { run(); passed++; console.error('PASS: ' + name); } catch (error) { failed++; console.error('FAIL: ' + name + ': ' + error.stack); } }
try {
  test('portable HTML embeds actual retained bytes, excerpts, provenance, and uncertainty', () => {
    const f = fixture(), html = f.render();
    assert.ok(html.includes('data:image/png;base64,' + png.toString('base64')));
    for (const expected of ['1: request=42 status=500', 'Cause unknown.', 'Source screenshot / snapshot', 'Synthetic fixture image', 'Local test fixture', '2026-10-04T00:00:00Z', 'agent_saved', 'STRUCTURE_VALID', 'not authenticate a source', 'href="#claim-C1"', 'href="#excerpt-1"']) assert.ok(html.includes(expected), expected);
    assert.equal((html.match(/<script>/g) || []).length, 1);
    assert.ok(!/<(?:script|img|link)[^>]+(?:src|href)="https?:/.test(html));
  });
  test('all imported prose and excerpts are escaped instead of executing markup', () => {
    const f = fixture(), payload = '<img src=x onerror="alert(1)"><script>injected()</script>&';
    f.data.issue = payload; f.data.visuals[0].caption = payload; f.data.visuals[0].source = payload; f.data.visuals[0].alt = payload;
    f.data.conclusion.text = payload; f.data.questions[0].answer = payload; f.data.claims[0].text = payload;
    f.receipt.stdout = payload + '\n'; f.saveReceipt();
    const html = f.render(); assert.ok(!html.includes(payload)); assert.ok(html.includes('&lt;script&gt;injected()&lt;/script&gt;'));
    assert.equal((html.match(/<script>/g) || []).length, 1);
  });
  test('report generator checks original case before producing any output', () => {
    const f = fixture(); f.data.claims[0].evidence[0].end_line = 100; f.save();
    assert.throws(() => r.html(f.root), /Citation outside retained stream/); assert.equal(fs.existsSync(path.join(f.root, 'report.html')), false);
  });
  test('changed image bytes are rejected and no report is written', () => {
    const f = fixture(); f.data.visuals[0].sha256 = '0'.repeat(64); f.save();
    assert.throws(() => r.html(f.root), /Altered visual bytes/); assert.equal(fs.existsSync(path.join(f.root, 'report.html')), false);
  });
  test('SVG HTML and mismatched raster extensions are rejected', () => {
    const f = fixture();
    for (const [file, bytes] of [['visuals/fake.svg', Buffer.from('<svg/>')], ['visuals/fake.png', Buffer.from('<html><script>bad()</script></html>')], ['visuals/fake.jpg', png]]) {
      f.put(file, bytes); f.data.visuals[0].file = file; f.data.visuals[0].sha256 = a.sha(bytes);
      assert.throws(f.validate, /filename|image bytes/);
    }
  });
  test('input traversal and directory symlink escapes are rejected', () => {
    const f = fixture(), outside = path.join(tmp, 'outside'); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'test.png'), png);
    f.data.visuals[0].file = '../outside/test.png'; assert.throws(f.validate, /relative input/);
    fs.symlinkSync(outside, path.join(f.root, 'external'), process.platform === 'win32' ? 'junction' : 'dir');
    f.data.visuals[0].file = 'external/test.png'; assert.throws(f.validate, /escapes root/);
  });
  test('output is contained and exclusive; existing files and linked directories stay unchanged', () => {
    const f = fixture(), out = r.html(f.root); assert.equal(out.file, 'report.html'); assert.equal(out.embedded_visuals, 1);
    const original = fs.readFileSync(path.join(f.root, out.file)); assert.equal(a.sha(original), out.sha256);
    assert.throws(() => r.html(f.root), /EEXIST/); assert.deepEqual(fs.readFileSync(path.join(f.root, out.file)), original);
    for (const file of ['../escaped.html', '/escaped.html', 'C:/escaped.html', 'bad\\name.html', 'report.txt']) assert.throws(() => r.html(f.root, file), /relative .html/);
    const outside = path.join(tmp, 'outside-report'); fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(f.root, 'external'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => r.html(f.root, 'external/out.html'), /output escapes/); assert.deepEqual(fs.readdirSync(outside), []);
  });
  test('visual IDs claim references and metadata cannot be fabricated or duplicated', () => {
    const f = fixture(), original = { ...f.data.visuals[0] };
    for (const change of [{ id: 'C1' }, { id: '<bad>' }, { claims: ['missing'] }, { claims: ['C1', 'C1'] }, { captured_at: 'invented' }, { caption: '' }, { include_in_report: 'false' }, { acquisition: 'generated' }]) {
      f.data.visuals = [{ ...original, ...change }]; assert.throws(f.validate);
    }
    f.data.visuals = [original, original]; assert.throws(f.validate, /duplicate visual/);
  });
  test('unknown supplied capture dates remain unknown; tool captures require a date', () => {
    const f = fixture(); f.data.visuals[0].captured_at = 'unknown'; assert.ok(f.render().includes('<dd>unknown</dd>'));
    f.data.visuals[0].acquisition = 'tool_capture'; assert.throws(f.validate, /captured_at/);
  });
  test('annotated images retain a linked original and transformation history', () => {
    const f = fixture(); f.data.visuals.push({ ...f.data.visuals[0], id: 'V2', kind: 'annotated', derived_from: 'V1', transformations: 'Synthetic test: added annotation.' });
    let html = f.render(); assert.ok(html.includes('href="#visual-V1"')); assert.ok(html.includes('Synthetic test: added annotation.'));
    f.data.visuals[1].derived_from = 'V2'; assert.throws(f.validate, /retained earlier original/);
    f.data.visuals[1].derived_from = 'missing'; assert.throws(f.validate, /retained earlier original/);
    f.data.visuals[1].derived_from = 'V1'; delete f.data.visuals[1].transformations; assert.throws(f.validate, /transformations/);
    f.data.visuals[1].transformations = 'Cropped'; f.data.visuals[1].kind = 'screenshot'; assert.throws(f.validate, /labelled annotated/);
  });
  test('restricted originals never embed image bytes or metadata', () => {
    const f = fixture(); f.data.visuals[0].include_in_report = false; f.data.visuals[0].caption = 'PRIVATE_CAPTION'; f.data.visuals[0].source = 'PRIVATE_SOURCE';
    const html = f.render(); assert.ok(html.includes('Restricted retained original'));
    assert.ok(!html.includes(png.toString('base64'))); assert.ok(!html.includes('PRIVATE_CAPTION')); assert.ok(!html.includes('PRIVATE_SOURCE')); assert.ok(!html.includes('visuals/test.png'));
    assert.equal(r.html(f.root).embedded_visuals, 0);
  });
  test('reproductions and diagrams are visibly differentiated from source screenshots', () => {
    const f = fixture(); f.data.visuals[0].kind = 'reproduction'; assert.ok(f.render().includes('conditions may differ from incident'));
    f.data.visuals[0].kind = 'diagram'; assert.ok(f.render().includes('not direct evidence of the incident'));
  });
  test('absent visuals remain explicit and recorded gaps are rendered', () => {
    const f = fixture(); delete f.data.visuals; f.data.visual_gaps = ['No approved source screenshot is available.'];
    const html = f.render(); assert.ok(html.includes('No visual evidence attached')); assert.ok(html.includes(f.data.visual_gaps[0])); assert.ok(!html.includes('<img'));
  });
  test('image count size and aggregate bounds reject excessive input before embedding', () => {
    const f = fixture(), visual = f.data.visuals[0]; f.data.visuals = Array.from({ length: 33 }, (_, i) => ({ ...visual, id: 'V' + i })); assert.throws(f.validate, /at most 32/);
    f.data.visuals = [visual]; const huge = Buffer.alloc(8 * 1024 * 1024 + 1); f.put(visual.file, huge); visual.sha256 = a.sha(huge); assert.throws(f.validate, /8 MiB/);
  });
  test('edit controls mark draft and save only text changes, leaving evidence immutable', () => {
    const f = fixture(), html = f.render(), script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
    const handlers = {}, nodes = {};
    for (const name of ['edit', 'save', 'print', 'draft']) nodes[name] = { hidden: true, attrs: {}, textContent: '', addEventListener: (event, fn) => { handlers[name + ':' + event] = fn; }, setAttribute(key, value) { this.attrs[key] = value; }, getAttribute(key) { return this.attrs[key]; } };
    let sanitized = false, downloaded = '', printed = false;
    const narrative = { attrs: {}, addEventListener() {}, setAttribute(key, value) { this.attrs[key] = value; } };
    const copiedNarrative = { get textContent() { return 'edited plain text'; }, set textContent(value) { sanitized = value === 'edited plain text'; }, setAttribute() {} };
    const copiedEdit = { setAttribute() {}, textContent: '' };
    const document = { title: '', getElementById: id => nodes[id], querySelectorAll: () => [narrative], createElement: () => ({ click() {} }),
      documentElement: { cloneNode: () => ({ querySelectorAll: () => [copiedNarrative], querySelector: () => copiedEdit, outerHTML: '<html>synthetic serialized draft</html>' }) } };
    vm.runInNewContext(script, { document, window: { print: () => { printed = true; } }, Blob: class { constructor(parts) { downloaded = parts.join(''); } }, URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, setTimeout: fn => fn() });
    handlers['edit:click'](); assert.equal(nodes.draft.hidden, false); assert.match(document.title, /UNVERIFIED HUMAN DRAFT/); assert.equal(narrative.attrs.contenteditable, 'plaintext-only');
    handlers['save:click'](); assert.equal(sanitized, true); assert.ok(downloaded.startsWith('<!doctype html>\n')); handlers['print:click'](); assert.equal(printed, true);
    assert.ok(!/<(?:figure|pre|article)[^>]*data-editable/.test(html));
    const hash = crypto.createHash('sha256').update(script).digest('base64'); assert.ok(html.includes("script-src 'sha256-" + hash + "'"));
    assert.ok(html.includes('@media print'));
  });
  test('CLI produces an inspectable report and fails on an invalid command', () => {
    const f = fixture();
    const invoke = (...args) => cp.spawnSync(process.execPath, [path.join(repo, 'scripts/investigate-report.cjs'), ...args], { encoding: 'utf8', windowsHide: true });
    let result = invoke('html', f.root); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).verdict, 'HTML_EXPORTED');
    result = invoke('html', f.root); assert.equal(result.status, 2); assert.equal(JSON.parse(result.stderr).verdict, 'REPORT_FAILED');
    result = invoke('unknown', f.root); assert.equal(result.status, 2);
  });
  test('static document export omits editor controls and the hidden draft warning', () => {
    const f = fixture(), html = r.render(f.root, { interactive: false });
    assert.ok(!html.includes('<script>')); assert.ok(!html.includes('id="draft"')); assert.ok(!html.includes('<button'));
    assert.ok(!html.includes('UNVERIFIED HUMAN DRAFT')); assert.ok(html.includes('data:image/png;base64,')); assert.ok(html.includes('1: request=42 status=500'));
  });
  test('a source image can directly support a scoped observed claim without receipt citations', () => {
    const f = fixture(); f.data.claims[0].evidence = [{ visual: 'V1' }];
    const html = f.render(); assert.ok(html.includes('href="#visual-V1">Visual V1</a>')); assert.ok(html.includes('No command-output excerpts are cited.'));
  });
  test('missing and mixed visual evidence references cannot bypass citation checks', () => {
    const f = fixture();
    for (const reference of [{ visual: 'missing' }, { visual: 'V1', receipt: 'receipts/E1.json' }, { visual: 'V1', stream: 'stdout' }]) {
      f.data.claims[0].evidence = [reference]; assert.throws(f.render, /Invalid or missing visual evidence/);
    }
  });
  test('diagrams cannot prove a claim or become source evidence through annotation', () => {
    const f = fixture(); f.data.visuals[0].kind = 'diagram'; f.data.claims[0].evidence = [{ visual: 'V1' }];
    assert.throws(f.render, /diagrams cannot serve as source evidence/);
    f.data.visuals.push({ ...f.data.visuals[0], id: 'V2', kind: 'annotated', derived_from: 'V1', transformations: 'Annotated the explanatory diagram.' });
    f.data.claims[0].evidence = [{ visual: 'V2' }]; assert.throws(f.render, /diagram cannot be promoted/);
  });
  test('research delivery and stakeholder narrative survive static exports with checked claim links', () => {
    const f = fixture(); f.data.report = {
      research: { text: 'Research remains inconclusive <script>unsafe()</script>.', claims: ['C1'] },
      delivery: 'Expected a cause; delivered a bounded observation and a named gap.',
      stakeholder_reply: { text: 'The record shows a failure; its cause remains unknown.', claims: ['C1'] },
    };
    f.save(); const html = r.render(f.root, { interactive: false });
    for (const text of ['What the research explains', 'Expected versus delivered results', 'Stakeholder reply draft', f.data.report.delivery, f.data.report.stakeholder_reply.text, 'has not been sent', '&lt;script&gt;unsafe()']) assert.ok(html.includes(text), text);
    assert.ok(!html.includes('<script>unsafe()'));
    f.data.report.research.claims = ['missing']; assert.throws(f.render, /existing claim references/);
    f.data.report.research.claims = ['C1']; f.data.report.delivery = ''; assert.throws(f.render, /expected-versus-delivered/);
    f.data.report.delivery = 'Gap'; delete f.data.report.stakeholder_reply; assert.throws(f.render, /stakeholder_reply/);
  });
} finally {
  const resolved = fs.realpathSync(tmp);
  assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir())); assert(path.basename(resolved).startsWith('forge-investigate-report-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
console.log(JSON.stringify({ passed, failed })); process.exitCode = failed ? 1 : 0;
