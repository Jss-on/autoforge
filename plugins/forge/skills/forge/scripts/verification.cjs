// Execute a pinned assertion and validate its retained receipt. Receipts are data.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const a = require('./acceptance.cjs');
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const envName = s => typeof s === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
const sensitive = s => /(?:^|_)(?:TOKEN|PASSWORD|PASSWD|SECRET|API_KEY|PRIVATE_KEY|CREDENTIALS|AUTHORIZATION)(?:_|$)/i.test(s);
function assertion(project, planFile, spec, id) {
  const p = a.loadPlan(project, planFile), check = p.plan.checks.find(c => c.spec === spec && c.id === id), e = check?.execution;
  a.need(check?.applicable && a.object(e) && Array.isArray(e.argv) && e.argv.length > 0 && e.argv.every(a.text), 'Pinned executable/arguments required');
  a.need(Array.isArray(e.inputs) && e.inputs.length > 0 && Array.isArray(e.environment) && e.environment.every(k => envName(k) && !sensitive(k)), 'Declare assertion inputs and non-secret environment names');
  a.need(a.object(e.secret_env) && Object.entries(e.secret_env).every(([k, version]) => envName(k) && envName(version) && k !== version && /_(VERSION|REVISION|EPOCH|ID)$/.test(version)), 'Secrets require named rotation/version references');
  a.need(!e.environment.some(k => k in e.secret_env), 'Secret values cannot be recorded as environment metadata');
  a.need(Number.isSafeInteger(e.timeout_ms) && e.timeout_ms > 0 && e.timeout_ms <= 86400000 && Number.isSafeInteger(e.output_limit) && e.output_limit > 0 && e.output_limit <= 32 * 1024 * 1024, 'Bound execution time and retained output');
  if (e.max_age_ms !== undefined) a.need(Number.isSafeInteger(e.max_age_ms) && e.max_age_ms > 0 && e.max_age_ms <= 86400000, 'Invalid evidence freshness bound');
  if (e.expect !== undefined) a.need(a.object(e.expect) && Number.isFinite(e.expect.min) && Number.isFinite(e.expect.max) && e.expect.min <= e.expect.max, 'Numeric assertion needs finite min/max');
  return { ...p, check, execution: e };
}
function executable(root, name) {
  const extensions = process.platform === 'win32' && !path.extname(name) ? (process.env.PATHEXT || '.EXE;.COM;.CMD;.BAT').split(';') : [''];
  const dirs = /[\\/]/.test(name) || path.isAbsolute(name) ? [''] : (process.env.PATH || '').split(path.delimiter);
  for (const dir of dirs) for (const ext of extensions) {
    const file = path.resolve(root, dir, name + ext);
    try { if (fs.statSync(file).isFile()) return { path: fs.realpathSync(file), sha256: a.sha(fs.readFileSync(file)) }; } catch { /* search remaining PATH entries */ }
  }
  return null;
}
function context(p) {
  const e = p.execution, inputs = Object.fromEntries([...new Set(e.inputs)].sort().map(f => [f, a.sha(fs.readFileSync(a.local(p.root, f)))]));
  const environment = {}, secret_versions = {};
  for (const name of [...e.environment].sort()) {
    const value = process.env[name] ?? null;
    a.need(value === null || !/:\/\/[^/\s]+@/.test(value), 'Credential-bearing URL must be a secret input');
    environment[name] = value;
  }
  for (const [name, version] of Object.entries(e.secret_env).sort()) {
    a.need(a.text(process.env[name]) && a.text(process.env[version]), 'Secret or its current version reference unavailable: ' + name);
    secret_versions[name] = { reference: version, version: process.env[version] };
  }
  const git = args => cp.spawnSync('git', args, { cwd: p.root, encoding: 'utf8', timeout: 10000, maxBuffer: 16 * 1024 * 1024 });
  const top = git(['rev-parse', '--show-toplevel']);
  let candidate = { revision: null, dirty_sha256: null };
  if (top.status === 0 && fs.realpathSync(top.stdout.trim()) === p.root) {
    const head = git(['rev-parse', 'HEAD']), diff = git(['diff', '--no-ext-diff', '--no-textconv', '--binary', 'HEAD', '--']);
    a.need(head.status === 0 && diff.status === 0, 'Candidate identity unavailable');
    candidate = { revision: head.stdout.trim(), dirty_sha256: a.sha(diff.stdout) };
  }
  return { project: p.root, candidate, inputs, environment, secret_versions,
    executable: executable(p.root, e.argv[0]),
    runner: { node: process.version, platform: process.platform, arch: process.arch,
      verifier_sha256: a.sha(fs.readFileSync(__filename)), acceptance_sha256: a.sha(fs.readFileSync(require.resolve('./acceptance.cjs'))) } };
}
function outcome(r, e) {
  if (r.error !== null || r.signal !== null || r.exit_code === null) return 'blocked';
  if (r.exit_code !== 0) return 'fail';
  if (e.expect !== undefined) {
    const value = r.stdout.trim(), number = Number(value);
    if (!value || !Number.isFinite(number) || number < e.expect.min || number > e.expect.max) return 'fail';
  }
  return 'pass';
}
function redact(value, secrets) {
  for (const s of secrets.filter(Boolean).sort((x, y) => y.length - x.length)) value = value.split(s).join('[REDACTED]');
  return value.replace(/(Bearer\s+)\S+/gi, '$1[REDACTED]')
    .replace(/((?:password|passwd|token|api[_-]?key|secret)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/(:\/\/)[^/\s]+@/g, '$1[REDACTED]@');
}
async function run(argv, options) {
let bytes = 0, stdout = '', stderr = '', failure = null;
const result = await new Promise(resolve => {
  const child = cp.spawn(argv[0], argv.slice(1), { cwd: options.cwd, env: options.env, shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const stop = reason => {
    if (failure) return;
    failure = reason;
    if (!child.pid) return;
    if (process.platform === 'win32') cp.spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 });
    else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
  };
  const timer = setTimeout(() => stop('timeout'), options.timeout_ms);
  const collect = stream => data => {
    const remaining = Math.max(0, options.output_limit - bytes); bytes += data.length;
    const text = data.subarray(0, remaining).toString('utf8');
    if (stream === 'stdout') stdout += text; else stderr += text;
    if (bytes > options.output_limit) stop('output_limit');
  };
  child.stdout.on('data', collect('stdout')); child.stderr.on('data', collect('stderr'));
  child.on('error', error => { failure = error.code || 'spawn_error'; });
  child.on('close', (code, signal) => { clearTimeout(timer); resolve({ exit_code: Number.isInteger(code) && code >= 0 ? code : null, signal: signal || null }); });
});
return { ...result, stdout, stderr, error: failure };
}
async function execute(project, planFile, spec, id, output) {
  const p = assertion(project, planFile, spec, id), e = p.execution;
  const out = path.resolve(p.root, output), rel = path.relative(p.root, out);
  a.need(rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel), 'Receipt output escapes project');
  // Exclusive reservation also prevents symlink overwrites and concurrent receipt reuse.
  const parent = fs.realpathSync(path.dirname(out));
  const parentRel = path.relative(p.root, parent);
  a.need(!path.isAbsolute(parentRel) && !parentRel.split(path.sep).includes('..'), 'Receipt parent escapes project');
  const fd = fs.openSync(out, 'wx');
  try {
    const before = context(p), started = new Date().toISOString(), began = performance.now();
    const env = {};
    for (const name of ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'LANG', 'LC_ALL', ...e.environment, ...Object.keys(e.secret_env)])
      if (process.env[name] !== undefined) env[name] = process.env[name];
    const secrets = Object.keys(e.secret_env).map(k => process.env[k]);
    a.need(!e.argv.some(arg => secrets.some(s => arg.includes(s)) || /--?(?:token|password|secret|api-key)(?:=|$)/i.test(arg)), 'Pass credentials through declared secret environment, not arguments');
    if (/^(?:ba|z|k)?sh(?:\.exe)?$|^(?:cmd|powershell|pwsh)(?:\.exe)?$/i.test(path.basename(e.argv[0]))) {
      const bash = process.env.FORGE_BASH || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash');
      const quoted = e.argv.map(s => "'" + s.replaceAll("'", "'\\''") + "'").join(' ');
      const screen = cp.spawnSync(bash, [path.join(__dirname, 'orchestrate.sh'), 'screen-cmd', quoted], { encoding: 'utf8', timeout: 10000, windowsHide: true });
      a.need(screen.status === 0 && screen.stdout.trim() === 'ok', 'Explicit shell command failed the existing safety screen');
    }
    const result = await run(e.argv, { cwd: p.root, env, timeout_ms: e.timeout_ms, output_limit: e.output_limit });
    let { stdout, stderr, error: failure } = result;
    try { if (!same(before, context(assertion(project, planFile, spec, id)))) failure = 'inputs_changed'; } catch { failure = 'inputs_changed'; }
    stdout = redact(stdout, secrets); stderr = redact(stderr, secrets);
    const r = { version: 1, spec, check_id: id, plan_sha256: p.sha256, argv: e.argv, command_sha256: a.sha(JSON.stringify(e)),
      context: before, started_at: started, ended_at: new Date().toISOString(), elapsed_ms: performance.now() - began,
      ...result, error: failure, stdout, stderr, stdout_sha256: a.sha(stdout), stderr_sha256: a.sha(stderr), redacted: true };
    r.status = outcome(r, e);
    fs.writeFileSync(fd, JSON.stringify(r, null, 2) + '\n');
    return r;
  } finally { fs.closeSync(fd); }
}
function validate(project, planFile, spec, id, receipt) {
  const p = assertion(project, planFile, spec, id), file = a.argument(p.root, receipt), r = JSON.parse(fs.readFileSync(file, 'utf8'));
  a.need(a.object(r) && r.version === 1 && r.spec === spec && r.check_id === id && r.plan_sha256 === p.sha256 &&
    r.command_sha256 === a.sha(JSON.stringify(p.execution)) && same(r.argv, p.execution.argv) && same(r.context, context(p)), 'Stale or mismatched execution identity');
  a.need(typeof r.stdout === 'string' && typeof r.stderr === 'string' && r.stdout_sha256 === a.sha(r.stdout) && r.stderr_sha256 === a.sha(r.stderr) && r.redacted === true, 'Missing or altered retained output');
  const start = Date.parse(r.started_at), end = Date.parse(r.ended_at);
  a.need(Number.isFinite(start) && Number.isFinite(end) && end >= start && end <= Date.now() + 5000 &&
    Date.now() - end <= (p.execution.max_age_ms ?? 300000) && Number.isFinite(r.elapsed_ms) && r.elapsed_ms >= 0, 'Invalid or expired execution time');
  a.need(Number.isInteger(r.exit_code) && r.exit_code >= 0 && r.exit_code <= 255 && r.signal === null && r.error === null && r.status === 'pass' && outcome(r, p.execution) === 'pass', 'Assertion execution did not pass');
  return r;
}
module.exports = { execute, validate, run, redact };
if (require.main === module) {
  (async () => {
    const [action, ...args] = process.argv.slice(2); a.need(args.length === 5, 'run|check <project> <plan> <spec> <check-id> <receipt>');
    const r = action === 'run' ? await execute(...args) : action === 'check' ? validate(...args) : null;
    a.need(r, 'Unknown verification action'); console.log('VERIFICATION: ' + r.status.toUpperCase()); if (r.status !== 'pass') process.exitCode = 1;
  })().catch(e => { console.error('Verification blocked: ' + e.message); process.exitCode = 2; });
}
