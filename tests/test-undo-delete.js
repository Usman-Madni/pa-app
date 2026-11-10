// Redesign stage 3: deleting a task offers Undo. The task is only hidden for a few seconds and really deleted after,
// so nothing (the data file, the other device, To Do) sees a deletion that is taken back. Leaving the page or
// putting it in the background carries it out at once.
const { loadApp, tick, check, done, answer } = require('./helpers');

(async () => {
  const app = loadApp({ storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  const PD = win.eval('PendingDelete');
  PD.UNDO_MS = 60;
  const changed = win.eval('changed');
  const a = PA.addTask({ title: 'Buy stamps' });
  const b = PA.addTask({ title: 'Plan trip' });
  changed('tasks');
  doc.querySelector('[data-view="tasks"]').click();
  const shown = () => [...doc.querySelectorAll('#main .item .tt')].map((x) => x.textContent);
  const marker = (id) => PA.DB.deleted.some((m) => m.key === 'tasks' && m.id === id);

  // --- Delete: hidden at once, with an Undo button; not deleted yet ---
  doc.querySelector(`#main [data-action="delete-task"][data-id="${a.id}"]`).click();
  check(!shown().includes('Buy stamps') && shown().includes('Plan trip'), 'the task disappears from the list at once');
  check(PA.DB.tasks.some((t) => t.id === a.id) && !marker(a.id), 'but it is not deleted yet: still in the data, no deleted marker');
  const undoBtn = doc.querySelector('#toasts [data-action="undo-delete"]');
  check(undoBtn && /Deleted "Buy stamps"/.test(undoBtn.closest('.toast').textContent), 'a message says it was deleted, with Undo');

  // --- Undo: back as it was, nothing recorded ---
  undoBtn.click();
  check(shown().includes('Buy stamps') && !doc.querySelector('#toasts [data-action="undo-delete"]'), 'Undo brings it back and the message goes');
  await tick(120);
  check(PA.DB.tasks.some((t) => t.id === a.id) && !marker(a.id), 'after Undo it stays: never deleted, no marker');

  // --- No Undo: deleted for real a few seconds later ---
  doc.querySelector(`#main [data-action="delete-task"][data-id="${a.id}"]`).click();
  await tick(120);
  check(!PA.DB.tasks.some((t) => t.id === a.id) && marker(a.id), 'without Undo it is really deleted after a few seconds (with its marker)');
  check(!doc.querySelector('#toasts [data-action="undo-delete"]'), 'and the Undo message goes');

  // --- Leaving the page carries it out at once ---
  PD.UNDO_MS = 60000;
  doc.querySelector(`#main [data-action="delete-task"][data-id="${b.id}"]`).click();
  check(PA.DB.tasks.some((t) => t.id === b.id), 'waiting for Undo');
  Object.defineProperty(doc, 'hidden', { value: true, configurable: true });
  doc.dispatchEvent(new win.Event('visibilitychange'));
  check(!PA.DB.tasks.some((t) => t.id === b.id) && marker(b.id), 'the page put in the background: deleted at once');
  Object.defineProperty(doc, 'hidden', { value: false, configurable: true });

  // --- A task with notes still asks first; then Undo as usual ---
  const c = PA.addTask({ title: 'Big project' });
  c.notes = 'lots of notes';
  changed('tasks');
  PA.render();
  doc.querySelector(`#main [data-action="delete-task"][data-id="${c.id}"]`).click();
  const q = await answer(win, true);
  check(/Delete "Big project"\?/.test(q) && !shown().includes('Big project') && doc.querySelector('#toasts [data-action="undo-delete"]'), 'a task with notes asks first, then offers Undo too');
  doc.querySelector('#toasts [data-action="undo-delete"]').click();
  check(shown().includes('Big project') && c.notes === 'lots of notes', 'Undo brings it back with its notes');

  // --- Hidden everywhere while waiting: My Day and the open panel ---
  const d = PA.addTask({ title: 'Call plumber', due: `${PA.toISO(new Date())}T23:58` });
  changed('tasks');
  PA.state.openTask = d.id;
  PA.renderDrawer();
  doc.querySelector('[data-view="today"]').click();
  doc.querySelector(`#main [data-action="delete-task"][data-id="${d.id}"]`).click();
  check(!doc.querySelector('#main').textContent.includes('Call plumber') && !PA.state.openTask, 'on My Day too, and its open panel closes');
  PD.flush();

  // --- The delete buttons show when pointed at (mouse), always on touch ---
  const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('');
  check(/@media \(hover: hover\)\s*\{[^}]*\[data-action="delete-task"\][^}]*opacity:\s*0/.test(css), 'with a mouse, a row\'s delete shows when you point at the row');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();

  // --- Read-only: no delete, no undo ---
  const ro = loadApp({ fsa: false });
  check(ro.win.eval('EDIT_ACTIONS').has('undo-delete') && ro.win.eval('EDIT_ACTIONS').has('delete-task'), 'delete and Undo are edit-only actions');
  ro.close();
  done();
})();
