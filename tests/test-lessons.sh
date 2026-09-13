#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

node <<'NODE'
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cli = path.resolve('scripts/lessons.cjs');
const preserve = Boolean(process.env.FORGE_LESSON_SAMPLE);
const root = preserve ? path.resolve(process.env.FORGE_LESSON_SAMPLE)
  : fs.mkdtempSync(path.join(os.tmpdir(), 'forge-lessons-test-'));
if (preserve && fs.existsSync(root)) assert.deepEqual(fs.readdirSync(root), [], 'sample directory must be empty');
fs.mkdirSync(root, { recursive: true });
let passed = 0, failed = 0;
const broken = 'module.exports = (a, b) => a + b;\n';
const procedure = `const fs = require('node:fs');
const file = 'calculator.cjs';
const before = fs.readFileSync(file, 'utf8');
if (!before.includes('=> a + b')) throw new Error('unexpected calculator version');
fs.writeFileSync(file, before.replace('=> a + b', '=> Number(a) + Number(b)'));
console.log('numeric-string repair applied');\n`;
const verifier = `const assert = require('node:assert/strict');
const add = require('./calculator.cjs');
const mode = process.argv[2];
if (mode === 'training' || mode === 'same-tests-different-command') assert.equal(add('2', '3'), 5);
else if (mode === 'holdout') { assert.equal(add('-4', '1.5'), -2.5); assert.equal(add('0', '12'), 12); }
else if (mode === 'guard') { assert.equal(add(2, 3), 5); assert.equal(add(-2, 2), 0); }
else throw new Error('unknown verification mode');
console.log('verified ' + mode);\n`;
const write = (file, text) => fs.writeFileSync(file, text);
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function invoke(args, valid = true) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 70000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  if (!valid) { assert.notEqual(result.status, 0, `unexpected acceptance: ${args.join(' ')}`); return result; }
  if (args[0] === 'check') {
    assert.ok(result.stdout.trim(), result.stderr);
    const receipt = JSON.parse(result.stdout);
    const expected = args[3] === 'baseline' ? receipt.exitCode !== 0 : receipt.exitCode === 0;
    assert.equal(result.status, expected ? 0 : 1, 'check exit must reflect the phase outcome');
    return receipt;
  }
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
function fixture(name, overrides = {}) {
  const project = path.join(root, name), run = path.join(project, 'forge', 'run-1');
  fs.mkdirSync(run, { recursive: true });
  write(path.join(project, 'package.json'), '{"name":"calculator","version":"1.0.0"}\n');
  write(path.join(project, 'calculator.cjs'), broken);
  write(path.join(project, 'verify.cjs'), verifier);
  write(path.join(run, 'procedure.cjs'), procedure);
  const candidate = path.join(run, 'candidate.json');
  const record = { version: 1, id: 'numeric-string-addition', summary: 'Normalize numeric inputs before addition.',
    workflow: 'calculator/repair', procedure: 'procedure.cjs', context: ['package.json'], verifiers: ['verify.cjs'], targets: ['calculator.cjs'], ...overrides };
  write(candidate, JSON.stringify(record, null, 2) + '\n');
  return { project, run, candidate, record };
}
function check(f, role, mode, valid = true) {
  return invoke(['check', f.project, f.candidate, role, '--', process.execPath, 'verify.cjs', mode], valid);
}
function execute(f, text = fs.readFileSync(path.join(f.run, 'procedure.cjs'), 'utf8')) {
  const result = spawnSync(process.execPath, ['-e', text], { cwd: f.project, encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /repair applied/);
}
function evidence(f, recovery = 'training', holdout = 'holdout') {
  const baseline = check(f, 'baseline', 'training');
  assert.notEqual(baseline.exitCode, 0);
  assert.equal(typeof baseline.stderr, 'string');
  assert.equal(typeof baseline.elapsedMs, 'number');
  execute(f);
  assert.equal(check(f, 'recovery', recovery).exitCode, 0);
  assert.equal(check(f, 'holdout', holdout).exitCode, 0);
  return check(f, 'guard', 'guard');
}
const promote = (f, valid = true) => invoke(['promote', f.project, f.candidate], valid);
const select = (f, workflow = f.record.workflow) => invoke(['select', f.project, workflow]);
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS: ${name}`); }
  catch (error) { failed++; console.error(`FAIL: ${name}\n${error.stack}`); }
}
try {
  test('verified repair is promoted, retrieved and successfully reused', () => {
    const f = fixture('calculator-demo');
    assert.equal(evidence(f).exitCode, 0);
    const promoted = promote(f);
    assert.equal(promoted.id, f.record.id);
    assert.equal(typeof promoted.hash, 'string');
    const selected = select(f);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].id, promoted.id);
    assert.equal(selected[0].hash, promoted.hash);
    assert.equal(selected[0].procedure, procedure);
    assert.equal(path.resolve(f.project, selected[0].candidate), f.candidate);
    write(path.join(f.project, 'calculator.cjs'), broken);
    execute(f, selected[0].procedure);
    assert.equal(check(f, 'reuse', 'training').exitCode, 0);
    assert.equal(select(f).length, 1);
    assert.deepEqual(select(f, 'other-workflow'), []);
    const other = fixture('other-project');
    fs.cpSync(path.join(f.project, 'forge'), path.join(other.project, 'forge'), { recursive: true });
    assert.deepEqual(select(other), []);
    const ledger = json(path.join(f.project, 'forge', 'lessons.json'));
    assert.equal(ledger.version, 1);
    assert.equal(ledger.lessons.length, 1);
    for (const role of ['baseline', 'recovery', 'holdout', 'guard']) {
      assert.equal(typeof json(`${f.candidate}.${role}.json`).exitCode, 'number');
    }
  });
  test('a plausible lesson without execution evidence cannot be promoted', () => promote(fixture('unsupported'), false));
  test('a failed regression guard blocks promotion', () => {
    const f = fixture('bad-guard');
    write(path.join(f.project, 'verify.cjs'), verifier.replace('add(2, 3), 5', 'add(2, 3), 99'));
    assert.notEqual(evidence(f).exitCode, 0);
    promote(f, false);
  });
  test('baseline and recovery must use the same command', () => {
    const f = fixture('command-mismatch'); evidence(f, 'same-tests-different-command'); promote(f, false);
  });
  test('holdout cannot reuse the recovery command', () => {
    const f = fixture('same-holdout'); evidence(f, 'training', 'training'); promote(f, false);
  });
  test('reverting the repaired target after checks blocks promotion', () => {
    const f = fixture('reverted-target'); evidence(f);
    write(path.join(f.project, 'calculator.cjs'), broken);
    promote(f, false);
  });
  test('a passing guard from before the repair cannot certify the repaired target', () => {
    const f = fixture('old-guard'); assert.equal(check(f, 'guard', 'guard').exitCode, 0);
    assert.notEqual(check(f, 'baseline', 'training').exitCode, 0);
    execute(f);
    assert.equal(check(f, 'recovery', 'training').exitCode, 0);
    assert.equal(check(f, 'holdout', 'holdout').exitCode, 0);
    promote(f, false);
  });
  for (const [name, file] of [['lesson', 'procedure.cjs'], ['verifier', 'verify.cjs'], ['context-pin', 'package.json']]) {
    test(`changed ${name} invalidates evidence and excludes an existing lesson`, () => {
      const f = fixture(`stale-${name}`); evidence(f); promote(f);
      fs.appendFileSync(path.join(file === 'procedure.cjs' ? f.run : f.project, file), '\n');
      assert.deepEqual(select(f), []);
      promote(f, false);
    });
  }
  test('failed reuse retires the lesson while preserving its ledger record', () => {
    const f = fixture('failed-reuse'); evidence(f); promote(f);
    write(path.join(f.project, 'calculator.cjs'), broken);
    assert.notEqual(check(f, 'reuse', 'training').exitCode, 0);
    assert.deepEqual(select(f), []);
    assert.equal(json(path.join(f.project, 'forge', 'lessons.json')).lessons.length, 1);
  });
  test('manual retirement excludes the lesson', () => {
    const f = fixture('manual-retire'); evidence(f); promote(f);
    invoke(['retire', f.project, f.record.id, 'workflow replaced']);
    assert.deepEqual(select(f), []);
  });
  test('new versions retain history and retirement cannot revive an older version', () => {
    const f = fixture('versions'); evidence(f); const first = promote(f);
    f.run = path.join(f.project, 'forge', 'run-2');
    fs.mkdirSync(f.run);
    f.candidate = path.join(f.run, 'candidate.json');
    write(f.candidate, JSON.stringify(f.record));
    write(path.join(f.run, 'procedure.cjs'), procedure + '// Revision 2.\n');
    write(path.join(f.project, 'calculator.cjs'), broken);
    evidence(f); const second = promote(f);
    assert.notEqual(second.hash, first.hash);
    assert.deepEqual(select(f).map(e => e.hash), [second.hash]);
    assert.equal(json(path.join(f.project, 'forge', 'lessons.json')).lessons.length, 2);
    invoke(['retire', f.project, f.record.id, 'newest version withdrawn']);
    assert.deepEqual(select(f), []);
  });
  test('malformed candidates and missing bindings are rejected', () => {
    for (const [name, overrides] of [['bad-version', { version: 2 }], ['no-context', { context: [] }], ['no-verifiers', { verifiers: [] }]]) {
      const f = fixture(name, overrides); check(f, 'baseline', 'training', false);
    }
    const f = fixture('invalid-json'); write(f.candidate, '{broken'); promote(f, false);
  });
  test('path traversal and candidates from another project are rejected', () => {
    const f = fixture('traversal', { procedure: '../outside.cjs' });
    write(path.join(f.run, '..', 'outside.cjs'), procedure);
    check(f, 'baseline', 'training', false);
    const p = fixture('outside-pin', { context: ['../shared.json'] });
    write(path.join(root, 'shared.json'), '{}'); check(p, 'baseline', 'training', false);
    const other = fixture('foreign-candidate');
    invoke(['check', other.project, p.candidate, 'baseline', '--', process.execPath, 'verify.cjs', 'training'], false);
  });
  test('spawn failures and malformed role names are rejected', () => {
    const f = fixture('bad-execution');
    invoke(['check', f.project, f.candidate, 'baseline', '--', path.join(f.project, 'missing-executable')], false);
    check(f, 'unsupported-role', 'training', false);
  });
} finally {
  if (preserve) console.log(`Sample artifacts: ${root}`);
  else fs.rmSync(root, { recursive: true, force: true });
}
console.log(`${passed} passed; ${failed} failed`);
process.exitCode = failed ? 1 : 0;
NODE
