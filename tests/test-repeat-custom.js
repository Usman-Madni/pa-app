// The custom repeat screen, "ends after N times / on a date / never", the moving part ("Elec bill (Oct 26)"
// → "(Nov 26)"), splitting older dated titles into title + moving part, and renaming every copy of a series.
const { loadApp, check, done } = require('./helpers');

(async () => {
  const app = loadApp({ storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  const D = (y, m, d) => new Date(y, m - 1, d);
  const roll = (title, from, to) => PA.rollTitle(title, from, to);
  const is = (title, from, to, want) => {
    const got = roll(title, from, to);
    check(got === want, `"${title}" → "${want}"${got === want ? '' : `  (got "${got}")`}`);
  };

  // Months, in the same style
  is('Aug elec bill', D(2026, 9, 5), D(2026, 10, 5), 'Sep elec bill');
  is('August electricity bill', D(2026, 9, 5), D(2026, 10, 5), 'September electricity bill');
  is('AUG bill', D(2026, 9, 5), D(2026, 10, 5), 'SEP bill');
  is('Electricity bill – August 2026', D(2026, 9, 5), D(2026, 10, 5), 'Electricity bill – September 2026');
  is('Rent Dec 2026', D(2026, 12, 1), D(2027, 1, 1), 'Rent Jan 2027');
  is("Rent Dec '26", D(2026, 12, 1), D(2027, 1, 1), "Rent Jan '27");
  is('Rent Dec', D(2026, 12, 1), D(2027, 1, 1), 'Rent Jan');
  is('May newsletter', D(2026, 5, 1), D(2026, 6, 1), 'June newsletter'); // "May" counts as a full name
  is('Apr then May', D(2026, 4, 1), D(2026, 5, 1), 'May then June');
  is('Call if you may', D(2026, 5, 1), D(2026, 6, 1), 'Call if you may'); // the verb isn't a month
  is('Marketing plan', D(2026, 3, 1), D(2026, 4, 1), 'Marketing plan'); // "Mar" inside a word stays
  // Quarters, weeks, days, years
  is('Q3 report', D(2026, 7, 15), D(2026, 10, 15), 'Q4 report');
  is('Q4 2026 review', D(2026, 10, 15), D(2027, 1, 15), 'Q1 2027 review');
  is('Week 43 plan', D(2026, 10, 19), D(2026, 10, 26), 'Week 44 plan');
  is('Week 52 plan', D(2026, 12, 21), D(2026, 12, 28), 'Week 1 plan');
  is('W43 sprint', D(2026, 10, 19), D(2026, 11, 2), 'W45 sprint');
  is('Bill due 5th', D(2026, 10, 5), D(2026, 11, 5), 'Bill due 5th'); // monthly: same day
  is('Swim class 1st', D(2026, 10, 1), D(2026, 10, 8), 'Swim class 8th'); // weekly: moves a week
  is('Pay on 5 Nov', D(2026, 11, 5), D(2026, 12, 5), 'Pay on 5 Dec');
  is('Meet Nov 30th', D(2026, 11, 30), D(2026, 12, 7), 'Meet Dec 7th');
  is('Tax return 2026', D(2026, 7, 31), D(2027, 7, 31), 'Tax return 2027');
  is('Pay elec bill', D(2026, 9, 5), D(2026, 10, 5), 'Pay elec bill'); // nothing to move
  is('Aug bill and Sep reading', D(2026, 9, 5), D(2026, 10, 5), 'Sep bill and Oct reading');

  // --- The moving part: "Oct 26" is October 2026 ---
  const rp = (p, from, to, want) => { const got = PA.rollPeriod(p, from, to); check(got === want, `moving part "${p}" → "${want}"${got === want ? '' : `  (got "${got}")`}`); };
  rp('Oct 26', D(2026, 10, 5), D(2026, 11, 5), 'Nov 26');
  rp('Dec 26', D(2026, 12, 5), D(2027, 1, 5), 'Jan 27');
  rp('October 2026', D(2026, 10, 5), D(2026, 11, 5), 'November 2026');
  rp('26 Oct', D(2026, 10, 26), D(2026, 11, 26), '26 Nov'); // a day
  rp('Oct 26th', D(2026, 10, 26), D(2026, 11, 26), 'Nov 26th'); // a day
  rp('Q3', D(2026, 7, 1), D(2026, 10, 1), 'Q4');
  rp('Week 43', D(2026, 10, 19), D(2026, 10, 26), 'Week 44');
  rp('2026', D(2026, 7, 31), D(2027, 7, 31), '2027');

  // Older titles with a date in them are split into title + moving part
  const sp = (title, wantTitle, wantPeriod) => {
    const got = PA.splitPeriod(title);
    check(got.title === wantTitle && got.period === wantPeriod, `"${title}" → "${wantTitle}" + "${wantPeriod}"${got.title === wantTitle && got.period === wantPeriod ? '' : `  (got "${got.title}" + "${got.period}")`}`);
  };
  sp('Aug elec bill', 'Elec bill', 'Aug');
  sp('Electricity bill – August 2026', 'Electricity bill', 'August 2026');
  sp("Rent Dec '26", 'Rent', "Dec '26");
  sp('Rent for Oct', 'Rent', 'Oct');
  sp('Pension Apr 26', 'Pension', 'Apr 26'); // two digits = the year (April 2026)
  sp('Landlord Nov 26 rent', 'Landlord rent', 'Nov 26');
  sp('Meet Nov 5', 'Meet', '5 Nov'); // one digit = a day
  sp('Q3 report', 'Report', 'Q3');
  sp('Tax return 2026', 'Tax return', '2026');
  sp('Call if you may', 'Call if you may', '');
  sp('August', 'August', ''); // nothing would be left of the title
  sp('Pay elec bill', 'Pay elec bill', '');
  const rep = { freq: 'monthly', interval: 1, days: [], monthMode: 'date', unit: 'days', until: '' };
  const old = PA.normalizeTask({ id: 'o1', title: 'Aug elec bill', due: '2026-08-05T23:59', repeat: rep });
  check(old.title === 'Elec bill' && old.period === 'Aug', 'saved repeating tasks from before are split when loaded');
  check(PA.normalizeTask({ id: 'o2', title: 'Aug elec bill', repeat: { ...rep, keepTitle: true } }).title === 'Aug elec bill', '…except ones that had "move dates forward" turned off');
  check(PA.normalizeTask({ id: 'o3', title: 'Tax return 2026' }).title === 'Tax return 2026', '…and tasks that don\'t repeat');
  check(PA.normalizeTask({ id: 'o4', title: 'Aug bill', period: '', repeat: rep }).title === 'Aug bill', '…and only once');
  check(PA.AT.suggestName({ title: 'Phone bill', period: 'Oct 26', due: '2026-10-05T23:59' }, 'scan.PDF') === 'Phone bill Oct 26.pdf', 'attachments are named "Phone bill Oct 26.pdf"');

  // --- In the app ---
  const t = PA.addTask({ title: 'Aug elec bill', due: '2026-09-05T23:59' });
  doc.querySelector('[data-view="tasks"]').click();
  doc.querySelector(`[data-action="open-task"][data-id="${t.id}"]`).click();
  const set = (key, value) => {
    const el = doc.querySelector(`#drawer [data-repeat="${key}"]`);
    if (el.type === 'checkbox') el.checked = value; else el.value = value;
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
  };
  check(!doc.querySelector('#drawer [data-field="period"]'), 'no moving part on a task that doesn\'t repeat');
  set('freq', 'monthly');
  check(t.title === 'Elec bill' && t.period === 'Aug' && doc.querySelector('#toasts').textContent.includes('"Aug" is now the moving part'), 'making it repeat moves "Aug" out of the title (and says so)');
  check(!doc.querySelector('#drawer [data-repeat="rollTitle"]'), 'the old "move dates forward" tick is gone');
  const field = doc.querySelector('#drawer [data-field="period"]');
  check(field && field.value === 'Aug', 'the moving part has its own box');
  check(doc.querySelector('#drawer .period-hint').textContent === 'Shows as Elec bill (Aug) · next: Elec bill (Sep)', 'it shows how it looks now and next time');
  check(doc.querySelector(`#main [data-id="${t.id}"]`).closest('.item').querySelector('.tt').textContent === 'Elec bill (Aug)', 'the list shows "Elec bill (Aug)"');
  let next = PA.completeTask(t);
  check(next.title === 'Elec bill' && next.period === 'Sep' && next.due === '2026-10-05T23:59', 'ticking it off makes "Elec bill (Sep)"');
  next = PA.completeTask(next);
  check(PA.fullTitle(next) === 'Elec bill (Oct)', '…then "Elec bill (Oct)"');
  // Typing a moving part
  PA.state.openTask = next.id;
  PA.renderDrawer();
  const box = doc.querySelector('#drawer [data-field="period"]');
  box.value = '(Oct 26)';
  box.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(next.period === 'Oct 26' && doc.querySelector('#drawer .period-hint').textContent.includes('next: Elec bill (Nov 26)'), 'typing "Oct 26" (brackets are dropped) → next one "Nov 26"');
  check(t.period === 'Aug', 'changing the moving part changes this copy only');
  PA.state.calMonth = new Date(2026, 11, 1);
  const prev = win.eval('repeatPreviews')('2026-12-01', '2027-01-31');
  check((prev['2026-12-05'] || []).some((i) => i.title === 'Elec bill (Nov 26)') && (prev['2027-01-05'] || []).some((i) => i.title === 'Elec bill (Dec 26)'), 'calendar previews move it on too (5 Dec: Nov 26, 5 Jan: Dec 26)');
  const same = PA.completeTask(next);
  check(PA.fullTitle(same) === 'Elec bill (Nov 26)', 'and the real next copy is "Elec bill (Nov 26)"');
  // Renaming renames every copy, done ones too
  PA.state.openTask = same.id;
  PA.renderDrawer();
  const title = doc.querySelector('#drawer [data-field="title"]');
  title.value = 'Electricity bill';
  title.dispatchEvent(new win.Event('change', { bubbles: true }));
  const series = PA.DB.tasks.filter((x) => x.seriesId === t.seriesId);
  check(series.length === 4 && series.every((x) => x.title === 'Electricity bill') && series.map((x) => x.period).join(',') === 'Aug,Sep,Oct 26,Nov 26', 'renaming one copy renames all 4 (each keeps its moving part)');
  check(doc.querySelector('#toasts').textContent.includes('Renamed 3 other copies of this task too'), 'and says how many');

  // --- Custom repeat screen ---
  const c = PA.addTask({ title: 'Gym', due: '2026-10-26T07:00' }); // a Monday
  PA.state.openTask = c.id;
  PA.renderDrawer();
  set('freq', 'custom');
  check(c.repeat && c.repeat.freq === 'weekly' && doc.querySelector('#drawer .repeat-box'), '"Custom…" opens the full repeat settings');
  set('interval', '2');
  set('unitFreq', 'weekly');
  doc.querySelector('#drawer [data-action="repeat-day"][data-weekday="4"]').click(); // + Thursday
  check(c.repeat.interval === 2 && c.repeat.days.join(',') === '1,4', 'every 2 weeks on Mon and Thu');
  check(doc.querySelector('#drawer [data-repeat="freq"]').value === 'custom', 'the list shows "Custom…" for it');
  check(PA.repeatText(c.repeat) === 'Every 2 weeks on Mon, Thu', 'described in words');
  set('unitFreq', 'monthly');
  check(c.repeat.freq === 'monthly' && c.repeat.interval === 2 && doc.querySelector('#drawer [data-repeat="monthMode"]'), 'switching the unit to months keeps "every 2" and shows the day choice');
  set('freq', 'daily');
  check(c.repeat.freq === 'daily' && c.repeat.interval === 1, 'a quick choice resets to "every 1"');

  // --- Ends after N times ---
  const n = PA.addTask({ title: 'Physio session', due: '2026-10-26T10:00' });
  PA.state.openTask = n.id;
  PA.renderDrawer();
  set('freq', 'weekly');
  set('endMode', 'count');
  set('count', '3');
  check(n.repeat.endMode === 'count' && n.repeat.count === 3, 'ends after 3 times');
  check(doc.querySelector('#drawer').textContent.includes('(2 of 3)'), 'drawer counts: next one is 2 of 3');
  const n2 = PA.completeTask(n);
  const n3 = PA.completeTask(n2);
  check(n2.seriesIndex === 2 && n3.seriesIndex === 3, 'copies are numbered');
  PA.state.openTask = n3.id;
  PA.renderDrawer();
  check(doc.querySelector('#drawer').textContent.includes('This is the last one (3 of 3)'), 'the third says it is the last');
  check(PA.completeTask(n3) === null, 'ticking the last one makes no more');
  // Calendar preview also stops
  const m = PA.addTask({ title: 'Course', due: '2026-11-02T18:00' });
  m.repeat = { freq: 'weekly', interval: 1, days: [1], monthMode: 'date', unit: 'days', until: '', endMode: 'count', count: 2 };
  PA.state.calMonth = new Date(2026, 10, 1);
  doc.querySelector('[data-view="calendar"]').click();
  const previews = [...doc.querySelectorAll('.chip.repeat')].filter((x) => x.textContent.includes('Course')).length;
  check(previews === 1, `calendar shows only the remaining repeats (1, got ${previews})`);

  // Ends on a date / never
  doc.querySelector('[data-view="tasks"]').click();
  PA.state.openTask = n.id;
  n.done = false; n.spawnedNext = '';
  PA.renderDrawer();
  set('endMode', 'date');
  check(doc.querySelector('#drawer [data-repeat="until"]'), '"On a date" shows a date box');
  set('until', '2026-10-30');
  check(PA.nextDue(n) === null, 'no repeat after the end date');
  set('endMode', 'never');
  check(n.repeat.until === '' && PA.nextDue(n) !== null, '"Never" clears the end date');
  // Old repeats with just `until` still end on that date
  check(PA.nextDue({ due: '2026-10-31T09:00', repeat: { freq: 'daily', interval: 1, until: '2026-10-31' } }) === null, 'an older repeat with only an end date still stops');
  app.close();
  done();
})();
