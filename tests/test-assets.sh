#!/usr/bin/env bash
# Fixture-based lifecycle tests; no provider calls or downloads.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node - "$ROOT" <<'JS'
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { check, select } = require(path.join(process.argv[2], 'scripts/asset-check.cjs'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-assets-'));
let passed = 0, sequence = 0;
function fixture(change = () => {}) {
  const root = path.join(temp, String(++sequence));
  fs.mkdirSync(path.join(root, 'public/assets'), { recursive: true });
  fs.mkdirSync(path.join(root, 'assets'));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M0 0h16v16H0z"/></svg>';
  fs.writeFileSync(path.join(root, 'public/assets/icon.svg'), svg);
  const manifest = { version: 1, assetRoots: ['public/assets'], budget: { jobs: 12, maxFileBytes: 1000000, maxTotalBytes: 5000000 }, jobs: [], motion: [],
    assets: [{ id: 'icon', path: 'public/assets/icon.svg', kind: 'svg', state: 'approved', required: true,
      bytes: Buffer.byteLength(svg), sha256: crypto.createHash('sha256').update(svg).digest('hex'), width: 16, height: 16,
      source: { type: 'authored', creator: 'fixture', license: 'project-owned' }, usage: [{ route: '/', selector: '#icon' }], decorative: false, alt: 'Document', loading: 'eager' }] };
  change(manifest, root);
  fs.writeFileSync(path.join(root, 'assets/manifest.json'), JSON.stringify(manifest));
  return root;
}
function test(name, action) { action(); passed++; console.log('  PASS: ' + name); }
test('a native SVG asset is valid', () => assert.equal(check(fixture()).valid, true));
test('decorative assets allow empty alt', () => assert.equal(check(fixture(m => Object.assign(m.assets[0], { decorative: true, alt: '' }))).valid, true));
test('optional empty slots retain a reason', () => assert.equal(check(fixture(m => m.assets.push({ id: 'later', kind: 'image', state: 'blocked', required: false, reason: 'Not scoped yet', usage: [{ route: '/', selector: '#later' }] }))).valid, true));
const bad = [
  ['null inventory', m => { m.assets = null; }],
  ['duplicate identity', m => { m.assets.push({ ...m.assets[0] }); }],
  ['null record', m => { m.assets.push(null); }],
  ['wrong hash', m => { m.assets[0].sha256 = '0'.repeat(64); }],
  ['coerced bytes', m => { m.assets[0].bytes = String(m.assets[0].bytes); }],
  ['missing source', m => { delete m.assets[0].source; }],
  ['empty license', m => { m.assets[0].source.license = ''; }],
  ['unapproved required asset', m => { m.assets[0].state = 'generated'; }],
  ['invented kind', m => { m.assets[0].kind = 'magic'; }],
  ['missing alt', m => { m.assets[0].alt = ''; }],
  ['missing usage', m => { m.assets[0].usage = []; }],
  ['missing file', m => { m.assets[0].path = 'public/assets/missing.svg'; }],
  ['directory as evidence', m => { m.assets[0].path = 'public/assets'; }],
  ['empty file', (m, root) => { fs.writeFileSync(path.join(root, m.assets[0].path), ''); }],
  ['escape path', m => { m.assets[0].path = '../secret.svg'; }],
  ['absolute path', (m, root) => { m.assets[0].path = path.join(root, m.assets[0].path); }],
  ['unregistered file', (m, root) => { fs.writeFileSync(path.join(root, 'public/assets/extra.svg'), '<svg/>'); }],
  ['invalid motion', m => { m.motion = [null]; }],
  ['unknown generation receipt', m => { m.assets[0].source = { type: 'generated', provider: 'codex-native', receipt: 'unrecorded', model: null, prompt: 'assets/missing.md' }; }],
  ['link escape', (m, root) => { fs.symlinkSync(temp, path.join(root, 'public/assets/escape'), process.platform === 'win32' ? 'junction' : 'dir'); }]
];
for (const [name, change] of bad) test(name + ' fails', () => assert.equal(check(fixture(change)).valid, false));
test('off preserves existing assets', () => assert.equal(check(fixture(m => { m.budget.jobs = 'off'; })).valid, true));
for (const [name, change] of [
  ['missing budget', m => { delete m.budget; }],
  ['negative cap', m => { m.budget.jobs = -1; }],
  ['string cap', m => { m.budget.jobs = '12'; }],
  ['failed attempt exceeds cap', m => { m.budget.jobs = 0; m.jobs = [{ id: 'failed-1', status: 'failed' }]; }],
  ['off prohibits attempts', m => { m.budget.jobs = 'off'; m.jobs = [{ id: 'complete-1', status: 'complete' }]; }],
  ['file byte cap', m => { m.budget.maxFileBytes = 1; }],
  ['total byte cap', m => { m.budget.maxTotalBytes = 1; }],
  ['pending attempt', m => { m.jobs = [{ id: 'waiting-1', status: 'pending' }]; }]
]) test(name + ' fails', () => assert.equal(check(fixture(change)).valid, false));
const pinnedRoot = fixture(), manifestFile = path.join(pinnedRoot, 'assets/manifest.json');
const previous = path.join(pinnedRoot, 'assets/previous.json');
fs.copyFileSync(manifestFile, previous);
test('unchanged assets survive resume', () => assert.equal(check(pinnedRoot, previous).valid, true));
const changed = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const oldHash = changed.assets[0].sha256;
const assetFile = path.join(pinnedRoot, changed.assets[0].path);
fs.writeFileSync(assetFile, fs.readFileSync(assetFile, 'utf8').replace('h16v16', 'h15v16'));
changed.assets[0].sha256 = crypto.createHash('sha256').update(fs.readFileSync(assetFile)).digest('hex');
fs.writeFileSync(manifestFile, JSON.stringify(changed));
test('updated metadata cannot bypass a pinned hash', () => {
  assert.equal(check(pinnedRoot).valid, true);
  assert.equal(check(pinnedRoot, previous).valid, false);
});
changed.assets[0].replacement = { previousSha256: oldHash, request: 'User requested a narrower icon' };
fs.writeFileSync(manifestFile, JSON.stringify(changed));
test('a named replacement request permits the new hash', () => assert.equal(check(pinnedRoot, previous).valid, true));
changed.assets[0].required = false;
fs.writeFileSync(manifestFile, JSON.stringify(changed));
test('resume cannot demote a required slot', () => assert.equal(check(pinnedRoot, previous).valid, false));
fs.writeFileSync(previous, 'null');
test('malformed previous manifest fails closed', () => assert.equal(check(pinnedRoot, previous).valid, false));
const request = { kind: 'image', required: true, existing: null, budget: { jobs: 12, spent: 0 },
  capabilities: { nativeImage: true, mediaMcp: ['image'], apiImage: true }, apiApproved: false };
for (const [name, change, action, provider] of [
  ['native preferred over MCP', {}, 'generate', 'codex-native'],
  ['icons stay native', { kind: 'icon' }, 'code', 'code'],
  ['motion works with generation off', { kind: 'ui-motion', budget: { jobs: 'off', spent: 0 } }, 'code', 'code'],
  ['reuse works with generation off', { existing: { approved: true, path: 'public/assets/icon.svg', sha256: oldHash }, budget: { jobs: 'off', spent: 0 } }, 'reuse', 'existing'],
  ['MCP fallback', { capabilities: { nativeImage: false, mediaMcp: ['image'], apiImage: false } }, 'generate', 'media-mcp'],
  ['API key is not approval', { capabilities: { nativeImage: false, mediaMcp: [], apiImage: true } }, 'blocked', 'none'],
  ['explicit authorized API path', { requestedProvider: 'openai-api', apiApproved: true }, 'generate', 'openai-api'],
  ['explicit unauthorized API path', { requestedProvider: 'openai-api' }, 'blocked', 'none'],
  ['exhausted budget', { budget: { jobs: 1, spent: 1 } }, 'blocked', 'none'],
  ['optional fallback is named', { required: false, capabilities: { mediaMcp: [] } }, 'placeholder', 'none']
]) test(name, () => { const result = select({ ...request, ...change }); assert.equal(result.action, action); assert.equal(result.provider, provider); });
for (const [name, change] of [
  ['wrong kind', { kind: 'unknown' }], ['string approval', { apiApproved: 'true' }],
  ['string capability', { capabilities: { nativeImage: 'true', mediaMcp: [] } }],
  ['negative spent', { budget: { jobs: 12, spent: -1 } }],
  ['unverified reuse', { existing: { approved: true, path: '../escape.png', sha256: oldHash } }]
]) test(name + ' is rejected', () => assert.throws(() => select({ ...request, ...change })));
const { spawnSync } = require('node:child_process');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const score = (...args) => spawnSync(bash, [path.join(process.argv[2], 'scripts/score-design.sh'), ...args], { encoding: 'utf8', env: { ...process.env, AR_SCORE_LOG: '0' } });
const defects = path.join(temp, 'defects.tsv');
fs.writeFileSync(defects, 'id\tseverity\tcategory\tstatus\tevidence\tsummary\tfix_iteration\n');
const gateRoot = fixture();
test('standalone scorer exposes the asset gate', () => { const r = score('assets', gateRoot); assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).valid, true); });
test('legacy verdict remains valid without assets', () => assert.equal(score('verdict', defects).status, 0));
test('valid assets permit the verdict', () => assert.equal(score('verdict', defects, '', '', '', gateRoot).status, 0));
fs.writeFileSync(path.join(gateRoot, 'public/assets/icon.svg'), '<svg/>');
test('verdict rereads changed files instead of trusting old evidence', () => { const r = score('verdict', defects, '', '', '', gateRoot); assert.equal(r.status, 1); assert.match(r.stdout, /DESIGN_VERDICT: FIX/); });
console.log(`=== ${passed}/${passed} passed ===`);
JS
