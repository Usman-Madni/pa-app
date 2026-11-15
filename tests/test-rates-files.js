// Correcting an Islamic month by up to two days, from the date under Butler (or My Day's line on the phone) or beside
// a date; changing a day's rates (and moving them to another day, which asks before replacing); file names cleaned of
// what Windows, OneDrive and the browser refuse and cut at a whole word; gold and silver's icons.
const { loadApp, fakeFolder, check, done, submitForm, answer, tick } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const H = win.eval('Hijri');
  const A = win.eval('Assets');
  const changed = win.eval('changed');
  const modal = () => doc.querySelector('#modal form');

  // --- Up to two days, either way ---
  const day = '2026-02-03';
  const u = H.uq(day);
  check(H.choices(day).map((o) => o.shift).join() === '2,1,0,-1,-2', 'five readings: 2 or 1 days later, as calculated, 1 or 2 days earlier');
  H.choose(day, 2);
  check(H.parts(day).day === u.day - 2 && H.current(day) === 2, 'two days later: the date reads two days behind');
  H.choose(day, -2);
  check(H.parts(day).day === u.day + 2 && H.current(day) === -2, 'two days earlier: two ahead');
  H.choose(day, 0);
  check(!PA.DB.hijriFix.length && H.current(day) === 0, 'as calculated clears it');
  // At the edge of a month: the first of a month, read 2 days later, is in the month before
  const first = H.uqToISO(u.year, u.month, 1);
  H.choose(first, 2);
  const p = H.parts(first);
  const before = H.uq(PA.toISO(new Date(new Date(first).getTime() - 2 * 864e5)));
  check(p.month === before.month && p.day === before.day && H.parts(PA.toISO(new Date(new Date(first).getTime() + 2 * 864e5))).day === 1, 'at the edge of a month, both months move and the 1st comes two days on');
  H.choose(first, 0);
  changed('hijriFix');

  // --- From the date under Butler ---
  doc.querySelector('#today-date [data-action="hijri-today"]').click();
  check(modal() && /Today's Islamic date/.test(modal().textContent) && modal().querySelectorAll('[data-hijri-fix] option').length === 5, 'the Islamic date under Butler opens the five choices for today');
  const today = PA.toISO(new Date());
  const sel = modal().querySelector('[data-hijri-fix]');
  sel.value = '1';
  sel.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(H.current(today) === 1 && doc.querySelector('#today-date').textContent.includes(H.textOf(today)), 'choosing "a day later" corrects this month, and the sidebar follows');
  check(JSON.parse(win.localStorage.getItem('pa_hijriFix')).length >= 1, 'saved with the data');
  const sel2 = modal().querySelector('[data-hijri-fix]');
  sel2.value = '0';
  sel2.dispatchEvent(new win.Event('change', { bubbles: true }));
  doc.querySelector('#modal [data-action="asset-cancel"]').click();
  check(doc.querySelector('#main [data-action="hijri-today"]'), 'My Day\'s line has it too (the phone\'s way in)');

  // --- Changing rates ---
  A.setRates({ date: '2026-01-01', gold: { 22: 400000 }, silver: 5000, fx: {} });
  A.setRates({ date: '2026-02-01', gold: { 22: 410000 }, silver: 5100, fx: {} });
  changed('rates');
  doc.querySelector('[data-view="assets"]').click();
  doc.querySelector('[data-asset-tab="rates"]').click();
  check(win.getComputedStyle(doc.querySelector('#main .list .title .meta')).display === 'inline', 'the normal date stays on the line of the Islamic date');
  doc.querySelector('#main [data-form-type="rates"][data-id]').click();
  check(/^Rates of /.test(modal().querySelector('h3').textContent) && modal().elements['gold-22'].value === '4,10,000' && modal().elements.date.value === '2026-02-01', 'a day opens with its own rates');
  submitForm(win, 'asset-rates', { silver: '5,200' });
  check(PA.DB.rates.length === 2 && A.ratesOn('2026-02-01').silver === 5200, 'changing one saves it in place');
  doc.querySelector('#main [data-form-type="rates"][data-id]').click();
  submitForm(win, 'asset-rates', { date: '2026-01-01' });
  await tick(0);
  check(/already has rates/.test(doc.querySelector('#modal').textContent), 'moving it onto a day with rates asks first');
  await answer(win, true);
  check(PA.DB.rates.length === 1 && A.ratesOn('2026-01-01').silver === 5200, 'and replaces that day\'s');
  doc.querySelector('#main [data-form-type="rates"][data-id]').click();
  doc.querySelector('#modal [data-action="delete-rates"]').click();
  check(!PA.DB.rates.length && !modal() && PA.DB.trash.some((e) => e.kind === 'rates'), 'Delete in it closes it and puts them in the Trash');

  // --- File names ---
  const safe = win.eval('safeFileName');
  const long = '2 pairs of earrings, 1 pair small earrings, 3 rings(1 red, 1 plain gold, 1 green) 1 pair of studs,\n2 pendants (1 iron, 1 enamel) 2026.jpg';
  const n = safe(long);
  check(n.length <= 100 && n.endsWith('.jpg') && !/[\n\\/:*?"<>|]/.test(n) && !/[ ,(]\.jpg$/.test(n), 'a long name with a line break is cleaned and cut at a whole word, keeping .jpg');
  check(safe('Two rings\n(gold)\t set.jpg') === 'Two rings (gold) set.jpg', 'line breaks and tabs become single spaces');
  check(safe('a/b:c*d?.pdf') === 'abcd.pdf' && safe('Report. ') === 'Report' && safe('') === 'file', 'not-allowed characters are dropped, no dot or space at the end');
  const sug = win.eval('AT').suggestName({ name: long.replace(' 2026.jpg', '') }, 'cam-1.jpg');
  check(sug.length <= 100 && /\b20\d\d\.jpg$/.test(sug), 'a suggested name keeps its year when shortened');
  const folder = fakeFolder('Attachments');
  PA.AT.dir = folder;
  PA.AT.status = 'ok';
  const gold = A.add({ kind: 'gold', name: long.replace(' 2026.jpg', ''), karat: '22', grams: 10 });
  await win.eval('AT').add(gold, [new win.File(['x'], 'cam-1767194449213.jpg', { type: 'image/jpeg' })], 'assets');
  check(gold.attachments.length === 1 && folder.files[gold.attachments[0].file], 'a photo for an item with a long name is saved');

  // --- Icons ---
  check(doc.querySelector('#i-gold-bar') && doc.querySelector('#i-silver-coin') && /--metal-gold/.test(doc.querySelector('#i-gold-bar').innerHTML), 'gold is a bar and silver a coin, in their own colours');

  check(!app.errors.length, 'no script errors');
  done();
})();
