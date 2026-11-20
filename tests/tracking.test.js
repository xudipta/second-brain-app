// Unit tests for assets/tracking.js. Run with: node tests/run.js
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../assets/tracking.js');

const at = (h, m) => new Date(2026, 10, 9, h, m);
const mk = (date, slot, levels, extra) => T.makeMeal(Object.assign({ date, slot, levels }, extra || {}), 1);
const habit = (over) => Object.assign(T.makeHabit('Gym', {}, '2026-11-01', 1), over || {});
const logs = (habitId, days) => days.map((d) => ({ habitId, date: `2026-11-${String(d[0]).padStart(2, '0')}`, part: d[1] || null, note: '', at: 1 }));

test('the module has no DOM or storage dependency (it loads in plain node)', () => {
  assert.equal(typeof window, 'undefined');
  assert.equal(typeof localStorage, 'undefined');
  assert.ok(T.partOfDay);
});

// ---------- time of day ----------
test('time of day: boundaries at 11:59, 12:00, 16:59 and 17:00', () => {
  assert.equal(T.partOfDay(at(0, 0)), 'morning');
  assert.equal(T.partOfDay(at(11, 59)), 'morning');
  assert.equal(T.partOfDay(at(12, 0)), 'afternoon');
  assert.equal(T.partOfDay(at(16, 59)), 'afternoon');
  assert.equal(T.partOfDay(at(17, 0)), 'evening');
  assert.equal(T.partOfDay(at(23, 59)), 'evening');
});

// ---------- rounding and shares ----------
test('roundTo100 always adds to exactly 100', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 2000; i++) {
    const n = 1 + Math.floor(rnd() * 6), w = Array.from({ length: n }, () => Math.floor(rnd() * 5));
    const out = T.roundTo100(w);
    if (w.some((x) => x > 0)) assert.equal(out.reduce((a, b) => a + b, 0), 100, JSON.stringify(w));
    else assert.deepEqual(out, w.map(() => 0));
  }
});
test('roundTo100: largest remainder, ties go to the earlier item', () => {
  assert.deepEqual(T.roundTo100([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(T.roundTo100([1, 0, 0]), [100, 0, 0]);
  assert.deepEqual(T.roundTo100([3, 1]), [75, 25]);
  assert.deepEqual(T.roundTo100([0, 0]), [0, 0]);
});
test('mealShares: portions to percentages, clamped, null when empty', () => {
  assert.deepEqual(T.mealShares({ protein: 3, carbs: 1 }), { protein: 75, veg: 0, carbs: 25, other: 0 });
  assert.deepEqual(T.mealShares({ protein: 1, veg: 1, carbs: 1 }), { protein: 34, veg: 33, carbs: 33, other: 0 });
  assert.deepEqual(T.mealShares({ protein: 99, carbs: -4, veg: 'x', other: 1 }), { protein: 75, veg: 0, carbs: 0, other: 25 });
  assert.equal(T.mealShares({}), null);
  assert.equal(T.mealShares(null), null);
});

// ---------- meals ----------
test('a meal needs a portion unless skipped; bad input returns null and never throws', () => {
  assert.equal(mk('2026-11-09', 'lunch', { protein: 0 }), null);
  assert.ok(mk('2026-11-09', 'lunch', {}, { skipped: true }).skipped);
  assert.equal(mk('2026-11-09', 'brunch', { protein: 1 }), null);
  assert.equal(mk('2026-02-30', 'lunch', { protein: 1 }), null);
  assert.equal(T.normalizeMeal(null), null);
  assert.equal(T.normalizeMeal('x'), null);
  assert.equal(T.normalizeMeal({ id: 5 }), null);
});
test('a skipped meal stores no portions; notes are kept exactly as typed and capped at 200 characters', () => {
  const s = mk('2026-11-09', 'snack', { protein: 3 }, { skipped: true, note: '  Not hungry  ' });
  assert.deepEqual(s.levels, { protein: 0, veg: 0, carbs: 0, other: 0 });
  assert.equal(s.note, '  Not hungry  ');
  assert.equal(mk('2026-11-09', 'lunch', { veg: 1 }, { note: 'x'.repeat(300) }).note.length, 200);
  assert.equal(mk('2026-11-09', 'lunch', { veg: 1 }, { note: 'Dal: "tadka",\nrice' }).note, 'Dal: "tadka",\nrice');
});
test('one meal per slot per day: saving replaces it and keeps the slot\'s id', () => {
  const meals = [];
  const a = T.setMeal(meals, mk('2026-11-09', 'breakfast', { protein: 3 }));
  const b = T.setMeal(meals, mk('2026-11-09', 'breakfast', { carbs: 2 }, { note: 'Oats' }));
  assert.equal(meals.length, 1);
  assert.equal(b.id, a.id);
  assert.equal(meals[0].levels.carbs, 2);
  T.setMeal(meals, mk('2026-11-09', 'lunch', { veg: 1 }));
  T.setMeal(meals, mk('2026-11-10', 'breakfast', { veg: 1 }));
  assert.equal(meals.length, 3);
  assert.equal(T.removeMeal(meals, '2026-11-09', 'lunch').slot, 'lunch');
  assert.equal(T.removeMeal(meals, '2026-11-09', 'lunch'), null);
  assert.equal(meals.length, 2);
});

// ---------- day and range plates ----------
test('day plate: the plain average of the day\'s meals, rounded to 100', () => {
  const meals = [mk('2026-11-09', 'breakfast', { protein: 3, carbs: 2 }), mk('2026-11-09', 'lunch', { protein: 1, veg: 1, carbs: 1 })];
  // averages: protein 0.4667, veg 0.1667, carbs 0.3667 -> 46.67, 16.67, 36.67 -> the two extra points go to the earlier items
  assert.deepEqual(T.dayPlate(meals, '2026-11-09'), { percent: { protein: 47, veg: 17, carbs: 36, other: 0 }, meals: 2 });
});
test('day plate: skipped meals and other days are ignored; null when nothing is logged', () => {
  const meals = [mk('2026-11-09', 'breakfast', { protein: 1 }), mk('2026-11-09', 'lunch', {}, { skipped: true }), mk('2026-11-08', 'dinner', { carbs: 1 })];
  assert.deepEqual(T.dayPlate(meals, '2026-11-09'), { percent: { protein: 100, veg: 0, carbs: 0, other: 0 }, meals: 1 });
  assert.equal(T.dayPlate(meals, '2026-11-07'), null);
  assert.equal(T.dayPlate([mk('2026-11-09', 'lunch', {}, { skipped: true })], '2026-11-09'), null);
});
test('day plate always adds to 100 for any combination of portions', () => {
  const vals = [0, 1, 2, 3];
  for (const p of vals) for (const v of vals) for (const c of vals) for (const o of vals) {
    if (p + v + c + o === 0) continue;
    const plate = T.dayPlate([mk('2026-11-09', 'lunch', { protein: p, veg: v, carbs: c, other: o })], '2026-11-09');
    assert.equal(Object.values(plate.percent).reduce((a, b) => a + b, 0), 100);
  }
});
test('range plate: days with no meals are not counted as zeros', () => {
  const meals = [mk('2026-11-03', 'lunch', { protein: 1 }), mk('2026-11-05', 'lunch', { carbs: 1 })];
  const days = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
  assert.deepEqual(T.rangePlate(meals, days), { percent: { protein: 50, veg: 0, carbs: 50, other: 0 }, daysLogged: 2 });
  assert.equal(T.rangePlate(meals, ['2026-11-04']), null);
});
test('range plate weights each day equally, however many meals it has', () => {
  const meals = [mk('2026-11-03', 'breakfast', { protein: 1 }), mk('2026-11-03', 'lunch', { protein: 1 }), mk('2026-11-03', 'dinner', { protein: 1 }), mk('2026-11-04', 'lunch', { veg: 1 })];
  assert.deepEqual(T.rangePlate(meals, ['2026-11-03', '2026-11-04']).percent, { protein: 50, veg: 50, carbs: 0, other: 0 });
});

// ---------- habits and check-ins ----------
test('habits: name is trimmed and limited, goal is 1 to 7 or null, junk returns null', () => {
  const h = T.makeHabit('  Gym  ', { weeklyGoal: 4 }, '2026-11-01', 5);
  assert.equal(h.name, 'Gym'); assert.equal(h.weeklyGoal, 4); assert.equal(h.trackTime, true); assert.equal(h.createdDate, '2026-11-01');
  assert.equal(T.makeHabit('x', { weeklyGoal: 9 }, '2026-11-01').weeklyGoal, null);
  assert.equal(T.makeHabit('x', { weeklyGoal: 0 }, '2026-11-01').weeklyGoal, null);
  assert.equal(T.makeHabit('x', { trackTime: false }, '2026-11-01').trackTime, false);
  assert.equal(T.makeHabit('a'.repeat(100), {}, '2026-11-01').name.length, 60);
  assert.equal(T.makeHabit('   ', {}, '2026-11-01'), null);
  assert.equal(T.normalizeHabit(null), null);
  assert.equal(T.normalizeHabit({ id: 'h', name: 'x' }), null);
  assert.equal(T.normalizeHabit({ id: 'h', name: 'x', createdDate: '2026-13-40' }), null);
});
test('a habit logs at most once per day; logging again updates it', () => {
  const l = [];
  const a = T.logHabit(l, 'h1', '2026-11-09', { part: 'evening' }, 10);
  const b = T.logHabit(l, 'h1', '2026-11-09', { part: 'morning', note: 'Legs' }, 20);
  assert.equal(l.length, 1); assert.equal(a, b);
  assert.deepEqual([l[0].part, l[0].note, l[0].at], ['morning', 'Legs', 20]);
  T.logHabit(l, 'h1', '2026-11-09', { part: null }, 30); assert.equal(l[0].part, null); assert.equal(l[0].note, 'Legs');
  T.logHabit(l, 'h2', '2026-11-09', {}, 1); T.logHabit(l, 'h1', '2026-11-10', {}, 1);
  assert.equal(l.length, 3);
  assert.equal(T.unlogHabit(l, 'h1', '2026-11-09').habitId, 'h1');
  assert.equal(T.unlogHabit(l, 'h1', '2026-11-09'), null);
  assert.equal(l.length, 2);
});
test('an invalid time of day or date is rejected', () => {
  const l = [];
  assert.equal(T.logHabit(l, 'h1', '2026-11-09', { part: 'midnight' }, 1).part, null);
  assert.equal(T.logHabit(l, 'h1', 'not-a-date', {}, 1), null);
  assert.equal(l.length, 1);
});
test('week dots: seven days ending today, across a month and a year boundary', () => {
  const l = [{ habitId: 'h', date: '2025-12-31', part: null, note: '', at: 1 }, { habitId: 'h', date: '2026-01-02', part: null, note: '', at: 1 }, { habitId: 'other', date: '2026-01-01', part: null, note: '', at: 1 }];
  const dots = T.weekDots('h', l, '2026-01-02');
  assert.deepEqual(dots.map((d) => d.date), ['2025-12-27', '2025-12-28', '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
  assert.deepEqual(dots.map((d) => d.done), [false, false, false, false, true, false, true]);
  assert.deepEqual(dots.map((d) => d.today), [false, false, false, false, false, false, true]);
});

// ---------- habit stats ----------
test('stats: days this month out of days elapsed; a habit created mid-month counts from then', () => {
  const full = habit({ createdDate: '2026-10-01' });
  assert.deepEqual(T.habitStats(full, logs(full.id, [[2], [3], [4], [6], [7], [9]]), '2026-11-09').month, { done: 6, elapsed: 9 });
  const late = habit({ createdDate: '2026-11-05' });
  assert.deepEqual(T.habitStats(late, logs(late.id, [[6], [7], [9]]), '2026-11-09').month, { done: 3, elapsed: 5 });
  assert.deepEqual(T.habitStats(late, [], '2026-11-09').month, { done: 0, elapsed: 5 });
  const other = habit({ id: 'x' });
  assert.equal(T.habitStats(other, logs('someone-else', [[2], [3]]), '2026-11-09').month.done, 0);
});
test('stats: this week runs Monday to Sunday, next to the goal', () => {
  const h = habit({ weeklyGoal: 4, createdDate: '2026-10-01' }); // 2026-11-09 is a Monday
  const l = logs(h.id, [[2], [3], [4], [6], [7], [9]]);
  assert.deepEqual(T.habitStats(h, l, '2026-11-09').week, { done: 1, goal: 4, start: '2026-11-09', end: '2026-11-15' });
  assert.deepEqual(T.habitStats(h, l, '2026-11-08').week, { done: 5, goal: 4, start: '2026-11-02', end: '2026-11-08' }); // Sunday
  assert.equal(T.habitStats(habit({ createdDate: '2026-10-01' }), l, '2026-11-08').week.goal, null);
});
test('stats: usual time of day, "mixed" on a tie, hidden when not tracked or not recorded', () => {
  const h = habit({ createdDate: '2026-10-01' });
  assert.deepEqual(T.habitStats(h, logs(h.id, [[2, 'evening'], [3, 'evening'], [4, 'morning'], [6, 'evening']]), '2026-11-09').usualPart, { part: 'evening', count: 3, of: 4 });
  assert.deepEqual(T.habitStats(h, logs(h.id, [[2, 'evening'], [4, 'morning']]), '2026-11-09').usualPart, { part: 'mixed', count: 1, of: 2 });
  assert.equal(T.habitStats(h, logs(h.id, [[2], [3]]), '2026-11-09').usualPart, null);
  assert.equal(T.habitStats(habit({ trackTime: false, createdDate: '2026-10-01' }), logs(h.id, [[2, 'evening']]).map((x) => Object.assign(x, { habitId: 'h-no' })), '2026-11-09').usualPart, null);
  const nt = habit({ trackTime: false, createdDate: '2026-11-01' });
  assert.equal(T.habitStats(nt, logs(nt.id, [[2, 'evening']]), '2026-11-09').usualPart, null);
});
test('stats: back the day after a miss', () => {
  const h = habit({ createdDate: '2026-11-01' });
  // missed 1, 5 and 8; each was followed by a logged day
  assert.deepEqual(T.habitStats(h, logs(h.id, [[2], [3], [4], [6], [7], [9]]), '2026-11-09').backAfterMiss, { back: 3, total: 3 });
  // missed 4 and 5 in a row: the first miss was followed by a miss
  assert.deepEqual(T.habitStats(h, logs(h.id, [[1], [2], [3], [6], [7], [8], [9]]), '2026-11-09').backAfterMiss, { back: 1, total: 2 });
});
test('stats: a miss whose next day has not finished yet is left out', () => {
  const h = habit({ createdDate: '2026-11-01' });
  const l = logs(h.id, [[1], [2], [3], [4], [5], [6], [7]]);
  assert.deepEqual(T.habitStats(h, l, '2026-11-09').backAfterMiss, { back: 0, total: 0 }); // missed 8; today (9) is not logged yet
  assert.deepEqual(T.habitStats(h, l.concat(logs(h.id, [[9]])), '2026-11-09').backAfterMiss, { back: 1, total: 1 }); // today logged: it counts
  assert.deepEqual(T.habitStats(h, [], '2026-11-01').backAfterMiss, { back: 0, total: 0 }); // created today
  assert.deepEqual(T.habitStats(h, logs(h.id, [[1], [2], [3]]), '2026-11-03').backAfterMiss, { back: 0, total: 0 }); // no misses
});

// ---------- merging a backup ----------
const sample = () => {
  const h = T.makeHabit('Gym', { weeklyGoal: 4 }, '2026-11-01', 1); h.id = 'h1';
  const m = mk('2026-11-09', 'breakfast', { protein: 3 }); m.id = 'm1';
  return { habits: [h], habitLogs: [{ habitId: 'h1', date: '2026-11-09', part: 'evening', note: '', at: 1 }], meals: [m] };
};
test('merge: adds new habits, check-ins and meals to a vault that has none of the keys', () => {
  const state = { entries: [], tasks: [] };
  assert.deepEqual(T.mergeTracking(state, sample()), { habits: 1, logs: 1, meals: 1 });
  assert.equal(state.habits.length, 1); assert.equal(state.habitLogs.length, 1); assert.equal(state.meals.length, 1);
});
test('merge: the same backup twice adds nothing the second time', () => {
  const state = {}; const s = sample();
  T.mergeTracking(state, s);
  assert.deepEqual(T.mergeTracking(state, JSON.parse(JSON.stringify(s))), { habits: 0, logs: 0, meals: 0 });
  assert.equal(state.habits.length, 1); assert.equal(state.habitLogs.length, 1); assert.equal(state.meals.length, 1);
});
test('merge: what is already there wins', () => {
  const state = sample(); state.habits[0].name = 'Gym (mine)'; state.habitLogs[0].part = 'morning'; state.meals[0].note = 'mine';
  const s = sample(); s.habits[0].name = 'Gym (backup)'; s.habitLogs[0].part = 'evening'; s.meals[0].note = 'backup';
  assert.deepEqual(T.mergeTracking(state, s), { habits: 0, logs: 0, meals: 0 });
  assert.deepEqual([state.habits[0].name, state.habitLogs[0].part, state.meals[0].note], ['Gym (mine)', 'morning', 'mine']);
});
test('merge: a different meal in an occupied slot is not added (one per slot per day)', () => {
  const state = sample(); const s = sample(); s.meals[0].id = 'other-id';
  assert.equal(T.mergeTracking(state, s).meals, 0);
  assert.equal(state.meals.length, 1);
});
test('merge: junk is skipped, orphan check-ins are dropped, and nothing throws', () => {
  const state = {};
  const added = T.mergeTracking(state, {
    habits: [null, 'x', { id: 'ok', name: 'Walk', createdDate: '2026-11-01' }, { id: 'bad', name: '   ', createdDate: '2026-11-01' }],
    habitLogs: [{ habitId: 'ok', date: '2026-11-02' }, { habitId: 'ghost', date: '2026-11-02' }, { habitId: 'ok', date: 'nope' }, null],
    meals: [{ id: 'a', date: '2026-11-02', slot: 'lunch', levels: { veg: 2 } }, { id: 'b', date: '2026-11-02', slot: 'lunch', levels: {} }, 42]
  });
  assert.deepEqual(added, { habits: 1, logs: 1, meals: 1 });
  assert.equal(T.mergeTracking({}, undefined).habits, 0);
  assert.equal(T.mergeTracking({}, { habits: 'nope', habitLogs: {}, meals: 7 }).meals, 0);
});

// ---------- managing habits ----------
const named = (name, order, over) => Object.assign(T.makeHabit(name, { order }, '2026-11-01', 1), over || {});

test('habits are listed in order, archived ones separately', () => {
  const a = named('A', 2), b = named('B', 0), c = named('C', 1, { archivedAt: 50 }), d = named('D', 3, { archivedAt: 90 });
  const all = [a, b, c, d];
  assert.deepEqual(T.activeHabits(all).map((h) => h.name), ['B', 'A']);
  assert.deepEqual(T.archivedHabits(all).map((h) => h.name), ['D', 'C']); // most recently archived first
  assert.equal(T.nextOrder(all), 4);
  assert.equal(T.nextOrder([]), 0);
});
test('habits with the same order keep a stable order', () => {
  const a = named('A', 0, { createdAt: 5, id: 'a' }), b = named('B', 0, { createdAt: 5, id: 'b' }), c = named('C', 0, { createdAt: 1, id: 'c' });
  assert.deepEqual(T.activeHabits([b, a, c]).map((h) => h.name), ['C', 'A', 'B']);
});
test('updateHabit: rename, time tracking and goal; an empty name changes nothing', () => {
  const h = named('Gym', 0);
  assert.equal(T.updateHabit(h, { name: '  Strength  ', trackTime: false, weeklyGoal: 3 }), h);
  assert.deepEqual([h.name, h.trackTime, h.weeklyGoal], ['Strength', false, 3]);
  assert.equal(T.updateHabit(h, { name: '   ', weeklyGoal: 5 }), null);
  assert.deepEqual([h.name, h.weeklyGoal], ['Strength', 3]);
  T.updateHabit(h, { weeklyGoal: null }); assert.equal(h.weeklyGoal, null);
  T.updateHabit(h, { weeklyGoal: 9 }); assert.equal(h.weeklyGoal, null);
  T.updateHabit(h, { name: 'x'.repeat(90) }); assert.equal(h.name.length, 60);
  T.updateHabit(h, {}); assert.equal(h.name.length, 60);
});
test('reorderHabit: moves among active habits, renumbers, stops at the ends', () => {
  const a = named('A', 0), b = named('B', 1), c = named('C', 2), x = named('X', 1, { archivedAt: 9 });
  const all = [a, b, c, x];
  assert.equal(T.reorderHabit(all, b.id, -1), true);
  assert.deepEqual(T.activeHabits(all).map((h) => h.name), ['B', 'A', 'C']);
  assert.deepEqual(T.activeHabits(all).map((h) => h.order), [0, 1, 2]);
  assert.equal(T.reorderHabit(all, b.id, -1), false);     // already first
  assert.equal(T.reorderHabit(all, c.id, 1), false);      // already last
  assert.equal(T.reorderHabit(all, x.id, -1), false);     // archived habits are not reordered
  assert.equal(T.reorderHabit(all, 'nope', 1), false);
  assert.equal(T.reorderHabit(all, a.id, 1), true);
  assert.deepEqual(T.activeHabits(all).map((h) => h.name), ['B', 'C', 'A']);
});
test('archive keeps check-ins; unarchive puts the habit last', () => {
  const a = named('A', 0), b = named('B', 1), state = { habits: [a, b], habitLogs: logs(a.id, [[2], [3]]) };
  T.archiveHabit(a, 77);
  assert.equal(a.archivedAt, 77); assert.equal(state.habitLogs.length, 2);
  assert.deepEqual(T.activeHabits(state.habits).map((h) => h.name), ['B']);
  T.unarchiveHabit(state.habits, a);
  assert.equal(a.archivedAt, null);
  assert.deepEqual(T.activeHabits(state.habits).map((h) => h.name), ['B', 'A']);
});
test('delete removes the habit and only its check-ins, and can be undone', () => {
  const a = named('A', 0), b = named('B', 1);
  const state = { habits: [a, b], habitLogs: [...logs(a.id, [[2], [3]]), ...logs(b.id, [[2]])] };
  const snap = T.deleteHabit(state, a.id);
  assert.deepEqual(state.habits.map((h) => h.name), ['B']);
  assert.equal(state.habitLogs.length, 1); assert.equal(state.habitLogs[0].habitId, b.id);
  assert.equal(snap.logs.length, 2); assert.equal(snap.index, 0);
  assert.equal(T.deleteHabit(state, 'nope'), null);
  T.restoreHabit(state, snap);
  assert.deepEqual(state.habits.map((h) => h.name), ['A', 'B']);
  assert.equal(state.habitLogs.length, 3);
  T.restoreHabit({ habits: [], habitLogs: [] }, snap); // restoring into an empty vault does not throw
});
