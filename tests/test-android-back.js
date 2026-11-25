// The phone's back gesture in the Android app (from shell 3, which carries the App plugin): it does what Esc does on
// the laptop (stepBack: close the top thing open, or a sub-page back to its parent); with nothing open it leaves
// Butler (minimizeApp), which stays in the background.
const { loadApp, tick, check, done } = require('./helpers');

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/140.0 Mobile Safari/537.36 ButlerAndroid/5';

(async () => {
  const listeners = {};
  let left = 0;
  const App = { addListener: (ev, fn) => { listeners[ev] = fn; }, getLaunchUrl: async () => ({}), minimizeApp: async () => { left++; } };
  const app = loadApp({ fsa: false, ua: UA, before: (w) => { w.Capacitor = { isNativePlatform: () => true, Plugins: { App } }; } });
  const { win, PA } = app;
  await tick(50);
  const back = () => listeners.backButton();
  check(typeof listeners.backButton === 'function', 'the app listens for the back gesture');

  // A task panel open: back closes it, and doesn't leave
  const t = PA.addTask({ title: 'Back test' });
  win.eval('setView')('tasks');
  win.eval('openTaskDrawer')(t.id);
  check(PA.state.openTask === t.id, '(a task is open)');
  back();
  check(!PA.state.openTask && left === 0, 'back closes an open task, and stays in Butler');

  // A pop-up: back closes it
  win.eval('openAssetForm')('share', { files: [], texts: ['hello'], failed: 0 });
  check(!!PA.state.assetForm, '(a pop-up is open)');
  back();
  check(!PA.state.assetForm && left === 0, 'back closes a pop-up');

  // A sub-page: back to its parent
  win.eval('setView')('vehicles');
  back();
  check(PA.state.view === 'assets' && left === 0, 'back from Vehicles goes to Assets, as Esc does');

  // Nothing open on a top page: back leaves Butler straight away (no stop at My Day)
  win.eval('setView')('notes');
  back();
  check(left === 1 && PA.state.view === 'notes', 'with nothing open, back leaves Butler straight away');

  // Esc on the laptop still works the same way
  win.eval('openTaskDrawer')(t.id);
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(!PA.state.openTask, 'Esc still closes an open task');
  check(app.errors.length === 0, 'no script errors' + (app.errors[0] ? ': ' + app.errors[0] : ''));
  app.close();

  // An older app (shell 2) had no App plugin: nothing is listened for
  const l2 = {};
  const o = loadApp({ fsa: false, ua: UA.replace('ButlerAndroid/5', 'ButlerAndroid/2'), before: (w) => { w.Capacitor = { isNativePlatform: () => true, Plugins: { App: { addListener: (ev, fn) => { l2[ev] = fn; }, getLaunchUrl: async () => ({}) } } }; } });
  await tick(50);
  check(!l2.backButton, 'an older app is left as it was');
  o.close();
  done();
})();
