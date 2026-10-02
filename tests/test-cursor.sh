#!/usr/bin/env bash
# Cursor skill: shared contracts, regeneration, isolated installs and standalone gates.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export FORGE_TEST_BASH="$BASH"
node <<'NODE'
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const skill = '.cursor/skills/forge';
const router = read(path.join(skill, 'SKILL.md'));
assert.match(router, /^name: forge$/m);
assert.match(router, /^metadata:\n  version: \d+\.\d+\.\d+$/m);
assert.doesNotMatch(router, /^version:/m);
assert.match(router, /^## Cursor command loading$/m);
assert.match(router, /read `<subcommand>\.md` beside this file/);
assert.match(router, /read `forge\.md`/);
assert.match(router, /absolute directory containing this loaded `SKILL\.md`/);
assert.match(router, /AskUserQuestion/);
assert.match(router, /available/);
for (const [source, destination] of [
  ['.claude/commands/forge', ''],
  ['.claude/skills/forge/references', 'references'],
  ['.claude/skills/forge/scripts', 'scripts'],
]) {
  const files = fs.readdirSync(path.join(skill, destination), { withFileTypes: true })
    .filter(f => f.isFile() && f.name !== 'SKILL.md' && f.name !== 'forge.md').map(f => f.name).sort();
  assert.deepEqual(files, fs.readdirSync(source).sort(), `complete ${destination || 'command'} coverage`);
  if (!destination) assert.equal(files.length, 21, 'all 21 subcommands must ship');
  for (const file of files) {
    const bundled = read(path.join(skill, destination, file));
    assert.equal(bundled, read(path.join(source, file)), `canonical parity: ${destination}/${file}`);
    if (destination === 'scripts') assert.equal(bundled, read(path.join('scripts', file)), `runtime parity: ${file}`);
    if (!destination) assert.ok(router.includes('/forge ' + file.slice(0, -3)), `router missing ${file}`);
  }
}
assert.equal(read(path.join(skill, 'forge.md')), read('.claude/commands/forge.md'));
console.log('PASS: Cursor router and all shared commands, references and runtime scripts');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-cursor-'));
const shellPath = file => file.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase());
const run = (file, args, cwd, status = 0) => {
  const result = spawnSync(process.env.FORGE_TEST_BASH, [shellPath(file), ...args], {
    cwd, encoding: 'utf8', timeout: 60000, env: { ...process.env, AR_SCORE_LOG: '0' },
  });
  assert.ifError(result.error);
  assert.equal(result.status, status, result.stderr || result.stdout);
  return result.stdout.trim();
};
try {
  const generated = path.join(scratch, 'generated package');
  for (const source of ['.claude/skills/forge', '.claude/commands', '.github/workflows', 'scripts']) {
    fs.cpSync(source, path.join(generated, source), { recursive: true });
  }
  const sample = '\n/forge:security --diff\n/forge\n' +
    '.claude/skills/forge/scripts/\n${CLAUDE_PLUGIN_ROOT}/skills/forge/scripts/\n' +
    '/forge/assets/icon.svg\nhttps://github.com/example/forge\n';
  fs.appendFileSync(path.join(generated, '.claude/skills/forge/SKILL.md'), sample);
  run(path.join(generated, 'scripts/transform.sh'), ['--cursor'], generated);
  const generatedSkill = path.join(generated, skill);
  assert.equal(read(path.join(generatedSkill, 'SKILL.md')), router + sample.replace('/forge:security', '/forge security'));
  for (const file of ['forge.md', 'plan.md', 'references/handoff-schema.md', 'scripts/orchestrate.sh']) {
    assert.equal(read(path.join(generatedSkill, file)), read(path.join(skill, file)));
  }
  const installer = path.join(generated, 'scripts/install.sh');
  run(installer, ['--cursor', '--local', '--force'], generated);
  assert.equal(read(path.join(generatedSkill, 'SKILL.md')), router + sample.replace('/forge:security', '/forge security'));
  assert.equal(read(path.join(generatedSkill, 'scripts/orchestrate.sh')), read('scripts/orchestrate.sh'));
  console.log('PASS: regeneration adapts commands and preserves paths and URLs');

  const project = path.join(scratch, 'unrelated project');
  const target = path.join(project, '.cursor');
  const installed = path.join(target, 'skills/forge');
  fs.mkdirSync(path.join(target, 'skills/other'), { recursive: true });
  fs.writeFileSync(path.join(target, 'skills/other/SKILL.md'), 'unrelated skill\n');
  fs.writeFileSync(path.join(target, 'settings.json'), '{"unrelated":true}\n');
  run(installer, ['--cursor', '--local'], project);
  assert.equal(read(path.join(installed, 'SKILL.md')), read(path.join(generatedSkill, 'SKILL.md')));
  fs.writeFileSync(path.join(installed, 'obsolete.md'), 'stale bundle file\n');
  run(installer, ['--cursor', '--local', '--force'], project);
  assert.equal(fs.existsSync(path.join(installed, 'obsolete.md')), false);
  assert.equal(read(path.join(target, 'skills/other/SKILL.md')), 'unrelated skill\n');
  assert.equal(read(path.join(target, 'settings.json')), '{"unrelated":true}\n');
  console.log('PASS: local install and replacement preserve unrelated Cursor files');

  const globalConfig = path.join(scratch, 'global config');
  run(installer, ['--cursor', '--global', '--config-dir', shellPath(globalConfig)], project);
  assert.equal(read(path.join(globalConfig, 'skills/forge/SKILL.md')), read(path.join(generatedSkill, 'SKILL.md')));
  assert.match(run(installer, ['--help'], project), /--cursor/);
  console.log('PASS: global config override installs the Cursor bundle');

  const scripts = path.join(installed, 'scripts');
  assert.equal(run(path.join(scripts, 'orchestrate.sh'), ['classify', 'fix the login bug'], project), 'fix-broken');
  fs.copyFileSync('tests/fixtures/requirements/valid.spec.yaml', path.join(project, 'spec.yaml'));
  assert.match(run(path.join(scripts, 'score-requirements.sh'), ['validate', 'spec.yaml'], project), /VALIDATION: VALID/);
  fs.writeFileSync(path.join(project, 'spec.yaml'), 'name: incomplete\n');
  assert.match(run(path.join(scripts, 'score-requirements.sh'), ['validate', 'spec.yaml'], project, 1), /VALIDATION: INVALID/);
  console.log('PASS: installed bundle classifies and accepts/rejects specs from another project');

  const updater = read('scripts/release.sh').match(/node - "\$VERSION" <<'JS'\n([\s\S]*?)\nJS/);
  assert.ok(updater, 'release version updater must exist');
  const updated = spawnSync(process.execPath, ['-', '3.6.1'], { input: updater[1], cwd: generated, encoding: 'utf8' });
  assert.ifError(updated.error);
  assert.equal(updated.status, 0, updated.stderr);
  assert.match(read(path.join(generatedSkill, 'SKILL.md')), /^metadata:\n  version: 3\.6\.1$/m);
  console.log('PASS: release updater keeps Cursor metadata aligned');
} finally {
  // Delete only the exact temporary directory allocated above, outside the repository.
  assert.equal(path.dirname(scratch), os.tmpdir());
  assert.ok(path.basename(scratch).startsWith('forge-cursor-'));
  fs.rmSync(scratch, { recursive: true, force: true });
}
console.log('6 passed, 0 failed (Cursor skill)');
NODE
