// Retained incident evidence and structural checks. This does not certify truth.
const fs = require('node:fs'), path = require('node:path');
const a = require('./acceptance.cjs'), v = require('./verification.cjs');
const id = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(value);
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const inside = (root, file) => { const rel = path.relative(root, file); return !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep); };
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const lines = value => value === '' ? [] : value.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
const receiptHash = receipt => { const { receipt_sha256, ...data } = receipt; return a.sha(JSON.stringify(data)); };
const recordHash = record => { const { record_sha256, ...data } = record; return a.sha(JSON.stringify(data)); };
const prose = value => typeof value === 'string' && value.trim().length > 0 && !value.includes('\0');
const secrets = () => Object.entries(process.env).filter(([key, value]) => value && /(?:^|_)(?:TOKEN|PASSWORD|PASSWD|SECRET|API_KEY|PRIVATE_KEY|CREDENTIALS|AUTHORIZATION|ACCESS_KEY|COOKIE|KEY)(?:_|$)/i.test(key)).map(([, value]) => value);
const limitation = 'Structure, retained hashes, and citation ranges only; not source authenticity, citation relevance, completeness of an investigation, or causal truth. Conclusion status and review mode are analyst-assessed. Local hashes are not signatures.';
const approvalLimitation = 'Approval is an agent-saved record, not authenticated user consent. The helper gates its process captures only; it cannot enforce other tools or judge whether an action fits the approved scope.';

function planDirectory(root, create = false) {
  const dir = path.join(root, 'plans');
  if (create && !fs.existsSync(dir)) fs.mkdirSync(dir);
  if (!fs.existsSync(dir)) return null;
  a.need(inside(root, fs.realpathSync(dir)) && fs.statSync(dir).isDirectory(), 'Plans directory escapes run directory');
  return dir;
}

function draft(root) {
  const interview_markdown = fs.readFileSync(a.local(root, 'interview.md'), 'utf8');
  const plan_markdown = fs.readFileSync(a.local(root, 'investigation-plan.md'), 'utf8');
  a.need(prose(interview_markdown) && prose(plan_markdown), 'Nonempty interview.md and investigation-plan.md required');
  return { interview_markdown, interview_sha256: a.sha(interview_markdown), plan_markdown, plan_sha256: a.sha(plan_markdown) };
}

function planHistory(root) {
  const dir = planDirectory(root), plans = new Map(), approvals = new Map();
  if (!dir) return { plans, approvals };
  for (const name of fs.readdirSync(dir)) {
    const match = /^(plan|approval)-([1-9][0-9]*)\.json$/.exec(name);
    a.need(match && Number.isSafeInteger(Number(match[2])), 'Unexpected plan history filename: ' + name);
    const value = json(a.local(root, 'plans/' + name));
    a.need(a.object(value) && value.version === 1 && value.revision === Number(match[2]) && a.digest(value.plan_sha256) && value.record_sha256 === recordHash(value), 'Invalid or altered plan history: ' + name);
    if (match[1] === 'plan') {
      a.need(date(value.created_at) && prose(value.interview_markdown) && prose(value.plan_markdown) && value.interview_sha256 === a.sha(value.interview_markdown) && value.plan_sha256 === a.sha(value.plan_markdown), 'Invalid plan snapshot: ' + name);
      plans.set(value.revision, value);
    } else {
      a.need(date(value.recorded_at) && a.digest(value.snapshot_sha256) && value.provenance === 'agent_saved' && prose(value.user_response) && a.text(value.message_ref), 'Invalid approval record: ' + name);
      approvals.set(value.revision, value);
    }
  }
  a.need([...plans.keys()].sort((x, y) => x - y).every((n, index) => n === index + 1), 'Plan revisions must form an unbroken history');
  for (const [revision, approval] of approvals) a.need(plans.get(revision)?.plan_sha256 === approval.plan_sha256 && plans.get(revision)?.record_sha256 === approval.snapshot_sha256, 'Approval does not match its plan revision and snapshot');
  return { plans, approvals };
}

function saveRecord(file, record) {
  record.record_sha256 = recordHash(record);
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
}

function status(runDirectory) {
  const root = fs.realpathSync(runDirectory), history = planHistory(root), latest = history.plans.get(history.plans.size);
  if (!latest) return { state: 'unplanned', revision: null, plan_sha256: null, snapshot_sha256: null, approval_provenance: null, approval_limitations: approvalLimitation };
  const current = draft(root), approval = history.approvals.get(latest.revision);
  const unchanged = latest.plan_sha256 === current.plan_sha256 && latest.interview_sha256 === current.interview_sha256;
  return { state: !unchanged ? 'stale' : approval ? 'approved' : 'awaiting_approval', revision: latest.revision, plan_sha256: latest.plan_sha256, snapshot_sha256: latest.record_sha256,
    approval_provenance: approval ? approval.provenance : null, approval_limitations: approvalLimitation };
}

function plan(runDirectory) {
  const root = fs.realpathSync(runDirectory), current = draft(root), history = planHistory(root), latest = history.plans.get(history.plans.size);
  if (!latest || latest.plan_sha256 !== current.plan_sha256 || latest.interview_sha256 !== current.interview_sha256) {
    const revision = history.plans.size + 1, dir = planDirectory(root, true);
    saveRecord(path.join(dir, 'plan-' + revision + '.json'), { version: 1, revision, created_at: new Date().toISOString(), ...current });
  }
  return status(root);
}

function approve(runDirectory, requestFile) {
  const root = fs.realpathSync(runDirectory), current = status(root), request = json(requestFile);
  a.need(a.object(request) && Object.keys(request).every(k => ['revision', 'plan_sha256', 'snapshot_sha256', 'user_response', 'message_ref'].includes(k)) && Number.isSafeInteger(request.revision) && request.revision > 0 && a.digest(request.plan_sha256) && a.digest(request.snapshot_sha256) && prose(request.user_response) && a.text(request.message_ref), 'Approval request needs revision, plan_sha256, snapshot_sha256, actual user_response, and message_ref');
  a.need(current.state === 'awaiting_approval', 'Plan must be current and awaiting approval; prepare the plan before recording its actual user approval');
  a.need(request.revision === current.revision && request.plan_sha256 === current.plan_sha256 && request.snapshot_sha256 === current.snapshot_sha256, 'Approval request does not match the current plan revision and snapshot hashes');
  saveRecord(path.join(planDirectory(root), 'approval-' + current.revision + '.json'), { version: 1, ...request, recorded_at: new Date().toISOString(), provenance: 'agent_saved' });
  return status(root);
}

function receiptDirectory(root, create = false) {
  const dir = path.join(root, 'receipts');
  if (create && !fs.existsSync(dir)) fs.mkdirSync(dir);
  if (!fs.existsSync(dir)) return null;
  a.need(inside(root, fs.realpathSync(dir)) && fs.statSync(dir).isDirectory(), 'Receipts directory escapes run directory');
  return dir;
}

async function capture(runDirectory, requestFile) {
  const root = fs.realpathSync(runDirectory), request = json(requestFile), hidden = secrets();
  const approved = status(root);
  a.need(approved.state === 'approved', 'Capture requires current recorded plan approval; state: ' + approved.state);
  a.need(a.object(request) && Object.keys(request).every(k => ['id', 'argv', 'cwd', 'source', 'scope', 'timeout_ms', 'output_limit'].includes(k)), 'Use capture request fields only; credentials must be inherited, never recorded in a request');
  a.need(id(request.id) && Array.isArray(request.argv) && request.argv.length > 0 && request.argv.every(a.text) && a.text(request.cwd) && a.text(request.source) && a.text(request.scope), 'Request needs id, argv, cwd, source, and scope');
  const timeout_ms = request.timeout_ms ?? 30000, output_limit = request.output_limit ?? 1024 * 1024;
  a.need(Number.isSafeInteger(timeout_ms) && timeout_ms > 0 && timeout_ms <= 300000 && Number.isSafeInteger(output_limit) && output_limit > 0 && output_limit <= 8 * 1024 * 1024, 'Capture bounds: timeout 1..300000 ms; output 1..8388608 bytes');
  const fields = [request.id, ...request.argv, request.cwd, request.source, request.scope];
  a.need(fields.every(value => v.redact(value, hidden) === value && !/--?(?:token|password|passwd|secret|api[-_]?key|authorization|access[-_]?key|credential)(?:[=\s]|$)/i.test(value)), 'Credentials must not appear in request arguments or metadata');
  a.need(!/^(?:(?:ba|z|k|fi|da)?sh|cmd|powershell|pwsh)(?:\.exe)?$/i.test(path.basename(request.argv[0])), 'Pass an executable and separate arguments, not a shell command');
  const cwd = fs.realpathSync(request.cwd);
  a.need(fs.statSync(cwd).isDirectory(), 'Capture cwd must be an existing directory');
  const dir = receiptDirectory(root, true), file = path.join(dir, request.id + '.json');
  // Exclusive reservation prevents replacing evidence or following a file symlink.
  const fd = fs.openSync(file, 'wx');
  try {
    const started_at = new Date().toISOString(), began = performance.now();
    const result = await v.run(request.argv, { cwd, env: process.env, timeout_ms, output_limit });
    const stdout = v.redact(result.stdout, hidden), stderr = v.redact(result.stderr, hidden);
    const receipt = { version: 1, id: request.id, acquisition: 'process_capture', source: request.source, scope: request.scope,
      plan_revision: approved.revision, plan_sha256: approved.plan_sha256, snapshot_sha256: approved.snapshot_sha256,
      argv: request.argv, cwd, timeout_ms, output_limit, started_at, ended_at: new Date().toISOString(), elapsed_ms: performance.now() - began,
      ...result, stdout, stderr, stdout_sha256: a.sha(stdout), stderr_sha256: a.sha(stderr), redacted: true,
      completeness: result.error || result.signal ? 'partial' : 'complete' };
    receipt.receipt_sha256 = receiptHash(receipt);
    fs.writeFileSync(fd, JSON.stringify(receipt, null, 2) + '\n');
    return receipt;
  } finally { fs.closeSync(fd); }
}

function validateReceipt(receipt, name) {
  a.need(a.object(receipt) && receipt.version === 1 && id(receipt.id) && name === receipt.id + '.json' && a.text(receipt.source) && a.text(receipt.scope), 'Invalid receipt identity or declared metadata: ' + name);
  a.need(['process_capture', 'agent_saved'].includes(receipt.acquisition) && ['complete', 'partial', 'unknown'].includes(receipt.completeness), 'Invalid receipt acquisition or completeness: ' + name);
  a.need(typeof receipt.stdout === 'string' && typeof receipt.stderr === 'string' && receipt.stdout_sha256 === a.sha(receipt.stdout) && receipt.stderr_sha256 === a.sha(receipt.stderr), 'Missing or altered retained output: ' + name);
  if (receipt.receipt_sha256 !== undefined) a.need(receipt.receipt_sha256 === receiptHash(receipt), 'Altered receipt metadata: ' + name);
  if (['plan_revision', 'plan_sha256', 'snapshot_sha256'].some(key => key in receipt)) a.need(Number.isSafeInteger(receipt.plan_revision) && receipt.plan_revision > 0 && a.digest(receipt.plan_sha256) && a.digest(receipt.snapshot_sha256), 'Invalid receipt plan reference: ' + name);
  if (receipt.acquisition === 'agent_saved') {
    a.need(date(receipt.captured_at) && receipt.exit_code === null && !['argv', 'cwd', 'started_at', 'ended_at', 'elapsed_ms', 'signal', 'error'].some(k => k in receipt), 'Agent-saved evidence cannot claim process execution: ' + name);
  } else {
    a.need(a.digest(receipt.receipt_sha256) && Array.isArray(receipt.argv) && receipt.argv.length > 0 && receipt.argv.every(a.text) && a.text(receipt.cwd) && receipt.redacted === true, 'Missing process capture metadata: ' + name);
    a.need(date(receipt.started_at) && date(receipt.ended_at) && Date.parse(receipt.ended_at) >= Date.parse(receipt.started_at) && Number.isFinite(receipt.elapsed_ms) && receipt.elapsed_ms >= 0, 'Invalid process capture timing: ' + name);
    a.need(Number.isSafeInteger(receipt.timeout_ms) && receipt.timeout_ms > 0 && receipt.timeout_ms <= 300000 && Number.isSafeInteger(receipt.output_limit) && receipt.output_limit > 0 && receipt.output_limit <= 8 * 1024 * 1024, 'Invalid process capture bounds: ' + name);
    a.need((receipt.exit_code === null || (Number.isInteger(receipt.exit_code) && receipt.exit_code >= 0)) && (receipt.signal === null || a.text(receipt.signal)) && (receipt.error === null || a.text(receipt.error)), 'Invalid process result: ' + name);
    a.need(!(receipt.error || receipt.signal || receipt.exit_code === null) || receipt.completeness !== 'complete', 'Incomplete execution cannot claim complete output: ' + name);
  }
  return receipt;
}

function check(runDirectory) {
  const root = fs.realpathSync(runDirectory), c = json(a.local(root, 'case.json'));
  a.need(a.object(c) && c.version === 1 && a.text(c.issue) && a.text(c.scope), 'Case needs version 1, issue, and scope');
  a.need(Array.isArray(c.claims) && c.claims.length > 0 && Array.isArray(c.questions) && c.questions.length > 0, 'Case needs nonempty claims and questions');
  a.need(a.object(c.review) && ['independent', 'self', 'unavailable'].includes(c.review.mode) && a.text(c.review.findings), 'Record review mode and findings');
  a.need(a.object(c.conclusion) && ['demonstrated', 'supported', 'unresolved'].includes(c.conclusion.status) && a.text(c.conclusion.text) && a.text(c.conclusion.limitations), 'Record an analyst-assessed conclusion and limitations');
  a.need(Array.isArray(c.next_steps) && c.next_steps.every(a.text), 'next_steps must contain nonempty strings');
  const receipts = new Map(), dir = receiptDirectory(root);
  let history;
  if (dir) for (const name of fs.readdirSync(dir)) {
    a.need(/^[A-Za-z][A-Za-z0-9_-]{0,79}\.json$/.test(name), 'Unexpected receipt filename: ' + name);
    const receipt = validateReceipt(json(a.local(root, 'receipts/' + name)), name);
    if (receipt.plan_revision !== undefined) {
      history ??= planHistory(root);
      a.need(history.plans.get(receipt.plan_revision)?.plan_sha256 === receipt.plan_sha256 && history.plans.get(receipt.plan_revision)?.record_sha256 === receipt.snapshot_sha256 && history.approvals.has(receipt.plan_revision), 'Receipt lacks its matching recorded plan approval: ' + name);
    }
    a.need(!receipts.has(receipt.id), 'Duplicate receipt ID: ' + receipt.id); receipts.set(receipt.id, receipt);
  }
  const visuals = require('./investigate-report.cjs').validateVisuals(root, c);
  const seen = new Set(), claims = new Set(), cited = new Set();
  function unique(value) { a.need(id(value) && !seen.has(value), 'Invalid or duplicate question/claim ID: ' + value); seen.add(value); }
  function refs(list) {
    a.need(Array.isArray(list), 'Evidence must be an array');
    for (const ref of list) {
      if (a.object(ref) && 'visual' in ref) {
        a.need(Object.keys(ref).length === 1 && typeof ref.visual === 'string' && visuals.has(ref.visual), 'Invalid or missing visual evidence reference');
        a.need(visuals.get(ref.visual).kind !== 'diagram', 'Explanatory diagrams cannot serve as source evidence');
        continue;
      }
      a.need(a.object(ref) && typeof ref.receipt === 'string' && /^receipts\/[A-Za-z][A-Za-z0-9_-]{0,79}\.json$/.test(ref.receipt), 'Invalid evidence path');
      const receipt = receipts.get(path.basename(ref.receipt, '.json'));
      a.need(receipt, 'Missing evidence receipt: ' + ref.receipt);
      if ('field' in ref) {
        a.need(!['stream', 'start_line', 'end_line'].some(key => key in ref), 'Field citations cannot also contain stream or line fields');
        a.need(['exit_code', 'error', 'signal', 'completeness', 'stdout', 'stderr'].includes(ref.field), 'Invalid evidence field');
        if (['stdout', 'stderr'].includes(ref.field)) a.need(receipt[ref.field] === '', 'Nonempty streams require line citations');
        else a.need(receipt.acquisition === 'process_capture', 'Result metadata citations require process capture');
      } else {
        a.need(['stdout', 'stderr'].includes(ref.stream), 'Invalid evidence stream');
        a.need(Number.isSafeInteger(ref.start_line) && Number.isSafeInteger(ref.end_line) && ref.start_line >= 1 && ref.end_line >= ref.start_line && ref.end_line <= lines(receipt[ref.stream]).length, 'Citation outside retained stream: ' + ref.receipt);
      }
      cited.add(receipt.id);
    }
  }
  for (const claim of c.claims) {
    a.need(a.object(claim) && a.text(claim.text) && ['observed', 'reported', 'inferred', 'hypothesis', 'unknown'].includes(claim.kind) && a.text(claim.limitations), 'Invalid claim or missing limitations');
    unique(claim.id); claims.add(claim.id); refs(claim.evidence);
    a.need(claim.kind === 'unknown' || claim.evidence.length > 0, 'Non-unknown claim needs evidence: ' + claim.id);
    a.need(claim.kind !== 'inferred' || a.text(claim.reasoning), 'Inferred claim needs reasoning: ' + claim.id);
    if (claim.reasoning !== undefined) a.need(a.text(claim.reasoning), 'Reasoning must be a nonempty string');
    if (claim.counterevidence !== undefined) refs(claim.counterevidence);
  }
  function claimRefs(list) { a.need(Array.isArray(list) && list.length > 0 && new Set(list).size === list.length && list.every(value => claims.has(value)), 'Question/conclusion needs unique existing claim references'); }
  for (const question of c.questions) {
    a.need(a.object(question) && a.text(question.text) && a.text(question.answer), 'Question needs text and answer');
    unique(question.id); claimRefs(question.claims);
  }
  claimRefs(c.conclusion.claims);
  if (c.report !== undefined) {
    a.need(a.object(c.report) && a.text(c.report.delivery), 'Report needs an expected-versus-delivered summary');
    for (const section of ['research', 'stakeholder_reply']) {
      a.need(a.object(c.report[section]) && a.text(c.report[section].text), 'Report needs ' + section + ' text and claims');
      claimRefs(c.report[section].claims);
    }
  }
  const acquisition_counts = { process_capture: 0, agent_saved: 0 }, incomplete_receipts = [], failed_receipts = [], uncited_receipts = [];
  for (const receipt of receipts.values()) {
    acquisition_counts[receipt.acquisition]++;
    if (receipt.completeness !== 'complete') incomplete_receipts.push(receipt.id);
    if (receipt.acquisition === 'process_capture' && (receipt.exit_code !== 0 || receipt.signal || receipt.error)) failed_receipts.push(receipt.id);
    if (!cited.has(receipt.id)) uncited_receipts.push(receipt.id);
  }
  const warnings = [];
  if (acquisition_counts.agent_saved) warnings.push('Agent-saved receipts are retained copies, not independently captured tool executions.');
  if (incomplete_receipts.length) warnings.push('Partial or unknown capture completeness limits what can be inferred from missing output.');
  if (failed_receipts.length) warnings.push('Failed command receipts are evidence of a failed attempt, not successful source access.');
  if (c.review.mode !== 'independent') warnings.push('No independent review is recorded.');
  if (![...visuals.values()].some(visual => visual.kind !== 'diagram' && visual.include_in_report !== false)) warnings.push('No visual source evidence is included in the report.');
  return { verdict: 'STRUCTURE_VALID', conclusion_status: c.conclusion.status, conclusion_assessment: 'analyst_assessed', acquisition_counts,
    incomplete_receipts, failed_receipts, uncited_receipts, visual_count: visuals.size, visual_gaps: c.visual_gaps || [], warnings, verification_limitations: limitation };
}

module.exports = { plan, approve, status, capture, check };
if (require.main === module) (async () => {
  const [action, ...args] = process.argv.slice(2);
  if (action === 'capture') {
    a.need(args.length === 2, 'capture <run-dir> <request.json>');
    const receipt = await capture(...args);
    console.log(JSON.stringify({ verdict: 'CAPTURED', receipt: 'receipts/' + receipt.id + '.json', exit_code: receipt.exit_code, error: receipt.error, completeness: receipt.completeness }));
    if (receipt.exit_code !== 0 || receipt.signal || receipt.error) process.exitCode = 1;
  } else if (action === 'plan' || action === 'status') {
    a.need(args.length === 1, action + ' <run-dir>');
    console.log(JSON.stringify(action === 'plan' ? plan(...args) : status(...args)));
  } else if (action === 'approve') {
    a.need(args.length === 2, 'approve <run-dir> <approval-request.json>');
    console.log(JSON.stringify(approve(...args)));
  } else {
    a.need(action === 'check' && args.length === 1, 'check <run-dir>');
    console.log(JSON.stringify(check(...args)));
  }
})().catch(error => { console.error(JSON.stringify({ verdict: process.argv[2] === 'check' ? 'STRUCTURE_INVALID' : process.argv[2] === 'capture' ? 'CAPTURE_FAILED' : 'PLAN_INVALID', error: error.message })); process.exitCode = 2; });
