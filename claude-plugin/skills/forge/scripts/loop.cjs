// Receipts for the classic loop: calibrate → decide → summary → check. Every TSV row, decision,
// revert and summary number is produced here from measured samples and git, never by hand.
'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const a = require('./acceptance.cjs'), v = require('./verification.cjs');

const TSV = 'forge-results.tsv', CONFIG = 'loop.json', RECEIPTS = 'receipts', VERSION = '3.4.0';
const HEADER = 'iteration\ttimestamp\tcommit\tmetric\tdelta\tguard\tguard-metric\tstatus\tdescription';
const KEPT = ['baseline', 'keep', 'keep (simpler)'], STATUSES = ['COMPLETE', 'BOUNDED', 'USER_INTERRUPT', 'BLOCKED', 'ERROR'];
const VERDICTS = ['IMPROVED', 'UNCHANGED', 'OVERFIT', 'DRIFT'];
const round = x => Number(x.toFixed(6)), short = s => String(s || '').slice(0, 7), now = () => new Date().toISOString();
const bash = () => process.env.FORGE_BASH || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash');
const after = r => r.reverted_head || r.head; // the commit the tree was left at once the receipt was decided
const better = (cfg, x, y) => cfg.direction === 'higher_is_better' ? x > y : x < y;
const incumbentOf = (cfg, receipts) => receipts.filter(r => KEPT.includes(r.decision)).reduce((best, r) => best === null || better(cfg, r.value, best) ? r.value : best, null);

function gitRaw(root, args) {
  return cp.spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GIT_EDITOR: 'true' } });
}
function git(root, args) {
  const r = gitRaw(root, args);
  a.need(!r.error && r.status === 0, 'git ' + args[0] + ' failed: ' + (r.stderr || r.error?.message || '').trim());
  return r.stdout;
}
// realpathSync.native expands Windows 8.3 names (C:\Users\RUNNER~1) the way git prints them.
const real = p => fs.realpathSync.native(p);
function projectRoot(run) {
  if (process.env.FORGE_PROJECT_ROOT) return real(process.env.FORGE_PROJECT_ROOT);
  for (const cwd of [run, process.cwd()]) {
    const r = cwd && gitRaw(cwd, ['rev-parse', '--show-toplevel']);
    if (r && !r.error && r.status === 0) return real(r.stdout.trim());
  }
  throw Error('Not inside a git repository (set FORGE_PROJECT_ROOT)');
}
function screen(cmd) {
  const r = cp.spawnSync(bash(), [path.join(__dirname, 'orchestrate.sh'), 'screen-cmd', cmd], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  a.need(r.status === 0 && r.stdout.trim() === 'ok', 'Command failed the safety screen: ' + cmd);
}
function parse(stdout) {
  const line = stdout.split('\n').map(l => l.trim()).filter(Boolean).pop() || '';
  const n = Number(line.replace(/%$/, ''));
  return line && Number.isFinite(n) ? n : null;
}
function median(values) {
  const sorted = [...values].sort((x, y) => x - y), mid = sorted.length >> 1;
  return round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}
async function measure(cfg, root, cmd, samples) {
  const out = { command: cmd, samples: [], value: null, spread: null, status: 'ok' };
  for (let i = 0; i < samples; i++) {
    const began = performance.now();
    const r = await v.run([bash(), '-c', cmd], { cwd: root, env: process.env, timeout_ms: cfg.timeout_ms, output_limit: cfg.output_limit });
    const s = { exit_code: r.exit_code, signal: r.signal, error: r.error, elapsed_ms: round(performance.now() - began),
      stdout_sha256: a.sha(r.stdout), stderr_sha256: a.sha(r.stderr), value: null,
      stdout_tail: v.redact(r.stdout.split('\n').slice(-20).join('\n').slice(-2000), []), stderr_tail: v.redact(r.stderr.slice(-2000), []) };
    out.samples.push(s);
    if (r.error !== null || r.signal !== null || r.exit_code !== 0) { out.status = 'crash'; return out; }
    s.value = parse(r.stdout);
    if (s.value === null) { out.status = 'metric-error'; return out; }
  }
  const values = out.samples.map(s => s.value);
  out.value = median(values); out.spread = round(Math.max(...values) - Math.min(...values));
  return out;
}
async function guard(cfg, root) {
  const m = await measure(cfg, root, cfg.guard, 1), s = m.samples[0];
  return { command: cfg.guard, status: m.status === 'crash' ? 'fail' : 'pass', exit_code: s.exit_code, error: s.error, stdout_sha256: s.stdout_sha256, stdout_tail: s.stdout_tail, value: s.value };
}
// The decision rule, shared by decide (to act) and check (to re-derive). guardStatus is 'pass'
// when no guard ran; a candidate with a configured guard must carry the guard's real result.
function rule(cfg, incumbent, verify, loc, guardStatus) {
  if (verify.status !== 'ok') return { value: null, delta: null, decision: verify.status };
  const value = verify.value, delta = round(value - incumbent), signed = cfg.direction === 'higher_is_better' ? delta : -delta;
  const improved = signed > 0 && signed >= cfg.min_delta, simpler = !improved && Math.abs(signed) <= cfg.min_delta && loc.removed > loc.added;
  if (!improved && !simpler) return { value, delta, decision: 'discard' };
  if (guardStatus !== 'pass') return { value, delta, decision: 'guard-fail' };
  return { value, delta, decision: improved ? 'keep' : 'keep (simpler)' };
}
const fmtDelta = d => d === 0 ? '0.0' : (d > 0 ? '+' : '') + String(round(d));
function row(r) {
  return [r.iteration, r.ended_at, KEPT.includes(r.decision) ? short(r.head) : '-', r.value === null ? '-' : String(r.value),
    r.delta === null ? '-' : fmtDelta(r.delta), r.guard ? r.guard.status : '-', r.guard && r.guard.value !== null ? String(r.guard.value) : '-',
    r.decision, String(r.description || '').replace(/[\t\r\n]+/g, ' ').trim()].join('\t');
}
function loadRun(runDir) {
  const run = real(path.resolve(runDir)), file = path.join(run, CONFIG);
  a.need(fs.existsSync(file), 'No ' + CONFIG + ' in ' + run + ' (run calibrate first)');
  const bytes = fs.readFileSync(file), cfg = JSON.parse(bytes.toString('utf8'));
  const cmd = c => c === null || a.text(c), int = (n, max) => Number.isSafeInteger(n) && n > 0 && n <= max;
  a.need(a.object(cfg) && cfg.version === 1 && a.text(cfg.verify) && cmd(cfg.guard) && cmd(cfg.holdout) &&
    ['higher_is_better', 'lower_is_better'].includes(cfg.direction) && Array.isArray(cfg.scope) && cfg.scope.every(a.text) &&
    int(cfg.samples, 99) && int(cfg.samples_per_iteration, 99) && Number.isFinite(cfg.min_delta) && cfg.min_delta >= 0 &&
    int(cfg.timeout_ms, 86400000) && int(cfg.output_limit, 32 * 1024 * 1024) && a.object(cfg.baseline) && /^[0-9a-f]{40,64}$/.test(cfg.baseline.commit || ''), 'Malformed ' + CONFIG);
  for (const c of [cfg.verify, cfg.guard, cfg.holdout]) if (c) screen(c); // persisted commands are never trusted
  const dir = path.join(run, RECEIPTS);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^\d{3}\.json$/.test(f)).sort() : [];
  const receipts = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  return { run, cfg, sha: a.sha(bytes), receipts, root: projectRoot(run), tsv: path.join(run, TSV) };
}
function write(run, r) {
  r.row = row(r);
  fs.mkdirSync(path.join(run, RECEIPTS), { recursive: true });
  fs.writeFileSync(path.join(run, RECEIPTS, String(r.iteration).padStart(3, '0') + '.json'), JSON.stringify(r, null, 2) + '\n', { flag: 'wx' });
  fs.appendFileSync(path.join(run, TSV), r.row + '\n');
  return r;
}
function cleanTree(root) {
  const dirty = git(root, ['status', '--porcelain']).trim();
  a.need(dirty === '', 'Untracked or modified files present; commit, ignore or remove them first:\n' + dirty);
}
function scopeOf(text) { return String(text || '').split(/[,\s]+/).map(g => g.replace(/\\/g, '/').replace(/^\.\//, '')).filter(Boolean); }
function runRel(root, run) { const rel = path.relative(root, run).split(path.sep).join('/'); return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : null; }
// What the experiment range touched, straight from git (decide records it, check re-derives it).
function changes(root, cfg, run, base, head) {
  const c = { commits: git(root, ['rev-list', '--reverse', base + '..' + head]).split('\n').filter(Boolean),
    changed_files: git(root, ['diff', '--name-only', '--no-renames', base, head]).split('\n').filter(Boolean), out_of_scope: [], loc: { added: 0, removed: 0 } };
  for (const line of git(root, ['diff', '--numstat', '--no-renames', base, head]).split('\n').filter(Boolean)) {
    const [added, removed] = line.split('\t');
    c.loc.added += Number(added) || 0; c.loc.removed += Number(removed) || 0;
  }
  const rel = runRel(root, run);
  if (cfg.scope.length) {
    const excludes = cfg.scope.map(g => ':(exclude,glob)' + g);
    if (rel) excludes.push(':(exclude,glob)' + rel + '/**');
    c.out_of_scope = git(root, ['diff', '--name-only', '--no-renames', base, head, '--', '.', ...excludes]).split('\n').filter(Boolean);
  }
  c.ledger_inside = rel !== null && c.changed_files.some(f => f.startsWith(rel + '/'));
  return c;
}

async function calibrate(o) {
  const stamp = new Date(), two = n => String(n).padStart(2, '0');
  let run = path.resolve(o._[0] || path.join('forge', 'loop-' + String(stamp.getFullYear()).slice(2) + two(stamp.getMonth() + 1) + two(stamp.getDate()) + '-' + two(stamp.getHours()) + two(stamp.getMinutes())));
  const root = projectRoot(fs.existsSync(run) ? run : path.dirname(run));
  a.need(!fs.existsSync(path.join(run, CONFIG)), 'Run already calibrated: ' + run);
  a.need(a.text(o.verify), '--verify <command> required');
  const direction = /^lower/.test(o.direction || '') ? 'lower_is_better' : 'higher_is_better';
  const samples = o.samples === undefined ? 3 : Number(o.samples), explicit = o['min-delta'] !== undefined ? Number(o['min-delta']) : null;
  const timeout = o['timeout-ms'] === undefined ? 600000 : Number(o['timeout-ms']);
  a.need(Number.isSafeInteger(samples) && samples > 0 && samples <= 99 && (explicit === null || (Number.isFinite(explicit) && explicit >= 0)), 'Samples must be 1-99 and MinDelta >= 0');
  a.need(Number.isSafeInteger(timeout) && timeout > 0 && timeout <= 86400000, '--timeout-ms must be 1..86400000');
  const cfg = { version: 1, goal: o.goal || '', metric: o.metric || '', direction, scope: scopeOf(o.scope), verify: o.verify, guard: o.guard || null, holdout: o.holdout || null,
    samples, samples_per_iteration: samples, min_delta: 0, timeout_ms: timeout, output_limit: 4 * 1024 * 1024, created_at: now(), baseline: {} };
  for (const c of [cfg.verify, cfg.guard, cfg.holdout]) if (c) screen(c);
  cleanTree(root);
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const m = await measure(cfg, root, cfg.verify, samples);
  a.need(m.status === 'ok', 'Verify must exit 0 and print a finite number on its last line (got ' + m.status + ')');
  const g = cfg.guard ? await guard(cfg, root) : null;
  a.need(!g || g.status === 'pass', 'Guard fails on the untouched baseline');
  const h = cfg.holdout ? await measure(cfg, root, cfg.holdout, samples) : null;
  a.need(!h || h.status === 'ok', 'Holdout must exit 0 and print a finite number on its last line');
  cfg.min_delta = explicit === null ? round(2 * m.spread) : explicit;
  cfg.samples_per_iteration = m.spread > 0 || cfg.min_delta > 0 ? samples : 1;
  cfg.baseline = { commit: head, value: m.value, spread: m.spread, holdout: h ? { value: h.value, spread: h.spread } : null };
  fs.mkdirSync(run, { recursive: true });
  run = real(run);
  fs.writeFileSync(path.join(run, '.gitignore'), '*\n'); // the ledger never rides along in an experiment commit
  const bytes = JSON.stringify(cfg, null, 2) + '\n';
  fs.writeFileSync(path.join(run, CONFIG), bytes, { flag: 'wx' });
  fs.writeFileSync(path.join(run, TSV), '# metric_direction: ' + direction + '\n' + HEADER + '\n', { flag: 'wx' });
  const r = write(run, { version: 1, iteration: 0, config_sha256: a.sha(bytes), decision: 'baseline', description: 'initial state', base: head, head, commits: [], reverted_head: null,
    changed_files: [], out_of_scope: [], loc: { added: 0, removed: 0 }, verify: m, guard: g, holdout: h, value: m.value, delta: 0, started_at: cfg.created_at, ended_at: now() });
  return { run, cfg, receipt: r, text: `CALIBRATED ${run}\nbaseline=${m.value} samples=[${m.samples.map(s => s.value).join(', ')}] spread=${m.spread} min_delta=${cfg.min_delta} samples_per_iteration=${cfg.samples_per_iteration} guard=${g ? g.status : '-'} holdout=${h ? h.value : '-'}` };
}
async function decide(runDir, description) {
  const { run, cfg, sha, receipts, root } = loadRun(runDir);
  a.need(receipts.length > 0 && receipts.every((r, i) => r.iteration === i), 'Receipts are not contiguous');
  const prev = receipts[receipts.length - 1], base = after(prev), started = now(), incumbent = incumbentOf(cfg, receipts);
  cleanTree(root);
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const r = { version: 1, iteration: receipts.length, config_sha256: sha, decision: 'no-op', description, base, head, commits: [], reverted_head: null,
    changed_files: [], out_of_scope: [], loc: { added: 0, removed: 0 }, verify: null, guard: null, value: null, delta: null, started_at: started, ended_at: null };
  if (head !== base) {
    a.need(gitRaw(root, ['merge-base', '--is-ancestor', base, head]).status === 0, 'HEAD does not descend from the last recorded result ' + short(base));
    const c = changes(root, cfg, run, base, head);
    a.need(!c.ledger_inside, 'The run directory is inside the experiment commit; remove it (git rm -r --cached ' + runRel(root, run) + ' && git commit --amend --no-edit) and keep it untracked');
    Object.assign(r, { commits: c.commits, changed_files: c.changed_files, out_of_scope: c.out_of_scope, loc: c.loc });
    if (r.out_of_scope.length) r.decision = 'out-of-scope';
    else {
      r.verify = await measure(cfg, root, cfg.verify, cfg.samples_per_iteration);
      let d = rule(cfg, incumbent, r.verify, r.loc, 'pass');
      if (cfg.guard && KEPT.includes(d.decision)) { r.guard = await guard(cfg, root); d = rule(cfg, incumbent, r.verify, r.loc, r.guard.status); }
      Object.assign(r, d);
    }
    if (!KEPT.includes(r.decision)) {
      const rv = gitRaw(root, ['revert', '--no-edit', base + '..' + head]);
      if (rv.status !== 0) {
        gitRaw(root, ['revert', '--abort']);
        throw Error(`${r.decision} measured but git revert failed, nothing recorded; squash the experiment into plain non-merge, non-empty commits and run decide again:\n${(rv.stderr || rv.stdout || '').trim()}`);
      }
      r.reverted_head = git(root, ['rev-parse', 'HEAD']).trim();
    }
  }
  r.ended_at = now();
  write(run, r);
  const why = r.decision === 'out-of-scope' ? '\nout of scope: ' + r.out_of_scope.join(', ') : r.decision === 'no-op' ? '\nHEAD unchanged since ' + short(base) + ': commit the experiment first' : '';
  return { ...r, text: `DECISION: ${r.decision} iteration=${r.iteration} metric=${r.value === null ? '-' : r.value} delta=${r.delta === null ? '-' : fmtDelta(r.delta)} min_delta=${cfg.min_delta} guard=${r.guard ? r.guard.status : '-'} head=${short(head)}${r.reverted_head ? ' reverted_to=' + short(r.reverted_head) : ''}${why}` };
}
function digest(run, receipts) { return a.sha(receipts.map(r => a.sha(fs.readFileSync(path.join(run, RECEIPTS, String(r.iteration).padStart(3, '0') + '.json')))).join('\n')); }
function block(run, cfg, receipts, holdout, fresh) {
  const count = d => receipts.filter(r => r.decision === d).length, kept = receipts.filter(r => r.iteration > 0 && KEPT.includes(r.decision));
  const start = cfg.baseline.value, final = [...receipts].reverse().find(r => KEPT.includes(r.decision)).value;
  const signed = cfg.direction === 'higher_is_better' ? final - start : start - final, improved = signed > 0 && signed >= cfg.min_delta;
  const h = holdout ? { start: cfg.baseline.holdout.value, final: holdout.value, spread: cfg.baseline.holdout.spread,
    moved: (cfg.direction === 'higher_is_better' ? holdout.value - cfg.baseline.holdout.value : cfg.baseline.holdout.value - holdout.value) > cfg.baseline.holdout.spread } : null;
  const drift = Math.abs(fresh.value - final) > Math.max(cfg.baseline.spread, cfg.min_delta);
  return { receipts: RECEIPTS, receipts_sha256: digest(run, receipts), iterations: receipts.length - 1, kept: kept.length, discarded: count('discard'), crashed: count('crash'),
    metric_errors: count('metric-error'), out_of_scope: count('out-of-scope'), guard_failed: count('guard-fail'), no_ops: count('no-op'), direction: cfg.direction, min_delta: cfg.min_delta,
    start, final, final_remeasured: fresh.value, improvement_pct: start === 0 ? null : round(signed / Math.abs(start) * 100), holdout: h,
    verdict: drift ? 'DRIFT' : improved ? (h && !h.moved ? 'OVERFIT' : 'IMPROVED') : 'UNCHANGED' };
}
async function summary(runDir, o) {
  const { run, cfg, receipts, root } = loadRun(runDir), status = o.status || 'COMPLETE';
  a.need(STATUSES.includes(status), '--status must be one of ' + STATUSES.join('|'));
  a.need(receipts.length > 0 && git(root, ['rev-parse', 'HEAD']).trim() === after(receipts[receipts.length - 1]), 'HEAD is not the ledger end; the summary measures the recorded result only');
  const fresh = await measure(cfg, root, cfg.verify, cfg.samples_per_iteration);
  a.need(fresh.status === 'ok', 'Verify no longer exits 0 with a finite number at the ledger end (got ' + fresh.status + ')');
  const holdout = cfg.holdout ? await measure(cfg, root, cfg.holdout, cfg.samples) : null;
  a.need(!holdout || holdout.status === 'ok', 'Holdout must exit 0 and print a finite number on its last line');
  const loop = block(run, cfg, receipts, holdout, fresh);
  const top = receipts.filter(r => r.iteration > 0 && KEPT.includes(r.decision)).map(r => ({ iteration: r.iteration, head: r.head, delta: r.delta, description: r.description }))
    .sort((x, y) => (cfg.direction === 'higher_is_better' ? y.delta - x.delta : x.delta - y.delta)).slice(0, 3);
  const s = { version: 1, computed_at: now(), status, loop, top, final_measurement: fresh, holdout_measurement: holdout };
  fs.writeFileSync(path.join(run, 'summary.json'), JSON.stringify(s, null, 2) + '\n');
  const handoff = { version: VERSION, source: 'loop', timestamp: s.computed_at, status, results_tsv: TSV, metric: { name: cfg.metric || 'metric', value: loop.final },
    findings: top.map(t => `#${t.iteration} ${fmtDelta(t.delta)} ${t.description}`),
    config: { goal: cfg.goal, scope: cfg.scope.join(', '), metric: cfg.metric, direction: cfg.direction, verify: cfg.verify, guard: cfg.guard, holdout: cfg.holdout, samples: cfg.samples, min_delta: cfg.min_delta }, loop };
  fs.writeFileSync(path.join(run, 'handoff.json'), JSON.stringify(handoff, null, 2) + '\n');
  const checked = check(run, path.join(run, 'handoff.json'));
  const text = [`LOOP SUMMARY ${run}`, `iterations=${loop.iterations} kept=${loop.kept} discarded=${loop.discarded} crash=${loop.crashed} metric-error=${loop.metric_errors} out-of-scope=${loop.out_of_scope} guard-fail=${loop.guard_failed} no-op=${loop.no_ops}`,
    `metric: ${loop.start} -> ${loop.final} (${loop.improvement_pct === null ? 'n/a' : fmtDelta(loop.improvement_pct) + '%'}) min_delta=${loop.min_delta} ${cfg.direction}; re-measured now: ${fresh.value}`,
    loop.holdout ? `holdout: ${loop.holdout.start} -> ${loop.holdout.final} (${loop.holdout.moved ? 'moved' : 'flat'}, spread ${loop.holdout.spread})` : 'holdout: none',
    `verdict: ${loop.verdict}`, ...top.map(t => `top: #${t.iteration} ${fmtDelta(t.delta)} ${t.description} (${short(t.head)})`), checked.text].join('\n');
  return { ...s, problems: checked.problems, text };
}
function check(runDir, handoffPath) {
  const { run, cfg, sha, receipts, root, tsv } = loadRun(runDir), problems = [], p = (ok, msg) => { if (!ok) problems.push(msg); };
  const exists = s => a.text(s) && gitRaw(root, ['cat-file', '-e', s + '^{commit}']).status === 0, tree = s => gitRaw(root, ['rev-parse', s + '^{tree}']).stdout.trim();
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  p(receipts.length > 0 && receipts[0].decision === 'baseline' && receipts[0].head === cfg.baseline.commit && receipts[0].base === cfg.baseline.commit, 'receipt 000 must be the calibrated baseline');
  const lines = fs.existsSync(tsv) ? fs.readFileSync(tsv, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean) : [];
  p(lines[0] === '# metric_direction: ' + cfg.direction && lines[1] === HEADER, TSV + ': header');
  p(lines.length - 2 === receipts.length && receipts.every((r, i) => lines[i + 2] === r.row), TSV + ': rows differ from receipts');
  receipts.forEach((r, i) => {
    const tag = `receipt ${i}: `;
    p(r.version === 1 && r.iteration === i, tag + 'numbering');
    p(r.config_sha256 === sha, tag + CONFIG + ' changed after it was written');
    p(r.row === row(r), tag + 'row does not match its fields');
    p(exists(r.head) && exists(r.base), tag + 'head or base commit missing');
    if (i > 0) p(r.base === after(receipts[i - 1]), tag + 'base differs from the previous result');
    const n = i === 0 ? cfg.samples : cfg.samples_per_iteration, m = r.verify;
    if (m !== null) {
      const ok = m.status === 'ok', last = m.samples[m.samples.length - 1];
      p(a.object(m) && Array.isArray(m.samples) && m.samples.length > 0 && m.samples.length <= n && (!ok || m.samples.length === n), tag + 'sample count');
      p(m.samples.every(s => a.object(s) && a.digest(s.stdout_sha256) && (s.exit_code === 0 && s.error === null && s.signal === null ? true : s.value === null)), tag + 'sample shape');
      p(ok ? m.samples.every(s => s.exit_code === 0 && Number.isFinite(s.value)) && m.value === median(m.samples.map(s => s.value)) :
        m.status === 'crash' ? last && (last.exit_code !== 0 || last.error !== null || last.signal !== null) : m.status === 'metric-error' && last && last.exit_code === 0 && last.value === null, tag + 'verify status does not follow from its samples');
    }
    if (i === 0) { p(m !== null && m.status === 'ok' && r.value === m.value && r.value === cfg.baseline.value && r.delta === 0 && r.commits.length === 0 && r.reverted_head === null, tag + 'baseline fields'); return; }
    if (r.decision === 'no-op') { p(r.head === r.base && r.commits.length === 0 && m === null && r.reverted_head === null, tag + 'no-op with changes'); return; }
    const c = exists(r.base) && exists(r.head) ? changes(root, cfg, run, r.base, r.head) : null;
    p(c !== null && same(c.commits, r.commits) && same(c.changed_files, r.changed_files) && same(c.out_of_scope, r.out_of_scope) && same(c.loc, r.loc) && !c.ledger_inside, tag + 'changed files, scope or LOC differ from git');
    const incumbent = incumbentOf(cfg, receipts.slice(0, i));
    if (r.out_of_scope.length) p(r.decision === 'out-of-scope' && m === null && r.guard === null && r.value === null, tag + 'out-of-scope decision');
    else if (m !== null && !problems.some(x => x.startsWith(tag + 'verify'))) {
      const candidate = KEPT.includes(rule(cfg, incumbent, m, r.loc, 'pass').decision), expectGuard = !!cfg.guard && candidate;
      p((r.guard !== null) === expectGuard && (!r.guard || (['pass', 'fail'].includes(r.guard.status) && r.guard.command === cfg.guard && (r.guard.status === 'pass') === (r.guard.exit_code === 0 && r.guard.error === null))), tag + 'guard presence or result');
      p(same(rule(cfg, incumbent, m, r.loc, r.guard ? r.guard.status : 'pass'), { value: r.value, delta: r.delta, decision: r.decision }), tag + 'decision does not follow from the samples');
    } else p(m !== null, tag + 'no measurement');
    if (KEPT.includes(r.decision)) p(r.reverted_head === null, tag + 'kept but reverted');
    else p(exists(r.reverted_head) && gitRaw(root, ['merge-base', '--is-ancestor', r.head, r.reverted_head]).status === 0 && tree(r.reverted_head) === tree(r.base), tag + 'experiment not reverted to the base tree');
  });
  if (receipts.length) p(git(root, ['rev-parse', 'HEAD']).trim() === after(receipts[receipts.length - 1]), 'HEAD has moved past the ledger end');
  const summaryFile = path.join(run, 'summary.json');
  let loop = null;
  if (fs.existsSync(summaryFile)) {
    try {
      const s = JSON.parse(fs.readFileSync(summaryFile, 'utf8')), ok = x => a.object(x) && x.status === 'ok' && Number.isFinite(x.value);
      p(ok(s.final_measurement) && (s.holdout_measurement === null) === (cfg.holdout === null) && (!s.holdout_measurement || ok(s.holdout_measurement)) && STATUSES.includes(s.status), 'summary.json measurements');
      loop = block(run, cfg, receipts, s.holdout_measurement, s.final_measurement);
      p(same(s.loop, loop), 'summary.json does not match the receipts');
    } catch { p(false, 'summary.json unreadable'); loop = null; }
  }
  if (handoffPath) {
    try {
      const j = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
      p(loop !== null && ['loop', 'forge'].includes(j.source) && j.results_tsv === TSV && same(j.loop, loop), 'handoff.json loop block does not match the receipts');
    } catch { p(false, 'handoff unreadable'); }
  }
  return { problems, text: problems.length ? 'LOOP CHECK: FAIL\n' + problems.map(x => '  ' + x).join('\n') : `LOOP CHECK: OK receipts=${receipts.length} kept=${receipts.filter(r => r.iteration > 0 && KEPT.includes(r.decision)).length}` };
}
function opts(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { o[argv[i].slice(2)] = argv[i + 1]; i++; } else o._.push(argv[i]);
  }
  return o;
}
module.exports = { calibrate, decide, summary, check, measure, parse, median, rule, row, block, KEPT, VERDICTS, TSV, VERSION };
if (require.main === module) {
  (async () => {
    const [action, ...rest] = process.argv.slice(2), o = opts(rest);
    if (action === 'calibrate') console.log((await calibrate(o)).text);
    else if (action === 'decide') { const r = await decide(o._[0], o._[1] || ''); console.log(r.text); process.exitCode = KEPT.includes(r.decision) ? 0 : 1; }
    else if (action === 'summary') { const s = await summary(o._[0], o); console.log(s.text); process.exitCode = s.problems.length ? 1 : 0; }
    else if (action === 'check') { const c = check(o._[0], o._[1]); console.log(c.text); process.exitCode = c.problems.length ? 1 : 0; }
    else { console.error('usage: loop.cjs calibrate [run-dir] --verify <cmd> [--guard <cmd>] [--holdout <cmd>] [--scope <globs>] [--direction higher|lower] [--samples N] [--min-delta X] [--timeout-ms N] [--goal <text>] [--metric <text>]\n       loop.cjs decide <run-dir> "<description>" | summary <run-dir> [--status S] | check <run-dir> [handoff.json]'); process.exitCode = 64; }
  })().catch(e => { console.error('Loop blocked: ' + e.message); process.exitCode = 2; });
}
