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
  check(tabs() === 'Overview,Electricity,Gas,Water,Phone,Internet,Fuel' && /Nothing here yet/.test(main().textContent), 'a Utilities page: Overview and a tab per type');
  const house = Assets.add({ kind: 'property', name: 'House', amount: '1000' });
  main().querySelector('[data-util-tab="Gas"]').click();
  main().querySelector('.page-actions [data-form-type="utility"]').click();
  check(doc.querySelector('#modal form').elements.type.value === 'Gas', 'Add a connection on the Gas tab: a gas one');
  submitForm(win, 'asset-utility', { name: 'Home', provider: 'GasCo', account: '12-345', property: house.id, day: '15' });
  const c = PA.DB.utilities[0];
  check(c && c.type === 'Gas' && c.name === 'Home' && c.account === '12-345' && c.property === house.id, 'saved with its provider, account and property');
  const t = U.openTask(c);
  check(t && t.title === 'Home' && t.repeat?.freq === 'monthly' && Number(t.due.slice(8, 10)) === 15 && t.utility === c.id, 'its bill task: the connection\'s name, monthly, on the 15th');
  check(t.fileTo === 'Utilities/Gas' && PA.DB.buckets.find((b) => b.id === t.bucket)?.name === 'Utilities' && t.reminders.some((r) => r.time === '09:00'), 'in a Utilities bucket, reminding at 9 am, its files to Vault › Utilities › Gas');

  // --- A bill's file goes to the Vault ---
  await PA.AT.add(t, [new win.File(['%PDF'], 'scan.pdf', { type: 'application/pdf' })]);
  const att = t.attachments[0];
  check(att.name === `Home ${win.eval("ymLabel")(t.due.slice(0, 7))}.pdf`, `a file on the bill task is named for the connection and the month (got ${att.name})`);
  check(att.file.startsWith('Me/Utilities/Gas/') && PA.DB.docs.some((d) => d.plain && d.folder === 'Utilities/Gas'), 'its file lands in Vault › Utilities › Gas, shown there too');

  // --- A second gas connection: a folder each ---
  win.eval('openAssetForm')('utility', { kind: 'Gas' });
  submitForm(win, 'asset-utility', { name: 'Shop', day: '' });
  await tick(40);
  const shop = PA.DB.utilities.find((x) => x.name === 'Shop');
  check(shop && !U.openTask(shop), 'no day: no bill task');
  check(t.fileTo === 'Utilities/Gas/Home' && PA.DB.docs.find((d) => d.plain).folder === 'Utilities/Gas/Home' && t.attachments[0].file.startsWith('Me/Utilities/Gas/Home/') && folder.at(t.attachments[0].file), 'two gas connections: Home\'s bills move to Utilities › Gas › Home, files too');
  PA.render();
  main().querySelector(`[data-action="utility-task"][data-id="${shop.id}"]`).click();
  await require('./helpers').answer(win, true, '3');
  const st = U.openTask(shop);
  check(st && st.title === 'Shop' && Number(st.due.slice(8, 10)) === 3 && st.fileTo === 'Utilities/Gas/Shop', '"Make its bill task" later: on the day asked, named for the connection');

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
  check(main().querySelectorAll('.util-stats .stat-card').length === 3 && /This month/.test(ov) && new RegExp(`${y} so far|${y}`).test(ov) && /Average a month/.test(ov), 'Overview: three headline numbers (this month, the year so far, the average a month)');
  const gasGroup = main().querySelector('.util-group[data-type="Gas"]');
  const gasHeads = gasGroup && [...gasGroup.querySelectorAll('thead th')].map((x) => x.textContent);
  check(gasHeads && gasHeads.join('|').startsWith('#|Connection|Last bill|Units|Rate|') && gasHeads.includes('12 months') && gasHeads.includes('Next due') && !gasHeads.includes('Net metering'), `a table per type, its column gasHeads once at the top (gas: units and rate, no net metering; got ${gasHeads})`);
  const totalRow = gasGroup.querySelector('tbody tr.util-total');
  check(totalRow && totalRow === gasGroup.querySelector('tbody tr') && /Gas/.test(totalRow.textContent) && totalRow.children.length === gasHeads.length, 'its first row: the type\'s totals, in the same columns');
  const conns = [...gasGroup.querySelectorAll('tr.util-conn')];
  check(conns.length === 2 && conns.map((r) => r.children[0].textContent).join() === '1,2' && /Rs 4,500/.test(gasGroup.textContent) && /Paid/.test(gasGroup.textContent) && gasGroup.querySelectorAll('.util-spark').length === 2 && !/connections?/.test(gasGroup.textContent), 'then numbered rows, a connection each (no "2 connections" line): last bill (Paid), its year, a 12-month trend');
  check(/Home/.test(conns[0].textContent) && /\d{1,2} \w{3}/.test(conns[0].lastElementChild.textContent), 'with its next due date in the last column');
  // the property and year pickers sit on the tabs row, beside "Filter this page", which filters the connections
  const tRow = main().querySelector('.tabs-row');
  check(tRow.querySelector('[data-util-year]') && tRow.querySelector('[data-input="page-filter"]'), 'the year (and property) pickers are on the same line as Filter this page');
  const uf = tRow.querySelector('[data-input="page-filter"]');
  uf.value = 'gasco';
  uf.dispatchEvent(new win.Event('input', { bubbles: true }));
  const ufShown = () => [...main().querySelectorAll('tr.util-conn')].filter((r) => !r.hidden).map((r) => r.querySelector('.util-name button').textContent);
  check(ufShown().join() === 'Home', `Filter this page: matches a connection's provider (got ${ufShown()})`);
  uf.value = '12-345';
  uf.dispatchEvent(new win.Event('input', { bubbles: true }));
  check(ufShown().join() === 'Home', 'and its account number');
  uf.value = 'nothing like it';
  uf.dispatchEvent(new win.Event('input', { bubbles: true }));
  check(main().querySelector('.util-group[data-type="Gas"]').style.display === 'none', 'a type with nothing matching is hidden');
  uf.value = '';
  uf.dispatchEvent(new win.Event('input', { bubbles: true }));
  check(/<polyline points="[\d, ]+"/.test(win.eval('sparkline')([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])) && /–/.test(win.eval('sparkline')(Array(12).fill(0))), 'the trend line: drawn from the 12 months, a dash when there\'s nothing');
  check(main().querySelectorAll('.um-row').length === 12 && /against/.test(main().textContent), 'and month by month, this year against last');
  // filters: a property; all time
  const fsel = main().querySelector('[data-util-prop]');
  fsel.value = house.id;
  fsel.dispatchEvent(new win.Event('change', { bubbles: true }));
  check([...main().querySelectorAll('.util-conn .util-name')].map((x) => x.textContent).join('|').includes('Home') && !main().textContent.includes('Shop'), 'the property filter shows only its connections');
  main().querySelector('[data-util-tab="Gas"]').click();
  check(main().querySelector('[data-util-prop]').value === house.id && main().querySelectorAll('.utility-card').length === 1, 'and stays on a type\'s tab');
  main().querySelector('[data-util-tab="overview"]').click();
  const ysel = main().querySelector('[data-util-year]');
  ysel.value = 'all';
  ysel.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(/All time/.test(main().querySelector('.util-stats').textContent) && !main().querySelector('.util-stats .pill') && /since/.test(main().querySelector('.util-stats').textContent), 'All time: totals since the first bill, with nothing to compare');
  PA.device.set('utilProp', '');
  PA.device.set('utilYear', y);
  PA.render();

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
  check(pt.due.slice(0, 7) === ymNext && pt.period === mon(ymNow) && PA.fullTitle(pt) === `Mobile (${mon(ymNow)})`, 'due the month after: the task is the connection\'s name and the month the bill is for ("Mobile (this month)", due next month)');
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
  PA.device.set('utilTab', 'Electricity');
  win.eval('setView')('utilities');
  const elCard = [...doc.querySelectorAll('#main .utility-card')].find((x) => x.textContent.includes('Home power'));
  check(/Last bill[^R]*Rs 9,305/.test(elCard.textContent), 'the card\'s last bill is the effective bill too');
  win.eval('openAssetForm')('utility', { id: el.id });
  const sheet = doc.querySelector('#modal form');
  const heads = [...sheet.querySelectorAll('.sheet-side .ledger th')].map((x) => x.textContent).join(',');
  check(sheet.classList.contains('sheet') && sheet.querySelector('details.sheet-details:not([open])') && heads === 'Month,Units,Bill,Net metering,Rate,Effective bill,Effective rate,Paid on', `a connection opens as a sheet, its bills a table like the sheet you kept (got ${heads})`);
  win.eval('closeAssetForm')(true);
  // --- Add a bill: not paid yet; it stays open; its figures as you type; a file that can't be kept is said ---
  win.eval('openAssetForm')('bill', { utility: el.id });
  const nb = doc.querySelector('#modal form');
  check(nb.elements.date.value === '', 'Add a bill: Paid on starts empty');
  nb.elements.amount.value = '20,000';
  nb.elements.units.value = '400';
  nb.elements.credit.value = '5,000';
  nb.elements.credit.dispatchEvent(new win.Event('input', { bubbles: true }));
  check(/Rate Rs 50/.test(nb.querySelector('.bill-figures').textContent) && /Effective bill Rs 15,000/.test(nb.querySelector('.bill-figures').textContent) && /Effective rate Rs 38/.test(nb.querySelector('.bill-figures').textContent), 'its rate, effective bill and effective rate show as you type');
  PA.AT.status = 'reconnect';
  const pf = nb.querySelector('[data-pending-files]');
  Object.defineProperty(pf, 'files', { value: [new win.File(['x'], 'b.jpg', { type: 'image/jpeg' })], configurable: true });
  submitForm(win, 'asset-bill', { month: ymPrev, amount: '20,000', units: '400', credit: '5,000' });
  await tick(30);
  PA.AT.status = 'ok';
  const unpaid = PA.DB.bills.find((b) => b.utility === el.id && b.month === ymPrev);
  check(unpaid && unpaid.date === '' && doc.querySelector('#modal form')?.dataset.form === 'asset-bill' && win.eval('state').assetForm.id === unpaid.id, 'saved with Paid on empty: not paid yet, and the pop-up stays open on it');
  check(/couldn't be kept: reconnect the attachments folder/.test(doc.querySelector('#toasts').textContent), 'a file that couldn\'t be kept is said (the folder needs reconnecting)');
  win.eval('closeAssetForm')(true);
  win.eval('openAssetForm')('utility', { id: el.id });
  check(/Unpaid/.test(doc.querySelector('#modal .sheet-side').textContent), 'the bills table says Unpaid');
  win.eval('closeAssetForm')(true);
  check(U.status(el).state === 'unpaid', 'and the Overview counts it as unpaid');

  // --- Paste an electricity sheet ---
  win.eval('openAssetForm')('utility', { id: el.id });
  doc.querySelector('#modal .sheet-top [data-form-type="bill-paste"]').click();
  const sheetText = [
    'Month\tUnits\tBill\tNet Meter Benefit\tRate\tEffective Bill\tEffective Rate',
    'Jul-25\t500\tRs30,000\t\tRs60\tRs30,000\tRs60',
    'Aug-25\t400\tRs24,000\tRs10,000\tRs60\tRs14,000\tRs35',
    'Sept-25\t300\tRs18,000\t\tRs60\tRs18,000\tRs60',
    'oops',
  ].join('\n');
  const pta = doc.querySelector('#modal textarea[name="sheet"]');
  pta.value = sheetText;
  pta.dispatchEvent(new win.Event('input', { bubbles: true }));
  const ppv = doc.querySelector('#modal .bill-paste-preview').textContent;
  check(/3 months, Jul 2025 to Sept? 2025; 1,200 units; bills Rs 72,000, credit Rs 10,000, effective Rs 62,000/.test(ppv) && /1 line not understood/.test(ppv), `the preview says what it found (got: ${ppv})`);
  submitForm(win, 'asset-bill-paste', {});
  const pasted = PA.DB.bills.filter((b) => b.utility === el.id && b.month.startsWith('2025'));
  const aug = pasted.find((b) => b.month === '2025-08');
  check(pasted.length === 3 && aug.units === 400 && aug.amount === 24000 && aug.credit === 10000 && U.figures(aug).eff === 14000 && Math.round(U.figures(aug).effRate) === 35, 'each month becomes a bill with its units, bill and credit; the rest is worked out');
  check(doc.querySelector('#modal form')?.dataset.form === 'asset-utility', 'and it goes back to the connection');
  doc.querySelector('#modal .sheet-top [data-form-type="bill-paste"]').click();
  doc.querySelector('#modal textarea[name="sheet"]').value = sheetText;
  submitForm(win, 'asset-bill-paste', {});
  check(PA.DB.bills.filter((b) => b.utility === el.id && b.month.startsWith('2025')).length === 3, 'pasting again replaces those months: nothing doubled');
  win.eval('closeAssetForm')(true);

  // --- The bill itself: a file on the bill ---
  win.eval('openAssetForm')('bill', { id: eb.id });
  const bin = doc.querySelector('#modal input[data-input="bill-files"]');
  Object.defineProperty(bin, 'files', { value: [new win.File(['x'], 'IMG_1.jpg', { type: 'image/jpeg' })], configurable: true });
  bin.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick(40);
  const bd = U.billFiles(eb)[0];
  check(bd && bd.bill === eb.id && /^Me\/Utilities\/Electricity\/Home power \w+ \d{4}\.jpg$/.test(bd.attachments[0].file) && doc.querySelector('#modal').textContent.includes(bd.attachments[0].name), 'Add file on a bill: kept in Vault › Utilities › Electricity, named "<name> Mmm yyyy", listed on it');
  win.eval('closeAssetForm')(true);
  check(U.billFiles(bill).some((d) => d.attachments[0].file === t.attachments[0].file), 'the file on the task a bill was ticked from counts as that bill\'s');
  win.eval('openAssetForm')('utility', { id: el.id });
  const foot = [...doc.querySelectorAll('#modal .sheet-side .ledger tfoot td')].map((x) => x.textContent);
  check(foot[0] === 'Total' && foot.length === 8, `the bills table has a totals row: units, bill, credit, rate, effective bill, effective rate (got ${foot.join('|')})`);
  check(/Net metering saved this year\s*Rs [\d,]+/.test(doc.querySelector('#modal .sheet-top').textContent), 'the sheet says what net metering saved this year');
  win.eval('closeAssetForm')(true);
  win.eval('openAssetForm')('bill', { utility: ph.id });
  check(!doc.querySelector('#modal form').elements.units && doc.querySelector('#modal [data-pending-files]'), 'a phone bill has no units; a new bill can pick its file as it\'s saved');
  win.eval('closeAssetForm')(true);

  // --- Fuel: the pump bills monthly; split by car ---
  const civic = Assets.add({ kind: 'vehicle', name: 'Civic' });
  const city = Assets.add({ kind: 'vehicle', name: 'City' });
  win.eval('changed')('assets');
  const sold = Assets.add({ kind: 'vehicle', name: 'Old sold car' });
  sold.closed = PA.toISO(new Date(Date.now() - 30 * 864e5));
  win.eval('changed')('assets');
  win.eval('openAssetForm')('utility', { kind: 'Fuel' });
  const fform = doc.querySelector('#modal form');
  check(!fform.elements[`u-car-${sold.id}`], 'a sold car isn\'t offered for fuel');
  check(fform.elements[`u-car-${civic.id}`] && fform.elements[`u-car-${city.id}`], 'a fuel connection asks which cars it fuels');
  fform.elements[`u-car-${civic.id}`].checked = true;
  fform.elements[`u-car-${city.id}`].checked = true;
  submitForm(win, 'asset-utility', { name: 'The pump', provider: 'Pump' });
  const pump = PA.DB.utilities.find((x) => x.name === 'The pump');
  check(pump.cars.length === 2 && U.icon('Fuel') === 'gas-station', 'saved with its cars');
  const fill = (month, date, a, b) => {
    win.eval('openAssetForm')('bill', { utility: pump.id });
    const f2 = doc.querySelector('#modal form');
    check(f2.elements.units && /Litres/.test(f2.textContent) && f2.elements[`split-${civic.id}-litres`], '');
    submitForm(win, 'asset-bill', { month, date, amount: '', units: '', [`split-${civic.id}-amount`]: a[0], [`split-${civic.id}-litres`]: a[1], [`split-${civic.id}-km`]: a[2], [`split-${city.id}-amount`]: b[0], [`split-${city.id}-litres`]: b[1], [`split-${city.id}-km`]: b[2] });
  };
  fill(`${y}-01`, `${y}-02-05`, ['30000', '100', '10000'], ['15000', '50', '']);
  fill(`${y}-02`, `${y}-03-05`, ['36000', '120', '11200'], ['', '', '']);
  const fb = PA.DB.bills.filter((b) => b.utility === pump.id);
  check(fb.length === 2 && fb[0].amount === 45000 && fb[0].units === 150 && fb[0].split.length === 2 && fb[1].split.length === 1, 'left empty, the bill and litres are the cars\' added up; a car with nothing that month is left out');
  const ff = U.fuelFigures(civic.id);
  check(ff.year === 66000 && ff.litres === 220 && ff.kmpl === 10 && ff.perKm === 30, 'a car\'s fuel: this year, litres, km a litre (1,200 km on 120 litres) and fuel a km');
  check(win.eval('Upkeep').latestKm(civic) === 11200, 'the readings count as the car\'s readings');
  win.eval('openAssetForm')('asset', { id: civic.id });
  check(/Fuel/.test(doc.querySelector('#modal').textContent) && /Km a litre\s*10/.test(doc.querySelector('#modal').textContent), 'the car\'s sheet shows its fuel');
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
  const adds = [...ro.doc.querySelectorAll('#main .page-actions > button:not(.act-toggle)')];
  check(adds.length && adds.every((b) => b.closest('.edit-only')), 'read-only: adding is edit-only (the ⋮ menu stays)');
  ro.close();
  done();
})();
