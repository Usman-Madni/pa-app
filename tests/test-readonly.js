// Phones (no file access) are read-only: they open the data file, show it, and can never change it.
const { loadApp, check, done } = require('./helpers');

const fileText = JSON.stringify({
  app: 'PA App', version: 1, saveToken: 't1', savedAt: '2026-10-23T09:00:00.000Z', savedFrom: 'Laptop',
  data: {
    tasks: [{ id: 'a', title: 'Pay bills', due: '', priority: 'high', remind: -1, done: false }],
    notes: [{ id: 'n', title: 'Ideas', body: 'Trip', updated: 1 }],
    events: [{ id: 'e', title: 'Dentist', date: '2026-10-23', time: '15:00' }],
  },
});

(async () => {
  const app = loadApp({ fsa: false, storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  check(app.errors.length === 0, 'page loads without script errors');
  check(PA.state.readOnly === true, 'browser without file access is read-only');
  check(doc.body.classList.contains('readonly'), 'editing controls hidden');
  check(doc.querySelector('#banner').textContent.includes('Read-only view'), 'read-only banner shows');

  await PA.RO.open({ name: 'pa-app-data.json', text: async () => fileText });
  check(PA.DB.tasks[0].title === 'Pay bills' && PA.DB.events.length === 1, 'data file opens and shows');
  check(doc.querySelector('#banner').textContent.includes('Laptop'), 'banner says which device saved it');

  // Try every way of changing data
  win.document.querySelector('[data-view="tasks"]').click();
  const box = doc.querySelector('[data-action="toggle-task"]');
  check(box.disabled, 'tick boxes are disabled');
  box.click();
  check(PA.DB.tasks[0].done === false, 'clicking a task does not change it');
  doc.querySelector('[data-action="delete-task"]').click();
  check(PA.DB.tasks.length === 1, 'delete does nothing');
  const form = doc.querySelector('[data-form="quick-add"]');
  form.elements.title.value = 'Sneaky';
  form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  check(PA.DB.tasks.length === 1, 'adding a task does nothing');
  check(win.localStorage.getItem('pa_tasks') === null, 'nothing written to the editable store');

  win.document.querySelector('[data-view="notes"]').click();
  const title = doc.querySelector('[data-input="note-title"]');
  check(title.readOnly, 'note fields are read-only');

  // Reminders on a phone don't touch the data
  PA.DB.tasks[0].due = '2020-01-01T09:00'; PA.DB.tasks[0].reminders = [{ id: 'r', kind: 'before', minutes: 0, fired: false }];
  PA.checkReminders();
  check(doc.querySelector('#toasts').textContent.includes('Pay bills'), 'the phone still shows the reminder');
  check(PA.DB.tasks[0].reminders[0].fired === false, 'a reminder shown on the phone does not change the task');

  // Reopening the app later shows the last opened file
  const storage = {};
  for (let i = 0; i < win.localStorage.length; i++) { const k = win.localStorage.key(i); storage[k] = win.localStorage.getItem(k); }
  app.close();
  const again = loadApp({ fsa: false, storage });
  check(again.PA.DB.tasks[0]?.title === 'Pay bills', 'phone remembers the last opened file');
  again.close();

  // A phone whose Chrome CAN write files is still read-only
  const android = loadApp({ ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36' });
  check(typeof android.win.showOpenFilePicker === 'function' && android.PA.state.readOnly === true, 'Android phone with file access is still read-only');
  android.close();
  const iphone = loadApp({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
  check(iphone.PA.state.readOnly === true, 'iPhone is read-only');
  iphone.close();

  // ?readonly forces it on a desktop too
  const forced = loadApp({ query: '?readonly' });
  check(forced.PA.state.readOnly === true, '?readonly in the address forces read-only');
  forced.close();

  // Wrong file
  const wrong = loadApp({ fsa: false });
  await wrong.PA.RO.open({ name: 'x.json', text: async () => '{"a":1}' });
  check(wrong.PA.DB.tasks.length === 0, 'a non-PA App file is refused');
  wrong.close();
  done();
})();
