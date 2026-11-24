// The Android app's background check (android-app/www/runners/check.js), run on its own with fake Android pieces
// (CapacitorKV, fetch, CapacitorNotifications), and the ring list it reads: written into the data file by every save.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadApp, fakeFile, submitForm, tick, check, done, APP_FILE } = require('./helpers');

const SRC = fs.readFileSync(path.join(path.dirname(APP_FILE), 'android-app', 'www', 'runners', 'check.js'), 'utf8');

// A fresh runner: its storage, the network, and what it hands Android.
function runner({ file, renew = true } = {}) {
  const r = { kv: {}, shown: [], calls: [], handlers: {} };
  const ctx = {
    CapacitorKV: {
      get: (k) => (k in r.kv ? { value: r.kv[k] } : null),
      set: (k, v) => { r.kv[k] = v; },
      remove: (k) => { delete r.kv[k]; },
    },
    CapacitorNotifications: { schedule: (list) => { if (!Array.isArray(list)) throw new Error('options must be an array'); r.shown.push(...list); } },
    fetch: async (url, opts = {}) => {
      r.calls.push({ url, opts });
      if (url.startsWith('https://login.microsoftonline.com/')) {
        if (!renew) return { status: 400, json: async () => ({ error: 'invalid_grant' }) };
        return { status: 200, json: async () => ({ access_token: 'acc-new', expires_in: 3600, refresh_token: 'ref-new' }) };
      }
      if (url.includes('/approot:/Data/pa-app-data.json')) return { status: 200, json: async () => ({ id: 'f1', '@microsoft.graph.downloadUrl': 'https://download.example/f1' }) };
      if (url === 'https://download.example/f1') return { status: 200, text: async () => JSON.stringify(r.file) };
      return { status: 404, json: async () => ({}) };
    },
    addEventListener: (ev, fn) => { r.handlers[ev] = fn; },
    Date, JSON, Math, encodeURIComponent, Array, Object, String, Promise,
  };
  r.file = file;
  vm.runInNewContext(SRC, ctx);
  r.run = (ev, args) => new Promise((resolve, reject) => r.handlers[ev](resolve, reject, args));
  return r;
}

(async () => {
  const now = Date.now();
  const min = 60000;
  const ring = [
    { key: 't1:r1', at: now + 5 * min, title: 'Pay the bill', body: 'Due today', task: 't1' },
    { key: 't2:r1', at: now + 12 * min, title: 'Call home', body: 'Reminder', task: 't2' },
    { key: 't3:r1', at: now + 90 * min, title: 'Later on', body: 'Reminder', task: 't3' }, // beyond the window
    { key: 't4:r1', at: now - 5 * min, title: 'Gone by', body: 'Reminder', task: 't4' },
  ];
  const auth = { access: 'acc', exp: now + 30 * min, refresh: 'ref', got: now - min };

  // --- Butler tells it the sign-in and its choice; it answers what it knows ---
  const r = runner({ file: { app: 'PA App', data: {}, ring } });
  let ans = await r.run('sync', { auth, ring: 'app', channel: 'butler-ring', given: { 't2:r1': now + 12 * min } });
  check(ans.auth.refresh === 'ref' && JSON.parse(r.kv.ring) === 'app' && JSON.parse(r.kv.channel) === 'butler-ring', '"sync" keeps the sign-in, this phone\'s choice and the channel');

  // --- A check: hands Android what's due within the window, and not what Butler already gave ---
  await r.run('check');
  check(r.shown.length === 1 && r.shown[0].title === 'Pay the bill' && r.shown[0].channelId === 'butler-ring' && r.shown[0].scheduleAt.getTime() === now + 5 * min, 'a check hands Android the reminder due in the next 20 minutes (not one Butler gave, not later ones, not past ones)');
  check(r.shown[0].extra.task === 't1' && r.shown[0].smallIcon === 'ic_stat_butler', 'with its task and Butler\'s bell');
  check(r.calls.some((c) => c.url === 'https://download.example/f1' && !(c.opts.headers || {}).Authorization), 'the file is read through its download link (no redirect to follow, no sign-in sent there)');
  const app = loadApp({ fsa: false });
  check(r.shown[0].id === app.win.eval('Native').numId('t1:r1'), 'with the same number Butler gives that reminder');
  app.close();

  await r.run('check');
  check(r.shown.length === 1, 'the next check doesn\'t give it again');
  ans = await r.run('sync', { auth, ring: 'app', given: {} });
  check(ans.gave['t1:r1'] === now + 5 * min, 'and it tells Butler what it gave, so Butler leaves that one alone');

  // --- The time moved on the laptop: the new time is given (the old one can't be taken back) ---
  r.file = { ...r.file, ring: [{ ...ring[0], at: now + 8 * min }] };
  await r.run('check');
  check(r.shown.length === 2 && r.shown[1].scheduleAt.getTime() === now + 8 * min, 'a reminder moved to a new time is given again at that time');

  // --- The sign-in's access has run out: renewed, and the renewed one kept for Butler ---
  const r2 = runner({ file: { ring } });
  await r2.run('sync', { auth: { ...auth, exp: now - min }, ring: 'app' });
  await r2.run('check');
  const kept = JSON.parse(r2.kv.auth);
  const tokenCall = r2.calls.find((c) => c.url.startsWith('https://login.microsoftonline.com/'));
  check(tokenCall && /grant_type=refresh_token/.test(tokenCall.opts.body) && /refresh_token=ref(&|$)/.test(tokenCall.opts.body) && kept.refresh === 'ref-new' && kept.got >= now, 'a run-out sign-in is renewed, and the renewed one kept (newer, so Butler takes it)');
  check(r2.shown.length === 2, 'and the check goes on');

  // --- Nothing to do: To Do rings, signed out, or the sign-in can't be renewed ---
  const r3 = runner({ file: { ring } });
  await r3.run('sync', { auth, ring: 'todo' });
  await r3.run('check');
  check(r3.shown.length === 0 && r3.calls.length === 0, 'when To Do rings them, a check does nothing (not even a network call)');
  await r3.run('sync', { auth: null, ring: 'app' });
  await r3.run('check');
  check(r3.shown.length === 0 && !r3.kv.auth, 'signed out in Butler: it forgets the sign-in and does nothing');
  const r4 = runner({ file: { ring }, renew: false });
  await r4.run('sync', { auth: { ...auth, exp: 0 }, ring: 'app' });
  await r4.run('check');
  check(r4.shown.length === 0, 'a sign-in that can\'t be renewed: nothing (Butler asks to sign in when it opens)');
  // An older sign-in from Butler doesn't replace a newer one it renewed itself.
  ans = await r2.run('sync', { auth: { ...auth, refresh: 'stale', got: 1 }, ring: 'app' });
  check(ans.auth.refresh === 'ref-new', 'an older sign-in from Butler doesn\'t replace the newer one it renewed');

  // --- The ring list: every save writes the coming reminders beside the data ---
  const file = fakeFile();
  const lap = loadApp({ pickFile: file });
  await lap.PA.DF.createNew();
  const p = (x) => String(x).padStart(2, '0');
  const at = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const T = lap.PA.addTask({ title: 'Renew the car tax' });
  lap.PA.Reminders.add(T, { kind: 'at', at: at(now + 2 * 3600000) });
  lap.PA.Reminders.add(T, { kind: 'at', at: at(now + 40 * 86400000) }); // beyond 14 days
  lap.PA.Reminders.add(T, { kind: 'at', at: at(now + 3 * 3600000) });
  T.reminders[2].fired = true;
  const D = lap.PA.addTask({ title: 'Done already' });
  lap.PA.Reminders.add(D, { kind: 'at', at: at(now + 2 * 3600000) });
  D.done = true;
  lap.win.eval('changed')('tasks');
  await lap.PA.DF.save();
  const saved = file.json();
  check(Array.isArray(saved.ring) && saved.ring.length === 1 && saved.ring[0].key === `${T.id}:${T.reminders[0].id}` && saved.ring[0].title === 'Renew the car tax' && saved.ring[0].task === T.id, 'every save writes the ring list: the coming reminders (not gone off, not a done task\'s, the next 14 days)');
  check(saved.data && !('ring' in saved.data), 'beside the data, not in it');
  submitForm(lap.win, 'quick-add', { title: 'Another' });
  await lap.PA.DF.save();
  check(file.json().ring.length === 1, 'and again on the next save');
  lap.close();
  await tick(10);
  done();
})();
