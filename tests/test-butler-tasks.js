// Butler's tasks go in their area's bucket: zakat in Zakat, Vault renewals in Vault, a car's upkeep jobs in Vehicles
// (another asset's in Upkeep), rent and renewals in Rentals, bills in Utilities. A bucket knows its area, so renaming
// it is fine; one is made when an area first needs it, or an existing one of that name is used. Tasks made before go in
// once (from no bucket, or the one they all shared). Settings › Buckets can pick another for an area, which moves its
// open tasks. Butler's own show the repeat sign with how often, not the repeat editor, and the next comes at once.
const { loadApp, check, done, confirmDone, tick } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const B = win.eval('ButlerTasks');
  const A = win.eval('Assets');
  const changed = win.eval('changed');
  const ago = (d) => PA.toISO(new Date(Date.now() - d * 864e5));
  const bucketName = (t) => PA.DB.buckets.find((b) => b.id === t.bucket)?.name;

  // Tasks made before, all in the one bucket Butler's tasks shared
  win.eval('addBucket')('Repeating tasks');
  const shared = PA.DB.buckets.find((b) => b.name === 'Repeating tasks');
  shared.butler = true;
  const car = A.add({ kind: 'vehicle', name: 'Car', currency: 'PKR', amount: 1, date: ago(300), acquired: ago(300) });
  car.car = { boughtKm: 1000 };
  car.plan = [{ id: 'oil', item: 'Engine oil', km: 5000, months: 6, since: ago(300), sinceKm: 1000 }];
  changed('assets');
  win.eval('upkeepTasks')();
  const old = PA.DB.tasks.find((t) => t.id.startsWith('up-'));
  check(old && bucketName(old) === 'Vehicles', 'a car\'s upkeep job goes in a Vehicles bucket, made when first needed');
  old.bucket = shared.id;
  const mine = PA.addTask({ title: 'My own', bucket: shared.id });
  win.eval('addBucket')('vault');
  const vaultB = PA.DB.buckets.find((b) => b.name === 'vault');
  PA.device.set('areaPlaced', false); // as on the first start after this update
  check(B.placeOld() === true && old.bucket === B.bucketFor('vehicles') && mine.bucket === shared.id, 'once: tasks in the shared bucket move to their area\'s; your own stay');
  check(!PA.DB.buckets.some((b) => b.butler), 'the old shared bucket is no longer Butler\'s');

  // New ones go straight to their area
  win.eval('People').setZakat('me', 15, 8);
  win.eval('zakatTasks')();
  const zk = PA.DB.tasks.filter((t) => /^zk-/.test(t.id) && !t.done);
  check(zk.length && zk.every((t) => bucketName(t) === 'Zakat'), 'zakat tasks go in Zakat');
  const d = win.eval('Vault').add({ cat: 'id', name: 'Passport', expires: PA.toISO(new Date(Date.now() + 400 * 864e5)), renewMonths: 3 });
  win.eval('vaultTasks')();
  check(PA.DB.tasks.find((t) => t.id.startsWith(`doc-renew-${d.id}-`)).bucket === vaultB.id && vaultB.area === 'vault', 'a Vault renewal goes in the existing "vault" bucket (any capitals), now marked for it');
  vaultB.name = 'Papers';
  check(B.bucketFor('vault') === vaultB.id, 'renaming a bucket keeps it its area\'s');
  check(zk.some((t) => t.due.slice(0, 10) > PA.toISO(new Date())), 'and next year\'s zakat is already there');

  // Shown as repeating
  doc.querySelector('[data-view="tasks"]').click();
  check(/Every 5,000 km or 6 months/.test(doc.querySelector('#main').textContent), 'an upkeep task shows how often it comes, with the repeat sign');
  check(/Every year, 15th Sha'ban/.test(doc.querySelector('#main').textContent), 'a zakat task too');
  win.eval('openTaskDrawer')(old.id);
  check(/Butler makes the next one as soon as this is ticked/.test(doc.querySelector('#drawer').textContent) && !doc.querySelector('#drawer [data-repeat="freq"]'), 'its panel says Butler repeats it, with no repeat editor');
  win.eval('closeTaskDrawer')();

  // The next one at once, in the same bucket
  doc.querySelector(`#main [data-action="toggle-task"][data-id="${old.id}"]`).click();
  confirmDone(win);
  await tick(10);
  doc.querySelector('#modal [data-action="asset-cancel"]')?.click();
  const next = PA.DB.tasks.find((t) => t.id.startsWith('up-') && !t.done);
  check(old.done && next && next !== old && next.bucket === B.bucketFor('vehicles'), 'ticking it makes the next one at once, in the same bucket');

  // Choosing another bucket for an area moves its open tasks
  win.eval('addBucket')('Car stuff');
  const other = PA.DB.buckets.find((b) => b.name === 'Car stuff');
  doc.querySelector('[data-view="settings"]').click();
  const sel = doc.querySelector('[data-area-bucket="vehicles"]');
  check(sel && sel.value === B.bucketFor('vehicles', false) && doc.querySelector('[data-area-bucket="zakat"]').value === B.bucketFor('zakat', false), 'Settings › Buckets says where each area\'s tasks go');
  sel.value = other.id;
  sel.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(B.bucketFor('vehicles') === other.id && next.bucket === other.id && zk.every((t) => bucketName(t) === 'Zakat'), 'choosing another for Vehicles moves its open tasks there, and only those');
  check(JSON.parse(win.localStorage.getItem('pa_buckets')).find((b) => b.id === other.id).area === 'vehicles', 'the choice is kept with the data (both devices)');

  check(!app.errors.length, 'no script errors');
  done();
})();
