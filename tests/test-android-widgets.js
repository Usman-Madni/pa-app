// Home-screen widgets (the Android app from shell 5): My Day and One list. Butler sends the rows (ButlerWidgets.update);
// Android only draws them. The My Day widget's rows must be exactly what the My Day page's own code (todayPlan) gives,
// so the two never drift apart (agreed 25 Nov, CLAUDE.md), and the Android side must never sort or date tasks itself.
const fs = require('fs');
const path = require('path');
const { loadApp, tick, check, done, APP_FILE } = require('./helpers');

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/140.0 Mobile Safari/537.36 ButlerAndroid/5';
const p2 = (x) => String(x).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

(async () => {
  const sent = [];
  const plugins = { ButlerWidgets: { update: async ({ data }) => { sent.push(JSON.parse(data)); } } };
  const app = loadApp({ fsa: false, ua: UA, before: (w) => { w.Capacitor = { isNativePlatform: () => true, Plugins: plugins }; } });
  const { win, PA } = app;
  await tick(50);
  const B = PA.DB.buckets;
  B.push({ id: 'shop', name: 'Shopping', order: 1 }, { id: 'home', name: 'Home', order: 0 });
  const add = (title, due, bucket = '') => { const t = PA.addTask({ title, bucket }); t.due = due; return t; };
  const late = add('Pay the late bill', day(-2));
  const timed = add('Dentist', `${day(0)}T23:30`);
  const anyTime = add('Call the bank', day(0));
  const soon = add('Renew the car tax', day(3));
  const far = add('Plan the holiday', day(30));
  const undated = add('Read the manual', '');
  const milk = add('Milk', day(1), 'shop');
  const bread = add('Bread', '', 'shop');
  const eggs = add('Eggs', day(-1), 'shop');
  const doneOne = add('Bought rice', day(0), 'shop');
  doneOne.done = true;
  PA.DB.events.push({ id: 'ev1', title: 'Wedding', date: day(2), time: '' });
  win.eval('changed')('tasks', 'events', 'buckets');
  PA.render();
  await tick(1700);

  const last = () => sent[sent.length - 1];
  check(sent.length >= 1 && last().day === day(0), 'Butler sends the widgets their rows, with today\'s date');

  // --- My Day: exactly what the My Day page's code gives ---
  const rows = last().myDay;
  const heads = rows.filter((r) => r.h).map((r) => r.h);
  check(heads.join(',') === 'Late,Today,Any time today,Coming up', 'My Day has the page\'s sections in its order: Late, Today, Any time today, Coming up');
  const plan = win.eval('todayPlan')(new Date());
  const want = [...plan.late.map((t) => t.id), ...plan.timed.map((x) => (x.t ? x.t.id : '')), ...plan.anyTime.map((x) => (x.t ? x.t.id : '')), ...plan.coming.map((x) => (x.t ? x.t.id : ''))];
  const got = rows.filter((r) => !r.h).map((r) => r.id);
  check(JSON.stringify(got) === JSON.stringify(want), 'its rows are exactly todayPlan\'s, in the same order (one source: no drift)');
  check(got.includes(late.id) && got.includes(timed.id) && got.includes(anyTime.id) && got.includes(soon.id), 'late, timed, any-time and coming-up tasks are there');
  check(!got.includes(far.id) && !got.includes(undated.id), 'not what My Day leaves out (beyond the week; no date)');
  const lateRow = rows.find((r) => r.id === late.id);
  check(lateRow.late === true && rows.find((r) => r.id === timed.id).s === '11:30 pm', 'a late one is marked late; a timed one shows its time');
  check(rows.some((r) => r.t === 'Wedding' && r.id === '' && /\S/.test(r.s)), 'events are there too (pressing one opens My Day)');

  // --- One list: each bucket's open tasks, soonest due first ---
  const shop = last().lists.shop;
  check(shop && shop.name === 'Shopping' && shop.rows.map((r) => r.t).join(',') === 'Eggs,Milk,Bread', 'One list: a bucket\'s open tasks, soonest due first (late first, undated last, done left out)');
  check(shop.rows[0].late === true && shop.rows[1].s && !shop.rows[2].s, 'late marked; each shows when it\'s due');
  check(last().buckets.map((b) => b.name).slice(-2).join(',') === 'Home,Shopping', 'and the buckets to pick from, in board order');

  // --- Sent only when something changed ---
  const count = sent.length;
  PA.render();
  await tick(1700);
  check(sent.length === count, 'nothing sent again when nothing changed');
  milk.title = 'Milk (2 litres)'; // (as the latest from OneDrive coming in: this phone is read-only, so it's redrawn)
  PA.render();
  await tick(1700);
  check(sent.length === count + 1 && last().lists.shop.rows.some((r) => r.t === 'Milk (2 litres)'), 'a change is sent a moment later');

  // --- Pressing a widget row opens the task; the heading opens My Day ---
  const Native = win.eval('Native');
  Native.openLink(`app.butler.home://open?task=${encodeURIComponent(soon.id)}`);
  check(PA.state.openTask === soon.id, 'pressing a task on a widget opens it in Butler');
  win.eval('closeTaskDrawer')();
  win.eval('setView')('notes');
  Native.openLink('app.butler.home://open?view=today');
  check(PA.state.view === 'today', 'pressing My Day\'s heading opens My Day');
  Native.openLink('https://example.com/?task=x');
  check(PA.state.view === 'today', 'any other address is ignored');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();

  // --- An older app (version 4) has no widgets to send to ---
  const old = [];
  const o = loadApp({ fsa: false, ua: UA.replace('ButlerAndroid/5', 'ButlerAndroid/4'), before: (w) => { w.Capacitor = { isNativePlatform: () => true, Plugins: { ButlerWidgets: { update: async () => { old.push(1); } } } }; } });
  await tick(1700);
  check(old.length === 0, 'an older app isn\'t sent widget rows');
  o.close();

  // --- The Android side only draws: no sorting, comparing or date maths of its own ---
  const dir = path.join(path.dirname(APP_FILE), 'android-app', 'native');
  for (const f of ['Widgets.java', 'WidgetService.java', 'MyDayWidget.java', 'ListWidget.java']) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, '');
    check(!/\bsort|Comparator|compareTo|Calendar|getTime\(|overdue|isLate/.test(src), `${f} never sorts, compares or dates tasks (it only draws Butler's rows)`);
  }
  done();
})();
