// People: tasks, notes and events belong to one or more people; you are always 'me', and a record from before People
// (no people) is yours. Each device picks whose things it shows (Everyone or one person) and the screens follow; new
// things go to the person shown. Only tasks you're on remind here. Settings adds, renames and removes people (their
// records with nobody left become yours) and keeps each person's zakat day. Older data files load; read-only can
// switch the view but change nothing.
const { loadApp, tick, check, done, answer, submitForm } = require('./helpers');

(async () => {
  const app = loadApp({ storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  const People = win.eval('People');
  const changed = win.eval('changed');
  const pick = (v) => { const s = doc.querySelector('#person-pick select'); s.value = v; s.dispatchEvent(new win.Event('input', { bubbles: true })); };
  const mainText = () => doc.querySelector('#main').textContent;

  // --- Just you: nothing new on screen ---
  const old = PA.addTask({ title: 'Renew car tax' });
  delete old.people; // as a task from before People was saved
  changed('tasks');
  doc.querySelector('[data-view="tasks"]').click();
  check(People.list().length === 1 && People.list()[0].id === 'me' && People.mine(old), 'at first there is only you, and a task with no people is yours');
  check(doc.querySelector('#person-pick').innerHTML === '' && !doc.querySelector('.who-badges'), 'no picker and no initials while it\'s only you');
  PA.state.openTask = old.id; PA.renderDrawer();
  check(!/People/.test(doc.querySelector('#drawer').textContent), 'and no People row in the task panel');

  // --- Settings: add a person, rename, zakat day ---
  doc.querySelector('[data-view="settings"]').click();
  check(/\(you\)/.test(doc.querySelector('#people-card').textContent), 'Settings lists you');
  submitForm(win, 'add-person', { title: 'Sam Rivers' });
  const sam = PA.DB.people.find((p) => p.name === 'Sam Rivers');
  check(sam && sam.id !== 'me' && sam.zakat === null, 'adding a person keeps them in the shared data');
  check(JSON.parse(win.localStorage.getItem('pa_people')).some((p) => p.id === sam.id), 'and saves them (through changed)');
  const row = doc.querySelector(`[data-person-row="${sam.id}"]`);
  row.querySelector('[data-zakat-day]').value = '15';
  row.querySelector('[data-zakat-month]').value = '8';
  row.querySelector('[data-zakat-month]').dispatchEvent(new win.Event('change', { bubbles: true }));
  check(sam.zakat && sam.zakat.day === 15 && sam.zakat.month === 8 && People.zakatText(sam) === "15th Sha'ban", 'a zakat day is an Islamic day and month');
  doc.querySelector('[data-action="rename-person"][data-id="me"]').click();
  await answer(win, true, 'Alex');
  check(People.name('me') === 'Alex' && PA.DB.people.some((p) => p.id === 'me'), 'you can be named (stored once you are)');
  check(doc.querySelector('#person-pick select') && doc.querySelector('#who-bar select'), 'with someone besides you, the picker shows (sidebar, and above the page for a phone-sized screen)');

  // --- Whose things show ---
  doc.querySelector('[data-view="tasks"]').click();
  pick(sam.id);
  check(PA.device.get('person') === sam.id, 'the picked person is this device\'s setting');
  check(!mainText().includes('Renew car tax'), 'showing Sam: your task is hidden');
  const t = PA.addTask({ title: 'Book dentist' });
  check(People.of(t).join() === sam.id, 'a new task goes to the person shown');
  PA.render();
  check(mainText().includes('Book dentist') && /1 open/.test(mainText()), 'and shows, counted on its own');
  pick('me');
  check(mainText().includes('Renew car tax') && !mainText().includes('Book dentist'), 'showing you: only yours');
  pick('all');
  check(mainText().includes('Renew car tax') && mainText().includes('Book dentist'), 'Everyone: both');
  check(doc.querySelectorAll('#main .who-badges').length === 1 && /Sam Rivers/.test(doc.querySelector('#main .who-badges').title), 'Sam\'s task carries Sam\'s initials; yours none');

  // --- The task panel: add and take off people ---
  PA.state.openTask = t.id; PA.renderDrawer();
  const add = doc.querySelector('#drawer [data-person-add="tasks"]');
  check(add && !doc.querySelector('#drawer [data-action="person-off"]'), 'the panel shows who it\'s for, and the last one has no ×');
  add.value = 'me';
  add.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(People.of(t).length === 2 && People.mine(t), 'adding you makes it yours too');
  doc.querySelector(`#drawer [data-action="person-off"][data-person="${sam.id}"]`).click();
  check(People.of(t).join() === 'me', 'taking Sam off leaves it yours');
  check(!People.toggle(t, 'me') && People.of(t).join() === 'me', 'the last person can\'t be taken off');
  t.people = [sam.id]; changed('tasks');

  // --- Notes and events follow the picker too ---
  pick(sam.id);
  doc.querySelector('[data-view="notes"]').click();
  doc.querySelector('[data-action="new-note"]').click();
  const note = PA.DB.notes[PA.DB.notes.length - 1];
  check(People.of(note).join() === sam.id && doc.querySelector('.note-people'), 'a new note goes to the person shown, and its people show above it');
  pick('me');
  check(!doc.querySelector('#main .note-card'), 'showing you: Sam\'s note is hidden');
  pick(sam.id);
  win.eval('addEvent')({ title: 'School play', date: PA.toISO(new Date()) });
  const ev = PA.DB.events[PA.DB.events.length - 1];
  const itemsForDay = win.eval('itemsForDay');
  check(People.of(ev).join() === sam.id && itemsForDay(PA.toISO(new Date())).some((i) => i.title === 'School play'), 'events too: added for the person shown');
  pick('me');
  check(!itemsForDay(PA.toISO(new Date())).some((i) => i.title === 'School play') && !win.eval('todayPlan')().anyTime.some((x) => x.e && x.e.id === ev.id), 'and hidden from you on the calendar and My Day');

  // --- Reminders only for tasks you're on ---
  const due = new Date(Date.now() - 60000);
  const at = `${PA.toISO(due)}T${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`;
  const theirs = PA.addTask({ title: 'Their reminder', due: at, people: [sam.id], reminders: [{ id: 'r1', kind: 'before', minutes: 0, fired: false }] });
  const mine = PA.addTask({ title: 'My reminder', due: at, people: ['me'], reminders: [{ id: 'r2', kind: 'before', minutes: 0, fired: false }] });
  PA.checkReminders();
  check(mine.reminders[0].fired && !theirs.reminders[0].fired, 'a reminder goes off only for a task you\'re on');

  // --- Removing a person: what was only theirs becomes yours ---
  pick(sam.id);
  doc.querySelector('[data-view="settings"]').click();
  doc.querySelector(`[data-action="remove-person"][data-id="${sam.id}"]`).click();
  const q = await answer(win, true);
  check(/only theirs: they become yours/.test(q), 'removing asks, and says their things become yours');
  check(!PA.DB.people.some((p) => p.id === sam.id) && People.mine(t) && People.mine(note) && People.mine(ev), 'then they\'re gone and their things are yours');
  check(PA.device.get('person') === 'all' && doc.querySelector('#person-pick').innerHTML === '', 'the picker goes back to everyone, and hides with only you left');
  check(!doc.querySelector('[data-action="remove-person"][data-id="me"]'), 'you can\'t be removed');

  // --- Two devices: the people list merges like the rest ---
  const mergeData = win.eval('mergeData');
  const now = Date.now();
  const m = mergeData({ people: [{ id: 'me', name: 'Alex', updated: now }], tasks: [], notes: [], events: [] }, { people: [{ id: 'p9', name: 'Kim', updated: now }, { id: 'me', name: 'Old name', updated: now - 5000 }], tasks: [], notes: [], events: [] }, now);
  check(m.people.length === 2 && m.people.find((p) => p.id === 'me').name === 'Alex', 'both devices\' people are kept, the newer change wins, and there is only one you');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();

  // --- An older data file (no people) loads; read-only can switch the view, not change people ---
  const ro = loadApp({ fsa: false });
  await ro.PA.RO.open({ name: 'd.json', text: async () => JSON.stringify({ app: 'PA App', version: 2, saveToken: 't', data: { tasks: [{ id: 'a', title: 'Old task' }], notes: [], events: [] } }) });
  const P2 = ro.win.eval('People');
  check(Array.isArray(ro.PA.DB.people) && P2.mine(ro.PA.DB.tasks[0]), 'a file from before People loads, its tasks yours');
  await ro.PA.RO.open({ name: 'd.json', text: async () => JSON.stringify({ app: 'PA App', version: 2, saveToken: 't2', data: { tasks: [{ id: 'a', title: 'Old task' }, { id: 'b', title: 'Kim\'s task', people: ['k'] }], notes: [], events: [], people: [{ id: 'k', name: 'Kim', zakat: null }] } }) });
  ro.doc.querySelector('[data-view="tasks"]').click();
  const s = ro.doc.querySelector('#person-pick select');
  s.value = 'k'; s.dispatchEvent(new ro.win.Event('input', { bubbles: true }));
  check(ro.doc.querySelector('#main').textContent.includes('Kim\'s task') && !ro.doc.querySelector('#main').textContent.includes('Old task'), 'read-only can still pick whose things to show');
  check(['person-off', 'rename-person', 'remove-person'].every((a) => ro.win.eval('EDIT_ACTIONS').has(a)), 'changing people is edit-only');
  ro.close();
  done();
})();
