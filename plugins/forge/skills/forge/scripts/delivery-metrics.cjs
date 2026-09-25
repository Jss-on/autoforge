// Read-only reducer. Receipts are reporting input, never release authorization.
const fs = require('node:fs'), a = require('./acceptance.cjs');
const time = s => typeof s === 'string' && Number.isFinite(Date.parse(s)) ? Date.parse(s) : null;
const median = values => { const v = values.slice().sort((x, y) => x - y), n = v.length; return n ? (v[Math.floor((n - 1) / 2)] + v[Math.floor(n / 2)]) / 2 : null; };
function report(records, service, from, to) {
  const start = time(from), end = time(to);
  a.need(Array.isArray(records) && a.text(service) && start !== null && end > start, 'Records array, service and increasing explicit window required');
  const issues = new Set(), operations = new Map(), incidents = new Map();
  const add = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };
  for (const record of records) {
    a.need(a.object(record), 'Malformed delivery record');
    if (record.source === 'incident') {
      const i = record.incident; a.need(a.object(i), 'Malformed incident'); if (i.service !== service) continue;
      if (!a.text(i.id)) { issues.add('incident ID missing'); continue; }
      add(incidents, i.id, { id: i.id, impact_started_at: i.impact_started_at, restored_at: i.restored_at ?? null,
        causal_operation_id: i.causal_operation_id ?? null, remediation_operation_ids: i.remediation_operation_ids ?? [], unplanned: i.unplanned === true });
      continue;
    }
    const d = record.source === 'ship' ? record.ship?.delivery : record.source ? null : record;
    if (!a.object(d) || d.service !== service || d.environment !== 'production') continue;
    if (!a.text(d.provider) || !a.text(d.operation_id)) { issues.add('production operation identity missing'); continue; }
    add(operations, d.provider + '/' + d.operation_id, d);
  }
  // Operation IDs must also be unambiguous for incident links across providers.
  const delivered = [], ids = new Set(), ambiguous = new Set(); let unobserved = 0;
  for (const [key, group] of operations) {
    const observed = [];
    for (const d of group) {
      const at = time(d.observed_live_at);
      if (at === null) { if (String(d.state).startsWith('OBSERVED')) issues.add(key + ': observed timestamp missing'); continue; }
      if (!['OBSERVED_LIVE', 'OBSERVED_UNHEALTHY'].includes(d.state) || !a.text(d.target) || !a.text(d.provider_deployment_id) || !a.text(d.candidate) || !a.digest(d.configuration_sha256)) {
        issues.add(key + ': observed identity incomplete'); continue;
      }
      observed.push({ id: d.operation_id, provider: d.provider, at, target: d.target, deployment: d.provider_deployment_id,
        candidate: d.candidate, configuration: d.configuration_sha256, action: d.action, commits: d.source_commits ?? null });
    }
    if (!observed.length) { unobserved++; continue; }
    if (new Set(observed.map(v => JSON.stringify(v))).size !== 1) { issues.add(key + ': conflicting operation receipts'); continue; }
    const d = observed[0]; if (ids.has(d.id)) { ambiguous.add(d.id); issues.add(d.id + ': ambiguous causal identity'); } ids.add(d.id); delivered.push(d);
  }
  const history = delivered.filter(d => !ambiguous.has(d.id) && d.at < end), known = new Map(history.map(d => [d.id, d]));
  const cohort = history.filter(d => d.at >= start), cohortIds = new Set(cohort.map(d => d.id)), changes = new Map(), conflictingChanges = new Set();
  for (const d of history.slice().sort((x, y) => x.at - y.at)) {
    if (!Array.isArray(d.commits) || !d.commits.length) { issues.add(d.id + ': source commit mapping missing'); continue; }
    for (const c of d.commits) {
      const at = time(c?.committed_at), id = c?.original_id || c?.id;
      if (!a.text(id) || at === null || at > d.at || c.mapping_uncertain) { issues.add(d.id + ': uncertain commit identity/time'); continue; }
      if (changes.has(id) && changes.get(id).committed !== at) { conflictingChanges.add(id); issues.add(id + ': conflicting commit times'); }
      if (!changes.has(id)) changes.set(id, { committed: at, delivered: d.at });
    }
  }
  const leads = [...changes].filter(([id, c]) => !conflictingChanges.has(id) && c.delivered >= start).map(([, c]) => (c.delivered - c.committed) / 1000);
  const failures = new Set(), rework = new Set(), recovery = [], open = []; let unlinked = 0;
  for (const [id, values] of incidents) {
    if (new Set(values.map(v => JSON.stringify(v))).size !== 1) { issues.add(id + ': conflicting incident receipts'); continue; }
    const i = values[0], impact = time(i.impact_started_at), restored = time(i.restored_at);
    if (impact === null || (i.restored_at !== null && (restored === null || restored < impact)) || !Array.isArray(i.remediation_operation_ids)) { issues.add(id + ': invalid incident timeline/links'); continue; }
    if (impact >= end) continue;
    const cause = known.get(i.causal_operation_id);
    if (!cause || impact < cause.at) { unlinked++; continue; }
    if (cohortIds.has(cause.id)) failures.add(cause.id);
    if (impact >= start) {
      if (restored !== null && restored < end) recovery.push((restored - impact) / 1000);
      else open.push({ id, age_seconds: (end - impact) / 1000 });
    }
    if (i.unplanned) for (const operation of i.remediation_operation_ids) {
      const d = known.get(operation);
      if (d && d.at >= impact && cohortIds.has(d.id)) rework.add(d.id);
      else if (!d || d.at < impact) issues.add(id + ': remediation link unavailable/invalid');
    }
  }
  const count = cohort.length;
  return { service, window: { from, to, convention: '[from,to)' },
    deployment_frequency: { deployments: count, per_day: count ? count / ((end - start) / 86400000) : null, rollbacks: cohort.filter(d => d.action === 'rollback').length },
    change_lead_time: { median_seconds: median(leads), changes: leads.length },
    failed_deployment_recovery_time: { median_seconds: median(recovery), completed: recovery.length, censored: open.length, open },
    change_fail_rate: { rate: count ? failures.size / count : null, failed_deployments: failures.size, deployments: count },
    deployment_rework_rate: { rate: count ? rework.size / count : null, unplanned_remediations: rework.size, deployments: count },
    coverage: { partial: !count || issues.size > 0 || unobserved > 0 || unlinked > 0, unobserved_operations: unobserved, unlinked_incidents: unlinked,
      issues: [...issues].sort(), history: 'First observed delivery in supplied records; completeness and causality require operator review.' } };
}
module.exports = { report };
if (require.main === module) {
  try {
    const [service, from, to, ...files] = process.argv.slice(2); a.need(files.length > 0, 'Use service from to receipt.json [...]');
    const records = files.flatMap(file => { const data = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(data) ? data : [data]; });
    console.log(JSON.stringify(report(records, service, from, to), null, 2));
  } catch (e) { console.error('Delivery analysis invalid: ' + e.message); process.exitCode = 2; }
}
