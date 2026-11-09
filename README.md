# PA App

Your personal assistant: tasks with reminders, notes and a calendar, with reminders on your phone through Microsoft To Do.

**Open it:** https://usman-madni.github.io/pa-app/ in Chrome. On a computer, install it from Chrome's menu (**⋮ › Cast, save, and share › Install page as app**).

**How to use it:** the **PA App Guide** (**? Guide** in the app's sidebar or Settings, or [`PA App Guide.html`](PA%20App%20Guide.html)) covers everything: tasks, repeats, reminders, phone reminders, the data file and the phone.

## In short
- **One data file**, saved automatically a couple of seconds after every change. Put it in OneDrive. A dated backup is made once a day.
- **The laptop edits.** If the file was saved elsewhere meanwhile, both sides' changes are merged item by item.
- **The phone** signs in to OneDrive (PA App's own folder only) and shows the latest copy. Editing on the phone is coming.
- **Microsoft To Do** carries your tasks and reminders to the phone and brings ticks and edits back.

## For development
```bash
npm run setup
```
```bash
npm test
```
`npm run setup` installs the test tools once, outside the project folder. See `CLAUDE.md` and `PA_APP_CONTEXT.md`.
