module.exports = { name: 'Review, Diet: average plate, chart, recent days, day view', async run(t) {
  const { url: U, ok, tmp: D } = t;
  const b = t.browser; const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', timezoneId: 'Asia/Kolkata', deviceScaleFactor: 2 });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  const load = async (iso, hash) => { await ctx.clock.setFixedTime(new Date(iso + '+05:30')); await p.goto(U + hash); await p.reload(); await p.waitForSelector('.page-title'); };
  const NOW = '2026-11-09T10:00:00';
  const tile = (g) => p.locator(`.ptile[aria-label^="${g},"]`);
  const legendText = (sel) => p.locator(sel).first().innerText().then(t => t.replace(/\s+/g, ' ').trim());

  // ===== empty =====
  await load(NOW, '#/review/diet');
  ok(await p.locator('text=No meals yet').count() === 1 && await p.locator('.seg').count() === 1 && await p.locator('.empty a[href="#/"]').count() === 1, 'no meals at all: an empty state with the switch and a link to Today');

  // ===== one day only =====
  await p.evaluate(() => { const T = Tracking, s = Vault.state; s.meals.push(T.makeMeal({ date: '2026-11-09', slot: 'breakfast', levels: { protein: 3, carbs: 1 }, note: 'Shake' }, 1)); Vault.touch(0); });
  await load(NOW, '#/review/diet');
  ok((await p.locator('.section:has-text("Average plate") .count-chip').innerText()) === 'last 7 days · 1 day logged', 'one day only: "last 7 days · 1 day logged"');
  ok(await p.locator('.wk button.col').count() === 7 && await p.locator('.wk .stack').count() === 1 && await p.locator('.wk .none').count() === 6, 'one filled bar and six dashed empty ones');
  ok(await p.locator('a.drow').count() === 1, 'one recent day');

  // ===== a full week with a gap day =====
  await p.evaluate(() => { const T = Tracking, s = Vault.state; s.meals.length = 0;
    const m = (date, slot, levels, note, extra) => s.meals.push(T.makeMeal(Object.assign({ date, slot, levels, note }, extra || {}), Date.parse(date + 'T08:00:00Z') + (slot === 'lunch' ? 5 : 0)));
    m('2026-11-03', 'breakfast', { protein: 2, carbs: 1 }); m('2026-11-03', 'lunch', { veg: 2, protein: 1, carbs: 1 });
    m('2026-11-04', 'lunch', { protein: 3, veg: 1 }); m('2026-11-04', 'dinner', { carbs: 2, veg: 1 }, 'Khichdi');
    m('2026-11-05', 'breakfast', { protein: 3 }, 'Shake'); m('2026-11-05', 'lunch', { veg: 1, carbs: 2, protein: 1, other: 1 });
    m('2026-11-07', 'breakfast', { carbs: 3 }, '  Poha   WITH peanuts '); m('2026-11-07', 'dinner', { protein: 2, other: 1 });
    m('2026-11-08', 'lunch', { protein: 2, veg: 2, carbs: 1 }, 'Chicken curry & roti'); m('2026-11-08', 'snack', {}, 'Not hungry', { skipped: true });
    m('2026-11-09', 'breakfast', { protein: 3, carbs: 2 }, 'Protein shake'); m('2026-11-09', 'lunch', { protein: 1, veg: 1, carbs: 1 }, 'Dal, rice and salad');
    m('2026-11-02', 'snack', {}, '', { skipped: true }); m('2026-10-20', 'lunch', { veg: 3 }); m('2026-10-25', 'lunch', { carbs: 3 });
    Vault.touch(0); });
  await load(NOW, '#/review/diet');
  const exp = await p.evaluate(() => { const T = Tracking, ms = Vault.state.meals; const days = (n) => { const out = []; for (let i = 0; i < n; i++) out.push(T.addDays('2026-11-09', -i)); return out; }; const r7 = T.rangePlate(ms, days(7)), r30 = T.rangePlate(ms, days(30));
    return { r7: T.shareText(r7.percent), n7: r7.daysLogged, r30: T.shareText(r30.percent), n30: r30.daysLogged, per: days(7).reverse().map(d => { const pl = T.dayPlate(ms, d); return pl ? pl.percent : null; }) }; });
  ok((await p.locator('.section:has-text("Average plate") .count-chip').innerText()) === `last 7 days · ${exp.n7} days logged`, `caption: last 7 days · ${exp.n7} days logged`);
  ok((await p.locator('.plate-bar').first().getAttribute('aria-label')) === exp.r7 && (await legendText('.legend-row')).replace(/%\s/g, '%, ').replace(/,$/, '') === exp.r7.replace(/,/g, ','), `average plate equals the rules (${exp.r7})`);
  ok(await p.locator('.seg:has-text("7 days") button[aria-pressed=true]').innerText() === '7 days', 'the range toggle starts on 7 days');
  // ---- chart
  ok(await p.locator('.wk button.col').count() === 7 && (await p.locator('.wk .dl').allTextContents()).join() === 'Tue,Wed,Thu,Fri,Sat,Sun,Mon', 'seven bars Tue to Mon');
  ok((await p.locator('.wk .dl.now').innerText()) === 'Mon' && await p.locator('.wk .dl.now').evaluate(e => getComputedStyle(e).fontWeight) === '700', 'today is bold');
  ok(await p.locator('.wk .col:nth-child(4) .none').count() === 1 && await p.locator('.wk .col:nth-child(4) .none').evaluate(e => getComputedStyle(e).borderStyle) === 'dashed', 'the gap day (Fri) is a dashed empty bar');
  const barInfo = await p.locator('.wk .col').evaluateAll(cols => cols.map(c => [...c.querySelectorAll('.stack i')].map(i => [i.className, parseFloat(i.style.height.match(/calc\(([\d.]+)%/)[1])])));
  ok(barInfo.filter(x => x.length).every(x => Math.round(x.reduce((a, s) => a + s[1], 0)) === 100), 'every bar adds to 100%');
  const order = ['g-protein', 'g-veg', 'g-carb', 'g-other'];
  ok(barInfo.filter(x => x.length).every(x => x.map(s => order.indexOf(s[0])).every((v, i, a) => i === 0 || v > a[i - 1])), 'segments are always in the order Protein, Veg, Carbs, Other (Protein at the bottom)');
  ok(await p.locator('.wk .stack').first().evaluate(e => getComputedStyle(e).flexDirection) === 'column-reverse' && await p.locator('.wk .stack').first().evaluate(e => getComputedStyle(e).rowGap) === '2px', 'stacked upward with a 2px gap between segments');
  const titles = await p.locator('.wk button.col').evaluateAll(es => es.map(e => e.title)); const per = exp.per;
  ok(titles.every((t, i) => per[i] ? t.endsWith(Object.entries(per[i]).filter(([, v]) => v > 0).map(([k, v]) => ({ protein: 'Protein', veg: 'Veg', carbs: 'Carbs', other: 'Other' }[k]) + ' ' + v + '%').join(', ')) : t.endsWith('no meals logged')), 'each bar\'s tooltip has the exact values');
  const used = [...new Set(barInfo.flat().map(s => s[0]))]; const legendClasses = await p.locator('.legend-row').nth(1).locator('span').evaluateAll(es => es.map(e => e.className + ':' + e.textContent));
  ok(used.every(c => legendClasses.some(l => l.startsWith(c + ':'))) && legendClasses.length === 4, `every colour used in the chart is named in its legend (${legendClasses.join(' ')})`);
  // ---- selecting a bar
  await p.locator('.wk .col').nth(1).click(); ok(await p.locator('.wk .col').nth(1).getAttribute('aria-pressed') === 'true' && (await p.locator('p.sub[aria-live]').innerText()).startsWith('Wed, Nov 4:'), 'tapping a bar shows its exact values');
  ok(await p.locator('p.sub[aria-live] a[href="#/review/diet/2026-11-04"]').count() === 1, 'with a link to open the day');
  await p.locator('.wk .col').nth(1).click(); ok(await p.locator('.wk .col').nth(1).getAttribute('aria-pressed') === 'false' && (await p.locator('p.sub[aria-live]').innerText()).includes('Tap a bar'), 'tapping again clears it');
  await p.focus('.wk .col:nth-child(4)'); await p.keyboard.press('Enter'); ok((await p.locator('p.sub[aria-live]').innerText()).includes('Fri, Nov 6: no meals logged'), 'Enter on a bar works; a gap day says "no meals logged"'); await p.keyboard.press('Enter');
  // ---- the table alternative
  const rows = await p.locator('table.sr-only tbody tr').evaluateAll(es => es.map(e => [...e.children].map(c => c.textContent)));
  ok(rows.length === 7 && rows[3][1] === 'No meals logged' && rows[6].length === 5 && rows[6].slice(1).every(x => /%$/.test(x)), 'the table lists every day, with percentages for each food group');
  // ---- recent days
  const recent = await p.locator('a.drow').evaluateAll(es => es.map(e => [e.querySelector('.d').textContent, e.querySelector('small') ? e.querySelector('small').textContent : '', e.getAttribute('href')]));
  ok(recent.map(r => r[0]).join() === 'Today,Sun 8,Sat 7,Thu 5,Wed 4,Tue 3', `recent days within 7 days, newest first, only days with meals: ${recent.map(r => r[0]).join()}`);
  ok(recent[0][1] === 'Protein shake · Dal, rice and salad' && recent[1][1] === 'Chicken curry & roti · Not hungry' && recent[2][1] === '  Poha   WITH peanuts ', 'notes are joined with " · " in slot order, exactly as typed');
  ok(recent[0][2] === '#/review/diet/2026-11-09', 'each row links to its day');
  ok(await p.locator('a.drow').first().getAttribute('aria-label').then(t => t.includes('Open this day')), 'rows are labelled for screen readers');
  // ---- 30 days
  await p.click('.seg button:has-text("30 days")'); ok((await p.locator('.section:has-text("Average plate") .count-chip').innerText()) === `last 30 days · ${exp.n30} days logged` && (await p.locator('.plate-bar').first().getAttribute('aria-label')) === exp.r30, `30 days: ${exp.n30} days logged, average equals the rules (${exp.r30})`);
  ok(exp.n30 === exp.n7 + 2 && await p.locator('a.drow').count() === 9, 'days with no meals are not counted as zeros (only the 2 older days with meals are added)');
  ok(await p.locator('a.drow:has-text("Mon 2") .skip').innerText() === 'Skipped', 'a day with only skipped meals says "Skipped" (and is not in the average)');
  // the chart follows the range
  ok(await p.locator('.wk.wide .col').count() === 30 && (await p.locator('.section:has-text("Each day") .count-chip').innerText()) === 'last 30 days', '30 days: the chart has 30 bars and says "last 30 days"');
  ok(await p.locator('table.sr-only tbody tr').count() === 30 && /last 30 days/.test(await p.locator('.wk').getAttribute('aria-label')), '30 days: the text alternative has 30 rows and the group is named for the period');
  ok(await p.evaluate(() => { const w = document.querySelector('.wk.wide'); return w.scrollWidth > w.clientWidth && w.scrollLeft + w.clientWidth >= w.scrollWidth - 2; }), '30 days: the row scrolls sideways and opens on today');
  ok((await p.locator('.wk.wide .col').last().getAttribute('aria-label')).startsWith('Mon, Nov 9') && (await p.locator('.wk.wide .col .dl.now').innerText()) === '9', 'the last bar is today');
  ok(await p.evaluate(() => [...document.querySelectorAll('.wk.wide .col')].every((c) => c.getBoundingClientRect().width >= 24)), 'each bar is at least 24 px wide');
  await p.evaluate(() => { document.querySelector('.wk.wide').scrollLeft = 0; });
  await p.locator('.wk.wide .col').nth(1).click({ force: true }); await p.waitForTimeout(300);
  ok(await p.locator('.wk.wide .col[aria-pressed=true]').count() === 1 && await p.evaluate(() => document.querySelector('.wk.wide').scrollLeft) < 30, 'picking an older bar keeps the row where it was scrolled');
  ok(/exact values|Open this day|no meals/.test(await p.locator('p.sub[aria-live]').innerText()), 'the picked bar shows its values');
  await p.click('.seg button:has-text("7 days")');
  ok(await p.locator('.wk.wide').count() === 0 && await p.locator('.wk .col').count() === 7 && (await p.locator('.section:has-text("Each day") .count-chip').innerText()) === 'last 7 days' && await p.locator('.wk .col[aria-pressed=true]').count() === 0, 'back to 7 days: seven bars, labelled, nothing picked');
  ok(!/should|recommend|target|healthy|too much|too little|goal/i.test(await p.locator('#app').innerText()), 'no advice, targets or judgement on the panel');
  ok((await p.locator('.foot').innerText()).startsWith('Rough portions you chose for each plate, not nutrition facts.') && await p.locator('.foot a[href="#/about/tracker"]').count() === 1, 'the footnote is shown, with the link to the sources');
  // ===== the day view =====
  await p.click('a.drow:has-text("Sat 7")'); await p.waitForSelector('.meal');
  ok((await p.locator('.page-title').innerText()) === 'November 7' && (await p.locator('.eyebrow').first().innerText()).toLowerCase() === 'saturday' && await p.locator('.meal').count() === 4, 'the day view shows the date and the four slots');
  ok((await p.locator('.day-plate .cap').innerText()).includes("That day's plate") && await p.locator('.meal:has-text("Breakfast") .mid small').evaluate(e => e.textContent) === '  Poha   WITH peanuts ', 'its plate, and notes exactly as typed');
  ok(await p.locator('#topbar a[aria-label="Back to Diet"]').count() === 1, 'a back arrow to Diet');
  // add a meal to a past day
  const before = await p.evaluate(() => Tracking.dayPlate(Vault.state.meals, '2026-11-07').percent); await p.click('button[aria-label="Add lunch"]'); await tile('Veg').click(); await tile('Veg').click(); await tile('Veg').click(); await p.fill('.sheet input[type=text]', 'Salad bowl'); await p.click('.sheet button[type=submit]'); await p.waitForSelector('.sheet', { state: 'detached' });
  ok(await p.locator('button[aria-label^="Edit lunch"]').count() === 1 && await p.evaluate(() => document.activeElement.getAttribute('data-focus-key')) === 'meal-lunch', 'a meal added to a past day shows, and focus lands on its row');
  const afterPlate = await p.evaluate(() => Tracking.shareText(Tracking.dayPlate(Vault.state.meals, '2026-11-07').percent)); ok((await p.locator('.day-plate .plate-bar').getAttribute('aria-label')) === afterPlate && afterPlate.includes('Veg'), `the day's plate updates at once (${afterPlate})`);
  ok(JSON.parse(await p.evaluate(() => JSON.stringify(Vault.state.meals.filter(m => m.date === '2026-11-07').length))) === 3, 'it was saved against that day (not today)');
  // edit, skip, delete + undo on a past day
  await p.click('button[aria-label^="Edit lunch"]'); await tile('Carbs').click(); await p.click('.sheet button[type=submit]'); await p.waitForSelector('.sheet', { state: 'detached' }); ok((await p.locator('button[aria-label^="Edit lunch"]').getAttribute('aria-label')).includes('Carbs'), 'editing a past meal works');
  await p.click('button[aria-label="Add snack"]'); await p.click('.sheet button:has-text("I skipped it")'); await p.waitForSelector('.sheet', { state: 'detached' }); ok(await p.locator('.meal:has-text("Snack") .skip').count() === 1, 'skipping a past slot works');
  await p.click('button[aria-label^="Edit lunch"]'); await p.click('.sheet button:has-text("Delete meal")'); await p.waitForSelector('.sheet', { state: 'detached' }); ok(await p.locator('button[aria-label="Add lunch"]').count() === 1, 'deleting works'); await p.click('#toast button:has-text("Undo")'); ok(await p.locator('button[aria-label^="Edit lunch"]').count() === 1, 'and Undo restores it');
  // the gap day
  await p.goto(U + '#/review/diet/2026-11-06'); await p.waitForSelector('.meal'); ok(await p.locator('.day-plate').count() === 0 && (await p.locator('.empty-line').innerText()).includes('No meals logged this day yet') && await p.locator('.meal .btn.add').count() === 4, 'a day with no meals: an empty note and four Add buttons');
  await p.click('button[aria-label="Add dinner"]'); await tile('Protein').click(); await p.click('.sheet button[type=submit]'); await p.waitForSelector('.sheet', { state: 'detached' });
  // chart and averages update at once
  await p.click('#topbar a[aria-label="Back to Diet"]'); await p.waitForSelector('.wk');
  ok(await p.locator('.wk .col:nth-child(4) .stack').count() === 1 && (await p.locator('.section:has-text("Average plate") .count-chip').innerText()) === `last 7 days · ${exp.n7 + 1} days logged`, 'back on Diet the gap day now has a bar and the average counts one more day');
  const exp2 = await p.evaluate(() => { const days = []; for (let i = 0; i < 7; i++) days.push(Tracking.addDays('2026-11-09', -i)); return Tracking.shareText(Tracking.rangePlate(Vault.state.meals, days).percent); }); ok((await p.locator('.plate-bar').first().getAttribute('aria-label')) === exp2, 'and the average plate was recomputed');
  // Today follows too
  await p.goto(U + '#/review/diet/2026-11-09'); await p.waitForSelector('.meal'); await p.click('button[aria-label^="Edit breakfast"]'); await tile('Other').click(); await tile('Other').click(); await tile('Other').click(); await p.click('.sheet button[type=submit]'); await p.waitForSelector('.sheet', { state: 'detached' });
  await p.goto(U + '#/'); await p.waitForSelector('.day-plate'); const todayExp = await p.evaluate(() => Tracking.shareText(Tracking.dayPlate(Vault.state.meals, '2026-11-09').percent)); ok((await p.locator('.day-plate .plate-bar').getAttribute('aria-label')) === todayExp && todayExp.includes('Other'), `editing today from the day view updates Today's plate (${todayExp})`);
  // bad dates
  await p.goto(U + '#/review/diet/2026-11-20'); await p.waitForTimeout(400); ok(await p.evaluate(() => location.hash) === '#/review/diet', 'a future day redirects to Diet');
  await p.goto(U + '#/review/diet/not-a-date'); await p.waitForTimeout(400); ok(await p.evaluate(() => location.hash) === '#/review/diet', 'an invalid date redirects to Diet');
  // other panels still fine
  await p.goto(U + '#/review/habits'); await p.waitForSelector('.seg'); await p.click('.seg button:has-text("Diet")'); await p.waitForSelector('.wk'); ok(true, 'the switch opens Diet'); await p.goBack(); await p.waitForSelector('.seg'); ok(true, 'Back returns to Habits');
  await ctx.setOffline(true); await p.goto(U + '#/review/diet'); await p.reload(); await p.waitForSelector('.wk'); ok(true, 'the panel works offline'); await ctx.setOffline(false);
  ok(errs.length === 0, 'no page errors: ' + JSON.stringify(errs));
} };
