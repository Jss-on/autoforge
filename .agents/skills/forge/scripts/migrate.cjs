// Migration scope completion reuses pinned acceptance receipts; it never runs their commands.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const a = require('./acceptance.cjs');
const verification = require('./verification.cjs'), parityGate = require('./migration-parity.cjs');
const domains = ['behavior', 'regression', 'jobs', 'data', 'security', 'operations', 'retirement'];
const revision = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const relpath = value => a.text(value) && !/[\\:]/.test(value) && !path.isAbsolute(value) && !value.split('/').some(p => ['', '.', '..'].includes(p));
const key = ref => JSON.stringify([ref.spec, ref.id]);
function git(root, args, encoding = 'utf8') {
  const r = cp.spawnSync('git', args, { cwd: root, encoding, timeout: 10000, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  a.need(r.status === 0 && !r.error, 'Git inspection failed: ' + args[0]);
  return r.stdout;
}
function tree(root, commit) {
  return new Map(git(root, ['ls-tree', '-r', '-z', '--full-tree', commit]).split('\0').filter(Boolean)
    .map(entry => { const [mode, , object] = entry.slice(0, entry.indexOf('\t')).split(' '); return [entry.slice(entry.indexOf('\t') + 1), { mode, object }]; }));
}
const regularFiles = entries => new Set([...entries].filter(([, entry]) => ['100644', '100755'].includes(entry.mode)).map(([file]) => file));
function exists(file) {
  try { fs.lstatSync(file); return true; } catch (e) { if (['ENOENT', 'ENOTDIR'].includes(e.code)) return false; throw e; }
}
function complete(project, inventoryFile, planFile, resultsFile, expected, candidate) {
  a.need(a.digest(expected) && revision(candidate), 'Approved plan digest and full candidate commit required');
  const p = a.loadPlan(project, planFile, expected), file = a.argument(p.root, inventoryFile), raw = fs.readFileSync(file);
  const inventoryPath = path.relative(p.root, file).split(path.sep).join('/'), inventory = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
  a.need(p.plan.inputs[inventoryPath] === a.sha(raw), 'Migration inventory must be a pinned acceptance input');
  a.need(a.object(inventory) && inventory.version === 2 && a.object(inventory.source) && a.text(inventory.source.stack) && revision(inventory.source.revision) &&
    a.object(inventory.target) && a.text(inventory.target.stack), 'Inventory version 2, source/target stack and full source commit required');
  a.need(Array.isArray(inventory.items) && inventory.items.length > 0 && a.object(inventory.domains), 'Nonempty frozen inventory and coverage domains required');
  const scope = inventory.scope;
  a.need(a.object(scope) && Array.isArray(scope.paths) && scope.paths.length > 0 && scope.paths.every(s => s === '.' || relpath(s)) &&
    Array.isArray(scope.exclusions), 'Explicit source scope paths and exclusions required');
  const checkMap = new Map(p.plan.checks.map(c => [key(c), c]));
  function references(refs, label) {
    a.need(Array.isArray(refs) && refs.length > 0, 'Required acceptance mappings missing: ' + label);
    const seen = new Set();
    for (const ref of refs) {
      a.need(a.object(ref) && a.text(ref.spec) && a.text(ref.id) && !seen.has(key(ref)), 'Invalid/duplicate acceptance mapping: ' + label);
      const c = checkMap.get(key(ref));
      a.need(c?.applicable && c.required, 'Mapping must name an applicable required acceptance check: ' + label);
      seen.add(key(ref));
    }
  }
  for (const domain of domains) {
    const d = inventory.domains[domain];
    a.need(a.object(d) && typeof d.applicable === 'boolean', 'Missing coverage decision: ' + domain);
    if (d.applicable) references(d.checks, domain);
    else a.need(['jobs', 'data'].includes(domain) && a.text(d.reason) && (!d.checks || (Array.isArray(d.checks) && d.checks.length === 0)), 'Unjustified/non-optional coverage exclusion: ' + domain);
  }
  a.need(Object.keys(inventory.domains).every(d => domains.includes(d)), 'Unknown coverage domain');
  const ids = new Set(), sources = new Set();
  for (const item of inventory.items) {
    a.need(a.object(item) && a.text(item.id) && !ids.has(item.id) && ['migrate', 'retain', 'remove'].includes(item.disposition), 'Invalid/duplicate inventory item');
    ids.add(item.id);
    a.need(Array.isArray(item.source_paths) && item.source_paths.length > 0 && item.source_paths.every(relpath) &&
      Array.isArray(item.target_paths) && item.target_paths.every(relpath) && new Set(item.target_paths).size === item.target_paths.length, 'Inventory paths must be repository-relative files: ' + item.id);
    for (const source of item.source_paths) { a.need(!sources.has(source), 'Source path has conflicting inventory ownership: ' + source); sources.add(source); }
    a.need(item.disposition !== 'migrate' || item.target_paths.length > 0, 'Migrated item needs target paths: ' + item.id);
    a.need(item.disposition === 'migrate' || a.text(item.reason), 'Retain/remove disposition needs reviewed reason: ' + item.id);
    a.need(item.disposition !== 'remove' || item.target_paths.length === 0, 'Removed item cannot have target paths: ' + item.id);
    a.need(item.disposition !== 'retain' || (item.source_paths.length === item.target_paths.length && item.source_paths.every(s => item.target_paths.includes(s))), 'Retained item must preserve its source paths: ' + item.id);
    references(item.checks, item.id);
  }
  const top = git(p.root, ['rev-parse', '--show-toplevel']).trim();
  a.need(fs.realpathSync(top) === p.root, 'Project must be the Git repository root');
  a.need(git(p.root, ['rev-parse', '--verify', inventory.source.revision + '^{commit}']).trim() === inventory.source.revision, 'Source revision must be an exact commit');
  const sourceTree = tree(p.root, inventory.source.revision), candidateTree = tree(p.root, 'HEAD');
  const baseline = regularFiles(sourceTree), current = regularFiles(candidateTree), unresolved = [];
  for (const source of sources) a.need(baseline.has(source), 'Inventoried source path missing at source commit: ' + source);
  const scoped = new Set(), roots = [], excluded = new Set();
  for (const root of scope.paths) {
    a.need(!roots.some(other => root === other || root === '.' || other === '.' || root.startsWith(other + '/') || other.startsWith(root + '/')), 'Duplicate/overlapping source scope: ' + root);
    const entries = [...sourceTree.keys()].filter(file => root === '.' || file === root || file.startsWith(root + '/'));
    a.need(entries.length > 0, 'Scope path missing at source commit: ' + root);
    roots.push(root); for (const entry of entries) scoped.add(entry);
  }
  for (const exclusion of scope.exclusions) {
    a.need(a.object(exclusion) && relpath(exclusion.path) && a.text(exclusion.reason), 'Source exclusion needs a literal path and reviewed reason');
    a.need(scoped.has(exclusion.path), 'Excluded path is outside scope or not a source file: ' + exclusion.path);
    a.need(!excluded.has(exclusion.path) && !sources.has(exclusion.path), 'Duplicate/overlapping source exclusion: ' + exclusion.path);
    excluded.add(exclusion.path);
  }
  a.need(scoped.size > excluded.size, 'Effective migration scope cannot be empty');
  for (const source of sources) a.need(scoped.has(source), 'Inventoried source path is outside scope: ' + source);
  for (const entry of scoped) {
    a.need(baseline.has(entry) || excluded.has(entry), 'Symlink/submodule source requires an explicit reviewed exclusion: ' + entry);
    a.need(sources.has(entry) || excluded.has(entry), 'Source scope file is not inventoried or explicitly excluded: ' + entry);
  }
  const migrated = inventory.items.filter(item => item.disposition === 'migrate'), parity = inventory.parity;
  a.need(migrated.length > 0, 'A migration requires at least one migrated inventory item');
  a.need(a.object(parity), 'Pinned differential parity contract required');
  references([parity.check], 'parity'); references([parity.negative_control], 'negative_control');
  a.need(key(parity.check) !== key(parity.negative_control), 'Parity and negative control must be distinct required checks');
  for (const item of migrated) a.need(item.checks.some(ref => key(ref) === key(parity.check)), 'Migrated item must reference the parity check: ' + item.id);
  const pinned = (rel, label) => {
    a.need(relpath(rel) && a.digest(p.plan.inputs[rel]), 'Frozen acceptance input required: ' + label);
    return fs.readFileSync(a.local(p.root, rel));
  };
  const corpusRaw = pinned(parity.corpus, 'parity corpus'), sourceRaw = pinned(parity.baseline, 'source observations');
  const corpusText = corpusRaw.toString('utf8'), sourceText = sourceRaw.toString('utf8'), sourceSHA = inventory.source.revision;
  parityGate.compareText(corpusText, sourceText, sourceText, sourceSHA, sourceSHA);
  const corpus = JSON.parse(corpusText.replace(/^\uFEFF/, '')), migratedIds = new Set(migrated.map(item => item.id));
  for (const row of corpus.cases) a.need(row.items.every(id => migratedIds.has(id)), 'Corpus references unknown/nonmigrated inventory item: ' + row.id);
  for (const item of migrated) {
    const cases = corpus.cases.filter(row => row.items.includes(item.id));
    a.need(cases.some(row => row.kind === 'normal') && cases.some(row => ['boundary', 'error'].includes(row.kind)), 'Migrated item needs normal and boundary/error parity cases: ' + item.id);
  }
  const baselineReceipt = JSON.parse(pinned(parity.baseline_receipt, 'source execution receipt').toString('utf8'));
  a.need(a.object(baselineReceipt) && baselineReceipt.version === 1 && baselineReceipt.status === 'pass' && baselineReceipt.exit_code === 0 &&
    baselineReceipt.signal === null && baselineReceipt.error === null && baselineReceipt.redacted === true &&
    baselineReceipt.stdout === sourceText && baselineReceipt.stdout_sha256 === a.sha(sourceRaw) &&
    baselineReceipt.context?.candidate?.revision === sourceSHA && baselineReceipt.context.candidate.dirty_sha256 === a.sha('') &&
    baselineReceipt.context?.inputs?.[parity.corpus] === a.sha(corpusRaw) &&
    baselineReceipt.context?.runner?.verifier_sha256 === a.sha(fs.readFileSync(require.resolve('./verification.cjs'))) &&
    baselineReceipt.context?.runner?.acceptance_sha256 === a.sha(fs.readFileSync(require.resolve('./acceptance.cjs'))),
    'Frozen source receipt must bind trusted runner, clean source revision, corpus and exact observations');
  for (const source of new Set(migrated.flatMap(item => item.source_paths))) {
    a.need(baselineReceipt.context.inputs[source] === a.sha(git(p.root, ['show', sourceSHA + ':' + source], null)), 'Source receipt does not bind committed source bytes: ' + source);
  }
  const comparison = checkMap.get(key(parity.check)), control = checkMap.get(key(parity.negative_control));
  const inputsCover = (check, inputs) => Array.isArray(check.execution?.inputs) && inputs.every(input => check.execution.inputs.includes(input));
  a.need(inputsCover(comparison, [parity.corpus, parity.baseline, ...migrated.flatMap(item => item.target_paths)]), 'Parity execution must cover frozen observations and every migrated target file');
  const argv = control.execution?.argv;
  a.need(Array.isArray(argv) && argv.length === 6 && argv[2] === 'self-test' && argv[3] === parity.corpus && argv[4] === parity.baseline && argv[5] === sourceSHA,
    'Negative control must run Node, trusted helper, self-test, corpus, baseline and source revision');
  a.need(inputsCover(control, [argv[1], parity.corpus, parity.baseline]) &&
    a.sha(pinned(argv[1], 'trusted parity helper')) === a.sha(fs.readFileSync(require.resolve('./migration-parity.cjs'))), 'Negative control must pin the exact trusted parity helper and its inputs');
  const preserved = new Set([...excluded, ...inventory.items.filter(item => item.disposition === 'retain').flatMap(item => item.source_paths)]);
  for (const entry of preserved) if (JSON.stringify(sourceTree.get(entry)) !== JSON.stringify(candidateTree.get(entry))) {
    unresolved.push('Retained/excluded source entry changed; inventory its migration or removal: ' + entry);
  }
  if (git(p.root, ['rev-parse', 'HEAD']).trim() !== candidate) unresolved.push('Candidate commit differs from HEAD');
  if (git(p.root, ['status', '--porcelain', '--untracked-files=no']).trim()) unresolved.push('Tracked worktree/index changes are not committed');
  if (git(p.root, ['ls-files', '--others', '--exclude-standard', '-z']).length) unresolved.push('Untracked files are not committed; exclude run evidence locally');
  const candidateReady = unresolved.length === 0;
  let completed = 0;
  for (const item of inventory.items) {
    const before = unresolved.length;
    for (const target of item.target_paths) {
      if (!current.has(target)) { unresolved.push(item.id + ': target is not committed: ' + target); continue; }
      try { a.need(fs.lstatSync(path.resolve(p.root, target)).isFile(), 'Regular target file required'); a.local(p.root, target); }
      catch { unresolved.push(item.id + ': target unavailable: ' + target); }
    }
    for (const source of item.source_paths) if (!item.target_paths.includes(source) && (current.has(source) || exists(path.resolve(p.root, source)))) unresolved.push(item.id + ': source not retired: ' + source);
    if (unresolved.length === before) completed++;
  }
  const acceptance = a.complete(p.root, planFile, resultsFile, expected);
  unresolved.push(...acceptance.unresolved.map(reason => 'Acceptance: ' + reason));
  if (acceptance.verdict === 'COMPLETE') {
    try {
      const results = a.argument(p.root, resultsFile), rows = a.rows(fs.readFileSync(results, 'utf8'));
      const receipt = ref => {
        const row = rows.find(r => key(r) === key(ref));
        a.need(row?.detail?.startsWith('evidence:'), 'Parity receipt missing');
        return verification.validate(p.root, planFile, ref.spec, ref.id, a.local(path.dirname(results), row.detail.slice('evidence:'.length)));
      };
      const observed = receipt(parity.check), negative = receipt(parity.negative_control);
      a.need(fs.realpathSync(negative.context.executable.path) === fs.realpathSync(process.execPath) &&
        negative.context.executable.sha256 === a.sha(fs.readFileSync(process.execPath)), 'Negative control must execute the current trusted Node binary');
      const report = JSON.parse(negative.stdout);
      a.need(report.verdict === 'NEGATIVE_CONTROLS_PASS' && report.cases === corpus.cases.length && report.controls === 4 * corpus.cases.length &&
        report.source_revision === sourceSHA && report.corpus_sha256 === a.sha(corpusRaw) && report.source_sha256 === a.sha(sourceRaw), 'Negative control did not prove sensitivity to frozen observations');
      const compared = parityGate.compareText(corpusText, sourceText, observed.stdout, sourceSHA, candidate);
      if (compared.verdict !== 'MATCH') unresolved.push(...compared.mismatches.map(m => 'Parity: ' + m.id + ' differs at ' + m.field));
    } catch (e) { unresolved.push('Parity: ' + e.message); }
  }
  // Path disposition alone cannot prove migration. Report complete items only after all frozen checks pass.
  if (acceptance.verdict !== 'COMPLETE' || !candidateReady || unresolved.some(reason => reason.startsWith('Parity:'))) completed = 0;
  return { verdict: unresolved.length ? 'BLOCKED' : 'VERIFIED_SCOPE', completed, total: inventory.items.length, unresolved,
    candidate_sha: candidate, inventory_sha256: a.sha(raw), plan_sha256: p.sha256, cutover: 'NOT_VERIFIED' };
}
module.exports = { complete, domains };
if (require.main === module) {
  try {
    const [action, ...args] = process.argv.slice(2);
    a.need(action === 'complete' && args.length === 6, 'complete <project> <inventory.json> <acceptance-plan.json> <results.tsv> <approved-plan-sha256> <candidate-sha>');
    const result = complete(...args); console.log(JSON.stringify(result));
    if (result.verdict !== 'VERIFIED_SCOPE') process.exitCode = 1;
  } catch (e) { console.error('Invalid migration: ' + e.message); process.exitCode = 2; }
}
