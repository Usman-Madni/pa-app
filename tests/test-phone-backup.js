// Backups on the phone, like the laptop's: the phone's first save of each day also puts a dated copy in
// OneDrive › Apps › PA App › Backups (never over one already there; a failed backup doesn't stop saving, and is
// tried again at the next save). Export and Import are on the phone too; read-only, nothing is imported.
const { loadApp, tick, check, done, answer } = require('./helpers');

const APPROOT = 'https://graph.microsoft.com/v1.0/me/drive/special/approot';
function fakeOneDrive() {
  const g = { file: null, backups: {}, calls: [], backupFails: false };
  const reply = (status, j) => ({ ok: status < 300, status, json: async () => (j == null ? j : JSON.parse(JSON.stringify(j))) });
  g.fetch = async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    if (url.startsWith('https://login.microsoftonline.com/')) return reply(200, { access_token: 'od', expires_in: 3600, refresh_token: 'odr' });
    g.calls.push({ method, url, headers: opts.headers || {}, body: opts.body });
    const path = url.split('?')[0];
    const query = decodeURIComponent(url.split('?')[1] || '');
    if (path === APPROOT) return reply(200, { id: 'root', name: 'PA App' });
    if (path === `${APPROOT}/children`) return reply(200, { value: [{ id: 'F1', name: 'pa-app-data.json', eTag: g.file.eTag, file: {} }] });
    if (path.endsWith('/items/F1/content') && method === 'GET') return reply(200, g.file.content);
    if (path.endsWith('/items/F1/content') && method === 'PUT') {
      g.file = { content: JSON.parse(opts.body), eTag: `"v${Math.random()}"` };
      return reply(200, { id: 'F1', name: 'pa-app-data.json', eTag: g.file.eTag });
    }
    const m = path.match(/^.*\/approot:\/Backups\/([^:]+):\/content$/);
    if (m && method === 'PUT') {
      if (g.backupFails) return reply(500, { error: { message: 'Service unavailable' } });
      const name = decodeURIComponent(m[1]);
      if (g.backups[name] && /conflictBehavior=fail/.test(query)) return reply(409, { error: { message: 'Name already exists' } });
      const text = await new Promise((res) => { const r = new g.win.FileReader(); r.onload = () => res(r.result); r.readAsText(opts.body); });
      g.backups[name] = { type: (opts.headers || {})['Content-Type'], text };
      return reply(201, { id: 'B-' + name, name });
    }
    return reply(400, { error: { message: `unexpected ${method} ${url}` } });
  };
  return g;
}
const signedIn = { dev_odAuth: JSON.stringify({ access: 'od', exp: Date.now() + 3600e3, refresh: 'odr', scope: 'Files.ReadWrite.AppFolder Tasks.ReadWrite offline_access' }) };
const toasts = (doc) => [...doc.querySelectorAll('.toast')].map((x) => x.textContent).join(' | ');
const backupPuts = (g) => g.calls.filter((c) => c.method === 'PUT' && /Backups/.test(c.url));

(async () => {
  const g = fakeOneDrive();
  g.file = { eTag: '"v1"', content: { app: 'PA App', version: 2, saveToken: 't0', savedAt: new Date().toISOString(), savedFrom: 'Laptop',
    data: { tasks: [{ id: 'a', title: 'Phone bill', due: '', priority: 'low', done: false, updated: 1 }], notes: [], events: [] } } };
  const app = loadApp({ fsa: false, fetch: g.fetch, storage: signedIn });
  const { win, doc, PA } = app;
  g.win = win;
  PA.OD.SAVE_MS = 10;
  PA.TD.soon = () => {}; // To Do has its own tests
  await tick(100);
  check(PA.state.phone && !PA.state.readOnly, 'signed in and editing on the phone');
  check(backupPuts(g).length === 0, 'only reading: no backup yet');

  // --- The first save of the day also backs up ---
  const edit = async (title) => { PA.DB.tasks[0].title = title; win.eval('changed')('tasks'); await tick(150); };
  await edit('Phone bill paid');
  const names = Object.keys(g.backups);
  check(g.file.content.data.tasks[0].title === 'Phone bill paid', 'the change is saved to the data file');
  check(names.length === 1 && /^PA App Backup \d\d-\d\d-\d\d \d{1,2}-\d\d(am|pm)\.json$/.test(names[0]), 'a dated backup is put in Apps › PA App › Backups, named like the laptop\'s: ' + names[0]);
  const copy = JSON.parse(g.backups[names[0]].text);
  check(copy.app === 'PA App' && copy.data.tasks[0].title === 'Phone bill paid' && g.backups[names[0]].type === 'application/json', 'it is a full copy of the data, as a PA App backup');
  check(/conflictBehavior=fail/.test(decodeURIComponent(backupPuts(g)[0].url)), 'never over a backup already there');

  // --- Only one a day ---
  await edit('Phone bill paid in full');
  check(backupPuts(g).length === 1, 'later saves the same day: no more backups');

  // --- Settings shows it, and Export / Import are there ---
  PA.state.view = 'settings';
  PA.render();
  const settings = doc.querySelector('.grid').textContent;
  check(/Daily backups/.test(settings) && /Apps › PA App › Backups/.test(settings) && settings.includes(names[0].replace('.json', '')), 'Settings says where the backups go and names the last one');
  const manual = doc.querySelector('[data-action="export"]')?.closest('.card');
  check(manual && !manual.hidden && manual.querySelector('[data-input="import"]'), 'Export and Import are on the phone');

  // --- A new day, and that name is already taken: kept, not written over ---
  win.localStorage.setItem('dev_odBackupDay', JSON.stringify('2000-01-01'));
  const nameNow = win.eval('backupName')(new Date());
  g.backups[nameNow] = { type: 'application/json', text: 'EARLIER' };
  await edit('Another day');
  check(g.backups[nameNow].text === 'EARLIER', 'a backup already there is never written over');
  check(!/backup failed/i.test(toasts(doc)), 'and that is not a failure');

  // --- A backup that fails: saving goes on, it says so, and the next save tries again ---
  win.localStorage.setItem('dev_odBackupDay', JSON.stringify('2000-01-01'));
  g.backupFails = true;
  const triedBefore = backupPuts(g).length;
  await edit('Saved anyway');
  check(g.file.content.data.tasks[0].title === 'Saved anyway' && win.localStorage.getItem('dev_odUnsaved') === 'false', 'a failed backup doesn\'t stop the save');
  check(/Daily backup failed/.test(toasts(doc)), 'it says the backup failed');
  check(backupPuts(g).length === triedBefore + 1, 'tried once, not over and over (its notice is a change that saves again)');
  await edit('Soon after');
  check(backupPuts(g).length === triedBefore + 1, 'a save straight after doesn\'t try again yet');
  g.backupFails = false;
  delete g.backups[nameNow];
  PA.OD.backupFailedAt -= PA.OD.BACKUP_RETRY_MS; // ten minutes later
  await edit('Next save');
  // (found by its contents: the name carries the minute, which may have moved on since nameNow was worked out)
  check(Object.values(g.backups).some((b) => b.text !== 'EARLIER' && JSON.parse(b.text).data.tasks[0].title === 'Next save'), 'a save after a while backs up again');

  // --- Import on the phone: replaces the data, and saves it to OneDrive ---
  const json = JSON.stringify({ app: 'PA App', version: 2, data: { tasks: [{ id: 'z', title: 'From the backup', priority: 'low', done: false }], notes: [], events: [] } });
  const backupFile = new win.File([json], 'old.json', { type: 'application/json' });
  backupFile.text = async () => json; // jsdom's File has no text()
  const input = doc.querySelector('[data-input="import"]');
  Object.defineProperty(input, 'files', { value: [backupFile], configurable: true });
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
  const q = await answer(win, true);
  await tick(200);
  check(/Replace everything/.test(q) && PA.DB.tasks.some((t) => t.title === 'From the backup'), 'Import asks first, then brings the backup in');
  check(g.file.content.data.tasks.some((t) => t.title === 'From the backup'), 'and saves it to the data file in OneDrive');

  // --- Read-only on the phone: nothing is imported, no backups ---
  const ro = loadApp({ fsa: false, fetch: g.fetch, storage: signedIn, query: '?readonly' });
  await tick(100);
  ro.PA.state.view = 'settings';
  ro.PA.render();
  const roInput = ro.doc.querySelector('[data-input="import"]');
  const before = ro.PA.DB.tasks.length;
  const puts = g.calls.filter((c) => c.method === 'PUT').length;
  Object.defineProperty(roInput, 'files', { value: [backupFile], configurable: true });
  roInput.dispatchEvent(new ro.win.Event('change', { bubbles: true }));
  await tick(100);
  check(ro.PA.state.readOnly && ro.PA.DB.tasks.length === before && !ro.doc.querySelector('[data-form="ask"]') && g.calls.filter((c) => c.method === 'PUT').length === puts, 'read-only: nothing is imported or written');

  // --- The laptop is unchanged: its own backup folder ---
  const laptop = loadApp({});
  await tick(20);
  laptop.PA.state.view = 'settings';
  laptop.PA.render();
  check(laptop.doc.querySelector('[data-action="df-backup-folder"], [data-action="df-create"]') && !/Apps › PA App › Backups/.test(laptop.doc.querySelector('.grid').textContent), 'the laptop keeps its own backup folder');

  check(app.errors.length === 0 && ro.errors.length === 0 && laptop.errors.length === 0, 'no script errors' + (app.errors[0] || ro.errors[0] || laptop.errors[0] ? ': ' + (app.errors[0] || ro.errors[0] || laptop.errors[0]) : ''));
  laptop.close();
  ro.close();
  app.close();
  done();
})();
