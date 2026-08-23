/* 账号体系单元测试（无真实 D1）：内存版 D1 + Worker auth 路由 + 前端恢复码保险箱闭环
 * 运行：node scripts/test-auth.mjs
 */
import { handleAuth } from '../workers/src/auth.js';

/* ---------- 内存版 D1（模拟 prepare/bind/first/run/batch；token 列存 SHA-256 哈希） ---------- */
class MemoryD1 {
  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.loginFails = new Map();
    this.rates = new Map();
    this.resetTokens = new Map();
    this.cleanupJobs = new Map();
    this.syncData = new Map();
    this.batchQueue = Promise.resolve();
  }
  prepare(sql) {
    const db = this;
    const bound = { _sql: sql, _args: [] };
    return {
      bind(...args) { bound._args = args; return this; },
      async first() { return db._first(bound._sql, bound._args); },
      async run() { return db._run(bound._sql, bound._args); },
    };
  }
  batch(statements) {
    const job = this.batchQueue.then(async () => {
      const results = [];
      for (const stmt of statements) results.push(await stmt.run());
      return results;
    });
    this.batchQueue = job.catch(() => {});
    return job;
  }
  resetMatches(email, codeHash, now) {
    const row = this.resetTokens.get(email);
    return !!(row && !row.used && row.code_hash === codeHash && row.expires_at > now);
  }
  async _first(s, args) {
    if (s.includes('FROM login_fails') && s.includes('WHERE email')) {
      const [email] = args;
      return this.loginFails.get(email) || null;
    }
    if (s.includes('FROM users') && s.includes('WHERE email')) {
      const [email] = args;
      return [...this.users.values()].find(u => u.email === email) || null;
    }
    if (s.includes('JOIN users') && s.includes('WHERE s.token')) {
      const [tokenHash, now] = args;
      const ses = this.sessions.get(tokenHash);
      if (!ses || ses.expires_at <= now) return null;
      const u = this.users.get(ses.user_id);
      if (!u) return null;
      return { token: tokenHash, id: u.id, email: u.email, nickname: u.nickname || '', password_hash: u.password_hash, recovery_encrypted: u.recovery_encrypted };
    }
    if (s.includes('FROM sessions') && s.includes('expires_at >')) {
      const [tokenHash, now] = args;
      const ses = this.sessions.get(tokenHash);
      return ses && ses.expires_at > now ? ses : null;
    }
    if (s.startsWith('DELETE FROM sessions') && !s.includes('WHERE token')) {
      const [now] = args;
      for (const [k, v] of this.sessions) if (v.expires_at < now) this.sessions.delete(k);
      return { meta: { changes: 0 } };
    }
    if (s.includes('INTO rate') && s.includes('RETURNING count')) {
      const [key, winEnd, winStart] = args;
      const cur = this.rates.get(key);
      if (!cur || cur.until <= winStart) {
        this.rates.set(key, { count: 1, until: winEnd });
        return { count: 1 };
      }
      cur.count += 1;
      return { count: cur.count };
    }
    if (s.includes('FROM reset_tokens') && s.includes('WHERE email')) {
      const [email] = args;
      return this.resetTokens.get(email) || null;
    }
    return null;
  }
  async _run(s, args) {
    let changes = 0;
    if (s.startsWith('INSERT INTO users')) {
      const [id, email, password_hash, nickname, recovery_encrypted, created_at, updated_at] = args;
      if ([...this.users.values()].some(u => u.email === email)) throw new Error('UNIQUE constraint failed: users.email');
      this.users.set(id, { id, email, password_hash, nickname, recovery_encrypted, created_at, updated_at });
      changes = 1;
    } else if (s.startsWith('INSERT INTO sessions')) {
      const [tokenHash, user_id, created_at, expires_at] = args;
      this.sessions.set(tokenHash, { token: tokenHash, user_id, created_at, expires_at });
      changes = 1;
    } else if (s.startsWith('DELETE FROM sessions')) {
      if (s.includes('EXISTS (SELECT 1 FROM reset_tokens')) {
        const [userId, email, codeHash, now] = args;
        if (this.resetMatches(email, codeHash, now)) {
          for (const [k, v] of this.sessions) {
            if (v.user_id === userId) { this.sessions.delete(k); changes++; }
          }
        }
      } else if (s.includes('AND token')) {
        const [userId, keepTokenHash] = args;
        for (const [k, v] of this.sessions) {
          if (v.user_id === userId && k !== keepTokenHash) { this.sessions.delete(k); changes++; }
        }
      } else if (s.includes('WHERE user_id')) {
        const [userId] = args;
        for (const [k, v] of this.sessions) {
          if (v.user_id === userId) { this.sessions.delete(k); changes++; }
        }
      } else {
        const [tokenHash] = args;
        if (this.sessions.delete(tokenHash)) changes = 1;
      }
    } else if (s.startsWith('DELETE FROM login_fails')) {
      const [email] = args;
      changes = this.loginFails.delete(email) ? 1 : 0;
    } else if (s.startsWith('INSERT INTO login_fails')) {
      if (args.length === 6) {
        // 原子 UPSERT 版（2026-08-23）：args = [email, now(insert), now, now, max, lockUntil]
        const [email, now, , , max, lockUntil] = args;
        const prev = this.loginFails.get(email);
        let count = 1, lockedUntilV = 0;
        if (prev) {
          const expired = prev.locked_until > 0 && prev.locked_until < now;
          count = expired ? 1 : prev.fail_count + 1;
          lockedUntilV = prev.locked_until;
        }
        if (count >= max) lockedUntilV = lockUntil;
        this.loginFails.set(email, { email, fail_count: count, locked_until: lockedUntilV, updated_at: now });
      } else {
        const [email, failCount, lockedUntil, updatedAt] = args;
        this.loginFails.set(email, { email, fail_count: failCount, locked_until: lockedUntil, updated_at: updatedAt });
      }
      changes = 1;
    } else if (s.startsWith('UPDATE users')) {
      if (s.includes('EXISTS (SELECT 1 FROM reset_tokens')) {
        const [password_hash, recovery, now, userId, email, codeHash, expiresAt] = args;
        const u = this.users.get(userId);
        if (u && this.resetMatches(email, codeHash, expiresAt)) {
          u.password_hash = password_hash;
          u.recovery_encrypted = recovery;
          u.updated_at = now;
          changes = 1;
        }
      } else {
        const u = this.users.get(args[args.length - 1]);
        if (!u) return { meta: { changes: 0 } };
        if (s.includes('password_hash') && s.includes('recovery_encrypted')) {
          const [password_hash, recovery, now] = args;
          u.password_hash = password_hash; u.recovery_encrypted = recovery; u.updated_at = now;
          changes = 1;
        } else if (s.includes('password_hash')) {
          const [password_hash, now] = args;
          u.password_hash = password_hash; u.updated_at = now;
          changes = 1;
        } else {
          const [recovery, now] = args;
          u.recovery_encrypted = recovery; u.updated_at = now;
          changes = 1;
        }
      }
    } else if (s.startsWith('DELETE FROM users')) {
      const [id] = args;
      changes = this.users.delete(id) ? 1 : 0;
      for (const [k, v] of this.sessions) if (v.user_id === id) this.sessions.delete(k);
    } else if (s.includes('INSERT OR REPLACE INTO reset_tokens')) {
      const [email, codeHash, expiresAt, createdAt] = args;
      const used = 0;
      this.resetTokens.set(email, { email, code_hash: codeHash, expires_at: expiresAt, used, created_at: createdAt });
      changes = 1;
    } else if (s.startsWith('UPDATE reset_tokens SET used = 1')) {
      const [email, codeHash, expiresAt, userId] = args;
      const row = this.resetTokens.get(email);
      if (!s.includes('code_hash')) {
        if (row && !row.used) { row.used = 1; changes = 1; }
      } else if (this.users.has(userId) && row && !row.used && row.code_hash === codeHash && row.expires_at > expiresAt) {
          row.used = 1;
          changes = 1;
      }
    } else if (s.startsWith('DELETE FROM reset_tokens')) {
      const [email] = args;
      changes = this.resetTokens.delete(email) ? 1 : 0;
    } else if (s.startsWith('DELETE FROM rate')) {
      for (const key of args) if (this.rates.delete(key)) changes++;
    } else if (s.startsWith('INSERT OR IGNORE INTO cleanup_jobs')) {
      const [userId, kvKey, nextAttemptAt, createdAt] = args;
      if (!this.cleanupJobs.has(kvKey)) {
        this.cleanupJobs.set(kvKey, { user_id: userId, kv_key: kvKey, attempts: 0, next_attempt_at: nextAttemptAt, created_at: createdAt, last_error: null });
        changes = 1;
      }
    } else if (s.startsWith('DELETE FROM cleanup_jobs')) {
      const [kvKey] = args;
      changes = this.cleanupJobs.delete(kvKey) ? 1 : 0;
    } else if (s.startsWith('DELETE FROM sync_data')) {
      const [key] = args;
      changes = this.syncData.delete(key) ? 1 : 0;
    }
    return { meta: { changes } };
  }
}

const sharedDb = new MemoryD1(); // 所有请求共享同一数据库
const api = async (path, { method = 'GET', token, body, extraEnv = {} } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const request = new Request('https://api.free60127.top' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const response = await handleAuth(request, { DB: sharedDb, ...extraEnv }, path);
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

console.log('4) 登录限流（D1 邮箱锁定：连续 8 次失败 → 429）');
{
  const email = 'rate@test.com';
  await api('/api/auth/register', { method: 'POST', body: { email, password: 'secret123' } });
  let got429 = false, statuses = [];
  for (let i = 0; i < 10; i++) {
    const r = await api('/api/auth/login', { method: 'POST', body: { email, password: 'wrong-pass-' + i } });
    statuses.push(r.status);
    if (r.status === 429) { got429 = true; break; }
  }
  check('连续 10 次错误密码触发 429', got429, statuses.join(','));
  check('触发的是邮箱锁定而非其他', statuses.filter(s => s === 429).length === 1 && statuses[statuses.length - 1] === 429, statuses.join(','));
  // 正确密码在锁定期内也被拒
  const locked = await api('/api/auth/login', { method: 'POST', body: { email, password: 'secret123' } });
  check('锁定期内正确密码也 429', locked.status === 429);
  // 解锁后成功登录（模拟时间流逝：直接改内存表）
  sharedDb.loginFails.get(email).locked_until = Date.now() - 1;
  const ok = await api('/api/auth/login', { method: 'POST', body: { email, password: 'secret123' } });
  check('锁过期后正确密码 200 且清计数', ok.status === 200 && !sharedDb.loginFails.has(email));
}

console.log('5) 修改密码（change-password）');
{
  const reg = await api('/api/auth/register', { method: 'POST', body: { email: 'cp@test.com', password: 'old-pass-1' } });
  check('注册 201', reg.status === 201);
  const token = reg.data.token;
  const noAuth = await api('/api/auth/change-password', { method: 'POST', body: { oldPassword: 'old-pass-1', newPassword: 'new-pass-1' } });
  check('未登录 401', noAuth.status === 401);
  const badOld = await api('/api/auth/change-password', { method: 'POST', token, body: { oldPassword: 'wrong', newPassword: 'new-pass-1' } });
  check('旧密码错误 401', badOld.status === 401);
  const short = await api('/api/auth/change-password', { method: 'POST', token, body: { oldPassword: 'old-pass-1', newPassword: 'short' } });
  check('新密码过短 400', short.status === 400);
  const ok = await api('/api/auth/change-password', { method: 'POST', token, body: { oldPassword: 'old-pass-1', newPassword: 'new-pass-1' } });
  check('改密码 200', ok.status === 200);
  const oldLogin = await api('/api/auth/login', { method: 'POST', body: { email: 'cp@test.com', password: 'old-pass-1' } });
  check('旧密码登录 401', oldLogin.status === 401);
  const newLogin = await api('/api/auth/login', { method: 'POST', body: { email: 'cp@test.com', password: 'new-pass-1' } });
  check('新密码登录 200', newLogin.status === 200);
  const tokenB = newLogin.data.token;
  const okB = await api('/api/auth/change-password', { method: 'POST', token: tokenB, body: { oldPassword: 'new-pass-1', newPassword: 'newest-1' } });
  check('第二会话改密码 200', okB.status === 200);
  const tA = await api('/api/auth/me', { token });
  const tB = await api('/api/auth/me', { token: tokenB });
  check('其他设备会话失效、当前会话保留', tA.status === 401 && tB.status === 200);
}

console.log('6) 注销账号（delete-account）');
{
  const reg = await api('/api/auth/register', { method: 'POST', body: { email: 'del@test.com', password: 'secret123' } });
  const token = reg.data.token;
  const wrong = await api('/api/auth/delete-account', { method: 'POST', token, body: { password: 'nope' } });
  check('密码错误 401', wrong.status === 401);
  const ok = await api('/api/auth/delete-account', { method: 'POST', token, body: { password: 'secret123' } });
  check('注销 200', ok.status === 200);
  const me = await api('/api/auth/me', { token });
  check('注销后 me 401', me.status === 401);
  const login = await api('/api/auth/login', { method: 'POST', body: { email: 'del@test.com', password: 'secret123' } });
  check('注销后登录 401', login.status === 401);
  // 2026-08-23 审查：注销必须删除 D1 云同步数据（键 'user:'+id），并登记 cleanup_jobs
  const reg2 = await api('/api/auth/register', { method: 'POST', body: { email: 'del2@test.com', password: 'secret123' } });
  const uid2 = reg2.data.user.id;
  sharedDb.syncData.set('user:' + uid2, { payload: '{}', rev: 1, updated_at: Date.now() });
  const kvDeleted = [];
  const del2 = await api('/api/auth/delete-account', { method: 'POST', token: reg2.data.token, body: { password: 'secret123' }, extraEnv: { STUDY_KV: { delete: async (k) => { kvDeleted.push(k); } } } });
  check('注销 200（带 STUDY_KV）', del2.status === 200);
  check('注销删除 D1 云同步数据 sync_data', !sharedDb.syncData.has('user:' + uid2));
  check('KV 清理键为 user:<id>（非 sync:user:<id>）', kvDeleted.length === 1 && kvDeleted[0] === 'user:' + uid2, JSON.stringify(kvDeleted));
  check('KV 清理成功后 cleanup_jobs 不残留', !sharedDb.cleanupJobs.has('user:' + uid2));
}

console.log('7) 找回密码（forgot / reset-password / admin-reset-code）');
{
  const env = { ADMIN_TOKEN: 'test-admin-token', SMTP_TEST_MODE: true, SMTP_SENT: [], SMTP_USER: 'test@qq.com', SMTP_PASS: 'authcode' };
  await api('/api/auth/register', { method: 'POST', body: { email: 'fg@test.com', password: 'secret123' } });
  await api('/api/auth/register', { method: 'POST', body: { email: 'fg2@test.com', password: 'secret123' } });
  const unreg = await api('/api/auth/forgot', { method: 'POST', body: { email: 'ghost@test.com' }, extraEnv: env });
  check('未注册邮箱 200（防枚举）', unreg.status === 200);
  check('未注册不发信', env.SMTP_SENT.length === 0);
  const fg = await api('/api/auth/forgot', { method: 'POST', body: { email: 'fg@test.com' }, extraEnv: env });
  check('已注册邮箱 200 且发信 1 封', fg.status === 200 && env.SMTP_SENT.length === 1 && env.SMTP_SENT[0].to === 'fg@test.com');
  const smtpRawBody = env.SMTP_SENT[0].raw.split('\r\n\r\n')[1].replace(/\r\n/g, '');
  check('SMTP 中文主题与正文使用 MIME/Base64', env.SMTP_SENT[0].raw.includes('Subject: =?UTF-8?B?') &&
    env.SMTP_SENT[0].raw.includes('Content-Transfer-Encoding: base64') &&
    smtpRawBody === Buffer.from(env.SMTP_SENT[0].text, 'utf8').toString('base64'));
  const again = await api('/api/auth/forgot', { method: 'POST', body: { email: 'fg@test.com' }, extraEnv: env });
  check('1 分钟内重复请求 429', again.status === 429);
  const smtpFail = await api('/api/auth/forgot', { method: 'POST', body: { email: 'fg2@test.com' } });
  check('SMTP 失败不向前端泄露内部 detail', smtpFail.status === 503 && !Object.prototype.hasOwnProperty.call(smtpFail.data || {}, 'detail'));
  const adminNoToken = await api('/api/auth/admin-reset-code', { method: 'POST', body: { email: 'fg@test.com' }, extraEnv: env });
  check('admin 无 token 401', adminNoToken.status === 401);
  const admin = await api('/api/auth/admin-reset-code', { method: 'POST', token: 'test-admin-token', body: { email: 'fg@test.com' }, extraEnv: env });
  check('admin 生成码 200 且 8 位数字', admin.status === 200 && /^[0-9]{8}$/.test(admin.data.code), JSON.stringify(admin.data));
  const code = admin.data.code;
  const badCode = await api('/api/auth/reset-password', { method: 'POST', body: { email: 'fg@test.com', code: '00000000', newPassword: 'new-secret' }, extraEnv: env });
  check('错误验证码 400', badCode.status === 400);
  const ok = await api('/api/auth/reset-password', { method: 'POST', body: { email: 'fg@test.com', code, newPassword: 'new-secret' }, extraEnv: env });
  check('重置密码 200 且 recoveryReset', ok.status === 200 && ok.data.recoveryReset === true);
  const oldLogin = await api('/api/auth/login', { method: 'POST', body: { email: 'fg@test.com', password: 'secret123' } });
  check('旧密码登录 401', oldLogin.status === 401);
  const newLogin = await api('/api/auth/login', { method: 'POST', body: { email: 'fg@test.com', password: 'new-secret' } });
  check('新密码登录 200 且 recovery 为 null', newLogin.status === 200 && newLogin.data.recovery === null);
  const reuse = await api('/api/auth/reset-password', { method: 'POST', body: { email: 'fg@test.com', code, newPassword: 'third-secret' }, extraEnv: env });
  check('重置码一次性（重用 400）', reuse.status === 400);
  const admin2 = await api('/api/auth/admin-reset-code', { method: 'POST', token: 'test-admin-token', body: { email: 'fg2@test.com' }, extraEnv: env });
  const box = { salt: 'AAAA_salt_salt_salt_salt', iv: 'BBBB_iv_iv_iv_iv_iv_iv', c: 'CCCC_cipher_cipher' };
  const ok2 = await api('/api/auth/reset-password', { method: 'POST', body: { email: 'fg2@test.com', code: admin2.data.code, newPassword: 'new-secret', recovery: box }, extraEnv: env });
  check('带恢复码重置 recoveryReset=false', ok2.status === 200 && ok2.data.recoveryReset === false);
  const login2 = await api('/api/auth/login', { method: 'POST', body: { email: 'fg2@test.com', password: 'new-secret' } });
  check('重置后 recovery 为新保险箱', login2.status === 200 && JSON.stringify(login2.data.recovery) === JSON.stringify(box));

  await api('/api/auth/register', { method: 'POST', body: { email: 'limit@test.com', password: 'secret123' } });
  const limitCode = await api('/api/auth/admin-reset-code', { method: 'POST', token: 'test-admin-token', body: { email: 'limit@test.com' }, extraEnv: env });
  const wrongStatuses = [];
  for (let i = 0; i < 8; i++) {
    const wrong = await api('/api/auth/reset-password', {
      method: 'POST',
      body: { email: 'limit@test.com', code: String(i).padStart(8, '0'), newPassword: 'another-secret' },
      extraEnv: env,
    });
    wrongStatuses.push(wrong.status);
  }
  check('重置验证码连续错误达到上限后 429', wrongStatuses.slice(0, 7).every(s => s === 400) && wrongStatuses[7] === 429, wrongStatuses.join(','));
  const blocked = await api('/api/auth/reset-password', {
    method: 'POST',
    body: { email: 'limit@test.com', code: limitCode.data.code, newPassword: 'another-secret' },
    extraEnv: env,
  });
  check('错误次数超限后当前验证码已作废', blocked.status === 429 && sharedDb.resetTokens.get('limit@test.com')?.used === 1);

  await api('/api/auth/register', { method: 'POST', body: { email: 'race@test.com', password: 'secret123' } });
  const raceCode = await api('/api/auth/admin-reset-code', { method: 'POST', token: 'test-admin-token', body: { email: 'race@test.com' }, extraEnv: env });
  const raceRequests = await Promise.all([
    api('/api/auth/reset-password', { method: 'POST', body: { email: 'race@test.com', code: raceCode.data.code, newPassword: 'race-pass-a' }, extraEnv: env }),
    api('/api/auth/reset-password', { method: 'POST', body: { email: 'race@test.com', code: raceCode.data.code, newPassword: 'race-pass-b' }, extraEnv: env }),
  ]);
  check('并发提交同一重置码只有一次成功', raceRequests.filter(r => r.status === 200).length === 1 && raceRequests.filter(r => r.status === 400).length === 1, JSON.stringify(raceRequests));
}

console.log(`\n结果：${passed} 通过 / ${failed} 失败`);

/* ---------- 组 8：复审整改（2026-08-23）---------- */
{
  // 认证请求体 > 64KB -> 413（handleAuth 入口 content-length 预检）
  const bigBody = JSON.stringify({ email: 'big@test.com', password: 'secret123' });
  const bigReq = new Request('https://api.free60127.top/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': String(100 * 1024) },
    body: bigBody,
  });
  const bigRes = await handleAuth(bigReq, { DB: sharedDb }, '/api/auth/register');
  check('认证请求体超 64KB -> 413', bigRes.status === 413);
}
{
  // recovery_encrypted 损坏 -> login 200 且 recovery null（不 500）
  const corrupt = [...sharedDb.users.values()].find(u => u.email === 'a@b.com');
  const savedRec = corrupt.recovery_encrypted;
  corrupt.recovery_encrypted = '{not-json';
  const r = await api('/api/auth/login', { method: 'POST', body: { email: 'a@b.com', password: 'secret123' } });
  check('损坏恢复码 -> 登录 200 且 recovery null', r.status === 200 && r.data.recovery === null, JSON.stringify(r.data));
  corrupt.recovery_encrypted = savedRec;
}process.exit(failed ? 1 : 0);
