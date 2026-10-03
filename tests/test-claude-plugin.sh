#!/usr/bin/env bash
# Claude plugin and manual bundle: native registration and isolated investigation lifecycle.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
node <<'NODE'
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const plugin = path.resolve('claude-plugin'), manifest = JSON.parse(read(path.join(plugin, '.claude-plugin/plugin.json')));
assert.equal(manifest.name, 'forge');
// Explicit command roots avoid duplicate namespaces from the canonical commands/forge layout.
assert.deepEqual(manifest.commands, ['./commands/forge.md', './commands/forge/']);
assert.match(read(path.join(plugin, 'commands/forge/investigate.md')), /^name: forge:investigate$/m);
assert.match(read(path.join(plugin, 'commands/forge/investigate.md')), /\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/forge/);
assert.equal(read(path.join(plugin, 'skills/forge/SKILL.md')), read('.claude/skills/forge/SKILL.md'));
for (const [source, destination] of [
  ['.claude/commands/forge', 'commands/forge'],
  ['.claude/skills/forge/references', 'skills/forge/references'],
  ['.claude/skills/forge/scripts', 'skills/forge/scripts'],
]) {
  assert.deepEqual(fs.readdirSync(path.join(plugin, destination)).sort(), fs.readdirSync(source).sort());
  for (const file of fs.readdirSync(source)) assert.equal(read(path.join(plugin, destination, file)), read(path.join(source, file)), destination + '/' + file);
}
assert.equal(read(path.join(plugin, 'commands/forge.md')), read('.claude/commands/forge.md'));
console.log('PASS: Claude manifest names and canonical command/reference/runtime parity');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-claude-'));
try {
  const installed = path.join(scratch, 'installed plugin'), project = path.join(scratch, 'unrelated project');
  fs.cpSync(plugin, installed, { recursive: true }); fs.mkdirSync(project);
  require('./tests/investigate-installed.cjs')(path.join(installed, 'skills/forge/scripts'), project);
  console.log('PASS: isolated Claude plugin approval, capture, visual report and unavailable-export fallback');

  const manual = path.join(scratch, 'manual project'); fs.mkdirSync(manual);
  fs.cpSync('.claude/commands', path.join(manual, '.claude/commands'), { recursive: true });
  fs.cpSync('.claude/skills/forge', path.join(manual, '.claude/skills/forge'), { recursive: true });
  require('./tests/investigate-installed.cjs')(path.join(manual, '.claude/skills/forge/scripts'), manual);
  console.log('PASS: manual Claude installation supports the same investigation lifecycle');

  // An installed CLI can reveal the real command registry without a prompt or model invocation.
  const cli = process.env.FORGE_CLAUDE || 'claude';
  const version = spawnSync(cli, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  if (version.error?.code === 'ENOENT') console.log('SKIP: native Claude registry check (CLI not installed)');
  else {
    assert.ifError(version.error); assert.equal(version.status, 0, version.stderr);
    const validate = spawnSync(cli, ['plugin', 'validate', installed], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    assert.ifError(validate.error); assert.equal(validate.status, 0, validate.stderr || validate.stdout);
    const initialization = JSON.stringify({ type: 'control_request', request_id: 'investigate-registration', request: { subtype: 'initialize' } }) + '\n';
    const registry = (cwd, args) => {
      const result = spawnSync(cli, ['--strict-mcp-config', '--no-chrome', '--no-session-persistence', '--print', '--verbose',
        '--input-format', 'stream-json', '--output-format', 'stream-json', ...args],
      { cwd, input: initialization, encoding: 'utf8', windowsHide: true, timeout: 45000, maxBuffer: 4 * 1024 * 1024 });
      assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
      const messages = result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      assert.equal(messages.some(message => message.type === 'assistant'), false, 'Registry check must not call a model');
      const commands = messages.find(message => message.type === 'control_response')?.response?.response?.commands;
      assert.ok(Array.isArray(commands), 'CLI must return its native command registry');
      assert.ok(commands.some(command => command.name === 'forge:investigate'), 'Missing exact /forge:investigate registration');
      assert.ok(!commands.some(command => /^forge:forge:.*investigate$/.test(command.name)), 'Duplicate forge namespace');
    };
    registry(project, ['--setting-sources', '', '--plugin-dir', installed]);
    registry(manual, ['--setting-sources', 'project']);
    console.log('PASS: native Claude CLI validates plugin and registers /forge:investigate for plugin and manual installs (no model call)');
  }
} finally {
  const resolved = fs.realpathSync(scratch);
  assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir())); assert(path.basename(resolved).startsWith('forge-claude-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
console.log('Claude plugin checks passed');
NODE
