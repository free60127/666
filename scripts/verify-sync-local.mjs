/* /api/sync 加固本地集成测试（wrangler dev --local + 真实 HTTP）
 * 用法：
 *   cd workers && wrangler dev --port 8787 --local &
 *   node scripts/verify-sync-local.mjs
 * 覆盖：非法 deviceId 400 / 合法上传下载删除 200 / 上传限流 429 / 账号模式（Bearer）读写
 */
const API = 'http://127.0.0.1:8787';
let passed = 0, failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, detail); }
};
const hex64 = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, cacheControl: res.headers.get('cache-control') };
}

console.log('1) deviceId 校验');
{
  const bad = await call('/api/sync', { method: 'POST', body: { deviceId: 'short', payload: { a: 1 } } });
  check('非 64hex deviceId → 400', bad.status === 400, String(bad.status));
  const bad2 = await call('/api/sync', { method: 'POST', body: { deviceId: 'Z'.repeat(64), payload: { a: 1 } } });
  check('非 hex（大写Z）→ 400', bad2.status === 400);
}

console.log('2) 匿名上传/下载/删除 + no-store');
{
  const deviceId = hex64();
  const up = await call('/api/sync', { method: 'POST', body: { deviceId, payload: { hello: '世界' } } });
  check('合法上传 → 200 带 updatedAt', up.status === 200 && !!up.data.updatedAt);
  check('上传响应 no-store', up.cacheControl === 'no-store', String(up.cacheControl));
  const dl = await call('/api/sync?deviceId=' + deviceId);
  check('下载 200 数据一致', dl.status === 200 && dl.data.payload.hello === '世界');
  check('下载响应 no-store', dl.cacheControl === 'no-store');
  const miss = await call('/api/sync?deviceId=' + hex64());
  check('不存在 → 404', miss.status === 404);
  const del = await call('/api/sync?deviceId=' + deviceId, { method: 'DELETE' });
  check('删除 200', del.status === 200);
}

console.log('3) 上传限流（每分钟 10 次，KV 计数器）');
{
  const deviceId = hex64();
  let limited = 0, ok = 0;
  for (let i = 0; i < 12; i++) {
    const r = await call('/api/sync', { method: 'POST', body: { deviceId, payload: { i } } });
    if (r.status === 429) limited++;
    else if (r.status === 200) ok++;
  }
  check('前 10 次成功、第 11 次起 429', ok === 10 && limited >= 1, 'ok=' + ok + ' limited=' + limited);
}

console.log('4) 账号模式（Bearer 会话）');
{
  // 本地 D1 已跑过 register 流程（0001_init.sql applied locally），注册真实用户
  const email = 'sync-' + Date.now().toString(36) + '@test.com';
  const reg = await call('/api/auth/register', { method: 'POST', body: { email, password: 'password123' } });
  check('注册账号成功', reg.status === 201, String(reg.status));
  const token = reg.data && reg.data.token;
  const up = await call('/api/sync', { method: 'POST', body: { payload: { account: true } }, token });
  check('账号模式上传（无 deviceId）→ 200', up.status === 200, String(up.status) + ' ' + JSON.stringify(up.data));
  const dl = await call('/api/sync', { token });
  check('账号模式下载 → 200 数据一致', dl.status === 200 && dl.data.payload.account === true);
  const dlAnon = await call('/api/sync?deviceId=' + hex64());
  check('匿名看不到账号数据（404）', dlAnon.status === 404);
  const badToken = await call('/api/sync', { method: 'POST', body: { payload: { x: 1 } }, token: 'deadbeef'.repeat(8) });
  check('伪造 token → 401', badToken.status === 401);
  const del = await call('/api/sync', { method: 'DELETE', token });
  check('账号模式删除 → 200', del.status === 200);
}

console.log('5) 版本号 + 冲突检测（baseRev 乐观锁）');
{
  const deviceId = hex64();
  const up1 = await call('/api/sync', { method: 'POST', body: { deviceId, payload: { v: 'a' }, baseRev: 0 } });
  check('首次上传 baseRev=0 → 200 带 rev', up1.status === 200 && typeof up1.data.rev === 'number', JSON.stringify(up1.data));
  const rev1 = up1.data.rev;

  const dl = await call('/api/sync?deviceId=' + deviceId);
  check('下载返回 rev（=上传 rev）', dl.status === 200 && dl.data.rev === rev1, JSON.stringify(dl.data));

  const stale = await call('/api/sync', { method: 'POST', body: { deviceId, payload: { v: 'b' }, baseRev: 0 } });
  check('旧 baseRev 上传 → 409 且带最新 payload', stale.status === 409 && stale.data.rev === rev1 && stale.data.payload.v === 'a', JSON.stringify(stale.data));

  const fresh = await call('/api/sync', { method: 'POST', body: { deviceId, payload: { v: 'c' }, baseRev: rev1 } });
  check('最新 baseRev 上传 → 200 新 rev', fresh.status === 200 && fresh.data.rev > rev1);

  // 不带 baseRev 的旧客户端 → 仍允许覆盖（兼容老版本）
  const legacy = await call('/api/sync', { method: 'POST', body: { deviceId, payload: { v: 'd' } } });
  check('无 baseRev 旧客户端 → 200（兼容）', legacy.status === 200);

  const del = await call('/api/sync?deviceId=' + deviceId, { method: 'DELETE' });
  check('清理删除 200', del.status === 200);
}

console.log('6) /api/activity 加固（间隔校验 + IP 限流 + 管理删除');
{
  const hbId = hex64();
  const hb = async (body, ip) => {
    const headers = { 'Content-Type': 'application/json' };
    if (ip) headers['CF-Connecting-IP'] = ip;
    const res = await fetch(API + '/api/activity', { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  const a1 = await hb({ deviceId: hbId, learned: 3 });
  check('首次心跳 → 200 且不 skipped（原子 UPSERT 不再返回 minutes/learned）', a1.status === 200 && a1.data.ok === true && a1.data.skipped !== true, JSON.stringify(a1.data));
  const a2 = await hb({ deviceId: hbId, learned: 3 });
  check('紧接第二次 → skipped 不计数', a2.status === 200 && a2.data.skipped === true, JSON.stringify(a2.data));
  let ip429 = 0;
  for (let i = 0; i < 21; i++) {
    const r = await hb({ deviceId: hex64(), learned: 0 }, '203.0.113.9');
    if (r.status === 429) ip429++;
  }
  check('同 IP 21 连发 → 触发 429 且仅第 21 次', ip429 === 1, '429 count=' + ip429);
  const del = await fetch(API + '/api/activity?key=anon:' + hbId + '&date=2026-08-22', { method: 'DELETE' });
  check('管理删除无令牌 → 401', del.status === 401, String(del.status));
}

console.log('\n结果：' + passed + ' 通过 / ' + failed + ' 失败');
process.exit(failed ? 1 : 0);
