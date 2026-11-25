// "No record" on a zakat day with no record yet: after a question, its banner goes and Make record stops offering it
// (zakat.skip on the person, kept when the zakat day changes); Records lists it with Bring back, which returns it.
// Read-only phones can't do either.
const { loadApp, answer, tick, check, done } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const Z = win.eval('Zakat');
  const H = win.eval('Hijri');
  const People = win.eval('People');
  const toISO = win.eval('toISO');
  const main = () => doc.querySelector('#main').textContent;
  const banners = () => doc.querySelectorAll('#main .banner.warn [data-action="zakat-skip"]');

  // Sahib-e-nisab for a few years: several zakat days have come with no record
  const today = toISO(new Date());
  const hy = H.parts(today).year;
  const since = H.toISO(hy - 4, 1, 1);
  People.setZakat('me', 1, 9, since);
  const open = Z.openDays('me');
  check(open.length >= 3, 'a few zakat days have no record');

  doc.querySelector('[data-view="zakat"]').click();
  await tick(10);
  check(banners().length === open.length, 'each has a banner with No record');
  const first = open[0].hyear;

  // Say no to the question: nothing changes
  doc.querySelector(`#main [data-action="zakat-skip"][data-hyear="${first}"]`).click();
  const q = await answer(win, false);
  check(/No zakat record for/.test(q || doc.body.textContent) && banners().length === open.length && !Z.skipped('me').length, 'it asks first; No leaves it');

  // Yes: the banner goes, the form leaves it out
  doc.querySelector(`#main [data-action="zakat-skip"][data-hyear="${first}"]`).click();
  await answer(win, true);
  check(Z.skipped('me').includes(first) && banners().length === open.length - 1 && !doc.querySelector(`#main [data-action="zakat-skip"][data-hyear="${first}"]`), 'Yes: that banner goes, the others stay');
  check(!Z.openDays('me').some((d) => d.hyear === first), 'Make record no longer offers it');
  check(JSON.parse(win.localStorage.getItem('pa_people')).find((p) => p.id === 'me').zakat.skip.includes(first), 'it is saved with the person\'s zakat day');

  // Changing the zakat day keeps it
  People.setZakat('me', 2, 9);
  check(Z.skipped('me').includes(first) && People.get('me').zakat.since === since, 'changing the zakat day keeps the skipped years (and since)');
  People.setZakat('me', 1, 9);

  // Records lists it; Bring back returns it
  doc.querySelector('[data-zakat-tab="records"]').click();
  await tick(10);
  const list = doc.querySelector('#main [data-zakat-skipped]');
  check(list && /No record kept for/.test(list.textContent), 'Records lists the day with no record kept');
  list.querySelector(`[data-action="zakat-unskip"][data-hyear="${first}"]`).click();
  await tick(10);
  check(!Z.skipped('me').length && !doc.querySelector('#main [data-zakat-skipped]') && People.get('me').zakat.skip === undefined, 'Bring back returns it, and the empty list goes from the data');
  check(Z.openDays('me').some((d) => d.hyear === first), 'and it can be recorded again');

  // Ctrl+Z undoes a No record
  doc.querySelector('[data-zakat-tab="overview"]').click();
  await tick(10);
  doc.querySelector(`#main [data-action="zakat-skip"][data-hyear="${first}"]`).click();
  await answer(win, true);
  win.eval('Undo').undo();
  await tick(10);
  check(!Z.skipped('me').length, 'Ctrl+Z undoes it');
  check(main().includes('has no record yet'), 'and the banner is back');

  // Read-only: the buttons are edit-only and the actions refused
  Z.skip('me', first);
  const people = JSON.parse(JSON.stringify(PA.DB.people));
  const ro = loadApp({ query: '?readonly' });
  await tick(20);
  ro.PA.DB.people = people;
  ro.win.eval('setView')('zakat');
  ro.doc.querySelector('[data-zakat-tab="records"]').click();
  await tick(10);
  const back = ro.doc.querySelector('#main [data-action="zakat-unskip"]');
  check(back && back.classList.contains('edit-only'), 'read-only: Bring back is an edit button');
  back.click();
  await tick(10);
  check(ro.win.eval('Zakat').skipped('me').includes(first), 'and read-only changes nothing');

  check(app.errors.length === 0 && ro.errors.length === 0, 'no script errors' + (app.errors[0] || ro.errors[0] ? ': ' + (app.errors[0] || ro.errors[0]) : ''));
  done();
})();
