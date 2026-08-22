/* 线上验证：change-password / delete-account / forgot / reset-password / admin-reset-code（2026-08-22）
 * 用法：node scripts/verify-auth-v2.mjs（需 WAIYUAN_ADMIN_TOKEN 环境变量；结束后清理测试账号）
 */
const API = 'https://api.free60127.top';
const ADMIN = process.env.WAIYUAN_ADMIN_TOKEN || '';
let passed = 0, failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, detail); }
};
const req = async (path, { method = 'GET', token, body } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
};
const email = 'verify-' + Date.now().toString(36) + '@test.com';
const password = 'verify-pass-1';
console.log('测试账号:', email);
console.log('1) 注册 + 修改密码');
{
  const reg = await req('/api/auth/register', { method: 'POST', body: { email, password } });
  check('注册 201', reg.status === 201, JSON.stringify(reg.data));
  const token = reg.data && reg.data.token;
  const badOld = await req('/api/auth/change-password', { method: 'POST', token, body: { oldPassword: 'wrong', newPassword: 'new-pass-2' } });
  check('旧密码错误 401', badOld.status === 401, JSON.stringify(badOld.data));
  const ok = await req('/api/auth/change-password', { method: 'POST', token, body: { oldPassword: password, newPassword: 'new-pass-2' } });
  check('改密码 200', ok.status === 200, JSON.stringify(ok.data));
  const oldLogin = await req('/api/auth/login', { method: 'POST', body: { email, password } });
  check('旧密码登录 401', oldLogin.status === 401);
  const newLogin = await req('/api/auth/login', { method: 'POST', body: { email, password: 'new-pass-2' } });
  check('新密码登录 200', newLogin.status === 200, JSON.stringify(newLogin.data && newLogin.data.error));
}
console.log('2) 注销账号');
{
  const login = await req('/api/auth/login', { method: 'POST', body: { email, password: 'new-pass-2' } });
  const token = login.data && login.data.token;
  const wrong = await req('/api/auth/delete-account', { method: 'POST', token, body: { password: 'nope' } });
  check('密码错误 401', wrong.status === 401);
  const del = await req('/api/auth/delete-account', { method: 'POST', token, body: { password: 'new-pass-2' } });
  check('注销 200', del.status === 200, JSON.stringify(del.data));
  const me = await req('/api/auth/me', { token });
  check('注销后 me 401', me.status === 401);
  const loginAfter = await req('/api/auth/login', { method: 'POST', body: { email, password: 'new-pass-2' } });
  check('注销后登录 401', loginAfter.status === 401);
}
console.log('3) 找回密码（SMTP 链路）');
{
  const reg = await req('/api/auth/register', { method: 'POST', body: { email: 'fg-' + email, password } });
  check('再注册 201', reg.status === 201);
  const fg = await req('/api/auth/forgot', { method: 'POST', body: { email: 'fg-' + email } });
  // SMTP 已配置时真实发信（QQ 不实时校验收件人，假地址也 200 ok:true）；未配置时 503 且不泄露 detail
  check('forgot SMTP 链路（200 已配置发信成功 / 503 未配置且无 detail）',
    fg.status === 200 && fg.data && fg.data.ok === true || fg.status === 503 && !(fg.data && fg.data.detail),
    fg.status + ' ' + JSON.stringify(fg.data));
}
console.log('4) admin-reset-code 兜底 + reset-password');
{
  const noToken = await req('/api/auth/admin-reset-code', { method: 'POST', body: { email: 'fg-' + email } });
  check('无 token 401', noToken.status === 401);
  const admin = await req('/api/auth/admin-reset-code', { method: 'POST', token: ADMIN, body: { email: 'fg-' + email } });
  check('admin 生成码 200 且 8 位数字', admin.status === 200 && /^[0-9]{8}$/.test((admin.data && admin.data.code) || ''), JSON.stringify(admin.data));
  const code = admin.data && admin.data.code;
  const bad = await req('/api/auth/reset-password', { method: 'POST', body: { email: 'fg-' + email, code: '00000000', newPassword: 'reset-pass-3' } });
  check('错误码 400', bad.status === 400);
  const ok = await req('/api/auth/reset-password', { method: 'POST', body: { email: 'fg-' + email, code, newPassword: 'reset-pass-3' } });
  check('重置 200 recoveryReset=true', ok.status === 200 && ok.data && ok.data.recoveryReset === true, JSON.stringify(ok.data));
  const login = await req('/api/auth/login', { method: 'POST', body: { email: 'fg-' + email, password: 'reset-pass-3' } });
  check('新密码登录 200', login.status === 200);
}
console.log('5) 清理测试账号');
{
  const a1 = await req('/api/auth/account?email=' + encodeURIComponent(email), { method: 'DELETE', token: ADMIN });
  const a2 = await req('/api/auth/account?email=' + encodeURIComponent('fg-' + email), { method: 'DELETE', token: ADMIN });
  check('管理端删除两个测试账号', (a1.status === 200 || a1.status === 404) && (a2.status === 200 || a2.status === 404), a1.status + '/' + a2.status);
}
console.log('');
console.log('结果：' + passed + ' 通过 / ' + failed + ' 失败');
process.exit(failed ? 1 : 0);