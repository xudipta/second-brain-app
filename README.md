# Second Brain

An installable web app for the [second-brain](https://github.com/xudipta/second-brain) notebook. It asks the interview questions one at a time and stores your answers exactly as you type them. It never writes, suggests or rewrites anything.

## Screens
- **Today**: your to-do list for the day. Anything you don't finish **carries over** to the next day on its own and shows under "Carried over" with where it came from and how many days it has waited. Each carried task has **Do today**; tapping a task opens a sheet to edit it, move it (tomorrow or a date), drop it, or delete it (with undo). **Close the day** shows how the day went, lets you drop what you no longer want, and links to a journal note.
- **Notes**: the interview notebook. A focused one-question-at-a-time screen with progress, Back/Skip/Next, autosave and a "Why this question?" panel, then a review step before saving. Search, filter by type, read, edit, delete (with undo).
- **Review**: last seven days at a glance (tasks finished, share of the list completed, days with something done, longest-open task, a bar chart with a text table), then every day with what was done and left over. Tap a day to see exactly what was on the list, plus any notes from that day.
- **More**: export (.zip), backup/restore, security, install, and **Why these questions** (the sources, copied from second-brain's SOURCES.md).

## How the to-dos work
- Carry-over is not stored; it is worked out when you open the app (an open task whose day is before today is "carried over"), so it works offline and needs no server. If the app is open at midnight it redraws on its own.
- History is rebuilt from each task's own dates. A task you deliberately push to a later date is not counted as "left over" on the days in between.
- To-dos live in the same encrypted vault as your notes and are included in backups. The zip export adds one markdown file per active day under `todos/YYYY/MM/YYYY-MM-DD.md` (Done, Left over, Dropped), in your own words.
- There are no reminders or notifications: a static site cannot send them reliably on every phone.
- The logic is in `assets/tasks.js` (pure functions, no DOM).

## How it works
- Note types: idea, learning, session, journal, habit. The questions are copied from `second-brain/templates/` (see `assets/templates.js`), each with the framework it comes from shown under the question.
- Skip any question; skipped questions are left out of the entry.
- Entries are saved **only in this browser**, **encrypted** (see Security). A passphrase lock is optional. The site is public, your entries are not.
- Export: download one entry as `.md`, copy or share it, or export everything as a `.zip` that keeps the `entries/YYYY/MM/` paths. Unzip into the second-brain repo and commit. Entries not yet exported are marked with a dot.
- Backup and restore as `.json` (can be encrypted). Clearing site data deletes entries, so export now and then.
- Installable (manifest + service worker) and works offline. Same pattern as Flute Mastery Journey.

## Security
Everything the app stores (entries and the unfinished draft) is one record in localStorage, encrypted with **AES-256-GCM** using the Web Crypto API. A fresh random IV is used for every write, and any tampering is detected. There are two ways the key is kept, and you choose:

- **Automatic (default, no password).** The app opens straight away. The key is random, made by the browser and kept in this app's IndexedDB as a non-extractable key. Other apps, other sites, and tools that copy or sync the raw browser storage see only unreadable data. Anyone who can open the app on your unlocked phone can read your entries.
- **Passphrase lock (optional, More → Add a passphrase lock).** The key comes from your passphrase (PBKDF2-SHA256, 600,000 rounds) and lives only in memory while the app is open. The app asks for it on opening, locks after 2 minutes in the background or with **Lock now**, and you can change or remove the lock any time. **There is no recovery** for a forgotten passphrase.

Backups (.json): in passphrase mode they are encrypted with your passphrase; in automatic mode you can protect one with its own passphrase, or leave it empty for a plain readable file. If the browser's site data is cleared, the automatic key goes with it and the entries cannot be read, so back up now and then. Entries from the earlier unencrypted version are encrypted on first launch and the plaintext copy is deleted.

Limits: it does not protect against malware on your device, someone watching you type, or a weak passphrase. The `.md` and `.zip` exports are plain readable files by design. Deleting the stored record from the browser is not a secure disk wipe. Code lives in `assets/vault.js`.

## Changing questions
Edit `assets/templates.js`, but only after the change is sourced in `second-brain/SOURCES.md`, and mirror the citation in `window.SOURCES` in the same file. No source, no question.

## Run locally
```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deployment
GitHub Pages deploys via `.github/workflows/pages.yml` on every push to `main`. One-time: **Settings → Pages → Source: GitHub Actions**.

Icons are generated by `node tools/make-icons.js` (needs `playwright`). Fonts (Inter and Newsreader, SIL OFL) are bundled in `assets/fonts/` so the app works offline.
