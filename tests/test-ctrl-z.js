// Ctrl+Z (Undo): undoes the last change of any kind, a few steps back. Each changed() is a step; undoing puts the
// records back and saves through changed() (stamped newer, so it wins the merge). A delete still waiting for its own
// Undo is undone first. Messages aren't steps; a file's move isn't a step; a step that took a file away can't be
// undone; a record changed since (the other device) is left as it is. Not while typing in a box.
const { loadApp, tick, check, done } = require('./helpers');

(async () => {
  const app = loadApp({ storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  const Undo = win.eval('Undo');
  const changed = win.eval('changed');
  const TaskEdit = win.eval('TaskEdit');
  const PD = win.eval('PendingDelete');
  Undo.JOIN_MS = 0; // each change its own step (joining is checked below)
  const z = (target = doc.body) => { const e = new win.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }); target.dispatchEvent(e); return e.defaultPrevented; };
  const said = () => [...doc.querySelectorAll('#toasts .toast')].map((t) => t.textContent).pop() || '';
  const task = (id) => PA.DB.tasks.find((t) => t.id === id);
  await tick(20);

  // --- A rename, undone ---
  const a = PA.addTask({ title: 'Pay the bill' });
  TaskEdit.rename(a, 'Pay the electricity bill');
  changed('tasks');
  const stamp = a.updated;
  await tick(5);
  check(z() === true, 'Ctrl+Z is taken by Butler (not the browser)');
  check(task(a.id).title === 'Pay the bill', 'Ctrl+Z puts the old name back');
  check(/Undone: the change to "Pay the electricity bill"/.test(said()), 'and says what it undid');
  check(task(a.id).updated > stamp, 'the restored task is stamped newer, so it wins the merge with the other device');

  // --- Adding, undone; a few steps back ---
  z();
  check(!task(a.id) && PA.DB.deleted.some((m) => m.id === a.id), 'the next Ctrl+Z takes back adding it (with its deleted marker)');
  let b = PA.addTask({ title: 'One' });
  b.priority = 'high'; changed('tasks');
  b.notes = 'two'; changed('tasks');
  z(); z();
  check(task(b.id).priority === 'low' && task(b.id).notes === '', 'two Ctrl+Z: two steps back');

  // --- Typing pauses in the same task join into one step ---
  Undo.JOIN_MS = 5000;
  b.notes = 'Call'; changed('tasks');
  b.notes = 'Call the'; changed('tasks');
  b.notes = 'Call the bank'; changed('tasks');
  z();
  check(task(b.id).notes === '', 'quick edits to the same task are one step');
  Undo.JOIN_MS = 0;

  // --- A delete waiting for its own Undo: Ctrl+Z cancels it ---
  PD.UNDO_MS = 60000;
  doc.querySelector('[data-view="tasks"]').click();
  doc.querySelector(`#main [data-action="delete-task"][data-id="${b.id}"]`).click();
  check(PD.has(b.id), '(deleting, Undo waiting)');
  z();
  check(!PD.has(b.id) && task(b.id) && !doc.querySelector('#toasts [data-action="undo-delete"]'), 'Ctrl+Z cancels a delete still waiting');

  // --- A delete carried out: back from the Bin ---
  PD.UNDO_MS = 20;
  doc.querySelector(`#main [data-action="delete-task"][data-id="${b.id}"]`).click();
  await tick(80);
  check(!task(b.id) && PA.DB.trash.some((e) => e.item && e.item.id === b.id), '(deleted, in the Bin)');
  z();
  check(task(b.id) && !PA.DB.trash.some((e) => e.item && e.item.id === b.id), 'Ctrl+Z brings a deleted task back, out of the Bin');
  check(/Undone: deleting "One"/.test(said()), 'and says so');
  b = task(b.id); // (brought back from the Bin: a new object)

  // --- Messages aren't steps ---
  b.title = 'Uno'; changed('tasks');
  win.eval('Notices').add('Something happened');
  z();
  check(task(b.id).title === 'One' && PA.DB.notices.some((n) => n.text === 'Something happened'), 'a message isn\'t a step: Ctrl+Z skips to the last real change');

  // --- Changed since on the other device: left as it is ---
  b.title = 'Laptop name'; changed('tasks');
  b.title = 'Phone name'; win.eval('Stamps').reset(); // as a merge brings in the other device's change
  z();
  check(task(b.id).title === 'Phone name' && /changed since/.test(said()), 'a task changed since on the other device is left as it is, and it says so');

  // --- Files: a move isn't a step; a removed file can't come back ---
  b.attachments = [{ id: 'f1', name: 'a.pdf', file: 'Me/Tasks/a.pdf', original: 'a.pdf' }]; changed('tasks');
  b.title = 'Renamed with a file'; changed('tasks');
  win.eval('Files').repoint('Me/Tasks/a.pdf', 'Me/Tasks/One/a.pdf'); changed('tasks');
  z();
  check(task(b.id).title === 'Phone name' && task(b.id).attachments[0].file === 'Me/Tasks/One/a.pdf', 'a file\'s move isn\'t a step: Ctrl+Z undoes the rename and the file stays where it is now');
  b.attachments = []; changed('tasks');
  z();
  check(task(b.id).attachments.length === 0 && /Can't undo/.test(said()), 'removing a file can\'t be undone (the file is gone): it says so');

  // --- Not in a box you're typing in, nor with a pop-up open ---
  b.title = 'Typed'; changed('tasks');
  const box = doc.createElement('input');
  doc.body.append(box);
  check(z(box) === false && task(b.id).title === 'Typed', 'in a box, Ctrl+Z is the box\'s own undo');
  box.remove();
  z();
  check(task(b.id).title === 'Phone name', 'outside it, Butler\'s');

  // --- Nothing left ---
  Undo.steps = [];
  z();
  check(/Nothing to undo/.test(said()), 'with nothing left it says so');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();

  // --- Read-only: nothing is undone ---
  const ro = loadApp({ query: '?readonly' });
  await tick(20);
  check(ro.win.eval('Undo').undo && (await ro.win.eval('Undo').undo()) === false, 'read-only: nothing to undo, nothing changed');
  ro.close();
  done();
})();
