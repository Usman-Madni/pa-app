// Upkeep on any asset: a car's details and readings; a log of services, repairs, things added and other costs; what
// it's cost (this year, all time, by type, by item, by year, per km, with the price); a plan of repeating jobs (every
// so many km and/or months, whichever first), each with one task for the owners, due by the months or on the day the
// average distance says, moved as readings come in; logging the job (or ticking the task) starts the next round, and
// ticking opens Add entry filled in. Read-only changes nothing.
const { loadApp, check, done, submitForm, confirmDone, tick } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const U = win.eval('Upkeep');
  const A = win.eval('Assets');
  const changed = win.eval('changed');
  const modal = () => doc.querySelector('#modal form');
  const iso = (d) => PA.toISO(d);
  const ago = (days) => iso(new Date(Date.now() - days * 864e5));
  const today = iso(new Date());

  // --- A car from the pop-up: details, the usual plan ---
  doc.querySelector('[data-view="assets"]').click();
  doc.querySelector('#main [data-form-type="asset"]').click();
  modal().elements.kind.value = 'vehicle';
  modal().elements.kind.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(modal().elements['car-make'] && modal().elements['car-plate'] && !modal().elements.name.required, 'a vehicle asks its make, model, years, plate and km when bought (the name can be left)');
  submitForm(win, 'asset-asset', { 'car-make': 'Toyota', 'car-model': 'Corolla', 'car-year': '2018', 'car-plate': 'ABC-123', 'car-boughtKm': '10,000', amount: '30,00,000', date: ago(400), acquired: ago(400) });
  const car = PA.DB.assets.find((a) => a.kind === 'vehicle');
  check(car && car.name === 'Toyota Corolla ABC-123' && car.car.boughtKm === 10000 && car.car.year === '2018', 'named from make, model and plate; details kept');
  check(car.plan.length === 6 && car.plan[0].item === 'Engine oil and oil filter' && car.plan[0].km === 5000 && car.plan[0].months === 6, 'it starts with the usual car plan');

  // --- The log ---
  U.add({ asset: car.id, date: ago(300), type: 'service', item: 'Engine oil and oil filter', cost: 9000, vendor: 'Garage One', km: 14000 });
  U.add({ asset: car.id, date: ago(200), type: 'repair', item: 'AC fan motor', cost: 25000, vendor: 'Garage Two', km: 18000 });
  U.add({ asset: car.id, date: ago(100), type: 'added', item: 'Floor mats', cost: 4000, km: 0 });
  changed('upkeep');
  check(U.latestKm(car) === 18000 && Math.round(U.kmPerDay(car)) === Math.round(8000 / 200), 'readings come from entries (and when bought): latest km, km a day');
  const c = U.costs(car, today);
  check(c.all === 38000 && c.byType.repair === 25000 && c.byType.added === 4000 && c.items[0].item === 'AC fan motor', 'costs by type and by item (most first)');
  check(c.price === 3000000 && c.total === 3038000 && Math.round(c.perKm) === Math.round(38000 / 8000), 'with the price paid, and per km since it was bought');
  check(U.used('vendor')[0] === 'Garage One' || U.used('vendor').includes('Garage Two'), 'vendors typed before are suggested');

  // --- In the pop-up ---
  doc.querySelector('[data-view="assets"]').click();
  doc.querySelector('[data-asset-tab="vehicle"]').click();
  doc.querySelector('#main [data-vehicle-open]').click(); doc.querySelector('[data-vehicle-tab="details"]').click(); doc.querySelector('#main [data-action="open-asset"]').click(); // a car opens on the Vehicles page; its Details open the pop-up
  const box = () => doc.querySelector('#modal .upkeep');
  check(box() && /All time\s*Rs 38,000/.test(box().textContent) && /Latest reading 18,000 km/.test(box().textContent), 'the car shows what it\'s cost and its latest reading');
  check(box().querySelectorAll('.upkeep-log [data-action="upkeep-entry"]').length === 3, 'and its log');
  const filter = box().querySelector('[data-upkeep-filter]');
  filter.value = 'repair';
  filter.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(box().querySelectorAll('.upkeep-log [data-action="upkeep-entry"]').length === 1, 'the log can show one type');
  win.eval('state').upkeepFilter = '';
  // Add an entry from the car: photos picked with it; Save returns to the car, saying so
  box().querySelector('[data-action="upkeep-entry"][data-asset]').click();
  check(/add to upkeep/.test(modal().querySelector('h3').textContent) && modal().elements.km, 'Add entry asks the reading for a vehicle');
  check(doc.querySelector('#modal [data-pending-files]') && doc.querySelector('#modal [data-action="asset-back"]'), 'photos and the bill can be picked with it, and Back leads to the car');
  submitForm(win, 'asset-upkeep', { what: 'Wiper blades', type: 'added', cost: '1,500', km: '19,000' });
  const wip = PA.DB.upkeep.find((e) => e.item === 'Wiper blades');
  check(wip && wip.cost === 1500 && wip.km === 19000, 'saved');
  check(/Toyota Corolla/.test(modal().querySelector('h3').textContent) && /Saved Wiper blades, Rs 1,500, on Toyota Corolla/.test(doc.querySelector('#toasts').textContent), 'Save goes back to the car it was added from, and says it\'s saved');
  check(/Save car details/.test(doc.querySelector('#modal').textContent), 'the car\'s own Save says it\'s for its details');
  // Update reading
  box().querySelector('[data-form-type="reading"]').click();
  submitForm(win, 'asset-reading', { km: '20,000' });
  check(U.latestKm(car) === 20000, 'Update reading adds one');

  // --- The plan's tasks ---
  win.eval('upkeepTasks')();
  const oil = car.plan[0];
  const prefix = U.taskPrefix(car, oil);
  const t1 = PA.DB.tasks.find((t) => t.id.startsWith(prefix) && !t.done);
  check(t1 && t1.title === 'Engine oil and oil filter (Toyota Corolla ABC-123)', 'each job has a task named after it and the car');
  const n = U.next(car, oil, today);
  check(n.km === 19000 && n.date < today && t1.due.startsWith(n.date), 'oil was due by its months (before the 19,000 km came): the task is late');
  const ac = car.plan.find((p) => p.item === 'AC filter');
  check(PA.DB.tasks.find((t) => t.id.startsWith(U.taskPrefix(car, ac)))?.due.startsWith(iso(new Date(new Date(ago(400)).getFullYear(), new Date(ago(400)).getMonth() + 12, new Date(ago(400)).getDate()))) !== undefined, 'a job by months alone is due that many months after it was last done (or the plan began)');
  // A job by km in the future: the date is estimated from the average
  const air = car.plan.find((p) => p.item === 'Air filter');
  const nAir = U.next(car, air, today);
  const far = { id: 'far', item: 'Timing belt', km: 30000, months: 0, since: ago(10), sinceKm: 20000 };
  const nFar = U.next(car, far, today);
  check(nAir.km === 25000 && nFar.km === 50000 && nFar.estimated && nFar.date === iso(new Date(Date.now() + Math.ceil(30000 / U.kmPerDay(car)) * 864e5)), 'by km, the day comes from the average distance');
  // Logging the job ticks its task and the next round counts from it
  U.add({ asset: car.id, date: ago(1), type: 'service', item: 'engine oil and oil filter', cost: 9500, km: 20000 });
  changed('upkeep');
  win.eval('upkeepTasks')();
  const t2 = PA.DB.tasks.find((t) => t.id.startsWith(prefix) && !t.done);
  check(t1.done && t2 && t2 !== t1 && U.next(car, oil, today).km === 25000, 'logging it (the name in any case) ticks the task and makes the next, due at 25,000 km');
  // Ticking the task opens Add entry, filled in
  doc.querySelector('#modal [data-action="asset-cancel"]')?.click();
  doc.querySelector('[data-view="tasks"]').click();
  const box2 = doc.querySelector(`#main [data-action="toggle-task"][data-id="${t2.id}"]`);
  box2.click();
  confirmDone(win);
  await tick(10);
  check(modal() && modal().dataset.form === 'asset-upkeep' && modal().elements.what.value === 'Engine oil and oil filter' && /Done\?/.test(modal().textContent), 'ticking the task opens Add entry with the job filled in');
  doc.querySelector('#modal [data-action="asset-cancel"]').click();
  win.eval('upkeepTasks')();
  const t3 = PA.DB.tasks.find((t) => t.id.startsWith(prefix) && !t.done);
  check(t3 && t3 !== t2, 'not logged: the next round still starts from the tick');
  // Ticked but not logged: a reminder, Log it (dated as done) or Skip
  const un = U.unlogged([car]);
  check(un.length === 1 && un[0].t === t2, 'a job ticked with nothing logged is remembered');
  doc.querySelector('[data-view="today"]').click();
  check(/Engine oil and oil filter \(Toyota Corolla ABC-123\), ticked on/.test(doc.querySelector('#main').textContent), 'My Day says so, with Log it and Skip');
  check(U.logFor({ id: `${prefix}2000-01-01`, done: true, completedAt: new Date(ago(5)).getTime() }).date === ago(5), 'Add entry is dated the day it was done (as picked in "Done on"), not today');
  doc.querySelector(`#main [data-action="upkeep-log-ticked"][data-id="${t2.id}"]`).click();
  check(modal().dataset.form === 'asset-upkeep' && modal().elements.date.value === today && modal().elements.what.value === 'Engine oil and oil filter', 'Log it opens Add entry for that job, on that day');
  submitForm(win, 'asset-upkeep', { cost: '9,800', km: '20,500' });
  check(!U.unlogged([car]).length && !doc.querySelector('#main .unlogged'), 'once logged, the reminder goes');
  check(PA.DB.upkeep.some((e) => e.date === today && e.cost === 9800), 'and the entry has that date');
  // Skip
  const t4 = PA.DB.tasks.find((t) => t.id.startsWith(prefix) && !t.done);
  win.eval('Series').tick(t4, new Date(), true);
  win.eval('changed')('tasks');
  doc.querySelector('[data-view="vehicles"]').click();
  doc.querySelector('[data-vehicle-tab="overview"]').click();
  check(doc.querySelector('#main .unlogged'), 'the Vehicles overview shows it too');
  doc.querySelector('#main [data-action="upkeep-skip"]').click();
  check(!U.unlogged([car]).length && oil.skipped.includes(t4.id), 'Skip stops asking (kept on the job, for both devices)');
  win.eval('upkeepTasks')();
  // Taking a job off the plan takes its task (with Undo)
  win.eval('PendingDelete').UNDO_MS = 30;
  win.eval('openAssetForm')('plan', { asset: car.id, id: air.id });
  doc.querySelector('#modal [data-action="plan-delete"]').click();
  await tick(60);
  check(!car.plan.includes(air) && !PA.DB.tasks.some((t) => t.id.startsWith(U.taskPrefix(car, air)) && !t.done), 'a job taken off the plan takes its open task with it');
  // A job on any asset
  const house = A.add({ kind: 'property', name: 'House', currency: 'PKR', amount: 1, date: ago(10) });
  win.eval('openAssetForm')('plan', { asset: house.id });
  check(!modal().elements.km && modal().elements.months, 'a house\'s jobs go by months (no km)');
  submitForm(win, 'asset-plan', { what: 'AC service', months: '6' });
  check(house.plan.length === 1 && PA.DB.tasks.some((t) => t.id.startsWith(U.taskPrefix(house, house.plan[0]))), 'and get their task too');
  // Spent this year on the Assets overview
  doc.querySelector('[data-view="assets"]').click();
  doc.querySelector('[data-asset-tab="overview"]').click();
  check(/Spent on upkeep this year/.test(doc.querySelector('#main').textContent), 'the overview says what upkeep cost this year');
  // Deleting an entry: Trash with Undo
  win.eval('openAssetForm')('upkeep', { id: wip.id });
  doc.querySelector('#modal [data-action="upkeep-delete"]').click();
  check(!PA.DB.upkeep.includes(wip) && PA.DB.trash.some((e) => e.kind === 'upkeep'), 'deleting an entry puts it in the Trash');
  check(JSON.parse(win.localStorage.getItem('pa_upkeep')).length === PA.DB.upkeep.length, 'the log is saved with the data (through changed)');

  check(!app.errors.length, 'no script errors');
  app.close();

  // --- Read-only ---
  const ro = loadApp({ fsa: false });
  check(ro.win.eval('Upkeep').ensureTasks() === false && ['upkeep-delete', 'plan-delete'].every((x) => ro.win.eval('EDIT_ACTIONS').has(x)), 'read-only makes no tasks and changes nothing');
  ro.close();
  done();
})();
