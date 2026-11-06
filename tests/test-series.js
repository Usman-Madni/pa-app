// Series, tested through its own interface (no page, no clicks, no confirm boxes): ticking makes the next copy once,
// unticking reports what it found, moving a done date, duplicates, and what counts as changing a next copy.
const { loadApp, tick, check, done } = require('./helpers');

(async () => {
  const app = loadApp();
  const { PA } = app;
  await tick(20);
  const S = PA.Series;
  const monthly = { freq: 'monthly', interval: 1, days: [], monthMode: 'date', unit: 'days', until: '', anchorDay: 5 };

  // --- Tick ---
  const m = PA.addTask({ title: 'Elec bill', due: '2026-09-05T23:59' });
  Object.assign(m, { period: 'Aug', repeat: { ...monthly } });
  let res = S.tick(m, new Date(2026, 8, 5, 12), true);
  const sep = res.next;
  check(m.done && m.completedAllDay && sep && PA.fullTitle(sep) === 'Elec bill (Sep)' && sep.due === '2026-10-05T23:59', 'ticking makes the next copy, moving part moved on');
  check(/Next one created/.test(res.note), 'and reports it');
  check(S.tick(m).next === null && PA.DB.tasks.filter((x) => x.seriesId === m.seriesId).length === 2, 'ticking again never makes a second');

  // --- Untick ---
  res = S.untick(m);
  check(res.outcome === 'removed' && !PA.DB.tasks.includes(sep) && m.spawnedNext === '' && !m.done, 'untick: an untouched next copy goes');
  const sep2 = S.tick(m).next;
  sep2.notes = 'meter photo';
  res = S.untick(m);
  check(res.outcome === 'changed' && PA.DB.tasks.includes(sep2) && /\(notes\)\. Remove it anyway\?/.test(res.question) && /stays/.test(res.note), 'a changed one stays, with the question for the panel and a note for To Do');
  S.removeNext(m);
  check(!PA.DB.tasks.includes(sep2) && m.spawnedNext === '', 'removeNext takes it away');
  const sep3 = S.tick(m).next;
  sep3.done = true;
  check(S.untick(m).outcome === 'done' && PA.DB.tasks.includes(sep3), 'a done next copy stays');
  const plain = PA.addTask({ title: 'One-off' });
  S.tick(plain);
  check(S.untick(plain).outcome === 'none' && !plain.done, 'a task that doesn\'t repeat just opens again');

  // --- What counts as a change ---
  const a = PA.addTask({ title: 'Rent', due: '2026-09-01T23:59', reminders: [{ id: 'r', kind: 'before', minutes: 0, fired: false }] });
  a.repeat = { ...monthly, anchorDay: 1 };
  const b = S.tick(a).next;
  b.reminders[0].fired = true;
  b.todo = { id: 'T1', base: {} };
  check(S.untouched(b), 'a reminder going off and a To Do link aren\'t changes');
  S.quietly(b, 'title', 'House rent');
  check(S.untouched(b) && b.title === 'House rent', 'a series rename isn\'t one either');
  b.priority = 'high';
  b.checklist.push({ id: 's', text: 'x', done: false });
  check(S.changes(b) === 'steps, priority', 'changes are named in words');

  // --- Done date of an "after I finish it" repeat ---
  const w = PA.addTask({ title: 'Water plants', due: '2026-10-10T23:59' });
  w.repeat = { freq: 'after', interval: 3, unit: 'days', days: [], monthMode: 'date', until: '' };
  const w2 = S.tick(w, new Date(2026, 9, 15, 12), true).next;
  check(w2.due.startsWith('2026-10-18'), 'counted from the done day');
  res = S.setDone(w, '2026-10-16', '');
  const w3 = PA.DB.tasks.find((x) => x.id === w.spawnedNext);
  check(res.outcome === 'moved' && !PA.DB.tasks.includes(w2) && w3.due.startsWith('2026-10-19') && /moved to/.test(res.note), 'a new done date moves an untouched next copy');
  w3.notes = 'big can';
  w3.reminders = [{ id: 'wr', kind: 'before', minutes: 0, fired: true }];
  res = S.setDone(w, '2026-10-17', '');
  check(res.outcome === 'changed' && w3.due.startsWith('2026-10-19') && /The next copy \(Water plants\) was changed after it was made \(notes, reminders\)\. Move it to .*20.* anyway\?/.test(res.question), 'a changed next copy isn\'t moved: the question says what changed and where to');
  res = S.moveNext(w);
  check(PA.DB.tasks.includes(w3) && w3.due.startsWith('2026-10-20') && w3.notes === 'big can' && !w3.reminders[0].fired && /moved to/.test(res.note), 'moving it anyway changes only its due date (changes kept, reminders count from the new date)');

  // --- Duplicate ---
  const d = PA.addTask({ title: 'Insurance', due: '2026-12-01T23:59', priority: 'high' });
  d.notes = 'Policy';
  d.checklist = [{ id: 'c1', text: 'quotes', done: true }];
  d.attachments = [{ id: 'f1', name: 'p.pdf', file: 'p.pdf', size: 1, type: 'application/pdf' }];
  d.todo = { id: 'T9', base: {} };
  d.progress = 'doing';
  d.myDay = PA.toISO(new Date());
  const c = S.duplicate(d);
  check(c.progress === 'not' && c.myDay === d.myDay, 'a duplicate starts as Not started, and stays in My Day');
  check(PA.DB.tasks[PA.DB.tasks.indexOf(d) + 1] === c && c.title === 'Insurance (copy)' && c.notes === 'Policy' && c.priority === 'high', 'duplicate: next to it, "(copy)", details kept');
  check(c.attachments.length === 0 && !c.checklist[0].done && c.todo === null && c.seriesId === '' && c.id !== d.id, 'no files, steps unticked, no To Do link, its own series');

  check(app.errors.length === 0, 'no script errors' + (app.errors.length ? ': ' + app.errors[0] : ''));
  done();
})();
