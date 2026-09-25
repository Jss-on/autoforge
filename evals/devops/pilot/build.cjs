// Deterministic, credential-free Vercel Build Output API v3 packaging.
const fs = require('node:fs'), path = require('node:path'), a = require('../../../scripts/acceptance.cjs');
const [workspace, candidate] = process.argv.slice(2); a.need(workspace && /^[a-f0-9]{40}$/.test(candidate), 'build <isolated-workspace> <candidate-sha>');
const root = path.resolve(workspace), out = path.join(root, '.vercel/output'), func = path.join(out, 'functions/api.func');
a.need(!fs.existsSync(out), 'Build into a fresh workspace; do not replace an existing artifact');
fs.mkdirSync(func, { recursive: true }); fs.copyFileSync(path.join(__dirname, 'handler.cjs'), path.join(func, 'handler.cjs'));
fs.writeFileSync(path.join(func, 'identity.json'), JSON.stringify({ candidate }));
fs.writeFileSync(path.join(func, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs24.x', handler: 'handler.cjs', launcherType: 'Nodejs', maxDuration: 15, regions: ['sin1'] }));
fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify({ version: 3, routes: [{ src: '/api/(.*)', dest: '/api?route=$1' }] }));
console.log(JSON.stringify({ candidate, bundle_sha256: require('../../../scripts/vercel-delivery.cjs').bundle(out) }));
