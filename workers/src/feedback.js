import { json, safeParseJson, readJsonBody } from "./http.js";  // 公共 HTTP 工具
import { rateWindow } from "./rate-limit.js";  // 统一限流（2026-08-23 审查第 4 项）

/** 反馈限流（2026-08-23 审查：实例内存 Map 迁 D1 rate 表，多节点一致）：同一 IP 30 秒内最多 5 次 POST；故障保守拒绝 */
async function feedbackRateLimit(env, ip) {
  const r = await rateWindow(env.DB, 'rate:fb:' + ip, 30000, 5);
  if (r.failed) { console.error('feedbackRateLimit error (rateWindow failed):'); return { ok: false, failed: true }; }
  return { ok: !(r.count > 5), failed: false };
}

/* ---------- 公告（仍存 KV：低频、单键、无需查询） ---------- */

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

/* ---------- 反馈（2026-08-23 审查第 7 项：KV 迁 D1） ----------
   D1 feedbacks(id PK, ts INTEGER, handled INTEGER)，id 沿用 feedback:<ts>-<rand> 格式，
   前端契约不变：items[].key = id、ts 返回 ISO 字符串、cursor 为数字 offset 字符串透传。 */

async function handleFeedback(request, env) {
  if (!env.DB) return json({ error: 'database not configured' }, 500);
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
  };
  if (!record.page && !record.question && !record.note) return json({ error: 'empty feedback' }, 400);
  const ts = Date.now();
  const key = 'feedback:' + ts + '-' + Math.random().toString(36).slice(2, 8);
  try {
    await env.DB.prepare(
      'INSERT INTO feedbacks (id, page, question, answer, type, note, contact, ts, handled, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9)'
    ).bind(key, record.page, record.question, record.answer, record.type, record.note, record.contact, ts, ts).run();
  } catch (error) {
    console.error('feedback insert error:', error);
    return json({ error: '服务繁忙，请稍后再试' }, 503);
  }
  return json({ ok: true, id: key });
}

/* ---------- 反馈列表（cursor = 数字 offset；2026-08-23 迁 D1 后筛选走 SQL WHERE） ----------
   GET /api/feedback?cursor=&limit=&type=&since=&until=&handled=   （全部需 ADMIN_TOKEN）
     limit    每页条数（默认 30，上限 100）
     type     按反馈类型精确筛选
     since/until  ISO 时间戳筛选（ts 毫秒比较）
     handled  '0'=未处理 '1'=已处理，省略=全部 */
const FEEDBACK_PAGE_MAX = 100;

async function handleListFeedback(request, env) {
  if (!env.DB) return json({ error: 'database not configured' }, 500);
  const params = new URL(request.url).searchParams;
  const type = params.get('type') || '';
  const since = params.get('since') || '';
  const until = params.get('until') || '';
  const handled = params.get('handled');  // '0' | '1' | null
  const limit = Math.min(Math.max(Number(params.get('limit') || 30) | 0, 1), FEEDBACK_PAGE_MAX);
  const offset = Math.max(Number(params.get('cursor') || 0) | 0, 0);
  const where = []; const binds = [];
  if (type) { where.push('type = ?'); binds.push(type); }
  if (since) { where.push('ts >= ?'); binds.push(Date.parse(since) || 0); }
  if (until) { where.push('ts <= ?'); binds.push(Date.parse(until) || Date.now()); }
  if (handled !== null) { where.push('handled = ?'); binds.push(handled === '1' ? 1 : 0); }
  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  try {
    const totalRow = await env.DB.prepare('SELECT COUNT(*) AS c FROM feedbacks' + whereSql).bind(...binds).first();
    const total = Number(totalRow && totalRow.c) || 0;
    const rows = await env.DB.prepare('SELECT * FROM feedbacks' + whereSql + ' ORDER BY ts DESC LIMIT ? OFFSET ?').bind(...binds, limit, offset).all();
    const items = (rows.results || []).map(r => ({
      key: r.id, page: r.page, question: r.question, answer: r.answer, type: r.type,
      note: r.note, contact: r.contact, ts: new Date(Number(r.ts)).toISOString(), handled: !!r.handled,
    }));
    const nextOffset = offset + items.length;
    const hasMore = nextOffset < total;
    return json({ ok: true, count: total, cursor: hasMore ? String(nextOffset) : null, hasMore, items });
  } catch (error) {
    console.error('feedback list error:', error);
    return json({ error: '服务繁忙，请稍后再试' }, 503);
  }
}

/* 标记反馈已处理/重新打开：PATCH /api/feedback?key=feedback:xxx&handled=1|0（需 ADMIN_TOKEN） */
async function handleFeedbackHandled(request, env) {
  if (!env.DB) return json({ error: 'database not configured' }, 500);
  const params = new URL(request.url).searchParams;
  const key = params.get('key') || '';
  const handled = params.get('handled');
  if (!key || !key.startsWith('feedback:')) return json({ error: 'key required (feedback:...)' }, 400);
  if (handled !== '1' && handled !== '0') return json({ error: 'handled must be 1 or 0' }, 400);
  try {
    const res = await env.DB.prepare('UPDATE feedbacks SET handled = ? WHERE id = ?').bind(handled === '1' ? 1 : 0, key).run();
    if (!res || !res.meta || Number(res.meta.changes) < 1) return json({ error: 'not found' }, 404);
  } catch (error) {
    console.error('feedback handled error:', error);
    return json({ error: '服务繁忙，请稍后再试' }, 503);
  }
  return json({ ok: true, key, handled: handled === '1' });
}

/* ---------- 删除反馈（需 ADMIN_TOKEN）：DELETE /api/feedback?key=feedback:xxx ---------- */
async function handleDeleteFeedback(request, env) {
  if (!env.DB) return json({ error: 'database not configured' }, 500);
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!key || !key.startsWith('feedback:')) return json({ error: 'key required (feedback:...)' }, 400);
  try {
    const res = await env.DB.prepare('DELETE FROM feedbacks WHERE id = ?').bind(key).run();
    return json({ ok: true, deleted: key, changes: (res && res.meta && Number(res.meta.changes)) || 0 });
  } catch (error) {
    console.error('feedback delete error:', error);
    return json({ error: '服务繁忙，请稍后再试' }, 503);
  }
}

export { handleSetNotice, handleDeleteNotice, handleFeedback, handleListFeedback, handleFeedbackHandled, handleDeleteFeedback };
