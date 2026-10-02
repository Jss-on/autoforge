#!/usr/bin/env node
// Asset lifecycle gate. No tool calls, downloads, or writes: inspect the project's manifest.
// node asset-check.cjs check <project-root> [--previous previous-manifest.json]
// node asset-check.cjs select request.json (decision only; the agent supplies observed capabilities)
// stdout JSON; exit 0 valid, 1 unmet requirements, 2 unreadable input/usage.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(v);
const integer = v => Number.isSafeInteger(v) && v >= 0;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = v => text(v) && !/[\\:]/.test(v) && !path.posix.isAbsolute(v) && !v.split('/').some(p => p === '..' || p === '.' || p === '');
const inside = (base, file) => { const rel = path.relative(base, file); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
const key = v => process.platform === 'win32' ? v.toLowerCase() : v;
const kinds = ['image', 'svg', 'font', 'video', 'audio', 'model', 'data'];

function select(request) {
  const codeKinds = ['svg', 'icon', 'diagram', 'ui-motion'];
  if (!object(request) || ![...kinds, ...codeKinds].includes(request.kind) || typeof request.required !== 'boolean' ||
      !object(request.budget) || !(integer(request.budget.jobs) || request.budget.jobs === 'off') || !integer(request.budget.spent) ||
      !object(request.capabilities) || !Array.isArray(request.capabilities.mediaMcp) ||
      request.capabilities.mediaMcp.some(k => !kinds.includes(k)) ||
      ['nativeImage', 'apiImage'].some(k => k in request.capabilities && typeof request.capabilities[k] !== 'boolean') ||
      ('apiApproved' in request && typeof request.apiApproved !== 'boolean') ||
      ('requestedProvider' in request && !['auto', 'codex-native', 'media-mcp', 'openai-api'].includes(request.requestedProvider)))
    throw new Error('Invalid selection request: kind, required, budget and observed capabilities are required');
  const decision = (action, provider, reason) => ({ action, provider, reason });
  const unavailable = reason => decision(request.required ? 'blocked' : 'placeholder', 'none', reason);
  if (request.existing != null) {
    const old = request.existing;
    if (!object(old) || typeof old.approved !== 'boolean' || !relative(old.path) || !/^[a-f0-9]{64}$/.test(old.sha256 || ''))
      throw new Error('Existing candidate needs an approved flag, relative path, and checked hash');
    if (old.approved) return { ...decision('reuse', 'existing', 'Reuse the checked approved asset'), path: old.path, sha256: old.sha256 };
  }
  if (codeKinds.includes(request.kind)) return decision('code', 'code', 'Reuse native vectors or author UI motion in code');
  if (request.budget.jobs === 'off' || request.budget.spent >= request.budget.jobs) return unavailable('Generation is off or the attempt budget is exhausted');
  const available = {
    'codex-native': request.kind === 'image' && request.capabilities.nativeImage === true,
    'media-mcp': request.capabilities.mediaMcp.includes(request.kind),
    'openai-api': request.kind === 'image' && request.capabilities.apiImage === true && request.apiApproved === true
  };
  const requested = request.requestedProvider;
  if (requested && requested !== 'auto') return available[requested] ? decision('generate', requested, 'Explicit provider request') : unavailable('Requested provider is unavailable or not authorized');
  const provider = Object.keys(available).find(name => available[name]);
  return provider ? decision('generate', provider, 'Available provider within the authorized budget') : unavailable('No suitable authorized generation capability');
}

function check(projectRoot, previousFile) {
  const root = fs.realpathSync(projectRoot);
  const manifestFile = path.join(root, 'assets/manifest.json');
  if (!inside(root, fs.realpathSync(manifestFile))) throw new Error('Manifest escapes project root');
  const raw = fs.readFileSync(manifestFile);
  const manifest = JSON.parse(raw.toString('utf8'));
  const errors = [], files = [];
  const fail = (code, detail) => errors.push({ code, detail });
  const result = () => ({ valid: errors.length === 0, errors, root, manifest, manifestSha256: digest(raw), files, bytes: files.reduce((n, f) => n + f.bytes, 0) });
  if (!object(manifest) || manifest.version !== 1 || !Array.isArray(manifest.assets) ||
      !Array.isArray(manifest.assetRoots) || !manifest.assetRoots.length ||
      !Array.isArray(manifest.jobs) || !Array.isArray(manifest.motion)) {
    fail('manifest-schema', 'Expected version 1 and assetRoots/assets/jobs/motion arrays'); return result();
  }
  // Resolve links before reading contents, including prompt records outside the runtime roots.
  function local(rel, directory = false) {
    if (!relative(rel)) { fail('asset-path', 'Expected a project-relative POSIX path: ' + rel); return null; }
    try {
      const resolved = fs.realpathSync(path.join(root, rel));
      if (!inside(root, resolved)) { fail('asset-path', 'Path escapes project root: ' + rel); return null; }
      const stat = fs.statSync(resolved);
      if (directory ? !stat.isDirectory() : !stat.isFile() || stat.size === 0) {
        fail('asset-file', 'Expected ' + (directory ? 'directory' : 'nonempty regular file') + ': ' + rel); return null;
      }
      return resolved;
    } catch (error) { fail('asset-file', rel + ': ' + error.code); return null; }
  }
  const roots = manifest.assetRoots.filter(rel => local(rel, true));
  const jobIds = new Set();
  for (const job of manifest.jobs) {
    if (!object(job) || !text(job.id) || jobIds.has(job.id) || !['pending', 'complete', 'failed', 'cancelled'].includes(job.status)) {
      fail('job-schema', 'Each attempt needs a unique id and pending/complete/failed/cancelled status');
    } else jobIds.add(job.id);
  }
  const ids = new Set(), registered = new Set();
  for (const asset of manifest.assets) {
    if (!object(asset)) { fail('asset-schema', 'Asset must be an object'); continue; }
    if (!text(asset.id) || ids.has(asset.id)) fail('asset-id', 'Missing or duplicate id: ' + asset.id);
    ids.add(asset.id);
    if (!kinds.includes(asset.kind) || !['planned', 'generated', 'approved', 'rejected', 'blocked'].includes(asset.state) || typeof asset.required !== 'boolean')
      fail('asset-schema', 'Invalid kind, state or required flag: ' + asset.id);
    if (asset.required && asset.state !== 'approved') fail('asset-unapproved', 'Required asset is not approved: ' + asset.id);
    if (!Array.isArray(asset.usage) || !asset.usage.length || asset.usage.some(u => !object(u) || !text(u.route) || !text(u.selector)))
      fail('asset-usage', 'Declare route and selector uses: ' + asset.id);
    if (!asset.path && !asset.required && asset.state !== 'approved') {
      if (!text(asset.reason)) fail('asset-placeholder', 'An unfinished optional slot needs a reason: ' + asset.id);
      continue;
    }
    if (typeof asset.path === 'string') {
      if (registered.has(key(asset.path))) fail('asset-path', 'Duplicate file: ' + asset.path);
      registered.add(key(asset.path));
    }
    if (!roots.some(r => typeof asset.path === 'string' && key(asset.path).startsWith(key(r) + '/')))
      fail('asset-root', 'Asset is outside declared runtime roots: ' + asset.path);
    const file = local(asset.path);
    if (file) {
      const bytes = fs.readFileSync(file);
      const sha256 = digest(bytes);
      files.push({ path: asset.path, bytes: bytes.length, sha256 });
      if (!integer(asset.bytes) || asset.bytes !== bytes.length) fail('asset-bytes', 'Byte count differs: ' + asset.id);
      if (!/^[a-f0-9]{64}$/.test(asset.sha256 || '') || asset.sha256 !== sha256) fail('asset-hash', 'SHA-256 differs: ' + asset.id);
    }
    if (['image', 'svg'].includes(asset.kind)) {
      if (!integer(asset.width) || !asset.width || !integer(asset.height) || !asset.height) fail('asset-dimensions', 'Positive dimensions required: ' + asset.id);
      if (typeof asset.decorative !== 'boolean' || typeof asset.alt !== 'string' || (!asset.decorative && !text(asset.alt)) || (asset.decorative && asset.alt !== ''))
        fail('asset-alt', 'Supply informative alt text or decorative=true with empty alt: ' + asset.id);
      if ((asset.kind === 'svg') !== (typeof asset.path === 'string' && /\.svg$/i.test(asset.path))) fail('asset-kind', 'Raster and SVG kinds must match their paths: ' + asset.id);
    }
    if (!['eager', 'lazy'].includes(asset.loading)) fail('asset-loading', 'Declare eager or lazy loading: ' + asset.id);
    const source = asset.source;
    if (!object(source) || !['authored', 'sourced', 'generated'].includes(source.type)) fail('asset-source', 'Missing provenance: ' + asset.id);
    else if (source.type === 'generated') {
      if (asset.kind === 'svg') fail('asset-source', 'Raster generation cannot claim SVG output: ' + asset.id);
      if (!text(source.provider) || !text(source.receipt) || !jobIds.has(source.receipt) || !(source.model === null || text(source.model)))
        fail('asset-source', 'Generation needs provider, recorded receipt, and disclosed model or null: ' + asset.id);
      if (!text(source.prompt) || !local(source.prompt.split('#')[0])) fail('asset-prompt', 'Missing generation prompt: ' + asset.id);
    } else {
      if (!text(source.creator) || !text(source.license)) fail('asset-source', 'Creator and license required: ' + asset.id);
      if (source.type === 'sourced' && !/^https?:\/\/\S+$/i.test(source.url || '')) fail('asset-source', 'Source URL required: ' + asset.id);
    }
  }
  function inventory(rel, ancestors = new Set()) {
    const file = local(rel, true);
    if (!file) return;
    if (ancestors.has(file)) { fail('asset-path', 'Directory link cycle: ' + rel); return; }
    const next = new Set(ancestors).add(file);
    for (const entry of fs.readdirSync(file, { withFileTypes: true })) {
      const name = rel + '/' + entry.name;
      const target = path.join(root, name);
      let stat;
      try {
        if (!inside(root, fs.realpathSync(target))) { fail('asset-path', 'Link escapes root: ' + name); continue; }
        stat = fs.statSync(target);
      } catch { fail('asset-file', 'Unreadable asset: ' + name); continue; }
      if (stat.isDirectory()) inventory(name, next);
      else if (!registered.has(key(name))) fail('asset-unregistered', 'File missing from manifest: ' + name);
    }
  }
  for (const rel of roots) inventory(rel);
  const budget = manifest.budget;
  if (!object(budget) || !(budget.jobs === 'off' || integer(budget.jobs)) ||
      !integer(budget.maxFileBytes) || !integer(budget.maxTotalBytes)) {
    fail('asset-budget', 'Declare nonnegative integer job/file/total caps; jobs also accepts off');
  } else {
    const cap = budget.jobs === 'off' ? 0 : budget.jobs;
    if (manifest.jobs.length > cap) fail('asset-budget', `${manifest.jobs.length} attempts exceed job cap ${cap} (failures and retries count)`);
    for (const file of files) if (file.bytes > budget.maxFileBytes) fail('asset-budget', 'File exceeds byte cap: ' + file.path);
    if (files.reduce((sum, file) => sum + file.bytes, 0) > budget.maxTotalBytes) fail('asset-budget', 'Runtime assets exceed total byte cap');
  }
  if (manifest.jobs.some(j => j && j.status === 'pending')) fail('asset-jobs-pending', 'Generation attempts are still pending');
  for (const asset of manifest.assets) {
    if (asset?.state === 'approved' && asset.source?.type === 'generated' &&
        !manifest.jobs.some(j => j && j.id === asset.source.receipt && j.status === 'complete'))
      fail('asset-receipt', 'An approved generation needs a completed attempt: ' + asset.id);
  }
  const motionIds = new Set();
  for (const motion of manifest.motion) {
    if (!object(motion) || !text(motion.id) || motionIds.has(motion.id) || !text(motion.selector) ||
        !object(motion.trigger) || !['click', 'hover', 'focus', 'load'].includes(motion.trigger.type) ||
        (motion.trigger.type !== 'load' && !text(motion.trigger.selector)) ||
        !Array.isArray(motion.properties) || !motion.properties.length || motion.properties.some(p => !text(p)) ||
        !Number.isFinite(motion.maxDurationMs) || motion.maxDurationMs <= 0 || motion.maxDurationMs > 60000 ||
        typeof motion.essential !== 'boolean' || !['none', 'opacity', 'preserve'].includes(motion.reduced) ||
        (motion.reduced === 'preserve' && !motion.essential) || ('route' in motion && !text(motion.route))) {
      fail('motion-schema', 'Declare a unique motion id, selector, trigger, properties, duration <= 60000ms and reduced behavior');
    }
    if (object(motion)) motionIds.add(motion.id);
  }
  if (previousFile) {
    const previous = JSON.parse(fs.readFileSync(previousFile, 'utf8'));
    const priorIds = new Set();
    if (!object(previous) || previous.version !== 1 || !Array.isArray(previous.assets)) fail('asset-previous', 'Previous manifest must have version 1 and an assets array');
    else for (const prior of previous.assets) {
      if (!object(prior) || !text(prior.id) || priorIds.has(prior.id) || typeof prior.required !== 'boolean' ||
          !['planned', 'generated', 'approved', 'rejected', 'blocked'].includes(prior.state) ||
          (prior.state === 'approved' && (!relative(prior.path) || !/^[a-f0-9]{64}$/.test(prior.sha256 || '')))) {
        fail('asset-previous', 'Invalid or duplicate previous asset'); continue;
      }
      priorIds.add(prior.id);
      const current = manifest.assets.find(a => a && a.id === prior.id);
      if (prior.required && (!current || !current.required)) fail('asset-pin', 'Required slot removed or demoted: ' + prior.id);
      if (prior.state !== 'approved') continue;
      if (!current) { fail('asset-pin', 'Approved asset removed without a lifecycle record: ' + prior.id); continue; }
      if (current.sha256 !== prior.sha256 || current.path !== prior.path || current.state !== prior.state) {
        const replacement = current.replacement;
        if (!object(replacement) || replacement.previousSha256 !== prior.sha256 || !(text(replacement.defect) || text(replacement.request)))
          fail('asset-pin', 'Replacement needs the previous hash and a named defect or request: ' + prior.id);
      }
    }
  }
  return result();
}

if (require.main === module) {
  try {
    if (process.argv[2] === 'select' && process.argv.length === 4) console.log(JSON.stringify(select(JSON.parse(fs.readFileSync(process.argv[3], 'utf8')))));
    else {
      if (process.argv[2] !== 'check' || !(process.argv.length === 4 || (process.argv.length === 6 && process.argv[4] === '--previous')))
        throw new Error('Usage: asset-check.cjs select request.json | check <project-root> [--previous previous-manifest.json]');
      const report = check(process.argv[3], process.argv[5]);
      console.log(JSON.stringify(report));
      process.exitCode = report.valid ? 0 : 1;
    }
  } catch (error) { console.log(JSON.stringify({ valid: false, errors: [{ code: 'input', detail: error.message }] })); process.exitCode = 2; }
}
module.exports = { check, select };
