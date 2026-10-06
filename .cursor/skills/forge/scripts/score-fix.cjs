'use strict';
// What a fix run must show for every fix it kept: a committed test that fails without the fix and
// passes with it (proved in two throwaway checkouts), the same pattern searched for elsewhere, a
// table of the ways the fixed code can still fail, and for critical/high defects planted bugs the
// new tests catch. `check` recomputes all of it from receipts this script wrote and from the
// repository; `check --rerun` executes the proofs again. It never takes the ledger's word for a pass.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const a = require('./acceptance.cjs'), v = require('./verification.cjs');
const { WRAPPERS, NOT_AN_ASSERTION, SECRET_NAME, screen } = require('./review.cjs');
process.env.NoDefaultCurrentDirectoryInExePath = '1'; // Windows: a bare program name never resolves from the cwd

// The twelve ways a change can fail (scenario's dimensions) and the test-design techniques of the QA protocol.
const DIMENSIONS = ['happy-path', 'validation', 'permissions', 'concurrency', 'state', 'scale', 'failure', 'security', 'integration', 'data', 'ux', 'recovery'];
const TECHNIQUES = ['equivalence', 'boundary', 'decision-table', 'state-transition', 'pairwise', 'scenario', 'metamorphic', 'branch', 'error-guessing', 'exploratory'];
// How deep the angle table goes, by the defect's severity; error-mode items count as low.
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const DEPTH = { critical: DIMENSIONS, high: DIMENSIONS, medium: ['validation', 'data'], low: [] };
const CATEGORIES = ['proved', 'type', 'lint', 'build', 'design-scan', 'no-runner', 'new-behaviour'];
const SWEPT = ['proved', 'no-runner', 'new-behaviour']; // categories whose root cause can recur elsewhere
const DISPOSITIONS = ['the-fix', 'fixed-here', 'new-defect', 'not-affected'];
const STATUSES = /^(?:baseline|keep|fixed|discard|crash|no-op|hook-blocked|metric-error)\b/, KEPT = /^(?:keep|fixed)\b/;
// An expectation that only says "nothing blew up" is not an expected outcome (D-009: junk tokens verified).
const NO_CRASH = /^(?:(?:returns? |status |http )?200(?: ok)?|no (?:server |5xx |500 )?(?:error|crash|exception|failure)s?|no 5(?:00|xx)|(?:does ?n[o']t|doesn't|never) (?:crash|throw|error|fail)s?|ok|fine|works|passes|succeeds)\.?$/i;
const TEST = /(^|\/)(tests?|__tests__|e2e|specs?)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py|rs|rb|php)$|(^|\/)test_[^/]*\.py$|_spec\.rb$|Tests?\.(cs|java|kt|swift|scala)$/;
const LINKS = ['node_modules', '.venv', 'venv', 'vendor']; // dependency folders a fresh checkout borrows from the repository
const ITEM = /^[A-Za-z][\w.+-]{0,63}$/, TAIL = 64 * 1024;

const norm = p => String(p).replace(/\\/g, '/');
const json = file => { const t = fs.readFileSync(file, 'utf8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t); };
const parse = s => { try { return JSON.parse(s); } catch { return null; } };
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n'); };
const tail = s => s.length > TAIL ? s.slice(-TAIL) : s;
const hidden = () => Object.entries(process.env).filter(([k, val]) => SECRET_NAME.test(k) && typeof val === 'string' && val.length >= 8).map(([, val]) => val);
function tsv(file, header) {
  const out = [];
  for (const [i, line] of fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    if (!line.trim() || line.startsWith('#')) continue;
    const c = line.split('\t').map(x => x.trim());
    if (c[0] === header[0] && c[1] === header[1]) continue;
    out.push({ line: i + 1, ...Object.fromEntries(header.map((k, j) => [k, c[j] ?? ''])) });
  }
  return out;
}

// ---------------------------------------------------------------- git and throwaway checkouts
function git(repo, args, options = {}) {
  const r = cp.spawnSync('git', ['-C', repo, ...args], { encoding: options.binary ? 'buffer' : 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true, timeout: options.timeout ?? 120000 });
  if (r.status !== 0 && !options.lenient) throw Error(`git ${args[0]} failed: ${String(r.stderr || '').trim().slice(0, 300)}`);
  return r;
}
function repository(dir) {
  a.need(typeof dir === 'string' && dir && fs.existsSync(dir), 'repo must be an existing directory');
  const real = fs.realpathSync(dir), top = git(real, ['rev-parse', '--show-toplevel'], { lenient: true });
  a.need(top.status === 0 && fs.realpathSync(top.stdout.trim()) === real, 'repo must be the top of a git repository');
  return real;
}
const commitOf = (repo, ref) => { const r = git(repo, ['rev-parse', '--verify', '--end-of-options', ref + '^{commit}'], { lenient: true }); a.need(r.status === 0, 'commit not found in the repository: ' + ref); return r.stdout.trim(); };
const touched = (repo, sha) => new Set(git(repo, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-M', sha]).stdout.split(/\r?\n/).filter(Boolean).map(norm));
function blob(repo, sha, file) { const r = git(repo, ['show', `${sha}:${file}`], { lenient: true, binary: true }); return r.status === 0 ? r.stdout : null; }
const ignored = (repo, rel) => git(repo, ['check-ignore', '-q', '--', rel], { lenient: true }).status === 0;
const relative = p => typeof p === 'string' && p.length > 0 && /^[^\\:\u0000]+$/.test(p) && !path.isAbsolute(p) && !p.split('/').some(s => ['', '.', '..'].includes(s));

// A detached checkout of one commit, outside the repository, with the dependency folders borrowed.
function checkout(repo, sha, run, tag, { link = LINKS, copy = [] } = {}) {
  const base = path.join(os.tmpdir(), 'forge-fix'); fs.mkdirSync(base, { recursive: true });
  const parent = fs.mkdtempSync(path.join(base, `${path.basename(run)}-${sha.slice(0, 8)}-${tag}-`)), dir = path.join(parent, 'wt'), made = [];
  git(repo, ['worktree', 'add', '--detach', dir, sha]);
  try {
    for (const name of link) {
      const src = path.join(repo, name), dst = path.join(dir, name);
      if (!fs.existsSync(src) || fs.existsSync(dst)) continue;
      fs.symlinkSync(src, dst, process.platform === 'win32' ? 'junction' : 'dir'); made.push(dst);
    }
    for (const rel of copy) { const dst = path.join(dir, rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(a.local(repo, rel), dst); }
  } catch (e) { remove(); throw e; }
  function remove() {
    // The links go first and alone: a borrowed node_modules must never be deleted through the link.
    for (const l of made) { try { fs.unlinkSync(l); } catch { try { fs.rmdirSync(l); } catch { /* already gone */ } } }
    try { git(repo, ['worktree', 'remove', '--force', dir], { lenient: true }); } catch { /* removed below */ }
    try { fs.rmSync(parent, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a process still closing */ }
    try { git(repo, ['worktree', 'prune'], { lenient: true }); } catch { /* best effort */ }
  }
  return { dir, remove };
}

// ---------------------------------------------------------------- running the project's tests
function vet(argv) {
  a.need(Array.isArray(argv) && argv.length > 0 && argv.every(s => typeof s === 'string' && s.length > 0 && !s.includes('\0')), 'argv must be a non-empty list of strings');
  const exe = path.basename(argv[0]).toLowerCase().replace(/\.exe$/, '');
  a.need(!/\.(?:cmd|bat|ps1)[\s.]*$/i.test(argv[0]), 'Windows launchers (.cmd/.bat) cannot run directly: use ["bash", "-c", "npm test"]');
  a.need(!WRAPPERS.includes(exe), `${exe} cannot wrap the test command: run the program directly, or as ["bash", "-c", script]`);
  if (exe === 'bash' || exe === 'sh') { a.need(argv.length === 3 && argv[1] === '-c', 'Run shell as ["bash", "-c", script]'); screen(argv[2]); }
}
// What a throwaway checkout may borrow: dependency folders by name, and git-ignored files such as
// .env.test — never a source file the fix forgot to commit, which would prove a broken commit.
function bound(req, repo) {
  const timeout = req.timeout_ms ?? 600000;
  a.need(Number.isSafeInteger(timeout) && timeout > 0 && timeout <= 7200000, 'timeout_ms must be a whole number of milliseconds, at most 2 h');
  const link = req.link ?? LINKS, copy = req.copy ?? [];
  a.need(Array.isArray(link) && link.every(n => typeof n === 'string' && /^[\w.@-]+$/.test(n)) && Array.isArray(copy) && copy.every(relative), 'link names dependency folders of the repository; copy names files relative to it');
  for (const rel of copy) a.need(ignored(repo, rel), `copy: ${rel} is not git-ignored — a file the fix needs belongs in the fix commit`);
  return { timeout, link, copy };
}
async function execute(argv, cwd, timeout) {
  const secrets = hidden(), started = new Date().toISOString(), began = performance.now();
  let r;
  try { r = await v.run(argv, { cwd, env: { ...process.env, NoDefaultCurrentDirectoryInExePath: '1' }, timeout_ms: timeout, output_limit: 32 * 1024 * 1024 }); }
  catch (e) { r = { exit_code: null, signal: null, stdout: '', stderr: '', error: e.code || e.message }; }
  const stdout = tail(v.redact(r.stdout, secrets)), stderr = tail(v.redact(r.stderr, secrets));
  return { argv: argv.map(s => v.redact(s, secrets)), cwd: norm(cwd), started_at: started, ended_at: new Date().toISOString(), elapsed_ms: Math.round(performance.now() - began),
    exit_code: r.exit_code, signal: r.signal, error: r.error, stdout, stderr, stdout_sha256: a.sha(stdout), stderr_sha256: a.sha(stderr), output_bytes: r.stdout.length + r.stderr.length };
}
const SHAPE = r => a.object(r) && r.version === 1 && typeof r.run === 'string' && ITEM.test(r.item || '') && typeof r.kind === 'string' && typeof r.repo === 'string'
  && /^[0-9a-f]{40}$/.test(r.commit || '') && Number.isFinite(Date.parse(r.at || r.started_at));
const RUN_SHAPE = r => SHAPE(r) && Array.isArray(r.argv) && r.argv.every(s => typeof s === 'string') && Array.isArray(r.tests) && r.tests.every(t => typeof t === 'string') && a.object(r.tests_sha256)
  && typeof r.stdout === 'string' && typeof r.stderr === 'string' && r.stdout_sha256 === a.sha(r.stdout) && r.stderr_sha256 === a.sha(r.stderr);
const MUTANT_STATUSES = ['killed', 'survived', 'invalid'];

function request(runDir, requestFile, fields) {
  const root = fs.realpathSync(runDir), req = json(a.argument(root, requestFile));
  a.need(a.object(req) && ITEM.test(req.item || ''), 'item must be a short id such as DEF-3');
  for (const f of fields) a.need(req[f] !== undefined, `request needs ${f}`);
  const repo = repository(req.repo), fix = commitOf(repo, String(req.commit));
  return { root, req, repo, fix };
}

// prove: the item's tests fail at the parent commit (on an assertion) and pass at the fix commit.
async function proveWith(root, req, repo, fix, { save = true } = {}) {
  const parent = commitOf(repo, fix + '^');
  a.need(Array.isArray(req.tests) && req.tests.length > 0 && req.tests.every(t => relative(t) && TEST.test(t)), 'tests names test files, relative to the repository (tests/, __tests__/, *.test.*, *_test.*, …)');
  vet(req.argv);
  const { timeout, link, copy } = bound(req, repo), sums = {}, contents = {};
  for (const t of req.tests) { const b = blob(repo, fix, t); a.need(b, `${t} is not in the fix commit: the test belongs in the same commit as the fix`); contents[t] = b; sums[t] = a.sha(b); }
  const runAt = async (sha, kind, inject) => {
    const w = checkout(repo, sha, root, kind, { link, copy });
    try {
      if (inject) for (const t of req.tests) { const f = path.join(w.dir, t); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, contents[t]); }
      a.need(git(w.dir, ['rev-parse', 'HEAD']).stdout.trim() === sha, 'the checkout is not at the expected commit');
      const r = await execute(req.argv, w.dir, timeout);
      const receipt = { version: 1, run: path.basename(root), item: req.item, kind: `tests-${kind}`, repo: norm(repo), commit: sha, fix_commit: fix, parent_commit: parent, tests: req.tests, tests_sha256: sums, link, copy, ...r };
      if (kind === 'red') receipt.assertion = Number.isInteger(r.exit_code) && r.exit_code !== 0 && !NOT_AN_ASSERTION.test(r.stdout + '\n' + r.stderr);
      if (save) write(path.join(root, 'evidence', `${req.item}-tests-${kind}.json`), receipt);
      return receipt;
    } finally { w.remove(); }
  };
  const red = await runAt(parent, 'red', true), green = await runAt(fix, 'green', false);
  const reason = red.error ? `the run at the parent commit did not finish (${red.error})`
    : red.exit_code === 0 ? 'the tests pass on the parent commit too: they do not detect the defect'
    : !red.assertion ? 'the parent fails for a reason other than an assertion (missing module, symbol or compile error): write the test against what exists at the parent, or record the item as new-behaviour'
    : green.error ? `the run at the fix commit did not finish (${green.error})`
    : green.exit_code !== 0 ? 'the tests fail at the fix commit' : null;
  return { item: req.item, verdict: reason ? 'NOT_PROVEN' : 'DETECTS', reason, parent, fix, tests: req.tests, red: `evidence/${req.item}-tests-red.json`, green: `evidence/${req.item}-tests-green.json` };
}
async function prove(runDir, requestFile) {
  const { root, req, repo, fix } = request(runDir, requestFile, ['repo', 'commit', 'tests', 'argv']);
  return proveWith(root, req, repo, fix);
}

// sweep: every place the fix commit's tree matches the root cause's pattern, as git grep found it.
function sweep(runDir, requestFile) {
  const { root, req, repo, fix } = request(runDir, requestFile, ['repo', 'commit', 'pattern']);
  a.need(a.text(req.pattern) && req.pattern.length <= 200, 'pattern is an extended regular expression of at most 200 characters');
  const paths = req.paths ?? [];
  a.need(Array.isArray(paths) && paths.every(relative), 'paths are relative to the repository');
  const n = req.n ?? 1;
  a.need(Number.isSafeInteger(n) && n >= 1 && n <= 20, 'n numbers a second or later sweep of the same item');
  const r = git(repo, ['grep', '-n', '-I', '-E', '-e', req.pattern, fix, '--', ...paths], { lenient: true });
  a.need(r.status === 0 || r.status === 1, 'git grep failed: ' + String(r.stderr).trim().slice(0, 200));
  const secrets = hidden();
  const hits = r.stdout.split(/\r?\n/).filter(Boolean).map(l => { const m = /^[0-9a-f]{40}:(.+?):(\d+):(.*)$/.exec(l); return m && { file: norm(m[1]), line: Number(m[2]), text: v.redact(m[3].slice(0, 300), secrets) }; }).filter(Boolean);
  a.need(hits.length <= 500, `the pattern matches ${hits.length} lines: narrow it (paths, a longer pattern)`);
  const receipt = { version: 1, run: path.basename(root), item: req.item, kind: 'sweep', repo: norm(repo), commit: fix, pattern: req.pattern, paths, hits, count: hits.length, at: new Date().toISOString() };
  const file = `evidence/${req.item}-sweep${n > 1 ? '-' + n : ''}.json`;
  write(path.join(root, file), receipt);
  return { item: req.item, hits: hits.length, receipt: file };
}

// mutate: small defects planted in the fixed lines; each must make the item's tests go red.
async function mutateWith(root, req, repo, fix, { save = true } = {}) {
  vet(req.argv);
  const { timeout, link, copy } = bound(req, repo), changed = touched(repo, fix);
  a.need(Array.isArray(req.mutants) && req.mutants.length > 0 && req.mutants.every(m => a.object(m) && a.text(m.name) && m.name.length <= 80 && relative(m.file) && typeof m.find === 'string' && m.find.length > 0 && typeof m.replace === 'string' && m.replace !== m.find),
    'mutants are {name, file, find, replace}: find is replaced once in file');
  for (const m of req.mutants) a.need(!TEST.test(m.file) && changed.has(norm(m.file)), `mutant "${m.name}": defects are planted in the source lines the fix changed, never in a test (${m.file})`);
  const w = checkout(repo, fix, root, 'mutants', { link, copy }), results = [];
  try {
    for (const m of req.mutants) {
      const file = path.join(w.dir, m.file), row = { name: m.name, file: norm(m.file), find: m.find, replace: m.replace, find_sha256: a.sha(m.find), replace_sha256: a.sha(m.replace) };
      const original = blob(repo, fix, m.file);
      if (original === null) { results.push({ ...row, status: 'invalid', reason: 'file not in the fix commit' }); continue; }
      const text = original.toString('utf8'), count = text.split(m.find).length - 1;
      if (count !== 1) { results.push({ ...row, status: 'invalid', reason: `find occurs ${count} times` }); continue; }
      fs.writeFileSync(file, text.replace(m.find, () => m.replace));
      try {
        const r = await execute(req.argv, w.dir, timeout), out = r.stdout + '\n' + r.stderr;
        results.push({ ...row, exit_code: r.exit_code, error: r.error, stderr_tail: r.stderr.slice(-2048),
          ...(r.error ? { status: 'invalid', reason: 'the run did not finish: ' + r.error } : r.exit_code === 0 ? { status: 'survived' }
            : NOT_AN_ASSERTION.test(out) ? { status: 'invalid', reason: 'the mutant does not compile or load' } : { status: 'killed' }) });
      } finally { fs.writeFileSync(file, original); }
    }
  } finally { w.remove(); }
  const killed = results.filter(x => x.status === 'killed').length, valid = results.filter(x => x.status !== 'invalid').length;
  const receipt = { version: 1, run: path.basename(root), item: req.item, kind: 'mutants', repo: norm(repo), commit: fix, argv: req.argv, link, copy, mutants: results, killed, valid, at: new Date().toISOString() };
  if (save) write(path.join(root, 'evidence', `${req.item}-mutants.json`), receipt);
  return { item: req.item, killed, valid, survived: results.filter(x => x.status === 'survived').map(x => x.name), invalid: results.filter(x => x.status === 'invalid').map(x => `${x.name} (${x.reason})`), receipt };
}
async function mutate(runDir, requestFile) {
  const { root, req, repo, fix } = request(runDir, requestFile, ['repo', 'commit', 'argv', 'mutants']);
  return mutateWith(root, req, repo, fix);
}

// ---------------------------------------------------------------- the ledgers
function angleRows(root, need) {
  const file = path.join(root, 'angles.tsv');
  if (!fs.existsSync(file)) return [];
  const rows = tsv(file, ['item', 'dimension', 'technique', 'status', 'test_id', 'expected', 'reason']), seen = new Set();
  for (const r of rows) {
    const where = `angles.tsv line ${r.line}`;
    need(ITEM.test(r.item), `${where}: item`);
    need(DIMENSIONS.includes(r.dimension), `${where}: dimension must be one of ${DIMENSIONS.join(', ')}`);
    need(['tested', 'n/a'].includes(r.status), `${where}: status is tested or n/a`);
    if (r.status === 'tested') {
      need(TECHNIQUES.includes(r.technique), `${where}: technique must be one of ${TECHNIQUES.join(', ')}`);
      need(a.text(r.test_id), `${where}: a tested angle names its test`);
      need(a.text(r.expected) && !NO_CRASH.test(r.expected.trim()), `${where}: expected states the outcome (the status, the reason, the value) — "no crash" is not an outcome`);
    } else need(a.text(r.reason), `${where}: an angle marked n/a says why`);
    need(!seen.has(r.item + '\0' + r.dimension) || r.status === 'tested', `${where}: one row per item and dimension unless each is a test`);
    seen.add(r.item + '\0' + r.dimension);
  }
  return rows;
}
function angles(runDir) {
  const root = fs.realpathSync(runDir), errors = [], rows = angleRows(root, (ok, m) => { if (!ok) errors.push(m); });
  return { valid: errors.length === 0, errors, rows: rows.length, items: new Set(rows.map(r => r.item)).size };
}

// The kept fixes of iterations.tsv: item → commit. An item may close several ledger ids (DEF-3+DEF-4).
function kept(root) {
  a.need(fs.existsSync(path.join(root, 'iterations.tsv')), 'iterations.tsv missing: the run has no ledger of kept fixes');
  const rows = tsv(a.local(root, 'iterations.tsv'), ['iteration', 'timestamp', 'item', 'root_cause', 'commit', 'metric', 'delta', 'guard', 'status', 'description']), out = new Map();
  for (const r of rows) {
    a.need(STATUSES.test(r.status), `iterations.tsv line ${r.line}: status "${r.status}" is not one of baseline, keep, keep (reworked), fixed, discard, crash, no-op, hook-blocked, metric-error`);
    if (KEPT.test(r.status) && r.item !== 'baseline') { a.need(/^[0-9a-f]{7,40}$/.test(r.commit), `iterations.tsv line ${r.line}: a kept fix names its commit`); out.set(r.item, r.commit); }
  }
  return out;
}
function ledger(file, need, label) {
  const out = new Map();
  if (!fs.existsSync(file)) return out;
  for (const r of tsv(file, ['id', 'severity', 'priority', 'status', 'test_id', 'summary', 'evidence'])) {
    need(SEVERITIES.includes(r.severity), `${label} line ${r.line}: severity "${r.severity}" is not one of ${SEVERITIES.join(', ')}`);
    out.set(r.id, { severity: r.severity, status: r.status });
  }
  return out;
}
const evidenceFile = (root, item, suffix) => fs.existsSync(path.join(root, 'evidence')) && fs.readdirSync(path.join(root, 'evidence')).some(f => { const l = f.toLowerCase(), i = item.toLowerCase(); return l === i + suffix || l.endsWith('-' + i + suffix); });

// check: what every kept fix of the run shows, recomputed from the receipts and the repository.
// options: repo (the repository the fixes were proved in; default: the one the run lives in),
// defects (the source ledger the run's copy came from), rerun (execute the proofs again).
async function check(runDir, options = {}) {
  const root = fs.realpathSync(runDir), errors = [], gaps = [], stats = { items: 0, proved: 0, exempt: 0, angles: 0, hits: 0, killed: 0, valid: 0, reran: 0 };
  const need = (ok, message) => { if (!ok) errors.push(message); return ok; };
  const result = () => ({ valid: errors.length === 0, errors, gaps, stats, repo: anchor ? norm(anchor) : null });
  let anchor = null;
  try { anchor = options.repo ? repository(options.repo) : repository(git(root, ['rev-parse', '--show-toplevel']).stdout.trim()); }
  catch (e) { need(false, `the repository the fixes were proved in is unknown: the run is not inside one and --repo was not given (${e.message})`); }
  const receipt = (rel, shape) => {
    const f = path.join(root, rel);
    if (!fs.existsSync(f)) return null;
    const r = parse(fs.readFileSync(f, 'utf8'));
    if (!shape(r) || r.run !== path.basename(root)) { errors.push(`${rel}: not a receipt of this run (altered, copied or hand-written)`); return null; }
    if (anchor && r.repo !== norm(anchor)) { errors.push(`${rel}: proved in ${r.repo}, not in this run's repository ${norm(anchor)}`); return null; }
    return r;
  };
  let fixes; try { fixes = kept(root); } catch (e) { need(false, e.message); return result(); }
  stats.items = fixes.size;
  const covered = new Set([...fixes.keys()].flatMap(i => i.split('+')));
  const sev = ledger(path.join(root, 'defects.tsv'), need, 'defects.tsv');
  for (const [id, d] of sev) if (['fixed', 'in-progress'].includes(d.status)) need(covered.has(id), `defects.tsv: ${id} is ${d.status} but no kept fix of iterations.tsv names it`);
  if (options.defects) {
    const f = path.resolve(options.defects);
    if (need(fs.existsSync(f) && fs.statSync(f).isFile(), `the source ledger is not a file: ${options.defects}`)) {
      const source = ledger(f, need, 'source ledger');
      for (const [id, d] of sev) need(source.has(id) && source.get(id).severity === d.severity, `defects.tsv: ${id} is ${d.severity} here but ${source.get(id)?.severity ?? 'absent'} in the source ledger ${options.defects}`);
    }
  } else if (sev.size) gaps.push('severities are the run\'s own copy: pass --defects <source ledger> to pin them');
  const testsFile = path.join(root, 'tests.tsv');
  if (!need(fs.existsSync(testsFile), 'tests.tsv missing: every kept fix needs a row (item, category, tests, mutation, reason)')) return result();
  const rows = new Map();
  for (const r of tsv(testsFile, ['item', 'category', 'tests', 'mutation', 'reason'])) {
    const where = `tests.tsv line ${r.line}`;
    need(fixes.has(r.item), `${where}: ${r.item} is not a kept fix of iterations.tsv`);
    need(!rows.has(r.item), `${where}: ${r.item} listed twice`);
    need(CATEGORIES.includes(r.category), `${where}: category must be one of ${CATEGORIES.join(', ')}`);
    need(!r.mutation || r.mutation === 'required' || /^n\/a:\s*\S/.test(r.mutation), `${where}: mutation is "required" or "n/a: <why>"`);
    rows.set(r.item, r);
  }
  const angleList = angleRows(root, need), sweepFile = path.join(root, 'sweep.tsv');
  const sweepRows = fs.existsSync(sweepFile) ? tsv(sweepFile, ['item', 'file', 'line', 'disposition', 'reference']) : [];
  stats.angles = angleList.length;
  const severityOf = item => { const s = item.split('+').map(id => sev.get(id)?.severity).filter(Boolean); return SEVERITIES.find(x => s.includes(x)) ?? 'low'; };
  for (const [item, shortSha] of fixes) {
    const row = rows.get(item);
    if (!need(row, `${item}: no tests.tsv row — a kept fix needs a committed test, or a recorded exemption`)) continue;
    const severity = severityOf(item), depth = DEPTH[severity];
    let fix = null; try { fix = anchor && commitOf(anchor, shortSha); } catch (e) { need(false, `${item}: ${e.message}`); continue; }
    if (!fix) continue;
    const changed = touched(anchor, fix);
    if (row.category === 'proved') {
      stats.proved++;
      const red = receipt(`evidence/${item}-tests-red.json`, RUN_SHAPE), green = receipt(`evidence/${item}-tests-green.json`, RUN_SHAPE);
      if (!need(red && green, `${item}: proved needs evidence/${item}-tests-red.json and -green.json from score-fix.cjs prove`)) continue;
      need(red.fix_commit === fix && green.fix_commit === fix && green.commit === fix, `${item}: the receipts are for another commit than the kept fix ${shortSha}`);
      let parent; try { parent = commitOf(anchor, fix + '^'); } catch { parent = null; }
      need(red.commit === parent && red.parent_commit === parent, `${item}: the red run was not at the fix's parent commit`);
      need(red.kind === 'tests-red' && green.kind === 'tests-green' && red.item === item && green.item === item, `${item}: receipt kinds or items do not match`);
      need(JSON.stringify(red.argv) === JSON.stringify(green.argv) && JSON.stringify(red.tests) === JSON.stringify(green.tests), `${item}: red and green ran different commands or tests`);
      need(red.tests.length > 0 && red.tests.every(t => relative(t) && TEST.test(t)), `${item}: the receipts name no test files`);
      for (const t of red.tests) { const b = blob(anchor, fix, t); need(b && a.sha(b) === red.tests_sha256[t] && green.tests_sha256?.[t] === red.tests_sha256[t], `${item}: ${t} differs from what the fix commit holds (re-prove after changing a test)`); }
      need(Number.isInteger(red.exit_code) && red.exit_code !== 0 && red.assertion === true && !NOT_AN_ASSERTION.test(red.stdout + '\n' + red.stderr), `${item}: the tests must fail on an assertion at the parent commit`);
      need(green.exit_code === 0 && !green.error, `${item}: the tests must pass at the fix commit`);
      for (const t of red.tests) if (!changed.has(t)) gaps.push(`${item}: ${t} existed before the fix and the fix did not change it — the re-engagement confirms it is the regression test`);
      let mutants = null;
      if (['critical', 'high'].includes(severity)) {
        mutants = receipt(`evidence/${item}-mutants.json`, SHAPE);
        if (!mutants) { if (/^n\/a:/.test(row.mutation)) gaps.push(`${item}: ${severity} defect without mutation evidence (${row.mutation})`); else need(false, `${item}: a ${severity} defect needs evidence/${item}-mutants.json from score-fix.cjs mutate (3+ planted defects, all killed), or mutation "n/a: <why>"`); }
        else {
          need(mutants.kind === 'mutants' && mutants.item === item && mutants.commit === fix && JSON.stringify(mutants.argv) === JSON.stringify(green.argv), `${item}: the mutants ran elsewhere or with another command than the proving tests`);
          const list = Array.isArray(mutants.mutants) ? mutants.mutants.filter(a.object) : [];
          need(list.length === (mutants.mutants ?? []).length && list.every(x => MUTANT_STATUSES.includes(x.status) && typeof x.file === 'string'), `${item}: the mutants receipt is malformed`);
          need(list.every(x => typeof x.file !== 'string' || (!TEST.test(x.file) && changed.has(norm(x.file)))), `${item}: mutants belong in the source lines the fix changed, never in a test`);
          const valid = list.filter(x => x.status !== 'invalid'), survived = valid.filter(x => x.status === 'survived');
          stats.valid += valid.length; stats.killed += valid.length - survived.length;
          need(valid.length >= 3, `${item}: ${valid.length} valid mutant(s), at least 3 needed`);
          need(survived.length === 0, `${item}: the new tests do not pin the fix — mutant(s) survived: ${survived.map(x => x.name).join(', ')}`);
        }
      }
      if (options.rerun && errors.length === 0) {
        // The proof, executed again from the receipts' own request: an edited exit code cannot survive this.
        stats.reran++;
        const again = await proveWith(root, { item, tests: red.tests, argv: red.argv, link: red.link ?? LINKS, copy: red.copy ?? [] }, anchor, fix, { save: false });
        need(again.verdict === 'DETECTS', `${item}: re-running the proof disagrees with the receipts — ${again.reason}`);
        if (mutants && Array.isArray(mutants.mutants)) {
          const plan = mutants.mutants.filter(x => x.status !== 'invalid').map(x => ({ name: x.name, file: x.file, find: x.find, replace: x.replace }));
          if (plan.every(x => typeof x.find === 'string' && typeof x.replace === 'string')) {
            const m = await mutateWith(root, { item, argv: mutants.argv, mutants: plan, link: mutants.link ?? LINKS, copy: mutants.copy ?? [] }, anchor, fix, { save: false });
            need(m.survived.length === 0 && m.killed >= 3, `${item}: re-running the mutants disagrees with the receipts — killed ${m.killed}, survived ${m.survived.join(', ') || 'none'}`);
          } else need(false, `${item}: the mutants receipt does not carry its mutants (find/replace) — re-run score-fix.cjs mutate`);
        }
      }
    } else {
      stats.exempt++;
      need(a.text(row.reason), `${item}: an exemption (${row.category}) says why no test guards this fix`);
      if (row.category !== 'new-behaviour') need(evidenceFile(root, item, '-red.txt') && evidenceFile(root, item, '-green.txt'), `${item}: ${row.category} needs the red and green evidence of the error it removed (evidence/<item>-red.txt, -green.txt)`);
      if (['type', 'lint', 'build', 'design-scan'].includes(row.category) && ['critical', 'high', 'medium'].includes(severity)) need(false, `${item}: a ${severity} defect is not a ${row.category} error — it needs a test (proved) or no-runner`);
      if (row.category === 'new-behaviour') gaps.push(`${item}: new behaviour — the re-engagement tests it from the requirements`);
      if (row.category === 'no-runner') gaps.push(`${item}: no test runner in the project — the probe is the only guard`);
    }
    if (SWEPT.includes(row.category)) {
      const files = fs.existsSync(path.join(root, 'evidence')) ? fs.readdirSync(path.join(root, 'evidence')).filter(f => new RegExp(`^${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-sweep(?:-\\d+)?\\.json$`).test(f)) : [];
      if (!need(files.length > 0, `${item}: no sweep — score-fix.cjs sweep records where the same pattern occurs (evidence/${item}-sweep.json)`)) continue;
      const hits = new Map();
      for (const f of files) {
        const s = receipt('evidence/' + f, SHAPE);
        if (!s) continue;
        need(s.kind === 'sweep' && s.item === item && s.commit === fix && Array.isArray(s.hits) && s.hits.every(h => a.object(h) && typeof h.file === 'string' && Number.isInteger(h.line)), `evidence/${f}: not a sweep of ${item} at the kept fix`);
        for (const h of Array.isArray(s.hits) ? s.hits.filter(a.object) : []) hits.set(`${h.file}:${h.line}`, h);
      }
      stats.hits += hits.size;
      for (const r of sweepRows.filter(r => r.item === item)) {
        const key = `${norm(r.file)}:${r.line}`;
        if (!need(hits.has(key), `sweep.tsv: ${item} ${key} is not a hit of the sweep`)) continue;
        need(DISPOSITIONS.includes(r.disposition), `sweep.tsv: ${item} ${key}: disposition must be one of ${DISPOSITIONS.join(', ')}`);
        if (r.disposition === 'new-defect') need(sev.has(r.reference) && !covered.has(r.reference) && sev.get(r.reference).status === 'open', `sweep.tsv: ${item} ${key}: new-defect names another defect recorded as open in defects.tsv`);
        if (r.disposition === 'not-affected') need(a.text(r.reference), `sweep.tsv: ${item} ${key}: not-affected says why`);
        if (['fixed-here', 'the-fix'].includes(r.disposition)) need(changed.has(norm(r.file)), `sweep.tsv: ${item} ${key}: ${r.disposition}, but the fix commit does not touch ${r.file}`);
        hits.delete(key);
      }
      for (const key of hits.keys()) need(false, `${item}: sweep hit ${key} has no disposition in sweep.tsv`);
      const have = new Set(angleList.filter(r => r.item === item).map(r => r.dimension));
      for (const d of depth) need(have.has(d), `${item}: a ${severity} defect needs the ${d} angle in angles.tsv (tested, or n/a with the reason)`);
    }
  }
  return result();
}

module.exports = { DIMENSIONS, TECHNIQUES, DEPTH, CATEGORIES, DISPOSITIONS, TEST, NO_CRASH, prove, sweep, mutate, angles, check, checkout };

const USAGE = 'usage: score-fix.cjs prove <run> <request.json> | sweep <run> <request.json> | mutate <run> <request.json> | angles <run> | check <run> [--repo <dir>] [--defects <source.tsv>] [--rerun]';
if (require.main === module) (async () => {
  const [cmd, run, ...rest] = process.argv.slice(2), file = rest[0], opt = flag => { const i = rest.indexOf(flag); return i >= 0 ? rest[i + 1] : undefined; };
  if (!cmd || !run) { console.error(USAGE); process.exitCode = 2; return; }
  if (cmd === 'prove') {
    const r = await prove(run, file);
    console.log(r.verdict === 'DETECTS' ? `PROVE: DETECTS ${r.item} — ${r.tests.length} test file(s) fail at ${r.parent.slice(0, 8)}, pass at ${r.fix.slice(0, 8)}` : `PROVE: NOT_PROVEN ${r.item} — ${r.reason}`);
    if (r.verdict !== 'DETECTS') process.exitCode = 1;
  } else if (cmd === 'sweep') {
    const r = sweep(run, file);
    console.log(`SWEEP: ${r.hits} hit(s) for ${r.item} in ${r.receipt} — every hit gets a disposition in sweep.tsv`);
  } else if (cmd === 'mutate') {
    const r = await mutate(run, file);
    console.log(`MUTATION: ${r.killed}/${r.valid} killed for ${r.item}${r.survived.length ? ' — survived: ' + r.survived.join(', ') : ''}${r.invalid.length ? ' — invalid: ' + r.invalid.join('; ') : ''}`);
    if (r.survived.length) process.exitCode = 1;
  } else if (cmd === 'angles') {
    const r = angles(run);
    console.log(r.valid ? `ANGLES: VALID rows=${r.rows} items=${r.items}` : 'ANGLES: INVALID');
    for (const e of r.errors) console.log('  ' + e);
    if (!r.valid) process.exitCode = 1;
  } else if (cmd === 'check') {
    const r = await check(run, { repo: opt('--repo'), defects: opt('--defects'), rerun: rest.includes('--rerun') }), s = r.stats;
    console.log(r.valid ? `FIX_EVIDENCE: VALID items=${s.items} proved=${s.proved} exempt=${s.exempt} angles=${s.angles} sweep-hits=${s.hits} mutants=${s.killed}/${s.valid}${r.stats.reran ? ' reran=' + s.reran : ''} repo=${r.repo}` : 'FIX_EVIDENCE: INVALID');
    for (const e of r.errors) console.log('  ' + e);
    for (const g of r.gaps) console.log('GAP: ' + g);
    if (!r.valid) process.exitCode = 1;
  } else { console.error(USAGE); process.exitCode = 2; }
})().catch(e => { console.error('score-fix blocked: ' + e.message); process.exitCode = 2; });
