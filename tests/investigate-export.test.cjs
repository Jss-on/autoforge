const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const repo = path.resolve(process.argv[2] || '.'), a = require(path.join(repo, 'scripts/acceptance.cjs'));
const e = require(path.join(repo, 'scripts/investigate-export.cjs')), v = require(path.join(repo, 'scripts/verification.cjs'));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-export-tests-'));
let passed = 0, failed = 0, sequence = 0;
function fixture() {
  const root = path.join(temporary, String(++sequence)); fs.mkdirSync(root);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7N0AAAAASUVORK5CYII=', 'base64');
  fs.writeFileSync(path.join(root, 'capture.png'), png);
  const data = { version: 1, issue: 'Synthetic visual export fixture', scope: 'Local test only', questions: [{ id: 'Q1', text: 'What happened?', answer: 'Unknown in this synthetic fixture.', claims: ['C1'] }], claims: [{ id: 'C1', kind: 'unknown', text: 'Incident cause is unknown.', evidence: [], limitations: 'Synthetic image tests embedding only.' }], review: { mode: 'self', findings: 'Test fixture only.' }, conclusion: { status: 'unresolved', text: 'No incident diagnosis.', limitations: 'Fixture only.', claims: ['C1'] }, next_steps: [], visuals: [{ id: 'V1', kind: 'screenshot', acquisition: 'user_provided', caption: 'Synthetic one-pixel fixture; not incident evidence.', source: 'test fixture', scope: 'local test', captured_at: 'unknown', limitations: 'Tests file embedding only.', claims: ['C1'], file: 'capture.png', sha256: a.sha(png) }] };
  fs.writeFileSync(path.join(root, 'case.json'), JSON.stringify(data));
  // A malicious/stale editable HTML file must never be used as export input.
  fs.writeFileSync(path.join(root, 'report.html'), '<img src="https://invalid.example/private"><p>UNTRUSTED HTML</p>');
  return { root, data };
}
async function test(name, action) { try { await action(); passed++; console.error('PASS: ' + name); } catch (error) { failed++; console.error('FAIL: ' + name + ': ' + error.stack); } }
async function env(name, value, action) { const old = process.env[name]; process.env[name] = value; try { return await action(); } finally { if (old === undefined) delete process.env[name]; else process.env[name] = old; } }
async function runner(fake, action) { const original = v.run; v.run = fake; try { return await action(); } finally { v.run = original; } }
const ok = stdout => ({ exit_code: 0, error: null, signal: null, stdout, stderr: '' });
(async () => {
  await test('browser discovery prefers installed Chrome and Edge launchers over Chromium snapshots', async () => {
    const bin = path.join(temporary, 'browser-path'); fs.mkdirSync(bin);
    const suffix = process.platform === 'win32' ? '.exe' : '';
    const launcher = name => path.join(bin, name + suffix);
    for (const name of ['google-chrome', 'msedge', 'chromium']) fs.writeFileSync(launcher(name), 'discovery fixture only', { mode: 0o755 });
    await env('FORGE_CHROME', '', async () => env('CHROME_BIN', '', async () => env('PATH', bin, async () => {
      assert.equal(e.executable('pdf'), launcher('google-chrome'));
      fs.unlinkSync(launcher('google-chrome'));
      assert.equal(e.executable('pdf'), launcher('msedge'));
      fs.unlinkSync(launcher('msedge'));
      assert.equal(e.executable('pdf'), launcher('chromium'));
    })));
  });
  await test('FORGE_CHROME overrides CHROME_BIN and a missing explicit override never falls back', async () => {
    const bin = path.join(temporary, 'browser-overrides'); fs.mkdirSync(bin);
    const suffix = process.platform === 'win32' ? '.exe' : '';
    const preferred = path.join(bin, 'preferred' + suffix), configured = path.join(bin, 'configured' + suffix);
    for (const file of [preferred, configured]) fs.writeFileSync(file, 'discovery fixture only', { mode: 0o755 });
    await env('PATH', bin, async () => env('CHROME_BIN', configured, async () => {
      await env('FORGE_CHROME', '', async () => assert.equal(e.executable('pdf'), configured));
      await env('FORGE_CHROME', preferred, async () => assert.equal(e.executable('pdf'), preferred));
      await env('FORGE_CHROME', path.join(bin, 'missing' + suffix), async () => assert.equal(e.executable('pdf'), null));
    }));
  });
  await test('missing optional tooling returns honest unavailable without output', async () => {
    const f = fixture();
    for (const format of ['pdf', 'docx']) await env(format === 'pdf' ? 'FORGE_CHROME' : 'FORGE_PANDOC', path.join(temporary, 'missing.exe'), async () => {
      assert.equal((await e.exportReport(format, f.root)).verdict, 'EXPORT_UNAVAILABLE');
      assert.equal(fs.existsSync(path.join(f.root, 'report.' + format)), false);
    });
  });
  await test('export rejects traversal, symlink parent, wrong format and overwrite', async () => {
    const f = fixture();
    for (const output of ['../outside.pdf', '/outside.pdf', 'nested/../outside.pdf', 'report.html']) await assert.rejects(() => e.exportReport('pdf', f.root, output), /relative/);
    fs.writeFileSync(path.join(f.root, 'report.pdf'), 'keep');
    await assert.rejects(() => e.exportReport('pdf', f.root), /already exists/);
    assert.equal(fs.readFileSync(path.join(f.root, 'report.pdf'), 'utf8'), 'keep');
    const outside = path.join(temporary, 'outside'); fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(f.root, 'escaped'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(() => e.exportReport('pdf', f.root, 'escaped/report.pdf'), /escapes/);
    assert.deepEqual(fs.readdirSync(outside), []);
  });
  await test('tampered evidence fails before any optional converter runs', async () => {
    const f = fixture(); fs.appendFileSync(path.join(f.root, 'capture.png'), 'altered');
    await runner(() => { throw Error('Converter must not run'); }, async () => assert.rejects(() => e.exportReport('pdf', f.root), /image bytes|Altered/));
  });
  await test('failed PDF process leaves no final artifact or temporary directory', async () => {
    const f = fixture();
    await env('FORGE_CHROME', process.execPath, async () => assert.rejects(() => e.exportReport('pdf', f.root), /converter failed/));
    assert.equal(fs.existsSync(path.join(f.root, 'report.pdf')), false);
    assert.equal(fs.readdirSync(f.root).some(name => name.startsWith('.investigate-export-')), false);
  });
  await test('converter errors retain bounded redacted diagnostic output', async () => {
    const f = fixture();
    await env('FORGE_CHROME', process.execPath, async () => runner(async () => ({
      exit_code: null, signal: 'SIGABRT', error: null, stdout: '',
      stderr: 'No usable sandbox! password=fixture-secret\n' + 'diagnostic line\n'.repeat(3000),
    }), async () => assert.rejects(() => e.exportReport('pdf', f.root), error => {
      assert.match(error.message, /SIGABRT/);
      assert.match(error.message, /No usable sandbox!/);
      assert.match(error.message, /\[REDACTED\]/);
      assert.doesNotMatch(error.message, /fixture-secret/);
      assert(error.message.length <= 16384, 'Converter diagnostics must stay bounded');
      return true;
    })));
    assert.equal(fs.existsSync(path.join(f.root, 'report.pdf')), false);
  });
  await test('PDF export uses checked static HTML, bounded isolated browser, and validates bytes', async () => {
    const f = fixture();
    await env('FORGE_CHROME', process.execPath, async () => runner(async (argv, options) => {
      assert.equal(options.timeout_ms, 60000); assert(options.output_limit <= 1024 * 1024);
      assert(argv.includes('--headless')); assert(argv.some(arg => arg.startsWith('--user-data-dir=')));
      const source = fs.readFileSync(path.join(options.cwd, 'source.html'), 'utf8');
      assert.match(source, /data:image\/png;base64,/); assert.doesNotMatch(source, /UNTRUSTED HTML|UNVERIFIED HUMAN DRAFT|<script>/);
      fs.writeFileSync(argv.find(arg => arg.startsWith('--print-to-pdf=')).split('=').slice(1).join('='), 'not a PDF');
      return ok('');
    }, async () => assert.rejects(() => e.exportReport('pdf', f.root), /not a PDF/)));
    assert.equal(fs.existsSync(path.join(f.root, 'report.pdf')), false);
  });
  await test('broken Pandoc install returns unavailable', async () => {
    const f = fixture();
    await env('FORGE_PANDOC', process.execPath, async () => assert.equal((await e.exportReport('docx', f.root)).verdict, 'EXPORT_UNAVAILABLE'));
  });
  await test('DOCX roundtrip must preserve embedded images', async () => {
    const f = fixture();
    await env('FORGE_PANDOC', process.execPath, async () => runner(async argv => {
      if (argv.includes('--version')) return ok('pandoc 3.0');
      if (argv.includes('--from=html')) { fs.writeFileSync(argv.find(arg => arg.startsWith('--output=')).slice(9), Buffer.from([80, 75, 3, 4, 0])); return ok(''); }
      return ok('<p>Image was dropped</p>');
    }, async () => assert.rejects(() => e.exportReport('docx', f.root), /preserve all embedded image/)));
    assert.equal(fs.existsSync(path.join(f.root, 'report.docx')), false);
  });
  // macOS previously wrote the PDF but intermittently stalled during browser shutdown.
  for (let attempt = 1; attempt <= (process.platform === 'darwin' ? 3 : 1); attempt++)
  await test('installed browser smoke creates complete PDF containing a page and image (attempt ' + attempt + ')', async () => {
    if (!e.executable('pdf')) { console.error('SKIP: no installed PDF browser'); return; }
    const f = fixture(), result = await e.exportReport('pdf', f.root);
    assert.equal(result.verdict, 'PDF_EXPORTED'); assert.equal(result.source_visuals, 1); assert.equal(result.embedded_visuals, undefined); assert.equal(result.uploaded, false);
    const bytes = fs.readFileSync(path.join(f.root, result.file));
    assert.match(bytes.toString('latin1'), /\/Type\s*\/Page\b/); assert.match(bytes.toString('latin1'), /\/Subtype\s*\/Image\b/);
    assert.equal(result.sha256, a.sha(bytes)); assert.equal(fs.readdirSync(f.root).some(name => name.startsWith('.investigate-export-')), false);
  });
})().finally(() => {
  const resolved = fs.realpathSync(temporary);
  assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir())); assert(path.basename(resolved).startsWith('forge-export-tests-'));
  fs.rmSync(resolved, { recursive: true, force: true });
  console.log(JSON.stringify({ passed, failed })); if (failed) process.exitCode = 1;
});
