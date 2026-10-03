const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict'), cp = require('node:child_process');
const repo = path.resolve(process.argv[2] || '.'), api = require(path.join(repo, 'scripts/migrate.cjs'));
const acceptance = require(path.join(repo, 'scripts/acceptance.cjs')), verification = require(path.join(repo, 'scripts/verification.cjs'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-migrate-'));
let passed = 0, failed = 0, seq = 0;
async function fixture(editInventory = () => {}, editChecks = () => {}, editSource = () => {}, editArtifacts = () => {}) {
  const root = path.join(tmp, String(++seq)); fs.mkdirSync(root); fs.mkdirSync(path.join(root, 'run')); fs.mkdirSync(path.join(root, 'run/evidence'));
  const put = (file, value) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value)); };
  const git = args => { const r = cp.spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const commit = () => { git(['add', '--all']); git(['-c', 'user.name=Migration Test', '-c', 'user.email=migration-test@example.invalid', 'commit', '--no-gpg-sign', '-qm', 'fixture']); return git(['rev-parse', 'HEAD']); };
  const implementation = 'module.exports = ({a, b}) => typeof a === "number" && typeof b === "number" ? {status:"ok",data:a + b,errors:[],effects:[{type:"sum",value:a + b}]} : {status:"invalid",data:null,errors:["numbers required"],effects:[]};\n';
  git(['init', '-q']); put('.gitignore', 'run/\n'); put('old.cjs', implementation); put('shared.txt', 'operator notes\n'); put('retired.txt', 'old runtime configuration\n');
  editSource({ root, put, git, commit });
  const baseline = commit();
  const refs = [{ spec: 'migration', id: 'parity' }];
  const inventory = { version: 2, source: { stack: 'Node.js legacy adapter', revision: baseline }, target: { stack: 'Node.js replacement adapter' },
    scope: { paths: ['.'], exclusions: [{ path: '.gitignore', reason: 'Repository ignore policy remains unchanged' }] },
    parity: { corpus: 'run/corpus.json', baseline: 'run/source.json', baseline_receipt: 'run/source-receipt.json', check: refs[0], negative_control: { spec: 'migration', id: 'negative-control' } },
    items: [
      { id: 'add', disposition: 'migrate', source_paths: ['old.cjs'], target_paths: ['target.cjs'], checks: refs },
      { id: 'notes', disposition: 'retain', source_paths: ['shared.txt'], target_paths: ['shared.txt'], reason: 'Operator documentation is still applicable', checks: refs },
      { id: 'config', disposition: 'remove', source_paths: ['retired.txt'], target_paths: [], reason: 'Replaced runtime uses no legacy configuration', checks: refs }
    ], domains: Object.fromEntries(api.domains.map(d => [d, ['jobs', 'data'].includes(d) ? { applicable: false, reason: 'Pure stateless function has no jobs or persistent data' } : { applicable: true, checks: refs }])) };
  editInventory(inventory);
  const migrated = inventory.items?.filter(item => item.disposition === 'migrate') || [], itemIds = migrated.length ? migrated.map(item => item.id) : ['add'];
  const corpus = { version: 1, cases: [
    { id: 'normal', input: { a: 2, b: 3 }, items: itemIds, kind: 'normal' },
    { id: 'zero', input: { a: 0, b: 0 }, items: itemIds, kind: 'boundary' },
    { id: 'negative', input: { a: -7, b: 2 }, items: itemIds, kind: 'boundary' },
    { id: 'invalid', input: { a: 'bad', b: 3 }, items: itemIds, kind: 'error' }
  ] };
  put('run/corpus.json', corpus);
  put('run/adapter.cjs', `const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const raw=fs.readFileSync(process.argv[3]), corpus=JSON.parse(raw), impl=require(path.resolve(process.argv[2]));
console.log(JSON.stringify({version:1,revision:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),corpus_sha256:crypto.createHash('sha256').update(raw).digest('hex'),cases:corpus.cases.map(row=>({id:row.id,input:row.input,output:impl(row.input)}))}));\n`);
  const execution = (argv, inputs) => ({ argv, inputs, environment: [], secret_env: {}, timeout_ms: 5000, output_limit: 8192 });
  put('run/source-checks.json', { checks: [{ spec: 'source', id: 'observe', dimension: 'functional', weight: 1, required: true, applicable: true,
    execution: execution([process.execPath, 'run/adapter.cjs', 'old.cjs', 'run/corpus.json'], ['old.cjs', 'shared.txt', 'retired.txt', 'run/adapter.cjs', 'run/corpus.json']) }] });
  acceptance.snapshot(root, 'run/source-checks.json', 'run/source-plan.json', ['run/corpus.json', 'run/adapter.cjs']);
  const sourceReceipt = await verification.execute(root, 'run/source-plan.json', 'source', 'observe', 'run/source-receipt.json');
  assert.equal(sourceReceipt.status, 'pass'); verification.validate(root, 'run/source-plan.json', 'source', 'observe', 'run/source-receipt.json');
  put('run/source.json', sourceReceipt.stdout);
  fs.copyFileSync(path.join(repo, 'scripts/migration-parity.cjs'), path.join(root, 'run/migration-parity.cjs'));
  fs.unlinkSync(path.join(root, 'old.cjs')); fs.unlinkSync(path.join(root, 'retired.txt'));
  put('target.cjs', implementation);
  const candidate = commit();
  const checks = [
    { spec: 'migration', id: 'parity', dimension: 'functional', weight: 1, required: true, applicable: true,
      execution: execution([process.execPath, 'run/adapter.cjs', 'target.cjs', 'run/corpus.json'], ['run/adapter.cjs', 'run/corpus.json', 'run/source.json', ...new Set(migrated.flatMap(item => item.target_paths))]) },
    { spec: 'migration', id: 'negative-control', dimension: 'functional', weight: 1, required: true, applicable: true,
      execution: execution([process.execPath, 'run/migration-parity.cjs', 'self-test', 'run/corpus.json', 'run/source.json', baseline], ['run/migration-parity.cjs', 'run/corpus.json', 'run/source.json']) }
  ];
  editChecks(checks);
  put('run/inventory.json', inventory); put('run/checks.json', { checks });
  editArtifacts({ root, put, corpus, sourceReceipt, inventory, checks });
  acceptance.snapshot(root, 'run/checks.json', 'run/plan.json', ['run/inventory.json', 'run/corpus.json', 'run/source.json', 'run/source-receipt.json', 'run/adapter.cjs', 'run/migration-parity.cjs']);
  const digest = acceptance.sha(fs.readFileSync(path.join(root, 'run/plan.json')));
  const receipts = async () => {
    const rows = [];
    for (const id of ['parity', 'negative-control']) {
      const receipt = 'run/evidence/' + id + '.json'; if (fs.existsSync(path.join(root, receipt))) fs.unlinkSync(path.join(root, receipt));
      let status = 'blocked';
      try { status = (await verification.execute(root, 'run/plan.json', 'migration', id, receipt)).status; } catch { /* malformed inputs stay blocked */ }
      rows.push('migration\tfunctional\t' + id + '\t1\t' + status + '\tevidence:evidence/' + id + '.json');
    }
    put('run/results.tsv', rows.join('\n') + '\n');
  };
  await receipts();
  return { root, put, git, commit, inventory, candidate, digest, receipts, implementation, corpus, sourceReceipt,
    check: (sha = candidate) => api.complete(root, 'run/inventory.json', 'run/plan.json', 'run/results.tsv', digest, sha) };
}
async function test(name, run) {
  try { await run(); passed++; console.log('PASS: ' + name); }
  catch (e) { failed++; console.error('FAIL: ' + name + ': ' + e.stack); }
}
(async () => {
  try {
    await test('verified scope covers migrate, retain and remove without claiming cutover', async () => {
      const f = await fixture(), r = f.check(); assert.equal(r.verdict, 'VERIFIED_SCOPE'); assert.equal(r.completed, 3); assert.equal(r.total, 3); assert.equal(r.cutover, 'NOT_VERIFIED');
      assert.equal(r.inventory_sha256, acceptance.sha(fs.readFileSync(path.join(f.root, 'run/inventory.json'))));
    });
    await test('pinned source inventory cannot be rewritten after snapshot', async () => {
      const f = await fixture(); f.inventory.items.pop(); f.put('run/inventory.json', f.inventory); assert.throws(f.check, /Stale acceptance input/);
    });
    await test('version 2 requires an explicit nonempty source scope', async () => {
      for (const edit of [i => i.version = 1, i => delete i.scope, i => i.scope.paths = [], i => delete i.scope.exclusions,
        i => i.scope.paths = ['../outside'], i => i.scope.paths = ['/absolute']]) {
        const f = await fixture(edit); assert.throws(f.check, /version 2|source scope/);
      }
    });
    await test('an omitted worker in the pinned source tree prevents verified scope', async () => {
      const f = await fixture(() => {}, () => {}, ({ put }) => put('workers/retry.py', 'def retry(): return "queued"\n'));
      assert.throws(f.check, /not inventoried or explicitly excluded: workers\/retry.py/);
    });
    await test('a worker needs an explicit reviewed exclusion to be outside delivery', async () => {
      const f = await fixture(i => i.scope.exclusions.push({ path: 'workers/retry.py', reason: 'Separate worker service is explicitly outside this replacement' }),
        () => {}, ({ put }) => put('workers/retry.py', 'def retry(): return "queued"\n'));
      assert.equal(f.check().verdict, 'VERIFIED_SCOPE');
    });
    await test('literal file scopes need no exclusions for unrelated source files', async () => {
      const f = await fixture(i => { i.scope.paths = ['old.cjs', 'shared.txt', 'retired.txt']; i.scope.exclusions = []; });
      assert.equal(f.check().verdict, 'VERIFIED_SCOPE');
    });
    await test('directory scope uses source-tree boundaries rather than string prefixes', async () => {
      const f = await fixture(i => {
        i.scope = { paths: ['app', 'old.cjs', 'shared.txt', 'retired.txt'], exclusions: [] };
        i.items.push({ id: 'worker', disposition: 'retain', source_paths: ['app/worker.py'], target_paths: ['app/worker.py'], reason: 'Independent retained component', checks: i.items[0].checks });
      }, () => {}, ({ put }) => { put('app/worker.py', '# retained\n'); put('application/worker.py', '# outside scope\n'); });
      assert.equal(f.check().verdict, 'VERIFIED_SCOPE');
    });
    await test('scope paths must exist in the fixed source revision, not only the candidate', async () => {
      for (const scoped of ['missing', 'target.cjs', 'old.*']) {
        const f = await fixture(i => { i.scope.paths = [scoped]; i.scope.exclusions = []; });
        assert.throws(f.check, /Scope path missing at source commit/);
      }
    });
    await test('duplicate and overlapping source scope roots are rejected', async () => {
      for (const roots of [['.', 'old.cjs'], ['old.cjs', 'old.cjs'], ['workers', 'workers/retry.py'], ['workers/retry.py', 'workers']]) {
        const f = await fixture(i => { i.scope.paths = roots; i.scope.exclusions = []; }, () => {}, ({ put }) => put('workers/retry.py', '# source worker\n'));
        assert.throws(f.check, /overlapping source scope/);
      }
    });
    await test('inventoried source files cannot silently extend outside declared scope', async () => {
      const f = await fixture(i => { i.scope.paths = ['old.cjs', 'retired.txt']; i.scope.exclusions = []; });
      assert.throws(f.check, /outside scope: shared.txt/);
    });
    await test('exclusions require reasons, exact source entries and unique ownership', async () => {
      for (const exclusion of [{ path: 'missing.py', reason: 'not present' }, { path: 'workers', reason: 'directory is not an exact file' },
        { path: '.gitignore', reason: 'duplicate' }, { path: 'old.cjs', reason: 'also inventoried' }, { path: 'workers/retry.py', reason: '' },
        { path: '../worker.py', reason: 'outside' }]) {
        const f = await fixture(i => i.scope.exclusions.push(exclusion), () => {}, ({ put }) => put('workers/retry.py', '# source worker\n'));
        assert.throws(f.check, /exclusion|Excluded path/);
      }
    });
    await test('an exclusion outside the selected source paths is invalid', async () => {
      const f = await fixture(i => { i.scope.paths = ['old.cjs', 'shared.txt', 'retired.txt']; });
      assert.throws(f.check, /Excluded path is outside scope/);
    });
    await test('excluding the whole selected scope cannot claim completion', async () => {
      const f = await fixture(i => { i.scope.paths = ['.gitignore']; });
      assert.throws(f.check, /Effective migration scope cannot be empty/);
    });
    await test('source scope cannot be narrowed after pinning', async () => {
      const f = await fixture(); f.inventory.scope.paths = ['old.cjs']; f.put('run/inventory.json', f.inventory);
      assert.throws(f.check, /Stale acceptance input/);
    });
    await test('retained and excluded files cannot conceal committed behavior changes', async () => {
      for (const file of ['shared.txt', '.gitignore']) {
        const f = await fixture(); f.put(file, fs.readFileSync(path.join(f.root, file), 'utf8') + '# changed\n');
        const next = f.commit(); await f.receipts(); const r = f.check(next);
        assert.equal(r.verdict, 'BLOCKED'); assert.match(r.unresolved.join('\n'), /Retained\/excluded source entry changed/);
      }
    });
    await test('symlink source entries require explicit preserved exclusions', async () => {
      const source = ({ put, git }) => {
        git(['config', 'core.symlinks', 'false']); put('legacy-link', 'old.cjs'); git(['add', 'legacy-link']);
        git(['update-index', '--cacheinfo', '120000,' + git(['hash-object', '-w', 'legacy-link']) + ',legacy-link']);
      };
      const hidden = await fixture(() => {}, () => {}, source);
      assert.match(hidden.git(['ls-tree', hidden.inventory.source.revision, 'legacy-link']), /^120000/);
      assert.throws(hidden.check, /Symlink\/submodule source requires/);
      const excluded = await fixture(i => i.scope.exclusions.push({ path: 'legacy-link', reason: 'Archived link is outside application scope' }), () => {}, source);
      assert.equal(excluded.check().verdict, 'VERIFIED_SCOPE');
    });
    await test('submodule source entries require an explicit unchanged boundary', async () => {
      const source = ({ put, git }) => {
        put('vendor/library/value.txt', 'separate component\n'); git(['-C', 'vendor/library', 'init', '-q']);
        git(['-C', 'vendor/library', 'add', '--all']);
        git(['-C', 'vendor/library', '-c', 'user.name=Migration Test', '-c', 'user.email=migration-test@example.invalid', 'commit', '--no-gpg-sign', '-qm', 'module']);
      };
      const hidden = await fixture(() => {}, () => {}, source); assert.throws(hidden.check, /Symlink\/submodule source requires/);
      const excluded = await fixture(i => i.scope.exclusions.push({ path: 'vendor/library', reason: 'Separately versioned library is unchanged' }), () => {}, source);
      assert.equal(excluded.check().verdict, 'VERIFIED_SCOPE');
    });
    await test('a replacement needs migrated behavior and an independent negative control', async () => {
      for (const edit of [i => delete i.parity, i => i.parity.negative_control = i.parity.check,
        i => { i.items[0].disposition = 'remove'; i.items[0].target_paths = []; i.items[0].reason = 'retire only'; }]) {
        const f = await fixture(edit); assert.throws(f.check, /parity contract|distinct required|at least one migrated/);
      }
    });
    await test('source baseline receipt cannot invent source identity or observations', async () => {
      for (const change of [r => r.context.candidate.revision = '0'.repeat(40), r => r.context.candidate.dirty_sha256 = '0'.repeat(64),
        r => r.stdout_sha256 = '0'.repeat(64), r => r.context.inputs['old.cjs'] = '0'.repeat(64), r => r.context.inputs['run/corpus.json'] = '0'.repeat(64),
        r => r.status = 'fail', r => r.exit_code = 1, r => r.context.runner.verifier_sha256 = '0'.repeat(64), r => r.context.runner.acceptance_sha256 = '0'.repeat(64)]) {
        const f = await fixture(() => {}, () => {}, () => {}, ({ put, sourceReceipt }) => { change(sourceReceipt); put('run/source-receipt.json', sourceReceipt); });
        assert.throws(f.check, /Frozen source receipt|committed source bytes/);
      }
    });
    await test('normal plus boundary or error cases must cover every migrated inventory item', async () => {
      for (const change of [c => c.cases.forEach(row => row.kind = 'normal'), c => c.cases.forEach(row => row.items = ['unknown'])]) {
        const f = await fixture(() => {}, () => {}, () => {}, ({ put, corpus, sourceReceipt }) => {
          change(corpus); const raw = JSON.stringify(corpus), observed = JSON.parse(sourceReceipt.stdout);
          observed.corpus_sha256 = acceptance.sha(raw); sourceReceipt.stdout = JSON.stringify(observed) + '\n';
          sourceReceipt.stdout_sha256 = acceptance.sha(sourceReceipt.stdout); sourceReceipt.context.inputs['run/corpus.json'] = acceptance.sha(raw);
          put('run/corpus.json', raw); put('run/source.json', sourceReceipt.stdout); put('run/source-receipt.json', sourceReceipt);
        });
        assert.throws(f.check, /normal and boundary\/error|unknown\/nonmigrated/);
      }
    });
    await test('parity assertions must bind every migrated target and negative-control helper bytes', async () => {
      const omitted = await fixture(() => {}, c => c[0].execution.inputs = c[0].execution.inputs.filter(p => p !== 'target.cjs'));
      assert.throws(omitted.check, /every migrated target file/);
      const counterfeit = await fixture(() => {}, () => {}, () => {}, ({ put }) => put('run/migration-parity.cjs', 'console.log("green");\n'));
      assert.throws(counterfeit.check, /exact trusted parity helper/);
      const unrelated = await fixture(i => i.items[0].checks = [i.parity.negative_control]);
      assert.throws(unrelated.check, /must reference the parity check/);
    });
    await test('generic green output cannot establish differential parity', async () => {
      const f = await fixture(() => {}, c => c[0].execution.argv = [process.execPath, '-e', 'console.log("green")']);
      const r = f.check(); assert.equal(r.verdict, 'BLOCKED'); assert.match(r.unresolved.join('\n'), /Parity:/);
    });
    await test('real target mutants reveal wrong values, side effects, errors and statuses', async () => {
      for (const mutate of [s => s.replace('data:a + b', 'data:5'), s => s.replace('value:a + b', 'value:999'),
        s => s.replace('errors:["numbers required"]', 'errors:[]'), s => s.replace('status:"invalid"', 'status:"ok"')]) {
        const f = await fixture(); f.put('target.cjs', mutate(f.implementation)); const next = f.commit(); await f.receipts();
        const r = f.check(next); assert.equal(r.verdict, 'BLOCKED'); assert.equal(r.completed, 0); assert.match(r.unresolved.join('\n'), /Parity: .* differs at output\./);
      }
    });
    await test('approved plan hash is required and cannot be substituted', async () => {
      const f = await fixture(); for (const hash of [undefined, '0'.repeat(64)]) assert.throws(() => api.complete(f.root, 'run/inventory.json', 'run/plan.json', 'run/results.tsv', hash, f.candidate), /digest/);
    });
    await test('unknown inventory item check cannot bypass acceptance', async () => {
      const f = await fixture(i => i.items[0].checks = [{ spec: 'migration', id: 'nonexistent' }]); assert.throws(f.check, /applicable required/);
    });
    await test('optional checks cannot prove a migration item', async () => {
      const f = await fixture(() => {}, checks => { checks.push({ ...checks[0], id: 'required' }); checks[0].required = false; }); assert.throws(f.check, /applicable required/);
    });
    await test('missing and empty inventory cannot count as completion', async () => {
      for (const edit of [i => delete i.items, i => i.items = []]) { const f = await fixture(edit); assert.throws(f.check, /Nonempty frozen inventory/); }
    });
    await test('missing domains and unjustified coverage exclusions fail closed', async () => {
      for (const edit of [i => delete i.domains.regression, i => i.domains.security = { applicable: false, reason: 'skip security' }, i => i.domains.data = { applicable: false }]) {
        const f = await fixture(edit); assert.throws(f.check, /coverage/);
      }
    });
    await test('inventory paths must exist at the pinned source commit', async () => {
      const f = await fixture(i => i.items[0].source_paths = ['never-existed.py']); assert.throws(f.check, /missing at source commit/);
    });
    await test('source inventory rejects traversal and conflicting ownership', async () => {
      for (const edit of [i => i.items[0].source_paths = ['../outside.py'], i => i.items[1].source_paths = ['old.cjs']]) {
        const f = await fixture(edit); assert.throws(f.check, /relative files|conflicting inventory/);
      }
    });
    await test('source revision must identify an existing exact commit', async () => {
      for (const rev of ['HEAD', '0'.repeat(40)]) { const f = await fixture(i => i.source.revision = rev); assert.throws(f.check, /full source commit|Git inspection/); }
    });
    await test('candidate identity is bound to current HEAD', async () => {
      const f = await fixture(), r = f.check(f.inventory.source.revision); assert.equal(r.verdict, 'BLOCKED'); assert.equal(r.completed, 0); assert.match(r.unresolved.join('\n'), /differs from HEAD/);
    });
    await test('uncommitted tracked work cannot complete even with fresh receipts', async () => {
      const f = await fixture(); f.put('target.cjs', f.implementation.replaceAll('a + b', 'b + a'));  await f.receipts(); const r = f.check(); assert.equal(r.verdict, 'BLOCKED'); assert.match(r.unresolved.join('\n'), /not committed/);
    });
    await test('old source files must be retired even when untracked', async () => {
      const f = await fixture(); f.put('old.cjs', 'leftover runtime\n'); const r = f.check(); assert.equal(r.verdict, 'BLOCKED'); assert.match(r.unresolved.join('\n'), /source not retired/);
    });
    await test('newly added untracked target cannot satisfy the committed target inventory', async () => {
      const f = await fixture(i => i.items[0].target_paths.push('untracked.cjs')); f.put('untracked.cjs', '// not committed\n'); const r = f.check(); assert.equal(r.verdict, 'BLOCKED'); assert.match(r.unresolved.join('\n'), /target is not committed/);
    });
    await test('untracked implementation helpers cannot hide outside the reviewed target paths', async () => {
      const f = await fixture(); f.put('helper.cjs', 'module.exports = 42;\n'); const r = f.check(); assert.equal(r.verdict, 'BLOCKED'); assert.equal(r.completed, 0); assert.match(r.unresolved.join('\n'), /Untracked files/);
    });
    await test('retain and remove dispositions require explicit reasons', async () => {
      for (const idx of [1, 2]) { const f = await fixture(i => delete i.items[idx].reason); assert.throws(f.check, /reviewed reason/); }
    });
    await test('framework rewrites can preserve a source path as their target', async () => {
      const f = await fixture(i => { i.items[1].disposition = 'migrate'; delete i.items[1].reason; }); assert.equal(f.check().verdict, 'VERIFIED_SCOPE');
    });
    await test('missing or falsified acceptance receipts prevent completion', async () => {
      const f = await fixture(); fs.unlinkSync(path.join(f.root, 'run/evidence/parity.json')); assert.equal(f.check().verdict, 'BLOCKED');
      f.put('run/evidence/parity.json', { status: 'pass' }); assert.equal(f.check().verdict, 'BLOCKED');
    });
    await test('missing and failing acceptance rows remain blocked', async () => {
      const f = await fixture(); for (const rows of ['', 'migration\tfunctional\tparity\t1\tfail\n']) { f.put('run/results.tsv', rows); assert.equal(f.check().verdict, 'BLOCKED'); }
    });
    await test('a changed implementation invalidates previously passing execution', async () => {
      const f = await fixture(); f.put('target.cjs', f.implementation.replaceAll('a + b', 'a - b'));  const next = f.commit(), r = f.check(next); assert.equal(r.verdict, 'BLOCKED'); assert.match(r.unresolved.join('\n'), /evidence unavailable/);
    });
    await test('CLI returns machine-readable scope verdict and fails closed', async () => {
      const f = await fixture(), run = digest => cp.spawnSync(process.execPath, [path.join(repo, 'scripts/migrate.cjs'), 'complete', f.root, 'run/inventory.json', 'run/plan.json', 'run/results.tsv', digest, f.candidate], { encoding: 'utf8', windowsHide: true });
      const ok = run(f.digest); assert.equal(ok.status, 0, ok.stderr); assert.equal(JSON.parse(ok.stdout).verdict, 'VERIFIED_SCOPE');
      f.put('old.cjs', 'leftover\n'); assert.equal(run(f.digest).status, 1); assert.equal(run('invalid').status, 2);
    });
    await test('handoff consumers independently enforce scope verification and cutover separation', async () => {
      const f = await fixture(), handoff = { version: '3.3.0', source: 'migrate', timestamp: new Date().toISOString(), status: 'COMPLETE', verdict: 'VERIFIED_SCOPE',
        results_tsv: 'results.tsv', acceptance: { plan: 'plan.json', plan_sha256: f.digest },
        migration: { inventory: 'inventory.json', inventory_sha256: f.check().inventory_sha256, candidate_sha: f.candidate, cutover: 'NOT_VERIFIED' } };
      const bash = process.env.FORGE_BASH || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
      const run = () => { f.put('run/handoff.json', handoff); return cp.spawnSync(bash, [path.join(repo, 'scripts/validate-handoff.sh'), path.join(f.root, 'run/handoff.json'), 'migrate', '--require-pass'], { cwd: f.root, env: { ...process.env, FORGE_PROJECT_ROOT: f.root }, encoding: 'utf8', windowsHide: true }); };
      let r = run(); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /VALID/);
      handoff.migration.cutover = 'VERIFIED'; assert.equal(run().status, 1); handoff.migration.cutover = 'NOT_VERIFIED';
      handoff.migration.inventory_sha256 = '0'.repeat(64); assert.equal(run().status, 1); handoff.migration.inventory_sha256 = f.check().inventory_sha256;
      f.put('old.cjs', 'old runtime restored\n'); assert.equal(run().status, 1);
    });
  } finally {
    // The unique temporary root is created by this process and never derived from project input.
    assert.equal(path.dirname(fs.realpathSync(tmp)), fs.realpathSync(os.tmpdir()));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`${passed}/${passed + failed} migration checks passed`); if (failed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
