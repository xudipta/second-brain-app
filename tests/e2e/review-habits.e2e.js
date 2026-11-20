module.exports = { name: 'Review, Habits: stats, calendar, past days, month navigation', async run(t) {
  const { url: U, ok, tmp: D } = t;
  const b = t.browser; const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', timezoneId: 'Asia/Kolkata', deviceScaleFactor: 2 });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  const load = async (iso, hash) => { await ctx.clock.setFixedTime(new Date(iso + '+05:30')); await p.goto(U + hash); await p.reload(); await p.waitForSelector('.page-title'); };
  const seed = (fn) => p.evaluate(fn);
  const stats = async () => (await p.locator('.stats .stat').evaluateAll(es => es.map(e => e.querySelector('.n').textContent + ' | ' + e.querySelector('.l').textContent)));
  const cellState = (day) => p.locator(`.cal .d:has-text("${day}")`).filter({ hasText: new RegExp(`^\\s*${day}\\s*$`) }).first();
  const L = (d, part) => ({ d, part });

  // ===== empty =====
  await load('2026-11-09T10:00:00', '#/review/habits');
  ok(await p.locator('text=No habits yet').count() === 1 && await p.locator('.seg').count() === 1 && await p.locator('.empty a[href="#/"]').count() === 1, 'no habits: an empty state with the switch and a link to Today');

  // ===== data like the approved design =====
  await seed(() => { const s = Vault.state, T = Tracking; const gym = T.makeHabit('Gym', { weeklyGoal: 4, order: 0 }, '2026-11-01', 1); gym.id = 'gym'; const read = T.makeHabit('Read 20 minutes', { trackTime: false, order: 1 }, '2026-11-05', 2); read.id = 'read'; s.habits.push(gym, read);
    [[2, 'evening'], [3, 'evening'], [4, 'morning'], [6, 'evening'], [7, 'morning'], [9, 'evening']].forEach(([d, part]) => T.logHabit(s.habitLogs, 'gym', '2026-11-0' + d, { part, note: d === 3 ? 'Legs' : '' }, 1));
    [[6], [8]].forEach(([d]) => T.logHabit(s.habitLogs, 'read', '2026-11-0' + d, {}, 1)); Vault.touch(0); });
  await load('2026-11-09T10:00:00', '#/review/habits');
  ok((await p.locator('.pick button').allTextContents()).join('|') === 'Gym|Read 20 minutes' && await p.locator('.pick button').first().getAttribute('aria-pressed') === 'true', 'habit picker lists the active habits, the first selected');
  const s1 = await stats();
  ok(s1[0] === '6 of 9 | Days this month' && s1[1] === '1 day | This week (goal 4)' && s1[2] === 'Evening | Usual time, 4 of 6 days' && s1[3] === '3 of 3 | Back the day after a miss', `stats match the rules: ${JSON.stringify(s1)}`);
  ok(await p.locator('.section h2:has-text("November 2026")').count() === 1, 'the month title');
  ok((await p.locator('.cal .h').allTextContents()).join('') === 'MTWTFSS', 'the week starts on Monday');
  ok((await p.locator('.cal .d.x').count()) === 6, 'six blank cells before Sunday 1 November');
  const day1Col = await p.locator('.cal > *').evaluateAll(es => es.findIndex(e => e.textContent.trim() === '1' || e.textContent.trim() === '' ) );
  ok(await p.locator('.cal > *').nth(7 + 6).evaluate(e => e.textContent.trim()) === '1', 'day 1 sits in the Sunday column (7th cell of the first row)');
  ok(await p.locator('.cal button.on').count() === 6 && await p.locator('.cal button.on svg').count() === 6, 'six logged days, each with an icon');
  ok(await p.locator('.cal button[aria-label^="Tue, Nov 3"]').getAttribute('aria-label') === 'Tue, Nov 3: done, evening. Tap to change', 'a logged day is read as "done, evening"');
  ok(await p.locator('.cal button[aria-label^="Wed, Nov 4"]').getAttribute('aria-label') === 'Wed, Nov 4: done, morning. Tap to change', 'a morning day too');
  ok(await p.locator('.cal button[aria-label^="Thu, Nov 5"]').getAttribute('aria-label') === 'Thu, Nov 5: not logged. Tap to change', 'a missed day is read as "not logged"');
  ok(await p.locator('.cal .d.today').count() === 1 && await p.locator('.cal .d.today').getAttribute('aria-current') === 'date', 'today is outlined and marked as the current date');
  ok(await p.locator('.cal .d.future').count() === 21 && await p.locator('.cal div.d.future').first().evaluate(e => e.tagName) === 'DIV' && (await p.locator('.cal div.d.future').first().getAttribute('aria-label')).endsWith('in the future'), 'future days are dimmed, not buttons, and described');
  ok((await p.locator('.key').innerText()).replace(/\s+/g, ' ').includes('morning') && (await p.locator('.key').innerText()).includes('evening'), 'the legend names each icon in text');
  const bars = await p.locator('.hbar').evaluateAll(es => es.map(e => e.querySelector('.t').textContent.trim() + ':' + e.querySelector('b').textContent + ':' + e.querySelector('.tr i').style.width));
  ok(bars.join(' ') === 'Morning:2:33% Afternoon:0:0% Evening:4:67%', `time-of-day bars: ${bars.join(' ')}`);
  const tableRows = await p.locator('table.sr-only tbody tr').evaluateAll(es => es.map(e => [...e.children].map(c => c.textContent).join('/')));
  ok(tableRows.length === 6 && tableRows.includes('Tue, Nov 3/Evening/Legs'), 'a text table lists every logged day, with the note');
  ok(await p.locator('text=/streak/i').count() === 0, 'no streak counter anywhere');
  // ===== log a past day =====
  await p.locator('.cal button[aria-label^="Thu, Nov 5"]').click(); await p.waitForSelector('.sheet'); ok((await p.locator('.sheet h3').innerText()).includes('Gym') && await p.locator('.bigbtn[aria-pressed=true]').count() === 0, 'tapping a past day opens the sheet with nothing selected');
  await p.click('.bigbtn:has-text("Morning")'); await p.click('.sheet button[type=submit]'); await p.waitForSelector('.sheet', { state: 'detached' });
  ok(await p.locator('.cal button[aria-label^="Thu, Nov 5"]').getAttribute('aria-label') === 'Thu, Nov 5: done, morning. Tap to change', 'the calendar updates at once');
  const s2 = await stats(); ok(s2[0] === '7 of 9 | Days this month' && s2[2].startsWith('Evening'), `stats update at once: ${s2[0]}`);
  const bars2 = await p.locator('.hbar b').allTextContents(); ok(bars2.join() === '3,0,4', `time-of-day counts update: ${bars2.join()}`);
  ok(await p.evaluate(() => document.activeElement.getAttribute('data-focus-key')) === 'cal-2026-11-05', 'focus returns to the day that was changed');
  await p.goto(U + '#/'); await p.waitForSelector('.habit'); const dots = await p.locator('.habit').first().locator('.dots i').evaluateAll(is => is.map(i => i.classList.contains('on') ? 1 : 0)); ok(dots.join() === '1,1,1,1,1,0,1', `Today's week dots include the logged day: ${dots.join()}`);
  await p.goto(U + '#/review/habits'); await p.waitForSelector('.cal');
  await p.locator('.cal button[aria-label^="Thu, Nov 5"]').click(); await p.click('.sheet button:has-text("Remove this day")'); await p.waitForSelector('.sheet', { state: 'detached' });
  ok(await p.locator('.cal button[aria-label^="Thu, Nov 5"]').getAttribute('aria-label') === 'Thu, Nov 5: not logged. Tap to change', 'removing a past log works'); await p.click('#toast button:has-text("Undo")'); await p.waitForSelector('.cal'); ok(await p.locator('.cal button[aria-label^="Thu, Nov 5"]').getAttribute('aria-label').then(t => t.includes('done')), 'and Undo restores it');
  await p.locator('.cal button[aria-label^="Mon, Nov 9"]').click(); await p.keyboard.press('Escape'); await p.waitForSelector('.sheet', { state: 'detached' }); ok(await p.evaluate(() => document.activeElement.getAttribute('data-focus-key')) === 'cal-2026-11-09', 'Escape returns focus to the day cell (today can be edited too)');
  // keyboard on a cell
  await p.focus('.cal button[aria-label^="Sat, Nov 7"]'); await p.keyboard.press('Enter'); await p.waitForSelector('.sheet'); ok(await p.locator('.bigbtn[aria-pressed=true]').innerText().then(t => t.includes('Morning')), 'Enter on a day opens its sheet (Nov 7 was a morning)'); await p.keyboard.press('Escape');

  // ===== switch habit: no time of day =====
  await p.click('.pick button:has-text("Read 20 minutes")'); await p.waitForSelector('.stats');
  const s3 = await stats(); ok(s3.length === 3 && !s3.some(t => t.includes('Usual time')), `a habit without time of day has no "usual time" stat: ${JSON.stringify(s3)}`);
  ok(await p.locator('.section h2:has-text("Time of day")').count() === 0 && await p.locator('.hbar').count() === 0, 'and no Time of day section');
  ok(await p.locator('.cal button.on').count() === 2 && await p.locator('.cal button.on svg').count() === 2 && (await p.locator('.key').innerText()).includes('done'), 'logged days show a plain mark, and the legend says "done"');
  ok(await p.locator('.cal .d.x').count() === 6 + 4, 'days before the habit existed are blank (6 padding + 4 days before 5 Nov)');
  ok(await p.locator('.cal button[aria-label^="Mon, Nov 2"]').count() === 0 && await p.locator('.cal button[aria-label^="Thu, Nov 5"]').count() === 1, 'and not tappable; creation day is');
  ok(await p.getAttribute('.section .nav button[aria-label^="Previous"]', 'disabled') !== null, 'Previous month is disabled at the habit\'s first month');
  ok(s3[2].startsWith('2 of 2'), `back-after-miss for the second habit (misses on the 5th and 7th, both followed by a done day): ${s3[2]}`);
  await p.click('.pick button:has-text("Gym")');

  // ===== month navigation: year boundary and leap February =====
  await seed(() => { const s = Vault.state; s.habits[0].createdDate = '2027-12-02'; s.habitLogs.length = 0; ['2027-12-05', '2027-12-31', '2028-01-01', '2028-02-29', '2028-03-01'].forEach(d => Tracking.logHabit(s.habitLogs, 'gym', d, { part: 'morning' }, 1)); Vault.touch(0); });
  await load('2028-03-05T10:00:00', '#/review/habits');
  ok(await p.locator('.section h2:has-text("March 2028")').count() === 1 && await p.getAttribute('.section .nav button[aria-label^="Next"]', 'disabled') !== null, 'opens on the current month; Next is disabled there');
  await p.click('button[aria-label^="Previous month"]'); ok(await p.locator('.section h2:has-text("February 2028")').count() === 1 && await p.locator('.cal > *:not(.h):not(.x)').count() === 29, 'February 2028 has 29 days (leap year)');
  ok(await p.locator('.cal button[aria-label^="Tue, Feb 29"]').count() === 1 && await p.locator('.cal button[aria-label^="Tue, Feb 29"]').getAttribute('aria-label').then(t => t.includes('done')), 'and 29 February can be logged and is shown');
  ok(await p.locator('.cal .d.x').count() === 1, 'one blank before Tuesday 1 February 2028');
  await p.click('button[aria-label^="Previous month"]'); ok(await p.locator('.section h2:has-text("January 2028")').count() === 1, 'back across the year boundary: January 2028');
  await p.click('button[aria-label^="Previous month"]'); ok(await p.locator('.section h2:has-text("December 2027")').count() === 1 && await p.locator('.cal > *:not(.h):not(.x)').count() === 30, 'December 2027 shows days from the 2nd (the habit started on 2 December)');
  ok(await p.getAttribute('button[aria-label^="Previous month"]', 'disabled') !== null && await p.evaluate(() => document.activeElement.getAttribute('data-focus-key')) === 'cal-next', 'Previous is disabled at the first month and focus moves to Next');
  await p.click('button[aria-label^="Next month"]'); await p.click('button[aria-label^="Next month"]'); await p.click('button[aria-label^="Next month"]'); ok(await p.locator('.section h2:has-text("March 2028")').count() === 1, 'forward again to March 2028');
  // a non-leap February
  await seed(() => { const s = Vault.state; s.habits[0].createdDate = '2026-12-02'; Vault.touch(0); }); await load('2027-03-05T10:00:00', '#/review/habits'); await p.click('button[aria-label^="Previous month"]'); ok(await p.locator('.section h2:has-text("February 2027")').count() === 1 && await p.locator('.cal > *:not(.h):not(.x)').count() === 28 && await p.locator('.cal .d.x').count() === 0, 'February 2027 has 28 days and starts on a Monday');

  // ===== dark and storage =====
  ok(!(await p.evaluate(() => JSON.stringify(localStorage))).includes('Legs'), 'notes stay encrypted');
  await ctx.setOffline(true); await p.reload(); await p.waitForSelector('.cal'); ok(true, 'the panel works offline'); await ctx.setOffline(false);
  ok(errs.length === 0, 'no page errors: ' + JSON.stringify(errs));
} };
