// A fix run that passes score-fix.cjs check: a git repository with a bug, a fix commit that carries
// its test, the run's ledgers, and the receipts prove/sweep/mutate leave behind. Tests change one
// thing at a time through `gamed(change)`. usage from bash: node -e 'require(".../score-fix-fixture.cjs")(repo, scratch).valid()'
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const put = (root, rel, data) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
const git = (cwd, ...args) => { const r = cp.spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
const BUG = "exports.total = xs => xs.length;\n";
const FIXED = "exports.total = xs => {\n  if (!Array.isArray(xs)) throw new TypeError('list required');\n  return xs.reduce((a, b) => a + b, 0);\n};\n";
const TEST = "const test = require('node:test'), assert = require('node:assert/strict');\nconst { total } = require('../src/total.js'), { three } = require('dep');\n" +
  "test('sums the amounts', () => { assert.equal(total([1, 2, three]), 6); });\n" +
  "test('refuses a non-list with the reason', () => { assert.throws(() => total(null), /list required/); });\n";

module.exports = (repo, scratch) => {
  const fix = require(path.join(repo, 'scripts/score-fix.cjs'));
  const argv = [process.execPath, '--test', 'tests/total.test.js'];
  // The repository: a bug, then the fix with its test in the same commit; a dependency only the
  // working copy has (node_modules is not committed), so a throwaway checkout must borrow it.
  function world() {
    const d = fs.mkdtempSync(path.join(scratch, 'repo-'));
    git(d, 'init', '-q');
    put(d, 'package.json', '{"name":"fx","private":true}\n'); put(d, '.gitignore', 'node_modules/\nforge/\n.env.test\n');
    put(d, 'src/total.js', BUG); put(d, 'src/count.js', 'exports.count = xs => xs.length;\n');
    put(d, 'tests/base.test.js', "require('node:test')('exists', () => { require('../src/total.js'); });\n");
    put(d, 'data/lines.txt', 'x\n'.repeat(600));
    git(d, 'add', '.'); git(d, 'commit', '-qm', 'base');
    const base = git(d, 'rev-parse', 'HEAD').trim();
    put(d, 'src/total.js', FIXED); put(d, 'tests/total.test.js', TEST);
    git(d, 'add', '.'); git(d, 'commit', '-qm', 'fix D-1: sum, not count');
    const head = git(d, 'rev-parse', 'HEAD').trim();
    put(d, 'node_modules/dep/index.js', 'module.exports = { three: 3 };\n');
    const run = path.join(d, 'forge', 'fix-test'); fs.mkdirSync(path.join(run, 'requests'), { recursive: true });
    return { d, run, base, head, argv };
  }
  const request = (run, name, body) => put(run, `requests/${name}.json`, JSON.stringify(body));
  const angles = item => fix.DIMENSIONS.map(dim => [item, dim, dim === 'validation' ? 'boundary' : dim === 'failure' ? 'error-guessing' : 'scenario', dim === 'validation' || dim === 'happy-path' || dim === 'failure' ? 'tested' : 'n/a',
    dim === 'validation' ? 'total.test.js refuses a non-list' : dim === 'happy-path' ? 'total.test.js sums the amounts' : dim === 'failure' ? 'total.test.js refuses a non-list' : '',
    dim === 'validation' ? 'TypeError "list required"' : dim === 'happy-path' ? 'the sum of the amounts' : dim === 'failure' ? 'TypeError "list required", nothing summed' : '',
    dim === 'validation' || dim === 'happy-path' || dim === 'failure' ? '' : 'a pure function over one list; nothing to ' + dim].join('\t')).join('\n') + '\n';
  // The run as a fix leaves it: ledgers plus real receipts from the seam.
  async function valid(change = () => {}) {
    const x = world(), { run, head } = x;
    put(run, 'iterations.tsv', '# metric_direction: lower_is_better\niteration\ttimestamp\titem\troot_cause\tcommit\tmetric\tdelta\tguard\tstatus\tdescription\n' +
      `0\tt\tbaseline\t-\t-\t1\t0\t-\tbaseline\tone critical open\n1\tt\tD-1\ttotal counted the items instead of summing them\t${head.slice(0, 7)}\t0\t-1\tpass\tkeep\tsum the amounts, refuse a non-list\n`);
    put(run, 'defects.tsv', 'id\tseverity\tpriority\tstatus\ttest_id\tsummary\tevidence\nD-1\tcritical\tP1\tfixed\tTC-7\ttotals show the item count\tevidence:def-D-1-green.txt\n');
    put(run, 'evidence/def-D-1-red.txt', 'total([1,2,3]) = 3\n'); put(run, 'evidence/def-D-1-green.txt', 'total([1,2,3]) = 6\n');
    const proved = await fix.prove(run, request(run, 'D-1-prove', { item: 'D-1', repo: x.d, commit: head, tests: ['tests/total.test.js'], argv }));
    assert.equal(proved.verdict, 'DETECTS', proved.reason);
    fix.sweep(run, request(run, 'D-1-sweep', { item: 'D-1', repo: x.d, commit: head, pattern: '\\.length\\b', paths: ['src'] }));
    const m = await fix.mutate(run, request(run, 'D-1-mutate', { item: 'D-1', repo: x.d, commit: head, argv, mutants: [
      { name: 'seed of one', file: 'src/total.js', find: 'a + b, 0)', replace: 'a + b, 1)' },
      { name: 'guard dropped', file: 'src/total.js', find: 'if (!Array.isArray(xs))', replace: 'if (false)' },
      { name: 'subtracts', file: 'src/total.js', find: 'a + b', replace: 'a - b' }] }));
    assert.deepEqual([m.killed, m.valid, m.survived], [3, 3, []]);
    put(run, 'tests.tsv', 'item\tcategory\ttests\tmutation\treason\nD-1\tproved\ttests/total.test.js\trequired\t\n');
    put(run, 'angles.tsv', 'item\tdimension\ttechnique\tstatus\ttest_id\texpected\treason\n' + angles('D-1'));
    put(run, 'sweep.tsv', 'item\tfile\tline\tdisposition\treference\nD-1\tsrc/count.js\t1\tnot-affected\tcount is a count: the length is the answer there\n');
    change(run, x);
    return run;
  }
  // The same run with one thing changed, for a check that must refuse it.
  const gamed = async change => valid(change);
  return { fix, world, request, valid, gamed, angles, put, git, argv, BUG, FIXED, TEST };
};
