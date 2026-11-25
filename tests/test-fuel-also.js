// A fuel connection can also fuel things that aren't cars ("Also fuels": Generator). Each gets a row in the bill
// (amount, litres), the bill adds them up when left empty, and the Fuel tab shows the year by car and by each of
// them, with "Not split" for what the bills hold beyond their rows. Older bills and connections load as they are.
const { loadApp, submitForm, answer, check, done } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const U = win.eval('Utilities');
  const Assets = win.eval('Assets');
  const y = new Date().getFullYear();
  const civic = Assets.add({ kind: 'vehicle', name: 'Civic' });
  const city = Assets.add({ kind: 'vehicle', name: 'City' });
  win.eval('changed')('assets');

  // Set up: two cars, and a generator typed in Also fuels (twice, any case: kept once)
  win.eval('openAssetForm')('utility', { kind: 'Fuel' });
  const form = doc.querySelector('#modal form');
  check(form.elements.fuels, 'a fuel connection has Also fuels');
  form.elements[`u-car-${civic.id}`].checked = true;
  form.elements[`u-car-${city.id}`].checked = true;
  submitForm(win, 'asset-utility', { name: 'The pump', fuels: 'Generator, generator,  ' });
  const pump = PA.DB.utilities.find((x) => x.name === 'The pump');
  check(JSON.stringify(pump.fuels) === '["Generator"]' && pump.cars.length === 2, 'saved with its cars and the generator, once');

  // Another type doesn't ask
  win.eval('openAssetForm')('utility', { kind: 'Gas' });
  check(!doc.querySelector('#modal form').elements.fuels, 'gas doesn\'t ask what else it fuels');
  win.eval('closeAssetForm')(true);

  // A bill: a row for the generator beside the cars; left empty, the bill is all of them added up
  win.eval('openAssetForm')('bill', { utility: pump.id });
  const bill = doc.querySelector('#modal form');
  check(bill.elements['also-0-amount'] && bill.elements['also-0-litres'] && !bill.elements['also-0-km'] && /By what it fuels/.test(bill.textContent) && /Generator/.test(bill.textContent), 'the bill has a Generator row (amount and litres)');
  submitForm(win, 'asset-bill', { month: `${y}-01`, date: `${y}-02-05`, amount: '', units: '',
    [`split-${civic.id}-amount`]: '30000', [`split-${civic.id}-litres`]: '100', [`split-${city.id}-amount`]: '15000', [`split-${city.id}-litres`]: '50',
    'also-0-amount': '9000', 'also-0-litres': '30' });
  const b1 = PA.DB.bills.find((b) => b.utility === pump.id);
  check(b1.amount === 54000 && b1.units === 180, 'left empty, the bill and litres add up the cars and the generator');
  check(b1.split.some((x) => x.what === 'Generator' && x.amount === 9000 && x.litres === 30 && !x.car), 'the generator\'s line is saved by name');
  win.eval('closeAssetForm')(true);

  // A bill typed as one figure, more than its rows
  win.eval('openAssetForm')('bill', { utility: pump.id });
  submitForm(win, 'asset-bill', { month: `${y}-02`, date: `${y}-03-05`, amount: '20000', units: '', [`split-${civic.id}-amount`]: '12000', [`split-${civic.id}-litres`]: '40', 'also-0-amount': '5000', 'also-0-litres': '15' });
  await answer(win, true); // the parts don't add up: Save anyway
  win.eval('closeAssetForm')(true);

  // The year by car and by the generator
  const parts = U.fuelParts(pump, y);
  const get = (l) => parts.find((p) => p.label === l);
  check(get('Civic').amount === 42000 && get('Civic').litres === 140 && get('City').amount === 15000 && get('Generator').amount === 14000 && get('Generator').litres === 45, 'each car and the generator totalled separately');
  check(get('Not split').amount === 3000, 'what a bill holds beyond its rows is Not split');
  check(parts.reduce((t, p) => t + p.amount, 0) === 74000, 'and the parts add up to the bills');

  doc.querySelector('[data-view="utilities"]').click();
  doc.querySelector('[data-util-tab="Fuel"]').click();
  const line = doc.querySelector('#main [data-fuel-parts]');
  check(line && /This year/.test(line.textContent) && /Civic/.test(line.textContent) && /City/.test(line.textContent) && /Generator/.test(line.textContent) && /Not split/.test(line.textContent), 'the Fuel tab shows This year by car and generator');

  // Editing a bill shows its generator figures again
  win.eval('openAssetForm')('bill', { id: b1.id });
  check(Number(doc.querySelector('#modal form').elements['also-0-amount'].value.replace(/,/g, '')) === 9000, 'an old bill opens with its generator figures');
  win.eval('closeAssetForm')(true);

  // Taking the generator off the list keeps the old bills' lines
  win.eval('openAssetForm')('utility', { id: pump.id });
  submitForm(win, 'asset-utility', { fuels: '' });
  check(pump.fuels === undefined, 'emptied, the list goes from the data');
  win.eval('openAssetForm')('bill', { id: b1.id });
  submitForm(win, 'asset-bill', {});
  check(b1.split.some((x) => x.what === 'Generator'), 'an old bill saved again keeps its generator line');
  check(U.fuelParts(pump, y).some((p) => p.label === 'Generator'), 'and it still counts');

  // A connection and bills from before: no fuels, car lines only
  const old = { id: 'u-old', type: 'Fuel', name: 'Old pump', cars: [civic.id], people: ['me'] };
  PA.DB.utilities.push(old);
  PA.DB.bills.push({ id: 'b-old', utility: 'u-old', month: `${y}-01`, date: '', period: '', amount: 5000, split: [{ car: civic.id, amount: 5000, litres: 20, km: 0 }] });
  check(U.fuelParts(old, y).length === 1 && U.fuelParts(old, y)[0].label === 'Civic', 'an older connection and its bills work as before');

  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  done();
})();
