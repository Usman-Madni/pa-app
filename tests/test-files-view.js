// The Folders tab mirrors the attachments folder: a person's folder holds Vault, Tasks, Assets, Upkeep and Musings as on
// disk. Files elsewhere than the Vault open with a tap and go to what they're on; a thing's own folder (a car) shows
// even before it has files. Adding files in a thing's own folder attaches them to it; in a folder of many things it asks
// which, or keeps them there as plain files (which stay out of the Vault's own lists). A file linked from the Vault
// shows only in the Vault.
const { loadApp, fakeFile, fakeFolder, answer, tick, check, done } = require('./helpers');

(async () => {
  const folder = fakeFolder('Attachments');
  const app = loadApp({ pickFolder: folder, pickFile: fakeFile() });
  const { win, doc, PA } = app;
  await PA.DF.createNew();
  const Assets = win.eval('Assets');
  const Vault = win.eval('Vault');
  PA.AT.SETTLE_MS = 5;
  doc.defaultView.eval('setView')('settings');
  doc.querySelector('[data-action="at-folder"]').click();
  await tick(10);
  const file = (name, type = 'image/jpeg') => new win.File(['x'], name, { type });
  const main = () => doc.querySelector('#main');
  const names = () => [...main().querySelectorAll('.vault-folder .title')].map((x) => x.textContent).join(',');
  const go = (name) => [...main().querySelectorAll('[data-vault-go]')].find((b) => b.textContent.trim().startsWith(name)).click();
  const top = () => doc.querySelector('[data-vault-go=""]').click();
  const pick = async (files) => {
    const input = main().querySelector('input[data-input="area-files"]');
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new win.Event('change', { bubbles: true }));
    await tick(30);
  };

  const t = PA.addTask({ title: 'Passport photos', due: '2026-11-10T23:59' });
  await PA.AT.add(t, [file('p.jpg')]);
  const ring = Assets.add({ kind: 'gold', name: 'Ring', grams: 5 });
  const chain = Assets.add({ kind: 'gold', name: 'Chain', grams: 10 });
  await PA.AT.add(ring, [file('r.jpg')], 'assets', true);
  const car = Assets.add({ kind: 'vehicle', name: 'Civic' });
  const [bill] = await Vault.addFiles('me', '', [file('Bill.pdf', 'application/pdf')]);
  const linkTask = PA.addTask({ title: 'Pay bill' });
  PA.AT.link(linkTask, 'tasks', bill.attachments[0]);
  win.eval('changed')('tasks', 'assets');

  doc.querySelector('[data-view="vault"]').click();
  main().querySelector('[data-vault-tab="folders"]').click();
  check(names() === 'Documents,Assets,Tasks', `your folder shows your folders, then Butler's, as on disk (got ${names()})`);
  go('Tasks');
  const rows = [...main().querySelectorAll('.item .title')].map((x) => x.textContent);
  check(rows.join(',') === 'Passport photos 2026.jpg' && /On Passport photos/.test(main().textContent), 'Tasks: its files, each saying what it\'s on (a file linked from the Vault shows only in the Vault)');
  main().querySelector('[data-action="files-go"]').click();
  check(PA.state.openTask === t.id, 'the arrow opens the task');
  PA.state.openTask = null;
  PA.renderDrawer();

  top();
  go('Assets');
  check(names() === 'Gold,Vehicles', `Assets: a folder per kind (got ${names()})`);
  go('Vehicles');
  check(names() === 'Civic' && /Empty/.test(main().textContent), 'a car\'s own folder shows even with no files yet');
  go('Civic');
  await pick([file('front.jpg')]);
  check((car.attachments || []).length === 1 && car.attachments[0].file === 'Me/Assets/Vehicles/Civic/Civic 2026.jpg' && !doc.querySelector('#modal form[data-form="ask"]'), 'adding files in a car\'s folder attaches them to the car, no question');

  // --- A folder of many things: which one, or keep it here ---
  go('Assets');
  go('Gold');
  await pick([file('receipt.jpg')]);
  const sel = doc.querySelector('#modal form[data-form="ask"] select[name="answer"]');
  const opts = sel ? [...sel.options].map((o) => o.textContent) : [];
  check(opts.includes('Asset: Ring') && opts.includes('Asset: Chain') && opts[opts.length - 1] === 'Just keep it here', `a folder of many things asks which (got ${opts.join(' | ')})`);
  await answer(win, true, String(opts.indexOf('Asset: Chain')));
  await tick(30);
  check(chain.attachments.length === 1 && chain.attachments[0].file.startsWith('Me/Assets/Gold/'), 'the one picked gets it');
  await pick([file('valuation.pdf', 'application/pdf')]);
  await answer(win, true, 'keep');
  await tick(30);
  const kept = PA.DB.docs.find((d) => d.place === 'Assets/Gold');
  check(kept && kept.plain && kept.attachments[0].file === 'Me/Assets/Gold/valuation.pdf' && folder.at(kept.attachments[0].file), '"Just keep it here": a plain file kept in that folder, under its own name');
  check([...main().querySelectorAll('.item .title')].some((x) => x.textContent.includes('valuation')), 'it shows in that folder');
  check(!Vault.list().includes(kept) && !Vault.inTop('me').includes(kept), 'and stays out of the Vault\'s own lists');
  top();
  check(/1 thing/.test([...main().querySelectorAll('.vault-folder')].find((x) => x.textContent.includes('Documents')).textContent), 'Documents counts only its own things');
  check(main().querySelector('[data-action="vault-folder-new"][data-path=""]') && !main().querySelector('input[data-input="area-files"]'), 'a person\'s folder: New folder, but no loose files');
  go('Assets');
  check(!main().querySelector('[data-action="vault-folder-new"]') && main().querySelector('input[data-input="area-files"]'), 'outside the Vault: files can be added, folders can\'t be made');
  // --- Removing files ---
  top();
  go('Tasks');
  main().querySelector('[data-action="rec-file-remove"]').click();
  const rq = await answer(win, true);
  await tick(20);
  check(/Remove "Passport photos 2026.jpg" from this task\?/.test(rq) && !t.attachments.length, 'a file in Butler\'s folders: ✕ takes it off what it\'s on, after asking');
  top();
  go('Assets');
  go('Gold');
  main().querySelector(`[data-action="plain-remove"][data-id="${kept.id}"]`).click();
  const pq = await answer(win, true);
  await tick(20);
  check(/Delete "valuation.pdf"\? It goes to the Trash/.test(pq) && !PA.DB.docs.includes(kept) && PA.DB.trash.some((e) => e.kind === 'docs' && e.item.id === kept.id), 'a plain file: ✕ sends it to the Trash, after asking');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();
  done();
})();
