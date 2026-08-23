import { json, safeParseJson, readJsonBody } from "./http.js";  // 公共 HTTP 工具

/** 反馈限流（2026-08-23 审查：实例内存 Map 迁 D1 rate 表，多节点一致）：同一 IP 30 秒内最多 5 次 POST；故障保守拒绝 */
async function feedbackRateLimit(env, ip) {
  try {
    const now = Date.now();
    const end = now + 30000;
    const row = await env.DB.prepare(
      'INSERT INTO rate (key, count, until) VALUES (?1, 1, ?2) ' +
      'ON CONFLICT(key) DO UPDATE SET ' +
      'count = CASE WHEN rate.until <= ?3 THEN 1 ELSE rate.count + 1 END, ' +
      'until = CASE WHEN rate.until <= ?3 THEN ?4 ELSE rate.until END ' +
      'RETURNING count'
    ).bind('rate:fb:' + ip, end, now, end).first();
    return { ok: !(row && row.count > 5), failed: false };
  } catch (error) {
    console.error('feedbackRateLimit error:', error);
    return { ok: false, failed: true };
  }
}

/* ---------- 公告 ---------- */

async function handleSetNotice(request, env) {
  let body;
  try { body = await readJsonBody(request); } catch { return json({ error: '请求体过大（最大 256KB）' }, 413); }
  if (!body) return json({ error: 'invalid json' }, 400);
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
  const fbIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const fbRl = await feedbackRateLimit(env, fbIp);
  if (fbRl.failed) return json({ error: '服务繁忙，请稍后再试' }, 503);
  if (!fbRl.ok) return json({ error: 'too many requests, try again later' }, 429);
  let body;
  try { body = await readJsonBody(request); } catch { return json({ error: '请求体过大（最大 256KB）' }, 413); }
  if (!body) return json({ error: 'invalid json' }, 400);
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
  const record = safeParseJson(raw, null);
  if (!record) return json({ error: 'feedback record corrupted' }, 500);
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


export { handleSetNotice, handleDeleteNotice, handleFeedback, handleListFeedback, handleFeedbackHandled, handleDeleteFeedback };
