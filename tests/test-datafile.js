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
  check(win.localStorage.getItem('dev_unsaved') === 'false', 'browser knows it is in step with the file');

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

  // --- Both changed -> conflict, nothing saved until resolved ---
  submitForm(win, 'quick-add', { title: 'Mine' });
  otherDeviceSave(file, (d) => d.tasks.push({ id: 'x2', title: 'Theirs', due: '', priority: 'low', remind: -1, done: false }));
  const writesBefore = file.writes;
  await PA.DF.save();
  check(PA.DF.status === 'conflict', 'both changed -> conflict');
  check(file.writes === writesBefore, 'nothing written while the conflict is open');
  check(win.document.querySelector('#banner').textContent.includes('changed here and in the file'), 'conflict banner shows');
  await PA.DF.check();
  check(PA.DF.status === 'conflict', 'polling does not clear an open conflict');

  // Keep mine
  await PA.DF.keepMine();
  const after = file.json().data.tasks.map((t) => t.title);
  check(after.includes('Mine') && !after.includes('Theirs'), "'Keep this device's version' writes mine");

  // Use theirs
  submitForm(win, 'quick-add', { title: 'Mine again' });
  otherDeviceSave(file, (d) => d.tasks.push({ id: 'x3', title: 'Theirs again', due: '', priority: 'low', remind: -1, done: false }));
  await PA.DF.save();
  PA.DF.useTheirs();
  const titles = PA.DB.tasks.map((t) => t.title);
  check(titles.includes('Theirs again') && !titles.includes('Mine again'), "'Use the file's version' loads theirs");
  check(JSON.parse(win.localStorage.getItem('pa_tasks')).some((t) => t.title === 'Theirs again'), 'loaded version saved in the browser too');
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

  // --- Linking a file when both sides have data -> ask ---
  const both = loadApp({ pickFile: fakeFile('pa-app-data.json', full.text) });
  submitForm(both.win, 'quick-add', { title: 'Local only' });
  await both.PA.DF.openExisting();
  check(both.PA.DF.status === 'conflict', 'linking a file when both have data asks which to keep');
  both.close();

  // --- Not a PA App file ---
  const bad = loadApp({ pickFile: fakeFile('other.json', '{"hello":1}') });
  await bad.PA.DF.openExisting();
  check(bad.PA.DF.status === 'error' && /not a PA App data file/.test(bad.PA.DF.error), 'a non-PA App file is refused');
  bad.close();

  await tick(0);
  done();
})();
