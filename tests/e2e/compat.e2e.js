// Compatibility: a vault or backup made before habits and meals existed must keep working, and new backups must round-trip.
const fs = require('fs');
module.exports = { name: 'Compatibility: old vaults and old backups, new backup round trip', async run(t) {
  const { url: U, ok, tmp: D, browser: b, fixtures: F } = t; const errs = [];
  const fx = (n) => `${F}/${n}`;
  const fresh = async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', timezoneId: 'Asia/Kolkata', acceptDownloads: true });
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
    await ctx.clock.setFixedTime(new Date('2026-11-09T10:00:00+05:30'));
    await p.goto(U); await p.waitForSelector('.page-title'); return { ctx, p };
  };
  const restoreFile = async (p, file, pass) => {
    await p.goto(U + '#/more'); await p.waitForSelector('input[aria-label="Restore a backup file"]', { state: 'attached' });
    await p.setInputFiles('input[aria-label="Restore a backup file"]', file);
    if (pass != null) { await p.waitForSelector('.modal'); await p.fill('.modal input', pass); await p.click('.modal button[type=submit]'); }
    await p.waitForSelector('#toast.show, #toast:not(:empty)'); await p.waitForTimeout(200); return p.textContent('#toast');
  };
  const counts = (p) => p.evaluate(() => ({ e: Vault.state.entries.length, t: Vault.state.tasks.length, h: Vault.state.habits.length, l: Vault.state.habitLogs.length, m: Vault.state.meals.length }));

  // ===== A. a backup made by the release before habits (plain) =====
  let { ctx, p } = await fresh();
  let msg = await restoreFile(p, fx('backup-before-habits-plain.json'));
  ok(/Restored 1 note/.test(msg), `old plain backup restores: "${msg}"`);
  let c = await counts(p); ok(c.e === 1 && c.h === 0 && c.l === 0 && c.m === 0, `entries restored, new lists empty: ${JSON.stringify(c)}`);
  await p.goto(U + '#/'); await p.waitForSelector('.page-title');
  ok(await p.locator('text=Add habit').count() > 0 || await p.locator('text=Add a habit').count() > 0, 'Today shows the habit prompt after restoring an old backup');
  // the new features work on top of the restored data
  await p.evaluate(() => { const g = Tracking.makeHabit('Gym', {}, '2026-11-01', 1); g.id = 'gym'; Vault.state.habits.push(g); Tracking.logHabit(Vault.state.habitLogs, 'gym', '2026-11-09', { part: 'morning', note: '' }, 1); Vault.touch(0); });
  await p.reload(); await p.waitForSelector('.page-title');
  c = await counts(p); ok(c.e === 1 && c.h === 1 && c.l === 1, `old data and new data live together: ${JSON.stringify(c)}`);
  // a backup made now carries everything and restores on another device
  const nb = await p.evaluate(() => Vault.exportBackup()); const nbFile = `${D}/new-backup.json`; fs.writeFileSync(nbFile, nb);
  ok(['entries', 'tasks', 'habits', 'habitLogs', 'meals'].every((k) => Array.isArray(JSON.parse(nb)[k])), 'a new backup has every list');
  await ctx.close();
  ({ ctx, p } = await fresh());
  msg = await restoreFile(p, nbFile); c = await counts(p);
  ok(/Restored/.test(msg) && c.e === 1 && c.h === 1 && c.l === 1, `new backup round trip: "${msg}" ${JSON.stringify(c)}`);
  msg = await restoreFile(p, nbFile); ok(/Nothing new to restore/.test(msg), `restoring the same backup twice adds nothing: "${msg}"`);
  await ctx.close();

  // ===== B. the same, encrypted (passphrase "fixture passphrase") =====
  ({ ctx, p } = await fresh());
  await p.goto(U + '#/more'); await p.waitForSelector('input[aria-label="Restore a backup file"]', { state: 'attached' });
  await p.setInputFiles('input[aria-label="Restore a backup file"]', fx('backup-before-habits-encrypted.json'));
  await p.waitForSelector('.modal'); await p.fill('.modal input', 'wrong one'); await p.click('.modal button[type=submit]');
  await p.waitForSelector('text=Could not restore'); ok(true, 'old encrypted backup: wrong passphrase refused');
  msg = await restoreFile(p, fx('backup-before-habits-encrypted.json'), 'fixture passphrase');
  c = await counts(p); ok(/Restored 1 note/.test(msg) && c.e === 1 && c.h === 0, `old encrypted backup restores with its passphrase: "${msg}" ${JSON.stringify(c)}`);
  await ctx.close();

  // ===== C. the oldest format: a bare list of entries =====
  ({ ctx, p } = await fresh());
  msg = await restoreFile(p, fx('backup-first-release-list.json')); c = await counts(p);
  ok(/Restored 1 note/.test(msg) && c.e === 1, `first-release backup (a bare list) restores: "${msg}"`);
  await ctx.close();

  // ===== D. a vault saved by the release before habits opens and upgrades (device key) =====
  ({ ctx, p } = await fresh());
  await p.evaluate(() => { const s = Vault.state; s.entries.push({ id: 'old1', created: 1, type: 'idea', date: '2026-11-05', title: 'Old idea', source: '', duration: '', tags: [], qa: [{ q: 'q', a: 'kept' }] }); delete s.habits; delete s.habitLogs; delete s.meals; delete s.tasks; Vault.touch(0); });
  await p.waitForTimeout(300); await p.reload(); await p.waitForSelector('.page-title');
  c = await counts(p); ok(c.e === 1 && c.h === 0 && c.l === 0 && c.m === 0 && c.t === 0, `vault without the new lists opens, lists are filled in: ${JSON.stringify(c)}`);
  await p.evaluate(() => { Vault.state.meals.push(Tracking.makeMeal({ date: '2026-11-09', slot: 'lunch', levels: { protein: 2 } }, 1)); Vault.touch(0); }); await p.waitForTimeout(300); await p.reload(); await p.waitForSelector('.page-title');
  c = await counts(p); ok(c.e === 1 && c.m === 1, `saves and reloads with the new lists: ${JSON.stringify(c)}`);
  await ctx.close();

  // ===== E. the same under a passphrase lock =====
  ({ ctx, p } = await fresh());
  await p.evaluate(async () => { Vault.state.entries.push({ id: 'old2', created: 1, type: 'idea', date: '2026-11-05', title: 'Old idea', source: '', duration: '', tags: [], qa: [{ q: 'q', a: 'kept' }] }); await Vault.toPassphrase('lock phrase 1'); delete Vault.state.habits; delete Vault.state.habitLogs; delete Vault.state.meals; delete Vault.state.tasks; Vault.touch(0); await Vault.flush(); });
  await p.reload(); await p.waitForSelector('text=Enter your passphrase');
  await p.fill('input[type=password]', 'lock phrase 1'); await p.click('button[type=submit]'); await p.waitForSelector('.page-title');
  c = await counts(p); ok(c.e === 1 && c.h === 0 && c.m === 0, `passphrase vault without the new lists unlocks: ${JSON.stringify(c)}`);
  await ctx.close();

  ok(errs.length === 0, 'no page errors: ' + JSON.stringify(errs));
} };
