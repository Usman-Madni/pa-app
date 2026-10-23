// Reminders fire once at the right time; dates never shift by the UTC offset; static rules on the source.
const fs = require('fs');
const { loadApp, APP_FILE, check, done } = require('./helpers');

const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

(async () => {
  const now = Date.now();
  const tasks = [
    { id: 'due', title: 'Due now', due: local(new Date(now - 60000)), priority: 'low', remind: 0, notified: false, done: false },
    { id: 'early', title: 'In 30 min, remind 1h before', due: local(new Date(now + 30 * 60000)), priority: 'low', remind: 60, notified: false, done: false },
    { id: 'later', title: 'In 2h, remind 10m before', due: local(new Date(now + 120 * 60000)), priority: 'low', remind: 10, notified: false, done: false },
    { id: 'off', title: 'No reminder', due: local(new Date(now - 60000)), priority: 'low', remind: -1, notified: false, done: false },
    { id: 'donealready', title: 'Done', due: local(new Date(now - 60000)), priority: 'low', remind: 0, notified: false, done: true },
  ];
  const app = loadApp({ storage: { pa_tasks: JSON.stringify(tasks) } });
  const { win, PA } = app;
  const byId = (id) => PA.DB.tasks.find((t) => t.id === id);
  check(byId('due').notified === true, 'reminder at due time fires');
  check(byId('early').notified === true, '"1 hour before" fires when inside the hour');
  check(byId('later').notified === false, 'future reminder waits');
  check(byId('off').notified === false, 'no reminder -> nothing fires');
  check(byId('donealready').notified === false, 'done tasks never remind');
  const toasts = win.document.querySelector('#toasts').textContent;
  check(toasts.includes('Due now') && toasts.includes('In 30 min'), 'reminder toasts shown');
  const count = win.document.querySelectorAll('.toast').length;
  PA.checkReminders();
  check(win.document.querySelectorAll('.toast').length === count, 'a reminder fires only once');
  check(JSON.parse(win.localStorage.getItem('pa_tasks')).find((t) => t.id === 'due').notified === true, 'fired state is saved');

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
