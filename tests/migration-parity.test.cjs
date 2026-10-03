const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict'), cp = require('node:child_process'), crypto = require('node:crypto');
const repo = path.resolve(process.argv[2] || '.'), script = path.join(repo, 'scripts/migration-parity.cjs'), api = require(script);
const sha = text => crypto.createHash('sha256').update(text).digest('hex'), sourceSHA = '1'.repeat(40), candidateSHA = '2'.repeat(40);
let passed = 0, failed = 0;
function fixture() {
  const corpus = { version: 1, cases: [
    { id: 'normal', kind: 'normal', items: ['add'], input: { values: [2, 3] } },
    { id: 'boundary', kind: 'boundary', items: ['add'], input: { values: [0, -2] } },
    { id: 'error', kind: 'error', items: ['add'], input: { values: null } }
  ] }, corpusText = JSON.stringify(corpus);
  const source = { version: 1, revision: sourceSHA, corpus_sha256: sha(corpusText), cases: corpus.cases.map((c, i) => ({ id: c.id, input: c.input,
    output: { status: i === 2 ? 400 : 200, data: i === 2 ? null : { sum: i === 0 ? 5 : -2, list: [1, 2] },
      errors: i === 2 ? [{ code: 'INVALID_INPUT', message: 'Array required' }] : [], effects: [{ topic: 'request-count', delta: 1 }] } })) };
  const candidate = structuredClone(source); candidate.revision = candidateSHA;
  return { corpus, corpusText, source, candidate,
    check: () => api.compareText(corpusText, JSON.stringify(source), JSON.stringify(candidate), sourceSHA, candidateSHA) };
}
function test(name, run) {
  try { run(); passed++; console.log('PASS: ' + name); }
  catch (e) { failed++; console.error('FAIL: ' + name + ': ' + e.stack); }
}
test('matching observed behavior covers every frozen case', () => {
  const f = fixture(), r = f.check(); assert.equal(r.verdict, 'MATCH'); assert.equal(r.matched, 3); assert.equal(r.total, 3); assert.equal(r.corpus_sha256, sha(f.corpusText));
});
test('object key order and case order do not change parity', () => {
  const f = fixture(); f.candidate.cases.reverse(); const c = f.candidate.cases.find(c => c.id === 'normal'); c.input = { values: [2, 3] }; c.output.data = { list: [1, 2], sum: 5 };
  assert.equal(f.check().verdict, 'MATCH');
});
test('all four observable facets have independent negative controls', () => {
  for (const [field, value] of [['status', 201], ['data', { sum: 6, list: [1, 2] }], ['errors', [{ code: 'unexpected' }]], ['effects', []]]) {
    const f = fixture(); f.candidate.cases[0].output[field] = value; const r = f.check(); assert.equal(r.verdict, 'MISMATCH'); assert.equal(r.matched, 2); assert.deepEqual(r.mismatches, [{ id: 'normal', field: 'output.' + field }]);
  }
});
test('array ordering, types and additional captured fields are preserved', () => {
  for (const change of [c => c.output.data.list.reverse(), c => c.output.data.sum = '5', c => c.output.headers = { location: '/wrong' }]) {
    const f = fixture(); change(f.candidate.cases[0]); assert.equal(f.check().verdict, 'MISMATCH');
  }
});
test('candidate input changes cannot pass against identical outputs', () => {
  const f = fixture(); f.candidate.cases[0].input.values = [1, 4]; assert.deepEqual(f.check().mismatches, [{ id: 'normal', field: 'input' }]);
});
test('baseline inputs must match the frozen corpus', () => {
  const f = fixture(); f.source.cases[0].input.values = [1, 4]; assert.throws(f.check, /Source input differs/);
});
test('source and candidate identities cannot drift', () => {
  for (const document of ['source', 'candidate']) { const f = fixture(); f[document].revision = '3'.repeat(40); assert.throws(f.check, /revision differs/); }
  const f = fixture(); assert.throws(() => api.compareText(f.corpusText, JSON.stringify(f.source), JSON.stringify(f.candidate), 'HEAD'), /Full expected/);
});
test('each observation binds the exact frozen corpus digest', () => {
  for (const document of ['source', 'candidate']) { const f = fixture(); f[document].corpus_sha256 = '0'.repeat(64); assert.throws(f.check, /corpus identity/); }
});
test('omitted, extra and duplicate cases fail closed in either observation', () => {
  for (const document of ['source', 'candidate']) for (const edit of [rows => rows.pop(), rows => rows.push({ ...rows[0], id: 'extra' }), rows => rows.push(rows[0])]) {
    const f = fixture(); edit(f[document].cases); assert.throws(f.check, /case ID/);
  }
});
test('duplicate corpus IDs and incomplete coverage metadata are invalid', () => {
  for (const edit of [c => c.cases.push(c.cases[0]), c => delete c.cases[0].items, c => c.cases[0].items = [], c => c.cases[0].items.push('add'), c => c.cases[0].kind = 'unknown']) {
    const f = fixture(); edit(f.corpus); assert.throws(() => api.compareText(JSON.stringify(f.corpus), JSON.stringify(f.source), JSON.stringify(f.candidate), sourceSHA), /case ID|inventory item/);
  }
});
test('output cannot omit error or side-effect observations', () => {
  for (const field of ['status', 'data', 'errors', 'effects']) { const f = fixture(); delete f.candidate.cases[0].output[field]; assert.throws(f.check, /Output requires/); }
});
test('unexpected root observations cannot be silently ignored, whether equal or different', () => {
  for (const same of [true, false]) {
    const f = fixture(); f.source.database = { invoices: [{ id: 'i', amount: '5.00' }] }; f.candidate.database = same ? structuredClone(f.source.database) : { invoices: [] };
    assert.throws(f.check, /Unknown root field/);
  }
  for (const document of ['source', 'candidate']) { const f = fixture(); f[document].database = {}; assert.throws(f.check, /Unknown root field/); }
  const f = fixture(); f.corpus.database = {}; assert.throws(() => api.compareText(JSON.stringify(f.corpus), JSON.stringify(f.source), JSON.stringify(f.candidate), sourceSHA), /Unknown root field/);
});
test('ambiguous duplicate JSON keys are rejected even when the final values match', () => {
  const f = fixture(), original = JSON.stringify(f.candidate);
  for (const text of [original.replace('"sum":5', '"sum":6,"sum":5'), original.replace('"sum":5', '"sum":6,"\\u0073um":5')])
    assert.throws(() => api.compareText(f.corpusText, JSON.stringify(f.source), text, sourceSHA), /Duplicate JSON object key/);
});
test('redacted data cannot prove parity in corpus or either observation, even when escaped', () => {
  for (const escaped of [false, true]) {
    const f = fixture(), texts = [f.corpusText, JSON.stringify(f.source), JSON.stringify(f.candidate)];
    for (const index of [0, 1, 2]) {
      const changed = [...texts]; changed[index] = changed[index].replace('"normal"', escaped ? '"normal-\\u005bREDACTED\\u005d"' : '"normal-[REDACTED]"');
      assert.throws(() => api.compareText(...changed, sourceSHA, candidateSHA), /Redacted strings/);
    }
    const masked = texts.slice(1).map(text => text.replace('"sum":5', escaped ? '"sum":"\\u005bREDACTED\\u005d"' : '"sum":"[REDACTED]"'));
    assert.throws(() => api.compareText(f.corpusText, ...masked, sourceSHA, candidateSHA), /Redacted strings/);
    assert.throws(() => api.selfTestText(f.corpusText, masked[0], sourceSHA), /Redacted strings/);
  }
});
test('nonfinite, unsafe integer, underflow and precision-loss numbers are rejected', () => {
  const f = fixture(), source = JSON.stringify(f.source), candidate = JSON.stringify(f.candidate);
  for (const number of ['1e400', '9007199254740993', '9007199254740992', '1e-400', '0.100000000000000005'])
    assert.throws(() => api.compareText(f.corpusText, source.replace('"sum":5', '"sum":' + number), candidate.replace('"sum":5', '"sum":' + number), sourceSHA), /Nonfinite or lossy/);
});
test('equivalent finite decimal spellings compare equally without string coercion', () => {
  const f = fixture(), source = JSON.stringify(f.source).replace('"sum":5', '"sum":0.125'), candidate = JSON.stringify(f.candidate).replace('"sum":5', '"sum":1.2500e-1');
  assert.equal(api.compareText(f.corpusText, source, candidate, sourceSHA).verdict, 'MATCH');
  assert.equal(api.compareText(f.corpusText, source, candidate.replace('1.2500e-1', '"0.125"'), sourceSHA).verdict, 'MISMATCH');
});
test('negative zero remains distinct and controls preserve unchanged cases', () => {
  const f = fixture(), source = JSON.stringify(f.source).replace('"sum":5', '"sum":-0'), candidate = JSON.stringify(f.candidate).replace('"sum":5', '"sum":0');
  assert.equal(api.compareText(f.corpusText, source, candidate, sourceSHA).verdict, 'MISMATCH');
  assert.equal(api.selfTestText(f.corpusText, source, sourceSHA).controls, 12);
});
test('negative-control self-test rejects wrong values for every facet of every case', () => {
  const f = fixture(), r = api.selfTestText(f.corpusText, JSON.stringify(f.source), sourceSHA);
  assert.equal(r.verdict, 'NEGATIVE_CONTROLS_PASS'); assert.equal(r.cases, 3); assert.equal(r.controls, 12); assert.deepEqual(r.facets, ['status', 'data', 'errors', 'effects']);
  assert.equal(r.source_sha256, sha(JSON.stringify(f.source)));
});
test('file and CLI paths share comparator outcomes and reject invalid UTF-8', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-parity-'));
  try {
    const f = fixture(), files = ['corpus.json', 'source.json', 'candidate.json'].map(name => path.join(tmp, name));
    [f.corpusText, JSON.stringify(f.source), JSON.stringify(f.candidate)].forEach((text, index) => fs.writeFileSync(files[index], text));
    assert.equal(api.compare(...files, sourceSHA, candidateSHA).verdict, 'MATCH'); assert.equal(api.selfTest(files[0], files[1], sourceSHA).controls, 12);
    const run = args => cp.spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', windowsHide: true });
    const match = run(['compare', ...files, sourceSHA, candidateSHA]); assert.equal(match.status, 0, match.stderr); assert.equal(JSON.parse(match.stdout).verdict, 'MATCH');
    f.candidate.cases[0].output.status = 500; fs.writeFileSync(files[2], JSON.stringify(f.candidate)); assert.equal(run(['compare', ...files, sourceSHA]).status, 1);
    const controls = run(['self-test', files[0], files[1], sourceSHA]); assert.equal(controls.status, 0, controls.stderr); assert.equal(JSON.parse(controls.stdout).verdict, 'NEGATIVE_CONTROLS_PASS');
    fs.writeFileSync(files[2], Buffer.from([0xff])); assert.throws(() => api.compare(...files, sourceSHA), /encoded data/); assert.equal(run(['compare', ...files, sourceSHA]).status, 2);
  } finally { assert.equal(path.dirname(fs.realpathSync(tmp)), fs.realpathSync(os.tmpdir())); fs.rmSync(tmp, { recursive: true, force: true }); }
});
console.log(`${passed}/${passed + failed} migration parity checks passed`); if (failed) process.exitCode = 1;
