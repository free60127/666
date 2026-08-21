/**
 * 外院知识分享站 · 云端 API（Cloudflare Worker）
 *
 * 路由：
 *   GET  /api/health         健康检查
 *   GET  /api/notice         读取公告（公开）
 *   POST /api/notice         更新公告（需 ADMIN_TOKEN）
 *   POST /api/feedback       提交错题/意见反馈（公开，限频）
 *   GET  /api/feedback       拉取反馈列表（需 ADMIN_TOKEN）
 *   GET  /proxy/*            站点反代加速（映射到 https://free60127.github.io/666/）
 */

const UPSTREAM = 'https://free60127.github.io/666';
// CORS：只对站点白名单来源回显 Origin（其余不带 CORS 头，浏览器直接拦截；
// 未携带 Origin 的同源/非浏览器请求不受影响）
const ALLOWED_ORIGINS = new Set(['https://free60127.github.io']);
const corsFor = request => {
  const origin = (request && request.headers.get('Origin')) || '';
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
};

export default {
  async fetch(request, env) {
    const response = await route(request, env);
    const cors = corsFor(request);
    for (const [key, value] of Object.entries(cors)) {
      if (value) response.headers.set(key, value);
    }
    return response;
  }
};

async function route(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

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
        return methodNotAllowed();
      }

      if (path === '/api/feedback') {
        if (request.method === 'POST') return handleFeedback(request, env);
        if (request.method === 'GET') return requireAdmin(request, env, () => handleListFeedback(request, env));
        return methodNotAllowed();
      }

      if (path === '/api/sync') {
        if (request.method === 'POST') return handleSyncUpload(request, env);
        if (request.method === 'GET') return handleSyncDownload(request, env);
        if (request.method === 'DELETE') return handleSyncDelete(request, env);
        return methodNotAllowed();
      }

      if (path.startsWith('/proxy/')) return handleProxy(request, path);

      return json({ error: 'not found', path }, 404);
    } catch (err) {
      return json({ error: 'internal error', detail: String(err && err.message || err) }, 500);
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
    note: clean(body.note),
    contact: clean(body.contact).slice(0, 200),
    ts: new Date().toISOString(),
  };
  if (!record.page && !record.question && !record.note) return json({ error: 'empty feedback' }, 400);
  const key = `feedback:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await env.STUDY_KV.put(key, JSON.stringify(record));
  return json({ ok: true, id: key });
}

async function handleListFeedback(request, env) {
  const list = await env.STUDY_KV.list({ prefix: 'feedback:', limit: 200 });
  const items = [];
  for (const k of list.keys) {
    const raw = await env.STUDY_KV.get(k.name);
    if (raw) items.push({ key: k.name, ...JSON.parse(raw) });
  }
  items.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return json({ ok: true, count: items.length, items });
}

/* ---------- 进度同步（匿名设备 ID 即钥匙）----------
   POST /api/sync   {deviceId, payload}  上传（payload ≤ 1MB）
   GET  /api/sync?deviceId=x             下载（不存在返回 404）
   DELETE /api/sync?deviceId=x           删除 */

const MAX_SYNC_BYTES = 1_000_000;

async function handleSyncUpload(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const deviceId = String(body.deviceId || '').trim();
  if (!deviceId || deviceId.length > 64) return json({ error: 'deviceId required (<=64 chars)' }, 400);
  const payload = JSON.stringify(body.payload ?? null);
  if (payload.length > MAX_SYNC_BYTES) return json({ error: 'payload too large (max 1MB)' }, 413);
  const record = { data: JSON.parse(payload), updatedAt: new Date().toISOString() };
  await env.STUDY_KV.put(`sync:${deviceId}`, JSON.stringify(record));
  return json({ ok: true, size: payload.length, updatedAt: record.updatedAt });
}

async function handleSyncDownload(request, env) {
  const deviceId = new URL(request.url).searchParams.get('deviceId') || '';
  if (!deviceId) return json({ error: 'deviceId required' }, 400);
  const raw = await env.STUDY_KV.get(`sync:${deviceId}`);
  if (!raw) return json({ error: 'not found' }, 404);
  const record = JSON.parse(raw);
  return json({ ok: true, payload: record.data, updatedAt: record.updatedAt });
}

async function handleSyncDelete(request, env) {
  const deviceId = new URL(request.url).searchParams.get('deviceId') || '';
  if (!deviceId) return json({ error: 'deviceId required' }, 400);
  await env.STUDY_KV.delete(`sync:${deviceId}`);
  return json({ ok: true });
}

/* ---------- 反代加速 ---------- */

async function handleProxy(request, path) {
  // /proxy/xxx -> https://free60127.github.io/666/xxx
  const rest = path.slice('/proxy/'.length).replace(/^\/+/, '');
  const target = `${UPSTREAM}/${rest}${request.url.includes('?') ? '?' + new URL(request.url).searchParams.toString() : ''}`;
  const upstream = await fetch(target, {
    method: request.method,
    headers: filterHeaders(request.headers),
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  });
  const headers = new Headers(upstream.headers);
  headers.delete('content-security-policy');
  // 资源引用重写：站内相对路径一律走反代域
  const type = (headers.get('content-type') || '');
  let body = upstream.body;
  if (type.includes('text/html')) {
    body = (await upstream.text())
      .replace(/(href|src)="\/666\//g, `$1="/proxy/`)   // 站点绝对路径 /666/x -> 反代 /proxy/x
      .replace(/(href|src)="\/(?!\/)/g, `$1="/proxy/`)   // 其他根绝对路径 -> /proxy/x
      .replace(/(href|src)="(?!https?:|\/\/|#|data:)/g, `$1="/proxy/`); // 相对路径 -> /proxy/x
  }
  headers.set('access-control-allow-origin', '*');
  return new Response(body, { status: upstream.status, headers });
}

function filterHeaders(headers) {
  const out = new Headers();
  for (const [k, v] of headers) {
    if (['host', 'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip'].includes(k.toLowerCase())) continue;
    out.set(k, v);
  }
  out.set('x-forwarded-host', 'free60127.github.io');
  return out;
}
