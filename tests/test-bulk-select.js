// Selecting several tasks on Tasks (laptop and phone): Select, tap tasks, then Mark done, Move to a bucket or Delete
// (one Undo for all). Selecting never ticks or opens a task; it ends with Cancel, Esc or leaving the screen.
const { loadApp, tick, check, done, answer } = require('./helpers');

(async () => {
  const app = loadApp({ storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  const changed = win.eval('changed');
  win.eval('PendingDelete').UNDO_MS = 60;
  PA.DB.buckets.push({ id: 'b1', name: 'Home', order: 1 }, { id: 'b2', name: 'Work', order: 2 });
  const [a, b, c, d] = ['Pay rent', 'Buy milk', 'Call bank', 'Gym'].map((title) => PA.addTask({ title }));
  d.repeat = { freq: 'daily', interval: 1, days: [], monthMode: 'date', until: '' };
  d.due = `${PA.toISO(new Date())}T23:59`;
  changed('tasks', 'buckets');
  doc.querySelector('[data-view="tasks"]').click();
  const click = (sel) => doc.querySelector(sel).dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  const pick = (t) => click(`#main .body[data-action="select-task"][data-id="${t.id}"]`);

  // --- Select mode: tapping selects, never ticks or opens ---
  click('[data-action="select-mode"]');
  check(doc.querySelector('.select-bar') && /Tap tasks to select/.test(doc.querySelector('.select-count').textContent), 'Select shows the bar');
  check(!doc.querySelector('#main form.quick-add'), 'quick add steps aside while selecting');
  pick(a);
  click(`#main .check[data-action="select-task"][data-id="${b.id}"]`);
  check(/2 tasks selected/.test(doc.querySelector('.select-count').textContent) && !PA.state.openTask && !a.done && !b.done, 'tapping a task or its box selects it: nothing opens or gets ticked');
  pick(b);
  check(/1 task selected/.test(doc.querySelector('.select-count').textContent), 'tapping again unselects');
  check(doc.querySelector(`#main .select-row.selected [data-id="${a.id}"]`), 'a selected task is marked');

  // --- Move to a bucket ---
  pick(c);
  const move = doc.querySelector('[data-input="bulk-bucket"]');
  move.value = 'b2';
  move.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(a.bucket === 'b2' && c.bucket === 'b2' && b.bucket !== 'b2' && !PA.state.selecting, 'Move to puts the selected tasks in that bucket and ends selecting');
  check(/Moved 2 tasks to Work/.test(doc.querySelector('#toasts').textContent), 'and says so');

  // --- Mark done (a repeating one makes its next copy) ---
  click('[data-action="select-mode"]');
  pick(a); pick(d);
  click('[data-action="bulk-done"]');
  check(a.done && d.done && !b.done, 'Mark done ticks off the selected tasks');
  check(PA.DB.tasks.some((t) => t.seriesId && t.seriesId === d.seriesId && !t.done), 'a repeating one makes its next copy, as a single tick would');
  check(/Marked 2 tasks done, 1 next copy made/.test(doc.querySelector('#toasts').textContent), 'it says what happened');

  // --- Delete: one Undo for all; tasks with notes ask first ---
  click('[data-filter="all"]');
  click('[data-action="select-mode"]');
  click('[data-action="select-all"]');
  const all = PA.DB.tasks.length;
  check(new RegExp(`${all} tasks selected`).test(doc.querySelector('.select-count').textContent), 'Select all picks every task shown');
  click('[data-action="select-all"]');
  check(/Tap tasks to select/.test(doc.querySelector('.select-count').textContent), 'and again picks none');
  pick(b); pick(c);
  c.notes = 'account number';
  click('[data-action="bulk-delete"]');
  const q = await answer(win, true);
  check(/Delete 2 tasks\? One has notes/.test(q), 'a selection with notes asks first');
  check(PA.DB.tasks.some((t) => t.id === b.id) && !doc.querySelector(`#main [data-id="${b.id}"]`), 'deleted ones hide at once (not deleted yet)');
  const undo = doc.querySelector('#toasts [data-action="undo-delete"]');
  check(undo && /Deleted 2 tasks/.test(undo.closest('.toast').textContent), 'one message, one Undo for both');
  undo.click();
  check(doc.querySelector(`#main [data-id="${b.id}"]`) && doc.querySelector(`#main [data-id="${c.id}"]`), 'Undo brings both back');
  click('[data-action="select-mode"]');
  pick(b); pick(c);
  click('[data-action="bulk-delete"]');
  await answer(win, true);
  await tick(120);
  check(!PA.DB.tasks.some((t) => t.id === b.id || t.id === c.id), 'without Undo both are deleted');

  // --- Esc and leaving the screen end selecting ---
  click('[data-action="select-mode"]');
  doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(!PA.state.selecting && !doc.querySelector('.select-bar'), 'Esc ends selecting');
  click('[data-action="select-mode"]');
  doc.querySelector('[data-view="today"]').click();
  doc.querySelector('[data-view="tasks"]').click();
  check(!PA.state.selecting, 'leaving Tasks ends selecting');

  // --- The Board too ---
  PA.render();
  doc.querySelector('[data-action="layout"][data-layout="board"]').click();
  click('[data-action="select-mode"]');
  check(doc.querySelector('.board .task-card.select-row') && !doc.querySelector('.board .task-card[draggable="true"]'), 'on the Board, cards are selectable and not draggable while selecting');
  win.eval('TouchDrag').HOLD_MS = 20;
  const cardBody = doc.querySelector('.board .task-card.select-row .body');
  const touch = new win.Event('touchstart', { bubbles: true, cancelable: true });
  Object.defineProperty(touch, 'touches', { value: [{ clientX: 10, clientY: 10 }] });
  cardBody.dispatchEvent(touch);
  await tick(60);
  check(!doc.querySelector('.drag-ghost'), 'holding a card while selecting doesn\'t lift it (a tap selects)');
  win.eval('TouchDrag').cancel();
  check(win.eval('EDIT_ACTIONS').has('select-mode') && win.eval('EDIT_ACTIONS').has('bulk-delete'), 'selecting is edit-only');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();

  // --- Read-only: no Select ---
  const ro = loadApp({ fsa: false });
  ro.doc.querySelector('[data-view="tasks"]').click();
  ro.PA.state.selecting = true;
  ro.PA.render();
  check(!ro.doc.querySelector('.select-bar'), 'read-only: no selecting');
  ro.close();
  done();
})();
