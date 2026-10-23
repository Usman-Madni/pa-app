// Tasks, events and notes save to the browser; IDs never collide; a fresh load shows saved data.
const { loadApp, submitForm, tick, check, done } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  check(app.errors.length === 0, 'page loads without script errors');
  check(!PA.state.readOnly, 'desktop browser with file access is editable');

  win.document.querySelector('[data-view="tasks"]').click();
  submitForm(win, 'quick-add', { title: 'Call the supplier on 5 Jan 2030 9:30am !high', remind: '10' });
  check(PA.DB.tasks.length === 1, 'task added');
  const saved = JSON.parse(win.localStorage.getItem('pa_tasks'));
  check(saved[0].title === 'Call the supplier' && saved[0].due === '2030-01-05T09:30' && saved[0].remind === 10, 'task saved in the browser with its fields');
  check(doc.querySelector('#main').textContent.includes('Call the supplier'), 'task shows on screen');
  check(win.localStorage.getItem('dev_unsaved') === 'true', 'edit marks data as not yet in the data file');

  win.document.querySelector('[data-view="calendar"]').click();
  submitForm(win, 'add-event', { title: 'Dentist', date: '2030-01-05', time: '15:00' });
  check(PA.DB.events[0].date === '2030-01-05', 'event saved with its local date');
  check(PA.state.calMonth.getMonth() === 0 && PA.state.calMonth.getFullYear() === 2030, 'calendar jumps to the event month');
  check(doc.querySelector('[data-day="2030-01-05"]').textContent.includes('Dentist'), 'event shows on its day');

  win.document.querySelector('[data-view="notes"]').click();
  doc.querySelector('[data-action="new-note"]').click();
  const body = doc.querySelector('[data-input="note-body"]');
  body.value = 'Plan the trip';
  body.dispatchEvent(new win.Event('input', { bubbles: true }));
  await tick(400);
  check(JSON.parse(win.localStorage.getItem('pa_notes'))[0].body === 'Plan the trip', 'note autosaves');

  // Tick a task done
  win.document.querySelector('[data-view="tasks"]').click();
  doc.querySelector('[data-action="toggle-task"]').click();
  check(PA.DB.tasks[0].done === true, 'task can be ticked done');

  // IDs
  const ids = new Set();
  for (let i = 0; i < 5000; i++) ids.add(PA.uid());
  check(ids.size === 5000, '5000 IDs made in a burst are all different');

  // Fresh load keeps everything
  const storage = {};
  for (let i = 0; i < win.localStorage.length; i++) { const k = win.localStorage.key(i); storage[k] = win.localStorage.getItem(k); }
  app.close();
  const again = loadApp({ storage });
  check(again.PA.DB.tasks.length === 1 && again.PA.DB.events.length === 1 && again.PA.DB.notes.length === 1, 'fresh page load shows saved data');
  check(!('dev_view' in (again.PA.DB.exportAll())), 'per-device settings are not part of the shared data');
  again.close();
  done();
})();
