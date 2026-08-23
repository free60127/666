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
import { handleErrand } from './errand.js';
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
  async fetch(request, env, ctx) {
    const response = await route(request, env, ctx);
    const cors = corsFor(request);
    for (const [key, value] of Object.entries(cors)) {
      if (value) response.headers.set(key, value);
    }
    // 全部 API 响应禁止缓存（同步/认证/反馈/公告，2026-08-22 审查）
    if (new URL(request.url).pathname.startsWith('/api/')) {
      response.headers.set('Cache-Control', 'no-store');
    }
    return response;
  },
  /* 每日清理 D1 滚动数据（2026-08-22 审查 P1）：Cron UTC 02:30（北京 10:30） */
  async scheduled(_event, env) {
    return cleanupDb(env);
  }
};

/** 托管 APK 下载：https://free60127.top/apk/<name>（KV 存储，键 apk:<name>；未来可平滑切换 R2） */
async function serveApk(request, env, path) {
  const name = path.slice('/apk/'.length).replace(/^\/+/, '');
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(name)) return json({ error: 'not found' }, 404);
  if (!env.STUDY_KV) return json({ error: 'not configured' }, 503);
  const data = await env.STUDY_KV.get('apk:' + name, { type: 'arrayBuffer' }).catch(() => null);
  if (!data) return json({ error: 'not found' }, 404);
  const headers = new Headers();
  headers.set('Content-Type', 'application/vnd.android.package-archive');
  headers.set('Content-Disposition', 'attachment; filename="' + name + '"');
  headers.set('Cache-Control', 'public, max-age=3600');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Content-Length', String(data.byteLength));
  return new Response(data, { headers });
}
async function route(request, env, ctx) {
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

      if (path === '/api/auth/account' && request.method === 'DELETE') {
        return requireAdmin(request, env, () => handleDeleteAccount(request, env));
      }

      if (path.startsWith('/api/auth')) {
        return handleAuth(request, env, path);
      }

      if (path === '/api/stats') {
        if (request.method === 'GET') return requireAdmin(request, env, () => handleStats(env));
        return methodNotAllowed();
      }

      if (path === '/api/activity') {
        if (request.method === 'POST') return handleActivity(request, env);
        if (request.method === 'DELETE') return requireAdmin(request, env, () => handleDeleteActivity(request, env));
        return methodNotAllowed();
      }

      if (path === '/api/visit') {
        if (request.method === 'POST') return handleVisit(request, env);
        return methodNotAllowed();
      }

      if (path === '/api/rank') {
        if (request.method === 'GET') return requireAdmin(request, env, () => handleRank(request, env));
        return methodNotAllowed();
      }

      if (path === '/api/sync') {
        if (request.method === 'POST') return handleSyncUpload(request, env);
        if (request.method === 'GET') return handleSyncDownload(request, env);
        if (request.method === 'DELETE') return handleSyncDelete(request, env);
        return methodNotAllowed();
      }

      // 跑腿平台（2026-08-22）：/api/errand/* 全部交给 errand.js 分发
      if (path.startsWith('/api/errand')) {
        return handleErrand(request, env, path);
      }

      // 反代（主域直连或 /proxy/ 兼容路径）；api.free60127.top 只提供 API，不反代
      // APK 下载（R2 托管，国内可直连）：/apk/waiyuan-share.apk | /apk/waiyuan-paotui.apk
      if (path.startsWith('/apk/')) return serveApk(request, env, path);

      if (url.hostname !== 'api.free60127.top' && !path.startsWith('/api/')) {
        return handleProxy(request, env, path, path.startsWith('/proxy/') ? 'proxy' : 'root', ctx);
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

/* ---------- 站点统计（2026-08-22 → 08-22 迁 D1）：反代 HTML 页面时计数 PV/UV ----------
 * 覆盖：free60127.top 主域直连 + /proxy/ 兼容路径（即所有经本 Worker 的页面访问）；
 *      直接访问 github.io 源站不经 Worker，不计入（README 已注明）。
 * 存储（D1 stats / uv_seen 表，键名与旧 KV 一致便于迁移；2026-08-22 自 KV 迁出——
 *      KV 免费每日写/删/列仅 1000 次，统计高频写触顶 429；D1 免费 10 万写/日）：
 *   stats:key = stats:pv:total | stats:pv:day:{YYYY-MM-DD} | stats:page:{path} | stats:uv:day:{date}
 *   uv_seen(day, vid) 当日访客去重（替代 KV TTL 键）
 * 日期用 UTC+8 自然日（中国用户）。计数失败静默，绝不影响页面响应。 */
const STATS_COOKIE = 'waiyuan_vid';
const todayCn = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
const randomHex16 = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');

/** D1 原子自增（stats 表）：INSERT ... ON CONFLICT ... RETURNING 单语句原子 */
async function d1Incr(db, key) {
  const row = await db.prepare(
    'INSERT INTO stats (key, value) VALUES (?1, 1) ON CONFLICT(key) DO UPDATE SET value = stats.value + 1 RETURNING value'
  ).bind(key).first();
  return (row && row.value) || 1;
}

/** PV/UV 通用计数（主域后端统计与 GitHub 直连前端上报共用同一套键；2026-08-22 迁 D1） */
async function countPvUv(env, path, vid) {
  const db = env.DB;
  if (!db) return;  // 无 D1 时不计数（静默）
  const today = todayCn();
  await db.batch([
    db.prepare('INSERT INTO stats (key, value) VALUES (?1, 1) ON CONFLICT(key) DO UPDATE SET value = stats.value + 1').bind('stats:pv:total'),
    db.prepare('INSERT INTO stats (key, value) VALUES (?1, 1) ON CONFLICT(key) DO UPDATE SET value = stats.value + 1').bind('stats:pv:day:' + today),
    // 注意：path 是 URL.pathname（本身已是百分号编码），不可再 encodeURIComponent（会双编码导致乱码）
    db.prepare('INSERT INTO stats (key, value) VALUES (?1, 1) ON CONFLICT(key) DO UPDATE SET value = stats.value + 1').bind('stats:page:' + path),
  ]);
  // UV 去重：INSERT OR IGNORE 的 changes=1 表示当日新访客，才计 UV
  const ins = await db.prepare('INSERT OR IGNORE INTO uv_seen (day, vid) VALUES (?1, ?2)').bind(today, vid).run();
  if (ins.meta && ins.meta.changes > 0) {
    await db.prepare('INSERT INTO stats (key, value) VALUES (?1, 1) ON CONFLICT(key) DO UPDATE SET value = stats.value + 1').bind('stats:uv:day:' + today).run();
  }
}

/** 统计一次页面访问；返回需要下发的 Set-Cookie 值（首访生成访客 id），无则空串
 *  2026-08-22 审查：计数移入 ctx.waitUntil 异步执行，不阻塞 HTML 首屏；
 *  首访把即将下发的 Cookie 身份预占位进 uv_seen（不计数），避免同用户第二次访问重复计 UV */
async function countVisit(env, request, path, ctx) {
  try {
    const today = todayCn();
    const cookieHeader = request.headers.get('Cookie') || '';
    let vid = '';
    for (const part of cookieHeader.split(';')) {
      const [k, v] = part.trim().split('=');
      if (k === STATS_COOKIE && v) { vid = v; break; }
    }
    let setCookie = '';
    const cookieVid = randomHex16();
    if (!vid) {
      // 首访/无 Cookie（爬虫）：以 IP+日期哈希兜底去重（同 IP 当日只算 1 UV），并下发随机 Cookie
      const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
      vid = 'ip:' + (await sha256Hex(ip + '|' + today)).slice(0, 16);
      setCookie = STATS_COOKIE + '=' + cookieVid + '; Path=/; Max-Age=31536000; SameSite=Lax';
    }
    const count = async () => {
      // 预占位：本请求下发的 Cookie 身份当日算已见，带 Cookie 再来时不重复计 UV
      if (setCookie && env.DB) {
        try { await env.DB.prepare('INSERT OR IGNORE INTO uv_seen (day, vid) VALUES (?1, ?2)').bind(today, cookieVid).run(); } catch (_) {}
      }
      await countPvUv(env, path, vid);
    };
    if (ctx && ctx.waitUntil) { ctx.waitUntil(count().catch(() => {})); return setCookie; }
    await count().catch(() => {});
    return setCookie;
  } catch (_) { return ''; }
}

/** GitHub Pages 直连通道统计上报（common.js 只在 github.io 域名下调用，避免与主域双计） */
/** /api/visit IP 维度限流：每 IP 每分钟 60 次；限流器故障保守拒绝（写操作防伪造 vid 刷量） */
async function visitRateLimit(env, ip) {
  try {
    const now = Date.now();
    const winEnd = now + 60000;
    const row = await env.DB.prepare(
      'INSERT INTO rate (key, count, until) VALUES (?1, 1, ?2) ' +
      'ON CONFLICT(key) DO UPDATE SET ' +
      'count = CASE WHEN rate.until <= ?3 THEN 1 ELSE rate.count + 1 END, ' +
      'until = CASE WHEN rate.until <= ?3 THEN ?4 ELSE rate.until END ' +
      'RETURNING count'
    ).bind('rate:visit:ip:' + ip, winEnd, now, winEnd).first();
    return !(row && Number(row.count) > 60);
  } catch (error) {
    console.error('visitRateLimit error:', error);
    return false;
  }
}

async function handleVisit(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const vid = String(body.vid || '').trim();
  if (!/^[0-9a-f]{32}$/.test(vid)) return json({ error: 'vid must be 32 hex chars' }, 400);
  let path = String(body.path || '/');
  if (!path.startsWith('/')) path = '/' + path;
  if (path.length > 200) path = path.slice(0, 200);
  // 2026-08-23 审查：路径白名单——拒绝控制字符（ -）/反斜杠/路径穿越/双斜杠
  if (path.includes('..') || path.includes('//') || path.includes(String.fromCharCode(92)) || /[ -]/.test(path)) return json({ error: 'invalid path' }, 400);
  // IP 维度限流（防伪造 vid 刷量）；限流器故障保守拒绝
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  if (!(await visitRateLimit(env, ip))) return json({ error: 'too many requests, try again later' }, 429);
  if (!(await syncRateLimit(env, vid, 'visit'))) return json({ error: 'too many requests, try again later' }, 429);
  await countPvUv(env, path, vid);
  return json({ ok: true });
}

/* ---------- 学习活跃上报 / 排行榜（2026-08-22 → 08-22 迁 D1）----------
 * 前端（unified-quiz-engine.js）每 60s 心跳 POST /api/activity {learned}：
 *   账号（Bearer 会话）→ user:{id}；匿名 → anon:{deviceId(64hex)}。
 * 存储：D1 activity(act_key, date)（自 KV act:{key}:{date} 迁出，2026-08-22）。
 * 排行：GET /api/rank?period=day|week（ADMIN_TOKEN）→ Top50 按分钟降序。 */
const HEARTBEAT_MIN_INTERVAL_MS = 40000;  // 同一身份两次心跳最短间隔（前端周期 60s，正常用户不会触发；防伪造/重放刷分钟与学习量）

async function handleActivity(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const learned = Math.max(0, Math.min(Number(body.learned) || 0, 500));
  let key;
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (token) {
    if (!env.DB) return json({ error: 'database not configured' }, 500);
    const session = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?')
      .bind(await hashToken(token), Date.now()).first();
    if (!session) return json({ error: 'unauthorized' }, 401);
    key = 'user:' + session.user_id;
  } else {
    const deviceId = String(body.deviceId || '').trim();
    if (!DEVICE_ID_RE.test(deviceId)) return json({ error: 'deviceId must be 64 hex chars' }, 400);
    key = 'anon:' + deviceId;
  }
  // 双维度限流：每身份 6 次/分 + 每 IP 20 次/分（防换 deviceId 批量刷）
  if (!(await syncRateLimit(env, key, 'heartbeat'))) return json({ error: 'too many requests, try again later' }, 429);
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  if (!(await syncRateLimit(env, 'ip:' + ip, 'heartbeatIp'))) return json({ error: 'too many requests, try again later' }, 429);
  const now = Date.now();
  const today = todayCn();
  const row = await env.DB.prepare('SELECT minutes, learned, last_ts FROM activity WHERE act_key = ?1 AND date = ?2').bind(key, today).first();
  const cur = {
    minutes: (row && row.minutes) || 0,
    learned: (row && row.learned) || 0,
    lastTs: (row && row.last_ts) || 0,
  };
  if (cur.lastTs && now - cur.lastTs < HEARTBEAT_MIN_INTERVAL_MS) {
    // 心跳过密（伪造/重放/双标签页）：本次不计数，不污染时长与学习量；返回 ok 让前端正常续期
    return json({ ok: true, skipped: true });
  }
  cur.minutes += 1;
  cur.learned += learned;
  cur.lastTs = now;
  await env.DB.prepare(
    'INSERT INTO activity (act_key, date, minutes, learned, last_ts) VALUES (?1, ?2, ?3, ?4, ?5) ' +
    'ON CONFLICT(act_key, date) DO UPDATE SET minutes = excluded.minutes, learned = excluded.learned, last_ts = excluded.last_ts'
  ).bind(key, today, cur.minutes, cur.learned, cur.lastTs).run();
  return json({ ok: true, minutes: cur.minutes, learned: cur.learned });
}

/** 管理操作：按邮箱删除账号（级联删会话；用于清理线上测试账号，requireAdmin） */
async function handleDeleteAccount(request, env) {
  if (!env.DB) return json({ error: 'database not configured' }, 500);
  const email = String(new URL(request.url).searchParams.get('email') || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'invalid email' }, 400);
  const info = await env.DB.prepare('DELETE FROM users WHERE email = ?').bind(email).run();
  return json({ ok: true, deleted: (info && info.meta && info.meta.changes) || 0 });
}

/** 管理操作：删除某身份某日的活动记录（清理线上测试数据用，requireAdmin；2026-08-22 迁 D1） */
async function handleDeleteActivity(request, env) {
  const url = new URL(request.url);
  const key = String(url.searchParams.get('key') || '').trim();
  const date = String(url.searchParams.get('date') || '').trim();
  if (!/^(user|anon):[0-9a-fA-F]{16,}$/.test(key) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'invalid key or date' }, 400);
  await env.DB.prepare('DELETE FROM activity WHERE act_key = ?1 AND date = ?2').bind(key, date).run();
  return json({ ok: true });
}

const RANK_CACHE_TTL = 300;  // 排行榜结果缓存 5 分钟（避免每次请求全量扫 KV + 逐账号查 D1）

async function handleRank(request, env) {
  const period = new URL(request.url).searchParams.get('period') === 'week' ? 'week' : 'day';
  const dates = [];
  for (let i = 0; i < 7; i++) dates.push(new Date(Date.now() + 8 * 3600 * 1000 - i * 86400 * 1000).toISOString().slice(0, 10));
  const range = period === 'day' ? dates[0] : dates[0] + ' ~ ' + dates[6];
  const nocache = new URL(request.url).searchParams.get('nocache') === '1';  // 验证脚本用：绕过缓存强制重扫
  if (!nocache) {
    const cached = await env.DB.prepare('SELECT payload, updated_at FROM rank_cache WHERE period = ?1 AND range = ?2').bind(period, range).first();
    if (cached && Date.now() - cached.updated_at < RANK_CACHE_TTL * 1000) {
      return json({ ok: true, period, range, items: JSON.parse(cached.payload), cached: true });
    }
  }
  // 2026-08-22 迁 D1：GROUP BY 聚合替代 KV list 全量扫描（week = 最近 7 个自然日）
  const since = period === 'week' ? dates[6] : dates[0];
  const rows = await env.DB.prepare(
    'SELECT act_key, SUM(minutes) AS minutes, SUM(learned) AS learned FROM activity WHERE date >= ?1 GROUP BY act_key ORDER BY minutes DESC, learned DESC LIMIT 50'
  ).bind(since).all();
  const items = [];
  for (const row of rows.results || []) {
    const key = row.act_key;
    let name = '';
    if (key.startsWith('user:')) {
      const uid = key.slice(5);
      if (env.DB) {
        const u = await env.DB.prepare('SELECT nickname, email FROM users WHERE id = ?').bind(uid).first();
        if (u) name = u.nickname || u.email;
      }
      if (!name) name = '用户' + uid.slice(0, 6);
    } else {
      name = '匿名-' + key.slice(5).slice(0, 6);
    }
    items.push({ id: key, name, minutes: row.minutes || 0, learned: row.learned || 0 });
  }
  if (!nocache) {
    await env.DB.prepare(
      'INSERT INTO rank_cache (period, range, payload, updated_at) VALUES (?1, ?2, ?3, ?4) ' +
      'ON CONFLICT(period, range) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at'
    ).bind(period, range, JSON.stringify(items), Date.now()).run();
  }
  return json({ ok: true, period, range, items, cached: false });
}

async function handleStats(env) {
  const today = todayCn();
  const num = async key => {
    const row = await env.DB.prepare('SELECT value FROM stats WHERE key = ?1').bind(key).first();
    return (row && row.value) || 0;
  };
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() + 8 * 3600 * 1000 - i * 86400 * 1000).toISOString().slice(0, 10);
    daily.push({ date: d, pv: await num('stats:pv:day:' + d), uv: await num('stats:uv:day:' + d) });
  }
  const pages = [];
  const pageRows = await env.DB.prepare("SELECT key, value FROM stats WHERE key LIKE 'stats:page:%' ORDER BY value DESC LIMIT 100").all();
  for (const row of pageRows.results || []) {
    let decoded;
    try { decoded = decodeURIComponent(row.key.slice('stats:page:'.length)); } catch (_) { continue; }  // 审查：非法编码键不拖垮整个统计接口
    try { decoded = decodeURIComponent(decoded); } catch (_) {}  // 兼容早期双编码存量键
    const exist = pages.find(p => p.path === decoded);
    if (exist) exist.pv += row.value;  // 同路径聚合（%2F 存量键与 / 合并）
    else pages.push({ path: decoded, pv: row.value });
  }
  pages.sort((a, b) => b.pv - a.pv);
  return json({
    ok: true,
    totals: { pv: await num('stats:pv:total') },
    today: { pv: await num('stats:pv:day:' + today), uv: await num('stats:uv:day:' + today) },
    daily,
    topPages: pages.slice(0, 20),
  });
}

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
const SYNC_RATE = { upload: 10, download: 30, delete: 6, heartbeat: 6, heartbeatIp: 20, visit: 60 };  // 每分钟每键（heartbeat 排行榜活跃 / heartbeatIp 按 IP 限 / visit GitHub 直连统计）

/** D1 滚动窗口限流（2026-08-22 自 KV 迁出）：每身份×动作仅一行，窗口过期自动重置，键量恒定无需清理 */
async function syncRateLimit(env, key, action) {
  try {
    const now = Date.now();
    const windowMs = 60000;  // 1 分钟窗口
    const winStart = Math.floor(now / windowMs) * windowMs;
    const winEnd = winStart + windowMs;
    const rk = 'rate:sync:' + action + ':' + key;
    const row = await env.DB.prepare(
      'INSERT INTO rate (key, count, until) VALUES (?1, 1, ?2) ' +
      'ON CONFLICT(key) DO UPDATE SET ' +
      'count = CASE WHEN rate.until <= ?3 THEN 1 ELSE rate.count + 1 END, ' +
      'until = CASE WHEN rate.until <= ?3 THEN ?4 ELSE rate.until END ' +
      'RETURNING count'
    ).bind(rk, winEnd, winStart, winEnd).first();
    if (row && row.count > SYNC_RATE[action]) return false;
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
  // 2026-08-22 审查：按 UTF-8 字节数校验（中文 1 字符=3 字节，字符数会漏放行）
  const payloadBytes = new TextEncoder().encode(payload).length;
  if (payloadBytes > MAX_SYNC_BYTES) return json({ error: 'payload too large (max 2.5MB)' }, 413);
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
  return json({ ok: true, size: payloadBytes, updatedAt: record.updatedAt, rev: record.rev });
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

async function handleProxy(request, env, path, mode, ctx) {
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
  // 页面浏览量统计：仅 GET 的 HTML 页面（HEAD/资源/API 不计），失败静默
  if (request.method === 'GET' && type.includes('text/html')) {
    const setCookie = await countVisit(env, request, url.pathname, ctx);
    if (setCookie) headers.append('Set-Cookie', setCookie);
  }
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

/* ---------- D1 数据自动清理（2026-08-22 审查 P1）----------
 * Cron 每日执行：uv_seen 保留 2 天、activity 保留 8 天（周榜窗口 7 天）、
 * rate 删过期窗口、rank_cache 删 1 小时前的缓存、stats 日计数保留 30 天、
 * login_fails 保留 1 天、reset_tokens 删除过期记录。
 * KV 注销清理任务单独重试；全部静默容错，清理失败不影响任何请求。 */
async function cleanupDb(env) {
  const db = env.DB;
  if (!db) return;
  const now = Date.now();
  try {
    const dayMs = 86400 * 1000;
    const todayCnTs = () => new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const daysAgo = n => new Date(now + 8 * 3600 * 1000 - n * dayMs).toISOString().slice(0, 10);
    await db.batch([
      db.prepare('DELETE FROM uv_seen WHERE day < ?1').bind(daysAgo(2)),
      db.prepare('DELETE FROM activity WHERE date < ?1').bind(daysAgo(8)),
      db.prepare('DELETE FROM rate WHERE until < ?1').bind(now),
      db.prepare('DELETE FROM rank_cache WHERE updated_at < ?1').bind(now - 3600 * 1000),
      db.prepare("DELETE FROM stats WHERE key LIKE 'stats:pv:day:%' AND substr(key, 14) < ?1").bind(daysAgo(30)),
      db.prepare("DELETE FROM stats WHERE key LIKE 'stats:uv:day:%' AND substr(key, 14) < ?1").bind(daysAgo(30)),
      db.prepare('DELETE FROM login_fails WHERE updated_at < ?1').bind(now - dayMs),
      db.prepare('DELETE FROM reset_tokens WHERE expires_at < ?1').bind(now),
      db.prepare("UPDATE errand_tasks SET status = 'cancelled', cancelled_at = ?1, cancel_reason = '任务已过期，自动取消', updated_at = ?1 WHERE status = 'open' AND deadline IS NOT NULL AND deadline < ?1").bind(now),
      db.prepare("UPDATE errand_tasks SET confirmed_at = ?1, auto_confirmed_at = ?1, confirmed_by = 'system', updated_at = ?1 WHERE status = 'done' AND confirmed_at IS NULL AND completed_at IS NOT NULL AND completed_at < ?2").bind(now, now - 48 * 3600 * 1000),
    ]);
  } catch (_) { /* 清理失败静默 */ }
  await processCleanupJobs(env, now);
}

async function processCleanupJobs(env, now) {
  if (!env.DB || !env.STUDY_KV) return;
  let rows;
  try {
    const result = await env.DB.prepare(
      'SELECT id, kv_key, attempts FROM cleanup_jobs WHERE next_attempt_at <= ? ORDER BY id LIMIT 20'
    ).bind(now).all();
    rows = result && result.results ? result.results : [];
  } catch (_) {
    return;
  }
  for (const row of rows) {
    try {
      await env.STUDY_KV.delete(row.kv_key);
      await env.DB.prepare('DELETE FROM cleanup_jobs WHERE id = ?').bind(row.id).run();
    } catch (error) {
      const attempts = (Number(row.attempts) || 0) + 1;
      const delay = Math.min(24 * 3600 * 1000, 60000 * (2 ** Math.min(attempts, 10)));
      const message = String(error && error.message || error).slice(0, 500);
      await env.DB.prepare(
        'UPDATE cleanup_jobs SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?'
      ).bind(attempts, now + delay, message, row.id).run().catch(() => {});
    }
  }
}
