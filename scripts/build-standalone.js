// 生成「单文件离线版」：把样式、题库、页面脚本、阅读工具（reading-tools.css/js）、
// 统一答题引擎、PDF 导出全部内联进一个 HTML，可离线发给同学使用。
//
// 用法：node scripts/build-standalone.js <目标目录>
//   例：node scripts/build-standalone.js 思政系列    → 思政系列/思政刷题-单文件离线版.html
//       node scripts/build-standalone.js 计算机系列  → 计算机系列/计算机刷题-单文件离线版.html
//
// 历史教训（2026-08-20 review）：
// - 旧版未内联 reading-tools.css/js，产物引用 ../reading-tools.* 在离线/子路径部署下 404；
// - 旧版两个目录共用一份固定「思政刷题」命名，计算机系列产物名不副实；
// - 旧版遗漏 a4-print.js 与 unified-quiz-engine.js，单文件版功能落后于在线版。
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const folder = path.resolve(root, process.argv[2] || '');
if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
  console.error('用法: node scripts/build-standalone.js <目标目录>');
  process.exit(1);
}

const read = name => fs.readFileSync(path.join(folder, name), 'utf8');
const readRoot = name => fs.readFileSync(path.join(root, name), 'utf8');
const safeScript = text => text.replace(/<\/script/gi, '<\\/script');
// 收款码/欢迎图只保留根目录一份（2026-08-21 单源化），单文件版从这里内联 base64
const base64Root = name => fs.readFileSync(path.join(root, name)).toString('base64');

// 目录 → 产物命名/标题映射（命名与内容必须一致，避免误发）
const configs = {
  '思政系列': { title: '思政刷题', file: '思政刷题-单文件离线版.html' },
  '计算机系列': { title: '计算机刷题', file: '计算机刷题-单文件离线版.html' },
};
const dirName = path.basename(folder);
const config = configs[dirName] || { title: dirName, file: `${dirName}-单文件离线版.html` };

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#28634f">
  <title>${config.title}</title>
  <style>${read('style.css')}
${readRoot('reading-tools.css')}
${readRoot('tomato-timer.css')}
${readRoot('theme.css')}</style>
<script data-theme-boot>(function(){var t;try{t=localStorage.getItem('waiyuan-web-theme-v1')}catch(e){}if(t!=='dark'&&t!=='light'){try{t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){t='light'}}document.documentElement.dataset.theme=t})();</script>
</head>
<body data-reading-tools="true">
  <main id="app"></main>
  <script>${safeScript(read('data.js'))}</script>
  <script>window.PAYMENT_QR_DATA_URL=${JSON.stringify('data:image/jpeg;base64,' + base64Root('payment-qr.jpg'))};</script>
  <script>window.WELCOME_CAT_DATA_URL=${JSON.stringify('data:image/jpeg;base64,' + base64Root('welcome-cat.jpg'))};</script>
  <script>${safeScript(readRoot('a4-print.js'))}</script>
  <script>${safeScript(read('app.js'))}</script>
  <script>${safeScript(readRoot('reading-tools.js'))}</script>
  <script>${safeScript(readRoot('tomato-timer.js'))}</script>
  <script>${safeScript(readRoot('unified-quiz-engine.js'))}</script>
</body>
</html>
`;

const output = path.join(folder, config.file);
fs.writeFileSync(output, html, 'utf8');
console.log(`Wrote ${output} (${fs.statSync(output).size} bytes)`);
