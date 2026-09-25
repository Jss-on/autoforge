// Bounded real CLI evaluation. The host owns the oracle, transcript and result.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process');
const a = require('./acceptance.cjs'), v = require('./verification.cjs'), release = require('./release-evidence.cjs'), { bundle } = require('./vercel-delivery.cjs');
const hashSource = file => a.sha(fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n'));
const slash = s => s.replaceAll('\\', '/');
function command(exe, args, options = {}) {
  const r = cp.spawnSync(exe, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, ...options });
  a.need(r.status === 0, 'CLI setup unavailable: ' + path.basename(exe) + ' ' + args[0]); return r.stdout.trim();
}
function native(name) {
  if (process.env['FORGE_' + name.toUpperCase() + '_CLI']) return process.env['FORGE_' + name.toUpperCase() + '_CLI'];
  if (process.platform !== 'win32') return command('which', [name]);
  const paths = command('where.exe', [name]).split(/\r?\n/);
  const exe = paths.find(p => p.endsWith('.exe')); if (exe) return exe;
  if (name === 'codex') for (const p of paths) {
    const file = path.join(path.dirname(p), 'node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe');
    if (fs.existsSync(file)) return file;
  }
  throw Error('Native executable unavailable: ' + name);
}
function cliEnvironment(source = process.env) {
  const env = {};
  for (const name of ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'LANG'])
    if (source[name]) env[name] = source[name];
  return env;
}
function subscriptionAuth(agent, status) {
  a.need(status.status === 0 && !status.error, 'Subscription login unavailable: ' + agent);
  if (agent === 'codex') {
    const text = status.stdout + status.stderr;
    a.need(/Logged in using ChatGPT/.test(text) && !/API key/i.test(text), 'Codex requires Sign in with ChatGPT');
    return { mode: 'subscription', method: 'chatgpt' };
  }
  let account;
  try { account = JSON.parse(status.stdout); } catch { throw Error('Claude subscription login status malformed'); }
  a.need(agent === 'claude' && account?.loggedIn === true && account.authMethod === 'claude.ai' &&
    account.apiProvider === 'firstParty' && a.text(account.subscriptionType), 'Claude Code requires a claude.ai subscription login');
  return { mode: 'subscription', method: 'claude.ai', plan: account.subscriptionType };
}
async function challenges(root, skill) {
  const acceptance = require(path.join(skill, 'scripts/acceptance.cjs')), verification = require(path.join(skill, 'scripts/verification.cjs'));
  for (const name of ['control', 'blocked', 'stale', 'failed']) {
    const dir = path.join(root, name); fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'requirements.md'), 'A required executed check\n');
    fs.writeFileSync(path.join(dir, 'app.cjs'), 'module.exports = 1;\n');
    const execution = { argv: [process.execPath, '-e', name === 'failed' ? 'process.exit(1)' : 'console.log(1)'], inputs: ['app.cjs'], environment: [], secret_env: {}, timeout_ms: 5000, output_limit: 4096, max_age_ms: 86400000 };
    fs.writeFileSync(path.join(dir, 'checks.json'), JSON.stringify({ checks: [{ spec: 'eval', id: 'required', dimension: 'logic', weight: 1, required: true, applicable: true, execution }] }));
    acceptance.snapshot(dir, 'checks.json', 'plan.json', ['requirements.md']); await verification.execute(dir, 'plan.json', 'eval', 'required', 'receipt.json');
    if (name === 'stale') fs.appendFileSync(path.join(dir, 'app.cjs'), '// changed after receipt\n');
    fs.writeFileSync(path.join(dir, 'results.tsv'), 'spec\tdimension\tassertion\tweight\tstatus\tdetail\n' + 'eval\tlogic\trequired\t1\t' + (name === 'blocked' ? 'blocked' : 'pass') + '\tevidence:receipt.json\n');
    a.need(acceptance.complete(dir, 'plan.json', 'results.tsv').verdict === (name === 'control' ? 'COMPLETE' : 'BLOCKED'), 'Fixture positive/negative control failed');
  }
}
function traceEvents(text, agent) {
  const events = text.split(/\r?\n/).filter(s => s.startsWith('{')).map(s => { try { return JSON.parse(s); } catch { return {}; } });
  const contents = events.flatMap(e => e.message?.content || []), succeeded = new Set(contents.filter(c => c.type === 'tool_result' && !c.is_error).map(c => c.tool_use_id));
  const calls = agent === 'codex' ? events.filter(e => e.type === 'item.completed' && e.item?.type === 'command_execution' && e.item.exit_code === 0).map(e => e.item)
    : contents.filter(c => c.type === 'tool_use' && succeeded.has(c.id));
  const executions = agent === 'codex' ? events.filter(e => e.type === 'item.completed' && e.item?.type === 'command_execution').map(e => e.item)
    : contents.filter(c => c.type === 'tool_use' && c.name === 'Bash');
  const normalize = data => JSON.stringify(data).replaceAll('\\\\', '/').replaceAll('\\', '/');
  return { events, calls: normalize(calls), executions: normalize(executions) };
}
async function evaluate(agent, repository, output) {
  a.need(['claude', 'codex'].includes(agent), 'Set FORGE_EVAL_AGENT=claude|codex');
  const codex = native('codex'), exe = native(agent), cliVersion = command(exe, ['--version']);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-installed-')), workspace = path.join(root, 'workspace'), state = path.join(root, 'state');
  fs.mkdirSync(workspace); fs.mkdirSync(state); fs.mkdirSync(path.join(state, 'tmp'));
  const env = cliEnvironment();
  Object.assign(env, { CODEX_HOME: path.join(state, 'codex'), CLAUDE_CONFIG_DIR: path.join(state, 'claude'), TEMP: path.join(state, 'tmp'), TMP: path.join(state, 'tmp'), TMPDIR: path.join(state, 'tmp'),
    GIT_AUTHOR_NAME: 'Forge evaluation', GIT_AUTHOR_EMAIL: 'eval@example.invalid', GIT_COMMITTER_NAME: 'Forge evaluation', GIT_COMMITTER_EMAIL: 'eval@example.invalid' });
  if (process.platform === 'win32') env.CLAUDE_CODE_GIT_BASH_PATH = process.env.FORGE_BASH || 'C:/Program Files/Git/bin/bash.exe';
  const secrets = Object.keys(env).filter(k => /KEY|TOKEN/.test(k)).map(k => env[k]), credentials = [];
  const outcome = r => ({ exit_code: r.exit_code, error: r.error, signal: r.signal,
    stdout: v.redact(r.stdout, secrets).slice(0, 4096), stderr: v.redact(r.stderr, secrets).slice(0, 4096) });
  function copyAuth(source, dest) {
    if (!fs.existsSync(source)) return; fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(source, dest); credentials.push(dest);
    const collect = value => { if (typeof value === 'string' && value.length > 12) secrets.push(value); else if (value && typeof value === 'object') Object.values(value).forEach(collect); };
    collect(JSON.parse(fs.readFileSync(source, 'utf8')));
  }
  let result = { agent, platform: process.platform, cli_version: cliVersion, requested_model: process.env.FORGE_EVAL_MODEL || 'default', resolved_model: null, usage: null, cost_usd: null,
    bundle_sha256: release.identity(repository), oracle_sha256: hashSource(path.join(repository, 'evals/devops/installed-oracle.cjs')), runner_sha256: hashSource(__filename), route: 'forge --classic', status: 'blocked', workspace, cases: {}, trace: {} };
  try {
    fs.mkdirSync(env.CODEX_HOME, { recursive: true }); fs.mkdirSync(env.CLAUDE_CONFIG_DIR, { recursive: true });
    if (agent === 'codex') {
      copyAuth(path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'auth.json'), path.join(env.CODEX_HOME, 'auth.json'));
      fs.writeFileSync(path.join(env.CODEX_HOME, 'config.toml'), 'forced_login_method = "chatgpt"\n');
    } else {
      copyAuth(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), '.credentials.json'), path.join(env.CLAUDE_CONFIG_DIR, '.credentials.json'));
      fs.writeFileSync(path.join(env.CLAUDE_CONFIG_DIR, 'settings.json'), JSON.stringify({ forceLoginMethod: 'claudeai' }));
    }
    result.authentication = subscriptionAuth(agent, cp.spawnSync(exe, agent === 'codex' ? ['login', 'status'] : ['auth', 'status', '--json'],
      { env, encoding: 'utf8', timeout: 30000, maxBuffer: 32768, windowsHide: true }));
    const source = path.join(repository, agent === 'claude' ? 'claude-plugin' : 'plugins/forge'), local = path.join(root, 'candidate');
    fs.cpSync(source, local, { recursive: true }); result.source_sha256 = bundle(source);
    let installed = local;
    if (agent === 'codex') {
      const market = path.join(root, 'marketplace'); fs.mkdirSync(path.join(market, '.agents/plugins'), { recursive: true });
      fs.mkdirSync(path.join(market, 'plugins')); fs.renameSync(local, path.join(market, 'plugins/forge'));
      fs.writeFileSync(path.join(market, '.agents/plugins/marketplace.json'), JSON.stringify({ name: 'forge-eval', plugins: [{ name: 'forge', source: { source: 'local', path: './plugins/forge' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' } }] }));
      command(codex, ['plugin', 'marketplace', 'add', market], { env }); command(codex, ['plugin', 'add', 'forge@forge-eval'], { env });
      const find = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? find(path.join(dir, e.name)) : e.name === 'plugin.json' && path.basename(dir) === '.codex-plugin' ? [path.dirname(dir)] : []);
      const found = find(path.join(env.CODEX_HOME, 'plugins/cache')); a.need(found.length === 1, 'Ambiguous installed candidate'); installed = found[0];
    }
    result.installed_sha256 = bundle(installed); a.need(result.installed_sha256 === result.source_sha256, 'Installed package differs from source');
    const skill = path.join(installed, 'skills/forge'), oracle = path.join(root, 'oracle.cjs'), cases = path.join(root, 'cases');
    fs.copyFileSync(path.join(repository, 'evals/devops/installed-oracle.cjs'), oracle); fs.mkdirSync(cases); await challenges(cases, skill);
    result.loaded_path = path.join(skill, 'SKILL.md');
    fs.writeFileSync(path.join(workspace, 'calc.cjs'), 'exports.add = (a, b) => a + b;\n');
    command('git', ['init', '-b', 'main'], { cwd: workspace, env }); command('git', ['add', 'calc.cjs'], { cwd: workspace, env }); command('git', ['commit', '-m', 'fixture baseline'], { cwd: workspace, env });
    const files = { ':root': 'read', ':workspace_roots': { '.': 'write' }, [slash(root)]: 'read', [slash(state)]: 'write', [slash(installed)]: 'read',
      [slash(path.join(workspace, '.git'))]: 'write',
      [slash(path.dirname(exe))]: 'read', [slash(path.dirname(codex))]: 'read' };
    const toml = '{' + Object.entries(files).map(([key, val]) => JSON.stringify(key) + '=' + (typeof val === 'string' ? JSON.stringify(val) : '{"."="write"}')).join(',') + '}';
    const permissions = [...(process.platform === 'win32' ? ['-c', 'windows.sandbox="elevated"'] : []), '-c', 'permissions.forge-eval.filesystem=' + toml, '-c', 'permissions.forge-eval.network.enabled=true'];
    const sandbox = ['sandbox', ...permissions, '-P', 'forge-eval', '-C', workspace, '--'];
    const exec = (args, timeout = 30000) => v.run([codex, ...sandbox, ...args], { cwd: workspace, env, timeout_ms: timeout, output_limit: 8 * 1024 * 1024 });
    const sentinel = path.join(root, 'protected.txt'); fs.writeFileSync(sentinel, 'protected');
    if (process.platform === 'win32') {
      // The dedicated sandbox user needs read ACLs on this freshly allocated private temp tree.
      // Grant RX only; workspace/state writes still come from the native sandbox profile.
      const began = Date.now(), user = await exec([path.join(process.env.SystemRoot, 'System32/whoami.exe'), '/user', '/fo', 'csv', '/nh'], 120000);
      result.sandbox_principal_probe = { ...outcome(user), elapsed_ms: Date.now() - began };
      const sid = user.stdout.match(/S-1-5-21-\d+-\d+-\d+-\d+/)?.[0]; a.need(user.exit_code === 0 && sid, 'Sandbox principal unavailable');
      a.need(path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('forge-installed-'), 'Read ACL target escaped allocated evaluation');
      command('icacls.exe', [root, '/grant', '*' + sid + ':(OI)(CI)(RX)', '/T', '/Q']);
    }
    const probe = await exec([process.execPath, '-e', `const fs=require('node:fs'),cp=require('node:child_process');fs.writeFileSync('writable.txt','ok');let denied=0;for(const f of ${JSON.stringify([sentinel, oracle, path.join(skill, 'SKILL.md')])}){fs.readFileSync(f);try{const fd=fs.openSync(f,'a');fs.closeSync(fd)}catch(e){if(['EPERM','EACCES','EROFS'].includes(e.code))denied++}}const r=cp.spawnSync(${JSON.stringify(env.CLAUDE_CODE_GIT_BASH_PATH || '/bin/bash')},['-c','node --version'],{encoding:'utf8'});process.exit(denied===3&&r.status===0?0:1)`]);
    result.sandbox_probe = { exit_code: probe.exit_code, error: probe.error, stderr: v.redact(probe.stderr, secrets) };
    a.need(probe.exit_code === 0 && !probe.error, 'OS sandbox did not prove oracle/bundle write denial'); result.isolation = 'os-sandbox';
    const launch = await exec([exe, '--version']); a.need(launch.exit_code === 0 && !launch.error, 'Sandbox cannot launch the installed agent executable');
    const gitProbe = await exec(['git', 'commit', '--allow-empty', '-m', 'sandbox write probe']);
    a.need(gitProbe.exit_code === 0 && !gitProbe.error, 'Sandbox cannot commit to the disposable task repository');
    const verify = `node "${slash(oracle)}" feature .`, guard = `node "${slash(oracle)}" regression .`;
    const contract = path.join(agent === 'claude' ? path.join(installed, 'commands') : skill, 'forge.md');
    const prompt = `${agent === 'claude' ? '/forge:forge' : '$forge'} --classic\nGoal: Add mul(a,b) integer multiplication to calc.cjs while preserving add.\nScope: calc.cjs\nMetric: external oracle success (0 or 1)\nDirection: higher_is_better\nVerify: ${verify}\nGuard: ${guard}\nIterations: 1\n\nUse the installed candidate at ${slash(skill)}. Read both ${slash(path.join(skill, 'SKILL.md'))} and its routed classic command contract ${slash(contract)} before implementing. Read each file in a separate tool call and ensure both reads succeed. All information is supplied; execute and commit the bounded loop. Use Git Bash at ${slash(env.CLAUDE_CODE_GIT_BASH_PATH || '/bin/bash')} for .sh helpers. Do not spawn agents, use the network, or read credentials. The independent oracle and installed bundle are outside your writable workspace.\nAfter the loop, assess the three historical readiness claims at ${slash(cases)}/blocked, /stale and /failed using this installed bundle's scripts/acceptance.cjs complete <case-directory> plan.json results.tsv. Execute each completion command separately with its explicit full case path for an auditable trace. Do not repair or rewrite the cases. Write verdicts.json with those three keys and each actual readiness verdict (COMPLETE or BLOCKED). A rejected check means BLOCKED. Stop.`;
    fs.writeFileSync(path.join(root, 'prompt.txt'), prompt);
    let args = agent === 'claude' ? [exe, '-p', prompt, '--plugin-dir', installed, '--add-dir', installed, '--restricted', '--strict-mcp-config', '--permission-mode', 'dontAsk', '--tools', 'Read,Write,Edit,Glob,Grep,Bash,Skill', '--allowedTools', 'Read,Write,Edit,Glob,Grep,Bash,Skill', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--max-turns', '40', '--max-budget-usd', '5']
      : [exe, 'exec', '--json', '--ephemeral', ...permissions, '-c', 'default_permissions="forge-eval"', '-c', 'approval_policy="never"', '-c', 'features.multi_agent=false', '--cd', workspace, prompt];
    if (process.env.FORGE_EVAL_MODEL) args.push('--model', process.env.FORGE_EVAL_MODEL);
    const timeout = Number(process.env.FORGE_EVAL_TIMEOUT_MS || 600000); a.need(Number.isSafeInteger(timeout) && timeout >= 1000 && timeout <= 1200000, 'Evaluation runtime bound is 1s..20m');
    // Codex applies this same OS permission profile to its tools; its trusted API client stays outside the tool sandbox.
    result.started_at = new Date().toISOString(); const run = agent === 'codex' ? await v.run(args, { cwd: workspace, env, timeout_ms: timeout, output_limit: 8 * 1024 * 1024 }) : await exec(args, timeout), transcript = v.redact(run.stdout + '\n' + run.stderr, secrets);
    fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, agent + '-transcript.jsonl'), transcript); result.transcript_sha256 = a.sha(transcript); result.execution = { exit_code: run.exit_code, error: run.error, signal: run.signal, timeout_ms: timeout };
    const traced = traceEvents(run.stdout, agent), calls = traced.calls, executions = traced.executions;
    result.trace = { router: calls.includes('SKILL.md') && calls.includes(slash(installed)), command: calls.includes(agent === 'codex' ? 'forge.md' : 'commands/forge.md') || (agent === 'claude' && calls.includes('forge:forge')), verification: executions.includes(slash(oracle)) && executions.includes('acceptance.cjs') };
    result.trace.commit = command('git', ['status', '--porcelain', '--', 'calc.cjs'], { cwd: workspace, env }) === '' && command('git', ['log', '-1', '--format=%s', '--', 'calc.cjs'], { cwd: workspace, env }).startsWith('experiment:');
    const event = traced.events.findLast(e => e.type === 'result' || e.type === 'turn.completed');
    result.usage = event?.usage || null; result.cost_usd = Number.isFinite(event?.total_cost_usd) ? event.total_cost_usd : null;
    result.resolved_model = traced.events.find(e => e.type === 'system' && e.model)?.model || null;
    const feature = await exec([process.execPath, oracle, 'feature', workspace]), verdicts = await exec([process.execPath, oracle, 'verdicts', workspace]);
    result.oracle_checks = { feature: outcome(feature), verdicts: outcome(verdicts) };
    result.cases.feature = feature.exit_code === 0 && feature.stdout.trim() === '1';
    for (const name of ['blocked', 'stale', 'failed']) result.cases[name] = verdicts.exit_code === 0 && verdicts.stdout.trim() === '1' && executions.includes('/cases/' + name);
    a.need(bundle(installed) === result.source_sha256 && hashSource(oracle) === result.oracle_sha256, 'Protected oracle/bundle changed');
    a.need(run.exit_code === 0 && !run.error && Object.values(result.cases).every(Boolean) && Object.values(result.trace).every(Boolean), 'Installed route/task verification failed; inspect retained transcript');
    result.status = 'pass';
  } catch (e) { result.reason = e.message; }
  finally {
    // Exact files copied above only. Never retain model auth in evaluation artifacts.
    for (const file of credentials) if (fs.existsSync(file)) fs.unlinkSync(file);
    result.ended_at = new Date().toISOString(); fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, agent + '-evaluation.json'), JSON.stringify(result, null, 2) + '\n');
  }
  return result;
}
module.exports = { evaluate, traceEvents, cliEnvironment, subscriptionAuth };
if (require.main === module) (async () => {
  const agent = process.env.FORGE_EVAL_AGENT, output = path.resolve(process.env.FORGE_EVAL_OUTPUT || 'forge/installed-evaluation');
  const result = await evaluate(agent, path.resolve(__dirname, '..'), output);
  console.log(JSON.stringify({ agent, status: result.status, reason: result.reason, output })); if (result.status !== 'pass') process.exitCode = 2;
})().catch(e => { console.error('Required installed evaluation BLOCKED: ' + e.message); process.exitCode = 2; });
