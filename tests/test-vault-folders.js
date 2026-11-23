// Folders in the Vault: make, open, rename and delete them; drop plain files (bills, agreements) into one, each kept
// under its own name; move a document or file to another folder (its file on disk follows); turn a plain file into a
// document with dates and a renew reminder. With everyone shown the Vault opens on each person's folder (and Shared);
// with one person shown, on theirs. Read-only changes nothing.
const { loadApp, fakeFile, fakeFolder, answer, submitForm, tick, check, done } = require('./helpers');

(async () => {
  const folder = fakeFolder('Attachments');
  const app = loadApp({ pickFolder: folder, pickFile: fakeFile() });
  const { win, doc, PA } = app;
  await PA.DF.createNew();
  const Vault = win.eval('Vault');
  const People = win.eval('People');
  PA.AT.SETTLE_MS = 5;
  doc.querySelector('[data-view="settings"]').click();
  doc.querySelector('[data-action="at-folder"]').click();
  await tick(10);
  const main = () => doc.querySelector('#main');
  const go = (name) => [...main().querySelectorAll('[data-vault-go]')].find((b) => b.textContent.includes(name)).click();
  const pick = async (files) => {
    const input = main().querySelector('input[data-input="vault-files"]');
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new win.Event('change', { bubbles: true }));
    await tick(30);
  };

  // --- The Folders tab ---
  doc.querySelector('[data-view="vault"]').click();
  main().querySelector('[data-vault-tab="folders"]').click();
  check(main().querySelector('[data-vault-tab="folders"].active') && [...main().querySelectorAll('.vault-folder .title')].map((x) => x.textContent).join() === 'Documents', 'a Folders tab: your folder, as on disk (just you: no level of people): Documents to start (no Vault folder)');
  check(main().querySelector('[data-action="vault-folder-new"][data-path=""]'), 'New folder right in your folder');
  main().querySelector('[data-action="vault-folder-new"]').click();
  await answer(win, true, 'Car');
  const carRow = [...main().querySelectorAll('.vault-folder')].find((x) => /Car/.test(x.textContent));
  check(carRow && /Empty/.test(carRow.textContent), 'New folder: "Car" is there, empty, beside Documents');
  go('Car');
  main().querySelector('[data-action="vault-folder-new"]').click();
  await answer(win, true, 'Insurance');
  go('Insurance');
  check(/Files\s*›\s*Car\s*›\s*Insurance/.test(main().querySelector('.vault-crumbs').textContent), 'folders inside folders, with the way back');

  // --- Plain files ---
  await pick([new win.File(['%PDF'], 'Policy 2026.pdf', { type: 'application/pdf' }), new win.File(['x'], 'receipt.jpg', { type: 'image/jpeg' })]);
  const policy = PA.DB.docs.find((d) => d.name === 'Policy 2026');
  check(policy && policy.plain && policy.folder === 'Car/Insurance' && PA.DB.docs.find((d) => d.name === 'receipt')?.plain, 'Add files: each file is its own plain file in this folder, named after it');
  check(policy.attachments[0].file === 'Me/Car/Insurance/Policy 2026.pdf' && folder.at('Me/Car/Insurance/Policy 2026.pdf'), 'its file keeps its own name, in the same folders on disk');
  check(main().querySelectorAll('[data-action="rec-file-open"]').length === 2 && /2 files/.test(main().querySelector('.page-head').textContent), 'listed in the folder; the page counts files apart from documents');
  check(!main().querySelector('[data-vault-tab="file"]'), 'plain files make no tab of their own');
  doc.querySelector('[data-vault-go=""]').click();
  check(/2 things/.test([...main().querySelectorAll('.vault-folder')].find((x) => /Car/.test(x.textContent)).textContent), 'a folder says how many things are inside it, all the way down');

  // --- Details: move it, or make it a document ---
  PA.state.assetForm = null;
  win.eval('openAssetForm')('doc', { id: policy.id });
  const form = () => doc.querySelector('#modal form');
  check(form().elements.track && form().querySelector('.doc-full').style.display === 'none' && form().elements.folder.value === 'Car/Insurance', 'a plain file\'s details: no dates until asked for; its folder');
  submitForm(win, 'asset-doc', { folder: 'Car' });
  await tick(40);
  check(policy.folder === 'Car' && policy.plain && policy.attachments[0].file === 'Me/Car/Policy 2026.pdf' && folder.at('Me/Car/Policy 2026.pdf'), 'moved to Car: its file moves too');
  const rec = PA.DB.docs.find((d) => d.name === 'receipt');
  win.eval('openAssetForm')('doc', { id: rec.id });
  form().elements.track.checked = true;
  form().elements.track.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(form().querySelector('.doc-full').style.display === '', 'ticking "Keep its dates" shows them');
  submitForm(win, 'asset-doc', { cat: 'other', expires: '2027-06-01', renewMonths: '1' });
  await tick(20);
  check(!rec.plain && rec.cat === 'other' && rec.expires === '2027-06-01' && PA.DB.tasks.some((t) => t.id.startsWith(`doc-renew-${rec.id}-`)), 'it becomes a document, with its renew reminder');
  check(PA.DB.folders.some((f) => f.path === 'Car/Insurance'), 'the emptied Insurance folder stays');
  doc.querySelector('#modal [data-action="asset-cancel"]')?.click();

  // --- Add document inside a folder ---
  doc.querySelector('[data-view="vault"]').click();
  main().querySelector('[data-vault-tab="folders"]').click();
  go('Car');
  main().querySelector('.vault-actions [data-form-type="doc"]').click();
  check(form().elements.folder.value === 'Car' && !form().elements.track, 'Add document from a folder: in that folder');
  doc.querySelector('#modal [data-action="asset-cancel"]').click();

  // --- Rename and delete a folder ---
  doc.querySelector('[data-vault-go=""]').click();
  const rowOf = (name) => [...main().querySelectorAll('.vault-folder')].find((x) => x.querySelector('.title').textContent === name);
  check(!rowOf('Documents').querySelector('[data-action="vault-folder-rename"]'), 'Documents is kept as it is (no rename or delete)');
  rowOf('Car').querySelector('[data-action="vault-folder-rename"]').click();
  await answer(win, true, 'Vehicle papers');
  await tick(40);
  check(policy.folder === 'Vehicle papers' && PA.DB.folders.some((f) => f.path === 'Vehicle papers/Insurance') && folder.at('Me/Vehicle papers/Policy 2026.pdf') && !folder.dirs.Me.dirs.Car, 'rename: everything inside follows, its files too');
  rowOf('Vehicle papers').querySelector('[data-action="vault-folder-delete"]').click();
  const q = await answer(win, false);
  check(/Delete the Vehicle papers folder and the 2 things in it\?/.test(q) && PA.DB.docs.includes(policy), 'delete asks first, saying what\'s inside; No keeps it');
  rowOf('Vehicle papers').querySelector('[data-action="vault-folder-delete"]').click();
  await answer(win, true);
  check(!PA.DB.docs.includes(policy) && !PA.DB.docs.includes(rec) && PA.DB.trash.filter((e) => e.kind === 'docs').length === 2 && !PA.DB.folders.length, 'Yes: what\'s inside goes to the Trash, the folder goes');
  check(!PA.DB.tasks.some((t) => t.id.startsWith(`doc-renew-${rec.id}-`) && !t.done), 'with its renew reminder');

  // --- People: Everyone opens on each person's folder; one person on theirs, with Shared ---
  const robin = People.add('Robin');
  const d1 = Vault.add({ cat: 'id', name: 'Robin ID', people: [robin.id] });
  const d2 = Vault.add({ cat: 'other', name: 'Joint deed', people: ['me', robin.id] });
  d2.folder = 'House';
  win.eval('changed')('docs');
  PA.render();
  doc.querySelector('[data-vault-go=""]').click(); // back to the top
  const tops = [...main().querySelectorAll('.vault-folder .title')].map((x) => x.textContent);
  check(tops.join(',') === 'Me,Robin,Shared', `with everyone shown: a folder per person and Shared (got ${tops.join(',')})`);
  go('Robin');
  go('Documents');
  check(main().textContent.includes('Robin ID') && /Files\s*›\s*Robin\s*›\s*Documents/.test(main().querySelector('.vault-crumbs').textContent), 'a person\'s folder holds their things');
  People.view(robin.id);
  const As = win.eval('Assets');
  const mineCar = As.add({ kind: 'vehicle', name: 'My car', owners: [{ id: 'me', share: 100 }] });
  const robinCar = As.add({ kind: 'vehicle', name: 'Robin car', owners: [{ id: robin.id, share: 100 }] });
  win.eval('changed')('assets');
  win.eval('openAssetForm')('doc', {});
  const af = doc.querySelector('#modal form');
  check(af.elements[`doc-a-${robinCar.id}`] && !af.elements[`doc-a-${mineCar.id}`], 'a new document, with Robin shown: only Robin\'s assets to link');
  win.eval('closeAssetForm')(true);
  doc.querySelector('[data-vault-go=""]').click();
  const rob = [...main().querySelectorAll('.vault-folder .title')].map((x) => x.textContent);
  check(rob.join(',') === 'Shared,Documents,Assets', `Robin shown: it opens on Robin's folder, with Shared as a folder (got ${rob.join(',')})`);
  go('Documents');
  check(main().textContent.includes('Robin ID'), 'Robin\'s Documents hold Robin\'s documents');
  doc.querySelector('[data-vault-go=""]').click();
  go('Shared');
  go('House');
  check(main().textContent.includes('Joint deed'), 'Shared holds what\'s on more than one person');
  People.view('all');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));

  // --- Read-only ---
  const storage = {};
  for (let i = 0; i < win.localStorage.length; i++) { const k = win.localStorage.key(i); storage[k] = win.localStorage.getItem(k); }
  app.close();
  const ro = loadApp({ storage, query: '?readonly' });
  ro.PA.state.readOnly = true;
  const made = await ro.win.eval('Vault').addFiles('me', '', [new ro.win.File(['x'], 'a.pdf')]);
  check(!made.length, 'read-only: no files added');
  ro.close();
  done();
})();
