// Ticking asks "Done on…", unticking a repeat removes an untouched next copy, the done date can be changed
// (and moves an untouched "after I finish" copy), duplicating, years in "after", and the 999 limit.
const { loadApp, confirmDone, check, done } = require('./helpers');

(async () => {
  const app = loadApp({ storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  const modal = () => doc.querySelector('#modal form[data-form="done-date"]');
  const tickBox = (id) => doc.querySelector(`#main [data-action="toggle-task"][data-id="${id}"]`).click();
  doc.querySelector('[data-view="tasks"]').click();

  // --- The pop-up ---
  const a = PA.addTask({ title: 'Post the letter' });
  PA.render();
  tickBox(a.id);
  check(modal() && !a.done, 'ticking opens "Done on…" and does not tick yet');
  check(modal().elements.date.value === PA.toISO(new Date()) && modal().elements.time.value === '', 'it starts at today, with the time left empty');
  check(!modal().elements.notime, 'there is no "No time" tick box');
  check(doc.activeElement === modal().querySelector('[data-when="today"]'), '"Today" has the focus, so Enter ticks it off today');
  check(!modal().querySelector('[data-when="due"]'), 'no "On the due date" when there is no due date');
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }));
  check(!modal() && !a.done, 'Esc cancels; the task stays not done');
  tickBox(a.id);
  modal().querySelector('[data-action="done-cancel"]').click();
  check(!modal() && !a.done, 'Cancel does the same');
  tickBox(a.id);
  confirmDone(win, { date: '2026-10-20', time: '08:15' });
  const at = new Date(a.completedAt);
  check(a.done && PA.toISO(at) === '2026-10-20' && at.getHours() === 8 && at.getMinutes() === 15 && !a.completedAllDay, 'a chosen date and time are recorded');
  const b = PA.addTask({ title: 'Return library book' });
  PA.render();
  tickBox(b.id);
  confirmDone(win, { date: '2026-10-21' });
  check(b.done && b.completedAllDay && PA.toISO(new Date(b.completedAt)) === '2026-10-21', 'leaving the time empty = done on that date, no time');

  // --- Quick choices ---
  const q1 = PA.addTask({ title: 'Quick today', due: '2026-10-01T23:59' });
  PA.render();
  tickBox(q1.id);
  modal().querySelector('[data-when="today"]').click();
  check(q1.done && q1.completedAllDay && PA.toISO(new Date(q1.completedAt)) === PA.toISO(new Date()), '"Today" ticks it off today, no time');
  const q2 = PA.addTask({ title: 'Quick due', due: '2026-10-02T23:59' });
  PA.render();
  tickBox(q2.id);
  const dueBtn = modal().querySelector('[data-when="due"]');
  check(dueBtn && /On the due date/.test(dueBtn.textContent), 'a past due date offers "On the due date"');
  dueBtn.click();
  check(q2.done && PA.toISO(new Date(q2.completedAt)) === '2026-10-02' && win.eval('lateDays')(q2) === 0, '"On the due date" ticks it off then — on time, not late');
  const q3 = PA.addTask({ title: 'Quick timed', due: '2026-10-03T18:30' });
  PA.render();
  tickBox(q3.id);
  modal().querySelector('[data-when="due"]').click();
  const q3at = new Date(q3.completedAt);
  check(q3at.getHours() === 18 && q3at.getMinutes() === 30 && !q3.completedAllDay && win.eval('lateDays')(q3) === 0, 'with a due time, it uses that time');
  const q4 = PA.addTask({ title: 'Due today', due: `${PA.toISO(new Date())}T23:59` });
  PA.render();
  tickBox(q4.id);
  check(!modal().querySelector('[data-when="due"]'), 'due today → only "Today"');
  modal().querySelector('[data-action="done-cancel"]').click();

  // --- "Again after I finish it" counts from the chosen done date; years work; 999 allowed ---
  const w = PA.addTask({ title: 'Water plants', due: '2026-10-10T23:59' });
  w.repeat = { freq: 'after', interval: 3, unit: 'days', days: [], monthMode: 'date', until: '' };
  PA.render();
  tickBox(w.id);
  confirmDone(win, { date: '2026-10-15' });
  const w2 = PA.DB.tasks.find((x) => x.id === w.spawnedNext);
  check(w2 && w2.due.startsWith('2026-10-18'), 'next copy counted from the done date (15th + 3 days = 18th)');
  check(PA.nextDue({ due: '', repeat: { freq: 'after', interval: 2, unit: 'years' } }, new Date(2026, 1, 28)) === '2028-02-28', '"2 years after I finish it"');
  check(PA.nextDue({ due: '2026-01-01T09:00', repeat: { freq: 'daily', interval: 500 } }) === '2027-05-16T09:00', 'repeats can be more than 99 apart (every 500 days)');

  // --- Changing the done date moves an untouched "after" copy ---
  PA.state.openTask = w.id;
  PA.renderDrawer();
  const dd = doc.querySelector('#drawer [data-field="doneDate"]');
  check(dd && dd.value === '2026-10-15', 'a done task shows its done date in the panel');
  dd.value = '2026-10-16';
  dd.dispatchEvent(new win.Event('change', { bubbles: true }));
  const w3 = PA.DB.tasks.find((x) => x.id === w.spawnedNext);
  check(w3 && w3.due.startsWith('2026-10-19') && !PA.DB.tasks.includes(w2), 'the untouched next copy moves with it (now the 19th)');
  // If the next copy was changed, it stays put
  w3.notes = 'bring the big can';
  dd.value === '2026-10-16';
  const dd2 = doc.querySelector('#drawer [data-field="doneDate"]');
  dd2.value = '2026-10-17';
  dd2.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(PA.DB.tasks.includes(w3) && w3.due.startsWith('2026-10-19'), 'a next copy you changed stays as it is');

  // --- Unticking a repeat removes an untouched next copy ---
  doc.querySelector('[data-filter="all"]').click(); // done tasks are on the All tab
  const m = PA.addTask({ title: 'Aug elec bill', due: '2026-09-05T23:59' });
  m.repeat = { freq: 'monthly', interval: 1, days: [], monthMode: 'date', unit: 'days', until: '', anchorDay: 5 };
  PA.completeTask(m);
  const sep = PA.DB.tasks.find((x) => x.id === m.spawnedNext);
  check(sep && sep.title === 'Sep elec bill', 'ticking makes the next copy');
  sep.reminders = [{ id: 'r', kind: 'before', minutes: 0, fired: false }];
  sep.spawnSig = win.eval('taskSig')(sep); // as if made with that reminder
  sep.reminders[0].fired = true; // a reminder going off isn't "changing" it
  PA.render();
  tickBox(m.id); // untick
  check(!m.done && !PA.DB.tasks.includes(sep) && m.spawnedNext === '', 'unticking removes the untouched next copy');
  check(doc.querySelector('#toasts').textContent.includes('Removed the next copy'), 'and says so');
  PA.completeTask(m);
  const sep2 = PA.DB.tasks.find((x) => x.id === m.spawnedNext);
  check(sep2 && PA.DB.tasks.filter((x) => x.title === 'Sep elec bill').length === 1, 'ticking again makes just one new copy');
  sep2.checklist.push({ id: 's', text: 'check meter', done: false }); // changed
  PA.render();
  tickBox(m.id);
  check(PA.DB.tasks.includes(sep2) && doc.querySelector('#toasts').textContent.includes('The next copy stays'), 'a next copy you changed is kept (and it says so)');

  // --- Duplicate ---
  const d = PA.addTask({ title: 'Renew car insurance', due: '2026-12-01T23:59', priority: 'high' });
  d.notes = 'Policy 1234';
  d.checklist = [{ id: 'c1', text: 'get quotes', done: true }];
  d.reminders = [{ id: 'r1', kind: 'dayof', daysBefore: 1, time: '21:00', fired: true }];
  d.attachments = [{ id: 'f1', name: 'policy.pdf', file: 'policy.pdf', size: 1, type: 'application/pdf' }];
  d.repeat = { freq: 'yearly', interval: 1, days: [], monthMode: 'date', unit: 'days', until: '', anchorDay: 1 };
  d.seriesId = d.id;
  PA.render();
  PA.state.openTask = d.id;
  PA.renderDrawer();
  doc.querySelector('#drawer [data-action="duplicate-task"]').click();
  const c = PA.DB.tasks[PA.DB.tasks.indexOf(d) + 1];
  check(c && c.title === 'Renew car insurance (copy)' && PA.state.openTask === c.id, 'Duplicate makes "title (copy)" next to it and opens it');
  check(c.notes === 'Policy 1234' && c.priority === 'high' && c.due === d.due && c.repeat.freq === 'yearly', 'notes, priority, due date and repeat are copied');
  check(c.attachments.length === 0, 'attachments are not copied');
  check(c.checklist[0].done === false && c.checklist[0].id !== 'c1' && c.reminders[0].fired === false, 'checklist unticked, reminders ready again');
  check(c.seriesId === '' && !c.done, 'the copy starts its own series');

  // --- Full width ---
  const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('');
  check(!/\.main\s*\{[^}]*max-width/.test(css), 'no screen is narrowed (full width everywhere)');
  app.close();
  done();
})();
