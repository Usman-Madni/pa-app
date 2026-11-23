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
  check((guide.match(/class="chapter"/g) || []).length === 8, 'eight chapters');
  check((guide.match(/class="chap-lead"/g) || []).length === 8, 'each chapter opens with one sentence on what it\'s for');
  check(/Every name and figure in this guide is made up/.test(guide), 'it says every name and figure in it is made up');
  check(/id="top-of-page"/.test(guide) && (guide.match(/<i class="mk">\d<\/i>/g) || []).length === 7 && /<ol class="key">(\s*<li>[\s\S]*?<\/li>){7}\s*<\/ol>/.test(guide), 'the top of a page: seven numbered parts and their key (the colours, ⋮, tabs, filter)');
  check(['fig-assets', 'fig-zakat', 'fig-rent', 'fig-bills', 'fig-check'].every((id) => guide.includes(`id="${id}"`)) && /52\.5 × 2,600/.test(guide) && /22,660 − 3,000/.test(guide), 'How figures are worked out: each sum in words with a worked example');
  check(/<tr><th>What you see<\/th><th>Why<\/th><th>What to do<\/th><\/tr>/.test(guide) && /"can't be valued yet"/.test(guide), 'troubles: what you see (in the screen\'s words), why, what to do');
  // Every table on the Data page is in the guide's list, by the name the app gives it.
  const appText = fs.readFileSync(APP_FILE, 'utf8');
  const labels = [...appText.slice(appText.indexOf('const SCHEMA = {'), appText.indexOf('const SCHEMA_ALWAYS')).matchAll(/label: '([^']+)', kind: '(entry|list)'/g)].map((m) => m[1]);
  check(labels.length >= 15 && labels.every((l) => guide.includes(`<td><b>${l}</b></td>`)), `the guide lists every Data table (${labels.filter((l) => !guide.includes(`<td><b>${l}</b></td>`)).join(', ') || 'all there'})`);
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
