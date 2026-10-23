# PA App — how to work here

Personal assistant (tasks, reminders, notes, calendar) in **one file: `PA App.html`**. Vanilla JS, no build step, no framework.
Background, data model and past decisions: **read `PA_APP_CONTEXT.md` before changing data, saving or the read-only mode.**
Personal working rules live in `CLAUDE.local.md`, which is git-ignored. **This repo is public**: nothing personal goes in tracked files or commit messages.

## Building
- Keep the app one self-contained file. **Ask first** before renaming it, splitting it, adding a build step or a runtime dependency, or changing the shape of stored data (`pa_*` keys or the data file).
- **Dates:** use `toISO(date)` (local `YYYY-MM-DD`). Never slice `.toISOString()` into a date, because it's UTC and shifts the day in any timezone ahead of or behind UTC. `toISOString()` is only for exact instants such as `savedAt`.
- **Two kinds of storage.** Shared data (`pa_tasks`, `pa_notes`, `pa_events`) goes in the data file. Per-device settings (`dev_*`: theme, view, device name, save bookkeeping) never do.
- **Every edit goes through `changed(key)`.** That saves in the browser and queues the data-file save. Don't write `localStorage` directly for data.
- **Read-only devices** (any phone or tablet, browsers without the File System Access API, or `?readonly`) must never change data. New edit actions go in `EDIT_ACTIONS` and get the `edit-only` class.
- **New records** get IDs from `uid()`, never `Date.now()` alone.

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
