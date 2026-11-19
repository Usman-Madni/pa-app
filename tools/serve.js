// Serves PA App.html on http://localhost:8790 so Claude can check it in the browser pane.
// You don't need this to use the app — just open PA App.html in Chrome or Edge.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8790;
const ROOT = path.resolve(__dirname, '..');

// The pages, and the files that make the app installable (only these: never data, tests or tools).
const TYPES = { '.html': 'text/html; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const APP_FILES = new Set(['sw.js']);

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(ROOT, urlPath === '/' ? 'PA App.html' : urlPath));
  const name = path.basename(file);
  const type = APP_FILES.has(name) ? 'text/javascript; charset=utf-8' : TYPES[path.extname(file)];
  if (!file.startsWith(ROOT + path.sep) || path.dirname(file) !== ROOT || !type) {
    res.writeHead(404).end('Not found');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`PA App at http://localhost:${PORT}`));
