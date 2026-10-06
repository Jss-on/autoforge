// A review run that passes every gate with real evidence: a git repository with a base and a head
// commit, the run inside it, review checkouts in the workspace, and receipts shaped like capture's.
// Tests change one thing at a time through `fixture(change)`.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const sha = s => require('node:crypto').createHash('sha256').update(s).digest('hex');
const put = (root, rel, data) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
const git = (cwd, ...args) => { const r = cp.spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]), PNG2 = Buffer.concat([PNG, Buffer.from([4])]);

module.exports = (repo, scratch) => {
  const review = require(path.join(repo, 'scripts/review.cjs'));
  const HOST = path.join(repo, 'scripts', 'host.cjs'), REG = path.join(repo, 'scripts', 'score-regression.sh');
  let clock = 0;
  // Workspaces share one parent with every other review on the machine: remove only the ones made here.
  const made = [];
  const workspaceFor = run => {
    const w = review.workspace(run, true);
    made.push(w.root); fs.mkdirSync(w.head, { recursive: true }); fs.mkdirSync(w.base, { recursive: true });
    return w;
  };
  const cleanup = () => { for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); };
  function world() {
    const d = fs.mkdtempSync(path.join(scratch, 'repo-'));
    git(d, 'init', '-q');
    put(d, 'src/a.ts', 'export const a = 1;\n'); git(d, 'add', '.'); git(d, 'commit', '-qm', 'base');
    const base = git(d, 'rev-parse', 'HEAD').trim();
    put(d, 'src/a.ts', 'export const a = 1;\nexport function total(xs) {\n  return xs.length;\n}\n'); git(d, 'add', '.'); git(d, 'commit', '-qm', 'head');
    const head = git(d, 'rev-parse', 'HEAD').trim(), run = path.join(d, 'forge', 'review-test'); fs.mkdirSync(run, { recursive: true });
    const w = workspaceFor(run);
    put(w.head, 'src/a.ts', fs.readFileSync(path.join(d, 'src/a.ts')));
    put(run, 'diff.patch', git(d, 'diff', '--no-color', '--no-ext-diff', '-M', base, head));
    return { d, run, base, head, w };
  }
  function receipt(run, id, over = {}) {
    const r = { version: 1, run: path.basename(run), id, label: id, argv: ['tool'], cwd: run, trusted: false, env_added: [], inputs: {}, products: {}, started_at: new Date(Date.UTC(2026, 9, 6, 0, 0, clock)).toISOString(),
      ended_at: new Date(Date.UTC(2026, 9, 6, 0, 0, ++clock)).toISOString(), elapsed_ms: 1, exit_code: 0, signal: null, error: null, stdout: '', stderr: '', tampered: [], ...over };
    r.stdout_sha256 = sha(r.stdout); r.stderr_sha256 = sha(r.stderr);
    put(run, `receipts/${id}.json`, JSON.stringify(r));
    return `receipts/${id}.json`;
  }
  function fixture(change = () => {}) {
    const x = world(), { run, w } = x, url = 'https://gitlab.example.com/acme/app/-/merge_requests/7';
    x.hostMr = (over = {}) => JSON.stringify({ host: 'gitlab', number: 7, url, state: 'open', draft: false, head: x.head, checks: 'green', merge: 'mergeable', settled: true, conflicts: false, verdict: 'READY', ...over });
    x.url = url;
    const mr = receipt(run, 'E1', { label: 'where the merge request stands', argv: [process.execPath, HOST, 'mr', '7', x.d], trusted: true, stdout: x.hostMr() });
    const tsv = put(run, 'regression/regression-results.tsv', '# metric_direction: higher_is_better\niteration\ttimestamp\tdimension\taxis\ttier\tclassification\tbaseline\tcandidate\tdelta\tregressed\tsubscore\tseverity\tstatus\tfile_line\tdescription\n1\tt\tfunctional\tdiff\tHARD\tregression-eligible\t120\t120\t0\tfalse\t100\t-\tok\t-\tsuite\n');
    const reg = receipt(run, 'E2', { label: 'regression verdict', argv: ['bash', REG, 'verdict', tsv], trusted: true, cwd: w.head, inputs: { [fs.realpathSync(tsv).replace(/\\/g, '/')]: sha(fs.readFileSync(tsv)) }, stdout: 'STABLE' });
    const red = receipt(run, 'E3', { label: 'new test fails on the target', cwd: w.base, exit_code: 1, stdout: 'PASS old.test.ts\nFAIL test/totals.test.ts\n  expected 3, got undefined' });
    const green = receipt(run, 'E4', { label: 'new test passes on the head', cwd: w.head, stdout: 'PASS test/totals.test.ts' });
    // The coverage run in the head checkout, its report captured as a product, and the result computed from it.
    x.cover = lcov => {
      const report = 'products/E5-1-lcov.info';
      put(run, report, lcov);
      put(run, 'coverage.json', JSON.stringify({ ...review.coverage(fs.readFileSync(path.join(run, 'diff.patch'), 'utf8'), lcov), report }));
      return receipt(run, 'E5', { label: 'coverage run', cwd: w.head, stdout: 'coverage written', products: { [report]: sha(lcov) } });
    };
    const cov = x.cover('SF:src/a.ts\nDA:1,1\nDA:2,1\nDA:3,1\nend_of_record\n');
    const sec = receipt(run, 'E6', { label: 'secret and dependency scan', stdout: 'no secrets found\nno new dependencies' });
    put(run, 'visuals/before.png', PNG); put(run, 'visuals/after.png', PNG2);
    const shot = (id, file, bytes, side) => ({ id, file, sha256: sha(bytes), kind: 'screenshot', caption: side === 'before' ? 'Totals page on main' : 'Totals page on the merge request', source: 'review-report.cjs shot', url: 'http://127.0.0.1:3000/totals', captured_at: '2026-10-06T00:00:00Z', gate: 'app', side });
    const r = { version: 1, mr: { host: 'gitlab', project: 'acme/app', number: 7, url, title: 'Fix totals', head: x.head, base: x.base, target: 'main', worktree: w.head, base_worktree: w.base },
      threshold: 80, review_mode: 'independent', scale: { blocking: ['issue (blocking)'], other: ['nit', 'suggestion', 'question'] },
      gates: { pipeline: { status: 'pass', evidence: [mr] }, regression: { status: 'pass', evidence: [reg] }, 'tests-detect': { status: 'pass', evidence: [red, green] },
        coverage: { status: 'pass', evidence: ['coverage.json', cov] }, app: { status: 'pass', evidence: ['visuals/before.png', 'visuals/after.png'] }, security: { status: 'pass', evidence: [sec] }, mergeable: { status: 'pass', evidence: [mr] } },
      visuals: [shot('V1', 'visuals/before.png', PNG, 'before'), shot('V2', 'visuals/after.png', PNG2, 'after')],
      findings: [{ id: 'F1', blocking: false, label: 'nit', file: 'src/a.ts', line: 3, comment: 'nit: name this length', status: 'open' }], waivers: [] };
    change(r, run, x);
    put(run, 'review.json', JSON.stringify(r));
    return run;
  }
  return { review, world, receipt, fixture, workspaceFor, cleanup, HOST, REG, PNG, PNG2, sha, put, git };
};
