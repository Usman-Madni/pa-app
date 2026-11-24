// The Android app from shell 3 (round 3): Microsoft's sign-in opens in a Chrome sheet (Browser) and comes back to
// app.butler.home://auth (App's appUrlOpen); an app sign-in, so its tokens go through Android's networking
// (CapacitorHttp), never a web request. And the link to the background check (BackgroundRunner 'sync'): the sign-in and
// this phone's choice go to it, a sign-in it renewed comes back, and reminders it gave Android are left to it.
const { loadApp, tick, check, done } = require('./helpers');

const UA = 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile ButlerAndroid/3';
const fakeApp = () => {
  const a = { opened: [], closed: 0, posts: [], listeners: {}, dispatched: [], runnerAnswer: null, webTokenCalls: 0 };
  a.plugins = {
    Browser: { open: async ({ url }) => { a.opened.push(url); }, close: async () => { a.closed++; } },
    App: { addListener: (ev, fn) => { a.listeners[ev] = fn; }, getLaunchUrl: async () => ({}) },
    CapacitorHttp: {
      request: async (o) => {
        a.posts.push(o);
        return { status: 200, data: { access_token: `acc${a.posts.length}`, expires_in: 3600, refresh_token: `ref${a.posts.length}`, scope: 'Files.ReadWrite.AppFolder Tasks.ReadWrite' } };
      },
    },
    BackgroundRunner: { dispatchEvent: async (o) => { a.dispatched.push(JSON.parse(JSON.stringify(o))); return a.runnerAnswer; } },
    LocalNotifications: {
      createChannel: async () => {}, deleteChannel: async () => {}, getPending: async () => ({ notifications: a.pending || [] }),
      cancel: async () => { a.pending = []; }, schedule: async ({ notifications }) => { a.pending = notifications; a.scheduled = notifications; },
      requestPermissions: async () => ({ display: 'granted' }), checkPermissions: async () => ({ display: 'granted' }), addListener: () => {},
    },
  };
  a.fetch = async (url) => {
    if (String(url).startsWith('https://login.microsoftonline.com/')) a.webTokenCalls++;
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return a;
};
const local = (ms) => { const d = new Date(ms); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

(async () => {
  const a = fakeApp();
  const app = loadApp({ fsa: false, ua: UA, fetch: a.fetch, before: (w) => { w.Capacitor = { isNativePlatform: () => true, Plugins: a.plugins }; } });
  const { win, doc } = app;
  await tick(50);
  const Native = win.eval('Native');
  check(Native.shell === 3, 'Butler knows it is in the app\'s version 3');
  let wentInWindow = 0;
  Native.go = () => { wentInWindow++; };
  win.open = () => { wentInWindow++; return null; };

  // --- Sign in: a Chrome sheet, back to app.butler.home://auth ---
  doc.querySelector('#banner [data-action="od-connect"]').click();
  await tick(50);
  const q = new URL(a.opened[0] || 'http://x/').searchParams;
  check(a.opened.length === 1 && wentInWindow === 0 && q.get('redirect_uri') === 'app.butler.home://auth', 'Sign in opens Microsoft in a Chrome sheet (not the app\'s window, not a pop-up), coming back to app.butler.home://auth');
  await a.listeners.appUrlOpen({ url: `app.butler.home://auth?code=c9&state=${q.get('state')}` });
  await tick(50);
  const swap = a.posts[0] || {};
  check(swap.data && swap.data.grant_type === 'authorization_code' && swap.data.code === 'c9' && swap.data.redirect_uri === 'app.butler.home://auth' && swap.data.code_verifier && swap.method === 'POST', 'coming back, the code is swapped for tokens through Android\'s networking, with the one-off check');
  check(a.webTokenCalls === 0, 'never through a web request (Microsoft refuses an app sign-in\'s tokens to one)');
  const auth = JSON.parse(win.localStorage.getItem('dev_odAuth') || 'null');
  check(auth && auth.native === true && auth.refresh === 'ref1' && auth.got > 0, 'the sign-in is kept, marked as an app sign-in, with when it was got');
  check(a.closed >= 1, 'and the sheet is closed');

  // --- Renewing it: also through Android's networking ---
  win.localStorage.setItem('dev_odAuth', JSON.stringify({ ...auth, exp: 0 }));
  await win.eval('OD').accessToken();
  const renew = a.posts[a.posts.length - 1];
  check(renew.data.grant_type === 'refresh_token' && renew.data.refresh_token === 'ref1' && a.webTokenCalls === 0, 'renewing an app sign-in goes through Android\'s networking too');

  // --- An answer that doesn't match: refused ---
  doc.querySelector('#banner [data-action="od-connect"]')?.click();
  win.eval('OD').signIn();
  await tick(50);
  const before = a.posts.length;
  await a.listeners.appUrlOpen({ url: 'app.butler.home://auth?code=c10&state=someone-else' });
  await tick(30);
  check(a.posts.length === before && /didn't match/.test(win.eval('OD').error), 'an answer with the wrong check is refused');
  await a.listeners.appUrlOpen({ url: 'https://example.com/?code=x' });
  check(a.posts.length === before, 'and an address that isn\'t Butler\'s sign-in is ignored');

  // --- The background check: told the sign-in and this phone's choice ---
  const sent = a.dispatched.filter((d) => d.event === 'sync');
  const last = sent[sent.length - 1];
  check(last && last.label === 'app.butler.home.check' && last.details.auth && last.details.auth.refresh && last.details.ring === 'todo', 'the background check is told the sign-in and that To Do rings (the default)');

  // It renewed the sign-in meanwhile: the newer one is taken.
  const mine = JSON.parse(win.localStorage.getItem('dev_odAuth'));
  a.runnerAnswer = { auth: { ...mine, access: 'fromRunner', refresh: 'refRunner', got: mine.got + 1000 }, gave: {} };
  await Native.runnerSync();
  check(JSON.parse(win.localStorage.getItem('dev_odAuth')).refresh === 'refRunner', 'a sign-in the background check renewed (newer) replaces Butler\'s');
  a.runnerAnswer = { auth: { ...mine, refresh: 'older', got: 1 }, gave: {} };
  await Native.runnerSync();
  check(JSON.parse(win.localStorage.getItem('dev_odAuth')).refresh === 'refRunner', 'an older one doesn\'t');

  // --- Butler rings: the reminders the background check gave are left to it ---
  const soon = Math.ceil((Date.now() + 3 * 3600000) / 60000) * 60000;
  const t = win.PA.addTask({ title: 'Call the plumber' });
  win.PA.Reminders.add(t, { kind: 'at', at: local(soon) });
  win.PA.Reminders.add(t, { kind: 'at', at: local(soon + 3600000) });
  a.runnerAnswer = { auth: null, gave: { [`${t.id}:${t.reminders[0].id}`]: soon } };
  win.localStorage.setItem('dev_ring', '"app"');
  await Native.setRing('app');
  await tick(1700);
  check(a.scheduled && a.scheduled.length === 1 && a.scheduled[0].schedule.at.getTime() === soon + 3600000, 'a reminder the background check already gave Android isn\'t given again (no double ring)');
  const told = a.dispatched.filter((d) => d.event === 'sync').pop();
  check(told.details.ring === 'app' && told.details.given[`${t.id}:${t.reminders[1].id}`] === soon + 3600000 && told.details.channel === 'butler-ring', 'and the background check is told Butler rings, what Butler gave Android, and the channel');

  // --- Signing out: the background check signs out too ---
  win.eval('OD').disconnect();
  await tick(20);
  check(a.dispatched.filter((d) => d.event === 'sync').pop().details.auth === null, 'signing out tells the background check to forget the sign-in');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();

  // --- The first apps (no version, or 2): sign-in in the same window, as before ---
  const old = fakeApp();
  const o = loadApp({ fsa: false, ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile ButlerAndroid/2', before: (w) => { w.Capacitor = { isNativePlatform: () => true, Plugins: old.plugins }; } });
  await tick(50);
  let went = '';
  o.win.eval('Native').go = (url) => { went = url; };
  o.doc.querySelector('#banner [data-action="od-connect"]').click();
  await tick(50);
  check(went.includes('redirect_uri=http') && old.opened.length === 0 && old.dispatched.length === 0, 'an older app still signs in in its own window, and has no background check to talk to');
  o.close();
  done();
})();
