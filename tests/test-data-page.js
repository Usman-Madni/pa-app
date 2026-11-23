// The Data page: every store as a table (from SCHEMA), entries first and then lists, with a divider between. A heading
// sorts by its column (again: the other way), Filter this page narrows the rows, a row opens its record, Export saves
// the table as a CSV. It shows only what the person picker shows, and works read-only too.
const { loadApp, check, done } = require('./helpers');

(async () => {
  const app = loadApp({});
  const { win, doc, PA } = app;
  const U = win.eval('Utilities');
  const People = win.eval('People');
  const SCHEMA = win.eval('SCHEMA');
  const main = () => doc.querySelector('#main');
  const robin = People.add('Robin');
  const c = U.add({ type: 'Electricity', name: 'House', provider: 'PowerCo', account: 'A-1' });
  const shop = U.add({ type: 'Gas', name: 'Shop', provider: 'GasCo', people: [robin.id] });
  U.addBill({ utility: c.id, month: '2026-09', amount: 9000, units: 300, credit: 1000, date: '2026-09-20' });
  U.addBill({ utility: c.id, month: '2026-10', amount: 12000, units: 400, date: '' });
  U.addBill({ utility: shop.id, month: '2026-10', amount: 3000, units: 50, date: '2026-10-18' });
  win.eval('changed')('utilities');
  win.eval('changed')('bills');

  // --- Every store has a table; entries, a divider, then lists ---
  check(win.eval('DATA_KEYS').every((k) => SCHEMA[k]), 'every store the data file keeps is described in SCHEMA');
  doc.querySelector('[data-view="data"]').click();
  check(PA.state.view === 'data' && /Data/.test(main().querySelector('h1').textContent), 'Data is a page in the sidebar');
  const kinds = [...main().querySelectorAll('.data-tabs > *')].map((x) => (x.classList.contains('tab-split') ? '|' : x.dataset.kind[0])).join('');
  check(/^e+\|l+$/.test(kinds), `tabs: entries, a divider, then lists (got ${kinds})`);
  check(!main().querySelector('[data-data-tab="trash"], [data-data-tab="deleted"], [data-data-tab="notices"]'), 'Butler\'s own bookkeeping isn\'t a tab');

  // --- Bills: columns from the schema, newest first ---
  main().querySelector('[data-data-tab="bills"]').click();
  const heads = [...main().querySelectorAll('thead th')].map((x) => x.textContent.replace(/[↑↓]/g, '').trim());
  check(heads.slice(0, 6).join('|') === 'Month|Connection|Units|Amount|Credit|Paid on' && heads.includes('ID') && heads.includes('Changed'), `the bills table: its columns, then the ID and when it changed (got ${heads.join('|')})`);
  const months = () => [...main().querySelectorAll('tbody tr')].map((r) => r.children[0].textContent);
  check(/^Oct 2026,Oct 2026,Sept? 2026$/.test(months().join()), `entries open newest first (got ${months()})`);
  const row = [...main().querySelectorAll('tbody tr')].find((r) => r.textContent.includes('House') && r.textContent.includes('Rs 9,000'));
  check(row && /Rs 1,000/.test(row.textContent) && /20 Sept? 2026/.test(row.textContent), 'a row shows the connection by name, money in rupees, dates as dates');

  // --- Sort by a heading, and back ---
  main().querySelector('[data-data-sort="amount"]').click();
  const amounts = () => [...main().querySelectorAll('tbody tr')].map((r) => r.children[3].textContent);
  check(amounts().join() === 'Rs 3,000,Rs 9,000,Rs 12,000', `a heading sorts by its column (got ${amounts()})`);
  main().querySelector('[data-data-sort="amount"]').click();
  check(amounts()[0] === 'Rs 12,000' && /↓/.test(main().querySelector('[data-data-sort="amount"]').textContent), 'again: the other way, with an arrow');
  check(PA.device.get('dataSort', {}).bills?.f === 'amount', 'the sort is remembered on this device');

  // --- Filter this page ---
  const box = main().querySelector('[data-input="page-filter"]');
  box.value = 'gasco';
  box.dispatchEvent(new win.Event('input', { bubbles: true }));
  box.value = 'shop';
  box.dispatchEvent(new win.Event('input', { bubbles: true }));
  const shown = [...main().querySelectorAll('tbody tr')].filter((r) => !r.hidden);
  check(shown.length === 1 && /Shop/.test(shown[0].textContent), 'Filter this page narrows the rows');
  box.value = '';
  box.dispatchEvent(new win.Event('input', { bubbles: true }));

  // --- A row opens its record ---
  [...main().querySelectorAll('tbody tr')].find((r) => r.textContent.includes('Rs 12,000')).click();
  check(doc.querySelector('#modal form[data-form="asset-bill"]'), 'a bill\'s row opens its pop-up');
  win.eval('closeAssetForm')(true);

  // --- Export ---
  const csv = win.eval('DataView').csv('bills');
  const lines = csv.split('\r\n');
  check(lines[0].startsWith('Month,Connection,Units,Amount,Credit,Paid on') && lines.length === 4 && lines.some((l) => l.includes('2026-09-20')), 'Export: a CSV of the table, every field, dates as YYYY-MM-DD');
  main().querySelector('[data-action="data-export"]').click();
  const ticks = () => [...main().querySelectorAll('[data-export-key]')];
  check(ticks().length === Object.values(SCHEMA).filter((t) => t.kind !== 'system').length && ticks().filter((x) => x.checked).map((x) => x.dataset.exportKey).join() === 'bills', 'Export opens a tick box for every table, the open one ticked');
  const bx = ticks().find((x) => x.dataset.exportKey === 'utilities');
  bx.checked = true;
  bx.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(/Export 2 tables/.test(main().querySelector('[data-action="data-export-go"]').textContent), 'ticking another: Export 2 tables');
  const saved = [];
  win.eval('DataView').export = (k) => saved.push(k);
  main().querySelector('[data-action="data-export-go"]').click();
  await new Promise((r) => setTimeout(r, 900));
  check(saved.join() === 'bills,utilities', 'one CSV per ticked table');
  main().querySelector('[data-action="data-export-none"]').click();
  check(main().querySelector('[data-action="data-export-go"]').disabled, 'None: nothing to export');
  main().querySelector('[data-action="data-export-all"]').click();
  check(ticks().every((x) => x.checked), 'All ticks every table');
  main().querySelector('[data-action="data-export-close"]').click();
  check(!main().querySelector('.data-export'), 'Close hides it');
  doc.querySelector('#main .act-toggle').click();
  const actItems = [...doc.querySelectorAll('#act-panel .act-item, #act-panel .btn')].map((x) => x.textContent.trim());
  const exp = doc.querySelector('#act-panel .act-group.act-act [data-act-export]');
  check(exp && exp.classList.contains('act') && actItems.filter((x) => /^Export/.test(x)).length === 1, 'the ⋮ menu has one Export, a gold button at the top of Actions');
  doc.querySelector('#act-panel [data-act-export]').click();
  check(PA.state.view === 'data' && main().querySelector('.data-export'), 'it opens the Data page with the tables to choose');

  // --- Lists; whose ---
  main().querySelector('[data-data-tab="utilities"]').click();
  check(main().querySelectorAll('tbody tr').length === 2, 'Connections: both');
  People.view(robin.id);
  win.eval('render')();
  check([...main().querySelectorAll('tbody tr')].map((r) => r.children[0].textContent).join() === 'Shop', 'with Robin shown, only Robin\'s');
  People.view('all');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));

  // --- Read-only ---
  const copy = JSON.parse(JSON.stringify({ bills: PA.DB.bills, utilities: PA.DB.utilities }));
  app.close();
  const ro = loadApp({ query: '?readonly' });
  Object.assign(ro.PA.DB, copy);
  ro.win.eval('setView')('data');
  ro.doc.querySelector('[data-data-tab="bills"]').click();
  check(ro.doc.querySelectorAll('#main tbody tr').length === 3 && ro.doc.querySelector('[data-action="data-export"]'), 'read-only: the tables show and export too');
  ro.close();
  done();
})();
