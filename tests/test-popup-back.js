// Pop-ups opened from another pop-up remember it: ‹ Back, Cancel and Esc step back one level (not all the way), and
// saving returns to it. A pop-up opened from a page has no Back and simply closes.
const { loadApp, submitForm, tick, check, done } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc, PA } = app;
  const R = win.eval('Rentals');
  const Assets = win.eval('Assets');
  const open = win.eval('openAssetForm');
  const form = () => doc.querySelector('#modal form');
  const esc = () => doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const now = new Date();
  const start = PA.toISO(new Date(now.getFullYear(), now.getMonth() - 3, 1));
  const r = R.add({ name: 'Shop', dueDay: 5, start, months: 11, rent: 1000 });
  win.eval('changed')('rentals');

  open('rental', { id: r.id });
  check(form().dataset.form === 'asset-rental' && !doc.querySelector('#modal [data-action="asset-back"]'), 'opened from a page: no Back');
  check(form().classList.contains('sheet') && form().querySelector('details.sheet-details:not([open]) [name="tenant"]') && form().querySelector('.sheet-top [data-form-type="rent-pay"]') && form().querySelector('.sheet-side .ledger'), 'an agreement opens as a wide sheet: Details folded, its summary across the top, the ledger beside the rest');
  doc.querySelector('#modal .ledger tbody tr').click();
  check(form().dataset.form === 'asset-rent-pay' && doc.querySelector('#modal [data-action="asset-back"]'), 'a month opened from the agreement has ‹ Back');
  check(doc.querySelector('#modal-under form[data-form="asset-rental"]') && doc.querySelector('#modal-under').hasAttribute('inert'), 'the agreement stays in sight under it, dimmed and out of reach');
  esc();
  check(form()?.dataset.form === 'asset-rental' && !doc.querySelector('#modal-under').children.length, 'Esc steps back to the agreement, not all the way (nothing left behind it)');
  doc.querySelector('#modal .ledger tbody tr').click();
  doc.querySelector('#modal [data-action="asset-back"]').click();
  check(form()?.dataset.form === 'asset-rental', '‹ Back does the same');
  doc.querySelector('#modal .ledger tbody tr').click();
  doc.querySelector('#modal [data-action="asset-cancel"]').click();
  check(form()?.dataset.form === 'asset-rental', 'and Cancel');
  doc.querySelector('#modal .ledger tbody tr').click();
  submitForm(win, 'asset-rent-pay', { amount: '1000' });
  check(form()?.dataset.form === 'asset-rental' && !doc.querySelector('#modal [data-action="asset-back"]'), 'saving returns to the agreement (with nothing left behind it)');
  esc();
  check(!form(), 'Esc on the agreement closes it');

  // A car's pop-up, then Add entry: Save and Back return to the car.
  const car = Assets.add({ kind: 'vehicle', name: 'Civic' });
  win.eval('changed')('assets');
  open('asset', { id: car.id });
  check(form().classList.contains('sheet') && form().querySelector('details.sheet-details:not([open])') && form().querySelector('.sheet-side .upkeep'), 'a car opens as a sheet too, its upkeep beside the rest');
  doc.querySelector('#modal [data-action="upkeep-entry"][data-asset]').click();
  check(form().dataset.form === 'asset-upkeep' && doc.querySelector('#modal [data-action="asset-back"]'), 'Add entry from the car: ‹ Back');
  submitForm(win, 'asset-upkeep', { what: 'Wash', cost: '500' });
  check(form()?.dataset.form === 'asset-asset', 'saving it returns to the car');
  esc();
  check(!form(), 'and Esc then closes');
  await tick(5);
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();
  done();
})();
