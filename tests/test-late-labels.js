// Done late (tasks, panel, history, calendar), late repeats keep their missed copies, no 23:59 on repeat
// previews, managing labels from the panel, the board keeps its scroll after an edit, and the wheel over
// the dimmed area scrolls the board.
const { loadApp, check, done } = require('./helpers');

(async () => {
  const app = loadApp({ storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  const D = (y, m, d, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
  const late = (t) => win.eval('lateText')(t);

  // --- How late ---
  const mk = (o) => PA.normalizeTask({ id: o.title, ...o });
  check(late(mk({ title: 'a', due: '2026-10-01T23:59', done: true, completedAt: D(2026, 10, 20), completedAllDay: true })) === 'Done 19 days late', '19 days late');
  check(late(mk({ title: 'b', due: '2026-10-01T23:59', done: true, completedAt: D(2026, 10, 2) })) === 'Done 1 day late', '1 day late');
  check(late(mk({ title: 'c', due: '2026-10-01T23:59', done: true, completedAt: D(2026, 10, 1, 22) })) === '', 'an all-day task done on its day is on time');
  check(late(mk({ title: 'd', due: '2026-10-01T09:00', done: true, completedAt: D(2026, 10, 1, 15) })) === 'Done late (same day)', 'a timed task done later that day');
  check(late(mk({ title: 'e', due: '2026-10-05T09:00', done: true, completedAt: D(2026, 10, 1) })) === '', 'done early is not late');
  check(late(mk({ title: 'f', due: '', done: true, completedAt: D(2026, 10, 1) })) === '', 'no due date, never late');

  // --- Shown on Tasks, in the panel and History ---
  const t = PA.addTask({ title: 'Pay water bill', due: '2026-10-01T23:59' });
  t.repeat = { freq: 'weekly', interval: 1, days: [4], monthMode: 'date', unit: 'days', until: '' };
  PA.completeTask(t, new Date(2026, 9, 20, 12), true);
  doc.querySelector('[data-view="tasks"]').click();
  doc.querySelector('[data-filter="all"]').click();
  const row = doc.querySelector(`#main [data-action="open-task"][data-id="${t.id}"]`).closest('.item');
  check(row.querySelector('.late') && row.textContent.includes('Done 19 days late'), 'the list shows "Done 19 days late" in orange');
  // Late repeats keep their missed copies (next one from the old due date, already overdue)
  const next = PA.DB.tasks.find((x) => x.id === t.spawnedNext);
  check(next && next.due.startsWith('2026-10-08'), 'a late weekly repeat still makes the missed week (8 Oct), not a catch-up');
  PA.state.openTask = t.id;
  PA.renderDrawer();
  check(doc.querySelector('#drawer .p-sub.late').textContent.includes('19 days late'), 'the panel says it too');
  PA.state.openTask = next.id;
  PA.renderDrawer();
  check(doc.querySelector('#drawer .history .late') && doc.querySelector('#drawer .history').textContent.includes('19 days late'), 'and the History of the next copy');

  // --- Calendar: orange edge and legend; repeat previews show no 23:59 ---
  PA.state.calMonth = new Date(2026, 9, 1);
  PA.state.selectedDay = '2026-10-01';
  doc.querySelector('[data-view="calendar"]').click();
  const chip = [...doc.querySelectorAll('.cal-day[data-day="2026-10-01"] .chip')].find((c) => c.textContent.includes('Pay water bill'));
  check(chip && chip.classList.contains('t-done') && chip.classList.contains('late'), 'calendar: done late is green with an orange edge');
  check(doc.querySelector('.cal-legend').textContent.includes('Done late'), 'the legend has "Done late"');
  const dayRow = [...doc.querySelectorAll('#main .day-item')].find((li) => li.textContent.includes('Pay water bill'));
  check(dayRow && dayRow.classList.contains('late') && dayRow.textContent.includes('Done late'), 'the day list says "Done late"');
  const previews = [...doc.querySelectorAll('.chip.repeat')].filter((c) => c.textContent.includes('Pay water bill'));
  check(previews.length > 0 && previews.every((c) => !/11:59|23:59/.test(c.textContent)), 'upcoming repeats of an all-day task show no 23:59');

  // --- Manage labels from the panel ---
  PA.DB.labels.push({ id: 'l1', name: 'Waiting', color: '#f97316' }, { id: 'l2', name: 'Call', color: '#3b82f6' });
  next.labels = ['l1', 'l2'];
  doc.querySelector('[data-view="tasks"]').click();
  PA.state.openTask = next.id;
  PA.renderDrawer();
  doc.querySelector('#drawer [data-action="manage-labels"]').click();
  check(doc.querySelectorAll('#drawer [data-action="delete-label"]').length === 2, '✎ Manage lists the labels with rename, colour and delete');
  win.prompt = () => 'Waiting on someone';
  doc.querySelector('#drawer [data-action="rename-label"][data-id="l1"]').click();
  check(PA.DB.labels[0].name === 'Waiting on someone' && doc.querySelector('#drawer').textContent.includes('Waiting on someone'), 'rename from the panel');
  const colour = doc.querySelector('#drawer [data-label-color="l2"]');
  colour.value = '#22c55e';
  colour.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(PA.DB.labels[1].color === '#22c55e', 'recolour from the panel');
  let asked = '';
  win.confirm = (m) => { asked = m; return true; };
  doc.querySelector('#drawer [data-action="delete-label"][data-id="l2"]').click();
  check(PA.DB.labels.length === 1 && !next.labels.includes('l2') && PA.DB.tasks.includes(next) && /Delete label "Call"/.test(asked), 'delete from the panel (asks first, keeps the task)');
  doc.querySelector('#drawer [data-action="manage-labels"]').click();
  check(!doc.querySelector('#drawer [data-action="delete-label"]'), '"Done" closes the label list');
  app.close();

  // --- Board keeps its scroll after an edit; wheel over the dim scrolls it ---
  const b = loadApp();
  b.PA.DB.buckets.push({ id: 'x', name: 'Home', order: 1 });
  for (let i = 0; i < 30; i++) b.PA.addTask({ title: `Task ${i}`, bucket: 'x' });
  b.doc.querySelector('[data-view="tasks"]').click();
  const board = () => b.doc.querySelector('#main .board');
  board().scrollTop = 500;
  board().scrollLeft = 120;
  b.PA.state.openTask = b.PA.DB.tasks[3].id;
  b.PA.renderDrawer();
  const pr = b.doc.querySelector('#drawer [data-field="priority"]');
  pr.value = 'high';
  pr.dispatchEvent(new b.win.Event('change', { bubbles: true }));
  check(board().scrollTop === 500 && board().scrollLeft === 120, 'after an edit in the panel the board stays where it was');
  const back = b.doc.querySelector('.drawer-backdrop');
  back.dispatchEvent(new b.win.WheelEvent('wheel', { deltaY: 100, bubbles: true }));
  check(board().scrollTop === 600, 'the mouse wheel over the dimmed area scrolls the board');
  check(b.doc.body.classList.contains('drawer-open'), 'and the panel stays open (the dimming is still there)');
  b.close();
  done();
})();
