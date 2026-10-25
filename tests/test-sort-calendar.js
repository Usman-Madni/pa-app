// Sorting and grouping on Tasks (remembered per device, board columns sorted too), the sticky top and
// board layout, and calendar colours (overdue / today / upcoming / done / repeat / event) with a legend.
const { loadApp, check, done } = require('./helpers');

(async () => {
  const app = loadApp({ storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  const pad = (n) => String(n).padStart(2, '0');
  const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  PA.DB.buckets.push({ id: 'b1', name: 'Home', order: 1 }, { id: 'b2', name: 'Bills', order: 2 });
  const mk = (title, extra) => PA.DB.tasks.push(PA.normalizeTask({ id: title, title, created: extra.created || 0, ...extra }));
  mk('Charlie', { due: `${day(-2)}T09:00`, priority: 'low', created: 3, bucket: 'b2' });        // overdue
  mk('alpha', { due: `${day(0)}T23:59`, priority: 'high', created: 1, bucket: 'b1' });          // today
  mk('Bravo', { due: `${day(1)}T10:00`, priority: 'med', created: 5 });                         // tomorrow
  mk('Delta', { due: `${day(5)}T10:00`, priority: 'low', created: 2, bucket: 'b1' });           // next 7 days
  mk('Echo', { due: `${day(30)}T10:00`, priority: 'high', created: 4, bucket: 'b2' });          // later
  mk('Foxtrot', { due: '', priority: 'med', created: 6 });                                       // no date
  mk('Golf', { due: `${day(-1)}T10:00`, done: true, completedAt: Date.now() - 1000, created: 7 }); // done recently
  mk('Hotel', { due: `${day(-3)}T10:00`, done: true, completedAt: Date.now() - 999999, created: 8 }); // done earlier
  doc.querySelector('[data-view="tasks"]').click();
  doc.querySelector('[data-filter="all"]').click();
  const order = () => [...doc.querySelectorAll('#main .item .title')].map((x) => x.textContent.trim().split(/\s/)[0]);
  const sortBy = (v) => { const s = doc.querySelector('[data-input="task-sort"]'); s.value = v; s.dispatchEvent(new win.Event('input', { bubbles: true })); };
  const groupBy = (v) => { const s = doc.querySelector('[data-input="task-group"]'); s.value = v; s.dispatchEvent(new win.Event('input', { bubbles: true })); };

  check(order().join(',') === 'Charlie,alpha,Bravo,Delta,Echo,Foxtrot,Hotel,Golf', `due date (default): overdue first, no date last, done at the end (got ${order().join(',')})`);
  sortBy('priority');
  check(order().slice(0, 2).join(',') === 'alpha,Echo' && order()[5] === 'Delta', 'priority: high first (then by due date)');
  sortBy('name');
  check(order().slice(0, 6).join(',') === 'alpha,Bravo,Charlie,Delta,Echo,Foxtrot', 'name A–Z, ignoring capitals');
  sortBy('newest');
  check(order().slice(0, 2).join(',') === 'Foxtrot,Bravo', 'newest added first');
  sortBy('oldest');
  check(order()[0] === 'alpha', 'oldest added first');
  sortBy('bucket');
  check(order().join(',').startsWith('Bravo,Foxtrot,alpha,Delta,Charlie,Echo'), 'bucket order: no bucket, Home, Bills (each by due date)');
  sortBy('completed');
  check(order().slice(0, 2).join(',') === 'Golf,Hotel', 'completed: latest done first');
  check(win.localStorage.getItem('dev_taskSort') === '"completed"', 'sort choice is remembered on this device');

  // Group by due date
  sortBy('due');
  groupBy('due');
  const heads = [...doc.querySelectorAll('#main .group-h')].map((h) => h.childNodes[0].textContent.trim());
  check(heads.join('|') === 'Overdue|Today|Tomorrow|Next 7 days|Later|No date|Done', `group by due date (got ${heads.join('|')})`);
  check(doc.querySelectorAll('#main .group-h')[0].textContent.includes('1'), 'each heading shows its count');
  groupBy('bucket');
  const bheads = [...doc.querySelectorAll('#main .group-h')].map((h) => h.childNodes[0].textContent.trim());
  check(bheads.join('|') === 'No bucket|Home|Bills', 'group by bucket, in bucket order');
  check(win.localStorage.getItem('dev_taskGroup') === '"bucket"', 'grouping is remembered too');
  groupBy('none');
  check(!doc.querySelector('#main .group-h'), 'no groups');

  // Sticky top on List; on Board the board scrolls and column names stick
  check(doc.querySelector('#main .sticky-top .tabs') && doc.querySelector('#main .sticky-top [data-input="task-sort"]'), 'tabs, filters and sort sit in the sticky top');
  check(!doc.querySelector('#main .sticky-top form.quick-add'), 'the add box is not in the sticky part');
  doc.querySelector('[data-action="layout"][data-layout="board"]').click();
  check(doc.querySelector('.main').classList.contains('fill') && !doc.querySelector('[data-input="task-group"]'), 'Board fills the window; Group by is List-only');
  sortBy('name');
  const homeCards = [...doc.querySelectorAll('[data-bucket-col="b1"] .task-card .title')].map((x) => x.textContent.trim().split(/\s/)[0]);
  check(homeCards.join(',') === 'alpha,Delta', 'board cards follow the sort too');
  const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('');
  check(/\.board-head\s*\{[^}]*position:\s*sticky/.test(css) && /\.sticky-top\s*\{[^}]*position:\s*sticky/.test(css), 'column names and the top are sticky');

  // Calendar colours
  PA.DB.events.push({ id: 'e1', title: 'Dentist', date: day(1), time: '15:00' });
  PA.DB.tasks.push(PA.normalizeTask({ id: 'rep', title: 'Gym', due: `${day(0)}T07:00`, repeat: { freq: 'daily', interval: 1, days: [], monthMode: 'date', unit: 'days', until: '' } }));
  PA.state.calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  PA.state.selectedDay = day(0);
  doc.querySelector('[data-view="calendar"]').click();
  const chipOf = (title) => [...doc.querySelectorAll('.cal-day .chip')].find((c) => c.textContent.includes(title));
  const hasCls = (title, cls) => { const c = chipOf(title); return !!c && c.classList.contains(cls); };
  // Some test days may fall outside this month's grid near month ends; check the ones that are shown.
  const shown = (title) => !!chipOf(title);
  check(!shown('Charlie') || hasCls('Charlie', 't-overdue'), 'overdue tasks are red');
  check(hasCls('alpha', 't-today'), 'tasks due today use the accent colour');
  check(!shown('Bravo') || hasCls('Bravo', 't-upcoming'), 'upcoming tasks are blue');
  check(!shown('Golf') || hasCls('Golf', 't-latedue'), 'a task done after its due date is orange on its due day');
  check(!shown('Dentist') || hasCls('Dentist', 'event'), 'events have their own colour');
  check([...doc.querySelectorAll('.chip.repeat')].some((c) => c.textContent.includes('Gym')), 'next repeats are dashed');
  const legend = doc.querySelector('.cal-legend');
  check(legend && ['Overdue', 'Due today', 'Upcoming', 'Done', 'Next repeat', 'Event'].every((w) => legend.textContent.includes(w)), 'a legend explains the colours');
  const todayItem = [...doc.querySelectorAll('#main .day-item')].find((li) => li.textContent.includes('alpha'));
  check(todayItem && todayItem.classList.contains('t-today') && todayItem.textContent.includes('Due today'), 'the day list uses the same colours and says "Due today"');
  todayItem.querySelector('[data-action="open-task"]').click();
  check(PA.state.openTask === 'alpha', 'clicking a task in the day list opens it');
  app.close();
  done();
})();
