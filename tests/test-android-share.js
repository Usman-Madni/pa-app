// Share › Butler (the Android app from shell 4): another app shares files or words; the share plugin hands over each
// file's path in the app's cache, Butler reads it (Filesystem), deletes the copy, and the "Shared with Butler" sheet
// asks where it goes: a new task (words in its notes), a task's files, or a Vault folder. Read-only, nothing is saved.
const { loadApp, tick, check, done } = require('./helpers');

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/140.0 Mobile Safari/537.36 ButlerAndroid/4';

function fakeOneDrive() {
  const g = { file: null, uploads: [], n: 0 };
  const reply = (status, j) => ({ ok: status < 300, status, json: async () => (j == null ? j : JSON.parse(JSON.stringify(j))) });
  g.fetch = async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    if (url.startsWith('https://login.microsoftonline.com/')) return reply(200, { access_token: 'od', expires_in: 3600, refresh_token: 'odr' });
    if (url.includes('/approot:/Backups/')) return reply(201, { id: 'B1' });
    if (url.includes('/approot:/Attachments/') && method === 'PUT') {
      const name = decodeURIComponent(url.split(':/content')[0].split('/').pop());
      g.uploads.push({ name, size: opts.body && opts.body.size });
      return reply(201, { id: `U${g.uploads.length}`, name });
    }
    const path = url.replace('https://graph.microsoft.com/v1.0', '').split('?')[0];
    if (path === '/me/drive/special/approot') return reply(200, { id: 'root', name: 'PA App' });
    if (path === '/me/drive/special/approot/children') return reply(200, { value: [{ id: 'F1', name: 'pa-app-data.json', eTag: g.file.eTag, file: {} }] });
    if (path === '/me/drive/items/F1' && method === 'GET') return reply(200, { id: 'F1', name: 'pa-app-data.json', eTag: g.file.eTag });
    if (path === '/me/drive/items/F1/content' && method === 'GET') return reply(200, g.file.content);
    if (path === '/me/drive/items/F1/content' && method === 'PUT') { g.set(JSON.parse(opts.body)); return reply(200, { id: 'F1', eTag: g.file.eTag }); }
    return reply(404, { error: { message: `not here: ${method} ${path}` } });
  };
  g.set = (content) => { g.n++; g.file = { content, eTag: `"v${g.n}"` }; };
  return g;
}
const fakeApp = () => {
  const a = { cache: {}, deleted: [], listeners: {} };
  a.plugins = {
    CapacitorShareTarget: { addListener: (ev, fn) => { a.listeners[ev] = fn; } },
    Filesystem: {
      readFile: async ({ path }) => { if (!(path in a.cache)) throw new Error('not found'); return { data: Buffer.from(a.cache[path]).toString('base64') }; },
      deleteFile: async ({ path }) => { a.deleted.push(path); delete a.cache[path]; },
    },
  };
  return a;
};

(async () => {
  const g = fakeOneDrive();
  g.set({ app: 'PA App', version: 2, saveToken: 't0', savedAt: new Date().toISOString(), savedFrom: 'Laptop',
    data: { tasks: [{ id: 'a', title: 'Car insurance', due: '', priority: 'low', done: false, updated: 1 }], notes: [], events: [] } });
  const a = fakeApp();
  const signedIn = { dev_odAuth: JSON.stringify({ access: 'od', exp: Date.now() + 3600e3, refresh: 'odr' }) };
  const app = loadApp({ fsa: false, ua: UA, fetch: g.fetch, storage: signedIn, before: (w) => { w.Capacitor = { isNativePlatform: () => true, Plugins: a.plugins }; } });
  const { win, doc, PA } = app;
  PA.OD.SAVE_MS = 10;
  await tick(150);
  check(!PA.state.readOnly && typeof a.listeners.shareReceived === 'function', 'the app (version 4) listens for shares');
  const sheet = () => doc.querySelector('#modal [data-form="asset-share"]');
  const submit = () => sheet().dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  const pick = (v) => { const r = sheet().querySelector(`input[name="to"][value="${v}"]`); r.checked = true; r.dispatchEvent(new win.Event('change', { bubbles: true })); };

  // --- A photo shared from the gallery: a new task with it ---
  a.cache['/cache/shared_files/share-1.tmp'] = 'JPEGDATA';
  await a.listeners.shareReceived({ title: '', texts: [], files: [{ uri: '/cache/shared_files/share-1.tmp', name: 'Receipt March.jpg', mimeType: 'image/jpeg' }] });
  await tick(20);
  check(sheet() && /Shared with Butler/.test(sheet().textContent) && /Receipt March\.jpg/.test(sheet().textContent), 'a share opens "Shared with Butler", naming the file');
  check(a.deleted.includes('/cache/shared_files/share-1.tmp'), 'the copy in the app\'s cache is deleted once read');
  check(sheet().elements.title.value === 'Receipt March', 'New task is the choice, named after the file');
  sheet().elements.title.value = 'Claim the receipt';
  submit();
  await tick(150);
  const t = PA.DB.tasks.find((x) => x.title === 'Claim the receipt');
  check(t && t.attachments.length === 1 && t.attachments[0].original === 'Receipt March.jpg' && t.attachments[0].size === 8 && g.uploads.length === 1, 'Add task makes the task with the photo attached (uploaded to OneDrive, as Take photo does)');
  check(PA.state.openTask === t.id, 'and opens it');
  win.eval('closeTaskDrawer')();

  // --- Two PDFs: added to a task already there ---
  a.cache['/c/2.tmp'] = 'PDF-ONE';
  a.cache['/c/3.tmp'] = 'PDF-TWO!';
  await a.listeners.shareReceived({ files: [{ uri: '/c/2.tmp', name: 'Policy.pdf', mimeType: 'application/pdf' }, { uri: '/c/3.tmp', name: 'Schedule.pdf', mimeType: 'application/pdf' }] });
  await tick(20);
  pick('pick');
  const target = (v) => { const r = sheet().querySelector(`input[name="target"][value="${v}"]`); r.checked = true; return r; };
  check(sheet().querySelector('input[name="target"][value="tasks:a"]'), 'Add to… lists your open tasks');
  target('tasks:a');
  submit();
  await tick(150);
  const ins = PA.DB.tasks.find((x) => x.id === 'a');
  check(ins.attachments.map((x) => x.original).join(',') === 'Policy.pdf,Schedule.pdf' && ins.attachments[1].type === 'application/pdf', 'both files are added to that task');

  // --- A PDF to the Vault ---
  a.cache['/c/4.tmp'] = 'PASSPORT';
  await a.listeners.shareReceived({ files: [{ uri: '/c/4.tmp', name: 'Passport.pdf', mimeType: 'application/pdf' }] });
  await tick(20);
  pick('pick');
  const opts = [...sheet().querySelectorAll('input[name="target"]')].map((o) => o.value).filter((v) => v.startsWith('vault:folder|'));
  check(opts.length && opts.every((v) => !/\|(Assets|Tasks|Upkeep|Musings)(\/|$)/.test(v)), 'Vault folders are listed (never Butler\'s own Assets, Tasks, Upkeep or Musings)');
  // narrowing it down: the Vault chip, then the search box
  const kind = sheet().querySelector('[data-share-kind][value="vault"]');
  kind.checked = true;
  kind.dispatchEvent(new win.Event('change', { bubbles: true }));
  const shown = () => [...sheet().querySelectorAll('.share-list li')].filter((li) => !li.hidden);
  check(shown().length && shown().every((li) => li.dataset.kind === 'vault'), 'the Vault chip shows only the Vault');
  const q = sheet().querySelector('[data-share-q]');
  q.value = 'zzz nothing';
  q.dispatchEvent(new win.Event('input', { bubbles: true }));
  check(!shown().length && !sheet().querySelector('.share-none').hidden, 'a search with no match says so');
  q.value = 'documents';
  q.dispatchEvent(new win.Event('input', { bubbles: true }));
  check(shown().length && shown().every((li) => /documents/.test(li.dataset.find)), 'the search narrows it to what matches');
  target(opts[0]);
  submit();
  await tick(200);
  const doc1 = PA.DB.docs.find((d) => d.name === 'Passport');
  check(doc1 && doc1.plain && doc1.attachments.length === 1 && doc1.folder === opts[0].split('|')[2], 'the file goes into that Vault folder');

  // --- Words shared (a link from a message): a task with them in its notes ---
  await a.listeners.shareReceived({ title: '', texts: ['Book the car service https://example.com/booking'], files: [] });
  await tick(20);
  check(sheet().querySelector('input[name="to"][value="note"]') && sheet().querySelector('input[name="to"][value="pick"]'), 'words alone: New task, New note, or Add to…');
  check(sheet().elements.title.value === 'Book the car service https://example.com/booking', 'named after the words');
  sheet().elements.title.value = 'Book the car service';
  submit();
  await tick(100);
  const w = PA.DB.tasks.find((x) => x.title === 'Book the car service');
  check(w && /example\.com\/booking/.test(w.notes), 'and what was shared goes in its notes');
  win.eval('closeTaskDrawer')();

  // --- A link added to a task already there: it goes under that task's notes, which are kept ---
  ins.notes = 'Ask about the excess.';
  ins.updated = 1;
  await a.listeners.shareReceived({ title: '', texts: ['https://example.com/policy-terms'], files: [] });
  await tick(20);
  pick('pick');
  check(!sheet().querySelector('input[name="target"][value^="vault:folder|"]'), 'words alone: no Vault folders (they keep only files)');
  target('tasks:a');
  check(/added to its notes/.test(sheet().textContent), 'the sheet says the words go in its notes');
  submit();
  await tick(100);
  check(ins.notes === 'Ask about the excess.\n\nhttps://example.com/policy-terms' && ins.attachments.length === 2, 'the link is added below the task\'s own notes (nothing else changed)');
  check(PA.state.openTask === 'a' && ins.updated > 1, 'the task opens, and the change is stamped (saved through changed)');
  win.eval('closeTaskDrawer')();

  // --- Anywhere that keeps files: an asset, a connection's bill, an upkeep entry ---
  const Assets = win.eval('Assets');
  const car = Assets.add({ kind: 'vehicle', name: 'Civic' });
  const pump = win.eval('Utilities').add({ type: 'Fuel', name: 'Pump', cars: [car.id] });
  const bill = win.eval('Utilities').addBill({ utility: pump.id, month: '2026-11', date: '', amount: 5000, period: 'Nov 2026' });
  const oil = win.eval('Upkeep').add({ asset: car.id, item: 'Oil change', date: '2026-11-20', cost: 0 });
  win.eval('changed')('assets', 'utilities', 'bills', 'upkeep');
  const shareFile = async (name) => { a.cache[`/c/${name}`] = 'DATA'; await a.listeners.shareReceived({ files: [{ uri: `/c/${name}`, name, mimeType: 'image/jpeg' }] }); await tick(20); pick('pick'); };
  await shareFile('Civic papers.jpg');
  const all = [...sheet().querySelectorAll('input[name="target"]')].map((o) => o.value);
  check([`assets:${car.id}`, `utilities:${pump.id}`, `bills:${bill.id}`, `upkeep:${oil.id}`].every((v) => all.includes(v)) && !all.some((v) => v.startsWith('notes:')), 'files: assets, connections, bills and upkeep are offered (notes aren\'t: they keep no files)');
  const sk = (k) => { const r = sheet().querySelector(`[data-share-kind][value="${k}"]`); r.checked = true; r.dispatchEvent(new win.Event('change', { bubbles: true })); };
  sk('assets');
  check(shown().every((li) => li.dataset.kind === 'assets') && shown().some((li) => /civic/.test(li.dataset.find)), 'the Assets chip narrows it to assets');
  target(`assets:${car.id}`);
  submit();
  await tick(200);
  check(car.attachments.length === 1 && car.attachments[0].original === 'Civic papers.jpg', 'a file shared to an asset is in its files');
  win.eval('closeAssetForm')(true);
  await shareFile('Fuel Nov.jpg');
  target(`bills:${bill.id}`);
  submit();
  await tick(200);
  check(PA.DB.docs.some((d) => d.bill === bill.id), 'to a bill: kept as the bill\'s scan');
  win.eval('closeAssetForm')(true);
  await a.listeners.shareReceived({ texts: ['Synthetic 5W-30, 4 litres'], files: [] });
  await tick(20);
  pick('pick');
  target(`upkeep:${oil.id}`);
  submit();
  await tick(100);
  check(/Synthetic 5W-30/.test(oil.notes), 'words to an upkeep entry go in its notes');
  win.eval('closeAssetForm')(true);

  // --- Words to a new note ---
  await a.listeners.shareReceived({ texts: ['Garage: call before 5, ask for the manager'], files: [] });
  await tick(20);
  pick('note');
  sheet().elements.title.value = 'Garage number';
  submit();
  await tick(50);
  const note = PA.DB.notes.find((n) => n.title === 'Garage number');
  check(note && /call before 5/.test(note.body) && PA.state.view === 'notes' && PA.state.activeNote === note.id, 'New note: a note with the words, and it opens');

  // --- The same share handed over twice: one sheet ---
  win.eval('closeAssetForm')(true);
  a.cache['/c/5.tmp'] = 'X';
  const twice = { files: [{ uri: '/c/5.tmp', name: 'Once.jpg', mimeType: 'image/jpeg' }] };
  await a.listeners.shareReceived(twice);
  win.eval('closeAssetForm')(true);
  a.cache['/c/5.tmp'] = 'X'; // its copy still there the second time
  await a.listeners.shareReceived(twice);
  check(!sheet(), 'the same share handed over twice opens it once');

  // --- A file that can't be read is said so ---
  await a.listeners.shareReceived({ files: [{ uri: '/c/gone.tmp', name: 'Gone.pdf' }, { uri: '/c/6.tmp', name: 'Here.jpg' }].map((x) => (x.uri === '/c/6.tmp' ? (a.cache[x.uri] = 'Y', x) : x)) });
  await tick(20);
  check(/1 file couldn't be read/.test(sheet().textContent) && /Here\.jpg/.test(sheet().textContent), 'a file that couldn\'t be read is named as such, the rest still offered');
  win.eval('closeAssetForm')(true);
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();

  // --- Read-only (not signed in): shown, nothing saved ---
  const b = fakeApp();
  const ro = loadApp({ fsa: false, ua: UA, before: (w2) => { w2.Capacitor = { isNativePlatform: () => true, Plugins: b.plugins }; } });
  await tick(50);
  b.cache['/c/7.tmp'] = 'Z';
  await b.listeners.shareReceived({ files: [{ uri: '/c/7.tmp', name: 'Bill.pdf' }] });
  await tick(20);
  const s = ro.doc.querySelector('#modal [data-form="asset-share"]');
  check(s && /Read-only/.test(s.textContent) && /sign in to OneDrive/.test(s.textContent) && !s.querySelector('button.primary'), 'read-only: the sheet says to sign in, and has nothing to press but Close');
  ro.close();

  // --- An older app (version 3): no share listener ---
  const c = fakeApp();
  const old = loadApp({ fsa: false, ua: UA.replace('/4', '/3'), before: (w3) => { w3.Capacitor = { isNativePlatform: () => true, Plugins: c.plugins }; } });
  await tick(50);
  check(!c.listeners.shareReceived, 'an older app isn\'t asked for shares');
  old.close();
  done();
})();
