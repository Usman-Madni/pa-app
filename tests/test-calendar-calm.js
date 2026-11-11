// Redesign stage 4: the calendar uses three colour meanings, not seven. Late (overdue, or missed and done later) is
// the danger colour, today is the accent, everything else is ink (coming up on a quiet fill, done faded and struck,
// events outlined, repeats dashed). The phone shows a mark per day: late days get the late colour, and its own
// short legend says so. Each day says what it holds for a screen reader.
const { loadApp, check, done } = require('./helpers');

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const inMonth = (n) => iso(new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), n));

(async () => {
  const app = loadApp({});
  const { win, doc, PA } = app;
  const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('');
  const root = win.getComputedStyle(doc.documentElement);
  const v = (name) => root.getPropertyValue(name).trim();

  // --- Three meanings in the colour tokens ---
  check(v('--c-overdue') === 'var(--danger)' && v('--c-late') === 'var(--danger)', 'overdue and missed share the late colour');
  check(v('--c-today') === 'var(--accent)', 'today is the accent');
  check(!/--c-upcoming|--c-done/.test(css), 'no colours of their own for coming up or done');
  check(!/#[0-9a-f]{6}/i.test(css.slice(css.indexOf('Calendar colours'), css.indexOf('.cal-legend {'))), 'no colour written into the calendar rules: only the palette');
  check(!/\.day-item[^{]*\{[^}]*border-left:\s*3px/.test(css), 'no coloured stripes down the day list');

  // --- The grid: a late day is marked, and says so ---
  PA.addTask({ title: 'Late thing', due: `${inMonth(1)}T09:00` });
  PA.addTask({ title: 'Later thing', due: `${inMonth(28)}T09:00` });
  PA.state.calMonth = firstOfMonth;
  doc.querySelector('[data-view="calendar"]').click();
  const late = doc.querySelector(`.cal-day[data-day="${inMonth(1)}"]`);
  const fine = doc.querySelector(`.cal-day[data-day="${inMonth(28)}"]`);
  const isPast = inMonth(1) < PA.toISO(new Date());
  check(!isPast || (late.classList.contains('has-late') && /something late/.test(late.getAttribute('aria-label'))), 'a day with something late is marked late, and says so');
  check(!fine.classList.contains('has-late') || inMonth(28) < PA.toISO(new Date()), 'a day with nothing late is not');
  check(/1 item/.test(fine.getAttribute('aria-label')), 'each day says how many things it holds');
  const chip = fine.querySelector('.chip');
  check(chip && chip.textContent.trim().startsWith('Later thing') && /9:00/.test(chip.title), 'a chip starts with the name (not the time); the time is in its tooltip');

  // --- Two legends: names on a computer, marks on the phone ---
  const desk = doc.querySelector('.cal-legend.desk-only');
  const phone = doc.querySelector('.cal-legend.phone-only');
  check(desk && phone && phone.querySelector('.cal-mark.late') && /Something late/.test(phone.textContent), 'the phone gets its own short legend for the marks');
  check(/max-width:\s*680px[\s\S]*\.cal-legend\.desk-only\s*\{\s*display:\s*none/.test(css) && /\.cal-legend\.phone-only\s*\{\s*display:\s*none/.test(css), 'each legend shows only where it fits');
  check(desk.querySelectorAll('span > .chip').length <= 5, 'the computer legend has five swatches, the rest in one sentence');
  check(!/·/.test(doc.querySelector('.cal-legend').textContent), 'no middle dots in the legend');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();
  done();
})();
