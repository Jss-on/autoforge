#!/usr/bin/env bash
# Exercise the shared installer without writing to any real agent configuration.
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
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-install-'));
const source = path.join(scratch, 'source package');
const project = path.join(scratch, 'target project');
const installer = path.join(source, 'scripts/install.sh');
const shellPath = file => file.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase());
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const read = file => fs.readFileSync(file, 'utf8');
const run = (args, { cwd = project, env = {}, status = 0 } = {}) => {
  const result = spawnSync(process.env.FORGE_TEST_BASH, [shellPath(installer), ...args], {
    cwd, encoding: 'utf8', timeout: 30000, env: { ...process.env,
      CLAUDE_CONFIG_DIR: '', OPENCODE_CONFIG_DIR: '', OPENCODE_CONFIG: '', XDG_CONFIG_HOME: '', CODEX_HOME: '', ...env },
  });
  assert.ifError(result.error);
  assert.equal(result.status, status, result.stderr || result.stdout);
  return result.stdout + result.stderr;
};
try {
  write(installer, read('scripts/install.sh').replace(/\r\n/g, '\n'));
  fs.mkdirSync(project);
  const agents = { claude: '.claude', opencode: '.opencode', codex: '.agents', cursor: '.cursor' };
  for (const [agent, directory] of Object.entries(agents)) {
    write(path.join(source, directory, 'skills/forge/SKILL.md'), agent);
    write(path.join(source, directory, 'skills/forge/scripts/check.sh'), 'exit 0\n');
  }
  for (const file of ['.claude/commands/forge.md', '.claude/commands/forge/plan.md', '.claude/hooks/forge/hooks.json',
    '.opencode/commands/forge.md', '.opencode/commands/forge_plan.md', '.opencode/agents/docs-manager.md']) {
    write(path.join(source, file), file);
  }
  for (const agent of Object.keys(agents)) {
    const config = path.join(project, '.' + agent);
    const skill = path.join(config, 'skills/forge');
    write(path.join(config, 'settings.json'), 'preserve settings');
    write(path.join(config, 'skills/other/SKILL.md'), 'preserve other skill');
    run(['--' + agent, '--local']);
    assert.equal(read(path.join(skill, 'SKILL.md')), agent);
    write(path.join(skill, 'obsolete.md'), 'stale');
    run(['--' + agent, '--local', '--force']);
    assert.equal(fs.existsSync(path.join(skill, 'obsolete.md')), false);
    assert.equal(read(path.join(config, 'settings.json')), 'preserve settings');
    assert.equal(read(path.join(config, 'skills/other/SKILL.md')), 'preserve other skill');
    // Native Windows paths are intentional; the installer must convert them itself.
    const globalConfig = path.join(scratch, agent + ' global config');
    run(['--' + agent, '--global', '--config-dir', globalConfig]);
    assert.equal(read(path.join(globalConfig, 'skills/forge/SKILL.md')), agent);
    run(['--' + agent, '--local', '--force'], { cwd: source });
    assert.equal(read(path.join(source, agents[agent], 'skills/forge/SKILL.md')), agent);
  }
  assert.equal(read(path.join(project, '.claude/commands/forge.md')), '.claude/commands/forge.md');
  assert.equal(read(path.join(project, '.opencode/agents/docs-manager.md')), '.opencode/agents/docs-manager.md');
  console.log('PASS: all four agents install locally/globally, replace safely, and install from their source checkout');

  run(['--cursor', '--global', '--config-dir=../relative config']);
  assert.equal(read(path.join(scratch, 'relative config/skills/forge/SKILL.md')), 'cursor');
  const home = spawnSync(process.env.FORGE_TEST_BASH, ['-c', 'printf "%s" "$HOME"'], { encoding: 'utf8' });
  assert.equal(home.status, 0, home.stderr);
  const tildeTarget = path.join(scratch, 'tilde config');
  const tildePath = '~/' + path.posix.relative(home.stdout, shellPath(tildeTarget));
  run(['--cursor', '--global', '--config-dir', tildePath]);
  assert.equal(read(path.join(tildeTarget, 'skills/forge/SKILL.md')), 'cursor');
  for (const [agent, variable] of [['claude', 'CLAUDE_CONFIG_DIR'], ['opencode', 'OPENCODE_CONFIG_DIR'], ['codex', 'CODEX_HOME']]) {
    const config = path.join(scratch, variable + ' config');
    run(['--' + agent, '--global'], { env: { [variable]: config } });
    assert.equal(read(path.join(config, 'skills/forge/SKILL.md')), agent);
  }
  const openConfig = path.join(scratch, 'opencode file config');
  run(['--opencode', '--global'], { env: { OPENCODE_CONFIG: path.join(openConfig, 'config.json') } });
  assert.equal(read(path.join(openConfig, 'skills/forge/SKILL.md')), 'opencode');
  run(['--opencode', '--global'], { env: { XDG_CONFIG_HOME: '../xdg config' } });
  assert.equal(read(path.join(scratch, 'xdg config/opencode/skills/forge/SKILL.md')), 'opencode');
  if (process.platform === 'win32') {
    const config = path.join(scratch, 'windows slash config');
    run(['--cursor', '--global', '--config-dir', config.replace(/\\/g, '/')]);
    assert.equal(read(path.join(config, 'skills/forge/SKILL.md')), 'cursor');
  }
  console.log('PASS: native, relative, quoted-tilde and environment configuration paths');

  const missing = path.join(source, '.cursor/skills/forge');
  assert.ok(missing.startsWith(scratch + path.sep));
  fs.renameSync(missing, missing + '.held');
  assert.match(run(['--cursor', '--local', '--force'], { status: 1 }), /source directory not found/);
  assert.equal(read(path.join(project, '.cursor/skills/forge/SKILL.md')), 'cursor');
  fs.renameSync(missing + '.held', missing);
  assert.match(run(['--cursor', '--global', '--config-dir', missing], { status: 1 }), /destination is inside source/);
  assert.equal(read(path.join(missing, 'SKILL.md')), 'cursor');
  const external = path.join(scratch, 'outside config');
  const linked = path.join(scratch, 'linked config');
  write(path.join(external, 'forge/keep.txt'), 'preserve outside files');
  fs.mkdirSync(linked);
  fs.symlinkSync(external, path.join(linked, 'skills'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.match(run(['--cursor', '--global', '--config-dir', linked], { status: 1 }), /destination escapes config directory/);
  assert.equal(read(path.join(external, 'forge/keep.txt')), 'preserve outside files');
  assert.match(run(['--cursor', '--global', '--config-dir', ''], { status: 1 }), /requires a path/);
  assert.match(run(['--cursor', '--global', '--config-dir='], { status: 1 }), /requires a path/);
  assert.match(run(['--cursor', '--local', '--config-dir', linked], { status: 1 }), /only be used with --global/);
  console.log('PASS: missing/overlapping sources and escaping destinations fail without replacing existing files');
} finally {
  assert.equal(path.dirname(scratch), os.tmpdir());
  assert.ok(path.basename(scratch).startsWith('forge-install-'));
  fs.rmSync(scratch, { recursive: true, force: true });
}
console.log('3 passed, 0 failed (installer)');
NODE
