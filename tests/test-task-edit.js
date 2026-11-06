// TaskEdit, tested through its own interface (no page, no clicks): the due date and what comes with it, renaming
// a repeating task, and starting a repeat.
const { loadApp, tick, check, done } = require('./helpers');

(async () => {
  const app = loadApp();
  const { PA } = app;
  await tick(20);
  const E = PA.TaskEdit;
  const today = new Date();
  const day = (n) => PA.toISO(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n));

  // --- Due date ---
  const a = PA.addTask({ title: 'Dentist', due: `${day(3)}T10:30` });
  a.reminders = [{ id: 'r1', kind: 'before', minutes: 60, fired: true }, { id: 'r2', kind: 'at', at: `${day(1)}T09:00`, fired: true }];
  let res = E.setDue(a, day(5));
  check(res.ok && a.due === `${day(5)}T10:30`, 'a new day keeps the time it had');
  check(!a.reminders[0].fired && a.reminders[1].fired, 'reminders counting from the due date go again; an exact-time one doesn\'t');
  E.setDue(a, day(5), '');
  check(a.due === `${day(5)}T23:59`, 'no time = any time that day');
  E.setDue(a, day(5), '16:00');
  check(a.due === `${day(5)}T16:00`, 'a time');
  E.setDue(a, '');
  check(a.due === '', 'no due date');
  const nd = PA.addTask({ title: 'No date yet' });
  E.setDue(nd, day(2));
  check(nd.due === `${day(2)}T23:59`, 'a first due date is all day');

  // --- Starting to repeat ---
  const b = PA.addTask({ title: 'Pay rent Nov' });
  res = E.setRepeat(b, { freq: 'monthly' });
  check(b.title === 'Pay rent' && b.period === 'Nov', 'a date in the title becomes the moving part');
  check(b.due === `${PA.toISO(today)}T23:59` && /moving part/.test(res.note) && /due date/.test(res.note), 'no due date: today\'s, and both are reported');
  check(b.repeat.freq === 'monthly' && b.repeat.interval === 1 && b.repeat.anchorDay === today.getDate(), 'with its defaults and anchor');
  const w = PA.addTask({ title: 'Swim', due: `${day(1)}T07:00` });
  E.setRepeat(w, { freq: 'weekly' });
  check(w.repeat.days.join() === String(new Date(`${day(1)}T07:00`).getDay()), 'weekly with no days: the due date\'s weekday');
  E.setRepeat(w, { freq: 'daily', interval: 2 });
  check(w.repeat.freq === 'daily' && w.repeat.interval === 2 && w.title === 'Swim', 'changing the repeat replaces it; the title is only split when it starts');
  E.setDue(w, day(9));
  check(w.repeat.anchorDay === new Date(`${day(9)}T00:00`).getDate(), 'a new due date moves the anchor');
  res = E.setDue(w, '');
  check(!res.ok && w.due === `${day(9)}T07:00` && /repeating task needs a due date/.test(res.note), 'a repeating task keeps its due date, and says why');
  E.setRepeat(w, null);
  check(w.repeat === null, 'null stops it');

  // --- Renaming a repeating task ---
  const c = PA.addTask({ title: 'Gym', due: `${day(0)}T23:59` });
  E.setRepeat(c, { freq: 'daily' });
  PA.completeTask(c);
  const c2 = PA.DB.tasks.find((x) => x.id === c.spawnedNext);
  res = E.rename(c2, '  Gym session ');
  check(c.title === 'Gym session' && c2.title === 'Gym session' && res.renamed === 1 && /Renamed 1 other copy/.test(res.note), 'every copy is renamed, and it says how many');
  PA.uncompleteTask(c);
  check(!PA.DB.tasks.includes(c2), 'a rename doesn\'t count as changing the next copy');
  res = E.rename(c, '   ');
  check(!res.ok && c.title === 'Gym session', 'an empty title is refused');
  E.rename(c, 'Gym', 'Week 2');
  check(c.title === 'Gym' && c.period === 'Week 2', 'the moving part can be set with it');

  check(app.errors.length === 0, 'no script errors' + (app.errors.length ? ': ' + app.errors[0] : ''));
  done();
})();
