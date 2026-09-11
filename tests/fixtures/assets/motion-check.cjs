// Run from test-design.sh with its existing Playwright project; no installs or generation.
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const repo = path.resolve(__dirname, '../../..'), fixture = path.join(__dirname, 'native-preview');
const cwd = path.resolve(process.argv[2] || process.cwd());
const output = process.argv[3] ? path.resolve(process.argv[3]) : fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'forge-motion-'));
fs.mkdirSync(output, { recursive: true });
const { chromium } = require(require.resolve('playwright', { paths: [cwd] }));
const { check } = require(path.join(repo, 'scripts/asset-check.cjs'));
const manifest = JSON.parse(fs.readFileSync(path.join(fixture, 'assets/manifest.json')));
const html = fs.readFileSync(path.join(fixture, 'index.html'), 'utf8');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (url.pathname === '/') {
    const changes = {
      bad: '@media (prefers-reduced-motion: reduce){#details.revealed{animation:appear 240ms linear}}',
      missing: '#details.revealed{animation:none}',
      long: '@media (prefers-reduced-motion: no-preference){#details.revealed{animation-duration:2s}}'
    };
    let page = html.replace('</style>', (changes[url.searchParams.get('case')] || '') + '</style>');
    if (url.searchParams.get('case') === 'error') page = page.replace('details.hidden = !details.hidden;', 'console.error("trigger failed"); details.hidden = !details.hidden;');
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(page); return;
  }
  const file = path.resolve(fixture, '.' + url.pathname);
  if (!file.startsWith(fixture + path.sep)) { res.writeHead(404); res.end(); return; }
  fs.readFile(file, (error, bytes) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': file.endsWith('.png') ? 'image/png' : 'image/svg+xml' }); res.end(bytes);
  });
});
const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd, env: { ...process.env, AR_SCORE_LOG: '0' } });
  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d; }); child.stderr.on('data', d => { stderr += d; });
  child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
});
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const scan = async (name, query = '', extra = []) => {
    const file = path.join(output, name + '.json');
    const r = await run(process.execPath, [path.join(repo, 'scripts/design-scan.cjs'), '--url', url + query,
      '--assets', fixture, '--engine', 'builtin', '--settle', '0', '--timeout', '5000',
      '--viewports', name === 'good' ? '1280x800,390x844' : '390x844', '--out', file, ...extra]);
    assert.ok(fs.existsSync(file), r.stderr);
    return { ...r, file, report: JSON.parse(fs.readFileSync(file)) };
  };
  assert.equal(check(fixture, path.join(fixture, 'assets/previous-manifest.json')).valid, true);
  const good = await scan('good', '', ['--shots', path.join(output, 'screens')]);
  assert.equal(good.code, 0, good.stderr);
  assert.equal(good.report.pages.length, 2);
  for (const page of good.report.pages) {
    assert.deepEqual(page.motion.profiles, ['no-preference', 'reduce']);
    assert.ok(page.motion.cases.every(c => c.passed && c.endVisible && fs.statSync(c.screenshot).size > 0));
  }
  const resume = await scan('resume', '', ['--prev', good.file]);
  assert.equal(resume.code, 0, resume.stderr);
  assert.ok(resume.report.pages.every(p => !p.reused), 'Motion must run again on a resumed scan');
  for (const [variant, rule] of [['bad', 'reduced-motion-active'], ['missing', 'motion-missing'], ['long', 'motion-duration'], ['error', 'motion-console-error']]) {
    const result = await scan(variant, '?case=' + variant);
    assert.equal(result.code, 2, result.stderr);
    assert.ok(result.report.pages.some(p => p.findings.some(f => f.rule === rule)), rule);
  }
  const defects = path.join(output, 'defects.tsv');
  fs.writeFileSync(defects, 'id\tseverity\tcategory\tstatus\tevidence\tsummary\tfix_iteration\n');
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  const verdict = file => run(bash, [path.join(repo, 'scripts/score-design.sh'), 'verdict', defects, file, '', '', fixture]);
  assert.equal((await verdict(good.file)).code, 0);
  assert.notEqual((await verdict('')).code, 0, 'Declared motion needs evidence');
  const stale = structuredClone(good.report); stale.meta.assets.manifestSha256 = '0'.repeat(64);
  fs.writeFileSync(path.join(output, 'stale.json'), JSON.stringify(stale));
  assert.notEqual((await verdict(path.join(output, 'stale.json'))).code, 0, 'Manifest change invalidates motion evidence');
  const incomplete = structuredClone(good.report); incomplete.pages[0].motion.cases.pop();
  fs.writeFileSync(path.join(output, 'incomplete.json'), JSON.stringify(incomplete));
  assert.notEqual((await verdict(path.join(output, 'incomplete.json'))).code, 0, 'Both profiles are required at every viewport');
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  try {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) for (const profile of ['no-preference', 'reduce']) {
      const context = await browser.newContext({ viewport, reducedMotion: profile });
      try {
        const page = await context.newPage(); await page.goto(url);
        const photo = await page.locator('#photo').evaluate(img => ({ complete: img.complete, width: img.naturalWidth, height: img.naturalHeight }));
        assert.deepEqual(photo, { complete: true, width: 1254, height: 1254 });
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('#toggle').evaluate(el => el === document.activeElement), true);
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#toggle').getAttribute('aria-expanded'), 'true');
        await page.locator('#details').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
        assert.equal(await page.locator('#details').isVisible(), true);
        assert.equal(await page.locator('#details').evaluate(el => getComputedStyle(el).opacity), '1');
        const screenshot = path.join(output, `task-${viewport.width}x${viewport.height}-${profile}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#details').isVisible(), false, 'The keyboard user can close the details');
        evidence.push({ viewport, profile, photo, opened: true, closed: true, screenshot });
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  const pinned = check(fixture, path.join(fixture, 'assets/previous-manifest.json'));
  assert.equal(pinned.valid, true); assert.equal(pinned.manifest.jobs.length, 1);
  assert.equal(pinned.manifest.assets[0].sha256, manifest.assets[0].sha256);
  fs.writeFileSync(path.join(output, 'smoke.json'), JSON.stringify({ passed: true, generatedAttempts: 1, pinned: true, assetCheck: pinned, interactions: evidence }, null, 2));
  console.log('PASS: native image renders; motion, keyboard, reduced preference, duration, errors, resume and verdict checks pass');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
