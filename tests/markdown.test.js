// A real markdown parser (markdown-it, a dev dependency) checks that a note cannot change the structure of an exported file.
// Without `npm install` the test is skipped, so `node tests/run.js` still needs nothing installed.
const test = require('node:test');
const assert = require('node:assert/strict');
let MD = null; try { MD = require('markdown-it'); } catch (e) { /* not installed */ }
const T = require('../assets/tracking.js');

const STRUCT = new Set(['heading_open', 'hr', 'bullet_list_open', 'ordered_list_open', 'list_item_open', 'blockquote_open', 'fence', 'table_open', 'html_block']);
const hostile = ['# Big heading', '## Lunch', '---', '===', '- [ ] a task', '- item', '* item', '+ plus', '1. one', '> quote', '```\ncode', '    code', '<div>x</div>', '<script>x</script>',
  'two\n# second line heading', 'a\n---', '[x]: http://e.com', '| a | b |\n|---|---|', 'first\n\n# after a blank line', 'first\n\n- [ ] after a blank line', '  - indented'];

test('a note can never add a heading, list, quote, rule, table or code fence to a meals or habits file', { skip: MD ? false : 'markdown-it is not installed (run npm install)' }, () => {
  const md = new MD();
  const structure = (src) => md.parse(src, {}).filter((t) => STRUCT.has(t.type)).map((t) => t.type + t.level).join(',');
  const day = '2026-11-09';
  const meals = (note) => [T.makeMeal({ date: day, slot: 'breakfast', levels: { protein: 3 }, note }, 1), T.makeMeal({ date: day, slot: 'lunch', skipped: true, note }, 1)];
  const gym = T.makeHabit('Gym', {}, '2026-11-01', 1); gym.id = 'g';
  const read = T.makeHabit('Read', {}, '2026-11-01', 2); read.id = 'r'; read.order = 1;
  const habits = (note) => { const l = []; T.logHabit(l, 'g', day, { part: 'evening', note }, 1); T.logHabit(l, 'r', day, { part: 'evening', note: 'x' }, 1); return T.habitsDayMarkdown([gym, read], l, day); };
  const plainMeals = structure(T.mealsDayMarkdown(meals('plain'), day)), plainHabits = structure(habits('plain'));
  assert.ok(plainMeals.includes('heading_open') && plainHabits.includes('list_item_open'), 'the parser sees the real structure of a file');
  hostile.forEach((note) => {
    assert.equal(structure(T.mealsDayMarkdown(meals(note), day)), plainMeals, 'meals file, note ' + JSON.stringify(note));
    assert.equal(structure(habits(note)), plainHabits, 'habits file, note ' + JSON.stringify(note));
  });
});
