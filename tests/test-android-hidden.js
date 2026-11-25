// The widgets' hidden refresh (the Android app from shell 6): Android opens Butler with no screen
// (?readonly&widgets, window.ButlerHidden as its link back). Butler reads the latest from OneDrive, hands over the
// widgets' rows, worked out by the same code as the app (Native.widgetData: todayPlan, so no drift), and says done.
// It changes nothing the app keeps, saves nothing, and renews the sign-in through Android's networking.
const { loadApp, tick, check, done } = require('./helpers');

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/140.0 Mobile Safari/537.36 ButlerAndroid/6 ButlerHidden';
const p2 = (x) => String(x).padStart(2, '0');
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; })();

function fakeOneDrive(content) {
  const g = { calls: [] };
  const reply = (status, j) => ({ ok: status < 300, status, json: async () => JSON.parse(JSON.stringify(j)) });
  g.fetch = async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    g.calls.push(`${method} ${url}`);
    if (url.startsWith('https://login.microsoftonline.com/')) return reply(400, { error: 'invalid_request', error_description: 'web requests are refused for this sign-in' });
    const path = url.replace('https://graph.microsoft.com/v1.0', '').split('?')[0];
    if (path === '/me/drive/special/approot') return reply(200, { id: 'root', name: 'PA App' });
    if (path === '/me/drive/special/approot/children') return reply(200, { value: [{ id: 'F1', name: 'pa-app-data.json', eTag: '"v1"', file: {} }] });
    if (path === '/me/drive/items/F1/content' && method === 'GET') return reply(200, content);
    return reply(404, { error: { message: 'not here' } });
  };
  return g;
}
const file = {
  app: 'PA App', version: 2, saveToken: 't0', savedAt: new Date().toISOString(), savedFrom: 'Laptop',
  data: { tasks: [{ id: 'new1', title: 'Added on the laptop', due: today, priority: 'low', done: false, updated: 5 }], notes: [], events: [] },
};
const stale = JSON.stringify({ tasks: [{ id: 'old1', title: 'An old copy', due: today, priority: 'low', done: false, updated: 1 }], notes: [], events: [] });
const bridge = (w, log) => {
  w.ButlerHidden = {
    update: (json) => log.sent.push(JSON.parse(json)),
    done: () => { log.done++; },
    post: (id, url, form) => { log.posts.push({ url, form }); setTimeout(() => w.Hidden.posted(id, 200, JSON.stringify({ access_token: 'fresh', expires_in: 3600, refresh_token: 'r2', scope: 'Files.ReadWrite.AppFolder' })), 5); },
  };
};

(async () => {
  // --- Signed in: the latest is read and its rows handed over ---
  const log = { sent: [], done: 0, posts: [] };
  const g = fakeOneDrive(file);
  const storage = { dev_odAuth: JSON.stringify({ access: 'od', exp: Date.now() + 3600e3, refresh: 'odr', native: true, got: 1 }), dev_roData: stale, dev_view: '"notes"' };
  const app = loadApp({ fsa: false, ua: UA, fetch: g.fetch, storage, query: '?readonly&widgets', before: (w) => bridge(w, log) });
  const { win, PA } = app;
  const before = JSON.stringify({ ...win.localStorage });
  await tick(300);
  check(log.done === 1, 'it says done (Android then closes it)');
  check(log.sent.length === 1 && log.sent[0].day === today, 'the widgets\' rows are handed over once, with today\'s date');
  const ids = log.sent[0].myDay.filter((r) => !r.h).map((r) => r.id);
  check(ids.includes('new1') && !ids.includes('old1'), 'they\'re from the latest on OneDrive, not the copy the phone had');
  const plan = win.eval('todayPlan')(new Date());
  check(JSON.stringify(ids) === JSON.stringify([...plan.late.map((t) => t.id), ...[...plan.timed, ...plan.anyTime, ...plan.coming].map((x) => (x.t ? x.t.id : ''))]), 'worked out by the app\'s own My Day code (todayPlan): no drift');
  check(PA.state.readOnly && !g.calls.some((c) => /^(PUT|POST|PATCH|DELETE) https:\/\/graph/.test(c)), 'read-only: nothing is saved to OneDrive');
  check(JSON.stringify({ ...win.localStorage }) === before, 'nothing the app keeps on the phone is changed (its copy, its page, its settings)');
  check(!g.calls.some((c) => c.includes('todo')), 'To Do isn\'t touched');
  app.close();

  // --- A sign-in to renew: through Android's networking (the bridge), and kept for the app ---
  const log2 = { sent: [], done: 0, posts: [] };
  const g2 = fakeOneDrive(file);
  const old = { dev_odAuth: JSON.stringify({ access: 'old', exp: Date.now() - 1000, refresh: 'odr', native: true, got: 1 }) };
  const app2 = loadApp({ fsa: false, ua: UA, fetch: g2.fetch, storage: old, query: '?readonly&widgets', before: (w) => bridge(w, log2) });
  await tick(300);
  check(log2.posts.length === 1 && /grant_type=refresh_token/.test(log2.posts[0].form) && !g2.calls.some((c) => c.includes('login.microsoftonline.com')), 'an expired sign-in is renewed through Android\'s networking, never a web request');
  const auth = JSON.parse(app2.win.localStorage.getItem('dev_odAuth'));
  check(auth.access === 'fresh' && auth.native === true && log2.sent.length === 1, 'the renewed sign-in is kept for the app, and the rows still come');
  app2.close();

  // --- Not signed in: nothing handed over, still done ---
  const log3 = { sent: [], done: 0, posts: [] };
  const app3 = loadApp({ fsa: false, ua: UA, fetch: fakeOneDrive(file).fetch, storage: { dev_roData: stale }, query: '?readonly&widgets', before: (w) => bridge(w, log3) });
  await tick(200);
  check(log3.done === 1 && log3.sent.length === 0, 'signed out: the widgets keep what they had, and it\'s done');
  app3.close();

  // --- ?widgets in an ordinary browser (no bridge): an ordinary page ---
  const app4 = loadApp({ fsa: false, ua: UA, fetch: fakeOneDrive(file).fetch, storage: { dev_view: '"notes"' }, query: '?widgets' });
  await tick(100);
  check(app4.win.eval('HIDDEN') === false && app4.PA.device.get('view') === 'notes', 'without Android\'s link it\'s an ordinary page');
  app4.win.eval('device').set('view', 'tasks');
  check(app4.PA.device.get('view') === 'tasks', 'and keeps its settings as usual');
  check(app4.errors.length === 0 && app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : app4.errors[0] ? ': ' + app4.errors[0] : ''));
  app4.close();

  // --- The Android side opens this page and listens on the same names ---
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'android-app');
  const java = fs.readFileSync(path.join(dir, 'native', 'HiddenRefresh.java'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'PA App.html'), 'utf8');
  check(/PA%20App\.html\?readonly&widgets"/.test(java) && /addJavascriptInterface\(new Link\(\), "ButlerHidden"\)/.test(java) && /Hidden\.posted\(/.test(java), 'Android opens ?readonly&widgets with the ButlerHidden link and answers posts to Hidden.posted');
  check(/window\.ButlerHidden/.test(html) && /window\.Hidden = Hidden/.test(html), 'and the page uses those same names');
  check(/HiddenRefresh"[^>]*BIND_JOB_SERVICE/.test(fs.readFileSync(path.join(dir, 'native', 'manifest-widgets.xml'), 'utf8')), 'the hidden refresh is in the app\'s manifest');
  check(/@\+id\/widget_refresh/.test(fs.readFileSync(path.join(dir, 'res', 'layout', 'widget_list.xml'), 'utf8')) && /R\.id\.widget_refresh/.test(fs.readFileSync(path.join(dir, 'native', 'Widgets.java'), 'utf8')), 'the widgets have a refresh button');
  check(/ButlerAndroid\/6"/.test(fs.readFileSync(path.join(dir, 'capacitor.config.json'), 'utf8')), 'the app says it\'s version 6');
  done();
})();
