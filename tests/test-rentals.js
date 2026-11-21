// Rentals, on Assets › Property: an agreement rents out one or more properties (shown as Rented out) to a tenant, term by
// term. Its ledger runs month by month: due, received, when, written off, balance, and what's owed. Recording rent
// suggests what was paid last time; a part payment leaves the rest owed; Write off (unticked by default) clears a
// month's rest. Collect rent is a monthly task (ticking asks what came in); Renew agreement comes before the term ends
// (ticking asks the new term: +10% suggested, unrounded) and the next follows. Files go to Vault › Rentals › <name>.
const { loadApp, fakeFile, fakeFolder, submitForm, confirmDone, tick, check, done } = require('./helpers');

(async () => {
  const folder = fakeFolder('Attachments');
  const app = loadApp({ pickFolder: folder, pickFile: fakeFile(), storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  await PA.DF.createNew();
  const R = win.eval('Rentals');
  const Assets = win.eval('Assets');
  const open = win.eval('openAssetForm');
  PA.AT.SETTLE_MS = 5;
  doc.querySelector('[data-view="settings"]').click();
  doc.querySelector('[data-action="at-folder"]').click();
  await tick(10);
  const iso = (d) => PA.toISO(d);
  const now = new Date();
  const monthsAgo = (n) => iso(new Date(now.getFullYear(), now.getMonth() - n, 1));
  const ym = (n) => monthsAgo(n).slice(0, 7);
  const modal = () => doc.querySelector('#modal form');

  const shop = Assets.add({ kind: 'property', name: 'Plaza shop', amount: '1000' });
  const flat = Assets.add({ kind: 'property', name: 'Flat', amount: '1000' });
  win.eval('changed')('assets');
  doc.querySelector('[data-view="assets"]').click();
  doc.querySelector('[data-asset-tab="property"]').click();
  const main = () => doc.querySelector('#main');
  check(PA.state.view === 'property' && main().querySelector('.sub-back[data-view="assets"]') && doc.querySelector('.nav-btn.active').dataset.view === 'assets', 'Assets › Property opens the Property page, under Assets (‹ Assets, Assets stays lit)');
  check([...main().querySelectorAll('[data-property-tab]')].map((b) => b.textContent).join() === 'Properties,Rentals' && main().querySelectorAll('.asset-row').length === 2, 'its tabs: Properties (the two) and Rentals');
  main().querySelector('[data-property-tab="rentals"]').click();
  check(/No rental agreements yet/.test(main().textContent) && main().querySelector('.page-actions [data-form-type="rental"]'), 'Rentals: none yet, with Add rental agreement');

  // --- An agreement over two properties ---
  main().querySelector('[data-form-type="rental"]').click();
  modal().elements[`rp-${shop.id}`].checked = true;
  modal().elements[`rp-${flat.id}`].checked = true;
  submitForm(win, 'asset-rental', { name: 'Plaza lease', tenant: 'A tenant', phone: '0300', dueDay: '18', start: monthsAgo(13), months: '11', rent: '100000', deposit: '200000' });
  const r = PA.DB.rentals[0];
  check(r && r.properties.length === 2 && r.tenant === 'A tenant' && r.terms[0].rent === 100000 && r.terms[0].months === 11 && r.deposit === 200000, 'saved: two properties, the tenant, the first term and its rent');
  check(modal() && modal().dataset.form === 'asset-rental' && modal().querySelector('.ledger'), 'it stays open, with its ledger');
  const collect = PA.DB.tasks.find((t) => t.rental === r.id && t.rentKind === 'collect');
  check(collect && collect.repeat?.freq === 'monthly' && Number(collect.due.slice(8, 10)) === 18 && collect.fileTo === 'Rentals/Plaza lease' && PA.DB.buckets.find((b) => b.id === collect.bucket)?.name === 'Rentals', 'a monthly Collect rent task on the 18th, in a Rentals bucket, its files to Vault › Rentals › Plaza lease');
  const renewTask = PA.DB.tasks.find((t) => t.id === `rent-renew-${r.id}-${monthsAgo(13)}`);
  check(renewTask && renewTask.due.slice(0, 10) === monthsAgo(3), 'a Renew task, a month before the term ends');

  const rows = R.ledger(r);
  check(rows.length === 14 && rows[0].note === 'Start of agreement' && rows.every((x) => x.due === 100000) && R.owed(r) === 1400000, 'the ledger: a row a month from the start, all due and owed');

  // --- Recording rent ---
  open('rent-pay', { id: r.id, month: ym(13) });
  check(modal().elements.amount.value.replace(/,/g, '') === '100000' && !modal().elements.writeOff.checked, 'nothing paid yet: it suggests the rent; Write off unticked');
  submitForm(win, 'asset-rent-pay', { amount: '100000', date: monthsAgo(13).slice(0, 8) + '18' });
  open('rent-pay', { id: r.id, month: ym(12) });
  submitForm(win, 'asset-rent-pay', { amount: '99,000' });
  open('rent-pay', { id: r.id, month: ym(11) });
  check(modal().elements.amount.value.replace(/,/g, '') === '99000', 'next time it suggests what was paid last');
  modal().elements.writeOff.checked = true;
  submitForm(win, 'asset-rent-pay', { amount: '99000' });
  const L = R.ledger(r);
  check(L[0].balance === 0 && L[1].received === 99000 && L[1].balance === 1000 && L[2].balance === 0 && L[2].written === 1000 && /written off/.test(L[2].note), 'paid in full: 0; part paid: 1,000 owed; written off: cleared, and said');
  check(modal().dataset.form === 'asset-rental', 'saving goes back to the agreement');
  doc.querySelector(`#modal .ledger tr[data-month="${ym(12)}"]`).click();
  check(modal().dataset.form === 'asset-rent-pay' && modal().elements.month.value === ym(12), 'tapping a month in the ledger opens that month (not this one)');
  open('rental', { id: r.id });

  // --- Renewing (a term that's already ended, to see it in the ledger) ---
  open('rent-renew', { id: r.id });
  check(modal().elements.rent.value.replace(/,/g, '') === '110000' && modal().elements.start.value === monthsAgo(2), 'Renew: the new term from when this one ends, 10% more suggested');
  submitForm(win, 'asset-rent-renew', { rent: '1,10,050' });
  const L2 = R.ledger(r);
  const at = L2.find((x) => x.month === ym(2));
  check(R.rentNow(r) === 110050 && at.due === 110050 && /^Renewed, 10.1% increase/.test(at.note) && L2.find((x) => x.month === ym(3)).due === 100000, 'the typed rent from that month, marked "Renewed, 10.1% increase"');
  check(renewTask.done && PA.DB.tasks.some((t) => t.id === `rent-renew-${r.id}-${monthsAgo(2)}` && !t.done), 'the old Renew task is ticked, the next is made');

  // --- Terms: each renewal, to change or delete, with its own agreement file ---
  open('rental', { id: r.id });
  const termRows = [...doc.querySelectorAll('#modal .rental-terms .upkeep-row')];
  check(termRows.length === 2 && /Rs 1,10,050/.test(termRows[0].textContent) && /10.1% more/.test(termRows[0].textContent), 'the agreement lists its terms, newest first, with the increase');
  termRows[1].click();
  check(modal().dataset.form === 'asset-rent-term' && doc.querySelector('#modal [data-action="asset-back"]'), 'tapping a term opens it (with ‹ Back)');
  const tin = doc.querySelector('#modal input[data-input="rental-files"][data-term]');
  Object.defineProperty(tin, 'files', { value: [new win.File(['%PDF'], 'scan001.pdf', { type: 'application/pdf' })], configurable: true });
  tin.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick(40);
  const tf = PA.DB.docs.find((x) => x.term === r.terms[0].id);
  check(tf && tf.attachments[0].file === `Me/Vault/Rentals/Plaza lease/${R.termLabel(r, r.terms[0])}.pdf` && /^Plaza lease \w+ \d{4} – \w+ \d{4}$/.test(tf.name), 'its agreement is named after the term, in the agreement\'s folder');
  check(doc.querySelector('#modal').textContent.includes(tf.attachments[0].name), 'and listed on the term');
  submitForm(win, 'asset-rent-term', { rent: '99,000' });
  check(modal().dataset.form === 'asset-rental' && R.ledger(r)[0].due === 99000, 'changing its rent: the ledger follows, and it goes back to the agreement');
  open('rental', { id: r.id });
  const first = [...doc.querySelectorAll('#modal .rental-terms .upkeep-row')].pop();
  first.click();
  submitForm(win, 'asset-rent-term', { rent: '100000' });

  // --- Its tasks ---
  open('rental', { id: r.id });
  const tasks = doc.querySelector('#modal .rental-tasks').textContent;
  check(/Collect rent \(Plaza lease\)/.test(tasks) && /Renew rental agreement \(Plaza lease\)/.test(tasks), 'the agreement shows its Collect rent and Renew tasks');
  doc.querySelector('#modal .rental-tasks [data-action="files-go"]').click();
  check(PA.state.openTask && doc.body.classList.contains('drawer-over') && modal()?.dataset.form === 'asset-rental', 'opening a task from the agreement: its panel goes on top, the agreement stays under it');
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(!PA.state.openTask && !doc.body.classList.contains('drawer-over') && modal()?.dataset.form === 'asset-rental', 'Esc closes the panel first, back to the agreement');
  const rt = R.openRenew(r);
  PA.Series.tick(rt, new Date(), true);
  win.eval('changed')('tasks');
  open('rental', { id: r.id });
  const mk = doc.querySelector('#modal [data-action="rental-renew-task"]');
  check(mk && /No Renew task for this term/.test(doc.querySelector('#modal .rental-tasks').textContent), 'a ticked Renew task: the agreement says so and offers Make it');
  mk.click();
  check(R.openRenew(r) && R.openRenew(r).id === rt.id && !rt.done, 'Make it brings this term\'s Renew task back');
  const oldDue = collect.due;
  submitForm(win, 'asset-rental', { dueDay: '5' });
  check(collect.due.slice(0, 7) === oldDue.slice(0, 7) && Number(collect.due.slice(8, 10)) === 5 && collect.repeat.anchorDay === 5, 'a new due day moves the next Collect rent to that day');
  open('rental', { id: r.id });
  submitForm(win, 'asset-rental', { dueDay: '18' });

  // --- Ticking Collect rent asks what came in ---
  doc.querySelector('#modal [data-action="asset-cancel"]').click();
  doc.querySelector('[data-view="tasks"]').click();
  doc.querySelector(`#main [data-action="toggle-task"][data-id="${collect.id}"]`).click();
  confirmDone(win);
  await tick(10);
  check(modal()?.dataset.form === 'asset-rent-pay' && modal().elements.month.value === collect.due.slice(0, 7), 'ticking Collect rent asks what came in, for its month');
  doc.querySelector('#modal [data-action="asset-cancel"]').click();

  // --- The properties show it ---
  win.eval('setView')('property');
  main().querySelector('[data-property-tab="properties"]').click();
  check([...main().querySelectorAll('.asset-row')].filter((x) => /Rented out/.test(x.textContent)).length === 2, 'both properties show as Rented out');
  open('asset', { id: shop.id });
  check(doc.querySelector('#modal').textContent.includes('Plaza lease'), 'a property\'s pop-up lists its agreement');

  // --- Files ---
  open('rental', { id: r.id });
  const input = doc.querySelector('#modal input[data-input="rental-files"]');
  Object.defineProperty(input, 'files', { value: [new win.File(['%PDF'], 'Agreement 2026.pdf', { type: 'application/pdf' })], configurable: true });
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick(40);
  const d = PA.DB.docs.find((x) => x.rental === r.id && !x.term);
  check(d && d.folder === 'Rentals/Plaza lease' && d.attachments[0].file === 'Me/Vault/Rentals/Plaza lease/Agreement 2026.pdf' && doc.querySelector('#modal').textContent.includes('Agreement 2026.pdf'), 'Add files: into Vault › Rentals › Plaza lease, listed on the agreement');

  // --- Paste history from a sheet ---
  doc.querySelector('#modal [data-action="asset-cancel"]')?.click();
  open('rental', {});
  submitForm(win, 'asset-rental', { name: 'Old shop', dueDay: '18', start: '2024-05-01', months: '11', rent: '55000' });
  const o = PA.DB.rentals.find((x) => x.name === 'Old shop');
  open('rent-paste', { id: o.id });
  const sheet = [
    'Month\tDue\t Received \tPayment Date\t Balance \tComments',
    'Jan-24\tRs50,000\tRs50,000\t\t -   \tStart of Contract',
    'Feb-24\tRs50,000\tRs49,500\t\t 500 \t',
    'Mar-24\tRs55,000\tRs50,000\t18/03/2024\t 5,000 \tContract Renewal 10% Increase',
    'Apr-24\tRs55,000\tRs55,000\t19/04/2024\t -   \tpaid by cheque',
    'Sept-24\tRs55,000\t-\t\t 55,000 \t',
    'hello there',
    'Total\tRs2,65,000\tRs2,04,500\t\tRs60,500',
  ].join('\n');
  const ta = doc.querySelector('#modal textarea[name="sheet"]');
  ta.value = sheet;
  ta.dispatchEvent(new win.Event('input', { bubbles: true }));
  const pv = doc.querySelector('#modal .rent-paste-preview').textContent;
  check(/5 months, Jan 2024 to Sept? 2024; 1 rent change; due Rs 2,65,000, received Rs 2,04,500, short Rs 60,500/.test(pv) && /1 line not understood/.test(pv), `the preview says what it found, and what it left out (got: ${pv})`);
  submitForm(win, 'asset-rent-paste', {});
  const ot = R.terms(o);
  check(ot.length === 2 && ot[0].start === '2024-01-18' && ot[0].rent === 50000 && ot[0].months === 2 && ot[1].start === '2024-03-18' && ot[1].rent === 55000 && ot[1].months === 11, 'a term from each month the rent changed (the form\'s term in those months replaced)');
  const OL = R.ledger(o);
  const row = (m) => OL.find((x) => x.month === m);
  check(row('2024-02').balance === 500 && row('2024-03').balance === 5000 && /^Renewed, 10% increase$/.test(row('2024-03').note) && row('2024-03').dates[0] === '2024-03-18', 'the months come in: balances, the renewal marked by the ledger itself, dates');
  check(row('2024-04').note === 'paid by cheque' && row('2024-01').note === 'Start of agreement' && row('2024-05').received === 0 && row('2024-09').received === 0, 'its own comments kept; months missing from the sheet are simply unpaid');
  ta.value = '';
  open('rent-paste', { id: o.id });
  doc.querySelector('#modal textarea[name="sheet"]').value = sheet;
  submitForm(win, 'asset-rent-paste', {});
  check(o.payments.length === 4 && R.terms(o).length === 2, 'pasting again replaces those months: nothing doubled');
  doc.querySelector('#modal [data-action="asset-cancel"]')?.click();
  open('rental', { id: r.id });

  // --- Delete ---
  doc.querySelector('#modal [data-action="rental-delete"]').click();
  check(!PA.DB.rentals.includes(r) && PA.DB.trash.some((e) => e.kind === 'rentals') && !PA.DB.tasks.some((t) => t.rental === r.id && !t.done), 'deleting sends it and its open tasks to the Trash');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();
  done();
})();
