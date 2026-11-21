# Tests

| What | Command | Needs |
|---|---|---|
| Unit tests (logic, rules, file formats, code checks) | `node tests/run.js` | Node 20 or later, nothing else |
| End-to-end (real browser, fixed clock) | `node tests/e2e/run.js` | `npm install` then `npx playwright install chromium` |

Run both before opening a pull request. GitHub Actions (`.github/workflows/tests.yml`) runs the unit tests on every pull request and on pushes to `main`; a failing test fails the check. The end-to-end suite is run locally.

Useful options for the end-to-end runner: `--verbose` (print every passing check) and `--grep=meals` (only files whose name contains the text).

## Layout

- `tracking.test.js`, `tasks.test.js`: the pure logic in `assets/tracking.js` and `assets/tasks.js`.
- `markdown.test.js`: with `npm install`, a real markdown parser checks that no note can change an exported file's structure (skipped without it).
- `syntax.test.js`: every script compiles, and the service worker caches every script the page loads.
- `e2e/*.e2e.js`: one flow per file, run against the real app served by `e2e/server.js`. The clock is fixed (`2026-11-09 10:00` in Asia/Kolkata), so results do not depend on the day the tests run.
- `fixtures/`: real backups written by the release before habits and meals existed (plain, encrypted with the passphrase `fixture passphrase`, and the oldest bare-list format). They prove old data still restores.

## Which test covers which rule

Rules are from [`docs/habits-and-meals/PLAN.md`](../docs/habits-and-meals/PLAN.md).

| Rule | Unit test (`tracking.test.js`) | End to end |
|---|---|---|
| Time of day from the clock (11:59, 12:00, 16:59, 17:00) | "time of day: boundaries" | `habits` (the stamped part) |
| Meal proportion, needs a portion unless skipped, skipped not averaged | "mealShares", "a meal needs a portion unless skipped", "day plate: skipped meals..." | `meals` |
| Day plate: plain average, rounded to 100 | "roundTo100 ...", "day plate ..." | `meals`, `review-diet` |
| Average plate over a range: days with no meals are not zeros | "range plate ..." | `review-diet` |
| Days this month out of days elapsed | "stats: days this month ..." | `review-habits` |
| This week, Monday to Sunday, with the goal | "stats: this week ..." | `review-habits` |
| Usual time, "Mixed" on a tie, hidden when not tracked | "stats: usual time ..." | `review-habits` |
| Back the day after a miss, unfinished day left out | "stats: back the day after a miss", "... not finished yet" | `review-habits` |
| Week dots: the last seven days ending today | "week dots ..." | `habits` |
| One log per habit per day, one meal per slot per day | "a habit logs at most once ...", "one meal per slot ..." | `habits`, `meals` |
| Notes stored and exported exactly as typed | "habits file ...", "meals file ..." | `export` |
| Export files under `habits/` and `meals/` | "exportFiles ..." | `export` |
| Backups and restore (merge by id, existing wins, junk skipped) | "merge: ..." | `compat`, `vault` |
| Old vaults and old backups keep working | | `compat` |
| Habits can be reordered, archived, deleted, restored | "reorderHabit", "archive ...", "delete ..." | `habits` |
| Past days can be logged or fixed | "month calendar ...", "dayNotes ...", "mealDays ..." | `review-habits`, `review-diet` |
| Carry-over of to-dos | `tasks.test.js` | `todos-notes` |
| Every control has a name; keyboard-only flows; sources page | | `a11y` |
| Update keeps data, new install is empty, offline | | `rollout` |
| A year of data stays fast | | `perf-year` |
| Encryption: device key, passphrase lock, tampering | | `vault`, `lock` |
