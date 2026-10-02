#!/usr/bin/env bash
# Run with the host's Bash and utilities, including macOS /bin/bash 3.2 + BSD tools.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export FORGE_TEST_BASH="$BASH"
node <<'NODE'
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const repo = process.cwd();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-portability-'));
const shellPath = file => file.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase());
const work = path.join(scratch, 'project with spaces');
const env = { ...process.env, AR_SCORE_LOG: '1', BASH_ENV: shellPath(path.join(scratch, 'without-sha.sh')) };
const run = (script, args, status = 0, extraEnv = {}) => {
  const r = spawnSync(process.env.FORGE_TEST_BASH, [shellPath(path.join(repo, 'scripts', script + '.sh')), ...args], {
    cwd: work, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 60000,
  });
  assert.ifError(r.error);
  assert.equal(r.status, status, r.stderr || r.stdout);
  return r;
};
try {
  fs.mkdirSync(work);
  // Simulate a machine with no external SHA executable; all other tools are real.
  fs.writeFileSync(path.join(scratch, 'without-sha.sh'), `
command() {
  if [[ "\${1:-}" == -v ]]; then
    case "\${2:-}" in
      sha256sum|shasum) return 1 ;;
      node) [[ "\${FORGE_TEST_HIDE_NODE:-0}" == 1 ]] && return 1 ;;
    esac
  fi
  builtin command "$@"
}
sha256sum() { return 127; }
shasum() { return 127; }
`);
  fs.copyFileSync('tests/fixtures/build/all-pass.tsv', path.join(work, 'build.tsv'));
  fs.copyFileSync('tests/fixtures/android/good/android-results.tsv', path.join(work, 'android.tsv'));
  fs.writeFileSync(path.join(work, 'defects.tsv'), 'D-1\tlow\tP3\tclosed\tT-1\tResolved\tevidence:note.txt\n');
  fs.writeFileSync(path.join(work, 'scan.json'), JSON.stringify({ pages: [{ findings: [] }] }));
  fs.writeFileSync(path.join(work, 'sources.tsv'), 'S-1\tT2\tofficial\t2025\tReference\tVendor\turl:https://example.com\tfull\tread\n');
  for (const [script, sub, file] of [
    ['score-build', 'pass-rate', 'build.tsv'],
    ['score-test', 'defects', 'defects.tsv'],
    ['score-design', 'scan', 'scan.json'],
    ['score-research', 'sources', 'sources.tsv'],
    ['score-android', 'verdict', 'android.tsv'],
  ]) {
    run(script, [sub, file]);
    const log = fs.readFileSync(path.join(work, 'score-log.tsv'), 'utf8').trim().split('\n').pop().split('\t');
    assert.equal(log[1], sub);
    assert.equal(log[2], file);
    assert.equal(log[3], crypto.createHash('sha256').update(fs.readFileSync(path.join(work, file))).digest('hex').slice(0, 16));
  }
  console.log('PASS: every score logger retains content hashes without SHA executables');

  fs.cpSync('tests/fixtures/requirements/stack-ready', path.join(work, 'stack'), { recursive: true });
  assert.match(run('score-requirements', ['stack', 'stack']).stdout, /STACK_DECISION: READY/);
  fs.appendFileSync(path.join(work, 'stack/stack-decision.md'), '\nChanged after approval.\n');
  assert.match(run('score-requirements', ['stack', 'stack'], 1).stderr, /approval-stale/);
  console.log('PASS: stack approval hashing accepts pinned evidence and rejects later changes');

  for (const [goal, expected] of [
    ['APK', 'package-android'], ['an .aab', 'package-android'], ['TWA', 'package-android'],
    ['UI', 'polish-ui'], ['the UX.', 'polish-ui'], ['my_apk_file', 'explore'],
    ['outward', 'explore'], ['luxury', 'explore'], ['guido', 'explore'],
  ]) assert.equal(run('orchestrate', ['classify', goal]).stdout.trim(), expected);
  fs.writeFileSync(path.join(work, 'claims.tsv'), 'C-1\tRQ-1\tDocumented behavior\tmoderate\tS-1\tevidence:note.txt\n');
  fs.writeFileSync(path.join(work, 'plan.md'), 'RQ-1\nRQ-2\nScarcity: RQ-2.\n');
  assert.match(run('score-research', ['verdict', 'claims.tsv', 'sources.tsv', 'plan.md']).stdout, /DOSSIER_READY/);
  fs.writeFileSync(path.join(work, 'plan.md'), 'RQ-1\nRQ-2\nScarcity: RQ-20.\n');
  assert.match(run('score-research', ['verdict', 'claims.tsv', 'sources.tsv', 'plan.md'], 1).stderr, /RQ-2: no claims and no scarcity note/);
  console.log('PASS: routing and research coverage preserve whole-word boundaries');

  fs.writeFileSync(path.join(work, 'evidence.txt'), 'Observed passing assertion\n');
  fs.writeFileSync(path.join(work, 'strict.tsv'), '\n\t\napp\tfunctional\tcase-1\t1\tpass\tevidence:evidence.txt\n\n');
  assert.equal(run('score-build', ['pass-rate', '--strict-evidence', 'strict.tsv']).stdout.trim(), 'PASS_RATE: 1.00');
  fs.unlinkSync(path.join(work, 'evidence.txt'));
  assert.equal(run('score-build', ['pass-rate', '--strict-evidence', 'strict.tsv']).stdout.trim(), 'PASS_RATE: 0.00');
  console.log('PASS: strict evidence handles blank rows and rejects missing evidence');

  assert.match(run('doctor', []).stdout, /RESULT: OK/);
  assert.match(run('doctor', [], 1, { FORGE_TEST_HIDE_NODE: '1' }).stdout, /node\s+MISSING/);
  assert.match(run('doctor', ['--unknown'], 64).stderr, /unknown flag/);
  console.log('PASS: preflight needs no SHA executable and still detects missing Node');
} finally {
  assert.equal(path.dirname(scratch), os.tmpdir());
  assert.ok(path.basename(scratch).startsWith('forge-portability-'));
  fs.rmSync(scratch, { recursive: true, force: true });
}
console.log('5 passed, 0 failed (runtime portability)');
NODE
