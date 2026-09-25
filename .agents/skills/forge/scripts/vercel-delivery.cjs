// One provider path. Run from trusted tooling, with a reviewed policy outside candidate control.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const a = require('./acceptance.cjs'), ci = require('./ci-evidence.cjs');
const id = s => typeof s === 'string' && /^[\w-]+$/.test(s);
const target = p => p.team_id + '/' + p.project_id;
async function api(route, method = 'GET', body) {
  if (route.startsWith('repos/')) {
    if (method === 'GET') return ci.github(route);
    a.need(method === 'POST' && /^repos\/[\w.-]+\/[\w.-]+\/deployments$/.test(route), 'Only native deployment journaling may write GitHub');
    const result = cp.spawnSync('gh', ['api', '--hostname', 'github.com', route, '--method', 'POST', '--input', '-'], { input: JSON.stringify(body), encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
    a.need(result.status === 0, 'Durable operation reservation unavailable; no provider mutation'); return JSON.parse(result.stdout);
  }
  a.need(route.startsWith('/') && !route.startsWith('//') && a.text(process.env.VERCEL_TOKEN), 'Vercel credential unavailable');
  const r = await fetch('https://api.vercel.com' + route, { method, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Authorization: 'Bearer ' + process.env.VERCEL_TOKEN } });
  if (!r.ok) { const e = Error('Provider HTTP ' + r.status + '; inspect the retained operation before retry'); e.status = r.status; throw e; }
  const text = await r.text(); a.need(text.length <= 8 * 1024 * 1024, 'Provider response exceeded limit'); return JSON.parse(text);
}
async function configuration(p, read = api) {
  const project = await read('/v9/projects/' + p.project_id + '?teamId=' + p.team_id);
  const env = await read('/v10/projects/' + p.project_id + '/env?decrypt=false&teamId=' + p.team_id);
  a.need(Array.isArray(env.envs) && !env.pagination?.next, 'Complete configuration metadata required');
  const revisions = env.envs.map(e => {
    a.need(a.text(e.key) && id(e.id) && Number.isFinite(e.updatedAt), 'Configuration rotation/version unavailable; re-verify');
    return { key: e.key, id: e.id, target: e.target, gitBranch: e.gitBranch ?? null, revision: e.updatedAt };
  }).sort((x, y) => x.id.localeCompare(y.id));
  return a.sha(JSON.stringify({ node: project.nodeVersion, framework: project.framework, root: project.rootDirectory, build: project.buildCommand, revisions }));
}
function bundle(root) {
  const entries = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name), stat = fs.lstatSync(file);
      a.need(!stat.isSymbolicLink(), 'Build output may not contain symlinks');
      if (stat.isDirectory()) walk(file);
      else { a.need(stat.isFile(), 'Build output must contain regular files'); entries.push([path.relative(root, file).replaceAll('\\', '/'), a.sha(fs.readFileSync(file))]); }
    }
  }
  walk(root); a.need(entries.length > 0, 'Empty build output'); return a.sha(JSON.stringify(entries));
}
async function mutate(p, r) {
  const executable = process.env.VERCEL_CLI_PATH;
  a.need(a.text(executable) && fs.statSync(executable).isFile(), 'Pin VERCEL_CLI_PATH to the installed Vercel 50.37.0 vc.js');
  const env = {};
  for (const name of ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'VERCEL_TOKEN']) if (process.env[name] !== undefined) env[name] = process.env[name];
  const version = cp.spawnSync(process.execPath, [executable, '--version'], { env, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  a.need(version.status === 0 && version.stdout.trim() === '50.37.0', 'Re-verify a changed provider CLI');
  let args = [r.action === 'rollback' ? 'rollback' : 'promote', r.deployment_id, '--timeout', '0'];
  if (r.action === 'promote') args.push('--yes');
  if (r.action === 'stage') {
    const project = JSON.parse(fs.readFileSync(path.join(p.workspace, '.vercel/project.json'), 'utf8'));
    a.need(project.projectId === p.project_id && project.orgId === p.team_id && bundle(path.join(p.workspace, '.vercel/output')) === r.bundle_sha256, 'Prebuilt output or linked target changed');
    args = ['deploy', '--prebuilt', '--prod', '--skip-domain', '--no-wait', '--yes', '--cwd', p.workspace,
      '--meta', 'forgeOperation=' + r.operation_id, '--meta', 'forgeCandidate=' + r.candidate,
      '--meta', 'forgeBundle=' + r.bundle_sha256, '--meta', 'forgeConfig=' + r.configuration_sha256,
      '--env', 'FORGE_CONFIGURATION_SHA256=' + r.configuration_sha256];
  }
  const result = cp.spawnSync(process.execPath, [executable, ...args, '--scope', p.team_id], { env, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 });
  // Do not retain CLI output: provider output may contain sensitive project configuration.
  a.need(result.status === 0, 'Provider command failed/timed out; reconcile this operation, never blindly resend');
}
async function observe(p, r, deployment) {
  const host = r.action === 'stage' ? deployment.url : p.production_host;
  a.need(typeof host === 'string' && /^[a-z0-9.-]+\.vercel\.app$/.test(host), 'Pilot observation requires the bound provider hostname');
  const headers = { 'x-forge-pilot-key': process.env.FORGE_PILOT_KEY || '' };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const get = async route => {
    const response = await fetch('https://' + host + route, { headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
    a.need(response.ok, 'Live journey is unavailable'); return response.json();
  };
  const identity = await get('/api/identity');
  a.need(identity.deployment_id === deployment.id && identity.candidate === r.candidate && identity.configuration_sha256 === r.configuration_sha256, 'Observed artifact/configuration mismatch');
  let healthy = false;
  try {
    const response = await fetch('https://' + host + '/api/journey', { method: 'POST', headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
    healthy = response.ok && (await response.json()).ok === true;
  } catch { /* Observed traffic with failed health is still a delivery event. */ }
  return { ...identity, journey: healthy ? 'pass' : 'fail', observed_at: new Date().toISOString() };
}
async function authorize(p, read = api, context = process.env) {
  const environment = await read('repos/' + p.repository + '/environments/' + encodeURIComponent(p.environment));
  a.need(environment.deployment_branch_policy?.protected_branches === true, 'Actual protected-branch environment restriction required');
  a.need(a.text(p.deployment_branch), 'Protected deployment branch required');
  const branch = await read('repos/' + p.repository + '/branches/' + encodeURIComponent(p.deployment_branch));
  a.need(branch.protected === true, 'An environment restriction without an actually protected branch is insufficient');
  const mode = p.approval?.mode ?? 'environment_reviewers';
  if (mode === 'environment_reviewers') {
    a.need(environment.protection_rules?.some(rule => rule.type === 'required_reviewers' && rule.reviewers?.length > 0), 'Actual environment reviewers required');
    return { mode };
  }
  a.need(mode === 'workflow_dispatch' && a.text(p.approval.actor), 'Explicit deployment approval mode and actor required');
  const runId = Number(context.GITHUB_RUN_ID), attempt = Number(context.GITHUB_RUN_ATTEMPT);
  a.need(Number.isSafeInteger(runId) && runId > 0 && Number.isSafeInteger(attempt) && attempt > 0 &&
    context.GITHUB_REPOSITORY === p.repository && context.FORGE_APPROVED_REQUEST_SHA256 === p.approved_request_sha256,
    'Manual dispatch must approve this exact repository and request');
  const run = await read('repos/' + p.repository + '/actions/runs/' + runId);
  a.need(run.id === runId && run.run_attempt === attempt && run.event === 'workflow_dispatch' && run.status === 'in_progress' &&
    run.repository?.full_name === p.repository && run.repository.private === true && run.actor?.login === p.approval.actor &&
    run.actor.type === 'User' && run.triggering_actor?.login === p.approval.actor && run.triggering_actor.type === 'User' &&
    run.path?.split('@')[0] === '.github/workflows/forge-pilot.yml' && run.head_branch === p.deployment_branch &&
    /^[a-f0-9]{40}$/.test(p.ci?.protected_ref) && run.head_sha === p.ci.protected_ref,
    'Owner dispatch workflow, attempt, branch or tooling identity mismatch');
  return { mode, actor: p.approval.actor, run_id: runId, attempt, request_sha256: p.approved_request_sha256 };
}
async function deliver(p, r, stateFile, io = {}) {
  const read = io.api || api, checkCI = io.ci || ci.verify, act = io.mutate || mutate, live = io.observe || observe;
  const config = io.configuration || (policy => configuration(policy, read));
  a.need(a.object(p) && a.object(r) && ['stage', 'promote', 'rollback'].includes(r.action) && id(r.operation_id) &&
    id(p.project_id) && id(p.team_id) && id(p.denied_project_id) && p.project_id !== p.denied_project_id &&
    /^[\w.-]+\/[\w.-]+$/.test(p.repository) && a.text(p.environment), 'Explicit isolated target/action required');
  a.need(a.sha(JSON.stringify(r)) === p.approved_request_sha256 && Date.parse(r.expires_at) > Date.now(), 'Exact request authorization missing or expired');
  a.need(/^[a-f0-9]{40}$/.test(r.candidate) && a.digest(r.bundle_sha256) && a.digest(r.configuration_sha256) &&
    (r.expected_current === null || id(r.expected_current)) && (r.action === 'stage' || id(r.deployment_id)), 'Pinned candidate/artifact/current target required');
  a.need(p.ci?.head === r.candidate, 'CI policy candidate mismatch');
  if (r.action === 'promote') {
    a.need(p.rollout?.target === target(p) && p.rollout.artifact === r.deployment_id && p.rollout.configuration_sha256 === r.configuration_sha256, 'Pinned rollout policy must bind this candidate and target');
    a.need(require('./operational.cjs').rollout(p.rollout, r.observation).decision === 'CONTINUE', 'Rollout observation is incomplete or unhealthy');
    const samples = r.observation.samples;
    const budget = require('./operational.cjs').budget(p.slo, { started_at: r.observation.started_at, ended_at: r.observation.ended_at,
      total: samples.length, good: samples.filter(s => s.ok).length, coverage: 1 });
    a.need(budget.action === 'CONTINUE', 'Error budget requires repair/observation before feature promotion');
  }
  if (r.action === 'rollback') a.need(p.recovery?.action === 'rollback' && a.digest(p.recovery.schema_sha256) && p.recovery.schema_sha256 === r.schema_sha256 &&
    p.ci.required_jobs?.includes('Recovery compatibility'), 'Rollback requires fresh protected old-app/current-schema compatibility evidence');
  const ciReceipt = await checkCI(p.ci); a.need(ciReceipt.head === r.candidate, 'Independent CI did not verify this candidate');
  const authorization = await authorize(p, read, io.context || process.env);
  let denied = false;
  try { await read('/v9/projects/' + p.denied_project_id + '?teamId=' + p.team_id); }
  catch (e) { denied = [403, 404].includes(e.status); }
  a.need(denied, 'Credential can access the prohibited target or denial could not be established');
  a.need(await config(p) === r.configuration_sha256, 'Configuration changed; rerun affected verification');
  const endpoint = '/v9/projects/' + p.project_id + '?teamId=' + p.team_id;
  const project = await read(endpoint);
  a.need(project.id === p.project_id && project.accountId === p.team_id && !project.link && project.autoAssignCustomDomains === false, 'Wrong target or competing automatic deployment path');
  const file = path.resolve(stateFile), lock = path.join(path.dirname(file), '.target-' + a.sha(target(p)) + '.lock');
  const lockFd = fs.openSync(lock, 'wx'); fs.closeSync(lockFd);
  try {
    let operation;
    const save = () => { const fd = fs.openSync(file, 'r+'); try { fs.ftruncateSync(fd); fs.writeFileSync(fd, JSON.stringify(operation, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } };
    if (fs.existsSync(file)) {
      a.need(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink(), 'Operation receipt must be a regular file');
      operation = JSON.parse(fs.readFileSync(file, 'utf8'));
      a.need(operation.request_sha256 === p.approved_request_sha256 && operation.target === target(p), 'Operation belongs to another request/target');
    } else {
      const fresh = await read(endpoint);
      if (r.action !== 'stage') {
        const d = await read('/v13/deployments/' + r.deployment_id + '?teamId=' + p.team_id);
        checkDeployment(p, r, d);
      }
      const reservation = await (io.journal || journal)(p, r, read);
      a.need(!reservation.created || (fresh.targets?.production?.id ?? null) === r.expected_current, 'Newer deployment superseded this request');
      operation = { version: 1, provider: 'vercel', service: p.service || p.project_id, environment: r.action === 'stage' ? 'staging' : 'production',
        source_commits: r.source_commits ?? null, operation_id: r.operation_id, journal_deployment_id: reservation.id, target: target(p), action: r.action, request_sha256: p.approved_request_sha256,
        candidate: r.candidate, bundle_sha256: r.bundle_sha256, configuration_sha256: r.configuration_sha256,
        state: 'REQUESTED', requested_at: new Date().toISOString(), ci: ciReceipt, authorization };
      fs.writeFileSync(file, JSON.stringify(operation, null, 2) + '\n', { flag: 'wx' });
      if (reservation.created) {
        try { await act(p, r); operation.state = 'ACCEPTED'; operation.accepted_at = new Date().toISOString(); save(); }
        catch { operation.state = 'UNCONFIRMED'; save(); throw Error('Provider result unconfirmed; retain this operation and reconcile before retry'); }
      }
    }
    let deployment;
    if (r.action === 'stage') {
      const listing = await read('/v6/deployments?projectId=' + p.project_id + '&teamId=' + p.team_id + '&limit=100');
      const matching = listing.deployments?.filter(d => d.meta?.forgeOperation === r.operation_id);
      a.need(matching?.length === 1, 'Staging operation unavailable/ambiguous; do not create another deployment');
      deployment = await read('/v13/deployments/' + matching[0].uid + '?teamId=' + p.team_id);
    } else deployment = await read('/v13/deployments/' + r.deployment_id + '?teamId=' + p.team_id);
    operation.provider_deployment_id = deployment.id; save(); checkDeployment(p, r, deployment);
    a.need(await config(p) === r.configuration_sha256, 'Configuration changed during operation');
    const now = await read(endpoint), expected = r.action === 'stage' ? r.expected_current : deployment.id;
    a.need((now.targets?.production?.id ?? null) === expected, 'Operation pending or superseded; no verified live claim');
    const observation = await live(p, r, deployment);
    a.need(observation.deployment_id === deployment.id && observation.candidate === r.candidate && observation.configuration_sha256 === r.configuration_sha256, 'Live identity failed');
    operation.observation = observation;
    if (r.action !== 'stage') operation.observed_live_at ||= new Date().toISOString();
    if (observation.journey !== 'pass') { operation.state = 'OBSERVED_UNHEALTHY'; save(); throw Error('Observed deployment journey failed'); }
    operation.state = r.action === 'stage' ? 'OBSERVED_STAGED' : 'OBSERVED_LIVE';
    operation.verified_live_at ||= new Date().toISOString(); save(); return operation;
  } finally { fs.unlinkSync(lock); }
}
function checkDeployment(p, r, d) {
  a.need((r.action === 'stage' || d.id === r.deployment_id) && d.projectId === p.project_id && d.target === 'production' && d.readyState === 'READY' &&
    d.meta?.forgeCandidate === r.candidate && d.meta?.forgeBundle === r.bundle_sha256 && d.meta?.forgeConfig === r.configuration_sha256,
    'Provider candidate is not the verified immutable production build');
}
async function journal(p, r, read) {
  const endpoint = 'repos/' + p.repository + '/deployments';
  const rows = await read(endpoint + '?sha=' + r.candidate + '&task=forge_delivery&per_page=100');
  a.need(Array.isArray(rows) && rows.length < 100, 'Complete native operation journal required');
  const found = rows.filter(v => v.payload?.operation_id === r.operation_id);
  a.need(found.length <= 1 && found.every(v => v.payload.request_sha256 === p.approved_request_sha256 && v.payload.target === target(p)), 'Operation ID is ambiguous or rebound');
  if (found.length) return { id: found[0].id, created: false };
  const saved = await read(endpoint, 'POST', { ref: r.candidate, task: 'forge_delivery', auto_merge: false, required_contexts: [], environment: p.environment,
    transient_environment: r.action === 'stage', production_environment: r.action !== 'stage',
    payload: { operation_id: r.operation_id, request_sha256: p.approved_request_sha256, target: target(p) } });
  a.need(Number.isSafeInteger(saved.id) && saved.id > 0, 'Native journal did not acknowledge reservation'); return { id: saved.id, created: true };
}
module.exports = { deliver, configuration, bundle, journal, authorize };
if (require.main === module) (async () => {
  const [action, policyFile, requestFile, stateFile] = process.argv.slice(2), raw = fs.readFileSync(policyFile), p = JSON.parse(raw);
  a.need(a.sha(raw) === process.env.FORGE_DELIVERY_POLICY_SHA256, 'Load the operator-approved policy digest outside candidate control');
  if (action === 'inspect') console.log(JSON.stringify({ target: target(p), configuration_sha256: await configuration(p) }));
  else { a.need(action === 'run', 'Use inspect|run'); console.log(JSON.stringify(await deliver(p, JSON.parse(fs.readFileSync(requestFile, 'utf8')), stateFile), null, 2)); }
})().catch(e => { console.error('Delivery blocked: ' + e.message); process.exitCode = 2; });
