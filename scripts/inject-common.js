/* ============================================================
   scripts/inject-common.js — 全站公共注入器（幂等，可重复运行）
   对每个 HTML 页面：
   ① </head> 前插入主题防闪烁 inline 脚本（data-theme-boot 标记）
   ② </body> 前插入 <link theme.css> + <script defer common.js>
   排除：单文件离线版（自包含，构建时已内联 theme.css/common.js）
   用法：node scripts/inject-common.js
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const THEME_BOOT = `<script data-theme-boot>(function(){var t;try{t=localStorage.getItem('waiyuan-web-theme-v1')}catch(e){}if(t!=='dark'&&t!=='light'){try{t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){t='light'}}document.documentElement.dataset.theme=t})();</script>`;

function relPrefix(file) {
  const rel = path.relative(path.dirname(file), ROOT);
  return rel ? rel.split(path.sep).map(() => '../').join('') : '';
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
}

const files = [];
walk(ROOT, files);

let injected = 0, skipped = 0;
for (const file of files) {
  const name = path.basename(file);
  if (name.includes('单文件离线版')) { skipped++; continue; }
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('data-common-injected')) { skipped++; continue; }
  const prefix = relPrefix(file);

  // ① 主题防闪烁（幂等标记 data-theme-boot）
  if (!html.includes('data-theme-boot')) {
    html = html.replace('</head>', THEME_BOOT + '\n</head>');
  }

  // ② theme.css + common.js（幂等标记 data-common-injected）
  if (!html.includes('data-common-injected')) {
    const link = `  <link rel="stylesheet" href="${prefix}theme.css">\n`;
    const script = `  <script defer src="${prefix}common.js" data-common-injected></script>\n</body>`;
    html = html.replace('</body>', link + script);
  }

  fs.writeFileSync(file, html, 'utf8');
  injected++;
  console.log(`injected: ${path.relative(ROOT, file)} (prefix=${prefix || './'})`);
}

console.log(`\n完成：注入 ${injected} 个，跳过 ${skipped} 个（单文件版/已注入）。`);
