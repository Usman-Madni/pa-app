// Butler's own tasks (zakat, Vault renewals, upkeep jobs): they go in the bucket chosen in Settings › Buckets (to start
// with, one called "Repeating tasks", any capitals); old ones without a bucket move in once; choosing another moves the
// open ones. They show the repeat sign with how often, not the repeat editor, and the next comes as soon as one is
// ticked.
const { loadApp, check, done, confirmDone, tick } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const B = win.eval('ButlerTasks');
  const U = win.eval('Upkeep');
  const A = win.eval('Assets');
  const changed = win.eval('changed');
  const ago = (d) => PA.toISO(new Date(Date.now() - d * 864e5));

  // A task made before there was a bucket for them
  const car = A.add({ kind: 'vehicle', name: 'Car', currency: 'PKR', amount: 1, date: ago(300), acquired: ago(300) });
  car.car = { boughtKm: 1000 };
  car.plan = [{ id: 'oil', item: 'Engine oil', km: 5000, months: 6, since: ago(300), sinceKm: 1000 }];
  changed('assets');
  win.eval('upkeepTasks')();
  const old = PA.DB.tasks.find((t) => t.id.startsWith('up-'));
  check(old && !old.bucket, 'with no bucket for them, a task has none');

  win.eval('addBucket')('repeating TASKS');
  const rep = PA.DB.buckets.find((b) => b.name === 'repeating TASKS');
  check(B.bucket() === rep.id, 'a bucket called "Repeating tasks" (any capitals) is theirs to start with');
  check(B.placeOld() === true && old.bucket === rep.id, 'tasks made before go in it, once');
  // New ones go straight in
  win.eval('People').setZakat('me', 15, 8);
  win.eval('zakatTasks')();
  const zk = PA.DB.tasks.filter((t) => /^zk-/.test(t.id) && !t.done);
  check(zk.length && zk.every((t) => t.bucket === rep.id), 'new zakat tasks go in it');
  check(zk.some((t) => t.due.slice(0, 10) > PA.toISO(new Date())), 'and next year\'s is already there');

  // Shown as repeating
  doc.querySelector('[data-view="tasks"]').click();
  check(/Every 5,000 km or 6 months/.test(doc.querySelector('#main').textContent), 'an upkeep task shows how often it comes, with the repeat sign');
  check(/Every year, 15th Sha'ban/.test(doc.querySelector('#main').textContent), 'a zakat task too');
  win.eval('openTaskDrawer')(old.id);
  check(/Butler makes the next one as soon as this is ticked/.test(doc.querySelector('#drawer').textContent) && !doc.querySelector('#drawer [data-repeat="freq"]'), 'its panel says Butler repeats it, with no repeat editor');
  win.eval('closeTaskDrawer')();

  // The next one at once
  doc.querySelector(`#main [data-action="toggle-task"][data-id="${old.id}"]`).click();
  confirmDone(win);
  await tick(10);
  doc.querySelector('#modal [data-action="asset-cancel"]')?.click();
  const next = PA.DB.tasks.find((t) => t.id.startsWith('up-') && !t.done);
  check(old.done && next && next !== old && next.bucket === rep.id, 'ticking it makes the next one at once, in the same bucket');

  // Choosing another bucket moves the open ones
  win.eval('addBucket')('Car stuff');
  const other = PA.DB.buckets.find((b) => b.name === 'Car stuff');
  doc.querySelector('[data-view="settings"]').click();
  const sel = doc.querySelector('[data-butler-bucket]');
  check(sel && sel.value === rep.id, 'Settings › Buckets says where they go');
  sel.value = other.id;
  sel.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(B.bucket() === other.id && PA.DB.tasks.filter((t) => B.is(t) && !t.done).every((t) => t.bucket === other.id), 'choosing another moves the open ones there');
  check(JSON.parse(win.localStorage.getItem('pa_buckets')).find((b) => b.id === other.id).butler === true, 'the choice is kept with the data (both devices)');

  check(!app.errors.length, 'no script errors');
  done();
})();
