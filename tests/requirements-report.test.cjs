// requirements-report.cjs: the SRS markdown becomes a designed, self-contained document — cover,
// contents, icons, requirement cards with badges, rendered diagrams, the run's images, charts — and
// a PDF printed from it. Diagrams and the PDF need an installed Chrome; both are skipped with the
// reason where there is none.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const repo = path.resolve(process.argv[2] || '.');
const rr = require(path.join(repo, 'scripts/requirements-report.cjs')), ex = require(path.join(repo, 'scripts/investigate-export.cjs'));
const seam = path.join(repo, 'scripts/requirements-report.cjs'), chrome = ex.executable('pdf');
const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-req-report-')));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let n = 0, total = 0;
const queue = [], test = (name, f) => queue.push([name, f]);
const put = (root, rel, data) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };

const SRS = `# Little Play — software requirements specification

## 1. Purpose, stakeholders, and goals

A parent-operated picture app for toddlers. The parent holds the device; the child chooses.

- Stakeholder: the parent (operates every screen)
  - Needs: no account, no network, no ads
  - Needs: one deliberate activation per step
- Stakeholder: the child (chooses pictures)

See [the domain brief](https://example.com/brief) and \`domain-brief.md\`.

## 2. Scope and priority

| Selected stage | Default suggestions | Initial choice count |
| --- | --- | --- |
| 9–11 months | reveal, pictures | 2 |
| 12–17 months | pictures, assisted find | 2 |

## 3. Day-in-the-life scenarios and user stories

1. SC-1 Maria opens the app with networking disabled and starts a visit.
2. SC-2 The child picks the wrong picture; the round stays open.

US-1 As a parent, I want the library offline, so that the car ride works.

## 4. Functional requirements and acceptance criteria

| ID | Requirement and acceptance criteria | Priority | Provenance | Dimension |
| --- | --- | --- | --- | --- |
| FR-1 | **Native offline launch.** Given a fresh profile without network, when the package is launched, then the home opens. | Must | stated: Q-1 | functional, devops |
| FR-2 | **First run and local identity.** Given no save, when the app opens, then stage 9–11 is selected and favorites are empty. | Must | default-confirmed: D-4 | functional |
| FR-3 | **Find.** Given a named target and two options \\| or three, when the matching option is selected, then a gentle matching state appears. | Should | derived-domain | functional, logic |

## 5. Non-functional requirements

| ID | Requirement and acceptance criteria | Priority | Provenance | Dimension |
| --- | --- | --- | --- | --- |
| NFR-1 | **Cold start.** Given the package, when launched, then the home appears within 3 s at p95. | Must | stated | monitoring |
| NFR-2 | **Reduced motion.** Given the OS setting, when enabled, then no animation exceeds 100 ms. | Could | default-confirmed | ux, hardening |

## 6. Data model and computational rules

\`\`\`mermaid
erDiagram
    LOCAL_STATE ||--|| SETTINGS : contains
    LOCAL_STATE ||--o{ FAVORITE : contains
    SETTINGS {
        string stage
        int choiceCount
    }
\`\`\`

\`\`\`mermaid
stateDiagram-v2
    [*] --> Home
    Home --> Visit : start
    Visit --> Home : end
\`\`\`

\`\`\`text
input: stage=9-11 → suggestions: reveal, pictures
\`\`\`

## 7. Design and assets

![Direction board reviewed in playback](directions.png)

> The client rejected the "pastel nursery" direction; the quiet board stays.

---

## 9. Constraints, assumptions, and Won't list

- Won't: accounts, cloud sync, in-app purchases
- *Assumption*: Windows 11 x64 only

<img src=x onerror=alert(1)> must never reach the page as markup.
`;

function run() {
  const d = fs.mkdtempSync(path.join(scratch, 'run-'));
  put(d, 'requirements.md', SRS); put(d, 'directions.png', PNG); put(d, 'wireframe-early.png', PNG); put(d, 'logo.svg', '<svg/>'); put(d, 'playback.md', '# Client review\n\n## What we heard\n\nShort.\n');
  return d;
}

test('parse: headings, nested lists, tables with escaped pipes, fences, images, quotes', () => {
  const b = rr.parse(SRS);
  assert.deepEqual(b.filter(x => x.type === 'heading').map(x => x.level).slice(0, 4), [1, 2, 2, 2]);
  const list = b.find(x => x.type === 'list');
  assert.equal(list.items.length, 2); assert.equal(list.items[0].children.items.length, 2); assert.match(list.items[0].children.items[1].text, /one deliberate/);
  const fr = b.find(x => x.type === 'table' && x.header[0] === 'ID');
  assert.deepEqual(fr.header, ['ID', 'Requirement and acceptance criteria', 'Priority', 'Provenance', 'Dimension']);
  assert.match(fr.rows[2][1], /two options \| or three/, 'an escaped pipe stays in the cell');
  assert.deepEqual(b.filter(x => x.type === 'code').map(x => x.lang), ['mermaid', 'mermaid', 'text']);
  assert.deepEqual(b.find(x => x.type === 'image'), { type: 'image', alt: 'Direction board reviewed in playback', src: 'directions.png' });
  assert.equal(b.find(x => x.type === 'quote').blocks[0].type, 'para');
  assert.equal(b.filter(x => x.type === 'hr').length, 1);
  const ol = b.filter(x => x.type === 'list')[1]; assert.equal(ol.ordered, true); assert.equal(ol.items.length, 2);
});
test('inline: emphasis, code, links, ids and priority badges; markup is escaped', () => {
  const s = rr.inline('**Bold** and *em* with `a|b` and [doc](https://x.io/d) and FR-12, NFR-3, US-4 — Must, Should, Won\'t. <b>raw</b>');
  assert.match(s, /<strong>Bold<\/strong> and <em>em<\/em> with <code>a\|b<\/code> and <a href="https:\/\/x.io\/d">doc<\/a>/);
  assert.match(s, /<span class="id id-fr">FR-12<\/span>, <span class="id id-nfr">NFR-3<\/span>, <span class="id id-us">US-4<\/span>/);
  assert.match(s, /badge badge-must">Must<\/span>, <span class="badge badge-should">Should<\/span>, <span class="badge badge-wont">Won't<\/span>/);
  assert.match(s, /&lt;b&gt;raw&lt;\/b&gt;/);
  assert.equal(rr.inline('[local](domain-brief.md)'), '<span class="ref">local</span>', 'a relative link is a reference, not a hyperlink');
});
test('html: cover, contents, icons, cards with badges and chips, charts, embedded images; nothing external, no script', async () => {
  const d = run(), r = await rr.html(d), html = fs.readFileSync(path.join(d, r.file), 'utf8');
  assert.equal(r.verdict, 'HTML_EXPORTED'); assert.equal(r.file, 'requirements.html'); assert.equal(r.title, 'Little Play — software requirements specification');
  assert.deepEqual(r.stats, { fr: 3, nfr: 2, stories: 3, diagrams: 2, tables: 3, sections: 8 });
  assert.match(html, /<div class="page cover">[\s\S]*<h1>Little Play — software requirements specification<\/h1>/);
  assert.equal((html.match(/<div class="tile">/g) || []).length, 6, 'six number tiles on the cover');
  assert.equal((html.match(/<div class="page toc">[\s\S]*?<\/ol>/)[0].match(/<li>/g) || []).length, 9, 'eight sections and the gallery in the contents');
  assert.ok((html.match(/<svg class="icon"/g) || []).length >= 17, 'an icon per contents entry and per section heading');
  assert.equal((html.match(/<section class="sec"/g) || []).length, 9); assert.equal((html.match(/<\/section>/g) || []).length, 9, 'every section is closed');
  assert.equal((html.match(/<article class="req req-fr">/g) || []).length, 3); assert.equal((html.match(/<article class="req req-nfr">/g) || []).length, 2);
  assert.match(html, /<h4>Native offline launch\.<\/h4>/, 'the bold lead of a requirement is its card title');
  assert.equal((html.match(/"badge badge-must"/g) || []).length, 3); assert.equal((html.match(/"badge badge-should"/g) || []).length, 1); assert.equal((html.match(/"badge badge-could"/g) || []).length, 1);
  assert.ok(html.includes('chip chip-prov">stated') && html.includes('chip chip-dim">functional') && html.includes('chip chip-dim">devops'), 'provenance and dimension chips');
  assert.match(html, /aria-label="Priorities"[\s\S]*>5<\/text>/, 'the MoSCoW donut counts five tabled requirements');
  assert.match(html, /aria-label="Requirements by build dimension"/);
  assert.equal((html.match(/src="data:image\/png;base64,/g) || []).length, 2, 'the referenced image and the gallery image are embedded; the svg is not');
  assert.match(html, /Artifacts from the engagement[\s\S]*<figcaption>wireframe early<\/figcaption>/);
  assert.match(html, /<blockquote><p>The client rejected/); assert.match(html, /<pre class="code"><code>input: stage=9-11/);
  assert.match(html, /<ol><li><span class="id id-sc">SC-1<\/span> Maria/);
  assert.ok(!/<img src=x/.test(html) && html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'raw markup in the SRS is text');
  assert.ok(!/<script/.test(html) && !/(?:src|href)="https?:\/\//.test(html.replace(/<a href="https:\/\/example.com\/brief">/, '')), 'no script, nothing fetched from the web');
  assert.match(html, /Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'/);
  assert.equal(r.images, 2);
  if (r.diagrams.rendered === 2) {
    assert.equal((html.match(/<figure class="diagram"><svg/g) || []).length, 2, 'both Mermaid diagrams are real SVG');
    assert.match(html, /erDiagram diagram 1|erDiagram diagram 1/); assert.match(html, /stateDiagram-v2 diagram 2/);
  } else { console.error('NOTE: diagrams shown as source — ' + r.diagrams.note); assert.equal((html.match(/diagram-source/g) || []).length, 2); assert.ok(html.includes('class="note"')); }
  await assert.rejects(rr.html(d), /EEXIST/, 'a report is never overwritten by accident');
  const again = await rr.html(d, { replace: true }); assert.equal(again.verdict, 'HTML_EXPORTED');
  await assert.rejects(rr.html(d, { out: '../escape.html' }), /inside the run|escapes/);
  await assert.rejects(rr.html(d, { source: 'missing.md' }), /source not in the run: missing\.md/);
  const pb = await rr.html(d, { source: 'playback.md', gallery: false }), pbHtml = fs.readFileSync(path.join(d, pb.file), 'utf8');
  assert.equal(pb.file, 'playback.html'); assert.ok(!pbHtml.includes('Artifacts from the engagement'), '--no-gallery leaves the run\'s images out');
});
test('pdf: printed from the same document, pages counted; without Chrome the HTML stands in', async () => {
  const d = run(), r = await rr.pdf(d);
  if (!chrome) { console.error('SKIP: no Chrome/Edge installed — ' + r.reason); assert.equal(r.verdict, 'EXPORT_UNAVAILABLE'); assert.ok(fs.existsSync(path.join(d, 'requirements.html'))); return; }
  assert.equal(r.verdict, 'PDF_EXPORTED', JSON.stringify(r)); assert.equal(r.file, 'requirements.pdf'); assert.equal(r.html, 'requirements.html');
  const bytes = fs.readFileSync(path.join(d, r.file));
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-'); assert.ok(r.pages >= 4, `cover, contents and sections: ${r.pages} pages`);
  const cli = cp.spawnSync(process.execPath, [seam, 'pdf', d, '--replace'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr); assert.match(cli.stdout, /^REPORT: PDF_EXPORTED requirements\.pdf pages=\d+ sections=8 requirements=3\+2 diagrams=\d\/2 images=2/);
});
test('CLI: html speaks in one line; usage and a missing run are refused', () => {
  const d = run(), h = cp.spawnSync(process.execPath, [seam, 'html', d, '--no-gallery'], { encoding: 'utf8' });
  assert.equal(h.status, 0, h.stderr); assert.match(h.stdout, /^REPORT: HTML_EXPORTED requirements\.html sections=8 requirements=3\+2 diagrams=\d\/2 images=1/);
  assert.equal(cp.spawnSync(process.execPath, [seam, 'nonsense', d], { encoding: 'utf8' }).status, 2);
  assert.equal(cp.spawnSync(process.execPath, [seam, 'html', path.join(scratch, 'nowhere')], { encoding: 'utf8' }).status, 2);
});

(async () => {
  for (const [name, f] of queue) {
    total++;
    try { await f(); n++; console.error('PASS: ' + name); } catch (e) { console.error('FAIL: ' + name + ': ' + (e.stack || e.message)); }
  }
  try { fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a browser still closing */ }
  console.log(n + '/' + total + ' requirements report checks passed');
  if (n !== total) process.exitCode = 1;
})();
