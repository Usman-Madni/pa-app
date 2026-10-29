// Phone reminders through Microsoft To Do, against a fake Microsoft: sign-in in a pop-up (PKCE), every open task
// sent with its next reminder, only changes sent again, repeats get their own copy, deletions both ways, lost links
// never make duplicates, safety limits, signing in again, and phones never sync.
const nodeCrypto = require('crypto');
const { loadApp, tick, check, done } = require('./helpers');

// A pretend Microsoft: the sign-in token endpoint plus the To Do lists and tasks of Microsoft Graph.
function fakeMicrosoft() {
  const g = { lists: [], tasks: new Map(), calls: [], tokenCalls: [], n: 0, failToken: false };
  const reply = (status, j) => ({ ok: status < 300, status, json: async () => j });
  g.fetch = async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    if (url.startsWith('https://login.microsoftonline.com/')) {
      g.tokenCalls.push(Object.fromEntries(new URLSearchParams(opts.body)));
      if (g.failToken) return reply(400, { error: 'invalid_grant', error_description: 'The refresh token has expired.' });
      g.n++;
      return reply(200, { access_token: `tok${g.n}`, expires_in: 3600, refresh_token: `ref${g.n}` });
    }
    const body = opts.body ? JSON.parse(opts.body) : null;
    g.calls.push({ method, url, body, auth: (opts.headers || {}).Authorization });
    const path = url.replace('https://graph.microsoft.com/v1.0', '').split('?')[0];
    if (path === '/me/todo/lists' && method === 'GET') return reply(200, { value: g.lists });
    if (path === '/me/todo/lists' && method === 'POST') {
      const l = { id: `L${++g.n}`, displayName: body.displayName };
      g.lists.push(l);
      g.tasks.set(l.id, new Map());
      return reply(201, l);
    }
    const lr = path.match(/^\/me\/todo\/lists\/([^/]+)\/tasks\/([^/]+)\/linkedResources$/);
    if (lr && method === 'POST') {
      const t = g.tasks.get(lr[1]) && g.tasks.get(lr[1]).get(lr[2]);
      if (!t) return reply(404, { error: { message: 'The task was not found' } });
      t.linkedResources = [...(t.linkedResources || []), { ...body, id: `R${++g.n}` }];
      return reply(201, body);
    }
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
  g.list = () => { const l = g.lists.find((x) => x.displayName === 'PA App'); return l && g.tasks.get(l.id); };
  g.writes = (method) => g.calls.filter((c) => (method ? c.method === method : c.method !== 'GET'));
  return g;
}
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

(async () => {
  const g = fakeMicrosoft();
  const app = loadApp({ fetch: g.fetch });
  const { win, doc, PA } = app;
  await tick(20);
  check(g.calls.length === 0 && g.tokenCalls.length === 0, 'not connected: nothing goes to Microsoft');
  PA.state.view = 'settings';
  PA.render();
  check(doc.querySelector('[data-action="td-connect"]')?.textContent.includes('Connect Microsoft To Do'), 'Settings offers "Connect Microsoft To Do"');

  // --- Sign-in in a pop-up ---
  let popup;
  win.open = () => (popup = { closed: false, location: { href: 'about:blank' }, close() { this.closed = true; } });
  doc.querySelector('[data-action="td-connect"]').click();
  await tick(50);
  const auth = new URL(popup.location.href);
  const ap = auth.searchParams;
  check(auth.origin === 'https://login.microsoftonline.com' && auth.pathname === '/consumers/oauth2/v2.0/authorize', 'the pop-up goes to Microsoft sign-in for personal accounts');
  check(ap.get('client_id') === '011c6ecd-2984-4293-a6be-c83ebba20855' && ap.get('response_type') === 'code', 'with the app\'s client ID, asking for a code');
  check(ap.get('scope') === 'Tasks.ReadWrite offline_access', 'asks for To Do only (plus staying signed in)');
  check(ap.get('code_challenge_method') === 'S256' && ap.get('code_challenge').length === 43, 'uses PKCE, so no secret is needed in the public code');
  check(ap.get('redirect_uri') === 'http://localhost/', 'comes back to the folder (Azure won\'t take "PA%20App.html")');
  popup.location.href = `http://localhost/?code=abc&state=${ap.get('state')}`;
  await tick(400);
  const tc = g.tokenCalls[0] || {};
  check(popup.closed, 'the answer is read from the pop-up, which then closes');
  check(tc.grant_type === 'authorization_code' && tc.code === 'abc' && tc.redirect_uri === 'http://localhost/', 'the code is swapped for a token');
  check(tc.code_verifier && b64url(nodeCrypto.createHash('sha256').update(tc.code_verifier).digest()) === ap.get('code_challenge'), 'with the secret verifier that matches the challenge');
  const stored = JSON.parse(win.localStorage.getItem('dev_msAuth'));
  check(stored && stored.access && stored.refresh && stored.exp > Date.now(), 'the tokens are kept on this device');
  await tick(50);
  check(!JSON.stringify(PA.DB.exportAll()).includes(stored.access) && !JSON.stringify(PA.DB.exportAll()).includes(stored.refresh), 'and never in the data');
  check(g.lists.length === 1 && g.lists[0].displayName === 'PA App', 'a "PA App" list is made in To Do');
  check(g.calls.filter((c) => c.auth).every((c) => c.auth === `Bearer ${stored.access}`), 'every call carries the token');
  // A sign-in answer that doesn't match is refused.
  PA.TD.signIn();
  await tick(50);
  popup.location.href = 'http://localhost/?code=evil&state=wrong';
  await tick(400);
  check(/didn't match/.test(PA.TD.error) && !g.tokenCalls.some((c) => c.code === 'evil'), 'a sign-in answer that doesn\'t match is refused');
  PA.TD.error = '';

  // --- Sending tasks ---
  const today = new Date();
  const day = (n) => PA.toISO(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n));
  const a = PA.addTask({
    title: 'Phone bill', due: `${day(3)}T23:59`, priority: 'high',
    reminders: [{ id: 'r1', kind: 'dayof', daysBefore: 1, time: '21:00', fired: false }, { id: 'r2', kind: 'dayof', daysBefore: 0, time: '09:00', fired: false }],
  });
  Object.assign(a, { period: 'Oct 26', notes: 'Account 123', repeat: { freq: 'daily', interval: 1, days: [], monthMode: 'date', until: '' } });
  const b = PA.addTask({ title: 'Buy milk' });
  const c = PA.addTask({ title: 'Old thing' });
  Object.assign(c, { done: true, completedAt: Date.now() });
  PA.TD.timer = null;
  const d = PA.addTask({ title: 'Call the bank' });
  check(PA.TD.timer != null, 'a change queues a sync a few seconds later');
  await PA.TD.sync();
  const L = g.list();
  check(L.size === 3 && a.todo && b.todo && d.todo && c.todo === null, 'every open task goes, dated or not; done ones don\'t');
  const ra = L.get(a.todo.id);
  check(ra.title === 'Phone bill (Oct 26)' && ra.body.content === 'Account 123', 'title with its moving part, and the notes');
  check(ra.importance === 'high' && ra.status === 'notStarted', 'high priority shows as Important');
  check(ra.dueDateTime.dateTime === `${day(3)}T12:00:00` && ra.dueDateTime.timeZone === 'UTC', 'due date: the same calendar day (To Do has no due time)');
  const at = (k, hhmm) => new Date(`${k}T${hhmm}`).getTime();
  const sentAt = (r) => new Date(`${r.reminderDateTime.dateTime}Z`).getTime();
  check(ra.isReminderOn && ra.reminderDateTime.timeZone === 'UTC' && sentAt(ra) === at(day(2), '21:00'), 'the next reminder to come (the evening before), as an exact moment');
  check(ra.linkedResources[0].applicationName === 'PA App' && ra.linkedResources[0].externalId === a.id, 'marked as made by PA App, with the task\'s id');
  const rb = L.get(b.todo.id);
  check(rb.title === 'Buy milk' && rb.dueDateTime === null && rb.isReminderOn === false, 'no due date or reminder: sent all the same');
  const saved = JSON.parse(win.localStorage.getItem('pa_tasks')).find((x) => x.id === a.id);
  check(saved.todo && saved.todo.id === a.todo.id && saved.todo.base && saved.todo.base.title === 'Phone bill (Oct 26)', 'the link is saved with the task (so it reaches the data file)');
  PA.state.view = 'settings';
  PA.render();
  check(/3 tasks on your phone list/.test(doc.querySelector('#main').textContent) && doc.querySelector('[data-action="td-sync"]'), 'Settings shows how many are on the phone, with Sync now');

  let before = g.writes().length;
  await PA.TD.sync();
  check(g.writes().length === before, 'nothing changed: nothing is sent again');

  a.reminders[0].fired = true; // the evening-before one went off
  await PA.TD.sync();
  check(sentAt(L.get(a.todo.id)) === at(day(3), '09:00') && g.writes().length === before + 1, 'once it goes off, the next one (9 am on the day) is sent — that task only');
  b.notes = 'Semi-skimmed';
  await PA.TD.sync();
  check(L.get(b.todo.id).body.content === 'Semi-skimmed', 'an edit is sent');

  // --- Repeats ---
  PA.completeTask(a, new Date());
  const next = PA.DB.tasks.find((x) => x.id === a.spawnedNext);
  check(next && next.todo === null, 'the next repeat copy doesn\'t take over the old copy\'s To Do task');
  await PA.TD.sync();
  check(L.get(a.todo.id).status === 'completed' && L.get(a.todo.id).isReminderOn === false, 'ticked off here: completed in To Do');
  check(next.todo && next.todo.id !== a.todo.id && L.get(next.todo.id).title === PA.fullTitle(next) && L.get(next.todo.id).status === 'notStarted', 'the next copy is sent as a new task');
  const nextTodo = next.todo.id;
  PA.uncompleteTask(a);
  check(!PA.DB.tasks.includes(next), 'unticking still removes the untouched next copy, though it was sent to To Do');
  await PA.TD.sync();
  check(!L.has(nextTodo) && L.get(a.todo.id).status === 'notStarted', 'its To Do copy is deleted, and the unticked one is open again');

  // --- Deleting ---
  PA.DB.tasks = PA.DB.tasks.filter((x) => x !== b);
  const bTodo = b.todo.id;
  await PA.TD.sync();
  check(!L.has(bTodo), 'deleted here: deleted in To Do');
  L.delete(d.todo.id);
  await PA.TD.sync();
  check(PA.DB.tasks.includes(d) && d.todo && d.todo.removed, 'deleted in To Do: kept here, marked as removed from the phone');
  before = g.writes('POST').length;
  d.notes = 'changed';
  await PA.TD.sync();
  check(g.writes('POST').length === before, 'and never sent again');

  // --- A lost link never makes a second copy ---
  const aTodo = a.todo.id;
  a.todo = null;
  await PA.TD.sync();
  check(a.todo && a.todo.id === aTodo && g.writes('POST').length === before && [...L.values()].filter((x) => x.title === 'Phone bill (Oct 26)').length === 1, 'a task whose link was lost finds its old To Do task again');

  // --- The list deleted in To Do ---
  g.tasks.delete(g.lists[0].id);
  g.lists.length = 0;
  await PA.TD.sync();
  check(g.list() && g.list().has(a.todo.id) && g.list().get(a.todo.id).title === 'Phone bill (Oct 26)', 'the whole list deleted in To Do: made again with the tasks');
  const L2 = g.list();

  // --- Safety: never remove lots at once ---
  const many = Array.from({ length: 12 }, (_, i) => PA.addTask({ title: `Bulk ${i}` }));
  await PA.TD.sync();
  const bulkIds = many.map((x) => x.todo.id);
  PA.DB.tasks = PA.DB.tasks.filter((x) => !many.includes(x));
  await PA.TD.sync();
  check(bulkIds.every((id) => L2.has(id)) && /Not removing 12/.test(PA.TD.error), 'removing over half the list at once is refused, with a message');
  for (const id of bulkIds) L2.delete(id);
  await PA.TD.sync();
  check(PA.TD.error === '', 'and clears once things match again');

  // --- Changes made in To Do come back (stage 2) ---
  // The phone's To Do keeps a due date as local midnight, given in UTC (19:00 the day before, here).
  const phoneDue = (k) => ({ dateTime: new Date(`${k}T00:00`).toISOString().slice(0, 19) + '.0000000', timeZone: 'UTC' });
  const phoneAt = (ms) => ({ dateTime: new Date(ms).toISOString().slice(0, 19) + '.0000000', timeZone: 'UTC' });
  const e = PA.addTask({ title: 'Renew passport', due: `${day(5)}T10:30`, reminders: [{ id: 'e1', kind: 'before', minutes: 60, fired: false }] });
  const f = PA.addTask({ title: 'Water plants' });
  const h = PA.addTask({ title: 'Gym', due: `${day(1)}T23:59` });
  Object.assign(h, { period: 'Week 1', repeat: { freq: 'daily', interval: 1, days: [], monthMode: 'date', until: '' } });
  await PA.TD.sync();
  const R = (t) => L2.get(t.todo.id);
  before = g.writes().length;
  R(e).title = 'Renew passport now';
  R(e).body = { content: '<p>Bring <b>two</b> photos</p><p>And the old one</p>', contentType: 'html' };
  R(e).importance = 'high';
  R(e).dueDateTime = phoneDue(day(7));
  await PA.TD.sync();
  check(e.title === 'Renew passport now', 'renamed in To Do: renamed here');
  check(e.notes === 'Bring two photos\nAnd the old one', 'notes edited in To Do come back as plain text');
  check(e.priority === 'high', 'marked Important in To Do: high priority here');
  check(e.due === `${day(7)}T10:30`, 'due date moved in To Do: the new day here, keeping its time');
  check(PA.DB.exportAll().tasks.find((x) => x.id === e.id).todo.base.title === 'Renew passport now', 'what came in is saved');
  const sentBack = g.writes().length - before;
  await PA.TD.sync();
  check(g.writes().length - before === sentBack, 'and doesn\'t bounce back and forth');
  R(e).importance = 'normal';
  await PA.TD.sync();
  check(e.priority === 'med', 'Important taken off in To Do: medium priority here');

  // A reminder changed in To Do replaces the one that was sent; the next one here still comes after it.
  const newRem = new Date(`${day(6)}T08:15`).getTime();
  R(e).reminderDateTime = phoneAt(newRem);
  R(e).isReminderOn = true;
  await PA.TD.sync();
  const rr = e.reminders.find((r) => r.kind === 'at');
  check(rr && rr.at === `${day(6)}T08:15` && !rr.fired && e.reminders.find((r) => r.id === 'e1').fired, 'reminder changed in To Do: kept here as that exact time, the old one done with');
  check(sentAt(R(e)) === newRem, 'and To Do keeps it');

  // Both sides changed: the same field keeps this app's version; different fields both stay.
  R(f).title = 'Water the plants (phone)';
  R(f).body = { content: 'From the phone', contentType: 'text' };
  f.title = 'Water plants (laptop)';
  await PA.TD.sync();
  check(f.title === 'Water plants (laptop)' && R(f).title === 'Water plants (laptop)', 'changed on both sides: this app\'s version wins and is sent');
  check(f.notes === 'From the phone', 'while a different field changed on the phone still comes in');

  // The moving part survives a rename in To Do.
  R(h).title = 'Gym session (Week 1)';
  await PA.TD.sync();
  check(h.title === 'Gym session' && h.period === 'Week 1', 'renamed in To Do: the title changes, the moving part stays');

  // Ticked in To Do.
  R(f).status = 'completed';
  R(f).completedDateTime = phoneDue(PA.toISO(new Date()));
  await PA.TD.sync();
  check(f.done && f.completedAt && !f.completedAllDay, 'ticked in To Do (today): done here');
  R(h).status = 'completed';
  await PA.TD.sync();
  const hNext = PA.DB.tasks.find((x) => x.id === h.spawnedNext);
  check(h.done && hNext && hNext.todo && hNext.title === 'Gym session' && R(hNext).title === PA.fullTitle(hNext) && R(hNext).status === 'notStarted', 'a repeating task ticked in To Do: its next copy is made and sent');
  R(f).status = 'notStarted';
  await PA.TD.sync();
  check(!f.done && f.completedAt === 0, 'unticked in To Do: open again here');
  const old = PA.addTask({ title: 'Last week' });
  await PA.TD.sync();
  R(old).status = 'completed';
  R(old).completedDateTime = phoneDue(day(-3));
  await PA.TD.sync();
  check(old.done && old.completedAllDay && PA.toISO(new Date(old.completedAt)) === day(-3), 'ticked in To Do on an earlier day: done on that day');

  // Added in To Do.
  L2.set('P1', { id: 'P1', title: 'Added on the phone', body: { content: 'Call back', contentType: 'text' }, importance: 'high', status: 'notStarted', dueDateTime: phoneDue(day(2)), isReminderOn: true, reminderDateTime: phoneAt(new Date(`${day(2)}T17:00`).getTime()), createdDateTime: new Date().toISOString(), linkedResources: [] });
  L2.set('P2', { id: 'P2', title: 'Already done there', status: 'completed', linkedResources: [] });
  const count = PA.DB.tasks.length;
  await PA.TD.sync();
  const p1 = PA.DB.tasks.find((x) => x.todo && x.todo.id === 'P1');
  check(p1 && p1.title === 'Added on the phone' && p1.notes === 'Call back' && p1.priority === 'high', 'a task added in To Do comes in, with its notes and Important');
  check(p1 && p1.due === `${day(2)}T23:59` && p1.reminders.length === 1 && p1.reminders[0].at === `${day(2)}T17:00`, 'with its due day (all day) and reminder');
  check(PA.DB.tasks.length === count + 1, 'one already done in To Do isn\'t brought in');
  check(L2.get('P1').linkedResources.some((r) => r.applicationName === 'PA App' && r.externalId === p1.id), 'it\'s marked in To Do as linked to its task here');
  await PA.TD.sync();
  L2.get('P1').linkedResources = []; // even if To Do loses the mark
  await PA.TD.sync();
  check(PA.DB.tasks.length === count + 1, 'and never comes in twice');
  PA.DB.tasks = PA.DB.tasks.filter((x) => x !== p1);
  await PA.TD.sync();
  check(!L2.has('P1'), 'deleting it here deletes it in To Do, like any other');

  // Linked before stage 2 (only a fingerprint kept): a change in To Do still comes in if nothing changed here.
  e.todo = { id: e.todo.id, sig: PA.TD.payload ? (() => { let s = JSON.stringify(PA.TD.payload(e)), x = 5381; for (let i = 0; i < s.length; i++) x = (x * 33 + s.charCodeAt(i)) | 0; return (x >>> 0).toString(36); })() : '' };
  R(e).title = 'Passport (old link)';
  await PA.TD.sync();
  check(e.title === 'Passport (old link)' && e.todo.base && !('sig' in e.todo), 'an older link takes To Do\'s change and is brought up to date');

  before = g.writes().length;
  await PA.TD.sync();
  check(g.writes().length === before, 'nothing changed on either side: nothing is sent');

  // --- Signing in again ---
  win.localStorage.setItem('dev_msAuth', JSON.stringify({ ...JSON.parse(win.localStorage.getItem('dev_msAuth')), exp: 0 }));
  a.notes = 'refresh';
  await PA.TD.sync();
  const last = g.tokenCalls[g.tokenCalls.length - 1];
  check(last.grant_type === 'refresh_token' && L2.get(a.todo.id).body.content === 'refresh', 'an expired token is renewed quietly');
  g.failToken = true;
  win.localStorage.setItem('dev_msAuth', JSON.stringify({ ...JSON.parse(win.localStorage.getItem('dev_msAuth')), exp: 0 }));
  a.notes = 'paused';
  await PA.TD.sync();
  PA.render();
  check(PA.TD.needsSignIn() && L2.get(a.todo.id).body.content === 'refresh', 'when Microsoft wants a new sign-in, syncing pauses');
  check(doc.querySelector('#banner [data-action="td-connect"]') && /sign in again/i.test(doc.querySelector('#banner').textContent), 'a banner asks to sign in again');
  check(doc.querySelector('#main [data-action="td-connect"]')?.textContent === 'Sign in again', 'and Settings says so');
  g.failToken = false;

  // --- Disconnect ---
  PA.TD.disconnect();
  check(!win.localStorage.getItem('dev_msAuth') && !win.localStorage.getItem('dev_todoList'), 'Disconnect forgets the sign-in on this device');
  app.close();

  // --- Phones never sync ---
  const g2 = fakeMicrosoft();
  const phone = loadApp({ fsa: false, fetch: g2.fetch, storage: { dev_msAuth: JSON.stringify({ access: 'x', exp: Date.now() + 3600e3, refresh: 'y' }), pa_tasks: JSON.stringify([{ id: 't1', title: 'Phone task' }]) } });
  await tick(50);
  await phone.PA.TD.sync();
  phone.PA.state.view = 'settings';
  phone.PA.render();
  check(g2.calls.length === 0 && !phone.doc.querySelector('[data-action="td-sync"], [data-action="td-connect"]'), 'the read-only phone view never syncs and has no To Do controls');
  phone.close();

  check(app.errors.length === 0, 'no script errors' + (app.errors.length ? ': ' + app.errors[0] : ''));
  done();
})();
