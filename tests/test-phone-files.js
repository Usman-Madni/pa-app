// Phone editing, stage D: attached files live in OneDrive › Apps › PA App › Attachments (the laptop's attachments
// folder, moved there). Signed in, the phone opens them from OneDrive; while editing it adds files there (a photo
// from the camera too), named the same way as on the laptop and never over an existing one. It reaches only the
// app's own folder, with the permission it already has.
const { loadApp, tick, check, done } = require('./helpers');

const APPROOT = 'https://graph.microsoft.com/v1.0/me/drive/special/approot';
function fakeOneDrive() {
  const g = { file: null, files: {}, calls: [], offline: false };
  const reply = (status, j) => ({ ok: status < 300, status, json: async () => (j == null ? j : JSON.parse(JSON.stringify(j))) });
  g.fetch = async (url, opts = {}) => {
    if (g.offline) throw new TypeError('Failed to fetch');
    const method = (opts.method || 'GET').toUpperCase();
    if (url.startsWith('https://login.microsoftonline.com/')) return reply(200, { access_token: 'od', expires_in: 3600, refresh_token: 'odr' });
    const headers = opts.headers || {};
    g.calls.push({ method, url, headers, body: opts.body });
    const path = url.split('?')[0];
    const query = url.split('?')[1] || '';
    if (path === APPROOT) return reply(200, { id: 'root', name: 'PA App' });
    if (path === `${APPROOT}/children`) return reply(200, { value: [{ id: 'F1', name: 'pa-app-data.json', eTag: g.file.eTag, file: {} }] });
    if (path.endsWith('/items/F1') && method === 'GET') return reply(200, { id: 'F1', name: 'pa-app-data.json', eTag: g.file.eTag });
    if (path.endsWith('/items/F1/content') && method === 'GET') return reply(200, g.file.content);
    if (path.endsWith('/items/F1/content') && method === 'PUT') {
      g.file = { content: JSON.parse(opts.body), eTag: `"v${Date.now()}${Math.random()}"` };
      return reply(200, { id: 'F1', name: 'pa-app-data.json', eTag: g.file.eTag });
    }
    const m = path.match(/^.*\/approot:\/Attachments\/([^:]+):(\/content)?$/);
    if (m) {
      let name = decodeURIComponent(m[1]);
      if (method === 'GET' && !m[2]) {
        if (!g.files[name]) return reply(404, { error: { message: 'Item not found' } });
        return reply(200, { id: 'A-' + name, name, '@microsoft.graph.downloadUrl': `https://download.example/${encodeURIComponent(name)}` });
      }
      if (method === 'PUT' && m[2]) {
        if (g.files[name] && /conflictBehavior=rename/.test(decodeURIComponent(query))) {
          const dot = name.lastIndexOf('.');
          name = `${name.slice(0, dot)} 1${name.slice(dot)}`; // what OneDrive does: a free name next to it
        }
        g.files[name] = { size: opts.body.size, type: headers['Content-Type'], blob: opts.body };
        return reply(201, { id: 'A-' + name, name, size: opts.body.size });
      }
    }
    return reply(400, { error: { message: `unexpected ${method} ${url}` } });
  };
  return g;
}
const signedIn = { dev_odAuth: JSON.stringify({ access: 'od', exp: Date.now() + 3600e3, refresh: 'odr' }) };

(async () => {
  const g = fakeOneDrive();
  g.file = { eTag: '"v1"', content: { app: 'PA App', version: 2, saveToken: 't0', savedAt: new Date().toISOString(), savedFrom: 'Laptop',
    data: { tasks: [{ id: 'a', title: 'Phone bill', period: 'Nov 26', due: '2026-11-20', priority: 'low', done: false, updated: 1,
      attachments: [{ id: 'x1', name: 'Phone bill Oct 26.pdf', file: 'Phone bill Oct 26.pdf', size: 2048, type: 'application/pdf', added: 1, keep: false },
        { id: 'x2', name: 'Gone.pdf', file: 'Gone.pdf', size: 10, type: 'application/pdf', added: 1, keep: false }] }], notes: [], events: [] } } };
  g.files['Phone bill Oct 26.pdf'] = { size: 2048, type: 'application/pdf' };
  const app = loadApp({ fsa: false, fetch: g.fetch, storage: signedIn });
  const { win, doc, PA } = app;
  PA.OD.SAVE_MS = 10;
  await tick(100);
  check(PA.state.phone && !PA.state.readOnly, 'signed in and editing on the phone');

  // --- The task panel on the phone: files can be added, a photo taken ---
  PA.state.openTask = 'a';
  PA.renderDrawer();
  const pick = doc.querySelector('#drawer input[type="file"][data-input="attach"]:not([capture])');
  const photo = doc.querySelector('#drawer input[type="file"][data-input="attach"][capture]');
  check(pick && pick.multiple, 'Add file: pick one or more files');
  check(photo && /image/.test(photo.accept), 'Take photo: opens the camera');
  check(!/open on your computer only/.test(doc.querySelector('#drawer').textContent), 'no "open on your computer only" note any more');
  check(!doc.querySelector('#drawer [data-action="at-folder"]'), 'no folder to choose on the phone');

  // --- Opening a file: from OneDrive, in a tab opened at the tap (phones block one opened later) ---
  const opened = [];
  win.open = () => { const w = { location: { href: '' }, closed: false, close() { w.closed = true; }, document: { title: '', body: { textContent: '' } } }; opened.push(w); return w; };
  doc.querySelector('#drawer [data-action="open-attach"][data-att="x1"]').click();
  await tick(50);
  check(opened.length === 1 && opened[0].location.href === 'https://download.example/Phone%20bill%20Oct%2026.pdf', 'tapping a file opens it from OneDrive');
  doc.querySelector('#drawer [data-action="open-attach"][data-att="x2"]').click();
  await tick(50);
  check(opened[1].closed && /not in .*Attachments/.test([...doc.querySelectorAll('.toast')].map((x) => x.textContent).join(' ')), 'a file that is not there: says where it looked, and the empty tab closes');

  // --- Adding: uploaded into Attachments, named like on the laptop, never over another file ---
  const f1 = new win.File(['%PDF bill'], 'IMG_2031.pdf', { type: 'application/pdf' });
  await PA.AT.add(PA.DB.tasks[0], [f1]);
  await tick(50);
  const put = g.calls.filter((c) => c.method === 'PUT' && /Attachments/.test(c.url));
  check(put.length === 1 && /conflictBehavior=rename/.test(decodeURIComponent(put[0].url)), 'uploaded to OneDrive, asking for a free name if taken');
  check(put[0].body === f1 && put[0].headers['Content-Type'] === 'application/pdf', 'the file itself is sent, with its type');
  check(g.files['Phone bill Nov 26.pdf'] && PA.DB.tasks[0].attachments.some((a) => a.file === 'Phone bill Nov 26.pdf' && a.original === 'IMG_2031.pdf' && a.size === f1.size && !a.keep), 'named like on the laptop (title and moving part) and listed on the task');
  const f2 = new win.File(['%PDF again'], 'scan.pdf', { type: 'application/pdf' });
  await PA.AT.add(PA.DB.tasks[0], [f2]);
  await tick(50);
  check(PA.DB.tasks[0].attachments.some((a) => a.file === 'Phone bill Nov 26 1.pdf'), 'same name again: kept with the free name OneDrive gave it');
  await tick(100);
  check(g.file.content.data.tasks[0].attachments.length === 4, 'the data file in OneDrive lists the new files');
  check(g.calls.every((c) => !/\/me\/drive\/root|\/me\/drive\/items\/(?!F1)/.test(c.url)), 'only the app\'s own folder is used');

  // --- A file that can't be uploaded: says so, adds nothing ---
  g.offline = true;
  const before = PA.DB.tasks[0].attachments.length;
  await PA.AT.add(PA.DB.tasks[0], [new win.File(['x'], 'b.jpg', { type: 'image/jpeg' })]);
  check(PA.DB.tasks[0].attachments.length === before, 'no signal: nothing is added');
  g.offline = false;

  // --- Read-only on the phone: files open, but none are added ---
  const ro = loadApp({ fsa: false, fetch: g.fetch, storage: signedIn, query: '?readonly' });
  await tick(100);
  ro.PA.state.openTask = 'a';
  ro.PA.renderDrawer();
  check(ro.PA.state.readOnly && !ro.doc.querySelector('#drawer [data-input="attach"]'), 'read-only: no adding files');
  const roOpened = [];
  ro.win.open = () => { const w = { location: { href: '' }, close() {}, document: { title: '', body: { textContent: '' } } }; roOpened.push(w); return w; };
  // Read-only disables the panel (a <fieldset>). A browser still lets a link inside it be tapped; jsdom's click()
  // doesn't, so send the tap as an event. The file name must be a link, not a button, for this to work.
  const link = ro.doc.querySelector('#drawer [data-action="open-attach"][data-att="x1"]');
  check(link.tagName === 'A', 'the file name is a link (a button in a read-only panel can\'t be tapped)');
  link.dispatchEvent(new ro.win.MouseEvent('click', { bubbles: true, cancelable: true }));
  await tick(50);
  check(roOpened[0] && roOpened[0].location.href.startsWith('https://download.example/'), 'read-only but signed in: files still open');
  check(app.errors.length === 0 && ro.errors.length === 0, 'no script errors' + (app.errors[0] || ro.errors[0] ? ': ' + (app.errors[0] || ro.errors[0]) : ''));
  ro.close();
  app.close();
  done();
})();
