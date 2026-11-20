const fs = require('fs');
const day = (s) => new Date(s + 'T09:00:00+05:30');
module.exports = { name: 'To-dos with carry-over, Review, notes, export and restore', async run(t) {
  const { url: U, ok, tmp: D } = t;
  const b = t.browser;
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-US', timezoneId: 'Asia/Kolkata' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  const shot = async () => {};
  const add = async (text, tomorrow) => { if (tomorrow) await p.click('.addbar .when'); await p.fill('.addbar input', text); await p.press('.addbar input', 'Enter'); await p.waitForSelector(`.task:has-text("${text}")`, { state: 'attached' }); if (tomorrow) await p.click('.addbar .when'); };
  const goDay = async (d) => { await ctx.clock.setFixedTime(day(d)); await p.reload(); await p.waitForSelector('.page-title'); };

  // ---- Day 1: Thursday 5 Nov
  await ctx.clock.setFixedTime(day('2026-11-05'));
  await p.goto(U); await p.waitForSelector('text=Nothing planned yet'); await shot('0-empty-today');
  await add('Call the electrician'); await add('Send invoice'); await add('Groceries'); await add('Plan the trip', true);
  ok(await p.locator('.fold:has-text("Later")').count() === 1, 'task planned for tomorrow sits under Later');
  await p.click('.task:has-text("Send invoice") .cb');
  ok((await p.textContent('.progress-text')).replace(/\s/g, '') === '1of3done', 'progress shows 1 of 3 done');
  await p.click('.addbar .when'); await p.fill('.addbar input', ''); await p.click('.addbar .when');
  await shot('1-day1');

  // ---- Day 2: Friday 6 Nov  (leftovers carry over)
  await goDay('2026-11-06');
  ok(await p.locator('.section:has-text("Carried over")').count() === 1 && await p.locator('.task').filter({ hasText: 'Call the electrician' }).count() === 1, 'unfinished tasks appear under Carried over the next day');
  ok((await p.textContent('.task:has-text("Groceries") .meta')).includes('From Thu') && (await p.textContent('.task:has-text("Groceries") .meta')).includes('1 day'), 'carried task shows where it came from and its age');
  ok(await p.locator('.task:has-text("Plan the trip")').count() === 1 && await p.locator('.section:has-text("Carried over") + .tasks:has-text("Plan the trip")').count() === 0, 'tomorrow-task is now a normal Today task, not carried');
  await p.click('.task:has-text("Groceries") .cb');
  ok(await p.locator('.fold:has-text("Done") .task:has-text("Groceries")').count() === 1, 'carried task completed today lands in Done');
  await p.click('.task:has-text("Call the electrician") .link-btn'); // Do today
  ok(await p.locator('.section:has-text("Carried over")').count() === 0, 'Do today clears the carried section');
  await add('Book dentist');
  await shot('2-day2');

  // ---- Day 5: Monday 9 Nov  (several days later)
  await goDay('2026-11-09');
  const carried = await p.locator('.task .age').allTextContents();
  ok(carried.some(t => t.includes('4 days')), 'age keeps growing: 4 days');
  await shot('3-day5-carried');
  // task sheet: edit + move + drop + delete/undo
  await p.click('.task:has-text("Book dentist") .body'); await p.waitForSelector('.sheet'); await shot('4-sheet');
  await p.fill('.sheet input[type=text]', 'Book the dentist'); await p.fill('.sheet textarea', 'Ask about Tuesday'); await p.click('.sheet button:has-text("Save")');
  ok(await p.locator('.task:has-text("Book the dentist")').count() === 1 && (await p.textContent('.task:has-text("Book the dentist") .meta')).includes('Ask about Tuesday'), 'edit keeps the words exactly and shows the note');
  await p.click('.task:has-text("Book the dentist") .body'); await p.fill('.sheet input[type=date]', '2026-11-12'); await p.click('.sheet button:has-text("Move")');
  ok(await p.locator('.fold:has-text("Later") >> text=Book the dentist').count() >= 1, 'Move to a date puts it under Later');
  await p.click('.task:has-text("Call the electrician") .body'); await p.click('.sheet button:has-text("Drop")');
  ok(await p.locator('.task:has-text("Call the electrician")').count() === 0, 'Drop removes it from the list');
  await add('Throwaway task');
  await p.click('.task:has-text("Throwaway task") .body'); await p.click('.sheet button:has-text("Delete")'); ok(await p.locator('.task:has-text("Throwaway task")').count() === 0, 'Delete removes it');
  await p.click('#toast button:has-text("Undo")'); ok(await p.locator('.task:has-text("Throwaway task")').count() === 1, 'Undo restores a deleted task');

  // ---- Review
  await p.click('#tabs a[data-tab=review]'); await p.waitForSelector('.stats'); await shot('5-review');
  ok(await p.locator('.dayrow').count() >= 3, 'review lists the days with activity');
  await p.click('.dayrow:has-text("Thu")'); await p.waitForSelector('text=Left over');
  ok(await p.locator('.task:has-text("Send invoice")').count() === 1 && await p.locator('.task:has-text("Call the electrician")').count() === 1, 'day detail: Thursday shows 1 done and the carried leftovers');
  await shot('6-day-detail');
  // close the day
  await p.goto(U + '#/close'); await p.waitForSelector('text=How did today go?'); await shot('7-close');
  ok(await p.locator('a:has-text("Reflect in your journal")').count() === 1, 'close the day offers the journal');

  // ---- midnight rollover with the app open
  await p.goto(U + '#/'); await p.waitForSelector('.page-title');
  await add('Open at midnight');
  await ctx.clock.setFixedTime(day('2026-11-10')); await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForSelector('.section:has-text("Carried over")', { timeout: 5000 }); ok(await p.locator('.task:has-text("Open at midnight") .age').count() === 1, 'open app redraws after midnight and carries the task');
  await ctx.clock.setFixedTime(day('2026-11-09')); await p.reload(); await p.waitForSelector('.page-title');

  // ---- Notes flow still works
  await p.click('#tabs a[data-tab=notes]'); await p.waitForSelector('text=No notes yet'); await shot('8-notes-empty');
  await p.click('a:has-text("New note")'); await p.waitForSelector('.typerow'); await shot('9-new');
  await p.click('.typerow.t-session');
  await p.fill('#ans', '1 hr, around 9 pm.'); await shot('10-interview'); await p.click('.actionbar .primary');
  await p.fill('#ans', 'Leisure.'); await p.click('.actionbar .primary');
  for (let i = 0; i < 7; i++) await p.click('button:has-text("Skip")');
  await p.waitForSelector('text=Check your entry'); await p.fill('input[type=text] >> nth=0', 'Game night'); await p.click('text=Save entry'); await p.waitForSelector('.dhead');
  await shot('11-entry'); ok(await p.locator('.dhead .tlabel').count() === 1, 'a note saves and shows');
  await p.click('#tabs a[data-tab=notes]'); await shot('12-notes');
  await p.click('#tabs a[data-tab=more]'); await p.waitForSelector('text=Export all as .zip'); await shot('13-more');
  // export zip contains notes + todos
  const [z] = await Promise.all([p.waitForEvent('download'), p.click('text=Export all as .zip')]); await z.saveAs(`${D}/out6.zip`);
  // backup + restore on a fresh device keeps tasks
  await p.click('text=Backup (.json)'); await p.waitForSelector('.modal');
  const [bk] = await Promise.all([p.waitForEvent('download'), p.click('.modal button[type=submit]')]); await bk.saveAs(`${D}/backup6.json`);
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 } }); await c2.clock.setFixedTime(day('2026-11-09')); const q = await c2.newPage(); q.on('dialog', d => d.accept());
  await q.goto(U + '#/more'); await q.waitForSelector('text=Restore a backup');
  await q.setInputFiles('input[aria-label="Restore a backup file"]', `${D}/backup6.json`); await q.waitForSelector('text=Restored');
  await q.goto(U + '#/'); await q.waitForSelector('.page-title');
  ok(await q.locator('.task:has-text("Open at midnight")').count() === 1 || await q.locator('.task:has-text("Throwaway task")').count() === 1, 'to-dos come back after restoring a backup on a new device');
  ok(await q.locator('.section:has-text("Carried over")').count() === 1, 'carried-over state is rebuilt from restored tasks');

  // ---- desktop + dark
  const dsk = await b.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 }); await dsk.clock.setFixedTime(day('2026-11-09'));
  const dp = await dsk.newPage(); await dp.goto(U + '#/more'); await dp.waitForSelector('text=Restore a backup');
  await dp.setInputFiles('input[aria-label="Restore a backup file"]', `${D}/backup6.json`); await dp.waitForSelector('text=Restored'); await dp.goto(U + '#/'); await dp.waitForSelector('.page-title'); await shot('14-desktop-today', dp);
  await dp.goto(U + '#/review'); await dp.waitForSelector('.stats'); await shot('15-desktop-review', dp);
  const dk = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' }); await dk.clock.setFixedTime(day('2026-11-09'));
  const kp = await dk.newPage(); await kp.goto(U + '#/more'); await kp.waitForSelector('text=Restore a backup');
  await kp.setInputFiles('input[aria-label="Restore a backup file"]', `${D}/backup6.json`); await kp.waitForSelector('text=Restored'); await kp.goto(U + '#/'); await kp.waitForSelector('.page-title'); await shot('16-dark-today', kp);
  ok(errs.length === 0, 'no page errors: ' + JSON.stringify(errs));
} };
