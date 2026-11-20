// Unit tests for assets/tasks.js (daily to-dos with carry-over). Run with: node tests/run.js
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../assets/tasks.js');

const mk = (title, plan, created, at) => { const t = T.make(title, plan, created || plan, at); t.id = title; return t; };
const ids = (list) => list.map((t) => t.id);

test('the module has no DOM or storage dependency (it loads in plain node)', () => {
  assert.equal(typeof window, 'undefined');
  assert.ok(T.today);
});

test('dates: addDays across a month and a year, diffDays across a clock change', () => {
  assert.equal(T.addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(T.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(T.diffDays('2026-03-30', '2026-03-28'), 2);
});

test('carry-over: an open task from an earlier day is carried over, today and later tasks are not', () => {
  const a = mk('A', '2026-11-05', '2026-11-05', 1), b = mk('B', '2026-11-09', '2026-11-09', 2), c = mk('C', '2026-11-10', '2026-11-09', 3), d = mk('D', '2026-11-04', '2026-11-04', 0);
  T.complete(d, '2026-11-04', 10);
  const v = T.today([a, b, c, d], '2026-11-09');
  assert.deepEqual(ids(v.carried), ['A']);
  assert.deepEqual(ids(v.planned), ['B']);
  assert.deepEqual(ids(v.later), ['C']);
  assert.deepEqual(ids(v.done), [], 'a task finished on an earlier day is not in today\'s done list');
  assert.equal(T.carriedDays(a, '2026-11-09'), 4);
  assert.deepEqual(ids(T.today([a, b, c, d], '2026-11-10').carried), ['A', 'B'], 'unfinished tasks keep carrying forward');
});

test('carry-over: completing a carried task credits today; reopening puts it back', () => {
  const a = mk('A', '2026-11-05', '2026-11-05', 1);
  T.complete(a, '2026-11-09', 20);
  const v = T.today([a], '2026-11-09');
  assert.deepEqual([v.carried.length, ids(v.done)], [0, ['A']]);
  T.reopen(a);
  assert.equal(T.today([a], '2026-11-09').carried.length, 1);
});

test('do today and move to a date', () => {
  const e = mk('E', '2026-11-05', '2026-11-05', 5);
  T.doToday(e, '2026-11-09');
  assert.deepEqual([T.today([e], '2026-11-09').planned.length, T.today([e], '2026-11-09').carried.length], [1, 0]);
  assert.equal(T.carriedDays(e, '2026-11-09'), 4, 'the age is still known after Do today');
  T.moveTo(e, '2026-11-12', '2026-11-09');
  assert.equal(T.today([e], '2026-11-09').later.length, 1);
  assert.equal(T.today([e], '2026-11-12').planned.length, 1);
  const f = mk('F', '2026-11-10', '2026-11-09', 6);
  T.moveTo(f, '2026-11-14', '2026-11-09');
  assert.deepEqual([f.plan0, f.snoozes.length], ['2026-11-14', 0], 'a task that has not appeared yet just starts later');
  const g = mk('G', '2026-11-12', '2026-11-09', 7);
  T.doToday(g, '2026-11-09');
  assert.deepEqual([g.plan0, g.plan], ['2026-11-09', '2026-11-09'], 'Do today on a future task starts it today');
});

test('drop and restore', () => {
  const h = mk('H', '2026-11-06', '2026-11-06', 8);
  T.drop(h, '2026-11-09', 30);
  assert.equal(T.today([h], '2026-11-09').carried.length, 0);
  T.restore(h);
  assert.equal(T.today([h], '2026-11-09').carried.length, 1);
});

test('history is rebuilt from the task\'s own dates', () => {
  const m = mk('M', '2026-11-02', '2026-11-02', 1);
  T.complete(m, '2026-11-05', 99);
  const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
  assert.deepEqual(days.map((x) => T.day([m], x).left.length), [1, 1, 1, 0, 0], 'left over Monday to Wednesday, finished Thursday');
  assert.deepEqual(days.map((x) => T.day([m], x).done.length), [0, 0, 0, 1, 0]);
  assert.equal(T.day([m], '2026-11-05').rate, 1);
  assert.equal(T.day([m], '2026-11-03').rate, 0);
  assert.equal(T.day([], '2026-11-03').rate, null, 'an empty day has no rate');
});

test('a task put off on purpose is not counted as left over on the days in between', () => {
  const n = mk('N', '2026-11-02', '2026-11-02', 1);
  T.moveTo(n, '2026-11-05', '2026-11-03');
  const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
  assert.deepEqual(days.map((x) => T.day([n], x).left.length), [1, 0, 0, 1, 1]);
});

test('added counts by creation day; range summary', () => {
  const m = mk('M', '2026-11-02', '2026-11-02', 1), n = mk('N', '2026-11-02', '2026-11-02', 1);
  T.complete(m, '2026-11-05', 99); T.moveTo(n, '2026-11-05', '2026-11-03');
  const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
  assert.equal(T.day([m, n], '2026-11-02').added.length, 2);
  const r = T.range([m, n], days, '2026-11-06');
  assert.deepEqual([r.done, r.activeDays], [1, 1]);
  assert.ok(r.oldestDays >= 0);
});

test('normalize fills in what a backup lacks and rejects junk', () => {
  assert.equal(T.normalize({ id: 'x', title: 'T', plan: '2026-11-09' }).plan0, '2026-11-09');
  assert.equal(T.normalize({ id: 'x' }), null);
  assert.equal(T.normalize(null), null);
});

test('the markdown for a day lists done tasks with where they came from; an empty day has none', () => {
  const m = mk('M', '2026-11-02', '2026-11-02', 1);
  T.complete(m, '2026-11-05', 99);
  const md = T.dayMarkdown([m], '2026-11-05');
  assert.ok(md.includes('- [x] M (carried from 2026-11-02)'));
  assert.ok(md.startsWith('---\ndate: 2026-11-05\ntype: todos'));
  assert.equal(T.dayMarkdown([], '2026-11-05'), '');
});
