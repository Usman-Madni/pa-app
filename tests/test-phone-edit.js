// Phone editing, stage C: signed in to OneDrive, online, with the file read, the phone edits everything. Each change
// saves to OneDrive a moment later with a version check; if the laptop saved meanwhile, the phone merges record by
// record and saves again, quietly. Offline or signed out it's read-only, and an edit not yet saved is merged in later.
// Files, the To Do sync and the data-file settings stay on the laptop.
const { loadApp, tick, check, done } = require('./helpers');

function fakeOneDrive() {
  const g = { file: null, calls: [], offline: false, n: 0 };
  const reply = (status, j) => ({ ok: status < 300, status, json: async () => (j == null ? j : JSON.parse(JSON.stringify(j))) });
  g.fetch = async (url, opts = {}) => {
    if (g.offline) throw new TypeError('Failed to fetch');
    const method = (opts.method || 'GET').toUpperCase();
    if (url.startsWith('https://login.microsoftonline.com/')) return reply(200, { access_token: 'od', expires_in: 3600, refresh_token: 'odr' });
    const headers = opts.headers || {};
    g.calls.push({ method, url, ifMatch: headers['If-Match'], body: opts.body ? JSON.parse(opts.body) : null });
    const path = url.replace('https://graph.microsoft.com/v1.0', '').split('?')[0];
    if (path === '/me/drive/special/approot') return reply(200, { id: 'root', name: 'PA App' });
    if (path === '/me/drive/special/approot/children') return reply(200, { value: g.file ? [{ id: 'F1', name: 'pa-app-data.json', eTag: g.file.eTag, file: {} }] : [] });
    if (path === '/me/drive/items/F1' && method === 'GET') return reply(200, { id: 'F1', name: 'pa-app-data.json', eTag: g.file.eTag });
    if (path === '/me/drive/items/F1/content' && method === 'GET') return reply(200, g.file.content);
    if (path === '/me/drive/items/F1/content' && method === 'PUT') {
      if (headers['If-Match'] && headers['If-Match'] !== g.file.eTag) return reply(412, { error: { message: 'The resource has been modified' } });
      g.set(JSON.parse(opts.body));
      return reply(200, { id: 'F1', name: 'pa-app-data.json', eTag: g.file.eTag });
    }
    return reply(400, { error: { message: `unexpected ${method} ${url}` } });
  };
  g.set = (content) => { g.n++; g.file = { content, eTag: `"v${g.n}"` }; };
  // The laptop saves: a task added there, with when it changed.
  g.laptopAdds = (id, title) => {
    const c = JSON.parse(JSON.stringify(g.file.content));
    c.data.tasks.push({ id, title, due: '', priority: 'low', done: false, updated: Date.now() });
    c.saveToken = `laptop-${id}`; c.savedFrom = 'Laptop';
    g.set(c);
  };
  return g;
}
const signedIn = { dev_odAuth: JSON.stringify({ access: 'od', exp: Date.now() + 3600e3, refresh: 'odr' }) };

(async () => {
  const g = fakeOneDrive();
  g.set({ app: 'PA App', version: 2, saveToken: 't0', savedAt: new Date().toISOString(), savedFrom: 'Laptop',
    data: { tasks: [{ id: 'a', title: 'From the laptop', due: '', priority: 'low', done: false, updated: 1 }], notes: [], events: [] } });
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';
  const phone = loadApp({ fsa: false, ua: android, fetch: g.fetch, storage: signedIn });
  const { win, doc, PA } = phone;
  PA.OD.SAVE_MS = 10;
  await tick(100);
  const banner = () => doc.querySelector('#banner').textContent;
  check(PA.state.phone && !PA.state.readOnly && PA.DB.tasks[0]?.title === 'From the laptop', 'signed in, online, file read: the phone can edit');
  check(/Editing/.test(banner()) && !/Read-only/.test(banner()), 'the banner says it is editing');
  const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('');
  check(doc.body.classList.contains('phone') && /body\.phone \.qa-native \{ pointer-events: auto; \}/.test(css), 'quick add\'s Due: on a phone the tap lands on the date box itself (phones can ignore opening it from code)');

  check(/body\.phone \.p-input\[type="date"\], body\.phone \.p-input\[type="time"\] \{ border: 1px solid/.test(css), 'task panel\'s Due: on a phone the empty date box is drawn as a box to tap (phones show an empty one as nothing)');

  check(/body\.phone \.p-input\[type="date"\] \{ flex: 1 1 150px !important; \}/.test(css), 'on a phone the date box is wide enough to show its date (too narrow, it shows only its arrow)');

  // --- An edit saves to OneDrive, with the version check ---
  doc.querySelector('[data-view="tasks"]').click();
  const form = () => doc.querySelector('[data-form="quick-add"]');
  form().elements.title.value = 'Added on the phone';
  form().dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  check(PA.DB.tasks.some((t) => t.title === 'Added on the phone'), 'quick add works on the phone');
  await tick(150);
  const put = g.calls.filter((c) => c.method === 'PUT');
  check(put.length === 1 && put[0].ifMatch === '"v1"', 'saved to OneDrive a moment later, only if the file is still the version it read');
  check(g.file.content.data.tasks.some((t) => t.title === 'Added on the phone') && g.file.content.savedFrom === 'Phone', 'OneDrive has it, saved on "Phone"');
  check(g.file.content.data.notices.some((n) => /Added/.test(n.text)), 'the phone adds to Notifications too');

  // --- The laptop saved meanwhile: merge and save again, quietly ---
  g.laptopAdds('L1', 'Laptop, meanwhile');
  PA.DB.tasks[0].notes = 'edited on the phone';
  win.eval('changed')('tasks');
  await tick(200);
  const titles = g.file.content.data.tasks.map((t) => t.title);
  check(titles.includes('Laptop, meanwhile') && titles.includes('Added on the phone') && g.file.content.data.tasks.find((t) => t.id === 'a').notes === 'edited on the phone', 'the laptop saved meanwhile: both sides kept, merged and saved again');
  check(PA.DB.tasks.some((t) => t.id === 'L1') && !doc.querySelector('#modal form'), 'shown on the phone too, without asking anything');
  const lastPut = g.calls.filter((c) => c.method === 'PUT').pop();
  check(lastPut.ifMatch === g.calls.filter((c) => c.method === 'PUT').slice(-2)[0].ifMatch || lastPut.ifMatch !== '"v2"', 'the second try checks against the newer version');

  // --- The phone's date picker hides the page for a moment: coming back must not redraw the box being picked ---
  PA.state.openTask = 'a';
  PA.renderDrawer();
  const box = doc.querySelector('#drawer [data-field="dueDate"]');
  box.focus();
  PA.OD.lastRead = 0; // over a minute since the last read
  const reads = () => g.calls.filter((c) => c.url.endsWith('/me/drive/special/approot')).length;
  const readsBefore = reads();
  doc.dispatchEvent(new win.Event('visibilitychange'));
  await tick(50);
  check(reads() === readsBefore && box.isConnected, 'back from the date picker: the box being picked is not redrawn under it');
  box.value = '2026-12-01';
  box.dispatchEvent(new win.Event('change', { bubbles: true }));
  box.blur();
  await tick(700);
  check(PA.DB.tasks.find((t) => t.id === 'a').due.startsWith('2026-12-01'), 'the picked date is kept');
  check(reads() > readsBefore, 'the latest is read once the box is left');
  check(g.file.content.data.tasks.find((t) => t.id === 'a').due.startsWith('2026-12-01'), 'and the date reaches OneDrive');
  PA.state.openTask = null;
  PA.renderDrawer();

  // --- Phone-only limits: no files, no To Do, no data-file settings ---
  PA.state.view = 'settings';
  PA.render();
  check(!doc.querySelector('[data-action="td-connect"]') && !doc.querySelector('[data-action="df-open"]') && !doc.querySelector('[data-action="df-create"]'), 'Settings on the phone has no To Do or data-file buttons');
  PA.state.openTask = PA.DB.tasks[0].id;
  PA.renderDrawer();
  check(!doc.querySelector('#drawer [data-action="at-folder"]') && !doc.querySelector('#drawer [data-input="attach"]'), 'no attaching files on the phone yet (stage D)');
  PA.state.openTask = null;
  PA.renderDrawer();

  // --- Offline: read-only; an edit made just before is kept and saved later ---
  PA.DB.tasks.push(PA.normalizeTask({ id: 'off', title: 'Typed as the signal went' }));
  win.eval('changed')('tasks');
  g.offline = true;
  await tick(150);
  check(PA.state.readOnly && /offline/i.test(banner()), 'offline: read-only, and it says so');
  check(JSON.parse(win.localStorage.getItem('dev_roData')).tasks.some((t) => t.id === 'off') && win.localStorage.getItem('dev_odUnsaved') === 'true', 'the unsaved edit is kept on the phone');
  g.offline = false;
  doc.querySelector('#banner [data-action="od-refresh"]').click();
  await tick(200);
  check(!PA.state.readOnly && g.file.content.data.tasks.some((t) => t.id === 'off') && win.localStorage.getItem('dev_odUnsaved') === 'false', 'back online: it\'s merged in and saved, and editing is back');

  // --- Reopened after an unsaved edit: merged in on opening ---
  PA.DB.tasks.push(PA.normalizeTask({ id: 'later', title: 'Closed before it saved' }));
  win.eval('changed')('tasks');
  const storage = {};
  for (let i = 0; i < win.localStorage.length; i++) { const k = win.localStorage.key(i); storage[k] = win.localStorage.getItem(k); }
  phone.close(); // closed before the save went
  g.laptopAdds('L2', 'Laptop, while the phone was closed');
  const again = loadApp({ fsa: false, fetch: g.fetch, storage });
  again.PA.OD.SAVE_MS = 10;
  await tick(250);
  const t2 = g.file.content.data.tasks.map((t) => t.id);
  check(t2.includes('later') && t2.includes('L2') && again.PA.DB.tasks.some((t) => t.id === 'later'), 'reopened: the edit that never saved is merged with the laptop\'s and saved');
  check(again.errors.length === 0 && phone.errors.length === 0, 'no script errors' + (again.errors[0] || phone.errors[0] ? ': ' + (again.errors[0] || phone.errors[0]) : ''));
  again.close();

  // --- Signed out, or ?readonly: read-only ---
  const out = loadApp({ fsa: false, fetch: g.fetch });
  await tick(50);
  check(out.PA.state.readOnly, 'signed out: read-only');
  out.close();
  const forced = loadApp({ fsa: false, fetch: g.fetch, storage: signedIn, query: '?readonly' });
  await tick(100);
  check(forced.PA.state.readOnly && forced.PA.DB.tasks.length > 0, '?readonly: read-only even when signed in');
  forced.close();
  done();
})();
