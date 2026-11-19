const { chromium } = require('playwright'); const path = require('path');
const M = process.argv[2];
(async () => {
  const b = await chromium.launch(); const jobs = [];
  for (const n of ['1-today','2-gym-time','3-add-meal','4-review-habits','5-review-diet','6-add-habit']) jobs.push([n, 'light']);
  jobs.push(['3-add-meal', 'dark'], ['5-review-diet', 'dark'], ['1-today', 'dark']);
  for (const [n, scheme] of jobs) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme }); const p = await ctx.newPage();
    await p.goto('file://' + path.join(M, n + '.html')); await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(M, 'out', `${n}${scheme === 'dark' ? '-dark' : ''}.png`) }); await ctx.close();
  }
  await b.close();
})();
