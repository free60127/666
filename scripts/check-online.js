// 线上部署验证（2026-08-21 改版）：主域 free60127.top（用户真实访问入口）+ API 子域 + www 跳转
// 用法：
//   node scripts/check-online.js           → 检查主域资源 + API 健康 + www 跳转
//   node scripts/check-online.js --pages   → 额外检查 GitHub Pages 源站（free60127.github.io/666）
const MAIN = 'https://free60127.top/';
const API = 'https://api.free60127.top';
const PAGES = 'https://free60127.github.io/666/';
const withPages = process.argv.includes('--pages');

const checks = [
  ['index.html', '首页'],
  ['site-search.js', '全站搜索 JS'],
  ['site-search-data.js', '搜索数据'],
  ['favicon.svg', 'favicon'],
  ['reading-tools.js', '阅读工具'],
  ['unified-quiz-engine.js', '统一引擎'],
  ['a4-print.js', 'PDF 导出'],
  ['theme.css', '深色主题覆盖层'],
  ['common.js', '公共脚本（统计+SW）'],
  ['sw.js', 'Service Worker'],
  ['manifest.webmanifest', 'PWA 清单'],
  ['og-image.png', '分享图'],
  ['icons/icon-192.png', 'PWA 图标 192'],
  ['icons/icon-512.png', 'PWA 图标 512'],
  ['思政系列/data.js', '思政题库'],
  ['计算机系列/data.js', '计算机题库'],
  ['背单词/vocabulary-meta.js', '背单词 meta'],
  ['背单词/vocabulary-data-tem4.js', '背单词 tem4'],
  ['背单词/vocabulary-data-tem8.js', '背单词 tem8'],
  ['计算机系列/计算机刷题-单文件离线版.html', '计算机单文件版'],
  ['思政系列/思政刷题-单文件离线版.html', '思政单文件版'],
];

async function checkResources(base, title) {
  console.log('\n── ' + title + ' ──');
  for (const [file, label] of checks) {
    try {
      const res = await fetch(base + file, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
      const ok = res.ok || res.status === 304;
      console.log(`${ok ? '✓' : '✗'} ${res.status} ${file} (${label})`);
    } catch (e) {
      console.log(`✗ ERR ${file} (${label}): ${e.message}`);
    }
  }
}

async function checkHome(base, title) {
  try {
    const home = await (await fetch(base, { signal: AbortSignal.timeout(15000) })).text();
    console.log('\n' + title + ' 首页关键标记:');
    console.log('  site-search 表单:', home.includes('site-search-form') ? '✓' : '✗');
    console.log('  OG 标签:', home.includes('og:title') ? '✓' : '✗');
    console.log('  favicon 引用:', home.includes('favicon.svg') ? '✓' : '✗');
    console.log('  home.css 版本:', (home.match(/home\.css\?v=([^"']+)/) || [])[1] || '?');
    console.log('  /666/ 残留:', home.includes('/666/') ? '✗ 有残留' : '✓ 无残留');
  } catch (e) { console.log(title + ' 首页抓取失败:', e.message); }
}

(async () => {
  await checkResources(MAIN, '主域 free60127.top');
  await checkHome(MAIN, '主域');

  // API 子域健康检查
  try {
    const res = await fetch(API + '/api/health', { signal: AbortSignal.timeout(15000) });
    const j = await res.json().catch(() => ({}));
    console.log(`${res.ok && j.ok ? '✓' : '✗'} ${res.status} api.free60127.top/api/health`);
  } catch (e) { console.log('✗ ERR api.free60127.top/api/health:', e.message); }
  // 主域反代 API 通道
  try {
    const res = await fetch(MAIN + 'api/health', { signal: AbortSignal.timeout(15000) });
    const j = await res.json().catch(() => ({}));
    console.log(`${res.ok && j.ok ? '✓' : '✗'} ${res.status} free60127.top/api/health（反代通道）`);
  } catch (e) { console.log('✗ ERR free60127.top/api/health:', e.message); }
  // www 跳转
  try {
    const res = await fetch('https://www.free60127.top/', { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const loc = res.headers.get('location') || '';
    console.log(`${res.status === 301 && loc === 'https://free60127.top/' ? '✓' : '✗'} ${res.status} www.free60127.top → 301 ${loc}`);
  } catch (e) { console.log('✗ ERR www.free60127.top:', e.message); }

  if (withPages) {
    await checkResources(PAGES, '源站 free60127.github.io/666（--pages）');
    await checkHome(PAGES, '源站');
  }
})();
