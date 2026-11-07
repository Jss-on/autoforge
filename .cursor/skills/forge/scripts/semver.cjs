// Semantic versioning for repositories the user owns. `init` writes semantic-release's configuration and a release
// workflow that versions every push to the default branch once CI passes; `scan` → `plan` → `apply` → `check`
// backfill the version history semantic-release would have produced. The rules are semantic-release 25's defaults
// with the conventionalcommits preset, reproduced exactly: a BREAKING CHANGE note or `type!:` → major, feat/FEAT →
// minor, fix/FIX/perf or a revert git wrote → patch, the first release 1.0.0, and a revert cancels the commit it
// names when both land in the same release.
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process');
const a = require('./acceptance.cjs'), host = require('./host.cjs');
// Like host.cjs: on Windows never execute a git or gh binary committed to the repository being versioned.
process.env.NoDefaultCurrentDirectoryInExePath = '1';

// Exact versions, so every project releases with the same tool chain; PINNED_ON freezes everything they pull in to
// the day it was verified (npm_config_before), so a dependency published later never runs with the release token.
// The preset stays on 9.x: 10.x needs conventional-changelog-writer 9, release-notes-generator 14 ships writer 8.
const PIN = { 'semantic-release': '25.0.9', '@semantic-release/commit-analyzer': '13.0.1', '@semantic-release/release-notes-generator': '14.1.1',
  '@semantic-release/changelog': '7.0.0', '@semantic-release/npm': '13.2.0', '@semantic-release/exec': '7.1.0',
  '@semantic-release/git': '11.0.1', '@semantic-release/github': '12.0.10', 'conventional-changelog-conventionalcommits': '9.3.1' };
const PINNED_ON = '2026-10-17';
const TYPES = ['feat', 'fix', 'perf', 'revert', 'docs', 'style', 'refactor', 'test', 'build', 'ci', 'chore'];
const AUTO = new Set([...TYPES, 'FEAT', 'FIX']); // headers semantic-release reads on its own; anything else needs a class
const RANK = { none: 0, patch: 1, minor: 2, major: 3 };
const SECTIONS = [['feat', 'Features'], ['fix', 'Bug Fixes'], ['perf', 'Performance Improvements'], ['revert', 'Reverts']];
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, SAFE_PATH = /^[\w./-]+$/;
const HEADER = 'sha\tdate\ttype\tbreaking\tstatus\tscope\tsubject';
const RELEASE_YML = '.github/workflows/release.yml', RC = '.releaserc.json', CHANGELOG = 'CHANGELOG.md';
const MAX_MESSAGE = 1 << 16; // a longer message is cut before parsing, so a crafted one costs bounded time
const USAGE = 'usage: semver.cjs init <dir> [--force] [--ci <workflow name>] | scan <dir> --out <ledger.tsv>\n' +
  '       semver.cjs plan <dir> <ledger.tsv> [--classes <classes.json>] [--initial X.Y.Z] --out <plan.json> [--changelog <file>]\n' +
  '       semver.cjs apply <dir> <plan.json> [--push] [--releases] | check <dir> [plan.json] [--remote]';

function run(cmd, args, cwd) {
  const r = cp.spawnSync(cmd, args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GIT_EDITOR: 'true' } });
  return { status: r.error ? 127 : r.status, stdout: r.stdout || '', stderr: (r.stderr || r.error?.message || '').trim() };
}
function git(root, ...args) {
  const r = run('git', args, root);
  a.need(r.status === 0, `git ${args[0]} failed: ${r.stderr}`);
  return r.stdout;
}
// FORGE_GH points the tests at a fake gh (a node script); credentials otherwise stay inside the gh CLI.
const ghRun = (root, args) => process.env.FORGE_GH ? run(process.execPath, [process.env.FORGE_GH, ...args], root) : run('gh', args, root);
function gh(root, args) {
  const r = ghRun(root, args);
  a.need(r.status === 0, `gh ${args.slice(0, 2).join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}
// The repository's own top, never a parent: a plain directory (a clone that failed) must not resolve to the
// workspace repository around it.
function toplevel(dir) {
  const r = run('git', ['rev-parse', '--show-toplevel'], dir), top = r.stdout.trim();
  a.need(r.status === 0, 'Not a git repository: ' + dir);
  a.need(fs.realpathSync.native(path.resolve(dir)) === fs.realpathSync.native(top), `${dir} is not the top of a repository (it is inside ${top})`);
  return top;
}
// origin/HEAD exists only in clones; a repository made with `git init` and pushed (every build) has none, so fall
// back to main/master before the current branch, which may well be a topic branch.
function defaultBranch(root) {
  const r = run('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], root);
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().replace(/^origin\//, '');
  for (const ref of ['refs/remotes/origin/main', 'refs/remotes/origin/master', 'refs/heads/main', 'refs/heads/master'])
    if (run('git', ['rev-parse', '-q', '--verify', ref], root).status === 0) return ref.split('/').pop();
  const cur = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], root).stdout.trim();
  return cur && cur !== 'HEAD' ? cur : 'main';
}
const read = f => fs.readFileSync(f, 'utf8'), cell = s => String(s ?? '').replace(/\s+/g, ' ').trim() || '-';
const link = p => !!fs.lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink();
// Every write into the repository resolves its path here: a committed symlink at any step (CHANGELOG.md →
// ../../elsewhere, a symlinked .github) is refused, never followed out of the clone.
function inside(root, rel) {
  let at = root;
  for (const part of rel.split(/[\\/]/)) { at = path.join(at, part); a.need(!link(at), `${rel}: ${path.relative(root, at)} is a symbolic link; refusing to write through it`); }
  return at;
}
function writeIn(root, rel, text) {
  const at = inside(root, rel);
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, text);
}
const utc = iso => new Date(iso).toISOString().slice(0, 10);
const cmp = (x, y) => { const p = x.split('.').map(Number), q = y.split('.').map(Number); return p[0] - q[0] || p[1] - q[1] || p[2] - q[2]; };
const inc = (v, bump) => { const [M, m, p] = v.split('.').map(Number); return bump === 'major' ? `${M + 1}.0.0` : bump === 'minor' ? `${M}.${m + 1}.0` : `${M}.${m}.${p + 1}`; };
// commit-analyzer's default rules as they apply to this preset (its JSHint rules add the upper-case FEAT and FIX).
const bumpOf = e => e.breaking ? 'major' : ['feat', 'FEAT'].includes(e.type) ? 'minor' : ['fix', 'FIX', 'perf'].includes(e.type) || e.revert ? 'patch' : 'none';
// The configured URL, not `remote get-url`: that applies insteadOf rewrites, and the GitHub identity is what gh needs.
function githubUrl(root) {
  const r = run('git', ['config', '--get', 'remote.origin.url'], root), p = r.status === 0 && host.parse(r.stdout.trim());
  return p && p.hostname === 'github.com' ? { url: 'https://github.com/' + p.project, project: p.project } : null;
}

// The preset's revertPattern, /^(?:Revert|revert:)\s"?([\s\S]+?)"?\s*This reverts commit (\w*)\./i, without its
// quadratic backtracking: the earliest "This reverts commit <word>." after at least one character, with the quote and
// blanks before it peeled off. A merge revert ("…, reversing changes made to …") and `--reference` are not reverts.
function revertOf(msg) {
  const lead = /^revert:?\s/i.exec(msg);
  if (!lead) return null;
  const re = /This reverts commit (\w*)\./ig;
  re.lastIndex = lead[0].length + 1;
  const m = re.exec(msg);
  if (!m) return null;
  let header = msg.slice(lead[0].length + (msg[lead[0].length] === '"' ? 1 : 0), m.index).trimEnd();
  if (header.endsWith('"')) header = header.slice(0, -1);
  return { header: header.trim(), hash: m[1] };
}
// A message as commit-analyzer 13 reads it with the conventionalcommits preset: header, BREAKING CHANGE notes (per
// line, any case), `!`, revert. Breaking does not depend on the type: `chore!:`, `experiment!:` and a free-text header
// over a "Breaking change:" line are all majors.
function parse(message) {
  const msg = message.length > MAX_MESSAGE ? message.slice(0, MAX_MESSAGE) : message, [header = '', ...lines] = msg.split(/\r?\n/);
  const m = /^(\w*)(?:\((.*)\))?(!)?: (.*)$/.exec(header), note = lines.map(l => /^[\s|*]*(?:BREAKING CHANGE|BREAKING-CHANGE)[:\s]+(.*)/i.exec(l)).find(Boolean);
  const breaking = !!(m && m[3]) || !!note;
  return { header, type: m ? m[1] : null, scope: m ? m[2] || '' : '', description: m ? m[4] : header, revert: revertOf(msg),
    breaking, breakingNote: breaking ? (note && note[1].trim()) || (m ? m[4] : header) : '' };
}
// conventional-commits-filter as commit-analyzer runs it: newest first, a revert cancels the older commit whose header
// and full sha equal what it says it reverts (an abbreviated sha or a squash title with " (#5)" cancels nothing).
function live(list) {
  const held = [], gone = new Set();
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i], p = parse(c.message), hit = held.findIndex(r => r.revert.hash === c.sha && r.revert.header === p.header.trim());
    if (hit >= 0) { gone.add(held[hit].sha).add(c.sha); held.splice(hit, 1); }
    else if (p.revert) held.push({ sha: c.sha, revert: p.revert });
  }
  return list.filter(c => !gone.has(c.sha));
}
const autoType = (c, p) => p.type && AUTO.has(p.type) ? p.type : p.revert ? 'revert' : c.parents.length > 1 ? 'merge' : '?';

// Commits since the latest stable v-tag reachable from HEAD (all of history when there is none), oldest first.
function baseTag(root) {
  const tags = git(root, 'tag', '--merged', 'HEAD', '--list', 'v*').split(/\r?\n/).filter(t => SEMVER.test(t.slice(1)));
  if (!tags.length) return null;
  const tag = tags.sort((x, y) => cmp(y.slice(1), x.slice(1)))[0];
  return { tag, version: tag.slice(1), sha: git(root, 'rev-list', '-n', '1', tag).trim() };
}
function commits(root, base) {
  return git(root, 'log', '--topo-order', '--reverse', '--format=%x1e%H%x00%P%x00%cI%x00%B', base ? `${base.tag}..HEAD` : 'HEAD')
    .split('\x1e').slice(1).map(rec => {
      const [sha, parents, date, body = ''] = rec.split('\x00');
      return { sha, parents: parents.trim() ? parents.trim().split(' ') : [], date: date.trim(), message: body.replace(/\s+$/, '') };
    });
}

function scan(dir) {
  const root = toplevel(dir), base = baseTag(root), list = commits(root, base);
  const rows = list.map(c => {
    const p = parse(c.message), type = autoType(c, p);
    return { sha: c.sha, date: utc(c.date), type, breaking: p.breaking ? 'yes' : '-', status: type === '?' ? 'todo' : 'auto', scope: cell(p.scope), subject: cell(p.header), p };
  });
  // A revert and its target, both in range, cancel when they land in the same release; plan decides that, so
  // neither needs a class unless a release boundary splits them.
  for (const r of rows.filter(x => x.p.revert)) {
    const t = rows.find(x => x !== r && !x.pair && x.sha === r.p.revert.hash && x.p.header.trim() === r.p.revert.header);
    if (t) { r.status = 'pair:' + t.sha.slice(0, 7); t.status = 'pair:' + r.sha.slice(0, 7); r.pair = t.pair = true; }
  }
  return { root, base, rows };
}
function writeLedger(file, rows) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, [HEADER, ...rows.map(r => [r.sha, r.date, r.type, r.breaking, r.status, r.scope, r.subject].join('\t'))].join('\n') + '\n');
}
function readLedger(file) {
  const lines = read(file).split(/\r?\n/).filter(Boolean);
  a.need(lines[0] === HEADER, `${file}: not a semver ledger (header must be: ${HEADER.replace(/\t/g, ' | ')})`);
  return lines.slice(1).map((l, i) => {
    const c = l.split('\t');
    a.need(c.length === 7 && /^[0-9a-f]{40}$/.test(c[0]), `${file}:${i + 2}: expected 7 tab-separated cells starting with a full sha`);
    return { sha: c[0], status: c[4] };
  });
}
// classes.json: { "<sha or ≥7-char prefix>": { "type": "feat", "note": "changelog line", "scope": "", "breaking": false } }
function readClasses(file, rows) {
  const raw = JSON.parse(read(file)), out = new Map();
  a.need(raw && typeof raw === 'object' && !Array.isArray(raw), `${file}: expected an object keyed by commit sha`);
  for (const [key, c] of Object.entries(raw)) {
    const hits = /^[0-9a-f]{7,40}$/.test(key) ? rows.filter(r => r.sha.startsWith(key)) : [];
    a.need(hits.length === 1, `${file}: "${key}" must name exactly one commit in the ledger`);
    a.need(c && TYPES.includes(c.type), `${file}: ${key}: type must be one of ${TYPES.join(', ')}`);
    a.need(c.breaking === undefined || typeof c.breaking === 'boolean', `${file}: ${key}: breaking must be true or false`);
    const note = cell(c.note) === '-' ? '' : cell(c.note);
    a.need(note || !(['feat', 'fix', 'perf', 'revert'].includes(c.type) || c.breaking), `${file}: ${key}: a ${c.type}${c.breaking ? '!' : ''} lands in the changelog, so it needs a note (one line, what changed for the user)`);
    out.set(hits[0].sha, { type: c.type, breaking: !!c.breaking, note, scope: cell(c.scope) === '-' ? '' : cell(c.scope) });
  }
  return out;
}

// The changelog section the conventionalcommits preset writes for one release (entries sorted on scope + subject).
function notes(rel, prev, hub, entries) {
  const link = t => hub ? t.replace(/(^|[^[\w])#(\d+)\b/g, `$1[#$2](${hub.url}/issues/$2)`) : t;
  const ref = sha => hub ? `[${sha.slice(0, 7)}](${hub.url}/commit/${sha})` : sha.slice(0, 7);
  const key = e => (e.scope || '') + e.note, order = (x, y) => key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0;
  const out = [prev && hub ? `## [${rel.version}](${hub.url}/compare/v${prev}...${rel.tag}) (${rel.date})` : `## ${rel.version} (${rel.date})`];
  const breaking = entries.filter(e => e.breaking);
  if (breaking.length) out.push('### ⚠ BREAKING CHANGES', breaking.map(e => `* ${e.scope ? `**${e.scope}:** ` : ''}${link(e.breakingNote || e.note)}`).join('\n'));
  for (const [type, title] of SECTIONS) {
    const list = entries.filter(e => e.type === type).sort(order);
    if (list.length) out.push(`### ${title}`, list.map(e => `* ${e.scope ? `**${e.scope}:** ` : ''}${link(e.note)} (${ref(e.sha)})`).join('\n'));
  }
  return out.join('\n\n');
}

function plan(dir, ledgerFile, opts = {}) {
  const root = toplevel(dir), base = baseTag(root), head = git(root, 'rev-parse', 'HEAD').trim(), initial = opts.initial || '1.0.0';
  a.need(SEMVER.test(initial), '--initial must be X.Y.Z');
  const rows = readLedger(ledgerFile), list = commits(root, base), bySha = new Map(list.map(c => [c.sha, c]));
  const problems = [], warnings = [], ledgerShas = new Set(rows.map(r => r.sha));
  const stale = list.filter(c => !ledgerShas.has(c.sha)).length + rows.filter(r => !bySha.has(r.sha)).length;
  a.need(!stale, `${ledgerFile} does not match the history since ${base ? base.tag : 'the first commit'} (${stale} commits differ); run scan again`);
  const classes = opts.classes ? readClasses(opts.classes, rows) : new Map(), parsed = new Map(list.map(c => [c.sha, parse(c.message)]));
  const entry = sha => {
    const p = parsed.get(sha), k = classes.get(sha);
    if (k) return { sha, type: k.type, breaking: k.breaking, breakingNote: '', scope: k.scope, note: k.note || p.description, revert: k.type === 'revert' };
    return { sha, type: autoType(bySha.get(sha), p), breaking: p.breaking, breakingNote: p.breakingNote, scope: p.scope, note: p.revert ? p.header : p.description, revert: !!p.revert };
  };
  for (const [sha, k] of classes) {
    const was = autoType(bySha.get(sha), parsed.get(sha));
    if (!['?', 'merge'].includes(was) && (was !== k.type || parsed.get(sha).breaking !== k.breaking)) warnings.push(`override ${sha.slice(0, 7)}: ${was} → ${k.type}${k.breaking ? '!' : ''}`);
  }
  for (const t of git(root, 'tag', '--merged', 'HEAD').split(/\r?\n/).filter(t => SEMVER.test(t))) warnings.push(`tag ${t} has no "v" prefix; semantic-release (tagFormat v\${version}) ignores it`);

  // Each first-parent commit brings in itself plus whatever its merge pulls in; integration points become releases.
  const fp = git(root, 'rev-list', '--first-parent', '--reverse', base ? `${base.tag}..HEAD` : 'HEAD').split(/\s+/).filter(Boolean);
  const owner = new Map();
  fp.forEach((sha, i) => {
    const stack = [sha];
    while (stack.length) { const s = stack.pop(); if (owner.has(s) || !bySha.has(s)) continue; owner.set(s, i); stack.push(...bySha.get(s).parents); }
  });
  const order = new Map(list.map((c, i) => [c.sha, i])), brought = fp.map(() => []);
  for (const [s, i] of owner) brought[i].push(s);
  brought.forEach(b => b.sort((x, y) => order.get(x) - order.get(y)));
  const prOf = sha => { const h = parsed.get(sha).header, m = /\(#(\d+)\)\s*$/.exec(h) || /^Merge pull request #(\d+)/.exec(h); return m ? Number(m[1]) : null; };
  const integration = sha => bySha.get(sha).parents.length > 1 || prOf(sha) !== null;
  const point = (sha, i) => integration(sha) || i === fp.length - 1 || integration(fp[i + 1]);

  const releases = [], need = new Map(), hub = githubUrl(root);
  let pending = [], last = base ? base.version : null;
  fp.forEach((sha, i) => {
    pending.push(...brought[i]);
    if (!point(sha, i)) return;
    const kept = live(pending.map(s => bySha.get(s))).map(c => entry(c.sha));
    for (const e of kept.filter(x => x.type === '?')) need.set(e.sha, `classify ${e.sha.slice(0, 7)} ${cell(parsed.get(e.sha).header)}`);
    const bump = kept.reduce((b, e) => RANK[bumpOf(e)] > RANK[b] ? bumpOf(e) : b, 'none');
    if (bump === 'none') return; // nothing releasable yet: these commits ride into the next release, as on the branch
    const version = last ? inc(last, bump) : initial;
    const rel = { tag: 'v' + version, version, sha, date: utc(bySha.get(sha).date), bump: last ? bump : 'initial', pr: prOf(sha), commits: kept.map(e => e.sha) };
    rel.notes = notes(rel, last, hub, kept);
    releases.push(rel); last = version; pending = [];
  });
  problems.push(...need.values());
  // semantic-release reads what follows the newest tag by its raw messages, not by these classes: a commit there
  // that it would release gets released on the first run after adoption, under a tag this plan never made.
  for (const c of live(pending.map(s => bySha.get(s)))) {
    const p = parsed.get(c.sha), raw = bumpOf({ ...p, revert: !!p.revert });
    if (raw !== 'none' && !need.has(c.sha)) problems.push(`${c.sha.slice(0, 7)} reads as a ${raw} to semantic-release ("${cell(p.header)}") but no release covers it: classify it releasable, or the first run after adoption releases it under a tag this plan never made`);
  }
  for (const r of releases) {
    const have = run('git', ['rev-parse', '-q', '--verify', `refs/tags/${r.tag}^{commit}`], root);
    if (have.status === 0 && have.stdout.trim() !== r.sha) problems.push(`tag ${r.tag} already exists on ${have.stdout.trim().slice(0, 7)}, not ${r.sha.slice(0, 7)}`);
  }
  const result = { version: 1, branch: defaultBranch(root), head, base, initial, repo: hub && hub.url, releases, unreleased: pending.length,
    verdict: problems.length ? 'BLOCKED' : 'READY', problems, warnings };
  if (opts.out) { fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true }); fs.writeFileSync(opts.out, JSON.stringify(result, null, 2) + '\n'); }
  if (opts.changelog) fs.writeFileSync(opts.changelog, changelogText(releases, ''));
  return result;
}
// @semantic-release/changelog's layout: the title, then releases newest first, then whatever the file held before.
function changelogText(releases, existing) {
  const title = '# Changelog', rest = existing.trim().startsWith(title) ? existing.trim().slice(title.length).trim() : existing.trim();
  return [title, ...[...releases].reverse().map(r => r.notes), rest].filter(Boolean).join('\n\n') + '\n';
}

// A key inside one TOML table: `[project]`'s version, not the first `version =` of whatever table comes first.
function tomlKey(text, table, key) {
  const head = new RegExp(`^\\[${table.replace(/\./g, '\\.')}\\][ \\t]*$`, 'm').exec(text);
  if (!head) return null;
  const start = head.index + head[0].length, end = text.slice(start).search(/^\[/m), body = text.slice(start, end < 0 ? undefined : start + end);
  const m = new RegExp(`^${key}[ \\t]*=[ \\t]*"([^"]*)"`, 'm').exec(body);
  return m ? { value: m[1], at: start + m.index, len: m[0].length, body } : null;
}
// One sed for a version line inside a table (ubuntu's GNU sed: the range runs to the next table header).
const tableSed = (file, table) => `sed -i -E '/^\\[${table.replace(/\./g, '\\.')}\\][[:blank:]]*$/,/^\\[/ s/^version[[:blank:]]*=[[:blank:]]*"[^"]*"/version = "\${nextRelease.version}"/' ${file}`;
// The project's own entry in Cargo.lock / uv.lock carries the version too; a stale one fails `--locked` builds.
const lockSed = (file, name) => `sed -i -E '/^name = "${name}"$/{n;s/^version = "[^"]*"/version = "\${nextRelease.version}"/}' ${file}`;
// Version fields semantic-release keeps in step with the tag: npm through its plugin, the rest through sed (the
// release job runs on ubuntu). A dynamic or absent version is left to the tags.
function manifests(root) {
  const at = f => path.join(root, f), has = f => fs.existsSync(at(f)) && !link(at(f)), out = [];
  if (has('package.json')) out.push({ file: 'package.json', npm: true, assets: ['package.json', 'package-lock.json', 'npm-shrinkwrap.json'] });
  const toml = (file, tables, lockFile, nameOf) => {
    if (!has(file)) return;
    const s = read(at(file)), table = tables.find(t => tomlKey(s, t, 'version'));
    if (!table) return;
    const m = { file, table, assets: [file], seds: [tableSed(file, table)] }, name = nameOf(s);
    if (has(lockFile) && name) { m.lock = { file: lockFile, name }; m.assets.push(lockFile); m.seds.push(lockSed(lockFile, name)); }
    out.push(m);
  };
  const named = (s, table, norm) => { const n = tomlKey(s, table, 'name'), v = n && norm(n.value); return v && /^[A-Za-z0-9_-]+$/.test(v) ? v : null; };
  toml('pyproject.toml', ['project', 'tool.poetry'], 'uv.lock', s => named(s, 'project', n => n.toLowerCase().replace(/[-_.]+/g, '-')));
  toml('Cargo.toml', ['package'], 'Cargo.lock', s => named(s, 'package', n => n));
  const walk = (rel, depth) => {
    for (const d of fs.readdirSync(at(rel), { withFileTypes: true })) {
      const f = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory() && depth < 3 && !/^(\.|node_modules$|bin$|obj$|dist$|build$)/.test(d.name)) walk(f, depth + 1);
      else if (d.isFile() && /(\.csproj|^Directory\.Build\.props)$/.test(d.name) && /<Version>[^<]*<\/Version>/.test(read(at(f))) && SAFE_PATH.test(f))
        out.push({ file: f, assets: [f], seds: [`sed -i -E 's#<Version>[^<]*</Version>#<Version>\${nextRelease.version}</Version>#' ${f}`] });
    }
  };
  walk('', 0);
  return out;
}
function manifestVersion(root, m) {
  const s = read(path.join(root, m.file));
  if (m.npm) return JSON.parse(s).version || null;
  const v = m.table ? tomlKey(s, m.table, 'version') : /<Version>([^<]*)<\/Version>/.exec(s);
  return v ? (m.table ? v.value : v[1]) : null;
}
// Sets the version the way the release job's plugin or sed would; returns the files it wrote.
function setVersion(root, m, version) {
  const s = read(inside(root, m.file)), wrote = [m.file];
  if (m.npm) {
    const indent = (/^([ \t]+)"/m.exec(s) || [, '  '])[1], json = o => JSON.stringify(o, null, indent) + '\n';
    writeIn(root, m.file, json({ ...JSON.parse(s), version }));
    if (fs.existsSync(inside(root, 'package-lock.json'))) {
      const l = JSON.parse(read(path.join(root, 'package-lock.json')));
      writeIn(root, 'package-lock.json', json({ ...l, version, ...(l.packages && l.packages[''] ? { packages: { ...l.packages, '': { ...l.packages[''], version } } } : {}) }));
      wrote.push('package-lock.json');
    }
  } else if (m.table) {
    const v = tomlKey(s, m.table, 'version');
    writeIn(root, m.file, s.slice(0, v.at) + `version = "${version}"` + s.slice(v.at + v.len));
    if (m.lock) {
      const lock = read(inside(root, m.lock.file)), re = new RegExp(`^(name = "${m.lock.name}"\\r?\\nversion = ")[^"]*(")`, 'm');
      if (re.test(lock)) { writeIn(root, m.lock.file, lock.replace(re, `$1${version}$2`)); wrote.push(m.lock.file); }
    }
  } else writeIn(root, m.file, s.replace(/<Version>[^<]*<\/Version>/g, `<Version>${version}</Version>`));
  return wrote;
}

// A one-line YAML scalar: "double" (JSON escapes), 'single' ('' escapes) or plain (a trailing # comment dropped).
function scalar(raw) {
  const s = raw.trim(), d = /^"((?:[^"\\]|\\.)*)"/.exec(s), q = /^'((?:[^']|'')*)'/.exec(s);
  if (d) { try { return JSON.parse(`"${d[1]}"`); } catch { return d[1]; } }
  return q ? q[1].replace(/''/g, "'") : s.replace(/(^|[ \t])#.*$/, '').trim();
}
// A workflow's `on:` section (flow or block style, comments dropped): enough to tell its triggers apart without a YAML
// parser, and to ignore a `tags:` input of some step (docker metadata) that is not a trigger at all.
function triggers(text) {
  const m = /^(?:on|"on"|'on')[ \t]*:(.*)$/m.exec(text);
  if (!m) return '';
  const lines = [m[1]];
  for (const l of text.slice(m.index + m[0].length).split(/\r?\n/).slice(1)) { if (/^[^\s#]/.test(l)) break; lines.push(l); }
  return lines.map(l => l.replace(/(^|\s)#.*$/, '')).join('\n');
}
const trigger = (on, key) => new RegExp(`(^|[\\s\\[{,])${key}([ \\t]*[:,\\]}]|[ \\t]*$)`, 'm').test(on);
// Workflows by display name (GitHub uses the file path when a workflow has no name).
function workflows(root) {
  const dir = path.join(root, '.github', 'workflows');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).map(file => {
    const text = read(path.join(dir, file)), n = /^name:[ \t]*(.*)$/m.exec(text), name = n && scalar(n[1]), on = triggers(text);
    return { file, text, on, name: name || `.github/workflows/${file}`, push: trigger(on, 'push') };
  });
}
function releaseYml({ branch, ci, packages, dispatch }) {
  return [
    'name: Release',
    '# Versions every push to ' + branch + ' that CI passed, from Conventional Commits: feat → minor, fix/perf → patch,',
    '# breaking → major. Written by forge (scripts/semver.cjs init); config in .releaserc.json.',
    'on:', '  workflow_run:', `    workflows: [${JSON.stringify(ci)}]`, '    types: [completed]', `    branches: [${JSON.stringify(branch)}]`,
    'permissions:', '  contents: write', '  issues: write', '  pull-requests: write', ...(dispatch.length ? ['  actions: write'] : []),
    'concurrency:', '  group: release', '  cancel-in-progress: false',
    'jobs:', '  release:',
    '    # A push to this repository only: a pull request run (a fork included) never reaches the release token.',
    "    if: github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push'",
    '    runs-on: ubuntu-latest', '    timeout-minutes: 15', '    steps:',
    '      # The commit CI tested; semantic-release skips it when the branch has moved on, and the newer run releases.',
    '      - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6', '        with:', '          ref: ${{ github.event.workflow_run.head_sha }}', '          fetch-depth: 0',
    '      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6', '        with:', '          node-version: 24', '          package-manager-cache: false',
    '      - name: semantic-release', '        env:', '          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}',
    `          # The tool chain resolves as it stood on ${PINNED_ON}: nothing published later runs with this token,`,
    '          # and no package runs an install script.',
    `          npm_config_before: "${PINNED_ON}"`, '          npm_config_ignore_scripts: "true"', '        run: |',
    '          echo "before=$(git rev-parse HEAD)" >> "$GITHUB_ENV"',
    '          npx --yes ' + packages.map(p => `-p ${p}@${PIN[p]}`).join(' ') + ' semantic-release',
    ...(dispatch.length ? [
      '      # A tag pushed with GITHUB_TOKEN starts no workflow, so start the ones that build from a tag.',
      '      - name: Start tag workflows', '        env:', '          GH_TOKEN: ${{ github.token }}', '        run: |',
      '          [ "$(git rev-parse HEAD)" != "$before" ] || exit 0',
      '          tag="$(git describe --tags --exact-match HEAD)"',
      ...dispatch.map(f => `          gh workflow run ${f} --ref "$tag"`)] : []),
  ].join('\n') + '\n';
}

function init(dir, opts = {}) {
  const root = toplevel(dir), branch = opts.branch || defaultBranch(root), wrote = [], kept = [], warn = [];
  const ms = manifests(root), flows = workflows(root).filter(w => w.file !== path.basename(RELEASE_YML));
  const ciFlow = flows.find(w => /^ci\.ya?ml$/.test(w.file) && w.push) || flows.find(w => w.push && !/release|deploy|pages|android/i.test(w.name + w.file));
  const ci = opts.ci || (ciFlow ? ciFlow.name : 'CI');
  if (!opts.ci && !ciFlow) warn.push('no workflow runs on push: release.yml waits for a push-triggered CI workflow named "CI" (pass --ci <name> once it exists)');
  const tagged = flows.filter(w => trigger(w.on, 'tags'));
  const dispatch = tagged.filter(w => trigger(w.on, 'workflow_dispatch') && SAFE_PATH.test(w.file)).map(w => w.file);
  for (const w of tagged.filter(w => !dispatch.includes(w.file))) warn.push(`${w.file} builds from tag pushes, which a GITHUB_TOKEN tag never starts: add workflow_dispatch so release.yml can start it`);
  for (const w of flows.filter(w => trigger(w.on, 'release'))) warn.push(`${w.file} runs on release events, which a GITHUB_TOKEN release never fires: trigger it on a tag with workflow_dispatch instead`);
  const npm = ms.find(m => m.npm), seds = ms.flatMap(m => m.seds || []);
  if (npm && !JSON.parse(read(path.join(root, 'package.json'))).name) warn.push('package.json has no "name"; @semantic-release/npm refuses to run without one');
  const plugins = [['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }], ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
    ['@semantic-release/changelog', { changelogFile: CHANGELOG, changelogTitle: '# Changelog' }],
    ...(npm ? [['@semantic-release/npm', { npmPublish: false }]] : []),
    ...(seds.length ? [['@semantic-release/exec', { prepareCmd: seds.join(' && ') }]] : []),
    ['@semantic-release/git', { assets: [CHANGELOG, ...ms.flatMap(m => m.assets)] }], '@semantic-release/github'];
  const packages = ['semantic-release', ...plugins.map(p => Array.isArray(p) ? p[0] : p), 'conventional-changelog-conventionalcommits'];
  const files = { [RC]: JSON.stringify({ branches: [branch], plugins }, null, 2) + '\n', [RELEASE_YML]: releaseYml({ branch, ci, packages, dispatch }) };
  const existing = ['.releaserc', '.releaserc.yml', '.releaserc.yaml', '.releaserc.js', '.releaserc.cjs', 'release.config.js', 'release.config.cjs', 'release.config.mjs']
    .filter(f => fs.existsSync(path.join(root, f))).concat(npm && JSON.parse(read(path.join(root, 'package.json'))).release ? ['package.json "release"'] : []);
  if (existing.length && !opts.force) warn.push(`semantic-release is already configured in ${existing.join(', ')}; ${RC} not written (--force writes it)`);
  for (const [file, text] of Object.entries(files)) {
    if ((fs.existsSync(path.join(root, file)) || (file === RC && existing.length)) && !opts.force) { kept.push(file); continue; }
    writeIn(root, file, text); wrote.push(file);
  }
  return { root, branch, ci, manifests: ms.map(m => m.file), dispatch, wrote, kept, warn,
    text: [`SEMVER_INIT: wrote=${wrote.join(',') || '-'} kept=${kept.join(',') || '-'}`,
      `branch=${branch} ci=${JSON.stringify(ci)} manifests=${ms.map(m => m.file).join(',') || '-'} dispatch=${dispatch.join(',') || '-'}`, ...warn.map(w => 'warn: ' + w)].join('\n') };
}

function apply(dir, planFile, opts = {}) {
  const root = toplevel(dir), p = JSON.parse(read(planFile));
  a.need(p.verdict === 'READY', `${planFile} is ${p.verdict}, not READY`);
  const branch = 'semver/adopt-' + new Date().toISOString().slice(2, 10).replace(/-/g, '');
  // A re-run resumes: from its own adoption commit on top of the planned HEAD, or from its branch still at that HEAD.
  const head = git(root, 'rev-parse', 'HEAD').trim(), cur = git(root, 'rev-parse', '--abbrev-ref', 'HEAD').trim();
  const resume = head !== p.head && /^semver\/adopt-\d{6}$/.test(cur) && run('git', ['rev-parse', 'HEAD~1'], root).stdout.trim() === p.head &&
    git(root, 'log', '-1', '--format=%s').trim() === 'ci: adopt semantic-release';
  a.need(head === p.head || resume, 'HEAD moved since the plan; run scan and plan again');
  a.need(!git(root, 'status', '--porcelain').trim(), 'the working tree has uncommitted changes');
  for (const rel of [CHANGELOG, RC, RELEASE_YML, 'package-lock.json']) inside(root, rel); // refuse a symlink before anything changes
  const hub = opts.push ? githubUrl(root) : null;
  a.need(!opts.push || hub, '--push needs a github.com origin (other hosts: tag and release by hand, see the semver command)');
  // Tags first: semantic-release must never see the history untagged, or its first run releases all of it as 1.0.0.
  const made = [];
  for (const r of p.releases) {
    const have = run('git', ['rev-parse', '-q', '--verify', `refs/tags/${r.tag}^{commit}`], root);
    if (have.status === 0) { a.need(have.stdout.trim() === r.sha, `tag ${r.tag} already exists on another commit`); continue; }
    git(root, 'tag', r.tag, r.sha); made.push(r.tag);
  }
  const latest = p.releases.length ? p.releases[p.releases.length - 1].version : p.base && p.base.version, on = resume ? cur : branch;
  if (!resume) {
    const there = run('git', ['rev-parse', '-q', '--verify', `refs/heads/${branch}`], root).stdout.trim();
    a.need(!there || there === p.head, `branch ${branch} exists and does not point at the planned HEAD; finish or delete it`);
    git(root, 'switch', '-q', ...(there ? [branch] : ['-c', branch]));
    const changed = [];
    if (p.releases.length) {
      const f = path.join(root, CHANGELOG);
      writeIn(root, CHANGELOG, changelogText(p.releases, fs.existsSync(f) ? read(f) : '')); changed.push(CHANGELOG);
    }
    for (const m of manifests(root)) if (latest && manifestVersion(root, m) !== null && manifestVersion(root, m) !== latest) changed.push(...setVersion(root, m, latest));
    const setup = init(root, { branch: p.branch }), files = [...new Set([...changed, ...setup.wrote])];
    if (!files.length) { // already adopted and nothing to backfill: leave no empty branch behind
      git(root, 'switch', '-q', p.branch); git(root, 'branch', '-q', '-D', branch);
      return { branch: null, tags: made, pr: null, releases: [], text: `APPLY: NOTHING tags=${made.length} (configuration already present, no versions to backfill)` };
    }
    git(root, 'add', '--', ...files);
    const range = p.releases.length ? `${p.releases[0].tag} … ${p.releases[p.releases.length - 1].tag}` : 'no earlier releases';
    git(root, 'commit', '-q', '-m', 'ci: adopt semantic-release', '-m', `Backfilled ${p.releases.length} versions from history (${range}). From here semantic-release versions every push to ${p.branch} that CI passes.`);
  }
  const out = { branch: on, tags: made, pr: null, releases: [] };
  if (opts.push) {
    // The base tag too: one left local by an earlier run would leave the remote untagged under these new ones.
    const tags = [...(p.base ? [p.base.tag] : []), ...p.releases.map(r => r.tag)];
    if (tags.length) git(root, 'push', 'origin', ...tags.map(t => `refs/tags/${t}:refs/tags/${t}`));
    // A one-commit PR would otherwise squash under its `experiment:` commit and release nothing.
    gh(root, ['api', '-X', 'PATCH', `repos/${hub.project}`, '-f', 'squash_merge_commit_title=PR_TITLE', '-f', 'squash_merge_commit_message=PR_BODY']);
    git(root, 'push', '-u', 'origin', on);
    const body = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-semver-')), 'body.md');
    fs.writeFileSync(body, [`Backfills ${p.releases.length} versions from the existing history and lets semantic-release version every push to \`${p.branch}\` that CI passes (\`feat\` → minor, \`fix\`/\`perf\` → patch, breaking → major).`, '',
      '| Version | Commit | Date | Bump |', '|---|---|---|---|', ...p.releases.map(r => `| ${r.tag} | ${r.sha.slice(0, 7)} | ${r.date} | ${r.bump} |`), '',
      'The tags are already pushed, so the first release run after this merges finds them and releases nothing new.'].join('\n'));
    const open = ghRun(root, ['pr', 'view', on, '--json', 'url', '--jq', '.url']);
    out.pr = open.status === 0 && open.stdout.trim() ? open.stdout.trim()
      : gh(root, ['pr', 'create', '--base', p.branch, '--head', on, '--title', 'ci: adopt semantic-release', '--body-file', body]);
    if (opts.releases) p.releases.forEach((r, i) => {
      if (ghRun(root, ['release', 'view', r.tag, '--json', 'tagName']).status === 0) return;
      fs.writeFileSync(body, r.notes + '\n');
      gh(root, ['release', 'create', r.tag, '--verify-tag', '--title', r.tag, '--notes-file', body, `--latest=${i === p.releases.length - 1}`]);
      out.releases.push(r.tag);
    });
  }
  out.text = `APPLY: ${opts.push ? 'PUSHED' : 'LOCAL'}${resume ? ' (resumed)' : ''} tags=${made.length} branch=${on}` + (out.pr ? ` pr=${out.pr}` : '') + (opts.push ? ` releases=${out.releases.length}` : '');
  return out;
}

function check(dir, planFile, opts = {}) {
  const root = toplevel(dir), problems = [], info = [], branch = defaultBranch(root);
  const rcFile = path.join(root, RC);
  if (!fs.existsSync(rcFile)) problems.push(`missing ${RC} (semver.cjs init writes it)`);
  else {
    let rc = null;
    try { rc = JSON.parse(read(rcFile)); } catch (e) { problems.push(`${RC} is not JSON: ${e.message}`); }
    if (rc) {
      const plugins = [].concat(rc.plugins || []), names = plugins.map(p => Array.isArray(p) ? p[0] : p), analyzer = plugins.find(p => Array.isArray(p) && p[0] === '@semantic-release/commit-analyzer');
      if (![].concat(rc.branches || []).some(b => (b && b.name || b) === branch)) problems.push(`${RC} does not release from the default branch ${branch}`);
      for (const n of ['@semantic-release/commit-analyzer', '@semantic-release/release-notes-generator', '@semantic-release/changelog', '@semantic-release/git', '@semantic-release/github'])
        if (!names.includes(n)) problems.push(`${RC} is missing ${n}`);
      if (!analyzer || !analyzer[1] || analyzer[1].preset !== 'conventionalcommits') problems.push(`${RC}: commit-analyzer must use the conventionalcommits preset (angular ignores "feat!:")`);
    }
  }
  const wf = path.join(root, RELEASE_YML);
  if (!fs.existsSync(wf)) problems.push(`missing ${RELEASE_YML}`);
  else {
    const m = /workflows:[ \t]*\[[ \t]*("(?:[^"\\]|\\.)*")[ \t]*\]/.exec(read(wf)), ci = m && JSON.parse(m[1]);
    const flow = ci && workflows(root).find(w => w.name === ci && w.file !== path.basename(RELEASE_YML));
    if (!ci) problems.push(`${RELEASE_YML} names no CI workflow to wait for`);
    else if (!flow) problems.push(`${RELEASE_YML} waits for workflow "${ci}", and no workflow in .github/workflows has that name`);
    else if (!flow.push) problems.push(`${RELEASE_YML} waits for "${ci}" (${flow.file}), which never runs on push, so no release ever runs`);
  }
  const base = baseTag(root);
  if (base) for (const m of manifests(root)) {
    const v = manifestVersion(root, m);
    if (v !== null && v !== base.version) problems.push(`${m.file} says ${v}, the latest release tag is ${base.tag}`);
  }
  const p = planFile ? JSON.parse(read(planFile)) : null;
  if (p) {
    const log = fs.existsSync(path.join(root, CHANGELOG)) ? read(path.join(root, CHANGELOG)) : '';
    for (const r of p.releases) {
      const have = run('git', ['rev-parse', '-q', '--verify', `refs/tags/${r.tag}^{commit}`], root).stdout.trim();
      if (have !== r.sha) problems.push(`tag ${r.tag} ${have ? 'is on ' + have.slice(0, 7) : 'is missing'}, the plan puts it on ${r.sha.slice(0, 7)}`);
      if (!log.includes(`## [${r.version}]`) && !log.includes(`## ${r.version} `)) problems.push(`${CHANGELOG} has no section for ${r.version}`);
    }
  }
  if (opts.remote) {
    // Every planned tag and the base the next release counts from must be on origin, peeled for annotated tags.
    const ls = run('git', ['ls-remote', '--tags', 'origin'], root), on = new Map(ls.stdout.split(/\r?\n/).filter(Boolean).map(l => l.split('\t').reverse()));
    const remote = (t, sha) => on.get(`refs/tags/${t}^{}`) === sha || on.get(`refs/tags/${t}`) === sha;
    if (ls.status !== 0) problems.push('git ls-remote origin failed: ' + ls.stderr);
    else for (const [t, sha] of [...(p ? p.releases.map(r => [r.tag, r.sha]) : []), ...(base ? [[base.tag, base.sha]] : [])])
      if (!remote(t, sha)) problems.push(`origin has no tag ${t} on ${sha.slice(0, 7)}: semantic-release there would count from an older version`);
    const hub = githubUrl(root), s = hub && ghRun(root, ['api', `repos/${hub.project}`, '--jq', '.squash_merge_commit_title']);
    if (!hub) info.push('origin is not on github.com: squash-merge title not checked');
    else if (s.status !== 0) problems.push('gh api failed reading the squash-merge setting: ' + s.stderr);
    else if (s.stdout.trim() !== 'PR_TITLE') problems.push(`squash merges use ${s.stdout.trim() || 'the default title'}, not PR_TITLE: a one-commit PR would release under its experiment: subject`);
  }
  // What semantic-release would do next, from the raw messages after the newest tag (reverts cancelled as it does).
  const next = live(commits(root, base)).map(c => parse(c.message)).reduce((b, e) => { const x = bumpOf({ ...e, revert: !!e.revert }); return RANK[x] > RANK[b] ? x : b; }, 'none');
  const nextText = next === 'none' ? 'none' : `${next} → v${base ? inc(base.version, next) : '1.0.0'}`;
  return { problems, text: [`SEMVER: ${problems.length ? 'INCOMPLETE' : 'ADOPTED'} latest=${base ? base.tag : '-'} next=${nextText}`, ...problems.map(x => '  - ' + x), ...info.map(x => '  note: ' + x)].join('\n') };
}

module.exports = { init, scan, plan, apply, check, parse, live, notes, manifests, changelogText, scalar, triggers, PIN, PINNED_ON, HEADER };
if (require.main === module) {
  const [action, ...rest] = process.argv.slice(2), opts = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const m = /^--([\w-]+)$/.exec(rest[i]);
    if (!m) opts._.push(rest[i]);
    else if (['force', 'push', 'releases', 'remote'].includes(m[1])) opts[m[1]] = true;
    else opts[m[1]] = rest[++i];
  }
  const [dir, file] = opts._;
  try {
    if (action === 'init' && dir) { const r = init(dir, opts); console.log(r.text); }
    else if (action === 'scan' && dir && opts.out) {
      const r = scan(dir), n = s => r.rows.filter(x => x.status === s || (s === 'pair' && x.status.startsWith('pair'))).length;
      writeLedger(opts.out, r.rows);
      console.log(`SCAN: commits=${r.rows.length} auto=${n('auto')} todo=${n('todo')} pairs=${n('pair')} base=${r.base ? r.base.tag : 'none'} ledger=${opts.out}`);
    } else if (action === 'plan' && dir && file) {
      const r = plan(dir, file, opts), latest = r.releases.length ? r.releases[r.releases.length - 1].tag : r.base ? r.base.tag + ' (unchanged)' : '-';
      console.log([`PLAN: ${r.verdict} releases=${r.releases.length} base=${r.base ? r.base.tag : 'none'} latest=${latest} unreleased=${r.unreleased} head=${r.head.slice(0, 7)}`,
        ...r.releases.map(x => [x.tag, x.sha.slice(0, 7), x.date, x.bump, x.pr ? `PR #${x.pr}` : 'direct', `${x.commits.length} commits`].join('\t')),
        ...r.problems.map(x => '  - ' + x), ...r.warnings.map(x => '  warn: ' + x)].join('\n'));
      if (r.verdict !== 'READY') process.exitCode = 1;
    } else if (action === 'apply' && dir && file) console.log(apply(dir, file, opts).text);
    else if (action === 'check' && dir) { const r = check(dir, file, opts); console.log(r.text); if (r.problems.length) process.exitCode = 1; }
    else { console.error(USAGE); process.exitCode = 64; }
  } catch (e) { console.error('Semver blocked: ' + e.message); process.exitCode = 2; }
}
