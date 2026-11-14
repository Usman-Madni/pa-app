# PA App — how to work here

Personal assistant (tasks, reminders, notes, calendar) in **one file: `PA App.html`**. Vanilla JS, no build step, no framework.
The name people see is **Butler**; the file, the data file's `app: 'PA App'` marker, the OneDrive folder and the To Do list keep "PA App". The look follows **`DESIGN.md`** (tokens on `:root` only, icons through `ic(name)`, no emoji as icons); `PRODUCT.md` says what the app is for.
The user's guide is its own file, `PA App Guide.html`, opened from the app (sidebar and Settings). `index.html` is the folder's page: Microsoft returns there after a sign-in and it hands the answer back to PA App (phones need that); opened on its own it goes to PA App. When a feature changes what the user sees, update the guide in the same commit; it's public, so nothing personal.
Background, data model and past decisions: **read `PA_APP_CONTEXT.md` before changing data, saving or the read-only mode.**
Personal working rules live in `CLAUDE.local.md`, which is git-ignored. **This repo is public**: nothing personal goes in tracked files or commit messages.

## Building
- Keep the app one self-contained file. **Ask first** before renaming it, splitting it, adding a build step or a runtime dependency, or changing the shape of stored data (`pa_*` keys or the data file).
- **Dates:** use `toISO(date)` (local `YYYY-MM-DD`). Never slice `.toISOString()` into a date, because it's UTC and shifts the day in any timezone ahead of or behind UTC. `toISOString()` is only for exact instants such as `savedAt`.
- **Two kinds of storage.** Shared data (`pa_tasks`, `pa_notes`, `pa_events`, `pa_buckets`, `pa_labels`, `pa_notices`, `pa_trash`, `pa_people`) goes in the data file.
- **Deleting tasks and notes goes through `PendingDelete`** (Undo, then the record moves to the `Trash` for 30 days). Don't filter `DB.tasks` or `DB.notes` directly to delete. Per-device settings (`dev_*`: theme, view, device name, save bookkeeping) never do.
- **Every edit goes through `changed(key)`.** That saves in the browser and queues the data-file save. Don't write `localStorage` directly for data. It also stamps each changed record's `updated` and marks deletions (`Stamps`), which the merge between devices (`mergeData`) relies on: an edit that skips `changed()` could lose to an older copy.
- **Every feature works on both the laptop and the phone.** A new feature is built for both in the same change (and tested on both); if a part truly can't work on one, say so and ask before leaving it out.
- **Phones** (`state.phone`: any phone or tablet, browsers without the File System Access API, or `?readonly`) reach the data file, attachments and To Do through one OneDrive sign-in (`OD`, which also feeds `TD`) and edit only while signed in, online and with the file read; otherwise they're read-only (`state.readOnly`) and must never change data. `?readonly` is always read-only. New edit actions go in `EDIT_ACTIONS` and get the `edit-only` class; where the two devices do something differently (files, the data file), branch on `state.phone`.
- **Both devices sync the same To Do list.** Never remove a To Do task for a task this device doesn't know (`decideOut` gets the deleted markers), and tasks brought in from To Do get `TD.adoptId`, so the two devices can't delete or double each other's.
- **New records** get IDs from `uid()`, never `Date.now()` alone.
- **Questions use the app's own box:** `await ask(question, {yes, danger})` or `askText(question, value)`, never the browser's `confirm()` / `prompt()` / `alert()` (a test checks). In tests, answer it with `answer(win, yes, text)`.
- **Due date, rename and repeat changes go through `TaskEdit`** (`setDue`, `rename`, `setRepeat`), wherever they come from. It does the follow-up steps and returns a note for the caller to show. Words for things are in `GLOSSARY.md`.
- **Ticking, unticking, done dates and duplicates go through `Series`** (`tick`, `untick`, `setDone`, `duplicate`). It owns the next copy and its `spawnSig` snapshot, and reports what it found; the caller asks or shows the message.
- **To Do sync rules live in `TD.decideIn` / `TD.decideOut`**, which change nothing and talk to nothing; `TD.sync` only carries out their plan. A new rule goes there, with a test in `test-todo-decide.js`.
- **Whose a task, note or event is goes through `People`** (`of`, `mine`, `shows`, `forNew`, `toggle`). A record with no `people` is yours (`'me'`); never assume every record has the field. Lists the screens show must leave out what `People.shows` hides (tasks: `hiddenTask`). Only tasks you're on remind and go to To Do.
- **Reminder rules live in `Reminders`** (when, wording, adding, re-arming, copying, which are due, the one To Do holds). Ask it rather than reading or changing `t.reminders` directly.

## Running commands (keeps permission prompts down)
- Commands already run in the project folder. **Don't start them with `cd "…" &&`**, and don't set shell variables (`F="…"; …`) or chain several steps. Compound commands can't match the allow-list in `.claude/settings.json`, so each one asks for approval.
- One plain command per call, e.g. `npm test`, `node tools/check-private.js`, `git log --oneline -5`. Use the Read/Grep/Edit tools instead of `sed`/`grep` pipelines where they fit.
- Use `gh` from PATH (its read-only commands need no approval), not the full `C:\Program Files\GitHub CLI\gh.exe` path.

## Checking work (minimum bar)
1. `npm test`, which takes seconds. If the test tools are missing, run `npm run setup` (it installs into `%LOCALAPPDATA%\pa-app-testdeps`). **Never run `npm install` inside the project folder** if it's in a synced folder.
2. For a new safeguard, do a **sabotage check**: break it on purpose, confirm a test fails, then restore it.
3. Check in the browser pane: start `node tools/serve.js` (http://localhost:8790), do a fresh page load, and look at both light and dark mode.

## Git
- Work on `master` and commit after every logical change; each commit is an undo point. The message says what changed and why.
- `master` is pushed to the public GitHub repo, and GitHub Pages publishes it live for the phone.
- **Every push is guarded** by a pre-push hook (`npm run install-hooks`, once per computer). It runs `tools/check-private.js` and then `npm test`, and blocks the push if either fails.
  - The check scans every file version and commit message in the whole history for:
    - words listed in `private-terms.txt` (git-ignored)
    - email addresses other than GitHub noreply
    - personal `C:\Users\<name>` paths
    - files that must stay local
    - non-noreply commit emails
  - If it fails, fix the cause. Never bypass it with `--no-verify`.
  - If something private is already in history, ask before rewriting history.
- `core.autocrlf=false` is deliberate. Real data and backups (`pa-app-data*.json`, `PA App Backup *.json`) and `CLAUDE.local.md` / `private-terms.txt` are git-ignored and must never be committed.

## Synced-folder hazards (OneDrive, Google Drive, Dropbox)
- Use one machine at a time. Sync tools make conflict copies named after the PC; if one appears, ask before merging it.
- Files can be locked, stale or online-only placeholders while syncing (git may report "failed to stat"). Re-read before assuming a write failed.
