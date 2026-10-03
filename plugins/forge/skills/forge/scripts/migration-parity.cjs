// Compare captured observations only. Adapters and their execution remain pinned acceptance inputs.
const fs = require('node:fs'), crypto = require('node:crypto'), { TextDecoder } = require('node:util');
const a = {
  sha: value => crypto.createHash('sha256').update(value).digest('hex'),
  need: (ok, message) => { if (!ok) throw Error(message); },
  object: value => value !== null && typeof value === 'object' && !Array.isArray(value),
  text: value => typeof value === 'string' && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value)
};
const revision = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function decimal(token) {
  const [, sign, whole, fraction = '', exponent = '0'] = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  const digits = (whole + fraction).replace(/^0+/, '');
  if (!digits) return sign + '0';
  const significant = digits.replace(/0+$/, '');
  return sign + significant + 'e' + (BigInt(exponent) - BigInt(fraction.length) + BigInt(digits.length - significant.length));
}
const read = file => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(file));
function parse(raw) {
  a.need(typeof raw === 'string', 'JSON text required');
  const text = raw.replace(/^\uFEFF/, ''), value = JSON.parse(text), stack = [];
  // JSON.parse discards duplicate keys and rounds numbers. Reject ambiguous/lossy input before comparing.
  for (const match of text.matchAll(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]]/g)) {
    const token = match[0];
    if (token === '{' || token === '[') stack.push(token === '{' ? new Set() : null);
    else if (token === '}' || token === ']') stack.pop();
    else if (token.startsWith('"')) {
      const decoded = JSON.parse(token);
      a.need(!decoded.includes('[REDACTED]'), 'Redacted strings cannot establish migration parity');
      if (/^\s*:/.test(text.slice(match.index + token.length))) {
        const keys = stack[stack.length - 1];
        a.need(!keys.has(decoded), 'Duplicate JSON object key'); keys.add(decoded);
      }
    } else {
      const number = Number(token);
      a.need(Number.isFinite(number) && (!Number.isInteger(number) || Number.isSafeInteger(number)) &&
        decimal(token) === decimal(Object.is(number, -0) ? '-0' : String(number)), 'Nonfinite or lossy JSON number; encode exact values as strings');
    }
  }
  return { value, sha256: a.sha(raw) };
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (a.object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return Object.is(value, -0) ? '-0' : JSON.stringify(value);
}
function cases(document, observation) {
  a.need(a.object(document) && document.version === 1 && Array.isArray(document.cases) && document.cases.length > 0, 'Nonempty version 1 cases required');
  a.need(Object.keys(document).every(k => ['version', 'cases', ...(observation ? ['revision', 'corpus_sha256'] : [])].includes(k)), 'Unknown root field; captured behavior belongs inside case output');
  const rows = new Map();
  for (const row of document.cases) {
    a.need(a.object(row) && a.text(row.id) && owns(row, 'input') && !rows.has(row.id), 'Missing/duplicate case ID or input');
    a.need(Object.keys(row).every(k => ['id', 'input', ...(observation ? ['output'] : ['items', 'kind'])].includes(k)), 'Unknown case field; captured behavior belongs inside output');
    if (observation) {
      const out = row.output;
      a.need(a.object(out) && ['status', 'data', 'errors', 'effects'].every(k => owns(out, k)) &&
        (a.text(out.status) || (typeof out.status === 'number' && Number.isFinite(out.status))) && Array.isArray(out.errors) && Array.isArray(out.effects), 'Output requires status, data, errors and effects');
    } else a.need(['normal', 'boundary', 'error'].includes(row.kind) && Array.isArray(row.items) && row.items.length > 0 && row.items.every(a.text) &&
      new Set(row.items).size === row.items.length, 'Frozen cases require kind and unique nonempty inventory item mappings');
    rows.set(row.id, row);
  }
  return rows;
}
function compareText(corpusText, sourceText, candidateText, expectedSource, expectedCandidate) {
  a.need(revision(expectedSource) && (expectedCandidate === undefined || revision(expectedCandidate)), 'Full expected source/candidate revisions required');
  const corpus = parse(corpusText), source = parse(sourceText), candidate = parse(candidateText), frozen = cases(corpus.value, false);
  const baseline = cases(source.value, true), target = cases(candidate.value, true);
  for (const [label, document, rows] of [['Source', source.value, baseline], ['Candidate', candidate.value, target]]) {
    a.need(revision(document.revision) && document.corpus_sha256 === corpus.sha256, label + ' revision/corpus identity is missing or stale');
    a.need(rows.size === frozen.size && [...frozen.keys()].every(id => rows.has(id)), label + ' has omitted or extra case IDs');
  }
  a.need(source.value.revision === expectedSource, 'Source revision differs from frozen baseline');
  a.need(expectedCandidate === undefined || candidate.value.revision === expectedCandidate, 'Candidate revision differs from expected revision');
  const mismatches = []; let matched = 0;
  for (const [id, row] of frozen) {
    const left = baseline.get(id), right = target.get(id), before = mismatches.length;
    a.need(canonical(left.input) === canonical(row.input), 'Source input differs from frozen corpus: ' + id);
    if (canonical(right.input) !== canonical(row.input)) mismatches.push({ id, field: 'input' });
    for (const field of new Set([...Object.keys(left.output), ...Object.keys(right.output)]))
      if (!owns(left.output, field) || !owns(right.output, field) || canonical(left.output[field]) !== canonical(right.output[field])) mismatches.push({ id, field: 'output.' + field });
    if (mismatches.length === before) matched++;
  }
  return { verdict: mismatches.length ? 'MISMATCH' : 'MATCH', matched, total: frozen.size, mismatches,
    source_revision: source.value.revision, candidate_revision: candidate.value.revision,
    corpus_sha256: corpus.sha256, source_sha256: source.sha256, candidate_sha256: candidate.sha256 };
}
function compare(corpusFile, sourceFile, candidateFile, expectedSource, expectedCandidate) {
  return compareText(read(corpusFile), read(sourceFile), read(candidateFile), expectedSource, expectedCandidate);
}
function selfTestText(corpusText, sourceText, expectedSource) {
  const baseline = compareText(corpusText, sourceText, sourceText, expectedSource, expectedSource), source = parse(sourceText).value;
  a.need(baseline.verdict === 'MATCH', 'Baseline cannot satisfy its own frozen corpus');
  const facets = ['status', 'data', 'errors', 'effects']; let controls = 0;
  // ponytail: O(N²) over a bounded reviewed corpus; isolate per-case comparisons if large suites make this gate slow.
  for (const row of source.cases) for (const facet of facets) {
    const mutated = JSON.parse(canonical(source)), out = mutated.cases.find(c => c.id === row.id).output;
    if (facet === 'status') out.status = typeof out.status === 'number' ? (out.status === 0 ? 1 : 0) : out.status + '#negative-control';
    else if (facet === 'data') out.data = out.data === null ? { negative_control: true } : null;
    else out[facet].push({ negative_control: true });
    const result = compareText(corpusText, sourceText, canonical(mutated), expectedSource, expectedSource);
    a.need(result.verdict === 'MISMATCH' && result.mismatches.length === 1 && result.mismatches[0].id === row.id &&
      result.mismatches[0].field === 'output.' + facet, 'Comparator did not detect an isolated negative control');
    controls++;
  }
  return { verdict: 'NEGATIVE_CONTROLS_PASS', cases: baseline.total, controls, facets,
    source_revision: expectedSource, corpus_sha256: baseline.corpus_sha256, source_sha256: baseline.source_sha256 };
}
function selfTest(corpusFile, sourceFile, expectedSource) { return selfTestText(read(corpusFile), read(sourceFile), expectedSource); }
module.exports = { compare, compareText, selfTest, selfTestText };
if (require.main === module) {
  try {
    const [action, ...args] = process.argv.slice(2);
    let result;
    if (action === 'compare') {
      a.need(args.length === 4 || args.length === 5, 'compare <corpus.json> <source.json> <candidate.json> <source-revision> [candidate-revision]');
      result = compare(...args); if (result.verdict !== 'MATCH') process.exitCode = 1;
    } else {
      a.need(action === 'self-test' && args.length === 3, 'self-test <corpus.json> <source.json> <source-revision>'); result = selfTest(...args);
    }
    console.log(JSON.stringify(result));
  } catch (e) { console.error('Invalid migration parity: ' + e.message); process.exitCode = 2; }
}
