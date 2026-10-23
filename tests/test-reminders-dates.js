// Reminders: old single reminders still work, several per task, every kind fires once at the right time,
// all-day tasks, the drawer's reminder controls; and dates never shift by the UTC offset.
const fs = require('fs');
const { loadApp, APP_FILE, submitForm, check, done } = require('./helpers');

const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const day = (d) => local(d).slice(0, 10);

(async () => {
  const now = Date.now();
  // Old-format tasks (one reminder as `remind` minutes + `notified`) must keep working.
  const tasks = [
    { id: 'due', title: 'Due now', due: local(new Date(now - 60000)), priority: 'low', remind: 0, notified: false, done: false },
    { id: 'early', title: 'In 30 min, remind 1h before', due: local(new Date(now + 30 * 60000)), priority: 'low', remind: 60, notified: false, done: false },
    { id: 'later', title: 'In 2h, remind 10m before', due: local(new Date(now + 120 * 60000)), priority: 'low', remind: 10, notified: false, done: false },
    { id: 'off', title: 'No reminder', due: local(new Date(now - 60000)), priority: 'low', remind: -1, notified: false, done: false },
    { id: 'donealready', title: 'Done', due: local(new Date(now - 60000)), priority: 'low', remind: 0, notified: false, done: true },
    { id: 'wasfired', title: 'Already reminded', due: local(new Date(now - 60000)), priority: 'low', remind: 0, notified: true, done: false },
  ];
  const app = loadApp({ storage: { pa_tasks: JSON.stringify(tasks) } });
  const { win, doc, PA } = app;
  const byId = (id) => PA.DB.tasks.find((t) => t.id === id);
  check(byId('early').reminders.length === 1 && byId('early').reminders[0].minutes === 60 && !('remind' in byId('early')), 'an old single reminder becomes one reminder in the list');
  check(byId('off').reminders.length === 0, 'old "no reminder" becomes an empty list');
  check(byId('due').reminders[0].fired === true, 'reminder at due time fires');
  check(byId('early').reminders[0].fired === true, '"1 hour before" fires when inside the hour');
  check(byId('later').reminders[0].fired === false, 'future reminder waits');
  check(byId('donealready').reminders[0].fired === false, 'done tasks never remind');
  const toasts = doc.querySelector('#toasts').textContent;
  check(toasts.includes('Due now') && toasts.includes('In 30 min') && !toasts.includes('Already reminded'), 'reminders shown; an old one that already went off stays quiet');
  const count = doc.querySelectorAll('.toast').length;
  PA.checkReminders();
  check(doc.querySelectorAll('.toast').length === count, 'a reminder fires only once');
  check(JSON.parse(win.localStorage.getItem('pa_tasks')).find((t) => t.id === 'due').reminders[0].fired === true, 'fired state is saved');

  // Every kind, and several on one task
  const yesterday = new Date(now - 864e5);
  const tomorrow = new Date(now + 864e5);
  const t = PA.addTask({ title: 'Pay bill', due: `${day(tomorrow)}T23:59` }); // all-day, due tomorrow
  const atPast = local(new Date(now - 5 * 60000));
  const atFuture = local(new Date(now + 3 * 3600000));
  t.reminders = [
    { id: 'a', kind: 'dayof', daysBefore: 1, time: '00:00', fired: false },   // midnight today: gone → fires
    { id: 'b', kind: 'dayof', daysBefore: 0, time: '09:00', fired: false },   // 9am tomorrow: waits
    { id: 'c', kind: 'at', at: atPast, fired: false },                        // exact, a few minutes ago → fires
    { id: 'd', kind: 'at', at: atFuture, fired: false },                      // exact, later → waits
    { id: 'e', kind: 'before', minutes: 1440 * 2, fired: false },             // 2 days before 9am tomorrow → fires
  ];
  PA.checkReminders();
  const fired = t.reminders.filter((r) => r.fired).map((r) => r.id).join('');
  check(fired === 'ace', `each reminder fires on its own time (got ${fired})`);
  void yesterday;

  // Times worked out correctly
  const rt = (r, due) => win.eval('reminderTime')({ due }, r);
  const T = (s) => new Date(s).getTime();
  check(rt({ kind: 'dayof', daysBefore: 1, time: '21:00' }, '2026-11-05T23:59') === T('2026-11-04T21:00'), '"evening before" = 9:00 pm the day before');
  check(rt({ kind: 'dayof', daysBefore: 0, time: '09:00' }, '2026-11-05T23:59') === T('2026-11-05T09:00'), '"9:00 am on the day"');
  check(rt({ kind: 'before', minutes: 60 }, '2026-11-05T18:00') === T('2026-11-05T17:00'), '"1 hour before" a timed task');
  check(rt({ kind: 'before', minutes: 60 }, '2026-11-05T23:59') === T('2026-11-05T08:00'), 'for an all-day task, "before" counts from 9:00 am');
  check(rt({ kind: 'at', at: '2026-11-01T08:30' }, '') === T('2026-11-01T08:30'), 'an exact-time reminder works even with no due date');

  // Changing the due date re-arms reminders (but not exact-time ones)
  const u = PA.addTask({ title: 'Report', due: '2030-01-10T10:00' });
  u.reminders = [{ id: 'x', kind: 'before', minutes: 0, fired: true }, { id: 'y', kind: 'at', at: '2029-12-01T10:00', fired: true }];
  doc.querySelector('[data-view="tasks"]').click();
  PA.state.openTask = u.id;
  PA.renderDrawer();
  const dd = doc.querySelector('#drawer [data-field="dueDate"]');
  dd.value = '2030-01-12';
  dd.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(u.reminders[0].fired === false && u.reminders[1].fired === true, 'a new due date re-arms its reminders; exact-time ones stay as they were');

  // Drawer controls: presets, custom, remove
  const pick = (v) => { const s = doc.querySelector('#drawer [data-rem-add]'); s.value = v; s.dispatchEvent(new win.Event('change', { bubbles: true })); };
  u.reminders = [];
  PA.renderDrawer();
  pick('b60');
  pick('d1-21:00');
  check(u.reminders.length === 2 && doc.querySelector('#drawer').textContent.includes('1 hour before') && doc.querySelector('#drawer').textContent.includes('Evening before (9:00 pm)'), 'two reminders added from the list');
  pick('custom-before');
  submitForm(win, 'add-reminder', { n: '3', unit: '60' });
  check(u.reminders[2].kind === 'before' && u.reminders[2].minutes === 180 && doc.querySelector('#drawer').textContent.includes('3 hours before'), 'custom "3 hours before"');
  pick('custom-dayof');
  submitForm(win, 'add-reminder', { days: '2', time: '18:00' });
  check(u.reminders[3].kind === 'dayof' && u.reminders[3].daysBefore === 2 && u.reminders[3].time === '18:00', 'custom "2 days before, 6:00 pm"');
  pick('custom-at');
  submitForm(win, 'add-reminder', { at: '2030-01-05T07:45' });
  check(u.reminders[4].kind === 'at' && u.reminders[4].at === '2030-01-05T07:45', 'reminder on an exact date and time');
  doc.querySelector(`#drawer [data-action="delete-reminder"][data-rem="${u.reminders[0].id}"]`).click();
  check(u.reminders.length === 4 && !u.reminders.some((r) => r.minutes === 60), 'a reminder can be removed');
  check(doc.querySelector('#main').textContent.includes('+3'), 'the list shows "+3" for the extra reminders');

  // A reminder needs a due date unless it's an exact time
  const v = PA.addTask({ title: 'Someday' });
  PA.state.openTask = v.id;
  PA.renderDrawer();
  pick('b10');
  check(v.reminders.length === 0 && doc.querySelector('#toasts').textContent.includes('Set a due date first'), 'a "before" reminder needs a due date');
  pick('custom-at');
  submitForm(win, 'add-reminder', { at: '2030-02-01T10:00' });
  check(v.reminders.length === 1, 'an exact-time reminder works without a due date');

  // Late evening must stay on the same calendar day (UTC would roll it back in any timezone ahead of UTC).
  check(PA.toISO(new Date(2026, 9, 23, 23, 59)) === '2026-10-23', 'toISO keeps the local day at 11:59 pm');
  check(PA.toISO(new Date(2026, 9, 23, 0, 5)) === '2026-10-23', 'toISO keeps the local day at 12:05 am');
  app.close();

  // Static rule: never turn toISOString() into a date (it is UTC and shifts the day).
  const src = fs.readFileSync(APP_FILE, 'utf8');
  const bad = src.split('\n').filter((l) => /toISOString\(\)\s*\.(slice|substring|substr|split)/.test(l));
  check(bad.length === 0, 'no toISOString() sliced into a date' + (bad.length ? ': ' + bad[0].trim() : ''));
  done();
})();
