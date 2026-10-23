// Quick add: what the box understands from plain typing (dates, times, repeats, #labels, @buckets, !priority),
// what it must leave alone, the clicked choices, the preview, "keep words as typed", and all-day due dates.
const { loadApp, submitForm, check, done } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  PA.DB.buckets.push({ id: 'bh', name: 'Home', order: 1 });
  const NOW = new Date(2026, 9, 23, 14, 0); // Friday 23 Oct 2026, 2 pm
  const p = (text) => win.eval('parseQuickAdd')(text, NOW);
  const is = (text, title, date, time = '') => {
    const r = p(text);
    check(r.title === title && r.date === date && r.time === time, `"${text}" → "${title}" ${date} ${time}`.trim() + (r.title === title && r.date === date && r.time === time ? '' : `  (got "${r.title}" ${r.date} ${r.time})`));
    return r;
  };

  // Dates and times
  is('Pay utilities bill by Friday 6pm', 'Pay utilities bill', '2026-10-30', '18:00');
  is('Call bank tomorrow 10am', 'Call bank', '2026-10-24', '10:00');
  is('Dentist on 5 Nov at 4:30pm', 'Dentist', '2026-11-05', '16:30');
  is('Renew passport Jan 15', 'Renew passport', '2027-01-15');
  is('Renew licence 15th March 2027', 'Renew licence', '2027-03-15');
  is('Movie Saturday', 'Movie', '2026-10-24');
  is('Report due 28/10', 'Report', '2026-10-28');
  is('Submit form 1/11/2026', 'Submit form', '2026-11-01');
  is('Read the book in 2 weeks', 'Read the book', '2026-11-06');
  is('Plan holidays next week', 'Plan holidays', '2026-10-26');
  is('Party tonight', 'Party', '2026-10-23', '20:00');
  is('Lunch with Ali at noon', 'Lunch with Ali', '2026-10-24', '12:00'); // noon already gone today → tomorrow
  is('Call mum 5pm', 'Call mum', '2026-10-23', '17:00');
  is('Call mum 9am', 'Call mum', '2026-10-24', '09:00');
  is('Pay bill 18:30', 'Pay bill', '2026-10-23', '18:30');

  // Things that must stay as text
  is('Buy 1/2 kg rice', 'Buy 1/2 kg rice', '');
  is('Read 2 chapters', 'Read 2 chapters', '');
  is('Email @nosuchbucket team', 'Email @nosuchbucket team', '');
  is('tomorrow', 'tomorrow', '2026-10-24'); // nothing left for a title → keep the words

  // Repeats
  let r = is('Team sync every Monday 9am', 'Team sync', '2026-10-26', '09:00');
  check(r.repeat && r.repeat.freq === 'weekly' && r.repeat.days[0] === 1, '"every Monday" repeats weekly on Monday');
  r = is('Gym every other day', 'Gym', '2026-10-23');
  check(r.repeat.freq === 'daily' && r.repeat.interval === 2, '"every other day" = every 2 days');
  r = is('Water plants every 3 days', 'Water plants', '2026-10-23');
  check(r.repeat.freq === 'daily' && r.repeat.interval === 3, '"every 3 days"');
  r = is('Pay rent monthly', 'Pay rent', '2026-10-23');
  check(r.repeat.freq === 'monthly', '"monthly"');
  r = is('Stand-up weekdays 10am', 'Stand-up', '2026-10-26', '10:00'); // 10am Friday has gone → Monday
  check(r.repeat.freq === 'weekdays', '"weekdays"');
  is('Take medicine every day 9pm', 'Take medicine', '2026-10-23', '21:00'); // still to come today
  is('Take vitamins every day 8am', 'Take vitamins', '2026-10-24', '08:00'); // gone today → tomorrow

  // Labels, bucket, priority
  r = p('Fix tap #home-repairs !high @home');
  check(r.title === 'Fix tap' && r.labels[0] === 'home-repairs' && r.priority === 'high' && r.bucket === 'bh', '#label, !high and @bucket are picked out');
  check(p('Pay #bills #urgent').labels.join(',') === 'bills,urgent', 'several #labels');
  check(p('Book flights !low').priority === 'low' && p('Book flights !').priority === 'high', '!low and a bare ! (high)');

  // --- In the app ---
  doc.querySelector('[data-view="tasks"]').click();
  const bar = () => doc.querySelector('#main form.quick-add');
  check(bar() && bar().querySelector('.qa-input'), 'Tasks has the add box');

  // Live preview
  bar().elements.title.value = 'Pay utilities bill Friday 6pm every month #bills';
  bar().elements.title.dispatchEvent(new win.Event('input', { bubbles: true }));
  const prev = bar().querySelector('.qa-preview').textContent;
  check(prev.includes('Pay utilities bill') && prev.includes('6:00') && prev.includes('Monthly') && prev.includes('bills (new)'), 'preview shows what was understood');

  bar().dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  let t = PA.DB.tasks.find((x) => x.title === 'Pay utilities bill');
  check(t && t.due.endsWith('T18:00') && new Date(t.due).getDay() === 5, 'added with the due date and time');
  check(t.repeat && t.repeat.freq === 'monthly' && t.repeat.anchorDay === new Date(t.due).getDate(), 'repeat set up, anchored to the due date');
  check(t.remind === 0, 'a task with a time gets a reminder at that time');
  const bills = PA.DB.labels.find((l) => l.name === 'bills');
  check(bills && t.labels.includes(bills.id), 'a new #label is created and added');
  check(win.document.activeElement === bar().elements.title && bar().elements.title.value === '', 'box clears and is ready for the next task');

  // Keep words as typed
  bar().elements.title.value = 'Meeting notes for Friday';
  bar().elements.title.dispatchEvent(new win.Event('input', { bubbles: true }));
  bar().querySelector('[data-action="qa-raw"]').click();
  bar().dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  t = PA.DB.tasks.find((x) => x.title === 'Meeting notes for Friday');
  check(t && t.due === '', '"Keep words as typed" adds the text exactly, no date');

  // Clicked choices win over typed ones
  submitForm(win, 'quick-add', { title: 'Call plumber tomorrow', dueDate: '2030-05-01', remind: '60', repeat: 'weekly', bucket: 'bh' });
  t = PA.DB.tasks.find((x) => x.title === 'Call plumber');
  check(t && t.due === '2030-05-01T23:59' && t.remind === 60 && t.repeat.freq === 'weekly' && t.bucket === 'bh', 'picked due date, reminder, repeat and bucket are used');

  // All-day due dates show no time and aren't overdue until the day ends
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${NOW.getFullYear()}-${pad(NOW.getMonth() + 1)}-${pad(NOW.getDate())}`;
  const realToday = PA.toISO(new Date());
  submitForm(win, 'quick-add', { title: 'Buy milk today' });
  t = PA.DB.tasks.find((x) => x.title === 'Buy milk');
  check(t.due === `${realToday}T23:59` && t.remind === -1, 'a date without a time is "any time that day", no reminder');
  check(!doc.querySelector('#main').textContent.includes('11:59'), 'no "11:59 pm" shown for all-day tasks');
  check(!PA.DB.tasks.filter((x) => x.title === 'Buy milk').some((x) => doc.querySelector('#main').textContent.includes('Overdue · Today')), 'an all-day task due today is not overdue');
  void today;

  // Tab context: Planned gives a due date, My Day puts it in My Day
  doc.querySelector('[data-filter="planned"]').click();
  submitForm(win, 'quick-add', { title: 'Sort the garage' });
  t = PA.DB.tasks.find((x) => x.title === 'Sort the garage');
  check(t.due === `${realToday}T23:59`, 'added in Planned → due today');
  doc.querySelector('[data-filter="myday"]').click();
  submitForm(win, 'quick-add', { title: 'Reply to emails' });
  check(PA.DB.tasks.find((x) => x.title === 'Reply to emails').myDay === realToday, 'added in My Day → in My Day');
  app.close();

  // Phone can't add
  const ro = loadApp({ fsa: false });
  ro.doc.querySelector('[data-view="tasks"]').click();
  const f = ro.doc.querySelector('form.quick-add');
  f.elements.title.value = 'Sneaky';
  f.dispatchEvent(new ro.win.Event('submit', { bubbles: true, cancelable: true }));
  check(ro.PA.DB.tasks.length === 0 && !ro.doc.querySelector('[data-action="board-add"]'), 'phone cannot add tasks, and the board has no add buttons');
  ro.close();
  done();
})();
