/* Habits and meals. Pure functions: no DOM, no storage, "today" and "now" are always passed in.
   The rules here are the contract described in docs/habits-and-meals/PLAN.md ("Rules") and are checked by tests/tracking.test.js.

   habit     { id, name, createdDate, createdAt, trackTime, weeklyGoal, archivedAt, order }
   check-in  { habitId, date, part, note, at }                 at most one per habit per day (the habit was done that day)
   meal      { id, date, slot, skipped, levels, note, at }      at most one per slot per day
     levels  { protein, veg, carbs, other }, each 0 none, 1 some, 2 half, 3 most (relative to the plate)

   Portions are rough, user-chosen shares, not nutrition facts. Notes are kept exactly as typed. */
(function () {
  'use strict';
  const PARTS = ['morning', 'afternoon', 'evening'];
  const SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'];
  const GROUPS = ['protein', 'veg', 'carbs', 'other'];
  const LEVEL_WORDS = ['None', 'Some', 'Half', 'Most'];

  // ---- dates (local calendar days as YYYY-MM-DD) ----
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return dateStr(d); };
  const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 86400000); // whole days; rounding absorbs daylight-saving shifts
  const validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dateStr(parse(s)) === s; // rejects 2026-02-30
  const mondayOf = (s) => addDays(s, -((parse(s).getDay() + 6) % 7));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const sum = (a) => a.reduce((x, y) => x + y, 0);

  const T = { PARTS, SLOTS, GROUPS, LEVEL_WORDS, dateStr, parse, addDays, diffDays, validDate, mondayOf };

  // ---- time of day ----
  // Local time: before 12:00 morning, 12:00 to 16:59 afternoon, 17:00 onward evening.
  T.partOfDay = (d) => { const h = d.getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; };

  // ---- habits ----
  const goalOf = (g) => (Number.isInteger(g) && g >= 1 && g <= 7 ? g : null);

  T.normalizeHabit = (raw) => {
    if (!raw || typeof raw.id !== 'string' || !raw.id || typeof raw.name !== 'string') return null;
    const name = raw.name.trim().slice(0, 60);
    if (!name) return null;
    const createdDate = validDate(raw.createdDate) ? raw.createdDate : typeof raw.createdAt === 'number' ? dateStr(new Date(raw.createdAt)) : null;
    if (!createdDate) return null;
    return {
      id: raw.id, name, createdDate, createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
      trackTime: raw.trackTime !== false, weeklyGoal: goalOf(raw.weeklyGoal),
      archivedAt: typeof raw.archivedAt === 'number' ? raw.archivedAt : null, order: Number.isFinite(raw.order) ? raw.order : 0
    };
  };

  T.makeHabit = (name, opts, today, now) => {
    const o = opts || {};
    return T.normalizeHabit({ id: uid(), name, createdDate: today, createdAt: now || Date.now(), trackTime: o.trackTime !== false, weeklyGoal: o.weeklyGoal, archivedAt: null, order: o.order || 0 });
  };

  // ---- check-ins ----
  T.normalizeLog = (raw) => {
    if (!raw || typeof raw.habitId !== 'string' || !raw.habitId || !validDate(raw.date)) return null;
    return {
      habitId: raw.habitId, date: raw.date, part: PARTS.includes(raw.part) ? raw.part : null,
      note: typeof raw.note === 'string' ? raw.note.slice(0, 1000) : '', at: typeof raw.at === 'number' ? raw.at : 0
    };
  };
  T.findLog = (logs, habitId, date) => logs.find((l) => l.habitId === habitId && l.date === date) || null;

  // Log a day, or update the existing log for it (so there is never more than one). opts: { part, note }.
  T.logHabit = (logs, habitId, date, opts, now) => {
    const o = opts || {}, hit = T.findLog(logs, habitId, date);
    if (hit) {
      if ('part' in o) hit.part = PARTS.includes(o.part) ? o.part : null;
      if ('note' in o) hit.note = typeof o.note === 'string' ? o.note.slice(0, 1000) : '';
      hit.at = now || Date.now();
      return hit;
    }
    const log = T.normalizeLog({ habitId, date, part: o.part, note: o.note, at: now || Date.now() });
    if (!log) return null;
    logs.push(log);
    return log;
  };
  T.unlogHabit = (logs, habitId, date) => {
    const i = logs.findIndex((l) => l.habitId === habitId && l.date === date);
    return i < 0 ? null : logs.splice(i, 1)[0];
  };

  // The last seven days ending today, oldest first.
  T.weekDots = (habitId, logs, today) => {
    const out = [];
    for (let i = 6; i >= 0; i--) { const d = addDays(today, -i); out.push({ date: d, done: !!T.findLog(logs, habitId, d), today: i === 0 }); }
    return out;
  };

  // ---- meals ----
  const level = (n) => { n = Math.round(Number(n)); return n >= 3 ? 3 : n >= 1 ? n : 0; }; // anything unusable (NaN, negative) becomes 0
  T.cleanLevels = (raw) => { const o = {}; GROUPS.forEach((g) => { o[g] = level(raw && raw[g]); }); return o; };
  const total = (levels) => sum(GROUPS.map((g) => levels[g]));

  // A meal needs at least one group above zero unless it is skipped. Returns null when it cannot be saved.
  T.normalizeMeal = (raw) => {
    if (!raw || typeof raw.id !== 'string' || !raw.id || !validDate(raw.date) || !SLOTS.includes(raw.slot)) return null;
    const skipped = raw.skipped === true, levels = T.cleanLevels(raw.levels);
    if (!skipped && total(levels) === 0) return null;
    return { id: raw.id, date: raw.date, slot: raw.slot, skipped, levels: skipped ? T.cleanLevels(null) : levels, note: typeof raw.note === 'string' ? raw.note.slice(0, 200) : '', at: typeof raw.at === 'number' ? raw.at : 0 };
  };
  T.makeMeal = (input, now) => T.normalizeMeal({ id: uid(), date: input.date, slot: input.slot, skipped: input.skipped, levels: input.levels, note: input.note, at: now || Date.now() });
  T.findMeal = (meals, date, slot) => meals.find((m) => m.date === date && m.slot === slot) || null;

  // Save a meal in its slot, replacing the one already there (the slot keeps its id).
  T.setMeal = (meals, meal) => {
    const i = meals.findIndex((m) => m.date === meal.date && m.slot === meal.slot);
    if (i >= 0) { meal.id = meals[i].id; meals[i] = meal; } else meals.push(meal);
    return meal;
  };
  T.removeMeal = (meals, date, slot) => {
    const i = meals.findIndex((m) => m.date === date && m.slot === slot);
    return i < 0 ? null : meals.splice(i, 1)[0];
  };

  // ---- shares and averages ----
  // Whole-number percentages that always add to exactly 100 (largest remainder; ties go to the earlier item).
  T.roundTo100 = (weights) => {
    const t = sum(weights);
    if (!(t > 0)) return weights.map(() => 0);
    const raw = weights.map((w) => (w / t) * 100), whole = raw.map((r) => Math.floor(r + 1e-9));
    const order = raw.map((r, i) => ({ i, rem: Math.round((r - whole[i]) * 1e6) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
    const left = 100 - sum(whole);                  // fixed before handing out the extra points
    for (let k = 0; k < left; k++) whole[order[k].i]++;
    return whole;
  };
  const byGroup = (arr) => { const o = {}; GROUPS.forEach((g, i) => { o[g] = arr[i]; }); return o; };
  const fractions = (levels) => GROUPS.map((g) => levels[g] / total(levels));

  // One meal's split, in whole percentages, or null when nothing is above zero.
  T.mealShares = (levels) => { const l = T.cleanLevels(levels); return total(l) ? byGroup(T.roundTo100(GROUPS.map((g) => l[g]))) : null; };

  // The average split of a day's logged (not skipped) meals, before rounding.
  const dayAverage = (meals, date) => {
    const ms = meals.filter((m) => m.date === date && !m.skipped && total(m.levels) > 0);
    if (!ms.length) return null;
    const fr = ms.map((m) => fractions(m.levels));
    return { avg: GROUPS.map((g, i) => sum(fr.map((f) => f[i])) / ms.length), count: ms.length };
  };
  // Today's plate: the plain average of the day's logged meals. Skipped meals are left out. Null when there are none.
  T.dayPlate = (meals, date) => {
    const a = dayAverage(meals, date);
    return a ? { percent: byGroup(T.roundTo100(a.avg)), meals: a.count } : null;
  };
  // The average plate over several days: the mean of the daily averages for the days that have meals.
  // Days with no logged meals are not counted as zeros.
  T.rangePlate = (meals, days) => {
    const per = days.map((d) => dayAverage(meals, d)).filter(Boolean);
    if (!per.length) return null;
    return { percent: byGroup(T.roundTo100(GROUPS.map((g, i) => sum(per.map((p) => p.avg[i])) / per.length))), daysLogged: per.length };
  };

  // ---- habit stats (Review) ----
  // `today` is the current day. Nothing here is a streak.
  T.habitStats = (habit, logs, today) => {
    const mine = logs.filter((l) => l.habitId === habit.id), dates = new Set(mine.map((l) => l.date));
    const start = [habit.createdDate].concat([...dates]).sort()[0];   // a day logged before the habit's creation date still counts
    const monthStart = today.slice(0, 8) + '01', from = start > monthStart ? start : monthStart;
    const monthDone = mine.filter((l) => l.date >= from && l.date <= today).length;
    const mon = mondayOf(today);
    const weekDone = mine.filter((l) => l.date >= mon && l.date <= today).length;

    let usual = null;
    if (habit.trackTime) {
      const counts = {}; mine.forEach((l) => { if (l.part) counts[l.part] = (counts[l.part] || 0) + 1; });
      const of = sum(Object.values(counts)), top = Math.max(0, ...Object.values(counts));
      if (of) { const leaders = PARTS.filter((p) => counts[p] === top); usual = { part: leaders.length === 1 ? leaders[0] : 'mixed', count: top, of }; }
    }

    // Of the days missed since the habit started, how many were followed by a logged day.
    // A miss whose next day has not finished yet (today, not yet logged) is left out.
    let total = 0, back = 0;
    for (let d = start; d < today; d = addDays(d, 1)) {
      if (dates.has(d)) continue;
      const next = addDays(d, 1), nextDone = dates.has(next);
      if (next === today && !nextDone) continue;
      total++; if (nextDone) back++;
    }
    return {
      month: { done: monthDone, elapsed: from > today ? 0 : diffDays(today, from) + 1 },
      week: { done: weekDone, goal: habit.weeklyGoal, start: mon, end: addDays(mon, 6) },
      usualPart: usual,
      backAfterMiss: { back, total }
    };
  };

  // ---- backups: merge tracking data from a backup into the vault state ----
  // Habits and meals are matched by id, check-ins by habit and day, meals also by slot and day. What is already
  // there always wins, anything unusable is skipped, and a check-in whose habit is unknown is dropped.
  // Merging the same backup twice changes nothing the second time. Returns how many of each were added.
  T.mergeTracking = (state, incoming) => {
    const src = incoming || {}, added = { habits: 0, logs: 0, meals: 0 };
    const habits = state.habits = Array.isArray(state.habits) ? state.habits : [];
    const logs = state.habitLogs = Array.isArray(state.habitLogs) ? state.habitLogs : [];
    const meals = state.meals = Array.isArray(state.meals) ? state.meals : [];

    const hIds = new Set(habits.map((h) => h.id));
    (Array.isArray(src.habits) ? src.habits : []).forEach((raw) => { const h = T.normalizeHabit(raw); if (h && !hIds.has(h.id)) { habits.push(h); hIds.add(h.id); added.habits++; } });

    const lKeys = new Set(logs.map((l) => l.habitId + '|' + l.date));
    (Array.isArray(src.habitLogs) ? src.habitLogs : []).forEach((raw) => {
      const l = T.normalizeLog(raw); if (!l || !hIds.has(l.habitId)) return;
      const k = l.habitId + '|' + l.date; if (lKeys.has(k)) return;
      logs.push(l); lKeys.add(k); added.logs++;
    });

    const mIds = new Set(meals.map((m) => m.id)), mSlots = new Set(meals.map((m) => m.date + '|' + m.slot));
    (Array.isArray(src.meals) ? src.meals : []).forEach((raw) => {
      const m = T.normalizeMeal(raw); if (!m || mIds.has(m.id)) return;
      const k = m.date + '|' + m.slot; if (mSlots.has(k)) return;
      meals.push(m); mIds.add(m.id); mSlots.add(k); added.meals++;
    });
    return added;
  };

  if (typeof window !== 'undefined') window.Tracking = T;
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})();
