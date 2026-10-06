'use strict';
// Put a finished report into Google Docs. A DOCX (images embedded) is uploaded into one approved
// Drive folder and converted to a Google Doc; the doc is then exported back and its images counted.
// The access token comes from the user's own gcloud sign-in for the account they name — it is
// never printed, logged or stored. Sharing is never touched: the doc inherits the folder's access,
// so a folder shared with anyone who has the link is refused before anything goes in.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), os = require('node:os');
const a = require('./acceptance.cjs'), v = require('./verification.cjs'), ex = require('./investigate-export.cjs');
process.env.NoDefaultCurrentDirectoryInExePath = '1'; // Windows: a bare program name never resolves from the cwd

const DRIVE = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const GDOC = 'application/vnd.google-apps.document', FOLDER = 'application/vnd.google-apps.folder';
const ACCOUNT = /^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const SIGN_IN = account => `gcloud auth login ${account || '<your-work-account>'} --enable-gdrive-access`;

function folderId(value) {
  const s = String(value ?? '').trim();
  const m = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s) || /^([A-Za-z0-9_-]{10,})$/.exec(s);
  a.need(m, 'Folder must be a Google Drive folder URL or id');
  return m[1];
}

function gcloud() {
  const names = process.platform === 'win32' ? ['gcloud.cmd'] : ['gcloud'];
  const dirs = [...(process.env.PATH || '').split(path.delimiter).filter(d => d && path.isAbsolute(d)),
    ...(process.platform === 'win32' ? [path.join(process.env.LOCALAPPDATA || '', 'Google/Cloud SDK/google-cloud-sdk/bin')] : [])];
  for (const dir of dirs) for (const name of names) { const f = path.join(dir, name); if (path.isAbsolute(f) && fs.existsSync(f)) return f; }
  return null;
}

// The signed-in user's access token for the named account. On Windows gcloud is a .cmd script, so
// it runs through the system's own cmd.exe with a fixed command line; the only caller text in it is
// the account, which the pattern above limits to characters cmd.exe treats literally.
function token(account) {
  a.need(ACCOUNT.test(account || ''), 'Name the Google account (a plain email address) that may write to the folder');
  const g = gcloud();
  a.need(g, 'gcloud not found. Install the Google Cloud CLI, or import report.docx into the folder yourself (Drive converts it to a Google Doc)');
  const args = ['auth', 'print-access-token', '--account=' + account];
  const cmd = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
  const r = process.platform === 'win32'
    ? cp.spawnSync(cmd, ['/d', '/s', '/c', `""${g}" ${args.join(' ')}"`], { encoding: 'utf8', timeout: 60000, windowsHide: true, windowsVerbatimArguments: true })
    : cp.spawnSync(g, args, { encoding: 'utf8', timeout: 60000 });
  const t = (r.stdout || '').trim();
  a.need(r.status === 0 && /^[\w.~+/=-]{20,}$/.test(t), `No Google token for ${account}. Run once yourself: ${SIGN_IN(account)}`);
  return t;
}

async function call(send, method, url, auth, body, headers = {}) {
  const res = await send(url, { method, headers: { Authorization: 'Bearer ' + auth, ...headers }, body });
  if (res.status >= 200 && res.status < 300) return res;
  let detail = '', reason = '';
  try { const e = (await res.json())?.error; detail = e?.message || ''; reason = e?.errors?.[0]?.reason || ''; } catch { /* body was not JSON */ }
  const hint = (res.status === 401 || res.status === 403) && !/LimitExceeded|rateLimit/i.test(reason) ? ` — the account may lack Drive access to this folder, or the sign-in lacks the Drive scope (${SIGN_IN()})` : '';
  const e = Error(`Google ${method} ${new URL(url).pathname} answered ${res.status}${detail ? ': ' + detail.slice(0, 300) : ''}${hint}`);
  e.reason = reason;
  throw e;
}

// Is this the folder, can this account add to it, and is it private? Reported so the user confirms
// it is the approved place (their company's Workspace, for a company repository).
async function check(folder, { account, auth = token(account), send = fetch } = {}) {
  const id = folderId(folder);
  const f = await (await call(send, 'GET', `${DRIVE}/files/${id}?supportsAllDrives=true&fields=id,name,mimeType,driveId,owners(emailAddress),capabilities(canAddChildren)`, auth)).json();
  a.need(f.mimeType === FOLDER, 'That id is not a Drive folder');
  a.need(f.capabilities?.canAddChildren === true, 'This account cannot add files to that folder');
  let perms;
  try { perms = (await (await call(send, 'GET', `${DRIVE}/files/${id}/permissions?supportsAllDrives=true&fields=permissions(type,role,domain)`, auth)).json()).permissions; }
  catch (e) { throw Error('Cannot read who can open that folder, so a document there could be public: ' + e.message); }
  a.need(Array.isArray(perms), 'Cannot read who can open that folder');
  a.need(!perms.some(p => p.type === 'anyone'), 'That folder is shared with anyone who has the link; review evidence would be public there. Pick a private folder');
  return { verdict: 'FOLDER_OK', folder: f.id, name: f.name, shared_drive: f.driveId || null, owners: (f.owners || []).map(o => o.emailAddress),
    shared_with: [...new Set(perms.map(p => p.type === 'domain' ? 'domain ' + p.domain : p.type))] };
}

async function images(docx) {
  const pandoc = ex.executable('docx');
  if (!pandoc) return null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-gdoc-'));
  try {
    const file = path.join(tmp, 'doc.docx');
    fs.writeFileSync(file, docx);
    const r = await v.run([pandoc, '--from=docx', '--to=html', '--standalone', '--embed-resources', '--data-dir=' + tmp, file], { cwd: tmp, env: process.env, timeout_ms: 60000, output_limit: 128 * 1024 * 1024 });
    return !r.error && r.exit_code === 0 ? (r.stdout.match(/src="data:image\//g) || []).length : null;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// The title of a review document comes from the ledger beside the DOCX, never from a shell argument.
function nameFor(docxFile) {
  const ledger = path.join(path.dirname(docxFile), 'review.json');
  a.need(fs.existsSync(ledger), 'No --name and no review.json beside the DOCX');
  const { mr } = JSON.parse(fs.readFileSync(ledger, 'utf8'));
  return `Review ${mr.host === 'gitlab' ? '!' : '#'}${mr.number} — ${String(mr.title).replace(/[\r\n]+/g, ' ').slice(0, 120)} (${String(mr.head).slice(0, 8)})`;
}

async function upload(docxFile, folder, name, { account, auth = token(account), send = fetch, count = images } = {}) {
  const ok = await check(folder, { account, auth, send });
  const id = ok.folder, bytes = fs.readFileSync(docxFile);
  a.need(bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && bytes.length <= 100 * 1024 * 1024, 'Upload a DOCX of at most 100 MiB');
  name ??= nameFor(docxFile);
  a.need(a.text(name) && name.length <= 200, 'Document name required (one line, at most 200 characters)');
  // Resumable: one request for the metadata, one for the bytes; works at any size multipart does not.
  const start = await call(send, 'POST', `${UPLOAD}/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,webViewLink,parents`, auth,
    JSON.stringify({ name, mimeType: GDOC, parents: [id] }), { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': DOCX, 'X-Upload-Content-Length': String(bytes.length) });
  const session = start.headers?.get?.('location');
  a.need(session && new URL(session).hostname === 'www.googleapis.com', 'Drive did not open an upload session');
  const created = await (await call(send, 'PUT', session, auth, bytes, { 'Content-Type': DOCX })).json();
  a.need(created.mimeType === GDOC && (created.parents || []).includes(id), 'Drive did not create a Google Doc in the requested folder');
  const out = { id: created.id, url: created.webViewLink, folder: id, sharing: 'unchanged — the document has the folder\'s access' };
  // From here the document exists: report it, never throw — a retry would create a second one.
  try {
    const back = Buffer.from(await (await call(send, 'GET', `${DRIVE}/files/${created.id}/export?mimeType=${encodeURIComponent(DOCX)}`, auth)).arrayBuffer());
    const [want, got] = [await count(bytes), await count(back)];
    const verified = want !== null && got !== null && got === want;
    return { verdict: verified ? 'GDOC_CREATED' : 'GDOC_UNVERIFIED', ...out, source_images: want, doc_images: got,
      note: verified ? 'Every image of the DOCX is in the Google Doc.' : 'Open the document and check its images; the automatic count did not match or could not run.' };
  } catch (e) {
    return { verdict: 'GDOC_UNVERIFIED', ...out, source_images: null, doc_images: null,
      note: (e.reason === 'exportSizeLimitExceeded' ? 'The document is larger than Drive will export (10 MB), so its images could not be counted' : 'Reading the document back failed: ' + e.message) + '. Open it and check its images; do not upload again.' };
  }
}

module.exports = { folderId, token, check, upload, nameFor, SIGN_IN };

if (require.main === module) (async () => {
  const [cmd, ...args] = process.argv.slice(2), opt = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const account = opt('--account');
  let out;
  if (cmd === 'check') out = await check(opt('--folder'), { account });
  else if (cmd === 'upload') {
    a.need(args[0] && !args[0].startsWith('--') && opt('--folder') && opt('--account'), 'usage: gdoc.cjs upload <report.docx> --folder <url|id> --account <email> [--name <title>]');
    out = await upload(args[0], opt('--folder'), opt('--name'), { account });
  } else { console.error('usage: gdoc.cjs check --folder <url|id> --account <email> | upload <report.docx> --folder <url|id> --account <email> [--name <title>]'); process.exitCode = 2; return; }
  console.log(JSON.stringify(out));
  if (!/^(FOLDER_OK|GDOC_CREATED)$/.test(out.verdict)) process.exitCode = 1;
})().catch(e => { console.error('Google Docs blocked: ' + e.message); process.exitCode = 2; });
