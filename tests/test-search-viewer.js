// One search across Butler (tasks, notes, events, assets, documents with their numbers, zakat), following the person
// picker; a filter box on each list page; the picture viewer for an asset's photos (from its row or its pop-up), with
// arrows, Esc, and photos that came with no type (from Airtable) recognised by their name.
const { loadApp, fakeFolder, check, done, tick } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const A = win.eval('Assets');
  const V = win.eval('Vault');
  const People = win.eval('People');
  const changed = win.eval('changed');
  const main = () => doc.querySelector('#main').textContent;
  const type = (el, v) => { el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); };

  PA.DB.tasks.push(win.eval('normalizeTask')({ id: 't1', title: 'Renew car insurance', notes: 'call the broker', created: 1 }));
  PA.DB.notes.push({ id: 'n1', title: 'Broker numbers', body: 'Insurance broker: ask for the no-claims letter', updated: 1 });
  PA.DB.events.push({ id: 'e1', title: 'Insurance meeting', date: '2026-12-01', time: '10:00' });
  const car = A.add({ kind: 'vehicle', name: 'Family car', currency: 'PKR', amount: 3000000, date: '2026-01-01', notes: 'insurance due in March' });
  V.add({ cat: 'travel', type: 'Passport', name: 'My passport', number: 'AB 123 4567' });
  changed('tasks', 'notes', 'events', 'assets', 'docs');

  // --- Search across Butler ---
  const S = win.eval('Search');
  const res = S.run('insurance');
  check(res.tasks.length === 1 && res.notes.length === 1 && res.events.length === 1 && res.assets.length === 1, 'one search finds a task, a note, an event and an asset');
  check(S.run('1234567').docs.length === 1 && S.run('passport ab').docs.length === 1, 'a document by its number (spaces or not) and by every word typed');
  check(!S.count(S.run('insurance zebra')) && !S.count(S.run('')), 'every word must be there; nothing typed finds nothing');
  const side = doc.querySelector('#side-search');
  type(side, 'insurance');
  check(PA.state.view === 'search' && /Tasks\s*1/.test(main()) && /Notes\s*1/.test(main()) && /Events\s*1/.test(main()), 'typing in the sidebar box opens Search, grouped by kind');
  type(side, 'broker');
  check(doc.querySelectorAll('#search-results li.item').length === 2, 'and the results follow as you type');
  doc.querySelector('#search-results [data-action="search-note"]').click();
  check(PA.state.view === 'notes' && PA.state.activeNote === 'n1', 'a note opens in Notes');
  type(side, 'insurance meeting');
  doc.querySelector('#search-results [data-action="search-event"]').click();
  check(PA.state.view === 'calendar' && PA.state.selectedDay === '2026-12-01', 'an event opens on its day');
  type(side, 'family car');
  doc.querySelector('#search-results [data-action="open-asset"]').click();
  check(doc.querySelector('#modal form h3').textContent === 'Family car', 'an asset opens');
  doc.querySelector('#modal [data-action="asset-cancel"]').click();
  // It follows the person picker
  const kim = People.add('Kim');
  PA.DB.notes.push({ id: 'n2', title: 'Kim insurance', body: '', people: [kim.id], updated: 1 });
  changed('notes');
  People.view(kim.id);
  check(S.run('insurance').notes.map((n) => n.id).join() === 'n2' && !S.run('insurance').tasks.length, 'showing Kim, it finds only Kim\'s');
  People.view('all');
  // The / key; the phone's button
  doc.querySelector('[data-view="today"]').click();
  doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: '/', bubbles: true }));
  check(doc.activeElement === side, 'the / key puts the cursor in the search box');
  check(doc.querySelector('#who-bar [data-view="search"]'), 'the phone has a search button above the page');

  // --- A filter box on each list page ---
  A.add({ kind: 'cash', name: 'Savings', currency: 'PKR', amount: 10, date: '2026-01-01' });
  A.add({ kind: 'cash', name: 'Current account', currency: 'PKR', amount: 10, date: '2026-01-01' });
  changed('assets');
  doc.querySelector('[data-view="assets"]').click();
  doc.querySelector('[data-asset-tab="cash"]').click();
  const filter = doc.querySelector('#main [data-input="page-filter"]');
  check(filter, 'Assets has a filter box');
  type(filter, 'curr');
  const rows = [...doc.querySelectorAll('#main li.item')];
  check(rows.filter((r) => !r.hidden).length === 1 && /Current account/.test(rows.find((r) => !r.hidden).textContent), 'it narrows the list as you type');
  doc.querySelector('[data-asset-tab="rates"]').click();
  check(doc.querySelector('#main [data-input="page-filter"]').value === 'curr' && doc.querySelectorAll('#main li.item:not([hidden])').length === 0, 'it stays while on the page');
  for (const v of ['tasks', 'zakat', 'vault', 'notices', 'trash']) {
    doc.querySelector(`[data-view="${v}"]`)?.click() || win.eval('setView')(v);
    check(doc.querySelector('#main [data-input="page-filter"]'), `${v} has one too`);
  }

  // --- The picture viewer ---
  const folder = fakeFolder('Attachments');
  PA.AT.dir = folder;
  PA.AT.status = 'ok';
  win.URL.createObjectURL = (f) => `blob:${f.name || 'x'}`;
  const AT = win.eval('AT');
  await AT.add(car, [new win.File(['1'], 'front.jpg', { type: 'image/jpeg' }), new win.File(['2'], 'papers.pdf', { type: 'application/pdf' })], 'assets');
  car.attachments.push({ id: 'old', name: 'side.jpg', file: 'side.jpg', original: 'side.jpg', size: 1, type: '', added: 1 }); // an Airtable photo: no type
  folder.files['side.jpg'] = (await folder.getFileHandle('x.jpg', { create: true }));
  changed('assets');
  check(win.eval('photosOf')(car).length === 2 && win.eval('isImage')(car.attachments[2]), 'a photo with no type is known by its name; a PDF isn\'t a photo');
  check(win.eval('isImage')({ name: 'IMG.JPG', file: 'IMG.JPG', type: 'application/octet-stream' }) && !win.eval('isImage')({ file: 'a.pdf', type: 'application/octet-stream' }), 'a photo labelled only "some file" (as Airtable sends some) is known by its name');
  doc.querySelector('[data-view="assets"]').click();
  type(doc.querySelector('#main [data-input="page-filter"]'), '');
  PA.device.set('assetTab', 'overview');
  win.eval('Viewer').open(win.eval('photosOf')(car), 0); // a car's photos (cars are on the Vehicles page now)
  await tick(10);
  check(doc.querySelector('#viewer') && /1 of 2/.test(doc.querySelector('#viewer').textContent), 'the small photo on a row opens its photos, large');
  doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  check(/2 of 2/.test(doc.querySelector('#viewer').textContent) && /side\.jpg/.test(doc.querySelector('#viewer').textContent), 'the arrow keys go through them');
  doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(!doc.querySelector('#viewer'), 'Esc closes it');
  PA.device.set('vehicleCar', car.id); win.eval('setView')('vehicles'); doc.querySelector('[data-vehicle-tab="details"]').click(); doc.querySelector('#main [data-action="open-asset"]').click(); // a car opens on the Vehicles page; its Details open the pop-up
  const att = [...doc.querySelectorAll('#modal [data-action="rec-file-open"]')];
  att.find((b) => /side\.jpg/.test(b.textContent)).click();
  await tick(10);
  check(/2 of 2/.test(doc.querySelector('#viewer')?.textContent || ''), 'a photo in the pop-up opens in the viewer, at that photo');
  doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(!doc.querySelector('#viewer') && doc.querySelector('#modal form'), 'Esc closes the photo first, the pop-up stays');

  check(!app.errors.length, 'no script errors');
  done();
})();
