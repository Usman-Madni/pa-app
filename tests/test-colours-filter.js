// What's owed in colour and words: overdue (past its Due by, money left) red, still to pay amber, paid or overpaid
// green, on the records, the bars, the Left to pay card and the Pay zakat task. Dates with their year on the money pages
// (and on tasks only when not this year). The page filter really hides rows on screen. Whose a task is, by full name.
const { loadApp, check, done } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const Z = win.eval('Zakat');
  const People = win.eval('People');
  const changed = win.eval('changed');
  const main = () => doc.querySelector('#main').textContent;
  const today = PA.toISO(new Date());
  const year = Number(today.slice(0, 4));

  // --- Dates ---
  const fmtDay = win.eval('fmtDay');
  const fmtDate = win.eval('fmtDate');
  check(!fmtDay(today).includes(String(year)) && fmtDay(`${year - 1}-03-04`).includes(String(year - 1)), 'on tasks: the year only when it isn\'t this year\'s');
  check(fmtDate(today).includes(String(year)), 'on the money pages: always the year');

  // --- Overdue, left, paid ---
  People.setZakat('me', 15, 8);
  const rec = (id, hy, date, due, dueBy) => ({ id, person: 'me', hyear: hy, date, dueBy, status: 'done', rates: { gold: {}, silver: 0, fx: {} }, items: [], roundUp: false, excess: 'carry', total: 0, nisab: 0, raw: due, due, made: 1, doneAt: 1 });
  const past = PA.toISO(new Date(Date.now() - 40 * 864e5));
  const later = PA.toISO(new Date(Date.now() + 200 * 864e5));
  PA.DB.zakat.push(rec('z1', 1445, '2024-02-25', 14000, past), rec('z2', 1446, '2025-02-14', 20000, later), rec('z3', 1444, '2023-03-07', 5000, past));
  PA.DB.zakatPay.push({ id: 'p1', person: 'me', date: '2023-04-01', amount: 6000, to: '', record: 'z3' });
  PA.DB.zakat.find((r) => r.id === 'z3').excess = 'charity';
  changed('zakat', 'zakatPay');
  check(Z.state(PA.DB.zakat[0]) === 'overdue' && Z.state(PA.DB.zakat[1]) === 'left' && Z.state(PA.DB.zakat[2]) === 'paid', 'past its Due by with money left is overdue; not due yet is left; paid (or overpaid) is paid');
  doc.querySelector('[data-view="zakat"]').click();
  doc.querySelector('[data-zakat-tab="records"]').click();
  const pills = [...doc.querySelectorAll('#main .pill')];
  check(pills.some((p) => p.classList.contains('zk-over') && /Rs 14,000 overdue/.test(p.textContent)), 'an overdue year says "overdue", in red');
  check(pills.some((p) => p.classList.contains('zk-left') && /Rs 20,000 left/.test(p.textContent)), 'one still to pay says "left", in amber');
  check(pills.some((p) => p.classList.contains('zk-paid') && /Paid \+1,000/.test(p.textContent)), 'an overpaid one says "Paid +1,000", in green');
  const sheet = [...doc.querySelectorAll('style')].map((x) => x.textContent).join('');
  check(/.pill.zk-over {[^}]*--danger/.test(sheet) && /.pill.zk-left {[^}]*--warn/.test(sheet) && /.pill.zk-paid {[^}]*--ok/.test(sheet), 'and the three take the red, amber and green tokens');
  check(new RegExp(`Due by .*${year - 1}|Due by .*${year}|Due by .*${year + 1}`).test(main()) && /\(\w{3},? .*2024\)/.test(main()), 'record names and Due by carry the year');
  doc.querySelector('[data-zakat-tab="overview"]').click();
  check(/Rs 14,000 overdue/.test(main()) && doc.querySelector('#main .kb-fill.zk-overdue') && doc.querySelector('#main .kb-fill.zk-left') && doc.querySelector('#main .kb-fill.zk-paid'), 'the Left to pay card says what\'s overdue, and the bars follow the colours');
  win.eval('zakatTasks')();
  check(PA.DB.tasks.find((t) => t.id === 'zk-pay-me-1445')?.title === 'Pay zakat 1445 (overdue)' && PA.DB.tasks.find((t) => t.id === 'zk-pay-me-1446')?.title === 'Pay zakat 1446', 'the Pay zakat task says "overdue" once its Due by has passed');

  // --- The page filter hides rows on screen ---
  doc.querySelector('[data-zakat-tab="records"]').click();
  const box = doc.querySelector('#main [data-input="page-filter"]');
  box.value = '1445';
  box.dispatchEvent(new win.Event('input', { bubbles: true }));
  const shown = [...doc.querySelectorAll('#main li.item')].filter((li) => win.getComputedStyle(li).display !== 'none');
  check(shown.length === 1 && /1445/.test(shown[0].textContent), 'the filter really hides the other rows (not just marks them)');

  // --- Full names ---
  const kim = People.add('Kim Lee');
  PA.DB.tasks.push(win.eval('normalizeTask')({ id: 'tk', title: 'Book the car service', people: [kim.id, 'me'], created: 1 }));
  changed('tasks');
  doc.querySelector('[data-view="tasks"]').click();
  const badge = doc.querySelector('#main .who-badges');
  check(badge && /Kim Lee/.test(badge.textContent) && !badge.querySelector('.avatar'), 'a task shows whose it is by full name, not initials');
  // --- Each person's colour ---
  const sam = People.add('Sam');
  const C = win.eval('PERSON_COLORS');
  check(People.colorOf('me') === '' && kim.color === C[0] && sam.color === C[1], 'each new person gets the next free colour; you have none');
  check((badge.querySelector('.pname').getAttribute('style') || '').includes('--pc:var(--lab-red)'), 'their name shows in it');
  doc.defaultView.eval('setView')('settings');
  const pick = doc.querySelector(`[data-person-color="${kim.id}"]`);
  check(pick && pick.value === C[0] && !doc.querySelector('[data-person-color="me"]'), 'Settings › People has a colour box for each person but you');
  pick.value = C[3];
  pick.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(People.colorOf(kim.id) === C[3] && JSON.parse(win.localStorage.getItem('pa_people')).find((p) => p.id === kim.id).color === C[3], 'changing it is kept and saved');
  check(People.colorOf(People.add('Lee').id) === C[0], 'a colour given up goes to the next person');

  // --- No two with the same name (capitals and spaces aside) ---
  const addBucket = win.eval('addBucket');
  addBucket('Home');
  check(addBucket(' home ') === false && PA.DB.buckets.filter((x) => /home/i.test(x.name)).length === 1 && /already a bucket called Home/.test(doc.querySelector('#toasts').textContent), 'a bucket name already used (any capitals or spaces) is not added again, and it says so');
  win.eval('addLabel')('Urgent');
  check(win.eval('addLabel')('URGENT') === false && PA.DB.labels.length === 1, 'nor a label');
  check(People.add('kim lee') === kim && People.list().filter((p) => /kim lee/i.test(p.name)).length === 1 && People.rename(sam.id, 'KIM LEE') === false, 'nor a person (adding or renaming)');
  check(!app.errors.length, 'no script errors');
  done();
})();
