// The button colour key (DESIGN.md › Buttons): gold (.act) = an action (import, paste, export, select); teal filled
// (.primary) = add an entry; outlined (plain .btn) = add to a list. On every page's header they go gold, then teal,
// then outlined, left to right, and the "add" buttons say what they add ("+ Asset", with "Add an asset" for screen
// readers).
const { loadApp, check, done } = require('./helpers');

(async () => {
  const app = loadApp({});
  const { win, doc } = app;
  const Assets = win.eval('Assets');
  Assets.add({ kind: 'cash', name: 'Bank', owners: [{ id: 'me', share: 100 }] });
  Assets.add({ kind: 'vehicle', name: 'Car', owners: [{ id: 'me', share: 100 }] });
  win.eval('changed')('assets');
  const rank = (b) => (b.classList.contains('act') ? 0 : b.classList.contains('primary') ? 1 : 2);
  const views = ['today', 'tasks', 'notes', 'assets', 'vehicles', 'property', 'utilities', 'musings', 'zakat', 'vault', 'data'];
  for (const v of views) {
    win.eval('setView')(v);
    const btns = [...doc.querySelectorAll('#main .page-head .page-actions > button')];
    const order = btns.map(rank);
    check(order.every((r, i) => !i || order[i - 1] <= r), `${v}: gold, then teal, then outlined (got ${btns.map((b) => ['gold', 'teal', 'outlined'][rank(b)] + ' ' + b.textContent.trim()).join(', ')})`);
    const adds = btns.filter((b) => /^(add|new)\b/i.test(b.textContent.trim()));
    check(!adds.length, `${v}: add buttons say what they add, not "Add …" (${adds.map((b) => b.textContent.trim()).join(', ') || 'none'})`);
  }
  win.eval('setView')('assets');
  const kinds = Object.fromEntries([...doc.querySelectorAll('#main .page-actions > button')].map((b) => [b.textContent.trim(), rank(b)]));
  check(kinds.Transfer === 0 && kinds.Rates === 1 && kinds.Asset === 2, 'Assets: Transfer is an action (gold), Rates an entry (teal), Asset a list (outlined)');
  check(doc.querySelector('#main [data-form-type="asset"]').getAttribute('aria-label') === 'Add an asset', 'a short label still reads in full to a screen reader');
  const css = [...doc.querySelectorAll('style')].map((x) => x.textContent).join('');
  check(/\.btn\.act \{[^}]*var\(--act-soft\)[^}]*var\(--act\)/.test(css) && /--act:/.test(css), 'gold buttons use the --act colours (set for dark mode too)');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();
  done();
})();
