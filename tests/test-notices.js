// Notifications: every message is kept with its time for 30 days (in the data file), a count of unread ones in the
// sidebar, a screen listing them newest first by day, a reminder opens its task, Clear all, old data files still
// load, an empty browser stays "empty", and the read-only phone view reads them but never adds or changes any.
const { loadApp, answer, tick, check, done } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  await tick(20);
  const count = () => doc.querySelector('#notice-count');

  // --- Kept, with the time ---
  const before = Date.now();
  win.eval('toast')('Renamed 3 other copies of this task too');
  const n = PA.DB.notices[PA.DB.notices.length - 1];
  check(n && n.text === 'Renamed 3 other copies of this task too' && n.at >= before && !n.read && n.id, 'a message is kept, with when it showed');
  check(JSON.parse(win.localStorage.getItem('pa_notices')).some((x) => x.id === n.id) && PA.DB.exportAll().notices.some((x) => x.id === n.id), 'saved, and part of the data file');
  check(PA.DB.isEmpty(), 'messages alone don\'t make the browser look like it has data');
  PA.render();
  check(!count().hidden && count().textContent === String(PA.DB.notices.filter((x) => !x.read).length), 'the sidebar shows how many are unread');

  // --- A reminder links to its task ---
  const t = PA.addTask({ title: 'Call bank' });
  const pad = (x) => String(x).padStart(2, '0');
  const d = new Date(Date.now() - 60000);
  t.reminders = [{ id: 'r', kind: 'at', at: `${PA.toISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`, fired: false }];
  PA.checkReminders();
  const rem = PA.DB.notices.find((x) => x.text.startsWith('🔔 Call bank'));
  check(rem && rem.task === t.id, 'a reminder\'s message remembers its task');

  // --- Older than 30 days drop off ---
  PA.DB.notices.unshift({ id: 'old', at: Date.now() - 31 * 864e5, text: 'Long ago', read: true });
  win.eval('toast')('Fresh one');
  check(!PA.DB.notices.some((x) => x.id === 'old'), 'older than 30 days: dropped');

  // --- The screen ---
  doc.querySelector('[data-view="notices"]').click();
  const main = doc.querySelector('#main');
  const rows = [...main.querySelectorAll('.notice-row')].map((r) => r.textContent);
  check(main.querySelector('h1').textContent === 'Notifications' && main.querySelector('.notice-day').textContent === 'Today', 'its own screen, grouped by day');
  check(rows[0].includes('Fresh one') && rows[rows.length - 1].includes('Renamed 3 other copies'), 'newest first');
  check(/\d{1,2}:\d{2}\s?(am|pm)/i.test(main.querySelector('.notice-time').textContent), 'each with its time (12-hour clock)');
  check(PA.DB.notices.every((x) => x.read) && count().hidden, 'opening it marks them read; the count goes');
  win.eval('toast')('While looking');
  check(count().hidden && main.textContent.includes('While looking'), 'a new one while the screen is open shows there, already read');
  main.querySelector(`.notice-row.link[data-id="${t.id}"]`).click();
  check(PA.state.openTask === t.id, 'clicking a reminder opens its task');
  PA.state.openTask = null;
  PA.renderDrawer();

  // --- Clear all ---
  main.querySelector('[data-action="clear-notices"]').click();
  await answer(win, true);
  const cleared = PA.DB.notices.length;
  check(cleared === 0 && doc.querySelector('#main .empty')?.textContent === 'No notifications yet', 'Clear all empties the list');

  // --- An old data file (no notifications) still loads ---
  PA.DB.importAll({ tasks: [], notes: [], events: [] });
  check(Array.isArray(PA.DB.notices) && PA.DB.notices.length === 0, 'a data file from before notifications loads with an empty list');
  check(app.errors.length === 0, 'no script errors' + (app.errors.length ? ': ' + app.errors[0] : ''));
  app.close();

  // --- The phone view reads them, never adds ---
  const kept = [{ id: 'k', at: Date.now() - 3600e3, text: 'From the laptop', read: false }];
  const phone = loadApp({ fsa: false });
  await tick(20);
  const fileText = JSON.stringify({ app: 'PA App', version: 2, saveToken: 't', savedAt: new Date().toISOString(), savedFrom: 'Laptop', data: { tasks: [], notes: [], events: [], notices: kept } });
  await phone.PA.RO.open({ name: 'pa-app-data.json', text: async () => fileText });
  phone.win.eval('toast')('Read-only on this device');
  phone.doc.querySelector('[data-view="notices"]').click();
  check(phone.PA.DB.notices.length === 1 && phone.doc.querySelector('#main').textContent.includes('From the laptop'), 'phone: shows the laptop\'s notifications, adds none of its own');
  check(!phone.PA.DB.notices[0].read && phone.doc.querySelector('#notice-count').hidden && !phone.doc.querySelector('#main [data-action="clear-notices"]:not(.edit-only)'), 'phone: changes nothing (no unread count, no Clear all)');
  phone.close();
  done();
})();
