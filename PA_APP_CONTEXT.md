# PA App — context (read on demand)

How the app is put together and why. CLAUDE.md says *how to work*; this says *what's there*.

## Origins
- Started 23 Oct 2026 as a multi-file web app with Google Gmail/Calendar sync (first git commit `c1f8b02`).
- Rebuilt the same day around a proven way of working: one HTML file, an auto-saving data file, tests and git.
- Google sync was parked for later. Its code is in that first commit (`app.js`: `initTokenClient`, `ensureGoogleMonth`, `loadEmails`). It needs a Google OAuth client ID and an `http://localhost` or `https` origin; it won't work from `file://`.

## Data model
Shared data (in `localStorage` as `pa_<key>`, and in the data file under `data.<key>`):

| key | record |
|---|---|
| `tasks` | `{id, title, due:'YYYY-MM-DDTHH:mm' or '', priority:'low'/'med'/'high', remind:-1/0/10/60/1440 (minutes before; -1 = none), notified, done, created}` |
| `notes` | `{id, title, body, updated (ms)}` |
| `events` | `{id, title, date:'YYYY-MM-DD', time:'HH:mm' or ''}` |

Per-device settings (`localStorage` `dev_<key>`; never in the data file or backups):
`view`, `theme` (auto/dark/light), `name` (device label), `seenToken`, `unsaved`, `lastBackupDay`, `roData`/`roInfo` (phone's last opened file).

**Invariants**
- Old data files must keep loading. If a record shape changes, add defaults when loading; don't require the new field.
- IDs come from `uid()`: time + crypto random + counter.
- `due` is local wall-clock time without a timezone. Never convert it to UTC.

## Data file format
```json
{ "app": "PA App", "version": 1, "saveToken": "<uid>", "savedAt": "<ISO instant>", "savedFrom": "<device name>",
  "data": { "tasks": [], "notes": [], "events": [] } }
```
Default name is `pa-app-data.json`, kept wherever the user picks (normally a synced folder such as OneDrive). Manual exports use the same format. Import also accepts a bare `{tasks, notes, events}`.

## Save logic (`DF` in PA App.html)
- **Link:** the user creates or opens the file once. The File System Access handle is stored in IndexedDB (`pa_datafile` → `handles`: `data`, `backups`). After a browser restart, permission needs one click ("Reconnect").
- **Save:** every edit goes through `changed()`, which sets `dev_unsaved=true` and saves 2 s after the last change (`DEBOUNCE_MS`). Before writing, the app re-reads the file. If its `saveToken` isn't the one this browser last saw, it opens a conflict instead of writing. Writes use `createWritable()`, which is atomic.
- **Poll:** every 20 s (`POLL_MS`), and when the tab comes back into view, the app checks the file:
  - same token: carry on
  - newer file and nothing unsaved here: load it quietly, with a toast
  - both changed: conflict
- **Conflict:** a banner offers "Keep this device's version" or "Use the file's version". Nothing saves until one is chosen.
- **Empty browser:** an empty browser never overwrites a file that has data. It loads the file instead.
- **Daily backups:** the first save of each day writes `PA App Backup DD-MM-YY H-MMam.json` into the chosen folder. It never overwrites an existing backup.

## Read-only mode (phones)
- Read-only when any of these is true:
  - It's a phone or tablet (`isPhone()`: `userAgentData.mobile`, or a user-agent string mentioning Android/iPhone/iPad/Mobi, or an iPad asking for the desktop site). This holds even when that phone's Chrome can write files.
  - The browser has no `showOpenFilePicker` (Safari, Firefox).
  - The address has `?readonly`.
- **Live address:** https://usman-madni.github.io/pa-app/PA%20App.html. GitHub Pages serves it from the `master` branch of the public repo `Usman-Madni/pa-app`, so every push to `master` updates the site within about a minute. Commits use the GitHub noreply email, never a personal one.
- The user opens the data file with a normal file picker. The app shows it and remembers it in `dev_roData`.
- All edits are blocked in three ways: `EDIT_ACTIONS` guard, submit guard, and `.edit-only` hidden. `DB.persist` is a no-op.
- Reminders still pop up, but they're tracked in memory (`state.remindedHere`) instead of changing the task.
- **Why:** so the phone can't create a second copy that drifts apart. This is a stopgap.
- **Permanent fix (planned):** read and write the same file through the OneDrive web connection (Microsoft Graph), using OneDrive's eTag for conflict checks. That needs a Microsoft app registration and the app hosted on `https`, which GitHub Pages already provides.

## Tests
- `npm test` runs `tests/run-all.js`, which runs every `tests/test-*.js` in jsdom.
- Fake file and folder handles live in `tests/helpers.js`. jsdom installs outside the project folder (`npm run setup`).

| File | Covers |
|---|---|
| `test-basics` | add, save and fresh-load; ID uniqueness; device settings kept out of the data |
| `test-datafile` | create, save, load another device's save, conflicts (keep mine / use theirs), empty browser, wrong file, daily backup once per day |
| `test-readonly` | phone can open and view, every edit path blocked, reminders don't change data, `?readonly` |
| `test-reminders-dates` | reminder timing, fires only once, `toISO` local day, static rule against slicing `toISOString()` |
| `test-private` | the private-data check catches private terms (including in old versions), emails, personal paths, forbidden files, private words in commit messages and personal commit emails; a clean repo passes; this project's history is clean |

## Keeping the public repo clean
- The repo is public, so personal details live only in git-ignored files: `CLAUDE.local.md` and `private-terms.txt`.
- A pre-push hook (`tools/install-hooks.js`) runs `tools/check-private.js`, then the tests.
- The check reads the whole history being pushed, not just today's files, because GitHub shows every old version.
- Without `private-terms.txt` the hook blocks every push, so a new computer can't push unchecked by accident.

## Decisions log
- **23 Oct 2026:**
  - Keep the current indigo look.
  - Keep one public repo with personal details kept out. History was rewritten into two clean commits, and a pre-push private-data check guards every push.
  - Phone is read-only for now.
  - Host on GitHub Pages for the phone (not set up yet).
  - Google sync later; no scheduled helpers for now.
