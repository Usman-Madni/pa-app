// Assets: what people own or owe, valued by date. Gold and silver by weight (1 tola = 11.7 g) at that day's rate per
// tola (gold by karat); everything else by its latest amount on or before the day, times that day's exchange rate;
// debts count as minus. Owners go by date, so a transfer keeps who had it before. The page: tabs (Overview, one per
// kind in use, Rates), cards, a net-worth line and bars by kind, and pop-ups to add, change, transfer, update balances
// and add rates. The person picker decides whose assets and shares show. Older files load; read-only only looks.
const { loadApp, tick, check, done, answer, submitForm } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const A = win.eval('Assets');
  const People = win.eval('People');
  const changed = win.eval('changed');
  const main = () => doc.querySelector('#main').textContent;
  const near = (a, b) => Math.abs(a - b) < 0.5;

  // --- The rules, on their own ---
  const kim = People.add('Kim Lee');
  A.setRates({ date: '2026-01-01', gold: { 22: 400000 }, silver: 10000, fx: { USD: 270 } });
  A.setRates({ date: '2026-06-01', gold: { 22: 480000, 24: 520000 }, silver: 13000, fx: { USD: 280 } });
  check(A.ratesOn('2026-03-01').gold['22'] === 400000 && A.ratesOn('2026-06-01').silver === 13000 && A.ratesOn('2025-12-31') === null, 'the rates used are the latest on or before the day');
  A.setRates({ date: '2026-06-01', gold: { 22: 490000 }, silver: 13000, fx: { USD: 280 } });
  check(PA.DB.rates.length === 2 && A.ratesOn('2026-06-02').gold['22'] === 490000, 'rates entered again for a day replace that day\'s');

  const gold = A.add({ kind: 'gold', name: 'Gold set', karat: '22', grams: 23.4, owners: [{ id: 'me', share: 50 }, { id: kim.id, share: 50 }] });
  check(near(A.tola(gold), 2), '23.4 g is 2 tola (11.7 g each)');
  check(near(A.valueOn(gold, '2026-03-01'), 800000) && near(A.valueOn(gold, '2026-07-01'), 980000), 'gold is worth its tola times that day\'s rate for its karat');
  check(near(A.partOn(gold, 'me', '2026-07-01'), 490000) && near(A.partOn(gold, 'all', '2026-07-01'), 980000), 'a person counts their share; everyone the whole');
  const g24 = A.add({ kind: 'gold', name: 'Coin', karat: '18', grams: 11.7 });
  check(A.valueOn(g24, '2026-07-01') === null, 'no rate for its karat: it can\'t be valued (null, not 0)');
  const silver = A.add({ kind: 'silver', name: 'Ring', grams: 5.85 });
  check(near(A.valueOn(silver, '2026-07-01'), 6500), 'silver by weight at the silver rate');

  const bank = A.add({ kind: 'cash', name: 'Savings', currency: 'PKR', amount: 100000, date: '2026-02-01' });
  A.setValue(bank, '2026-05-01', 150000);
  check(A.valueOn(bank, '2026-01-15') === 0 && A.valueOn(bank, '2026-03-01') === 100000 && A.valueOn(bank, '2026-07-01') === 150000, 'a balance is the latest amount on or before the day (none before the first)');
  A.setValue(bank, '2026-05-01', 160000);
  check(bank.values.length === 2 && A.amountOn(bank, '2026-05-01') === 160000, 'a second amount on the same day replaces the first');
  const usd = A.add({ kind: 'cash', name: 'Dollar account', currency: 'USD', amount: 500, date: '2026-02-01' });
  check(A.valueOn(usd, '2026-07-01') === 140000 && A.valueOn(usd, '2026-03-01') === 135000, 'another currency at that day\'s exchange rate');
  const eur = A.add({ kind: 'cash', name: 'Euro account', currency: 'EUR', amount: 100, date: '2026-02-01' });
  check(A.valueOn(eur, '2026-07-01') === null && A.foreign().join() === 'EUR,USD', 'a currency with no exchange rate can\'t be valued; the currencies needing one are known');
  const loan = A.add({ kind: 'debt', name: 'Car loan', currency: 'PKR', amount: 300000, date: '2026-01-01' });
  check(A.valueOn(loan, '2026-07-01') === -300000, 'a debt counts as minus');
  loan.closed = '2026-06-15';
  check(A.valueOn(loan, '2026-07-01') === 0 && A.valueOn(loan, '2026-06-14') === -300000, 'after it\'s closed it counts for nothing (before, it still does)');
  const t = A.totals('all', '2026-07-01');
  check(t.missing.length === 2 && t.missing.includes(g24) && t.missing.includes(eur), 'totals list what has no price');
  check(near(t.net, 980000 + 6500 + 160000 + 140000) && near(t.tola.gold, 3) && near(t.byKind.cash, 300000), 'totals: net worth, gold in tola, by kind');
  check(near(A.totals('me', '2026-07-01').byKind.gold, 490000) && near(A.totals(kim.id, '2026-07-01').net, 490000), 'per person: their share of each');

  // --- Owners by date ---
  A.transfer(bank, '2026-06-01', [{ id: kim.id, share: 100 }]);
  check(A.shareOf(bank, 'me', '2026-05-31') === 1 && A.shareOf(bank, kim.id, '2026-06-01') === 1 && A.shareOf(bank, 'me', '2026-06-01') === 0, 'a transfer counts from its date; before it, the old owner');
  check(near(A.totals(kim.id, '2026-07-01').byKind.cash, 160000) && A.totals('me', '2026-07-01').byKind.cash === 140000, 'so totals follow it');
  A.setOwnersNow(bank, [{ id: kim.id, share: 60 }, { id: 'me', share: 40 }]);
  check(bank.owners.length === 2 && A.shareOf(bank, 'me', '2026-05-31') === 1 && near(A.shareOf(bank, 'me', '2026-07-01'), 0.4), 'correcting the owners now keeps the history before');
  check(A.sharesOk([{ id: 'me', share: 60 }, { id: kim.id, share: 40 }]) && !A.sharesOk([{ id: 'me', share: 60 }]), 'shares must add up to 100');
  changed('assets', 'rates');
  check(JSON.parse(win.localStorage.getItem('pa_assets')).length === PA.DB.assets.length && JSON.parse(win.localStorage.getItem('pa_rates')).length === 2, 'assets and rates are saved (through changed)');

  // --- Removing a person: their shares become yours ---
  const sam = People.add('Sam Rivers');
  const car = A.add({ kind: 'vehicle', name: 'Car', amount: 2000000, date: '2026-01-01', owners: [{ id: sam.id, share: 100 }] });
  check(People.onlyTheirs(sam.id) === 1, 'an asset they own outright counts as only theirs');
  People.remove(sam.id);
  check(A.shareOf(car, 'me') === 1 && car.owners[0].people.every((p) => p.id === 'me'), 'removing them makes it yours');

  // --- The page ---
  doc.querySelector('[data-view="assets"]').click();
  check(doc.querySelector('.nav-btn.active').dataset.view === 'assets', 'Assets is in the sidebar');
  const tabs = [...doc.querySelectorAll('#main [data-asset-tab]')].map((b) => b.dataset.assetTab);
  check(tabs.join() === 'overview,gold,silver,cash,property,vehicle,debt,rates', 'tabs: Overview, a tab for each kind in use (in a fixed order; Property and Vehicles always, as they open pages of their own), Rates');
  check(/Net worth Rs/.test(main()) && doc.querySelectorAll('#main .stat-card').length >= 4, 'the Overview has number cards');
  check(/can't be valued yet/.test(main()), 'it says what can\'t be valued yet');
  const pts = JSON.parse(doc.querySelector('#main .worth-chart').dataset.worth);
  check(pts.length === 12 && pts[11].d === PA.toISO(new Date()) && doc.querySelectorAll('#main .chart-table tr').length === 12, 'net worth over the last year: 12 points ending today, also as a table');
  check(doc.querySelectorAll('#main .chart-pt title').length === 12, 'each point says its value on hover');
  check(doc.querySelectorAll('#main .kind-bar').length >= 3 && /taken off/.test(doc.querySelector('#main .kind-bars').textContent) === false, 'bars by kind (a closed debt adds nothing)');
  check(!/[—·]/.test(main()), 'no em dashes or middle dots');

  // Add an asset through the pop-up
  doc.querySelector('[data-asset-tab="cash"]').click();
  doc.querySelector('#main [data-action="asset-form"][data-form-type="asset"]').click();
  check(doc.querySelector('#modal [data-form="asset-asset"] [name="kind"]').value === 'cash', 'Add asset on a kind\'s tab starts with that kind');
  submitForm(win, 'asset-asset', { name: 'Cash at home', amount: '25000', date: '2026-07-01', [`share-me`]: '60', [`share-${kim.id}`]: '30' });
  check(/add up to 100/.test(doc.querySelector('#modal .form-error').textContent) && !PA.DB.assets.some((a) => a.name === 'Cash at home'), 'shares not adding up to 100: it says so and saves nothing');
  submitForm(win, 'asset-asset', { name: 'Cash at home', amount: '25000', date: '2026-07-01', [`share-me`]: '100', [`share-${kim.id}`]: '' });
  const home = PA.DB.assets.find((a) => a.name === 'Cash at home');
  check(home && home.kind === 'cash' && A.amountOn(home, '2026-07-01') === 25000 && !doc.querySelector('#modal form'), 'then it\'s added with its amount and the pop-up closes');
  check(main().includes('Cash at home'), 'and it shows on its tab');

  // Change it: a new amount, closing
  doc.querySelector(`#main [data-action="open-asset"][data-id="${home.id}"]`).click();
  submitForm(win, 'asset-asset', { amount: '30000', date: '2026-08-01' });
  check(A.amountOn(home, '2026-08-01') === 30000 && A.amountOn(home, '2026-07-01') === 25000, 'a new amount is kept beside the old one');
  doc.querySelector(`#main [data-action="open-asset"][data-id="${home.id}"]`).click();
  doc.querySelector('#modal [data-action="asset-value-off"][data-date="2026-08-01"]').click();
  check(home.values.length === 1, 'an amount can be taken off');
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }));
  check(!doc.querySelector('#modal form'), 'Esc closes the pop-up');

  // Kind chosen while adding redraws the form (weight for gold)
  doc.querySelector('#main [data-action="asset-form"][data-form-type="asset"]').click();
  const kindSel = doc.querySelector('#modal [name="kind"]');
  doc.querySelector('#modal [name="name"]').value = 'Bangles';
  kindSel.value = 'gold';
  kindSel.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(doc.querySelector('#modal [name="karat"]') && doc.querySelector('#modal [name="weight"]') && doc.querySelector('#modal [name="name"]').value === 'Bangles', 'picking Gold asks karat and weight, keeping the name typed');
  submitForm(win, 'asset-asset', { karat: '22', weight: '1.5', unit: 'tola', [`share-me`]: '100' });
  const bangles = PA.DB.assets.find((a) => a.name === 'Bangles');
  check(bangles && near(bangles.grams, 17.55) && bangles.karat === '22', 'a weight in tola is kept in grams');

  // Transfer, balances, rates
  doc.querySelector('#main [data-action="asset-form"][data-form-type="transfer"]').click();
  const sel = doc.querySelector('#modal [name="asset"]');
  sel.value = bangles.id;
  sel.dispatchEvent(new win.Event('change', { bubbles: true }));
  submitForm(win, 'asset-transfer', { from: '2026-09-01', [`share-me`]: '', [`share-${kim.id}`]: '100' });
  check(A.shareOf(bangles, kim.id, '2026-09-01') === 1 && A.shareOf(bangles, 'me', '2026-08-31') === 1, 'Transfer moves it from the date picked');
  doc.querySelector('#main [data-action="asset-form"][data-form-type="balances"]').click();
  check(doc.querySelectorAll('#modal .bal-row').length >= 3 && !doc.querySelector(`#modal [name="bal-${bangles.id}"]`), 'Update balances lists the accounts (not gold)');
  submitForm(win, 'asset-balances', { date: '2026-10-01', [`bal-${home.id}`]: '40000' });
  check(A.amountOn(home, '2026-10-01') === 40000 && !(usd.values || []).some((v) => v.date === '2026-10-01'), 'only changed balances are saved');
  doc.querySelector('[data-asset-tab="rates"]').click();
  check(doc.querySelectorAll('#main .list .item').length === 2, 'the Rates tab lists each day\'s rates');
  doc.querySelector('#main [data-action="asset-form"][data-form-type="rates"]').click();
  check(doc.querySelector('#modal [name="fx-EUR"]') && doc.querySelector('#modal [name="gold-22"]').value === '4,90,000', 'Add rates asks for each currency in use, filled in from the last rates');
  submitForm(win, 'asset-rates', { date: '2026-10-01', 'gold-18': '380000', 'fx-EUR': '300' });
  check(A.ratesOn('2026-10-01').gold['18'] === 380000 && A.valueOn(eur, '2026-10-01') === 30000, 'new rates value what couldn\'t be valued before');
  doc.querySelector('#main [data-action="delete-rates"]').click();
  check(PA.DB.rates.length === 2 && PA.DB.trash.some((e) => e.kind === 'rates') && !doc.querySelector('#modal form'), 'rates are deleted at once, into the Trash (no question)');
  doc.querySelector('#toasts [data-action="trash-undo"]').click();
  check(PA.DB.rates.length === 3 && !PA.DB.trash.some((e) => e.kind === 'rates'), 'Undo puts them back');
  doc.querySelector('#main [data-action="delete-rates"]').click();

  // Delete an asset
  doc.querySelector('[data-asset-tab="cash"]').click();
  doc.querySelector(`#main [data-action="open-asset"][data-id="${home.id}"]`).click();
  doc.querySelector('#modal [data-action="delete-asset"]').click();
  check(!PA.DB.assets.some((x) => x.id === home.id) && PA.DB.trash.some((e) => e.kind === 'assets' && e.item.id === home.id) && /Sold or closed on/.test(doc.querySelector('#toasts').textContent), 'deleting goes to the Trash at once (and points to closing it instead)');
  doc.defaultView.eval('setView')('trash');
  check(/Asset, deleted/.test(doc.querySelector('#main').textContent), 'the Trash lists it as an asset');
  doc.querySelector('#main [data-action="trash-restore"]').click();
  check(PA.DB.assets.some((x) => x.id === home.id && A.amountOn(x, '2026-10-01') === 40000), 'Restore brings it back with its amounts');
  PA.DB.assets.splice(PA.DB.assets.findIndex((x) => x.id === home.id), 1);
  changed('assets');
  doc.querySelector('[data-view="assets"]').click();

  // --- Whose assets show ---
  const pick = (v) => { const s = doc.querySelector('#person-pick select'); s.value = v; s.dispatchEvent(new win.Event('input', { bubbles: true })); };
  pick(kim.id);
  doc.querySelector('[data-asset-tab="overview"]').click();
  check(/for Kim Lee/.test(main()) && !doc.querySelector('[data-asset-tab="debt"]'), 'showing Kim: only what Kim has a share in');
  pick('all');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));

  // --- Merging two devices' copies ---
  const mergeData = win.eval('mergeData');
  const now = Date.now();
  const m = mergeData({ assets: [{ id: 'a1', name: 'Mine', updated: now }], rates: [], tasks: [], notes: [], events: [] }, { assets: [{ id: 'a2', name: 'Theirs', updated: now }], rates: [{ id: 'r1', date: '2026-01-01', updated: now }], tasks: [], notes: [], events: [] }, now);
  check(m.assets.length === 2 && m.rates.length === 1, 'assets and rates merge like the rest');
  await tick(50);
  app.close();

  // --- An older data file loads; read-only only looks ---
  const ro = loadApp({ fsa: false });
  await ro.PA.RO.open({ name: 'd.json', text: async () => JSON.stringify({ app: 'PA App', version: 2, saveToken: 't', data: { tasks: [], notes: [], events: [] } }) });
  check(Array.isArray(ro.PA.DB.assets) && Array.isArray(ro.PA.DB.rates), 'a file from before Assets loads');
  await ro.PA.RO.open({ name: 'd.json', text: async () => JSON.stringify({ app: 'PA App', version: 2, saveToken: 't2', data: { tasks: [], notes: [], events: [], assets: [{ id: 'x', kind: 'cash', name: 'Savings', currency: 'PKR', values: [{ date: '2026-01-01', amount: 5000 }], owners: [] }], rates: [] } }) });
  ro.doc.querySelector('[data-view="assets"]').click();
  ro.doc.querySelector('[data-asset-tab="cash"]').click();
  ro.doc.querySelector('#main [data-action="open-asset"]').click();
  check(ro.doc.querySelector('#modal fieldset.plain').disabled && !/Save/.test(ro.doc.querySelector('#modal').textContent), 'read-only opens an asset to look at, with no Save');
  check(['asset-form', 'delete-asset', 'asset-value-off', 'delete-rates'].every((a) => ro.win.eval('EDIT_ACTIONS').has(a)), 'changing assets is edit-only');
  await tick(50); // let its start-up finish before closing
  ro.close();
  await tick(0);
  done();
})();
