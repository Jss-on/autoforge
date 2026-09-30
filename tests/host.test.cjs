// Git-host seam: detection, ownership, issue intake, merge-request verdicts and the backlog ledger.
// Host answers are injected (no network, no gh/glab needed); one end-to-end block drives the real command line
// against stand-in `glab` / `gh` binaries.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const repo = path.resolve(process.argv[2] || '.'), target = path.join(repo, 'scripts/host.cjs');
if (!fs.existsSync(target)) { console.error('Host seam absent'); process.exit(1); }
const host = require(target);
let n = 0, fail = 0, total = 0;
const test = (name, f) => { total++; try { f(); n++; console.error('PASS: ' + name); } catch (e) { fail++; console.error('FAIL: ' + name + ': ' + e.message); } };
const ok = v => ({ status: 0, stdout: typeof v === 'string' ? v : JSON.stringify(v) }), no = { status: 1, stdout: '' }, missing = { status: 127, stdout: '' };
// What a real CLI prints when the host says no: a JSON error body and a non-zero exit.
const notFound = { status: 1, stdout: '{"message":"404 Project Not Found"}' };
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-host-'));
const put = (rel, text = 'x') => { const f = path.join(scratch, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };

// A fake machine: git remotes, which CLIs exist, which are logged in to the remote's host, and what their APIs answer.
// `api` keys are endpoint substrings (first match wins, so list the specific ones first).
function machine({ url, user, api = {}, clis = ['gh', 'glab'], authed = user ? clis : [], root = scratch, remotes = url ? ['origin'] : [], pushUrl = url, pushDefault = '', remoteFails = false, pin = '' } = {}) {
  const calls = [];
  const run = (cli, args) => {
    calls.push([cli, ...args].join(' '));
    if (cli === 'git') {
      const sub = args.slice(2).join(' ');
      if (sub === 'rev-parse --show-toplevel') return ok(root);
      if (sub === 'remote') return remoteFails ? no : ok(remotes.join('\n') + '\n');
      if (/^remote get-url \S+$/.test(sub)) return ok(url + '\n');
      if (/^remote get-url --push \S+$/.test(sub)) return ok(pushUrl + '\n');
      if (sub === 'config --local --get forge.role') return pin ? ok(pin + '\n') : no;
      return sub === 'config --get remote.pushDefault' && pushDefault ? ok(pushDefault + '\n') : no;
    }
    if (!clis.includes(cli)) return missing;
    if (args[0] === 'auth') return authed.includes(cli) ? ok('') : no;
    if (args[0] === 'pr') return api.pr ? ok(api.pr) : no;
    const endpoint = args[3];
    if (endpoint === 'user') return user ? ok(cli === 'gh' ? { login: user } : { username: user }) : no;
    const hit = Object.keys(api).find(k => endpoint.includes(k));
    return !hit ? notFound : api[hit].raw ? api[hit].raw : ok(typeof api[hit] === 'function' ? api[hit](endpoint) : api[hit]);
  };
  return { run, calls, detect: (env = {}) => host.detect('.', run, env) };
}
// A stand-in binary: this node under another name. Symlink where allowed, else one copy that the others hard-link to.
let copied = null;
function standIn(dest) {
  try { fs.symlinkSync(process.execPath, dest); return; } catch { /* Windows without developer mode */ }
  if (copied) { try { fs.linkSync(copied, dest); return; } catch { /* another volume */ } }
  fs.copyFileSync(process.execPath, dest); copied = dest;
}
const gitlab = { host: 'gitlab', hostname: 'gitlab.com', project: 'acme/api', cli: 'glab', auth: 'ok', user: 'jdoe' };
const github = { host: 'github', hostname: 'github.com', project: 'acme/app', cli: 'gh', auth: 'ok', user: 'jdoe' };

// ---------------------------------------------------------------- remote parsing
test('remote forms parse to hostname and project, never userinfo', () => {
  assert.deepEqual(host.parse('https://gitlab.com/acme/platform/api.git'), { hostname: 'gitlab.com', project: 'acme/platform/api' });
  assert.deepEqual(host.parse('git@GitLab.ACME.io:acme/api.git'), { hostname: 'gitlab.acme.io', project: 'acme/api' });
  assert.deepEqual(host.parse('ssh://git@code.acme.io:2222/acme/api.git'), { hostname: 'code.acme.io', project: 'acme/api' });
  const secret = host.parse('https://oauth2:glpat-SECRET@GitLab.acme.io:8443/acme/api/');
  assert.deepEqual(secret, { hostname: 'gitlab.acme.io:8443', project: 'acme/api' });
  assert.doesNotMatch(JSON.stringify(secret), /SECRET|oauth2/);
  for (const local of ['C:\\work\\api', 'C:/work/api.git', '/srv/git/api.git', '../api', 'file:///srv/git/api.git', 'https://gitlab.com/solo', '', undefined]) assert.equal(host.parse(local), null, String(local));
});
test('a malformed remote is unreadable rather than a leak or a CLI flag', () => {
  // Scheme forgotten, or the token pasted into the path: the secret must not come back as a "project".
  for (const bad of ['oauth2:glpat-SECRET@gitlab.com/acme/api.git', 'https://gitlab.com/oauth2:glpat-SECRET@acme/api.git',
    'git@-oProxyCommand=x:acme/api.git', 'git@gitlab.com:acme/../../api.git', 'git@gitlab.com:acme/a b.git', 'git@gitlab.com:acme/api;id.git'])
    assert.equal(host.parse(bad), null, bad);
  // A query string or fragment never becomes part of the project.
  assert.deepEqual(host.parse('https://gitlab.com/acme/api.git?x=1#--flag'), { hostname: 'gitlab.com', project: 'acme/api' });
  const d = machine({ url: 'oauth2:glpat-SECRET@gitlab.com/acme/api.git', user: 'jdoe' }).detect();
  assert.deepEqual([d.host, d.role], ['unknown', 'contributor']);
  assert.doesNotMatch(JSON.stringify(d), /SECRET/);
});

// ---------------------------------------------------------------- whose repository
test('a GitLab group project is a contributor repository', () => {
  const d = machine({ url: 'git@gitlab.com:acme/platform/api.git', user: 'jdoe', api: { 'projects/acme%2Fplatform%2Fapi': { path_with_namespace: 'acme/platform/api', default_branch: 'develop' } } }).detect();
  assert.deepEqual([d.host, d.hostname, d.project, d.cli, d.auth, d.user, d.role], ['gitlab', 'gitlab.com', 'acme/platform/api', 'glab', 'ok', 'jdoe', 'contributor']);
  assert.deepEqual([d.basis, d.default_branch, d.upstream], ['namespace is not the authenticated user', 'develop', null]);
});
test('a personal project is owned; a fork of someone else is not', () => {
  const own = machine({ url: 'https://gitlab.com/JDoe/notes.git', user: 'jdoe', api: { 'projects/JDoe%2Fnotes': { path_with_namespace: 'jdoe/notes', default_branch: 'main' } } }).detect();
  assert.deepEqual([own.role, own.default_branch], ['owner', 'main']);
  const fork = machine({ url: 'https://gitlab.com/jdoe/api.git', user: 'jdoe', api: { 'projects/jdoe%2Fapi': { path_with_namespace: 'jdoe/api', forked_from_project: { path_with_namespace: 'acme/api' } } } }).detect();
  assert.deepEqual([fork.role, fork.basis, fork.upstream], ['contributor', 'fork of acme/api', 'acme/api']);
});
test('GitHub: own repository is owner, organisation repository is contributor', () => {
  const own = machine({ url: 'https://github.com/Jss-on/app.git', user: 'jss-on', api: { 'repos/Jss-on/app': { full_name: 'Jss-on/app', fork: false } } }).detect();
  assert.deepEqual([own.host, own.cli, own.role], ['github', 'gh', 'owner']);
  assert.equal(machine({ url: 'https://github.com/acme/app.git', user: 'jss-on', api: { 'repos/acme/app': { full_name: 'acme/app' } } }).detect().role, 'contributor');
  const fork = machine({ url: 'https://github.com/jss-on/app.git', user: 'jss-on', api: { 'repos/jss-on/app': { full_name: 'jss-on/app', fork: true, parent: { full_name: 'acme/app' } } } }).detect();
  assert.deepEqual([fork.role, fork.upstream], ['contributor', 'acme/app']);
});
test('a project record is proof of ownership only when it is this repository', () => {
  const url = 'https://github.com/jdoe/tool.git';
  // Transferred to an organisation: the old URL still answers, under the new name.
  assert.equal(machine({ url, user: 'jdoe', api: { 'repos/jdoe/tool': { full_name: 'acme/tool', fork: false } } }).detect().role, 'contributor');
  assert.equal(machine({ url, user: 'jdoe', api: { 'repos/jdoe/tool': { full_name: 'jdoe/tool', fork: true } } }).detect().role, 'contributor');
  // The host said no: an error body is not a record, whatever the exit path.
  const denied = machine({ url, user: 'jdoe' }).detect();
  assert.deepEqual([denied.role, denied.basis], ['contributor', 'project record unreadable or for another repository: treated as someone else\'s repository']);
  assert.equal(machine({ url, user: 'jdoe', api: { 'repos/jdoe/tool': { message: '404' } } }).detect().role, 'contributor');
  // A failed call is a failed call, even when its output happens to look like the right record.
  assert.equal(machine({ url, user: 'jdoe', api: { 'repos/jdoe/tool': { raw: { status: 1, stdout: '{"full_name":"jdoe/tool"}' } } } }).detect().role, 'contributor');
  assert.equal(machine({ url, user: 'jdoe', api: { 'repos/jdoe/tool': { full_name: 'jdoe/tool' } } }).detect().role, 'owner');
});
test('a host the CLI is not logged in to is never asked who we are', () => {
  // The remote names an attacker's server; it would happily answer "you are pwn, and this is your project".
  const m = machine({ url: 'https://gitlab.attacker.example/pwn/app.git', user: 'pwn', authed: [], api: { 'projects/pwn%2Fapp': { path_with_namespace: 'pwn/app' } } });
  const d = m.detect();
  assert.deepEqual([d.auth, d.user, d.role], ['unauthenticated', null, 'contributor']);
  assert.ok(m.calls.every(c => !/ api /.test(c)), 'no API call may reach a host without a login');
});
test('an environment token is only passed to gitlab.com or the host the user named', () => {
  const env = { PATH: 'x', GITLAB_TOKEN: 't', gitlab_access_token: 't', OAUTH_TOKEN: 't', GITLAB_HOST: 'https://gitlab.acme.io/' };
  const args = h => ['api', '--hostname', h, 'user'], kept = e => Object.keys(e).filter(k => /token/i.test(k)).length;
  assert.equal(kept(host.childEnv('glab', args('gitlab.attacker.example'), env)), 0);
  assert.equal(host.childEnv('glab', args('gitlab.attacker.example'), env).PATH, 'x');
  assert.equal(kept(host.childEnv('glab', args('gitlab.com'), env)), 3);
  assert.equal(kept(host.childEnv('glab', args('GitLab.acme.io'), env)), 3);
  assert.equal(kept(host.childEnv('gh', args('github.attacker.example'), env)), 3, 'gh is gated by its own auth status, its env is untouched');
});
test('pushes that go somewhere else are not an owned repository', () => {
  const mine = { url: 'https://github.com/jdoe/notes.git', user: 'jdoe', api: { 'repos/jdoe/notes': { full_name: 'jdoe/notes' } } };
  assert.equal(machine(mine).detect().role, 'owner');
  const redirected = machine({ ...mine, pushUrl: 'https://github.com/acme/product.git' }).detect();
  assert.deepEqual([redirected.role, redirected.basis], ['contributor', 'pushes go somewhere other than the checked remote']);
  assert.equal(machine({ ...mine, remotes: ['origin', 'company'], pushDefault: 'company' }).detect().role, 'contributor');
  assert.equal(machine({ ...mine, pushDefault: 'origin' }).detect().role, 'owner');
});
test('only a pin in the clone\'s own git config can overrule detection', () => {
  // Your own fork, or an organisation you own: detection says contributor until you say otherwise, once, in that clone.
  const fork = { url: 'https://github.com/jdoe/tool.git', user: 'jdoe', api: { 'repos/jdoe/tool': { full_name: 'jdoe/tool', fork: true, parent: { full_name: 'acme/tool' } } } };
  assert.equal(machine(fork).detect().role, 'contributor');
  const pinned = machine({ ...fork, pin: 'owner' }).detect();
  assert.deepEqual([pinned.role, pinned.basis, pinned.upstream], ['owner', 'forge.role=owner set in this clone\'s git config (detected: fork of acme/tool)', 'acme/tool']);
  const mine = { url: 'https://github.com/jdoe/notes.git', user: 'jdoe', api: { 'repos/jdoe/notes': { full_name: 'jdoe/notes' } } };
  assert.equal(machine({ ...mine, pin: 'contributor' }).detect().role, 'contributor');
  assert.equal(machine({ ...mine, pin: 'owner' }).detect().basis, 'namespace is the authenticated user');
  assert.throws(() => machine({ ...mine, pin: 'admin' }).detect(), /forge\.role must be owner or contributor/);
  // The environment and the repository's own files are not that pin.
  assert.equal(machine(fork).detect({ FORGE_ROLE: 'owner', ROLE: 'owner' }).role, 'contributor');
});
test('origin is the remote that counts; a failing git is not "no remote"', () => {
  const m = machine({ url: 'https://gitlab.com/acme/api.git', user: 'jdoe', remotes: ['backup', 'origin', 'upstream'] });
  assert.equal(m.detect().remote, 'origin');
  assert.ok(m.calls.includes('git -C . remote get-url origin'));
  assert.equal(machine({ url: 'https://gitlab.com/acme/api.git', user: 'jdoe', remotes: ['company'] }).detect().remote, 'company');
  assert.throws(() => machine({ url: 'https://gitlab.com/acme/api.git', remoteFails: true }).detect(), /git remote failed/);
});
test('a self-managed host is recognised by CLI login, then by its CI file, else unknown', () => {
  const url = 'https://code.acme.io/acme/api.git';
  assert.equal(machine({ url, user: 'jdoe', authed: ['glab'] }).detect().host, 'gitlab');
  assert.equal(machine({ url, user: 'jdoe', authed: ['gh'] }).detect().host, 'github');
  assert.equal(machine({ url, authed: [], root: path.dirname(put('withci/.gitlab-ci.yml')) }).detect().host, 'gitlab');
  const unknown = machine({ url, authed: [], root: path.dirname(put('plain/README.md')) }).detect();
  assert.deepEqual([unknown.host, unknown.cli, unknown.role], ['unknown', null, 'contributor']);
});
test('a missing or logged-out CLI fails closed to contributor', () => {
  const gone = machine({ url: 'https://gitlab.com/jdoe/notes.git', user: 'jdoe', clis: [] }).detect();
  assert.deepEqual([gone.auth, gone.user, gone.role], ['missing', null, 'contributor']);
  const out = machine({ url: 'https://gitlab.com/jdoe/notes.git' }).detect();
  assert.deepEqual([out.auth, out.role], ['unauthenticated', 'contributor']);
});
test('no remote is a local repository; FORGE_HOST overrides and rejects junk', () => {
  const local = machine({}).detect();
  assert.deepEqual([local.host, local.role], ['none', 'owner']);
  const m = machine({ url: 'https://code.acme.io/acme/api.git', user: 'jdoe' });
  assert.equal(m.detect({ FORGE_HOST: 'gitlab' }).host, 'gitlab');
  assert.throws(() => m.detect({ FORGE_HOST: 'bitbucket' }), /FORGE_HOST/);
  assert.throws(() => host.detect('.', () => no, {}), /Not a git repository/);
});
test('a repository nested inside another takes the outer repository role', () => {
  // `git init` in services/new of a company checkout: no remote of its own, but it is not a fresh repository of yours.
  const roots = { inner: '/work/api/services/new', outer: '/work/api' };
  const run = (cli, args) => {
    if (cli !== 'git') return cli === 'glab' && args[0] === 'auth' ? ok('') : cli === 'glab' && args[3] === 'user' ? ok({ username: 'jdoe' }) : notFound;
    const [at, ...sub] = args.slice(1), inside = at.startsWith(roots.inner) ? roots.inner : at.startsWith(roots.outer) ? roots.outer : null;
    if (sub.join(' ') === 'rev-parse --show-toplevel') return inside ? ok(inside) : no;
    if (sub.join(' ') === 'remote') return ok(inside === roots.outer ? 'origin\n' : '');
    // Whoever ran `git init` in there could also have pinned it: a nested repository's own pin does not count.
    if (sub.join(' ') === 'config --local --get forge.role') return inside === roots.inner ? ok('owner\n') : no;
    return /^remote get-url (--push )?origin$/.test(sub.join(' ')) && inside === roots.outer ? ok('git@gitlab.com:acme/api.git') : no;
  };
  const d = host.detect(roots.inner, run, {});
  assert.deepEqual([d.host, d.project, d.role, d.nested], ['gitlab', 'acme/api', 'contributor', roots.inner]);
  // A lone repository with no remote and nothing around it is still local work.
  assert.equal(host.detect('/work/solo', (cli, args) => cli === 'git' && args[1] === '/work/solo' && args[2] === 'rev-parse' ? ok('/work/solo') : cli === 'git' && args[2] === 'remote' ? ok('') : no, {}).role, 'owner');
});

// ---------------------------------------------------------------- issue intake
const issue = (iid, labels, extra = {}) => ({ iid, title: 'Issue ' + iid, labels, web_url: 'https://gitlab.com/acme/api/-/issues/' + iid, ...extra });
test('GitLab intake: assigned-to-me query, label triage, priority order', () => {
  const m = machine({ api: { '/issues?': [
    issue(9, ['type::feature', 'priority::low', 'sprint 1']), issue(4, ['bug', 'P2']), issue(12, ['critical'], { title: 'Login\tbroken\nbadly' }),
    issue(3, []), issue(7, ['priority::2', 'tech-debt']), issue(5, [], { issue_type: 'incident' }),
  ] } });
  const out = host.issues(gitlab, { label: 'team::core,bug', milestone: 'Q3 cleanup' }, m.run);
  const query = m.calls.find(c => c.includes('/issues?'));
  for (const part of ['glab api --hostname gitlab.com projects/acme%2Fapi/issues?state=opened', 'scope=assigned_to_me', 'labels=team%3A%3Acore%2Cbug', 'milestone=Q3%20cleanup']) assert.ok(query.includes(part), part);
  assert.deepEqual(out.rows.map(r => [r.n, r.type, r.priority]), [[12, 'unknown', 'P1'], [4, 'bug', 'P2'], [7, 'chore', 'P2'], [9, 'feature', 'P4'], [3, 'unknown', '-'], [5, 'bug', '-']]);
  assert.equal(out.rows[0].title, 'Login broken badly');
  assert.equal(out.more, false);
  host.issues(gitlab, { assignee: 'asmith' }, m.run);
  assert.ok(m.calls.at(-1).includes('assignee_username=asmith'));
  host.issues(gitlab, { assignee: 'any' }, m.run);
  assert.doesNotMatch(m.calls.at(-1), /assignee|scope/);
});
test('GitHub intake: pull requests excluded, assignee is the login, milestone matched by title', () => {
  const gh = (number, extra = {}) => ({ number, title: 'Issue ' + number, labels: [{ name: 'bug' }], html_url: 'https://github.com/acme/app/issues/' + number, ...extra });
  const m = machine({ api: { '/issues?': [gh(1, { milestone: { title: 'v2' } }), gh(2, { pull_request: {} }), gh(3, { milestone: { title: 'v3' } })] } });
  const out = host.issues(github, { milestone: 'v2' }, m.run);
  assert.ok(m.calls[0].includes('gh api --hostname github.com repos/acme/app/issues?state=open') && m.calls[0].includes('assignee=jdoe'));
  assert.deepEqual(out.rows.map(r => [r.n, r.type, r.url]), [[1, 'bug', 'https://github.com/acme/app/issues/1']]);
  // GitHub's issues endpoint also returns pull requests; without any filter, #2 must still be left out.
  assert.deepEqual(host.issues(github, {}, m.run).rows.map(r => r.n), [1, 3]);
  assert.throws(() => host.issues({ ...github, user: null }, {}, m.run), /Authenticated user/);
});
test('intake pages and says when it stopped short', () => {
  const pages = endpoint => Array.from({ length: /page=1$|page=1&/.test(endpoint) ? 100 : 5 }, (_, i) => issue((/page=1$|page=1&/.test(endpoint) ? 0 : 100) + i + 1, ['bug']));
  const all = host.issues(gitlab, { limit: 200 }, machine({ api: { '/issues?': pages } }).run);
  assert.deepEqual([all.rows.length, all.more], [105, false]);
  const cut = host.issues(gitlab, { limit: 100 }, machine({ api: { '/issues?': pages } }).run);
  assert.deepEqual([cut.rows.length, cut.more], [100, true]);
});
test('intake refuses an unknown host and a failing API', () => {
  assert.throws(() => host.issues({ host: 'unknown' }, {}, () => no), /supply the backlog as a file/);
  assert.throws(() => host.issues(gitlab, {}, () => no), /api unavailable/);
});

// ---------------------------------------------------------------- merge-request verdicts (GitLab)
const sha = 'a'.repeat(40);
const merge = (over = {}) => ({ web_url: 'https://gitlab.com/acme/api/-/merge_requests/7', state: 'opened', draft: false, sha, has_conflicts: false, detailed_merge_status: 'mergeable', head_pipeline: { id: 1, sha, status: 'success' }, ...over });
const note = (username, over = {}) => ({ author: { username }, resolvable: true, resolved: false, system: false, ...over });
// A merged-results pipeline runs on a merge commit: its sha is not the MR head, the head is one of its parents.
const mergeRef = { id: 2, project_id: 5, sha: 'b'.repeat(40), status: 'success', ref: 'refs/merge-requests/7/merge' };
const world = (m, discussions = [], parents = [], reviewers) => machine({ api: { 'merge_requests/7/discussions': discussions, ...(reviewers ? { 'merge_requests/7/reviewers': reviewers } : {}), 'merge_requests/7': m, 'repository/commits/': { parent_ids: parents } } });
const stand = (m, discussions, parents, reviewers) => host.mr(gitlab, 7, world(m, discussions, parents, reviewers).run);
test('a green pipeline on the head commit with no waiting thread is READY', () => {
  const v = stand(merge());
  assert.deepEqual([v.verdict, v.checks, v.state, v.threads, v.reasons], ['READY', 'green', 'open', 0, []]);
  const w = world(merge({ head_pipeline: mergeRef }), [], ['c'.repeat(40), sha]);
  assert.equal(host.mr(gitlab, 7, w.run).checks, 'green');
  assert.ok(w.calls.includes('glab api --hostname gitlab.com projects/5/repository/commits/' + mergeRef.sha));
});
test('a pipeline that did not run on the current head is never green', () => {
  // The last pipeline passed, but on an older push: its merge commit does not have the current head as a parent.
  const stale = stand(merge({ head_pipeline: mergeRef }), [], ['c'.repeat(40), 'd'.repeat(40)]);
  assert.deepEqual([stale.verdict, stale.checks], ['WAIT', 'pending']);
  // A branch pipeline on a child of the head (the branch was reset back) has the head as a parent too; it is not a merge-ref pipeline.
  for (const ref of ['fix-login', 'refs/merge-requests/8/merge', undefined])
    assert.equal(stand(merge({ head_pipeline: { ...mergeRef, ref } }), [], [sha]).checks, 'pending', String(ref));
  assert.equal(stand(merge({ head_pipeline: { ...mergeRef, ref: 'refs/merge-requests/7/train' } }), [], [sha]).checks, 'green');
});
test('running, draft, unsettled or invisible is WAIT, each with its reason', () => {
  assert.equal(stand(merge({ head_pipeline: { sha, status: 'running' } })).verdict, 'WAIT');
  assert.deepEqual(stand(merge({ head_pipeline: { sha, status: 'manual' } })).reasons, ['checks not finished (pipeline manual)']);
  assert.deepEqual([stand(merge({ draft: true })).verdict, stand(merge({ draft: true })).reasons], ['WAIT', ['still a draft']]);
  // Mergeability not computed yet is not "no conflict".
  for (const status of ['unchecked', 'checking', 'preparing']) {
    const v = stand(merge({ detailed_merge_status: status }));
    assert.deepEqual([v.verdict, v.settled, v.reasons], ['WAIT', false, ['the host has not computed mergeability yet']], status);
  }
  // No permission to read pipelines: the key is absent. That is unknown, not "no pipeline".
  const blind = merge(); delete blind.head_pipeline;
  assert.deepEqual([stand(blind).verdict, stand(blind).checks, stand(blind).reasons], ['WAIT', 'unknown', ['pipeline status is not visible to this account']]);
  assert.deepEqual(stand(merge({ draft: true, head_pipeline: { sha, status: 'running' } })).reasons, ['checks not finished (pipeline running)', 'still a draft']);
});
test('failed pipeline, conflict, rebase, requested changes or an unanswered thread is REWORK', () => {
  for (const over of [{ head_pipeline: { sha, status: 'failed' } }, { head_pipeline: { sha, status: 'canceled' } }, { has_conflicts: true }, { detailed_merge_status: 'conflict' },
    { detailed_merge_status: 'need_rebase' }, { detailed_merge_status: 'requested_changes' }]) assert.equal(stand(merge(over)).verdict, 'REWORK', JSON.stringify(over));
  const v = stand(merge(), [{ notes: [note('reviewer')] }, { notes: [note('jdoe'), note('reviewer')] }]);
  assert.deepEqual([v.verdict, v.threads, v.reasons], ['REWORK', 2, ['2 review thread(s) awaiting a reply']]);
  // GitLab reports only the first failing merge check: a reviewer's "changes requested" can hide behind another status.
  const hidden = stand(merge({ detailed_merge_status: 'not_approved' }), [], [], [{ user: { username: 'lead' }, state: 'requested_changes' }]);
  assert.deepEqual([hidden.verdict, hidden.reasons], ['REWORK', ['reviewer requested changes']]);
  assert.equal(stand(merge({ detailed_merge_status: 'not_approved' }), [], [], [{ user: { username: 'lead' }, state: 'unreviewed' }]).verdict, 'READY');
});
test('a thread we answered last is not rework; resolved threads and system notes are ignored', () => {
  const v = stand(merge(), [
    { notes: [note('reviewer'), note('jdoe'), note('gitlab-bot', { system: true, resolvable: false })] },
    { notes: [note('reviewer', { resolved: true })] },
    { notes: [note('reviewer', { resolvable: false })] },
  ]);
  assert.deepEqual([v.verdict, v.threads], ['READY', 0]);
});
test('every page of discussions is read, or the gate refuses', () => {
  // GitLab lists oldest first and counts system notes, so the newest reviewer thread is the one a single page would cut.
  const system = { notes: [note('gitlab-bot', { system: true, resolvable: false })] }, page = e => Number(/[?&]page=(\d+)/.exec(e)[1]);
  const late = machine({ api: { 'merge_requests/7/discussions': e => page(e) === 1 ? Array(100).fill(system) : [{ notes: [note('reviewer')] }], 'merge_requests/7': merge() } });
  assert.deepEqual([host.mr(gitlab, 7, late.run).verdict, host.mr(gitlab, 7, late.run).threads], ['REWORK', 1]);
  const endless = machine({ api: { 'merge_requests/7/discussions': Array(100).fill(system), 'merge_requests/7': merge() } });
  assert.throws(() => host.mr(gitlab, 7, endless.run), /More than 2000 entries/);
});
test('merged and closed are terminal; no pipeline reports none, never green', () => {
  assert.deepEqual([stand(merge({ state: 'merged' })).verdict, stand(merge({ state: 'merged', draft: true })).reasons], ['MERGED', []]);
  assert.equal(stand(merge({ state: 'closed', head_pipeline: { sha, status: 'failed' } })).verdict, 'CLOSED');
  const bare = stand(merge({ head_pipeline: null }));
  assert.deepEqual([bare.verdict, bare.checks], ['READY', 'none']);
  assert.equal(stand(merge({ head_pipeline: { sha, status: 'skipped' } })).checks, 'none');
  assert.deepEqual(stand(merge({ head_pipeline: null, detailed_merge_status: 'ci_must_pass' })).reasons, ['a passing pipeline is required but none ran']);
  assert.equal(stand(merge({ diverged_commits_count: 12 })).behind, 12);
});

// ---------------------------------------------------------------- merge-request verdicts (GitHub)
test('GitHub rollup: green READY, failure or requested changes REWORK, running WAIT', () => {
  const pr = (over = {}) => ({ url: 'https://github.com/acme/app/pull/9', state: 'OPEN', isDraft: false, headRefOid: sha, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', reviewDecision: '',
    statusCheckRollup: [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' }, { __typename: 'StatusContext', state: 'SUCCESS' }], ...over });
  const see = over => { const m = machine({ api: { pr: pr(over) } }); return [host.mr(github, 9, m.run), m.calls[0]]; };
  const check = (conclusion, status = 'COMPLETED') => ({ __typename: 'CheckRun', status, conclusion });
  const [ready, call] = see();
  assert.deepEqual([ready.verdict, ready.checks, ready.threads], ['READY', 'green', null]);
  assert.ok(call.startsWith('gh pr view 9 -R github.com/acme/app --json '));
  for (const conclusion of ['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE'])
    assert.equal(see({ statusCheckRollup: [check('SUCCESS'), check(conclusion)] })[0].verdict, 'REWORK', conclusion);
  assert.equal(see({ statusCheckRollup: [{ __typename: 'StatusContext', state: 'ERROR' }] })[0].verdict, 'REWORK');
  assert.equal(see({ reviewDecision: 'CHANGES_REQUESTED' })[0].verdict, 'REWORK');
  assert.equal(see({ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' })[0].verdict, 'REWORK');
  assert.equal(see({ mergeStateStatus: 'BEHIND' })[0].verdict, 'REWORK');
  assert.equal(see({ statusCheckRollup: [check('', 'IN_PROGRESS')] })[0].verdict, 'WAIT');
  assert.equal(see({ statusCheckRollup: [check('SUCCESS'), { __typename: 'StatusContext', state: 'PENDING' }] })[0].verdict, 'WAIT');
  assert.deepEqual([see({ isDraft: true })[0].verdict, see({ isDraft: true })[0].reasons], ['WAIT', ['still a draft']]);
  assert.deepEqual([see({ mergeable: 'UNKNOWN' })[0].verdict, see({ mergeable: 'UNKNOWN' })[0].reasons], ['WAIT', ['the host has not computed mergeability yet']]);
  assert.equal(see({ statusCheckRollup: [] })[0].checks, 'none');
  // Nothing ran: a rollup of skipped checks is not a pass.
  assert.equal(see({ statusCheckRollup: [check('SKIPPED')] })[0].checks, 'none');
  assert.equal(see({ statusCheckRollup: [check('SKIPPED'), check('NEUTRAL')] })[0].checks, 'green');
  assert.equal(see({ state: 'MERGED', mergeable: 'UNKNOWN' })[0].verdict, 'MERGED');
});
test('a host outage or a junk number blocks instead of guessing', () => {
  assert.throws(() => host.mr(gitlab, 7, () => no), /api unavailable/);
  assert.throws(() => host.mr(github, 9, () => no), /gh pr view unavailable/);
  for (const junk of ['abc', '0', '7; rm -rf /', '']) assert.throws(() => host.mr(gitlab, junk, () => no), /number required/);
  assert.throws(() => host.mr({ host: 'unknown' }, 7, () => no), /GitHub or GitLab/);
});
test('a fork reads issues and merge requests from its upstream project', () => {
  const fork = { ...gitlab, project: 'jdoe/api', upstream: 'acme/api' };
  const m = machine({ api: { '/issues?': [issue(8, ['bug'])], 'merge_requests/7/discussions': [], 'merge_requests/7': merge() } });
  host.issues(fork, {}, m.run);
  assert.ok(m.calls.at(-1).includes('projects/acme%2Fapi/issues?'), m.calls.at(-1));
  host.mr(fork, 7, m.run);
  assert.ok(m.calls.every(c => !c.includes('jdoe%2Fapi')) && m.calls.some(c => c.includes('projects/acme%2Fapi/merge_requests/7')));
  const g = machine({ api: { '/issues?': [], pr: { url: 'u', state: 'OPEN', statusCheckRollup: [] } } }), ghFork = { ...github, project: 'jdoe/app', upstream: 'acme/app' };
  host.issues(ghFork, {}, g.run);
  assert.ok(g.calls.at(-1).includes('repos/acme/app/issues?'), g.calls.at(-1));
  host.mr(ghFork, 9, g.run);
  assert.ok(g.calls.at(-1).includes('-R github.com/acme/app '), g.calls.at(-1));
});

// ---------------------------------------------------------------- the ledger
const run1 = path.join(scratch, 'run');
for (const f of ['3/green.txt', '4/rework.md', '5/merged.txt', '6/blocked.md', '7/dropped.md']) put('run/evidence/' + f);
put('run/evidence/empty.txt', '');
const row = (id, type, priority, status, branch = '-', mr = '-', evidence = '-') => [id, type, priority, status, 'Title ' + id, 'https://gitlab.com/acme/api/-/issues/' + id, branch, mr, evidence].join('\t');
const MR = n => 'https://gitlab.com/acme/api/-/merge_requests/' + n;
const book = (name, rows) => put('run/' + name, [host.HEADER, '# filter: assigned to me', ...rows, ''].join('\r\n'));
const good = [row('1', 'unknown', '-', 'todo'), row('2', 'bug', 'P1', 'in-progress', '2-fix-login'),
  row('3', 'bug', 'P2', 'in-review', '3-null-total', MR(30), 'evidence/3/green.txt'), row('4', 'feature', 'P3', 'changes-requested', '4-export', MR(40), 'evidence/4/rework.md'),
  row('5', 'chore', 'P4', 'done', '5-bump', MR(50), 'evidence/5/merged.txt'), row('PROJ-6', 'unknown', '-', 'blocked', '-', '-', 'evidence/6/blocked.md'),
  row('B-7', 'feature', 'P3', 'dropped', '-', '-', 'evidence/7/dropped.md')];
test('a valid ledger counts the work that remains and the merge requests still open', () => {
  const r = host.ledger(book('backlog.tsv', good));
  assert.deepEqual([r.valid, r.total, r.remaining, r.open, r.count['in-review'], r.count.done, r.count.blocked, r.count.dropped, r.errors], [true, 7, 3, 2, 1, 1, 1, 1, []]);
  // A UTF-8 byte-order mark (Notepad, a spreadsheet export) must not turn the header into a bad row.
  const marked = put('run/marked.tsv', String.fromCharCode(0xFEFF) + [host.HEADER, ...good].join('\n'));
  assert.deepEqual([host.ledger(marked).valid, host.ledger(marked).total], [true, 7]);
});
test('the ledger rejects bad enums, bad or duplicate ids and short rows', () => {
  for (const [rows, message] of [
    [[row('1', 'epic', 'P1', 'todo')], /bad type/], [[row('1', 'bug', 'P9', 'todo')], /bad priority/], [[row('1', 'bug', 'P1', 'verified')], /bad status/],
    [[row('1', 'bug', 'P1', 'todo'), row('1', 'bug', 'P1', 'todo')], /duplicate id/], [['1\tbug\tP1\ttodo'], /9 tab-separated columns/],
    [[row('a b', 'bug', 'P1', 'todo')], /malformed/], [[row('-1', 'bug', 'P1', 'todo')], /malformed/],
    // `#` marks a comment: `#1` as an id must be an error, never a row that silently drops out of the counts.
    [[row('#1', 'bug', 'P1', 'todo')], /cannot start with #/],
  ]) { const r = host.ledger(book('bad.tsv', rows)); assert.equal(r.valid, false); assert.match(r.errors.join('\n'), message); }
});
test('untriaged items cannot start; review states and done need a branch, a merge request and evidence', () => {
  const errors = rows => host.ledger(book('bad.tsv', rows)).errors.join('\n');
  assert.match(errors([row('1', 'unknown', 'P1', 'in-progress')]), /triage type and priority/);
  assert.match(errors([row('1', 'bug', '-', 'in-review', 'b', MR(1), 'evidence/3/green.txt')]), /triage type and priority/);
  assert.match(errors([row('1', 'bug', 'P1', 'in-review', '-', MR(1), 'evidence/3/green.txt')]), /needs its branch and merge request URL/);
  // `done` means the host said "merged": it has to cite the merge request that was.
  assert.match(errors([row('1', 'bug', 'P1', 'done', 'b', '-', 'evidence/3/green.txt')]), /done needs its branch and merge request URL/);
  for (const link of ['MR 12', 'https://gitlab.com/acme/api/-/merge_requests/', 'https://gitlab.com/acme/api/-/issues/12', 'ftp://gitlab.com/acme/api/-/merge_requests/12'])
    assert.match(errors([row('1', 'bug', 'P1', 'changes-requested', 'b', link, 'evidence/3/green.txt')]), /unreadable merge request URL/, link);
  assert.match(errors([row('1', 'bug', 'P1', 'done', 'b', MR(9), 'evidence/3/green.txt'), row('2', 'bug', 'P1', 'done', 'c', MR(9) + '/', 'evidence/4/rework.md')]), /already cited by another row/);
  // Evidence is a real, non-empty file inside the run directory, and never the ledger pointing at itself.
  for (const evidence of ['-', 'evidence/none.txt', '../run/evidence/3/green.txt', path.join(run1, 'evidence/3/green.txt'), 'evidence/3', 'evidence/empty.txt', 'bad.tsv'])
    assert.match(errors([row('1', 'bug', 'P1', 'done', 'b', MR(1), evidence)]), /needs a non-empty evidence file inside the run directory/, evidence);
});
test('live check: every ledger claim must match what the host says', () => {
  const says = map => ref => ({ verdict: map[ref.number], reasons: map[ref.number] === 'REWORK' ? ['checks failed'] : [] });
  const agree = host.ledger(book('backlog.tsv', good), says({ 30: 'READY', 40: 'REWORK', 50: 'MERGED' }));
  assert.deepEqual([agree.valid, agree.drift], [true, 0]);
  assert.equal(host.ledger(book('backlog.tsv', good), says({ 30: 'WAIT', 40: 'WAIT', 50: 'MERGED' })).drift, 0);
  const drift = host.ledger(book('backlog.tsv', good), says({ 30: 'REWORK', 40: 'READY', 50: 'CLOSED' }));
  assert.deepEqual([drift.valid, drift.drift], [false, 3]);
  assert.match(drift.errors.join('\n'), /item 3: ledger says in-review, host says REWORK \(checks failed\)/);
  assert.match(drift.errors.join('\n'), /item 5: ledger says done, host says CLOSED/);
  // The status ceiling, mechanically: a merge request that is merely ready for review is not done.
  const early = host.ledger(book('backlog.tsv', good), says({ 30: 'READY', 40: 'REWORK', 50: 'READY' }));
  assert.deepEqual([early.drift, early.errors], [1, ['item 5: ledger says done, host says READY']]);
  // An item still being worked may have an open merge request: waiting or red is consistent, ready or merged is not.
  const working = verdict => host.ledger(book('wip.tsv', [row('2', 'bug', 'P1', 'in-progress', '2-fix-login', MR(20))]), says({ 20: verdict })).drift;
  assert.deepEqual(['WAIT', 'REWORK', 'READY', 'MERGED', 'CLOSED'].map(working), [0, 0, 1, 1, 1]);
});
test('only a merge request of this repository can vouch for a row', () => {
  assert.deepEqual(host.cite(MR(12)), { hostname: 'gitlab.com', project: 'acme/api', number: '12' });
  assert.deepEqual(host.cite('https://github.com/acme/app/pull/9/'), { hostname: 'github.com', project: 'acme/app', number: '9' });
  assert.deepEqual(host.cite('https://gitlab.acme.io:8443/group/sub/api/merge_requests/3'), { hostname: 'gitlab.acme.io:8443', project: 'group/sub/api', number: '3' });
  const m = world(merge({ state: 'merged' })), see = host.witness(gitlab, m.run);
  assert.equal(see(host.cite(MR(7))).verdict, 'MERGED');
  // Someone else's merged request #7 — another project, another host — proves nothing here.
  for (const link of ['https://gitlab.com/other/api/-/merge_requests/7', 'https://gitlab.example.org/acme/api/-/merge_requests/7', 'https://github.com/acme/api/pull/7'])
    assert.equal(see(host.cite(link)).verdict, 'ELSEWHERE', link);
  const stray = host.ledger(book('stray.tsv', [row('5', 'chore', 'P4', 'done', '5-bump', 'https://gitlab.com/other/api/-/merge_requests/7', 'evidence/5/merged.txt')]), see);
  assert.deepEqual([stray.valid, stray.drift], [false, 1]);
  assert.match(stray.errors[0], /host says ELSEWHERE \(cites a merge request outside this repository\)/);
  // A fork's merge requests live upstream: that project is this repository's too, and it is the one that gets asked.
  const fork = { ...gitlab, project: 'jdoe/api', upstream: 'acme/api' }, f = world(merge({ state: 'merged' }));
  assert.equal(host.witness(fork, f.run)(host.cite(MR(7))).verdict, 'MERGED');
  assert.ok(f.calls.some(c => c.includes('projects/acme%2Fapi/merge_requests/7')));
  // A merge request opened inside the fork itself is asked of the fork, not of the upstream's #7.
  const inFork = world(merge({ state: 'merged' }));
  host.witness(fork, inFork.run)(host.cite('https://gitlab.com/jdoe/api/-/merge_requests/7'));
  assert.ok(inFork.calls.some(c => c.includes('projects/jdoe%2Fapi/merge_requests/7')) && inFork.calls.every(c => !c.includes('acme%2Fapi')));
});

// ---------------------------------------------------------------- the real command line
test('command line: VALID exits 0, INVALID exits 1, usage and unreadable input exit 2', () => {
  const cli = (...args) => cp.spawnSync(process.execPath, [target, ...args], { encoding: 'utf8' });
  const valid = cli('ledger', book('backlog.tsv', good));
  assert.deepEqual([valid.status, valid.stdout.trim()], [0, 'LEDGER: VALID total=7 remaining=3 open=2 in_review=1 done=1 blocked=1 dropped=1']);
  const invalid = cli('ledger', book('bad.tsv', [row('1', 'bug', 'P1', 'verified')]));
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /^LEDGER: INVALID /);
  assert.match(invalid.stderr, /bad status/);
  assert.equal(cli('ledger', path.join(scratch, 'absent.tsv')).status, 2);
  assert.equal(cli('merge', '7').status, 2);
  assert.match(cli().stderr, /usage: host\.cjs detect/);
});
test('command line end to end against stand-in glab and gh binaries', () => {
  // `glab api …` / `gh pr …` become `node api …` / `node pr …`: a copy of this node binary named after the CLI runs the
  // extensionless script of that name from the working directory. Same spawn, same arguments, no network.
  const exe = process.platform === 'win32' ? '.exe' : '', bin = path.join(scratch, 'bin'), cwd = path.join(scratch, 'cli'), work = path.join(scratch, 'company');
  fs.mkdirSync(bin); fs.mkdirSync(cwd);
  for (const name of ['glab', 'gh']) standIn(path.join(bin, name + exe));
  const world = { user: { username: 'jdoe', login: 'jdoe' }, project: { path_with_namespace: 'acme/api', default_branch: 'develop' }, mr: merge({ head_pipeline: { ...mergeRef, project_id: 5 } }),
    parents: { parent_ids: ['c'.repeat(40), sha] }, discussions: [], issues: [issue(4, ['bug', 'P2'])], pr: { url: 'https://github.com/acme/app/pull/9', state: 'OPEN', statusCheckRollup: [] } };
  const state = path.join(cwd, 'world.json'), set = change => fs.writeFileSync(state, JSON.stringify({ ...world, ...change }));
  fs.writeFileSync(path.join(cwd, 'auth'), 'process.exit(0)');
  fs.writeFileSync(path.join(cwd, 'pr'), 'console.log(JSON.stringify(require("./world.json").pr))');
  fs.writeFileSync(path.join(cwd, 'api'), `const w = require('./world.json'), e = process.argv[4];
    // An environment token must never reach a GitLab host the user did not name.
    if (process.env.GITLAB_TOKEN && /gitlab/.test(process.argv[3])) { console.log('{"message":"token travelled"}'); process.exit(1); }
    const hit = e === 'user' ? w.user : /\\/discussions/.test(e) ? w.discussions : /\\/reviewers/.test(e) ? [] : /\\/repository\\/commits\\//.test(e) ? w.parents
      : /\\/merge_requests\\/7/.test(e) ? w.mr : /\\/issues\\?/.test(e) ? w.issues : /^(projects|repos)\\/[^/]+(\\/[^/]+)?$/.test(e) ? w.project : null;
    if (!hit) { console.log('{"message":"404"}'); process.exit(1); }
    console.log(JSON.stringify(hit));`);
  const git = (...args) => assert.equal(cp.spawnSync('git', args, { encoding: 'utf8' }).status, 0, 'git ' + args.join(' '));
  fs.mkdirSync(work); git('-C', work, 'init', '-q'); git('-C', work, 'remote', 'add', 'origin', 'https://gitlab.example.test/acme/api.git');
  const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH, GITLAB_TOKEN: 'must-not-travel' };
  const cli = (...args) => cp.spawnSync(process.execPath, [target, ...args], { encoding: 'utf8', cwd, env });
  set({});
  const d = JSON.parse(cli('detect', work).stdout);
  assert.deepEqual([d.host, d.hostname, d.project, d.auth, d.user, d.role, d.default_branch], ['gitlab', 'gitlab.example.test', 'acme/api', 'ok', 'jdoe', 'contributor', 'develop']);
  assert.deepEqual(cli('issues', work, '--limit', '5').stdout.split('\n')[1].split('\t').slice(0, 4), ['4', 'bug', 'P2', 'todo']);
  const ready = cli('mr', '7', work);
  assert.deepEqual([ready.status, JSON.parse(ready.stdout).verdict, JSON.parse(ready.stdout).checks], [0, 'READY', 'green']);
  set({ mr: merge({ head_pipeline: { id: 3, sha, status: 'failed' } }) });
  const red = cli('mr', '7', work);
  assert.deepEqual([red.status, JSON.parse(red.stdout).verdict], [1, 'REWORK']);
  // ledger --live really asks the host: the row says in-review, the host says the pipeline failed.
  const here = n => 'https://gitlab.example.test/acme/api/-/merge_requests/' + n;
  const live = book('live.tsv', [row('3', 'bug', 'P2', 'in-review', '3-null-total', here(7), 'evidence/3/green.txt')]);
  const drifted = cli('ledger', live, '--live', work);
  assert.deepEqual([drifted.status, drifted.stdout.split(' ').slice(0, 2).join(' ')], [1, 'LEDGER: DRIFT']);
  assert.match(drifted.stderr, /item 3: ledger says in-review, host says REWORK \(checks failed\)/);
  set({});
  assert.equal(cli('ledger', live, '--live', work).status, 0);
  // GitHub goes through `gh pr view`.
  const hub = path.join(scratch, 'hub'); fs.mkdirSync(hub); git('-C', hub, 'init', '-q'); git('-C', hub, 'remote', 'add', 'origin', 'git@github.com:acme/app.git');
  const pr = cli('mr', '9', hub);
  assert.deepEqual([pr.status, JSON.parse(pr.stdout).host, JSON.parse(pr.stdout).verdict], [0, 'github', 'READY']);
  // Windows looks in the current directory before PATH: a `git.exe` committed into the repository must not be what runs.
  const trap = path.join(scratch, 'trap'), mark = path.join(trap, 'ran.txt');
  fs.mkdirSync(trap);
  standIn(path.join(trap, 'git' + exe));
  for (const name of ['rev-parse', 'remote', 'config']) fs.writeFileSync(path.join(trap, name), `require('fs').writeFileSync(${JSON.stringify(mark)}, 'planted binary ran')`);
  for (const name of ['auth', 'api', 'world.json']) fs.copyFileSync(path.join(cwd, name), path.join(trap, name));
  const clean = { ...env }; delete clean.NoDefaultCurrentDirectoryInExePath;
  const safe = cp.spawnSync(process.execPath, [target, 'detect', work], { encoding: 'utf8', cwd: trap, env: clean });
  assert.deepEqual([safe.status, JSON.parse(safe.stdout).project, fs.existsSync(mark)], [0, 'acme/api', false]);
});

fs.rmSync(scratch, { recursive: true, force: true });
console.log(n + '/' + total + ' host checks passed');
if (fail || n !== total) process.exitCode = 1;
