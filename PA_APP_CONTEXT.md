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
| `tasks` | Every field and default is in `TASK_DEFAULTS` in PA App.html; `normalizeTask()` fills in missing fields on load. Fields: `id, title, due:'YYYY-MM-DDTHH:mm' or '', start:'YYYY-MM-DD' or '', priority:'low'/'med'/'high', progress:'not'/'doing', reminders:[…] (see Reminders), done, completedAt, created, myDay:'YYYY-MM-DD' (in My Day only on that date), bucket (id or ''), labels:[ids], notes, checklist:[{id,text,done}], repeat (see below) or null, seriesId, seriesIndex, spawnedNext, attachments:[{id,name,file,original,size,type,added,keep}], period, todo` (its Microsoft To Do copy, see Phone reminders; `null` on older tasks) (the moving part, shown as "title (period)"; see Recurring tasks). Older tasks had one reminder as `remind` (minutes before, -1 = none) + `notified`; `normalizeTask()` turns that into a one-item `reminders` list and drops the old fields. A task saved before `period` existed that repeats (without `keepTitle`) has the date in its title split into `period` when loaded (`splitPeriod`), once. |
| `notes` | `{id, title, body, updated (ms)}` |
| `events` | `{id, title, date:'YYYY-MM-DD', time:'HH:mm' or ''}` |
| `buckets` | `{id, name, order}`. Deleting a bucket moves its tasks to "No bucket"; it never deletes tasks. |
| `labels` | `{id, name, color:'#rrggbb'}`. Deleting a label takes it off its tasks. |

Per-device settings (`localStorage` `dev_<key>`; never in the data file or backups):
`view`, `theme` (auto/dark/light), `taskLayout` (list/board), `name` (device label), `seenToken`, `unsaved`, `lastBackupDay`, `roData`/`roInfo` (phone's last opened file), `msAuth` (Microsoft sign-in tokens), `todoList` (the To Do list's id), `todoLast` (last sync time).

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
- **Drawer:** clicking a task opens the details drawer (`renderDrawer`).
  - **Rebuilding:** it's rebuilt only on structural changes (open, close, checklist, labels, repeat), never while you type, so the cursor stays put. Typing updates the task at once and saves 400 ms after a pause. A rebuild keeps the scroll position for the same task.
  - **Layout,** like Microsoft To Do, in cards (`p-card`) of rows (`p-row`):
    1. steps and "Add step"
    2. My Day
    3. done on (when done), due date + optional time, reminders, repeat
    4. bucket, priority, progress, start, labels
    5. files
    6. the note
  - History comes after the cards. The footer has ⧉ Duplicate and Delete.
  - **"+ New task"** opens it on a blank task, which is dropped if left unnamed.
- **Keeping your place:** `render()` keeps the page and board scroll position when redrawing the same screen. While the panel is open the rest is dimmed (`.drawer-backdrop`), but the mouse wheel over the dim area scrolls the board behind it, and clicking it closes the panel.
- **Done on… pop-up:** ticking any task opens it (`openDonePrompt`).
  - **Quick choices** (`done-quick`):
    - **Today** has the focus, so Enter ticks it off today with no time.
    - **On the due date** shows only when the due date has passed. It uses the due time if there is one, so it counts as on time.
  - **Another date:** the date defaults to today and the time is left empty; an empty time means "done on that date" (`completedAllDay`).
  - Esc/Cancel leaves the task undone.
- **Done late** (`lateDays`, `lateText`): a task done after its due date shows "Done N days late" in orange in the list, panel and History. A timed task done later the same day shows "Done late (same day)"; an all-day task only counts as late from the next day.
  - **On the calendar a late task shows twice:**
    - **Due day: "missed"** (`t-latedue`): an orange box, no strikethrough, "m · done 25th".
    - **Done day** (`kind: 'doneon'`): the normal done look plus an orange outline, "✓ m · due 24th". Across months the note reads "due 30 Sep".
    - Day lists say "Missed — done Sun, Oct 25 (1 day late)" and "✓ Done this day — was due …". Both open the task.
    - Tasks done on time or early show once, as done.
  - **Done chips:** a green box, the name in the normal text colour struck through, and "✓" in front.
  - **The strike line** (lists, board cards, chips, day lists) is not `text-decoration: line-through`. It's a 1.5px `linear-gradient` background on the name only (`.tt` / `.chip-t`), placed at 64% so it sits a little below the middle of the letters, like To Do. Labels and tags next to the name aren't struck. Done-late rows in the day list are struck too, matching their chip.
  - **Chip parts:** a chip is `.chip-t` (the name, which shortens with …) plus `.chip-note`. The note stays whole while there's room; in a very narrow cell it gives way only after the name has a little room.
  - **Hover:** pointing at either chip (`data-late`) highlights both.
  - **Legend:** sample chips.
  - The late bar was tried and removed (25 Oct).
- **Late repeats keep their missed copies:** the next copy is counted from the old due date, so a late weekly task makes the missed weeks as overdue copies. To catch up instead, use "Again after I finish it".
- **Labels from the panel:** "✎ Manage" next to the labels opens rename, colour and delete for each (`state.labelManage`). Settings has the same controls.
  - A done task's date can be changed in the panel (`setDoneDate`).
  - For "again after I finish it" repeats, an untouched next copy is made again from the new date.
- **Unticking a repeat** (`uncompleteTask`) removes the next copy if it's untouched: `spawnSig` is a snapshot taken when it was made, and reminders going off don't count as changes. If it was changed, it asks "The next copy (…) was changed after it was made (steps, notes). Remove it anyway?" (`whatChanged`); No keeps it. A next copy that's already done always stays.
- **Duplicate** (`duplicateTask`) makes "title (copy)": no attachments, checklist unticked, reminders re-armed, its own new series.
- **Tabs:** All (no filter), Open (the default), Overdue, Done (`TASK_TABS`). They can be filtered by bucket (`state.taskBucket`: '' = all, '-' = no bucket) and by label. A task added while filtered lands in that bucket or label. There's no My Day or Planned tab: My Day is its own screen, and Planned was dropped.
- **My Day screen** (view key `today`, first in the sidebar): tasks added to My Day, plus tasks due today or overdue, plus a few undated ones under "Anytime". Its quick add puts the new task in My Day.
- **Due date and time:** the drawer has a date field and an optional time field. "✕" removes the time, making the task all-day.

## Reminders (`reminders`, `reminderTime`, `checkReminders`)
- **Several per task.** Each reminder is one of:
  - `{kind:'before', minutes}`: N minutes before the due time. For all-day tasks it counts from 9:00 on the due day.
  - `{kind:'dayof', daysBefore, time}`: a time of day, N days before the due date (0 = on the day).
  - `{kind:'at', at}`: an exact date and time. It works even without a due date.
- **Presets** (`REMINDER_PRESETS`): at due time, 10 minutes before, 1 hour before, 1 day before, 9:00 on the day, the evening before at 9:00 pm. **Custom** choices: "N minutes/hours/days before", "N days before at a time", or "on a date and time".
- **New tasks get no reminder** unless one is picked.
- **`fired`** is set once a reminder goes off, so it never repeats. Changing the due date re-arms the relative reminders; exact-time ones keep their state.
- **Phones** show reminders without changing the data (`state.remindedHere`).
- **Repeat copies** bring their reminders along, re-armed. An exact-time reminder moves by as many days as the due date did.
- **Sort** (`SORTS`, `sortTasks`, per device `dev_taskSort`): due date (the default), priority, name A–Z, newest added, oldest added, bucket, completion. Done tasks go last, except when sorting by completion. On the Board the cards in each column follow the sort too.
- **Group** (List only, `groupTasks`, `dev_taskGroup`): none, by due date (Overdue / Today / Tomorrow / Next 7 days / Later / No date / Done), or by bucket.
- **Sticky top** (`.sticky-top`): tabs, filters and sort stay put on List.
  - On Board, `.main.fill` makes the page fit the window and only the board scrolls, with column names (`.board-head`) sticky.
  - The add box scrolls away.
  - Every screen is full width.
- **Board (the default):** one column per bucket, with "No bucket" hidden when empty. Cards drag between columns (`moveTaskToBucket`).
  - The board uses the full screen width: `.main.wide` drops the 1100 px limit.
  - List or board is a per-device choice (`dev_taskLayout`; `taskLayout()` defaults to 'board').
  - Each column has a Planner-style **"+ Add task"** button (`state.boardAdd`). It opens a card with the task name and Set due date; Enter adds and keeps the card open, and Esc closes it.
- **Quick add box** (`quickAddBar`, `parseQuickAdd`, `quickAdd`), like Microsoft To Do, on My Day and Tasks.
  - **What it reads from typing:**
    - dates: today, tonight, tomorrow, weekdays, "5 Nov", "Jan 15", "in 2 weeks", "next week", "due 28/10", "1/11/2026"
    - times: "6pm", "18:30", "noon"
    - repeats: "every Monday", "every other day", "every 3 days", "monthly", "weekdays"
    - `#label` (created if new), `@bucket` (must exist), and `!`, `!high`, `!med` or `!low`
  - **Preview:** shown live under the box, with "Keep words as typed" to switch the reading off for that task.
  - **Buttons:** bucket, due date, reminder and repeat. What you click beats what you typed, and what you typed beats where you are.
  - **Where you add it matters:** the My Day screen adds to My Day.
  - **Reminders:** none unless you pick one with the ⏰ button, even when you type a time.
  - **Left alone on purpose:** day/month numbers need a year or "by/on/due" ("1/2 kg" stays text), and an unknown `@word` stays text.
  - **Times already gone:** "6pm" after 6pm means tomorrow. A repeat whose time has gone today starts at its next repeat.
  - Covered by `test-quick-add`.
- **All-day due dates:** a due date without a time is stored as `T23:59` (`ALL_DAY`). It's shown without a time, has no reminder by default, and isn't overdue until the day ends.

## Recurring tasks (`nextDue`, `completeTask`)
- **The repeat setting:** `repeat = {freq, interval, days, monthMode, anchorDay, weekday, nth, unit, endMode, until, count}` (older ones may have `keepTitle`). `freq` is one of daily, weekdays, weekly, monthly, yearly, after.
- **Drawer:** quick choices (Never, Daily, Weekdays, Weekly, Monthly, Yearly, Again after I finish it), plus **Custom…**. Under the list is a box with "Every N [days/weeks/months/years]", weekday picks, monthly "on day X / on the Nth weekday", and **Ends**. A quick choice resets to "every 1"; the list shows "Custom…" for anything else.
- **Ends:** `endMode` is 'never', 'date' (`until`) or 'count' (`count` copies in all, counted by `seriesIndex`). Older repeats had only `until` and are treated as 'date' when it's set (`endModeOf`). The calendar preview stops at the count as well.
- **How copies are made:** ticking a repeating task off creates the next copy once, recorded in `spawnedNext`, so re-ticking never makes two.
  - The copy keeps the time of day and the gap between start and due date.
  - Its checklist, reminders, My Day and progress reset.
  - Only 📌 kept attachments carry over (see Attachments).
  - **The title never changes; the moving part does** (`period`, `rollPeriod`). "Phone bill" + "Oct 26" shows as "Phone bill (Oct 26)" (`fullTitle`) and the next copy is "Phone bill (Nov 26)". It moves by however far the due date moved:
    - **"Oct 26" means October 2026**: two digits right after a month are a year. "26 Oct" / "Oct 26th" are days.
    - months keep their style: "Aug" → "Sep", "August 2026" → "September 2026", "Dec '26" → "Jan '27"
    - "Q3" → "Q4", "Week 43" → "Week 44", "5 Nov" / "Nov 30th" / "due 5th" by the same number of days, a lone year by years
    - "may" the verb and words like "Marketing" are left alone; "May" counts as a full month name
  - The panel's **Moving part** box sits in the repeat section, with "Shows as … · next: …" under it. Brackets typed around it are dropped. Changing it changes that copy only.
  - **Switching a task to repeat** moves a date in its title into the moving part ("Aug bill" → "Bill (Aug)") and says so. Saved repeating tasks are split the same way once, when loaded (see Data model). `splitPeriod` takes the first date-like part, most specific kind first; "Apr 26" stays as written (the year), "Nov 5" becomes "5 Nov". The old "Move dates in the title forward" tick (`keepTitle`) is gone; tasks that had it off keep their titles.
  - **Renaming a title renames every copy** of the series, done ones included (`renameSeries`), and says how many. Each copy keeps its own moving part. A rename doesn't count as changing a copy (its `spawnSig` is updated), so unticking can still tidy an untouched next copy away.
  - Calendar previews of future repeats show the moved part too. Attachments are named "Phone bill Oct 26.pdf".
  - Covered by `test-repeat-custom`.
- **Anchors:** `anchorDay`, `weekday` and `nth` are taken from the due date when the repeat is set or the due date is edited (`syncRepeatAnchor`), not when a copy is made. That keeps "the 31st" on the 31st after February, and Feb 29 coming back in leap years.
- **'after':** counts from the day you finish (the done date from the pop-up), not from the old due date. The units are days, weeks, months or years.
- **Limits:** every repeat number goes up to 999.
- **History:** a repeating task's drawer lists its other copies, newest first (`historyBlock`). Each shows its title, due and done dates, the first line of its notes, and its files, which you can click to open. Clicking a title opens that copy.
- **Calendar:** shows upcoming repeats (`repeatPreviews`) as dashed chips. They're only shown, never saved.
  - **'after' repeats are estimates**, as if each one is done on its due date (from today if it's overdue). They're shown as dotted "↻≈" chips and "Estimated repeat" in the day list. The real copy follows the actual done day.
- **Day cells** show their first 3 items: what's due or happening first, then "done that day", then previews.
- **Calendar colours** (`taskStatus`, `chipClass`): overdue red, due today accent, upcoming blue, done green and struck through, events teal, next repeats dashed. A legend sits under the grid. The day list uses the same colours, and clicking a task there opens it.
  - **Clicking the grid:** task chips (tasks, done-on days, repeat previews) light up when pointed at. Clicking one shows that day and opens the task's panel; clicking empty space in a day only shows the day.
  - **Ticking from the day list:** tasks have a tick box there (events get an empty gap so rows line up). It goes through the usual "Mark done" pop-up, so there's no need to open the panel.

## Attachments (`AT`)
- **Storage:** the user picks an attachments folder once; its handle is kept in IndexedDB as `attachments`.
- **Naming:** attaching copies the file there under a name taken from the task (`suggestName`): the title, plus the due year if the title has no year, e.g. "Sep elec bill 2026.pdf".
  - The original name is kept in `original`.
  - If the name is taken, it becomes "… (2)", so nothing is ever overwritten.
- **Two kinds** (`keep`):
  - **This one only** (the default, `keep:false`) stays with that copy, e.g. that month's bill.
  - **📌 Keep on every repeat** (`keep:true`) carries over to each new copy (same file, shared), e.g. account details.
  - The 📌 switch shows on repeating tasks.
- **Renaming** (✎, `AT.rename`) renames the real file too:
  - A 📌 file is renamed for every task that uses it.
  - A this-one-only file is renamed for this task only. If an older copy still shares it (from before `keep` existed), this task gets its own renamed copy, and the other keeps the old file.
  - Renaming uses `handle.move()` where the browser has it, otherwise copy and delete.
- **Data file:** stores only `{name, file, original, size, type, keep}`, never file contents.
- **Opening:** images, PDFs and text open in the browser. Other files (Word and so on) are saved as a copy.
- **Removing:** an attachment's file is deleted from the folder only when no other task still uses it. Deleting a task keeps its files.
- **Changing folder:** files already attached stay in the old folder, and the app warns about this.
- **After a restart:** the folder needs one click to reconnect. "Reconnect data file" also reconnects it.
- **Phone:** shows attachment names but can't open or add files yet. That comes with the OneDrive connection.
- **Privacy:** an `attachments/` folder is git-ignored, and the private-data check blocks photos, PDFs, office files and anything under `attachments/` from ever being pushed.

## Phone reminders: Microsoft To Do (`TD`)
- **Why:** the phone view can't notify. To Do can, and the phone's own reminder app syncs with To Do, so To Do does the notifying even with the laptop off.
- **Sign-in** (`TD.signIn`): OAuth code flow with PKCE in a pop-up, personal Microsoft accounts (`/consumers`), scopes `Tasks.ReadWrite offline_access`, no library.
  - The client ID is in the code. It isn't a secret: Azure only lets it return to the registered addresses, `https://usman-madni.github.io/pa-app/` and `http://localhost:8790/`.
  - Azure refuses `PA%20App.html` as a return address ("Reply url contains punycode"), so Microsoft returns to the **folder** (`redirectUri()`). On GitHub there's no page there, which doesn't matter: the app reads `?code=` from the pop-up's address (same site) and closes it. On localhost the pop-up lands on the app itself, which then doesn't start (`signInPopup`).
  - Tokens live in `dev_msAuth` only. The refresh token from a pop-up sign-in lasts about 24 hours, then a banner asks to sign in again (`needsSignIn`).
- **What syncs** (`TD.sync`, stage 1: this computer → To Do only):
  - Every open task goes to a "PA App" list (made if missing). Done tasks only finish off an existing copy.
  - Sent (`payload`): full title, notes, Important for high priority, completed/not, due date as `YYYY-MM-DDT12:00:00` UTC (To Do has no due time; noon UTC is the same day here), and the **next reminder still to come** (`nextReminderAt`; To Do allows one) as an exact UTC moment. Repeats aren't sent as repeats.
  - `t.todo = {id, sig}`: the To Do task and a hash of what was last sent; only tasks whose payload changed are sent again. Repeat copies and duplicates start with `todo: null` and get their own To Do task. `taskSig` ignores `todo`, so being sent doesn't make a next copy "changed".
  - Deleted here → deleted in To Do (only tasks marked with a `linkedResources` entry `applicationName: 'PA App'`; tasks added on the phone are left alone).
  - Deleted in To Do → kept here as `todo: {removed: true}` and never sent again. A whole deleted list is made again with everything.
  - A lost link finds its old To Do task by `externalId` (= the task id) instead of making a second one.
  - **Safety:** over 10 removals that are also over half the list, either way, are refused with a message.
- **When:** after the data file has loaded, 5 s after a task change (`changed()` → `TD.soon`), every 5 minutes, and **Sync now** in Settings. Never on read-only devices, and not while the data file needs reconnecting or a decision.
- **Stage 2 (not built):** reading changes back from To Do (ticks, edits, new tasks). Steps are later still.

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
| `test-reminders-dates` | old single reminders still load and fire; several per task, every kind at the right time (incl. evening before, 9 am on the day, all-day "before", exact time with no due date); fires only once; new due date re-arms; drawer presets, custom and remove; `toISO` local day; static rule against slicing `toISOString()` |
| `test-repeat-custom` | dates moving forward (months, years, quarters, weeks, dates, "May", "may" the verb); moving part ("Oct 26" = Oct 2026, days, brackets dropped, panel box and preview, list, calendar previews, attachment names); splitting dated titles (on load once, not with keepTitle or no repeat, on switching to repeat); renaming renames every copy; Custom… screen; ends after N times (numbering, last one, calendar), on a date, never |
| `test-private` | the private-data check catches private terms (including in old versions), emails, personal paths, forbidden files (including identical copies under another name), photos/PDFs/office files, attachments folders, private words in commit messages and personal commit emails; a clean repo passes; this project's history is clean |
| `test-calendar-extras` | late task also on its done day (faded ✓, day list text, opens it; none for on-time or early); missed / done-on chips with "done 25th" / "due 24th" notes, long names keep the note, hover highlight; strike line drawn lower (gradient, not on missed chips); clicking a chip opens its panel, empty space only the day; tick box in the day list (none for events); legend sample chips; "after" repeats estimated from the due date (or today when overdue), stop at the count, look different, real copy follows the done day; Done pop-up has no "(optional)" |
| `test-late-labels` | how late (days / same day / on time / early / no due date); shown in list, panel and History; late repeats keep the missed copy; calendar orange edge, legend, day list; no 23:59 on repeat previews; manage labels from the panel; board keeps its scroll after an edit; wheel over the dim scrolls the board |
| `test-done-dup` | Done on… pop-up (cancel, Esc, a chosen date, time left empty), "after" counted from the done date, years, 999, changing the done date moves an untouched copy (not a changed one), unticking removes the untouched next copy (a fired reminder doesn't count as a change), asks before removing a changed one (says what changed; No keeps it; Yes removes it), a series rename doesn't count, Duplicate, full width |
| `test-sort-calendar` | every sort order, remembered; group by due date or bucket; Board cards follow the sort; sticky top and column names; calendar colours, legend, day list colours, opening a task from it |
| `test-panel-extras` | "+ New task" (blank dropped, My Day), editing reminders, no time subtext, scroll position kept after a change |
| `test-task-details` | old tasks and version 1 files load with defaults; each task gets its own arrays; drawer fields, title can't be blanked, notes typing keeps focus; checklist (add, tick, edit, turn into a task, delete); My Day (empties next day, Today quick add); tabs; Esc; delete asks when the task has notes; phone drawer is locked |
| `test-buckets-labels` | board columns, quick add per column, moving and reordering, renaming; bucket and label filters; labels in the drawer and Settings; everything reaches the data file (version 2); deleting asks and never deletes tasks; phone can't drag |
| `test-recurring` | date maths (daily, weekdays, weekly multi-day and every N weeks, monthly by date with month-end, monthly by weekday incl. last, yearly with Feb 29, after-completion, end date); drawer setup; one copy only; what resets; start gap; calendar previews not saved; anchor survives copy after copy |
| `test-todo-sync` | against a fake Microsoft: pop-up sign-in (personal accounts, To Do scope only, PKCE verifier matches, returns to the folder, wrong answer refused), tokens only on the device; every open task sent with title + moving part, notes, Important, due day, next reminder; only changes sent again; next reminder after one goes off; repeat copies get their own task and unticking still removes them; deleted here → deleted there; phone-made tasks left alone; deleted in To Do → kept, not resent; lost link reused; deleted list remade; mass removal refused; token renewal and the sign-in-again banner; Disconnect; phones never sync |
| `test-attachments` | choose folder, smart names without overwriting, contents copied, only names in the data file, open, missing file, 📌 keep vs this-one-only on repeat, renaming (all copies / this one / shared legacy file), delete only when unused, other files untouched, series history (files open, entries open), reconnect after restart, phone can't attach |

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
    - List was the default at first; changed the same day to **Board by default**, at full width.
    - The add-task box was reworked after the To Do and Planner designs: a smart add box plus "+ Add task" cards on the board.
  - **Second round, the same day:**
    - Tabs are All / Open / Overdue / Done. Planned was dropped. The My Day tab was dropped, and the Today screen was renamed My Day.
    - Due date with an optional time.
    - Several reminders per task: presets (incl. 9 am on the day and the evening before at 9 pm), custom ones and exact times. New tasks get none by default.
    - Repeats have a Custom… screen and end never, on a date, or after N times.
    - Titles move forward with each repeat: months, years, quarters, weeks and dates.
    - Attachments are either 📌 kept on every repeat or this one only (the default). They're named from the task and can be renamed, along with the real file.
    - Repeating tasks show a History of their copies.
- **24 Oct 2026:**
  - The whole app is full width.
  - The task panel is redesigned in Microsoft To Do style cards, with steps first.
  - Ticking any task asks "Done on…" (time optional), and the next repeat is made from that date.
  - Unticking a repeat removes its untouched next copy.
  - Duplicate = "title (copy)" without attachments.
  - Repeats go up to 999, with years in "after I finish it".
  - Sort: 7 orders, also on Board. Group by due date or bucket (List).
  - Sticky top (List: tabs/filters; Board: page fits the window and column names stick).
  - Calendar colours with a legend.
  - Labels are kept.
  - **Later the same day:**
    - Labels can be managed from the panel.
    - The dimming stays when the panel is open, but scrolling works under it.
    - The Done pop-up leaves the time empty, with no tick box.
    - "Done N days late" in orange, with an orange edge on the calendar.
    - Late repeats keep their missed copies; use "after I finish it" to catch up instead.
    - The calendar also marks the day a late task was actually done (faded ✓).
    - "After I finish it" repeats show estimated next dates (↻≈).
- **25 Oct 2026:** late tasks on the calendar.
  - The orange late bar was tried, then removed.
  - Final look: an orange "missed · done 25th" box on the due day, and a done chip with an orange outline ("✓ m · due 24th") on the done day.
  - Done chips use normal-coloured struck text.
  - Notes never get hidden by long names.
  - The Done pop-up has quick choices: Today (Enter) or On the due date (with its time).
  - The strike line sits a little lower (like To Do). Calendar task chips light up and open their panel; the day list has tick boxes.
- **26 Oct 2026:**
  - Repeating tasks get a **moving part** ("Phone bill (Oct 26)") instead of dates moving inside the title. "Oct 26" = October 2026. Existing dated repeating titles were split automatically.
  - Renaming a title renames every copy, past and future.
  - Unticking asks before removing a next copy you changed, instead of quietly keeping it.
    - Labels, progress and start date are all kept.
- **28 Oct 2026:** phone notifications will come from **Microsoft To Do** (stage 1, this computer → To Do, built 29 Oct; see Phone reminders). The phone's own reminder app syncs with To Do, so To Do does the notifying even when the laptop is off.
  - Rejected: an MCP (it connects Claude, not the app), a push service such as ntfy (only holds messages a few days ahead, task names pass through a public service) and a calendar feed (slow refresh, phones drop its alerts).
  - The app keeps a "PA App" list in To Do and never touches other lists. **Every open task** goes, dated or not.
  - Sent: full title (with the moving part), notes, due date (To Do has no due time), the next reminder that hasn't gone off (To Do allows one), high priority as Important, done with its date. Repeats are not sent as repeats, so To Do never makes its own copies; only the current copy is there.
  - Written back: done (with its date, so the next copy is made), title (renames the series), notes, due date (the time is kept), reminder (as an exact-time one), Important, new tasks added to the list. Deleting in To Do only unlinks; it never deletes in the app.
  - Only edit devices sync (on open, after changes, every 5 minutes, "Sync now"). The phone view stays read-only.
  - The link is stored on each task in the data file as a `todo` entry (the To Do ID plus what was last synced, to tell which side changed). Old files keep loading.
  - Sign-in is written into the app (OAuth code flow with PKCE, personal Microsoft accounts, scopes `Tasks.ReadWrite offline_access`), with no library. The client ID is not a secret. Tokens are per device and never go in the data file.
  - Sign-in needs an `https` or `localhost` address, so the laptop uses the GitHub Pages address (installed as an app) instead of opening the file.
  - Steps (checklist) are for later.
