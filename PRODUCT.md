# Butler — product

**What it is.** A personal assistant for one person: tasks (with due dates, reminders, repeats, steps, buckets and
labels), a calendar of tasks and events, notes, and attached files. It is meant to grow into the one place that also
holds personal documents, assets and finances. The file is `PA App.html`; the name people see is **Butler**.

**Who uses it.** Its owner, every day, on a Windows laptop (Chrome, installed as an app) and an Android phone (from the
GitHub Pages link). Reminders reach the phone through Microsoft To Do.

**Mode.** Operate: an app worked in daily. Scanability, consistency and speed come before expression; the character
lives in precise details (type, colour, icons, states), not in decoration.

**What a good day looks like.** Open it, see today (what's due, what's late, what's on) at a glance, add a task in one
line, tick things off, and trust that both devices agree.

**Constraints.**
- One self-contained HTML file, no build step, no runtime dependency (fonts and icons are built in).
- Every feature works on the laptop and the phone; light and dark themes.
- The data model and saving are out of scope for design work (see `PA_APP_CONTEXT.md`).
- The repository is public: nothing personal in design files.
