// Pictures show a small preview in every list of files (Folders, a task's files, a document's or asset's files), over
// their icon, which stays if the picture can't be shown; other files keep their icon. A picture opened large says what
// it's on and opens it ("Open the task"), except when that's already open under it.
const { loadApp, fakeFile, fakeFolder, tick, check, done } = require('./helpers');

(async () => {
  const folder = fakeFolder('Attachments');
  const app = loadApp({ pickFolder: folder, pickFile: fakeFile(), storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  await PA.DF.createNew();
  win.URL.createObjectURL = () => 'blob:pic';
  win.URL.revokeObjectURL = () => {};
  const Vault = win.eval('Vault');
  const Assets = win.eval('Assets');
  doc.querySelector('[data-view="settings"]').click();
  doc.querySelector('[data-action="at-folder"]').click();
  await tick(10);
  const jpg = (n) => new win.File(['x'], n, { type: 'image/jpeg' });

  const t = PA.addTask({ title: 'Fix the gate' });
  await PA.AT.add(t, [jpg('gate.jpg'), new win.File(['%PDF'], 'quote.pdf', { type: 'application/pdf' })]);
  const car = Assets.add({ kind: 'vehicle', name: 'Civic' });
  await PA.AT.add(car, [jpg('car.jpg')], 'assets', true);
  await Vault.addFiles('me', '', [jpg('Receipt.jpg')]);
  win.eval('changed')('tasks', 'assets');

  // --- The task's panel ---
  PA.state.openTask = t.id;
  PA.renderDrawer();
  await tick(20);
  const marks = [...doc.querySelectorAll('#drawer .p-row')].filter((r) => r.querySelector('[data-action="open-attach"]')).map((r) => r.querySelector('.p-ico'));
  check(marks[0].querySelector('img.file-thumb')?.getAttribute('src') === 'blob:pic' && marks[0].querySelector('svg'), 'a task\'s picture shows its preview (over its icon)');
  check(!marks[1].querySelector('img') && marks[1].querySelector('use[href="#i-file-type-pdf"]'), 'a PDF keeps its icon');

  // --- A pop-up's files, and the Folders tab ---
  win.eval('openAssetForm')('asset', { id: car.id });
  await tick(20);
  check(doc.querySelector('#modal .vh-row img.file-thumb')?.getAttribute('src') === 'blob:pic', 'an asset\'s files in its pop-up: previews');
  win.eval('closeAssetForm')(true);
  PA.state.openTask = null;
  PA.renderDrawer();
  doc.querySelector('[data-view="vault"]').click();
  doc.querySelector('#main [data-vault-tab="folders"]').click();
  const go = (name) => [...doc.querySelectorAll('#main [data-vault-go]')].find((b) => b.textContent.trim().startsWith(name)).click();
  go('Documents');
  await tick(20);
  check(doc.querySelector('#main .item .tl-mark img.file-thumb')?.getAttribute('src') === 'blob:pic', 'the Vault\'s plain files: previews');
  doc.querySelector('[data-vault-go=""]').click();
  go('Tasks');
  await tick(20);
  check(doc.querySelector('#main .item .tl-mark img.file-thumb')?.getAttribute('src') === 'blob:pic', 'Folders outside the Vault: previews');

  // --- Open what it's on, from the picture ---
  doc.querySelector('#main .item [data-action="rec-file-open"]').click();
  await tick(10);
  const goBtn = doc.querySelector('#viewer [data-action="viewer-go"]');
  check(goBtn && /Open the task/.test(goBtn.textContent), 'a picture opened from the Folders tab offers "Open the task"');
  goBtn.click();
  check(!doc.querySelector('#viewer') && PA.state.openTask === t.id, 'it closes the picture and opens the task');
  doc.querySelector('#drawer [data-action="open-attach"]').click();
  await tick(10);
  check(doc.querySelector('#viewer') && !doc.querySelector('#viewer [data-action="viewer-go"]'), 'opened from the task itself: no "Open the task"');
  win.eval('Viewer').close();
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();
  done();
})();
