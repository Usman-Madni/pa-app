// Keyboard shortcuts: 1 to 9 and 0 the screens in the sidebar's order, N Notifications, Q W E R T… the open screen's
// buttons in order, A S D F G… its tabs in order, Esc back from a sub-page, ? lists them; never while typing in a box,
// with Ctrl, or while a question or pop-up is open. Notes' editor and Settings' one clear first step.
const { loadApp, check, done, answer } = require('./helpers');

(async () => {
  const app = loadApp({});
  const { win, doc, PA } = app;
  const key = (k, target = doc.body, extra = {}) => {
    const e = new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
    target.dispatchEvent(e);
    return e;
  };

  // --- 1 to 9 and 0: the screens, in the sidebar's order; N: Notifications ---
  const views = ['today', 'tasks', 'calendar', 'notes', 'assets', 'utilities', 'musings', 'zakat', 'vault'];
  views.forEach((v, i) => { key(String(i + 1)); check(PA.state.view === v, `${i + 1} opens ${v}`); });
  key('0');
  check(PA.state.view === 'settings', '0 opens Settings');
  key('n');
  check(doc.querySelector('#bell-pop') && PA.state.view === 'settings', 'N opens the bell\'s window (the page stays)');
  key('Escape');
  check(!doc.querySelector('#bell-pop'), 'Esc closes it');
  check(doc.querySelector('.nav-btn[data-view="assets"]').title === 'Assets (5)' && doc.querySelector('#main .bell-btn').title === 'Notifications (N)', 'each screen\'s button says its key');

  // --- Q W E…: the screen's buttons in order; A S D…: its tabs ---
  key('5');
  key('w');
  check(doc.querySelector('#modal form[data-form="asset-asset"]'), 'on Assets, W is its second button (+ Asset, outlined, after the teal ones)');
  doc.querySelector('#modal [data-action="asset-cancel"]').click();
  key('q');
  check(doc.querySelector('#modal form[data-form="asset-rates"]'), 'and Q its first (+ Rates)');
  key('3');
  check(PA.state.view === 'assets', 'with a pop-up open, keys don\'t switch screens');
  doc.querySelector('#modal [data-action="asset-cancel"]').click();
  const tabs = [...doc.querySelectorAll('#main [role="tablist"] .tab')];
  key('s');
  check(tabs[1]?.dataset.assetTab === 'property' && PA.state.view === 'property', 'S presses its second tab (Property, which opens its page)');

  // --- Esc: back from a sub-page ---
  key('Escape');
  check(PA.state.view === 'assets', 'Esc on a sub-page (Property) goes back to Assets');

  // --- Not while typing, not with Ctrl, not while a question is open ---
  key('1');
  const box = doc.querySelector('#main form.quick-add [data-qa]');
  box.focus();
  const typed = key('2', box);
  check(!typed.defaultPrevented && PA.state.view === 'today', 'typing "2" in a box types it: the screen stays');
  const typedQ = key('q', box);
  check(!typedQ.defaultPrevented && !doc.querySelector('#modal form'), 'and "q" types too');
  key('2', doc.body, { ctrlKey: true });
  check(PA.state.view === 'today', 'Ctrl+2 is left to the browser');
  const asked = win.eval('ask')('Sure?');
  key('3');
  check(PA.state.view === 'today', 'while a question is open, keys don\'t switch screens');
  await answer(win, false);
  await asked;

  // --- ? lists them ---
  key('?');
  check(/1 My Day, 2 Tasks.*0 Settings, N Notifications \(the bell\).*Q W E R T/.test(doc.querySelector('#toasts').textContent), '? lists the shortcuts');

  // --- Notes: delete is an icon at the top of the note, not a red button in the corner ---
  key('4');
  doc.querySelector('[data-action="new-note"]').click();
  const del = doc.querySelector('.editor .note-head [data-action="delete-note"]');
  check(del && del.getAttribute('aria-label') === 'Delete note' && del.querySelector('use[href="#i-trash"]'), 'Notes: delete is a labelled bin icon in the note\'s header');
  check(/saved as you type/.test(doc.querySelector('#main .sub').textContent), 'Notes says it saves as you type');

  // --- Settings: two columns, and only the data file card has a filled button ---
  doc.body.focus();
  win.eval('setView')('settings');
  const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('');
  check(doc.querySelector('.settings-grid') && /\.settings-grid \.card:not\(#df-card\) \.btn\.primary\s*\{[^}]*background:\s*transparent/.test(css), 'Settings: one filled button (the data file\'s), the rest outlined');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();

  // --- Read-only: buttons that change things aren't pressed; screens still switch ---
  const ro = loadApp({ fsa: false });
  ro.win.eval('setView')('assets');
  const e = new ro.win.KeyboardEvent('keydown', { key: 'q', bubbles: true, cancelable: true });
  ro.doc.body.dispatchEvent(e);
  check(!e.defaultPrevented && !ro.doc.querySelector('#modal form'), 'read-only: Q (Add asset) does nothing');
  ro.doc.body.dispatchEvent(new ro.win.KeyboardEvent('keydown', { key: '3', bubbles: true, cancelable: true }));
  check(ro.PA.state.view === 'calendar', 'read-only: screens still switch');
  ro.close();
  done();
})();
