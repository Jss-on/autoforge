// Kept outside the candidate workspace and write-protected by the OS sandbox.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const [task, workspace] = process.argv.slice(2);
try {
  const calc = require(path.resolve(workspace, 'calc.cjs'));
  if (task === 'feature' || task === 'regression') {
    for (const [x, y] of [[2, 3], [-4, 9], [0, 0], [7001, -203]]) assert.equal(calc.add(x, y), x + y);
    if (task === 'feature') for (const [x, y] of [[3, 4], [-2, 8], [0, 91], [-19, -7], [123, 321]]) assert.equal(calc.mul(x, y), x * y);
    console.log('1');
  } else if (task === 'verdicts') {
    const v = JSON.parse(fs.readFileSync(path.join(workspace, 'verdicts.json'), 'utf8'));
    for (const name of ['blocked', 'stale', 'failed']) assert.equal(v[name], 'BLOCKED');
    console.log('1');
  } else throw Error('Unknown fixed task');
} catch (e) { console.log('0'); if (task !== 'feature') { console.error(e.message); process.exitCode = 1; } }
