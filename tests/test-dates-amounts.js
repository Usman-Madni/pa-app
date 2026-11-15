// Islamic dates and amounts across the app: today in both calendars (sidebar and My Day); a month the moon was sighted
// a day later or earlier here is corrected once and every date in it follows (both ways, shared by both devices);
// rates and zakat records are named by both dates; amount boxes group digits the local way (9,00,000) as you type and
// save plain numbers; each page's buttons are on every tab; an asset's value history can be changed in place.
const { loadApp, check, done, submitForm } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const H = win.eval('Hijri');
  const A = win.eval('Assets');
  const changed = win.eval('changed');
  const main = () => doc.querySelector('#main').textContent;

  // --- Today in both calendars ---
  const today = PA.toISO(new Date());
  check(doc.querySelector('#today-date').textContent.includes(H.textOf(today)), 'the sidebar shows today\'s Islamic date under Butler');
  check(main().includes(H.textOf(today)), 'My Day\'s line has it too (that\'s where the phone shows it)');

  // --- Month corrections ---
  const day = '2026-02-03';
  const u = H.uq(day);
  check(H.textOf(day) === H.text(u.year, u.month, u.day), 'with no correction, a day is as Umm al-Qura says');
  const start = H.uqToISO(u.year, u.month, 1);
  H.setShift(u.year, u.month, 1);
  changed('hijriFix');
  check(H.parts(day).day === u.day - 1 && H.toISO(u.year, u.month, u.day) === PA.toISO(new Date(2026, 1, 4)), 'a month that began a day later: its dates are a day behind, both ways');
  const before = H.parts(start);
  check(before.month === (u.month === 1 ? 12 : u.month - 1) && before.day >= 29, 'its calculated first day is the last day of the month before');
  check(H.toISO(u.year, u.month, 1) === PA.toISO(new Date(new Date(start).getTime() + 864e5)), 'and its 1st is the day after');
  check(JSON.parse(win.localStorage.getItem('pa_hijriFix')).length === 1, 'the correction is saved with the data (through changed)');
  H.setShift(u.year, u.month, 0);
  changed('hijriFix');
  check(H.textOf(day) === H.text(u.year, u.month, u.day) && !PA.DB.hijriFix.length, 'clearing it goes back to the calculation');
  const m = win.eval('mergeData')({ hijriFix: [{ id: 'hf-1447-8', hyear: 1447, month: 8, shift: 1, updated: 1 }], tasks: [], notes: [], events: [] }, { hijriFix: [], tasks: [], notes: [], events: [] }, Date.now());
  check(m.hijriFix.length === 1, 'corrections merge between devices like the rest');

  // --- Rates: named by the Islamic date, picked from the date typed, corrected there ---
  A.setRates({ date: day, gold: { 22: 490000 }, silver: 5000, fx: {} });
  changed('rates');
  doc.querySelector('[data-view="assets"]').click();
  doc.querySelector('[data-asset-tab="rates"]').click();
  const fmtDay = win.eval('fmtDay');
  check(main().includes(`${H.textOf(day)} (${fmtDay(day)}`),'the Rates tab shows the Islamic date, the normal one in brackets');
  check(doc.querySelector('#main [data-form-type="asset"]') && doc.querySelector('#main [data-form-type="rates"]'), 'Add asset and Add rates are both on the Rates tab');
  doc.querySelector('[data-asset-tab="overview"]').click();
  check(doc.querySelector('#main [data-form-type="asset"]') && doc.querySelector('#main [data-form-type="rates"]'), 'and both on the Overview');
  doc.querySelector('#main [data-form-type="rates"]').click();
  const form = doc.querySelector('#modal form');
  form.elements.date.value = day;
  form.elements.date.dispatchEvent(new win.Event('change', { bubbles: true }));
  const pick = doc.querySelector('#modal [data-hijri-fix]');
  check(pick && pick.selectedOptions[0].textContent.startsWith(H.textOf(day)), 'a date typed in Add rates shows its Islamic date');
  pick.value = '0'; // the moon was sighted a day later here
  pick.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(H.parts(day).day === u.day - 1 && PA.DB.hijriFix.length === 1, 'choosing "a day later" corrects that month');
  check(/began a day later here/.test(doc.querySelector('#modal .hijri-pick').textContent), 'and says so beside it');
  const again = doc.querySelector('#modal [data-hijri-fix]');
  again.value = '1';
  again.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(!PA.DB.hijriFix.length, '"as calculated" takes it off again');

  // --- Amount boxes ---
  const gold = doc.querySelector('#modal [name="gold-22"]');
  check(gold.type === 'text' && gold.inputMode === 'decimal' && gold.value === '4,90,000', 'amounts show grouped the local way (number keyboard on the phone)');
  gold.value = '5000000';
  gold.setSelectionRange(7, 7);
  gold.dispatchEvent(new win.Event('input', { bubbles: true }));
  check(gold.value === '50,00,000', 'and are grouped as you type');
  doc.querySelector('#modal [name="silver"]').value = '5,100.5';
  doc.querySelector('#modal [name="silver"]').dispatchEvent(new win.Event('input', { bubbles: true }));
  check(doc.querySelector('#modal [name="silver"]').value === '5,100.5', 'a decimal part is kept');
  submitForm(win, 'asset-rates', {});
  const saved = PA.DB.rates.find((r) => r.date === day);
  check(saved.gold['22'] === 5000000 && saved.silver === 5100.5, 'they save as plain numbers');

  // --- Value history, changed in place ---
  const acct = A.add({ kind: 'cash', name: 'Current', currency: 'PKR', amount: 100000, date: '2026-01-01' });
  A.setValue(acct, '2026-03-01', 150000);
  changed('assets');
  doc.querySelector('[data-view="assets"]').click();
  doc.querySelector('[data-asset-tab="cash"]').click();
  doc.querySelector('#main [data-action="open-asset"]').click();
  check(/Balance history/.test(doc.querySelector('#modal').textContent) && !/Amounts kept/.test(doc.querySelector('#modal').textContent), 'an account\'s history is its "Balance history"');
  const row = doc.querySelector('#modal [data-vh="2026-01-01"]');
  row.querySelector('[data-vh-amount]').value = '1,20,000';
  row.querySelector('[data-vh-amount]').dispatchEvent(new win.Event('change', { bubbles: true }));
  check(A.amountOn(acct, '2026-01-15') === 120000, 'an amount can be changed in place');
  row.querySelector('[data-vh-date]').value = '2026-01-10';
  row.querySelector('[data-vh-date]').dispatchEvent(new win.Event('change', { bubbles: true }));
  check(A.amountOn(acct, '2026-01-05') === null && A.amountOn(acct, '2026-01-10') === 120000 && acct.values.length === 2, 'and its date');
  check(doc.querySelector('[data-view="assets"]') && doc.querySelector('#modal [name="amount"]').dataset.amount !== undefined, 'the new-amount box is an amount box too');
  doc.querySelector('#modal [data-action="asset-cancel"]').click();

  // --- Zakat: buttons on every tab; records named by both dates ---
  doc.querySelector('[data-view="zakat"]').click();
  for (const tab of ['overview', 'records', 'payments', 'rates']) {
    doc.querySelector(`[data-zakat-tab="${tab}"]`).click();
    check(doc.querySelector('#main [data-form-type="zakat-make"]') && doc.querySelector('#main [data-form-type="rates"]'), `Make record and Add rates on Zakat's ${tab} tab`);
  }
  check(win.eval('zakatTitle')({ date: day, hyear: u.year }) === `${H.textOf(day)} (${fmtDay(day)}${today.slice(0, 4) === '2026' ? '' : ', 2026'})`, 'a zakat record is named by both dates');
  check(win.eval('ASSET_KINDS').find((k) => k.id === 'silver').icon === 'coin' && doc.querySelector('#i-coin'), 'silver has a coin for its icon');

  check(!app.errors.length, 'no script errors');
  done();
})();
