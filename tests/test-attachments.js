// Attachments: folder, smart names, never overwriting, only names in the data file, open, 📌 kept-on-every-repeat
// vs this-one-only, renaming (and its real file), deleting only unused files, series history, reconnect, phone.
const { loadApp, fakeFile, fakeFolder, tick, check, done } = require('./helpers');

(async () => {
  const folder = fakeFolder('PA Attachments');
  const dataFile = fakeFile();
  const app = loadApp({ pickFolder: folder, pickFile: dataFile, storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  await PA.DF.createNew();
  const opened = [];
  win.open = (url) => { opened.push(url); };
  win.URL.createObjectURL = (f) => { opened.push(f); return 'blob:fake'; };
  win.URL.revokeObjectURL = () => {};
  win.confirm = () => true;
  const drawer = () => doc.querySelector('#drawer');
  const click = (sel) => doc.querySelector(sel).click();

  const t = PA.addTask({ title: 'Aug elec bill', due: '2026-09-05T23:59' });
  doc.querySelector('[data-view="tasks"]').click();
  click(`[data-action="open-task"][data-id="${t.id}"]`);
  check(drawer().textContent.includes('Choose attachments folder'), 'before a folder is chosen, the drawer asks for one');
  click('#drawer [data-action="at-folder"]');
  await tick(10);
  check(PA.AT.status === 'ok' && drawer().querySelector('[data-input="attach"]'), 'after choosing a folder, "Attach files" appears');

  // Smart names, never overwriting
  await folder.getFileHandle('Aug elec bill 2026.pdf', { create: true }); // already there
  const pdf = new win.File(['%PDF-1.4 fake'], 'scan0003.PDF', { type: 'application/pdf' });
  const photo = new win.File(['jpgdata'], 'IMG_2041.jpg', { type: 'image/jpeg' });
  await PA.AT.add(t, [pdf, photo]);
  const [a1, a2] = t.attachments;
  check(a1.name === 'Aug elec bill 2026 (2).pdf' && a1.file === a1.name, 'named from the task (+ year), and never overwrites a file already there');
  check(a2.name === 'Aug elec bill 2026.jpg' && a2.original === 'IMG_2041.jpg', 'photo named too; the original name is remembered');
  check(folder.files[a1.file] && folder.files[a1.file].parts[0] === pdf, 'the file itself is copied into the folder');
  check(a1.keep === false && a2.keep === false, 'new attachments belong to this one only');
  check(doc.querySelector('#main').textContent.includes('📎 2'), 'list shows 📎 2');

  // Data file holds only names, never contents
  await PA.DF.save();
  const saved = dataFile.json().data.tasks.find((x) => x.id === t.id).attachments;
  check(saved.length === 2 && saved[0].file === a1.file && saved[0].size > 0 && !JSON.stringify(saved).includes('PDF-1.4'), 'data file stores names and sizes only');

  // Open / missing file
  click(`#drawer [data-action="open-attach"][data-att="${a2.id}"]`);
  await tick(10);
  check(opened.includes('blob:fake'), 'opening an attachment shows the file');
  const keepCopy = folder.files[a2.file];
  delete folder.files[a2.file];
  click(`#drawer [data-action="open-attach"][data-att="${a2.id}"]`);
  await tick(10);
  check(doc.querySelector('#toasts').textContent.includes('not in the attachments folder'), 'a missing file gives a clear message');
  folder.files[a2.file] = keepCopy;

  // Make it repeat; 📌 shows; keep the photo (say, the meter location) on every repeat
  t.repeat = { freq: 'monthly', interval: 1, days: [], monthMode: 'date', unit: 'days', until: '', anchorDay: 5 };
  PA.renderDrawer();
  check(drawer().querySelectorAll('[data-action="toggle-keep"]').length === 2, 'a repeating task shows the 📌 switch on each file');
  click(`#drawer [data-action="toggle-keep"][data-att="${a2.id}"]`);
  check(a2.keep === true && a1.keep === false, '📌 marks one file to keep on every repeat');

  const next = PA.completeTask(t);
  check(next.title === 'Sep elec bill', 'next copy is "Sep elec bill"');
  check(next.attachments.length === 1 && next.attachments[0].file === a2.file && next.attachments[0].keep === true, 'only the 📌 file carries over');
  check(t.attachments.length === 2, "the bill stays with August's (done) copy");

  // Rename a 📌 kept file → every copy and the real file
  PA.state.openTask = next.id;
  PA.renderDrawer();
  win.prompt = () => 'Meter photo';
  click(`#drawer [data-action="rename-attach"][data-att="${next.attachments[0].id}"]`);
  await tick(20);
  check(next.attachments[0].name === 'Meter photo.jpg' && t.attachments[1].name === 'Meter photo.jpg', 'renaming a 📌 file renames it in every copy');
  check(folder.files['Meter photo.jpg'] && !folder.files['Aug elec bill 2026.jpg'], 'and renames the real file');

  // Rename a this-one-only file → just this task, and the real file
  PA.state.openTask = t.id;
  PA.renderDrawer();
  win.prompt = () => 'August electricity bill';
  click(`#drawer [data-action="rename-attach"][data-att="${a1.id}"]`);
  await tick(20);
  check(a1.name === 'August electricity bill.pdf' && folder.files['August electricity bill.pdf'] && !folder.files['Aug elec bill 2026 (2).pdf'], 'renaming a this-one-only file renames it and its real file');
  check(folder.files['Aug elec bill 2026.pdf'], "someone else's file in the folder is untouched");

  // An older shared (not 📌) file: renaming gives this task its own copy, the other keeps the old one
  const legacyA = PA.addTask({ title: 'Old A' });
  const legacyB = PA.addTask({ title: 'Old B' });
  await folder.getFileHandle('shared.pdf', { create: true });
  legacyA.attachments.push({ id: 'la', name: 'shared.pdf', file: 'shared.pdf', size: 1, type: 'application/pdf' });
  legacyB.attachments.push({ id: 'lb', name: 'shared.pdf', file: 'shared.pdf', size: 1, type: 'application/pdf' });
  await PA.AT.rename(legacyA, 'la', 'A only');
  check(legacyA.attachments[0].file === 'A only.pdf' && legacyB.attachments[0].file === 'shared.pdf' && folder.files['shared.pdf'] && folder.files['A only.pdf'], 'a shared this-one-only file: this task gets its own renamed copy');

  // Remove: file deleted only when no task uses it
  await PA.AT.remove(next, next.attachments[0].id);
  check(folder.files['Meter photo.jpg'], 'removing from one copy keeps the file while another copy uses it');
  await PA.AT.remove(t, t.attachments[1].id);
  check(!folder.files['Meter photo.jpg'], 'removing it from the last task deletes the file');
  win.confirm = () => false;
  await PA.AT.remove(t, t.attachments[0].id);
  check(t.attachments.length === 1, 'saying No keeps the attachment');
  win.confirm = () => true;

  // Series history on the new copy: August with its bill
  PA.state.openTask = next.id;
  PA.renderDrawer();
  const hist = drawer().querySelector('.history');
  check(hist && hist.textContent.includes('Aug elec bill') && hist.textContent.includes('August electricity bill.pdf') && hist.textContent.includes('done'), "history shows August's copy, done, with its bill");
  opened.length = 0;
  drawer().querySelector(`.history [data-action="open-attach"][data-task="${t.id}"]`).click();
  await tick(10);
  check(opened.includes('blob:fake'), "August's bill opens from the history");
  drawer().querySelector(`.history [data-action="open-history"][data-id="${t.id}"]`).click();
  check(PA.state.openTask === t.id && drawer().querySelector('.history').textContent.includes('Sep elec bill'), 'clicking a history entry opens that copy (whose history shows September)');

  // Restart: permission needs a click again
  const storage = {};
  for (let i = 0; i < win.localStorage.length; i++) { const k = win.localStorage.key(i); storage[k] = win.localStorage.getItem(k); }
  app.close();
  folder.permission = 'prompt';
  const again = loadApp({ storage, pickFolder: folder });
  again.PA.AT.dir = folder; // jsdom has no IndexedDB, so put the remembered folder back by hand
  await again.PA.AT.init();
  check(again.PA.AT.status === 'reconnect', 'after a restart the folder needs reconnecting');
  again.PA.state.openTask = t.id;
  again.PA.renderDrawer();
  folder.permission = 'granted';
  again.doc.querySelector('#drawer [data-action="at-reconnect"]').click();
  await tick(10);
  check(again.PA.AT.status === 'ok', 'one click reconnects');
  again.close();

  // Phone: names visible, nothing can be opened or changed
  const ro = loadApp({ fsa: false });
  await ro.PA.RO.open({ name: 'd.json', text: async () => JSON.stringify({ app: 'PA App', version: 2, saveToken: 't', data: {
    tasks: [{ id: 'p', title: 'Passport renewal', attachments: [{ id: 'a1', name: 'passport.jpg', file: 'passport.jpg', size: 2048, type: 'image/jpeg' }] }],
    notes: [], events: [], buckets: [], labels: [],
  } }) });
  ro.PA.state.openTask = 'p';
  ro.PA.renderDrawer();
  const rd = ro.doc.querySelector('#drawer');
  check(rd.textContent.includes('passport.jpg') && rd.textContent.includes('open on your computer only'), 'phone shows attachment names and explains they open on the computer');
  check(!rd.querySelector('[data-input="attach"]') && rd.querySelector('fieldset').disabled, 'phone cannot attach, rename or remove files');
  await ro.PA.AT.add(ro.PA.DB.tasks[0], [new ro.win.File(['x'], 'x.txt')]);
  check(ro.PA.DB.tasks[0].attachments.length === 1, 'phone cannot add attachments even if asked');
  ro.close();
  done();
})();
