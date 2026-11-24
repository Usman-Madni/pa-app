// The Android app rings reminders itself (round 2): a per-phone switch, "Ring reminders from: To Do / Butler app".
// On Butler app, each reminder still to come on a task you're on is handed to Android (LocalNotifications), re-planned
// when something changes, and pressing one opens its task. On To Do (the default) Android is given none. Outside the
// app there's no switch at all.
const { loadApp, tick, check, done } = require('./helpers');

const fakeAndroid = () => {
  const n = { pending: [], scheduled: [], asked: 0, listeners: {}, channels: [] };
  n.plugin = {
    createChannel: async (c) => { n.channels.push(c); },
    deleteChannel: async ({ id }) => { n.deleted = [...(n.deleted || []), id]; n.channels = n.channels.filter((c) => c.id !== id); },
    getPending: async () => ({ notifications: n.pending.map((x) => ({ id: x.id })) }),
    cancel: async ({ notifications }) => { n.pending = n.pending.filter((p) => !notifications.some((c) => c.id === p.id)); },
    schedule: async ({ notifications }) => {
      if (notifications.some((x) => x.channelId && !n.channels.some((c) => c.id === x.channelId))) throw new Error('no such channel');
      n.scheduled.push(notifications); n.pending.push(...notifications);
    },
    requestPermissions: async () => { n.asked++; return { display: 'granted' }; },
    checkPermissions: async () => ({ display: 'granted' }),
    addListener: (ev, fn) => { n.listeners[ev] = fn; },
  };
  return n;
};
const local = (ms) => { const d = new Date(ms); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

(async () => {
  const n = fakeAndroid();
  const app = loadApp({ fsa: false, before: (w) => { w.Capacitor = { isNativePlatform: () => true, Plugins: { LocalNotifications: n.plugin } }; } });
  const { win, doc } = app;
  const PA = win.PA;
  await tick(50);
  const Native = win.eval('Native');

  const soon = Math.ceil((Date.now() + 2 * 3600000) / 60000) * 60000; // two hours from now, on the minute
  const later = soon + 86400000;
  const t = PA.addTask({ title: 'Pay the bill' });
  PA.Reminders.add(t, { kind: 'at', at: local(later) });
  PA.Reminders.add(t, { kind: 'at', at: local(soon) });
  PA.Reminders.add(t, { kind: 'at', at: local(Date.now() - 3600000) }); // gone by
  t.reminders[2].fired = true;
  const gone = PA.addTask({ title: 'Already done' });
  PA.Reminders.add(gone, { kind: 'at', at: local(soon) });
  gone.done = true;
  PA.render();

  // --- To Do rings them (the default): Android is given none ---
  check(Native.ring() === 'todo', 'the switch starts on To Do');
  await tick(1700);
  check(n.scheduled.length === 0, 'while To Do rings them, Android is given no reminders');
  win.eval('setView')('settings');
  const pick = doc.querySelector('[data-input="ring"]');
  check(pick && pick.value === 'todo' && /Ring reminders from/.test(doc.querySelector('#main').textContent), 'Settings has "Ring reminders from", set to To Do');

  // --- Switched to Butler app ---
  pick.value = 'app';
  pick.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick(50);
  check(n.asked === 1, 'switching to Butler asks Android to allow notifications');
  check(win.localStorage.getItem('dev_ring') === '"app"', 'the choice is kept on this phone only (dev_ring)');
  const first = n.scheduled[n.scheduled.length - 1] || [];
  check(first.length === 2 && first[0].schedule.at.getTime() === soon && first[1].schedule.at.getTime() === later, 'Android gets the task\'s two coming reminders, soonest first (not the one gone off, not a done task\'s)');
  check(first[0].title === 'Pay the bill' && /^Due|^Reminder$/.test(first[0].body) && first[0].extra.task === t.id && first[0].schedule.allowWhileIdle, 'each with the task\'s title, when it\'s due, and which task it is');
  const ch = n.channels.find((c) => c.id === first[0].channelId);
  check(ch && ch.importance === 5 && first.every((x) => x.channelId === ch.id) && n.channels.length === 1, 'they ring on a channel of their own with sound and a pop-up (importance 5), made once');
  check(!ch.sound && !first[0].sound && !(n.deleted || []).length, 'the first app (no chime inside it) isn\'t asked for one, and keeps its channel');
  check(first.every((x) => Number.isInteger(x.id) && x.id > 0 && x.id <= 2147483647) && first[0].id !== first[1].id, 'each with its own whole-number id Android accepts');
  check(/Next: Pay the bill/.test(doc.querySelector('#main').textContent), 'Settings names the next one');

  // --- Something changes: re-planned, replacing what Android had ---
  const calls = n.scheduled.length;
  win.eval('TaskEdit').rename(t, 'Pay the electricity bill');
  win.eval('changed')('tasks');
  PA.render();
  await tick(1700);
  check(n.scheduled.length === calls + 1 && n.pending.length === 2 && n.pending.every((x) => x.title === 'Pay the electricity bill'), 'a change is re-planned a moment later, replacing the old ones (never doubled)');
  PA.render();
  await tick(1700);
  check(n.scheduled.length === calls + 1, 'and nothing is re-planned when nothing changed');

  // A change with no redraw (the task panel), then Butler put away at once: Android has the new time before it pauses.
  const r0 = t.reminders.find((r) => !r.fired && new Date(r.at).getTime() === soon);
  PA.Reminders.replace(t, r0.id, { kind: 'at', at: local(soon + 3600000) });
  win.eval('changed')('tasks');
  Object.defineProperty(doc, 'hidden', { configurable: true, get: () => true });
  doc.dispatchEvent(new win.Event('visibilitychange'));
  await tick(30);
  check(n.pending.some((x) => x.schedule.at.getTime() === soon + 3600000) && !n.pending.some((x) => x.schedule.at.getTime() === soon), 'a changed time reaches Android even when Butler is put away straight after (no redraw, no waiting)');
  check(n.pending.length === 2 && n.channels.length === 1, 'still two, still one channel');
  Object.defineProperty(doc, 'hidden', { configurable: true, get: () => false });

  // --- Pressing one opens its task ---
  n.listeners.localNotificationActionPerformed({ actionId: 'tap', notification: { id: first[0].id, extra: { task: t.id } } });
  await tick(20);
  check(PA.state.openTask === t.id, 'pressing a reminder opens its task');
  win.eval('closeTaskDrawer')();

  // --- Back to To Do: Android's are taken away ---
  win.eval('setView')('settings');
  const pick2 = doc.querySelector('[data-input="ring"]');
  pick2.value = 'todo';
  pick2.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick(50);
  check(n.pending.length === 0, 'switching back to To Do takes Butler\'s reminders off Android');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();

  // --- The app from shell 2 carries its own chime: a channel of its own with that sound, the old silent one removed ---
  const n2 = fakeAndroid();
  const app2 = loadApp({ fsa: false, ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile ButlerAndroid/2', before: (w) => { w.Capacitor = { isNativePlatform: () => true, Plugins: { LocalNotifications: n2.plugin } }; w.localStorage.setItem('dev_ring', '"app"'); } });
  await tick(50);
  const t2 = app2.win.PA.addTask({ title: 'Ring with sound' });
  app2.win.PA.Reminders.add(t2, { kind: 'at', at: local(soon) });
  app2.win.eval('changed')('tasks');
  await tick(1700);
  const sent = n2.scheduled[n2.scheduled.length - 1] || [];
  const ch2 = n2.channels.find((c) => c.id === (sent[0] || {}).channelId);
  check(app2.win.eval('Native').shell === 2 && ch2 && ch2.id !== 'butler-reminders' && ch2.sound === 'butler_ring.wav' && ch2.importance === 5, 'the new app rings on a channel with Butler\'s own chime set on it');
  check(sent.length && sent.every((x) => x.sound === 'butler_ring.wav'), 'each reminder names the chime too');
  check((n2.deleted || []).includes('butler-reminders'), 'and the old silent channel is removed');
  check(app2.errors.length === 0, 'no script errors (shell 2)' + (app2.errors[0] ? ': ' + app2.errors[0] : ''));
  app2.close();

  // --- Not in the app: no switch, desktop notifications as before ---
  const web = loadApp({ fsa: false });
  await tick(50);
  web.win.eval('setView')('settings');
  check(!web.doc.querySelector('[data-input="ring"]') && /Reminders here/.test(web.doc.querySelector('#main').textContent), 'outside the app there\'s no switch; Settings shows "Reminders here" as before');
  check(web.win.eval('Native').ring() === 'todo', 'and nothing rings from Butler there');
  check(web.errors.length === 0, 'no script errors in a browser' + (web.errors[0] ? ': ' + web.errors[0] : ''));
  web.close();
  done();
})();
