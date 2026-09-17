#!/usr/bin/env bash
# Native Codex package: discovery, shared contracts, generation and standalone gates.
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
const json = file => JSON.parse(read(file));
const marketplace = json('.agents/plugins/marketplace.json');
const entry = marketplace.plugins.find(p => p.name === 'forge');
assert.ok(entry, 'Forge must be discoverable in the repo marketplace');
assert.equal(entry.source.source, 'local');
assert.equal(entry.source.path, './plugins/forge');
assert.equal(entry.policy.installation, 'AVAILABLE');
assert.equal(entry.policy.authentication, 'ON_INSTALL');
const plugin = path.resolve(entry.source.path);
const manifest = json(path.join(plugin, '.codex-plugin/plugin.json'));
assert.equal(manifest.name, path.basename(plugin));
assert.equal(manifest.repository, 'https://github.com/Jss-on/autoforge');
const skill = path.resolve(plugin, manifest.skills, 'forge');
const router = read(path.join(skill, 'SKILL.md'));
assert.match(router, /^name: forge$/m);
assert.match(router, /^metadata:\n  version: \d+\.\d+\.\d+$/m);
assert.doesNotMatch(router, /^version:/m, 'Codex version belongs in supported metadata');
assert.match(router, /read `<subcommand>\.md` beside this file/);
assert.match(router, /read `forge\.md`/);
assert.match(router, /absolute directory containing this loaded `SKILL\.md`/);
assert.match(read(path.join(skill, 'agents/openai.yaml')), /default_prompt: "\$forge /);
console.log('PASS: native marketplace, manifest and command router');

for (const [source, destination] of [
  ['.claude/commands/forge', ''], ['.claude/skills/forge/references', 'references'], ['scripts', 'scripts'],
]) {
  const files = fs.readdirSync(path.join(skill, destination)).filter(f => f !== 'SKILL.md' && f !== 'forge.md' && /\.(md|sh|cjs)$/.test(f));
  if (destination !== 'scripts') assert.deepEqual(files.sort(), fs.readdirSync(source).filter(f => f.endsWith('.md')).sort());
  if (!destination) assert.equal(files.length, 20, 'all 20 subcommands must ship');
  assert.ok(files.length);
  for (const file of files) {
    const bundled = read(path.join(skill, destination, file));
    assert.equal(bundled, read(path.join(source, file)), `canonical parity: ${destination}/${file}`);
    assert.equal(bundled, read(path.join('.agents/skills/forge', destination, file)), `Codex parity: ${destination}/${file}`);
    if (!destination) assert.ok(router.includes('$forge ' + file.slice(0, -3)), `router missing ${file}`);
  }
}
assert.equal(read(path.join(skill, 'forge.md')), read('.claude/commands/forge.md'));
console.log('PASS: complete shared command, reference and runtime contracts');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-codex-'));
const run = (file, args, cwd, status = 0) => {
  const r = spawnSync(process.env.FORGE_TEST_BASH, [file, ...args], {
    cwd, encoding: 'utf8', timeout: 60000, env: { ...process.env, AR_SCORE_LOG: '0' },
  });
  assert.ifError(r.error);
  assert.equal(r.status, status, r.stderr || r.stdout);
  return r.stdout.trim();
};
try {
  const generated = path.join(scratch, 'generated');
  for (const source of ['.claude/skills/forge', '.claude/commands', 'scripts']) {
    fs.cpSync(source, path.join(generated, source), { recursive: true });
  }
  fs.mkdirSync(path.join(generated, 'plugins/forge/.codex-plugin'), { recursive: true });
  fs.copyFileSync(path.join(plugin, '.codex-plugin/plugin.json'), path.join(generated, 'plugins/forge/.codex-plugin/plugin.json'));
  const sample = '\n/forge:security --diff\n/forge\n' +
    '.claude/skills/forge/scripts/\n${CLAUDE_PLUGIN_ROOT}/skills/forge/scripts/\n' +
    '/forge/assets/icon.svg\nhttps://github.com/example/forge\n';
  fs.appendFileSync(path.join(generated, '.claude/skills/forge/SKILL.md'), sample);
  run(path.join(generated, 'scripts/transform.sh'), ['--codex'], generated);
  const output = read(path.join(generated, 'plugins/forge/skills/forge/SKILL.md'));
  assert.equal(output, router + sample.replace('/forge:security', '$forge security').replace('\n/forge\n', '\n$forge\n'));
  for (const file of ['SKILL.md', 'agents/openai.yaml', 'plan.md', 'references/handoff-schema.md']) {
    assert.equal(read(path.join(generated, '.agents/skills/forge', file)), read(path.join(generated, 'plugins/forge/skills/forge', file)));
  }
  console.log('PASS: regeneration changes command tokens and preserves paths and URLs');

  // Copy only the plugin, as Codex does. No checkout-relative scripts may be needed.
  const installed = path.join(scratch, 'installed plugin');
  const project = path.join(scratch, 'other project');
  fs.cpSync(plugin, installed, { recursive: true });
  fs.mkdirSync(project);
  const scripts = path.join(installed, manifest.skills, 'forge/scripts');
  assert.equal(run(path.join(scripts, 'orchestrate.sh'), ['classify', 'fix the login bug'], project), 'fix-broken');
  fs.copyFileSync('tests/fixtures/requirements/valid.spec.yaml', path.join(project, 'spec.yaml'));
  assert.match(run(path.join(scripts, 'score-requirements.sh'), ['validate', 'spec.yaml'], project), /VALIDATION: VALID/);
  fs.writeFileSync(path.join(project, 'spec.yaml'), 'name: incomplete\n');
  assert.match(run(path.join(scripts, 'score-requirements.sh'), ['validate', 'spec.yaml'], project, 1), /VALIDATION: INVALID/);
  console.log('PASS: installed bundle routes and accepts/rejects specs from another project');

  const updater = read('scripts/release.sh').match(/node - "\$VERSION" <<'JS'\n([\s\S]*?)\nJS/);
  assert.ok(updater, 'release version updater must exist');
  const updated = spawnSync(process.execPath, ['-', '3.6.1'], { input: updater[1], cwd: generated, encoding: 'utf8' });
  assert.ifError(updated.error);
  assert.equal(updated.status, 0, updated.stderr);
  assert.match(read(path.join(generated, '.agents/skills/forge/SKILL.md')), /^metadata:\n  version: 3\.6\.1$/m);
  assert.match(read(path.join(generated, '.claude/skills/forge/SKILL.md')), /^version: 3\.6\.1$/m);
  assert.equal(json(path.join(generated, 'plugins/forge/.codex-plugin/plugin.json')).version, '3.6.1-codex.0');
  console.log('PASS: release updater preserves Codex metadata and product version alignment');
} finally {
  // This is the exact directory allocated above; never clean a computed repo path.
  assert.equal(path.dirname(scratch), os.tmpdir());
  fs.rmSync(scratch, { recursive: true, force: true });
}
console.log('5 passed, 0 failed (Codex plugin)');
NODE
