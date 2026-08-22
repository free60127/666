// 线上验证 v3：rev + 冲突检测 + 旧数据兼容 + 认证/限流回归
const API = 'https://api.free60127.top';
let passed = 0, failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, detail); }
};
async function call(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

console.log('1) 冲突检测（匿名键，真实线上 KV）');
{
  const deviceId = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  const up1 = await call('/api/sync', { method: 'POST', body: { deviceId, payload: { v: 'a' }, baseRev: 0 } });
  check('首次上传 baseRev=0 → 200 带 rev', up1.status === 200 && typeof up1.data.rev === 'number', String(up1.status));
  const rev1 = up1.data.rev;
  const dl = await call('/api/sync?deviceId=' + deviceId);
  check('下载 rev 一致', dl.status === 200 && dl.data.rev === rev1);
  const stale = await call('/api/sync', { method: 'POST', body: { deviceId, payload: { v: 'b' }, baseRev: 0 } });
  check('旧 baseRev → 409 带最新数据', stale.status === 409 && stale.data.rev === rev1 && stale.data.payload.v === 'a', JSON.stringify(stale.data));
  const fresh = await call('/api/sync', { method: 'POST', body: { deviceId, payload: { v: 'c' }, baseRev: rev1 } });
  check('最新 baseRev → 200', fresh.status === 200 && fresh.data.rev > rev1);
  const legacy = await call('/api/sync', { method: 'POST', body: { deviceId, payload: { v: 'd' } } });
  check('无 baseRev 旧客户端 → 200 兼容', legacy.status === 200);
  await call('/api/sync?deviceId=' + deviceId, { method: 'DELETE' });
}

console.log('2) 认证 + 限流回归');
{
  const email = 'v3-' + Date.now().toString(36) + '@example.com';
  const reg = await call('/api/auth/register', { method: 'POST', body: { email, password: 'password123' } });
  check('注册 201', reg.status === 201, String(reg.status));
  const token = reg.data.token;
  const up = await call('/api/sync', { method: 'POST', body: { payload: { acct: true }, baseRev: 0 }, token });
  check('账号模式上传带 rev → 200', up.status === 200 && typeof up.data.rev === 'number');
  await call('/api/sync', { method: 'DELETE', token });
  await call('/api/auth/logout', { method: 'POST', token });
}
{
  const email = 'v3-lock-' + Date.now().toString(36) + '@example.com';
  await call('/api/auth/register', { method: 'POST', body: { email, password: 'password123' } });
  let got429 = false;
  for (let i = 0; i < 10; i++) {
    const r = await call('/api/auth/login', { method: 'POST', body: { email, password: 'wrong-pass-' + i } });
    if (r.status === 429) { got429 = true; break; }
  }
  check('登录限流 429 仍生效', got429);
}

console.log(`\n线上结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
