import { json, safeParseJson, readJsonBody } from "./http.js";  // 公共 HTTP 工具
import { DEVICE_ID_RE, resolveSyncIdentity } from "./identity.js";  // 身份解析（统一模块，2026-08-23 审查第 4 项）
import { syncRateLimit, rateWindow } from "./rate-limit.js";  // 统一限流（2026-08-23 审查第 4 项）

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
  const r = await rateWindow(env.DB, 'rate:visit:ip:' + ip, 60000, 60);
  if (r.failed) { console.error('visitRateLimit error (rateWindow failed):'); return false; }
  return !(r.count > 60);
}

async function handleVisit(request, env) {
  let body;
  try { body = await readJsonBody(request); } catch { return json({ error: '请求体过大（最大 256KB）' }, 413); }
  if (!body) return json({ error: 'invalid json' }, 400);
  const vid = String(body.vid || '').trim();
  if (!/^[0-9a-f]{32}$/.test(vid)) return json({ error: 'vid must be 32 hex chars' }, 400);
  let path = String(body.path || '/');
  if (!path.startsWith('/')) path = '/' + path;
  if (path.length > 200) path = path.slice(0, 200);
  // 2026-08-23 审查：路径白名单——拒绝控制字符/反斜杠/路径穿越/双斜杠
  if (path.includes('..') || path.includes('//') || path.includes(String.fromCharCode(92)) || /[\u0000-\u001F\u007F]/.test(path)) return json({ error: 'invalid path' }, 400);
  // IP 维度限流（防伪造 vid 刷量）；限流器故障保守拒绝
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  if (!(await visitRateLimit(env, ip))) return json({ error: 'too many requests, try again later' }, 429);
  const rlVisit = await syncRateLimit(env, vid, 'visit');
  if (rlVisit.failed) return json({ error: '服务繁忙，请稍后再试' }, 503);
  if (!rlVisit.ok) return json({ error: 'too many requests, try again later' }, 429);
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
  try { body = await readJsonBody(request); } catch { return json({ error: '请求体过大（最大 256KB）' }, 413); }
  if (!body) return json({ error: 'invalid json' }, 400);
  const learned = Math.max(0, Math.min(Number(body.learned) || 0, 500));
  let key;
  const identity = await resolveSyncIdentity(request, env);
  if (identity.error) return json({ error: identity.error }, 401);
  if (identity.key) {
    key = identity.key;
  } else {
    const deviceId = String(body.deviceId || '').trim();
    if (!DEVICE_ID_RE.test(deviceId)) return json({ error: 'deviceId must be 64 hex chars' }, 400);
    key = 'anon:' + deviceId;
  }
  // 双维度限流：每身份 6 次/分 + 每 IP 20 次/分（防换 deviceId 批量刷）
  const rlHb = await syncRateLimit(env, key, 'heartbeat');
  if (rlHb.failed) return json({ error: '服务繁忙，请稍后再试' }, 503);
  if (!rlHb.ok) return json({ error: 'too many requests, try again later' }, 429);
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const rlHbIp = await syncRateLimit(env, 'ip:' + ip, 'heartbeatIp');
  if (rlHbIp.failed) return json({ error: '服务繁忙，请稍后再试' }, 503);
  if (!rlHbIp.ok) return json({ error: 'too many requests, try again later' }, 429);
  const now = Date.now();
  const today = todayCn();
  // 2026-08-23 审查：先查后改并发丢计数 → 单条原子 UPSERT + 40s 间隔条件
  //（ON CONFLICT 的 WHERE 只作用于 UPDATE 分支；条件不满足 → changes=0 → skipped）
  let res;
  try {
    res = await env.DB.prepare(
      'INSERT INTO activity (act_key, date, minutes, learned, last_ts) VALUES (?1, ?2, 1, ?3, ?4) ' +
      'ON CONFLICT(act_key, date) DO UPDATE SET ' +
      'minutes = activity.minutes + 1, learned = activity.learned + excluded.learned, last_ts = excluded.last_ts ' +
      'WHERE activity.last_ts IS NULL OR activity.last_ts <= ?5'
    ).bind(key, today, learned, now, now - HEARTBEAT_MIN_INTERVAL_MS).run();
  } catch (error) {
    console.error('activity upsert error:', error);
    return json({ error: '服务繁忙，请稍后再试' }, 503);
  }
  const changed = res && res.meta && Number(res.meta.changes) > 0;
  if (!changed) return json({ ok: true, skipped: true });
  return json({ ok: true });
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
      const items = safeParseJson(cached.payload, null);
      if (Array.isArray(items)) return json({ ok: true, period, range, items, cached: true });
      // 2026-08-23 复审：缓存损坏时忽略缓存强制重扫（记录日志，不 500）
      console.error('rank cache corrupted, rescan:', period, range);
    }
  }
  // 2026-08-22 迁 D1：GROUP BY 聚合替代 KV list 全量扫描（week = 最近 7 个自然日）
  const since = period === 'week' ? dates[6] : dates[0];
  // 2026-08-23 审查：N+1 查询（≤50 次逐条查 users）→ LEFT JOIN 一次取回
  const rows = await env.DB.prepare(
    'SELECT a.act_key, SUM(a.minutes) AS minutes, SUM(a.learned) AS learned, u.nickname, u.email ' +
    'FROM activity a LEFT JOIN users u ON u.id = substr(a.act_key, 6) ' +
    'WHERE a.date >= ?1 GROUP BY a.act_key, u.nickname, u.email ORDER BY minutes DESC, learned DESC LIMIT 50'
  ).bind(since).all();
  const items = [];
  for (const row of rows.results || []) {
    const key = row.act_key;
    let name = '';
    if (key.startsWith('user:')) {
      const uid = key.slice(5);
      name = row.nickname || row.email || ('用户' + uid.slice(0, 6));
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
  // 2026-08-23 审查：原实现 ~36 次顺序点查（daily 14×2 + totals/today 3）→ 一次全表拉取 JS 端分组
  const allRows = await env.DB.prepare('SELECT key, value FROM stats').all();
  const map = new Map();
  for (const r of (allRows && allRows.results) || []) map.set(r.key, r.value);
  const num = key => map.get(key) || 0;
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() + 8 * 3600 * 1000 - i * 86400 * 1000).toISOString().slice(0, 10);
    daily.push({ date: d, pv: num('stats:pv:day:' + d), uv: num('stats:uv:day:' + d) });
  }
  const pages = [];
  for (const [key, value] of map) {
    if (!key.startsWith('stats:page:')) continue;
    let decoded;
    try { decoded = decodeURIComponent(key.slice('stats:page:'.length)); } catch (_) { continue; }  // 审查：非法编码键不拖垮整个统计接口
    try { decoded = decodeURIComponent(decoded); } catch (_) {}  // 兼容早期双编码存量键
    const exist = pages.find(p => p.path === decoded);
    if (exist) exist.pv += value;  // 同路径聚合（%2F 存量键与 / 合并）
    else pages.push({ path: decoded, pv: value });
  }
  pages.sort((a, b) => b.pv - a.pv);
  return json({
    ok: true,
    totals: { pv: num('stats:pv:total') },
    today: { pv: num('stats:pv:day:' + today), uv: num('stats:uv:day:' + today) },
    daily,
    topPages: pages.slice(0, 20),
  });
}



export { countVisit, handleVisit, handleActivity, handleDeleteActivity, handleRank, handleStats };
