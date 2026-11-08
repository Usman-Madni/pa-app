// Merging two copies of the data record by record (mergeData), with a fixed "now": the newer change wins the whole
// record, new records on either side are kept, deleted markers keep a delete from coming back unless the record
// was changed after it, markers expire after 30 days, and older data without times still merges.
const { loadApp, tick, check, done } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win } = app;
  await tick(20);
  const merge = win.eval('mergeData');
  const NOW = Date.UTC(2026, 10, 9, 12);
  const T = (min) => NOW - min * 60000; // `min` minutes ago
  const task = (id, title, updated) => ({ id, title, ...(updated != null ? { updated } : {}) });
  const ids = (list) => list.map((r) => r.id).join(',');

  // The newer change wins the whole record; each side's new records are kept; this side's order first
  let m = merge(
    { tasks: [task('a', 'A here', T(5)), task('b', 'B', T(60)), task('mine', 'Only here', T(1))] },
    { tasks: [task('a', 'A there', T(10)), task('b', 'B there', T(2)), task('theirs', 'Only there', T(3))] }, NOW);
  check(m.tasks.find((r) => r.id === 'a').title === 'A here' && m.tasks.find((r) => r.id === 'b').title === 'B there', 'newer wins, per record, either side');
  check(ids(m.tasks) === 'a,b,mine,theirs', 'new records on both sides kept; this side\'s order, then theirs');

  // Deleted: stays deleted unless changed after
  m = merge(
    { tasks: [task('a', 'A', T(30))], deleted: [{ key: 'tasks', id: 'b', at: T(20) }] },
    { tasks: [task('a', 'A', T(30)), task('b', 'B', T(40))] }, NOW);
  check(ids(m.tasks) === 'a' && m.deleted.length === 1, 'deleted here, unchanged there: stays deleted');
  m = merge(
    { tasks: [task('a', 'A', T(30))], deleted: [{ key: 'tasks', id: 'b', at: T(20) }] },
    { tasks: [task('a', 'A', T(30)), task('b', 'B edited after', T(5))] }, NOW);
  check(ids(m.tasks) === 'a,b', 'deleted here but changed there afterwards: the change wins, it stays');
  m = merge({ tasks: [task('a', 'A', T(30))] }, { tasks: [], deleted: [{ key: 'tasks', id: 'a', at: T(10) }] }, NOW);
  check(ids(m.tasks) === '', 'deleted there: goes here too');
  m = merge({ notes: [{ id: 'n', updated: T(50) }] }, { tasks: [{ id: 'n', updated: T(1) }], deleted: [{ key: 'notes', id: 'n', at: T(10) }] }, NOW);
  check(m.notes.length === 0 && m.tasks.length === 1, 'a marker only covers its own kind of record');

  // Markers: both sides' kept once, the latest; older than 30 days dropped
  m = merge(
    { tasks: [], deleted: [{ key: 'tasks', id: 'x', at: T(100) }, { key: 'events', id: 'old', at: NOW - 31 * 864e5 }] },
    { tasks: [], deleted: [{ key: 'tasks', id: 'x', at: T(50) }, { key: 'labels', id: 'l', at: T(5) }] }, NOW);
  check(m.deleted.length === 2 && m.deleted.find((d) => d.id === 'x').at === T(50) && !m.deleted.some((d) => d.id === 'old'), 'markers from both sides, once each (the latest); over 30 days old: dropped');

  // Older data with no times: this side's copy is kept; a timed change beats it
  m = merge({ tasks: [task('a', 'old here')] }, { tasks: [task('a', 'old there')] }, NOW);
  check(m.tasks[0].title === 'old here', 'no times on either side: this side\'s copy (the one with your unsaved changes)');
  m = merge({ tasks: [task('a', 'old here')] }, { tasks: [task('a', 'changed there', T(1))] }, NOW);
  check(m.tasks[0].title === 'changed there', 'a change with a time beats one from before times');

  // Every kind of record merges; notifications too
  m = merge(
    { notes: [{ id: 'n1', updated: T(5) }], events: [], buckets: [{ id: 'b1', name: 'Home' }], labels: [], notices: [{ id: 'm1', read: true, updated: T(1) }] },
    { notes: [{ id: 'n2', updated: T(4) }], events: [{ id: 'e1' }], buckets: [], labels: [{ id: 'l1' }], notices: [{ id: 'm1', read: false, updated: T(9) }, { id: 'm2' }] }, NOW);
  check(ids(m.notes) === 'n1,n2' && ids(m.events) === 'e1' && ids(m.buckets) === 'b1' && ids(m.labels) === 'l1', 'notes, events, buckets and labels merge the same way');
  check(ids(m.notices) === 'm1,m2' && m.notices[0].read === true, 'notifications too: read on one side stays read');

  check(app.errors.length === 0, 'no script errors' + (app.errors.length ? ': ' + app.errors[0] : ''));
  done();
})();
