// The auto-saving data file: create, save, load another device's save, conflicts, empty browser, backups.
const { loadApp, fakeFile, fakeFolder, submitForm, tick, check, done } = require('./helpers');

function otherDeviceSave(handle, mutate) {
  const f = handle.json();
  mutate(f.data);
  f.saveToken = 'other-device-' + Math.random();
  f.savedFrom = 'Office PC';
  f.savedAt = new Date().toISOString();
  handle.text = JSON.stringify(f);
}

(async () => {
  // --- Create a new data file and auto-save into it ---
  const file = fakeFile();
  const folder = fakeFolder();
  const app = loadApp({ pickFile: file, pickFolder: folder });
  const { win, PA } = app;
  win.document.querySelector('[data-view="tasks"]').click();
  submitForm(win, 'quick-add', { title: 'First task' });

  await PA.DF.createNew();
  let content = file.json();
  check(content && content.app === 'PA App' && content.data.tasks[0].title === 'First task', 'new data file holds the existing task');
  check(content.savedFrom && content.saveToken, 'file records who saved and a version token');
  check(!('dev_view' in content.data) && !content.data.theme, 'device settings stay out of the file');
  // The "Data file created" message is kept in Notifications (in the data file), so one more save follows it.
  await PA.DF.save();
  check(win.localStorage.getItem('dev_unsaved') === 'false' && file.json().data.notices.some((n) => /Data file created/.test(n.text)), 'browser knows it is in step with the file (which keeps the "created" message too)');

  // Change -> save
  submitForm(win, 'quick-add', { title: 'Second task' });
  await PA.DF.save();
  check(file.json().data.tasks.length === 2, 'next change saves to the file');
  check(file.json().saveToken !== content.saveToken, 'each save gets a new version token');

  // --- Daily backup ---
  await PA.DF.pickBackupFolder();
  const backups = Object.keys(folder.files);
  check(backups.length === 1 && /^PA App Backup \d\d-\d\d-\d\d \d{1,2}-\d\d(am|pm)\.json$/.test(backups[0]), 'choosing a backup folder writes a dated backup');
  submitForm(win, 'quick-add', { title: 'Third task' });
  await PA.DF.save();
  check(Object.keys(folder.files).length === 1, 'only one backup per day');

  // --- Another device saved, nothing unsaved here -> load it ---
  otherDeviceSave(file, (d) => d.tasks.push({ id: 'x1', title: 'From office', due: '', priority: 'low', remind: -1, done: false }));
  await PA.DF.check();
  check(PA.DB.tasks.some((t) => t.title === 'From office'), "another device's save is loaded when nothing is unsaved here");
  check(PA.DF.status === 'ok', 'status back to ok');

  // --- Every change stamps the record it changed ---
  const changedFn = win.eval('changed');
  const first = PA.DB.tasks.find((t) => t.title === 'First task');
  const second = PA.DB.tasks.find((t) => t.title === 'Second task');
  const secondWas = second.updated;
  first.notes = 'edited';
  changedFn('tasks');
  check(first.updated > 0 && second.updated === secondWas, 'a change stamps that record with when it changed, and only that one');

  // --- Both changed (another device saved meanwhile) -> merged record by record, nothing asked, nothing lost ---
  submitForm(win, 'quick-add', { title: 'Mine' });
  otherDeviceSave(file, (d) => d.tasks.push({ id: 'x2', title: 'Theirs', due: '', priority: 'low', done: false, updated: Date.now() }));
  await PA.DF.save();
  let titles = file.json().data.tasks.map((t) => t.title);
  check(PA.DF.status === 'ok' && titles.includes('Mine') && titles.includes('Theirs'), 'both changed: merged and saved, both new tasks kept');
  check(PA.DB.tasks.some((t) => t.title === 'Theirs') && win.document.querySelector('#toasts').textContent.includes('Office PC'), 'shown here, saying where the other changes came from');

  // The same task changed on both sides: the newer change wins the whole task
  const theirs = PA.DB.tasks.find((t) => t.id === 'x2');
  theirs.notes = 'note made here';
  changedFn('tasks');
  otherDeviceSave(file, (d) => { const x = d.tasks.find((t) => t.id === 'x2'); x.title = 'Theirs, renamed later'; x.updated = Date.now() + 60000; });
  await PA.DF.save();
  const x2 = PA.DB.tasks.find((t) => t.id === 'x2');
  check(x2.title === 'Theirs, renamed later' && x2.notes !== 'note made here', 'same task changed on both: the newer change wins the whole task');

  // Deleted here: stays deleted, though the other copy still has it
  const mine = PA.DB.tasks.find((t) => t.title === 'Mine');
  PA.DB.tasks = PA.DB.tasks.filter((t) => t !== mine);
  changedFn('tasks');
  otherDeviceSave(file, (d) => d.events.push({ id: 'e9', title: 'Their event', date: '2026-11-10', time: '', updated: Date.now() }));
  await PA.DF.save();
  check(!file.json().data.tasks.some((t) => t.id === mine.id) && file.json().data.deleted.some((m) => m.key === 'tasks' && m.id === mine.id), 'deleted here stays deleted (a marker says so)');
  check(PA.DB.events.some((e) => e.id === 'e9'), 'while their other change still comes in');

  // Deleted on the other device: goes here too
  submitForm(win, 'quick-add', { title: 'Local edit' });
  otherDeviceSave(file, (d) => { d.tasks = d.tasks.filter((t) => t.id !== 'x1'); d.deleted = [...(d.deleted || []), { key: 'tasks', id: 'x1', at: Date.now() + 1000 }]; });
  await PA.DF.save();
  check(!PA.DB.tasks.some((t) => t.id === 'x1') && PA.DB.tasks.some((t) => t.title === 'Local edit'), 'deleted on the other device: gone here too, local changes kept');
  check(JSON.parse(win.localStorage.getItem('pa_tasks')).some((t) => t.title === 'Theirs, renamed later'), 'the merged data is saved in the browser too');
  app.close();

  // --- Empty browser never overwrites a file with data ---
  const full = fakeFile('pa-app-data.json', JSON.stringify({
    app: 'PA App', version: 1, saveToken: 't-full', savedAt: new Date().toISOString(), savedFrom: 'Laptop',
    data: { tasks: [{ id: 'a', title: 'Keep me', due: '', priority: 'low', remind: -1, done: false }], notes: [], events: [] },
  }));
  const empty = loadApp({ pickFile: full, storage: { dev_unsaved: 'true' } });
  await empty.PA.DF.openExisting();
  check(full.json().data.tasks[0].title === 'Keep me', 'empty browser linking a full file does not wipe it');
  check(empty.PA.DB.tasks[0]?.title === 'Keep me', 'empty browser loads the file instead');
  empty.close();

  // --- Linking a different file when both sides have data -> ask (merging two unrelated sets would mix them) ---
  const both = loadApp({ pickFile: fakeFile('pa-app-data.json', full.text) });
  submitForm(both.win, 'quick-add', { title: 'Local only' });
  await both.PA.DF.openExisting();
  check(both.PA.DF.status === 'conflict', 'linking a file when both have data asks which to keep');
  check(both.win.document.querySelector('#banner').textContent.includes('changed here and in the file'), 'the banner asks');
  await both.PA.DF.keepMine();
  const kept = both.PA.DB.tasks.map((t) => t.title);
  check(kept.includes('Local only') && JSON.parse(both.win.localStorage.getItem('pa_tasks')).length === kept.length, "'Keep this device's version' still works");
  both.close();

  // --- Not a PA App file ---
  const bad = loadApp({ pickFile: fakeFile('other.json', '{"hello":1}') });
  await bad.PA.DF.openExisting();
  check(bad.PA.DF.status === 'error' && /not a PA App data file/.test(bad.PA.DF.error), 'a non-PA App file is refused');
  bad.close();

  await tick(0);
  done();
})();
