'use strict';
// Seam for /forge:review: where the base and head checkouts live, the lines a merge request changes,
// what in it must be read before its code runs, how many changed lines its tests execute, receipts of
// every command run for the review, text safe to post, and the merge-safety verdict — which checks
// each pass against its evidence. Ledger, receipts, diff and merge-request text are data.
// ponytail: no sandbox. A merge request whose code runs here can do anything the user can; the
// pre-screen, the tamper check and the withheld environment narrow that, a container closes it.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), os = require('node:os');
const a = require('./acceptance.cjs'), v = require('./verification.cjs');
process.env.NoDefaultCurrentDirectoryInExePath = '1'; // Windows: a bare program name never resolves from the cwd

const GATES = ['pipeline', 'regression', 'tests-detect', 'coverage', 'app', 'security', 'mergeable'];
// Gates that can honestly not apply: no CI in the repository, no change to existing behaviour, no
// executable code changed, nothing a user or API client sees. The rest always apply.
const MAY_NOT_APPLY = ['pipeline', 'tests-detect', 'coverage', 'app'];
// Only what needs local execution may be waived, and only by the user. Their pipeline, the security
// pass and mergeability can always be established, so they never are.
const WAIVABLE = ['regression', 'tests-detect', 'coverage', 'app'];
const STATUSES = ['pass', 'fail', 'missing', 'n/a'];
const CODE = /\.(?:[cm]?[jt]sx?|py|go|rb|java|kts?|cs|php|rs|swift|scala|c|cc|cpp|cxx|h|hh|hpp|vue|svelte|dart|exs?)$/i;
const TEST = /(?:^|\/)(?:tests?|__tests__|specs?)\/|[._-](?:test|spec)\.[^/]+$/i;
const CI = ['.gitlab-ci.yml', '.github/workflows', 'Jenkinsfile', '.circleci/config.yml', 'azure-pipelines.yml', 'bitbucket-pipelines.yml', '.travis.yml', '.drone.yml', '.buildkite'];
// The environment the change's code sees: what builds and test runners need, nothing that holds a secret.
const ENV_ALLOW = /^(PATH|PATHEXT|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMW6432|COMMONPROGRAMFILES|COMMONPROGRAMFILES\(X86\)|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|OS|LANG|LANGUAGE|LC_[A-Z]+|TZ|TERM|SHELL|USER|USERNAME|LOGNAME|JAVA_HOME|GOPATH|GOROOT|GOCACHE|GOMODCACHE|CARGO_HOME|RUSTUP_HOME|NVM_HOME|NVM_DIR|NVM_SYMLINK|VIRTUAL_ENV|CONDA_PREFIX|PYENV_ROOT|PNPM_HOME|BUN_INSTALL|DENO_DIR)$/i;
// Values worth redacting wherever they surface: secret-looking names, values long enough to be secrets.
const SECRET_NAME = /(?:TOKEN|SECRET|PASSW(?:OR)?D|PWD$|(?:^|_)PAT$|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|MASTER_?KEY|(?:^|_)KEY$|CREDENTIAL|AUTH|COOKIE|DSN$)/i;
const WRAPPERS = ['env', 'timeout', 'gtimeout', 'nice', 'nohup', 'xargs', 'command', 'exec', 'stdbuf', 'time', 'sudo', 'doas', 'runas', 'start', 'setsid', 'chroot', 'script', 'cmd', 'powershell', 'pwsh', 'zsh', 'dash', 'fish', 'ksh'];
// A base failure from a missing symbol or a broken import proves nothing about the change's tests.
const NOT_AN_ASSERTION = /ModuleNotFoundError|ImportError|No module named|Cannot find module|Module not found|SyntaxError|error TS\d{4}|cannot find symbol|unresolved import|undefined reference|failed to compile|compilation failed|could not compile|NameError|is not defined/i;
const IMAGE = [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0xff, 0xd8, 0xff]];
const norm = p => String(p).replace(/\\/g, '/');
const json = file => { const t = fs.readFileSync(file, 'utf8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t); };
const parse = s => { try { return JSON.parse(s); } catch { return null; } };
const inside = (root, file) => { const rel = path.relative(root, file); return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel); };
const within = (root, file) => { try { return inside(fs.realpathSync(root), fs.realpathSync(file)) || fs.realpathSync(root) === fs.realpathSync(file); } catch { return false; } };

// The base and head checkouts live outside the run and outside the repository: the change's code
// cannot reach the evidence by a relative path, and the user's own test runner never collects it.
function workspace(runDir, create = false) {
  const root = fs.realpathSync(runDir), dir = path.join(os.tmpdir(), 'forge-review', path.basename(root) + '-' + a.sha(root).slice(0, 8));
  if (create) fs.mkdirSync(dir, { recursive: true });
  return { root: dir, head: path.join(dir, 'head'), base: path.join(dir, 'base') };
}

// git quotes unusual paths C-style ("b/caf\303\251.txt"); undo that to compare with report paths.
function gitPath(raw) {
  if (!(raw.length > 1 && raw.startsWith('"') && raw.endsWith('"'))) return raw;
  const bytes = [], escapes = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, '"': 34, '\\': 92 };
  for (let i = 1; i < raw.length - 1; i++) {
    if (raw[i] !== '\\') { bytes.push(...Buffer.from(raw[i], 'utf8')); continue; }
    const c = raw[++i];
    if (/[0-7]/.test(c)) { bytes.push(parseInt(raw.slice(i, i + 3), 8)); i += 2; } else bytes.push(escapes[c] ?? c.charCodeAt(0));
  }
  return Buffer.from(bytes).toString('utf8');
}

// Added lines per file on the new side of a unified diff: Map(path -> [{ n, text }]).
// Hunk counts decide where a hunk ends, so content lines that look like headers stay content.
function lines(diff) {
  const files = new Map();
  let file = null, next = 0, oldLeft = 0, newLeft = 0;
  for (const raw of String(diff).split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (oldLeft > 0 || newLeft > 0) {
      const c = line[0];
      if (c === '+') { if (file) files.get(file).push({ n: next, text: line.slice(1) }); next++; newLeft--; continue; }
      if (c === '-') { oldLeft--; continue; }
      if (c === ' ' || line === '') { next++; oldLeft--; newLeft--; continue; }
      if (c === '\\') continue;
      oldLeft = newLeft = 0; // malformed hunk: stop counting and read the line as a header
    }
    if (line.startsWith('diff --git ')) { file = null; continue; }
    if (line.startsWith('+++ ')) {
      const name = gitPath(line.slice(4).replace(/\t$/, ''));
      file = name === '/dev/null' ? null : name.replace(/^b\//, '');
      if (file && !files.has(file)) files.set(file, []);
      continue;
    }
    const hunk = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk) { oldLeft = hunk[1] === undefined ? 1 : Number(hunk[1]); next = Number(hunk[2]); newLeft = hunk[3] === undefined ? 1 : Number(hunk[3]); }
  }
  return files;
}

// What must be read, and shown to the user, before any of the change's code runs.
function prescreen(diff) {
  const RULES = [
    [/^(?:\.gitlab-ci\.yml|\.github\/|Jenkinsfile|\.circleci\/|azure-pipelines|bitbucket-pipelines|\.travis\.yml|\.drone\.yml|\.buildkite\/)/, 'CI definition'],
    [/(?:^|\/)(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|requirements[^/]*\.txt|Pipfile(?:\.lock)?|poetry\.lock|pyproject\.toml|setup\.py|setup\.cfg|go\.(?:mod|sum)|Cargo\.(?:toml|lock)|Gemfile(?:\.lock)?|composer\.(?:json|lock)|pom\.xml|build\.gradle(?:\.kts)?|[^/]+\.csproj|packages\.config)$/, 'dependencies or install scripts'],
    [/(?:^|\/)(?:\.npmrc|\.yarnrc(?:\.yml)?|\.pypirc|pip\.conf|\.gitmodules|\.gitattributes|\.envrc|\.tool-versions)$/, 'package manager, submodule or environment configuration'],
    [/(?:^|\/)(?:\.husky|\.githooks|\.git-hooks)\/|lefthook|\.pre-commit-config\.ya?ml$/, 'git hooks'],
    [/(?:^|\/)(?:Makefile|Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|compose\.ya?ml|[^/]*\.config\.(?:[cm]?js|ts)|jest\.config[^/]*|pytest\.ini|tox\.ini|noxfile\.py|conftest\.py|tsconfig[^/]*\.json|\.babelrc|setup\.(?:js|ts))$/, 'build or test configuration'],
    [/(?:^|\/)(?:scripts?|bin|tools|\.devcontainer)\//, 'scripts that may run during build or tests'],
  ];
  const REACH = /process\.env|os\.environ|getenv\(|child_process|subprocess|\bexec(?:Sync)?\(|\bspawn\(|\beval\(|\bfetch\(|requests\.|urllib|http\.client|\bcurl\b|\bwget\b|https?:\/\/(?!(?:localhost|127\.0\.0\.1)[:/])|\.ssh|\.aws|credentials|\.netrc|homedir\(|expanduser/;
  const found = new Map(), add = (file, why) => { if (!found.has(file)) found.set(file, new Set()); found.get(file).add(why); };
  let file = null;
  for (const raw of String(diff).split('\n')) {
    const line = raw.replace(/\r$/, '');
    const head = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (head) { file = gitPath(head[2]); for (const [rx, why] of RULES) if (rx.test(file)) add(file, why); continue; }
    if (!file) continue;
    if (/^(?:new file mode|new mode) 120000/.test(line)) add(file, 'symbolic link');
    if (/^(?:new file mode|new mode) 100755/.test(line)) add(file, 'executable file');
    if (/^Binary files /.test(line) || /^GIT binary patch/.test(line)) add(file, 'binary content');
  }
  for (const [f, added] of lines(diff)) {
    if (!(TEST.test(f) || RULES.some(([rx]) => rx.test(f)))) continue;
    const hit = added.find(l => REACH.test(l.text));
    if (hit) add(f, `line ${hit.n} reaches the environment, processes, files or network`);
  }
  return [...found].map(([f, why]) => ({ file: f, reasons: [...why] }));
}

// Coverage report -> Map(path -> Map(line -> hits)). lcov, Cobertura XML, coverage.py JSON,
// Istanbul coverage-final.json, Go cover profile.
function report(text, format) {
  const out = new Map(), body = String(text).replace(/^\uFEFF/, ''), t = body.trimStart();
  const at = file => { if (!out.has(file)) out.set(file, new Map()); return out.get(file); };
  const add = (m, n, hits) => { if (Number.isSafeInteger(n) && n > 0 && Number.isFinite(hits) && hits >= 0) m.set(n, Math.max(m.get(n) ?? 0, hits)); };
  let parsed = null;
  if (!format && t.startsWith('{')) parsed = JSON.parse(t);
  format ||= t.startsWith('mode:') ? 'go' : t.startsWith('<') ? 'cobertura'
    : parsed && a.object(parsed.files) && a.object(parsed.meta) ? 'coveragepy'
    : parsed && Object.values(parsed).some(d => a.object(d) && a.object(d.statementMap)) ? 'istanbul'
    : /^SF:/m.test(t) ? 'lcov' : null;
  a.need(format, 'Unrecognized coverage report: use lcov, Cobertura XML, coverage.py JSON, Istanbul JSON or a Go cover profile');
  if (format === 'lcov') {
    let m = null;
    for (const raw of body.split('\n')) {
      const l = raw.trim();
      if (l.startsWith('SF:')) m = at(l.slice(3));
      else if (l.startsWith('DA:') && m) { const [n, hits] = l.slice(3).split(','); add(m, Number(n), Number(hits)); }
      else if (l === 'end_of_record') m = null;
    }
  } else if (format === 'cobertura') {
    const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    for (const cls of body.matchAll(/<class\b([^>]*[^/>])>([\s\S]*?)<\/class>/g)) {
      const name = /\bfilename="([^"]*)"/.exec(cls[1]);
      if (!name) continue;
      const m = at(unxml(name[1]));
      for (const tag of cls[2].matchAll(/<line\b([^>]*)>/g)) {
        const n = /\bnumber="(\d+)"/.exec(tag[1]), hits = /\bhits="(\d+)"/.exec(tag[1]);
        if (n && hits) add(m, Number(n[1]), Number(hits[1]));
      }
    }
  } else if (format === 'coveragepy') {
    for (const [file, d] of Object.entries((parsed || JSON.parse(t)).files || {})) {
      const m = at(file);
      for (const n of d.executed_lines || []) add(m, n, 1);
      for (const n of d.missing_lines || []) add(m, n, 0);
    }
  } else if (format === 'istanbul') {
    // Istanbul's own line coverage: each statement counts on its start line, highest count wins.
    for (const [key, d] of Object.entries(parsed || JSON.parse(t))) {
      if (!a.object(d) || !a.object(d.statementMap) || !a.object(d.s)) continue;
      const m = at(typeof d.path === 'string' ? d.path : key);
      for (const [id, loc] of Object.entries(d.statementMap)) add(m, loc?.start?.line, Number(d.s[id]) || 0);
    }
  } else if (format === 'go') {
    for (const raw of body.split('\n').slice(1)) {
      const r = /^(.+):(\d+)\.\d+,(\d+)\.\d+ \d+ (\d+)$/.exec(raw.trim());
      if (!r) continue;
      const m = at(r[1]);
      for (let n = Number(r[2]); n <= Number(r[3]) && n - Number(r[2]) < 10000; n++) add(m, n, Number(r[4]));
    }
  } else a.need(false, 'Unknown coverage format: ' + format);
  return { format, files: out };
}

// The report entry for a diff path. An absolute report path (and a Go import path) must end with the
// repository path (one candidate only; letter case folded only for Windows drive paths). A relative
// one is read under `root` — the directory the coverage run used, relative to the repository — and
// must match exactly.
function find(file, files, root = '', format) {
  const want = norm(file), prefix = norm(root).replace(/^\.?\/+|\/+$/g, '');
  const hits = [...files].filter(([p]) => {
    const q = norm(p);
    if (format === 'go' || /^(?:[A-Za-z]:)?\//.test(q)) return /^[A-Za-z]:/.test(q) ? q.toLowerCase().endsWith('/' + want.toLowerCase()) : q.endsWith('/' + want);
    return (prefix ? prefix + '/' : '') + q.replace(/^\.\//, '') === want;
  });
  return hits.length === 1 ? hits[0][1] : hits.length ? 'ambiguous' : null;
}

// Changed-line coverage: of the lines this change adds that the report instruments, how many ran.
// A changed source file the report never mentions counts its non-trivial added lines as not run.
function coverage(diffText, reportText, format, root = '') {
  const changed = lines(diffText), rep = report(reportText, format), files = [];
  let covered = 0, uncovered = 0;
  for (const [file, added] of changed) {
    if (!added.length) continue;
    const m = find(file, rep.files, root, rep.format), code = CODE.test(file) && !TEST.test(file);
    if (m === 'ambiguous' || !m) {
      if (!code) { files.push({ file, status: 'not-code' }); continue; }
      const missed = added.filter(l => !/^[\s{}()[\];,]*$/.test(l.text)).map(l => l.n);
      uncovered += missed.length;
      files.push({ file, status: m === 'ambiguous' ? 'ambiguous' : 'not-in-report', covered: [], uncovered: missed });
      continue;
    }
    const hit = [], miss = [];
    for (const { n } of added) if (m.has(n)) (m.get(n) > 0 ? hit : miss).push(n);
    covered += hit.length; uncovered += miss.length;
    files.push({ file, status: 'measured', covered: hit, uncovered: miss });
  }
  const total = covered + uncovered;
  return { version: 1, format: rep.format, root: norm(root), covered, uncovered, total, pct: total ? Math.floor(covered / total * 1000) / 10 : null, files };
}

// Text about to be posted on a merge request: nothing the host would execute (GitLab quick actions,
// bot commands), nobody mentioned unless the user said so, no tool credit. Code is not scanned.
function scrub(text, { mentions = false } = {}) {
  const prose = String(text).replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const problems = [];
  prose.split('\n').forEach((l, i) => {
    if (/^\s*\/[a-z][\w-]*(?:\s|$)/i.test(l)) problems.push(`line ${i + 1}: starts with a command the host may execute (${l.trim().split(/\s/)[0]})`);
    if (/\bbors\s+(?:r[+=]|merge|try|delegate)|@bors\b|^\s*(?:lgtm|approve)d?\s*$/i.test(l)) problems.push(`line ${i + 1}: a merge-bot or approval command`);
    if (!mentions && /(?:^|[^\w`/.@-])@[A-Za-z0-9][\w.-]*/.test(l)) problems.push(`line ${i + 1}: mentions someone (@…) without the user's word`);
    if (/co-authored-by:|generated (?:with|by) \[?(?:claude|fable|opus|sonnet|haiku)|claude\.ai\/code\/session/i.test(l)) problems.push(`line ${i + 1}: names a model as author`);
  });
  return problems;
}

function snapshot(root, skip) {
  const out = new Map();
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (f === skip || /^\.(?:review-render|investigate-export)-/.test(e.name)) continue;
      if (e.isDirectory()) walk(f);
      else if (e.isFile() || e.isSymbolicLink()) out.set(path.relative(root, f).replace(/\\/g, '/'), e.isFile() ? a.sha(fs.readFileSync(f)) : 'symlink');
    }
  };
  walk(root);
  return out;
}

// Run one command for the review and keep what it printed. Untrusted code gets a minimal environment
// and is never wrapped; a shell script must pass the forge screen; forge's own seams run as they are.
// The run directory is fingerprinted around the command: a change it makes to the evidence is recorded.
async function capture(runDir, requestFile) {
  const root = fs.realpathSync(runDir), req = json(a.argument(root, requestFile)), work = workspace(root);
  a.need(a.object(req) && /^[A-Za-z][\w.-]{0,63}$/.test(req.id || ''), 'Request id must be a short name such as E1');
  a.need(Array.isArray(req.argv) && req.argv.length > 0 && req.argv.every(s => typeof s === 'string' && s.length > 0 && !s.includes('\0')), 'argv must be a non-empty list of strings');
  a.need(a.text(req.label), 'label must say what the command shows');
  a.need(typeof req.cwd === 'string' && path.isAbsolute(req.cwd) && fs.statSync(req.cwd).isDirectory(), 'cwd must be an existing absolute directory');
  a.need(within(root, req.cwd) || within(work.root, req.cwd), 'cwd must be the run or one of its review checkouts, never your own working tree');
  const timeout = req.timeout_ms ?? 600000, limit = req.output_limit ?? 8 * 1024 * 1024;
  a.need(Number.isSafeInteger(timeout) && timeout > 0 && timeout <= 7200000 && Number.isSafeInteger(limit) && limit > 0 && limit <= 32 * 1024 * 1024, 'Bound the run: timeout_ms <= 2 h, output_limit <= 32 MiB');
  const extra = req.env ?? {};
  a.need(a.object(extra) && Object.entries(extra).every(([k, val]) => /^[A-Za-z_]\w*$/.test(k) && !SECRET_NAME.test(k) && !/^(?:REG_|FORGE_|AR_)/.test(k) && typeof val === 'string' && !/[\u0000-\u001f\u007f]/.test(val)), 'env adds plain, non-secret variables only (no REG_/FORGE_/AR_ overrides)');
  const bash = process.env.FORGE_BASH || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash');
  const screen = text => {
    const s = cp.spawnSync(bash, [path.join(__dirname, 'orchestrate.sh').replace(/\\/g, '/'), 'screen-cmd', text], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    a.need(s.status === 0 && s.stdout.trim() === 'ok', 'The command failed the forge command screen');
  };
  for (const [k, val] of Object.entries(extra)) screen(`${k}=${val} true`);
  const seam = (p, ext) => { try { const f = fs.realpathSync(path.resolve(req.cwd, p)); return path.dirname(f) === fs.realpathSync(__dirname) && f.endsWith(ext); } catch { return false; } };
  const exe = path.basename(req.argv[0]).toLowerCase().replace(/\.exe$/, '');
  a.need(!/\.(?:cmd|bat|ps1)[\s.]*$/i.test(req.argv[0]), 'Windows launchers (.cmd/.bat) cannot run directly: use ["bash", "-c", "npm test"]');
  a.need(!WRAPPERS.includes(exe), `${exe} cannot wrap a review command: run the program directly, or as ["bash", "-c", script]`);
  let trusted = false;
  if (exe === 'bash' || exe === 'sh') {
    if (req.argv.length === 3 && req.argv[1] === '-c') screen(req.argv[2]);
    else { a.need(req.argv.length >= 2 && seam(req.argv[1], '.sh'), 'Run shell as ["bash", "-c", script], or a forge .sh seam'); trusted = true; }
  } else if ((exe === 'node' || path.resolve(req.argv[0]) === process.execPath) && req.argv[1] && seam(req.argv[1], '.cjs')) trusted = true;
  const env = { NoDefaultCurrentDirectoryInExePath: '1' }, hidden = [];
  for (const [k, val] of Object.entries(process.env)) {
    if (SECRET_NAME.test(k) && typeof val === 'string' && val.length >= 8) hidden.push(val);
    if (trusted || ENV_ALLOW.test(k)) env[k] = val;
  }
  Object.assign(env, extra);
  const inputs = {};
  for (const p of req.inputs ?? []) {
    const f = path.resolve(req.cwd, p);
    a.need(typeof p === 'string' && (within(root, f) || within(work.root, f)) && fs.statSync(f).isFile(), 'inputs are files in the run or a review checkout');
    inputs[norm(fs.realpathSync(f))] = a.sha(fs.readFileSync(f));
  }
  const outputs = (req.outputs ?? []).map(p => { a.need(typeof p === 'string' && /^[\w.-]+(?:\/[\w.-]+)*\/?$/.test(p) && !p.split('/').includes('..') && !/^(?:receipts|requests|visuals|products)\b/.test(p), 'outputs are folders inside the run, never receipts, requests, visuals or products'); return p.replace(/\/?$/, '/'); });
  a.need(Array.isArray(req.products ?? []) && (req.products ?? []).every(p => typeof p === 'string' && /^[\w.-]+(?:\/[\w.-]+)*$/.test(p) && !p.split('/').includes('..')), 'products are files the command writes, relative to its cwd');
  fs.mkdirSync(path.join(root, 'receipts'), { recursive: true });
  const file = path.join(root, 'receipts', req.id + '.json'), fd = fs.openSync(file, 'wx');
  try {
    const before = snapshot(root, file), started = new Date().toISOString(), began = performance.now();
    let r; // the receipt id is already reserved: a spawn that throws must still fill it
    try { r = await v.run(req.argv, { cwd: req.cwd, env, timeout_ms: timeout, output_limit: limit }); }
    catch (e) { r = { exit_code: null, signal: null, stdout: '', stderr: '', error: e.code || e.message }; }
    const after = snapshot(root, file), tampered = [];
    for (const [f, h] of before) if (after.get(f) !== h) tampered.push(f);
    for (const f of after.keys()) if (!before.has(f) && !outputs.some(o => f.startsWith(o))) tampered.push(f);
    // What the command made (a coverage report) is copied into the run as it was made, never through a
    // link out of the directory it ran in; the receipt records its hash, so the gate can tie it to this run.
    const products = {};
    for (const [i, p] of (req.products ?? []).entries()) {
      let f; try { f = fs.realpathSync(path.join(req.cwd, p)); } catch { continue; }
      if (!inside(fs.realpathSync(req.cwd), f) || !fs.statSync(f).isFile() || fs.statSync(f).size > 64 * 1024 * 1024) continue;
      const rel = `products/${req.id}-${i + 1}-${path.basename(p)}`, bytes = fs.readFileSync(f);
      fs.mkdirSync(path.join(root, 'products'), { recursive: true });
      fs.writeFileSync(path.join(root, rel), bytes, { flag: 'wx' });
      products[rel] = a.sha(bytes);
    }
    const stdout = v.redact(r.stdout, hidden), stderr = v.redact(r.stderr, hidden);
    const receipt = { version: 1, run: path.basename(root), id: req.id, label: req.label, argv: req.argv.map(s => v.redact(s, hidden)), cwd: norm(fs.realpathSync(req.cwd)),
      trusted, env_added: Object.keys(extra), inputs, products, started_at: started, ended_at: new Date().toISOString(), elapsed_ms: Math.round(performance.now() - began),
      exit_code: r.exit_code, signal: r.signal, error: r.error, stdout, stderr, stdout_sha256: a.sha(stdout), stderr_sha256: a.sha(stderr), tampered };
    fs.writeFileSync(fd, JSON.stringify(receipt, null, 2) + '\n');
    return receipt;
  } finally { fs.closeSync(fd); }
}

const SHAPE = r => a.object(r) && r.version === 1 && typeof r.run === 'string' && /^[A-Za-z][\w.-]*$/.test(r.id || '') && Array.isArray(r.argv) && typeof r.cwd === 'string'
  && Array.isArray(r.env_added) && a.object(r.inputs) && a.object(r.products) && Array.isArray(r.tampered) && Number.isFinite(Date.parse(r.started_at)) && Number.isFinite(Date.parse(r.ended_at))
  && typeof r.stdout === 'string' && typeof r.stderr === 'string' && r.stdout_sha256 === a.sha(r.stdout) && r.stderr_sha256 === a.sha(r.stderr);

// review.json is the agent's ledger; this checks it against the run, the repository and the evidence.
function check(runDir) {
  const root = fs.realpathSync(runDir), r = json(a.local(root, 'review.json')), errors = [], work = workspace(root);
  const need = (ok, message) => { if (!ok) errors.push(message); return ok; };
  const exists = rel => { try { a.local(root, rel); return true; } catch { return false; } };
  need(a.object(r) && r.version === 1, 'review.json version 1 required');
  const mr = a.object(r.mr) ? r.mr : {};
  need(['github', 'gitlab'].includes(mr.host) && a.text(mr.project) && Number.isSafeInteger(mr.number) && mr.number > 0 && a.text(mr.url) && a.text(mr.title), 'mr needs host, project, number, url and title');
  need(/^[a-f0-9]{40}$/.test(mr.head || '') && /^[a-f0-9]{40}$/.test(mr.base || '') && a.text(mr.target), 'mr needs the reviewed head sha, the merge-base sha and the target branch');
  const same = (x, y) => typeof x === 'string' && within(x, y) && within(y, x);
  const headDir = same(mr.worktree, work.head) ? fs.realpathSync(work.head) : null;
  const baseDir = same(mr.base_worktree, work.base) ? fs.realpathSync(work.base) : null;
  need(headDir && baseDir, `mr.worktree and mr.base_worktree must be the review checkouts ${norm(work.head)} and ${norm(work.base)} (review.cjs workspace)`);
  // diff.patch is the change itself: base to head, as git says now — not a copy that could drift.
  let diff = '';
  if (need(exists('diff.patch'), 'diff.patch missing: save git diff <base> <head>')) {
    diff = fs.readFileSync(path.join(root, 'diff.patch'), 'utf8');
    const g = cp.spawnSync('git', ['-C', root, 'diff', '--no-color', '--no-ext-diff', '-M', mr.base, mr.head], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true });
    need(g.status === 0 && g.stdout.replace(/\r\n/g, '\n') === diff.replace(/\r\n/g, '\n'), 'diff.patch is not git diff --no-color --no-ext-diff -M <base> <head> of this repository');
  }
  const receipts = new Map();
  if (fs.existsSync(path.join(root, 'receipts'))) for (const f of fs.readdirSync(path.join(root, 'receipts')).filter(x => x.endsWith('.json'))) {
    const rec = parse(fs.readFileSync(path.join(root, 'receipts', f), 'utf8'));
    if (!need(SHAPE(rec) && rec.run === path.basename(root) && f === rec.id + '.json', `receipts/${f}: not a receipt of this run (altered, copied or hand-written)`)) continue;
    need(rec.tampered.length === 0, `receipts/${f}: the run directory changed while it ran (${rec.tampered.slice(0, 3).join(', ')}) — the evidence cannot be trusted`);
    receipts.set('receipts/' + f, rec);
  }
  const threshold = r.threshold ?? 80;
  need(Number.isFinite(threshold) && threshold >= 0 && threshold <= 100 && (threshold >= 80 || a.text(r.threshold_reason)), 'threshold is a percentage; below 80 needs threshold_reason (their configuration or the user\'s Coverage:)');
  const gates = a.object(r.gates) ? r.gates : {}, visuals = Array.isArray(r.visuals) ? r.visuals : [];
  need(Object.keys(gates).every(g => GATES.includes(g)), 'Unknown gate; gates are ' + GATES.join(', '));
  const ids = new Set();
  for (const vis of visuals) {
    if (!need(a.object(vis) && /^V\d+$/.test(vis.id || '') && !ids.has(vis.id), 'Visuals need unique ids V1, V2…')) continue;
    ids.add(vis.id);
    need(['screenshot', 'rendered'].includes(vis.kind) && a.text(vis.caption) && a.text(vis.source), vis.id + ': kind screenshot|rendered, caption and source required');
    if (need(exists(vis.file || '-'), vis.id + ': file missing inside the run')) {
      const bytes = fs.readFileSync(a.local(root, vis.file));
      need(vis.sha256 === a.sha(bytes), vis.id + ': sha256 does not match the file');
      need(IMAGE.some(sig => sig.every((b, i) => bytes[i] === b)) || (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'), vis.id + ': not a PNG, JPEG or WebP image');
    }
    if (vis.side !== undefined) need(['before', 'after'].includes(vis.side), vis.id + ': side is before or after');
  }
  for (const g of GATES) {
    const gate = gates[g];
    if (!need(a.object(gate) && STATUSES.includes(gate.status), `gate ${g}: status ${STATUSES.join('|')} required`)) continue;
    const evidence = Array.isArray(gate.evidence) ? gate.evidence : [];
    need(evidence.every(e => typeof e === 'string' && exists(e)), `gate ${g}: evidence must name files inside the run`);
    if (gate.status === 'n/a') {
      need(MAY_NOT_APPLY.includes(g) && a.text(gate.reason), `gate ${g}: cannot be n/a${MAY_NOT_APPLY.includes(g) ? ' without a reason' : ''}`);
      if (g === 'coverage') need(![...lines(diff)].some(([f, l]) => l.length && CODE.test(f) && !TEST.test(f)), 'gate coverage: n/a, but the change adds lines to source files');
      if (g === 'pipeline') need(headDir && !CI.some(p => fs.existsSync(path.join(headDir, p))), 'gate pipeline: n/a, but the head defines CI');
    }
    if (['pass', 'fail'].includes(gate.status)) need(evidence.length > 0, `gate ${g}: ${gate.status} needs evidence`);
    if (gate.status !== 'pass' || !evidence.every(e => exists(e))) continue;
    try { supported(g, evidence); } catch (e) { need(false, `gate ${g}: ${e.message}`); }
  }
  // A pass is checked against what its evidence says, not taken from the ledger.
  function supported(g, evidence) {
    const cited = evidence.filter(e => receipts.has(e)).map(e => receipts.get(e));
    if (g === 'pipeline' || g === 'mergeable') {
      // The newest `host.cjs mr <this number>` receipt of the run speaks; an older green one cannot.
      const asks = [...receipts.values()].filter(x => x.trusted === true && /(?:^|\/)node(?:\.exe)?$/i.test(norm(x.argv[0])) && /(?:^|\/)host\.cjs$/.test(norm(x.argv[1] || '')) && x.argv[2] === 'mr' && x.argv[3] === String(mr.number));
      const latest = asks.sort((x, y) => Date.parse(x.ended_at) - Date.parse(y.ended_at)).at(-1), m = latest && parse(latest.stdout);
      need(latest && cited.includes(latest), `gate ${g}: pass needs the newest host.cjs mr ${mr.number} receipt of this run`);
      need(a.object(m) && m.number === mr.number && m.url === mr.url && m.head === mr.head && m.state === 'open', `gate ${g}: that receipt is not this merge request, open, at the reviewed head`);
      if (g === 'pipeline') need(m?.checks === 'green', 'gate pipeline: the host does not report green checks for the reviewed head');
      // ponytail: allowlist of host merge states that leave only people's steps (approval, others' threads).
      if (g === 'mergeable') need(m?.settled === true && m?.conflicts === false && m?.draft === false && ['mergeable', 'not_approved', 'discussions_not_resolved', 'CLEAN', 'HAS_HOOKS', 'BLOCKED', 'UNSTABLE'].includes(m?.merge), `gate mergeable: the host says ${m?.merge}${m?.draft ? ', draft' : ''}${m?.conflicts ? ', conflicts' : ''}`);
    }
    if (g === 'regression') {
      const v2 = cited.find(x => /(?:^|\/)score-regression\.sh$/.test(norm(x.argv[1] || '')) && x.argv[2] === 'verdict');
      need(v2 && v2.trusted && v2.exit_code === 0 && v2.env_added.length === 0 && within(headDir, v2.cwd), 'gate regression: pass needs a STABLE score-regression.sh verdict receipt, run from the head checkout with no environment overrides');
      const tsv = v2 && path.resolve(v2.cwd, v2.argv[3] || '-'), key = tsv && norm(fs.existsSync(tsv) ? fs.realpathSync(tsv) : tsv);
      need(tsv && fs.existsSync(tsv) && v2.inputs[key] === a.sha(fs.readFileSync(tsv)), 'gate regression: the results TSV must be an input of that receipt, unchanged since');
      const rows = tsv && fs.existsSync(tsv) ? fs.readFileSync(tsv, 'utf8').split('\n').filter(l => l && !l.startsWith('#') && !l.startsWith('iteration')).map(l => l.split('\t')) : [];
      need(rows.some(c => /^(?:functional|integration-e2e)$/.test(c[2]) && c[4] === 'HARD' && /eligible/.test(c[5])), 'gate regression: no test dimension ran against a green baseline');
    }
    if (g === 'tests-detect') {
      const failsOnBase = cited.filter(x => within(baseDir, x.cwd) && Number.isInteger(x.exit_code) && x.exit_code !== 0);
      need(cited.some(x => within(headDir, x.cwd) && x.exit_code === 0), 'gate tests-detect: pass needs the tests passing in the head checkout');
      need(failsOnBase.some(x => !NOT_AN_ASSERTION.test(x.stdout + '\n' + x.stderr)), 'gate tests-detect: pass needs the tests failing on an assertion in the base checkout (a missing module, symbol or compile error proves nothing)');
    }
    if (g === 'security') need(cited.length > 0, 'gate security: pass needs the scan or audit receipts');
    if (g === 'coverage') {
      const c = evidence.map(e => parse(fs.readFileSync(a.local(root, e), 'utf8'))).find(x => a.object(x) && 'pct' in x && Array.isArray(x.files));
      if (!need(c && a.text(c.report) && exists(c.report), 'gate coverage: pass needs a review.cjs coverage result naming its report file inside the run')) return;
      const report = fs.readFileSync(a.local(root, c.report));
      need(cited.some(x => within(headDir, x.cwd) && x.products[norm(c.report)] === a.sha(report)), 'gate coverage: the report must be what the cited coverage run in the head checkout produced (capture "products")');
      const again = coverage(diff, report.toString('utf8'), c.format, c.root || '');
      need(['covered', 'uncovered', 'total', 'pct'].every(k => again[k] === c[k]), 'gate coverage: the result does not match diff.patch and its report');
      need(again.pct !== null && again.pct >= threshold, `gate coverage: ${again.pct}% is below ${threshold}%`);
    }
    if (g === 'app') {
      const shots = visuals.filter(x => x.gate === 'app' && x.kind === 'screenshot');
      need(shots.every(x => /^https?:\/\//.test(x.url || '') && Number.isFinite(Date.parse(x.captured_at))), 'gate app: each screenshot records the url it shows and when it was taken');
      const before = new Set(shots.filter(x => x.side === 'before').map(x => x.sha256)), after = shots.filter(x => x.side === 'after');
      need(before.size && after.some(x => !before.has(x.sha256)), 'gate app: pass needs before and after screenshots, and the change visible in at least one pair');
    }
  }
  const waivers = Array.isArray(r.waivers) ? r.waivers : [];
  for (const w of waivers) need(a.object(w) && WAIVABLE.includes(w.gate) && gates[w.gate]?.status === 'missing' && a.text(w.user_response) && a.text(w.reason),
    `A waiver names a missing ${WAIVABLE.join('/')} gate, the user's own words and the reason; pipeline, security and mergeable are never waived, a failing gate never`);
  const scale = a.object(r.scale) ? r.scale : {};
  need(Array.isArray(scale.blocking) && scale.blocking.length && Array.isArray(scale.other) && [...scale.blocking, ...scale.other].every(a.text), 'scale: their labels, split into blocking and other (review-conventions.md)');
  const findings = Array.isArray(r.findings) ? r.findings : [], fids = new Set();
  need(Array.isArray(r.findings), 'findings list required (it may be empty)');
  for (const f of findings) {
    if (!need(a.object(f) && /^F\d+$/.test(f.id || '') && !fids.has(f.id), 'Findings need unique ids F1, F2…')) continue;
    fids.add(f.id);
    need(typeof f.blocking === 'boolean' && a.text(f.label) && typeof f.comment === 'string' && f.comment.trim() && ['open', 'resolved', 'withdrawn'].includes(f.status), f.id + ': blocking, label, comment and status open|resolved|withdrawn required');
    need(f.file === undefined || (a.text(f.file) && Number.isSafeInteger(f.line) && f.line > 0), f.id + ': a finding on code names file and line');
    if (Array.isArray(scale.blocking) && Array.isArray(scale.other)) need((scale.blocking.includes(f.label) && f.blocking === true) || (scale.other.includes(f.label) && f.blocking === false), f.id + ': its label and blocking flag must follow their scale');
    if (f.status === 'withdrawn') need(a.text(f.reason), f.id + ': withdrawn needs the reason (what disproved it)');
    if (f.status === 'resolved') need(a.text(r.previous_run) && a.text(f.resolved_by), f.id + ': resolved only on a re-review, with what resolved it');
  }
  need(['independent', 'self'].includes(r.review_mode), 'review_mode independent|self required');
  return { valid: errors.length === 0, errors, review: r, root };
}

// SAFE_TO_MERGE only when every gate that applies passed (or a missing one was waived by the user)
// and nothing blocking is open. A failure or a blocking finding is NEEDS_CHANGES; missing
// evidence is CANNOT_VERIFY, never a pass.
function verdict(runDir) {
  const c = check(runDir);
  if (!c.valid) return { verdict: 'INVALID', reasons: c.errors };
  const { gates, findings, waivers = [] } = c.review, waived = new Set(waivers.map(w => w.gate));
  const changes = [...GATES.filter(g => gates[g].status === 'fail').map(g => `gate ${g} failed`),
    ...findings.filter(f => f.blocking && f.status === 'open').map(f => `${f.id} blocking: ${f.label}`)];
  const unverified = GATES.filter(g => gates[g].status === 'missing' && !waived.has(g)).map(g => `gate ${g}: no evidence`);
  const result = changes.length ? 'NEEDS_CHANGES' : unverified.length ? 'CANNOT_VERIFY' : 'SAFE_TO_MERGE';
  return { verdict: result, reasons: changes.length ? changes : unverified, waived: [...waived], head: c.review.mr.head,
    open_findings: findings.filter(f => f.status === 'open').length, still_human: 'approval under their rules, other reviewers\' open threads, and the merge itself' };
}

module.exports = { GATES, WAIVABLE, workspace, lines, prescreen, report, coverage, scrub, capture, check, verdict, gitPath };

if (require.main === module) (async () => {
  const [cmd, ...args] = process.argv.slice(2), flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const positional = args.filter((x, i) => !x.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--mentions-ok'].includes(args[i - 1])));
  if (cmd === 'workspace') {
    a.need(positional.length === 1, 'usage: review.cjs workspace <run>');
    console.log(JSON.stringify(workspace(positional[0], true)));
  } else if (cmd === 'lines') {
    a.need(positional.length === 1, 'usage: review.cjs lines <diff-file>');
    console.log(JSON.stringify(Object.fromEntries([...lines(fs.readFileSync(positional[0], 'utf8'))].map(([f, l]) => [f, l.map(x => x.n)]))));
  } else if (cmd === 'prescreen') {
    a.need(positional.length === 1, 'usage: review.cjs prescreen <diff-file>');
    const found = prescreen(fs.readFileSync(positional[0], 'utf8'));
    for (const f of found) console.log(`${f.file}: ${f.reasons.join('; ')}`);
    console.log(found.length ? `PRESCREEN: SHOW_USER ${found.length} file(s) — wait for their OK before running the change's code` : 'PRESCREEN: CLEAR');
    process.exitCode = found.length ? 1 : 0;
  } else if (cmd === 'coverage') {
    const [diff, rep] = positional;
    a.need(diff && rep, 'usage: review.cjs coverage <diff-file> <report-in-run> [--format lcov|cobertura|coveragepy|istanbul|go] [--root <dir>] [--out <file>]');
    const c = { ...coverage(fs.readFileSync(diff, 'utf8'), fs.readFileSync(rep, 'utf8'), flag('--format'), flag('--root') || ''), report: norm(path.relative(path.dirname(path.resolve(flag('--out') || rep)), path.resolve(rep))) };
    if (flag('--out')) fs.writeFileSync(flag('--out'), JSON.stringify(c, null, 2) + '\n', { flag: 'wx' });
    const missing = c.files.filter(f => f.status !== 'measured' && f.status !== 'not-code').map(f => f.file);
    console.log(`CHANGED_COVERAGE: ${c.pct === null ? 'n/a' : c.pct + '%'} covered=${c.covered} uncovered=${c.uncovered}${missing.length ? ' unmeasured=' + missing.join(',') : ''}`);
  } else if (cmd === 'scrub') {
    a.need(positional.length === 1, 'usage: review.cjs scrub <text-file> [--mentions-ok]');
    const problems = scrub(fs.readFileSync(positional[0], 'utf8'), { mentions: args.includes('--mentions-ok') });
    console.log(problems.length ? 'SCRUB: REFUSED\n' + problems.map(p => '  - ' + p).join('\n') : 'SCRUB: CLEAN');
    process.exitCode = problems.length ? 1 : 0;
  } else if (cmd === 'capture') {
    a.need(positional.length === 2, 'usage: review.cjs capture <run> <request.json>');
    const r = await capture(...positional);
    console.log(`RECEIPT: ${r.id} exit=${r.exit_code}${r.error ? ' error=' + r.error : ''}${r.signal ? ' signal=' + r.signal : ''}${r.tampered.length ? ' TAMPERED=' + r.tampered.join(',') : ''}`);
    if (r.tampered.length) process.exitCode = 1;
  } else if (cmd === 'check') {
    a.need(positional.length === 1, 'usage: review.cjs check <run>');
    const c = check(positional[0]);
    console.log(c.valid ? 'REVIEW: VALID' : 'REVIEW: INVALID\n' + c.errors.map(e => '  - ' + e).join('\n'));
    process.exitCode = c.valid ? 0 : 1;
  } else if (cmd === 'verdict') {
    a.need(positional.length === 1, 'usage: review.cjs verdict <run>');
    const r = verdict(positional[0]);
    console.log('VERDICT: ' + r.verdict + (r.reasons.length ? '\n' + r.reasons.map(e => '  - ' + e).join('\n') : ''));
    console.log(JSON.stringify(r));
    process.exitCode = r.verdict === 'SAFE_TO_MERGE' ? 0 : r.verdict === 'INVALID' ? 2 : 1;
  } else {
    console.error('usage: review.cjs workspace <run> | lines <diff> | prescreen <diff> | coverage <diff> <report> [--format f] [--root dir] [--out file] | scrub <file> [--mentions-ok] | capture <run> <request.json> | check <run> | verdict <run>');
    process.exitCode = 2;
  }
})().catch(e => { console.error('Review blocked: ' + e.message); process.exitCode = 2; });
