// 外院知识分享站 · 本地静态服务器（Playwright webServer 用，零依赖）
// 根目录 = 项目根，页面用相对路径（../reading-tools.js）在 /xxx/index.html 结构下直接可用。
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8788);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8',
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    let file = path.normalize(path.join(ROOT, urlPath));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 not found: ' + urlPath);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('server error: ' + e.message);
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`test server: http://127.0.0.1:${PORT}`));
