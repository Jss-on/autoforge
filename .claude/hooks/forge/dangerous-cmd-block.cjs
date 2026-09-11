'use strict';

// PreToolUse hook: blocks destructive bash commands.
// Regular `git push` is allowed — only force-push variants and hard-destructive ops are blocked.
// Uses the packaged command screen; a broken screen cannot approve execution.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { isEnabled, safeParseStdin, log, block } = require('./lib/ar-hook-utils.cjs');

const HOOK_NAME = 'dangerous-cmd-block';

// Each entry: [substring to match, label for error message]
const BLOCKED_PATTERNS = [
  ['git push --force',  'git push --force'],
  ['git push -f',       'git push -f'],
  ['push --force',      'push --force'],
  ['git reset --hard',  'git reset --hard'],
  ['reset --hard',      'reset --hard'],
  ['git clean -fd',     'git clean -fd'],
  ['git clean -f',      'git clean -f'],
  ['git branch -D',     'git branch -D'],
  ['git checkout .',    'git checkout .'],
  ['git restore .',     'git restore .'],
  ['rm -rf /',          'rm -rf /'],
  ['rm -rf ~',          'rm -rf ~'],
  ['rm -rf .',          'rm -rf .'],
];

let screeningBash = false;
try {
  if (!isEnabled(HOOK_NAME)) {
    process.exit(0);
  }

  const stdin = safeParseStdin();
  if (!stdin || stdin.tool_name !== 'Bash') {
    process.exit(0);
  }

  screeningBash = true;
  const command = stdin.tool_input && stdin.tool_input.command;
  if (typeof command !== 'string' || !command.trim()) block('BLOCKED: Missing Bash command.');

  const screen = ['../skills/forge/scripts/orchestrate.sh', '../../skills/forge/scripts/orchestrate.sh']
    .map(p => path.resolve(__dirname, p)).find(p => fs.existsSync(p));
  if (!screen) block('BLOCKED: Packaged command screen is missing. Repair the Forge installation.');
  // Native Windows PATH can resolve WSL bash. Honor Claude's Git Bash override.
  const bash = process.env.CLAUDE_CODE_GIT_BASH_PATH || (process.platform === 'win32'
    ? path.join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe') : 'bash');
  // argv carries the command as data; it is never passed to bash -c or evaluated.
  const result = spawnSync(bash, [screen.replace(/\\/g, '/'), 'screen-cmd', command],
    { encoding: 'utf8', timeout: 10000, windowsHide: true });
  if (result.error || result.status !== 0 || result.stdout.trim() !== 'ok') {
    log(HOOK_NAME, { action: 'block', matched: 'command-screen' });
    block('BLOCKED: Forge command screening refused this command or could not complete.');
  }

  // ponytail: conservative lexical checks, not a shell sandbox. Recognize static
  // quoting and force flags after the remote, including Git's +refspec spelling.
  const words = command.match(/(?:[^\s'"\\;&|()]+|\\[^\n]|"(?:\\.|[^"\\])*"|'[^']*')+|[;&|()\n]/g) || [];
  const normalized = words.map(w => /\s/.test(w) && w !== '\n' ? '__argument__'
    : w.replace(/\\([A-Za-z0-9_./-])/g, '$1').replace(/['"]/g, '')).join(' ');
  if (/\bpush\b[^;&|()\n]*\s(?:--force(?:\b|=)|-[A-Za-z]*f[A-Za-z]*(?:\s|$)|\+\S)/.test(normalized)) {
    log(HOOK_NAME, { action: 'block', matched: 'force-push' });
    block('BLOCKED: Force push is disabled during Forge sessions.');
  }
  for (const [pattern, label] of BLOCKED_PATTERNS) {
    if (normalized.includes(pattern)) {
      log(HOOK_NAME, { action: 'block', matched: label });
      block(
        `BLOCKED: Destructive command detected: '${label}'. ` +
        `This command is blocked for safety during forge sessions.`
      );
    }
  }

  process.exit(0);
} catch {
  if (screeningBash) block('BLOCKED: Forge command screening failed.');
  process.exit(0);
}
