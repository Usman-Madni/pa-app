// Morning and evening (27 Nov): a summary of My Day, worded from todayPlan (the My Day page's own code). The morning
// says what's on today (late, timed with their times, any time, events), the evening what's still open today (nothing
// when it's all done). Per device, on by default at 8:00 and 20:00. The laptop shows it while Butler is open: within
// an hour of its time it pops up and goes in Notifications, later only in Notifications, once a day each; a morning
// not shown by the evening is skipped. The Android app (7+) gets the words and the next times as instants with the
// widgets' rows, and its Java only shows them (never dates tasks).
const fs = require('fs');
const path = require('path');
const { loadApp, tick, check, done } = require('./helpers');

(async () => {
  const app = loadApp({ digest: true });
  const { win, doc, PA } = app;
  await tick(50); // started up
  const D = win.eval('Digest');
  const runCheck = D.check.bind(D);
  D.check = () => {}; // the page's own once-a-minute check stays out of the way; the test calls it at set times
  D.run = runCheck;
  const norm = win.eval('normalizeTask');
  const today = PA.toISO(new Date());
  const yesterday = PA.toISO(new Date(Date.now() - 864e5));
  const at = (h, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
  const ALL_DAY = win.eval('ALL_DAY');
  PA.DB.tasks.push(
    norm({ id: 'late', title: 'Renew licence', due: `${yesterday}T${ALL_DAY}` }),
    norm({ id: 'timed', title: 'Dentist', due: `${today}T15:30` }),
    norm({ id: 'any', title: 'Pay electricity', due: `${today}T${ALL_DAY}` }),
    norm({ id: 'later', title: 'Next week thing', due: PA.toISO(new Date(Date.now() + 5 * 864e5)) + `T${ALL_DAY}` }),
  );
  PA.DB.events.push({ id: 'ev', title: 'Lunch with family', date: today, time: '', people: ['me'] });
  win.eval('changed')('tasks', 'events');

  // --- The words ---
  check(JSON.stringify(D.settings()) === JSON.stringify({ on: true, am: '08:00', pm: '20:00' }), 'on by default, 8:00 and 20:00');
  const am = D.text('am', at(8));
  check(/^Today: 2 tasks · 1 event · 1 late$/.test(am.title), `the morning counts My Day's tasks, events and late ones (${am.title})`);
  check(/Renew licence \(late\)/.test(am.body) && /3:30\s?pm Dentist/i.test(am.body) && /Pay electricity/.test(am.body) && /Lunch with family/.test(am.body) && !/Next week/.test(am.body), 'and names them, late marked and times shown, as My Day has them (not next week\'s)');
  const pm = D.text('pm', at(20));
  check(pm.title === 'Still to do today: 3' && /Dentist/.test(pm.body) && !/Lunch/.test(pm.body), 'the evening: what\'s still open today, late ones too (no events)');
  for (const id of ['late', 'timed', 'any']) { const t = PA.DB.tasks.find((x) => x.id === id); t.done = true; t.completedAt = Date.now(); }
  check(D.text('pm', at(20)) === null, 'all done: the evening says nothing');
  check(D.text('am', at(8)).title === 'Today: 1 event', 'a morning with only an event says so');
  for (const id of ['late', 'timed', 'any']) { const t = PA.DB.tasks.find((x) => x.id === id); t.done = false; t.completedAt = null; }

  // --- The laptop, while open ---
  const popped = [];
  win.notify = (title, body) => popped.push(`${title}|${body}`);
  const notices = () => PA.DB.notices.map((n) => n.text);
  D.run(at(7, 59));
  check(!popped.length && !notices().length, 'before its time: nothing');
  D.run(at(8, 5));
  check(popped.length === 1 && /^Today:/.test(popped[0]) && notices().some((x) => /This morning: Today:/.test(x)), 'at its time: it pops up and goes in Notifications');
  D.run(at(8, 10));
  check(popped.length === 1 && notices().length === 1, 'once a day');
  D.run(at(21, 30));
  check(popped.length === 1 && notices().some((x) => /This evening: Still to do today: 3/.test(x)), 'opened well after the evening\'s time: only in Notifications, no pop-up');
  win.localStorage.removeItem('dev_digestShown');
  PA.DB.notices = [];
  D.run(at(20, 10));
  check(notices().length === 1 && /This evening/.test(notices()[0]) && popped.length === 2, 'a morning not shown by the evening is skipped; the evening pops up');
  win.localStorage.removeItem('dev_digestShown');
  PA.DB.notices = [];
  D.set('on', false);
  D.run(at(8, 5));
  check(!notices().length, 'turned off: nothing');
  D.set('on', true);
  D.set('am', '07:15');
  D.set('pm', 'nonsense');
  check(D.settings().am === '07:15' && D.settings().pm === '20:00', 'times can be changed (only real times)');
  D.set('am', '08:00');

  // --- Settings ---
  PA.state.view = 'settings';
  PA.render();
  const amBox = doc.querySelector('[data-input="digest-am"]');
  check(amBox && doc.querySelector('[data-input="digest-pm"]') && doc.querySelector('[data-input="digest-on"]').checked && /Morning and evening/.test(doc.querySelector('#main').textContent), 'Settings has Morning and evening: on, and the two times');
  amBox.value = '06:45';
  amBox.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(D.settings().am === '06:45', 'changing the time there keeps it');
  D.set('am', '08:00');

  // --- For the Android app ---
  const now = at(9);
  const f = D.forApp(now);
  check(f.on && f.day === today && f.am.title.startsWith('Today:') && f.pm.title.startsWith('Still to do'), 'the app gets whether it\'s on, today\'s date and both summaries');
  check(f.times.length === 4 && f.times.every((x, i) => x.at > now.getTime() && (!i || x.at > f.times[i - 1].at)) && f.times[0].which === 'pm' && f.times[0].at === at(20).getTime() && f.times[1].which === 'am', 'and the next times as instants, soonest first (this evening, then tomorrow morning…)');
  const sent = JSON.parse(win.eval('Native').widgetData());
  check(sent.digest && sent.digest.times.length === 4, 'it goes with the widgets\' rows');
  app.close();

  // A phone in the browser: nothing here, and Settings says the app does it
  const phone = loadApp({ fsa: false, digest: true });
  await tick(30);
  phone.win.eval('Digest').check(at(8, 5));
  check(!phone.PA.DB.notices.length, 'a phone in the browser doesn\'t show it');
  phone.PA.state.view = 'settings';
  phone.PA.render();
  check(/the Butler app shows a summary/.test(phone.doc.querySelector('#main').textContent) && !phone.doc.querySelector('[data-input="digest-am"]'), 'and its Settings says the Butler app does');
  phone.close();

  // --- The Android side only shows Butler's words ---
  const dir = path.join(__dirname, '..', 'android-app');
  const java = fs.readFileSync(path.join(dir, 'native', 'Digest.java'), 'utf8').replace(/\/\/.*$/gm, '');
  check(!/\bsort|Comparator|compareTo|Calendar|getTime\(|overdue|isLate|todayPlan/.test(java), 'Digest.java never sorts, compares or dates tasks (only Butler\'s instants and words)');
  check(/optJSONArray\("times"\)/.test(java) && /optJSONObject\(morning \? "am" : "pm"\)/.test(java), 'it uses the times and the words Butler sent');
  check(/android:name="\.Digest"/.test(fs.readFileSync(path.join(dir, 'native', 'manifest-widgets.xml'), 'utf8')), 'its alarms are in the app\'s manifest');
  check(/RECEIVE_BOOT_COMPLETED/.test(fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'android.yml'), 'utf8')), 'and it sets them again after the phone restarts');
  check(/ButlerAndroid\/7"/.test(fs.readFileSync(path.join(dir, 'capacitor.config.json'), 'utf8')), 'the app says it\'s version 7');
  done();
})();
