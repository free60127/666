// 线上部署验证：检查关键资源是否 200 且为最新版本
const base = 'https://free60127.github.io/666/';
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
(async () => {
  for (const [file, label] of checks) {
    try {
      const res = await fetch(base + file, {redirect: 'follow'});
      const ok = res.ok || res.status === 304;
      console.log(`${ok ? '✓' : '✗'} ${res.status} ${file} (${label})`);
    } catch (e) {
      console.log(`✗ ERR ${file} (${label}): ${e.message}`);
    }
  }
  // 首页内容版本检查
  try {
    const home = await (await fetch(base)).text();
    console.log('\n首页关键标记:');
    console.log('  site-search 表单:', home.includes('site-search-form') ? '✓' : '✗');
    console.log('  OG 标签:', home.includes('og:title') ? '✓' : '✗');
    console.log('  favicon 引用:', home.includes('favicon.svg') ? '✓' : '✗');
    console.log('  home.css 版本:', (home.match(/home\.css\?v=([^\"]+)/) || [])[1] || '?');
  } catch (e) { console.log('首页抓取失败:', e.message); }
})();
