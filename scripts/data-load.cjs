#!/usr/bin/env node
/**
 * data-load.cjs — an OPEN-model (arrival-rate) load generator for the data-intensive protocol's SLO
 * check, for when k6 is not installed. Requests start on a fixed schedule whether or not earlier
 * ones have finished (no virtual-user pool, no waiting for a response before the next arrival), so
 * a stalling server is measured instead of hidden (coordinated omission). Response time is measured
 * on the client side from the PLANNED arrival time (wrk2's correction), so generator lateness and
 * queueing count against the service and never hide its tail; one sample per line for
 * `data-score.cjs slo`. `{{i}}` in --body or --header values becomes the request's sequence number
 * (e.g. a fresh Idempotency-Key per request).
 *
 *   run <url> [--rate 50] [--duration 10s] [--method GET] [--body <json>] [--header "k: v"]…
 *       [--timeout 5000] [--out samples.tsv]
 *       → samples.tsv:  # load_model: open · # rate · # duration · # scheduled · # dropped · ms<TAB>status
 *       → stdout:       LOAD: open rate=50/s n=N dropped=D p50=… p95=… p99=… errors=…
 *
 * dropped = scheduled requests the generator could not start within LATE_MS of their planned time
 * (it fell behind, so the target arrival rate was not sustained — the analogue of k6's
 * dropped_iterations); data-score.cjs fails the SLO when dropped > 0. Several runs (reads, writes)
 * concatenate into one samples file: the seam sums their `# dropped:` lines.
 *   exit 0 ok · 2 usage/unreachable
 */
'use strict';
const fs = require('fs');
const LATE_MS = 1000; // ponytail: one fixed lateness budget; a generator this far behind is not producing the declared arrival rate

function parseArgs(argv) {
  const o = { _: [], rate: 50, duration: '10s', method: 'GET', body: '', headers: [], timeout: 5000, out: 'samples.tsv' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--rate') { o.rate = Number(v); i++; } else if (k === '--duration') { o.duration = v; i++; }
    else if (k === '--method') { o.method = String(v).toUpperCase(); i++; } else if (k === '--body') { o.body = v; i++; }
    else if (k === '--header') { o.headers.push(v); i++; } else if (k === '--timeout') { o.timeout = Number(v); i++; }
    else if (k === '--out') { o.out = v; i++; } else if (k === '-h' || k === '--help') { usage(); process.exit(0); }
    else if (k.startsWith('--')) throw new Error('unknown flag ' + k); else o._.push(k);
  }
  return o;
}
function usage() { console.error(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 18).map(l => l.replace(/^ \* ?/, '')).join('\n')); }
const durationMs = s => { const m = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(String(s).trim()); if (!m) throw new Error('--duration like 10s, 2m or 500ms'); return Number(m[1]) * ({ ms: 1, s: 1000, m: 60000 }[m[2] || 's']); };
const pct = (sorted, q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] : NaN;

async function run(o) {
  const [sub, url] = o._; if (sub !== 'run' || !url) { usage(); return 2; }
  if (!Number.isFinite(o.rate) || o.rate <= 0) throw new Error('--rate must be > 0');
  const total = Math.round(o.rate * durationMs(o.duration) / 1000), interval = 1000 / o.rate;
  const headers = Object.fromEntries(o.headers.map(h => { const i = h.indexOf(':'); return [h.slice(0, i).trim(), h.slice(i + 1).trim()]; }));
  if (o.body && !headers['content-type'] && !headers['Content-Type']) headers['content-type'] = 'application/json';
  const samples = []; let inflight = 0, dropped = 0, started = 0;
  const fire = (i, planned) => {
    inflight++; started++;
    if (performance.now() - planned > LATE_MS) dropped++;
    const body = o.body ? o.body.replace(/\{\{i\}\}/g, String(i)) : undefined;
    const h = { ...headers }; for (const k of Object.keys(h)) h[k] = h[k].replace(/\{\{i\}\}/g, String(i));
    fetch(url, { method: o.method, headers: h, body, signal: AbortSignal.timeout(o.timeout) })
      .then(r => r.arrayBuffer().then(() => r.status), () => 0)
      .then(status => { samples.push([performance.now() - planned, status, planned]); inflight--; });
  };
  const start = performance.now();
  await new Promise(resolve => {
    let i = 0;
    const tick = () => {
      const now = performance.now();
      while (i < total && start + i * interval <= now) { fire(i, start + i * interval); i++; }
      if (i >= total) return resolve();
      setTimeout(tick, Math.max(0, start + i * interval - performance.now()));
    };
    tick();
  });
  const deadline = Date.now() + o.timeout + 1000;
  while (inflight > 0 && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
  const ms = samples.map(s => s[0]).sort((a, b) => a - b), errors = samples.filter(s => s[1] === 0 || s[1] >= 400).length;
  const lines = [`# load_model: open`, `# generator: data-load.cjs`, `# rate: ${o.rate}/s`, `# duration: ${o.duration}`, `# url: ${o.method} ${url}`,
    `# scheduled: ${total}`, `# started: ${started}`, `# completed: ${samples.length}`, `# dropped: ${dropped}`, 'ms\tstatus',
    ...samples.sort((a, b) => a[2] - b[2]).map(s => `${s[0].toFixed(2)}\t${s[1]}`)];
  fs.writeFileSync(o.out, lines.join('\n') + '\n');
  const f = v => Number.isFinite(v) ? v.toFixed(2) : 'n/a';
  console.log(`LOAD: open rate=${o.rate}/s n=${samples.length} dropped=${dropped} p50=${f(pct(ms, 0.5))} p95=${f(pct(ms, 0.95))} p99=${f(pct(ms, 0.99))} errors=${samples.length ? (errors / samples.length).toFixed(4) : 'n/a'} out=${o.out}`);
  return samples.length ? 0 : 2;
}
module.exports = { durationMs, pct };
if (require.main === module) run(parseArgs(process.argv.slice(2))).then(c => process.exit(c)).catch(e => { console.error(e.message); process.exit(2); });
