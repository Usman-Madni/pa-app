// Upkeep on a fuel bill: the pump's statement also carries an oil change or a wash, whose cost is only known then.
// The bill lists the pump's cars' upkeep with no cost yet (logged, or ticked and not logged) from its month and the
// month before; a cost puts it on the bill (entry.bill) and in the car's log, a ticked job is logged, and one more can
// be typed in. The car rows stay fuel only: the price a litre leaves upkeep out, the bill adds it in when left empty,
// This year shows it as Upkeep, and the log says which bill it was on.
const { loadApp, submitForm, check, done } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const U = win.eval('Utilities');
  const Upkeep = win.eval('Upkeep');
  const Assets = win.eval('Assets');
  const today = PA.toISO(new Date());
  const ym = today.slice(0, 7);
  const y = Number(today.slice(0, 4));

  const car = Assets.add({ kind: 'vehicle', name: 'Civic', date: '2024-01-01' });
  const other = Assets.add({ kind: 'vehicle', name: 'Not fuelled here', date: '2024-01-01' });
  car.plan = [{ id: 'p-oil', item: 'Engine oil', km: 0, months: 6, since: '2024-01-01', sinceKm: 0 }];
  win.eval('changed')('assets');
  win.eval('upkeepTasks')();
  const task = PA.DB.tasks.find((t) => t.id.startsWith(Upkeep.taskPrefix(car, car.plan[0])) && !t.done);
  task.done = true; task.completedAt = Date.now(); // ticked, not logged
  const filter = Upkeep.add({ asset: car.id, item: 'Air filter', date: today, cost: 0 }); // logged, cost not known
  const priced = Upkeep.add({ asset: car.id, item: 'Wipers', date: today, cost: 900 }); // already has a cost
  const elsewhere = Upkeep.add({ asset: other.id, item: 'Tyres', date: today, cost: 0 }); // another car
  const old = Upkeep.add({ asset: car.id, item: 'Battery check', date: '2020-01-05', cost: 0 }); // too long ago
  win.eval('changed')('upkeep', 'tasks');
  const pump = U.add({ type: 'Fuel', name: 'The pump', provider: 'Pump Co', cars: [car.id] });
  win.eval('changed')('utilities');

  // What the bill offers
  win.eval('openAssetForm')('bill', { utility: pump.id });
  const form = doc.querySelector('#modal form');
  const box = doc.querySelector('#modal [data-bill-upkeep]');
  check(box && /Upkeep on this bill/.test(box.textContent), 'a fuel bill has Upkeep on this bill');
  check(form.elements[`bu-${filter.id}-cost`] && form.elements[`bu-t-${task.id}-cost`], 'it lists the logged entry with no cost and the job ticked but not logged');
  check(/ticked, not logged/.test(box.textContent), 'and says which was only ticked');
  check(!form.elements[`bu-${priced.id}-cost`] && !form.elements[`bu-${elsewhere.id}-cost`] && !form.elements[`bu-${old.id}-cost`], 'not one with a cost already, another car\'s, or one from long ago');

  // Save: fuel for the car, costs for both, and a car wash typed in; the bill left empty
  submitForm(win, 'asset-bill', { month: ym, date: today, amount: '', units: '', [`split-${car.id}-amount`]: '20000', [`split-${car.id}-litres`]: '70',
    [`bu-${filter.id}-cost`]: '1500', [`bu-t-${task.id}-cost`]: '8000', 'bu-new-car': car.id, 'bu-new-item': 'Car wash', 'bu-new-cost': '500' });
  const bill = PA.DB.bills.find((b) => b.utility === pump.id);
  check(bill.amount === 30000 && bill.units === 70, 'left empty, the bill is the fuel plus the upkeep');
  check(filter.cost === 1500 && filter.bill === bill.id, 'the logged entry gets its cost and the bill');
  const oil = PA.DB.upkeep.find((e) => e.item === 'Engine oil' && e.asset === car.id);
  check(oil && oil.cost === 8000 && oil.bill === bill.id && oil.date === today && oil.type === 'service' && oil.vendor === 'Pump Co', 'the ticked job is logged with its cost, on the day it was ticked, on the bill');
  check(!Upkeep.unlogged([car]).length, 'so it no longer asks to be logged');
  const wash = PA.DB.upkeep.find((e) => e.item === 'Car wash');
  check(wash && wash.cost === 500 && wash.bill === bill.id && wash.type === 'other', 'the car wash is added to the car\'s log, on the bill');
  check(priced.bill === undefined && elsewhere.bill === undefined, 'nothing else is touched');

  // Fuel stays fuel
  const x = U.figures(bill);
  check(x.upkeep === 10000 && Math.round(x.rate) === Math.round(20000 / 70), 'the price a litre leaves the upkeep out');
  const parts = U.fuelParts(pump, y);
  const get = (l) => parts.find((p) => p.label === l);
  check(get('Civic').amount === 20000 && get('Upkeep').amount === 10000 && !get('Not split'), 'This year: the car\'s fuel, Upkeep, and nothing Not split');
  check(Upkeep.costs(car).thisYear === 10000 + 900, 'the car\'s upkeep counts it once, in Upkeep');

  // The log says which bill
  win.eval('closeAssetForm')(true);
  win.eval('openAssetForm')('asset', { id: car.id });
  check(/on the fuel bill/.test(doc.querySelector('#modal').textContent), 'the car\'s log says it was on the fuel bill');
  win.eval('closeAssetForm')(true);
  win.eval('openAssetForm')('upkeep', { id: oil.id });
  const link = doc.querySelector('#modal [data-on-bill] [data-form-type="bill"]');
  check(link && link.dataset.id === bill.id, 'an entry links to its bill');
  win.eval('closeAssetForm')(true);

  // Reopening shows them; emptying one takes it off the bill
  win.eval('openAssetForm')('bill', { id: bill.id });
  const f2 = doc.querySelector('#modal form');
  check(Number(f2.elements[`bu-${filter.id}-cost`].value.replace(/,/g, '')) === 1500 && f2.elements[`bu-${wash.id}-cost`], 'the bill reopens with what\'s on it');
  submitForm(win, 'asset-bill', { [`bu-${filter.id}-cost`]: '' });
  check(filter.bill === undefined && filter.cost === 0 && oil.bill === bill.id, 'emptying a cost takes that one off the bill, the rest stay');

  // A bill in the Bin: the log no longer points at it
  PA.DB.bills = PA.DB.bills.filter((b) => b !== bill);
  check(U.onBill(oil) === null, 'once the bill is gone, the entry isn\'t shown as on it');

  // Another type has no upkeep box
  const gas = U.add({ type: 'Gas', name: 'Gas' });
  win.eval('changed')('utilities');
  win.eval('openAssetForm')('bill', { utility: gas.id });
  check(!doc.querySelector('#modal [data-bill-upkeep]'), 'a gas bill has no upkeep box');

  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  done();
})();
