// Buckets, board view and labels: create, assign, filter, move, rename, delete, and they reach the data file.
const { loadApp, fakeFile, submitForm, check, done } = require('./helpers');

const $ = (win, sel) => win.document.querySelector(sel);
const $$ = (win, sel) => [...win.document.querySelectorAll(sel)];
function pick(win, sel, value, type = 'input') {
  const el = $(win, sel);
  el.value = value;
  el.dispatchEvent(new win.Event(type, { bubbles: true }));
}

(async () => {
  const file = fakeFile();
  const app = loadApp({ pickFile: file });
  const { win, PA } = app;
  await PA.DF.createNew();
  $(win, '[data-view="tasks"]').click();

  // --- Board view & buckets ---
  check($(win, '.board') && $(win, '.main').classList.contains('wide'), 'Board is the default, using the full screen width');
  $(win, '[data-action="layout"][data-layout="list"]').click();
  check(win.localStorage.getItem('dev_taskLayout') === '"list"' && !$(win, '.main').classList.contains('wide'), 'list/board choice is remembered on this device');
  $(win, '[data-action="layout"][data-layout="board"]').click();
  submitForm(win, 'add-bucket', { title: 'Home' });
  submitForm(win, 'add-bucket', { title: 'Bills' });
  check(PA.DB.buckets.map((b) => b.name).join(',') === 'Home,Bills', 'buckets added in order');
  const [home, bills] = PA.DB.buckets;
  check($$(win, '[data-bucket-col]').map((c) => c.dataset.bucketCol).join(',') === `${home.id},${bills.id}`, 'one column per bucket (empty "No bucket" hidden)');

  // Add straight into a column, Planner style: "+ Add task" opens a card
  $(win, `[data-action="board-add"][data-bucket="${bills.id}"]`).click();
  const addCard = $(win, `form.add-card[data-bucket="${bills.id}"]`);
  check(addCard && win.document.activeElement === addCard.elements.title, '"+ Add task" opens a card with the cursor in it');
  addCard.elements.title.value = 'Electricity bill';
  addCard.elements.dueDate.value = '2030-03-10';
  addCard.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  const elec = PA.DB.tasks.find((t) => t.title === 'Electricity bill');
  check(elec && elec.bucket === bills.id, 'adding in a column puts the task in that bucket');
  check(elec.due === '2030-03-10T23:59', '"Set due date" on the card sets a due date with no time');
  check($(win, `[data-bucket-col="${bills.id}"]`).textContent.includes('Electricity bill'), 'card shows in its column');
  const again = $(win, `form.add-card[data-bucket="${bills.id}"]`);
  check(again && win.document.activeElement === again.elements.title, 'the card stays open for the next task');
  again.elements.title.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(!$(win, 'form.add-card'), 'Esc closes the card');

  // Move between buckets (what drag-and-drop calls)
  PA.moveTaskToBucket(elec.id, home.id);
  check(elec.bucket === home.id && $(win, `[data-bucket-col="${home.id}"]`).textContent.includes('Electricity bill'), 'moving a card changes its bucket');

  // Reorder buckets
  $(win, `[data-action="bucket-left"][data-id="${bills.id}"]`).click();
  check($$(win, '[data-bucket-col]').map((c) => c.dataset.bucketCol)[0] === bills.id, 'bucket moved left');

  // Rename
  win.prompt = () => 'Monthly bills';
  $(win, `[data-action="rename-bucket"][data-id="${bills.id}"]`).click();
  check(bills.name === 'Monthly bills', 'bucket renamed');

  // --- Filters & list view ---
  $(win, '[data-action="layout"][data-layout="list"]').click();
  PA.addTask({ title: 'No-bucket task', bucket: '' });
  pick(win, '[data-input="task-bucket"]', home.id);
  check($(win, '#main').textContent.includes('Electricity bill') && !$(win, '#main').textContent.includes('No-bucket task'), 'bucket filter shows only that bucket');
  submitForm(win, 'quick-add', { title: 'Added while filtered' });
  check(PA.DB.tasks.find((t) => t.title === 'Added while filtered').bucket === home.id, 'a task added while filtered lands in that bucket');
  pick(win, '[data-input="task-bucket"]', '-');
  check($(win, '#main').textContent.includes('No-bucket task') && !$(win, '#main').textContent.includes('Electricity bill'), '"No bucket" filter works');
  pick(win, '[data-input="task-bucket"]', '');

  // --- Labels in the drawer ---
  $(win, `[data-action="open-task"][data-id="${elec.id}"]`).click();
  submitForm(win, 'add-label', { title: 'Urgent call', color: '#ef4444' });
  const urgent = PA.DB.labels[0];
  check(urgent && urgent.name === 'Urgent call' && elec.labels.includes(urgent.id), 'label created in the drawer is put on the task');
  check($(win, '#main').textContent.includes('Urgent call'), 'label shows on the task in the list');
  $(win, `#drawer [data-action="toggle-label"][data-label="${urgent.id}"]`).click();
  check(!elec.labels.includes(urgent.id), 'label can be taken off');
  $(win, `#drawer [data-action="toggle-label"][data-label="${urgent.id}"]`).click();
  check(elec.labels.includes(urgent.id), 'and put back');
  // Drawer bucket select
  const sel = $(win, '#drawer [data-field="bucket"]');
  sel.value = bills.id;
  sel.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(elec.bucket === bills.id, 'bucket can be changed in the drawer');
  $(win, '#drawer [data-action="close-task"]').click();

  // Label filter
  pick(win, '[data-input="task-label"]', urgent.id);
  const shown = $$(win, '#main .item').length;
  check(shown === 1 && $(win, '#main').textContent.includes('Electricity bill'), 'label filter shows only labelled tasks');
  pick(win, '[data-input="task-label"]', '');

  // --- Settings: manage buckets & labels ---
  $(win, '[data-view="settings"]').click();
  check($(win, '#main').textContent.includes('Monthly bills') && $(win, '#main').textContent.includes('Urgent call'), 'Settings lists buckets and labels');
  pick(win, `[data-label-color="${urgent.id}"]`, '#3b82f6', 'change');
  check(urgent.color === '#3b82f6', 'label colour can be changed');
  win.prompt = () => 'Call back';
  $(win, `[data-action="rename-label"][data-id="${urgent.id}"]`).click();
  check(urgent.name === 'Call back', 'label renamed');

  // --- Everything reaches the data file ---
  await PA.DF.save();
  const saved = file.json().data;
  check(saved.buckets.length === 2 && saved.labels[0].name === 'Call back' && saved.tasks.find((t) => t.id === elec.id).labels[0] === urgent.id, 'buckets, labels and task labels are in the data file');
  check(file.json().version === 2, 'data file says version 2');

  // --- Deleting ---
  let asked = '';
  win.confirm = (m) => { asked = m; return true; };
  $(win, `[data-action="delete-label"][data-id="${urgent.id}"]`).click();
  check(PA.DB.labels.length === 0 && elec.labels.length === 0 && /1 task/.test(asked), 'deleting a label takes it off its tasks (after asking)');
  $(win, `[data-action="delete-bucket"][data-id="${bills.id}"]`).click();
  check(PA.DB.buckets.length === 1 && elec.bucket === '' && /move to No bucket/.test(asked), 'deleting a bucket moves its tasks to No bucket (after asking)');
  check(PA.DB.tasks.some((t) => t.id === elec.id), 'deleting a bucket never deletes tasks');
  app.close();

  // --- Phone: board shows, nothing editable ---
  const ro = loadApp({ fsa: false });
  await ro.PA.RO.open({ name: 'd.json', text: async () => JSON.stringify({ app: 'PA App', version: 2, saveToken: 't', data: {
    tasks: [{ id: 'x', title: 'Pay rent', bucket: 'b1' }], notes: [], events: [], buckets: [{ id: 'b1', name: 'Bills', order: 1 }], labels: [],
  } }) });
  ro.win.document.querySelector('[data-view="tasks"]').click();
  ro.win.document.querySelector('[data-action="layout"][data-layout="board"]').click();
  const card = ro.doc.querySelector('[data-card="x"]');
  check(card && card.getAttribute('draggable') === 'false', 'phone shows the board but cards cannot be dragged');
  ro.PA.moveTaskToBucket('x', '');
  check(ro.PA.DB.tasks[0].bucket === 'b1', 'phone cannot move tasks between buckets');
  ro.close();
  done();
})();
