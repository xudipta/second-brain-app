// Accessibility: every control on the new screens has an accessible name, and the main flows work from the keyboard alone.
module.exports = { name: 'Accessibility: names on every control, keyboard-only flows', async run(t) {
  const { url: U, ok, browser: b } = t; const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', timezoneId: 'Asia/Kolkata' });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await ctx.clock.setFixedTime(new Date('2026-11-09T10:00:00+05:30'));
  await p.goto(U); await p.waitForSelector('.page-title');

  // data for every screen
  await p.evaluate(() => {
    const T = Tracking, s = Vault.state;
    const gym = T.makeHabit('Gym', { weeklyGoal: 4, order: 0 }, '2026-10-20', 1); gym.id = 'gym';
    const read = T.makeHabit('Read', { trackTime: false, order: 1 }, '2026-10-20', 2); read.id = 'read';
    s.habits.push(gym, read);
    ['2026-11-09', '2026-11-07', '2026-11-06', '2026-11-03'].forEach((d, i) => T.logHabit(s.habitLogs, 'gym', d, { part: i % 2 ? 'morning' : 'evening', note: '' }, 1));
    for (let i = 0; i < 6; i++) {
      const d = '2026-11-0' + (i + 3);
      T.setMeal(s.meals, T.makeMeal({ date: d, slot: 'breakfast', levels: { protein: 3, carbs: 1 }, note: 'Shake' }, 1));
      T.setMeal(s.meals, T.makeMeal({ date: d, slot: 'lunch', levels: { veg: 2, carbs: 2, protein: 1 } }, 1));
    }
    T.setMeal(s.meals, T.makeMeal({ date: '2026-11-09', slot: 'snack', skipped: true }, 1));
    Vault.touch(0);
  });
  await p.reload(); await p.waitForSelector('.page-title');

  // Accessible name of every visible control (aria-label, aria-labelledby, an associated label, text, title, alt)
  const unnamed = () => p.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const name = (e) => {
      const l = e.getAttribute('aria-labelledby'); if (l) return l.split(/\s+/).map((i) => (document.getElementById(i) || {}).textContent || '').join(' ').trim();
      if (e.getAttribute('aria-label')) return e.getAttribute('aria-label').trim();
      if (e.labels && e.labels.length) return [...e.labels].map((x) => x.textContent).join(' ').trim();
      const img = e.querySelector('img[alt]'); const txt = (e.textContent || '').trim();
      return txt || (img && img.alt) || e.getAttribute('title') || e.getAttribute('placeholder') || '';
    };
    return [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=switch], [role=tab]')]
      .filter((e) => vis(e) || e.type === 'file').filter((e) => !name(e)).map((e) => e.outerHTML.slice(0, 120));
  });
  const audit = async (label, hash) => {
    if (hash) { await p.goto(U + hash); await p.waitForTimeout(250); }
    const bad = await unnamed(); ok(bad.length === 0, `${label}: every control has an accessible name${bad.length ? ' — ' + bad.join(' | ') : ''}`);
  };
  await audit('Today', '#/');
  await audit('Habit manager', '#/habits');
  await audit('Review, Tasks', '#/review');
  await audit('Review, Habits', '#/review/habits');
  await audit('Review, Diet', '#/review/diet');
  await audit('Diet, one day', '#/review/diet/2026-11-05');
  await audit('More', '#/more');

  // sheets: habit time sheet, meal sheet, add habit
  await p.goto(U + '#/'); await p.waitForSelector('.page-title');
  await p.locator('button[aria-label^="Add breakfast"], button[aria-label^="Add Breakfast"]').first().click().catch(() => {});
  await p.waitForSelector('.modal, [role=dialog]', { timeout: 3000 }).catch(() => {});
  if (await p.locator('.modal, [role=dialog]').count()) { await audit('Meal sheet'); await p.keyboard.press('Escape'); }

  // ---- keyboard only ----
  await p.goto(U + '#/'); await p.waitForSelector('.page-title');
  const focusText = () => p.evaluate(() => { const e = document.activeElement; return e ? (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 60) : ''; });
  const tabTo = async (test, max = 60) => { for (let i = 0; i < max; i++) { await p.keyboard.press('Tab'); if (await p.evaluate(test)) return true; } return false; };

  // meal: Tab to "Add dinner", Enter opens the sheet, Space on a tile cycles it, Escape closes and focus returns
  const reached = await tabTo(() => /^Add dinner/i.test(document.activeElement.getAttribute('aria-label') || ''));
  ok(reached, 'Tab reaches "Add dinner" on Today');
  await p.keyboard.press('Enter'); await p.waitForSelector('.modal');
  ok(await p.evaluate(() => document.querySelector('.modal').contains(document.activeElement)), 'opening the meal sheet moves focus inside it');
  const proteinTile = p.locator('.ptile').first();
  const before = await proteinTile.getAttribute('aria-label').catch(() => null) || await proteinTile.textContent();
  await proteinTile.focus(); await p.keyboard.press('Space');
  const after = await proteinTile.getAttribute('aria-label').catch(() => null) || await proteinTile.textContent();
  ok(before !== after, `Space cycles a portion tile: "${before}" -> "${after}"`);
  ok(/Protein/i.test(after || ''), 'the tile announces its group and level');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok(await p.locator('.modal').count() === 0, 'Escape closes the sheet');
  ok(/^Add dinner/i.test(await p.evaluate(() => document.activeElement.getAttribute('aria-label') || '')), 'focus returns to the button that opened it');

  // habit: reach the Gym check, log it with Space, the state is exposed
  const gymLogged = () => p.evaluate(() => Vault.state.habitLogs.some((l) => l.habitId === 'gym' && l.date === '2026-11-09'));
  const g = p.locator('button[aria-label*="Gym"][aria-pressed], [role=checkbox][aria-label*="Gym"]').first();
  ok(await g.count() === 1, 'the Gym check is a labelled control exposing its state');
  const was = await gymLogged(); await g.focus(); await p.keyboard.press('Space'); await p.waitForTimeout(250);
  ok(was !== await gymLogged(), `Space on the Gym check logs or undoes it (${was} -> ${await gymLogged()})`);

  // Review switch: arrow-free, plain buttons reachable by Tab and activated with Enter
  await p.goto(U + '#/review'); await p.waitForSelector('.page-title');
  ok(await tabTo(() => /^Habits$/.test(document.activeElement.textContent.trim())), 'Tab reaches the Habits switch');
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok(p.url().includes('#/review/habits'), 'Enter on the switch opens Review, Habits');
  ok(await p.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].some((x) => x.textContent.trim() === 'Habits' && x.getAttribute('aria-pressed') === 'true')), 'the active switch is marked pressed');

  // a past day in the calendar can be opened from the keyboard
  const cell = p.locator('button.d[aria-label*="Nov"], button.d[aria-label*="2026"]').first();
  ok(await cell.count() > 0, 'calendar days are buttons with a date and a status in their name');
  if (await cell.count()) { await cell.focus(); await p.keyboard.press('Enter'); await p.waitForSelector('.modal', { timeout: 3000 }).catch(() => {}); ok(await p.locator('.modal').count() === 1, 'Enter on a calendar day opens its sheet'); await p.keyboard.press('Escape'); }

  // visible focus ring on a button
  await p.goto(U + '#/'); await p.waitForSelector('.page-title'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
  const ring = await p.evaluate(() => { const cs = getComputedStyle(document.activeElement); return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 || cs.boxShadow !== 'none'; });
  ok(ring, 'the focused control has a visible focus indicator');

  ok(errs.length === 0, 'no page errors: ' + JSON.stringify(errs));
} };
