const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict'), cp = require('node:child_process');
const repo = path.resolve(process.argv[2] || '.'), i = require(path.join(repo, 'scripts/investigate.cjs')), a = require(path.join(repo, 'scripts/acceptance.cjs'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-investigate-'));
let sequence = 0, passed = 0, failed = 0;
function fixture(code = "console.log('target=qa tenant=example'); console.log('request=42 status=500')", options = {}, approved = true) {
  const root = path.join(tmp, String(++sequence)); fs.mkdirSync(root);
  const put = (file, value) => fs.writeFileSync(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value));
  const ref = { receipt: 'receipts/E1.json', stream: 'stdout', start_line: 1, end_line: 2 };
  const data = { version: 1, issue: 'QA reports request failure', scope: 'QA tenant example, request 42',
    questions: [{ id: 'Q1', text: 'What was observed?', answer: 'A command returned a failure record.', claims: ['C1'] }],
    claims: [{ id: 'C1', text: 'Retained output includes status 500.', kind: 'observed', evidence: [ref], limitations: 'Command output alone does not establish why.' }],
    review: { mode: 'self', findings: 'Only the investigating agent checked this report.' },
    conclusion: { status: 'supported', text: 'A failure record is present.', claims: ['C1'], limitations: 'Cause remains unknown.' }, next_steps: ['Inspect the request trace.'] };
  put('case.json', data); put('command.cjs', code);
  const request = { id: 'E1', argv: [process.execPath, 'command.cjs'], cwd: root, source: 'local QA fixture', scope: data.scope, timeout_ms: 3000, output_limit: 8192, ...options };
  put('request.json', request);
  put('interview.md', '# Interview\nSynthetic QA fixture; known scope and desired output.\n');
  put('investigation-plan.md', '# Investigation plan\nInspect fixture output and report observed results with limitations.\n');
  const approve = (fields = {}) => {
    const current = i.status(root);
    put('approval-request.json', { revision: current.revision, plan_sha256: current.plan_sha256, snapshot_sha256: current.snapshot_sha256, user_response: 'I approve this synthetic test plan.', message_ref: 'test-fixture:user-approval', ...fields });
    return i.approve(root, path.join(root, 'approval-request.json'));
  };
  if (approved) { i.plan(root); approve(); }
  return { root, put, data, ref, request, approve, plan: () => i.plan(root), status: () => i.status(root), save: () => put('case.json', data), capture: () => i.capture(root, path.join(root, 'request.json')), check: () => i.check(root) };
}
async function test(name, run) { try { await run(); passed++; console.error('PASS: ' + name); } catch (error) { failed++; console.error('FAIL: ' + name + ': ' + error.stack); } }
(async () => {
  await test('unplanned and unapproved captures cannot execute or create receipts', async () => {
    const f = fixture("require('node:fs').writeFileSync('ran.txt', 'executed')", {}, false);
    assert.equal(f.status().state, 'unplanned');
    await assert.rejects(f.capture, /recorded plan approval.*unplanned/);
    assert.equal(f.plan().state, 'awaiting_approval');
    await assert.rejects(f.capture, /recorded plan approval.*awaiting_approval/);
    assert.equal(fs.existsSync(path.join(f.root, 'ran.txt')), false);
    assert.equal(fs.existsSync(path.join(f.root, 'receipts')), false);
    const approved = f.approve(), receipt = await f.capture();
    assert.equal(approved.state, 'approved'); assert.equal(approved.approval_provenance, 'agent_saved');
    assert.match(approved.approval_limitations, /not authenticated user consent/);
    assert.equal(receipt.plan_revision, approved.revision); assert.equal(receipt.plan_sha256, approved.plan_sha256);
    assert.equal(receipt.snapshot_sha256, approved.snapshot_sha256);
    assert.equal(fs.readFileSync(path.join(f.root, 'ran.txt'), 'utf8'), 'executed');
  });
  await test('unchanged resume retains approval and never replaces history', () => {
    const f = fixture(), before = fs.readdirSync(path.join(f.root, 'plans')).map(name => [name, fs.readFileSync(path.join(f.root, 'plans', name), 'utf8')]);
    assert.equal(f.plan().state, 'approved'); assert.equal(f.status().revision, 1);
    assert.throws(f.approve, /awaiting approval/);
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'plans')).map(name => [name, fs.readFileSync(path.join(f.root, 'plans', name), 'utf8')]), before);
  });
  await test('changed plan or interview blocks capture until exact revision is approved', async () => {
    const f = fixture("require('node:fs').writeFileSync('ran.txt', 'executed')"), first = f.status();
    f.put('investigation-plan.md', '# Revised plan\nInvestigate a wider event window.\n');
    assert.equal(f.status().state, 'stale');
    await assert.rejects(f.capture, /recorded plan approval.*stale/);
    assert.equal(fs.existsSync(path.join(f.root, 'ran.txt')), false);
    const second = f.plan(); assert.equal(second.revision, 2); assert.equal(second.state, 'awaiting_approval');
    assert.throws(() => f.approve({ revision: first.revision, plan_sha256: first.plan_sha256 }), /does not match/);
    assert.throws(() => f.approve({ plan_sha256: '0'.repeat(64) }), /does not match/);
    await assert.rejects(f.capture, /recorded plan approval.*awaiting_approval/);
    f.approve(); f.put('interview.md', '# Updated interview\nThe issue concerns a different tenant.\n');
    assert.equal(f.status().state, 'stale'); await assert.rejects(f.capture, /recorded plan approval.*stale/);
    assert.equal(f.plan().revision, 3); f.approve(); assert.equal((await f.capture()).plan_revision, 3);
    assert.equal(fs.existsSync(path.join(f.root, 'plans', 'plan-1.json')), true);
    assert.equal(fs.existsSync(path.join(f.root, 'plans', 'approval-1.json')), true);
  });
  await test('approval requests retain a response and message reference without claiming authentication', () => {
    const f = fixture(undefined, {}, false), current = f.plan();
    for (const fields of [{ user_response: '' }, { message_ref: '' }, { approved: true }]) assert.throws(() => f.approve(fields), /Approval request needs/);
    assert.equal(f.status().state, 'awaiting_approval');
    f.approve({ user_response: 'Approved.\nPlease use the listed scope only.', message_ref: 'conversation:user-message-7' });
    const saved = JSON.parse(fs.readFileSync(path.join(f.root, 'plans', 'approval-1.json'), 'utf8'));
    assert.equal(saved.revision, current.revision); assert.equal(saved.plan_sha256, current.plan_sha256);
    assert.equal(saved.snapshot_sha256, current.snapshot_sha256);
    assert.equal(saved.provenance, 'agent_saved'); assert.equal(saved.message_ref, 'conversation:user-message-7');
    assert.match(saved.user_response, /listed scope/);
  });
  await test('approval and receipts cannot be replayed against identical plan text with different intake', async () => {
    const f = fixture(), approved = JSON.parse(fs.readFileSync(path.join(f.root, 'approval-request.json'), 'utf8'));
    const g = fixture(undefined, {}, false); g.put('interview.md', '# Interview\nA different tenant reported this incident.\n');
    const current = g.plan(); assert.equal(current.revision, approved.revision); assert.equal(current.plan_sha256, approved.plan_sha256);
    assert.notEqual(current.snapshot_sha256, approved.snapshot_sha256);
    assert.throws(() => g.approve(approved), /does not match/); assert.equal(g.status().state, 'awaiting_approval');
    g.approve(); const receipt = await f.capture(); fs.mkdirSync(path.join(g.root, 'receipts')); g.put('receipts/E1.json', receipt);
    assert.throws(g.check, /matching recorded plan approval/);
  });
  await test('plan hashes and receipt references expose damaged approval history', async () => {
    const f = fixture(); await f.capture();
    const file = path.join(f.root, 'plans', 'approval-1.json'), original = fs.readFileSync(file, 'utf8');
    const approval = JSON.parse(original); approval.user_response = 'changed'; fs.writeFileSync(file, JSON.stringify(approval));
    assert.throws(f.status, /altered plan history/); assert.throws(f.check, /altered plan history/);
    fs.writeFileSync(file, original); fs.unlinkSync(file);
    assert.throws(f.check, /matching recorded plan approval/);
    const snapshotFile = path.join(f.root, 'plans', 'plan-1.json'), snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
    snapshot.plan_markdown += 'changed'; fs.writeFileSync(snapshotFile, JSON.stringify(snapshot));
    assert.throws(f.status, /altered plan history/);
  });
  await test('plan history and draft paths cannot escape the run', async () => {
    const outside = path.join(tmp, 'outside-plans'); fs.mkdirSync(outside);
    const f = fixture(undefined, {}, false);
    fs.symlinkSync(outside, path.join(f.root, 'plans'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(f.plan, /escapes run directory/); await assert.rejects(f.capture, /escapes run directory/);
    assert.deepEqual(fs.readdirSync(outside), []);
    const g = fixture(undefined, {}, false), external = path.join(outside, 'interview.md'); fs.writeFileSync(external, 'External intake');
    fs.unlinkSync(path.join(g.root, 'interview.md')); fs.symlinkSync(external, path.join(g.root, 'interview.md'), 'file');
    assert.throws(g.plan, /escapes root/);
    const h = fixture(undefined, {}, false); h.plan();
    fs.symlinkSync(external, path.join(h.root, 'plans', 'approval-1.json'), 'file');
    assert.throws(h.approve, /escapes root/); assert.equal(fs.readFileSync(external, 'utf8'), 'External intake');
  });
  await test('CLI plan status and approval expose the gate without requiring a case report', () => {
    const f = fixture(undefined, {}, false); fs.unlinkSync(path.join(f.root, 'case.json'));
    const invoke = (action, ...args) => cp.spawnSync(process.execPath, [path.join(repo, 'scripts/investigate.cjs'), action, f.root, ...args], { encoding: 'utf8', windowsHide: true });
    let result = invoke('status'); assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).state, 'unplanned');
    result = invoke('plan'); assert.equal(result.status, 0); const current = JSON.parse(result.stdout); assert.equal(current.state, 'awaiting_approval');
    f.put('approval-request.json', { revision: current.revision, plan_sha256: current.plan_sha256, snapshot_sha256: current.snapshot_sha256, user_response: 'Approved fixture plan', message_ref: 'fixture-message' });
    result = invoke('approve', path.join(f.root, 'approval-request.json')); assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).state, 'approved');
    result = invoke('approve', path.join(f.root, 'approval-request.json')); assert.equal(result.status, 2); assert.equal(JSON.parse(result.stderr).verdict, 'PLAN_INVALID');
  });
  await test('real capture links retained lines and labels conclusions as analyst-assessed', async () => {
    const f = fixture(), r = await f.capture(), result = f.check();
    assert.equal(r.exit_code, 0); assert.equal(r.acquisition, 'process_capture'); assert.equal(result.verdict, 'STRUCTURE_VALID');
    assert.equal(result.conclusion_assessment, 'analyst_assessed'); assert.match(result.verification_limitations, /not source authenticity/);
    assert.deepEqual(result.acquisition_counts, { process_capture: 1, agent_saved: 0 });
    await assert.rejects(f.capture, /EEXIST/);
  });
  await test('nonzero exits remain usable evidence with a failure warning', async () => {
    const f = fixture("console.error('access denied'); process.exit(7)"); const r = await f.capture();
    f.ref.stream = 'stderr'; f.ref.end_line = 1; f.save();
    assert.equal(r.exit_code, 7); assert.deepEqual(f.check().failed_receipts, ['E1']);
    assert.match(f.check().warnings.join(' '), /failed attempt/);
  });
  await test('missing executable records failure instead of success', async () => {
    const f = fixture(undefined, { argv: ['forge-investigate-command-absent-0c63'] });
    const r = await f.capture(); assert.equal(r.error, 'ENOENT'); assert.equal(r.completeness, 'partial');
    assert.equal(r.stdout, ''); assert.equal(r.stderr, '');
    f.data.claims[0].text = 'The command could not start: ENOENT.';
    f.data.claims[0].evidence = ['error', 'exit_code', 'signal', 'completeness'].map(field => ({ receipt: 'receipts/E1.json', field }));
    f.save(); assert.deepEqual(f.check().failed_receipts, ['E1']); assert.deepEqual(f.check().uncited_receipts, []);
  });
  await test('successful empty output is citeable without fabricated lines', async () => {
    const f = fixture('process.exit(0)'), r = await f.capture();
    assert.equal(r.stdout, ''); assert.equal(r.stderr, ''); assert.equal(r.exit_code, 0);
    f.data.claims[0].text = 'The command exited zero and retained no output.';
    f.data.claims[0].evidence = ['exit_code', 'stdout', 'stderr'].map(field => ({ receipt: 'receipts/E1.json', field }));
    f.save(); assert.equal(f.check().verdict, 'STRUCTURE_VALID'); assert.deepEqual(f.check().failed_receipts, []);
  });
  await test('field citations reject unsupported metadata, ambiguity, and nonempty streams', async () => {
    const f = fixture(); await f.capture();
    for (const field of ['source', 'scope', 'analyst_assessment', 'invented']) {
      f.data.claims[0].evidence = [{ receipt: 'receipts/E1.json', field }]; f.save(); assert.throws(f.check, /Invalid evidence field/);
    }
    f.data.claims[0].evidence = [{ receipt: 'receipts/E1.json', field: 'stdout' }]; f.save(); assert.throws(f.check, /Nonempty streams require line citations/);
    for (const extra of [{ stream: 'stdout' }, { start_line: 1 }, { end_line: 1 }]) {
      f.data.claims[0].evidence = [{ receipt: 'receipts/E1.json', field: 'exit_code', ...extra }]; f.save(); assert.throws(f.check, /cannot also contain/);
    }
  });
  await test('output and time limits retain marked partial receipts', async () => {
    const f = fixture("process.stdout.write('x'.repeat(100000));", { output_limit: 256 });
    const r = await f.capture(); assert.equal(r.error, 'output_limit'); assert.equal(r.stdout.length, 256); assert.equal(r.completeness, 'partial');
    const g = fixture('setTimeout(() => {}, 5000)', { timeout_ms: 100 });
    const t = await g.capture(); assert.equal(t.error, 'timeout'); assert.equal(t.completeness, 'partial');
  });
  await test('missing receipts and invented line ranges are rejected', async () => {
    const f = fixture(); assert.throws(f.check, /Missing evidence/); await f.capture();
    f.ref.end_line = 3; f.save(); assert.throws(f.check, /outside retained stream/);
    f.ref.stream = 'stderr'; f.ref.end_line = 1; f.save(); assert.throws(f.check, /outside retained stream/);
  });
  await test('hash checks detect stream and metadata edits, including uncited receipts', async () => {
    const f = fixture(), r = await f.capture(); r.stdout += 'invented'; f.put('receipts/E1.json', r); assert.throws(f.check, /altered retained output/);
    r.stdout_sha256 = a.sha(r.stdout); f.put('receipts/E1.json', r); assert.throws(f.check, /Altered receipt metadata/);
    const g = fixture(); await g.capture(); const extra = { version: 1, id: 'E2', acquisition: 'agent_saved', source: 'MCP', scope: 'QA', captured_at: new Date().toISOString(), stdout: 'retained', stderr: '', stdout_sha256: a.sha('different'), stderr_sha256: a.sha(''), completeness: 'unknown', exit_code: null };
    g.put('receipts/E2.json', extra); assert.throws(g.check, /altered retained output/);
  });
  await test('path traversal and escaping receipt symlinks are rejected', async () => {
    const f = fixture(); await f.capture(); f.ref.receipt = '../outside.json'; f.save(); assert.throws(f.check, /Invalid evidence path/);
    const g = fixture(), outside = path.join(tmp, 'outside'); fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(g.root, 'receipts'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(g.capture, /escapes run directory/); assert.throws(g.check, /escapes run directory/);
    assert.deepEqual(fs.readdirSync(outside), []);
  });
  await test('unknown unresolved cases are valid without fabricated evidence', () => {
    const f = fixture(); f.data.claims[0].kind = 'unknown'; f.data.claims[0].evidence = [];
    f.data.conclusion.status = 'unresolved'; f.save(); assert.equal(f.check().conclusion_status, 'unresolved');
  });
  await test('duplicate IDs, unresolved claim references, and unsupported inferences fail', async () => {
    const f = fixture(); await f.capture(); f.data.claims.push({ ...f.data.claims[0] }); f.save(); assert.throws(f.check, /duplicate/);
    f.data.claims.pop(); f.data.questions[0].claims = ['C99']; f.save(); assert.throws(f.check, /claim references/);
    f.data.questions[0].claims = ['C1']; f.data.claims[0].kind = 'inferred'; f.save(); assert.throws(f.check, /needs reasoning/);
    f.data.claims[0].reasoning = 'An inference for review'; f.save(); assert.equal(f.check().verdict, 'STRUCTURE_VALID');
  });
  await test('a structurally valid unsupported conclusion is never certified as true', async () => {
    const f = fixture(); await f.capture();
    f.data.claims[0].kind = 'inferred'; f.data.claims[0].text = 'The database is definitely the root cause.';
    f.data.claims[0].reasoning = 'The analyst supplied reasoning that the checker cannot judge.';
    f.data.conclusion.status = 'demonstrated'; f.data.conclusion.text = f.data.claims[0].text; f.save();
    const result = f.check(); assert.equal(result.verdict, 'STRUCTURE_VALID');
    assert.equal(result.conclusion_status, 'demonstrated'); assert.equal(result.conclusion_assessment, 'analyst_assessed');
    assert.match(result.verification_limitations, /not source authenticity, citation relevance/);
  });
  await test('agent-saved provenance is explicit and cannot claim process metadata', () => {
    const f = fixture(); fs.mkdirSync(path.join(f.root, 'receipts'));
    const r = { version: 1, id: 'E1', acquisition: 'agent_saved', source: 'Slack MCP message locator', scope: f.data.scope,
      captured_at: new Date().toISOString(), stdout: 'QA reported failure\nNo direct request trace', stderr: '', stdout_sha256: a.sha('QA reported failure\nNo direct request trace'), stderr_sha256: a.sha(''), completeness: 'unknown', exit_code: null };
    f.put('receipts/E1.json', r); const result = f.check(); assert.equal(result.acquisition_counts.agent_saved, 1); assert.deepEqual(result.incomplete_receipts, ['E1']);
    for (const field of ['exit_code', 'error', 'signal', 'completeness']) {
      f.data.claims[0].evidence = [{ receipt: 'receipts/E1.json', field }]; f.save(); assert.throws(f.check, /require process capture/);
    }
    f.data.claims[0].evidence = [{ receipt: 'receipts/E1.json', field: 'stderr' }]; f.save(); assert.equal(f.check().verdict, 'STRUCTURE_VALID');
    r.argv = ['made-up-command']; f.put('receipts/E1.json', r); assert.throws(f.check, /cannot claim process execution/);
  });
  await test('shell metacharacters are literal and explicit shells are rejected', async () => {
    const f = fixture("console.log(process.argv[2]); console.log('second line')", { argv: [process.execPath, 'command.cjs', 'safe & echo invented > injected.txt'] });
    const r = await f.capture(); assert.match(r.stdout, /safe & echo/); assert.equal(fs.existsSync(path.join(f.root, 'injected.txt')), false);
    const g = fixture(undefined, { argv: ['powershell.exe', '-Command', 'Write-Output bad'] }); await assert.rejects(g.capture, /not a shell command/);
  });
  await test('inherited secret values are redacted and secret requests are rejected', async () => {
    const key = 'FORGE_INVESTIGATE_TEST_TOKEN', old = process.env[key];
    try {
      process.env[key] = 'secret-fixture-5918';
      const f = fixture("console.log(process.env.FORGE_INVESTIGATE_TEST_TOKEN); console.error('Bearer another-value')");
      const r = await f.capture(); assert.match(r.stdout, /REDACTED/); assert.match(r.stderr, /REDACTED/); assert.ok(!JSON.stringify(r).includes(process.env[key]));
      const g = fixture(undefined, { argv: [process.execPath, '--token', process.env[key]] }); await assert.rejects(g.capture, /Credentials must not/);
      const h = fixture(undefined, { env: { TOKEN: 'plaintext' } }); await assert.rejects(h.capture, /credentials must be inherited/);
    } finally { if (old === undefined) delete process.env[key]; else process.env[key] = old; }
  });
  await test('CLI unresolved passes and malformed case returns STRUCTURE_INVALID', () => {
    const f = fixture(); f.data.claims[0].kind = 'unknown'; f.data.claims[0].evidence = []; f.data.conclusion.status = 'unresolved'; f.save();
    const invoke = () => cp.spawnSync(process.execPath, [path.join(repo, 'scripts/investigate.cjs'), 'check', f.root], { encoding: 'utf8', windowsHide: true });
    const valid = invoke(); assert.equal(valid.status, 0); assert.equal(JSON.parse(valid.stdout).verdict, 'STRUCTURE_VALID');
    f.put('case.json', '{invalid'); const invalid = invoke(); assert.equal(invalid.status, 2); assert.equal(JSON.parse(invalid.stderr).verdict, 'STRUCTURE_INVALID');
  });
  console.log(`${passed}/${passed + failed} investigation checks passed`); if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  const resolved = fs.realpathSync(tmp);
  assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir())); assert(path.basename(resolved).startsWith('forge-investigate-'));
  fs.rmSync(resolved, { recursive: true, force: true });
});
