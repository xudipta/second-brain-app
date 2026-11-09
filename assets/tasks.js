/* Daily to-dos with automatic carry-over. Pure functions: no DOM, no storage, "today" is always passed in.

   A task:  { id, title, note, createdAt, createdDate, plan0, plan, snoozes, done, doneDate, dropped, droppedDate }
     plan0    the day it was first meant for; it never changes except while the task has not appeared yet
     plan     the day it is meant for now ("Do today" or "Move to a date" change this)
     snoozes  [{from, to}] stretches of days when the owner deliberately put it off, so history does not count them as carried

   Carry-over is not stored. An open task whose plan is before today simply shows up as "carried over", and the
   history of any past day is worked out from these fields, so nothing has to run at midnight and it works offline. */
(function () {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return dateStr(d); };
  const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 86400000); // whole days; rounding absorbs daylight-saving shifts
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const finishedOn = (t) => t.doneDate || t.droppedDate || null;
  const isOpen = (t) => !t.done && !t.dropped;
  const snoozedOn = (t, d) => (t.snoozes || []).some((s) => s.from <= d && d < s.to);
  // Was the task on the owner's list during day d (at any point)?
  const listedOn = (t, d) => d >= t.plan0 && !snoozedOn(t, d) && !(finishedOn(t) && finishedOn(t) < d);
  // Was it still unfinished when day d ended?
  const openAtEnd = (t, d) => listedOn(t, d) && !(finishedOn(t) && finishedOn(t) <= d);

  const T = { dateStr, parse, addDays, diffDays, isOpen, listedOn, openAtEnd };

  T.make = (title, plan, today, now) => ({
    id: uid(), title: title.trim(), note: '', createdAt: now || Date.now(), createdDate: today,
    plan0: plan, plan, snoozes: [], done: null, doneDate: null, dropped: null, droppedDate: null
  });

  // Fill in anything missing from a task that came from a backup, and drop what is unusable.
  T.normalize = (raw) => {
    if (!raw || typeof raw.id !== 'string' || typeof raw.title !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.plan0 || raw.plan || '')) return null;
    const plan0 = raw.plan0 || raw.plan;
    return {
      id: raw.id, title: raw.title.slice(0, 300), note: typeof raw.note === 'string' ? raw.note.slice(0, 2000) : '',
      createdAt: raw.createdAt || 0, createdDate: raw.createdDate || plan0, plan0, plan: raw.plan || plan0,
      snoozes: Array.isArray(raw.snoozes) ? raw.snoozes.filter((s) => s && s.from && s.to) : [],
      done: raw.done || null, doneDate: raw.done ? raw.doneDate || plan0 : null, dropped: raw.dropped || null, droppedDate: raw.dropped ? raw.droppedDate || plan0 : null
    };
  };

  // ---- changes (each mutates the task and returns it) ----
  T.complete = (t, today, now) => { t.done = now || Date.now(); t.doneDate = today; t.dropped = null; t.droppedDate = null; return t; };
  T.reopen = (t) => { t.done = null; t.doneDate = null; return t; };
  T.drop = (t, today, now) => { t.dropped = now || Date.now(); t.droppedDate = today; t.done = null; t.doneDate = null; return t; };
  T.restore = (t) => { t.dropped = null; t.droppedDate = null; return t; };
  T.doToday = (t, today) => {
    if (t.plan0 > today) t.plan0 = today;                       // had not appeared yet: it simply starts today
    t.snoozes = (t.snoozes || []).map((s) => (s.to > today ? { from: s.from, to: today } : s)).filter((s) => s.from < s.to);
    t.plan = today; return t;
  };
  T.moveTo = (t, date, today) => {                              // date must be after today
    if (t.plan0 > today) t.plan0 = date;                        // had not appeared yet: it simply starts later
    else (t.snoozes = t.snoozes || []).push({ from: today, to: date });
    t.plan = date; return t;
  };

  // ---- what the Today screen shows ----
  const byCreated = (a, b) => a.createdAt - b.createdAt;
  T.today = (tasks, today) => {
    const open = tasks.filter(isOpen);
    return {
      carried: open.filter((t) => t.plan < today).sort((a, b) => (a.plan0 === b.plan0 ? byCreated(a, b) : a.plan0 < b.plan0 ? -1 : 1)),
      planned: open.filter((t) => t.plan === today).sort(byCreated),
      later: open.filter((t) => t.plan > today).sort((a, b) => (a.plan === b.plan ? byCreated(a, b) : a.plan < b.plan ? -1 : 1)),
      done: tasks.filter((t) => t.done && t.doneDate === today).sort((a, b) => a.done - b.done)
    };
  };
  T.carriedDays = (t, today) => Math.max(0, diffDays(today, t.plan0));

  // ---- history of one day, worked out from the fields above ----
  T.day = (tasks, d) => {
    const done = tasks.filter((t) => t.done && t.doneDate === d).sort((a, b) => a.done - b.done);
    const dropped = tasks.filter((t) => t.dropped && t.droppedDate === d);
    const left = tasks.filter((t) => openAtEnd(t, d)).sort((a, b) => (a.plan0 === b.plan0 ? byCreated(a, b) : a.plan0 < b.plan0 ? -1 : 1));
    const added = tasks.filter((t) => t.createdDate === d);
    const total = done.length + left.length;
    return { date: d, done, dropped, left, added, total, rate: total ? done.length / total : null };
  };

  T.firstDay = (tasks) => tasks.reduce((m, t) => { const x = t.createdDate < t.plan0 ? t.createdDate : t.plan0; return !m || x < m ? x : m; }, null);

  // Days from `from` to `to` inclusive, newest first.
  T.days = (from, to) => { const out = []; for (let d = to; d >= from; d = addDays(d, -1)) out.push(d); return out; };

  // Summary over a run of days.
  T.range = (tasks, days, today) => {
    const per = days.map((d) => T.day(tasks, d));
    const listed = new Set(), finished = new Set();
    tasks.forEach((t) => { days.forEach((d) => { if (listedOn(t, d)) listed.add(t.id); }); if (t.done && days.includes(t.doneDate)) { listed.add(t.id); finished.add(t.id); } });
    const open = tasks.filter((t) => isOpen(t) && t.plan <= today);
    const oldest = open.reduce((m, t) => (!m || t.plan0 < m.plan0 ? t : m), null);
    return {
      per, done: finished.size, listed: listed.size, rate: listed.size ? finished.size / listed.size : null,
      activeDays: per.filter((p) => p.done.length > 0).length, oldest, oldestDays: oldest ? T.carriedDays(oldest, today) : 0
    };
  };

  // Markdown for one day's to-dos, for the zip export. Only the owner's own words, plus fixed headings.
  T.dayMarkdown = (tasks, d) => {
    const p = T.day(tasks, d);
    const item = (mark, t) => `- [${mark}] ${t.title}${t.plan0 < d ? ` (carried from ${t.plan0})` : ''}` + (t.note ? '\n' + t.note.split('\n').map((l) => '  ' + l).join('\n') : '');
    const sec = (head, lines) => (lines.length ? `## ${head}\n${lines.join('\n')}\n` : '');
    const body = [sec('Done', p.done.map((t) => item('x', t))), sec('Left over', p.left.map((t) => item(' ', t))), sec('Dropped', p.dropped.map((t) => item('-', t)))].filter(Boolean).join('\n');
    return body ? `---\ndate: ${d}\ntype: todos\n---\n\n${body}` : '';
  };

  window.Tasks = T;
  if (typeof module !== 'undefined') module.exports = T;
})();
