// Attached files in folders by person and area: "Me/Tasks/…", "Robin/Vault/…", "Shared/…" for things on more than one
// person, assets by kind (a vehicle its own folder), upkeep by vehicle. When a person, owner or name changes, the
// files follow on their own (empty folders left behind go); files from before folders move only with "Move files
// into folders", which asks first. A file shared by a Vault document and a task stays with the document. The phone
// does the same in OneDrive. Read-only moves nothing.
const { loadApp, fakeFile, fakeFolder, answer, tick, check, done } = require('./helpers');

(async () => {
  const folder = fakeFolder('Attachments');
  const app = loadApp({ pickFolder: folder, pickFile: fakeFile() });
  const { win, doc, PA } = app;
  await PA.DF.createNew();
  const People = win.eval('People');
  const Assets = win.eval('Assets');
  const Files = win.eval('Files');
  const changed = win.eval('changed');
  PA.AT.SETTLE_MS = 5;
  doc.querySelector('[data-view="settings"]').click();
  doc.querySelector('[data-action="at-folder"]').click();
  await tick(10);
  const file = (name, type = 'application/pdf') => new win.File(['x'], name, { type });
  const robin = People.add('Robin');

  // --- New files go to their person's and area's folder ---
  const t = PA.addTask({ title: 'Phone bill', due: '2026-11-05T23:59' });
  await PA.AT.add(t, [file('a.pdf')]);
  check(t.attachments[0].file === 'Me/Tasks/Phone bill 2026.pdf' && folder.at('Me/Tasks/Phone bill 2026.pdf'), 'a task\'s file goes to Me › Tasks');
  const rt = PA.addTask({ title: 'School fees', people: [robin.id] });
  await PA.AT.add(rt, [file('b.pdf')]);
  check(rt.attachments[0].file.startsWith('Robin/Tasks/'), 'someone else\'s task: their folder');
  const both = PA.addTask({ title: 'Holiday', people: ['me', robin.id] });
  await PA.AT.add(both, [file('c.pdf')]);
  check(both.attachments[0].file.startsWith('Shared/Tasks/'), 'a task on two people: Shared');
  const gold = Assets.add({ kind: 'gold', name: 'Bangles', grams: 20 });
  await PA.AT.add(gold, [file('g.jpg', 'image/jpeg')], 'assets', true);
  check(gold.attachments[0].file.startsWith('Me/Assets/Gold/'), 'gold: Me › Assets › Gold');
  const car = Assets.add({ kind: 'vehicle', name: 'Civic' });
  await PA.AT.add(car, [file('car.jpg', 'image/jpeg')], 'assets', true);
  check(car.attachments[0].file.startsWith('Me/Assets/Vehicles/Civic/'), 'a vehicle has its own folder under Vehicles');
  const entry = { id: 'e1', asset: car.id, item: 'Oil change', attachments: [] };
  PA.DB.upkeep.push(entry);
  await PA.AT.add(entry, [file('r.jpg', 'image/jpeg')], 'upkeep', true);
  check(entry.attachments[0].file.startsWith('Me/Upkeep/Civic/'), 'upkeep: by vehicle');
  const doc1 = win.eval('Vault').add({ cat: 'id', name: 'Passport', people: [robin.id] });
  await PA.AT.add(doc1, [file('p.pdf')], 'docs', true);
  check(doc1.attachments[0].file === 'Robin/Vault/Passport 2026.pdf', 'a document: the person\'s Vault folder');

  // --- Changes: the files follow on their own ---
  t.people = [robin.id];
  changed('tasks');
  await tick(40);
  check(t.attachments[0].file === 'Robin/Tasks/Phone bill 2026.pdf' && folder.at('Robin/Tasks/Phone bill 2026.pdf') && !folder.at('Me/Tasks/Phone bill 2026.pdf'), 'a task given to someone else: its file moves to their folder');
  Assets.transfer(gold, PA.toISO(new Date()), [{ id: 'me', share: 50 }, { id: robin.id, share: 50 }]);
  changed('assets');
  await tick(40);
  check(gold.attachments[0].file.startsWith('Shared/Assets/Gold/') && folder.at(gold.attachments[0].file), 'an asset now owned by two: its files move to Shared');
  check(!folder.dirs.Me.dirs.Assets.dirs.Gold, 'the folder it left empty goes');
  People.rename(robin.id, 'Robin Hood');
  await tick(40);
  check(rt.attachments[0].file.startsWith('Robin Hood/Tasks/') && doc1.attachments[0].file === 'Robin Hood/Vault/Passport 2026.pdf' && !folder.dirs.Robin, 'renaming a person renames their folder (the files move, the old folder goes)');
  check(doc1.attachments[0].name === 'Passport 2026.pdf', 'the name shown is the file\'s own name');

  // --- Files from before folders: only the button moves them, after asking ---
  await folder.getFileHandle('old bill.pdf', { create: true });
  await folder.getFileHandle('licence.pdf', { create: true });
  const old = PA.addTask({ title: 'Old bill' });
  old.attachments.push({ id: 'o1', name: 'old bill.pdf', file: 'old bill.pdf', size: 1, type: 'application/pdf' });
  const lic = win.eval('Vault').add({ cat: 'id', name: 'Licence' });
  lic.attachments.push({ id: 'l1', name: 'licence.pdf', file: 'licence.pdf', size: 1, type: 'application/pdf' });
  const linked = PA.addTask({ title: 'Renew licence' }); // the same file, from the Vault
  linked.attachments.push({ id: 'l2', name: 'licence.pdf', file: 'licence.pdf', size: 1, type: 'application/pdf' });
  const gone = PA.addTask({ title: 'Gone' });
  gone.attachments.push({ id: 'x', name: 'missing.pdf', file: 'missing.pdf', size: 1, type: 'application/pdf' });
  PA.DB.trash.push({ id: 'tr', kind: 'tasks', at: Date.now(), item: { id: 'tt', title: 'Binned', attachments: [{ id: 'b1', name: 'old bill.pdf', file: 'old bill.pdf' }] } });
  changed('tasks', 'docs', 'trash');
  await tick(40);
  check(old.attachments[0].file === 'old bill.pdf' && folder.files['old bill.pdf'], 'loose files never move by themselves');
  PA.render();
  check(/3 attached files sit loose/.test(doc.querySelector('#main').textContent) && doc.querySelector('[data-action="at-tidy"]'), 'Settings offers to move the 3 loose files');
  doc.querySelector('[data-action="at-tidy"]').click();
  const q = await answer(win, false);
  check(/Move 3 files into folders/.test(q) && old.attachments[0].file === 'old bill.pdf', 'it asks first; No moves nothing');
  doc.querySelector('[data-action="at-tidy"]').click();
  await answer(win, true);
  await tick(60);
  check(old.attachments[0].file === 'Me/Tasks/old bill.pdf' && folder.at('Me/Tasks/old bill.pdf') && !folder.files['old bill.pdf'], 'Yes: each file moves to its folder');
  check(lic.attachments[0].file === 'Me/Vault/licence.pdf' && linked.attachments[0].file === 'Me/Vault/licence.pdf', 'a file a document and a task share goes with the document, and both point to it');
  check(PA.DB.trash.find((e) => e.id === 'tr').item.attachments[0].file === 'Me/Tasks/old bill.pdf', 'a task in the Trash points to the moved file too (restoring it still works)');
  check(gone.attachments[0].file === 'missing.pdf' && /couldn't be found or moved/.test(doc.querySelector('#toasts').textContent), 'a file that isn\'t there stays as it was, and it says so');
  const saved = JSON.parse(win.localStorage.getItem('pa_tasks')).find((x) => x.id === old.id);
  check(saved.attachments[0].file === 'Me/Tasks/old bill.pdf', 'saved (through changed)');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));

  // --- Read-only moves nothing ---
  const storage = {};
  for (let i = 0; i < win.localStorage.length; i++) { const k = win.localStorage.key(i); storage[k] = win.localStorage.getItem(k); }
  app.close();
  const ro = loadApp({ storage, query: '?readonly' });
  ro.PA.AT.dir = folder;
  ro.PA.AT.status = 'ok';
  const before = folder.paths().sort().join('|');
  ro.PA.DB.tasks.push(ro.PA.normalizeTask({ id: 'r', title: 'Old', attachments: [{ id: 'r1', name: 'old bill.pdf', file: 'Me/Tasks/old bill.pdf' }], people: [robin.id] }));
  check((await ro.PA.AT.settle(true)) === 0 && folder.paths().sort().join('|') === before, 'read-only: no file moves');
  ro.close();

  // --- The phone: the same in OneDrive ---
  const g = fakeOneDrive();
  g.files['bill.pdf'] = {};
  g.file = { eTag: '"v1"', content: { app: 'PA App', version: 2, saveToken: 't0', savedAt: new Date().toISOString(), savedFrom: 'Laptop',
    data: { tasks: [{ id: 'a', title: 'Bill', priority: 'low', done: false, updated: 1,
      attachments: [{ id: 'x1', name: 'bill.pdf', file: 'bill.pdf', size: 1, type: 'application/pdf', added: 1, keep: false }] }], notes: [], events: [] } } };
  const phone = loadApp({ fsa: false, fetch: g.fetch, storage: { dev_odAuth: JSON.stringify({ access: 'od', exp: Date.now() + 3600e3, refresh: 'odr' }) } });
  phone.PA.OD.SAVE_MS = 10;
  phone.PA.AT.SETTLE_MS = 5;
  await tick(100);
  phone.doc.querySelector('[data-view="settings"]').click();
  phone.doc.querySelector('[data-action="at-tidy"]').click();
  await answer(phone.win, true);
  await tick(100);
  const pt = phone.PA.DB.tasks[0];
  check(pt.attachments[0].file === 'Me/Tasks/bill.pdf' && g.files['Me/Tasks/bill.pdf'] && !g.files['bill.pdf'], 'phone: the button moves files in OneDrive, making the folders');
  check(g.folders.includes('Me') && g.folders.includes('Me/Tasks'), 'the folders are made one inside the other');
  pt.people = [];
  phone.win.eval('People').add('Sam');
  pt.people = [phone.PA.DB.people.find((p) => p.name === 'Sam').id];
  phone.win.eval('changed')('tasks');
  await tick(150);
  check(pt.attachments[0].file === 'Sam/Tasks/bill.pdf' && g.files['Sam/Tasks/bill.pdf'] && !g.folders.includes('Me/Tasks'), 'phone: a task given to someone else moves its file; the empty folder goes');
  check(phone.errors.length === 0, 'no script errors on the phone' + (phone.errors[0] ? ': ' + phone.errors[0] : ''));
  phone.close();
  done();
})();

// A OneDrive with folders: files and folders by path inside Attachments.
function fakeOneDrive() {
  const APPROOT = 'https://graph.microsoft.com/v1.0/me/drive/special/approot';
  const g = { file: null, files: {}, folders: [], calls: [] };
  const ids = {};
  const reply = (status, j) => ({ ok: status < 300, status, json: async () => (j == null ? j : JSON.parse(JSON.stringify(j))) });
  g.fetch = async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    if (url.startsWith('https://login.microsoftonline.com/')) return reply(200, { access_token: 'od', expires_in: 3600, refresh_token: 'odr' });
    g.calls.push({ method, url });
    const path = url.split('?')[0];
    if (url.includes('/approot:/Backups/')) return reply(201, { id: 'B' });
    if (path === APPROOT) return reply(200, { id: 'root', name: 'PA App' });
    if (path === `${APPROOT}/children`) return reply(200, { value: [{ id: 'F1', name: 'pa-app-data.json', eTag: g.file.eTag, file: {} }] });
    if (path.endsWith('/items/F1') && method === 'GET') return reply(200, { id: 'F1', name: 'pa-app-data.json', eTag: g.file.eTag });
    if (path.endsWith('/items/F1/content') && method === 'GET') return reply(200, g.file.content);
    if (path.endsWith('/items/F1/content') && method === 'PUT') {
      g.file = { content: JSON.parse(opts.body), eTag: `"v${Date.now()}${Math.random()}"` };
      return reply(200, { id: 'F1', name: 'pa-app-data.json', eTag: g.file.eTag });
    }
    const mk = (parent, body) => {
      const p = parent ? `${parent}/${body.name}` : body.name;
      if (g.folders.includes(p)) return reply(409, { error: { message: 'exists' } });
      g.folders.push(p);
      ids[`D-${p}`] = p;
      return reply(201, { id: `D-${p}`, name: body.name });
    };
    if (path === `${APPROOT}:/Attachments:/children` && method === 'POST') return mk('', JSON.parse(opts.body));
    const item = path.match(/\/me\/drive\/items\/(D-[^/]+)\/children$/);
    if (item && method === 'POST') return mk(ids[decodeURIComponent(item[1])], JSON.parse(opts.body));
    const kids = path.match(/^.*\/approot:\/Attachments\/(.+):\/children$/);
    if (kids && method === 'GET') {
      const p = decodeURIComponent(kids[1]);
      const inside = [...Object.keys(g.files), ...g.folders].filter((x) => x.startsWith(`${p}/`));
      return reply(200, { value: inside.slice(0, 1).map((x) => ({ name: x })) });
    }
    const m = path.match(/^.*\/approot:\/Attachments\/([^:]+):$/);
    if (m) {
      const p = decodeURIComponent(m[1]);
      if (method === 'GET') {
        if (g.folders.includes(p)) return reply(200, { id: `D-${p}`, name: p.split('/').pop(), folder: {} });
        if (g.files[p]) return reply(200, { id: `A-${p}`, name: p.split('/').pop() });
        return reply(404, { error: { message: 'Item not found' } });
      }
      if (method === 'PATCH') {
        const body = JSON.parse(opts.body);
        if (!g.files[p]) return reply(404, { error: { message: 'Item not found' } });
        const dir = body.parentReference ? ids[body.parentReference.id] : p.slice(0, p.lastIndexOf('/'));
        const to = dir ? `${dir}/${body.name}` : body.name;
        if (g.files[to]) return reply(409, { error: { message: 'Name already exists' } });
        g.files[to] = g.files[p];
        delete g.files[p];
        return reply(200, { id: `A-${to}`, name: body.name });
      }
      if (method === 'DELETE') {
        if (g.folders.includes(p)) { g.folders = g.folders.filter((x) => x !== p && !x.startsWith(`${p}/`)); return { ok: true, status: 204, json: async () => null }; }
        if (!g.files[p]) return reply(404, { error: { message: 'Item not found' } });
        delete g.files[p];
        return { ok: true, status: 204, json: async () => null };
      }
    }
    return reply(400, { error: { message: `unexpected ${method} ${url}` } });
  };
  return g;
}
