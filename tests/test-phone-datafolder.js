// The data file lives in OneDrive › Apps › PA App › Data (a phone whose file is still loose in Apps › PA App finds it
// there). OneDrive makes a conflict copy ("pa-app-data-LAPTOP.json") when the laptop and the phone save within the
// same few seconds; the phone puts each copy's records together with the data file (newer change wins), saves, and
// only then moves the copy to OneDrive's recycle bin. Not saved, or read-only: the copies are left alone.
const { loadApp, tick, check, done } = require('./helpers');

const APPROOT = 'https://graph.microsoft.com/v1.0/me/drive/special/approot';
const payload = (tasks, savedFrom = 'Laptop') => ({ app: 'PA App', version: 2, saveToken: `t${Math.random()}`, savedAt: new Date().toISOString(), savedFrom,
  data: { tasks, notes: [], events: [], buckets: [], labels: [], notices: [] } });
const task = (id, title, updated) => ({ id, title, due: '', priority: 'low', done: false, updated });

function fakeOneDrive({ dataFolder = true } = {}) {
  // items: id → {name, folder: 'Data' | '', content, eTag}
  const g = { items: new Map(), calls: [], putFails: false, n: 0, dataFolder };
  const reply = (status, j) => ({ ok: status < 300, status, json: async () => (j == null ? j : JSON.parse(JSON.stringify(j))) });
  const list = (folder) => ({ value: [...g.items.entries()].filter(([, x]) => x.folder === folder).map(([id, x]) => ({ id, name: x.name, eTag: x.eTag, file: {} })) });
  g.add = (name, content, folder = 'Data') => { g.n++; const id = `F${g.n}`; g.items.set(id, { name, folder, content, eTag: `"e${g.n}"` }); return id; };
  g.byName = (name) => [...g.items.values()].find((x) => x.name === name);
  g.fetch = async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    if (url.startsWith('https://login.microsoftonline.com/')) return reply(200, { access_token: 'od', expires_in: 3600, refresh_token: 'odr' });
    g.calls.push({ method, url });
    const path = url.split('?')[0];
    if (path === APPROOT) return reply(200, { id: 'root', name: 'PA App' });
    if (path === `${APPROOT}/children`) return reply(200, list(''));
    if (path === `${APPROOT}:/Data:/children`) return g.dataFolder ? reply(200, list('Data')) : reply(404, { error: { code: 'itemNotFound', message: 'Item not found' } });
    if (url.includes('/approot:/Backups/')) return reply(201, { id: 'B' });
    const m = path.match(/\/me\/drive\/items\/([^/]+)(\/content)?$/);
    if (m) {
      const it = g.items.get(m[1]);
      if (!it) return reply(404, { error: { message: 'Item not found' } });
      if (method === 'GET' && m[2]) return reply(200, it.content);
      if (method === 'GET') return reply(200, { id: m[1], name: it.name, eTag: it.eTag });
      if (method === 'PUT' && m[2]) {
        if (g.putFails) return reply(503, { error: { message: 'Service unavailable' } });
        const ifMatch = (opts.headers || {})['If-Match'];
        if (ifMatch && ifMatch !== it.eTag) return reply(412, { error: { message: 'modified' } });
        g.n++;
        Object.assign(it, { content: JSON.parse(opts.body), eTag: `"e${g.n}"` });
        return reply(200, { id: m[1], name: it.name, eTag: it.eTag });
      }
      if (method === 'DELETE' && !m[2]) { g.items.delete(m[1]); return { ok: true, status: 204, json: async () => null }; }
    }
    return reply(400, { error: { message: `unexpected ${method} ${url}` } });
  };
  return g;
}
const signedIn = { dev_odAuth: JSON.stringify({ access: 'od', exp: Date.now() + 3600e3, refresh: 'odr', scope: 'Files.ReadWrite.AppFolder' }) };
const deletes = (g) => g.calls.filter((c) => c.method === 'DELETE');
const toasts = (app) => [...app.doc.querySelectorAll('.toast')].map((x) => x.textContent).join(' | ');
const open = async (g, extra = {}) => {
  const app = loadApp({ fsa: false, fetch: g.fetch, storage: signedIn, ...extra });
  app.PA.OD.SAVE_MS = 10;
  app.PA.TD.soon = () => {};
  await tick(300);
  return app;
};

(async () => {
  // --- The data file in the Data folder, with two conflict copies beside it ---
  const g = fakeOneDrive();
  const main = g.add('pa-app-data.json', payload([task('a', 'Pay rent (newer here)', 2000), task('b', 'Buy milk', 1000)], 'Phone'));
  const copy1 = g.add('pa-app-data-LAPTOP.json', payload([task('a', 'Pay rent (older)', 1500), task('b', 'Buy milk', 1000), task('c', 'Only in the copy', 1800)]));
  const copy2 = g.add('pa-app-data-LAPTOP-2.json', payload([task('b', 'Buy milk and bread', 2500)]));
  const notOurs = g.add('pa-app-data-notes.json', { data: { notes: [] } }); // looks a little like one, but isn't
  const app = await open(g);
  const { PA } = app;
  const title = (id) => PA.DB.tasks.find((t) => t.id === id)?.title;
  check(g.calls.some((c) => c.url.includes('/approot:/Data:/children')), 'it looks in Apps › PA App › Data');
  check(PA.OD.item?.name === 'pa-app-data.json' && !PA.state.readOnly, 'it reads the data file there (not a copy) and edits');
  check(title('c') === 'Only in the copy', 'a task only in a conflict copy is brought in');
  check(title('a') === 'Pay rent (newer here)', 'a task changed later in the data file keeps that change');
  check(title('b') === 'Buy milk and bread', 'a task changed later in a copy takes the copy\'s change');
  const saved = g.items.get(main).content.data.tasks;
  check(saved.length === 3 && saved.find((t) => t.id === 'c') && saved.find((t) => t.id === 'b').title === 'Buy milk and bread', 'the put-together data is saved to the data file');
  const putAt = g.calls.findIndex((c) => c.method === 'PUT' && c.url.includes(`/items/${main}/content`));
  const firstDelete = g.calls.findIndex((c) => c.method === 'DELETE');
  check(putAt >= 0 && firstDelete > putAt, 'the copies are removed only after the save');
  check(!g.items.has(copy1) && !g.items.has(copy2), 'both copies go to OneDrive\'s recycle bin');
  check(g.items.has(notOurs) && g.items.has(main), 'a file that isn\'t a PA App data file, and the data file itself, are left alone');
  check(/Tidied 2 conflict copies/.test(toasts(app)), 'it says so');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();

  // --- The save fails: the copies stay (nothing is lost), and are tidied next time ---
  const g2 = fakeOneDrive();
  const main2 = g2.add('pa-app-data.json', payload([task('a', 'Pay rent', 1000)], 'Phone'));
  const copy3 = g2.add('pa-app-data-LAPTOP.json', payload([task('a', 'Pay rent', 1000), task('d', 'From the laptop', 1200)]));
  g2.putFails = true;
  const app2 = await open(g2);
  check(app2.PA.DB.tasks.some((t) => t.id === 'd'), 'the copy\'s task shows on the phone');
  check(g2.items.has(copy3) && deletes(g2).length === 0, 'not saved: the copy is kept');
  app2.close();
  g2.putFails = false;
  const app2b = await open(g2);
  check(!g2.items.has(copy3) && g2.items.get(main2).content.data.tasks.some((t) => t.id === 'd'), 'next time it saves, and then the copy goes');
  app2b.close();

  // --- Read-only: reads the file, touches nothing ---
  const g3 = fakeOneDrive();
  g3.add('pa-app-data.json', payload([task('a', 'Pay rent', 1000)], 'Phone'));
  const copy4 = g3.add('pa-app-data-LAPTOP.json', payload([task('e', 'Laptop task', 1200)]));
  const app3 = await open(g3, { query: '?readonly' });
  check(app3.PA.state.readOnly && app3.PA.DB.tasks.length === 1 && g3.items.has(copy4) && g3.calls.every((c) => c.method === 'GET'), 'read-only: the data file is read, the copy isn\'t touched');
  app3.close();

  // --- No Data folder yet: the file loose in Apps › PA App is still found ---
  const g4 = fakeOneDrive({ dataFolder: false });
  g4.add('pa-app-data.json', payload([task('a', 'Loose file', 1000)], 'Phone'), '');
  const app4 = await open(g4);
  check(app4.PA.DB.tasks[0]?.title === 'Loose file' && !app4.PA.state.readOnly, 'no Data folder yet: the file loose in Apps › PA App is read');
  app4.close();

  // --- Neither: says to move it into the Data folder ---
  const g5 = fakeOneDrive();
  const app5 = await open(g5);
  check(/Apps › PA App › Data/.test(app5.doc.querySelector('#banner').textContent), 'no data file: it says to move it into Apps › PA App › Data');
  check([app2, app2b, app3, app4, app5].every((a) => a.errors.length === 0), 'no script errors');
  app5.close();
  done();
})();
