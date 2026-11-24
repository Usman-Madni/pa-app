// The Android app (android-app/): Butler's own page inside a Capacitor shell. A pop-up there would leave the app for
// the phone's browser, so Microsoft's sign-in happens in the same window: Butler notes what it's signing in to, goes to
// Microsoft, and Microsoft comes back (through index.html) with ?code=…, which Butler finishes and tidies away.
// Outside the app nothing changes: the pop-up as before, and a stray ?code=… is only tidied away.
const fs = require('fs');
const path = require('path');
const { loadApp, APP_FILE, tick, check, done } = require('./helpers');

const fakeMicrosoft = () => {
  const g = { tokenCalls: [] };
  g.fetch = async (url, opts = {}) => {
    if (url.startsWith('https://login.microsoftonline.com/')) {
      g.tokenCalls.push(Object.fromEntries(new URLSearchParams(opts.body)));
      return { ok: true, status: 200, json: async () => ({ access_token: 'a1', expires_in: 3600, refresh_token: 'r1', scope: 'Files.ReadWrite.AppFolder Tasks.ReadWrite' }) };
    }
    return { ok: false, status: 404, json: async () => ({ error: { message: 'not here' } }) };
  };
  return g;
};
const inApp = (win) => { win.Capacitor = { isNativePlatform: () => true }; };

(async () => {
  // --- In the app: going to Microsoft in this window ---
  const g = fakeMicrosoft();
  const app = loadApp({ fsa: false, fetch: g.fetch, before: inApp });
  const { win, doc } = app;
  await tick(20);
  const Native = win.eval('Native');
  check(Native.on === true, 'Butler knows when it is inside the Android app');
  let went = '';
  Native.go = (url) => { went = url; };
  let popups = 0;
  win.open = () => { popups++; return null; };
  doc.querySelector('#banner [data-action="od-connect"]').click();
  await tick(50);
  const q = new URL(went || 'http://x/').searchParams;
  check(popups === 0 && went.startsWith('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize') && q.get('redirect_uri') === 'http://localhost/', 'Sign in goes to Microsoft in the same window (no pop-up), coming back to the folder\'s page');
  const pending = JSON.parse(win.sessionStorage.getItem('butler-signin'));
  check(pending && pending.key === 'odAuth' && pending.check === q.get('state') && pending.verifier, 'it notes which sign-in it is and the one-off check, for when it comes back');
  const keep = win.sessionStorage.getItem('butler-signin');
  app.close();

  // --- Back from Microsoft: finished and tidied ---
  const g2 = fakeMicrosoft();
  const back = loadApp({ fsa: false, fetch: g2.fetch, query: `?code=c1&state=${q.get('state')}&session_state=s`, before: (w) => { inApp(w); w.sessionStorage.setItem('butler-signin', keep); } });
  await tick(300);
  check(g2.tokenCalls.length && g2.tokenCalls[0].code === 'c1' && g2.tokenCalls[0].code_verifier === pending.verifier, 'back from Microsoft, it swaps the answer for its tokens with the check it kept');
  check(back.win.localStorage.getItem('dev_odAuth') && !back.win.localStorage.getItem('dev_msAuth'), 'the OneDrive sign-in, not the To Do one, is the one signed in');
  check(back.win.location.search === '' && !back.win.sessionStorage.getItem('butler-signin'), 'and the answer is taken off the address, and the note cleared');
  back.close();

  // --- An answer that doesn't match: refused ---
  const g3 = fakeMicrosoft();
  const bad = loadApp({ fsa: false, fetch: g3.fetch, query: '?code=c1&state=someone-else', before: (w) => { inApp(w); w.sessionStorage.setItem('butler-signin', keep); } });
  await tick(300);
  check(g3.tokenCalls.length === 0 && !bad.win.localStorage.getItem('dev_odAuth') && /didn't match/.test(bad.win.eval('OD').error), 'an answer with the wrong check is refused');
  bad.close();

  // --- Not in the app: the pop-up as before; a stray ?code=… only tidied away ---
  const g4 = fakeMicrosoft();
  const web = loadApp({ fsa: false, fetch: g4.fetch, query: '?code=old&state=x' });
  await tick(100);
  check(web.win.eval('Native').on === false && web.win.location.search === '' && g4.tokenCalls.length === 0, 'in a browser, Butler isn\'t "in the app", and a leftover ?code=… is tidied away unused');
  let opened = 0;
  web.win.open = () => { opened++; return null; };
  web.doc.querySelector('#banner [data-action="od-connect"]').click();
  await tick(20);
  check(opened === 1, 'and Sign in still opens the pop-up there');
  check(web.errors.length === 0, 'no script errors' + (web.errors[0] ? ': ' + web.errors[0] : ''));
  web.close();

  // --- index.html passes the answer on when there's no pop-up to hand it to ---
  const index = fs.readFileSync(path.join(path.dirname(APP_FILE), 'index.html'), 'utf8');
  check(/location\.replace\('PA%20App\.html' \+ \(\/\[\?&\]\(code\|error\)=\/\.test\(q\) \? q : ''\)/.test(index), 'index.html passes a sign-in answer on to PA App when it was opened in the same window');
  done();
})();
