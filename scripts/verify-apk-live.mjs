// APK 下载 smoke test（2026-08-23 审查项）
// 验证：稳定地址 302 → 版本化地址 200 + Content-Type + APK 魔数 PK + 大小 + ETag + 304
// 用法：node scripts/verify-apk-live.mjs
const BASE = 'https://free60127.top';
const names = ['waiyuan-share.apk', 'waiyuan-paotui.apk'];
let fails = 0;
function check(label, ok, extra) {
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
  if (!ok) fails++;
}
(async () => {
  for (const name of names) {
    console.log('== ' + name + ' ==');
    // 1. 稳定地址 → 302
    const r1 = await fetch(BASE + '/apk/' + name, { redirect: 'manual' });
    check('稳定地址 302 跳转', r1.status === 302, 'status=' + r1.status);
    const loc = r1.headers.get('location') || '';
    check('Location 指向版本化地址', /^\/apk\/[A-Za-z0-9._-]+-v[0-9][A-Za-z0-9._-]*\.apk$/.test(loc), loc);
    if (r1.status !== 302 || !loc) continue;
    // 2. 版本化地址 200
    const r2 = await fetch(BASE + loc, { redirect: 'manual' });
    check('版本化地址 200', r2.status === 200, 'status=' + r2.status);
    const ct = r2.headers.get('content-type') || '';
    check('Content-Type 为 APK', ct.includes('vnd.android.package-archive'), ct);
    const etag = r2.headers.get('etag') || '';
    check('有 ETag（sha256）', /^"[0-9a-f]{64}"$/.test(etag), etag);
    check('Cache-Control immutable 长缓存', (r2.headers.get('cache-control') || '').includes('immutable'), r2.headers.get('cache-control'));
    const buf = Buffer.from(await r2.arrayBuffer());
    check('大小 > 1MB', buf.length > 1000000, buf.length + ' bytes');
    check('APK 魔数 PK', buf[0] === 0x50 && buf[1] === 0x4b, buf.slice(0, 2).toString('hex'));
    // 3. If-None-Match → 304
    const r3 = await fetch(BASE + loc, { redirect: 'manual', headers: { 'If-None-Match': etag } });
    check('ETag 命中 304', r3.status === 304, 'status=' + r3.status);
  }
  console.log(fails ? '\n' + fails + ' 项失败' : '\n全部通过');
  process.exit(fails ? 1 : 0);
})();
