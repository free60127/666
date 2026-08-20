const base = 'https://free60127.github.io/666/';
(async () => {
  const h = await (await fetch(base)).text();
  const checks = [
    ['manifest 链接', 'rel="manifest"'],
    ['theme.css 引用', 'theme.css'],
    ['common.js 注入', 'data-common-injected'],
    ['主题 boot', 'data-theme-boot'],
    ['og-image 分享图', 'og-image.png'],
    ['twitter large', 'summary_large_image'],
    ['apple 图标', 'apple-touch-icon'],
  ];
  checks.forEach(([name, marker]) => console.log((h.includes(marker) ? '✓' : '✗') + ' ' + name));
  const sw = await (await fetch(base + 'sw.js')).text();
  console.log((sw.includes('waiyuan-v1') ? '✓' : '✗') + ' sw.js 缓存常量');
  const mf = await (await fetch(base + 'manifest.webmanifest')).text();
  console.log((mf.includes('外院知识分享站') && mf.includes('icon-512.png') ? '✓' : '✗') + ' manifest 内容');
})();
