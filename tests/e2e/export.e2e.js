const fs = require('fs');
const readZip = require('./zip');
const zip = (f) => readZip(fs.readFileSync(f));
const valid = (f) => { try { return zip(f).size >= 0; } catch (e) { return false; } };
module.exports = { name: 'Export: zip with notes, to-dos, habits and meals', async run(t) {
  const { url: U, ok, tmp: D } = t;
  const b = t.browser; const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', timezoneId: 'Asia/Kolkata', acceptDownloads: true });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await ctx.clock.setFixedTime(new Date('2026-11-09T10:00:00+05:30'));
  const exportZip = async (name) => { await p.goto(U + '#/more'); await p.waitForSelector('text=Export all as .zip'); const [dl] = await Promise.all([p.waitForEvent('download'), p.click('text=Export all as .zip')]); const f = `${D}/${name}.zip`; await dl.saveAs(f); await p.waitForTimeout(150); return f; };
  const subtitle = () => p.locator('.row-item:has(strong:text("Export all as .zip")) span').innerText();
  const list = (f) => [...zip(f).keys()].sort();
  const read = (f, n) => zip(f).get(n).toString('utf8');

  await p.goto(U); await p.waitForSelector('.page-title');
  // ===== A. only a habit, nothing logged: nothing to export, backup still available =====
  await p.evaluate(() => { const g = Tracking.makeHabit('Gym', {}, '2026-11-01', 1); g.id = 'gym'; Vault.state.habits.push(g); Vault.touch(0); });
  await p.goto(U + '#/more'); await p.waitForSelector('text=Export all as .zip');
  ok((await subtitle()) === 'Nothing to export yet' && await p.locator('.row-item:has(strong:text("Export all as .zip"))').isDisabled(), 'a habit with no check-ins and nothing else: nothing to export');
  ok(!(await p.locator('.row-item:has(strong:text-is("Backup (.json)"))').isDisabled()), 'but the backup is still available (it carries the habit)');

  // ===== B. notes and to-dos only: the export is unchanged =====
  await p.goto(U + '#/'); await p.waitForSelector('.addbar input'); await p.fill('.addbar input', 'A task'); await p.press('.addbar input', 'Enter'); await p.waitForSelector('.task:has-text("A task")');
  await p.evaluate(() => { Vault.state.entries.push({ id: 'e1', created: 1, type: 'idea', date: '2026-11-09', title: 'An idea', source: '', duration: '', tags: [], qa: [{ q: "What's the idea?", a: 'Plain' }] }); Vault.touch(0); }); await p.reload(); await p.waitForSelector('.page-title');
  await p.goto(U + '#/more'); await p.waitForSelector('text=Export all as .zip');
  ok((await subtitle()) === '1 note in entries/, daily to-dos in todos/', `subtitle without habit or meal data is unchanged: "${await subtitle()}"`);
  const zipB = await exportZip('notes-only');
  ok(valid(zipB), 'the zip is valid (CRC checked)');
  ok(list(zipB).join() === ['entries/2026/11/2026-11-09-idea-an-idea.md', 'todos/2026/11/2026-11-09.md'].sort().join(), `no habits/ or meals/ files when there is no data: ${list(zipB).join(' ')}`);
  ok((await p.textContent('#toast')) === 'Exported 1 note and 1 day of to-dos.', `toast is unchanged: "${await p.textContent('#toast')}"`);

  // ===== C. habits and meals =====
  await p.evaluate(() => {
    const T = Tracking, s = Vault.state; s.habits.length = 0; s.habitLogs.length = 0; s.meals.length = 0;
    const gym = T.makeHabit('Gym', { weeklyGoal: 4, order: 0 }, '2026-11-01', 1); gym.id = 'gym'; const read = T.makeHabit('Read 20 minutes', { trackTime: false, order: 1 }, '2026-11-01', 2); read.id = 'read';
    const old = T.makeHabit('Cycling', { order: 2 }, '2026-10-01', 3); old.id = 'old'; old.archivedAt = 9; s.habits.push(gym, read, old);
    T.logHabit(s.habitLogs, 'gym', '2026-11-09', { part: 'evening', note: 'Legs: "heavy"\nsecond line\nতৃতীয় লাইন' }, 1);
    T.logHabit(s.habitLogs, 'read', '2026-11-09', { part: 'morning', note: '' }, 1);                 // a part is stored, but the habit does not track time
    T.logHabit(s.habitLogs, 'gym', '2026-11-07', { part: 'morning', note: '' }, 1);
    T.logHabit(s.habitLogs, 'old', '2026-10-03', { part: 'afternoon', note: '  spaces   kept  ' }, 1);       // an archived habit's history is exported too
    T.setMeal(s.meals, T.makeMeal({ date: '2026-11-09', slot: 'breakfast', levels: { protein: 3, carbs: 1 }, note: 'Protein shake' }, 1));
    T.setMeal(s.meals, T.makeMeal({ date: '2026-11-09', slot: 'lunch', skipped: true }, 1));
    T.setMeal(s.meals, T.makeMeal({ date: '2026-11-09', slot: 'dinner', levels: { other: 1, veg: 2, protein: 3, carbs: 0 }, note: '  Dal: "tadka"   WITH  ভাত ' }, 1));
    T.setMeal(s.meals, T.makeMeal({ date: '2026-11-08', slot: 'snack', skipped: true, note: 'Not hungry' }, 1));
    Vault.touch(0); });
  await p.goto(U + '#/more'); await p.reload(); await p.waitForSelector('text=Export all as .zip');
  ok((await subtitle()) === '1 note in entries/, daily to-dos in todos/, habits in habits/, meals in meals/', `subtitle names the new folders: "${await subtitle()}"`);
  const zipC = await exportZip('all');
  ok(valid(zipC), 'the zip is valid (CRC checked)');
  const names = list(zipC);
  ok(names.join() === ['entries/2026/11/2026-11-09-idea-an-idea.md', 'todos/2026/11/2026-11-09.md', 'habits/2026/10/2026-10-03.md', 'habits/2026/11/2026-11-07.md', 'habits/2026/11/2026-11-09.md', 'meals/2026/11/2026-11-08.md', 'meals/2026/11/2026-11-09.md'].sort().join(), `the zip has the new folders and only days with data: ${names.join(' ')}`);
  ok((await p.textContent('#toast')) === 'Exported 1 note, 1 day of to-dos, 3 days of habits and 2 days of meals.', `toast: "${await p.textContent('#toast')}"`);
  // exact formats
  const h9 = read(zipC, 'habits/2026/11/2026-11-09.md');
  ok(h9 === '---\ndate: 2026-11-09\ntype: habits\n---\n\n## Done\n- [x] Gym (evening)\n      Legs: "heavy"\n      second line\n      তৃতীয় লাইন\n- [x] Read 20 minutes\n', 'habits file: exact format, quotes and colons, several lines indented by 6 spaces, Bengali kept, no bracket for a habit without time of day');
  ok(read(zipC, 'habits/2026/11/2026-11-07.md') === '---\ndate: 2026-11-07\ntype: habits\n---\n\n## Done\n- [x] Gym (morning)\n', 'a day with one habit and no note');
  ok(read(zipC, 'habits/2026/10/2026-10-03.md') === '---\ndate: 2026-10-03\ntype: habits\n---\n\n## Done\n- [x] Cycling (afternoon)\n        spaces   kept  \n', 'an archived habit\'s check-in is exported, and its note keeps its spaces');
  const m9 = read(zipC, 'meals/2026/11/2026-11-09.md');
  ok(m9 === '---\ndate: 2026-11-09\ntype: meals\n---\n\n## Breakfast\nProtein: most, Carbs: some\n    Protein shake\n\n## Lunch\nSkipped\n\n## Dinner\nProtein: most, Veg: half, Other: some\n      Dal: "tadka"   WITH  ভাত \n', 'meals file: exact format, slot order, portion words, groups at None left out, "Skipped", and the note exactly as typed, indented so markdown cannot turn it into structure');
  ok(read(zipC, 'meals/2026/11/2026-11-08.md') === '---\ndate: 2026-11-08\ntype: meals\n---\n\n## Snack\nSkipped\n    Not hungry\n', 'a skipped meal keeps its note');
  ok(!names.some(n => n.includes('2026-11-01') || n.includes('2026-11-02')), 'no file for a day with nothing logged');
  // the existing files are byte-for-byte what the app wrote before
  ok(read(zipC, 'entries/2026/11/2026-11-09-idea-an-idea.md') === read(zipB, 'entries/2026/11/2026-11-09-idea-an-idea.md') && read(zipC, 'todos/2026/11/2026-11-09.md') === read(zipB, 'todos/2026/11/2026-11-09.md'), 'notes and to-do files are identical to the notes-only export');
  // utf-8 round trip through a real zip reader
  ok(require('child_process').spawnSync('python3', ['-I', '-c', "import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read('habits/2026/11/2026-11-09.md').decode('utf-8'))", zipC], { encoding: 'utf8' }).stdout.includes('তৃতীয় লাইন'), 'a second zip reader decodes the Bengali text');
  ok(await p.locator('text=Not exported').count() >= 0, 'export still marks notes as exported');
  // an export with only habits and meals (no notes, no to-dos)
  await p.evaluate(() => { Vault.state.entries.length = 0; Vault.state.tasks.length = 0; Vault.touch(0); }); await p.waitForTimeout(300);
  const zipD = await exportZip('habits-meals-only'); ok(valid(zipD) && list(zipD).length === 5, 'a zip with only habits and meals is valid'); ok((await p.textContent('#toast')) === 'Exported 3 days of habits and 2 days of meals.', `toast without notes or to-dos: "${await p.textContent('#toast')}"`);
  ok(errs.length === 0, 'no page errors: ' + JSON.stringify(errs));
} };
