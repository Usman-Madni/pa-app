// Calendar extras: a late task also shows (faded ✓) on the day it was actually done; "again after I finish it"
// repeats show estimated next dates (from the due date, or from today when overdue); the Done pop-up has
// no "(optional)" label.
const { loadApp, check, done } = require('./helpers');

(async () => {
  const app = loadApp({ storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const items = (key) => win.eval('itemsForDay')(key, win.eval('repeatPreviews')(key, key));

  // --- Late task: chip on its due date AND a faded ✓ on the day it was done ---
  const t = PA.addTask({ title: 'Pay water bill', due: '2026-10-01T23:59' });
  PA.completeTask(t, new Date(2026, 9, 20, 18, 30), false);
  const onDue = items('2026-10-01').filter((i) => i.id === t.id);
  const onDone = items('2026-10-20').filter((i) => i.id === t.id);
  check(onDue.length === 1 && onDue[0].kind === 'task' && onDue[0].late, 'still on its due date (done late)');
  check(onDone.length === 1 && onDone[0].kind === 'doneon' && onDone[0].time === '18:30', 'and on the day it was done (20 Oct, 6:30 pm)');
  const onTime = PA.addTask({ title: 'Return book', due: '2026-10-05T23:59' });
  PA.completeTask(onTime, new Date(2026, 9, 5, 12), true);
  const early = PA.addTask({ title: 'Renew licence', due: '2026-10-10T23:59' });
  PA.completeTask(early, new Date(2026, 9, 3, 12), true);
  check(!items('2026-10-05').some((i) => i.kind === 'doneon') && !items('2026-10-03').some((i) => i.kind === 'doneon'), 'tasks done on time or early get no extra chip');

  PA.state.calMonth = new Date(2026, 9, 1);
  PA.state.selectedDay = '2026-10-20';
  doc.querySelector('[data-view="calendar"]').click();
  const chip = [...doc.querySelectorAll('.cal-day[data-day="2026-10-20"] .chip')].find((c) => c.textContent.includes('Pay water bill'));
  check(chip && chip.classList.contains('doneon') && chip.textContent.startsWith('✓'), 'the done-day chip is a faded "✓ title"');
  const row = [...doc.querySelectorAll('#main .day-item')].find((li) => li.textContent.includes('Pay water bill'));
  check(row && /Done this day — was due Thu, (Oct 1|1 Oct) \(19 days late\)/.test(row.textContent), `day list: "Done this day — was due Oct 1 (19 days late)"`);
  row.querySelector('[data-action="open-task"]').click();
  check(PA.state.openTask === t.id, 'clicking it opens the task');
  check(doc.querySelector('.cal-legend').textContent.includes('Done that day (late)') && doc.querySelector('.cal-legend').textContent.includes('Estimated repeat'), 'legend explains both new chips');
  // --- Late bar: ○ due day ━━ ● done day, lanes, across week rows; chip notes; hover links them ---
  const m = PA.addTask({ title: 'm', due: '2026-10-24T23:59' }); // a Saturday
  PA.completeTask(m, new Date(2026, 9, 25, 12), true);           // the Sunday after (next week row)
  const ins = PA.addTask({ title: 'Insurance', due: '2026-10-09T23:59' });
  PA.completeTask(ins, new Date(2026, 9, 15, 12), true);
  PA.render();
  const segs = (id) => [...doc.querySelectorAll(`.late-seg[data-late="${id}"]`)];
  const dayOf = (el) => el.closest('.cal-day').dataset.day;
  check(segs(m.id).map(dayOf).join(',') === '2026-10-24,2026-10-25', 'the bar runs from the due day to the done day');
  check(segs(m.id)[0].classList.contains('s-start') && segs(m.id)[1].classList.contains('s-end'), 'it starts at the due day (○) and ends at the done day (●)');
  check(segs(m.id)[0].classList.contains('s-wrapr') && segs(m.id)[1].classList.contains('s-wrapl'), 'it carries on from Saturday to the next row\'s Sunday');
  check(segs(t.id).length === 20, 'a 19-days-late task has a bar across all 20 days');
  const lanes = (id) => new Set(segs(id).map((s) => s.style.getPropertyValue('--lane')));
  check([...lanes(t.id)][0] !== [...lanes(ins.id)][0], 'overlapping late bars get separate lanes so they don\'t cover each other');
  const dueChip = doc.querySelector('.cal-day[data-day="2026-10-24"] .chip[data-late]');
  const doneChip = doc.querySelector('.cal-day[data-day="2026-10-25"] .chip[data-late]');
  check(dueChip.textContent.includes('m · +1d') && dueChip.querySelector('.chip-note'), 'the due-day chip says "+1d"');
  check(doneChip.textContent.includes('✓ m · due 24th'), 'the done-day chip says "due 24th"');
  const otherMonth = doc.querySelector('.cal-day[data-day="2026-10-20"] .chip.doneon');
  check(otherMonth && /due (1st|Oct 1)/.test(otherMonth.textContent), 'same month → "due 1st"');
  dueChip.dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));
  const lit = [...doc.querySelectorAll('.late-hl')];
  check(lit.length === 4 && lit.every((x) => x.dataset.late === m.id), 'pointing at it highlights its due chip, bar and done chip together');
  doc.querySelector('.cal-head').dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));
  check(!doc.querySelector('.late-hl'), 'moving away clears the highlight');
  const legend = doc.querySelector('.cal-legend');
  check(legend.querySelector('.chip.t-overdue').textContent === 'Task' && legend.querySelector('.legend-bar'), 'legend swatches are sample chips, plus the late bar');

  // The My Day "Events today" card only counts events
  PA.state.openTask = null;
  PA.renderDrawer();

  // --- "Again after I finish it": estimated previews ---
  const today = new Date();
  const plus = (n) => iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n));
  const w = PA.addTask({ title: 'Water plants', due: `${plus(1)}T23:59` });
  w.repeat = { freq: 'after', interval: 3, unit: 'days', days: [], monthMode: 'date', until: '' };
  const est = (key) => items(key).filter((i) => i.id === w.id && i.kind === 'repeat');
  check(est(plus(4)).length === 1 && est(plus(4))[0].est && est(plus(7)).length === 1, 'estimates every 3 days from the due date (+4, +7 …)');
  check(est(plus(4))[0].time === '', 'no 23:59 on estimates');
  // Overdue: counted from today
  const late = PA.addTask({ title: 'Clean filter', due: `${plus(-10)}T09:00` });
  late.repeat = { freq: 'after', interval: 1, unit: 'weeks', days: [], monthMode: 'date', until: '' };
  const lest = (key) => items(key).filter((i) => i.id === late.id && i.kind === 'repeat');
  check(lest(plus(7)).length === 1 && lest(plus(-3)).length === 0, 'an overdue one is estimated from today (+7), not from its old due date');
  check(lest(plus(7))[0].time === '09:00', 'keeps its time');
  // Ends after N times also limits estimates
  const c = PA.addTask({ title: 'Course', due: `${plus(1)}T23:59` });
  c.repeat = { freq: 'after', interval: 1, unit: 'days', days: [], monthMode: 'date', until: '', endMode: 'count', count: 2 };
  check(items(plus(2)).some((i) => i.id === c.id) && !items(plus(3)).some((i) => i.id === c.id), 'estimates stop at the end (2 times)');
  // On the grid: dotted, ↻≈
  PA.state.calMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  PA.state.selectedDay = plus(4);
  PA.render();
  const echip = [...doc.querySelectorAll('.chip.repeat.est')].find((x) => x.textContent.includes('Water plants'));
  check(echip && echip.textContent.startsWith('↻≈'), 'estimates look different: "↻≈", dotted');
  const erow = [...doc.querySelectorAll('#main .day-item')].find((li) => li.textContent.includes('Water plants'));
  check(!erow || erow.textContent.includes('Estimated repeat'), 'day list calls it an estimated repeat');
  // The real copy follows the actual done day
  const copy = PA.completeTask(w, new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2, 12), true);
  check(copy.due.startsWith(plus(5)), 'ticked off a day late → the real next one is 3 days after that (+5), not the estimate');

  // --- Done pop-up: no "(optional)" ---
  doc.querySelector('[data-view="tasks"]').click();
  const p = PA.addTask({ title: 'Popup check' });
  PA.render();
  doc.querySelector(`#main [data-action="toggle-task"][data-id="${p.id}"]`).click();
  const modal = doc.querySelector('#modal .modal');
  check(!modal.textContent.includes('(optional)') && modal.textContent.includes('Leave the time empty'), 'no "(optional)" next to Time; a hint underneath instead');
  const labels = [...modal.querySelectorAll('.field')].map((l) => l.firstChild.textContent.trim());
  check(labels.join(',') === 'Done on,Time', 'both labels are plain, so the boxes line up');
  app.close();
  done();
})();
