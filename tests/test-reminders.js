// Reminders, tested through its own interface (no page, no real clock): adding and changing them, what a due date
// change and a copy do to them, which are due at a given moment, and the round trip with To Do (the next one is what
// To Do holds; To Do changing it comes back as an exact time).
const { loadApp, tick, check, done } = require('./helpers');

(async () => {
  const app = loadApp();
  const { PA } = app;
  await tick(20);
  const R = PA.Reminders;
  const at = (k) => new Date(k).getTime();

  // --- Adding and changing ---
  const t = PA.addTask({ title: 'Dentist', due: '2026-11-20T10:30' });
  check(R.add(t, { kind: 'before', minutes: 60 }).ok && t.reminders.length === 1 && t.reminders[0].id && t.reminders[0].fired === false, 'add: gets an id, ready to go off');
  const nd = PA.addTask({ title: 'No date' });
  const res = R.add(nd, { kind: 'dayof', daysBefore: 0, time: '09:00' });
  check(!res.ok && /due date first/.test(res.note) && nd.reminders.length === 0, 'one counting from the due date needs a due date');
  check(R.add(nd, { kind: 'at', at: '2026-11-21T08:00' }).ok, 'an exact-time one doesn\'t');
  const id = t.reminders[0].id;
  t.reminders[0].fired = true;
  R.replace(t, id, { kind: 'dayof', daysBefore: 1, time: '21:00' });
  check(t.reminders[0].id === id && t.reminders[0].kind === 'dayof' && !('minutes' in t.reminders[0]) && !t.reminders[0].fired, 'replace: new settings, same place, old settings gone, ready again');
  check(R.text(t, t.reminders[0]) === 'Evening before (9:00 pm)' && R.time(t, t.reminders[0]) === at('2026-11-19T21:00'), 'its wording and time');

  // --- Due date changes and copies ---
  R.add(t, { kind: 'at', at: '2026-11-18T08:00' });
  t.reminders.forEach((r) => { r.fired = true; });
  R.rearm(t);
  check(!t.reminders[0].fired && t.reminders[1].fired, 'rearm: relative ones go again, exact-time ones don\'t');
  const moved = R.copy(t.reminders, 7, at('2026-11-06T12:00'));
  check(moved.length === 2 && moved.every((r) => !r.fired && !t.reminders.some((x) => x.id === r.id)) && moved[1].at === '2026-11-25T08:00' && moved[0].daysBefore === 1, 'copy: new ids, ready again, exact times moved by the shift');
  const late = R.copy([{ id: 'x', kind: 'at', at: '2026-11-01T08:00', fired: false }], 3, at('2026-11-06T12:00'));
  check(late[0].at === '2026-11-04T08:00' && late[0].fired, 'an exact time still in the past after moving counts as gone off');

  // --- Which are due ---
  const u = PA.addTask({ title: 'Call bank', due: '2026-11-10T15:00' });
  u.reminders = [{ id: 'a', kind: 'before', minutes: 60, fired: false }, { id: 'b', kind: 'before', minutes: 0, fired: false }];
  let due = R.due([u], at('2026-11-10T14:30'));
  check(due.length === 1 && due[0].r.id === 'a' && due[0].at === at('2026-11-10T14:00'), 'due: only those whose time has come, at a given moment');
  check(R.due([u], at('2026-11-10T14:30'), new Set([`${u.id}:a`])).length === 0, 'not ones already shown on a read-only device');
  u.done = true;
  check(R.due([u], at('2026-11-11T00:00')).length === 0, 'never for a done task');

  // --- The To Do round trip ---
  const w = PA.addTask({ title: 'Renew passport', due: '2026-12-01T23:59' });
  w.reminders = [{ id: 'e', kind: 'dayof', daysBefore: 1, time: '21:00', fired: false }, { id: 'f', kind: 'dayof', daysBefore: 0, time: '09:00', fired: false }];
  const now = at('2026-11-06T12:00');
  const held = R.next(w, now);
  check(held === at('2026-11-30T21:00'), 'next: the earliest still to come is what To Do holds');
  R.fromToDo(w, held, at('2026-11-29T18:00'));
  check(w.reminders[0].fired && w.reminders[2] && w.reminders[2].at === '2026-11-29T18:00' && !w.reminders[2].fired, 'changed in To Do: that one is done with, the new time kept as an exact one');
  check(R.next(w, now) === at('2026-11-29T18:00'), 'and To Do then holds the new one (no back-and-forth)');
  R.fromToDo(w, at('2026-11-29T18:00'), null);
  check(R.next(w, now) === at('2026-12-01T09:00'), 'turned off in To Do: skips that one, the next still goes');
  check(R.exact(at('2026-11-01T08:00'), now).fired && !R.exact(at('2026-12-01T08:00'), now).fired, 'an exact time already past counts as gone off');

  check(app.errors.length === 0, 'no script errors' + (app.errors.length ? ': ' + app.errors[0] : ''));
  done();
})();
