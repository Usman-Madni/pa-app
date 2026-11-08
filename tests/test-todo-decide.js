// To Do sync, the deciding half on its own: tasks here + To Do's tasks in, a plan out. No network, no pretend
// Microsoft, nothing changed. Every merge rule in one place: what comes in, what goes out, and the safety limits.
const { loadApp, tick, check, done } = require('./helpers');

(async () => {
  const app = loadApp();
  const { PA } = app;
  await tick(20);
  const TD = PA.TD;
  let n = 0;
  const task = (title, extra = {}) => PA.normalizeTask({ id: `t${++n}`, title, ...extra });
  // To Do's copy of a task as it was last sent, marked as made by PA App; `change` = what was changed there.
  const copyOf = (t, id, change = {}) => ({ ...TD.payload(t), id, linkedResources: [{ applicationName: 'PA App', externalId: t.id }], ...change });
  const linked = (t, id) => { t.todo = { id, base: TD.fields(TD.payload(t)) }; return t; };
  const remoteOf = (...xs) => new Map(xs.map((x) => [x.id, x]));

  // --- In step: nothing comes in, nothing to send ---
  const a = linked(task('Buy milk'), 'A');
  let remote = remoteOf(copyOf(a, 'A'));
  const before = JSON.stringify(a);
  let inn = TD.decideIn([a], remote);
  let out = TD.decideOut([a], remote);
  check(!inn.take.length && !inn.gone.length && !inn.fresh.length && !inn.error, 'in step: nothing comes in');
  check(out.send.length === 1 && !out.send[0].patch && !out.send[0].rebase && !out.send[0].mark && !out.remove.length, 'and nothing goes out');
  check(JSON.stringify(a) === before, 'deciding changes nothing');

  // --- Changed on the phone / here / both ---
  remote = remoteOf(copyOf(a, 'A', { title: 'Buy oat milk' }));
  inn = TD.decideIn([a], remote);
  check(inn.take.length === 1 && inn.take[0].take.join() === 'title', 'renamed on the phone: the title comes in');
  a.title = 'Buy milk (2 L)';
  inn = TD.decideIn([a], remote);
  out = TD.decideOut([a], remote);
  check(!inn.take.length && out.send[0].patch, 'renamed on both sides: this app\'s version wins and is sent');
  a.title = 'Buy milk';
  const b = linked(task('Gym'), 'B');
  inn = TD.decideIn([b], remoteOf(copyOf(b, 'B', { recurrence: { pattern: { type: 'daily', interval: 1 } } })));
  check(inn.take.length === 1 && inn.take[0].take.length === 0, 'a repeat set on the phone comes in (with no other field)');

  // --- An older link (fingerprint only) ---
  const c = task('Call bank');
  c.todo = { id: 'C', sig: 'nope' };
  inn = TD.decideIn([c], remoteOf(copyOf(c, 'C', { title: 'Call the bank' })));
  check(!inn.take.length, 'an older link changed here since: this app wins');
  const sh = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  c.todo.sig = sh(JSON.stringify(TD.payload(c)));
  inn = TD.decideIn([c], remoteOf(copyOf(c, 'C', { title: 'Call the bank' })));
  check(inn.take.length === 1 && inn.take[0].take.join() === 'title', 'an older link unchanged here: the phone\'s change comes in');

  // --- Deleted on the phone, and the safety limit ---
  const d = linked(task('Old'), 'D');
  inn = TD.decideIn([a, d], remoteOf(copyOf(a, 'A')));
  check(inn.gone.length === 1 && inn.gone[0] === d && !inn.error, 'deleted on the phone: listed as gone');
  const many = Array.from({ length: 12 }, (_, i) => linked(task(`Bulk ${i}`), `M${i}`));
  inn = TD.decideIn([a, ...many], remoteOf(copyOf(a, 'A')));
  check(inn.error && !inn.gone.length && !inn.take.length, 'most of them missing at once: refused, nothing decided');

  // --- Added on the phone ---
  const p1 = { id: 'P1', title: 'From the phone', status: 'notStarted', linkedResources: [] };
  const p2 = { id: 'P2', title: 'Done there', status: 'completed', linkedResources: [] };
  const p3 = { id: 'A', ...copyOf(a, 'A'), linkedResources: [] }; // ours, but lost its mark
  inn = TD.decideIn([a], remoteOf(p1, p2, p3));
  check(inn.fresh.length === 1 && inn.fresh[0] === p1, 'a new task on the phone comes in once; a done one and one linked here don\'t');

  // --- Going out ---
  const e = task('Brand new');
  const f = task('Ticked, never sent', { done: true });
  const g = task('Deleted on the phone');
  g.todo = { removed: true };
  const h = task('Lost its link');
  out = TD.decideOut([e, f, g, h, a], remoteOf(copyOf(h, 'H'), p3, copyOf(task('Gone here'), 'Z')));
  const of = (t) => out.send.find((s) => s.t === t);
  check(of(e) && !of(e).id, 'a new task: created');
  check(!of(f) && !of(g), 'a done task never sent, and one deleted on the phone: left out');
  check(of(h).id === 'H' && of(h).relink && !of(h).patch, 'a lost link: its old To Do task used again, never a second copy');
  check(of(a).mark, 'a To Do task that lost its PA App mark: marked again');
  check(out.remove.length === 1 && out.remove[0].id === 'Z', 'made by this app, gone here: removed in To Do');
  const ours = Array.from({ length: 12 }, (_, i) => copyOf(task(`Gone ${i}`), `G${i}`));
  out = TD.decideOut([a], remoteOf(copyOf(a, 'A'), ...ours));
  check(out.error && !out.remove.length && out.send.length === 1, 'removing most of the list at once: refused (other sends still go)');

  check(app.errors.length === 0, 'no script errors' + (app.errors.length ? ': ' + app.errors[0] : ''));
  done();
})();
