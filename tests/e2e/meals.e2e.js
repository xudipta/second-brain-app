const IST = '+05:30'; const dateAt = (iso) => new Date(iso + IST);
module.exports = { name: 'Meals: plate, slots, tiles, recent meals, skip, edit, delete', async run(t) {
  const { url: U, ok, tmp: D } = t;
  const b = t.browser; const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', timezoneId: 'Asia/Kolkata', deviceScaleFactor: 2 });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  const load = async (iso, hash = '#/') => { await ctx.clock.setFixedTime(dateAt(iso)); await p.goto(U + hash); await p.reload(); await p.waitForSelector('.page-title'); };
  const meals = () => p.evaluate(() => JSON.stringify(Vault.state.meals.map(m => ({ d: m.date, s: m.slot, k: m.skipped, l: [m.levels.protein, m.levels.veg, m.levels.carbs, m.levels.other], n: m.note }))));
  const tile = (g) => p.locator(`.ptile[aria-label^="${g},"]`);
  const sheetShares = () => p.locator('.sheet .live .legend-row').innerText().catch(() => '');
  const NOTE = '  Protein   SHAKE: "x"  ';

  await load('2026-11-09T08:10:00');
  // ===== #7: empty day =====
  ok(await p.locator('.section h2:has-text("Meals")').count() === 1 && await p.locator('.section:has-text("Meals") .count-chip').count() === 0, 'Meals section with no count on an empty day');
  ok(await p.locator('.day-plate').count() === 0, 'today\'s plate is hidden until a meal is logged');
  ok(await p.locator('.meal').count() === 4 && (await p.locator('.meal .lab').allTextContents()).join() === 'Breakfast,Lunch,Snack,Dinner', 'four fixed slots in order');
  ok(await p.locator('button[aria-label="Add breakfast"]').count() === 1 && await p.locator('button[aria-label="Add dinner"]').count() === 1, 'each empty slot has a labelled Add button');
  // ===== #9: the sheet =====
  await p.click('button[aria-label="Add breakfast"]'); await p.waitForSelector('.sheet');
  ok(await p.isDisabled('.sheet button[type=submit]') && (await p.locator('.sheet .live').innerText()).includes('Tap a food group to start'), 'Save is disabled and the bar says how to start');
  ok(await p.evaluate(() => document.getElementById('shell').inert === true) && await p.locator('#toast:visible').count() === 0, 'the page behind is inert; no toast covers the sheet');
  ok(await p.locator('.ptile').count() === 4 && (await p.locator('.ptile .top em').allTextContents()).join('') === 'PVCO', 'four tiles with letter chips P V C O');
  ok(await tile('Protein').getAttribute('aria-label') === 'Protein, None. Tap to change', 'a tile is a button labelled with its state');
  await tile('Protein').click(); ok(await tile('Protein').getAttribute('aria-label') === 'Protein, Some. Tap to change' && (await sheetShares()) === 'Protein 100%', 'one tap: Some; the bar shows Protein 100%');
  await tile('Protein').click(); await tile('Protein').click(); ok(await tile('Protein').getAttribute('aria-label') === 'Protein, Most. Tap to change', 'three taps: Most');
  ok(!(await p.isDisabled('.sheet button[type=submit]')), 'Save is enabled once a group is above None');
  await tile('Carbs').click(); ok((await sheetShares()).replace(/\s+/g, ' ') === 'Protein 75% Carbs 25%', 'Protein Most + Carbs Some = 75% and 25%');
  ok((await p.locator('.sheet .sr-only[aria-live]').innerText()).startsWith('Carbs, Some.') && (await p.locator('.sheet .sr-only[aria-live]').innerText()).includes('Protein 75%'), 'the change is announced for screen readers');
  await tile('Protein').click(); ok((await sheetShares()) === 'Carbs 100%', 'a fourth tap cycles Protein back to None');
  await tile('Protein').click(); await tile('Protein').click(); await tile('Protein').click(); ok((await sheetShares()).replace(/\s+/g, ' ') === 'Protein 75% Carbs 25%', 'and round again to Most');
  await p.fill('.sheet input[type=text]', NOTE); await p.click('.sheet button[type=submit]'); await p.waitForSelector('.sheet', { state: 'detached' });
  // ===== #7: the logged row and the plate =====
  ok(await p.locator('.section:has-text("Meals") .count-chip').innerText() === '1 logged', 'header counts 1 logged');
  ok(await p.locator('.day-plate .legend-row').innerText().then(t => t.replace(/\s+/g, ' ')) === 'Protein 75% Carbs 25%', 'today\'s plate shows the same split');
  ok(await p.locator('.meal:has-text("Breakfast") .plate-bar').getAttribute('aria-label') === 'Protein 75%, Carbs 25%' && await p.locator('.day-plate .plate-bar').getAttribute('aria-label') === 'Protein 75%, Carbs 25%', 'bars have a text alternative');
  ok((await meals()).includes(JSON.stringify(NOTE).slice(1, -1)), 'the note is stored exactly as typed (inner spaces, case, quotes, outer spaces)');
  ok(await p.locator('.meal:has-text("Breakfast") .mid small').evaluate((e) => e.textContent) === NOTE, 'and shown exactly as typed');
  ok(await p.locator('button[aria-label^="Edit breakfast"]').getAttribute('aria-label') === `Edit breakfast: Protein 75%, Carbs 25%. ${NOTE}`, 'the row is a labelled button ("Edit breakfast: ...")');
  ok((await p.locator('.toast:visible, #toast:visible').innerText()).includes('Breakfast saved.'), 'a toast confirms the save');
  await p.click('#toast button:has-text("Undo")'); ok(await p.locator('.day-plate').count() === 0 && await p.locator('button[aria-label="Add breakfast"]').count() === 1, 'Undo removes a meal that was just saved');
  // redo it by hand
  await p.click('button[aria-label="Add breakfast"]'); await tile('Protein').click(); await tile('Protein').click(); await tile('Protein').click(); await tile('Carbs').click(); await p.fill('.sheet input[type=text]', NOTE); await p.click('.sheet button[type=submit]'); await p.waitForSelector('.sheet', { state: 'detached' });
  // ===== tap budget for a repeat meal: Add, chip, Save =====
  let taps = 0; const tapp = async (sel) => { taps++; await p.click(sel); };
  await tapp('button[aria-label="Add lunch"]'); await p.waitForSelector('.sheet');
  ok(await p.locator('.recent button').count() === 1 && (await p.locator('.recent button').innerText()).replace(/\s+/g, ' ') === NOTE.trim().replace(/\s+/g, ' ') && await p.locator('.recent button .clip').evaluate(e => e.textContent) === NOTE.trim(), 'the recent chip shows the earlier meal by its note');
  await tapp('.recent button'); ok(await p.locator('.recent button').getAttribute('aria-pressed') === 'true' && (await sheetShares()).replace(/\s+/g, ' ') === 'Protein 75% Carbs 25%' && await p.inputValue('.sheet input[type=text]') === NOTE, 'the chip copies the portions and the note exactly');
  await tapp('.sheet button[type=submit]'); await p.waitForSelector('.sheet', { state: 'detached' }); ok(taps === 3, 'a repeat meal took 3 taps: Add, chip, Save');
  ok((await p.locator('.section:has-text("Meals") .count-chip').innerText()) === '2 logged', 'two meals logged');
  // first meal budget: Add, up to 3 tile taps, Save
  // ===== skip =====
  await p.click('button[aria-label="Add snack"]'); await p.click('.sheet button:has-text("I skipped it")'); await p.waitForSelector('.sheet', { state: 'detached' });
  ok(await p.locator('.meal:has-text("Snack") .skip').innerText() === 'Skipped' && await p.locator('.meal:has-text("Snack") .skip').evaluate(e => getComputedStyle(e).fontStyle) === 'italic', 'a skipped slot reads "Skipped" in italics');
  ok((await p.locator('.section:has-text("Meals") .count-chip').innerText()) === '2 logged' && (await p.locator('.day-plate .legend-row').innerText()).replace(/\s+/g, ' ') === 'Protein 75% Carbs 25%', 'skipped meals do not change the count or the plate');
  ok(await p.locator('button[aria-label="Edit snack, skipped"]').count() === 1, 'the skipped row is labelled');
  // ===== a different meal, plate is the average =====
  await p.click('button[aria-label="Add dinner"]'); await tile('Veg').click(); await tile('Veg').click(); await tile('Protein').click(); await p.fill('.sheet input[type=text]', 'Dal & sabzi'); await p.click('.sheet button[type=submit]'); await p.waitForSelector('.sheet', { state: 'detached' });
  const expect = await p.evaluate(() => { const pl = Tracking.dayPlate(Vault.state.meals, '2026-11-09'); return Tracking.shareText(pl.percent); });
  ok((await p.locator('.day-plate .legend-row').innerText()).replace(/\s+/g, ' ').replace(/(\d)% /g, '$1%, ').trim().replace(/%,$/, '%') === expect, `today's plate equals the rules' average (${expect})`);
  ok((await p.locator('.day-plate .legend-row span').count()) === 3, 'legend lists only groups above zero');
  ok(await p.locator('.meal .plate-bar').count() === 3, 'all logged rows show a bar');
  // ===== edit: one meal per slot =====
  await p.click('button[aria-label^="Edit breakfast"]'); await p.waitForSelector('.sheet');
  ok(await tile('Protein').getAttribute('aria-label') === 'Protein, Most. Tap to change' && await p.inputValue('.sheet input[type=text]') === NOTE, 'editing opens with the portions and note filled in');
  await tile('Carbs').click(); await p.fill('.sheet input[type=text]', 'Changed'); const before = JSON.parse(await meals()).length; await p.click('.sheet button[type=submit]'); await p.waitForSelector('.sheet', { state: 'detached' });
  const afterMeals = JSON.parse(await meals()); ok(afterMeals.length === before && afterMeals.filter(m => m.s === 'breakfast').length === 1 && afterMeals.find(m => m.s === 'breakfast').n === 'Changed', 'saving replaces the slot\'s meal (still one per slot)');
  ok(await p.evaluate(() => document.activeElement.getAttribute('data-focus-key')) === 'meal-breakfast', 'focus returns to the edited row');
  await p.click('#toast button:has-text("Undo")'); ok(JSON.parse(await meals()).find(m => m.s === 'breakfast').n === NOTE, 'Undo restores the previous version of an edited meal');
  // delete with undo
  await p.click('button[aria-label^="Edit dinner"]'); await p.click('.sheet button:has-text("Delete meal")'); await p.waitForSelector('.sheet', { state: 'detached' });
  ok(await p.locator('button[aria-label="Add dinner"]').count() === 1, 'Delete meal empties the slot'); await p.click('#toast button:has-text("Undo")'); ok(await p.locator('button[aria-label^="Edit dinner"]').count() === 1, 'and Undo brings it back');
  // ===== keyboard =====
  await load('2026-11-10T13:00:00'); // a new day: everything is empty again
  ok(await p.locator('.day-plate').count() === 0 && await p.locator('.meal .plate-bar').count() === 0, 'a new day starts with no meals and no plate');
  await p.focus('button[aria-label="Add dinner"]'); await p.keyboard.press('Enter'); await p.waitForSelector('.sheet');
  await p.focus('.ptile[aria-label^="Veg,"]'); await p.keyboard.press('Space'); await p.keyboard.press('Space'); ok(await tile('Veg').getAttribute('aria-label') === 'Veg, Half. Tap to change', 'Space cycles a tile from the keyboard');
  await p.keyboard.press('Escape'); await p.waitForSelector('.sheet', { state: 'detached' });
  ok(await p.evaluate(() => document.activeElement.getAttribute('aria-label')) === 'Add dinner' && JSON.parse(await meals()).filter(m => m.d === '2026-11-10').length === 0, 'Escape closes without saving and focus returns to Add dinner');
  await p.focus('button[aria-label="Add dinner"]'); await p.keyboard.press('Enter'); await p.focus('.ptile[aria-label^="Veg,"]'); await p.keyboard.press('Space'); await p.focus('.sheet input[type=text]'); await p.keyboard.type('Soup'); await p.keyboard.press('Enter'); await p.waitForSelector('.sheet', { state: 'detached' });
  ok(JSON.parse(await meals()).some(m => m.d === '2026-11-10' && m.s === 'dinner' && m.n === 'Soup') && await p.evaluate(() => document.activeElement.getAttribute('data-focus-key')) === 'meal-dinner', 'Enter in the note saves, and focus lands on the new row');
  // ===== recent chips: distinct, newest first, capped at six =====
  await p.evaluate(() => { const s = Vault.state; s.meals.length = 0; for (let i = 0; i < 9; i++) { const m = Tracking.makeMeal({ date: '2026-11-0' + (1 + (i % 9)), slot: 'lunch', levels: { veg: 1 + (i % 3) }, note: 'Meal ' + i }, 1000 + i); s.meals.push(m); } const d = Tracking.makeMeal({ date: '2026-11-03', slot: 'snack', levels: { veg: 1 }, note: 'Meal 0' }, 5000); s.meals.push(d); Vault.touch(0); });
  await p.reload(); await p.waitForSelector('.page-title'); await p.click('button[aria-label="Add lunch"]'); await p.waitForSelector('.sheet');
  const labels = await p.locator('.recent button').allInnerTexts(); ok(labels.length === 6 && labels[0] === 'Meal 0' && labels[1] === 'Meal 8', `six chips, newest first, duplicates collapsed (${labels.join(' | ')})`);
  await p.keyboard.press('Escape');
  // ===== storage, offline =====
  await p.evaluate(() => { Vault.state.meals.length = 0; Vault.touch(0); }); await load('2026-11-11T09:00:00');
  await p.click('button[aria-label="Add breakfast"]'); await tile('Protein').click(); await p.fill('.sheet input[type=text]', 'PRIVATE-MEAL-NOTE'); await p.click('.sheet button[type=submit]'); await p.waitForSelector('.sheet', { state: 'detached' }); await p.waitForTimeout(500);
  ok(!(await p.evaluate(() => JSON.stringify(localStorage))).includes('PRIVATE-MEAL-NOTE'), 'meal data is stored encrypted');
  await ctx.setOffline(true); await p.reload(); await p.waitForSelector('.meal'); ok(await p.locator('button[aria-label^="Edit breakfast"]').count() === 1, 'meals show offline'); await p.click('button[aria-label="Add lunch"]'); await tile('Veg').click(); await p.click('.sheet button[type=submit]'); await p.waitForSelector('.sheet', { state: 'detached' }); ok(await p.locator('button[aria-label^="Edit lunch"]').count() === 1, 'and can be logged offline'); await ctx.setOffline(false);
  // all four slots filled
  await p.click('button[aria-label="Add snack"]'); await p.click('.sheet button:has-text("I skipped it")'); await p.waitForSelector('.sheet', { state: 'detached' }); await p.click('button[aria-label="Add dinner"]'); await tile('Other').click(); await p.click('.sheet button[type=submit]'); await p.waitForSelector('.sheet', { state: 'detached' });
  ok(await p.locator('.meal button.mid').count() === 4 && await p.locator('.meal .btn.add').count() === 0, 'all four slots can be filled');
  ok(errs.length === 0, 'no page errors: ' + JSON.stringify(errs));
} };
