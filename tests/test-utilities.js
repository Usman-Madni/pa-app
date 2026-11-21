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
  check(!/Invalid Date/.test(main().textContent) && /due .*\d{4}/.test(main().querySelector('.util-task').textContent), 'its bill task\'s due date reads as a date (not "Invalid Date")');
  main().querySelector('.utility-card [data-form-type="bill"][data-utility]').click();
  check(doc.querySelector('#modal form[data-form="asset-bill"]'), '"Add a bill" opens the bill pop-up');
  doc.querySelector('#modal [data-action="asset-cancel"]').click();
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

  // --- Bill days: the last day of the month; a bill due the month after the one it's for ---
  const lastOf = (ym) => { const [yy, mm] = ym.split('-').map(Number); return `${ym}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`; };
  const ymNow = today.slice(0, 7);
  const ymNext = PA.toISO(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)).slice(0, 7);
  const ymPrev = PA.toISO(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)).slice(0, 7);
  win.eval('openAssetForm')('utility', {});
  submitForm(win, 'asset-utility', { type: 'Water', name: 'Tank', day: 'last' });
  const water = PA.DB.utilities.find((x) => x.name === 'Tank');
  const wt = U.openTask(water);
  check(water.billDay === 'last' && wt.due.slice(0, 10) === lastOf(ymNow) && wt.repeat.anchorDay === 31, 'Last day of the month: due on this month\'s last day');
  const wn = PA.Series.tick(wt).next;
  check(wn.due.slice(0, 10) === lastOf(ymNext), 'and the next one on next month\'s last day (30, 31 or 28/29)');
  win.eval('openAssetForm')('utility', {});
  submitForm(win, 'asset-utility', { type: 'Phone', name: 'Mobile', day: '1', billFor: 'after' });
  const ph = PA.DB.utilities.find((x) => x.name === 'Mobile');
  const pt = U.openTask(ph);
  const mon = (ym) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(ym.slice(5)) - 1]} ${ym.slice(2, 4)}`;
  check(pt.due.slice(0, 7) === ymNext && pt.period === mon(ymNow) && PA.fullTitle(pt) === `Phone bill (${mon(ymNow)})`, 'due the month after: the task is named for the month the bill is for ("Phone bill (this month)", due next month)');
  doc.querySelector('[data-view="tasks"]').click();
  doc.querySelector(`#main [data-action="toggle-task"][data-id="${pt.id}"]`).click();
  confirmDone(win);
  await tick(10);
  check(doc.querySelector('#modal form').elements.month.value === ymNow, 'ticking it: the bill is for that month');
  submitForm(win, 'asset-bill', { amount: '1200' });
  const pb = PA.DB.bills.find((b) => b.utility === ph.id);
  check(pb.month === ymNow && U.months([ph], new Date().getFullYear())[new Date().getMonth()] === 1200, 'and it counts in the month it\'s for');
  const pnext = U.openTask(ph);
  check(pnext.period === mon(ymNext), 'the next copy is for the month after');
  win.eval('openAssetForm')('utility', { id: ph.id });
  submitForm(win, 'asset-utility', { day: '10' });
  check(Number(pnext.due.slice(8, 10)) === 10 && pnext.repeat.anchorDay === 10, 'a new bill day moves its next bill task');
  U.addBill({ utility: ph.id, date: `${ymNow}-03`, amount: 500, month: ymPrev });
  check(U.months([ph], new Date().getFullYear())[new Date().getMonth()] === 1200 || ymPrev.slice(0, 4) !== ymNow.slice(0, 4), 'a bill paid this month for last month counts in last month');

  // --- Units, a credit, and what it worked out at ---
  win.eval('openAssetForm')('utility', {});
  submitForm(win, 'asset-utility', { type: 'Electricity', name: 'Home power' });
  const el = PA.DB.utilities.find((x) => x.name === 'Home power');
  win.eval('openAssetForm')('bill', { utility: el.id });
  check(doc.querySelector('#modal form').elements.units && /Net metering credit/.test(doc.querySelector('#modal form').textContent), 'an electricity bill asks its units and the net metering credit');
  submitForm(win, 'asset-bill', { amount: '21,461', units: '345', credit: '12,156', month: ymNow });
  const eb = PA.DB.bills.find((b) => b.utility === el.id);
  const fig = U.figures(eb);
  check(eb.units === 345 && eb.credit === 12156 && fig.eff === 9305 && Math.round(fig.rate) === 62 && Math.round(fig.effRate) === 27, 'it works out the rate (62), the effective bill (9,305) and the effective rate (27)');
  check(U.sum([el], new Date().getFullYear()) === 9305, 'and costs count what it really cost (the bill less the credit)');
  win.eval('openAssetForm')('utility', { id: el.id });
  const sheet = doc.querySelector('#modal form');
  const heads = [...sheet.querySelectorAll('.sheet-side .ledger th')].map((x) => x.textContent).join(',');
  check(sheet.classList.contains('sheet') && sheet.querySelector('details.sheet-details:not([open])') && heads === 'Month,Units,Bill,Net metering,Rate,Effective bill,Effective rate,Paid on', `a connection opens as a sheet, its bills a table like the sheet you kept (got ${heads})`);
  win.eval('closeAssetForm')(true);
  // --- The bill itself: a file on the bill ---
  win.eval('openAssetForm')('bill', { id: eb.id });
  const bin = doc.querySelector('#modal input[data-input="bill-files"]');
  Object.defineProperty(bin, 'files', { value: [new win.File(['x'], 'IMG_1.jpg', { type: 'image/jpeg' })], configurable: true });
  bin.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick(40);
  const bd = U.billFiles(eb)[0];
  check(bd && bd.bill === eb.id && /^Me\/Vault\/Utilities\/Electricity\/Electricity bill \w+ \d{4}\.jpg$/.test(bd.attachments[0].file) && doc.querySelector('#modal').textContent.includes(bd.attachments[0].name), 'Add file on a bill: kept in Vault › Utilities › Electricity, named for the bill, listed on it');
  win.eval('closeAssetForm')(true);
  check(U.billFiles(bill).some((d) => d.attachments[0].file === t.attachments[0].file), 'the file on the task a bill was ticked from counts as that bill\'s');
  win.eval('openAssetForm')('bill', { utility: ph.id });
  check(!doc.querySelector('#modal form').elements.units && doc.querySelector('#modal [data-pending-files]'), 'a phone bill has no units; a new bill can pick its file as it\'s saved');
  win.eval('closeAssetForm')(true);

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
