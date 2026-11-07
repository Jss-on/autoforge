// wireframes-score.cjs: the reference sweep ledger, the per-wireframe contract, the dHash niche
// rule and the WIREFRAMES verdict. PNGs are generated here (all five PNG filters) so the decoder
// is tested without binary fixtures; --capture is exercised only where Playwright resolves.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), zlib = require('node:zlib'), cp = require('node:child_process');
const repo = path.resolve(process.argv[2] || '.');
const seam = path.join(repo, 'scripts/wireframes-score.cjs'), ws = require(seam);
const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-wireframes-')));
let n = 0, total = 0;
const queue = [], test = (name, f) => queue.push([name, f]);
const put = (root, rel, data) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };

// --- a tiny PNG encoder (RGBA, any filter type) ------------------------------
const crcTable = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function png(w, h, gray, filter = 0) {
  const ch = 4, stride = w * ch, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = gray(x, y), o = y * stride + x * ch; px[o] = px[o + 1] = px[o + 2] = v; px[o + 3] = 255; }
  const raw = Buffer.alloc(h * (1 + stride));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + stride)] = filter;
    for (let x = 0; x < stride; x++) {
      const cur = px[y * stride + x], a = x >= ch ? px[y * stride + x - ch] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= ch && y ? px[(y - 1) * stride + x - ch] : 0;
      let pr = 0;
      if (filter === 1) pr = a; else if (filter === 2) pr = b; else if (filter === 3) pr = (a + b) >> 1;
      else if (filter === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      raw[y * (1 + stride) + 1 + x] = (cur - pr) & 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// three "layouts" on a 144×72 canvas (9×9 grid cells of 16×8): sidebar (dark left two columns +
// a dark status row), header (dark top two rows + a dark right rail), and a dark content block
const cx = x => Math.floor(x / 16), cy = y => Math.floor(y / 8);
const sidebar = (x, y) => cx(x) < 2 || cy(y) === 7 ? 30 : 230, header = (x, y) => cy(y) < 2 || cx(x) === 7 ? 30 : 230, diagonal = (x, y) => cx(x) >= 3 && cy(y) >= 2 ? 30 : 230;

// --- a run dir with a valid ledger and two cloned wireframes --------------------
const LEDGER = [
  'slug\trepo\tstars\tlicense\tpushed\tcategory\tscreen\tcapture\tnotes',
  'opensourcepos\thttps://github.com/opensourcepos/opensourcepos\t4505\tother\t2026-11-06\tpoint of sale\tsales\trefs/opensourcepos-sales.png\tleft sidebar, dense table, total pinned right',
  'store-pos\thttps://github.com/tngoman/Store-POS\t1054\tnone\t2026-10-25\tpoint of sale\ttill\trefs/store-pos-till.png\tproduct grid left, cart right, big pay button',
  'laravel-pos\thttps://github.com/angkosal/laravel-pos\t508\tmit\t2026-10-23\tpoint of sale\tsale\trefs/laravel-pos-sale.png\ttop nav, search-first, cart below',
  'tiny-pos\thttps://github.com/example/tiny-pos\t12\tmit\t2026-10-01\tpoint of sale\tsale\trefs/tiny-pos-sale.png\ttoo small to be evidence',
].join('\n');
const html = ({ lineage = 'opensourcepos:sales', sc = 'SC-1,SC-2', banner = true, extra = '', screen = 'sale', nav = true, main = true } = {}) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="screen" content="${screen}"><meta name="lineage" content="${lineage}"><meta name="sc" content="${sc}">
<title>${screen} wireframe</title><style>body{font:14px system-ui;margin:0}aside{width:160px;background:#222;color:#eee}</style>${extra}</head>
<body>${banner ? '<div class="banner">THROWAWAY — elicitation mockup, never product code</div>' : ''}
${nav ? '<nav aria-label="Primary"><a href="#sale">Sale</a> <a href="#items">Items</a></nav>' : ''}
${main ? '<main>' : '<div>'}<h1>New sale</h1><table><tr><th>Item</th><th>Qty</th><th>Price</th></tr><tr><td>Rice 5kg</td><td>1</td><td>₱ 280.00</td></tr></table>
<p data-state="empty" hidden>No items yet — scan or search to start.</p><p data-state="error" hidden>Could not save the sale: printer offline. Retry or save as draft.</p>
<button data-primary>Charge ₱ 280.00</button>${main ? '</main>' : '</div>'}</body></html>`;
function runDir(name, files) {
  const d = path.join(scratch, name);
  put(d, 'references.tsv', LEDGER);
  for (const slug of ['opensourcepos-sales', 'store-pos-till', 'laravel-pos-sale', 'tiny-pos-sale']) put(d, `refs/${slug}.png`, png(16, 16, sidebar));
  for (const [f, data] of Object.entries(files)) put(d, f, data);
  return d;
}
const good = () => ({ 'sale-a.html': html(), 'sale-a.png': png(144, 72, sidebar), 'sale-b.html': html({ lineage: 'store-pos:till' }), 'sale-b.png': png(144, 72, header) });
function run(dir, ...flags) {
  const r = cp.spawnSync(process.execPath, [seam, 'score', dir, '--asof', '2026-11-07', ...flags], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr };
}

test('decodePng: every filter type round-trips to the same luminance', () => {
  const ref = ws.decodePng(png(37, 23, diagonal, 0));
  for (const f of [1, 2, 3, 4]) { const d = ws.decodePng(png(37, 23, diagonal, f)); assert.equal(d.w, 37); assert.equal(d.h, 23); assert.deepEqual(Array.from(d.lum), Array.from(ref.lum), `filter ${f}`); }
  assert.throws(() => ws.decodePng(Buffer.from('not a png')), /not a PNG/);
});
test('dhash: identical renders are 0 bits apart, a recolour or rescale stays inside the niche, a different layout is far', () => {
  const a = ws.dhash(ws.decodePng(png(144, 72, sidebar))), a2 = ws.dhash(ws.decodePng(png(288, 144, (x, y) => sidebar(x / 2, y / 2))));
  const recolour = ws.dhash(ws.decodePng(png(144, 72, (x, y) => sidebar(x, y) === 30 ? 60 : 200)));
  const b = ws.dhash(ws.decodePng(png(144, 72, header))), c = ws.dhash(ws.decodePng(png(144, 72, diagonal)));
  assert.equal(a.length, ws.HASH_BITS); assert.equal(ws.hamming(a, a), 0); assert.equal(ws.hex(a).length, ws.HASH_BITS / 4);
  assert.equal(ws.hamming(a, a2), 0, 'scale-invariant'); assert.equal(ws.hamming(a, recolour), 0, 'recolour = same niche');
  assert.ok(ws.hamming(a, b) >= ws.NICHE_BITS, `sidebar vs header ${ws.hamming(a, b)}`); assert.ok(ws.hamming(a, c) >= ws.NICHE_BITS, `sidebar vs diagonal ${ws.hamming(a, c)}`);
  assert.ok(ws.hamming(b, c) >= ws.NICHE_BITS, `header vs diagonal ${ws.hamming(b, c)}`);
});
test('readLedger: popular + alive + captured rows are valid, the rest are named', () => {
  const d = runDir('ledger', {});
  const { rows, errs } = ws.readLedger(d, { asof: '2026-11-07', months: 24, minStars: 500 });
  assert.equal(rows.filter(r => r.ok).length, 3); assert.equal(rows.length, 4);
  assert.ok(errs.some(e => /tiny-pos.*stars 12 < 500/.test(e)), errs.join('\n'));
  const stale = ws.readLedger(d, { asof: '2029-01-01', months: 24, minStars: 500 });
  assert.equal(stale.rows.filter(r => r.ok).length, 0, 'the liveness clock is --asof');
  fs.rmSync(path.join(d, 'refs/laravel-pos-sale.png'));
  assert.ok(ws.readLedger(d, { asof: '2026-11-07', months: 24, minStars: 500 }).errs.some(e => /laravel-pos.*capture .* not found/.test(e)), 'a reference without a capture was not looked at');
});
test('checkHtml: the contract — hard checks zero the quality, soft checks are a fraction', () => {
  const d = runDir('contract', { 'ok.html': html(), 'bare.html': html({ nav: false, main: false }), 'nobanner.html': html({ banner: false }), 'cdn.html': html({ extra: '<script src="https://cdn.example.com/x.js"></script>' }), 'orphan.html': html({ lineage: 'nowhere:sale' }), 'link.html': html({ extra: '<!-- <a href="https://github.com/opensourcepos/opensourcepos"> --><a href="https://example.com">a plain link does not fetch</a>' }) });
  const ledger = ws.readLedger(d, { asof: '2026-11-07', months: 24, minStars: 500 }).rows;
  assert.equal(ws.checkHtml(d, 'ok.html', ledger).quality, 1); assert.deepEqual(ws.checkHtml(d, 'ok.html', ledger).sc, ['SC-1', 'SC-2']);
  const bare = ws.checkHtml(d, 'bare.html', ledger); assert.deepEqual(bare.missing, ['nav', 'main']); assert.equal(bare.quality, 7 / 9);
  assert.match(ws.checkHtml(d, 'nobanner.html', ledger).hard[0], /THROWAWAY/); assert.equal(ws.checkHtml(d, 'nobanner.html', ledger).quality, 0);
  assert.match(ws.checkHtml(d, 'cdn.html', ledger).hard[0], /external resource/); assert.match(ws.checkHtml(d, 'orphan.html', ledger).hard[0], /lineage "nowhere:sale" matches no/);
  assert.deepEqual(ws.checkHtml(d, 'link.html', ledger).hard, [], 'anchors are not resources');
});
test('score: two distinct lineages of the highest-traffic screen → PASS with the verdict line', () => {
  const r = run(runDir('pass', good()), '--require', 'SC-1,SC-2');
  assert.equal(r.code, 0, r.err); assert.match(r.out, /^WIREFRAMES: PASS wqd=2\.00\/2 coverage=1\.00 diversity=0\.\d\d refs=3 bytes_max=1k$/);
  assert.ok(+/diversity=([\d.]+)/.exec(r.out)[1] >= ws.NICHE_BITS / ws.HASH_BITS, r.out);
  assert.match(r.err, /screen sale: variants=2 lineages=2 niches=2/); assert.match(r.err, /asof=2026-11-07 refs_valid=3\/4/); assert.match(r.err, /hash=[0-9a-f]{48}/);
});
test('score: a third variant that is the same layout again collapses into one niche → wqd 2/3 → FAIL', () => {
  const r = run(runDir('dup', { ...good(), 'sale-c.html': html({ lineage: 'laravel-pos:sale' }), 'sale-c.png': png(144, 72, sidebar) }), '--require', 'SC-1');
  assert.equal(r.code, 1); assert.match(r.out, /^WIREFRAMES: FAIL wqd=2\.00\/3 /); assert.match(r.err, /sale-a\.html and sale-c\.html render 0 bits apart/); assert.match(r.err, /wqd 2\.00 < 0\.8 × 3/);
});
test('score: one lineage, missing scenario, missing render, stale references each FAIL with the reason', () => {
  let r = run(runDir('one-lineage', { ...good(), 'sale-b.html': html() }));
  assert.equal(r.code, 1); assert.match(r.err, /every variant is cloned from "opensourcepos"/);
  r = run(runDir('coverage', good()), '--require', 'SC-1,SC-9');
  assert.equal(r.code, 1); assert.match(r.out, /coverage=0\.50/); assert.match(r.err, /required scenario SC-9 has no wireframe/);
  const norender = runDir('norender', good()); fs.rmSync(path.join(norender, 'sale-b.png'));
  r = run(norender); assert.equal(r.code, 1); assert.match(r.err, /sale-b\.html: no render sale-b\.png/); assert.match(r.out, /diversity=n\/a/);
  r = run(runDir('stale', good()), '--asof', '2030-01-01'); assert.equal(r.code, 1); assert.match(r.out, /refs=0/); assert.match(r.err, /references: 0 valid \(need ≥ 3/);
  const nohard = runDir('nobanner', { ...good(), 'sale-a.html': html({ banner: false }) });
  r = run(nohard); assert.equal(r.code, 1); assert.match(r.out, /wqd=1\.00\/2/);
  r = run(path.join(scratch, 'missing-dir')); assert.equal(r.code, 2); r = run(runDir('empty', {})); assert.equal(r.code, 2);
});
test('filterCandidates: gh rows → ledger rows, popular + alive only, slug from the repo name', () => {
  const rows = ws.filterCandidates([
    { fullName: 'opensourcepos/opensourcepos', stargazersCount: 4505, license: { key: 'other' }, pushedAt: '2026-11-06T15:50:38Z', url: 'https://github.com/opensourcepos/opensourcepos', description: 'Open Source\tPoint of Sale' },
    { fullName: 'x/Old-POS', stargazersCount: 9000, license: null, pushedAt: '2020-01-01T00:00:00Z', url: 'u' },
    { fullName: 'x/Small', stargazersCount: 40, license: { key: 'mit' }, pushedAt: '2026-10-01T00:00:00Z', url: 'u' },
  ], { asof: '2026-11-07', months: 24, minStars: 500 });
  assert.deepEqual(rows, [{ slug: 'opensourcepos', repo: 'https://github.com/opensourcepos/opensourcepos', stars: 4505, license: 'other', pushed: '2026-11-06', notes: 'Open Source Point of Sale' }]);
});
test('--capture on the POS fixture: three layouts cloned from three real references land in three niches (skipped without Playwright)', async () => {
  let pw = null;
  for (const c of [repo, process.env.AR_PLAYWRIGHT_CWD].filter(Boolean)) { try { pw = require.resolve('playwright', { paths: [c] }); break; } catch { /* next */ } }
  if (!pw) { console.log('SKIP: playwright not resolvable (set AR_PLAYWRIGHT_CWD to a project that has it)'); return; }
  // tests/fixtures/requirements/wireframes: sale-ospos (opensourcepos "Sales"), sale-laravel (laravel-pos "POS"),
  // sale-flutter (flutter-pos-system "order") + the ledger whose nexopos and store-pos rows have no capture.
  const fix = path.join(repo, 'tests/fixtures/requirements/wireframes'), d = path.join(scratch, 'fixture');
  fs.mkdirSync(path.join(d, 'refs'), { recursive: true });
  for (const f of fs.readdirSync(fix)) fs.copyFileSync(path.join(fix, f), path.join(d, f));
  for (const f of ['opensourcepos-sales', 'laravel-pos-sale', 'flutter-pos-system-order']) put(d, `refs/${f}.png`, png(16, 16, sidebar));
  const r = cp.spawnSync(process.execPath, [seam, 'score', d, '--asof', '2026-11-07', '--require', 'SC-1,SC-2', '--capture'], { encoding: 'utf8', env: { ...process.env, AR_PLAYWRIGHT_CWD: process.env.AR_PLAYWRIGHT_CWD || repo } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout.trim(), /^WIREFRAMES: PASS wqd=3\.00\/3 coverage=1\.00 diversity=0\.\d\d refs=3 bytes_max=\d+k$/);
  assert.match(r.stderr, /screen sale: variants=3 lineages=3 niches=3/); assert.match(r.stderr, /excluded: references\.tsv row 5 \(nexopos\)/); assert.match(r.stderr, /hash=[0-9a-f]{48}/);
  assert.equal(ws.decodePng(fs.readFileSync(path.join(d, 'sale-ospos.png'))).w, 1280);
  // a recolour of one variant is the same niche: wqd stays 3 of 4 and the gate refuses it
  fs.writeFileSync(path.join(d, 'sale-ospos-red.html'), fs.readFileSync(path.join(d, 'sale-ospos.html'), 'utf8').replace(/#2f80ed/g, '#c0392b'));
  const r2 = cp.spawnSync(process.execPath, [seam, 'score', d, '--asof', '2026-11-07', '--require', 'SC-1,SC-2', '--capture'], { encoding: 'utf8', env: { ...process.env, AR_PLAYWRIGHT_CWD: process.env.AR_PLAYWRIGHT_CWD || repo } });
  assert.equal(r2.status, 1); assert.match(r2.stdout, /^WIREFRAMES: FAIL wqd=3\.00\/4 /); assert.match(r2.stderr, /sale-ospos-red\.html and sale-ospos\.html render \d+ bits apart \(< 32\)/);
});

(async () => {
  for (const [name, f] of queue) { total++; try { await f(); n++; console.log(`PASS: ${name}`); } catch (e) { console.log(`FAIL: ${name}\n  ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')}`); } }
  fs.rmSync(scratch, { recursive: true, force: true });
  console.log(`${n}/${total} wireframes-score checks passed`);
  process.exit(n === total ? 0 : 1);
})();
