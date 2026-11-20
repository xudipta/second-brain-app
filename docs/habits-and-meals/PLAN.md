# Habits and meals: plan

Status: design approved (see "Decisions"). Implementation is tracked in the issues listed at the bottom.

## Why

A daily habit tracker only works if logging is nearly free. If it feels like work, people skip it, which is the same reason they skip journaling. So the whole feature is designed around one rule: **logging gym takes one tap, logging a meal takes about three**. Everything else (history, charts, goals) is built from those taps and never asks for more.

Two things people asked for:

1. **Habits**, for example "went to the gym", with how many days and whether it was morning or evening.
2. **Diet**, for example a protein shake for breakfast, and how much of each meal was protein, carbohydrate and so on, split in a way that is quick to enter.

## Principles

- **Fewest taps.** The time of day is filled in from the clock. Meals reuse recent meals. Typing is always optional.
- **Rough on purpose.** Portions are a judgement call ("most protein, some carbs"), not nutrition facts. No calories or macros are calculated, because that would mean inventing numbers from food names.
- **No guilt.** No streak counters, no red marks. A weekly goal is optional and only appears in Review.
- **Your words stay yours.** Notes are stored and exported exactly as typed. The app never writes or rewrites anything.
- **Private.** Everything lives in the same encrypted vault as notes and to-dos, and is included in backups.
- **Never colour alone.** Every colour has a text label, a letter or an icon beside it.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Where does it live? | On the **Today** screen, above tasks. No new tab. |
| 2 | How are portions entered? | Four **tiles** that cycle None, Some, Half, Most when tapped. |
| 3 | Food groups | **Protein, Veg, Carbs, Other** (Other = oil, sweets, drinks). Fats are not separate. |
| 4 | Time of day | **Morning** (before 12:00), **Afternoon** (12:00 to 16:59), **Evening** (17:00 or later). No Night bucket. |
| 5 | Meal slots | Fixed: **Breakfast, Lunch, Snack, Dinner**. |
| 6 | Export | The zip gets one file per active day under `habits/` and `meals/`, like `todos/`. |
| 7 | Streaks | **No streaks.** Optional weekly goal, shown only in Review. |

Added during planning (small, but needed for usability): **past days can be logged or fixed** from Review (tap a day in the habit calendar, or open a day in Diet), because people forget to log.

## Design

Mock screens (light) and dark variants live in [`design/`](design/). The generator in [`design/mock/`](design/mock/) builds them from the app's real stylesheet (`assets/styles.css`), so they double as a visual test: run `gen.py` and `render.js` and compare with the images here to check the design still matches.

| Screen | Image |
|---|---|
| 1. Today with Habits and Meals | [`1-today.png`](design/1-today.png), [dark](design/1-today-dark.png) |
| 2. Gym, time of day | [`2-gym-time.png`](design/2-gym-time.png) |
| 3. Add a meal | [`3-add-meal.png`](design/3-add-meal.png), [dark](design/3-add-meal-dark.png) |
| 4. Review, Habits | [`4-review-habits.png`](design/4-review-habits.png) |
| 5. Review, Diet | [`5-review-diet.png`](design/5-review-diet.png), [dark](design/5-review-diet-dark.png) |
| 6. Add a habit | [`6-add-habit.png`](design/6-add-habit.png) |

### Interaction rules

- **Gym (or any habit):** tap the checkbox. It logs for today and stamps the time of day from the clock. The chip under the name ("Evening") opens the sheet to change it, add a note, or remove the log. Undo is offered after every log.
- **Meal:** tap **Add** on a slot. The sheet shows recent meals as chips (tap one to copy its portions and note), four tiles, a live bar with percentages, and an optional note. **Save meal** or **I skipped it**. Editing a logged meal reopens the same sheet.
- **Habit dots:** seven dots, last seven days, today ringed. Filled means logged.
- **Today's plate:** the average of today's logged meals, as one bar with text percentages.
- **Review:** a Tasks / Habits / Diet switch. Tasks is today's Review, unchanged.

## Data model

New keys in the vault state (all optional, so existing vaults open unchanged): `habits`, `habitLogs`, `meals`.

```js
// habit
{ id, name, createdDate, trackTime: true, weeklyGoal: 4 /* 1-7 or null */, archivedAt: null, order: 0 }

// habit log: at most one per habit per day
{ habitId, date: '2026-11-09', part: 'evening' /* 'morning' | 'afternoon' | 'evening' | null */, note: '', at: 1762690000000 }

// meal: at most one per slot per day
{ id, date: '2026-11-09', slot: 'breakfast' /* breakfast | lunch | snack | dinner */, skipped: false,
  levels: { protein: 3, veg: 0, carbs: 1, other: 0 } /* each 0 none, 1 some, 2 half, 3 most */, note: 'Protein shake', at: 1762690000000 }
```

### Rules (these are the contract the tests check)

- **Time of day from the clock:** before 12:00 morning, 12:00 to 16:59 afternoon, 17:00 onward evening, in the device's local time.
- **Meal proportion:** each group's share is `level / sum of levels`. A meal needs at least one group above zero unless it is marked skipped. Skipped meals are not part of any average.
- **Day plate:** the plain average of the proportions of that day's logged meals. Percentages are rounded to whole numbers with the largest-remainder method so they always add to 100.
- **Average plate over a range:** the average of the daily plates for days with at least one logged meal (so the caption can say "6 days logged"). Days with no meals are not counted as zeros.
- **Habit stats (Review):**
  - *Days this month:* logged days of the current month out of days elapsed.
  - *This week:* logged days in Monday to Sunday, next to the goal if one is set.
  - *Usual time:* the most common time of day; "Mixed" on a tie; hidden if the habit does not track time.
  - *Back the day after a miss:* of the missed days since the habit was created, how many were followed by a logged day. A miss whose next day has not finished yet is left out. Shown as "3 of 3", or "No misses yet".
- **Week dots on Today:** the last seven days ending today.

## Architecture

- `assets/tracking.js`: pure functions, no DOM, no storage, "today" and "now" passed in (the same pattern as `assets/tasks.js`). This is where all the rules above live, with unit tests.
- `assets/vault.js`: add the three arrays to the default state, backups, and restore merge (habits and meals by `id`, logs by `habitId + date`, existing wins). Old backups without these keys must still restore.
- `assets/app.js`: views and sheets. Today gains Habits and Meals sections. Review gains the switch and two panels.
- `assets/styles.css`: food-group colour tokens, plate bar, legend, chips, switch, stepper, tiles, calendar, stacked chart.
- `sw.js`: bump the cache version and add `tracking.js` to the shell list.

## Colour and accessibility

Food-group colours come from the validated categorical palette in the data-viz guidance, in this fixed order: **Protein, Veg, Carbs, Other**. Validator results (OKLab, normal and colour-blind vision):

| Mode | Colours (Protein, Veg, Carbs, Other) | Result |
|---|---|---|
| Light, surface `#fbfaf7` | `#e34948`, `#1baf7a`, `#eda100`, `#2a78d6` | Pass. Warnings: Protein and Veg can look alike under deuteranopia (distance 6.9), and Veg and Carbs are low contrast on the page background. |
| Dark, surface `#1a1a18` | `#e66767`, `#199e70`, `#c98500`, `#3987e5` | Pass. Warning: Protein and Veg distance 6.5 under protanopia. |

Because of those warnings, the design **must** keep the secondary encodings: a text label and percentage next to every segment, a 2px gap between segments, and a letter chip (P, V, C, O) on each tile. Text on the yellow Carbs chip is dark (`#0b0b0b`), not white. Any change to the colours must be re-run through the validator.

Other requirements:

- Every chart has a text alternative (a table or list), and bars have a tooltip with the exact values.
- Tiles and chips are real buttons with labels, reachable by keyboard, and announce their state (for example "Protein, Most").
- Tap targets are at least 44px. Motion respects `prefers-reduced-motion`.

## Testing

- **Unit tests** for `tracking.js`: time-of-day buckets at the boundaries (11:59, 12:00, 16:59, 17:00), proportions and rounding to 100, day and range averages, weekly counts, usual time and ties, "back after a miss" including the unfinished-day case, week dots across month and year ends.
- **End-to-end** (Playwright with a controlled clock): one-tap habit log and undo, changing the time, adding and editing a meal, skipped meal, recent-meal chips, logging a past day from Review, empty states.
- **Compatibility:** open a vault saved by the current release and confirm nothing is lost; restore an old backup (no habits or meals) and a new one.
- **Accessibility:** keyboard-only pass through each flow, labels on every control, contrast of the new tokens in light and dark.

## Rollout

Ships in small pull requests (see the issue order below). Nothing is logged until you act: on a new install Today shows an "Add a habit" prompt and the four meal slots with an Add button each (the approved design), and Review shows an empty state with a link back to Today. No data migration is needed because the new keys are optional.

## Not in this release

- Reminders or notifications (a static site cannot send them reliably).
- Calories, macros, or a food database.
- A Night time-of-day option, custom meal slots, more than one log per habit per day.
- Linking the Habit interview note (set-up and check-in questions) to the tracker. Worth considering later.

## Issues

Epic: [#1 Habits and meals tracking](https://github.com/xudipta/second-brain-app/issues/1). The work is these sub-issues:

| # | Issue | Size | Depends on |
|---|---|---|---|
| [#2](https://github.com/xudipta/second-brain-app/issues/2) | Tracking logic and rules (`assets/tracking.js`) | M | none |
| [#3](https://github.com/xudipta/second-brain-app/issues/3) | Store habits and meals in the encrypted vault, with backups and restore | S | #2 |
| [#4](https://github.com/xudipta/second-brain-app/issues/4) | Design tokens and shared components | M | none |
| [#5](https://github.com/xudipta/second-brain-app/issues/5) | Review: Tasks / Habits / Diet switch | S | none |
| [#6](https://github.com/xudipta/second-brain-app/issues/6) | Today: Habits section with one-tap logging | M | #2, #3, #4 |
| [#7](https://github.com/xudipta/second-brain-app/issues/7) | Today: Meals section with today's plate and four slots | M | #2, #3, #4 |
| [#8](https://github.com/xudipta/second-brain-app/issues/8) | Add, edit, reorder and archive habits | M | #2, #3, #4, #6 |
| [#9](https://github.com/xudipta/second-brain-app/issues/9) | Meal sheet: tap tiles, recent meals, note, skip | M | #2, #3, #4, #7 |
| [#10](https://github.com/xudipta/second-brain-app/issues/10) | Zip export: daily habit and meal files | S | #2, #3 |
| [#11](https://github.com/xudipta/second-brain-app/issues/11) | Review, Habits: stats, calendar, time of day, log past days | L | #2, #3, #4, #5, #6, #8 |
| [#12](https://github.com/xudipta/second-brain-app/issues/12) | Review, Diet: average plate, daily chart, recent days, edit past meals | L | #2, #3, #4, #5, #7, #9 |
| [#13](https://github.com/xudipta/second-brain-app/issues/13) | Tests: unit, end-to-end, compatibility, accessibility, CI | M | #2 to start, finishes last |
| [#14](https://github.com/xudipta/second-brain-app/issues/14) | Docs, sources for the stats, rollout polish | S | #6 to #12 |

### Build order (one small pull request each)

1. **#2 and #3**: logic and storage. No visible change, fully unit tested.
2. **#4 and #5**: design tokens and the Review switch.
3. **#6 and #8**: habits on Today and the habit sheet.
4. **#7 and #9**: meals on Today and the meal sheet.
5. **#11**: Review, Habits.
6. **#12**: Review, Diet.
7. **#10**: export.
8. **#13 and #14**: remaining tests, CI, docs and rollout. Tests are added alongside each earlier pull request wherever possible.

Every pull request references its issue and must not break the existing Today, Notes, Review and More screens.
