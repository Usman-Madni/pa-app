// A bill task's files and its bill (28 Nov). Share › Butler's Add to… lists tasks of whoever the person picker shows
// (someone else's bill task too, saying whose), not only yours. A file put on a bill task is kept in the connection's
// Vault folder; when the task is ticked and its bill added, the pop-up lists "Files from the task", each ticked: ticked
// ones go on the bill (named like its other files), unticked ones stay only on the task. Bills from before keep the
// task's files they always showed.
const { loadApp, fakeFile, fakeFolder, submitForm, confirmDone, tick, check, done } = require('./helpers');

(async () => {
  const folder = fakeFolder('Attachments');
  const app = loadApp({ pickFolder: folder, pickFile: fakeFile(), storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  await PA.DF.createNew();
  const U = win.eval('Utilities');
  const People = win.eval('People');
  PA.AT.SETTLE_MS = 5;
  win.eval('setView')('settings');
  doc.querySelector('[data-action="at-folder"]').click();
  await tick(10);

  // Someone else's gas connection, and its bill task
  const kim = People.add('Kim');
  win.eval('openAssetForm')('utility', { kind: 'Gas' });
  submitForm(win, 'asset-utility', { name: 'Flat', day: '15' });
  await tick(20);
  const c = PA.DB.utilities[0];
  c.people = [kim.id];
  win.eval('changed')('utilities');
  const t = U.openTask(c);
  t.people = [kim.id];
  win.eval('changed')('tasks');

  // --- Add to… lists it ---
  const S = win.eval('ShareTo');
  const row = S.list(true, false).find((x) => x.value === `tasks:${t.id}`);
  check(row && /· Kim$/.test(row.where), `Add to… lists someone else's bill task, saying whose (got ${row && row.where})`);
  win.localStorage.setItem('dev_person', JSON.stringify('me'));
  check(!S.list(true, false).some((x) => x.value === `tasks:${t.id}`), 'only while the person picker shows them');
  win.localStorage.setItem('dev_person', JSON.stringify('all'));
  check(!/· /.test(S.list(true, false).find((x) => x.kind === 'tasks' && x.value !== `tasks:${t.id}`)?.where || ''), 'a task only yours doesn\'t say whose');

  // --- Files on the task go to the connection's folder ---
  await S.add(`tasks:${t.id}`, [new win.File(['%PDF'], 'statement.pdf', { type: 'application/pdf' })], []);
  await PA.AT.add(t, [new win.File(['x'], 'receipt.jpg', { type: 'image/jpeg' })]);
  await tick(20);
  check(t.attachments.length === 2 && t.attachments.every((a) => a.file.startsWith('Kim/Utilities/Gas/')) && U.taskFiles(t).length === 2, 'the task\'s files are kept in Kim\'s Vault › Utilities › Gas');

  // --- Ticking it: the bill pop-up offers them, ticked ---
  doc.querySelector('[data-view="tasks"]').click();
  doc.querySelector(`#main [data-action="toggle-task"][data-id="${t.id}"]`).click();
  confirmDone(win);
  await tick(10);
  const boxes = [...doc.querySelectorAll('#modal [data-task-files] input[type="checkbox"]')];
  check(boxes.length === 2 && boxes.every((b) => b.checked) && /Files from the task/.test(doc.querySelector('#modal').textContent), 'the bill pop-up lists the task\'s files, each ticked');
  const [keep, leave] = U.taskFiles(t);
  doc.querySelector(`#modal input[name="tf-${leave.id}"]`).checked = false;
  submitForm(win, 'asset-bill', { amount: '3200' });
  await tick(10);
  const bill = PA.DB.bills.find((b) => b.task === t.id);
  const on = U.billFiles(bill);
  check(bill && on.length === 1 && on[0] === keep && keep.bill === bill.id, 'ticked: it goes on the bill');
  check(keep.name === `Flat ${win.eval('ymLabel')(U.monthOf(bill))}`, `named like the bill's other files (got ${keep.name})`);
  check(leave.bill === '' && !on.includes(leave) && t.attachments.some((a) => a.file === leave.attachments[0].file) && PA.DB.docs.includes(leave), 'unticked: left on the task (and in the folder), not on the bill');
  win.eval('closeAssetForm')(true);

  // --- A bill from before keeps the task's files it showed ---
  const next = U.openTask(c);
  await PA.AT.add(next, [new win.File(['y'], 'old.pdf', { type: 'application/pdf' })]);
  await tick(20);
  const old = U.addBill({ utility: c.id, date: PA.toISO(new Date()), amount: 100, task: next.id });
  check(U.billFiles(old).length === 1, 'a bill saved before (its task\'s files never asked about) still shows them');

  // --- Skipped: nothing asked, the files wait for the bill ---
  PA.DB.bills = PA.DB.bills.filter((b) => b !== old);
  win.eval('changed')('bills');
  const t3 = next;
  await PA.AT.add(t3, [new win.File(['z'], 'later.pdf', { type: 'application/pdf' })]);
  await tick(20);
  PA.render();
  doc.querySelector(`#main [data-action="toggle-task"][data-id="${t3.id}"]`).click();
  confirmDone(win);
  await tick(10);
  submitForm(win, 'asset-bill', { amount: '' });
  check(U.taskFiles(t3).length === 2 && !PA.DB.bills.some((b) => b.task === t3.id), 'a bill skipped leaves the files unasked');
  app.close();
  done();
})();
