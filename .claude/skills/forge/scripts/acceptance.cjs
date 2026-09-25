// Pinned acceptance snapshots and the shared completion gate. Node stdlib only.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const need = (ok, message) => { if (!ok) throw Error(message); };
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(v);
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const dims = ['logic', 'functional', 'ux', 'devops', 'monitoring', 'hardening'];
const statuses = ['pass', 'fail', 'blocked', 'flaky', 'not_run', 'skip'];
const key = c => JSON.stringify([c.spec, c.id]);
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const inside = (root, file) => { const rel = path.relative(root, file); return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel); };
function local(root, rel) {
  need(text(rel) && !/[\\:]/.test(rel) && !path.isAbsolute(rel) && !rel.split('/').some(p => ['', '.', '..'].includes(p)), 'Invalid relative input/evidence path');
  const file = fs.realpathSync(path.resolve(root, rel));
  need(inside(root, file) && fs.statSync(file).isFile(), 'Input/evidence escapes root or is not a file');
  return file;
}
function argument(root, value) {
  const file = fs.realpathSync(path.resolve(root, value));
  need(inside(root, file) && fs.statSync(file).isFile(), 'File must be inside project');
  return file;
}
function rows(source) {
  const seen = new Set(), out = [];
  for (const [i, line] of source.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    if (!line.trim() || line.startsWith('#')) continue;
    const c = line.split('\t');
    if (c[0] === 'spec' && c[1] === 'dimension') continue;
    const row = { spec: c[0], dimension: c[1], id: c[2], weight: Number(c[3]), status: c[4], detail: c[5] || '', traces: c[6] || '' };
    need(c.length >= 5 && c.length <= 7 && text(row.spec) && text(row.id) && dims.includes(row.dimension) && statuses.includes(row.status) &&
      /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(c[3]) && Number.isFinite(row.weight) && row.weight > 0 && !seen.has(key(row)), 'Invalid results row ' + (i + 1));
    seen.add(key(row)); out.push(row);
  }
  return out;
}
function checks(list) {
  need(Array.isArray(list) && list.length > 0, 'Nonempty approved checks required');
  const seen = new Set();
  for (const c of list) {
    need(object(c) && text(c.spec) && text(c.id) && dims.includes(c.dimension) && Number.isFinite(c.weight) && c.weight > 0 &&
      typeof c.required === 'boolean' && typeof c.applicable === 'boolean' && (c.applicable || text(c.reason)) &&
      !(c.dimension === 'logic' && c.applicable && !c.required) && !seen.has(key(c)), 'Invalid/duplicate check or unjustified applicability');
    seen.add(key(c));
  }
  need(list.some(c => c.required && c.applicable), 'At least one applicable required check is necessary');
}
function previous(root, ref, next) {
  if (ref === undefined) return;
  need(object(ref) && digest(ref.sha256), 'Previous plan digest required');
  const file = local(root, ref.path);
  need(sha(fs.readFileSync(file)) === ref.sha256, 'Previous acceptance plan changed');
  const old = json(file); checks(old.checks);
  for (const c of old.checks) {
    const n = next.find(v => key(v) === key(c));
    need(n && n.dimension === c.dimension && n.weight === c.weight && (!c.required || n.required) && (!c.applicable || n.applicable), 'Feature cannot remove or weaken its acceptance floor');
  }
}
function snapshot(project, definition, output, inputs, prior) {
  const root = fs.realpathSync(project), def = json(local(root, definition)); checks(def.checks);
  need(Array.isArray(inputs) && inputs.length > 0, 'Pin source requirements/verifier inputs');
  previous(root, prior, def.checks);
  const hashes = Object.fromEntries([...new Set([definition, ...inputs])].sort().map(p => [p, sha(fs.readFileSync(local(root, p)))]));
  const plan = { version: 1, definition, inputs: hashes, checks: def.checks, ...(def.hosting ? { hosting: def.hosting } : {}), ...(prior ? { previous: prior } : {}) };
  const out = path.resolve(root, output);
  need(inside(root, out) && inside(root, fs.realpathSync(path.dirname(out))), 'Snapshot output escapes project');
  fs.writeFileSync(out, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
  return plan;
}
function loadPlan(project, file, expected) {
  const root = fs.realpathSync(project), source = argument(root, file), raw = fs.readFileSync(source), plan = json(source);
  need(expected === undefined || (digest(expected) && sha(raw) === expected), 'Acceptance plan digest mismatch');
  need(object(plan) && plan.version === 1 && object(plan.inputs) && Object.keys(plan.inputs).length >= 2 && digest(plan.inputs[plan.definition]), 'Invalid acceptance snapshot');
  checks(plan.checks);
  for (const [p, hash] of Object.entries(plan.inputs)) need(digest(hash) && sha(fs.readFileSync(local(root, p))) === hash, 'Stale acceptance input: ' + p);
  const def = json(local(root, plan.definition));
  need(JSON.stringify(def.checks) === JSON.stringify(plan.checks) && JSON.stringify(def.hosting) === JSON.stringify(plan.hosting), 'Snapshot differs from approved check definitions');
  previous(root, plan.previous, plan.checks);
  return { root, plan, sha256: sha(raw) };
}
function hosting(project, planFile, expected) {
  const p = loadPlan(project, planFile, expected), h = p.plan.hosting;
  need(object(h) && ['managed', 'static', 'container'].includes(h.kind) && typeof h.stateful === 'boolean' && text(h.target) && digest(p.plan.inputs[h.decision]), 'Pinned hosting decision and target required; re-verify legacy specs');
  need(!(h.kind === 'static' && h.stateful), 'Stateful service cannot use static-only applicability');
  const outcomes = ['delivery', 'configuration', 'health', 'observability',
    ...(h.stateful ? ['persistence', 'compatibility', 'backup', 'restore'] : []),
    ...(h.kind === 'container' ? ['container_nonroot', 'container_health', 'container_image'] : [])];
  for (const outcome of outcomes) need(p.plan.checks.some(c => c.outcome === outcome && c.applicable && c.required), 'Missing applicable required outcome: ' + outcome);
  return { verdict: 'READY', kind: h.kind, stateful: h.stateful, target: h.target, outcomes, plan_sha256: p.sha256 };
}
function complete(project, planFile, resultsFile, expected) {
  const p = loadPlan(project, planFile, expected), resultPath = argument(p.root, resultsFile);
  if (p.plan.hosting) hosting(project, planFile, expected);
  const found = rows(fs.readFileSync(resultPath, 'utf8')), byId = new Map(found.map(r => [key(r), r]));
  need(found.every(r => p.plan.checks.some(c => key(c) === key(r))), 'Unexpected acceptance result ID');
  const unresolved = []; let passed = 0, total = 0;
  for (const c of p.plan.checks) {
    const r = byId.get(key(c)), required = c.applicable && c.required;
    if (required) total++;
    if (!r) { unresolved.push(c.id + ': missing'); continue; }
    need(r.dimension === c.dimension && r.weight === c.weight, 'Result changed pinned dimension/weight: ' + c.id);
    if (!c.applicable) { if (r.status !== 'skip') unresolved.push(c.id + ': non-applicable check must report skip'); continue; }
    if (r.status === 'skip') { unresolved.push(c.id + ': applicable check cannot skip'); continue; }
    let proven = false;
    if (r.status === 'pass') {
      try {
        const ref = /(?:^|\s)evidence:([^#\s,;]+)/.exec(r.detail)?.[1];
        const receipt = local(fs.realpathSync(path.dirname(resultPath)), ref);
        require('./verification.cjs').validate(project, planFile, c.spec, c.id, receipt);
        proven = true;
      } catch { /* missing or escaping evidence is unresolved, never a pass */ }
      if (!proven) unresolved.push(c.id + ': evidence unavailable');
    }
    if (required && r.status === 'pass' && proven) passed++;
    else if (required) unresolved.push(c.id + ': ' + r.status);
  }
  return { verdict: unresolved.length ? 'BLOCKED' : 'COMPLETE', passed, total, unresolved, plan_sha256: p.sha256 };
}
module.exports = { sha, need, text, object, digest, local, argument, rows, snapshot, loadPlan, hosting, complete };
if (require.main === module) {
  try {
    const [action, ...a] = process.argv.slice(2);
    if (action === 'validate') { rows(fs.readFileSync(a[0], 'utf8')); }
    else if (action === 'snapshot') {
      let prior;
      const at = a.indexOf('--previous');
      if (at >= 0) { need(at === a.length - 3, '--previous requires path and approved sha256'); prior = { path: a[at + 1], sha256: a[at + 2] }; a.splice(at); }
      need(a.length >= 4, 'snapshot <project> <checks.json> <output.json> <input...>');
      snapshot(a[0], a[1], a[2], a.slice(3), prior); console.log('SNAPSHOT: PINNED');
    } else if (action === 'hosting') {
      need(a.length >= 2 && a.length <= 3, 'hosting <project> <plan.json> [plan-sha256]');
      console.log(JSON.stringify(hosting(...a)));
    } else if (action === 'complete') {
      need(a.length >= 3 && a.length <= 4, 'complete <project> <plan.json> <results.tsv> [plan-sha256]');
      const result = complete(...a); console.log('COMPLETION: ' + result.verdict); console.error(JSON.stringify(result));
      if (result.verdict !== 'COMPLETE') process.exitCode = 1;
    } else throw Error('Unknown acceptance action');
  } catch (e) { console.error('Invalid acceptance: ' + e.message); process.exitCode = 2; }
}
