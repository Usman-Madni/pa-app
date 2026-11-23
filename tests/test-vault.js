// The ID vault: documents with a category, type, number, dates, notes, scans, whose they are and the assets they
// belong to (both ways: a car shows its insurance). One that expires gets a "Renew …" task for its people, due a chosen
// time before; a new expiry date makes the next and ticks the old; ticking it opens the document for the new date.
// Deleting a document takes its open reminder too (with Undo); deleting an asset unlinks its documents; a transfer
// offers to move them. The person picker filters them. Older files load; read-only can open scans but change nothing.
const { loadApp, fakeFolder, check, done, answer, submitForm, confirmDone, tick } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const V = win.eval('Vault');
  const A = win.eval('Assets');
  const People = win.eval('People');
  const changed = win.eval('changed');
  win.eval('PendingDelete').UNDO_MS = 50;
  const main = () => doc.querySelector('#main').textContent;
  const modal = () => doc.querySelector('#modal form');
  const inYear = (n, m = 6, d = 15) => `${new Date().getFullYear() + n}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  // --- The rules ---
  const pass = V.add({ cat: 'travel', type: 'Passport', name: 'Passport', number: 'AB1234567', issued: inYear(-5), expires: inYear(2) });
  check(V.renewOn(pass) === inYear(2, 3, 15) && V.state(pass) === 'ok', 'a renew date 3 months before it expires');
  check(V.state({ expires: '2000-01-01' }) === 'expired' && V.state({ expires: PA.toISO(new Date(Date.now() + 30 * 864e5)), renewMonths: 3 }) === 'renew' && V.state({ expires: '' }) === '', 'expired, time to renew, or nothing to say');
  changed('docs');
  win.eval('vaultTasks')();
  const t = PA.DB.tasks.find((x) => x.id === `doc-renew-${pass.id}-${pass.expires}`);
  check(t && t.title === 'Renew Passport' && t.due === `${V.renewOn(pass)}T23:59` && People.mine(t), 'a "Renew Passport" task on that date, yours');
  check(t.reminders.length === 1 && t.reminders[0].kind === 'dayof' && t.reminders[0].time === '09:00', 'with a reminder at 9 am that day (it reaches To Do)');
  win.eval('vaultTasks')();
  check(PA.DB.tasks.filter((x) => x.id.startsWith(`doc-renew-${pass.id}`)).length === 1, 'only ever one');

  // A new expiry date: the old one is renewed (ticked), the next is made
  pass.expires = inYear(12);
  changed('docs');
  win.eval('vaultTasks')();
  check(t.done && PA.DB.tasks.some((x) => x.id === `doc-renew-${pass.id}-${inYear(12)}` && !x.done), 'a new expiry date ticks the old reminder and makes the next');

  // --- The page ---
  doc.querySelector('[data-view="vault"]').click();
  check(doc.querySelector('.nav-btn.active').dataset.view === 'vault' && /<h1>Vault<\/h1>/.test(doc.querySelector('#main').innerHTML), 'the Vault is in the sidebar');
  check(!/AB1234567/.test(main()) && /Ending 4567/.test(main()) === false, 'the overview doesn\'t show numbers');
  doc.querySelector('[data-vault-tab="travel"]').click();
  check(/Ending 4567/.test(main()) && !/AB1234567/.test(main()), 'a list shows only the end of a number');
  doc.querySelector('#main [data-action="asset-form"][data-form-type="doc"]').click();
  check(modal().elements.cat.value === 'travel' && modal().elements.renewMonths.value === '3', 'Add document starts in the open tab, reminding 3 months before');
  submitForm(win, 'asset-doc', { cat: 'id', type: 'National ID card', name: 'ID card', number: '12345-6789012-3', issued: '2020-01-01', expires: '2019-01-01' });
  check(/can't expire before it was issued/.test(modal().textContent) && PA.DB.docs.length === 1, 'an expiry before the issue date is refused');
  submitForm(win, 'asset-doc', { expires: inYear(3, 1, 10) });
  const idc = PA.DB.docs.find((d) => d.name === 'ID card');
  check(idc && idc.number === '12345-6789012-3' && modal() && modal().dataset.form === 'asset-doc' && /Add file|Choose the attachments folder/.test(doc.querySelector('#modal').textContent), 'saved, and it stays open to add scans');
  check(PA.DB.tasks.some((x) => x.id === `doc-renew-${idc.id}-${idc.expires}`), 'with its own renew task');
  doc.querySelector('#modal [data-action="asset-cancel"]').click();

  // --- Linked to an asset, both ways ---
  const car = A.add({ kind: 'vehicle', name: 'Family car', amount: 3000000, date: '2026-01-01' });
  changed('assets');
  doc.querySelector('[data-view="assets"]').click();
  PA.device.set('vehicleCar', car.id); PA.device.set('vehicleTab', 'overview'); win.eval('setView')('vehicles'); doc.querySelector('[data-vehicle-tab="details"]').click(); doc.querySelector('#main [data-action="open-asset"]').click();
  doc.querySelector('#modal [data-action="asset-form"][data-form-type="doc"]').click();
  check(modal().elements[`doc-a-${car.id}`].checked, '"New document" from an asset starts linked to it');
  submitForm(win, 'asset-doc', { cat: 'other', type: 'Insurance policy', name: 'Car insurance', expires: inYear(1, 3, 1), renewMonths: '1' });
  const ins = PA.DB.docs.find((d) => d.name === 'Car insurance');
  check(ins.assets.join() === car.id && PA.DB.tasks.some((x) => x.title === 'Renew Car insurance (Family car)'), 'its renew task names the car');
  doc.querySelector('#modal [data-action="open-asset"]').click();
  check(/Car insurance/.test(doc.querySelector('#modal').textContent), 'the car shows its insurance');
  const linkSel = doc.querySelector('#modal [data-link-doc]');
  linkSel.value = pass.id;
  linkSel.dispatchEvent(new win.Event('change', { bubbles: true }));
  const docsList = [...doc.querySelectorAll('#modal .value-history')].find((x) => x.querySelector('.meta')?.textContent === 'Documents');
  check(pass.assets.includes(car.id) && docsList && /Passport/.test(docsList.textContent), 'another document can be linked from the asset');
  doc.querySelector(`#modal [data-action="unlink-doc"][data-id="${pass.id}"]`).click();
  check(!pass.assets.includes(car.id), 'and unlinked');

  // A transfer offers to move its documents; deleting it unlinks them
  const kim = People.add('Kim Lee');
  doc.querySelector('[data-view="assets"]').click(); // Transfer is on the Assets page
  doc.querySelector('#modal [data-action="asset-cancel"]').click();
  doc.querySelector('#main [data-action="asset-form"][data-form-type="transfer"]').click();
  const sel = modal().elements.asset;
  sel.value = car.id;
  sel.dispatchEvent(new win.Event('change', { bubbles: true }));
  submitForm(win, 'asset-transfer', { from: PA.toISO(new Date()), 'share-me': '', [`share-${kim.id}`]: '100' });
  await tick(10);
  const q = await answer(win, true);
  check(/Car insurance/.test(q) && People.of(ins).join() === kim.id, 'transferring the car asks, then its insurance is Kim\'s too');
  win.eval('vaultTasks')();
  check(People.of(PA.DB.tasks.find((x) => x.title === 'Renew Car insurance (Family car)')).join() === kim.id, 'and so is its renew task (not your To Do)');
  doc.querySelector('[data-view="assets"]').click();
  PA.device.set('vehicleCar', car.id); PA.device.set('vehicleTab', 'overview'); win.eval('setView')('vehicles'); doc.querySelector('[data-vehicle-tab="details"]').click(); doc.querySelector('#main [data-action="open-asset"]').click();
  doc.querySelector('#modal [data-action="delete-asset"]').click();
  check(PA.DB.docs.includes(ins) && !V.forAsset(car.id).length === false && !PA.DB.assets.some((a) => a.id === car.id), 'deleting the car keeps its insurance');
  check(PA.DB.tasks.some((x) => x.title === 'Renew Car insurance' && !x.done), 'whose renew task no longer names it');
  doc.querySelector('#toasts [data-action="trash-undo"]').click();
  check(PA.DB.assets.some((a) => a.id === car.id) && V.forAsset(car.id).includes(ins), 'Undo brings the car back, still linked');

  // --- Whose ---
  const pick = (v) => { const s = doc.querySelector('#person-pick select'); s.value = v; s.dispatchEvent(new win.Event('input', { bubbles: true })); };
  doc.querySelector('[data-view="vault"]').click();
  pick('me');
  doc.querySelector('[data-vault-tab="overview"]').click();
  check(V.list().length === 2 && !V.list().includes(ins), 'showing you: Kim\'s insurance is hidden');
  pick('all');

  // --- Scans ---
  const folder = fakeFolder('Attachments');
  PA.AT.dir = folder;
  PA.AT.status = 'ok';
  doc.querySelector('[data-vault-tab="travel"]').click();
  doc.querySelector(`#main [data-action="open-doc"][data-id="${pass.id}"]`).click();
  const input = doc.querySelector('#modal [data-input="rec-attach"]');
  Object.defineProperty(input, 'files', { value: [new win.File(['%PDF'], 'scan.pdf', { type: 'application/pdf' })], configurable: true });
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick(20);
  check(pass.attachments.length === 1 && folder.at(pass.attachments[0].file) && /^Me\/Documents\/Passport \d{4}\.pdf$/.test(pass.attachments[0].file), 'a scan is copied into the attachments folder, named after the document');
  check(doc.querySelector('#modal [data-action="rec-file-open"]') && JSON.parse(win.localStorage.getItem('pa_docs')).find((d) => d.id === pass.id).attachments.length === 1, 'listed and saved');
  doc.querySelector('#modal [data-action="rec-file-remove"]').click();
  await answer(win, true);
  await tick(10);
  check(!pass.attachments.length && !folder.paths().length && !Object.keys(folder.dirs).length, 'removing it deletes the file (nothing else uses it), and the folders it leaves empty');

  // --- Ticking a renew task opens the document for its new date ---
  const rt = PA.DB.tasks.find((x) => x.id === `doc-renew-${idc.id}-${idc.expires}`);
  PA.state.openTask = rt.id;
  win.eval('openDonePrompt')(rt);
  confirmDone(win, {});
  check(rt.done && modal() && modal().dataset.form === 'asset-doc' && /Type the new expiry date/.test(modal().textContent), 'ticking "Renew ID card" opens it, asking for the new expiry date');
  doc.querySelector('#modal [data-action="asset-cancel"]').click();

  // --- Deleting a document ---
  doc.querySelector(`#main [data-action="open-doc"][data-id="${pass.id}"]`)?.click() || win.eval('openAssetForm')('doc', { id: pass.id });
  doc.querySelector('#modal [data-action="delete-doc"]').click();
  check(!PA.DB.docs.includes(pass) && !PA.DB.tasks.some((x) => x.id.startsWith(`doc-renew-${pass.id}`) && !x.done), 'deleting it (no question) takes its open reminder too');
  doc.querySelector('#toasts [data-action="trash-undo"]').click();
  check(PA.DB.docs.some((x) => x.id === pass.id) && PA.DB.tasks.some((x) => x.id.startsWith(`doc-renew-${pass.id}`) && !x.done), 'Undo brings back both');
  doc.querySelector('[data-view="vault"]').click();
  doc.querySelector(`#main [data-action="open-doc"][data-id="${pass.id}"]`)?.click() || win.eval('openAssetForm')('doc', { id: pass.id });
  doc.querySelector('#modal [data-action="delete-doc"]').click();
  check(PA.DB.trash.filter((e) => e.kind === 'docs').length === 1, 'deleted again, it waits in the Trash');
  check(!/[—·]/.test(main()), 'no em dashes or middle dots');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();

  // --- Older file; read-only ---
  const ro = loadApp({ fsa: false });
  await ro.PA.RO.open({ name: 'd.json', text: async () => JSON.stringify({ app: 'PA App', version: 2, saveToken: 't', data: { tasks: [], notes: [], events: [] } }) });
  check(Array.isArray(ro.PA.DB.docs), 'a file from before the vault loads');
  await ro.PA.RO.open({ name: 'd.json', text: async () => JSON.stringify({ app: 'PA App', version: 2, saveToken: 't2', data: { tasks: [], notes: [], events: [], docs: [{ id: 'd1', cat: 'id', name: 'ID card', number: '42', expires: '', attachments: [{ id: 'f1', name: 'id.pdf', file: 'id.pdf', size: 3, type: 'application/pdf' }] }] } }) });
  ro.doc.querySelector('[data-view="vault"]').click();
  ro.win.eval('openAssetForm')('doc', { id: 'd1' });
  check(ro.doc.querySelector('#modal fieldset.plain').disabled && !/Save/.test(ro.doc.querySelector('#modal .row:last-child').textContent), 'read-only opens a document without Save');
  const openBtn = ro.doc.querySelector('#modal [data-action="rec-file-open"]');
  check(!openBtn.matches(':disabled') && !openBtn.closest('fieldset[disabled]'), 'but its scans can still be opened');
  check(['delete-doc', 'unlink-doc', 'rec-file-remove'].every((a) => ro.win.eval('EDIT_ACTIONS').has(a)) && ro.win.eval('Vault').ensureTasks() === false, 'changing the vault is edit-only, and read-only makes no tasks');
  ro.close();
  done();
})();
