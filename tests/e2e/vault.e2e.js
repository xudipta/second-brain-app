const fs = require('fs');
const idbHasKey = (p) => p.evaluate(() => new Promise((res) => { const r = indexedDB.open('sb-keys', 1); r.onupgradeneeded = () => r.result.createObjectStore('keys'); r.onsuccess = () => { const q = r.result.transaction('keys').objectStore('keys').get('vault'); q.onsuccess = () => res(!!q.result); }; }));
const ls = (p) => p.evaluate(() => JSON.stringify(localStorage));
const unlock = async (p, pass) => { await p.fill('input[aria-label="Passphrase"]', pass); await p.click('button:has-text("Unlock")'); };
module.exports = { name: 'Vault: automatic key, passphrase lock, backups, tampering, erase', async run(t) {
  const { url: U, ok, tmp: D } = t;
  const b = t.browser;
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 390, height: 800 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept());
  // legacy plaintext from the old version
  await p.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('sb.entries.v1', JSON.stringify([{ id: 'old1', created: 1, type: 'idea', date: '2026-10-29', title: 'Legacy idea', source: '', duration: '', tags: [], qa: [{ q: "What's the idea?", a: 'SECRET-LEGACY' }] }])); } });

  // A. first launch: no password screen
  await p.goto(U); await p.waitForSelector('.page-title');
  ok(await p.locator('text=Protect your notebook').count() === 0, 'first launch goes straight in, no passphrase screen');
  ok(await p.locator('text=Add a passphrase lock?').count() === 1, 'optional passphrase tip is shown');
  ok(await idbHasKey(p), 'device key created');
  let s = await ls(p);
  ok(!s.includes('SECRET-LEGACY') && !s.includes('sb.entries.v1') && s.includes('device'), 'legacy plaintext migrated into an encrypted device-mode vault');
  // B. capture an entry through the full interview + review
  await p.goto(U + '#/new/session');
  await p.fill('#ans', '1 hr, around 9 pm. TOP-SECRET'); await p.click('.actionbar .primary');
  await p.fill('#ans', 'Leisure.'); await p.click('.actionbar .primary');
  await p.fill('#ans', 'Played a game.'); await p.click('.actionbar .primary');
  for (let i = 0; i < 6; i++) await p.click('button:has-text("Skip")');
  await p.waitForSelector('text=Check your entry');
  await p.fill('input[type=text] >> nth=0', 'Game night'); await p.click('text=Save entry'); await p.waitForSelector('.dhead');
  await p.waitForTimeout(500);
  s = await ls(p);
  ok(!s.includes('TOP-SECRET') && !s.includes('Game night'), 'saved entry is not readable in storage');
  await p.reload(); await p.waitForSelector('.dhead');
  ok(await p.locator('text=TOP-SECRET').count() === 1, 'reload: still unlocked and entry readable, no password asked');
  // dismiss tip persists
  await p.goto(U + '#/'); await p.waitForSelector('text=Add a passphrase lock?'); await p.click('button[aria-label="Dismiss"]'); await p.waitForTimeout(400);
  await p.reload(); await p.waitForSelector('.page-title');
  ok(await p.locator('text=Add a passphrase lock?').count() === 0, 'dismissed tip stays dismissed');

  // C. backups from device mode
  await p.goto(U + '#/more');
  await p.click('text=Backup (.json)'); await p.waitForSelector('.modal'); await p.fill('.modal input', 'backup phrase 1');
  let [dl] = await Promise.all([p.waitForEvent('download'), p.click('.modal button[type=submit]')]); await dl.saveAs(`${D}/enc.json`);
  const enc = fs.readFileSync(`${D}/enc.json`, 'utf8'); ok(!enc.includes('TOP-SECRET') && enc.includes('"ct"'), 'backup with a passphrase is ciphertext');
  await p.click('text=Backup (.json)'); await p.waitForSelector('.modal');
  [dl] = await Promise.all([p.waitForEvent('download'), p.click('.modal button[type=submit]')]); await dl.saveAs(`${D}/plain.json`);
  ok(JSON.parse(fs.readFileSync(`${D}/plain.json`, 'utf8')).entries.length === 2, 'empty passphrase gives a plain backup (2 entries)');
  await p.click('text=Backup (.json)'); await p.waitForSelector('.modal'); await p.click('.modal button:has-text("Cancel")');
  ok(await p.locator('.modal').count() === 0, 'backup can be cancelled');

  // D. add the optional passphrase lock
  await p.click('text=Add a passphrase lock');
  await p.fill('input[aria-label="Choose a passphrase"]', 'correct horse battery'); await p.fill('input[aria-label="Type it again"]', 'correct horse battery');
  await p.click('button:has-text("Turn on passphrase lock")'); await p.waitForTimeout(300);
  ok(await p.locator('text=Turn on passphrase lock').count() === 1, 'lock needs the acknowledgement box');
  await p.check('#ack'); await p.click('button:has-text("Turn on passphrase lock")'); await p.waitForSelector('text=Lock now');
  ok(!(await idbHasKey(p)), 'device key deleted once a passphrase is set');
  await p.reload(); await p.waitForSelector('text=Enter your passphrase');
  ok(await p.locator('text=TOP-SECRET').count() === 0, 'locked after reload');
  await unlock(p, 'nope nope nope'); await p.waitForSelector('text=did not work');
  await unlock(p, 'correct horse battery'); await p.waitForSelector('text=Lock now');
  ok(true, 'unlocks with the passphrase');
  // E. remove the lock again
  await p.click('text=Remove passphrase lock'); await p.waitForSelector('.modal'); await p.fill('.modal input', 'wrong wrong'); await p.click('.modal button[type=submit]');
  await p.waitForSelector('text=That passphrase did not work');
  await p.click('text=Remove passphrase lock'); await p.waitForSelector('.modal'); await p.fill('.modal input', 'correct horse battery'); await p.click('.modal button[type=submit]');
  await p.waitForSelector('text=Add a passphrase lock'); ok(await idbHasKey(p), 'lock removed: device key back');
  await p.reload(); await p.waitForSelector('text=Add a passphrase lock');
  await p.goto(U + '#/entries'); ok(await p.locator('a.entry').count() === 2, 'entries intact after removing the lock, no password asked');
  s = await ls(p); ok(!s.includes('TOP-SECRET'), 'still encrypted at rest after removing the lock');

  // F. restore on a fresh device
  const c2 = await b.newContext({ viewport: { width: 390, height: 800 } }); const q = await c2.newPage(); q.on('dialog', d => d.accept());
  await q.goto(U); await q.waitForSelector('.page-title'); await q.goto(U + '#/more');
  await q.setInputFiles('input[aria-label="Restore a backup file"]', `${D}/enc.json`);
  await q.waitForSelector('.modal'); await q.fill('.modal input', 'bad'); await q.click('.modal button[type=submit]'); await q.waitForSelector('text=Could not restore');
  await q.setInputFiles('input[aria-label="Restore a backup file"]', `${D}/enc.json`);
  await q.waitForSelector('.modal'); await q.fill('.modal input', 'backup phrase 1'); await q.click('.modal button[type=submit]');
  await q.waitForSelector('text=Restored 2 notes'); ok(true, 'encrypted backup restored (wrong passphrase refused first)');
  await q.setInputFiles('input[aria-label="Restore a backup file"]', `${D}/plain.json`); await q.waitForSelector('text=Nothing new to restore'); ok(true, 'plain backup restores without a prompt (no duplicates)');

  // G. key missing -> clear explanation + start fresh
  await q.evaluate(() => new Promise((res) => { const r = indexedDB.open('sb-keys', 1); r.onsuccess = () => { const t = r.result.transaction('keys', 'readwrite'); t.objectStore('keys').delete('vault'); t.oncomplete = res; }; }));
  await q.reload(); await q.waitForSelector('text=cannot be opened'); ok(true, 'missing device key explained');
  await q.click('button:has-text("Start fresh")'); await q.waitForSelector('.page-title'); ok(await q.locator('text=cannot be opened').count() === 0, 'start fresh recovers the app');
  // H. tamper
  await q.evaluate(() => { const r = JSON.parse(localStorage.getItem('sb.vault.v1')); r.ct = r.ct.slice(0, 10) + (r.ct[10] === 'A' ? 'B' : 'A') + r.ct.slice(11); localStorage.setItem('sb.vault.v1', JSON.stringify(r)); });
  await q.reload(); await q.waitForSelector('text=cannot be opened'); ok(true, 'tampered data is rejected');
  ok(errs.length === 0, 'no page errors: ' + JSON.stringify(errs));
} };
