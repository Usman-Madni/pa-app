// Zakat: a person's zakat day (an Islamic date) worked out each year; a record made by a button for a day that has
// come, using that day's balances and rates (personal things unticked), checked as a draft and marked done (frozen);
// nisab 52.5 tola of silver, 2.5% above it, rounded up to the next 1,000 if chosen; due by the next zakat day.
// Payments count towards a record (by default the oldest with money left); extra is carried, kept as charity or split.
// Two tasks a year for that person only. The phone's More holds Zakat. Older files load; read-only only looks.
const { loadApp, check, done, answer, submitForm } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const A = win.eval('Assets');
  const Z = win.eval('Zakat');
  const H = win.eval('Hijri');
  const People = win.eval('People');
  const changed = win.eval('changed');
  const main = () => doc.querySelector('#main').textContent;
  const modal = () => doc.querySelector('#modal form');

  // --- Islamic dates ---
  check(H.toISO(1446, 8, 15) === '2025-02-14' && H.toISO(1447, 8, 15) === '2026-02-03' && H.toISO(1448, 8, 15) === '2027-01-23', '15th Sha\'ban each year, from the Umm al-Qura calendar');
  const p = H.parts('2026-02-03');
  check(p.year === 1447 && p.month === 8 && p.day === 15 && H.text(1447, 8, 15) === "15th Sha'ban 1447", 'and back again, with a readable name');

  // --- Your assets, as in the user's own sheet (the 1447 figures) ---
  People.setZakat('me', 15, 8);
  A.add({ kind: 'cash', name: 'Savings', currency: 'PKR', amount: 900000, date: '2026-01-10' });
  A.add({ kind: 'silver', name: 'Ring', grams: 5 });
  A.add({ kind: 'silver', name: 'Prayer silver', grams: 11.7 });
  A.add({ kind: 'vehicle', name: 'Car', amount: 3500000, date: '2026-01-01' });
  A.add({ kind: 'cash', name: 'Account opened later', amount: 50000, date: '2026-03-01' });
  A.setRates({ date: '2026-02-01', gold: { 22: 488722 }, silver: 13800, fx: {} });
  changed('people', 'assets', 'rates');

  const rec = Z.build('me', 1447, '2026-02-03');
  check(rec.items.length === 4 && !rec.items.find((i) => i.name === 'Car').counted && rec.items.filter((i) => i.counted).length === 3, 'a record takes what you had that day; personal things (the car) start unticked');
  check(Math.round(rec.total) === 919697 && rec.nisab === 724500 && Math.round(rec.raw) === 22992 && rec.due === 23000, 'total, nisab (52.5 tola of silver), 2.5%, rounded up to the next 1,000: the same as the sheet');
  rec.roundUp = false; Z.sum(rec);
  check(rec.due === 22992, 'without rounding up: the exact amount');
  rec.items.find((i) => i.name === 'Savings').counted = false; Z.sum(rec);
  check(rec.due === 0 && rec.total < rec.nisab, 'below the nisab: nothing due');
  const noRate = Z.build('me', 1447, '2025-12-01');
  check(Z.problems(noRate).some((x) => /silver rate/.test(x)), 'no silver rate that day: it can\'t be marked done');

  // --- Tasks for the zakat day ---
  check(win.eval('zakatTasks')() === undefined && PA.DB.tasks.some((t) => t.id === 'zk-make-me-1447' && t.due.startsWith('2026-02-03')), 'a day that has come with no record gets a "Make zakat record" task, due that day');
  const makeTask = PA.DB.tasks.find((t) => t.id === 'zk-make-me-1447');
  check(win.eval('People').mine(makeTask) && makeTask.title === 'Make zakat record 1447', 'it\'s yours (so it reaches your To Do)');

  // --- The page: make a record ---
  doc.querySelector('[data-view="zakat"]').click();
  check(/Your zakat day: 15th Sha'ban/.test(main()) && /has no record yet/.test(main()), 'the page says your zakat day and that 1447 has no record');
  doc.querySelector('#main .banner [data-form-type="zakat-make"]').click();
  check(modal().elements.date.value === '2026-02-03' && modal().elements.hyear.value === '1447', 'Make record suggests the year and its date');
  submitForm(win, 'asset-zakat-make', { date: '2026-02-04' }); // the moon was seen a day later
  const r = PA.DB.zakat[0];
  check(r && r.status === 'draft' && r.date === '2026-02-04' && modal().dataset.form === 'asset-zakat-record', 'it makes a draft on the date chosen and opens it');
  check(PA.DB.tasks.find((t) => t.id === 'zk-make-me-1447').done, 'the "Make zakat record" task is ticked');

  // Changes in the draft are worked out and saved as they're made
  const form = () => modal();
  form().elements['zr-silver'].value = '14000';
  form().elements['zr-silver'].dispatchEvent(new win.Event('change', { bubbles: true }));
  check(r.nisab === 735000 && Math.round(r.items.find((i) => i.name === 'Ring').value) === 5983, 'a new silver rate changes the nisab and silver values');
  const carBox = form().elements[`zc-${r.items.find((i) => i.name === 'Car').asset}`];
  carBox.checked = true;
  carBox.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(r.items.find((i) => i.name === 'Car').counted && r.total > 4000000, 'ticking the car counts it');
  const car2 = form().elements[`zc-${r.items.find((i) => i.name === 'Car').asset}`];
  car2.checked = false;
  car2.dispatchEvent(new win.Event('change', { bubbles: true }));
  const sv = form().elements[`zv-${r.items.find((i) => i.name === 'Savings').asset}`];
  sv.value = '880000';
  sv.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(r.items.find((i) => i.name === 'Savings').manual && r.items.find((i) => i.name === 'Savings').value === 880000, 'a typed value replaces the worked-out one');
  check(JSON.parse(win.localStorage.getItem('pa_zakat'))[0].items.find((i) => i.name === 'Savings').value === 880000, 'and is saved straight away');
  const sv2 = form().elements[`zv-${r.items.find((i) => i.name === 'Savings').asset}`];
  sv2.value = '';
  sv2.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(!r.items.find((i) => i.name === 'Savings').manual && r.items.find((i) => i.name === 'Savings').value === 900000, 'emptying it goes back to the worked-out value');

  // Mark done: frozen
  submitForm(win, 'asset-zakat-record', {});
  check(r.status === 'done' && r.due === 23000 && !modal(), 'Mark done freezes it');
  A.setValue(PA.DB.assets[0], '2026-01-10', 5000000);
  A.setRates({ date: '2026-02-01', gold: {}, silver: 99999, fx: {} });
  changed('assets', 'rates');
  Z.revalue(r);
  check(r.due === 23000 && Math.round(r.total) === Math.round(900000 + (5 + 11.7) / 11.7 * 14000), 'later changes to assets or rates don\'t touch a done record');
  check(PA.DB.tasks.some((t) => t.id === 'zk-pay-me-1447' && !t.done && t.due.startsWith('2027-01-16')), 'a "Pay zakat" task, due a week before the next zakat day');
  check(Z.dueBy(r) === '2027-01-23', 'it\'s due by the next zakat day');

  // --- Payments ---
  doc.querySelector('[data-zakat-tab="records"]').click();
  check(/Rs 23,000 left/.test(main()), 'the record shows what\'s left');
  doc.querySelector('#main [data-form-type="zakat-pay"]').click();
  check(modal().elements.record.value === r.id, 'a payment goes to the oldest year with money left');
  submitForm(win, 'asset-zakat-pay', { amount: '10000', to: 'A neighbour', date: '2026-03-01' });
  check(Z.paid(r) === 10000 && Z.remaining(r) === 13000 && PA.DB.zakatPay[0].to === 'A neighbour', 'it counts towards it');
  doc.querySelector('#main [data-form-type="zakat-pay"]').click();
  submitForm(win, 'asset-zakat-pay', { amount: '15000', date: '2026-04-01' });
  check(/2,000 more than is left/.test(modal().textContent) && Z.paid(r) === 10000, 'paying more than is left asks what the extra is for first');
  submitForm(win, 'asset-zakat-pay', { excess: 'carry' });
  check(Z.paid(r) === 25000 && Z.extra(r) === 2000 && r.excess === 'carry', 'carried: the record is paid with 2,000 extra');
  check(PA.DB.tasks.find((t) => t.id === 'zk-pay-me-1447').done, 'nothing left: the "Pay zakat" task is ticked');

  // The next year: the extra counts towards it
  const next = Z.build('me', 1448, '2027-01-23');
  next.status = 'done'; next.due = 30000;
  PA.DB.zakat.push(next);
  check(Z.carriedIn(next) === 2000 && Z.remaining(next) === 28000, 'next year starts 2,000 down');
  r.excess = 'charity';
  check(Z.carriedIn(next) === 0 && Z.remaining(next) === 30000, 'kept as extra charity instead: nothing carried');
  r.excess = 'carry';

  // Split across years
  const older = { ...Z.build('me', 1446, '2025-02-14'), status: 'done', due: 5000 };
  PA.DB.zakat.push(older);
  check(Z.defaultRecord('me') === older, 'the oldest year with money left comes first');
  const made = Z.pay({ person: 'me', date: '2026-05-01', amount: 8000, record: older.id, excess: 'split' });
  check(made.length === 2 && Z.remaining(older) === 0 && made[1].record === next.id && made[1].amount === 3000, 'split: what\'s left there, the rest to the next year with money left');

  // --- Reopening, deleting ---
  changed('zakat', 'zakatPay');
  win.eval('render')();
  doc.querySelector(`#main [data-action="open-zakat"][data-id="${r.id}"]`).click();
  check(modal().querySelector('fieldset.plain') && !/Mark done/.test(modal().textContent) && /Reopen/.test(modal().textContent), 'a done record opens to look at, with Reopen');
  doc.querySelector('#modal [data-action="zakat-reopen"]').click();
  await answer(win, true);
  check(r.status === 'draft', 'Reopen (asks) makes it a draft again');
  submitForm(win, 'asset-zakat-record', {});
  check(r.status === 'done', 'and it can be marked done again');

  // --- Other people: their own day, their own tasks, not yours ---
  const kim = People.add('Kim Lee');
  People.setZakat(kim.id, 1, 9);
  win.eval('zakatTasks')();
  const kimTask = PA.DB.tasks.find((t) => t.id === `zk-make-${kim.id}-1447`);
  check(kimTask && kimTask.title === 'Kim Lee: Make zakat record 1447' && !People.mine(kimTask) && People.of(kimTask).join() === kim.id, 'someone else\'s task carries their name and is only theirs (not your To Do)');
  PA.DB.tasks = PA.DB.tasks.filter((t) => t !== kimTask);
  changed('tasks');
  win.eval('zakatTasks')();
  check(!PA.DB.tasks.some((t) => t.id === kimTask.id), 'a zakat task you deleted isn\'t made again');

  // --- The phone's More ---
  doc.querySelector('[data-action="more"]').click();
  check([...doc.querySelectorAll('#more-sheet [data-view]')].map((b) => b.dataset.view).join() === 'musings,utilities,zakat,vault,data', 'More lists Musings, Utilities, Zakat, the Vault and Data (Notifications is the bell; Settings and Trash are in ⋮)');
  doc.querySelector('#more-sheet [data-view="vault"]').click();
  check(PA.state.view === 'vault' && !doc.querySelector('#more-sheet .more-panel') && doc.querySelector('.more-btn').classList.contains('active'), 'picking one opens it and closes the sheet; More stays lit');
  check(!/[—·]/.test(main()), 'no em dashes or middle dots');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));

  // --- Merging; an older file; read-only ---
  const now = Date.now();
  const m = win.eval('mergeData')({ zakat: [{ id: 'z1', updated: now }], zakatPay: [], tasks: [], notes: [], events: [] }, { zakat: [], zakatPay: [{ id: 'p1', updated: now }], tasks: [], notes: [], events: [] }, now);
  check(m.zakat.length === 1 && m.zakatPay.length === 1, 'records and payments merge like the rest');
  app.close();
  const ro = loadApp({ fsa: false });
  await ro.PA.RO.open({ name: 'd.json', text: async () => JSON.stringify({ app: 'PA App', version: 2, saveToken: 't', data: { tasks: [], notes: [], events: [] } }) });
  check(Array.isArray(ro.PA.DB.zakat) && Array.isArray(ro.PA.DB.zakatPay), 'a file from before Zakat loads');
  check(['zakat-delete', 'zakat-reopen', 'zpay-delete'].every((a) => ro.win.eval('EDIT_ACTIONS').has(a)) && ro.win.eval('Zakat').ensureTasks() === false, 'changing zakat is edit-only, and read-only makes no tasks');
  ro.close();
  done();
})();
