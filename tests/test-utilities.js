// Utilities: a page with Overview and a tab per type (and any other type typed in). A connection (name, provider,
// account, property, whose) gets a monthly bill task in a Utilities bucket, reminding at 9 am, whose files go to
// Vault › Utilities › <type> (a folder each once one person has two of a type, files following). Ticking it asks what
// the bill came to (empty skips); bills show on the tab, and the Overview says what's paid or due this month and what
// they cost this year against last. A property shows its utilities. Deleting one sends it, its bills and its open task
// to the Trash. Read-only adds nothing.
const { loadApp, fakeFile, fakeFolder, submitForm, confirmDone, tick, check, done } = require('./helpers');

(async () => {
  const folder = fakeFolder('Attachments');
  const app = loadApp({ pickFolder: folder, pickFile: fakeFile(), storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  await PA.DF.createNew();
  const U = win.eval('Utilities');
  const Assets = win.eval('Assets');
  PA.AT.SETTLE_MS = 5;
  doc.querySelector('[data-view="settings"]').click();
  doc.querySelector('[data-action="at-folder"]').click();
  await tick(10);
  const main = () => doc.querySelector('#main');
  const tabs = () => [...main().querySelectorAll('[data-util-tab].tab')].map((b) => b.textContent).join(',');
  const today = PA.toISO(new Date());
  const y = new Date().getFullYear();

  // --- The page ---
  doc.querySelector('[data-view="utilities"]').click();
  check(tabs() === 'Overview,Electricity,Gas,Water,Phone,Internet' && /Nothing here yet/.test(main().textContent), 'a Utilities page: Overview and a tab per type');
  const house = Assets.add({ kind: 'property', name: 'House', amount: '1000' });
  main().querySelector('[data-util-tab="Gas"]').click();
  main().querySelector('.page-actions [data-form-type="utility"]').click();
  check(doc.querySelector('#modal form').elements.type.value === 'Gas', 'Add a connection on the Gas tab: a gas one');
  submitForm(win, 'asset-utility', { name: 'Home', provider: 'GasCo', account: '12-345', property: house.id, day: '15' });
  const c = PA.DB.utilities[0];
  check(c && c.type === 'Gas' && c.name === 'Home' && c.account === '12-345' && c.property === house.id, 'saved with its provider, account and property');
  const t = U.openTask(c);
  check(t && t.title === 'Gas bill' && t.repeat?.freq === 'monthly' && Number(t.due.slice(8, 10)) === 15 && t.utility === c.id, 'its bill task: monthly, on the 15th');
  check(t.fileTo === 'Utilities/Gas' && PA.DB.buckets.find((b) => b.id === t.bucket)?.name === 'Utilities' && t.reminders.some((r) => r.time === '09:00'), 'in a Utilities bucket, reminding at 9 am, its files to Vault › Utilities › Gas');

  // --- A bill's file goes to the Vault ---
  await PA.AT.add(t, [new win.File(['%PDF'], 'scan.pdf', { type: 'application/pdf' })]);
  const att = t.attachments[0];
  check(att.file.startsWith('Me/Vault/Utilities/Gas/') && PA.DB.docs.some((d) => d.plain && d.folder === 'Utilities/Gas'), 'its file lands in Vault › Utilities › Gas, shown there too');

  // --- A second gas connection: a folder each ---
  win.eval('openAssetForm')('utility', { kind: 'Gas' });
  submitForm(win, 'asset-utility', { name: 'Shop', day: '' });
  await tick(40);
  const shop = PA.DB.utilities.find((x) => x.name === 'Shop');
  check(shop && !U.openTask(shop), 'no day: no bill task');
  check(t.fileTo === 'Utilities/Gas/Home' && PA.DB.docs.find((d) => d.plain).folder === 'Utilities/Gas/Home' && t.attachments[0].file.startsWith('Me/Vault/Utilities/Gas/Home/') && folder.at(t.attachments[0].file), 'two gas connections: Home\'s bills move to Utilities › Gas › Home, files too');
  PA.render();
  main().querySelector(`[data-action="utility-task"][data-id="${shop.id}"]`).click();
  await require('./helpers').answer(win, true, '3');
  const st = U.openTask(shop);
  check(st && st.title === 'Gas bill (Shop)' && Number(st.due.slice(8, 10)) === 3 && st.fileTo === 'Utilities/Gas/Shop', '"Make its bill task" later: on the day asked, named for the connection');

  // --- Ticking asks what it came to ---
  doc.querySelector('[data-view="tasks"]').click();
  main().querySelector(`[data-action="toggle-task"][data-id="${t.id}"]`).click();
  confirmDone(win);
  await tick(10);
  const billForm = doc.querySelector('#modal form[data-form="asset-bill"]');
  check(billForm && /What did the gas bill come to\?/.test(billForm.textContent), 'ticking the bill task asks what it came to');
  submitForm(win, 'asset-bill', { amount: '4500' });
  const bill = PA.DB.bills[0];
  check(bill && bill.amount === 4500 && bill.utility === c.id && bill.date === today && bill.task === t.id, 'the bill is kept, paid today');
  const next = U.openTask(c);
  main().querySelector(`[data-action="toggle-task"][data-id="${next.id}"]`).click();
  confirmDone(win);
  await tick(10);
  submitForm(win, 'asset-bill', { amount: '' });
  check(PA.DB.bills.length === 1 && !doc.querySelector('#modal form'), 'left empty: skipped, nothing kept');

  // --- The tab and the Overview ---
  U.addBill({ utility: c.id, date: `${y - 1}-01-10`, amount: 3000 });
  win.eval('changed')('bills');
  doc.querySelector('[data-view="utilities"]').click();
  main().querySelector('[data-util-tab="Gas"]').click();
  check(main().querySelectorAll('.utility-card').length === 2 && /Rs 4,500/.test(main().querySelector('.utility-card').textContent), 'the Gas tab: both connections, with their bills');
  main().querySelector('[data-util-tab="overview"]').click();
  const ov = main().textContent;
  check(/Paid Rs 4,500/.test(ov) && /This year so far, against last year/.test(ov), 'Overview: paid this month, and this year against last');
  check(main().querySelectorAll('.kind-bar').length === 12, 'and month by month');

  // --- A property shows its utilities ---
  win.eval('openAssetForm')('asset', { id: house.id });
  check(/Utilities/.test(doc.querySelector('#modal').textContent) && doc.querySelector('#modal').textContent.includes('Home'), 'the property\'s pop-up lists its utilities');
  win.eval('closeAssetForm')();

  // --- Another type ---
  win.eval('openAssetForm')('utility', {});
  submitForm(win, 'asset-utility', { type: 'Security', name: 'Guard' });
  check(tabs().includes('Security'), 'any other type gets its own tab');

  // --- Delete ---
  win.eval('openAssetForm')('utility', { id: c.id });
  doc.querySelector('#modal [data-action="utility-delete"]').click();
  check(!PA.DB.utilities.includes(c) && !PA.DB.bills.some((b) => b.utility === c.id) && !U.tasksOf(c).some((x) => !x.done) && PA.DB.trash.some((e) => e.kind === 'utilities'), 'deleting sends it, its bills and its open task to the Trash');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));

  // --- Read-only ---
  const storage = {};
  for (let i = 0; i < win.localStorage.length; i++) { const k = win.localStorage.key(i); storage[k] = win.localStorage.getItem(k); }
  app.close();
  const ro = loadApp({ storage, query: '?readonly' });
  ro.PA.state.readOnly = true;
  ro.doc.querySelector('[data-view="utilities"]').click();
  const add = ro.doc.querySelector('#main .page-actions');
  check(!add || add.classList.contains('edit-only'), 'read-only: adding is edit-only');
  ro.close();
  done();
})();
