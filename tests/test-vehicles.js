// The Vehicles page: a picker and tabs (Overview, Log, Plan, Tasks, Store, Details); a car from Assets opens here; the
// store keeps supplies until they're used on a car (into its log at their share of the cost); an entry can move to
// another car or the store; a "car" that was a place for supplies moves its log to the store. Lists group and sort
// (remembered per list), with each group's total.
const { loadApp, check, done, submitForm, answer, tick } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const U = win.eval('Upkeep');
  const A = win.eval('Assets');
  const changed = win.eval('changed');
  const main = () => doc.querySelector('#main').textContent;
  const modal = () => doc.querySelector('#modal form');
  const ago = (d) => PA.toISO(new Date(Date.now() - d * 864e5));
  const today = PA.toISO(new Date());

  const corolla = A.add({ kind: 'vehicle', name: 'Corolla', currency: 'PKR', amount: 1, date: ago(400), acquired: ago(400) });
  corolla.car = { boughtKm: 10000 };
  corolla.plan = [{ id: 'oil', item: 'Engine oil', km: 5000, months: 6, since: ago(400), sinceKm: 10000 }];
  const city = A.add({ kind: 'vehicle', name: 'City', currency: 'PKR', amount: 1, date: ago(100), acquired: ago(100) });
  const shed = A.add({ kind: 'vehicle', name: 'In store', currency: 'PKR', amount: 1, date: ago(100) });
  U.add({ asset: corolla.id, date: ago(300), type: 'service', item: 'Engine oil', cost: 9000, km: 14000, vendor: 'Garage One' });
  U.add({ asset: corolla.id, date: ago(20), type: 'repair', item: 'AC fan', cost: 20000, km: 18000, vendor: 'Garage Two' });
  U.add({ asset: city.id, date: ago(10), type: 'added', item: 'Mats', cost: 3000 });
  U.add({ asset: shed.id, date: ago(30), type: 'added', item: 'Wiper blades', cost: 1200 });
  changed('assets', 'upkeep');
  win.eval('upkeepTasks')();

  // --- The page ---
  doc.querySelector('[data-view="assets"]').click();
  doc.querySelector('[data-asset-tab="vehicle"]').click();
  check(PA.state.view === 'vehicles' && doc.querySelectorAll('#main .vehicle-card').length === 3, 'the Vehicles page has a card per car');
  check(/1 job overdue/.test(main()) && /Upkeep by year/.test(main()), 'a card says what\'s overdue; upkeep by year below');
  check(!doc.querySelector('.nav-btn[data-view="vehicles"]') && !doc.querySelector('#more-sheet [data-view="vehicles"]') && doc.querySelector('.nav-btn.active').dataset.view === 'assets', 'it\'s a page under Assets: not in the sidebar or More, and Assets stays lit');
  check(doc.querySelector('#main .page-head .sub-back[data-view="assets"]'), '‹ Assets at the top goes back');
  doc.querySelector('[data-vehicle-tab="log"]').click();
  check(doc.querySelectorAll('#main li.item').length === 4, 'the Log has every car\'s entries');
  const pick = doc.querySelector('[data-vehicle-pick]');
  pick.value = corolla.id;
  pick.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(doc.querySelectorAll('#main li.item').length === 2 && doc.querySelector('[data-vehicle-tab="details"]'), 'picking one car shows only its log, and a Details tab');
  doc.querySelector('[data-vehicle-tab="plan"]').click();
  check(doc.querySelector('#main .pill.zk-over') && /Engine oil/.test(main()), 'the Plan shows each job, red when it\'s late');
  doc.querySelector('[data-vehicle-tab="tasks"]').click();
  check(doc.querySelectorAll('#main [data-action="toggle-task"]').length === 1, 'the Tasks tab has its open upkeep tasks');
  // From Assets
  doc.querySelector('[data-view="assets"]').click();
  doc.querySelector('[data-asset-tab="vehicle"]').click();
  check(PA.state.view === 'vehicles', 'the Vehicles tab in Assets opens the Vehicles page');
  win.eval('filesGo')('assets', city.id);
  check(PA.state.view === 'vehicles' && doc.querySelector('[data-vehicle-pick]').value === city.id, 'a car opened from elsewhere opens on the Vehicles page');

  // --- Grouping and sorting ---
  pick.value = 'all';
  doc.querySelector('[data-vehicle-pick]').value = 'all';
  doc.querySelector('[data-vehicle-pick]').dispatchEvent(new win.Event('change', { bubbles: true }));
  doc.querySelector('[data-vehicle-tab="log"]').click();
  const g = doc.querySelector('[data-list-tool="vehicleLog"][data-kind="group"]');
  g.value = 'car';
  g.dispatchEvent(new win.Event('change', { bubbles: true }));
  const heads = [...doc.querySelectorAll('#main .list-group')].map((h) => h.textContent.replace(/\s+/g, ' ').trim());
  check(heads.length === 3 && heads.some((h) => /Corolla ?2, Rs 29,000/.test(h)), 'grouped by vehicle, each group with its count and total');
  const so = doc.querySelector('[data-list-tool="vehicleLog"][data-kind="sort"]');
  so.value = 'cost';
  so.dispatchEvent(new win.Event('change', { bubbles: true }));
  const pref = win.eval('device').get('list-vehicleLog', {});
  check(pref.groups.join() === 'car' && pref.sort === 'cost', 'the choice is remembered for that list on this device');
  check(doc.querySelector('#main li.item .title').textContent.startsWith('AC fan'), 'and sorted by cost');
  // A second level, folding
  const g2 = doc.querySelector('[data-list-tool="vehicleLog"][data-kind="group"][data-level="1"]');
  check(g2 && ![...g2.options].some((x) => x.value === 'car'), 'a "then by" appears, without the level above');
  g2.value = 'type';
  g2.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(doc.querySelectorAll('#main .list-group.lv1').length >= 3 && doc.querySelector('[data-list-tool="vehicleLog"][data-level="2"]'), 'subgroups under each group, and a third level to choose');
  const corollaHead = [...doc.querySelectorAll('#main .list-group.lv0')].find((h) => /Corolla/.test(h.textContent));
  corollaHead.click();
  check(!doc.querySelector('#main .list-group.lv1[data-path^="Corolla"]') && win.eval('device').get('list-vehicleLog').folded.includes('Corolla'), 'clicking a group folds it (remembered)');
  doc.querySelector('[data-list-fold="vehicleLog"][data-fold-all="0"]').click();
  check(doc.querySelector('#main .list-group.lv1[data-path^="Corolla"]'), 'Unfold all opens it again');
  doc.querySelector('[data-list-fold="vehicleLog"][data-fold-all="1"]').click();
  check(!doc.querySelector('#main li.item') && doc.querySelectorAll('#main .list-group.lv0').length === 3, 'Fold all shows the groups only');
  doc.querySelector('[data-list-fold="vehicleLog"][data-fold-all="0"]').click();

  // --- The store ---
  doc.querySelector('#main [data-action="upkeep-entry"][data-asset="store"]').click();
  check(modal() && /Add to store/.test(modal().querySelector('h3').textContent) && modal().elements.qty, 'Add to store asks how many');
  submitForm(win, 'asset-upkeep', { what: 'Oil filter', qty: '4', cost: '4,000', vendor: 'Parts shop' });
  const filt = PA.DB.upkeep.find((e) => e.item === 'Oil filter');
  check(filt && filt.asset === 'store' && filt.qty === 4 && filt.cost === 4000, 'it\'s in the store with how many and what they cost');
  check(!doc.querySelector('#modal form'), 'Save from the page closes it (back to the page)');
  doc.querySelector('[data-vehicle-tab="store"]').click();
  check(/1 item in store, worth Rs 4,000/.test(main()), 'the Store tab lists it and what it\'s worth');
  doc.querySelector('#main [data-form-type="store-use"]').click();
  submitForm(win, 'asset-store-use', { car: corolla.id, qty: '1', km: '19,000' });
  const used = U.log(corolla.id).find((e) => e.item === 'Oil filter');
  check(used && used.cost === 1000 && used.km === 19000 && /From the store/.test(used.notes) && filt.qty === 3 && filt.cost === 3000, 'Use on a car: one goes into its log at a quarter of the cost; three are left');
  // Moving an entry
  const mats = PA.DB.upkeep.find((e) => e.item === 'Mats');
  win.eval('openAssetForm')('upkeep', { id: mats.id });
  submitForm(win, 'asset-upkeep', { asset: corolla.id });
  check(mats.asset === corolla.id, 'an entry can move to another car');
  // A "car" that was a place for supplies
  doc.querySelector('#modal [data-action="asset-cancel"]')?.click();
  win.eval('device').set('vehicleCar', shed.id);
  win.eval('device').set('vehicleTab', 'details');
  win.eval('render')();
  doc.querySelector('#main [data-action="not-a-car"]').click();
  await answer(win, true);
  await tick(0);
  check(!PA.DB.assets.includes(shed) && PA.DB.upkeep.some((e) => e.item === 'Wiper blades' && e.asset === 'store' && e.qty === 1), '"This isn\'t a car" moves its log to the store and deletes it (to the Trash)');
  check(win.eval('device').get('vehicleTab') === 'store', 'and shows the store');

  // --- Open, bars, and the page layout ---
  win.eval('device').set('vehicleCar', 'all');
  win.eval('device').set('vehicleTab', 'overview');
  win.eval('render')();
  const opens = doc.querySelectorAll('#main .vehicle-card [data-vehicle-open]');
  check(opens.length === 2, 'with all cars showing, each card has Open');
  opens[1].click();
  check(win.eval('device').get('vehicleTab') === 'details' && !doc.querySelector('#main .vehicle-card [data-vehicle-open]'), 'Open goes to that car\'s Details; with one car picked there\'s no Open');
  check(win.eval('barPct')(0, 1000) === '0.0' && win.eval('barPct')(5, 1000) === '2.0', 'nothing has no bar; a little has at least a sliver');
  const head = doc.querySelector('#main .page-head');
  const row = head.nextElementSibling;
  check(row.classList.contains('tabs-row') && row.querySelector('.tabs') && row.querySelector('[data-input="page-filter"]'), 'under the title: the tabs, with the filter on the same row');
  check(head.querySelector('.act-toggle') && head.querySelectorAll('.page-actions > .wide-only').length >= 2, 'on a phone the other buttons are in the ⋮ menu beside the title');
  doc.querySelector('[data-vehicle-tab="log"]').click();
  check(/\d+ entries?, Rs/.test(doc.querySelector('#main .list-count')?.textContent || ''), 'the toolbar says how many and their total');
  doc.querySelector('[data-view="tasks"]').click();
  const th = doc.querySelector('#main .page-head');
  check(th.querySelector('[data-action="new-task"]') && th.nextElementSibling.classList.contains('tabs-row') && th.nextElementSibling.querySelector('[data-input="page-filter"]'), 'Tasks follows the same layout');

  // --- Zakat and the Vault have the tools too ---
  doc.querySelector('[data-view="zakat"]').click();
  doc.querySelector('[data-zakat-tab="payments"]').click();
  check(!doc.querySelector('[data-list-tool]') || doc.querySelector('[data-list-tool="zakatPayments"]'), 'Zakat payments can be grouped and sorted (once there are two)');

  check(!app.errors.length, 'no script errors');
  done();
})();
