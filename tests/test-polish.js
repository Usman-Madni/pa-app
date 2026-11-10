// Redesign stage 5, fixes from the second critique: labels drawn in warm shades (stored colours unchanged), the
// current screen marked for screen readers, "1 task" not "1 tasks", read-only phones still show a task's time,
// readable priority pills, My Day's section headings one level under the page title.
const { loadApp, check, done } = require('./helpers');

(async () => {
  const app = loadApp({});
  const { win, doc, PA } = app;
  const changed = win.eval('changed');
  const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('');

  // --- Labels: the stored colour stays, the shown one is a warm token ---
  PA.DB.labels.push({ id: 'l1', name: 'Call', color: '#3b82f6' }, { id: 'l2', name: 'Odd', color: '#123456' });
  const t = PA.addTask({ title: 'Ring the bank', due: `${PA.toISO(new Date())}T23:59` });
  t.labels = ['l1', 'l2'];
  changed('tasks', 'labels');
  doc.querySelector('[data-view="tasks"]').click();
  const pills = [...doc.querySelectorAll('#main .label-pill')];
  check(pills[0] && pills[0].getAttribute('style') === '--lc:var(--lab-blue)', 'a label is drawn in the warm shade for its colour');
  check(pills[1] && pills[1].getAttribute('style') === '--lc:#123456', 'a colour that isn\'t one of the list is shown as it is');
  check(PA.DB.labels[0].color === '#3b82f6', 'the stored colour is unchanged (the data file keeps it)');
  check(/--lab-blue:\s*#[0-9a-f]{6}/i.test(css) && (css.match(/--lab-blue:/g) || []).length === 3, 'each label shade is a token, with dark-mode values too');

  // --- The current screen is marked for screen readers ---
  check(doc.querySelector('.nav-btn[data-view="tasks"]').getAttribute('aria-current') === 'page' && !doc.querySelector('.nav-btn[data-view="today"]').hasAttribute('aria-current'), 'the current screen\'s button says so (aria-current)');

  // --- Plurals ---
  doc.querySelector('[data-view="settings"]').click();
  const manage = doc.querySelector('#main').textContent;
  check(/Call\s*1 task\b/.test(manage) && !/\b1 tasks\b/.test(manage), 'Settings says "1 task", not "1 tasks"');

  // --- Priority pills: text mixed toward ink, for contrast ---
  check(/\.pill\.high\s*\{[^}]*color:\s*color-mix\(in srgb, var\(--danger\) \d+%, var\(--text\)\)/.test(css) && /\.pill\.med\s*\{[^}]*color:\s*color-mix\(in srgb, var\(--warn\) \d+%, var\(--text\)\)/.test(css), 'priority pills mix their colour toward ink, so they read');

  // --- My Day: headings go h1, then h2 ---
  doc.querySelector('[data-view="today"]').click();
  check(doc.querySelector('#main h2.tl-h') && !doc.querySelector('#main h3.tl-h'), 'My Day\'s section headings are one level under the title');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  void t;
  app.close();

  // --- Read-only phone: a task's time is still shown ---
  check(/body\.phone:not\(\.readonly\) \.p-input\[type="time"\]:disabled\s*\{\s*display:\s*none/.test(css) && !/\nbody\.phone \.p-input\[type="time"\]:disabled\s*\{\s*display:\s*none/.test(css), 'read-only phones keep a set time on show');
  done();
})();
