// Optional local exports. Uses installed tools only; never uploads report material.
const fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url');
const a = require('./acceptance.cjs'), v = require('./verification.cjs');
const inside = (root, file) => { const rel = path.relative(root, file); return !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep); };
// Headless Chrome on a machine nobody sits at, as Puppeteer and Playwright launch it: a mock keychain
// and basic password store (a fresh profile never waits on the OS keychain), no background
// throttling of a window no one can see, and no waiting on a display refresh (a macOS VM has no
// display: screenshots and PDFs hung there until the deadline).
const CHROME_ARGS = ['--headless', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions',
  '--use-mock-keychain', '--password-store=basic', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-gpu-vsync'];

function executable(format) {
  const override = process.env[format === 'pdf' ? 'FORGE_CHROME' : 'FORGE_PANDOC'];
  const names = format === 'pdf' ? ['google-chrome', 'chrome', 'msedge', 'chromium', 'chromium-browser'] : ['pandoc'];
  const configured = format === 'pdf' && process.env.CHROME_BIN ? [process.env.CHROME_BIN] : [];
  // Relative PATH entries (".") would resolve against the working directory — someone else's checkout.
  const candidates = override ? [override] : [...configured, ...(process.env.PATH || '').split(path.delimiter).filter(dir => dir && path.isAbsolute(dir)).flatMap(dir => names.map(name => path.join(dir, name + (process.platform === 'win32' ? '.exe' : ''))))];
  if (!override && process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean))
      for (const suffix of format === 'pdf' ? ['Google/Chrome/Application/chrome.exe', 'Microsoft/Edge/Application/msedge.exe'] : ['Pandoc/pandoc.exe']) candidates.push(path.join(base, suffix));
  }
  if (!override && process.platform === 'darwin' && format === 'pdf') candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  for (const file of candidates) try {
    if (!fs.statSync(file).isFile() || (process.platform === 'win32' && !/\.exe$/i.test(file))) continue;
    if (process.platform !== 'win32') fs.accessSync(file, fs.constants.X_OK);
    // Preserve launcher/symlink semantics; an installed wrapper may configure the browser.
    return path.resolve(file);
  } catch { /* Try the remaining installed executables. */ }
  return null;
}

function outputFile(root, output, format) {
  a.need(a.text(output) && output.toLowerCase().endsWith('.' + format) && !/[\\:]/.test(output) && !path.isAbsolute(output) && !output.split('/').some(part => ['', '.', '..'].includes(part)), 'Output must be a relative .' + format + ' path inside the run');
  const file = path.resolve(root, output);
  a.need(inside(root, file) && inside(root, fs.realpathSync(path.dirname(file))), 'Export output escapes run directory');
  a.need(!fs.existsSync(file), 'Export output already exists; choose a new filename');
  return file;
}

const images = html => [...html.matchAll(/\bsrc="data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)"/gi)].map(match => a.sha(Buffer.from(match[1], 'base64'))).sort();

async function exportReport(format, runDirectory, output = 'report.' + format) {
  a.need(['pdf', 'docx'].includes(format), 'Use pdf or docx');
  const root = fs.realpathSync(runDirectory);
  outputFile(root, output, format);
  // Always render the checked case again; an existing HTML file may have been edited.
  return convert(format, root, output, require('./investigate-report.cjs').render(root, { interactive: false }));
}

// Convert checked report HTML (images embedded as data URIs) into a PDF or DOCX inside the run.
async function convert(format, runDirectory, output, source) {
  a.need(['pdf', 'docx'].includes(format) && typeof source === 'string', 'Use pdf or docx with rendered HTML');
  const root = fs.realpathSync(runDirectory), destination = outputFile(root, output, format);
  const tool = executable(format);
  const unavailable = reason => ({ verdict: 'EXPORT_UNAVAILABLE', format, reason, fallback: 'Use the local editable HTML report. No software was installed and nothing was uploaded.' });
  if (!tool) return unavailable(format === 'pdf' ? 'Chrome/Edge/Chromium was not found. FORGE_CHROME may name an installed executable.' : 'Pandoc was not found. FORGE_PANDOC may name an installed executable.');
  if (format === 'docx') {
    const probe = await v.run([tool, '--version'], { cwd: root, env: process.env, timeout_ms: 10000, output_limit: 65536 });
    if (probe.error || probe.signal || probe.exit_code !== 0 || !/^pandoc\s+\d/i.test(probe.stdout)) return unavailable('The installed Pandoc executable did not pass its version check.');
  }
  const temporary = fs.mkdtempSync(path.join(root, '.investigate-export-'));
  let result;
  try {
    const input = path.join(temporary, 'source.html'), converted = path.join(temporary, 'converted.' + format);
    fs.writeFileSync(input, source, { flag: 'wx' });
    const argv = format === 'pdf' ? [tool, ...CHROME_ARGS, '--user-data-dir=' + path.join(temporary, 'profile'), '--no-pdf-header-footer', '--print-to-pdf=' + converted, pathToFileURL(input).href] : [tool, '--from=html', '--to=docx', '--standalone', '--data-dir=' + temporary, '--output=' + converted, input];
    const execution = await v.run(argv, { cwd: temporary, env: process.env, timeout_ms: 60000, output_limit: 1024 * 1024 });
    if (execution.error || execution.signal || execution.exit_code !== 0) {
      const hidden = Object.entries(process.env).filter(([key, value]) => value && /(?:^|_)(?:TOKEN|PASSWORD|PASSWD|SECRET|API_KEY|PRIVATE_KEY|CREDENTIALS|AUTHORIZATION|ACCESS_KEY|COOKIE|KEY)(?:_|$)/i.test(key)).map(([, value]) => value);
      const detail = v.redact([tool, execution.error || execution.signal || 'exit ' + execution.exit_code, execution.stderr].filter(Boolean).join('\n'), hidden).slice(0, 4096);
      throw Error(format.toUpperCase() + ' converter failed: ' + detail);
    }
    a.need(fs.existsSync(converted) && fs.statSync(converted).size > 0 && fs.statSync(converted).size <= 64 * 1024 * 1024, 'Converter produced no bounded output file');
    const bytes = fs.readFileSync(converted);
    if (format === 'pdf') a.need(bytes.subarray(0, 5).toString() === '%PDF-' && bytes.subarray(-1024).includes(Buffer.from('%%EOF')), 'Converter output is not a PDF');
    else {
      a.need(bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4])), 'Converter output is not a DOCX archive');
      // Read the generated DOCX back through its installed parser and check every embedded image.
      const back = await v.run([tool, '--from=docx', '--to=html', '--standalone', '--embed-resources', '--data-dir=' + temporary, converted], { cwd: temporary, env: process.env, timeout_ms: 60000, output_limit: 64 * 1024 * 1024 });
      a.need(!back.error && !back.signal && back.exit_code === 0, 'Generated DOCX could not be read back');
      a.need(JSON.stringify(images(source)) === JSON.stringify(images(back.stdout)), 'Generated DOCX did not preserve all embedded image bytes');
    }
    // Recheck the parent, then exclusively create the final artifact; never overwrite a report.
    outputFile(root, output, format);
    fs.writeFileSync(destination, bytes, { flag: 'wx' });
    result = { verdict: format.toUpperCase() + '_EXPORTED', format, file: output, sha256: a.sha(bytes), source_sha256: a.sha(source),
      ...(format === 'pdf' ? { source_visuals: images(source).length } : { embedded_visuals: images(source).length }),
      editable: format === 'docx', verification: format === 'pdf' ? 'PDF signature and completion marker checked; inspect rendered pages to verify images, layout and readability.' : 'DOCX parsed back with embedded image hashes preserved; inspect layout after import.', uploaded: false };
    return result;
  } finally {
    // Remove only the exact temporary directory created above, after resolving confinement.
    if (fs.existsSync(temporary)) {
      a.need(fs.realpathSync(temporary) === temporary && inside(root, temporary) && path.basename(temporary).startsWith('.investigate-export-'), 'Refusing cleanup outside the owned export directory');
      try { fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      catch { if (result) result.cleanup_warning = 'Temporary export files remain at ' + temporary; }
    }
  }
}

module.exports = { exportReport, convert, executable, CHROME_ARGS };
if (require.main === module) (async () => {
  const [format, ...args] = process.argv.slice(2);
  a.need(['pdf', 'docx'].includes(format) && args.length >= 1 && args.length <= 2, 'pdf|docx <run-dir> [output-relative.pdf|docx]');
  const result = await exportReport(format, ...args);
  console.log(JSON.stringify(result));
  if (result.verdict === 'EXPORT_UNAVAILABLE') process.exitCode = 3;
})().catch(error => { console.error(JSON.stringify({ verdict: 'EXPORT_FAILED', error: error.message })); process.exitCode = 2; });
