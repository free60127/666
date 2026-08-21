// 线上验证 v2（token 哈希/batch/限流/no-store 扩展）
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
  return { status: res.status, data, cacheControl: res.headers.get('cache-control') };
}

console.log('1) 认证全链路（token 哈希会话）');
const email = 'v2-' + Date.now().toString(36) + '@example.com';
const password = 'password123';
{
  const reg = await call('/api/auth/register', { method: 'POST', body: { email, password } });
  check('注册 201', reg.status === 201, String(reg.status));
  const token = reg.data.token;
  const me = await call('/api/auth/me', { token });
  check('me 200（哈希会话生效）', me.status === 200 && me.data.user.email === email);
  check('认证接口 no-store', me.cacheControl === 'no-store', String(me.cacheControl));
  const out = await call('/api/auth/logout', { method: 'POST', token });
  check('logout 200', out.status === 200);
  const me2 = await call('/api/auth/me', { token });
  check('logout 后 me 401', me2.status === 401);
}

console.log('2) 同步账号模式（哈希会话）');
{
  const login = await call('/api/auth/login', { method: 'POST', body: { email, password } });
  check('login 200', login.status === 200);
  const token = login.data.token;
  const up = await call('/api/sync', { method: 'POST', body: { payload: { v2: true } }, token });
  check('账号上传 200', up.status === 200);
  const dl = await call('/api/sync', { token });
  check('账号下载一致', dl.status === 200 && dl.data.payload.v2 === true);
  await call('/api/sync', { method: 'DELETE', token });
  await call('/api/auth/logout', { method: 'POST', token });
}

console.log('3) 登录限流（8 次错误密码 → 锁定 429）');
{
  let locked = false;
  for (let i = 0; i < 10; i++) {
    const r = await call('/api/auth/login', { method: 'POST', body: { email, password: 'wrong-pass-' + i } });
    if (r.status === 429) { locked = true; break; }
  }
  check('连续错误密码后 429', locked);
}

console.log(`\n线上结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
