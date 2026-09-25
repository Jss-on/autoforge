// The policy comes from the release operator/protected job, never candidate output.
const fs = require('node:fs'), cp = require('node:child_process'), a = require('./acceptance.cjs');
const oid = s => typeof s === 'string' && /^[a-f0-9]{40}$/.test(s);
const positive = n => Number.isSafeInteger(n) && n > 0;
function github(endpoint) {
  const r = cp.spawnSync('gh', ['api', '--hostname', 'github.com', endpoint], { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  a.need(r.status === 0, 'GitHub evidence unavailable; re-query before release');
  return JSON.parse(r.stdout);
}
function verify(p, query = github) {
  a.need(a.object(p) && /^[\w.-]+\/[\w.-]+$/.test(p.repository) && oid(p.head) && positive(p.run_id) && positive(p.attempt), 'Exact repository/head/run/attempt required');
  a.need(/^\.github\/workflows\/[\w.-]+\.ya?ml$/.test(p.workflow) && Array.isArray(p.required_jobs) && p.required_jobs.length && p.required_jobs.every(a.text), 'Exact workflow and required job names required');
  a.need(oid(p.protected_ref) && a.object(p.protected_files) && a.digest(p.protected_files[p.workflow]) && Object.keys(p.protected_files).length >= 2, 'Reviewed workflow and verifier identities required');
  a.need(positive(p.max_age_ms) && p.max_age_ms <= 7 * 86400000, 'Bound CI freshness to at most seven days');
  const base = 'repos/' + p.repository, runPath = base + '/actions/runs/' + p.run_id;
  const latest = query(runPath), run = query(runPath + '/attempts/' + p.attempt);
  for (const r of [latest, run]) a.need(r.id === p.run_id && r.run_attempt === p.attempt && r.repository?.full_name === p.repository && r.head_sha === p.head &&
    r.path?.split('@')[0] === p.workflow && r.status === 'completed' && r.conclusion === 'success' &&
    Number.isFinite(Date.parse(r.updated_at)) && Date.parse(r.updated_at) <= Date.now() + 5000 && Date.now() - Date.parse(r.updated_at) <= p.max_age_ms, 'CI identity, attempt, conclusion or freshness mismatch');
  const workflow = query(base + '/actions/workflows/' + run.workflow_id);
  a.need(workflow.id === run.workflow_id && latest.workflow_id === workflow.id && workflow.path === p.workflow && workflow.state === 'active', 'Workflow identity unavailable');
  const jobs = query(runPath + '/attempts/' + p.attempt + '/jobs?per_page=100');
  a.need(Array.isArray(jobs.jobs) && jobs.total_count === jobs.jobs.length, 'Incomplete CI job listing');
  for (const name of p.required_jobs) {
    const found = jobs.jobs.filter(j => j.name === name);
    a.need(found.length === 1 && found[0].run_id === p.run_id && found[0].head_sha === p.head && found[0].status === 'completed' && found[0].conclusion === 'success', 'Required CI job did not pass: ' + name);
  }
  for (const [file, hash] of Object.entries(p.protected_files)) {
    a.need(a.digest(hash) && a.text(file) && !file.split('/').some(v => !v || v === '.' || v === '..') && !/[\\:]/.test(file), 'Invalid protected verifier path/digest');
    for (const ref of new Set([p.protected_ref, p.head])) {
      const content = query(base + '/contents/' + file.split('/').map(encodeURIComponent).join('/') + '?ref=' + ref);
      a.need(content.encoding === 'base64' && typeof content.content === 'string' && a.sha(Buffer.from(content.content, 'base64')) === hash, 'Protected verifier changed: ' + file);
    }
  }
  let artifact = null;
  if (p.artifact !== undefined) {
    a.need(a.text(p.artifact.name) && /^sha256:[a-f0-9]{64}$/.test(p.artifact.digest), 'Expected artifact name/digest required');
    const listing = query(runPath + '/artifacts?per_page=100');
    a.need(Array.isArray(listing.artifacts) && listing.total_count === listing.artifacts.length, 'Incomplete artifact listing');
    const found = listing.artifacts.filter(v => v.name === p.artifact.name);
    a.need(found.length === 1, 'Unique candidate artifact required'); artifact = found[0];
    a.need(artifact.expired === false && artifact.digest === p.artifact.digest && artifact.workflow_run?.id === p.run_id && artifact.workflow_run?.head_sha === p.head && Date.parse(artifact.expires_at) > Date.now(), 'Candidate artifact is stale or mismatched');
  }
  // Re-fetch after the other queries: a rerun started during verification invalidates this decision.
  const end = query(runPath);
  a.need(end.run_attempt === p.attempt && end.status === 'completed' && end.conclusion === 'success' && end.head_sha === p.head, 'CI changed during verification');
  return { version: 1, repository: p.repository, head: p.head, run_id: p.run_id, attempt: p.attempt,
    workflow: p.workflow, jobs: jobs.jobs.filter(j => p.required_jobs.includes(j.name)).map(j => j.id),
    protected_ref: p.protected_ref, protected_files: p.protected_files, artifact, checked_at: new Date().toISOString() };
}
module.exports = { verify, github };
if (require.main === module) {
  try {
    const [file, head] = process.argv.slice(2), policy = JSON.parse(fs.readFileSync(file, 'utf8'));
    a.need(!head || policy.head === head, 'Policy does not authorize the current candidate');
    console.log(JSON.stringify(verify(policy), null, 2));
  } catch (e) { console.error('CI evidence blocked: ' + e.message); process.exitCode = 2; }
}
