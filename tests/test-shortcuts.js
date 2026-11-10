// Redesign stage 5: keyboard shortcuts for daily use (1 to 6 switch screens, N puts the cursor in quick add, ? lists
// them), never while typing in a box or while a question is open; Notes' editor and Settings' one clear first step.
const { loadApp, check, done, answer } = require('./helpers');

(async () => {
  const app = loadApp({});
  const { win, doc, PA } = app;
  const key = (k, target = doc.body, extra = {}) => {
    const e = new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
    target.dispatchEvent(e);
    return e;
  };

  // --- 1 to 6 switch screens ---
  const views = ['today', 'tasks', 'calendar', 'notes', 'notices', 'settings'];
  views.forEach((v, i) => { key(String(i + 1)); check(PA.state.view === v, `${i + 1} opens ${v}`); });
  check(doc.querySelector('.nav-btn[data-view="tasks"]').title === 'Tasks (2)', 'each screen\'s button says its key');

  // --- N: the cursor in quick add (on Tasks when this screen has none) ---
  key('6');
  const n = key('n');
  check(n.defaultPrevented && PA.state.view === 'tasks' && doc.activeElement && doc.activeElement.matches('form.quick-add [data-qa]'), 'N on Settings goes to Tasks with the cursor in quick add');
  key('1', doc.body);
  key('n');
  check(PA.state.view === 'today' && doc.activeElement.matches('form.quick-add[data-ctx="today"] [data-qa]'), 'N on My Day uses My Day\'s own quick add');

  // --- Not while typing, not with Ctrl, not while a question is open ---
  const box = doc.activeElement;
  const typed = key('2', box);
  check(!typed.defaultPrevented && PA.state.view === 'today', 'typing "2" in a box types it: the screen stays');
  key('2', doc.body, { ctrlKey: true });
  check(PA.state.view === 'today', 'Ctrl+2 is left to the browser');
  const asked = win.eval('ask')('Sure?');
  key('3');
  check(PA.state.view === 'today', 'while a question is open, keys don\'t switch screens');
  await answer(win, false);
  await asked;

  // --- ? lists them ---
  key('?');
  check(/1 My Day, 2 Tasks/.test(doc.querySelector('#toasts').textContent), '? lists the shortcuts');

  // --- Notes: delete is an icon at the top of the note, not a red button in the corner ---
  key('4');
  doc.querySelector('[data-action="new-note"]').click();
  const del = doc.querySelector('.editor .note-head [data-action="delete-note"]');
  check(del && del.getAttribute('aria-label') === 'Delete note' && del.querySelector('use[href="#i-trash"]'), 'Notes: delete is a labelled bin icon in the note\'s header');
  check(/saved as you type/.test(doc.querySelector('#main .sub').textContent), 'Notes says it saves as you type');

  // --- Settings: two columns, and only the data file card has a filled button ---
  key('6');
  const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('');
  check(doc.querySelector('.settings-grid') && /\.settings-grid \.card:not\(#df-card\) \.btn\.primary\s*\{[^}]*background:\s*transparent/.test(css), 'Settings: one filled button (the data file\'s), the rest outlined');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();

  // --- Read-only: N does nothing, screens still switch ---
  const ro = loadApp({ fsa: false });
  const e = new ro.win.KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true });
  ro.doc.body.dispatchEvent(e);
  check(!e.defaultPrevented && !ro.doc.activeElement.matches?.('[data-qa]'), 'read-only: N does nothing');
  ro.doc.body.dispatchEvent(new ro.win.KeyboardEvent('keydown', { key: '3', bubbles: true, cancelable: true }));
  check(ro.PA.state.view === 'calendar', 'read-only: screens still switch');
  ro.close();
  done();
})();
