// Board drag by touch: phones (and touch screens) don't send the mouse's drag events, so holding a card a moment
// lifts it and dragging it onto another column moves the task there. Moving the finger straight away is a scroll,
// a quick tap still opens the task, and read-only nothing moves.
const { loadApp, tick, check, done } = require('./helpers');

const APPROOT = 'https://graph.microsoft.com/v1.0/me/drive/special/approot';
const DATA = {
  tasks: [{ id: 'a', title: 'Pay rent', bucket: 'b1', priority: 'low', done: false, updated: 1 },
    { id: 'c', title: 'Buy milk', bucket: 'b1', priority: 'low', done: false, updated: 1 }],
  notes: [], events: [], buckets: [{ id: 'b1', name: 'Bills', order: 1 }, { id: 'b2', name: 'Home', order: 2 }], labels: [],
};
function fakeOneDrive() {
  const g = { file: { eTag: '"v1"', content: { app: 'PA App', version: 2, saveToken: 't0', savedAt: new Date().toISOString(), savedFrom: 'Laptop', data: DATA } } };
  const reply = (status, j) => ({ ok: status < 300, status, json: async () => (j == null ? j : JSON.parse(JSON.stringify(j))) });
  g.fetch = async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    if (url.startsWith('https://login.microsoftonline.com/')) return reply(200, { access_token: 'od', expires_in: 3600, refresh_token: 'odr' });
    const path = url.split('?')[0];
    if (path === APPROOT) return reply(200, { id: 'root', name: 'PA App' });
    if (path === `${APPROOT}/children`) return reply(200, { value: [{ id: 'F1', name: 'pa-app-data.json', eTag: g.file.eTag, file: {} }] });
    if (path.endsWith('/items/F1/content') && method === 'GET') return reply(200, g.file.content);
    if (path.endsWith('/items/F1/content') && method === 'PUT') { g.file = { content: JSON.parse(opts.body), eTag: `"v${Math.random()}"` }; return reply(200, { id: 'F1', eTag: g.file.eTag }); }
    if (url.includes('/approot:/Backups/')) return reply(201, { id: 'B1' });
    return reply(400, { error: { message: `unexpected ${method} ${url}` } });
  };
  return g;
}
const signedIn = { dev_odAuth: JSON.stringify({ access: 'od', exp: Date.now() + 3600e3, refresh: 'odr', scope: 'Files.ReadWrite.AppFolder' }) };

// A finger: touch events with a position. jsdom has no layout, so "what's under the finger" is set by the test.
function finger(app) {
  const { win, doc } = app;
  const f = { under: null };
  doc.elementFromPoint = () => f.under;
  const send = (type, el, x, y) => {
    const e = new win.Event(type, { bubbles: true, cancelable: true });
    const pt = { clientX: x, clientY: y, target: el };
    Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [pt] });
    Object.defineProperty(e, 'changedTouches', { value: [pt] });
    el.dispatchEvent(e);
    return e;
  };
  f.down = (el, x = 50, y = 50) => send('touchstart', el, x, y);
  f.move = (el, x, y) => send('touchmove', el, x, y);
  f.up = (el, x, y) => send('touchend', el, x, y);
  return f;
}
const showBoard = (app) => {
  app.doc.querySelector('[data-view="tasks"]').click();
  app.doc.querySelector('[data-action="layout"][data-layout="board"]').click();
};
const card = (app, id) => app.doc.querySelector(`.board [data-card="${id}"] .body`);
const col = (app, id) => app.doc.querySelector(`[data-bucket-col="${id}"]`);

(async () => {
  const g = fakeOneDrive();
  const app = loadApp({ fsa: false, fetch: g.fetch, storage: signedIn });
  const { win, doc, PA } = app;
  PA.OD.SAVE_MS = 10;
  PA.TD.soon = () => {};
  const TD = win.eval('TouchDrag');
  TD.HOLD_MS = 30;
  await tick(100);
  check(PA.state.phone && !PA.state.readOnly, 'the phone is editing');
  showBoard(app);
  const f = finger(app);

  // --- Hold, drag onto Home, let go: the task moves, and it doesn't open ---
  f.under = col(app, 'b1');
  f.down(card(app, 'a'));
  await tick(60);
  check(doc.querySelector('.drag-ghost') && doc.querySelector('[data-card="a"]').classList.contains('dragging'), 'holding a card lifts it: a copy follows the finger');
  f.under = col(app, 'b2');
  const mv = f.move(card(app, 'a'), 300, 60);
  check(mv.defaultPrevented, 'while dragging the page doesn\'t scroll');
  check(col(app, 'b2').classList.contains('over') && !col(app, 'b1').classList.contains('over'), 'the column under the finger lights up');
  const up = f.up(card(app, 'a'), 300, 60);
  check(PA.DB.tasks.find((t) => t.id === 'a').bucket === 'b2', 'letting go over Home moves the task there');
  check(up.defaultPrevented && !PA.state.openTask, 'and the task doesn\'t open (no tap)');
  check(!doc.querySelector('.drag-ghost, .dragging, .board-col.over'), 'nothing left over afterwards');
  await tick(100);
  check(g.file.content.data.tasks.find((t) => t.id === 'a').bucket === 'b2', 'the move is saved to OneDrive');

  // --- Moving the finger straight away is a scroll ---
  f.down(card(app, 'c'));
  const scroll = f.move(card(app, 'c'), 50, 120);
  await tick(60);
  check(!scroll.defaultPrevented && !doc.querySelector('.drag-ghost'), 'moving straight away scrolls: nothing is lifted');
  f.up(card(app, 'c'), 50, 120);
  check(PA.DB.tasks.find((t) => t.id === 'c').bucket === 'b1', 'and nothing moves');

  // --- A quick tap: no drag, the tap goes through ---
  f.down(card(app, 'c'));
  const tap = f.up(card(app, 'c'));
  await tick(60);
  check(!tap.defaultPrevented && !doc.querySelector('.drag-ghost'), 'a quick tap is left alone (it opens the task as before)');

  // --- Let go outside any column: stays put ---
  f.under = col(app, 'b1');
  f.down(card(app, 'c'));
  await tick(60);
  f.under = null;
  f.move(card(app, 'c'), 10, 700);
  f.up(card(app, 'c'), 10, 700);
  check(PA.DB.tasks.find((t) => t.id === 'c').bucket === 'b1' && !doc.querySelector('.drag-ghost'), 'let go outside the columns: it stays where it was');

  // --- The tick box isn't a handle ---
  f.down(doc.querySelector('.board [data-card="c"] input.check'));
  await tick(60);
  check(!doc.querySelector('.drag-ghost'), 'holding the tick box doesn\'t lift the card');
  f.up(doc.querySelector('.board [data-card="c"] input.check'));

  // --- Near the board's edge it scrolls along, to reach a column off screen ---
  const board = doc.querySelector('.board');
  board.getBoundingClientRect = () => ({ left: 0, right: 375, top: 0, bottom: 800, width: 375, height: 800 });
  f.under = col(app, 'b1');
  f.down(card(app, 'c'));
  await tick(60);
  f.move(card(app, 'c'), 370, 100);
  await tick(80);
  check(board.scrollLeft > 0, 'held near the right edge, the board scrolls along');
  f.up(card(app, 'c'), 370, 100);

  // --- Read-only: nothing lifts, nothing moves ---
  const ro = loadApp({ fsa: false, fetch: g.fetch, storage: signedIn, query: '?readonly' });
  ro.win.eval('TouchDrag').HOLD_MS = 30;
  await tick(100);
  showBoard(ro);
  const rf = finger(ro);
  rf.under = col(ro, 'b1');
  rf.down(card(ro, 'c'));
  await tick(60);
  check(!ro.doc.querySelector('.drag-ghost, .dragging'), 'read-only: holding a card doesn\'t lift it');
  rf.under = col(ro, 'b2');
  rf.move(card(ro, 'c'), 300, 60);
  rf.up(card(ro, 'c'), 300, 60);
  check(ro.PA.state.readOnly && !ro.doc.querySelector('.drag-ghost') && ro.PA.DB.tasks.find((t) => t.id === 'c').bucket === 'b1', 'read-only: nothing lifts or moves');

  check(app.errors.length === 0 && ro.errors.length === 0, 'no script errors' + (app.errors[0] || ro.errors[0] ? ': ' + (app.errors[0] || ro.errors[0]) : ''));
  ro.close();
  app.close();
  done();
})();
