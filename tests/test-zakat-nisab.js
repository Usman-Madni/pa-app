// Becoming sahib-e-nisab: the zakat day is a whole Islamic year after the zakatable wealth first went above the nisab
// (a dip within that year starts the count again); after that only the zakat day itself counts. Below the nisab on a
// zakat day: nothing due and that zakat day ends, until the wealth is above it again. Butler suggests the day from the
// balances and rates entered; Make record lists every zakat day since with no record, and warns about balances or
// rates out of date for the day; an "Update balances and rates" task comes on the zakat day; Due by can be changed.
const { loadApp, check, done, submitForm } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const Z = win.eval('Zakat');
  const A = win.eval('Assets');
  const H = win.eval('Hijri');
  const People = win.eval('People');
  const changed = win.eval('changed');
  const main = () => doc.querySelector('#main').textContent;
  const modal = () => doc.querySelector('#modal form');
  const yearOn = (d) => { const p = H.parts(d); return H.toISO(p.year + 1, p.month, p.day); };

  // Silver at 2,000 a tola: the nisab is 1,05,000.
  A.setRates({ date: '2023-01-01', gold: {}, silver: 2000, fx: {} });
  const acct = A.add({ kind: 'cash', name: 'Savings', currency: 'PKR', amount: 50000, date: '2023-01-01' });
  A.setValue(acct, '2023-02-25', 200000); // above
  A.setValue(acct, '2023-06-01', 60000); // a dip within the year
  A.setValue(acct, '2023-07-01', 200000); // above again: the count starts here
  const car = A.add({ kind: 'vehicle', name: 'Car', currency: 'PKR', amount: 5000000, date: '2023-01-01' });
  changed('assets', 'rates');

  check(Z.wealthOn('me', '2023-03-01').wealth === 200000 && Z.wealthOn('me', '2023-03-01').nisab === 105000, 'zakatable wealth leaves out the car (not zakatable) and the nisab is 52.5 tola of silver');
  const s = Z.findStart('me', '', '2026-11-15');
  check(s && s.since === '2023-07-01' && s.date === yearOn('2023-07-01'), 'a dip within the first year starts the count again; the zakat day is a whole Islamic year after');
  const p = H.parts('2023-07-01');
  check(s.hyear === p.year + 1 && s.month === p.month && s.day === p.day, 'and it\'s that Islamic day and month');
  check(Z.findStart('me', '', '2024-01-01').waiting === yearOn('2023-07-01'), 'before the year is up it\'s only waiting');
  car.zakat = true;
  check(Z.findStart('me', '', '2026-11-15').since === '2023-01-01', 'ticking the car Zakatable counts it (so it was above from the start)');
  car.zakat = null;

  // The page suggests it; "Set as zakat day" takes it
  doc.querySelector('[data-view="zakat"]').click();
  check(/Above the nisab since/.test(main()) && doc.querySelector('#main [data-action="zakat-adopt"]'), 'the Zakat page suggests the zakat day it found');
  doc.querySelector('#main [data-action="zakat-adopt"]').click();
  const me = People.get('me');
  check(me.zakat && me.zakat.day === p.day && me.zakat.month === p.month && me.zakat.since === '2023-07-01', 'Set as zakat day keeps the day, the month and since when');
  check(!doc.querySelector('#main [data-action="zakat-adopt"]') && /Sahib-e-nisab since/.test(main()), 'the suggestion goes and the card says since when');

  // Every zakat day since, with no record
  const open = Z.openDays('me', '2026-11-15');
  check(open.length >= 2 && open[0].date === yearOn('2023-07-01') && open.every((d) => d.date > '2023-07-01'), 'every zakat day since it began that has no record is open, oldest first');
  check(doc.querySelectorAll('#main .banner.warn').length === open.length, 'each one shows on the page');
  doc.querySelector('#main [data-form-type="zakat-make"]').click();
  check(modal().elements.hyear.options.length === open.length && Number(modal().elements.hyear.value) === open[0].hyear, 'Make record lists them all and starts with the oldest');
  check(/Out of date for this day\?/.test(modal().textContent) && /latest rates are from/.test(modal().textContent), 'it warns that the rates are old for that day');
  A.setRates({ date: open[0].date, gold: {}, silver: 2000, fx: {} });
  changed('rates');
  modal().elements.date.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(!/latest rates are from/.test(modal().textContent) && /Savings: last balance on/.test(modal().textContent), 'with rates that day, the old balance is what it warns about');
  A.setValue(acct, open[0].date, 200000);
  changed('assets');
  modal().elements.date.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(/up to date for this day/.test(modal().textContent), 'all fresh: it says so');

  // The task on the zakat day
  const today = PA.toISO(new Date());
  const near = Z.around('me', today);
  win.eval('zakatTasks')();
  const upd = PA.DB.tasks.find((t) => t.id.startsWith('zk-update-me-'));
  check(!near.last || near.last.date < PA.toISO(new Date(Date.now() - 330 * 864e5)) || (upd && /^Update balances and rates for /.test(upd.title) && upd.due.startsWith(near.last.date)), 'an "Update balances and rates" task comes on the zakat day');

  // Make the first record: above the nisab, due by the next zakat day; Due by can be changed
  submitForm(win, 'asset-zakat-make', {});
  const r = PA.DB.zakat[0];
  check(r && r.date === open[0].date && r.total === 200000, 'the record has that day\'s wealth');
  const next = H.toISO(r.hyear + 1, me.zakat.month, me.zakat.day);
  check(modal().elements.zdue.value === next, 'Due by is the next zakat day');
  modal().elements.zdue.value = '2025-01-01';
  modal().elements.zdue.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(r.dueBy === '2025-01-01' && Z.dueBy(r) === '2025-01-01', 'a date typed in Due by is kept');
  modal().elements.zdue.value = '';
  modal().elements.zdue.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(!r.dueBy && Z.dueBy(r) === next, 'clearing it goes back to the next zakat day');
  submitForm(win, 'asset-zakat-record', {});
  check(r.status === 'done' && r.due === 5000, '2.5% of 2,00,000 is due');
  check(!Z.ended('me'), 'above the nisab: the zakat day goes on');

  // The next zakat day below the nisab: nothing due, the zakat day ends
  const second = Z.openDays('me', '2026-11-15')[0];
  A.setValue(acct, second.date, 1000);
  A.setRates({ date: second.date, gold: {}, silver: 2000, fx: {} });
  changed('assets', 'rates');
  const r2 = Z.build('me', second.hyear, second.date);
  PA.DB.zakat.push(r2);
  changed('zakat');
  win.eval('openAssetForm')('zakat-record', { id: r2.id });
  check(/Below the nisab: nothing is due/.test(modal().textContent), 'a record below the nisab says nothing is due and the zakat day ends');
  submitForm(win, 'asset-zakat-record', {});
  check(r2.due === 0 && Z.ended('me') === r2, 'once done, that zakat day has ended');
  check(Z.openDays('me', '2026-11-15').length && !win.eval('zakatMissing')('me').length, 'no more records are asked for');
  doc.querySelector('[data-view="zakat"]').click();
  doc.querySelector('[data-zakat-tab="overview"]').click();
  check(/None for now/.test(main()) && /watches for the next time/.test(main()), 'the page says there\'s no zakat day for now');

  // Above again: a new zakat day a year on
  const back = PA.toISO(new Date(new Date(second.date).getTime() + 10 * 864e5));
  A.setValue(acct, back, 300000);
  changed('assets');
  const s2 = Z.suggest('me', '2030-01-01');
  check(s2 && s2.since === back && s2.date === yearOn(back), 'the next time above the nisab starts a new zakat day, a year on');

  check(!app.errors.length, 'no script errors');
  done();
})();
