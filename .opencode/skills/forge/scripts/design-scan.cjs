#!/usr/bin/env node
/**
 * design-scan.cjs — the mechanical design floor: drive the RUNNING app in headless
 * Chromium (Playwright), screenshot every page × viewport, and run deterministic
 * anti-slop / craft-floor / DESIGN.md-conformance rules against the live DOM.
 *
 *   node design-scan.cjs --url http://localhost:3000/ [--url …] [--mode operate|persuade|read|experience]
 *                        [--viewports 1280x800,390x844] [--design DESIGN.md] [--out scan.json]
 *                        [--shots <dir>] [--storage-state state.json] [--ignore rule1,rule2]
 *                        [--engine builtin|impeccable|both] [--settle 600] [--timeout 30000]
 *
 *   exit 0  clean (no error/warn findings)   ·  exit 2  findings   ·  exit 1  cannot run
 *
 * Findings are evidence: `--out` JSON (+ per-viewport PNGs) is what `score-design.sh scan`
 * reduces to `SLOP: N` / `SLOP_GATE: PASS|FAIL`. Severity: error | warn count toward the gate;
 * advisory is reported, never counted (taste calls that a brief may legitimately earn).
 *
 * Engines: `builtin` is the rule set below (no extra deps beyond the project's own Playwright).
 * When the `impeccable` package (Apache-2.0, Paul Bakaus) is resolvable from cwd, `both`
 * additionally injects its browser detector (59 rules) — a superset, never a requirement.
 *
 * Playwright resolves from the PROJECT (cwd) — the app already lists it as a devDependency
 * (see doctor.sh); this script never installs anything.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const a = { urls: [], viewports: '1280x800,390x844', mode: 'operate', out: 'design-scan.json',
              shots: null, design: null, storageState: null, ignore: [], engine: 'both',
              settle: 600, timeout: 30000, fullPage: true };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    switch (k) {
      case '--url': a.urls.push(v); i++; break;
      case '--viewports': a.viewports = v; i++; break;
      case '--mode': a.mode = String(v).toLowerCase(); i++; break;
      case '--out': a.out = v; i++; break;
      case '--shots': a.shots = v; i++; break;
      case '--design': a.design = v; i++; break;
      case '--storage-state': a.storageState = v; i++; break;
      case '--ignore': a.ignore.push(...String(v).split(',').map(s => s.trim()).filter(Boolean)); i++; break;
      case '--engine': a.engine = v; i++; break;
      case '--settle': a.settle = Number(v); i++; break;
      case '--timeout': a.timeout = Number(v); i++; break;
      case '--no-full-page': a.fullPage = false; break;
      case '--help': case '-h': usage(); process.exit(0);
      default:
        if (k.startsWith('--')) { console.error(`unknown flag: ${k}`); usage(); process.exit(1); }
        a.urls.push(k);
    }
  }
  if (!['operate', 'persuade', 'read', 'experience'].includes(a.mode)) {
    console.error(`--mode must be operate|persuade|read|experience (got ${a.mode})`); process.exit(1);
  }
  if (a.urls.length === 0) { console.error('need at least one --url'); usage(); process.exit(1); }
  a.viewportList = a.viewports.split(',').map(s => {
    const m = /^(\d{3,5})x(\d{3,5})$/.exec(s.trim());
    if (!m) { console.error(`bad viewport: ${s}`); process.exit(1); }
    return { width: +m[1], height: +m[2] };
  });
  return a;
}
function usage() {
  console.error(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 22).map(l => l.replace(/^ \* ?/, '')).join('\n'));
}

// ---------------------------------------------------------------------------
// DESIGN.md frontmatter → allowed fonts / colors / radii (design-token drift rule)
// Handles the DESIGN.md spec's block YAML plus the `{ k: v, k: v }` flow-map style.
// ---------------------------------------------------------------------------
function parseFrontmatter(md) {
  const lines = String(md).split(/\r?\n/);
  if (lines[0].trim() !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') { end = i; break; }
  if (end < 0) return null;
  const root = {}; const stack = [{ indent: -1, obj: root }];
  for (const raw of lines.slice(1, end)) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const indent = raw.match(/^\s*/)[0].length;
    const content = raw.slice(indent).replace(/\s+#(?![0-9a-fA-F]).*$/, '');
    if (content.trim().startsWith('- ')) continue; // lists (assets/screens) are not tokens
    const ci = content.indexOf(':');
    if (ci < 0) continue;
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const key = content.slice(0, ci).trim().replace(/^['"]|['"]$/g, '');
    let rest = content.slice(ci + 1).trim();
    const parent = stack[stack.length - 1].obj;
    if (rest === '') { const o = {}; parent[key] = o; stack.push({ indent, obj: o }); continue; }
    if (rest.startsWith('{') && rest.endsWith('}')) {
      const o = {};
      rest.slice(1, -1).split(',').forEach(pair => {
        const j = pair.indexOf(':'); if (j < 0) return;
        o[pair.slice(0, j).trim()] = pair.slice(j + 1).trim().replace(/^['"]|['"]$/g, '');
      });
      parent[key] = o; continue;
    }
    parent[key] = rest.replace(/^['"]|['"]$/g, '');
  }
  return root;
}
function hexToRgb(h) {
  const m = /^#([0-9a-f]{3,8})$/i.exec(String(h).trim());
  if (!m) return null;
  let s = m[1];
  if (s.length === 3 || s.length === 4) s = s.split('').map(c => c + c).join('');
  if (s.length !== 6 && s.length !== 8) return null;
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
}
function loadDesignSystem(file) {
  if (!file) return null;
  if (!fs.existsSync(file)) { console.error(`--design file not found: ${file}`); process.exit(1); }
  const fm = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  if (!fm) return { present: false, reason: 'no frontmatter' };
  const fonts = new Set(), colors = [], radii = [];
  const walkColors = (o) => { for (const v of Object.values(o || {})) { if (v && typeof v === 'object') walkColors(v); else { const c = hexToRgb(v); if (c) colors.push(c); } } };
  walkColors(fm.colors);
  for (const role of Object.values(fm.typography || {})) {
    if (role && typeof role === 'object' && role.fontFamily) {
      String(role.fontFamily).split(',').forEach(f => { const n = f.trim().replace(/^['"]|['"]$/g, '').toLowerCase(); if (n) fonts.add(n); });
    }
  }
  const radiusMap = fm.rounded || fm.radius || fm.radii || {};
  for (const v of Object.values(radiusMap)) {
    const m = /^(-?[\d.]+)(px|rem)?$/.exec(String(v).trim());
    if (m) radii.push(m[2] === 'rem' ? parseFloat(m[1]) * 16 : parseFloat(m[1]));
    else if (/^(9999px|100%|full|pill)$/i.test(String(v).trim())) radii.push(9999);
  }
  return { present: true, hasFonts: fonts.size > 0, fonts: [...fonts], hasColors: colors.length > 0, colors,
           hasRadii: radii.length > 0, radii, file };
}

// ---------------------------------------------------------------------------
// The in-page rule set (serialized into the page). Pure DOM + computed styles.
// Every finding: { rule, severity, selector, snippet, detail }
// ---------------------------------------------------------------------------
function inPageRules(cfg) {
  const F = [];
  const push = (rule, severity, el, detail, snippet) => {
    F.push({ rule, severity, selector: el ? sel(el) : '', detail, snippet: (snippet || (el ? txt(el).slice(0, 80) : '')) });
  };
  const sel = (el) => {
    if (!el || el.nodeType !== 1) return '';
    const parts = [];
    let e = el, depth = 0;
    while (e && e.nodeType === 1 && depth < 4) {
      let p = e.tagName.toLowerCase();
      if (e.id) { p += '#' + e.id; parts.unshift(p); break; }
      const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
      if (cls.length) p += '.' + cls.join('.');
      parts.unshift(p); e = e.parentElement; depth++;
    }
    return parts.join(' > ');
  };
  const txt = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const cs = (el) => getComputedStyle(el);
  const visible = (el) => {
    const s = cs(el); if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  };
  const isSrOnly = (el) => { const s = cs(el); const r = el.getBoundingClientRect(); return (r.width <= 1 && r.height <= 1) || s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)'; };
  const parseColor = (str) => {
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(str || '');
    if (!m) return null;
    let a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    return { r: +m[1], g: +m[2], b: +m[3], a };
  };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const hsl = (c) => {
    const r = c.r / 255, g = c.g / 255, b = c.b / 255, max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) { const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; default: h = (r - g) / d + 4; }
      h *= 60; }
    return { h, s, l };
  };
  const bgOf = (el) => { // nearest opaque background walking up; null when an image/gradient intervenes
    let e = el;
    while (e && e.nodeType === 1) {
      const s = cs(e);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = parseColor(s.backgroundColor);
      if (c && c.a >= 0.99) return c;
      e = e.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const hasCardLook = (el) => {
    const s = cs(el);
    const bw = parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none';
    const sh = s.boxShadow && s.boxShadow !== 'none';
    const rad = parseFloat(s.borderTopLeftRadius) > 0;
    const bgc = parseColor(s.backgroundColor);
    const parentBg = el.parentElement ? parseColor(cs(el.parentElement).backgroundColor) : null;
    const bgDiff = bgc && bgc.a > 0 && (!parentBg || parentBg.a === 0 || Math.abs(bgc.r - parentBg.r) + Math.abs(bgc.g - parentBg.g) + Math.abs(bgc.b - parentBg.b) > 8);
    return (bw || sh || (rad && bgDiff)) && el.getBoundingClientRect().width >= 120;
  };
  const isNeutral = (c) => c && hsl(c).s < 0.12;
  const EMOJI_RE = /\p{Extended_Pictographic}/u;
  const CARD_TAGS = new Set(['DIV', 'SECTION', 'ARTICLE', 'LI', 'A', 'BUTTON', 'ASIDE']);
  const all = Array.from(document.body.querySelectorAll('*')).filter(el => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH'].includes(el.tagName));
  const vw = window.innerWidth;
  const persuade = cfg.mode === 'persuade' || cfg.mode === 'experience';

  // --- viewport meta / zoom lock -----------------------------------------
  const vm = document.querySelector('meta[name="viewport"]');
  if (!vm) push('viewport-meta', 'error', null, 'no <meta name="viewport"> — mobile layout undefined');
  else if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?(?![\d.])/i.test(vm.getAttribute('content') || ''))
    push('zoom-disabled', 'error', vm, 'viewport meta disables pinch zoom (WCAG 1.4.4)');

  // --- horizontal overflow ------------------------------------------------
  const docW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  if (docW > vw + 1) {
    const wide = all.filter(el => el.getBoundingClientRect().right > vw + 1).slice(0, 3).map(sel).join(', ');
    push('horizontal-overflow', 'error', null, `document ${docW}px wide at ${vw}px viewport`, wide);
  }

  // --- headings -----------------------------------------------------------
  const hs = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(visible);
  if (!document.querySelector('h1')) push('no-h1', 'warn', null, 'page has no <h1>');
  let prevLevel = 0;
  for (const h of hs) {
    const lvl = +h.tagName[1];
    if (prevLevel && lvl > prevLevel + 1) push('skipped-heading', 'warn', h, `h${prevLevel} → h${lvl}`);
    prevLevel = lvl;
  }

  // --- images -------------------------------------------------------------
  for (const img of document.querySelectorAll('img')) {
    if (!visible(img)) continue;
    if (img.getAttribute('alt') === null && img.getAttribute('role') !== 'presentation') push('img-alt', 'error', img, 'img without alt attribute', img.getAttribute('src') || '');
    if (!img.getAttribute('width') && !img.getAttribute('height') && cs(img).aspectRatio === 'auto') push('unsized-image', 'advisory', img, 'no width/height/aspect-ratio (CLS risk)', img.getAttribute('src') || '');
    if (!img.currentSrc && !img.getAttribute('src')) push('broken-image', 'error', img, 'img with empty src');
    else if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) push('broken-image', 'error', img, 'img failed to load', img.getAttribute('src'));
  }

  // --- forms: placeholder-only labels --------------------------------------
  for (const inp of document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]),textarea,select')) {
    if (!visible(inp)) continue;
    const id = inp.id;
    const labelled = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) || inp.closest('label') || inp.getAttribute('aria-label') || inp.getAttribute('aria-labelledby') || inp.getAttribute('title');
    if (!labelled) push('unlabelled-input', 'error', inp, inp.getAttribute('placeholder') ? 'placeholder is the only label' : 'input has no accessible label', inp.getAttribute('placeholder') || inp.name || '');
  }

  // --- focus-visible styling declared anywhere -----------------------------
  let focusRule = false;
  for (const sheet of document.styleSheets) {
    try { for (const r of sheet.cssRules) { if (r.selectorText && /:focus(-visible|-within)?/.test(r.selectorText)) { focusRule = true; break; } } } catch (e) { /* cross-origin */ }
    if (focusRule) break;
  }
  if (!focusRule && document.querySelector('a,button,input,select,textarea')) push('no-focus-style', 'warn', null, 'no :focus / :focus-visible rule found in accessible stylesheets (keyboard users get browser default or nothing)');

  // --- interactive targets ------------------------------------------------
  const interactives = Array.from(document.querySelectorAll('a[href],button,[role=button],input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])')).filter(visible);
  let tiny24 = 0, tiny44 = 0, ex24 = null, ex44 = null;
  for (const el of interactives) {
    const r = el.getBoundingClientRect();
    if (el.closest('p') && el.tagName === 'A') continue; // inline text links exempt (WCAG 2.5.8)
    if (r.width < 24 || r.height < 24) { tiny24++; ex24 = ex24 || el; }
    else if (vw <= 480 && (r.width < 44 || r.height < 44)) { tiny44++; ex44 = ex44 || el; }
    if (cs(el).cursor !== 'pointer' && ['A', 'BUTTON'].includes(el.tagName) && !el.disabled) { /* informational only */ }
  }
  if (tiny24) push('tap-target-24', 'warn', ex24, `${tiny24} interactive target(s) under 24×24px (WCAG 2.5.8)`);
  if (tiny44) push('tap-target-44', 'advisory', ex44, `${tiny44} target(s) under 44×44px on a mobile viewport`);

  // --- text rules ---------------------------------------------------------
  const textEls = all.filter(el => visible(el) && Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 0));
  const seenTiny = new Set(); let tinyN = 0;
  const bodyLike = ['P', 'LI', 'TD', 'DD', 'BLOCKQUOTE'];
  let dashHead = 0, dashBody = 0, exDash = null;
  let apho = 0, capsBody = 0;
  const genericHits = new Map();
  const GENERIC = [
    [/\b(john|jane) doe\b/i, 'placeholder person name'],
    [/\bacme\b/i, 'placeholder company "Acme"'],
    [/lorem ipsum/i, 'lorem ipsum'],
    [/\b(seamless(ly)?|elevate|unleash|next-gen|revolutioni[sz]e|supercharge|world-class|cutting-edge|game-?changer|delve|empower(ing)?|streamline)\b/i, 'marketing buzzword'],
    [/\boops!?/i, '"Oops" error copy'],
    [/^something went wrong\.?$/i, 'bare "Something went wrong"'],
    [/\bquietly (trusted|in use|used)\b/i, '"Quietly trusted by" tell'],
    [/\bscroll (to explore|down|to discover)\b/i, 'scroll cue'],
    [/\bfrom the field\b|\bfield notes\b/i, 'performative-craftsman label'],
  ];
  const kickers = [];
  for (const el of textEls) {
    const s = cs(el); const t = txt(el); if (!t) continue;
    const fs = parseFloat(s.fontSize);
    // tiny functional text
    if (fs < 11 && !['SUP', 'SUB'].includes(el.tagName) && !isSrOnly(el) && !el.closest('code,pre,kbd')) {
      const k = sel(el); if (!seenTiny.has(k)) { seenTiny.add(k); tinyN++; if (tinyN <= 3) push('tiny-text', 'error', el, `${fs.toFixed(1)}px text (floor 11px; 12px+ for body)`); }
    }
    // line length (prose only)
    if (bodyLike.includes(el.tagName) && t.length > 120) {
      const w = el.getBoundingClientRect().width; const cpl = w / (fs * 0.5);
      if (cpl > 90) push('line-length', 'warn', el, `~${Math.round(cpl)} chars/line (aim 45–80)`);
    }
    // all-caps body
    if (bodyLike.includes(el.tagName) && s.textTransform === 'uppercase' && t.length > 60) capsBody++;
    // em/en dash
    const dashes = (t.match(/[—–]/g) || []).length;
    if (dashes) {
      const inHead = /^(H[1-6]|BUTTON|A|LABEL|TH|DT|NAV|SUMMARY)$/.test(el.tagName) || el.closest('nav,button,h1,h2,h3,h4,h5,h6,label,th');
      if (inHead) { dashHead += dashes; exDash = exDash || el; } else dashBody += dashes;
    }
    // aphoristic cadence
    if (/^[^.!?]{2,60}\.\s+(No|Just|Not|Nothing|Zero)\b[^.!?]{1,40}\.$/i.test(t) || /^Not (a|an|just) [^.!?]{1,40}\.\s+(A|An|Just|But)\b[^.!?]{1,40}\.$/i.test(t)) apho++;
    // generic copy tells
    for (const [re, label] of GENERIC) { if (re.test(t)) { if (!genericHits.has(label)) genericHits.set(label, { el, sample: t.slice(0, 60), n: 0 }); genericHits.get(label).n++; } }
    // emoji as structural icon
    if (EMOJI_RE.test(t) && (el.closest('nav,button,[role=button],h1,h2,h3,h4,h5,h6,th,dt,label,[role=tab],[role=menuitem]') || /^\p{Extended_Pictographic}/u.test(t))) {
      if (!(el.closest('p,blockquote') && !el.closest('nav,button'))) push('emoji-icon', 'error', el, 'emoji used as a structural icon/glyph (font-dependent, unthemeable, no accessible name)');
    }
    // kicker / eyebrow: small tracked uppercase block sitting right above a heading or big number
    const isSmall = fs <= 13;
    const isCaps = s.textTransform === 'uppercase' || (t.length >= 3 && t === t.toUpperCase() && /[A-Z]/.test(t));
    const tracked = parseFloat(s.letterSpacing) > 0.3 || /em$/.test(s.letterSpacing) && parseFloat(s.letterSpacing) >= 0.04;
    if (isSmall && isCaps && tracked && t.split(/\s+/).length <= 5 && s.display !== 'inline') {
      const nx = el.nextElementSibling; const px = el.parentElement;
      const followedByHeading = nx && (/^H[1-6]$/.test(nx.tagName) || parseFloat(cs(nx).fontSize) >= 24);
      const parentThenHeading = !nx && px && px.nextElementSibling && /^H[1-6]$/.test(px.nextElementSibling.tagName);
      if (followedByHeading || parentThenHeading) kickers.push(el);
    }
    // gradient text
    if ((s.webkitBackgroundClip === 'text' || s.backgroundClip === 'text') && s.backgroundImage !== 'none') push('gradient-text', 'warn', el, 'gradient-filled text (decorative; use weight/size for emphasis)');
    // approximate contrast for real text
    const fg = parseColor(s.color); const bg = bgOf(el);
    if (fg && bg && fg.a >= 0.99 && t.length >= 2 && !isSrOnly(el)) {
      const big = fs >= 24 || (fs >= 18.66 && parseInt(s.fontWeight, 10) >= 700);
      const ratio = contrast(fg, bg); const need = big ? 3 : 4.5;
      if (ratio < need) push('low-contrast', 'error', el, `${ratio.toFixed(2)}:1 (need ${need}:1) approx. — nearest opaque background`);
    }
    // clipped label
    if (s.overflow === 'hidden' && s.whiteSpace === 'nowrap' && el.scrollWidth > el.clientWidth + 2 && s.textOverflow !== 'ellipsis') push('clipped-text', 'warn', el, 'text wider than its box with overflow hidden and no ellipsis');
  }
  if (capsBody) push('all-caps-body', 'warn', null, `${capsBody} uppercase body passage(s) over 60 chars`);
  if (dashHead) push('dash-in-ui-copy', 'warn', exDash, `${dashHead} em/en dash(es) in headings, nav, buttons or labels — a comma, period or colon reads as authored`);
  if (dashBody >= 6) push('em-dash-overuse', 'advisory', null, `${dashBody} em/en dashes in body copy`);
  if (apho >= 3) push('aphoristic-cadence', 'advisory', null, `${apho} "X. No Y." / "Not a X. A Y." rebuttal sentences`);
  for (const [label, h] of genericHits) push('generic-copy', 'warn', h.el, `${label} ×${h.n}`, h.sample);
  // kickers: banned outright in Persuade (impeccable), rationed 1 per 3 sections elsewhere (taste)
  const sections = Math.max(1, document.querySelectorAll('section,main > *,article').length);
  if (kickers.length) {
    const cap = persuade ? 0 : Math.ceil(sections / 3);
    push('kicker-label', kickers.length > cap ? 'warn' : 'advisory', kickers[0], `${kickers.length} tracked-uppercase eyebrow label(s) above headings (allowance ${cap} for ${cfg.mode})`);
  }
  // numbered section labels
  const numbered = textEls.filter(el => parseFloat(cs(el).fontSize) <= 14 && /^0?\d{1,2}(\s*[\/·.—–-]\s*.{0,24})?$/.test(txt(el)) && el.parentElement && el.parentElement.querySelector('h1,h2,h3,h4'));
  if (numbered.length >= 3) push('numbered-section-labels', 'advisory', numbered[0], `${numbered.length} small numeric section markers (01 / 02 / 03 scaffolding)`);

  // --- surfaces: cards, stripes, glows, gradients, palettes ------------------
  const cardEls = all.filter(el => CARD_TAGS.has(el.tagName) && visible(el) && hasCardLook(el) && el.getBoundingClientRect().height >= 40);
  let nested = 0, exNested = null;
  for (const c of cardEls) {
    const inner = cardEls.find(d => d !== c && c.contains(d) && !d.matches('input,select,textarea,button,a') && !d.closest('table'));
    if (inner && cs(inner).position !== 'absolute') { nested++; exNested = exNested || inner; if (nested >= 3) break; }
  }
  if (nested) push('nested-cards', 'warn', exNested, `card inside a card (${nested}+) — flatten; use spacing/dividers`);
  // identical card grids (≥3 equal siblings, each with heading + text)
  const parents = new Set(cardEls.map(c => c.parentElement).filter(Boolean));
  for (const p of parents) {
    const kids = Array.from(p.children).filter(k => cardEls.includes(k));
    if (kids.length < 3) continue;
    const r0 = kids[0].getBoundingClientRect();
    const same = kids.filter(k => { const r = k.getBoundingClientRect(); return Math.abs(r.width - r0.width) <= 3 && Math.abs(r.height - r0.height) <= 6; });
    if (same.length >= 3 && same.every(k => k.querySelector('h1,h2,h3,h4,h5,h6,strong,b,[class*=title],[class*=heading]'))) {
      const stat = same.filter(k => Array.from(k.querySelectorAll('*')).some(x => parseFloat(cs(x).fontSize) >= 28 && /^[\d.,%$₱€£+-]+\s*[A-Za-z%]*$/.test(txt(x))));
      if (stat.length >= 3) push('hero-metric-cards', persuade ? 'warn' : 'advisory', p, `${same.length} identical stat tiles (big number + small label template)`);
      else push('identical-card-grid', persuade ? 'warn' : 'advisory', p, `${same.length} same-size sibling cards (icon/heading/text template)`);
      break;
    }
  }
  const seenSurf = new Set();
  for (const el of all) {
    if (!visible(el)) continue;
    const s = cs(el);
    // side stripe
    const bl = parseFloat(s.borderLeftWidth), br = parseFloat(s.borderRightWidth), bt = parseFloat(s.borderTopWidth), bb = parseFloat(s.borderBottomWidth);
    const lc = parseColor(s.borderLeftColor), rc = parseColor(s.borderRightColor);
    if (((bl >= 3 && bt <= 1 && bb <= 1 && lc && !isNeutral(lc)) || (br >= 3 && bt <= 1 && bb <= 1 && rc && !isNeutral(rc))) && el.getBoundingClientRect().height >= 32 && txt(el)) {
      if (!seenSurf.has('stripe')) { seenSurf.add('stripe'); push('side-stripe', 'warn', el, 'thick colored border on one side of a block (the AI callout stripe)'); }
    }
    // glow shadow: zero-offset colored blurred halo, or colored blur on dark bg
    const bs = s.boxShadow;
    if (bs && bs !== 'none') {
      const m = /rgba?\([^)]+\)\s*(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px/.exec(bs) || /(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px[^,]*?(rgba?\([^)]+\))/.exec(bs);
      if (m) {
        const col = parseColor(bs); const ox = parseFloat(m[1]), oy = parseFloat(m[2]), blur = parseFloat(m[3]);
        const bg = bgOf(el);
        if (col && !isNeutral(col) && blur >= 8 && ((ox === 0 && oy === 0) || (bg && lum(bg) < 0.1))) {
          if (!seenSurf.has('glow')) { seenSurf.add('glow'); push('glow-shadow', 'warn', el, 'colored glow halo shadow (use neutral offset elevation)'); }
        }
      }
    }
    // AI purple gradient / cyan on dark
    const bgi = s.backgroundImage;
    if (bgi && /gradient/.test(bgi) && el.getBoundingClientRect().width >= 200) {
      const cols = (bgi.match(/rgba?\([^)]+\)/g) || []).map(parseColor).filter(Boolean);
      const purple = cols.filter(c => { const { h, s: sat } = hsl(c); return h >= 255 && h <= 300 && sat >= 0.45; });
      if (purple.length >= 1 && cols.length >= 2 && !seenSurf.has('purple')) { seenSurf.add('purple'); push('ai-purple-gradient', 'warn', el, 'purple/violet gradient surface (the AI-default palette)'); }
      const halo = /radial-gradient/.test(bgi) && cols.some(c => c.a < 0.6 && hsl(c).s >= 0.4);
      if (halo && !seenSurf.has('halo')) { seenSurf.add('halo'); push('radial-spotlight-glow', 'warn', el, 'translucent saturated radial gradient behind content (decorative spotlight haze)'); }
    }
    // bounce easing / layout-property transitions (declared, not observed)
    const tf = (s.transitionTimingFunction || '') + ' ' + (s.animationTimingFunction || '');
    const cb = /cubic-bezier\(([^)]+)\)/g; let mm;
    while ((mm = cb.exec(tf))) { const p = mm[1].split(',').map(Number); if (p.length === 4 && (p[1] > 1.05 || p[3] > 1.05 || p[1] < -0.05 || p[3] < -0.05)) { if (!seenSurf.has('bounce')) { seenSurf.add('bounce'); push('bounce-easing', 'warn', el, `overshoot/bounce easing ${mm[0]}`); } } }
    const tp = s.transitionProperty || '';
    if (/\b(width|height|top|left|right|bottom|margin[a-z-]*|padding[a-z-]*)\b/.test(tp) && parseFloat(s.transitionDuration) > 0 && !seenSurf.has('layout-anim')) { seenSurf.add('layout-anim'); push('layout-property-transition', 'warn', el, `transitions layout property (${tp}) — animate transform/opacity`); }
    // pulsing dot / marquee
    if (s.animationName && s.animationName !== 'none' && s.animationIterationCount === 'infinite') {
      const r = el.getBoundingClientRect();
      if (r.width <= 14 && r.height <= 14 && parseFloat(s.borderTopLeftRadius) >= r.width / 2 && !seenSurf.has('pulse')) { seenSurf.add('pulse'); push('pulsing-dot', 'advisory', el, 'infinitely pulsing status dot (reserve for genuinely live data)'); }
      if (r.width > vw && /translate|scroll|marquee/i.test(s.animationName + ' ' + (el.className || '')) && !seenSurf.has('marquee')) { seenSurf.add('marquee'); push('marquee', 'advisory', el, 'auto-scrolling marquee'); }
    }
    if (el.tagName === 'MARQUEE') push('marquee', 'warn', el, '<marquee> element');
  }
  // page palette defaults
  const bodyBg = parseColor(cs(document.body).backgroundColor) || parseColor(cs(document.documentElement).backgroundColor);
  if (bodyBg && bodyBg.a > 0) {
    const { h, s: sat, l } = hsl(bodyBg);
    if (bodyBg.r === 0 && bodyBg.g === 0 && bodyBg.b === 0) push('pure-black-bg', 'advisory', document.body, 'pure #000 page background (off-black keeps depth)');
    if (h >= 25 && h <= 55 && sat >= 0.15 && sat <= 0.6 && l >= 0.9) push('cream-default-palette', 'advisory', document.body, 'warm cream/beige page ground (the reflex "tasteful" AI surface) — fine when the brief chose it');
  }

  // --- Persuade-only composition rules -----------------------------------
  if (persuade) {
    const h1 = document.querySelector('h1');
    const cta = Array.from(document.querySelectorAll('a[href],button')).find(el => visible(el) && /^(get|start|try|book|buy|join|sign|request|contact|shop|download|see|view|learn|apply|order|talk|schedule|subscribe|check|submit)/i.test(txt(el)) && el.getBoundingClientRect().top >= 0);
    if (h1 && cta && vw >= 1024) {
      const hb = h1.getBoundingClientRect(), cb2 = cta.getBoundingClientRect();
      if (cb2.top > window.innerHeight || hb.top > window.innerHeight) push('hero-overflows-viewport', 'warn', h1, 'headline or primary action below the first viewport at desktop');
      const lines = Math.round(hb.height / (parseFloat(cs(h1).lineHeight) || parseFloat(cs(h1).fontSize) * 1.1));
      if (lines >= 4) push('oversized-h1', 'warn', h1, `hero headline wraps to ${lines} lines — smaller scale or shorter copy`);
    }
    // three-equal-cards / zigzag repetition: count section layout families
    const secs = Array.from(document.querySelectorAll('main > section, body > section, main > div > section')).filter(visible);
    if (secs.length >= 4) {
      const fam = secs.map(sc => { const kids = Array.from(sc.children).filter(visible); const g = cs(sc).display; return `${g}:${kids.length}:${kids.map(k => Math.round(k.getBoundingClientRect().width / 50)).join('-')}`; });
      const counts = fam.reduce((m, f) => (m[f] = (m[f] || 0) + 1, m), {});
      const top = Math.max(...Object.values(counts));
      if (top >= 3) push('section-layout-repetition', 'advisory', null, `${top} sections share one layout family — vary composition (bento / full-bleed / vertical stack)`);
    }
  }

  // --- DESIGN.md token drift ---------------------------------------------
  const ds = cfg.designSystem;
  if (ds && ds.present) {
    const near = (c, allowed) => allowed.some(a => Math.abs(a.r - c.r) + Math.abs(a.g - c.g) + Math.abs(a.b - c.b) <= 18);
    const offFonts = new Map(), offColors = new Map(), offRadii = new Map();
    for (const el of textEls) {
      const s = cs(el);
      if (ds.hasFonts) {
        const fam = (s.fontFamily.split(',')[0] || '').trim().replace(/^['"]|['"]$/g, '').toLowerCase();
        if (fam && !ds.fonts.includes(fam) && !/^(inherit|initial|system-ui|-apple-system|monospace|serif|sans-serif|ui-monospace|ui-sans-serif|ui-serif)$/.test(fam) && !el.closest('code,pre,kbd')) offFonts.set(fam, (offFonts.get(fam) || 0) + 1);
      }
      if (ds.hasColors) {
        const fg = parseColor(s.color);
        if (fg && fg.a >= 0.99 && !near(fg, ds.colors) && !isNeutral(fg)) { const k = `rgb(${fg.r},${fg.g},${fg.b})`; offColors.set(k, (offColors.get(k) || 0) + 1); }
      }
    }
    for (const el of all) {
      if (!visible(el)) continue; const s = cs(el);
      if (ds.hasColors) {
        const bg = parseColor(s.backgroundColor);
        if (bg && bg.a >= 0.99 && !near(bg, ds.colors) && !isNeutral(bg) && el.getBoundingClientRect().width >= 40) { const k = `bg rgb(${bg.r},${bg.g},${bg.b})`; offColors.set(k, (offColors.get(k) || 0) + 1); }
      }
      if (ds.hasRadii) {
        const rad = parseFloat(s.borderTopLeftRadius);
        if (rad > 0 && CARD_TAGS.has(el.tagName) && !ds.radii.some(a => (a >= 999 && rad >= Math.min(el.getBoundingClientRect().height, el.getBoundingClientRect().width) / 2 - 1) || Math.abs(a - rad) <= 0.75)) offRadii.set(rad, (offRadii.get(rad) || 0) + 1);
      }
    }
    for (const [f, n] of offFonts) push('design-font-drift', 'warn', null, `font "${f}" not in DESIGN.md typography (${n} element(s))`, f);
    const topColors = [...offColors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topColors.length) push('design-color-drift', 'warn', null, `${offColors.size} saturated color(s) outside the DESIGN.md palette (top: ${topColors.map(([k, n]) => `${k}×${n}`).join(', ')})`);
    if (offRadii.size) push('design-radius-drift', 'advisory', null, `${offRadii.size} radius value(s) off the DESIGN.md scale: ${[...offRadii.keys()].map(r => r + 'px').join(', ')}`);
  }

  // --- content hidden at rest (failed reveal signature) ------------------
  let hiddenChars = 0, totalChars = 0;
  for (const el of textEls) { const s = cs(el); const n = txt(el).length; totalChars += n; if (parseFloat(s.opacity) === 0 || s.visibility === 'hidden') hiddenChars += n; }
  if (totalChars > 200 && hiddenChars / totalChars > 0.2) push('content-hidden-at-rest', 'warn', null, `${Math.round(hiddenChars / totalChars * 100)}% of text sits at opacity 0 after settle (reveal script never fired?)`);

  return { findings: F, meta: { sections, interactives: interactives.length, textEls: textEls.length } };
}

// ---------------------------------------------------------------------------
// impeccable engine (optional superset)
// ---------------------------------------------------------------------------
function resolveImpeccable() {
  try { return require.resolve('impeccable/browser', { paths: [process.cwd()] }); } catch { /* fallthrough */ }
  try {
    const pkg = require.resolve('impeccable/package.json', { paths: [process.cwd()] });
    const p = path.join(path.dirname(pkg), 'cli', 'engine', 'detect-antipatterns-browser.js');
    return fs.existsSync(p) ? p : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const a = parseArgs(process.argv);
  let chromium;
  try { ({ chromium } = require(require.resolve('playwright', { paths: [process.cwd()] }))); }
  catch { try { ({ chromium } = require('playwright')); } catch { console.error('playwright not resolvable from cwd — `npm i -D playwright && npx playwright install --with-deps chromium` in the project'); process.exit(1); } }

  const designSystem = loadDesignSystem(a.design);
  const impPath = (a.engine === 'impeccable' || a.engine === 'both') ? resolveImpeccable() : null;
  if (a.engine === 'impeccable' && !impPath) { console.error('--engine impeccable requested but the impeccable package is not resolvable from cwd'); process.exit(1); }
  const impScript = impPath ? fs.readFileSync(impPath, 'utf8') : null;
  if (a.shots) fs.mkdirSync(a.shots, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctxOpts = { reducedMotion: 'reduce', ignoreHTTPSErrors: true };
  if (a.storageState) ctxOpts.storageState = a.storageState;
  const report = { meta: { generatedAt: new Date().toISOString(), mode: a.mode, engine: impPath ? (a.engine === 'impeccable' ? 'impeccable' : 'builtin+impeccable') : 'builtin', design: designSystem ? { file: designSystem.file || a.design, present: !!designSystem.present, fonts: designSystem.fonts || [], colors: (designSystem.colors || []).length, radii: designSystem.radii || [] } : null, viewports: a.viewportList, ignore: a.ignore }, pages: [], summary: { errors: 0, warns: 0, advisory: 0, byRule: {} } };
  const ignore = new Set(a.ignore);

  for (const url of a.urls) {
    for (const vp of a.viewportList) {
      const context = await browser.newContext({ ...ctxOpts, viewport: vp });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('pageerror', e => consoleErrors.push(String(e && e.message || e).split('\n')[0].slice(0, 160)));
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
      const entry = { url, viewport: `${vp.width}x${vp.height}`, screenshot: null, findings: [], errors: null };
      try {
        const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: a.timeout }).catch(async () => page.goto(url, { waitUntil: 'load', timeout: a.timeout }));
        if (resp && resp.status() >= 400) entry.findings.push({ rule: 'http-error', severity: 'error', selector: '', detail: `HTTP ${resp.status()}`, snippet: url });
        await page.waitForTimeout(a.settle);
        // reveal sweep so IntersectionObserver-gated content gets its chance, then back to top
        await page.evaluate(async () => { const step = Math.max(200, Math.floor(innerHeight * 0.7)); const max = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight); for (let y = 0; y <= max; y += step) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } scrollTo(0, 0); await new Promise(r => setTimeout(r, 300)); });
        if (a.shots) {
          const safe = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').slice(0, 60) || 'root';
          entry.screenshot = path.join(a.shots, `${safe}--${vp.width}x${vp.height}.png`);
          await page.screenshot({ path: entry.screenshot, fullPage: a.fullPage });
        }
        if (a.engine !== 'impeccable') {
          const res = await page.evaluate(inPageRules, { mode: a.mode, designSystem: designSystem && designSystem.present ? designSystem : null });
          entry.findings.push(...res.findings.map(f => ({ ...f, engine: 'builtin' })));
          entry.meta = res.meta;
        }
        if (impScript) {
          try {
            await page.evaluate((ds) => { window.__IMPECCABLE_CONFIG__ = { autoScan: false, ...(ds ? { designSystem: ds } : {}) }; },
              designSystem && designSystem.present ? { present: true, hasFonts: designSystem.hasFonts, allowedFonts: designSystem.fonts, hasColors: designSystem.hasColors, allowedColors: designSystem.colors, hasRadii: designSystem.hasRadii, allowedRadii: designSystem.radii, hasPillRadius: designSystem.radii.some(r => r >= 999) } : null);
            await page.evaluate(impScript);
            const groups = await page.evaluate(() => (typeof window.impeccableDetect === 'function' ? window.impeccableDetect({ decorate: false, serialize: true }) : []));
            for (const g of groups || []) for (const f of g.findings || []) {
              const adv = f.severity === 'advisory' || f.advisory === true;
              entry.findings.push({ rule: `imp:${f.type}`, severity: adv ? 'advisory' : (f.severity === 'error' ? 'error' : 'warn'), selector: g.selector || '', detail: f.detail || '', snippet: '', engine: 'impeccable' });
            }
          } catch (e) { entry.findings.push({ rule: 'impeccable-engine-error', severity: 'advisory', selector: '', detail: String(e.message || e).slice(0, 160), engine: 'impeccable' }); }
        }
        if (consoleErrors.length) entry.findings.push({ rule: 'console-error', severity: 'error', selector: '', detail: `${consoleErrors.length} console/page error(s)`, snippet: consoleErrors.slice(0, 3).join(' | '), engine: 'builtin' });
      } catch (e) {
        entry.errors = String(e && e.message || e).slice(0, 300);
        entry.findings.push({ rule: 'page-unreachable', severity: 'error', selector: '', detail: entry.errors, engine: 'builtin' });
      } finally {
        await context.close().catch(() => {});
      }
      entry.findings = entry.findings.filter(f => !ignore.has(f.rule) && !ignore.has(f.rule.replace(/^imp:/, '')));
      for (const f of entry.findings) {
        report.summary.byRule[f.rule] = (report.summary.byRule[f.rule] || 0) + 1;
        if (f.severity === 'error') report.summary.errors++; else if (f.severity === 'warn') report.summary.warns++; else report.summary.advisory++;
      }
      report.pages.push(entry);
      process.stderr.write(`  ${url} @${entry.viewport}: ${entry.findings.filter(f => f.severity !== 'advisory').length} counted, ${entry.findings.filter(f => f.severity === 'advisory').length} advisory${entry.screenshot ? ` → ${entry.screenshot}` : ''}\n`);
    }
  }
  await browser.close();
  report.summary.counted = report.summary.errors + report.summary.warns;
  fs.mkdirSync(path.dirname(path.resolve(a.out)), { recursive: true });
  fs.writeFileSync(a.out, JSON.stringify(report, null, 2));
  process.stderr.write(`design-scan: ${report.summary.counted} counted finding(s) (${report.summary.errors} error, ${report.summary.warns} warn), ${report.summary.advisory} advisory → ${a.out}\n`);
  process.exit(report.summary.counted > 0 ? 2 : 0);
}

if (require.main === module) {
  main().catch(e => { console.error(`design-scan: ${e && e.stack || e}`); process.exit(1); });
}
module.exports = { parseFrontmatter, loadDesignSystem, hexToRgb };
