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

  // ---- managing habits ----
  const byOrder = (a, b) => a.order - b.order || a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1);
  T.activeHabits = (habits) => habits.filter((h) => !h.archivedAt).sort(byOrder);
  T.archivedHabits = (habits) => habits.filter((h) => h.archivedAt).sort((a, b) => b.archivedAt - a.archivedAt || byOrder(a, b));
  T.nextOrder = (habits) => (habits.length ? Math.max(...habits.map((h) => h.order)) + 1 : 0);

  // Change a habit's name, time-of-day tracking or weekly goal. An empty name is refused (returns null, nothing changes).
  T.updateHabit = (habit, patch) => {
    const p = patch || {}, name = 'name' in p ? String(p.name).trim().slice(0, 60) : habit.name;
    if (!name) return null;
    // The start date may be moved, to any real day up to today (a habit you began before you installed the app). Check-ins
    // from before the new date still count, because habitStart looks at them too.
    if ('createdDate' in p && (!validDate(p.createdDate) || (p.today && p.createdDate > p.today))) return null;
    habit.name = name;
    if ('createdDate' in p) habit.createdDate = p.createdDate;
    if ('trackTime' in p) habit.trackTime = p.trackTime !== false;
    if ('weeklyGoal' in p) habit.weeklyGoal = goalOf(p.weeklyGoal);
    return habit;
  };
  // Move an active habit up (-1) or down (+1) among the active ones. Returns false at either end.
  T.reorderHabit = (habits, id, delta) => {
    const list = T.activeHabits(habits), i = list.findIndex((h) => h.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return false;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((h, k) => { h.order = k; });
    return true;
  };
  // Archiving keeps every check-in; the habit just leaves Today and the picker. Unarchiving puts it last.
  T.archiveHabit = (habit, now) => { habit.archivedAt = now || Date.now(); return habit; };
  T.unarchiveHabit = (habits, habit) => { habit.archivedAt = null; habit.order = T.nextOrder(habits.filter((h) => h !== habit)); return habit; };
  // Delete a habit and its check-ins. Returns what is needed to undo it.
  T.deleteHabit = (state, id) => {
    const habits = state.habits || [], i = habits.findIndex((h) => h.id === id);
    if (i < 0) return null;
    const habit = habits.splice(i, 1)[0], logs = state.habitLogs || [], removed = [];
    for (let k = logs.length - 1; k >= 0; k--) if (logs[k].habitId === id) removed.unshift(logs.splice(k, 1)[0]);
    return { habit, index: i, logs: removed };
  };
  T.restoreHabit = (state, snap) => {
    const habits = state.habits = state.habits || [], logs = state.habitLogs = state.habitLogs || [];
    habits.splice(Math.min(snap.index, habits.length), 0, snap.habit);
    snap.logs.forEach((l) => { if (!T.findLog(logs, l.habitId, l.date)) logs.push(l); });
    return snap.habit;
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

  // ---- meal helpers for the screens ----
  const GROUP_LABEL = { protein: 'Protein', veg: 'Veg', carbs: 'Carbs', other: 'Other' };
  T.GROUP_LABEL = GROUP_LABEL;
  // One tap on a portion tile: None, Some, Half, Most, then back to None.
  T.cycleLevel = (n) => (level(n) + 1) % 4;
  // "Protein 48%, Veg 17%, Carbs 35%": the groups above zero, in the fixed order. Used on screen and for screen readers.
  T.shareText = (percent) => GROUPS.filter((g) => percent && percent[g] > 0).map((g) => `${GROUP_LABEL[g]} ${percent[g]}%`).join(', ');
  // A short name for a meal on a chip: its note as typed (first line), or the groups it contains.
  T.mealLabel = (meal) => {
    const first = String(meal.note || '').split('\n')[0].trim();
    return first || GROUPS.filter((g) => meal.levels[g] > 0).map((g) => GROUP_LABEL[g]).join(', ');
  };
  // The most recent distinct meals (same note and same portions), newest first, for the "recent" chips. Skipped meals are left out.
  T.recentMeals = (meals, limit) => {
    const seen = new Set(), out = [];
    meals.filter((m) => !m.skipped && total(m.levels) > 0).sort((a, b) => b.at - a.at || (a.date < b.date ? 1 : -1)).forEach((m) => {
      const key = m.note + '|' + GROUPS.map((g) => m.levels[g]).join(',');
      if (!seen.has(key) && out.length < (limit || 6)) { seen.add(key); out.push({ note: m.note, levels: Object.assign({}, m.levels), slot: m.slot, date: m.date }); }
    });
    return out;
  };

  // ---- export: daily markdown files for the zip ----
  // Only the user's own words plus fixed headings. Check-in and meal notes are written exactly as typed.
  const SLOT_NAME = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };
  const PORTION_WORD = ['none', 'some', 'half', 'most'];
  const indent = (text) => text.split('\n').map((l) => '  ' + l).join('\n');

  // habits/YYYY/MM/YYYY-MM-DD.md: the habits done that day, in the habits' order (archived ones too). '' when there are none.
  // The time of day is added in brackets only for a habit that tracks it. A multi-line note is indented under its habit.
  T.habitsDayMarkdown = (habits, logs, date) => {
    const lines = [];
    habits.slice().sort(byOrder).forEach((hb) => {
      const log = T.findLog(logs, hb.id, date);
      if (!log) return;
      lines.push(`- [x] ${hb.name}${hb.trackTime && log.part ? ` (${log.part})` : ''}`);
      if (log.note.trim()) lines.push(indent(log.note));
    });
    return lines.length ? `---\ndate: ${date}\ntype: habits\n---\n\n## Done\n${lines.join('\n')}\n` : '';
  };

  // meals/YYYY/MM/YYYY-MM-DD.md: each slot that day with its portions (groups at None are left out), or "Skipped", then the note.
  T.mealsDayMarkdown = (meals, date) => {
    const blocks = [];
    SLOTS.forEach((slot) => {
      const m = T.findMeal(meals, date, slot);
      if (!m) return;
      const lines = [`## ${SLOT_NAME[slot]}`];
      lines.push(m.skipped ? 'Skipped' : GROUPS.filter((g) => m.levels[g] > 0).map((g) => `${GROUP_LABEL[g]}: ${PORTION_WORD[m.levels[g]]}`).join(', '));
      if (m.note.trim()) lines.push(m.note);
      blocks.push(lines.join('\n'));
    });
    return blocks.length ? `---\ndate: ${date}\ntype: meals\n---\n\n${blocks.join('\n\n')}\n` : '';
  };

  // The files to add to the zip, oldest day first, one per day that has anything, plus how many days of each.
  // Nothing is produced when there are no check-ins or meals.
  T.exportFiles = (state) => {
    const habits = state.habits || [], meals = state.meals || [], known = new Set(habits.map((h) => h.id));
    const logs = (state.habitLogs || []).filter((l) => known.has(l.habitId));
    const where = (kind, d) => `${kind}/${d.slice(0, 4)}/${d.slice(5, 7)}/${d}.md`, files = [];
    let habitDays = 0, mealDays = 0;
    [...new Set(logs.map((l) => l.date))].sort().forEach((d) => { const md = T.habitsDayMarkdown(habits, logs, d); if (md) { files.push({ name: where('habits', d), content: md }); habitDays++; } });
    [...new Set(meals.map((m) => m.date))].sort().forEach((d) => { const md = T.mealsDayMarkdown(meals, d); if (md) { files.push({ name: where('meals', d), content: md }); mealDays++; } });
    return { files, habitDays, mealDays };
  };

  // ---- Review: the diet panel ----
  // The notes of one day's meals in slot order, exactly as typed (empty ones are left out).
  T.dayNotes = (meals, date) => SLOTS.map((slot) => T.findMeal(meals, date, slot)).filter((m) => m && m.note.trim()).map((m) => m.note);
  // The days from `from` to `to` (inclusive) with at least one meal record, eaten or skipped, newest first.
  T.mealDays = (meals, from, to) => [...new Set(meals.filter((m) => m.date >= from && m.date <= to).map((m) => m.date))].sort().reverse();

  // ---- Review: the habit calendar ----
  // A habit "starts" on its creation date, or on an earlier day that was logged (a day logged before it was created still counts).
  T.habitStart = (habit, logs) => [habit.createdDate].concat(logs.filter((l) => l.habitId === habit.id).map((l) => l.date)).sort()[0];
  // Months are { y, m } with m from 0 to 11.
  T.ymOf = (date) => ({ y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)) - 1 });
  T.addMonths = (ym, n) => { const t = ym.y * 12 + ym.m + n; return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 }; };
  T.cmpMonths = (a, b) => a.y * 12 + a.m - (b.y * 12 + b.m);
  // The cells of a month calendar, Monday first: leading blanks, then each day as 'before' (the habit did not exist yet),
  // 'day' (a past day), 'today' or 'future'.
  T.monthCells = (ym, today, start) => {
    const first = `${ym.y}-${pad(ym.m + 1)}-01`, lead = (parse(first).getDay() + 6) % 7, days = new Date(ym.y, ym.m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push({ kind: 'pad' });
    for (let d = 1; d <= days; d++) {
      const date = `${ym.y}-${pad(ym.m + 1)}-${pad(d)}`;
      cells.push({ date, day: d, kind: date > today ? 'future' : date < start ? 'before' : date === today ? 'today' : 'day' });
    }
    return cells;
  };
  // How many logged days fell in each part of the day (only days that have one).
  T.partCounts = (habit, logs) => {
    const c = { morning: 0, afternoon: 0, evening: 0, total: 0 };
    logs.forEach((l) => { if (l.habitId === habit.id && PARTS.includes(l.part)) { c[l.part]++; c.total++; } });
    return c;
  };

  // ---- habit stats (Review) ----
  // `today` is the current day. Nothing here is a streak.
  T.habitStats = (habit, logs, today) => {
    const mine = logs.filter((l) => l.habitId === habit.id), dates = new Set(mine.map((l) => l.date));
    const start = T.habitStart(habit, logs);
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
