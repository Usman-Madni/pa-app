// The PA App Guide: its own file beside the app, opened from the sidebar and from Settings (phones hide the sidebar
// foot), linking back; every section has an id and a title for the contents; nothing in it from outside the app.
const fs = require('fs');
const path = require('path');
const { loadApp, APP_FILE, tick, check, done } = require('./helpers');

(async () => {
  const guideFile = path.join(path.dirname(APP_FILE), 'PA App Guide.html');
  check(fs.existsSync(guideFile), 'PA App Guide.html sits beside PA App.html');
  const guide = fs.readFileSync(guideFile, 'utf8');
  check(/href="PA App\.html"/.test(guide), 'the guide links back to PA App');
  const sections = [...guide.matchAll(/<section id="([^"]+)" data-title="([^"]+)">/g)];
  const ids = sections.map((m) => m[1]);
  check(sections.length >= 15 && new Set(ids).size === ids.length, `every section has its own id and a title for the contents (${sections.length})`);
  check((guide.match(/class="chapter"/g) || []).length === 7, 'seven chapters');
  check(!/<script[^>]+src=/.test(guide) && !/<link[^>]+stylesheet/.test(guide), 'no outside scripts or styles: it works on its own');

  const app = loadApp();
  await tick(20);
  const { doc, PA } = app;
  check(doc.querySelector('.side-foot a[href="PA App Guide.html"][target="_blank"]'), 'the sidebar opens the guide in its own tab');
  PA.state.view = 'settings';
  PA.render();
  check(doc.querySelector('#main .page-head a[href="PA App Guide.html"]'), 'and Settings does too (the phone has no sidebar foot)');
  app.close();
  done();
})();
