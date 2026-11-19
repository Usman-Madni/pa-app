// "From Vault": attaching a file that's already in the Vault to a task, an asset or an upkeep entry points to the same
// file (nothing copied, marked as from the Vault). The file stays in its Vault folder; renaming it from the task renames
// it in the Vault too; removing it from the task says it stays in the Vault, and it does. Documents themselves and
// read-only devices get no picker.
const { loadApp, fakeFile, fakeFolder, answer, tick, check, done } = require('./helpers');

(async () => {
  const folder = fakeFolder('Attachments');
  const app = loadApp({ pickFolder: folder, pickFile: fakeFile(), storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  await PA.DF.createNew();
  const Vault = win.eval('Vault');
  const Assets = win.eval('Assets');
  PA.AT.SETTLE_MS = 5;
  doc.querySelector('[data-view="settings"]').click();
  doc.querySelector('[data-action="at-folder"]').click();
  await tick(10);
  const [bill] = await Vault.addFiles('me', 'Bills', [new win.File(['%PDF'], 'Electricity Oct.pdf', { type: 'application/pdf' })]);
  const pass = Vault.add({ cat: 'travel', name: 'Passport' });
  await PA.AT.add(pass, [new win.File(['x'], 'scan.jpg', { type: 'image/jpeg' })], 'docs', true);
  const before = folder.paths().length;

  // --- A task ---
  const t = PA.addTask({ title: 'Pay electricity' });
  PA.state.openTask = t.id;
  PA.renderDrawer();
  const pickIn = (root) => root.querySelector('select[data-vault-link]');
  const sel = pickIn(doc.querySelector('#drawer'));
  const groups = [...sel.querySelectorAll('optgroup')].map((g) => g.label);
  check(sel && groups.join(',') === 'Bills,Vault' && sel.textContent.includes('Electricity Oct.pdf') && sel.textContent.includes('Passport: Passport 2026.jpg'), `the task offers From Vault, by folder (got ${groups.join(',')})`);
  sel.value = `${bill.id}:${bill.attachments[0].id}`;
  sel.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick(30);
  const linked = t.attachments[0];
  check(linked && linked.file === 'Me/Vault/Bills/Electricity Oct.pdf' && linked.vault && folder.paths().length === before, 'choosing one points to the same file: nothing copied');
  check(doc.querySelector('#drawer .vault-mark') && !pickIn(doc.querySelector('#drawer')).textContent.includes('Electricity Oct.pdf'), 'it shows as from the Vault, and isn\'t offered again');
  check(bill.attachments[0].file === linked.file && folder.at(linked.file), 'the file stays in its Vault folder');

  // --- Rename from the task: the Vault follows ---
  await PA.AT.rename(t, linked.id, 'Electricity October');
  check(linked.file === 'Me/Vault/Bills/Electricity October.pdf' && bill.attachments[0].file === linked.file && folder.at(linked.file) && !folder.at('Me/Vault/Bills/Electricity Oct.pdf'), 'renaming it from the task renames it in the Vault too');

  // --- Remove from the task: it stays in the Vault ---
  const removing = PA.AT.remove(t, linked.id);
  const q = await answer(win, true);
  await removing;
  check(/It stays in the Vault/.test(q) && !t.attachments.length && bill.attachments.length === 1 && folder.at(bill.attachments[0].file), 'removing it from the task says it stays in the Vault, and it does');

  // --- An asset and its pop-up ---
  const car = Assets.add({ kind: 'vehicle', name: 'Civic' });
  PA.DB.assets.includes(car) || PA.DB.assets.push(car);
  win.eval('openAssetForm')('asset', { id: car.id });
  const s2 = pickIn(doc.querySelector('#modal'));
  check(s2, 'an asset\'s files offer From Vault too');
  s2.value = `${pass.id}:${pass.attachments[0].id}`;
  s2.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick(30);
  check(car.attachments.length === 1 && car.attachments[0].file === pass.attachments[0].file && car.attachments[0].file.startsWith('Me/Vault/'), 'linked to the asset; the file stays in the Vault (not moved to Assets)');
  check(doc.querySelector('#modal .vault-mark'), 'marked as from the Vault there too');
  win.eval('closeAssetForm')();
  win.eval('openAssetForm')('doc', { id: pass.id });
  check(!pickIn(doc.querySelector('#modal')), 'a document itself gets no From Vault');
  win.eval('closeAssetForm')();
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));

  // --- Read-only ---
  const storage = {};
  for (let i = 0; i < win.localStorage.length; i++) { const k = win.localStorage.key(i); storage[k] = win.localStorage.getItem(k); }
  app.close();
  const ro = loadApp({ storage, query: '?readonly' });
  ro.PA.state.readOnly = true;
  ro.PA.DB.docs.push(...JSON.parse(storage.pa_docs));
  ro.PA.DB.tasks.push(ro.PA.normalizeTask({ id: 'r', title: 'x' }));
  ro.PA.state.openTask = 'r';
  ro.PA.renderDrawer();
  check(!ro.doc.querySelector('#drawer select[data-vault-link]') && !ro.PA.AT.link(ro.PA.DB.tasks[0], 'tasks', { file: 'a', name: 'a' }), 'read-only: no picker, and nothing is linked');
  ro.close();
  done();
})();
