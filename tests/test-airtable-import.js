// Bringing in an Airtable zakat base from its CSV downloads (made-up data shaped like the real base: "Rs." amounts,
// European dates, quoted links with line breaks). Files are recognised by their columns; the user says who each name
// is; gold and silver linked to nobody are left out unless chosen; old years keep what was due; payments find their
// year from their link; bringing the same files in twice adds nothing. Read on the device; read-only can't.
const { loadApp, check, done, submitForm, tick } = require('./helpers');

const file = (name, text) => ({ name, text: async () => text });
const FILES = [
  file('Gold-Grid view.csv', '﻿Name,Karat,Weight (g),Weight (tola),Equivalent Tola Weight,Date Acquired,Comments,Picture,Totals\n'
    + 'Extra gold coin,,4,,0.34,,,,\n'
    + '1gm guinea,18,1,,0.09,31/12/2025,,coin.jpg (https://example.invalid/x),\n'
    + 'Bangles,22,,1.5,1.5,1/5/2025,"From the wedding, two",,Alex\n'),
  file('Silver-Grid view.csv', 'Name,Weight (g),Weight (tola),Equivalent Tola Weight,Comments,Date Acquired,Picture,Totals\n'
    + 'Prayer silver,,1,1,,,,Alex\nRing,5,,0.43,,18/3/2023,,Alex\n'),
  file('Overview-Grid view.csv', 'Name,Rates Date,24K G Rs/T,24K G Tola,22K G Rs/T,22K G Tola,21K G Rs/T,21K G Tola,18K G Rs/T,18K G Tola,T G Tola,T G Value,Gold Items,Silver Rs/T,T S Tola,T S Value,Silver Items,Savings,T Value,Cutoff Amount,Sahib-e-Nisab,Since,Days Since,Zakat Applicable,Zakat Payable,Zakat Date\n'
    + 'Alex,4/2/2026,"Rs. 533,500",0,"Rs. 488,722",0,"Rs. 466,817",0,"Rs. 400,134",0,0,Rs. 0,,"Rs. 13,800",1.43,"Rs. 19,697.44","Prayer silver,Ring","Rs. 900,000","Rs. 919,697","Rs. 724,500.00",Yes,25/2/2023,1358,Yes,"Rs. 22,992",15th Shaban\n'),
  file('Zakat Summary-Grid view.csv', 'Name,Islamic Date,Equivalent Date,Due Date,Due,Paid,Remaining,Person,Zakat Payments\n'
    + '"Alex\n15th Shaban 1446 - 14th February 2025\nDue: 14,000",15th Shaban 1446,14/2/2025,30/1/2026,"Rs. 14,000","Rs. 17,000","-Rs. 3,000",Alex,"a,b,c"\n'
    + '"Alex\n15th Shaban 1445",15th Shaban 1445,26/2/2024,10/2/2025,"Rs. 26,000","Rs. 26,000",Rs. 0,Alex,d\n'
    + '"Alex\n15th Shaban 1447",15th Shaban 1447,4/2/2026,20/1/2027,"Rs. 25,000","Rs. 25,000",Rs. 0,Alex,"e,f"\n'
    + '"Robin\n1st Ramzan 1447",1st Ramzan 1447,18/2/2026,4/2/2027,"Rs. 5,000",Rs. 0,"Rs. 5,000",Robin,\n'),
  file('Zakat Payments-Grid view.csv', 'Name,Person,Date,Amount,Description,Link\n'
    + 'x,Alex,2/10/2024,"Rs. 10,000",,"Alex\n15th Shaban 1446 - 14th February 2025\nDue Date: 30th January 2026"\n'
    + 'x,Alex,10/1/2025,"Rs. 4,000",,"Alex\n15th Shaban 1446 - 14th February 2025"\n'
    + 'x,Alex,27/1/2026,"Rs. 3,000",,"Alex\n15th Shaban 1446 - 14th February 2025"\n'
    + 'x,Alex,20/2/2026,"Rs. 20,000",A neighbour,"Alex\n15th Shaban 1447 - 4th February 2026"\n'
    + 'x,Alex,1/1/2024,"Rs. 26,000",,"Alex\n15th Shaban 1445 - 26th February 2024"\n'
    + 'x,Alex,24/2/2026,"Rs. 5,000",The electrician,"Alex\n15th Shaban 1447 - 4th February 2026"\n'
    + 'x,Alex,1/3/2026,"Rs. 1,000",,\n'),
  file('notes.csv', 'Something,Else\n1,2\n'),
];

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const I = win.eval('AirtableImport');
  const CSV = win.eval('CSV');
  const Z = win.eval('Zakat');
  const A = win.eval('Assets');
  const People = win.eval('People');

  // --- Reading the files ---
  const rows = CSV.parse('﻿a,b\n"x, y","line1\nline2"\n"say ""hi""",\r\n');
  check(rows.length === 3 && rows[1][0] === 'x, y' && rows[1][1] === 'line1\nline2' && rows[2][0] === 'say "hi"', 'CSV: commas and line breaks inside quotes, doubled quotes, a BOM');
  check(I.num('Rs. 9,00,000') === 900000 && I.num('-Rs. 3,000') === -3000 && I.num('1.5') === 1.5 && I.num('') === null, 'amounts with "Rs.", commas and a minus');
  check(I.date('14/2/2025') === '2025-02-14' && I.date('2025-02-14') === '2025-02-14' && I.date('soon') === '', 'Airtable\'s day-first dates');
  const d = I.islamic('Alex\n15th Shaban 1446 - 14th February 2025');
  check(d && d.day === 15 && d.month === 8 && d.year === 1446 && I.islamic('1st Ramzan').month === 9 && I.islamic('15th Shaban').year === 0, 'Islamic dates, spelt the local way too');

  const plan = await I.read(FILES);
  check(['gold', 'silver', 'overview', 'summary', 'payments'].every((k) => plan.tables[k]) && plan.unknown.join() === 'notes.csv (columns: Something, Else)', 'each table recognised by its columns; another file is named as not recognised, with its columns');
  check(plan.names.join() === 'Alex,Robin' && plan.unlinked === 2, 'the names used, and the gold not linked to anyone');
  const guess = I.guess(plan);
  check(guess.Alex === 'me' && guess.Robin === 'new', 'a first guess: the base\'s first person is you, others new');

  // --- The pop-up from Settings ---
  doc.querySelector('[data-view="settings"]').click();
  const input = doc.querySelector('[data-input="airtable"]');
  check(input && input.closest('.edit-only'), 'Settings has "Bring in from Airtable" (edit-only)');
  Object.defineProperty(input, 'files', { value: FILES, configurable: true });
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick(20);
  const form = doc.querySelector('#modal [data-form="asset-import"]');
  check(form && /Zakat Summary \(4 rows\)/.test(form.textContent) && /Not recognised: notes\.csv/.test(form.textContent), 'the pop-up says what it found');
  check(form.elements['who-0'].value === 'me' && form.elements['who-1'].value === 'new' && form.elements.unlinked.value === 'skip', 'who is who, guessed; unlinked gold left out by default');
  submitForm(win, 'asset-import', {});

  // --- What came in ---
  check(People.name('me') === 'Alex' && People.list().some((p) => p.name === 'Robin'), 'you are named as in the base; Robin is added');
  check(People.get('me').zakat.day === 15 && People.get('me').zakat.month === 8, 'your zakat day from the Overview');
  const robin = People.list().find((p) => p.name === 'Robin');
  check(robin.zakat && robin.zakat.month === 9 && robin.zakat.day === 1, 'Robin\'s zakat day from their Zakat Summary row');
  const r = A.ratesOn('2026-02-04');
  check(r && r.date === '2026-02-04' && r.gold['24'] === 533500 && r.gold['18'] === 400134 && r.silver === 13800, 'the rates, on their date');
  const savings = PA.DB.assets.find((a) => a.name === 'Savings');
  check(savings && A.amountOn(savings, '2026-02-04') === 900000 && A.shareOf(savings, 'me') === 1, 'savings as your account, on the rates date');
  const bangles = PA.DB.assets.find((a) => a.name === 'Bangles');
  check(bangles && Math.abs(bangles.grams - 17.55) < 0.01 && bangles.karat === '22' && bangles.acquired === '2025-05-01' && bangles.notes === 'From the wedding, two', 'linked gold: karat, weight in tola, date and comments');
  check(PA.DB.assets.filter((a) => a.kind === 'silver').length === 2 && !PA.DB.assets.some((a) => a.name === 'Extra gold coin'), 'silver linked to you; the unlinked gold left out');
  const recs = Z.records('me');
  check(recs.map((x) => x.hyear).join() === '1445,1446,1447' && recs.every((x) => x.status === 'done' && x.imported), 'each year a done record, marked as brought in');
  const y1446 = Z.recordFor('me', 1446);
  check(y1446.due === 14000 && Z.paid(y1446) === 17000 && Z.extra(y1446) === 3000 && y1446.date === '2025-02-14', 'what was due and paid each year, with the 1446 overpayment');
  const y1447 = Z.recordFor('me', 1447);
  check(Z.carriedIn(y1447) === 3000 && Z.remaining(y1447) === 0 && Z.payments(y1447).some((p) => p.to === 'A neighbour'), 'carried into 1447 (as there), and who each payment went to');
  check(Z.recordFor(robin.id, 1447).due === 5000 && Z.remaining(Z.recordFor(robin.id, 1447)) === 5000, 'Robin\'s year, still to pay');
  check(PA.DB.zakatPay.length === 6, 'a payment without a year is left out (and said so)');
  check(PA.DB.tasks.some((t) => t.id === `zk-pay-${robin.id}-1447` && !People.mine(t)), 'Robin gets a "Pay zakat" task, not in your To Do');
  check(!PA.DB.tasks.some((t) => t.id === 'zk-make-me-1447'), 'no "Make zakat record" for a year already brought in');
  check(JSON.parse(win.localStorage.getItem('pa_zakat')).length === 4 && JSON.parse(win.localStorage.getItem('pa_zakatPay')).length === 6, 'all of it saved (through changed)');

  // An imported year opens to look at: what was due, payments, no Reopen
  doc.querySelector('[data-view="zakat"]').click();
  doc.querySelector('[data-zakat-tab="records"]').click();
  doc.querySelector(`#main [data-action="open-zakat"][data-id="${y1446.id}"]`).click();
  const m = doc.querySelector('#modal').textContent;
  check(/Brought in from Airtable/.test(m) && !/Reopen/.test(m) && !/Total counted/.test(m) && /Payments/.test(m), 'a year brought in shows what was due and its payments, and can\'t be reopened');

  // --- Twice adds nothing ---
  const again = I.apply(await I.read(FILES), { Alex: 'me', Robin: robin.id }, 'skip');
  check(again.assets === 0 && again.records === 0 && again.payments === 0 && again.people === 0 && PA.DB.assets.length === 4, 'bringing the same files in again adds nothing twice');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();

  // --- Never silent: a file that can't be read is named in the pop-up ---
  const c = loadApp();
  c.doc.querySelector('[data-view="settings"]').click();
  const cIn = c.doc.querySelector('[data-input="airtable"]');
  const cloudOnly = { name: 'Gold-Grid view.csv', text: async () => { throw Object.assign(new Error('The file could not be read'), { name: 'NotReadableError' }); } };
  Object.defineProperty(cIn, 'files', { value: [cloudOnly, FILES[4]], configurable: true });
  cIn.dispatchEvent(new c.win.Event('change', { bubbles: true }));
  await tick(20);
  const cm = c.doc.querySelector('#modal [data-form="asset-import"]');
  check(cm && /Couldn't be read: Gold-Grid view\.csv/.test(cm.textContent) && /Zakat Payments \(7 rows\)/.test(cm.textContent), 'a file that can\'t be read is named (the others still found), never nothing at all');
  check(/Reading 2 files/.test(c.doc.querySelector('#toasts').textContent), 'and it says it\'s reading');
  c.close();

  // --- Unlinked gold kept as yours; a karat missing ---
  const b = loadApp();
  const I2 = b.win.eval('AirtableImport');
  const out = I2.apply(await I2.read(FILES), { Alex: 'me', Robin: 'skip' }, 'me');
  const coin = b.PA.DB.assets.find((a) => a.name === 'Extra gold coin');
  check(coin && coin.karat === '22' && out.notes.some((n) => /no karat: set as 22K/.test(n)), 'unlinked gold can be yours; a missing karat is set to 22K and said');
  check(b.PA.DB.assets.find((a) => a.name === '1gm guinea').karat === '18' && !b.win.eval('Zakat').records().some((x) => x.hyear === 1447 && x.person !== 'me'), 'its own karat is kept; someone left out brings nothing in');
  b.close();

  // --- Read-only ---
  const ro = loadApp({ fsa: false });
  ro.doc.querySelector('[data-view="settings"]').click();
  const roInput = ro.doc.querySelector('[data-input="airtable"]');
  Object.defineProperty(roInput, 'files', { value: FILES, configurable: true });
  roInput.dispatchEvent(new ro.win.Event('change', { bubbles: true }));
  await tick(20);
  check(!ro.doc.querySelector('#modal form') && !ro.PA.DB.assets.length, 'read-only brings nothing in');
  check(/Read-only on this device/.test(ro.doc.querySelector('#toasts').textContent), 'and says why');
  ro.close();
  done();
})();
