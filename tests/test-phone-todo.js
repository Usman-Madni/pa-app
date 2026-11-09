// The phone syncs To Do too, so reminders don't wait for the laptop. One sign-in covers OneDrive (PA App's own folder)
// and To Do. Only while it can edit. Two devices syncing the same list must never delete or double each other's
// tasks: a To Do task made for a task this device hasn't seen yet is left alone, and a task added in To Do gets the
// same id on whichever device brings it in.
const { loadApp, tick, check, done } = require('./helpers');

function fakeMicrosoft() {
  const g = { file: null, lists: [], tasks: new Map(), calls: [], offline: false, n: 0 };
  const reply = (status, j) => ({ ok: status < 300, status, json: async () => (j == null ? j : JSON.parse(JSON.stringify(j))) });
  g.fetch = async (url, opts = {}) => {
    if (g.offline) throw new TypeError('Failed to fetch');
    const method = (opts.method || 'GET').toUpperCase();
    if (url.startsWith('https://login.microsoftonline.com/')) return reply(200, { access_token: 'od2', expires_in: 3600, refresh_token: 'odr2', scope: 'Files.ReadWrite.AppFolder Tasks.ReadWrite' });
    const headers = opts.headers || {};
    const body = typeof opts.body === 'string' ? JSON.parse(opts.body) : null;
    g.calls.push({ method, url, body, auth: headers.Authorization });
    const path = url.replace('https://graph.microsoft.com/v1.0', '').split('?')[0];
    // OneDrive: the data file
    if (path === '/me/drive/special/approot') return reply(200, { id: 'root', name: 'PA App' });
    if (path === '/me/drive/special/approot/children') return reply(200, { value: [{ id: 'F1', name: 'pa-app-data.json', eTag: g.file.eTag, file: {} }] });
    if (path === '/me/drive/items/F1' && method === 'GET') return reply(200, { id: 'F1', eTag: g.file.eTag });
    if (path === '/me/drive/items/F1/content' && method === 'GET') return reply(200, g.file.content);
    if (path === '/me/drive/items/F1/content' && method === 'PUT') {
      if (headers['If-Match'] && headers['If-Match'] !== g.file.eTag) return reply(412, { error: { message: 'changed' } });
      g.file = { content: body, eTag: `"v${++g.n}"` };
      return reply(200, { id: 'F1', eTag: g.file.eTag });
    }
    // To Do
    if (path === '/me/todo/lists' && method === 'GET') return reply(200, { value: g.lists });
    if (path === '/me/todo/lists' && method === 'POST') { const l = { id: `L${++g.n}`, displayName: body.displayName }; g.lists.push(l); g.tasks.set(l.id, new Map()); return reply(201, l); }
    const lr = path.match(/^\/me\/todo\/lists\/([^/]+)\/tasks\/([^/]+)\/linkedResources$/);
    if (lr && method === 'POST') { const t = g.tasks.get(lr[1]).get(lr[2]); t.linkedResources = [...(t.linkedResources || []), body]; return reply(201, body); }
    const m = path.match(/^\/me\/todo\/lists\/([^/]+)\/tasks(?:\/([^/]+))?$/);
    if (m) {
      const list = g.tasks.get(m[1]);
      if (!list) return reply(404, { error: { message: 'The list was not found' } });
      if (!m[2] && method === 'GET') return reply(200, { value: [...list.values()] });
      if (!m[2] && method === 'POST') { const t = { ...body, id: `T${++g.n}` }; list.set(t.id, t); return reply(201, t); }
      const t = list.get(m[2]);
      if (!t) return reply(404, { error: { message: 'The task was not found' } });
      if (method === 'PATCH') { Object.assign(t, body); return reply(200, t); }
      if (method === 'DELETE') { list.delete(m[2]); return { ok: true, status: 204, json: async () => null }; }
    }
    return reply(400, { error: { message: `unexpected ${method} ${url}` } });
  };
  g.list = () => { const l = g.lists.find((x) => x.displayName === 'PA App'); return l ? g.tasks.get(l.id) : new Map(); };
  g.todoCalls = () => g.calls.filter((c) => c.url.includes('/me/todo/'));
  return g;
}
const auth = (scope) => ({ dev_odAuth: JSON.stringify({ access: 'od', exp: Date.now() + 3600e3, refresh: 'odr', ...(scope ? { scope } : {}) }) });
const fileWith = (tasks) => ({ eTag: '"v0"', content: { app: 'PA App', version: 2, saveToken: 't0', savedAt: new Date().toISOString(), savedFrom: 'Laptop', data: { tasks, notes: [], events: [] } } });

(async () => {
  // --- Signed in before this update: OneDrive only. It says how to add To Do, and nothing goes there ---
  const g0 = fakeMicrosoft();
  g0.file = fileWith([{ id: 'a', title: 'Pay rent', due: '', priority: 'low', done: false, updated: 1 }]);
  const old = loadApp({ fsa: false, fetch: g0.fetch, storage: auth() });
  await tick(100);
  await old.PA.TD.sync();
  old.PA.state.view = 'settings';
  old.PA.render();
  check(!old.PA.state.readOnly && g0.todoCalls().length === 0, 'an older phone sign-in (OneDrive only): editing, but nothing goes to To Do');
  const card = [...old.doc.querySelectorAll('.card')].find((c) => /Phone reminders/.test(c.textContent));
  check(card && card.querySelector('[data-action="od-connect"]') && /Sign in again/.test(card.textContent), 'Settings › Phone reminders offers "Sign in again" to add To Do');
  old.close();

  // --- One sign-in for both: the phone asks for To Do along with its folder ---
  check(/Tasks\.ReadWrite/.test(old.PA.OD.SCOPE) && /Files\.ReadWrite\.AppFolder/.test(old.PA.OD.SCOPE) && !/Files\.ReadWrite(\.All)?( |$)/.test(old.PA.OD.SCOPE), 'the phone\'s sign-in asks for To Do and still only PA App\'s own folder');

  // --- Signed in with To Do: it syncs, with the same sign-in ---
  const g = fakeMicrosoft();
  g.file = fileWith([{ id: 'a', title: 'Pay rent', due: '', priority: 'low', done: false, updated: 1 }]);
  const app = loadApp({ fsa: false, fetch: g.fetch, storage: auth('Files.ReadWrite.AppFolder Tasks.ReadWrite') });
  const { win, doc, PA } = app;
  PA.OD.SAVE_MS = 10;
  PA.TD.SOON_MS = 10;
  await tick(150);
  check([...g.list().values()].some((x) => x.title === 'Pay rent'), 'on opening, the phone sends its open tasks to To Do');
  check(g.todoCalls().every((c) => c.auth === 'Bearer od'), 'using the phone\'s one sign-in');
  await tick(100);
  check(g.file.content.data.tasks.find((t) => t.id === 'a').todo?.id, 'the link to To Do is saved to OneDrive, so the laptop knows it');
  PA.state.view = 'settings';
  PA.render();
  check(/1 task on your phone list/.test(doc.querySelector('#main').textContent) && doc.querySelector('[data-action="td-sync"]'), 'Settings shows the phone list, with Sync now');

  // --- A task added on the phone reaches To Do a few seconds later ---
  PA.addTask({ title: 'Call the plumber' });
  await tick(150);
  check([...g.list().values()].some((x) => x.title === 'Call the plumber'), 'added on the phone: in To Do a moment later');

  // --- A task added in To Do comes in, with an id made from its To Do id ---
  const list = g.list();
  list.set('X1', { id: 'X1', title: 'Added in To Do', status: 'notStarted', createdDateTime: new Date().toISOString(), linkedResources: [] });
  await PA.TD.sync();
  const x1 = PA.DB.tasks.find((t) => t.todo && t.todo.id === 'X1');
  check(x1 && x1.id === PA.TD.adoptId({ id: 'X1' }), 'a task added in To Do comes in on the phone (the laptop would give it the same id)');

  // --- The laptop's new task, not on the phone yet: its To Do copy is left alone ---
  list.set('X2', { id: 'X2', title: 'Laptop, just now', status: 'notStarted', linkedResources: [{ applicationName: 'PA App', externalId: 'laptop-new' }] });
  await PA.TD.sync();
  check(list.has('X2') && !PA.DB.tasks.some((t) => t.title === 'Laptop, just now'), 'a To Do task for a task the phone hasn\'t seen yet: not deleted, not brought in twice');

  // --- Deleted on the phone: removed from To Do ---
  const plumber = PA.DB.tasks.find((t) => t.title === 'Call the plumber');
  PA.DB.tasks.splice(PA.DB.tasks.indexOf(plumber), 1);
  win.eval('changed')('tasks');
  await tick(150);
  check(![...list.values()].some((x) => x.title === 'Call the plumber'), 'deleted on the phone: gone from To Do too');

  // --- A OneDrive save during a To Do sync still goes ---
  PA.TD.busy = true;
  PA.TD.syncLoads = -1; // as if the data had been reloaded mid-sync
  const puts = g.calls.filter((c) => c.method === 'PUT').length;
  PA.DB.tasks[0].notes = 'saved while syncing';
  win.eval('changed')('tasks');
  await tick(100);
  check(g.calls.filter((c) => c.method === 'PUT').length > puts && win.localStorage.getItem('dev_odUnsaved') === 'false' && g.file.content.data.tasks[0].notes === 'saved while syncing', 'a OneDrive save during a To Do sync isn\'t stopped by it');
  PA.TD.busy = false;

  // --- Offline: read-only, no syncing ---
  g.offline = true;
  await PA.OD.open();
  const before = g.calls.length;
  await PA.TD.sync();
  check(PA.state.readOnly && g.calls.length === before, 'offline (read-only): no To Do sync');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();
  done();
})();
