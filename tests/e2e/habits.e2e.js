const IST = '+05:30'; const dateAt = (iso) => new Date(iso + IST);
module.exports = { name: 'Habits: one-tap logging, time of day, add, edit, reorder, archive, delete', async run(t) {
  const { url: U, ok, tmp: D } = t;
  const b = t.browser; const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', timezoneId: 'Asia/Kolkata', deviceScaleFactor: 2 });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); let dialogAnswer = true; p.on('dialog', d => dialogAnswer ? d.accept() : d.dismiss());
  const at = async (iso) => { await ctx.clock.setFixedTime(dateAt(iso)); };
  const load = async (iso, hash = '#/') => { await at(iso); await p.goto(U + hash); await p.reload(); await p.waitForSelector('.page-title'); };
  const habitNames = () => p.locator('.habit .name b').allTextContents();
  const state = () => p.evaluate(() => JSON.stringify({ h: Vault.state.habits.map(x => ({ n: x.name, tt: x.trackTime, g: x.weeklyGoal, a: !!x.archivedAt, o: x.order })), l: Vault.state.habitLogs.map(x => [x.date, x.part, x.note]) }));
  const addHabit = async (name, opts = {}) => {
    await p.click('[data-focus-key="add-habit"]'); await p.waitForSelector('.sheet'); await p.fill('.sheet input[type=text]', name);
    if (opts.noTime) await p.click('.switch'); for (let i = 0; i < (opts.goalClicks || 0); i++) await p.click('button[aria-label="More days a week"]');
    await p.click('.sheet button[type=submit]'); await p.waitForSelector('.sheet', { state: 'detached' });
  };

  // ===== #6 / #8: empty state and creating habits =====
  await load('2026-11-03T11:59:00');
  ok(await p.locator('.section:has-text("Habits")').count() === 1 && await p.locator('[data-focus-key="add-habit"]').innerText() === '+ Add a habit' && await p.locator('.habit').count() === 0, 'no habits: just a prompt to add one');
  await p.click('[data-focus-key="add-habit"]'); await p.waitForSelector('.sheet');
  ok(await p.evaluate(() => document.getElementById('shell').inert === true), 'the page behind a sheet is inert');
  ok(await p.evaluate(() => document.activeElement.tagName === 'INPUT'), 'the name field is focused when the sheet opens');
  await p.click('.sheet button[type=submit]'); ok((await p.textContent('#habit-msg')).includes('Give the habit a name') && await p.locator('.sheet').count() === 1, 'an empty name is refused with a clear message');
  await p.fill('.sheet input[type=text]', '   '); await p.click('.sheet button[type=submit]'); ok(await p.locator('.sheet').count() === 1 && (await p.textContent('#habit-msg')).length > 0, 'a whitespace-only name is refused');
  await p.click('.chipset button:has-text("Gym")'); ok(await p.inputValue('.sheet input[type=text]') === 'Gym' && await p.getAttribute('.chipset button:has-text("Gym")', 'aria-pressed') === 'true' && (await p.textContent('#habit-msg')) === '', 'a suggestion fills the name and shows as selected; the error clears');
  // weekly goal stepper
  const goalText = () => p.locator('.stepper span').innerText();
  ok(await goalText() === 'None' && await p.isDisabled('button[aria-label="Fewer days a week"]'), 'goal starts at None, Fewer is disabled');
  await p.click('button[aria-label="More days a week"]'); ok(await goalText() === '3 days', 'first plus sets 3 days'); for (let i = 0; i < 4; i++) await p.click('button[aria-label="More days a week"]');
  ok(await goalText() === '7 days' && await p.isDisabled('button[aria-label="More days a week"]'), 'goal stops at 7');
  for (let i = 0; i < 7; i++) await p.click('button[aria-label="Fewer days a week"]'); ok(await goalText() === 'None', 'minus walks back down to None');
  await p.click('button[aria-label="More days a week"]'); await p.keyboard.press('Escape'); await p.waitForSelector('.sheet', { state: 'detached' });
  ok(await p.evaluate(() => document.getElementById('shell').inert === false) && await p.evaluate(() => document.activeElement.getAttribute('data-focus-key')) === 'add-habit', 'Escape closes the sheet, makes the page active again and returns focus to the opener');
  ok(await p.evaluate(() => Vault.state.habits.length) === 0, 'Escape adds nothing');
  // two taps after typing for a first habit
  await p.click('[data-focus-key="add-habit"]'); await p.fill('.sheet input[type=text]', 'Gym'); await p.click('button[aria-label="More days a week"]'); await p.click('button[aria-label="More days a week"]'); await p.click('.sheet button[type=submit]');
  await p.waitForSelector('.habit'); ok((await habitNames()).join() === 'Gym', 'a habit can be created with a name (goal 4 set here)');
  await addHabit('Read 20 minutes', { noTime: true });
  ok((await habitNames()).join('|') === 'Gym|Read 20 minutes', 'habits appear in the order they were added');
  ok((await p.textContent('.section:has-text("Habits") .count-chip')).trim() === '0 of 2', 'count shows 0 of 2');
  // duplicate warning, still allowed
  await p.click('[data-focus-key="add-habit"]'); await p.fill('.sheet input[type=text]', 'gym'); ok((await p.textContent('.form-msg.info')).includes('already have a habit called'), 'a duplicate name is warned about'); await p.click('.sheet button[type=submit]'); await p.waitForSelector('.sheet', { state: 'detached' });
  ok((await habitNames()).length === 3, 'but it can still be added'); 
  // remove the duplicate via manager later; for now keep

  // ===== one tap logs, with the time from the clock (boundaries) =====
  const cases = [['2026-11-03T11:59:00', 'Morning'], ['2026-11-04T12:00:00', 'Afternoon'], ['2026-11-05T16:59:00', 'Afternoon'], ['2026-11-06T17:00:00', 'Evening']];
  for (const [iso, want] of cases) {
    await load(iso); await p.click('.habit:has-text("Gym") >> nth=0 >> .cb'); await p.waitForSelector('.when-chip');
    const chip = (await p.locator('.habit').first().locator('.when-chip').innerText()).trim();
    ok(chip === want, `at ${iso.slice(11, 16)} the chip says ${want} (got ${chip})`);
  }
  // toggle semantics: checkbox state, undo of logging
  await load('2026-11-09T10:00:00'); const cb = p.locator('.habit').first().locator('.cb');
  ok(await cb.getAttribute('aria-checked') === 'false' && await cb.getAttribute('aria-label') === 'Mark Gym done', 'unchecked checkbox is labelled "Mark Gym done"');
  await cb.click(); ok(await cb.getAttribute('aria-checked') === 'true' && await cb.getAttribute('aria-label') === 'Mark Gym not done', 'checked: state announced and label flips');
  ok((await p.textContent('.section:has-text("Habits") .count-chip')).trim() === '1 of 3', 'count shows 1 of 3 after logging');
  await p.click('#toast button:has-text("Undo")'); ok(await p.locator('.habit').first().locator('.cb').getAttribute('aria-checked') === 'false', 'Undo removes the log just made');
  await p.locator('.habit').first().locator('.cb').click(); await p.waitForSelector('.when-chip');
  await p.locator('.habit').first().locator('.cb').click(); ok(await p.locator('.habit').first().locator('.when-chip').count() === 0, 'tapping a checked habit removes today\'s log');
  await p.click('#toast button:has-text("Undo")'); ok(await p.locator('.habit').first().locator('.when-chip').count() === 1, 'Undo brings the removed log back');
  // keyboard: space toggles and focus stays on the checkbox
  await p.focus('.habit >> nth=1 >> .cb'); await p.keyboard.press('Space');
  ok(await p.locator('.habit').nth(1).locator('.cb').getAttribute('aria-checked') === 'true' && await p.evaluate(() => document.activeElement.getAttribute('data-focus-key') || '').then(k => k.startsWith('habit-cb-')), 'Space logs a habit and focus stays on its checkbox');
  ok(await p.locator('.habit').nth(1).locator('.when-chip').count() === 0 && (await p.locator('.habit').nth(1).locator('small').innerText()) === 'Done today', 'a habit that does not track time shows no chip');
  await p.keyboard.press('Space'); // un-log it again
  // sheet: change time and note
  await p.click('.habit >> nth=0 >> .when-chip'); await p.waitForSelector('.sheet'); ok(await p.locator('.bigbtn[aria-pressed=true]').innerText().then(t => t.includes('Morning')), 'the sheet opens with the logged time selected (10:00 is morning)');
  await p.click('.bigbtn:has-text("Evening")'); await p.fill('.sheet input[type=text]', 'Legs'); await p.click('.sheet button[type=submit]'); await p.waitForSelector('.sheet', { state: 'detached' });
  ok((await p.locator('.habit').first().locator('.when-chip').innerText()).trim() === 'Evening', 'saving the sheet updates the chip');
  ok(await p.evaluate(() => document.activeElement.getAttribute('data-focus-key')) === `habit-chip-${await p.evaluate(() => Vault.state.habits[0].id)}`, 'focus returns to the chip after saving');
  ok(JSON.parse(await state()).l.some(l => l[0] === '2026-11-09' && l[1] === 'evening' && l[2] === 'Legs'), 'time and note are saved');
  await p.click('.habit >> nth=0 >> .when-chip'); await p.keyboard.press('Escape'); await p.waitForSelector('.sheet', { state: 'detached' }); ok(await p.evaluate(() => document.activeElement.className.includes('when-chip')), 'Escape on the time sheet returns focus to the chip');
  await p.click('.habit >> nth=0 >> .when-chip'); await p.click('button:has-text("Remove today\'s log")'); await p.waitForSelector('.sheet', { state: 'detached' });
  ok(await p.locator('.habit').first().locator('.cb').getAttribute('aria-checked') === 'false', 'Remove today\'s log un-logs the day'); await p.click('#toast button:has-text("Undo")'); ok(await p.locator('.habit').first().locator('.when-chip').count() === 1, 'and Undo restores it');
  // week dots across a month boundary
  await load('2026-12-02T10:00:00'); await p.evaluate(() => { const id = Vault.state.habits[0].id; Vault.state.habitLogs.length = 0; ['2026-11-30', '2026-12-01', '2026-12-02'].forEach(d => Tracking.logHabit(Vault.state.habitLogs, id, d, { part: 'morning' }, 1)); Vault.touch(0); }); await p.reload(); await p.waitForSelector('.habit');
  const dots = await p.locator('.habit').first().locator('.dots i').evaluateAll(is => is.map(i => (i.classList.contains('on') ? 1 : 0) + (i.classList.contains('now') ? 'n' : '')));
  ok(dots.join(',') === '0,0,0,0,1,1,1n', `week dots across a month boundary: ${dots.join(',')}`);
  ok((await p.locator('.habit').first().locator('.dots').getAttribute('aria-label')) === 'Last 7 days: 3 of 7 days', 'dots have a text alternative');
  // persistence, encryption, offline
  const stored = await p.evaluate(() => JSON.stringify(localStorage)); ok(!stored.includes('Gym') && !stored.includes('Legs'), 'habit data is stored encrypted');
  await ctx.setOffline(true); await p.reload(); await p.waitForSelector('.habit'); ok((await habitNames()).length === 3, 'habits show and work offline'); await p.locator('.habit').nth(1).locator('.cb').click(); ok(await p.locator('.habit').nth(1).locator('.cb').getAttribute('aria-checked') === 'true', 'and can be logged offline'); await ctx.setOffline(false);
  // midnight: dots shift on a new day
  await load('2026-12-03T00:05:00'); const dots2 = await p.locator('.habit').first().locator('.dots i').evaluateAll(is => is.map(i => (i.classList.contains('on') ? 1 : 0)));
  ok(dots2.join(',') === '0,0,0,1,1,1,0', `after midnight the dots move on: ${dots2.join(',')}`);

  // ===== #8: manage habits =====
  await p.click('[data-focus-key="habits-edit"]'); await p.waitForSelector('text=Add, rename, reorder');
  ok(await p.locator('.mrow').count() === 3, 'the manager lists the habits'); ok(await p.isDisabled('button[aria-label="Move Gym up"] >> nth=0') , 'the first habit cannot move up');
  // reorder with the keyboard
  await p.focus('button[aria-label="Move Gym down"] >> nth=0'); await p.keyboard.press('Enter');
  const names = async () => p.locator('ul.tasks').first().locator('.mrow .txt b').allTextContents();
  ok((await names()).join('|') === 'Read 20 minutes|Gym|gym', 'Move down reorders the list'); ok(await p.evaluate(() => document.activeElement.getAttribute('aria-label')) === 'Move Gym down', 'focus stays on the same button after moving');
  await p.click('button[aria-label="Move Gym up"] >> nth=0'); ok((await names()).join('|') === 'Gym|Read 20 minutes|gym', 'Move up restores it');
  await p.click('button[aria-label="Move Gym down"] >> nth=0'); await p.click('a[aria-label="Back to Today"]'); await p.waitForSelector('.habit'); ok((await habitNames()).join('|') === 'Read 20 minutes|Gym|gym', 'the new order shows on Today');
  // edit: rename and settings
  await p.goto(U + '#/habits'); await p.click('button[aria-label="Edit gym"]'); await p.waitForSelector('.sheet'); ok(await p.evaluate(() => document.querySelector('.chipset') === null), 'the edit sheet has no suggestion chips');
  await p.fill('.sheet input[type=text]', 'Strength'); await p.click('.sheet .switch'); await p.click('button[aria-label="More days a week"]'); await p.click('.sheet button[type=submit]'); await p.waitForSelector('.sheet', { state: 'detached' });
  const st1 = JSON.parse(await state()).h.find(x => x.n === 'Strength'); ok(st1 && st1.tt === false && st1.g === 3, 'editing saves the name, time tracking and goal');
  ok(await p.evaluate(() => document.activeElement.getAttribute('aria-label')) === 'Edit Strength', 'focus returns to the Edit button');
  // archive keeps history; unarchive puts it last
  const logsBefore = JSON.parse(await state()).l.length; await p.click('button[aria-label="Archive Gym"]'); await p.waitForSelector('.section h2:has-text("Archived")');
  ok(JSON.parse(await state()).l.length === logsBefore && (await names()).join('|') === 'Read 20 minutes|Strength', 'archiving keeps all check-ins and removes it from the active list');
  await p.click('#toast button:has-text("Undo")'); ok((await names()).includes('Gym') && await p.locator('.section h2:has-text("Archived")').count() === 0, 'Undo restores an archived habit');
  await p.click('button[aria-label="Archive Gym"]'); await p.click('a[aria-label="Back to Today"]'); await p.waitForSelector('.habit'); ok(!(await habitNames()).includes('Gym'), 'an archived habit leaves Today');
  await p.goto(U + '#/habits'); await p.click('button[aria-label="Unarchive Gym"]'); ok((await names()).join('|') === 'Read 20 minutes|Strength|Gym', 'Unarchive puts the habit last');
  // delete: warning, cancel, confirm, undo
  const gymLogs = JSON.parse(await state()).l.length; dialogAnswer = false; await p.click('button[aria-label="Edit Gym"]'); await p.click('.sheet button:has-text("Delete")'); ok((await names()).includes('Gym') && await p.locator('.sheet').count() === 1, 'cancelling the delete warning keeps the habit and the sheet');
  dialogAnswer = true; await p.click('.sheet button:has-text("Delete")'); await p.waitForSelector('.sheet', { state: 'detached' });
  const afterDel = JSON.parse(await state()); ok(!afterDel.h.some(x => x.n === 'Gym') && afterDel.l.length < gymLogs, 'confirming deletes the habit and its check-ins');
  await p.click('#toast button:has-text("Undo")'); const afterUndo = JSON.parse(await state()); ok(afterUndo.h.some(x => x.n === 'Gym') && afterUndo.l.length === gymLogs, 'Undo brings back the habit and every check-in');
  // empty manager
  await p.evaluate(() => { Vault.state.habits.length = 0; Vault.state.habitLogs.length = 0; Vault.touch(0); }); await p.reload(); await p.waitForSelector('text=No habits yet.'); ok(true, 'the manager has an empty state');
  // dark and light screenshots of the real thing
  await load('2026-11-09T10:00:00'); await addHabit('Gym', { goalClicks: 2 }); await addHabit('Read 20 minutes', { noTime: true }); await p.locator('.habit').first().locator('.cb').click(); await p.waitForTimeout(300); ok(errs.length === 0, 'no page errors: ' + JSON.stringify(errs));
} };
