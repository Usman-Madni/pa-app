// Task details drawer: old data still loads, fields save, checklist, notes, My Day, tabs, read-only drawer.
const { loadApp, submitForm, tick, check, done } = require('./helpers');

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = iso(new Date());
const yesterday = iso(new Date(Date.now() - 864e5));

function setField(win, field, value) {
  const el = win.document.querySelector(`#drawer [data-field="${field}"]`);
  el.value = value;
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
}
const click = (win, sel) => win.document.querySelector(sel).click();

(async () => {
  // --- Data from before this feature (no buckets/labels keys, tasks without new fields) ---
  const oldTask = { id: 'old1', title: 'Old style task', due: '', priority: 'low', remind: -1, notified: false, done: false, created: 1 };
  const app = loadApp({ storage: { pa_tasks: JSON.stringify([oldTask]), pa_notes: '[]', pa_events: '[]' } });
  const { win, doc, PA } = app;
  check(app.errors.length === 0, 'page loads without script errors');
  const t0 = PA.DB.tasks[0];
  check(Array.isArray(t0.checklist) && t0.checklist.length === 0 && t0.notes === '' && t0.progress === 'not' && t0.bucket === '' && Array.isArray(t0.labels), 'old task gets the new fields with defaults');
  check(Array.isArray(PA.DB.buckets) && Array.isArray(PA.DB.labels), 'buckets and labels start empty');
  // Defaults must never be shared between tasks
  const a = PA.normalizeTask({ id: 'a' }); const b = PA.normalizeTask({ id: 'b' });
  a.checklist.push({ id: 's', text: 'x', done: false });
  check(b.checklist.length === 0, 'each task gets its own checklist (no shared default array)');

  // Old-format data file loads too
  PA.DB.importAll({ tasks: [oldTask], notes: [], events: [] });
  check(PA.DB.tasks[0].checklist.length === 0 && PA.DB.buckets.length === 0, 'a data file without buckets/labels still loads');

  // --- Open the drawer ---
  win.document.querySelector('[data-view="tasks"]').click();
  click(win, '[data-action="open-task"][data-id="old1"]');
  check(doc.body.classList.contains('drawer-open') && doc.querySelector('#drawer .drawer-title').value === 'Old style task', 'clicking a task opens its details');

  setField(win, 'priority', 'high');
  setField(win, 'progress', 'doing');
  setField(win, 'start', '2030-02-01');
  setField(win, 'due', '2030-02-05T10:00');
  setField(win, 'remind', '60');
  const t = PA.DB.tasks[0];
  check(t.priority === 'high' && t.progress === 'doing' && t.start === '2030-02-01' && t.due === '2030-02-05T10:00' && t.remind === 60, 'drawer fields save to the task');
  const saved = JSON.parse(win.localStorage.getItem('pa_tasks'))[0];
  check(saved.progress === 'doing' && saved.start === '2030-02-01', 'drawer changes saved in the browser');
  check(doc.querySelector('#main').textContent.includes('In progress'), 'list shows "In progress"');

  // Title can't be blanked
  setField(win, 'title', '   ');
  check(t.title === 'Old style task', 'empty title is refused');
  setField(win, 'title', 'Renamed task');
  check(t.title === 'Renamed task' && doc.querySelector('#main').textContent.includes('Renamed task'), 'title change shows in the list');

  // Notes typing (debounced save)
  const notes = doc.querySelector('#drawer [data-field="notes"]');
  notes.focus();
  notes.value = 'Call before 5pm';
  notes.dispatchEvent(new win.Event('input', { bubbles: true }));
  check(t.notes === 'Call before 5pm', 'notes update while typing');
  check(doc.activeElement === notes, 'typing notes keeps the cursor in the box');
  await tick(500);
  check(JSON.parse(win.localStorage.getItem('pa_tasks'))[0].notes === 'Call before 5pm', 'notes saved after a pause');

  // Checklist
  submitForm(win, 'add-step', { title: 'Find the number' });
  submitForm(win, 'add-step', { title: 'Ask about price' });
  check(t.checklist.length === 2 && t.checklist[0].text === 'Find the number', 'steps added');
  click(win, `#drawer [data-action="toggle-step"][data-step="${t.checklist[0].id}"]`);
  check(t.checklist[0].done === true, 'step ticked');
  check(doc.querySelector('#main').textContent.includes('1/2'), 'list shows checklist progress 1/2');
  const stepInput = doc.querySelector(`#drawer [data-step-text="${t.checklist[1].id}"]`);
  stepInput.value = 'Ask about the price';
  stepInput.dispatchEvent(new win.Event('input', { bubbles: true }));
  check(t.checklist[1].text === 'Ask about the price', 'step text editable');
  click(win, `#drawer [data-action="promote-step"][data-step="${t.checklist[1].id}"]`);
  check(t.checklist.length === 1 && PA.DB.tasks.some((x) => x.title === 'Ask about the price'), 'a step can become its own task');
  click(win, `#drawer [data-action="delete-step"][data-step="${t.checklist[0].id}"]`);
  check(t.checklist.length === 0, 'step deleted');

  // My Day
  click(win, '#drawer [data-action="toggle-myday"]');
  check(t.myDay === today, 'added to My Day');
  win.document.querySelector('[data-filter="myday"]').click();
  check(doc.querySelectorAll('#main .item').length === 1, 'My Day tab shows it');
  t.myDay = yesterday;
  PA.render();
  check(doc.querySelectorAll('#main .item').length === 0, 'My Day empties the next day');

  // Planned / Overdue tabs
  PA.addTask({ title: 'Late one', due: '2020-01-01T09:00' });
  win.document.querySelector('[data-filter="overdue"]').click();
  check(doc.querySelector('#main').textContent.includes('Late one') && !doc.querySelector('#main').textContent.includes('Renamed task'), 'Overdue tab shows only overdue');
  win.document.querySelector('[data-filter="planned"]').click();
  check(doc.querySelector('#main').textContent.includes('Renamed task') && doc.querySelector('#main').textContent.includes('Late one'), 'Planned tab shows tasks with due dates');

  // Today page quick add goes to My Day
  win.document.querySelector('[data-view="today"]').click();
  submitForm(win, 'add-task', { title: 'Quick today' });
  const quick = PA.DB.tasks.find((x) => x.title === 'Quick today');
  check(quick && quick.myDay === today, 'quick add on Today puts it in My Day');

  // Ticking done from the drawer
  click(win, `[data-action="open-task"][data-id="${quick.id}"]`);
  click(win, '#drawer [data-action="toggle-task"]');
  check(quick.done && quick.completedAt > 0, 'done from the drawer records when');

  // Close with Esc
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }));
  check(!doc.body.classList.contains('drawer-open'), 'Esc closes the drawer');

  // Delete a task with notes asks first
  let asked = '';
  win.confirm = (m) => { asked = m; return false; };
  win.document.querySelector('[data-view="tasks"]').click();
  win.document.querySelector('[data-filter="active"]').click();
  click(win, `[data-action="open-task"][data-id="${t.id}"]`);
  click(win, '#drawer [data-action="delete-task"]');
  check(asked.includes('Renamed task') && PA.DB.tasks.includes(t), 'deleting a task with notes asks first (and No keeps it)');
  app.close();

  // --- Read-only: drawer opens but can't change anything ---
  const ro = loadApp({ fsa: false });
  await ro.PA.RO.open({
    name: 'pa-app-data.json',
    text: async () => JSON.stringify({ app: 'PA App', version: 2, saveToken: 't', savedFrom: 'Laptop', data: {
      tasks: [{ id: 'r1', title: 'Read me', notes: 'Secret plan', checklist: [{ id: 's1', text: 'Step', done: false }] }], notes: [], events: [], buckets: [], labels: [],
    } }),
  });
  ro.win.document.querySelector('[data-view="tasks"]').click();
  ro.win.document.querySelector('[data-action="open-task"][data-id="r1"]').click();
  const rd = ro.doc.querySelector('#drawer');
  check(rd.textContent.includes('Secret plan') || rd.querySelector('[data-field="notes"]').value === 'Secret plan', 'phone can read task notes');
  check(rd.querySelector('fieldset').disabled && rd.querySelector('.drawer-title').disabled, 'phone drawer fields are locked');
  rd.querySelector('[data-action="toggle-step"]').click();
  check(ro.PA.DB.tasks[0].checklist[0].done === false, 'phone cannot tick a step');
  ro.close();
  done();
})();
