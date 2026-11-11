// The Trash: deleted tasks and notes (after the Undo wait) are kept 30 days to restore. Notes get Undo too. Restoring
// puts a record back as it was (a task's To Do link cleared) and wins over the other device's deletion when the two
// copies are merged. Older data files without a Trash still load; read-only can look but not restore.
const { loadApp, tick, check, done, answer } = require('./helpers');

(async () => {
  const app = loadApp({ storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  const changed = win.eval('changed');
  const Trash = win.eval('Trash');
  const mergeData = win.eval('mergeData');
  win.eval('PendingDelete').UNDO_MS = 50;
  const t = PA.addTask({ title: 'Pay rent' });
  t.todo = { id: 'TD1', base: {} };
  const u = PA.addTask({ title: 'Old done one' });
  PA.Series.tick(u, new Date(), true);
  PA.DB.notes.push({ id: 'n1', title: 'Gift ideas', body: 'A good pen', updated: Date.now() });
  changed('tasks', 'notes');
  doc.querySelector('[data-view="tasks"]').click();

  // --- A deleted task goes to the Trash once the Undo wait is over ---
  doc.querySelector(`#main [data-action="delete-task"][data-id="${t.id}"]`).click();
  check(!PA.DB.trash.length, 'nothing in the Trash while Undo is still possible');
  await tick(100);
  const e = PA.DB.trash.find((x) => x.item.id === t.id);
  check(e && e.kind === 'tasks' && e.item.title === 'Pay rent' && !PA.DB.tasks.some((x) => x.id === t.id), 'then it\'s in the Trash, as it was, and gone from Tasks');
  check(doc.querySelector('#trash-count').textContent === '1' && !doc.querySelector('#trash-count').hidden, 'the sidebar\'s Trash shows how many');

  // --- Notes: Undo, then the Trash ---
  doc.querySelector('[data-view="notes"]').click();
  doc.querySelector('[data-action="delete-note"]').click();
  check(!doc.querySelector('[data-question]') && !doc.querySelector('[data-form="ask"]'), 'deleting a note asks nothing: it offers Undo instead');
  check(!doc.querySelector('#main').textContent.includes('Gift ideas') && PA.DB.notes.length === 1, 'the note disappears at once but isn\'t deleted yet');
  doc.querySelector('#toasts [data-action="undo-delete"]').click();
  check(doc.querySelector('#main').textContent.includes('Gift ideas'), 'Undo brings the note back');
  doc.querySelector('[data-action="delete-note"]').click();
  await tick(100);
  check(PA.DB.trash.some((x) => x.kind === 'notes' && x.item.id === 'n1') && !PA.DB.notes.length, 'without Undo the note goes to the Trash');

  // --- Clear completed goes to the Trash too ---
  doc.querySelector('[data-view="tasks"]').click();
  doc.querySelector('[data-filter="done"]').click();
  doc.querySelector('[data-action="clear-done"]').click();
  check(doc.querySelector('#toasts [data-action="undo-delete"]'), 'Clear completed offers Undo');
  await tick(100);
  check(PA.DB.trash.some((x) => x.item.id === u.id), 'and then the done tasks are in the Trash');

  // --- The Trash screen: restore, delete forever, empty ---
  doc.querySelector('[data-view="trash"]').click();
  const rows = [...doc.querySelectorAll('#main .trash-row')];
  check(rows.length === 3 && /Gone for good in 30 days/.test(rows[0].textContent), 'the Trash lists them, with how long each has left');
  const taskEntry = PA.DB.trash.find((x) => x.item.id === t.id);
  doc.querySelector(`#main [data-action="trash-restore"][data-id="${taskEntry.id}"]`).click();
  const back = PA.DB.tasks.find((x) => x.id === t.id);
  check(back && back.title === 'Pay rent' && !PA.DB.trash.some((x) => x.id === taskEntry.id), 'Restore puts the task back and takes it out of the Trash');
  check(back.todo === null, 'its old To Do link is cleared (To Do links it again, or gets a fresh copy)');
  check(/Restored "Pay rent" to Tasks/.test(doc.querySelector('#toasts').textContent), 'and says where it went');
  const noteEntry = PA.DB.trash.find((x) => x.kind === 'notes');
  doc.querySelector(`#main [data-action="trash-forget"][data-id="${noteEntry.id}"]`).click();
  const q = await answer(win, true);
  check(/forever/.test(q) && !PA.DB.trash.some((x) => x.id === noteEntry.id), 'Delete forever asks, then removes it');
  doc.querySelector('[data-action="trash-empty"]').click();
  await answer(win, true);
  check(!PA.DB.trash.length && /The Trash is empty/.test(doc.querySelector('#main').textContent), 'Empty Trash asks, then clears it');

  // --- Restoring twice never makes two ---
  Trash.add('tasks', [back]);
  Trash.restore(PA.DB.trash[0].id);
  check(PA.DB.tasks.filter((x) => x.id === t.id).length === 1, 'restoring something already back makes no second copy');

  // --- Over 30 days: gone by itself ---
  PA.DB.trash.push({ id: 'old', kind: 'notes', item: { id: 'n0', title: 'Ancient', body: '', updated: 1 }, at: Date.now() - 31 * 864e5 }, { id: 'new', kind: 'notes', item: { id: 'n9', title: 'Recent', body: '', updated: 1 }, at: Date.now() - 864e5 });
  Trash.prune();
  check(!PA.DB.trash.some((x) => x.id === 'old') && PA.DB.trash.some((x) => x.id === 'new'), 'anything over 30 days goes by itself; newer stays');

  // --- Two devices: the Trash merges, and a restore wins over the other device's deletion ---
  const now = Date.now();
  const mine = { tasks: [{ id: 'r1', title: 'Restored here', updated: now }], notes: [], events: [], trash: [{ id: 'tA', kind: 'notes', item: { id: 'x' }, at: now, updated: now }], deleted: [] };
  const theirs = { tasks: [], notes: [], events: [], trash: [{ id: 'tB', kind: 'tasks', item: { id: 'y' }, at: now, updated: now }], deleted: [{ key: 'tasks', id: 'r1', at: now - 5000 }] };
  const m = mergeData(mine, theirs, now);
  check(m.tasks.some((x) => x.id === 'r1'), 'a task restored after the other device deleted it stays');
  check(m.trash.length === 2, 'both devices\' Trash entries are kept');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();

  // --- An older data file with no Trash still loads ---
  const ro = loadApp({ fsa: false });
  await ro.PA.RO.open({ name: 'd.json', text: async () => JSON.stringify({ app: 'PA App', version: 2, saveToken: 't', data: { tasks: [], notes: [], events: [] } }) });
  check(Array.isArray(ro.PA.DB.trash) && ro.PA.DB.trash.length === 0, 'a data file from before the Trash loads (an empty Trash)');
  ro.doc.querySelector('[data-view="trash"]').click();
  check(/The Trash is empty/.test(ro.doc.querySelector('#main').textContent), 'read-only can open the Trash');
  check(['trash-restore', 'trash-forget', 'trash-empty'].every((a) => ro.win.eval('EDIT_ACTIONS').has(a)), 'restoring and deleting forever are edit-only');
  ro.close();
  done();
})();
