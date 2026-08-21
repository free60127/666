// 线上验证 sync 加固 + 反馈分页（2026-08-22）
const API = 'https://api.free60127.top';
const ADMIN = process.env.WAIYUAN_ADMIN_TOKEN || '';
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
  return { status: res.status, data, cacheControl: res.headers.get('cache-control'), vary: res.headers.get('vary') };
}

console.log('1) sync 加固（线上）');
{
  const bad = await call('/api/sync', { method: 'POST', body: { deviceId: 'xyz', payload: {} } });
  check('非 64hex deviceId → 400', bad.status === 400);
  const id = hex64();
  const up = await call('/api/sync', { method: 'POST', body: { deviceId: id, payload: { live: true } } });
  check('合法上传 → 200 + no-store', up.status === 200 && up.cacheControl === 'no-store', up.cacheControl);
  const dl = await call('/api/sync?deviceId=' + id);
  check('下载 → 200 + no-store', dl.status === 200 && dl.data.payload.live === true && dl.cacheControl === 'no-store');
  const del = await call('/api/sync?deviceId=' + id, { method: 'DELETE' });
  check('删除 → 200', del.status === 200);
}

console.log('2) 账号模式（线上真实 D1 会话）');
{
  const email = 'livesync-' + Date.now().toString(36) + '@example.com';
  const reg = await call('/api/auth/register', { method: 'POST', body: { email, password: 'password123' } });
  check('注册 201', reg.status === 201);
  const token = reg.data.token;
  const up = await call('/api/sync', { method: 'POST', body: { payload: { accountLive: 1 } }, token });
  check('账号上传 → 200', up.status === 200, String(up.status));
  const dl = await call('/api/sync', { token });
  check('账号下载一致', dl.status === 200 && dl.data.payload.accountLive === 1);
  const anon = await call('/api/sync?deviceId=' + hex64());
  check('匿名读不到账号数据', anon.status === 404);
  const badTok = await call('/api/sync', { method: 'POST', body: { payload: {} }, token: 'f'.repeat(64) });
  check('伪造 token → 401', badTok.status === 401);
  const del = await call('/api/sync', { method: 'DELETE', token });
  check('账号删除 → 200', del.status === 200);
  // 清理测试账号
  await call('/api/auth/logout', { method: 'POST', token });
}

console.log('3) 反馈分页（admin token）');
{
  if (!ADMIN) { console.log('  （未提供 WAIYUAN_ADMIN_TOKEN，跳过）'); }
  else {
    const r = await call('/api/feedback?limit=10&handled=0', { token: ADMIN });
    check('分页参数 + 未处理筛选 → 200 结构正确', r.status === 200 && Array.isArray(r.data.items) && 'hasMore' in r.data && 'cursor' in r.data);
    const withOrigin = await fetch(API + '/api/health', { headers: { Origin: 'https://free60127.top' } });
    check('Vary: Origin（白名单来源）', withOrigin.headers.get('vary') === 'Origin', withOrigin.headers.get('vary'));
    const patch = await call('/api/feedback?key=feedback:nonexistent&handled=1', { method: 'PATCH', token: ADMIN });
    check('PATCH 不存在键 → 404', patch.status === 404);
    const noAuth = await call('/api/feedback?limit=10', {});
    check('无令牌 → 401', noAuth.status === 401);
  }
}

console.log(`\n线上结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
