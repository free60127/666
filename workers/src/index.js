/**
 * 外院知识分享站 · 云端 API（Cloudflare Worker）
 *
 * 路由：
 *   GET  /api/health         健康检查
 *   GET  /api/notice         读取公告（公开）
 *   POST /api/notice         更新公告（需 ADMIN_TOKEN）
 *   POST /api/feedback       提交错题/意见反馈（公开，限频）
 *   GET  /api/feedback       拉取反馈列表（分页/筛选，需 ADMIN_TOKEN）
 *   PATCH /api/feedback      标记反馈已处理/重新打开（需 ADMIN_TOKEN）
 *   GET  /proxy/*            站点反代加速（映射到 https://free60127.github.io/666/）
 */

const UPSTREAM = 'https://free60127.github.io/666';
import { handleAuth, hashToken } from './auth.js';
// CORS：只对站点白名单来源回显 Origin（其余不带 CORS 头，浏览器直接拦截；
// 未携带 Origin 的同源/非浏览器请求不受影响）
const ALLOWED_ORIGINS = new Set(['https://free60127.github.io', 'https://free60127.top']);
const corsFor = request => {
  const origin = (request && request.headers.get('Origin')) || '';
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',  // 白名单来源不同 → 缓存应区分（2026-08-22 审查）
  };
};

export default {
  async fetch(request, env) {
    const response = await route(request, env);
    const cors = corsFor(request);
    for (const [key, value] of Object.entries(cors)) {
      if (value) response.headers.set(key, value);
    }
    // 全部 API 响应禁止缓存（同步/认证/反馈/公告，2026-08-22 审查）
    if (new URL(request.url).pathname.startsWith('/api/')) {
      response.headers.set('Cache-Control', 'no-store');
    }
    return response;
  }
};

async function route(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // www 子域统一 301 跳转主域（保留路径与查询串，避免双域名内容/统计分裂）
    if (url.hostname === 'www.free60127.top') {
      const target = 'https://free60127.top' + url.pathname + url.search;
      return new Response(null, { status: 301, headers: { Location: target, 'Cache-Control': 'no-store' } });
    }

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    try {
      if (path === '/api/health') return json({ ok: true, time: Date.now(), name: 'waiyuan-study' });

      if (path === '/api/notice') {
        if (request.method === 'GET') {
          const raw = await env.STUDY_KV.get('notice');
          return json(raw ? JSON.parse(raw) : { text: '', updatedAt: null });
        }
        if (request.method === 'POST') return requireAdmin(request, env, () => handleSetNotice(request, env));
        if (request.method === 'DELETE') return requireAdmin(request, env, () => handleDeleteNotice(env));
        return methodNotAllowed();
      }

      if (path === '/api/feedback') {
        if (request.method === 'POST') return handleFeedback(request, env);
        if (request.method === 'GET') return requireAdmin(request, env, () => handleListFeedback(request, env));
        if (request.method === 'PATCH') return requireAdmin(request, env, () => handleFeedbackHandled(request, env));
        if (request.method === 'DELETE') return requireAdmin(request, env, () => handleDeleteFeedback(request, env));
        return methodNotAllowed();
      }

      if (path.startsWith('/api/auth')) {
        return handleAuth(request, env, path);
      }

      if (path === '/api/sync') {
        if (request.method === 'POST') return handleSyncUpload(request, env);
        if (request.method === 'GET') return handleSyncDownload(request, env);
        if (request.method === 'DELETE') return handleSyncDelete(request, env);
        return methodNotAllowed();
      }

      // 反代（主域直连或 /proxy/ 兼容路径）；api.free60127.top 只提供 API，不反代
      if (url.hostname !== 'api.free60127.top' && !path.startsWith('/api/')) {
        return handleProxy(request, path, path.startsWith('/proxy/') ? 'proxy' : 'root');
      }

      return json({ error: 'not found', path }, 404);
    } catch (err) {
      console.error('waiyuan-study route error:', err);  // 错误细节仅进 Worker 日志，不对外暴露
      return json({ error: 'internal error' }, 500);
    }
}

/* ---------- 工具 ---------- */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

const methodNotAllowed = () => json({ error: 'method not allowed' }, 405);

/** 管理操作鉴权：Authorization: Bearer <token>，token 由 env.ADMIN_TOKEN 提供 */
function requireAdmin(request, env, next) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return json({ error: 'unauthorized' }, 401);
  }
  return next();
}

/** 简单限频：同一 IP 30 秒内最多 5 次 POST */
const RATE_KEYS = new Map();
function rateLimit(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const windowStart = now - 30_000;
  const hits = (RATE_KEYS.get(ip) || []).filter(t => t > windowStart);
  if (hits.length >= 5) return false;
  hits.push(now);
  RATE_KEYS.set(ip, hits);
  return true;
}

/* ---------- 公告 ---------- */

async function handleSetNotice(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const text = String(body.text || '').trim().slice(0, 500);
  if (!text) return json({ error: 'text is required' }, 400);
  const record = { text, updatedAt: new Date().toISOString() };
  await env.STUDY_KV.put('notice', JSON.stringify(record));
  return json({ ok: true, notice: record });
}

async function handleDeleteNotice(env) {
  await env.STUDY_KV.delete('notice');
  return json({ ok: true });
}

/* ---------- 反馈 ---------- */

async function handleFeedback(request, env) {
  if (!rateLimit(request)) return json({ error: 'too many requests, try again later' }, 429);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const clean = str => String(str || '').trim().slice(0, 2000);
  const record = {
    page: clean(body.page),
    question: clean(body.question),
    answer: clean(body.answer),
    type: clean(body.type).slice(0, 20),
    note: clean(body.note),
    contact: clean(body.contact).slice(0, 200),
    ts: new Date().toISOString(),
    handled: false,
  };
  if (!record.page && !record.question && !record.note) return json({ error: 'empty feedback' }, 400);
  const key = `feedback:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await env.STUDY_KV.put(key, JSON.stringify(record));
  return json({ ok: true, id: key });
}

/* ---------- 反馈列表（2026-08-22 加固：cursor 分页 + 筛选）----------
   GET /api/feedback?cursor=&limit=&type=&since=&until=&handled=   （全部需 ADMIN_TOKEN）
     cursor   KV list 游标（第一页省略）
     limit    每页条数（默认 30，上限 100）
     type     按反馈类型精确筛选（如 错题/建议）
     since/until  ISO 时间戳筛选（ts >= since && ts <= until）
     handled  '0'=未处理 '1'=已处理，省略=全部 */
const FEEDBACK_PAGE_MAX = 100;

async function handleListFeedback(request, env) {
  const params = new URL(request.url).searchParams;
  const type = params.get('type') || '';
  const since = params.get('since') || '';
  const until = params.get('until') || '';
  const handled = params.get('handled');  // '0' | '1' | null
  const limit = Math.min(Math.max(Number(params.get('limit') || 30) | 0, 1), FEEDBACK_PAGE_MAX);
  let cursor = params.get('cursor') || undefined;

  const items = [];
  let pagesScanned = 0;
  while (items.length < limit && pagesScanned < 20) {
    const list = await env.STUDY_KV.list({ prefix: 'feedback:', limit: 100, cursor });
    cursor = list.cursor || undefined;
    for (const k of list.keys) {
      const raw = await env.STUDY_KV.get(k.name);
      if (!raw) continue;
      let record;
      try { record = JSON.parse(raw); } catch { continue; }
      if (type && record.type !== type) continue;
      if (since && record.ts < since) continue;
      if (until && record.ts > until) continue;
      if (handled !== null && String(!!record.handled) !== handled) continue;
      items.push({ key: k.name, ...record });
      if (items.length >= limit) break;
    }
    if (!cursor) break;
    pagesScanned++;
  }
  items.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return json({ ok: true, count: items.length, cursor: cursor || null, hasMore: !!cursor, items });
}

/* 标记反馈已处理/重新打开：PATCH /api/feedback?key=feedback:xxx&handled=1|0（需 ADMIN_TOKEN） */
async function handleFeedbackHandled(request, env) {
  const params = new URL(request.url).searchParams;
  const key = params.get('key') || '';
  const handled = params.get('handled');
  if (!key || !key.startsWith('feedback:')) return json({ error: 'key required (feedback:...)' }, 400);
  if (handled !== '1' && handled !== '0') return json({ error: 'handled must be 1 or 0' }, 400);
  const raw = await env.STUDY_KV.get(key);
  if (!raw) return json({ error: 'not found' }, 404);
  const record = JSON.parse(raw);
  record.handled = handled === '1';
  await env.STUDY_KV.put(key, JSON.stringify(record));
  return json({ ok: true, key, handled: record.handled });
}

/* ---------- 删除反馈（需 ADMIN_TOKEN）----------
   DELETE /api/feedback?key=feedback:xxx  只允许删 feedback: 前缀键 */

async function handleDeleteFeedback(request, env) {
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!key || !key.startsWith('feedback:')) return json({ error: 'key required (feedback:...)' }, 400);
  await env.STUDY_KV.delete(key);
  return json({ ok: true, deleted: key });
}

/* ---------- 进度同步（2026-08-22 加固）----------
   匿名模式（访客）：恢复码 → deviceId=sha256 hex(64)，deviceId 即钥匙
   账号模式（登录用户）：Authorization: Bearer <session token>，数据键 user:{id}，
     与匿名数据完全隔离；登录后前端自动把旧匿名数据迁移到账号（cloud-sync.js migrateAnonymous）
   保护：deviceId 必须 64 位十六进制；每键每分钟限流（上传 10/下载 30/删除 6）；
     Content-Length 预检 + 字符串化二次校验（payload ≤ 2.5MB）；写入带 2 年 TTL；
     响应 Cache-Control: no-store（fetch 外层统一加）
   POST   /api/sync              {deviceId?, payload}   上传
   GET    /api/sync?deviceId=x   下载（不存在返回 404）
   DELETE /api/sync?deviceId=x   删除 */

const MAX_SYNC_BYTES = 2_500_000;
const SYNC_TTL_SECONDS = 730 * 24 * 3600;  // 2 年未备份自动过期
const DEVICE_ID_RE = /^[0-9a-f]{64}$/;
const SYNC_RATE = { upload: 10, download: 30, delete: 6 };  // 每分钟每键

/** KV 计数器限流（按分钟窗口，TTL 120s 自动清理） */
async function syncRateLimit(env, key, action) {
  try {
    const minute = Math.floor(Date.now() / 60000);
    const rk = 'rate:sync:' + action + ':' + key + ':' + minute;
    const count = Number(await env.STUDY_KV.get(rk)) || 0;
    if (count >= SYNC_RATE[action]) return false;
    await env.STUDY_KV.put(rk, String(count + 1), { expirationTtl: 120 });
  } catch (_) { /* 限流器故障不阻断主流程 */ }
  return true;
}

/** 解析请求身份：带有效 Bearer → 账号模式 {key:'user:{id}'}；否则匿名（由调用方取 deviceId） */
async function resolveSyncIdentity(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return { key: null };
  if (!env.DB) return { error: 'database not configured' };
  const session = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?')
    .bind(await hashToken(token), Date.now()).first();
  if (!session) return { error: 'unauthorized' };
  return { key: 'user:' + session.user_id };
}

async function handleSyncUpload(request, env) {
  // 请求体大小预检（Content-Length 不可信时由字符串化二次校验兜底）
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_SYNC_BYTES + 2048) return json({ error: 'payload too large (max 2.5MB)' }, 413);
  const identity = await resolveSyncIdentity(request, env);
  if (identity.error) return json({ error: identity.error }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }
  let key;
  if (identity.key) {
    key = identity.key;
  } else {
    const deviceId = String(body.deviceId || '').trim();
    if (!DEVICE_ID_RE.test(deviceId)) return json({ error: 'deviceId must be 64 hex chars' }, 400);
    key = deviceId;
  }
  if (!(await syncRateLimit(env, key, 'upload'))) return json({ error: 'too many requests, try again later' }, 429);
  const payload = JSON.stringify(body.payload ?? null);
  if (payload.length > MAX_SYNC_BYTES) return json({ error: 'payload too large (max 2.5MB)' }, 413);
  // 版本号 + 冲突检测（2026-08-22）：客户端带 baseRev 上传，服务端校验等于当前 rev 才写入，
  // 否则 409 并返回云端最新数据，前端自动合并后重试——任何上传都不覆盖他人/他设备的更新
  const current = await env.STUDY_KV.get('sync:' + key);
  const curRev = current ? (Number(JSON.parse(current).rev) || 0) : 0;  // 注意不能用 |0（会截断 64 位毫秒时间戳）
  const baseRev = body.baseRev;
  if (baseRev !== undefined && Number(baseRev) !== curRev) {
    let latestPayload = null, latestUpdatedAt = null;
    if (current) {
      const parsed = JSON.parse(current);
      latestPayload = parsed.data;
      latestUpdatedAt = parsed.updatedAt;
    }
    return json({ error: 'conflict', rev: curRev, payload: latestPayload, updatedAt: latestUpdatedAt }, 409);
  }
  const record = { data: JSON.parse(payload), updatedAt: new Date().toISOString(), rev: Date.now() };
  await env.STUDY_KV.put('sync:' + key, JSON.stringify(record), { expirationTtl: SYNC_TTL_SECONDS });
  return json({ ok: true, size: payload.length, updatedAt: record.updatedAt, rev: record.rev });
}

async function handleSyncDownload(request, env) {
  const identity = await resolveSyncIdentity(request, env);
  if (identity.error) return json({ error: identity.error }, 401);
  const deviceId = new URL(request.url).searchParams.get('deviceId') || '';
  const key = identity.key || deviceId;
  if (!key) return json({ error: 'deviceId required (64 hex chars)' }, 400);
  if (!identity.key && !DEVICE_ID_RE.test(key)) return json({ error: 'deviceId must be 64 hex chars' }, 400);
  if (!(await syncRateLimit(env, key, 'download'))) return json({ error: 'too many requests, try again later' }, 429);
  const raw = await env.STUDY_KV.get('sync:' + key);
  if (!raw) return json({ error: 'not found' }, 404);
  const record = JSON.parse(raw);
  // 旧格式记录无 rev 字段 → 视为 0（前端据此做首次合并）
  return json({ ok: true, payload: record.data, updatedAt: record.updatedAt, rev: Number(record.rev) || 0 });
}

async function handleSyncDelete(request, env) {
  const identity = await resolveSyncIdentity(request, env);
  if (identity.error) return json({ error: identity.error }, 401);
  const deviceId = new URL(request.url).searchParams.get('deviceId') || '';
  const key = identity.key || deviceId;
  if (!key) return json({ error: 'deviceId required (64 hex chars)' }, 400);
  if (!identity.key && !DEVICE_ID_RE.test(key)) return json({ error: 'deviceId must be 64 hex chars' }, 400);
  if (!(await syncRateLimit(env, key, 'delete'))) return json({ error: 'too many requests, try again later' }, 429);
  await env.STUDY_KV.delete('sync:' + key);
  return json({ ok: true });
}

/* ---------- 反代加速 ----------
   mode 'root'：主域直连（https://free60127.top/xxx -> UPSTREAM/xxx，HTML 去 /666/ 前缀）
   mode 'proxy'：兼容路径（/proxy/xxx -> UPSTREAM/xxx，HTML 一律改 /proxy/ 前缀） */

async function handleProxy(request, path, mode) {
  // 反代只允许读取类方法，避免经代理转发任意请求；敏感头一律不转发
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('method not allowed', { status: 405 });
  }
  const prefix = mode === 'root' ? '/' : '/proxy/';
  const rest = path.startsWith(prefix) ? path.slice(prefix.length).replace(/^\/+/, '') : '';
  const url = new URL(request.url);
  const target = `${UPSTREAM}/${rest}${url.search}`;
  const upstream = await fetch(target, {
    method: request.method,
    headers: filterHeaders(request.headers),
    redirect: 'manual',
  });
  const headers = new Headers(upstream.headers);
  headers.delete('content-security-policy');
  // 资源引用重写
  const type = (headers.get('content-type') || '');
  let body = upstream.body;
  if (type.includes('text/html')) {
    let html = await upstream.text();
    if (mode === 'root') {
      // 主域直连：/666/x -> /x；OG 分享地址改主域；其余根绝对/相对路径保持（自然走本域）
      html = html
        .replace(/(href|src)="\/666\//g, `$1="/`)
        .replace(/https:\/\/free60127\.github\.io\/666\//g, 'https://free60127.top/');
    } else {
      html = html
        .replace(/(href|src)="\/666\//g, `$1="/proxy/`)
        .replace(/(href|src)="\/(?!\/)/g, `$1="/proxy/`)
        .replace(/(href|src)="(?!https?:|\/\/|#|data:)/g, `$1="/proxy/`);
    }
    body = html;
    // body 已重写，原响应长度/编码/缓存标签全部失效，必须移除
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.delete('etag');
    headers.delete('last-modified');
    headers.set('cache-control', 'no-cache');
  }
  headers.set('access-control-allow-origin', '*');
  return new Response(body, { status: upstream.status, headers });
}

function filterHeaders(headers) {
  const out = new Headers();
  const blocked = new Set(['host', 'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip', 'authorization', 'proxy-authorization', 'cookie', 'set-cookie']);
  for (const [k, v] of headers) {
    if (blocked.has(k.toLowerCase())) continue;
    out.set(k, v);
  }
  out.set('x-forwarded-host', 'free60127.github.io');
  return out;
}
