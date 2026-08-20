const fs = require('fs');
const path = require('path');

const folder = __dirname;
const read = name => fs.readFileSync(path.join(folder, name), 'utf8');
const safeScript = text => text.replace(/<\/script/gi, '<\\/script');
const qrDataUrl = `data:image/jpeg;base64,${fs.readFileSync(path.join(folder, 'payment-qr.jpg')).toString('base64')}`;
const welcomeCatDataUrl = `data:image/jpeg;base64,${fs.readFileSync(path.join(folder, 'welcome-cat.jpg')).toString('base64')}`;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#28634f">
  <title>思政刷题</title>
  <style>${read('style.css')}</style>
</head>
<body>
  <main id="app"></main>
  <script>${safeScript(read('data.js'))}</script>
  <script>window.PAYMENT_QR_DATA_URL=${JSON.stringify(qrDataUrl)};</script>
  <script>window.WELCOME_CAT_DATA_URL=${JSON.stringify(welcomeCatDataUrl)};</script>
  <script>${safeScript(read('app.js'))}</script>
</body>
</html>
`;

const output = path.join(folder, '思政刷题-单文件离线版.html');
fs.writeFileSync(output, html, 'utf8');
console.log(`Wrote ${output}`);
