import { sendEmail, generateResetCode } from './smtp.js';

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
  if (path === '/api/auth/change-password' && request.method === 'POST') return changePassword(db, request);
  if (path === '/api/auth/delete-account' && request.method === 'POST') return deleteAccount(db, env, request);
  if (path === '/api/auth/forgot' && request.method === 'POST') return forgot(db, env, request);
  if (path === '/api/auth/reset-password' && request.method === 'POST') return resetPassword(db, request);
  if (path === '/api/auth/admin-reset-code' && request.method === 'POST') return adminResetCode(db, env, request);
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

/* ============================================================
   账号自助管理：修改密码 / 注销账号 / 找回密码（重置码 + SMTP）
   ============================================================ */
const RESET_TTL_MS = 15 * 60 * 1000; // 重置码 15 分钟有效
const RESET_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const RESET_EMAIL_ATTEMPT_MAX = 8;
const RESET_IP_ATTEMPT_MAX = 20;

const sha256Hex = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
};

const normalizeEmail = (body) => String((body && body.email) || '').trim().toLowerCase();

const passwordError = (password) => {
  if (!password || password.length < 8) return '密码至少 8 位';
  if (password.length > 128) return '密码过长（最多 128 位）';
  return null;
};

async function bumpResetAttempts(db, key, now) {
  const winStart = Math.floor(now / RESET_ATTEMPT_WINDOW_MS) * RESET_ATTEMPT_WINDOW_MS;
  const winEnd = winStart + RESET_ATTEMPT_WINDOW_MS;
  try {
    const row = await db.prepare(
      'INSERT INTO rate (key, count, until) VALUES (?1, 1, ?2) ' +
      'ON CONFLICT(key) DO UPDATE SET ' +
      'count = CASE WHEN rate.until <= ?3 THEN 1 ELSE rate.count + 1 END, ' +
      'until = CASE WHEN rate.until <= ?3 THEN ?4 ELSE rate.until END ' +
      'RETURNING count'
    ).bind(key, winEnd, winStart, winEnd).first();
    return Number(row && row.count) || 0;
  } catch (_) {
    // 限流表故障时不阻断密码重置，但仍保留验证码本身的单次消费保护。
    return 0;
  }
}

async function resetAttemptCheck(db, request, email) {
  const ip = (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown')
    .split(',')[0].trim().slice(0, 128) || 'unknown';
  const now = Date.now();
  // D1 写入串行化，避免同一请求同时更新两个 rate 行时产生不必要的锁竞争。
  const emailCount = await bumpResetAttempts(db, 'auth:reset:email:' + email, now);
  const ipCount = await bumpResetAttempts(db, 'auth:reset:ip:' + ip, now);
  return {
    emailCount,
    ipCount,
    blocked: emailCount > RESET_EMAIL_ATTEMPT_MAX || ipCount > RESET_IP_ATTEMPT_MAX,
  };
}

async function sessionUser(db, request) {
  const token = bearerToken(request);
  if (!token) return null;
  return db.prepare(
    'SELECT u.id, u.email, u.nickname, u.password_hash, u.recovery_encrypted FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?'
  ).bind(await hashToken(token), Date.now()).first();
}

/* 修改密码：校验旧密码 → 新密码哈希；可选原子更新恢复码保险箱（body.recovery）；其他设备会话全部失效 */
async function changePassword(db, request) {
  const user = await sessionUser(db, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const body = await readJson(request);
  if (!body) return json({ error: 'invalid json' }, 400);
  const err = passwordError(body.newPassword);
  if (err) return json({ error: err }, 400);
  if (!(await verifyPassword(body.oldPassword, user.password_hash))) return json({ error: '旧密码不正确' }, 401);
  const { salt, hash } = await hashPassword(body.newPassword);
  const passwordHash = 'pbkdf2:' + PBKDF2_ITERATIONS + ':' + b64(salt) + ':' + b64(hash);
  const now = Date.now();
  const tokenHash = await hashToken(bearerToken(request));
  const stmts = [
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(passwordHash, now, user.id),
  ];
  if (body.recovery !== undefined) {
    const rec = sanitizeRecovery(body.recovery);
    if (!rec) return json({ error: 'recovery invalid' }, 400);
    stmts.push(db.prepare('UPDATE users SET recovery_encrypted = ? WHERE id = ?').bind(rec, user.id));
  }
  stmts.push(db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').bind(user.id, tokenHash));
  try {
    await db.batch(stmts);
  } catch (error) {
    console.error('change-password db error:', error);
    return json({ error: 'internal error' }, 500);
  }
  return json({ ok: true });
}

/* 注销账号：密码确认 → D1 原子删除账号相关数据；KV 删除失败交给 Cron 重试 */
async function deleteAccount(db, env, request) {
  const user = await sessionUser(db, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const body = await readJson(request);
  if (!body) return json({ error: 'invalid json' }, 400);
  if (!(await verifyPassword(body.password, user.password_hash))) return json({ error: '密码不正确' }, 401);
  const now = Date.now();
  const kvKey = 'sync:user:' + user.id;
  try {
    const cleanupStatements = [
      db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
      db.prepare('DELETE FROM reset_tokens WHERE email = ?').bind(user.email),
      db.prepare('DELETE FROM login_fails WHERE email = ?').bind(user.email),
      db.prepare('DELETE FROM rate WHERE key IN (?, ?)')
        .bind('auth:forgot:' + user.email, 'auth:reset:email:' + user.email),
      db.prepare('DELETE FROM activity WHERE act_key = ?').bind('user:' + user.id),
      // 活跃数据删除后，聚合排行榜缓存必须失效，避免继续展示已注销账号。
      db.prepare('DELETE FROM rank_cache'),
    ];
    if (env.STUDY_KV) {
      cleanupStatements.push(
        db.prepare(
          'INSERT OR IGNORE INTO cleanup_jobs (user_id, kv_key, attempts, next_attempt_at, created_at, last_error) ' +
          'VALUES (?, ?, 0, ?, ?, NULL)'
        ).bind(user.id, kvKey, now, now),
      );
    }
    cleanupStatements.push(db.prepare('DELETE FROM users WHERE id = ?').bind(user.id));
    await db.batch(cleanupStatements);
  } catch (error) {
    console.error('delete-account db error:', error);
    return json({ error: 'internal error' }, 500);
  }
  let cleanupPending = Boolean(env.STUDY_KV);
  if (env.STUDY_KV) {
    try {
      await env.STUDY_KV.delete(kvKey);
      await db.prepare('DELETE FROM cleanup_jobs WHERE kv_key = ?').bind(kvKey).run();
      cleanupPending = false;
    } catch (error) {
      console.error('delete-account KV cleanup pending:', error);
    }
  }
  return json({ ok: true, cleanupPending });
}

/* 找回密码第 1 步：向注册邮箱发 8 位数字重置码（SMTP）。用户不存在也返回 ok（防邮箱枚举） */
async function forgot(db, env, request) {
  const body = await readJson(request);
  if (!body) return json({ error: 'invalid json' }, 400);
  const email = normalizeEmail(body);
  if (!EMAIL_RE.test(email)) return json({ error: '邮箱格式不正确' }, 400);
  const now = Date.now();
  const rl = await db.prepare(
    'INSERT INTO rate (key, count, until) VALUES (?1, 1, ?2) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN rate.until <= ?3 THEN 1 ELSE rate.count + 1 END, until = CASE WHEN rate.until <= ?3 THEN ?4 ELSE rate.until END RETURNING count'
  ).bind('auth:forgot:' + email, now + 60000, now, now + 60000).first().catch(() => null);
  if (rl && rl.count > 1) return json({ error: '发送太频繁，请 1 分钟后再试' }, 429);
  const user = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (!user) return json({ ok: true });
  const code = generateResetCode();
  const sent = await sendEmail(env, {
    to: email,
    subject: '外院知识分享站 - 密码重置验证码',
    text: '你的密码重置验证码是：' + code + '\n\n15 分钟内有效。\n\n注意：重置密码后，用旧密码加密的云端数据将无法自动解锁；请先在旧设备备份导出，或保存好原恢复码。',
  });
  if (!sent.ok) {
    console.error('forgot smtp error:', sent.error);
    return json({ error: '邮件发送失败，请稍后重试或联系管理员' }, 503);
  }
  await db.prepare('INSERT OR REPLACE INTO reset_tokens (email, code_hash, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)')
    .bind(email, await sha256Hex(code), now + RESET_TTL_MS, now).run();
  return json({ ok: true });
}

/* 找回密码第 2 步：校验重置码 → 设置新密码；body.recovery 可选（新密码加密的旧恢复码保险箱），缺省清空保险箱 */
async function resetPassword(db, request) {
  const body = await readJson(request);
  if (!body) return json({ error: 'invalid json' }, 400);
  const email = normalizeEmail(body);
  const code = String(body.code || '').trim();
  const err = passwordError(body.newPassword);
  if (err) return json({ error: err }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: '邮箱格式不正确' }, 400);
  const attempt = await resetAttemptCheck(db, request, email);
  if (attempt.blocked) return json({ error: '验证码尝试次数过多，请重新申请验证码' }, 429);
  if (!/^[0-9]{8}$/.test(code)) {
    if (attempt.emailCount >= RESET_EMAIL_ATTEMPT_MAX || attempt.ipCount >= RESET_IP_ATTEMPT_MAX) {
      await db.prepare('UPDATE reset_tokens SET used = 1 WHERE email = ? AND used = 0').bind(email).run().catch(() => {});
      return json({ error: '验证码错误次数过多，请重新申请验证码' }, 429);
    }
    return json({ error: '验证码格式不正确' }, 400);
  }
  const now = Date.now();
  const codeHash = await sha256Hex(code);
  const row = await db.prepare('SELECT * FROM reset_tokens WHERE email = ?').bind(email).first();
  const validCode = row && !row.used && row.expires_at > now && row.code_hash === codeHash;
  if (!validCode) {
    if (attempt.emailCount >= RESET_EMAIL_ATTEMPT_MAX || attempt.ipCount >= RESET_IP_ATTEMPT_MAX) {
      await db.prepare('UPDATE reset_tokens SET used = 1 WHERE email = ? AND used = 0').bind(email).run().catch(() => {});
      return json({ error: '验证码错误次数过多，请重新申请验证码' }, 429);
    }
    return json({ error: '验证码错误或已过期' }, 400);
  }
  const user = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (!user) return json({ error: '用户不存在' }, 400);
  if (body.recovery !== undefined && body.recovery !== null && !sanitizeRecovery(body.recovery)) {
    return json({ error: 'recovery invalid' }, 400);
  }
  const { salt, hash } = await hashPassword(body.newPassword);
  const passwordHash = 'pbkdf2:' + PBKDF2_ITERATIONS + ':' + b64(salt) + ':' + b64(hash);
  const recovery = body.recovery == null ? null : sanitizeRecovery(body.recovery);
  try {
    const results = await db.batch([
      // 先在同一事务中用「未消费且未过期」的验证码保护用户更新；
      // 并发请求中只有第一个事务能看到 used=0，后续请求不会再次改密码。
      db.prepare(
        'UPDATE users SET password_hash = ?, recovery_encrypted = ?, updated_at = ? WHERE id = ? ' +
        'AND EXISTS (SELECT 1 FROM reset_tokens WHERE email = ? AND code_hash = ? AND used = 0 AND expires_at > ?)'
      ).bind(passwordHash, recovery, now, user.id, email, codeHash, now),
      db.prepare(
        'DELETE FROM sessions WHERE user_id = ? ' +
        'AND EXISTS (SELECT 1 FROM reset_tokens WHERE email = ? AND code_hash = ? AND used = 0 AND expires_at > ?)'
      ).bind(user.id, email, codeHash, now),
      db.prepare(
        'UPDATE reset_tokens SET used = 1 WHERE email = ? AND code_hash = ? AND used = 0 AND expires_at > ? ' +
        'AND EXISTS (SELECT 1 FROM users WHERE id = ?)'
      ).bind(email, codeHash, now, user.id),
    ]);
    if (!results || !results[0] || Number(results[0].meta && results[0].meta.changes) !== 1) {
      return json({ error: '验证码错误或已过期' }, 400);
    }
  } catch (error) {
    console.error('reset-password db error:', error);
    return json({ error: 'internal error' }, 500);
  }
  return json({ ok: true, recoveryReset: recovery === null });
}

/* 管理端兜底：管理员生成一次性重置码（明文返回，线下转交用户）。Bearer = ADMIN_TOKEN */
async function adminResetCode(db, env, request) {
  const token = bearerToken(request);
  if (!token || token !== env.ADMIN_TOKEN) return json({ error: 'unauthorized' }, 401);
  const body = await readJson(request);
  if (!body) return json({ error: 'invalid json' }, 400);
  const email = normalizeEmail(body);
  if (!EMAIL_RE.test(email)) return json({ error: '邮箱格式不正确' }, 400);
  const code = generateResetCode();
  const now = Date.now();
  await db.prepare('INSERT OR REPLACE INTO reset_tokens (email, code_hash, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)')
    .bind(email, await sha256Hex(code), now + RESET_TTL_MS, now).run();
  return json({ ok: true, code: code, expiresInSeconds: RESET_TTL_MS / 1000 });
}
export { handleAuth, hashToken };
