// Run the real investigation lifecycle using only an isolated installed skill bundle.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process'), { createHash } = require('node:crypto');

module.exports = (scripts, project) => {
  const write = (file, data) => fs.writeFileSync(path.join(project, file), typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
  const invoke = (script, args, expected = 0, env = process.env) => {
    const result = spawnSync(process.execPath, [path.join(scripts, script), ...args], { cwd: project, env, encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.ifError(result.error); assert.equal(result.status, expected, result.stderr || result.stdout);
    return JSON.parse(result.stdout || result.stderr);
  };
  const investigate = (action, file, expected) => invoke('investigate.cjs', [action, project, ...(file ? [file] : [])], expected);
  write('interview.md', 'Synthetic installed-bundle test; no external sources.\n');
  write('investigation-plan.md', 'Run the local fixture and present its image and output.\n');
  const request = { id: 'E1', argv: [process.execPath, '-e', "console.log('installed fixture')"], cwd: project, source: 'synthetic package fixture', scope: 'local test only' };
  write('request.json', request);
  assert.equal(investigate('capture', 'request.json', 2).verdict, 'CAPTURE_FAILED');
  assert.equal(fs.existsSync(path.join(project, 'receipts')), false);
  const planned = investigate('plan');
  assert.equal(planned.state, 'awaiting_approval');
  investigate('capture', 'request.json', 2);
  write('approval-request.json', { revision: planned.revision, plan_sha256: planned.plan_sha256, snapshot_sha256: planned.snapshot_sha256,
    user_response: 'Approve this synthetic test plan.', message_ref: 'package-fixture:user-1' });
  assert.equal(investigate('approve', 'approval-request.json').state, 'approved');
  assert.equal(investigate('capture', 'request.json').verdict, 'CAPTURED');
  assert.equal(investigate('plan').state, 'approved');
  const receipt = JSON.parse(fs.readFileSync(path.join(project, 'receipts/E1.json'), 'utf8'));
  assert.equal(receipt.stdout, 'installed fixture\n');
  assert.equal(receipt.snapshot_sha256, planned.snapshot_sha256);
  fs.appendFileSync(path.join(project, 'investigation-plan.md'), 'Changed scope needs another approval.\n');
  write('request.json', { ...request, id: 'E2' });
  assert.equal(investigate('status').state, 'stale');
  investigate('capture', 'request.json', 2);
  assert.equal(fs.existsSync(path.join(project, 'receipts/E2.json')), false);

  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
  fs.mkdirSync(path.join(project, 'visuals')); write('visuals/fixture.png', bytes);
  write('case.json', { version: 1, issue: 'Synthetic package rendering test', scope: 'Local fixture only',
    questions: [{ id: 'Q1', text: 'What is visible?', answer: 'A fixture image and command output.', claims: ['C1'] }],
    claims: [{ id: 'C1', text: 'The local fixture produced retained output and an image.', kind: 'observed',
      evidence: [{ visual: 'V1' }, { receipt: 'receipts/E1.json', stream: 'stdout', start_line: 1, end_line: 1 }], limitations: 'Packaging test only.' }],
    review: { mode: 'self', findings: 'Local fixture rendering only.' },
    conclusion: { status: 'unresolved', text: 'No incident investigated.', claims: ['C1'], limitations: 'Synthetic data.' }, next_steps: [],
    report: { research: { text: 'No real incident research was performed.', claims: ['C1'] }, delivery: 'Delivered the synthetic fixture output and image.', stakeholder_reply: { text: 'Demonstration only; not a client finding.', claims: ['C1'] } },
    visuals: [{ id: 'V1', file: 'visuals/fixture.png', sha256: createHash('sha256').update(bytes).digest('hex'), kind: 'reproduction',
      caption: 'One-pixel synthetic fixture, not incident evidence', source: 'Local package test', captured_at: 'unknown',
      scope: 'Local test', limitations: 'Only validates embedding.', claims: ['C1'], acquisition: 'agent_saved' }] });
  assert.equal(investigate('check').verdict, 'STRUCTURE_VALID');
  const rendered = invoke('investigate-report.cjs', ['html', project]);
  assert.equal(rendered.embedded_visuals, 1);
  const html = fs.readFileSync(path.join(project, rendered.file), 'utf8');
  for (const text of ['data:image/png;base64,' + bytes.toString('base64'), 'installed fixture', 'Stakeholder reply draft', 'Expected versus delivered results']) assert.ok(html.includes(text), text);
  const unavailable = invoke('investigate-export.cjs', ['pdf', project], 3, { ...process.env, FORGE_CHROME: path.join(project, 'missing-browser.exe') });
  assert.equal(unavailable.verdict, 'EXPORT_UNAVAILABLE');
  assert.equal(fs.existsSync(path.join(project, 'report.pdf')), false);
};
