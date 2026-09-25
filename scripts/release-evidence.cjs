// Release authority binds protected CI to executed model evidence pinned by the operator.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const a = require('./acceptance.cjs'), ci = require('./ci-evidence.cjs');
function identity(root) {
  const entries = [];
  function walk(relative) {
    for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
      const rel = relative + '/' + name, file = path.join(root, rel), stat = fs.lstatSync(file);
      a.need(!stat.isSymbolicLink(), 'Evaluation bundle cannot contain symlinks');
      if (stat.isDirectory()) walk(rel);
      else { a.need(stat.isFile(), 'Bundle must contain regular files'); const raw = fs.readFileSync(file);
        // Logical package identity crosses Git CRLF checkouts; receipts also retain exact installed bytes.
        entries.push([rel, a.sha(/\.(md|json|ya?ml|sh|cjs|js|ps1|txt|ckignore)$/.test(rel) ? raw.toString('utf8').replaceAll('\r\n', '\n') : raw)]); }
    }
  }
  for (const dir of ['claude-plugin', 'plugins/forge']) walk(dir);
  a.need(entries.length > 0, 'No distributable bundle'); return a.sha(JSON.stringify(entries));
}
function evaluations(policy, data, bundle, now = Date.now()) {
  const requirements = policy.evaluations, rows = data?.evaluations, age = policy.max_age_ms ?? 86400000;
  a.need(policy.authentication === undefined || policy.authentication === 'subscription', 'Unsupported evaluation authentication policy');
  a.need(a.digest(bundle) && data?.version === 1 && Array.isArray(rows) && Array.isArray(requirements) && requirements.length >= 2 &&
    ['claude', 'codex'].every(agent => requirements.some(r => r.agent === agent)) && Number.isFinite(age) && age > 0 && age <= 604800000, 'Required Claude/Codex evaluation policy unavailable');
  const keys = new Set();
  for (const req of requirements) {
    const key = req.agent + '/' + req.platform; a.need(!keys.has(key), 'Duplicate required route'); keys.add(key);
    a.need(['claude', 'codex'].includes(req.agent) && ['win32', 'linux', 'darwin'].includes(req.platform) && a.text(req.cli_version) &&
      a.text(req.requested_model) && a.digest(req.oracle_sha256) && a.digest(req.runner_sha256), 'Pin agent/platform/CLI/model/oracle/runner');
    const matching = rows.filter(r => r?.agent === req.agent && r.platform === req.platform); a.need(matching.length === 1, 'Required evaluation missing or ambiguous: ' + key);
    const r = matching[0], at = Date.parse(r.ended_at);
    if (policy.authentication === 'subscription') a.need(r.authentication?.mode === 'subscription' &&
      r.authentication.method === (req.agent === 'codex' ? 'chatgpt' : 'claude.ai'), 'Required subscription login unproven: ' + key);
    a.need(['cli_version', 'requested_model', 'oracle_sha256', 'runner_sha256'].every(k => r[k] === req[k]) && r.bundle_sha256 === bundle &&
      (r.resolved_model == null || r.resolved_model === req.resolved_model) &&
      r.status === 'pass' && Number.isFinite(at) && at <= now + 5000 && now - at <= age, 'Required evaluation failed, changed or stale: ' + key);
    a.need(a.digest(r.installed_sha256) && r.installed_sha256 === r.source_sha256 && a.text(r.loaded_path) && r.route === 'forge --classic' &&
      a.digest(r.transcript_sha256) && r.isolation === 'os-sandbox' && ['feature', 'blocked', 'stale', 'failed'].every(k => r.cases?.[k] === true) &&
      ['router', 'command', 'verification'].every(k => r.trace?.[k] === true), 'Installed route, external oracle or isolation unproven: ' + key);
  }
  return { verdict: 'VERIFIED', bundle_sha256: bundle, routes: [...keys] };
}
function artifact(policy, receipt) {
  a.need(receipt.artifact?.id && policy.artifact?.digest, 'Independent CI artifact required');
  const r = cp.spawnSync('gh', ['api', '--hostname', 'github.com', `repos/${policy.repository}/actions/artifacts/${receipt.artifact.id}/zip`],
    { timeout: 60000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  a.need(r.status === 0 && 'sha256:' + a.sha(r.stdout) === policy.artifact.digest, 'Evaluation artifact missing or digest mismatch');
  const python = process.env.FORGE_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const code = 'import io,sys,zipfile\nz=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))\nassert z.namelist()==["installed-evaluations.json"]\ni=z.infolist()[0]\nassert i.file_size<=8*1024*1024 and not i.flag_bits&1\nsys.stdout.buffer.write(z.read(i))\n';
  const parsed = cp.spawnSync(python, ['-c', code], { input: r.stdout, timeout: 10000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  a.need(parsed.status === 0, 'Cannot safely read evaluation artifact (Python zipfile required)'); return JSON.parse(parsed.stdout);
}
async function verify(root, policy, head, io = {}) {
  const local = policy.local_report_sha256 !== undefined;
  const jobs = ['Harness test suites', 'Harness Windows smoke'];
  if (!local) jobs.push('Installed Forge evaluations');
  a.need(policy.ci?.head === head && /^[a-f0-9]{40}$/.test(head) &&
    jobs.every(j => policy.ci.required_jobs?.includes(j)), 'Exact candidate and all required CI jobs must be pinned');
  for (const file of ['scripts/installed-eval.cjs', 'evals/devops/installed-oracle.cjs', 'scripts/release-evidence.cjs', 'scripts/ci-evidence.cjs'])
    a.need(a.digest(policy.ci.protected_files?.[file]), 'Protect release runner/oracle/consumer: ' + file);
  a.need(policy.evaluations?.every(r => r.oracle_sha256 === policy.ci.protected_files['evals/devops/installed-oracle.cjs'] &&
    r.runner_sha256 === policy.ci.protected_files['scripts/installed-eval.cjs']), 'Evaluation must use the protected runner and oracle');
  const proof = await (io.ci || ci.verify)(policy.ci);
  let data;
  if (local) {
    a.need(policy.authentication === 'subscription' && a.digest(policy.local_report_sha256) && a.text(process.env.FORGE_EVAL_REPORT),
      'Pin the local subscription evaluation report and its exact digest');
    const raw = fs.readFileSync(process.env.FORGE_EVAL_REPORT);
    a.need(a.sha(raw) === policy.local_report_sha256, 'Local evaluation report differs from the operator-approved digest');
    data = JSON.parse(raw);
  } else data = await (io.artifact || artifact)(policy.ci, proof);
  const result = evaluations(policy, data, identity(root));
  await (io.ci || ci.verify)(policy.ci); // A rerun during artifact retrieval invalidates the decision.
  return { ...result, evaluation_source: local ? 'local' : 'ci-artifact', ci: proof };
}
module.exports = { identity, evaluations, verify };
if (require.main === module) (async () => {
  const [mode, root, head] = process.argv.slice(2), file = process.env.FORGE_RELEASE_POLICY;
  a.need(a.text(file), 'FORGE_RELEASE_POLICY required'); const raw = fs.readFileSync(file);
  a.need(a.sha(raw) === process.env.FORGE_RELEASE_POLICY_SHA256, 'Operator-approved release policy digest required'); const policy = JSON.parse(raw);
  if (mode === 'local') { a.need(a.text(process.env.FORGE_EVAL_REPORT), 'Fresh local installed evaluation report required before PR preparation');
    console.log(JSON.stringify(evaluations(policy, JSON.parse(fs.readFileSync(process.env.FORGE_EVAL_REPORT, 'utf8')), identity(root)))); }
  else { a.need(mode === 'ci', 'Use local|ci root head'); console.log(JSON.stringify(await verify(root, policy, head))); }
})().catch(e => { console.error('Release evidence blocked: ' + e.message); process.exitCode = 2; });
