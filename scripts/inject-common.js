/* ============================================================
   scripts/inject-common.js — 全站公共注入器（幂等，可重复运行）
   对每个 HTML 页面：
   ① </head> 前插入主题防闪烁 inline 脚本（data-theme-boot 标记）
   ② </head> 前插入 SEO 标签（og:title/description/url/image + twitter:card
      + favicon link；已有 og:site_name 的页面跳过）
   ③ </body> 前插入 <link theme.css> + <script defer common.js>
   排除：单文件离线版（自包含，构建时已内联 theme.css/common.js）
   用法：node scripts/inject-common.js
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://free60127.top/';

const THEME_BOOT = `<script data-theme-boot>(function(){var t;try{t=localStorage.getItem('waiyuan-web-theme-v1')}catch(e){}if(t!=='dark'&&t!=='light'){try{t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){t='light'}}document.documentElement.dataset.theme=t})();</script>`;

function relPrefix(file) {
  const rel = path.relative(path.dirname(file), ROOT);
  return rel ? rel.split(path.sep).map(() => '../').join('') : '';
}

function pageNameOf(file) {
  const html = fs.readFileSync(file, 'utf8');
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const rawTitle = titleMatch ? titleMatch[1].trim() : '外院知识分享站';
  const pageName = rawTitle
    .replace(/^外院知识分享站\s*[·|｜]\s*/, '')
    .replace(/\s*\|\s*.*$/, '')
    .trim() || rawTitle;
  return pageName;
}

function seoTags(file, prefix) {
  const html = fs.readFileSync(file, 'utf8');
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const rawTitle = titleMatch ? titleMatch[1].trim() : '外院知识分享站';
  const cleanTitle = pageNameOf(file);
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const pageUrl = SITE_URL + (rel ? rel.split('/').map(encodeURIComponent).join('/') : '');
  return [
    '<meta name="description" content="外院知识分享站 · ' + cleanTitle + '：课程题库、学习工具与专业资料，免费分享持续更新。">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="外院知识分享站">',
    '<meta property="og:title" content="' + rawTitle + '">',
    '<meta property="og:description" content="外院知识分享站 · ' + cleanTitle + '：课程题库、学习工具与专业资料，免费分享持续更新。">',
    '<meta property="og:url" content="' + pageUrl + '">',
    '<meta property="og:image" content="' + SITE_URL + 'og-image.png">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<link rel="icon" type="image/svg+xml" href="' + prefix + 'favicon.svg">'
  ].join('\n  ');
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'archive') continue;
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
  const prefix = relPrefix(file);
  let changed = false;

  // ① 主题防闪烁（幂等标记 data-theme-boot，独立判断——历史版本可能只注入了一半）
  if (!html.includes('data-theme-boot')) {
    html = html.replace('</head>', THEME_BOOT + '\n</head>');
    changed = true;
  }

  // ② SEO 标签（幂等判断：og:site_name 唯一）
  if (!html.includes('og:site_name')) {
    const tags = '  ' + seoTags(file, prefix) + '\n';
    html = html.replace('</head>', tags + '</head>');
    changed = true;
  }

  // ②b 一次性修复旧版重复前缀 description（"外院知识分享站 · 外院知识分享站…"）
  if (/外院知识分享站 · 外院知识分享站/.test(html)) {
    const good = '外院知识分享站 · ' + pageNameOf(file) + '：课程题库、学习工具与专业资料，免费分享持续更新。';
    html = html.replace(/<meta name="description" content="外院知识分享站 · 外院知识分享站[^"]*">/, `<meta name="description" content="${good}">`);
    html = html.replace(/<meta property="og:description" content="外院知识分享站 · 外院知识分享站[^"]*">/, `<meta property="og:description" content="${good}">`);
    changed = true;
  }

  // ③ theme.css + common.js（幂等标记 data-common-injected）
  if (!html.includes('data-common-injected')) {
    const link = `  <link rel="stylesheet" href="${prefix}theme.css">\n`;
    const script = `  <script defer src="${prefix}common.js" data-common-injected></script>\n</body>`;
    html = html.replace('</body>', link + script);
    changed = true;
  }

  // ④ 番茄钟（幂等标记 data-tomato-injected；独立判断以便已注入页增量补上）
  if (!html.includes('data-tomato-injected')) {
    const link = `  <link rel="stylesheet" href="${prefix}tomato-timer.css?v=20260821-tomato-1">\n`;
    const script = `  <script defer src="${prefix}tomato-timer.js?v=20260821-tomato-1" data-tomato-injected></script>\n</body>`;
    html = html.replace('</body>', link + script);
    changed = true;
  }

  if (!changed) { skipped++; continue; }
  fs.writeFileSync(file, html, 'utf8');
  injected++;
  console.log(`injected: ${path.relative(ROOT, file)} (prefix=${prefix || './'})`);
}

console.log(`\n完成：注入 ${injected} 个，跳过 ${skipped} 个（单文件版/已完整注入）。`);
