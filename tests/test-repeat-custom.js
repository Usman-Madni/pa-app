// The custom repeat screen, "ends after N times / on a date / never", and titles that move forward
// with each repeat ("Aug elec bill" → "Sep elec bill").
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

  // --- In the app: title moves forward when ticked off ---
  const t = PA.addTask({ title: 'Aug elec bill', due: '2026-09-05T23:59' });
  doc.querySelector('[data-view="tasks"]').click();
  doc.querySelector(`[data-action="open-task"][data-id="${t.id}"]`).click();
  const set = (key, value) => {
    const el = doc.querySelector(`#drawer [data-repeat="${key}"]`);
    if (el.type === 'checkbox') el.checked = value; else el.value = value;
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
  };
  set('freq', 'monthly');
  check(doc.querySelector('#drawer [data-repeat="rollTitle"]').checked, '"Move dates in the title forward" is on by default');
  let next = PA.completeTask(t);
  check(next.title === 'Sep elec bill' && next.due === '2026-10-05T23:59', 'ticking "Aug elec bill" off makes "Sep elec bill"');
  next = PA.completeTask(next);
  check(next.title === 'Oct elec bill', '…then "Oct elec bill"');

  // Turning it off keeps the title
  PA.state.openTask = next.id;
  PA.renderDrawer();
  set('rollTitle', false);
  check(next.repeat.keepTitle === true, 'the switch can be turned off');
  const same = PA.completeTask(next);
  check(same.title === 'Oct elec bill', 'with it off, the title stays the same');

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
