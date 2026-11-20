// Rollout: an installed copy updates cleanly. The new service worker caches the whole app, drops the old cache,
// and the vault (the owner's data) is untouched. A new install starts with no habits or meals logged.
module.exports = { name: 'Rollout: service worker update keeps data, new install is empty', async run(t) {
  const { url: U, ok, browser: b } = t; const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', timezoneId: 'Asia/Kolkata' });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(U); await p.waitForSelector('.page-title');
  ok(await p.locator('text=Add a habit').count() === 1, 'a new install shows the "Add a habit" prompt');
  ok(await p.locator('.task').count() === 0 && await p.evaluate(() => Vault.state.habits.length + Vault.state.habitLogs.length + Vault.state.meals.length) === 0, 'a new install has no habits, check-ins or meals');
  await p.evaluate(() => { Vault.state.entries.push({ id: 'keep', created: 1, type: 'idea', date: '2026-11-05', title: 'Keep me', source: '', duration: '', tags: [], qa: [{ q: 'q', a: 'a' }] }); Vault.touch(0); });
  await p.waitForTimeout(400);
  // An older release left its own cache and the vault in this browser. Plant that state from a page that does not start the app
  // (so no service worker is running yet), then open the app: the new worker installs, activates and removes the old cache.
  await ctx.close();
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', timezoneId: 'Asia/Kolkata' });
  const q = await ctx2.newPage(); q.on('pageerror', (e) => errs.push(e.message));
  await q.goto(U); await q.waitForSelector('.page-title');
  await q.evaluate(() => { Vault.state.entries.push({ id: 'keep', created: 1, type: 'idea', date: '2026-11-05', title: 'Keep me', source: '', duration: '', tags: [], qa: [{ q: 'q', a: 'a' }] }); Vault.touch(0); });
  await q.waitForTimeout(400);
  await q.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); });
  await q.goto(U + 'manifest.webmanifest');   // a page of this origin with no app code, so no worker is registered
  await q.evaluate(async () => { const c = await caches.open('second-brain-v5'); await c.put('/old', new Response('old')); });
  const before = await q.evaluate(() => caches.keys());
  ok(before.join() === 'second-brain-v5', `an older release's cache is present: ${before.join(', ')}`);
  await q.goto(U); await q.waitForSelector('.page-title');
  for (let i = 0; i < 40 && (await q.evaluate(() => caches.keys())).includes('second-brain-v5'); i++) await q.waitForTimeout(200);
  const keys = await q.evaluate(() => caches.keys());
  ok(keys.length === 1 && /^second-brain-v\d+$/.test(keys[0]) && keys[0] !== 'second-brain-v5', `only the current cache remains: ${keys.join(', ')}`);
  const cached = await q.evaluate(async (k) => (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname), keys[0]);
  ['/assets/tracking.js', '/assets/tasks.js', '/assets/app.js', '/assets/vault.js', '/assets/templates.js', '/assets/styles.css', '/index.html'].forEach((f) => ok(cached.some((c) => c === f || (f === '/index.html' && c === '/')), `${f} is cached for offline use`));
  await q.reload(); await q.waitForSelector('.page-title');
  ok(await q.evaluate(() => Vault.state.entries.some((e) => e.id === 'keep')), 'the owner\'s data is intact after the update');
  // offline after the update: the app still opens
  await ctx2.setOffline(true); await q.reload(); await q.waitForSelector('.page-title');
  ok(await q.evaluate(() => Vault.state.entries.length) === 1, 'the app opens offline with its data after the update');
  await ctx2.setOffline(false);
  ok(errs.length === 0, 'no page errors: ' + JSON.stringify(errs));
} };
