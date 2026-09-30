// Git-host seam: which host a repository lives on, whose it is, and what its tracker and merge
// requests report. GitHub through `gh`, GitLab through `glab`; credentials never leave those CLIs.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), a = require('./acceptance.cjs');
// Windows resolves a bare `git` / `gh` / `glab` from the current directory before PATH. This seam runs inside
// repositories it does not trust, so a binary committed there must never be the one that gets executed.
process.env.NoDefaultCurrentDirectoryInExePath = '1';
const enc = encodeURIComponent, cell = v => String(v ?? '').replace(/\s+/g, ' ').trim() || '-';
const TYPES = ['bug', 'feature', 'chore', 'unknown'], PRIORITIES = ['P1', 'P2', 'P3', 'P4', '-'];
const STATUSES = ['todo', 'in-progress', 'in-review', 'changes-requested', 'done', 'blocked', 'dropped'];
const HEADER = 'id\ttype\tpriority\tstatus\ttitle\turl\tbranch\tmr\tevidence';
const USAGE = 'usage: host.cjs detect [dir] | exclude [dir] | issues [dir] [--assignee me|any|<user>] [--label a,b] [--milestone <title>] [--limit N] | mr <number> [dir] | ledger <backlog.tsv> [--live [dir]]';

// glab sends an environment token (GITLAB_TOKEN …) to whatever host it is pointed at. Only gitlab.com and the host the
// user named in GITLAB_HOST may receive it; any other hostname has to rely on credentials stored for that host.
function childEnv(cli, args, env = process.env) {
  const at = args.indexOf('--hostname'), hostname = at < 0 ? null : String(args[at + 1]).toLowerCase();
  const named = [env.GITLAB_HOST, env.GL_HOST].filter(Boolean).map(h => h.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase());
  if (cli !== 'glab' || !hostname || hostname === 'gitlab.com' || named.includes(hostname)) return env;
  return Object.fromEntries(Object.entries(env).filter(([k]) => !['GITLAB_TOKEN', 'GITLAB_ACCESS_TOKEN', 'OAUTH_TOKEN'].includes(k.toUpperCase())));
}
function spawn(cli, args) {
  const r = cp.spawnSync(cli, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024, windowsHide: true, env: childEnv(cli, args) });
  return { status: r.error ? (r.error.code === 'ENOENT' ? 127 : 1) : r.status, stdout: r.stdout || '' };
}
// https://host/group/project.git · ssh://git@host:2222/group/project.git · git@host:group/project.git
// Userinfo (a token in the URL) is dropped, never returned. An http(s) port is the API's port; an ssh port is not.
// Anything that is not a plain hostname and a plain project path is unreadable: both end up in CLI arguments.
function parse(url) {
  let hostname, p;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    try { const u = new URL(url); hostname = /^https?:$/.test(u.protocol) ? u.host : u.hostname; p = u.pathname; } catch { return null; }
  } else { const m = /^(?:[^@/\\\s]+@)?([^:/\\\s]{2,}):(?![\\/])(\S+)$/.exec(url || ''); if (!m) return null; [, hostname, p] = m; }
  hostname = hostname.toLowerCase(); p = p.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  return /^[a-z0-9][a-z0-9.-]*(:\d+)?$/.test(hostname) && /^[\w.-]+(\/[\w.-]+)+$/.test(p) && !p.split('/').some(s => /^\.+$/.test(s)) ? { hostname, project: p } : null;
}
// role is `owner` only for a non-fork repository in the authenticated user's own namespace (or one with no
// remote at all); every doubt resolves to `contributor`, the restrictive side.
function detect(dir = '.', run = spawn, env = process.env) {
  const seen = survey(dir, run, env);
  if (seen.nested) return seen;
  // A pin the user sets by hand in one clone — `git config forge.role owner|contributor` — for a repository that is
  // theirs but does not look it (their own fork, an organisation they own). Local git config never arrives with a
  // clone, so repository content cannot grant it.
  const r = run('git', ['-C', dir, 'config', '--local', '--get', 'forge.role']), pinned = r.status === 0 ? r.stdout.trim() : '';
  a.need(!pinned || ['owner', 'contributor'].includes(pinned), 'git config forge.role must be owner or contributor');
  return pinned && pinned !== seen.role ? { ...seen, role: pinned, basis: `forge.role=${pinned} set in this clone's git config (detected: ${seen.basis})` } : seen;
}
function survey(dir, run, env) {
  const git = (at, ...args) => { const r = run('git', ['-C', at, ...args]); return r.status === 0 ? r.stdout.trim() : ''; };
  const root = git(dir, 'rev-parse', '--show-toplevel');
  a.need(root, 'Not a git repository');
  const listed = run('git', ['-C', dir, 'remote']);
  a.need(listed.status === 0, 'git remote failed; cannot tell where this repository pushes');
  const remotes = listed.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean), remote = remotes.includes('origin') ? 'origin' : remotes[0];
  if (!remote) {
    // A `git init` inside someone else's checkout must not read as a fresh repository of your own.
    const outer = git(path.dirname(root), 'rev-parse', '--show-toplevel');
    if (outer && outer !== root) return { ...detect(outer, run, env), nested: root };
    return { host: 'none', remote: null, cli: null, role: 'owner', basis: 'no remote: nothing leaves this machine' };
  }
  const at = parse(git(dir, 'remote', 'get-url', remote));
  const stranger = basis => ({ host: 'unknown', ...at, upstream: null, default_branch: null, remote, cli: null, auth: 'unknown', user: null, role: 'contributor', basis });
  if (!at) return stranger('unreadable remote: treated as someone else\'s repository');
  a.need(!env.FORGE_HOST || ['github', 'gitlab'].includes(env.FORGE_HOST), 'FORGE_HOST must be github or gitlab');
  const logins = {}, login = cli => logins[cli] ??= run(cli, ['auth', 'status', '--hostname', at.hostname]).status, hint = f => fs.existsSync(path.join(root, f));
  const host = env.FORGE_HOST || (/github/.test(at.hostname) ? 'github' : /gitlab/.test(at.hostname) ? 'gitlab'
    : login('glab') === 0 ? 'gitlab' : login('gh') === 0 ? 'github' : hint('.gitlab-ci.yml') ? 'gitlab' : hint('.github') ? 'github' : null);
  if (!host) return stranger('unrecognized host: treated as someone else\'s repository');
  // Nothing is asked of a host the CLI is not logged in to: its answers would be taken as identity, and an API call is
  // where a token travels.
  const cli = host === 'github' ? 'gh' : 'glab', ask = endpoint => run(cli, ['api', '--hostname', at.hostname, endpoint]);
  const me = login(cli) === 0 ? ask('user') : { status: login(cli), stdout: '' };
  let user = null, upstream = null, branch = null, same = false;
  try { const u = JSON.parse(me.stdout); if (me.status === 0) user = u.login || u.username || null; } catch { /* unauthenticated or missing CLI */ }
  if (user) try {
    const r = ask(host === 'github' ? 'repos/' + at.project : 'projects/' + enc(at.project)), p = JSON.parse(r.stdout);
    if (r.status === 0) {
      upstream = p.parent?.full_name || p.forked_from_project?.path_with_namespace || null; branch = p.default_branch || null;
      // A moved or transferred repository answers under its new name: the record must be the project the remote names.
      same = p.fork !== true && String(p.full_name || p.path_with_namespace || '').toLowerCase() === at.project.toLowerCase();
    }
  } catch { /* an unreadable project record is never proof of ownership */ }
  // Ownership is about where pushes go: another push URL or default push remote is not the repository that was checked.
  const pushes = parse(git(dir, 'remote', 'get-url', '--push', remote)), elsewhere = git(dir, 'config', '--get', 'remote.pushDefault');
  const straight = !!pushes && pushes.hostname === at.hostname && pushes.project === at.project && (!elsewhere || elsewhere === remote);
  const mine = same && !upstream && straight && at.project.split('/')[0].toLowerCase() === user.toLowerCase();
  return { host, ...at, upstream, default_branch: branch, remote, cli, auth: user ? 'ok' : me.status === 127 ? 'missing' : 'unauthenticated', user, role: mine ? 'owner' : 'contributor',
    basis: mine ? 'namespace is the authenticated user' : upstream ? 'fork of ' + upstream : !user ? 'identity unverified: treated as someone else\'s repository'
      : !same ? 'project record unreadable or for another repository: treated as someone else\'s repository'
      : !straight ? 'pushes go somewhere other than the checked remote' : 'namespace is not the authenticated user' };
}
// Keeps forge's run directory out of someone else's history: a local ignore in the repository's own info/exclude,
// never their .gitignore. Refuses when they already track a forge/ directory of their own.
function exclude(dir = '.', run = spawn) {
  const git = (...args) => run('git', ['-C', dir, ...args]), where = git('rev-parse', '--git-path', 'info/exclude');
  a.need(where.status === 0 && where.stdout.trim(), 'Not a git repository');
  a.need(!git('ls-files', '--', 'forge').stdout.trim(), 'This repository already tracks a forge/ directory; ask where the run directory may live');
  const file = path.resolve(dir, where.stdout.trim()), text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (!/^\/forge\/\r?$/m.test(text)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text + (text && !text.endsWith('\n') ? '\n' : '') + '/forge/\n');
  }
  a.need(git('check-ignore', '-q', 'forge/run').status === 0, 'forge/ is still not ignored');
  return file;
}
function api(ctx, endpoint, run = spawn) {
  a.need(ctx.cli, 'No host CLI for this repository');
  const r = run(ctx.cli, ['api', '--hostname', ctx.hostname, endpoint]);
  a.need(r.status === 0, `${ctx.cli} api unavailable (auth: ${ctx.auth}); re-query before acting`);
  return JSON.parse(r.stdout);
}
// Every page, or a refusal: a listing cut short would read as "nothing there".
function pages(ctx, endpoint, run) {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const batch = api(ctx, `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`, run);
    a.need(Array.isArray(batch), 'Unexpected listing from the host');
    all.push(...batch);
    if (batch.length < 100) return all;
  }
  throw Error('More than 2000 entries; check this one by hand');
}
// With a fork as origin, the tracker and the merge requests live in the project it was forked from.
const home = ctx => ctx.upstream || ctx.project;
// ponytail: label-word heuristic, a first pass only; the ledger refuses to start an item until its type and priority are triaged.
function triage(labels, kind) {
  const split = l => String(l).toLowerCase().split(/[^a-z0-9]+/), words = labels.flatMap(split), has = (...w) => w.some(x => words.includes(x));
  const type = kind === 'incident' || has('bug', 'bugs', 'defect', 'regression', 'incident', 'hotfix') ? 'bug'
    : has('feature', 'enhancement', 'story', 'improvement') ? 'feature'
    : has('chore', 'debt', 'refactor', 'refactoring', 'maintenance', 'docs', 'documentation', 'tooling') ? 'chore' : 'unknown';
  const rank = l => { const w = split(l); return w.find(x => /^p[1-4]$/.test(x))?.[1] || (w.some(x => ['priority', 'prio', 'severity', 'sev'].includes(x)) && w.find(x => /^[1-4]$/.test(x))) || null; };
  const n = labels.map(rank).find(Boolean);
  return { type, priority: n ? 'P' + n : has('critical', 'blocker', 'urgent') ? 'P1' : has('high') ? 'P2' : has('medium', 'normal') ? 'P3' : has('low') ? 'P4' : '-' };
}
function issues(ctx, f = {}, run = spawn) {
  a.need(['github', 'gitlab'].includes(ctx.host), 'Issue intake needs a GitHub or GitLab remote; supply the backlog as a file instead');
  const limit = f.limit || 100, who = f.assignee && f.assignee !== 'me' ? f.assignee : null, rows = [];
  a.need(Number.isSafeInteger(limit) && limit > 0, 'Positive --limit required');
  a.need(ctx.host === 'gitlab' || who || ctx.user, 'Authenticated user required to list assigned issues');
  let page = 1, full;
  do {
    const batch = api(ctx, ctx.host === 'gitlab'
      ? `projects/${enc(home(ctx))}/issues?state=opened&per_page=100&page=${page}` + (who === 'any' ? '' : who ? '&assignee_username=' + enc(who) : '&scope=assigned_to_me') + (f.label ? '&labels=' + enc(f.label) : '') + (f.milestone ? '&milestone=' + enc(f.milestone) : '')
      : `repos/${home(ctx)}/issues?state=open&per_page=100&page=${page}` + (who === 'any' ? '' : '&assignee=' + enc(who || ctx.user)) + (f.label ? '&labels=' + enc(f.label) : ''), run);
    a.need(Array.isArray(batch), 'Unexpected issue listing');
    full = batch.length === 100;
    for (const i of batch) {
      if (i.pull_request || (ctx.host === 'github' && f.milestone && i.milestone?.title !== f.milestone)) continue;
      rows.push({ n: i.iid ?? i.number, ...triage((i.labels || []).map(l => l.name || l), i.issue_type), title: cell(i.title), url: i.web_url || i.html_url });
    }
  } while (full && rows.length < limit && ++page <= 20);
  rows.sort((x, y) => PRIORITIES.indexOf(x.priority) - PRIORITIES.indexOf(y.priority) || x.n - y.n);
  return { rows: rows.slice(0, limit), more: full || rows.length > limit };
}
// One normalized answer for "where does this merge request stand": MERGED | READY | WAIT | REWORK | CLOSED.
function mr(ctx, number, run = spawn, project = home(ctx)) {
  a.need(/^[1-9]\d*$/.test(String(number)), 'Merge request number required');
  let v;
  if (ctx.host === 'gitlab') {
    const base = `projects/${enc(project)}/merge_requests/${number}`, m = api(ctx, base + '?with_merge_status_recheck=true&include_diverged_commits_count=true', run), pipe = m.head_pipeline;
    // A thread waits on us when it is unresolved and its last human note is not ours.
    // ponytail: plain (non-thread) comments are read by the agent, not counted here.
    const open = pages(ctx, base + '/discussions', run).filter(d => d.notes?.some(n => n.resolvable && !n.resolved));
    // GitLab reports only the first failing merge check, so "changes requested" is also read from the reviewers themselves.
    let asked = [];
    try { asked = api(ctx, base + '/reviewers', run); } catch { /* older GitLab has no such endpoint; threads and the merge status still apply */ }
    // A merged-results or merge-train pipeline runs on a merge commit, so its sha is never the MR head. GitLab accepts a
    // pipeline whose sha or source sha is the head; the API omits the source sha, but the merge commit's parents carry it.
    // Only a pipeline on this merge request's own merge ref qualifies: a branch pipeline on a child of the head does not.
    const merged = pipe && new RegExp(`^refs/merge-requests/${number}/(merge|train)$`).test(pipe.ref || '');
    const current = pipe && (pipe.sha === m.sha || (merged && (api(ctx, `projects/${pipe.project_id}/repository/commits/${pipe.sha}`, run).parent_ids || []).includes(m.sha)));
    const merge = m.detailed_merge_status || m.merge_status || 'unknown';
    v = { url: m.web_url, state: ['merged', 'closed'].includes(m.state) ? m.state : 'open', draft: !!m.draft, head: m.sha,
      // The key is absent, not null, when this account may not read pipelines: that is unknown, never "no pipeline".
      checks: !('head_pipeline' in m) ? 'unknown' : !pipe || pipe.status === 'skipped' ? 'none' : !current ? 'pending' : pipe.status === 'success' ? 'green' : /^(failed|cancel)/.test(pipe.status) ? 'red' : 'pending',
      pipeline: pipe ? pipe.status : null, merge, settled: !/^(unchecked|checking|preparing|approvals_syncing)$/.test(merge), behind: m.diverged_commits_count ?? null,
      conflicts: m.has_conflicts === true || merge === 'conflict',
      changes: merge === 'requested_changes' || (Array.isArray(asked) && asked.some(r => r.state === 'requested_changes')),
      threads: open.filter(d => d.notes.filter(n => !n.system).at(-1)?.author?.username !== ctx.user).length };
  } else {
    a.need(ctx.host === 'github', 'Merge request status needs a GitHub or GitLab remote');
    const r = run('gh', ['pr', 'view', String(number), '-R', `${ctx.hostname}/${project}`, '--json', 'url,state,isDraft,headRefOid,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup']);
    a.need(r.status === 0, 'gh pr view unavailable; re-query before acting');
    // A check that was skipped did not run: a rollup of nothing but skips is "no checks", never green.
    const p = JSON.parse(r.stdout), runs = (p.statusCheckRollup || []).filter(c => c.conclusion !== 'SKIPPED');
    const bad = c => /^(FAILURE|ERROR|CANCELLED|TIMED_OUT|ACTION_REQUIRED|STARTUP_FAILURE|STALE)$/.test(c.conclusion || c.state || '');
    const busy = c => c.__typename === 'StatusContext' ? /^(PENDING|EXPECTED)$/.test(c.state) : c.status !== 'COMPLETED';
    // ponytail: unresolved GitHub review threads need GraphQL; reviewDecision covers the blocking case. Add when a comment-only review is missed.
    v = { url: p.url, state: String(p.state).toLowerCase(), draft: !!p.isDraft, head: p.headRefOid,
      checks: !runs.length ? 'none' : runs.some(bad) ? 'red' : runs.some(busy) ? 'pending' : 'green',
      pipeline: null, merge: p.mergeStateStatus || 'UNKNOWN', settled: p.mergeable !== 'UNKNOWN', behind: null,
      conflicts: p.mergeable === 'CONFLICTING', changes: p.reviewDecision === 'CHANGES_REQUESTED', threads: null };
  }
  const rework = [v.checks === 'red' && 'checks failed', v.conflicts && 'conflicts with the target branch',
    /^(need_rebase|behind)$/i.test(v.merge) && 'branch must be rebased or updated', v.changes && 'reviewer requested changes',
    v.merge === 'ci_must_pass' && v.checks === 'none' && 'a passing pipeline is required but none ran',
    v.threads > 0 && v.threads + ' review thread(s) awaiting a reply'].filter(Boolean);
  const waits = [v.checks === 'unknown' && 'pipeline status is not visible to this account',
    v.checks === 'pending' && 'checks not finished' + (v.pipeline ? ` (pipeline ${v.pipeline})` : ''),
    !v.settled && 'the host has not computed mergeability yet', v.draft && 'still a draft'].filter(Boolean);
  const verdict = v.state === 'merged' ? 'MERGED' : v.state === 'closed' ? 'CLOSED' : rework.length ? 'REWORK' : waits.length ? 'WAIT' : 'READY';
  return { host: ctx.host, number: Number(number), ...v, verdict, reasons: verdict === 'REWORK' ? rework : verdict === 'WAIT' ? waits : [] };
}
// The merge request a ledger row cites: https://host/group/project/-/merge_requests/12 or https://host/owner/repo/pull/12.
function cite(link) {
  try {
    const u = new URL(link), m = /^\/(.+?)(?:\/-)?\/(?:merge_requests|pull)\/([1-9]\d*)\/?$/.exec(u.pathname);
    return /^https?:$/.test(u.protocol) && m ? { hostname: u.host.toLowerCase(), project: m[1], number: m[2] } : null;
  } catch { return null; }
}
// What the host says about a cited merge request — but only one that belongs to this repository (or the project it was
// forked from): a merged request somewhere else proves nothing about this ledger.
const witness = (ctx, run = spawn) => ref =>
  ref.hostname === ctx.hostname && [ctx.project, ctx.upstream].some(p => p && p.toLowerCase() === ref.project.toLowerCase())
    ? mr(ctx, ref.number, run, ref.project) : { verdict: 'ELSEWHERE', reasons: ['cites a merge request outside this repository'] };
// backlog.tsv is the work queue. `live` (cited merge request -> verdict) additionally checks every claim against the host.
function ledger(file, live) {
  const self = fs.realpathSync(file), dir = path.dirname(self), seen = new Set(), cited = new Set(), errors = [], rows = [], count = Object.fromEntries(STATUSES.map(s => [s, 0]));
  const text = fs.readFileSync(file, 'utf8'), BOM = 0xFEFF;
  for (const [i, line] of (text.charCodeAt(0) === BOM ? text.slice(1) : text).split(/\r?\n/).entries()) {
    if (!line.trim() || line === HEADER) continue;
    const c = line.split('\t'), [id, type, priority, status, , , branch, link, evidence] = c, bad = m => errors.push(`row ${i + 1}: ${m}`);
    // `#` marks a comment, so `#123` as an id would silently drop the row from every count.
    if (line.startsWith('#')) { if (c.length === 9) bad('an id cannot start with #; write the bare tracker number'); continue; }
    if (c.length !== 9) { bad('expected 9 tab-separated columns, got ' + c.length); continue; }
    if (!/^[A-Za-z0-9][\w.-]*$/.test(id) || seen.has(id)) bad('missing, malformed or duplicate id');
    seen.add(id);
    if (!TYPES.includes(type)) bad(`bad type "${type}"`);
    if (!PRIORITIES.includes(priority)) bad(`bad priority "${priority}"`);
    if (!STATUSES.includes(status)) { bad(`bad status "${status}"`); continue; }
    const ref = link === '-' ? null : cite(link), key = ref && [ref.hostname, ref.project.toLowerCase(), ref.number].join(' ');
    count[status]++; rows.push({ id, status, ref, open: !!ref && ['in-progress', 'in-review', 'changes-requested'].includes(status) });
    if (link !== '-' && !ref) bad('unreadable merge request URL');
    if (key && cited.has(key)) bad('merge request already cited by another row');
    if (key) cited.add(key);
    if (!['todo', 'blocked', 'dropped'].includes(status) && (type === 'unknown' || priority === '-')) bad('triage type and priority before starting the item');
    // `done` means the host said the merge request merged, so it has to cite one.
    if (['in-review', 'changes-requested', 'done'].includes(status) && !(a.text(branch) && branch !== '-' && ref)) bad(status + ' needs its branch and merge request URL');
    if (!['todo', 'in-progress'].includes(status)) {
      try { const proof = a.local(dir, evidence); a.need(proof !== self && fs.statSync(proof).size > 0, 'empty'); }
      catch { bad(status + ' needs a non-empty evidence file inside the run directory'); }
    }
  }
  let drift = 0;
  if (live && !errors.length) for (const r of rows) {
    if (!r.ref || !['in-progress', 'in-review', 'changes-requested', 'done'].includes(r.status)) continue;
    const seenOnHost = live(r.ref), agree = { MERGED: ['done'], READY: ['in-review'], REWORK: ['changes-requested', 'in-progress'], WAIT: ['in-progress', 'in-review', 'changes-requested'] }[seenOnHost.verdict] || [];
    if (!agree.includes(r.status)) { drift++; errors.push(`item ${r.id}: ledger says ${r.status}, host says ${seenOnHost.verdict}${seenOnHost.reasons.length ? ' (' + seenOnHost.reasons.join('; ') + ')' : ''}`); }
  }
  return { valid: !errors.length, total: rows.length, remaining: count.todo + count['in-progress'] + count['changes-requested'],
    open: rows.filter(r => r.open).length, count, drift, errors };
}
module.exports = { parse, detect, exclude, triage, issues, mr, cite, witness, ledger, childEnv, HEADER };
if (require.main === module) {
  const [action, ...rest] = process.argv.slice(2), flag = k => { const i = rest.indexOf('--' + k); return i < 0 ? undefined : rest.splice(i, 2)[1]; };
  try {
    if (action === 'detect') console.log(JSON.stringify(detect(rest[0])));
    else if (action === 'exclude') console.log('EXCLUDED: /forge/ in ' + exclude(rest[0]));
    else if (action === 'issues') {
      const f = { assignee: flag('assignee'), label: flag('label'), milestone: flag('milestone'), limit: Number(flag('limit') || 100) }, out = issues(detect(rest[0]), f);
      console.log([HEADER, ...out.rows.map(r => [r.n, r.type, r.priority, 'todo', r.title, r.url, '-', '-', '-'].join('\t')),
        ...(out.more ? [`# truncated at ${f.limit}: more open issues match; raise --limit or narrow the filter`] : [])].join('\n'));
    } else if (action === 'mr') {
      const v = mr(detect(rest[1]), rest[0]);
      console.log(JSON.stringify(v));
      if (!['READY', 'MERGED'].includes(v.verdict)) process.exitCode = 1;
    } else if (action === 'ledger') {
      const at = rest.indexOf('--live'), dir = at < 0 ? null : rest.splice(at, 2)[1] || '.';
      a.need(rest.length === 1, USAGE);
      const r = ledger(rest[0], dir && witness(detect(dir)));
      for (const e of r.errors) console.error(e);
      console.log(`LEDGER: ${r.valid ? 'VALID' : r.drift ? 'DRIFT' : 'INVALID'} total=${r.total} remaining=${r.remaining} open=${r.open} in_review=${r.count['in-review']} done=${r.count.done} blocked=${r.count.blocked} dropped=${r.count.dropped}`);
      if (!r.valid) process.exitCode = 1;
    } else throw Error(USAGE);
  } catch (e) { console.error('Host blocked: ' + e.message); process.exitCode = 2; }
}
