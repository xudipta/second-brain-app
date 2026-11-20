// Performance: a year of data (three habits every day, four meals every day, to-dos) must not make Today or Review slow.
// Times are printed with --verbose. The limits are generous on purpose so a slow CI machine does not make this flaky.
module.exports = { name: 'Performance: a year of habits and meals', async run(t) {
  const { url: U, ok, browser: b } = t; const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', timezoneId: 'Asia/Kolkata' });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await ctx.clock.setFixedTime(new Date('2026-11-09T10:00:00+05:30'));
  await p.goto(U); await p.waitForSelector('.page-title');
  const made = await p.evaluate(() => {
    const T = Tracking, K = Tasks, s = Vault.state; const parts = ['morning', 'afternoon', 'evening'];
    ['Gym', 'Read', 'Walk'].forEach((n, i) => { const h = T.makeHabit(n, { weeklyGoal: 4, order: i }, '2025-11-10', i + 1); h.id = 'h' + i; s.habits.push(h); });
    for (let i = 0; i < 365; i++) {
      const d = K.addDays('2026-11-09', -i);
      s.habits.forEach((h, k) => { if ((i + k) % 3 !== 0) T.logHabit(s.habitLogs, h.id, d, { part: parts[(i + k) % 3], note: i % 7 ? '' : 'felt good' }, 1); });
      ['breakfast', 'lunch', 'snack', 'dinner'].forEach((slot, k) => T.setMeal(s.meals, T.makeMeal(k === 2 && i % 5 === 0 ? { date: d, slot, skipped: true } : { date: d, slot, levels: { protein: 1 + (i + k) % 3, veg: (i * 2 + k) % 4, carbs: (i + 2 * k) % 4, other: k % 2 }, note: i % 4 ? '' : 'Meal ' + i }, 1)));
      const tk = K.make('Task ' + i, d, d, i); s.tasks.push(i % 3 ? K.complete(tk, d, i + 5) : tk);
    }
    Vault.touch(0); return { habits: s.habits.length, logs: s.habitLogs.length, meals: s.meals.length, tasks: s.tasks.length };
  });
  await p.waitForTimeout(500); await p.reload(); await p.waitForSelector('.page-title');
  // time a route change: from setting the hash until two animation frames after, when the new screen is painted
  const route = (hash) => p.evaluate((h) => new Promise((res) => { const t0 = performance.now(); location.hash = h; requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - t0))); }), hash);
  const check = async (label, hash, sel, limit) => {
    await p.goto(U + '#/more'); await p.waitForSelector('text=Backup');
    const ms = await route(hash); await p.waitForSelector(sel, { timeout: 5000 });
    ok(ms < limit, `${label}: drawn in ${ms.toFixed(0)} ms (limit ${limit} ms)`); return ms;
  };
  ok(made.logs > 700 && made.meals > 1400, `generated a year: ${JSON.stringify(made)}`);
  await check('Today', '#/', '.page-title', 1000);
  await check('Review, Tasks', '#/review', '.seg', 1500);
  await check('Review, Habits', '#/review/habits', '.cal', 1000);
  await check('Review, Diet', '#/review/diet', '.wk', 1000);
  await check('Diet, one day', '#/review/diet/2026-11-05', '.page-title, h1', 1000);
  // saving a habit tick with this much data
  await p.goto(U + '#/'); await p.waitForSelector('.page-title');
  const tick = await p.evaluate(() => new Promise((res) => { const t0 = performance.now(); const b = document.querySelector('button[aria-label*="Gym"][aria-pressed], [role=checkbox][aria-label*="Gym"]'); b.click(); requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - t0))); }));
  ok(tick < 500, `a habit tick redraws in ${tick.toFixed(0)} ms (limit 500 ms)`);
  const size = await p.evaluate(() => localStorage.getItem('sb.vault.v1').length);
  ok(size < 2.5e6, `the encrypted vault is ${(size / 1024).toFixed(0)} KB (limit 2.5 MB, well under the browser's storage quota)`);
  ok(errs.length === 0, 'no page errors: ' + JSON.stringify(errs));
} };
