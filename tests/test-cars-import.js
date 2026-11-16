// Bringing in an Airtable cars base from its CSVs (Cars, Maintenance, Expenses, Repairs): each car a vehicle asset with
// its details, price and km when bought, for the person chosen; each log row an upkeep entry on its car, typed by its
// table (by file name, else by the cars' link columns), with its photos to fetch; a new car's plan fitted to the
// history (its names, the gaps seen, a service done three times or more added); nothing twice on a second go.
// Made-up data in the shape of the base.
const { loadApp, check, done, submitForm, tick } = require('./helpers');

const file = (name, text) => ({ name, text: async () => text });
const LOG_COLS = 'Name,Item,Description,Cost,Date,Mileage,Vendor,Picture,Car\n';
const CARS = file('Cars-Grid view.csv', 'Name,License Plate,Company,Model,Year,Registered Year,Buying Price,Buying Mileage,Buying Date,T Cost,T. Mnt Cost,T. Exp Cost,T. Rep Cost,Maintenance,Expenses,Repairs\n'
  + 'Honda City XYZ-9,XYZ-9,Honda,City,2019,2020,"Rs. 2,500,000",20000,1/3/2021,,,,,"Engine Oil for Rs. 8000 @ 25000km on 1st September 2021,Engine Oil for Rs. 8500 @ 30000km on 1st March 2022,Engine Oil for Rs. 9000 @ 35000km on 1st September 2022",Floor Mat for Rs. 3000 @ 0km on 5th May 2021,Mystery for Rs. 100 @ 0km on 2nd June 2022\n');
const MAINT = file('Maintenance-Grid view.csv', LOG_COLS
  + 'Engine Oil for Rs. 8000 @ 25000km on 1st September 2021,Engine Oil,,"Rs. 8,000",1/9/2021,25000,Garage One,oil.jpg (https://example.invalid/1),Honda City XYZ-9\n'
  + 'Engine Oil for Rs. 8500 @ 30000km on 1st March 2022,Engine Oil,,"Rs. 8,500",1/3/2022,30000,Garage One,,Honda City XYZ-9\n'
  + 'Engine Oil for Rs. 9000 @ 35000km on 1st September 2022,Engine Oil,,"Rs. 9,000",1/9/2022,35000,Garage One,,Honda City XYZ-9\n'
  + 'A/C Filter for Rs. 1500 @ 30000km on 1st March 2022,A/C Filter,,"Rs. 1,500",1/3/2022,30000,,,Honda City XYZ-9\n');
const EXP = file('Expenses-Grid view.csv', LOG_COLS + 'Floor Mat for Rs. 3000 @ 0km on 5th May 2021,Floor Mat,Rubber,"Rs. 3,000",5/5/2021,,Shop,,Honda City XYZ-9\n');
const REP = file('table.csv', LOG_COLS + 'Mystery for Rs. 100 @ 0km on 2nd June 2022,AC Fan Motor,Replaced,Rs. 100,2/6/2022,"Rs. 31,000",,,Honda City XYZ-9\n'
  + 'Other car,Wiper,,Rs. 50,2/6/2022,,,,Some other car\n');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const I = win.eval('AirtableImport');
  const U = win.eval('Upkeep');
  const People = win.eval('People');
  const changed = win.eval('changed');
  const kim = People.add('Kim');

  const plan = await I.read([CARS, MAINT, EXP, REP]);
  check(plan.tables.cars.length === 1 && plan.tables.carlog.length === 3, 'the Cars file and three log files are recognised by their columns');
  check(plan.tables.carlog.map((l) => l.type).join() === 'service,added,', 'Maintenance and Expenses are told by their names; a file named otherwise waits for the links');

  // Through the pop-up
  win.eval('openAssetForm')('import', { plan });
  check(/Cars \(1 car\)/.test(doc.querySelector('#modal').textContent) && doc.querySelector('#modal [name="carsTo"]'), 'the pop-up lists what it found and asks whose the cars are');
  submitForm(win, 'asset-import', { carsTo: kim.id });
  const car = PA.DB.assets.find((a) => a.kind === 'vehicle');
  check(car && car.name === 'Honda City XYZ-9' && car.car.make === 'Honda' && car.car.plate === 'XYZ-9' && car.car.boughtKm === 20000 && car.acquired === '2021-03-01', 'the car with its details and when it was bought');
  check(win.eval('Assets').amountOn(car, '2021-03-01') === 2500000 && win.eval('Assets').shareOf(car, kim.id) === 1, 'its price, and it\'s Kim\'s');
  const log = U.log(car.id);
  check(log.length === 6 && log.filter((e) => e.type === 'service').length === 4 && log.find((e) => e.item === 'Floor Mat').type === 'added', 'each row an entry on its car, typed by its table');
  const fan = log.find((e) => e.item === 'AC Fan Motor');
  check(fan && fan.type === 'repair' && fan.km === 31000 && fan.notes === 'Replaced', 'a file not named by its table is typed from the car\'s links; a mileage kept as money is read as km');
  check(!log.some((e) => e.item === 'Wiper'), 'a row for a car not in the Cars file is left out');
  // The plan from the history
  const oil = car.plan.find((p) => p.item === 'Engine Oil');
  check(oil && oil.km === 5000 && oil.months === 6 && oil.since === '2022-09-01' && oil.sinceKm === 35000, 'the usual job takes the name used there, its gaps (5,000 km, 6 months), and counts from the last time');
  check(car.plan.some((p) => p.item === 'A/C Filter') && car.plan.some((p) => p.item === 'Coolant') && car.plan.length === 6, 'the other usual jobs too, under the history\'s names where it has them');
  check(PA.DB.tasks.some((t) => t.id.startsWith(U.taskPrefix(car, oil)) && People.of(t).join() === kim.id), 'and each job\'s task is Kim\'s');
  // Photos
  const out = I.apply(await I.read([CARS, MAINT, EXP, REP]), {}, 'skip', 'me');
  check(out.cars === 0 && out.entries === 0 && U.log(car.id).length === 6, 'bringing it in again adds nothing twice');
  check(out.photos.length === 1 && out.photos[0].key === 'upkeep' && out.photos[0].name === 'oil.jpg', 'its entry\'s photo is still to fetch (an entry\'s, not an asset\'s)');

  check(!app.errors.length, 'no script errors');
  done();
})();
