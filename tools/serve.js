// Serves PA App.html on http://localhost:8790 so Claude can check it in the browser pane.
// You don't need this to use the app — just open PA App.html in Chrome or Edge.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8790;
const ROOT = path.resolve(__dirname, '..');

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(ROOT, urlPath === '/' ? 'PA App.html' : urlPath));
  if (!file.startsWith(ROOT + path.sep) || !file.endsWith('.html')) {
    res.writeHead(404).end('Not found');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`PA App at http://localhost:${PORT}`));
