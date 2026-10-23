// "+ New task" opens the side panel (and an unnamed one is thrown away), editing reminders,
// no "any time that day" subtext, and the panel keeps its scroll position after a change.
const { loadApp, submitForm, tick, check, done } = require('./helpers');

(async () => {
  const app = loadApp({ storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  const drawer = () => doc.querySelector('#drawer');

  // --- + New task ---
  doc.querySelector('[data-view="tasks"]').click();
  doc.querySelector('#main [data-action="new-task"]').click();
  check(PA.DB.tasks.length === 1 && doc.body.classList.contains('drawer-open'), '"+ New task" opens the side panel on a new task');
  check(doc.activeElement === drawer().querySelector('.drawer-title') && drawer().querySelector('.drawer-title').placeholder === 'Task name', 'the cursor is in the name box');
  // Leave without a name → thrown away
  drawer().querySelector('[data-action="close-task"]').click();
  check(PA.DB.tasks.length === 0, 'closing without a name throws the blank task away');
  // Give it a name and details
  doc.querySelector('#main [data-action="new-task"]').click();
  const title = drawer().querySelector('.drawer-title');
  title.value = 'Book car service';
  title.dispatchEvent(new win.Event('input', { bubbles: true }));
  const dd = drawer().querySelector('[data-field="dueDate"]');
  dd.value = '2030-03-01';
  dd.dispatchEvent(new win.Event('change', { bubbles: true }));
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }));
  const car = PA.DB.tasks.find((t) => t.title === 'Book car service');
  check(car && car.due === '2030-03-01T23:59', 'a named new task is kept with what you filled in');
  await tick(450);
  check(doc.querySelector('#main').textContent.includes('Book car service'), 'and shows in the list');
  // Switching to another task also drops an unnamed draft
  doc.querySelector('#main [data-action="new-task"]').click();
  const draftId = PA.state.openTask;
  doc.querySelector(`#main [data-action="open-task"][data-id="${car.id}"]`).click();
  check(!PA.DB.tasks.some((t) => t.id === draftId) && PA.state.openTask === car.id, 'opening another task drops an unnamed new one');
  // On My Day, it goes into My Day
  doc.querySelector('[data-view="today"]').click();
  doc.querySelector('#main [data-action="new-task"]').click();
  check(PA.DB.tasks.find((t) => t.id === PA.state.openTask).myDay === PA.toISO(new Date()), '"+ New task" on My Day puts it in My Day');
  drawer().querySelector('[data-action="close-task"]').click();

  // --- No "any time that day" subtext ---
  doc.querySelector('[data-view="tasks"]').click();
  doc.querySelector(`#main [data-action="open-task"][data-id="${car.id}"]`).click();
  check(!drawer().textContent.includes('any time that day'), 'no subtext under Due time when there is no time');

  // --- Editing reminders ---
  const pick = (v) => { const s = drawer().querySelector('[data-rem-add]'); s.value = v; s.dispatchEvent(new win.Event('change', { bubbles: true })); };
  pick('b60');
  pick('d1-21:00');
  const [r1, r2] = car.reminders;
  drawer().querySelector(`[data-action="edit-reminder"][data-rem="${r1.id}"]`).click();
  const f = drawer().querySelector('form[data-form="add-reminder"]');
  check(f && f.dataset.kind === 'before' && f.elements.n.value === '1' && f.elements.unit.value === '60' && f.textContent.includes('Save'), 'editing "1 hour before" opens its form filled in (1 hours)');
  f.elements.n.value = '2';
  f.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  check(car.reminders.length === 2 && car.reminders[0].id === r1.id && car.reminders[0].minutes === 120, 'saving changes that reminder in place (now 2 hours before)');
  check(drawer().textContent.includes('2 hours before') && !drawer().querySelector('form[data-form="add-reminder"]'), 'the list shows the change and the form closes');
  drawer().querySelector(`[data-action="edit-reminder"][data-rem="${r2.id}"]`).click();
  const g = drawer().querySelector('form[data-form="add-reminder"]');
  check(g.dataset.kind === 'dayof' && g.elements.days.value === '1' && g.elements.time.value === '21:00', 'editing "evening before" shows 1 day before, 21:00');
  submitForm(win, 'add-reminder', { days: '2', time: '20:00' });
  check(car.reminders[1].daysBefore === 2 && car.reminders[1].time === '20:00' && car.reminders[1].fired === false, 'changed to 2 days before at 8 pm, ready to go off again');
  // Exact time
  pick('custom-at');
  submitForm(win, 'add-reminder', { at: '2030-02-20T08:00' });
  const r3 = car.reminders[2];
  drawer().querySelector(`[data-action="edit-reminder"][data-rem="${r3.id}"]`).click();
  check(drawer().querySelector('form[data-form="add-reminder"]').elements.at.value === '2030-02-20T08:00', 'editing an exact-time reminder shows its date and time');
  submitForm(win, 'add-reminder', { at: '2030-02-21T09:30' });
  check(car.reminders[2].at === '2030-02-21T09:30' && car.reminders.length === 3, 'exact time changed');
  // Cancel leaves it alone
  drawer().querySelector(`[data-action="edit-reminder"][data-rem="${r1.id}"]`).click();
  drawer().querySelector('[data-action="cancel-reminder"]').click();
  check(car.reminders[0].minutes === 120 && !drawer().querySelector('form[data-form="add-reminder"]'), 'cancel leaves the reminder as it was');

  // --- The panel keeps its scroll position after a change ---
  const body = drawer().querySelector('.drawer-body');
  body.scrollTop = 420;
  const prio = drawer().querySelector('[data-field="progress"]');
  prio.value = 'doing';
  prio.dispatchEvent(new win.Event('change', { bubbles: true }));
  pick('b10'); // rebuilds the panel
  await tick(0);
  check(drawer().querySelector('.drawer-body').scrollTop === 420, 'after picking an option the panel stays where you were');
  // A different task opens at the top
  const other = PA.addTask({ title: 'Other' });
  PA.render();
  doc.querySelector(`#main [data-action="open-task"][data-id="${other.id}"]`).click();
  await tick(0);
  check(drawer().querySelector('.drawer-body').scrollTop === 0, 'a different task opens at the top');

  // Phone: no "+ New task"
  app.close();
  const ro = loadApp({ fsa: false });
  ro.doc.querySelector('[data-view="tasks"]').click();
  const btn = ro.doc.querySelector('#main [data-action="new-task"]');
  btn.click();
  check(ro.PA.DB.tasks.length === 0, 'phone cannot add a task with "+ New task"');
  ro.close();
  done();
})();
