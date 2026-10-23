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
| `tasks` | Every field and default is in `TASK_DEFAULTS` in PA App.html; `normalizeTask()` fills in missing fields on load. Fields: `id, title, due:'YYYY-MM-DDTHH:mm' or '', start:'YYYY-MM-DD' or '', priority:'low'/'med'/'high', progress:'not'/'doing', remind:-1/0/10/60/1440 (minutes before; -1 = none), notified, done, completedAt, created, myDay:'YYYY-MM-DD' (in My Day only on that date), bucket (id or ''), labels:[ids], notes, checklist:[{id,text,done}], repeat (see below) or null, seriesId, spawnedNext, attachments:[{id,name,file,size,type,added}]` |
| `notes` | `{id, title, body, updated (ms)}` |
| `events` | `{id, title, date:'YYYY-MM-DD', time:'HH:mm' or ''}` |
| `buckets` | `{id, name, order}`. Deleting a bucket moves its tasks to "No bucket"; it never deletes tasks. |
| `labels` | `{id, name, color:'#rrggbb'}`. Deleting a label takes it off its tasks. |

Per-device settings (`localStorage` `dev_<key>`; never in the data file or backups):
`view`, `theme` (auto/dark/light), `taskLayout` (list/board), `name` (device label), `seenToken`, `unsaved`, `lastBackupDay`, `roData`/`roInfo` (phone's last opened file).

**Invariants**
- Old data files must keep loading. If a record shape changes, add defaults when loading; don't require the new field.
- IDs come from `uid()`: time + crypto random + counter.
- `due` is local wall-clock time without a timezone. Never convert it to UTC.

## Data file format
```json
{ "app": "PA App", "version": 2, "saveToken": "<uid>", "savedAt": "<ISO instant>", "savedFrom": "<device name>",
  "data": { "tasks": [], "notes": [], "events": [], "buckets": [], "labels": [] } }
```
- Default name is `pa-app-data.json`, kept wherever the user picks (normally a synced folder such as OneDrive).
- Version 2 (Oct 2026) added `buckets` and `labels`. Version 1 files (no buckets or labels) still load: only `tasks`, `notes` and `events` are required.
- Manual exports use the same format. Import also accepts a bare `{tasks, notes, events}`.

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

## Tasks: drawer, views, board
- **Drawer:** clicking a task opens the details drawer (`renderDrawer`). It's rebuilt only on structural changes (open, close, checklist, labels, repeat), never while you type, so the cursor stays put. Typing updates the task at once and saves 400 ms after a pause.
- **Tabs:** All open, My Day, Planned (has a due date), Overdue, Done (`TASK_TABS`). They can be filtered by bucket (`state.taskBucket`: '' = all, '-' = no bucket) and by label. A task added while filtered lands in that bucket or label.
- **Today screen:** shows My Day plus tasks due today or overdue. Its quick add puts the new task in My Day.
- **Board:** one column per bucket, with "No bucket" hidden when empty. Each column has a quick add, and cards drag between columns (`moveTaskToBucket`). List or board is a per-device choice.

## Recurring tasks (`nextDue`, `completeTask`)
- **The repeat setting:** `repeat = {freq, interval, days, monthMode, anchorDay, weekday, nth, unit, until}`. `freq` is one of daily, weekdays, weekly, monthly, yearly, after.
- **How copies are made:** ticking a repeating task off creates the next copy once, recorded in `spawnedNext`, so re-ticking never makes two.
  - The copy keeps the time of day and the gap between start and due date.
  - Its checklist, reminder, My Day and progress reset.
  - Attachments are shared: both copies point at the same files.
- **Anchors:** `anchorDay`, `weekday` and `nth` are taken from the due date when the repeat is set or the due date is edited (`syncRepeatAnchor`), not when a copy is made. That keeps "the 31st" on the 31st after February, and Feb 29 coming back in leap years.
- **'after':** counts from the day you finish, not from the old due date.
- **`until`:** no copy is due after this date.
- **Calendar:** shows upcoming repeats (`repeatPreviews`) as dashed chips. They're only shown, never saved. 'after' repeats can't be predicted, so they aren't shown.

## Attachments (`AT`)
- **Storage:** the user picks an attachments folder once; its handle is kept in IndexedDB as `attachments`. Attaching copies the file there under a new name if one already exists, e.g. "bill (2).pdf", so nothing is ever overwritten.
- **Data file:** stores only `{name, file, size, type}`, never file contents.
- **Opening:** images, PDFs and text open in the browser. Other files (Word and so on) are saved as a copy.
- **Removing:** an attachment's file is deleted from the folder only when no other task still uses it (repeat copies share files). Deleting a task keeps its files.
- **Changing folder:** files already attached stay in the old folder, and the app warns about this.
- **After a restart:** the folder needs one click to reconnect. "Reconnect data file" also reconnects it.
- **Phone:** shows attachment names but can't open or add files yet. That comes with the OneDrive connection.
- **Privacy:** an `attachments/` folder is git-ignored, and the private-data check blocks photos, PDFs, office files and anything under `attachments/` from ever being pushed.

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
| `test-private` | the private-data check catches private terms (including in old versions), emails, personal paths, forbidden files (including identical copies under another name), photos/PDFs/office files, attachments folders, private words in commit messages and personal commit emails; a clean repo passes; this project's history is clean |
| `test-task-details` | old tasks and version 1 files load with defaults; each task gets its own arrays; drawer fields, title can't be blanked, notes typing keeps focus; checklist (add, tick, edit, turn into a task, delete); My Day (empties next day, Today quick add); tabs; Esc; delete asks when the task has notes; phone drawer is locked |
| `test-buckets-labels` | board columns, quick add per column, moving and reordering, renaming; bucket and label filters; labels in the drawer and Settings; everything reaches the data file (version 2); deleting asks and never deletes tasks; phone can't drag |
| `test-recurring` | date maths (daily, weekdays, weekly multi-day and every N weeks, monthly by date with month-end, monthly by weekday incl. last, yearly with Feb 29, after-completion, end date); drawer setup; one copy only; what resets; start gap; calendar previews not saved; anchor survives copy after copy |
| `test-attachments` | choose folder, attach without overwriting, contents copied, only names in the data file, open, missing file, repeat copies share files, delete only when unused, other files untouched, reconnect after restart, phone can't attach |

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
  - Host on GitHub Pages for the phone (done the same day).
  - Google sync later; no scheduled helpers for now.
  - **Tasks upgrade** (drawing on Microsoft Planner and To Do):
    - Buckets only, with no separate lists.
    - Priority stays Low/Medium/High, with no extra "Important" star.
    - Recurring copies are created when you tick a task off, and "N after I finish" is also available.
    - Attachments go in a folder, not inside the data file.
    - List is the default view, with Board one click away.
    - Labels, progress and start date are all kept.
