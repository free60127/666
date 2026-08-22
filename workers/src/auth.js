/* ============================================================
   账号认证模块（D1 版）：注册 / 登录 / 登出 / 会话 / 恢复码保险箱
   - 密码：服务端 PBKDF2(SHA-256, 10k 轮, 16B salt) → 256bit，存 pbkdf2:iter:salt:hash（iter 自适应）
   - 会话：32B 随机 token，D1 sessions 表 + 30 天 TTL（懒清理）
   - 恢复码保险箱：users.recovery_encrypted 存「密码派生密钥」加密的恢复码密文，
     服务端只能存/取，无法解密——密码即钥匙，换设备登录后前端自行解密解锁云端数据
   ============================================================ */

// 服务端密码哈希迭代数：Workers 免费计划 CPU 配额有限，150k 会超时（实测 500）；
// 10k 足够防在线暴力破解（离线破解可加盐防彩虹表）。前端恢复码保险箱不受此限制。
const PBKDF2_ITERATIONS = 10000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

/* ---------- 密码哈希 ---------- */
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const unb64 = text => Uint8Array.from(atob(text), ch => ch.charCodeAt(0));

async function hashPassword(password, saltBytes, iterations) {
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const iter = iterations || PBKDF2_ITERATIONS;
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']),
    256
  );
  return { salt, hash: new Uint8Array(bits) };
}

async function verifyPassword(password, stored) {
  try {
    const [algo, iter, saltB64, hashB64] = String(stored).split(':');
    if (algo !== 'pbkdf2' || !iter) return false;
    // 2026-08-22 审查：必须用哈希里存的迭代数验证（早期 150k，现 10k），否则存量账号全部验证失败
    const result = await hashPassword(password, unb64(saltB64), Number(iter));
    const expect = unb64(hashB64);
    if (result.hash.length !== expect.length) return false;
    let diff = 0;
    for (let i = 0; i < result.hash.length; i++) diff |= result.hash[i] ^ expect[i];
    return diff === 0;
  } catch (_) { return false; }
}

/* ---------- 随机 id / token ---------- */
const randomHex = bytes => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('');

/* ---------- 输入校验 ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const validate = body => {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const nickname = String(body.nickname || '').trim().slice(0, 20);
  if (!EMAIL_RE.test(email)) return { error: '邮箱格式不正确' };
  if (password.length < 8) return { error: '密码至少 8 位' };
  if (password.length > 128) return { error: '密码过长（最多 128 位）' };
  return { email, password, nickname };
};

/* ---------- 会话（2026-08-22 加固：库中只存 token 的 SHA-256 哈希） ---------- */
const SESSION_DAYS = 30;
function newSessionToken() { return randomHex(32); }
function sessionExpiry() { return Date.now() + SESSION_DAYS * 24 * 3600 * 1000; }

/** token -> SHA-256 hex（D1 泄露也不暴露可用会话令牌） */
async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token)));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

function bearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  return auth.replace(/^Bearer\s+/i, '');
}

/* ---------- 登录限流（2026-08-22 加固 → 08-22 IP 限流迁 D1） ----------
 * IP：D1 rate 表滚动窗口（10 分钟 30 次；2026-08-22 自 KV 迁出，与 syncRateLimit 同表）
 * 邮箱：D1 login_fails 表，连续失败 8 次锁 15 分钟（SQLite 强一致，
 *       连续失败请求打到不同边缘节点也能正确累计——KV 方案线上实测失效）
 */
const LOGIN_IP_MAX = 30, LOGIN_EMAIL_FAIL_MAX = 8, LOGIN_EMAIL_LOCK_MS = 15 * 60 * 1000;

async function loginIpCheck(env, request) {
  if (!env || !env.DB) return { ok: true };
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const now = Date.now();
    const windowMs = 600000;  // 10 分钟窗口
    const winStart = Math.floor(now / windowMs) * windowMs;
    const winEnd = winStart + windowMs;
    const ipKey = 'rate:login:ip:' + ip;
    const row = await env.DB.prepare(
      'INSERT INTO rate (key, count, until) VALUES (?1, 1, ?2) ' +
      'ON CONFLICT(key) DO UPDATE SET ' +
      'count = CASE WHEN rate.until <= ?3 THEN 1 ELSE rate.count + 1 END, ' +
      'until = CASE WHEN rate.until <= ?3 THEN ?4 ELSE rate.until END ' +
      'RETURNING count'
    ).bind(ipKey, winEnd, winStart, winEnd).first();
    if (row && row.count > LOGIN_IP_MAX) return { ok: false, error: '尝试过于频繁，请稍后再试' };
  } catch (_) { /* 限流器故障不阻断 */ }
  return { ok: true };
}

async function loginEmailCheck(db, email) {
  try {
    const row = await db.prepare('SELECT locked_until FROM login_fails WHERE email = ?').bind(email).first();
    if (row && row.locked_until > Date.now()) {
      return { ok: false, error: '登录尝试过多，请 15 分钟后再试' };
    }
  } catch (_) { /* 表不存在等故障不阻断 */ }
  return { ok: true };
}

async function recordLoginFail(db, email) {
  try {
    const now = Date.now();
    const row = await db.prepare('SELECT fail_count, locked_until FROM login_fails WHERE email = ?').bind(email).first();
    let count = 1, lockedUntil = 0;
    if (row) {
      // 仅当「曾锁定且已过期」才重新计数；locked_until=0（从未锁定）必须继续累计
      const expired = row.locked_until > 0 && row.locked_until < now;
      count = expired ? 1 : row.fail_count + 1;
      lockedUntil = row.locked_until;
    }
    if (count >= LOGIN_EMAIL_FAIL_MAX) lockedUntil = now + LOGIN_EMAIL_LOCK_MS;
    await db.prepare(
      'INSERT INTO login_fails (email, fail_count, locked_until, updated_at) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(email) DO UPDATE SET fail_count = excluded.fail_count, locked_until = excluded.locked_until, updated_at = excluded.updated_at'
    ).bind(email, count, lockedUntil, now).run();
  } catch (_) {}
}

async function recordLoginSuccess(db, email) {
  try { await db.prepare('DELETE FROM login_fails WHERE email = ?').bind(email).run(); } catch (_) {}
}

/* ---------- 认证处理（env.DB = D1） ---------- */
async function handleAuth(request, env, path) {
  const db = env.DB;
  if (!db) return json({ error: 'database not configured' }, 500);

  if (path === '/api/auth/register' && request.method === 'POST') return register(db, env, request);
  if (path === '/api/auth/login' && request.method === 'POST') return login(db, env, request);
  if (path === '/api/auth/logout' && request.method === 'POST') return logout(db, request);
  if (path === '/api/auth/me' && request.method === 'GET') return me(db, request);
  if (path === '/api/auth/recovery' && request.method === 'POST') return setRecovery(db, request);
  return json({ error: 'method not allowed' }, 405);
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function register(db, env, request) {
  const body = await readJson(request);
  if (!body) return json({ error: 'invalid json' }, 400);
  const v = validate(body);
  if (v.error) return json({ error: v.error }, 400);
  // 恢复码保险箱（可选）：{salt,iv,c} 均为 base64url 字符串
  const recovery = sanitizeRecovery(body.recovery);
  const id = randomHex(16);
  const now = Date.now();
  const { salt, hash } = await hashPassword(v.password);
  const passwordHash = `pbkdf2:${PBKDF2_ITERATIONS}:${b64(salt)}:${b64(hash)}`;
  const token = newSessionToken();
  const tokenHash = await hashToken(token);
  try {
    // 用户 + 会话同一批次原子写入：任一失败整体回滚（不会出现"用户建了但会话没建"）
    await db.batch([
      db.prepare('INSERT INTO users (id, email, password_hash, nickname, recovery_encrypted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, v.email, passwordHash, v.nickname, recovery, now, now),
      db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .bind(tokenHash, id, now, sessionExpiry()),
    ]);
  } catch (error) {
    const message = String(error && error.message || '');
    if (/UNIQUE|unique/i.test(message)) return json({ error: '该邮箱已注册，请直接登录' }, 409);
    console.error('register db error:', error);
    return json({ error: 'internal error' }, 500);
  }
  return json({ ok: true, token, user: { id, email: v.email, nickname: v.nickname } }, 201);
}

async function login(db, env, request) {
  const body = await readJson(request);
  if (!body) return json({ error: 'invalid json' }, 400);
  const v = validate(body);
  if (v.error) return json({ error: v.error }, 400);
  const ipCheck = await loginIpCheck(env, request);
  if (!ipCheck.ok) return json({ error: ipCheck.error }, 429);
  const emailCheck = await loginEmailCheck(db, v.email);
  if (!emailCheck.ok) return json({ error: emailCheck.error }, 429);
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(v.email).first();
  if (!user || !(await verifyPassword(v.password, user.password_hash))) {
    await recordLoginFail(db, v.email);
    return json({ error: '邮箱或密码不正确' }, 401);
  }
  await recordLoginSuccess(db, v.email);
  // 懒清理过期会话（登录时顺带，避免 sessions 表无限增长）
  try { await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run(); } catch (_) {}
  const token = newSessionToken();
  const tokenHash = await hashToken(token);
  const now = Date.now();
  await db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, user.id, now, sessionExpiry()).run();
  // 返回恢复码保险箱密文（前端用密码派生密钥解密后写入本地恢复码）
  return json({
    ok: true, token,
    user: { id: user.id, email: user.email, nickname: user.nickname || '' },
    recovery: user.recovery_encrypted ? JSON.parse(user.recovery_encrypted) : null,
  });
}

async function logout(db, request) {
  const token = bearerToken(request);
  if (!token) return json({ error: 'unauthorized' }, 401);
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(await hashToken(token)).run();
  return json({ ok: true });
}

async function me(db, request) {
  const token = bearerToken(request);
  if (!token) return json({ error: 'unauthorized' }, 401);
  const row = await db.prepare(
    'SELECT s.token, u.id, u.email, u.nickname, u.recovery_encrypted FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?'
  ).bind(await hashToken(token), Date.now()).first();
  if (!row) return json({ error: 'unauthorized' }, 401);
  return json({
    ok: true,
    user: { id: row.id, email: row.email, nickname: row.nickname || '' },
    recovery: row.recovery_encrypted ? JSON.parse(row.recovery_encrypted) : null,
  });
}

async function setRecovery(db, request) {
  const token = bearerToken(request);
  if (!token) return json({ error: 'unauthorized' }, 401);
  const body = await readJson(request);
  if (!body) return json({ error: 'invalid json' }, 400);
  const recovery = sanitizeRecovery(body.recovery);
  if (!recovery) return json({ error: 'recovery invalid' }, 400);
  const session = await db.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?').bind(await hashToken(token), Date.now()).first();
  if (!session) return json({ error: 'unauthorized' }, 401);
  await db.prepare('UPDATE users SET recovery_encrypted = ?, updated_at = ? WHERE id = ?')
    .bind(recovery, Date.now(), session.user_id).run();
  return json({ ok: true });
}

/* 恢复码保险箱结构校验：{salt,iv,c} 全为 base64url 字符串，c 长度上限 8KB */
function sanitizeRecovery(value) {
  if (!value || typeof value !== 'object') return null;
  const { salt, iv, c } = value;
  if (typeof salt !== 'string' || typeof iv !== 'string' || typeof c !== 'string') return null;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(salt) || !/^[A-Za-z0-9_-]{8,128}$/.test(iv)) return null;
  if (c.length < 16 || c.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(c)) return null;
  return JSON.stringify({ salt, iv, c });
}

export { handleAuth, hashToken };
