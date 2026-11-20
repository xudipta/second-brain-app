module.exports = { name: 'Review: the Tasks / Habits / Diet switch', async run(t) {
  const { url: U, ok, tmp: D } = t;
  const b = t.browser; const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', timezoneId: 'Asia/Kolkata' }); await ctx.clock.setFixedTime(new Date('2026-11-09T10:00:00+05:30'));
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const pressed = async () => (await p.locator('.seg button').evaluateAll(bs => bs.map(x => x.getAttribute('aria-pressed')))).join(',');
  // empty: no tasks yet
  await p.goto(U + '#/review'); await p.waitForSelector('.page-title');
  ok(await p.locator('text=Nothing to review yet').count() === 1 && await p.locator('.seg').count() === 1, 'Tasks panel with no tasks: empty state, switch still shown');
  ok(await pressed() === 'true,false,false', 'Tasks is pressed by default');
  ok(await p.getAttribute('.seg', 'role') === 'group' && await p.getAttribute('.seg', 'aria-label') === 'Review sections', 'the switch is a labelled group');
  // add a task so the Tasks panel has content
  await p.goto(U + '#/'); await p.waitForSelector('.addbar input'); await p.fill('.addbar input', 'A task'); await p.press('.addbar input', 'Enter'); await p.waitForSelector('.task:has-text("A task")'); await p.click('.task:has-text("A task") .cb');
  await p.goto(U + '#/review'); await p.waitForSelector('.stats');
  ok(await p.locator('.stats').count() === 1 && await p.locator('.dayrow').count() >= 1, 'Tasks panel shows its content');
  // keyboard: tab to a button and activate it with Enter and with Space
  await p.focus('.seg button:nth-child(2)'); await p.keyboard.press('Enter'); await p.waitForSelector('text=No habits yet');
  ok(location_hash(await p.url()) === '#/review/habits' && await pressed() === 'false,true,false', 'Enter on Habits opens it (deep link #/review/habits, pressed state moves)');
  await p.focus('.seg button:nth-child(3)'); await p.keyboard.press('Space'); await p.waitForSelector('text=No meals yet');
  ok(location_hash(await p.url()) === '#/review/diet' && await pressed() === 'false,false,true', 'Space on Diet opens it (#/review/diet)');
  ok(await p.locator('.empty a[href="#/"]').count() === 1, 'Habits and Diet empty states link to Today');
  await p.focus('.seg button:nth-child(1)'); await p.keyboard.press('Enter'); await p.waitForSelector('.stats');
  ok(location_hash(await p.url()) === '#/review' && await pressed() === 'true,false,false', 'Enter on Tasks returns to #/review');
  // Back button across panels
  await p.click('.seg button:nth-child(2)'); await p.waitForSelector('text=No habits yet'); await p.click('.seg button:nth-child(3)'); await p.waitForSelector('text=No meals yet');
  await p.goBack(); await p.waitForSelector('text=No habits yet'); ok(await pressed() === 'false,true,false', 'Back from Diet goes to Habits');
  await p.goBack(); await p.waitForSelector('.stats'); ok(await pressed() === 'true,false,false', 'Back from Habits goes to Tasks');
  // day detail still works, and its back arrow returns to Review
  await p.click('.dayrow'); await p.waitForSelector('text=Done'); ok(location_hash(await p.url()).startsWith('#/review/2026-'), 'a day opens its detail (#/review/YYYY-MM-DD)');
  await p.click('#topbar a[aria-label="Back to review"]'); await p.waitForSelector('.seg'); ok(await pressed() === 'true,false,false', 'day detail back arrow returns to the Tasks panel');
  await p.goBack(); await p.waitForSelector('text=Done'); ok(true, 'browser Back from Review returns to the day detail');
  // deep links work on a cold load
  await p.goto(U + '#/review/diet'); await p.reload(); await p.waitForSelector('text=No meals yet'); ok(await pressed() === 'false,false,true', 'cold load of #/review/diet');
  await p.goto(U + '#/review/habits'); await p.reload(); await p.waitForSelector('text=No habits yet'); ok(await pressed() === 'false,true,false', 'cold load of #/review/habits');
  // the Review tab remembers the panel for the session
  await p.click('#tabs a[data-tab=today]'); await p.waitForSelector('.addbar input'); await p.click('#tabs a[data-tab=review]');
  await p.waitForSelector('text=No habits yet'); ok(await pressed() === 'false,true,false', 'the Review tab reopens the last panel (Habits)');
  await p.click('.seg button:nth-child(1)'); await p.waitForSelector('.stats'); await p.click('#tabs a[data-tab=notes]'); await p.click('#tabs a[data-tab=review]'); await p.waitForSelector('.stats');
  ok(await pressed() === 'true,false,false', 'switching back to Tasks is remembered too');
  // the other tabs and #/review still load Tasks from a link
  await p.goto(U + '#/review'); await p.waitForSelector('.stats'); ok(await pressed() === 'true,false,false', '#/review always means Tasks');
  // accessible names: every switch button has text and a pressed state
  ok((await p.locator('.seg button').allTextContents()).join('|') === 'Tasks|Habits|Diet', 'switch buttons are labelled Tasks, Habits, Diet');
  // an unknown review path falls back safely
  await p.goto(U + '#/review/nonsense'); await p.waitForTimeout(500); ok(location_hash(await p.url()) === '#/review' && await p.locator('.stats, .empty').count() >= 1, 'an unknown review path falls back to Tasks');
  ok(errs.length === 0, 'no page errors: ' + JSON.stringify(errs));
} };
function location_hash(u) { const i = u.indexOf('#'); return i < 0 ? '' : u.slice(i); }
