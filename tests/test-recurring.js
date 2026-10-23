// Recurring tasks: the date maths (month ends, leap years, every N weeks…), the next copy is made exactly
// once, it resets what should reset, the end date stops it, and the calendar shows upcoming repeats.
const { loadApp, check, done } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const D = (y, m, d) => new Date(y, m - 1, d);
  // next(dueOrNull, repeat, doneOn?) — 2026-10-23 is a Friday.
  const next = (due, repeat, doneOn = D(2026, 10, 23)) => PA.nextDue({ due, repeat }, doneOn);

  // Daily / every N days, time of day kept
  check(next('2026-10-23T09:00', { freq: 'daily', interval: 1 }) === '2026-10-24T09:00', 'daily: next day, same time');
  check(next('2026-10-30T07:15', { freq: 'daily', interval: 3 }) === '2026-11-02T07:15', 'every 3 days crosses into next month');
  check(next('2026-12-31T09:00', { freq: 'daily', interval: 1 }) === '2027-01-01T09:00', 'daily crosses into next year');

  // Weekdays
  check(next('2026-10-23T09:00', { freq: 'weekdays' }) === '2026-10-26T09:00', 'weekdays: Friday → Monday');
  check(next('2026-10-24T09:00', { freq: 'weekdays' }) === '2026-10-26T09:00', 'weekdays: Saturday → Monday');
  check(next('2026-10-26T09:00', { freq: 'weekdays' }) === '2026-10-27T09:00', 'weekdays: Monday → Tuesday');

  // Weekly on chosen days, and every N weeks
  check(next('2026-10-26T09:00', { freq: 'weekly', interval: 1, days: [1, 3] }) === '2026-10-28T09:00', 'weekly Mon+Wed: Mon → Wed');
  check(next('2026-10-28T09:00', { freq: 'weekly', interval: 1, days: [1, 3] }) === '2026-11-02T09:00', 'weekly Mon+Wed: Wed → next Mon');
  check(next('2026-10-26T09:00', { freq: 'weekly', interval: 2, days: [1] }) === '2026-11-09T09:00', 'every 2 weeks on Mon skips a week');
  check(next('2026-10-26T09:00', { freq: 'weekly', interval: 2, days: [1, 5] }) === '2026-10-30T09:00', 'every 2 weeks Mon+Fri: Mon → Fri same week');
  check(next('2026-10-30T09:00', { freq: 'weekly', interval: 2, days: [1, 5] }) === '2026-11-09T09:00', 'every 2 weeks Mon+Fri: Fri → Mon two weeks on');
  check(next('2026-10-23T09:00', { freq: 'weekly', interval: 1, days: [] }) === '2026-10-30T09:00', 'weekly with no days picked repeats on the same weekday');

  // Monthly by date — the 31st stays the 31st after short months
  check(next('2026-01-31T09:00', { freq: 'monthly', interval: 1, monthMode: 'date', anchorDay: 31 }) === '2026-02-28T09:00', 'monthly on the 31st: Jan 31 → Feb 28');
  check(next('2026-02-28T09:00', { freq: 'monthly', interval: 1, monthMode: 'date', anchorDay: 31 }) === '2026-03-31T09:00', 'monthly on the 31st: Feb 28 → Mar 31 (not stuck on 28)');
  check(next('2028-01-30T09:00', { freq: 'monthly', interval: 1, monthMode: 'date', anchorDay: 30 }) === '2028-02-29T09:00', 'monthly on the 30th in a leap year → Feb 29');
  check(next('2026-11-15T09:00', { freq: 'monthly', interval: 3, monthMode: 'date', anchorDay: 15 }) === '2027-02-15T09:00', 'every 3 months crosses into next year');

  // Monthly by weekday
  check(next('2026-10-30T09:00', { freq: 'monthly', interval: 1, monthMode: 'weekday', weekday: 5, nth: -1 }) === '2026-11-27T09:00', 'last Friday of the month');
  check(next('2026-10-13T09:00', { freq: 'monthly', interval: 1, monthMode: 'weekday', weekday: 2, nth: 2 }) === '2026-11-10T09:00', 'second Tuesday of the month');
  check(next('2026-12-01T09:00', { freq: 'monthly', interval: 1, monthMode: 'weekday', weekday: 2, nth: 1 }) === '2027-01-05T09:00', 'first Tuesday, into next year');

  // Yearly with Feb 29
  const leap = { freq: 'yearly', interval: 1, anchorDay: 29 };
  check(next('2028-02-29T09:00', leap) === '2029-02-28T09:00', 'yearly from Feb 29 → Feb 28 in a normal year');
  check(next('2031-02-28T09:00', leap) === '2032-02-29T09:00', '…and back to Feb 29 in the next leap year');

  // After completion
  check(next('2026-10-20T18:00', { freq: 'after', interval: 3, unit: 'days' }, D(2026, 10, 25)) === '2026-10-28T18:00', '3 days after I finish (finished late) counts from the finish day');
  check(next('2026-01-31T09:00', { freq: 'after', interval: 1, unit: 'months' }, D(2026, 1, 31)) === '2026-02-28T09:00', '1 month after finishing on Jan 31 → Feb 28');
  check(next('', { freq: 'after', interval: 2, unit: 'weeks' }, D(2026, 10, 23)) === '2026-11-06', '2 weeks after finishing, no due date');

  // End date
  check(next('2026-10-30T09:00', { freq: 'daily', interval: 1, until: '2026-10-31' }) === '2026-10-31T09:00', 'repeats up to the end date');
  check(next('2026-10-31T09:00', { freq: 'daily', interval: 1, until: '2026-10-31' }) === null, 'no repeat after the end date');

  // Text
  check(PA.repeatText({ freq: 'weekly', interval: 2, days: [1, 5] }) === 'Every 2 weeks on Mon, Fri', 'repeat described in words');
  check(PA.repeatText({ freq: 'monthly', interval: 1, monthMode: 'weekday', nth: -1, weekday: 5 }) === 'Monthly on the last Friday', 'monthly weekday described');

  // --- In the app: set up a repeat in the drawer, tick it off ---
  const t = PA.addTask({ title: 'Water plants' });
  t.start = '';
  t.checklist = [{ id: 's1', text: 'Balcony', done: true }];
  win.document.querySelector('[data-view="tasks"]').click();
  doc.querySelector(`[data-action="open-task"][data-id="${t.id}"]`).click();
  const freq = doc.querySelector('#drawer [data-repeat="freq"]');
  freq.value = 'weekly';
  freq.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(t.repeat && t.repeat.freq === 'weekly' && t.due.endsWith('T09:00'), 'choosing a repeat with no due date sets one (today 9:00)');
  const todayDow = new Date().getDay();
  check(t.repeat.days.length === 1 && t.repeat.days[0] === todayDow, 'weekly starts on the due date\'s weekday');
  const other = (todayDow + 3) % 7;
  doc.querySelector(`#drawer [data-action="repeat-day"][data-weekday="${other}"]`).click();
  check(t.repeat.days.includes(other) && t.repeat.days.length === 2, 'a second weekday can be added');
  doc.querySelector(`#drawer [data-action="repeat-day"][data-weekday="${other}"]`).click();
  doc.querySelector(`#drawer [data-action="repeat-day"][data-weekday="${todayDow}"]`).click();
  check(t.repeat.days.length === 1, 'the last weekday cannot be removed');
  check(doc.querySelector('#drawer').textContent.includes('the next one is due'), 'drawer tells you when the next one will be');
  check(doc.querySelector('#main').textContent.includes('↻ Weekly'), 'list shows the repeat');

  // Set a start date 2 days before due, then tick it off
  const dueDay = new Date(t.due.slice(0, 10) + 'T00:00');
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  t.start = iso(new Date(dueDay.getFullYear(), dueDay.getMonth(), dueDay.getDate() - 2));
  t.notified = true;
  t.myDay = iso(new Date());
  t.progress = 'doing';
  const before = PA.DB.tasks.length;
  doc.querySelector(`#drawer [data-action="toggle-task"]`).click();
  const copy = PA.DB.tasks[PA.DB.tasks.length - 1];
  check(PA.DB.tasks.length === before + 1 && copy.title === 'Water plants' && !copy.done, 'ticking it off creates the next one');
  const expected = new Date(dueDay.getFullYear(), dueDay.getMonth(), dueDay.getDate() + 7);
  check(copy.due === iso(expected) + 'T09:00', 'next one is a week later, same time');
  check(copy.start === iso(new Date(expected.getFullYear(), expected.getMonth(), expected.getDate() - 2)), 'start date keeps the same gap before due');
  check(copy.checklist[0].done === false && copy.checklist[0].id !== 's1', 'checklist is unticked on the new one');
  check(copy.notified === false && copy.myDay === '' && copy.progress === 'not', 'reminder, My Day and progress reset on the new one');
  check(copy.seriesId === t.id && t.spawnedNext === copy.id, 'both belong to the same series');
  check(t.done && t.completedAt > 0, 'the original is done');

  // Untick and tick again → no second copy
  t.done = false;
  PA.completeTask(t);
  check(PA.DB.tasks.length === before + 1, 're-ticking never makes a second copy');

  // Calendar shows upcoming repeats (not saved as tasks)
  const following = new Date(expected.getFullYear(), expected.getMonth(), expected.getDate() + 7); // the repeat after the copy
  PA.state.calMonth = new Date(following.getFullYear(), following.getMonth(), 1);
  win.document.querySelector('[data-view="calendar"]').click();
  const chips = [...doc.querySelectorAll('.chip.repeat')];
  check(chips.length >= 1 && chips[0].textContent.includes('Water plants'), 'calendar shows upcoming repeats');
  check(PA.DB.tasks.length === before + 1, 'upcoming repeats are only shown, not saved');

  // Turning repeat off
  win.document.querySelector('[data-view="tasks"]').click();
  doc.querySelector(`[data-action="open-task"][data-id="${copy.id}"]`).click();
  const f2 = doc.querySelector('#drawer [data-repeat="freq"]');
  f2.value = '';
  f2.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(copy.repeat === null, 'repeat can be turned off');
  const n2 = PA.DB.tasks.length;
  doc.querySelector(`#drawer [data-action="toggle-task"]`).click();
  check(PA.DB.tasks.length === n2, 'a non-repeating task makes no copy');

  // Monthly "31st" anchor survives being spawned
  const m = PA.addTask({ title: 'Rent', due: '2027-01-31T10:00' });
  m.repeat = { freq: 'monthly', interval: 1, monthMode: 'date', days: [], unit: 'days', until: '' };
  m.repeat.anchorDay = 31;
  const feb = PA.completeTask(m);
  const mar = PA.completeTask(feb);
  check(feb.due === '2027-02-28T10:00' && mar.due === '2027-03-31T10:00', 'the 31st comes back after February, copy after copy');
  app.close();
  done();
})();
