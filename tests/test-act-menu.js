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
