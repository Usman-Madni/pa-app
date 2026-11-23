// "Files go to": a task (every copy of a repeating one) can send its files to a Vault folder. Each new file is saved
// there and shows there as a plain file, the same file staying on the task (marked as from the Vault). Choosing it
// offers to move the files already on the task (No leaves them in Tasks, for good); changing it again offers to move
// the ones it put elsewhere; back to Tasks leaves the Vault ones where they are. Removing one from the task leaves it in
// the Vault. Read-only only says where they go.
const { loadApp, fakeFile, fakeFolder, answer, tick, check, done } = require('./helpers');

(async () => {
  const folder = fakeFolder('Attachments');
  const app = loadApp({ pickFolder: folder, pickFile: fakeFile(), storage: { dev_taskLayout: '"list"' } });
  const { win, doc, PA } = app;
  await PA.DF.createNew();
  const Vault = win.eval('Vault');
  PA.AT.SETTLE_MS = 5;
  doc.defaultView.eval('setView')('settings');
  doc.querySelector('[data-action="at-folder"]').click();
  await tick(10);
  const file = (name) => new win.File(['%PDF'], name, { type: 'application/pdf' });
  Vault.addFolder('me', '', 'Bills');
  Vault.addFolder('me', 'Bills', 'Electricity');

  const t = PA.addTask({ title: 'Elec bill', due: '2026-11-05T23:59' });
  PA.TaskEdit.setRepeat(t, { freq: 'monthly', interval: 1 });
  await PA.AT.add(t, [file('old.pdf')]);
  const oldFile = t.attachments[0].file;
  check(oldFile.startsWith('Me/Tasks/Elec bill/'), 'to start with, its files go to its Tasks folder');

  // --- Choosing a Vault folder ---
  PA.state.openTask = t.id;
  PA.renderDrawer();
  const sel = () => doc.querySelector('#drawer select[data-file-to]');
  check(sel() && [...sel().options].map((o) => o.textContent).join('|') === 'Tasks|Vault › Bills|Vault › Bills › Electricity', 'Files go to: Tasks or a Vault folder');
  sel().value = 'Bills/Electricity';
  sel().dispatchEvent(new win.Event('change', { bubbles: true }));
  const q = await answer(win, false);
  await tick(40);
  check(/Move the 1 file already on this task into Vault › Bills › Electricity\?/.test(q), 'it offers to move the file already on it');
  check(t.fileTo === 'Bills/Electricity' && t.attachments[0].file === oldFile && folder.at(oldFile) && !PA.DB.docs.some((d) => d.plain), 'No: the setting holds, and that file stays in Tasks (not in the Vault, not moved on disk)');

  await PA.AT.add(t, [file('scan.pdf')]);
  const att = t.attachments[1];
  const plainDoc = PA.DB.docs.find((d) => d.plain && d.attachments[0].file === att.file);
  check(att.file === 'Me/Bills/Electricity/Elec bill 2026.pdf' && folder.at(att.file) && att.vault, 'a new file is saved in the Vault folder, marked as from the Vault');
  check(plainDoc && plainDoc.folder === 'Bills/Electricity' && plainDoc.name === 'Elec bill 2026', 'and shows there as a plain file, the same file');
  check(Vault.contents('me', 'Bills/Electricity').items.includes(plainDoc), 'in that folder of the Vault');

  // --- The next copy goes there too ---
  const next = PA.Series.tick(t).next;
  await PA.AT.add(next, [file('nov.pdf')]);
  check(next.fileTo === 'Bills/Electricity' && next.attachments.at(-1).file.startsWith('Me/Bills/Electricity/') && PA.DB.docs.filter((d) => d.plain).length === 2, 'the next copy\'s files go there too');

  // --- Changing it again: move what's there, and the one left in Tasks ---
  PA.state.openTask = next.id;
  PA.renderDrawer();
  sel().value = 'Bills';
  sel().dispatchEvent(new win.Event('change', { bubbles: true }));
  const q2 = await answer(win, true);
  await tick(60);
  check(/Move the 3 files/.test(q2) && t.fileTo === 'Bills' && next.fileTo === 'Bills', 'another folder: every copy, and it offers to move all 3');
  check(PA.DB.docs.filter((d) => d.plain).every((d) => d.folder === 'Bills') && PA.DB.docs.filter((d) => d.plain).length === 3, 'Yes: the files it put in the Vault move, and the one left in Tasks joins them');
  check([...t.attachments, ...next.attachments].every((a) => a.file.startsWith('Me/Bills/') && !a.file.startsWith('Me/Bills/Electricity/') && folder.at(a.file) && a.vault), 'their files move on disk too, and all show as from the Vault');

  // --- Back to Tasks ---
  sel().value = '';
  sel().dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick(40);
  check(!next.fileTo && next.attachments.every((a) => a.file.startsWith('Me/Bills/')) && /stay there/.test(doc.querySelector('#toasts').textContent), 'back to Tasks: what\'s in the Vault stays there');
  await PA.AT.add(next, [file('dec.pdf')]);
  check(next.attachments.at(-1).file.startsWith('Me/Tasks/Elec bill/') && !next.attachments.at(-1).vault, 'and new files go to its Tasks folder again');

  // --- Removing from the task leaves it in the Vault ---
  const inVault = next.attachments.find((a) => a.vault);
  const removing = PA.AT.remove(next, inVault.id);
  const q3 = await answer(win, true);
  await removing;
  check(/It stays in the Vault/.test(q3) && folder.at(inVault.file) && PA.DB.docs.some((d) => d.attachments.some((a) => a.file === inVault.file)), 'removing one from the task leaves it in the Vault');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));

  // --- Read-only: says where they go, no choice ---
  t.fileTo = 'Bills';
  const storage = {};
  for (let i = 0; i < win.localStorage.length; i++) { const k = win.localStorage.key(i); storage[k] = win.localStorage.getItem(k); }
  app.close();
  const ro = loadApp({ storage, query: '?readonly' });
  ro.PA.state.readOnly = true;
  ro.PA.DB.tasks.push(ro.PA.normalizeTask({ id: 'r', title: 'x', fileTo: 'Bills' }));
  ro.PA.state.openTask = 'r';
  ro.PA.renderDrawer();
  check(!ro.doc.querySelector('#drawer select[data-file-to]') && /Files go to Vault › Bills/.test(ro.doc.querySelector('#drawer').textContent), 'read-only: it says where files go, with nothing to change');
  ro.close();
  done();
})();
