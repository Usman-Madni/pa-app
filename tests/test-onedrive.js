// Phone editing, stage B: the phone signs in to Microsoft with access to PA App's own OneDrive folder only
// (Apps › PA App) and reads the data file straight from there — always the latest, no picking. It stays
// read-only. The laptop is untouched (its To Do sign-in is separate) and says clearly when the file has moved.
const { loadApp, fakeFile, tick, check, done } = require('./helpers');

function fakeOneDrive() {
  const g = { files: new Map(), calls: [], tokenCalls: [], offline: false, n: 0 };
  const reply = (status, j) => ({ ok: status < 300, status, json: async () => (j == null ? j : JSON.parse(JSON.stringify(j))) });
  g.fetch = async (url, opts = {}) => {
    if (g.offline) throw new TypeError('Failed to fetch');
    const method = (opts.method || 'GET').toUpperCase();
    if (url.startsWith('https://login.microsoftonline.com/')) {
      g.tokenCalls.push(Object.fromEntries(new URLSearchParams(opts.body)));
      g.n++;
      return reply(200, { access_token: `od${g.n}`, expires_in: 3600, refresh_token: `odr${g.n}` });
    }
    g.calls.push({ method, url });
    const path = url.replace('https://graph.microsoft.com/v1.0', '').split('?')[0];
    if (method !== 'GET') return reply(400, { error: { message: 'the phone must not write in stage B' } });
    if (path === '/me/drive/special/approot') return reply(200, { id: 'root', name: 'PA App' });
    if (path === '/me/drive/special/approot/children') {
      return reply(200, { value: [...g.files.values()].map((f) => ({ id: f.id, name: f.name, eTag: f.eTag, file: {} })) });
    }
    const m = path.match(/^\/me\/drive\/items\/([^/]+)\/content$/);
    if (m) { const f = [...g.files.values()].find((x) => x.id === m[1]); return f ? reply(200, f.content) : reply(404, { error: { message: 'not found' } }); }
    return reply(400, { error: { message: `unexpected ${method} ${url}` } });
  };
  g.put = (name, content) => { g.n++; g.files.set(name, { id: `F${g.n}`, name, eTag: `"e${g.n}"`, content }); };
  return g;
}
const dataFile = (title, savedFrom = 'Laptop') => ({
  app: 'PA App', version: 2, saveToken: `t-${title}`, savedAt: '2026-11-09T09:00:00.000Z', savedFrom,
  data: { tasks: [{ id: 'a', title, due: '', priority: 'low', done: false }], notes: [], events: [] },
});

(async () => {
  const g = fakeOneDrive();
  const phone = loadApp({ fsa: false, fetch: g.fetch });
  const { win, doc, PA } = phone;
  await tick(20);
  const banner = () => doc.querySelector('#banner').textContent;
  check(doc.querySelector('#banner [data-action="od-connect"]') && /Sign in to OneDrive/.test(banner()), 'the phone offers "Sign in to OneDrive"');
  check(doc.querySelector('#banner [data-input="ro-open"]'), 'picking the file by hand is still there');

  // --- Sign in: PA App's own folder only ---
  let popup;
  win.open = () => (popup = { closed: false, location: { href: 'about:blank' }, close() { this.closed = true; } });
  doc.querySelector('#banner [data-action="od-connect"]').click();
  await tick(50);
  const ap = new URL(popup.location.href).searchParams;
  check(ap.get('scope') === 'Files.ReadWrite.AppFolder offline_access', 'it asks only for PA App\'s own OneDrive folder (not all your files, not To Do)');
  popup.location.href = `http://localhost/?code=c1&state=${ap.get('state')}`;
  await tick(400);
  check(win.localStorage.getItem('dev_odAuth') && !win.localStorage.getItem('dev_msAuth'), 'its tokens are kept apart from the To Do sign-in');

  // --- Folder still empty: say where to put the file ---
  await tick(50);
  check(/Apps › PA App/.test(banner()) && /move your data file/i.test(banner()) && PA.DB.tasks.length === 0, 'empty folder: it says to move the data file into OneDrive › Apps › PA App');

  // --- The file is there: read it ---
  g.put('pa-app-data.json', dataFile('From OneDrive'));
  doc.querySelector('#banner [data-action="od-refresh"]').click();
  await tick(50);
  check(PA.DB.tasks[0]?.title === 'From OneDrive' && /from OneDrive/.test(banner()) && /Laptop/.test(banner()), 'Refresh reads the data file from OneDrive, and says when and where it was saved');
  check(g.calls.every((c) => c.method === 'GET'), 'reading only: nothing is written to OneDrive');
  g.put('pa-app-data.json', dataFile('Newer'));
  doc.querySelector('#banner [data-action="od-refresh"]').click();
  await tick(50);
  check(PA.DB.tasks[0]?.title === 'Newer', 'Refresh brings the latest');

  // --- Still read-only ---
  doc.querySelector('[data-view="tasks"]').click();
  const form = doc.querySelector('[data-form="quick-add"]');
  form.elements.title.value = 'Sneaky';
  form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  check(PA.DB.tasks.length === 1 && PA.state.readOnly, 'the phone still can\'t change anything (that comes in stage C)');

  // --- Offline: the last copy, and it says so ---
  g.offline = true;
  doc.querySelector('#banner [data-action="od-refresh"]').click();
  await tick(50);
  check(PA.DB.tasks[0]?.title === 'Newer' && /offline/i.test(banner()), 'offline: shows the last copy and says so');
  g.offline = false;

  // --- Opening the phone view again reads from OneDrive by itself ---
  const storage = {};
  for (let i = 0; i < win.localStorage.length; i++) { const k = win.localStorage.key(i); storage[k] = win.localStorage.getItem(k); }
  phone.close();
  g.put('pa-app-data.json', dataFile('Latest on opening'));
  const again = loadApp({ fsa: false, fetch: g.fetch, storage });
  await tick(100);
  check(again.PA.DB.tasks[0]?.title === 'Latest on opening', 'opening the phone view again reads the latest from OneDrive');
  check(again.errors.length === 0 && phone.errors.length === 0, 'no script errors' + (again.errors[0] || phone.errors[0] ? ': ' + (again.errors[0] || phone.errors[0]) : ''));
  again.close();

  // --- The laptop: no OneDrive sign-in, and a moved data file is explained ---
  const file = fakeFile();
  const laptop = loadApp({ pickFile: file, fetch: g.fetch });
  await tick(20);
  check(!laptop.doc.querySelector('[data-action="od-connect"]'), 'the laptop has no OneDrive sign-in: it uses the file through its synced folder');
  await laptop.PA.DF.createNew();
  file.getFile = async () => { const e = new Error('A requested file or directory could not be found'); e.name = 'NotFoundError'; throw e; };
  await laptop.PA.DF.check();
  check(/isn't where it was/.test(laptop.doc.querySelector('#banner').textContent) && /Open existing data file/.test(laptop.doc.querySelector('#banner').textContent), 'a data file that was moved: it says so and how to choose it again');
  laptop.close();
  done();
})();
