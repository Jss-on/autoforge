#!/usr/bin/env node
'use strict';
// Project-local procedural lessons. Commands execute only when supplied explicitly to check.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
const relative = value => text(value) && !/[\\:]/.test(value) && !path.posix.isAbsolute(value) && !value.split('/').some(p => ['', '.', '..'].includes(p));
const inside = (root, file) => { const rel = path.relative(root, file); return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep)); };
const need = (condition, message) => { if (!condition) throw new Error(message); };
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const encode = value => JSON.stringify(value, null, 2) + '\n';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const roles = ['baseline', 'recovery', 'holdout', 'guard', 'reuse'];

function local(root, rel) {
  need(relative(rel), 'Expected a project-relative path: ' + rel);
  const file = fs.realpathSync(path.join(root, rel));
  need(inside(root, file) && fs.statSync(file).isFile(), 'File escapes project or is not regular: ' + rel);
  need(fs.statSync(file).size > 0, 'Empty evidence/input: ' + rel);
  return file;
}

function candidate(root, file) {
  file = fs.realpathSync(path.resolve(file));
  need(inside(root, file), 'Candidate must be inside the project');
  const data = json(file);
  need(object(data) && data.version === 1 && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(data.id || '') && text(data.summary) && text(data.workflow), 'Invalid candidate identity, summary or workflow');
  for (const key of ['context', 'verifiers', 'targets']) need(Array.isArray(data[key]) && data[key].length > 0 && data[key].every(relative), 'Nonempty relative ' + key + ' files required');
  const procedureFile = local(path.dirname(file), data.procedure);
  const rel = path.relative(root, file).split(path.sep).join('/');
  const inputs = {};
  for (const input of [...new Set([...data.context, ...data.verifiers])].sort()) inputs[input] = digest(fs.readFileSync(local(root, input)));
  const procedure = fs.readFileSync(procedureFile, 'utf8');
  need(procedure.trim(), 'Procedure must not be empty');
  const hash = digest(fs.readFileSync(file) + '\n' + procedure);
  const targets = Object.fromEntries([...new Set(data.targets)].sort().map(input => [input, digest(fs.readFileSync(local(root, input)))]));
  return { file, rel, data, procedure, hash, inputs, targets };
}

function receiptFile(c, role) { return c.file + '.' + role + '.json'; }
function receipt(root, c, role) {
  const file = receiptFile(c, role);
  const rel = path.relative(root, file).split(path.sep).join('/');
  const r = json(local(root, rel));
  need(object(r) && r.version === 1 && r.role === role && r.project === root && r.candidate === c.rel && r.hash === c.hash && same(r.inputs, c.inputs), 'Stale or mismatched ' + role + ' receipt');
  need(Number.isInteger(r.exitCode) && r.exitCode >= 0 && r.exitCode <= 255 && Array.isArray(r.argv) && r.argv.length && r.argv.every(text) && object(r.targets) && same(Object.keys(r.targets), Object.keys(c.targets)) && Object.values(r.targets).every(v => /^[a-f0-9]{64}$/.test(v)) && typeof r.stdout === 'string' && typeof r.stderr === 'string' && Number.isFinite(r.elapsedMs) && r.elapsedMs >= 0 && Number.isFinite(Date.parse(r.timestamp)), 'Invalid ' + role + ' execution receipt');
  return { data: r, path: rel, sha256: digest(fs.readFileSync(file)) };
}

function ledgerPath(root) {
  const dir = path.join(root, 'forge');
  if (fs.existsSync(dir)) need(fs.statSync(dir).isDirectory() && inside(root, fs.realpathSync(dir)), 'forge directory escapes project');
  return path.join(dir, 'lessons.json');
}
function ledger(root) {
  const file = ledgerPath(root);
  if (!fs.existsSync(file)) return { version: 1, lessons: [] };
  need(!fs.lstatSync(file).isSymbolicLink(), 'Lesson ledger must not be a symbolic link');
  const data = json(file);
  need(object(data) && data.version === 1 && Array.isArray(data.lessons) && data.lessons.every(e => object(e) && text(e.id) && text(e.hash) && text(e.project) && text(e.workflow) && relative(e.candidate) && Array.isArray(e.outcomes)), 'Invalid lesson ledger');
  return data;
}
function update(root, change) {
  const file = ledgerPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = file + '.lock';
  const fd = fs.openSync(lock, 'wx');
  const tmp = file + '.' + crypto.randomUUID() + '.tmp';
  try {
    const data = ledger(root);
    const result = change(data);
    fs.writeFileSync(tmp, encode(data), { flag: 'wx' });
    fs.renameSync(tmp, file);
    return result;
  } finally {
    fs.closeSync(fd);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    fs.unlinkSync(lock);
  }
}
function latest(data, id) { return data.lessons.findLast(e => e.id === id); }

function validEntry(root, entry) {
  if (entry.project !== root || entry.retired) return false;
  try {
    const c = candidate(root, local(root, entry.candidate));
    if (c.hash !== entry.hash || !same(c.inputs, entry.inputs) || c.procedure !== entry.procedure) return false;
    return ['baseline', 'recovery', 'holdout', 'guard'].every(role => {
      const ref = entry.evidence[role];
      return object(ref) && digest(fs.readFileSync(local(root, ref.path))) === ref.sha256;
    });
  } catch { return false; }
}

function check(root, file, role, argv) {
  need(roles.includes(role) && argv.length && argv.every(text), 'Check requires role and explicit executable/arguments after --');
  const c = candidate(root, file);
  let entry;
  if (role === 'reuse') {
    entry = latest(ledger(root), c.data.id);
    need(entry && entry.hash === c.hash && validEntry(root, entry), 'Reuse requires the current valid promoted version');
    need(same(argv, receipt(root, c, 'recovery').data.argv), 'Reuse must run the recorded recovery assertion');
  } else need(!fs.existsSync(receiptFile(c, role)), 'Receipt exists; use a fresh candidate run instead of rewriting evidence');
  const start = performance.now();
  const result = spawnSync(argv[0], argv.slice(1), { cwd: root, encoding: 'utf8', shell: false, timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
  need(!result.error && !result.signal && Number.isInteger(result.status), 'Check did not finish normally: ' + (result.error?.message || result.signal || 'unknown'));
  const after = candidate(root, file);
  need(after.hash === c.hash && same(after.inputs, c.inputs) && same(after.targets, c.targets), 'Check changed frozen lesson, context, verifier or tested implementation files');
  const r = { version: 1, role, project: root, candidate: c.rel, hash: c.hash, inputs: c.inputs, targets: c.targets, runner: { node: process.version, platform: process.platform, arch: process.arch }, argv, exitCode: result.status, stdout: result.stdout, stderr: result.stderr, elapsedMs: performance.now() - start, timestamp: new Date().toISOString() };
  const output = role === 'reuse' ? c.file + '.reuse-' + crypto.randomUUID() + '.json' : receiptFile(c, role);
  // Exclusive writes keep existing evidence and symlink targets untouched.
  fs.writeFileSync(output, encode(r), { flag: 'wx' });
  if (role === 'reuse') update(root, data => {
    const current = latest(data, c.data.id);
    need(current && current.hash === entry.hash && validEntry(root, current), 'Promoted version changed during reuse');
    current.outcomes.push({ status: r.exitCode === 0 ? 'passed' : 'failed', evidence: path.relative(root, output).split(path.sep).join('/'), sha256: digest(fs.readFileSync(output)), elapsedMs: r.elapsedMs, timestamp: r.timestamp });
    if (r.exitCode !== 0) current.retired = { reason: 'Reuse assertion failed', timestamp: r.timestamp };
  });
  return r;
}

function promote(root, file) {
  const c = candidate(root, file);
  const records = Object.fromEntries(['baseline', 'recovery', 'holdout', 'guard'].map(role => [role, receipt(root, c, role)]));
  need(records.baseline.data.exitCode !== 0, 'Baseline must demonstrate an observed failure');
  for (const role of ['recovery', 'holdout', 'guard']) {
    need(records[role].data.exitCode === 0, role + ' assertion failed');
    need(same(records[role].data.targets, c.targets), role + ' tested a different implementation');
  }
  need(same(records.baseline.data.argv, records.recovery.data.argv), 'Baseline and recovery must use the same assertion');
  need(!same(records.holdout.data.argv, records.recovery.data.argv), 'Holdout must use a separate case/check');
  need(Date.parse(records.baseline.data.timestamp) < Date.parse(records.recovery.data.timestamp), 'Failure must precede recovery');
  const evidence = Object.fromEntries(Object.entries(records).map(([role, r]) => [role, { path: r.path, sha256: r.sha256 }]));
  return update(root, data => {
    need(!data.lessons.some(e => e.id === c.data.id && e.hash === c.hash), 'This lesson version was already promoted; retain its outcomes');
    const entry = { id: c.data.id, hash: c.hash, project: root, workflow: c.data.workflow, summary: c.data.summary, procedure: c.procedure, candidate: c.rel, inputs: c.inputs, evidence, promotedAt: new Date().toISOString(), outcomes: [] };
    data.lessons.push(entry);
    return entry;
  });
}

function select(root, workflow) {
  need(text(workflow), 'Workflow is required');
  const data = ledger(root);
  // A retired/stale newest version must not silently reactivate an older lesson.
  return [...new Set(data.lessons.map(e => e.id))].map(id => latest(data, id)).filter(e => e.workflow === workflow && validEntry(root, e));
}

function main(args) {
  const [action, project, file, role, ...rest] = args;
  need(project, 'Usage: lessons.cjs check|promote|select|retire <project> ...');
  const root = fs.realpathSync(project);
  need(fs.statSync(root).isDirectory(), 'Project must be a directory');
  if (action === 'check') { need(rest[0] === '--', 'Explicit command must follow --'); return check(root, file, role, rest.slice(1)); }
  if (action === 'promote') { need(args.length === 3, 'promote requires project and candidate'); return promote(root, file); }
  if (action === 'select') { need(args.length === 3, 'select requires project and workflow'); return select(root, file); }
  if (action === 'retire') {
    need(args.length === 4 && text(role), 'retire requires project, id and reason');
    return update(root, data => { const entry = latest(data, file); need(entry && entry.project === root, 'Unknown lesson'); entry.retired = { reason: role, timestamp: new Date().toISOString() }; return entry; });
  }
  throw new Error('Unknown action: ' + action);
}
if (require.main === module) {
  try {
    const result = main(process.argv.slice(2));
    console.log(encode(result));
    if (process.argv[2] === 'check' && (result.role === 'baseline' ? result.exitCode === 0 : result.exitCode !== 0)) process.exitCode = 1;
  }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
