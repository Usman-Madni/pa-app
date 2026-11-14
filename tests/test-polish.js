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

  // --- No em dashes or middle dots in what the screens show ---
  const late = PA.addTask({ title: 'Was late', due: '2026-10-01T09:00' });
  PA.Series.tick(late, new Date(2026, 9, 20, 18, 30), false);
  changed('tasks');
  const shownText = [];
  for (const v of ['today', 'tasks', 'calendar', 'notes', 'notices', 'settings']) {
    doc.querySelector(`[data-view="${v}"]`).click();
    shownText.push(doc.querySelector('#main').textContent, doc.querySelector('#banner').textContent);
  }
  PA.state.calMonth = new Date(2026, 9, 1);
  PA.state.selectedDay = '2026-10-20';
  doc.querySelector('[data-view="calendar"]').click();
  shownText.push(doc.querySelector('#main').textContent);
  const odd = shownText.join(' ').match(/.{0,30}( — | · ).{0,30}/);
  check(!odd, 'no em dashes or middle dots on any screen' + (odd ? `: "${odd[0]}"` : ''));

  // --- My Day: headings go h1, then h2 ---
  doc.querySelector('[data-view="today"]').click();
  check(doc.querySelector('#main h2.tl-h') && !doc.querySelector('#main h3.tl-h'), 'My Day\'s section headings are one level under the title');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  // --- Task panel: the time, "no time" and × move under the date when the panel is narrow, never cut off ---
  PA.TaskEdit.setDue(t, `${PA.toISO(new Date())}T12:25`);
  PA.state.openTask = t.id;
  PA.renderDrawer();
  const when = doc.querySelector('#drawer [data-field="dueDate"]').parentElement;
  const wt = when.querySelector('.p-when-time');
  check(when.classList.contains('p-when') && wt && wt.querySelector('[data-field="dueTime"]') && wt.querySelector('[data-action="clear-time"]') && wt.querySelector('[data-action="clear-due"]'), 'the due time, "no time" and × sit together in the date\'s group');
  check(/\.p-when\s*\{[^}]*flex-wrap:\s*wrap/.test(css) && /\.p-when\s*\{[^}]*min-width:\s*0/.test(css), 'that group wraps instead of running off the panel');
  PA.Series.tick(t, new Date(), false);
  PA.renderDrawer();
  const dwt = doc.querySelector('#drawer [data-field="doneTime"]').parentElement;
  check(dwt.classList.contains('p-when-time') && dwt.querySelector('[data-action="clear-done-time"]') && dwt.parentElement.classList.contains('p-when'), 'the Done on row works the same way');
  app.close();

  // --- The phone's banner: a few words on a phone-sized screen, the full text on wider ones and in Settings ---
  const ph = loadApp({ fsa: false });
  const banner = ph.doc.querySelector('#banner .banner');
  check(banner.classList.contains('has-short') && banner.querySelector('.ro-short').textContent === 'Sign in to edit.' && /Open your data file/.test(banner.querySelector('.ro-more').textContent), 'the phone banner has short words and the full text');
  check(/max-width:\s*680px[\s\S]*\.banner\.has-short \.ro-more\s*\{\s*display:\s*none/.test(css) && /\.ro-short\s*\{\s*display:\s*none/.test(css), 'a phone-sized screen shows only the short words; wider screens the full text');
  check(!banner.querySelector('label.btn.primary'), 'one filled button in the banner, not two');
  ph.close();

  // --- Read-only phone: a task's time is still shown ---
  check(/body\.phone:not\(\.readonly\) \.p-input\[type="time"\]:disabled\s*\{\s*display:\s*none/.test(css) && !/\nbody\.phone \.p-input\[type="time"\]:disabled\s*\{\s*display:\s*none/.test(css), 'read-only phones keep a set time on show');
  done();
})();
