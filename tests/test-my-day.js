// My Day (redesign stage 2): one timeline of today instead of two number boxes. Late tasks from earlier days are
// pinned on top; today's timed tasks and events go in time order with a "Now" line between past and still to come;
// then what's for any time today, then what's done today. Beside it: the next 7 days, and tasks with no date. The
// counts are in the line under the title. The phone shows the same.
const { loadApp, check, done } = require('./helpers');

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

function seed(PA) {
  // 00:01 is always past and 23:58 always still to come (23:59 means "any time that day")
  PA.addTask({ title: 'Pay rent', due: `${day(-2)}T23:59` });
  PA.addTask({ title: 'Early call', due: `${day(0)}T00:01` });
  PA.addTask({ title: 'Late reply', due: `${day(0)}T23:58` });
  PA.addTask({ title: 'Buy milk', due: `${day(0)}T23:59` });
  const doneOne = PA.addTask({ title: 'Return book', due: `${day(0)}T23:59` });
  PA.Series.tick(doneOne, new Date(), true);
  PA.addTask({ title: 'Book dentist' });
  PA.addTask({ title: 'Renew insurance', due: `${day(3)}T23:59` });
  PA.addTask({ title: 'Far away', due: `${day(20)}T23:59` });
  PA.DB.events.push({ id: 'e1', title: 'Morning walk', date: day(0), time: '00:02' }, { id: 'e2', title: 'Night show', date: day(0), time: '23:57' },
    { id: 'e3', title: 'Holiday', date: day(0), time: '' }, { id: 'e4', title: 'Team call', date: day(2), time: '11:00' });
  PA.changed('tasks', 'events');
}
const sections = (doc) => [...doc.querySelectorAll('#main .tl-card .tl-h')].map((h) => h.textContent);
const titlesIn = (doc, heading) => {
  const h = [...doc.querySelectorAll('#main .tl-h')].find((x) => x.textContent === heading);
  return h ? [...h.nextElementSibling.children].map((li) => (li.classList.contains('tl-now') ? 'NOW' : li.querySelector('.title').textContent.replace(/\s+/g, ' ').trim())) : null;
};

(async () => {
  const app = loadApp({});
  const { doc, PA } = app;
  PA.changed = app.win.eval('changed');
  seed(PA);
  doc.querySelector('[data-view="today"]').click();

  check(!doc.querySelector('#main .stat'), 'no number boxes any more');
  const sub = doc.querySelector('#main .page-head .sub').textContent;
  check(/3 tasks and 3 events today, 1 late from before\./.test(sub),`the counts are in the line under the title: ${sub}`);
  check(sections(doc).join('|') === 'Late|Today|Any time today|Done today', `sections in order: ${sections(doc).join('|')}`);
  check(titlesIn(doc, 'Late').join('|') === 'Pay rent', 'late tasks from earlier days are pinned on top');
  const timeline = titlesIn(doc, 'Today');
  check(timeline.join('|') === 'Early call|Morning walk|NOW|Night show|Late reply', `today's tasks and events in time order, with Now between past and still to come: ${timeline.join('|')}`);
  check(doc.querySelector('#main .tl-row.tl-past .title').textContent.includes('Early call'), 'a task whose time has passed shows its time as late');
  check(titlesIn(doc, 'Any time today').join('|') === 'Holiday|Buy milk', 'then what is for any time today (an all-day event first)');
  check(titlesIn(doc, 'Done today').join('|') === 'Return book', 'then what is done today');
  const side = [...doc.querySelectorAll('#main .today-side .card')];
  const coming = [...side[0].querySelectorAll('.title')].map((x) => x.textContent.trim());
  check(/Coming up/.test(side[0].querySelector('h2').textContent) && coming.join('|') === 'Team call|Renew insurance', `Coming up: the next 7 days in date order: ${coming.join('|')}`);
  check(side[1] && /Anytime/.test(side[1].textContent) && side[1].textContent.includes('Book dentist'), 'Anytime: tasks with no date');
  check(!doc.querySelector('#main .tl-card').textContent.includes('Far away'), 'nothing from further ahead');
  const lateReply = [...doc.querySelectorAll('#main .tl-row')].find((li) => li.textContent.includes('Late reply'));
  check(lateReply && !lateReply.querySelector('.meta')?.textContent.includes('Today'), 'a timeline row doesn\'t repeat its date and time underneath');

  // Ticking from the timeline works as anywhere else
  lateReply.querySelector('[data-action="toggle-task"]').click();
  check(doc.querySelector('#modal form[data-form="done-date"]'), 'ticking asks "Done on…" as usual');
  app.close();

  // An empty day says so
  const empty = loadApp({});
  empty.doc.querySelector('[data-view="today"]').click();
  check(/Nothing planned today/.test(empty.doc.querySelector('#main .sub').textContent) && empty.doc.querySelector('#main .tl-card .empty'), 'an empty day: "Nothing planned today"');
  empty.close();

  // The phone shows the same timeline (read-only, from a picked file)
  const ro = loadApp({ fsa: false });
  const tasks = [{ id: 'x', title: 'Phone task', due: `${day(0)}T23:58`, priority: 'low', done: false }];
  await ro.PA.RO.open({ name: 'd.json', text: async () => JSON.stringify({ app: 'PA App', version: 2, saveToken: 't', data: { tasks, notes: [], events: [{ id: 'ev', title: 'Phone event', date: day(0), time: '00:02' }] } }) });
  ro.doc.querySelector('[data-view="today"]').click();
  check(titlesIn(ro.doc, 'Today').join('|') === 'Phone event|NOW|Phone task', 'the phone shows the same timeline');
  check(ro.doc.querySelector('#main .tl-row [data-action="toggle-task"]').disabled && !ro.doc.querySelector('#main form.quick-add:not([hidden])')?.offsetParent, 'read-only: tick boxes are off');
  check(app.errors.length === 0 && empty.errors.length === 0 && ro.errors.length === 0, 'no script errors' + (app.errors[0] || ro.errors[0] ? ': ' + (app.errors[0] || ro.errors[0]) : ''));
  ro.close();
  done();
})();
