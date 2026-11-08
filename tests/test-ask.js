// The app's own question box (instead of the browser's): yes, no, Esc, a click outside, a name typed in; one at a
// time; and a static rule that the browser's confirm() and prompt() never come back.
const fs = require('fs');
const { loadApp, APP_FILE, answer, tick, check, done } = require('./helpers');

(async () => {
  const app = loadApp();
  const { win, doc } = app;
  await tick(20);
  const ask = win.eval('ask');
  const askText = win.eval('askText');
  const box = () => doc.querySelector('#modal form[data-form="ask"]');

  let p = ask('Delete this note?', { yes: 'Delete', danger: true });
  check(box() && box().querySelector('.ask-q').textContent === 'Delete this note?', 'the question shows in the app\'s own box');
  check(box().querySelector('[data-ask-yes]').textContent === 'Delete' && box().querySelector('[data-ask-yes]').classList.contains('danger'), 'with its own words on the button, red for deleting');
  check(doc.activeElement === box().querySelector('[data-ask-yes]'), 'Enter answers yes');
  await answer(win, true);
  check((await p) === true && !box(), 'yes: true, and the box closes');

  p = ask('Stop saving?');
  await answer(win, false);
  check((await p) === false, 'Cancel: false');
  p = ask('Stop saving?');
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }));
  check((await p) === false && !box(), 'Esc: false');
  p = ask('Stop saving?');
  doc.querySelector('#modal .modal-back').click();
  check((await p) === false, 'a click outside: false');

  p = askText('Rename bucket', 'Bills');
  check(box().elements.answer.value === 'Bills' && doc.activeElement === box().elements.answer, 'a name box starts with the old name, ready to type');
  await answer(win, true, 'Monthly bills');
  check((await p) === 'Monthly bills', 'yes: the name typed');
  p = askText('Rename bucket', 'Bills');
  await answer(win, false);
  check((await p) === null, 'cancelled: no name');

  const first = ask('First?');
  const second = ask('Second?');
  check((await first) === false && box().querySelector('.ask-q').textContent === 'Second?', 'only one at a time: a new question answers the open one No');
  await answer(win, true);
  await second;

  check(app.errors.length === 0, 'no script errors' + (app.errors.length ? ': ' + app.errors[0] : ''));
  app.close();

  // Static rule: the browser's own boxes don't come back.
  const src = fs.readFileSync(APP_FILE, 'utf8');
  const bad = src.split('\n').filter((l) => /(^|[^.\w])(confirm|prompt|alert)\(/.test(l));
  check(bad.length === 0, 'no browser confirm(), prompt() or alert() in the app' + (bad.length ? ': ' + bad[0].trim() : ''));
  done();
})();
