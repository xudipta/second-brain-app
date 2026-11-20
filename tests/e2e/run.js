// End-to-end tests: a real browser (Chromium through Playwright) against the real app, with a fixed clock.
//   npm install && npx playwright install chromium     (once)
//   node tests/e2e/run.js [--verbose] [--grep=habits]
// Each *.e2e.js file exports { name, run(t) }. t gives the shared browser, the app's URL, ok(condition, message),
// a temporary folder and the fixtures folder. The server and the browser are started here and stopped at the end.
const fs = require('fs');
const os = require('os');
const path = require('path');
const serve = require('./server');

let playwright;
try { playwright = require('playwright'); } catch (e) {
  console.error('Playwright is not installed. Run:  npm install && npx playwright install chromium');
  process.exit(2);
}

const args = process.argv.slice(2), verbose = args.includes('--verbose');
const grep = (args.find((a) => a.startsWith('--grep=')) || '').slice(7);

(async () => {
  const server = await serve(path.join(__dirname, '..', '..'));
  const browser = await playwright.chromium.launch();
  const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.e2e.js')).sort().filter((f) => !grep || f.includes(grep));
  let total = 0, failed = 0;
  for (const f of files) {
    const mod = require(path.join(__dirname, f)), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'second-brain-e2e-'));
    const results = [], started = Date.now();
    const ok = (condition, message) => { results.push(!!condition); if (!condition) console.log('  FAIL ' + message); else if (verbose) console.log('  PASS ' + message); };
    let crash = null;
    try { await mod.run({ browser, url: server.url, ok, tmp, fixtures: path.join(__dirname, '..', 'fixtures') }); } catch (e) { crash = e; }
    for (const c of browser.contexts()) await c.close().catch(() => {});
    const bad = results.filter((r) => !r).length + (crash ? 1 : 0);
    console.log(`${bad ? 'FAIL' : 'ok  '} ${mod.name}: ${results.length - results.filter((r) => !r).length}/${results.length} checks (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    if (crash) console.log('  CRASH ' + String(crash.stack || crash).split('\n').slice(0, 7).join('\n  '));
    total += results.length; failed += bad;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  await browser.close(); await server.close();
  console.log(`\n${files.length} files, ${total} checks, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
