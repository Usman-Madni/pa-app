// Butler as an installable app that opens offline: the app description (manifest) names Butler, opens PA App.html full
// screen and has its icons; the offline copy (sw.js) keeps files that exist and leaves outside services (OneDrive,
// Microsoft, the price services) and sign-in answers to the network; the page links the description and starts the
// copy only where browsers allow one.
const fs = require('fs');
const path = require('path');
const { loadApp, check, done } = require('./helpers');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

(async () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  check(m.name === 'Butler' && m.display === 'standalone' && fs.existsSync(path.join(ROOT, decodeURIComponent(m.start_url))), 'the app description names Butler and opens PA App.html full screen');
  check(m.icons.length >= 2 && m.icons.every((i) => fs.existsSync(path.join(ROOT, i.src)) && !/\.(png|jpe?g)$/i.test(i.src)) && m.icons.some((i) => i.purpose === 'maskable'), 'its icons exist (SVG: no photos in this repo), one for round home-screen icons');
  const sw = read('sw.js');
  const core = JSON.parse(sw.match(/const CORE = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  check(core.every((f) => fs.existsSync(path.join(ROOT, decodeURIComponent(f)))), 'the offline copy keeps files that exist');
  check(/if \(!own && !font\) return;/.test(sw) && /if \(own && url\.search\) return;/.test(sw) && !/graph\.microsoft|login\.microsoft|gold-api|er-api/.test(sw), 'outside services and sign-in answers always go to the network (never from the copy)');
  const html = read('PA App.html');
  check(/<link rel="manifest" href="manifest\.webmanifest">/.test(html), 'the page links its app description');
  const app = loadApp();
  check(!app.errors.length, 'no offline copy where the browser has none (tests, a file opened from disk): no error');
  app.close();
  done();
})();
