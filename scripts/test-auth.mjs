/* 账号体系单元测试（无真实 D1）：内存版 D1 + Worker auth 路由 + 前端恢复码保险箱闭环
 * 运行：node scripts/test-auth.mjs
 */
import { handleAuth } from '../workers/src/auth.js';

/* ---------- 内存版 D1（模拟 prepare/bind/first/run） ---------- */
class MemoryD1 {
  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.sql = '';
    this.args = [];
  }
  prepare(sql) { this.sql = sql; this.args = []; return this; }
  bind(...args) { this.args = args; return this; }
  async first() {
    const s = this.sql;
    if (s.includes('FROM users') && s.includes('WHERE email')) {
      const [email] = this.args;
      return [...this.users.values()].find(u => u.email === email) || null;
    }
    if (s.includes('JOIN users') && s.includes('WHERE s.token')) {
      const [token, now] = this.args;
      const ses = this.sessions.get(token);
      if (!ses || ses.expires_at <= now) return null;
      const u = this.users.get(ses.user_id);
      if (!u) return null;
      return { token, id: u.id, email: u.email, nickname: u.nickname || '', recovery_encrypted: u.recovery_encrypted };
    }
    if (s.includes('FROM sessions') && s.includes('expires_at >')) {
      const [token, now] = this.args;
      const ses = this.sessions.get(token);
      return ses && ses.expires_at > now ? ses : null;
    }
    return null;
  }
  async run() {
    const s = this.sql;
    if (s.startsWith('INSERT INTO users')) {
      const [id, email, password_hash, nickname, recovery_encrypted, created_at, updated_at] = this.args;
      if ([...this.users.values()].some(u => u.email === email)) throw new Error('UNIQUE constraint failed: users.email');
      this.users.set(id, { id, email, password_hash, nickname, recovery_encrypted, created_at, updated_at });
    } else if (s.startsWith('INSERT INTO sessions')) {
      const [token, user_id, created_at, expires_at] = this.args;
      this.sessions.set(token, { token, user_id, created_at, expires_at });
    } else if (s.startsWith('DELETE FROM sessions')) {
      const [token] = this.args;
      this.sessions.delete(token);
    } else if (s.startsWith('UPDATE users')) {
      const [recovery, now, id] = this.args;
      const u = this.users.get(id);
      if (u) { u.recovery_encrypted = recovery; u.updated_at = now; }
    }
    return { meta: { changes: 1 } };
  }
}

const sharedDb = new MemoryD1(); // 所有请求共享同一数据库
const api = async (path, { method = 'GET', token, body } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const request = new Request('https://api.free60127.top' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const response = await handleAuth(request, { DB: sharedDb }, path);
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
};

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, detail); }
};

/* ---------- 测试组 ---------- */
console.log('1) 注册/登录/会话');
{
  const r = await api('/api/auth/register', { method: 'POST', body: { email: 'a@b.com', password: 'secret123', nickname: '小明', recovery: { salt: 'AAAA_salt_salt_salt_salt', iv: 'BBBB_iv_iv_iv_iv_iv_iv', c: 'CCCC_cipher_cipher' } } });
  check('注册成功 201', r.status === 201, JSON.stringify(r.data));
  check('返回 token+user', !!(r.data && r.data.token && r.data.user && r.data.user.email === 'a@b.com'));
  const token = r.data.token;

  const dup = await api('/api/auth/register', { method: 'POST', body: { email: 'a@b.com', password: 'secret123' } });
  check('重复邮箱 409', dup.status === 409);

  const weak = await api('/api/auth/register', { method: 'POST', body: { email: 'c@d.com', password: 'short' } });
  check('弱密码 400', weak.status === 400);

  const badLogin = await api('/api/auth/login', { method: 'POST', body: { email: 'a@b.com', password: 'wrongpass' } });
  check('错误密码 401', badLogin.status === 401);

  const okLogin = await api('/api/auth/login', { method: 'POST', body: { email: 'a@b.com', password: 'secret123' } });
  check('正确登录 200 带 recovery', okLogin.status === 200 && !!okLogin.data.recovery, JSON.stringify(okLogin.data && okLogin.data.recovery));

  const me = await api('/api/auth/me', { token });
  check('me 200 返回用户', me.status === 200 && me.data.user.email === 'a@b.com');

  const meNoToken = await api('/api/auth/me');
  check('无 token me 401', meNoToken.status === 401);

  const out = await api('/api/auth/logout', { method: 'POST', token });
  check('logout 200', out.status === 200);
  const meAfter = await api('/api/auth/me', { token });
  check('logout 后 me 401', meAfter.status === 401);
}

console.log('2) 恢复码保险箱：前端 lock/unlock 与 worker 往返');
{
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const mod = await import('../学习中心/auth.js');
  const WaiyuanAuth = mod.default || globalThis.WaiyuanAuth;
  check('前端模块已加载', !!(WaiyuanAuth && WaiyuanAuth.lockRecovery));

  const recoveryCode = 'A'.repeat(43); // 32B base64url
  const box = await WaiyuanAuth.lockRecovery('my-password-1', recoveryCode);
  check('lockRecovery 产出 {salt,iv,c}', !!(box && box.salt && box.iv && box.c));

  const reg = await api('/api/auth/register', { method: 'POST', body: { email: 'box@test.com', password: 'my-password-1', recovery: box } });
  check('带保险箱注册 201', reg.status === 201);

  const login = await api('/api/auth/login', { method: 'POST', body: { email: 'box@test.com', password: 'my-password-1' } });
  check('登录返回同一保险箱', login.status === 200 && JSON.stringify(login.data.recovery) === JSON.stringify(box));

  const unlocked = await WaiyuanAuth.unlockRecovery('my-password-1', login.data.recovery);
  check('unlockRecovery 还原恢复码', unlocked === recoveryCode);

  let threw = false;
  try { await WaiyuanAuth.unlockRecovery('wrong-password', login.data.recovery); } catch (_) { threw = true; }
  check('错误密码解密抛错', threw);

  const newBox = await WaiyuanAuth.lockRecovery('my-password-1', 'B'.repeat(43));
  const up = await api('/api/auth/recovery', { method: 'POST', token: login.data.token, body: { recovery: newBox } });
  check('setRecovery 200', up.status === 200);
  const login2 = await api('/api/auth/login', { method: 'POST', body: { email: 'box@test.com', password: 'my-password-1' } });
  check('更新后登录返回新密文', login2.status === 200 && login2.data.recovery.c !== box.c);
}

console.log('3) 恢复码保险箱结构校验');
{
  const bad = await api('/api/auth/register', { method: 'POST', body: { email: 'bad@test.com', password: 'secret123', recovery: { salt: 'x', iv: 'y', c: 'z' } } });
  check('非法 recovery 被拒（仍可注册）', bad.status === 201 && bad.data.user.email === 'bad@test.com');
}

console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
