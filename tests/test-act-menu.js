// The ⋮ menu down the right edge: every page's header buttons, grouped by the colour key (Actions, Add an entry, Add
// to a list), then Butler's own (Data, Guide, Light or dark, Settings). Picking one goes to its page and presses the
// real button. Esc, × or a click outside closes it. Read-only, it leaves out what would change things.
const { loadApp, check, done } = require('./helpers');

(async () => {
  const app = loadApp({});
  const { win, doc, PA } = app;
  const Assets = win.eval('Assets');
  Assets.add({ kind: 'cash', name: 'Bank', owners: [{ id: 'me', share: 100 }] });
  win.eval('changed')('assets');
  win.eval('setView')('today');
  const panel = () => doc.querySelector('#act-panel');
  const toggle = () => doc.querySelector('#main .page-head .act-toggle');

  check(toggle() && toggle().getAttribute('aria-label') === 'Menu', 'every page has a ⋮ button at the end of its title row');
  toggle().click();
  check(!panel().hidden && doc.body.classList.contains('act-open') && toggle().getAttribute('aria-expanded') === 'true', '⋮ opens the menu');
  const heads = [...panel().querySelectorAll('.act-h')].map((x) => x.textContent);
  check(heads.join('|') === 'Actions|Add an entry|Add to a list|Butler', `grouped by the colour key, then Butler's own (got ${heads.join('|')})`);
  const items = (cls) => [...panel().querySelectorAll(`.act-group.act-${cls} .act-item`)].map((x) => x.querySelector('span').textContent);
  check(items('act').includes('Transfer') && items('act').includes('Select'), `Actions: the gold buttons of every page (got ${items('act')})`);
  check(['+ Task', '+ Rates', '+ Note', '+ Zakat record'].every((x) => items('entry').includes(x)), `Add an entry: the teal ones (got ${items('entry')})`);
  check(['+ Asset', '+ Connection', '+ Agreement', '+ Document'].every((x) => items('list').includes(x)), `Add to a list: the outlined ones (got ${items('list')})`);
  check(items('entry').filter((x) => x === '+ Rates').length === 1, 'a button on two pages (+ Rates) is listed once');
  check(panel().querySelector('[data-act-view="data"]') && panel().querySelector('a[href="PA App Guide.html"]') && panel().querySelector('[data-action="cycle-theme"]') && panel().querySelector('[data-act-view="settings"]'), 'Butler: Data, Guide, Light or dark, Settings');

  // Picking one: its page, and its real button pressed
  [...panel().querySelectorAll('.act-item')].find((x) => x.textContent.startsWith('+ Connection')).click();
  check(PA.state.view === 'utilities' && doc.querySelector('#modal form[data-form="asset-utility"]') && panel().hidden, '+ Connection goes to Utilities and opens its pop-up; the menu closes');
  win.eval('closeAssetForm')(true);

  // Closing: Esc, ×, a click outside
  toggle().click();
  doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(panel().hidden && PA.state.view === 'utilities', 'Esc closes it (and stays on the page)');
  toggle().click();
  panel().querySelector('[data-action="act-close"]').click();
  check(panel().hidden, '× closes it');
  toggle().click();
  doc.querySelector('#main h1').click();
  check(panel().hidden, 'a click outside closes it');
  toggle().click();
  panel().querySelector('[data-act-view="data"]').click();
  check(PA.state.view === 'data' && panel().hidden, 'Data goes to the Data page');
  // --- The top bar: the bell, and what left the sidebar ---
  const side = [...doc.querySelectorAll('.sidebar [data-view], .sidebar [data-action="cycle-theme"], .sidebar a[href="PA App Guide.html"]')].map((x) => x.dataset.view || 'other');
  check(!side.some((v) => ['notices', 'settings', 'trash', 'other'].includes(v)), `the sidebar has the pages and Data only: Notifications, Settings, Trash, Theme and Guide left it (got ${side})`);
  const css = [...doc.querySelectorAll('style')].map((x) => x.textContent).join('');
  check(/\.sidebar \{[^}]*overflow-y: auto/.test(css), 'the sidebar scrolls on its own, so a long one never makes the page taller than the window');
  check(/#main > \.page-head \{[^}]*position: sticky; top: 0/.test(css), 'the title row is a top bar that stays put as the page scrolls');
  check(/#banner:not\(:empty\) ~ #main > \.page-head[^{]*\{ margin-top: 0; \}/.test(css), 'under a banner (Phone reminders are paused…) the top bar starts below it, not over it');
  check(/#banner:not\(:empty\) ~ #main > \.sticky-top[^{]*\{ margin-top: 0; \}/.test(css), 'and so does the Tasks page\'s header block');
  check(/html\.board-lock, html\.board-lock body \{ overflow: hidden/.test(css), 'on the Board the window itself can\'t scroll (only the board does)');
  PA.device.set('taskLayout', 'board');
  win.eval('setView')('tasks');
  check(doc.documentElement.classList.contains('board-lock'), 'the Board locks the window');
  win.eval('setView')('notes');
  check(!doc.documentElement.classList.contains('board-lock'), 'and any other page unlocks it');
  PA.device.set('taskLayout', 'list');
  win.eval('Notices').add('Bill due today', null);
  win.eval('Notices').add('Saved from the phone', null);
  win.eval('setView')('assets');
  const bell = () => doc.querySelector('#main .page-head .bell-btn');
  check(bell() && bell().querySelector('#notice-count').textContent === '2' && !bell().querySelector('#notice-count').hidden, 'the bell, beside ⋮, shows how many are unread');
  bell().click();
  const pop = () => doc.querySelector('#bell-pop');
  check(pop() && pop().querySelectorAll('.bell-row.unread').length === 2 && /Bill due today/.test(pop().textContent) && PA.state.view === 'assets', 'pressing it opens a small window under it with the latest (not a pop-up: the page stays)');
  pop().querySelector('.bell-row.unread .bell-dot').click();
  check(pop() && pop().querySelectorAll('.bell-row.unread').length === 1 && bell().querySelector('#notice-count').textContent === '1', 'the dot marks just that one read, and the window stays open');
  pop().querySelector('[data-action="bell-read"]').click();
  check(!pop().querySelector('.bell-row.unread') && !pop().querySelector('.bell-dot') && bell().querySelector('#notice-count').hidden, 'Mark all read');
  // Pressing a row: it's read, and its task opens
  const tk = win.eval('addTask')({ title: 'Pay the bill' });
  win.eval('Notices').add('Reminder: Pay the bill', tk.id);
  if (pop()) win.eval('Bell').draw(); else bell().click();
  pop().querySelector('.bell-row.unread [data-action="bell-open"]').click();
  check(!pop() && bell().querySelector('#notice-count').hidden && PA.state.openTask === tk.id, 'pressing one marks it read and opens its task');
  win.eval('closeTaskDrawer')();
  // On Tasks (the Board too) the window opens in sight, under the bell
  for (const layout of ['list', 'board']) {
    PA.device.set('taskLayout', layout);
    win.eval('setView')('tasks');
    bell().click();
    const head = doc.querySelector('#main .page-head');
    check(pop() && pop().parentElement === head && /\n\.page-head \{ position: relative;/.test(css) && !/#main > \.page-head \{ position: static/.test(css),`Tasks (${layout}): the bell's window hangs from the title row, so it opens under the bell`);
    doc.querySelector('#main h1').click();
  }
  PA.device.set('taskLayout', 'list');
  win.eval('setView')('assets');
  doc.querySelector('#main h1').click();
  check(!pop(), 'a click elsewhere closes it');
  bell().click();
  pop().querySelector('[data-action="bell-all"]').click();
  check(PA.state.view === 'notices' && !pop(), 'View all notifications opens the Notifications page');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();

  // Read-only: only what doesn't change anything
  const ro = loadApp({ query: '?readonly' });
  ro.win.eval('setView')('today');
  ro.doc.querySelector('#main .page-head .act-toggle').click();
  const roPanel = ro.doc.querySelector('#act-panel');
  check(!roPanel.querySelector('.act-group.act-entry') && !roPanel.querySelector('.act-group.act-list') && roPanel.querySelector('[data-act-view="data"]'), 'read-only: no add buttons, the rest still there');
  ro.close();
  done();
})();
