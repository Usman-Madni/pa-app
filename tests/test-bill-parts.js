// A fuel bill typed in whose parts (cars, what else it fuels, upkeep) don't add up to it: the pop-up shows the parts
// against the bill as you type (amber when they differ, litres too), and Save asks first, either way round. Fix it puts
// the pop-up back as typed; Save anyway saves. Left empty, the bill fills in with no question; matching, no question.
const { loadApp, answer, tick, check, done } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const U = win.eval('Utilities');
  const Assets = win.eval('Assets');
  const today = PA.toISO(new Date());
  const ym = today.slice(0, 7);
  const car = Assets.add({ kind: 'vehicle', name: 'Civic' });
  win.eval('changed')('assets');
  const pump = U.add({ type: 'Fuel', name: 'The pump', cars: [car.id], fuels: ['Generator'] });
  win.eval('changed')('utilities');

  const open = () => { win.eval('openAssetForm')('bill', { utility: pump.id }); return doc.querySelector('#modal form[data-form="asset-bill"]'); };
  const type = (form, name, value) => { form.elements[name].value = value; form.elements[name].dispatchEvent(new win.Event('input', { bubbles: true })); };
  const line = () => doc.querySelector('#modal [data-bill-parts]').textContent.replace(/\s+/g, ' ');
  const submit = (form) => form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  const asking = () => doc.querySelector('#modal form[data-form="ask"]');

  // As you type
  let form = open();
  check(line().trim() === '', 'nothing to compare before any part is typed');
  type(form, `split-${car.id}-amount`, '30000');
  type(form, 'also-0-amount', '9000');
  check(/Civic Rs 30,000 \+ Generator Rs 9,000 = Rs 39,000/.test(line()) && /the bill will be Rs 39,000/.test(line()), 'the parts add up as you type; empty, the bill will be their total');
  type(form, 'amount', '42000');
  check(/Rs 3,000 not split/.test(line()) && doc.querySelector('#modal [data-bill-parts] .late'), 'less than the bill: in amber, how much isn\'t split');
  type(form, 'amount', '38000');
  check(/Rs 1,000 more than the bill/.test(line()), 'more than the bill: in amber, by how much');
  type(form, `split-${car.id}-litres`, '100');
  type(form, 'units', '110');
  check(/litres: 10 L not split/.test(line()), 'litres the same');
  type(form, 'units', '100');
  check(!/litres/.test(line()), 'and quiet when they match');

  // Save: parts more than the bill asks; Fix it keeps what was typed
  submit(form);
  await tick(0);
  check(asking() && /parts come to Rs 39,000 but the bill is Rs 38,000 \(Rs 1,000 more than the bill\)/.test(asking().textContent), 'Save asks when the parts are more than the bill');
  await answer(win, false);
  form = doc.querySelector('#modal form[data-form="asset-bill"]');
  const val = (n) => Number(form.elements[n].value.replace(/,/g, ''));
  check(form && val('amount') === 38000 && val(`split-${car.id}-amount`) === 30000 && val('units') === 100 && !PA.DB.bills.length, `Fix it: the pop-up is back as typed, nothing saved (${form && form.elements.amount.value}, ${PA.DB.bills.length})`);

  // Less than the bill asks too; Save anyway saves
  type(form, 'amount', '42000');
  submit(form);
  await tick(0);
  check(asking() && /Rs 3,000 not split/.test(asking().textContent), 'and when they\'re less than the bill');
  await answer(win, true);
  check(PA.DB.bills.length === 1 && PA.DB.bills[0].amount === 42000, 'Save anyway saves it as typed');
  win.eval('closeAssetForm')(true);

  // Matching: no question; empty: fills in, no question
  form = open();
  type(form, `split-${car.id}-amount`, '20000');
  type(form, 'amount', '20,000');
  form.elements.month.value = ym;
  submit(form);
  await tick(0);
  check(!asking() && PA.DB.bills.length === 2, 'parts matching the bill: saved, no question');
  win.eval('closeAssetForm')(true);
  form = open();
  type(form, `split-${car.id}-amount`, '15000');
  submit(form);
  await tick(0);
  check(!asking() && PA.DB.bills.length === 3 && PA.DB.bills.some((b) => b.amount === 15000), 'bill left empty: filled in from the parts, no question');
  win.eval('closeAssetForm')(true);

  // Only a total, no parts: no question
  form = open();
  type(form, 'amount', '5000');
  submit(form);
  await tick(0);
  check(!asking() && PA.DB.bills.length === 4, 'a bill with no parts typed isn\'t questioned');
  win.eval('closeAssetForm')(true);

  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  done();
})();
