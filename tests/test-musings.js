// Musings: pieces you've written. A new piece opens to write; its fields save as you type; the few formats (headings,
// bold, italics, quotes, lists) show when it's read; a cover (whole, above the title) and a gallery with captions, kept
// in the attachments folder; the list groups by collection, status or year and sorts; search finds pieces; deleting
// goes to the Trash. Read-only can read but not change.
const { loadApp, fakeFolder, check, done, tick } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const M = win.eval('Musings');
  const main = () => doc.querySelector('#main').textContent;
  const type = (el, v) => { el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); };
  const folder = fakeFolder('Attachments');
  PA.AT.dir = folder;
  PA.AT.status = 'ok';
  win.URL.createObjectURL = () => 'blob:pic';

  doc.querySelector('[data-view="musings"]').click();
  check(/Write your first piece/.test(main()), 'an empty Musings page invites the first piece');
  doc.querySelector('#main [data-action="musing-new"]').click();
  const m = PA.DB.musings[0];
  check(m && PA.state.musingEdit && doc.querySelector('#main [data-musing-field="title"]'), 'New piece opens it to write');
  type(doc.querySelector('[data-musing-field="title"]'), 'Rain on the roof');
  type(doc.querySelector('[data-musing-field="collections"]'), 'Poems, travel, poems');
  const body = doc.querySelector('[data-musing-field="body"]');
  type(body, '# The storm\n\nIt came **all at once**, and *softly* left.\n\n> Nothing stays.\n\n- wind\n- rain');
  check(/1[0-9] words/.test(doc.querySelector('[data-musing-words]').textContent), 'the word count follows the typing');
  await tick(800);
  check(m.title === 'Rain on the roof' && m.collections.join() === 'Poems,travel' && /storm/.test(m.body), 'it saves as you type (collections without repeats)');
  check(JSON.parse(win.localStorage.getItem('pa_musings'))[0].title === 'Rain on the roof', 'saved with the data (through changed)');
  // A format button
  body.focus();
  body.setSelectionRange(body.value.length, body.value.length);
  doc.querySelector('[data-md="l"]').click();
  check(/\n- - rain|\n- rain$/.test(body.value) || body.value.endsWith('- - rain'), 'a format button puts its marks in');
  type(body, '# The storm\n\nIt came **all at once**, and *softly* left.\n\n> Nothing stays.\n\n- wind\n- rain');
  // Cover and gallery
  const coverIn = doc.querySelector('[data-input="musing-cover"]');
  Object.defineProperty(coverIn, 'files', { value: [new win.File(['c'], 'cover.jpg', { type: 'image/jpeg' })], configurable: true });
  coverIn.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick(20);
  check(m.cover && M.cover(m).original === 'cover.jpg' && folder.files[M.cover(m).file], 'a cover picture is kept in the attachments folder');
  const picsIn = doc.querySelector('[data-input="musing-pics"]');
  Object.defineProperty(picsIn, 'files', { value: [new win.File(['1'], 'a.jpg', { type: 'image/jpeg' }), new win.File(['2'], 'b.jpg', { type: 'image/jpeg' })], configurable: true });
  picsIn.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick(20);
  check(M.gallery(m).length === 2 && !M.gallery(m).some((a) => a.id === m.cover), 'pictures go in the gallery (the cover isn\'t in it)');
  type(doc.querySelector(`[data-caption="${M.gallery(m)[0].id}"]`), 'The garden after');
  await tick(800);
  check(M.gallery(m)[0].caption === 'The garden after', 'a caption saves too');

  // Reading it
  doc.querySelector('#main [data-action="musing-done"]').click();
  const page = doc.querySelector('#main .musing-page');
  check(page && page.querySelector('.musing-cover') && page.querySelector('.musing-title').textContent === 'Rain on the roof', 'Done shows it to read: the cover above the title');
  check(page.querySelector('.musing-body h2')?.textContent === 'The storm' && page.querySelector('.musing-body b') && page.querySelector('.musing-body i') && page.querySelector('.musing-body blockquote') && page.querySelectorAll('.musing-body li').length === 2, 'headings, bold, italics, a quote and a list show as such');
  check(page.querySelectorAll('.musing-gallery figure').length === 2 && /The garden after/.test(page.textContent), 'the gallery at the end, with captions');
  page.querySelector('.musing-gallery [data-action="musing-view"]').click();
  await tick(10);
  check(doc.querySelector('#viewer') && /2 of 3/.test(doc.querySelector('#viewer').textContent), 'a picture opens in the viewer (cover and gallery together)');
  win.eval('Viewer').close();
  check(doc.querySelector('#main [data-action="musing-print"]'), 'it can be printed or saved as a PDF');
  check(!doc.querySelector('#main [data-input="page-filter"]'), 'a piece open: no filter box');

  // The list
  const second = M.add();
  Object.assign(second, { title: 'Letters home', body: 'Dear all', status: 'finished', collections: ['Letters'], written: '2024-03-01' });
  win.eval('changed')('musings');
  doc.querySelector('#main [data-action="musing-close"]').click();
  check(doc.querySelectorAll('#main .musing-row').length === 2 && doc.querySelector('#main .musing-row img[data-thumb]'), 'the list has each piece, the cover small beside it');
  doc.querySelector('[data-musing-tab="draft"]').click();
  check(doc.querySelectorAll('#main .musing-row').length === 1, 'Drafts shows only drafts');
  doc.querySelector('[data-musing-tab="all"]').click();
  const g = doc.querySelector('[data-list-tool="musings"][data-kind="group"]');
  g.value = 'collection';
  g.dispatchEvent(new win.Event('change', { bubbles: true }));
  check([...doc.querySelectorAll('#main .list-group b')].map((b) => b.textContent).sort().join() === 'Letters,Poems', 'grouped by collection');
  check(win.eval('Search').run('storm').musings.length === 1, 'search finds a piece by its words');

  // Picture names: an untitled piece's, then renamed to the title on Done
  doc.querySelector('#main [data-action="musing-new"]').click();
  const u = M.get(PA.state.musing);
  const pin = doc.querySelector('[data-input="musing-pics"]');
  Object.defineProperty(pin, 'files', { value: [new win.File(['p'], 'IMG_1.jpg', { type: 'image/jpeg' })], configurable: true });
  pin.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick(20);
  const pic = u.attachments[0];
  check(pic && /^Untitled piece \d{4}\.jpg$/.test(pic.file), 'a picture added before there\'s a title is named "Untitled piece"');
  const old = pic.file;
  type(doc.querySelector('[data-musing-field="title"]'), 'Morning walk');
  doc.querySelector('#main [data-action="musing-done"]').click();
  await tick(30);
  check(/^Morning walk \d{4}\.jpg$/.test(pic.file) && folder.files[pic.file] && !folder.files[old], 'on Done its pictures take the title, and the file is renamed too');
  doc.querySelector('#main [data-action="musing-close"]').click();

  // Delete
  win.eval('PendingDelete').UNDO_MS = 30;
  doc.querySelector('#main [data-action="musing-open"]').click();
  const shown = PA.state.musing;
  doc.querySelector('#main [data-action="musing-delete"]').click();
  check(!PA.DB.musings.some((x) => x.id === shown) && PA.DB.trash.some((e) => e.kind === 'musings') && !PA.state.musing, 'Delete puts it in the Trash (with Undo)');

  check(!app.errors.length, 'no script errors');
  app.close();

  // Read-only
  const ro = loadApp({ fsa: false });
  check(['musing-new', 'musing-edit', 'musing-delete'].every((x) => ro.win.eval('EDIT_ACTIONS').has(x)), 'writing is edit-only');
  ro.close();
  done();
})();
