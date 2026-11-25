// A save that hangs (OneDrive holding the data file while it syncs) gives up after a time limit and shows the save
// problem with Try again, instead of "Saving…" for ever; the save that hung can never write late over a newer one.
const { loadApp, fakeFile, submitForm, tick, check, done } = require('./helpers');

const later = () => { let go; const p = new Promise((r) => { go = r; }); return { p, go }; };

(async () => {
  const file = fakeFile();
  const app = loadApp({ pickFile: file });
  const { win, PA } = app;
  await PA.DF.createNew();
  await PA.DF.save();
  PA.DF.SAVE_LIMIT_MS = 150;

  // --- Reading the file hangs ---
  const realGetFile = file.getFile;
  const read = later();
  file.getFile = () => read.p;
  submitForm(win, 'quick-add', { title: 'Typed while OneDrive was busy' });
  const writes = file.writes;
  await PA.DF.save();
  check(PA.DF.status === 'error' && /didn't answer/.test(PA.DF.error) && !PA.DF.saving, 'a save that hangs gives up after the limit: Save problem, not "Saving…" for ever');
  check(win.document.querySelector('#banner [data-action="df-retry"]'), 'with Try again');
  read.go(await realGetFile()); // the file answers late
  await tick(30);
  check(file.writes === writes, 'and when the file answers late, that save doesn\'t write after all');

  // --- Try again: saves ---
  file.getFile = realGetFile;
  win.document.querySelector('#banner [data-action="df-retry"]').click();
  await tick(100);
  check(PA.DF.status === 'ok' && file.json().data.tasks.some((t) => t.title === 'Typed while OneDrive was busy') && win.localStorage.getItem('dev_unsaved') === 'false', 'Try again saves it, nothing lost');

  // --- Opening the file for writing hangs ---
  const realCW = file.createWritable;
  const open = later();
  let aborted = 0;
  file.createWritable = () => open.p;
  submitForm(win, 'quick-add', { title: 'Second try' });
  await PA.DF.save();
  check(PA.DF.status === 'error' && !PA.DF.saving, 'a hang while opening the file for writing gives up too');
  const w = await realCW();
  open.go({ ...w, abort: async () => { aborted++; } });
  await tick(30);
  const writesNow = file.writes;
  check(aborted === 1 && file.json().data.tasks.every((t) => t.title !== 'Second try'), 'and when it opens late, the write is dropped (never late over a newer save)');
  file.createWritable = realCW;
  win.document.querySelector('#banner [data-action="df-retry"]').click();
  await tick(100);
  check(PA.DF.status === 'ok' && file.writes === writesNow + 1 && file.json().data.tasks.some((t) => t.title === 'Second try'), 'Try again saves that one too');

  // --- The backup folder stops answering (Chrome's link to it gone bad, 25 Nov): saving carries on ---
  const { fakeFolder } = require('./helpers');
  const folder = fakeFolder('Backups');
  win.showDirectoryPicker = async () => folder;
  const asked = later();
  folder.queryPermission = () => asked.p; // never answers
  PA.DF.BACKUP_LIMIT_MS = 150;
  const choosing = PA.DF.pickBackupFolder();
  submitForm(win, 'quick-add', { title: 'Saved while the backup folder hung' });
  await PA.DF.save();
  check(PA.DF.status === 'ok' && !PA.DF.error && file.json().data.tasks.some((t) => t.title === 'Saved while the backup folder hung'), 'a backup folder that never answers doesn\'t hold up the save, and it isn\'t a Save problem');
  await choosing;
  check(PA.DF.backupStuck && /Daily backup didn't finish/.test(win.document.body.textContent), 'it says the backup didn\'t finish, and how to fix it');
  let askedAgain = 0;
  folder.queryPermission = () => { askedAgain++; return asked.p; };
  submitForm(win, 'quick-add', { title: 'And another' });
  await PA.DF.save();
  check(PA.DF.status === 'ok' && askedAgain === 0, 'later saves don\'t wait on it again');
  PA.state.view = 'settings';
  PA.render();
  check(win.document.querySelector('[data-backup-stuck]'), 'Settings › Daily backups says to choose the folder again');
  folder.queryPermission = async () => 'granted';
  await PA.DF.pickBackupFolder();
  check(!PA.DF.backupStuck && Object.keys(folder.files).length === 1, 'choosing the folder again backs up');

  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  done();
})();
