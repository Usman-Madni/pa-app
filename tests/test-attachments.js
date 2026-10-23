// Attachments: choose a folder, attach (copied, never overwriting), open, remove (file deleted only when no
// task uses it), shared by repeat copies, only names in the data file, reconnect after restart, phone read-only.
const { loadApp, fakeFile, fakeFolder, tick, check, done } = require('./helpers');

(async () => {
  const folder = fakeFolder('PA Attachments');
  const dataFile = fakeFile();
  const app = loadApp({ pickFolder: folder, pickFile: dataFile });
  const { win, doc, PA } = app;
  await PA.DF.createNew();
  const opened = [];
  win.open = (url) => { opened.push(url); };
  win.URL.createObjectURL = (f) => { opened.push(f); return 'blob:fake'; };
  win.URL.revokeObjectURL = () => {};
  const drawer = () => doc.querySelector('#drawer');

  const t = PA.addTask({ title: 'Pay electricity bill' });
  doc.querySelector('[data-view="tasks"]').click();
  doc.querySelector(`[data-action="open-task"][data-id="${t.id}"]`).click();
  check(drawer().textContent.includes('Choose attachments folder'), 'before a folder is chosen, the drawer asks for one');

  doc.querySelector('#drawer [data-action="at-folder"]').click();
  await tick(10);
  check(PA.AT.status === 'ok' && drawer().querySelector('[data-input="attach"]'), 'after choosing a folder, "Attach files" appears');

  // Attach two files, one with a name that already exists in the folder
  await folder.getFileHandle('bill.pdf', { create: true }); // someone else's file already there
  const pdf = new win.File(['%PDF-1.4 fake'], 'bill.pdf', { type: 'application/pdf' });
  const photo = new win.File(['jpgdata'], 'meter photo.jpg', { type: 'image/jpeg' });
  await PA.AT.add(t, [pdf, photo]);
  check(t.attachments.length === 2, 'two files attached');
  check(t.attachments[0].name === 'bill.pdf' && t.attachments[0].file === 'bill (2).pdf', 'a file with the same name is never overwritten (saved as "bill (2).pdf")');
  check(folder.files['bill (2).pdf'] && folder.files['bill (2).pdf'].parts[0] === pdf, 'the file itself is copied into the folder');
  check(folder.files['meter photo.jpg'], 'photo copied too');
  check(drawer().textContent.includes('bill.pdf') && drawer().textContent.includes('meter photo.jpg'), 'drawer lists the attachments');
  check(doc.querySelector('#main').textContent.includes('📎 2'), 'list shows 📎 2');

  // Data file holds only names, not contents
  await PA.DF.save();
  const saved = dataFile.json().data.tasks.find((x) => x.id === t.id).attachments;
  check(saved.length === 2 && saved[0].file === 'bill (2).pdf' && saved[0].size > 0 && !JSON.stringify(saved).includes('PDF-1.4'), 'data file stores names and sizes only, never file contents');

  // Open
  doc.querySelector(`#drawer [data-action="open-attach"][data-att="${t.attachments[1].id}"]`).click();
  await tick(10);
  check(opened.includes('blob:fake'), 'opening an attachment shows the file');
  // Missing file
  delete folder.files['meter photo.jpg'];
  doc.querySelector(`#drawer [data-action="open-attach"][data-att="${t.attachments[1].id}"]`).click();
  await tick(10);
  check(doc.querySelector('#toasts').textContent.includes('not in the attachments folder'), 'a missing file gives a clear message');
  await folder.getFileHandle('meter photo.jpg', { create: true });

  // Repeat copy shares the files
  t.repeat = { freq: 'daily', interval: 1, days: [], monthMode: 'date', unit: 'days', until: '' };
  t.due = '2030-01-01T09:00';
  const copy = PA.completeTask(t);
  check(copy.attachments.length === 2 && copy.attachments[0].file === 'bill (2).pdf' && copy.attachments[0].id !== t.attachments[0].id, 'the next copy of a repeating task keeps the attachments');

  // Remove from one task: file stays (still used); remove from both: file deleted
  PA.state.openTask = t.id;
  PA.renderDrawer();
  win.confirm = () => true;
  await PA.AT.remove(t, t.attachments[0].id);
  check(t.attachments.length === 1 && folder.files['bill (2).pdf'], 'removing from one task keeps the file while another task uses it');
  await PA.AT.remove(copy, copy.attachments[0].id);
  check(!folder.files['bill (2).pdf'], 'removing it from the last task deletes the copied file');
  check(folder.files['bill.pdf'], "the folder's other files are never touched");
  win.confirm = () => false;
  await PA.AT.remove(copy, copy.attachments[0].id);
  check(copy.attachments.length === 1, 'saying No keeps the attachment');

  // Restart: permission needs a click again
  const storage = {};
  for (let i = 0; i < win.localStorage.length; i++) { const k = win.localStorage.key(i); storage[k] = win.localStorage.getItem(k); }
  app.close();
  folder.permission = 'prompt';
  const again = loadApp({ storage, pickFolder: folder });
  again.PA.AT.dir = folder; // jsdom has no IndexedDB, so put the remembered folder back by hand
  await again.PA.AT.init();
  check(again.PA.AT.status === 'reconnect', 'after a restart the folder needs reconnecting');
  again.PA.state.openTask = copy.id;
  again.PA.renderDrawer();
  check(again.doc.querySelector('#drawer [data-action="at-reconnect"]'), 'drawer offers "Reconnect attachments folder"');
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
  check(!rd.querySelector('[data-input="attach"]') && !rd.querySelector('[data-action="at-folder"]'), 'phone cannot attach files');
  await ro.PA.AT.add(ro.PA.DB.tasks[0], [new ro.win.File(['x'], 'x.txt')]);
  check(ro.PA.DB.tasks[0].attachments.length === 1, 'phone cannot add attachments even if asked');
  ro.close();
  done();
})();
