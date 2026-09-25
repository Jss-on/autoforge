// Read-only decisions over observations from the trusted collector/drill executor.
const fs = require('node:fs'), a = require('./acceptance.cjs');
const time = s => { const n = typeof s === 'string' ? Date.parse(s) : NaN; a.need(Number.isFinite(n), 'ISO observation time required'); return n; };
const positive = n => Number.isFinite(n) && n > 0;
function policy(p) {
  a.need(a.object(p) && p.version === 1 && a.text(p.target) && a.text(p.artifact) && a.digest(p.configuration_sha256) &&
    ['staged', 'all-at-once'].includes(p.strategy) && Number.isSafeInteger(p.min_samples) && p.min_samples > 0 && positive(p.observation_ms) &&
    Number.isFinite(p.max_error_rate) && p.max_error_rate >= 0 && p.max_error_rate < 1 && positive(p.max_p95_ms) &&
    Number.isFinite(p.max_exposure) && p.max_exposure >= 0 && p.max_exposure <= 1, 'Pin numeric rollout thresholds, strategy, target and identities');
  time(p.pinned_at);
  if (p.max_age_ms !== undefined) a.need(Number.isSafeInteger(p.max_age_ms) && p.max_age_ms > 0 && p.max_age_ms <= 86400000, 'Bound observation freshness to one day');
}
function rollout(p, v, now = Date.now()) {
  policy(p);
  a.need(a.object(v) && v.policy_sha256 === a.sha(JSON.stringify(p)) && v.target === p.target && v.artifact === p.artifact && v.configuration_sha256 === p.configuration_sha256, 'Observation does not match the pinned rollout');
  a.need(Number.isFinite(v.exposure) && v.exposure >= 0 && v.exposure <= p.max_exposure, 'Exposure exceeds the approved rollout');
  const start = time(v.started_at), end = time(v.ended_at);
  a.need(start >= time(p.pinned_at) && end >= start && end <= now + 5000 && Array.isArray(v.samples), 'Observation window is invalid');
  const hold = reason => ({ decision: 'HOLD', reason, samples: v.samples.length });
  if (end - start < p.observation_ms) return hold('observation interval incomplete');
  if (now - end > (p.max_age_ms ?? 300000)) return hold('observations expired');
  if (v.samples.length < p.min_samples) return hold('telemetry unavailable or too few samples');
  const ids = new Set();
  for (const s of v.samples) {
    a.need(a.text(s.id) && !ids.has(s.id) && typeof s.ok === 'boolean' && Number.isFinite(s.latency_ms) && s.latency_ms >= 0 && time(s.at) >= start && time(s.at) <= end, 'Malformed, duplicate or out-of-window journey observation');
    ids.add(s.id);
  }
  const failures = v.samples.filter(s => !s.ok).length, error_rate = failures / v.samples.length;
  const latencies = v.samples.map(s => s.latency_ms).sort((x, y) => x - y), p95_ms = latencies[Math.ceil(latencies.length * 0.95) - 1];
  return { decision: error_rate <= p.max_error_rate && p95_ms <= p.max_p95_ms ? 'CONTINUE' : 'HOLD', samples: v.samples.length, failures, error_rate, p95_ms, duration_ms: end - start };
}
function recovery(p, v) {
  policy(p); const r = p.recovery;
  a.need(a.object(r) && ['rollback', 'forward', 'maintenance'].includes(r.action) && positive(r.rto_seconds) && Number.isFinite(r.rpo_seconds) && r.rpo_seconds >= 0 && a.text(r.owner), 'Recovery limits, action and owner required');
  time(r.next_drill_at);
  a.need(a.object(v) && v.target === p.target && a.text(v.source) && a.text(v.destination) && v.source !== v.destination, 'Restore must use a separate authorized destination');
  const incident = time(v.incident_at), start = time(v.started_at), end = time(v.usable_at), point = time(v.latest_restored_commit_at);
  a.need(start >= incident && end >= start && point <= incident, 'Invalid recovery timeline');
  const rto_seconds = (end - incident) / 1000, rpo_seconds = (incident - point) / 1000, i = v.integrity;
  a.need(a.object(i) && Number.isSafeInteger(i.expected_count) && i.expected_count >= 0 && Number.isSafeInteger(i.actual_count) && i.actual_count >= 0 && a.digest(i.expected_sha256) && a.digest(i.actual_sha256), 'Measured row count and content digests required');
  const compatible = v.compatibility?.new_app_old_data === true && (r.action !== 'rollback' || v.compatibility?.old_app_new_schema === true);
  const restored = rto_seconds <= r.rto_seconds && rpo_seconds <= r.rpo_seconds && compatible && v.serving_artifact === p.artifact && i.actual_count === i.expected_count && i.actual_sha256 === i.expected_sha256;
  return { decision: restored ? 'RECOVERED' : 'BLOCKED', rto_seconds, rpo_seconds, compatible, owner: r.owner, next_drill_at: r.next_drill_at };
}
function budget(p, v) {
  a.need(a.object(p) && Number.isFinite(p.target) && p.target > 0 && p.target < 1 && positive(p.window_ms) &&
    [p.owner, p.telemetry, p.alert_sink, p.runbook].every(a.text), 'Numeric SLO/window, responder, telemetry, alert and runbook required');
  time(p.review_at);
  a.need(a.object(v) && Number.isSafeInteger(v.total) && v.total >= 0 && Number.isSafeInteger(v.good) && v.good >= 0 && v.good <= v.total &&
    Number.isFinite(v.coverage) && v.coverage >= 0 && v.coverage <= 1, 'Invalid journey counts/coverage');
  const duration = time(v.ended_at) - time(v.started_at); a.need(duration >= 0, 'Invalid SLI interval');
  if (v.total === 0 || v.coverage < 1) return { action: 'HOLD', sli: null, remaining: null, burn_rate: null, slo_proven: false, total: v.total, coverage: v.coverage };
  // Round display math only; the release decision uses the unrounded failure rate.
  const round = x => Number(x.toFixed(9)), failed = v.total - v.good, allowance = v.total * (1 - p.target);
  return { action: v.good / v.total <= p.target ? 'REPAIR_ONLY' : 'CONTINUE', sli: v.good / v.total,
    remaining: round(allowance - failed), burn_rate: round(failed / allowance), total: v.total, coverage: v.coverage,
    slo_proven: duration >= p.window_ms && v.good / v.total >= p.target, full_window: duration >= p.window_ms, review_at: p.review_at, owner: p.owner };
}
async function observe(p, base, secret = process.env.FORGE_PILOT_KEY) {
  policy(p); const url = new URL(base), local = ['127.0.0.1', '[::1]'].includes(url.hostname);
  a.need(url.origin === p.observation_origin && !url.username && !url.password && (url.protocol === 'https:' || (local && p.local_fixture === true)), 'Collector URL must match the approved observation origin');
  a.need(a.text(secret) && p.min_samples >= 2 && p.min_samples <= 1000 && p.observation_ms <= 3600000, 'Bound authenticated pilot collection');
  const headers = { 'x-forge-pilot-key': secret };
  if (!local && process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const request = (route, method = 'GET') => fetch(new URL(route, url), { method, headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) });
  const identityResponse = await request('/api/identity'); a.need(identityResponse.ok, 'Pilot identity unavailable'); const identity = await identityResponse.json();
  a.need(identity.deployment_id === p.artifact && identity.configuration_sha256 === p.configuration_sha256, 'Live collector identity mismatch');
  const began = Date.now(), samples = [], started_at = new Date(began).toISOString();
  for (let i = 0; i < p.min_samples; i++) {
    const wait = began + i * p.observation_ms / (p.min_samples - 1) - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, Math.ceil(wait)));
    const tick = performance.now(); let ok = false, status = null;
    try { const response = await request('/api/journey', 'POST'); status = response.status; ok = response.ok && (await response.json()).ok === true; } catch { /* transport failures count as failed attempts */ }
    samples.push({ id: require('node:crypto').randomUUID(), at: new Date().toISOString(), ok, status, latency_ms: performance.now() - tick });
  }
  const result = { policy_sha256: a.sha(JSON.stringify(p)), target: p.target, artifact: p.artifact, configuration_sha256: p.configuration_sha256,
    exposure: p.max_exposure, started_at, ended_at: new Date().toISOString(), samples };
  if (samples.some(s => !s.ok) && p.test_alert_url) {
    const sink = new URL(p.test_alert_url);
    a.need(sink.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(sink.hostname) && !sink.username && !sink.password, 'Only the authorized local test alert sink is supported');
    const response = await fetch(sink, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: p.target, artifact: p.artifact, failures: samples.filter(s => !s.ok).length }) });
    a.need(response.ok, 'Test alert delivery failed'); result.alert = await response.json(); a.need(a.text(result.alert.receipt), 'Alert sink acknowledgement missing');
  }
  return result;
}
module.exports = { rollout, recovery, budget, observe };
if (require.main === module) (async () => {
  const [action, policyFile, evidenceFile, output] = process.argv.slice(2), p = JSON.parse(fs.readFileSync(policyFile, 'utf8'));
  a.need(['rollout', 'recovery', 'budget', 'observe'].includes(action), 'rollout|recovery|budget <policy> <evidence>; observe <policy> <origin> <output>');
  const result = action === 'observe' ? await observe(p, evidenceFile) : module.exports[action](p, JSON.parse(fs.readFileSync(evidenceFile, 'utf8')));
  if (action === 'observe') { a.need(a.text(output), 'Output required'); fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); console.log('OBSERVATIONS: ' + result.samples.length); }
  else { console.log(JSON.stringify(result)); if (!['CONTINUE', 'RECOVERED'].includes(result.decision || result.action)) process.exitCode = 1; }
})().catch(e => { console.error('Operational gate blocked: ' + e.message); process.exitCode = 2; });
