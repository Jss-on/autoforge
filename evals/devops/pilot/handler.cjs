// Synthetic persisted journey; never use customer data in this pilot.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
async function neonQuery(query, params = []) {
  const connection = process.env.DATABASE_URL, db = new URL(connection);
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || !/^[\w.-]+\.neon\.tech$/.test(db.hostname)) throw Error('Invalid isolated database');
  // ponytail: only text parameters/results for this probe; use the official driver for broader SQL types/transactions.
  const host = db.hostname.replace(/^[^.]+\./, 'api.');
  const response = await fetch('https://' + host + '/sql', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': connection, 'Neon-Raw-Text-Output': 'true', 'Neon-Array-Mode': 'true' }, body: JSON.stringify({ query, params }) });
  if (!response.ok) throw Error('Database unavailable'); return (await response.json()).rows;
}
function createHandler({ query = neonQuery, secret = () => process.env.FORGE_PILOT_KEY, identity = () => ({ ...JSON.parse(fs.readFileSync(path.join(__dirname, 'identity.json'))), deployment_id: process.env.VERCEL_DEPLOYMENT_ID, configuration_sha256: process.env.FORGE_CONFIGURATION_SHA256 }),
  log = row => console.log(JSON.stringify(row)), injectFailure = () => process.env.FORGE_INJECT_FAILURE === '1' } = {}) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://pilot.invalid'), route = url.searchParams.get('route') || url.pathname.replace(/^\/api\//, ''), began = performance.now();
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (route === 'healthz') return send(200, { alive: true, pid: process.pid });
    const supplied = Buffer.from(req.headers['x-forge-pilot-key'] || ''), expected = Buffer.from(secret() || '');
    if (expected.length < 16 || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return send(401, { error: 'unauthorized' });
    try {
      if (route === 'identity') return send(200, identity());
      if (route === 'readyz') { await query('SELECT 1'); return send(200, { ready: true }); }
      if (route !== 'journey' || req.method !== 'POST') return send(404, { error: 'not-found' });
      const id = crypto.randomUUID();
      if (injectFailure()) throw Error('Safe injected failure');
      await query('INSERT INTO forge_notes(id,body) VALUES($1,$2)', [id, 'synthetic journey']);
      const rows = await query('SELECT id,body FROM forge_notes WHERE id=$1', [id]);
      if (rows?.[0]?.[0] !== id || rows[0][1] !== 'synthetic journey') throw Error('Persistence mismatch');
      log({ event: 'journey', id, ok: true, latency_ms: performance.now() - began }); return send(200, { ok: true, id });
    } catch {
      log({ event: route, ok: false, latency_ms: performance.now() - began }); return send(503, { ok: false, error: 'temporarily-unavailable' });
    }
  };
}
module.exports = createHandler(); module.exports.createHandler = createHandler;
