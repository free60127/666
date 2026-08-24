/* ============================================================
   跑腿平台模块（D1 版）：发布任务 / 列表 / 详情 / 原子接单 /
   完成确认 / 取消。与现有账号体系同库（users + sessions）。
   状态机：open（待接单）→ doing（已接单）→ done（接单者标记完成）
   → confirmed_at（发布者确认，线下结算）；任意未完成态可 cancelled。
   接单并发：UPDATE ... WHERE status='open' 原子抢占（D1 事务）。
   ============================================================ */
import { sessionUser } from './auth.js';
import { json } from './http.js';
import { createReview, listReviews } from './errand-reviews.js';
import { rateWindow } from './rate-limit.js';
import { createDispute, listDisputes, listEvidence, serveEvidenceBinary, adminTasks, adminDeleteTask, resolveDispute, listAdminLogs } from './errand-disputes.js';


const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };


/* ---------- 任务查询（JOIN 昵称） ---------- */
const TASK_SELECT =
  'SELECT t.id, t.publisher_id, t.title, t.description, t.reward, t.pickup, t.dropoff, t.contact, ' +
  't.deadline, t.status, t.taker_id, t.created_at, t.updated_at, t.completed_at, t.confirmed_at, t.confirmed_by, t.auto_confirmed_at, t.cancelled_at, t.cancel_reason, ' +
  'u.nickname AS publisher_name, u2.nickname AS taker_name ' +
  'FROM errand_tasks t ' +
  'LEFT JOIN users u ON u.id = t.publisher_id ' +
  'LEFT JOIN users u2 ON u2.id = t.taker_id ';

const mapTask = (r) => r ? ({
  id: r.id, publisherId: r.publisher_id, title: r.title, description: r.description,
  reward: r.reward, pickup: r.pickup, dropoff: r.dropoff, contact: r.contact,
  deadline: r.deadline, status: r.status, takerId: r.taker_id,
  createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at,
  confirmedAt: r.confirmed_at, confirmedBy: r.confirmed_by, autoConfirmedAt: r.auto_confirmed_at,
  cancelledAt: r.cancelled_at, cancelReason: r.cancel_reason,
  publisherName: r.publisher_name, takerName: r.taker_name,
}) : null;

/* 联系方式脱敏：仅发布者本人、以及已接单状态下的接单者可见；其余一律空字符串 */
function canSeeContact(user, row) {
  if (!user) return false;
  if (user.id === row.publisher_id) return true;
  if (user.id === row.taker_id && (row.status === 'doing' || row.status === 'done')) return true;
  return false;
}
function sanitizeContact(task, user, row) {
  if (!canSeeContact(user, row)) task.contact = '';
  return task;
}

/* ---------- 发布任务 ---------- */
async function createTask(db, request) {
  const user = await sessionUser(db, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'invalid json' }, 400);
  const title = String(body.title || '').trim();
  if (!title || title.length > 60) return json({ error: '标题必填，最长 60 字' }, 400);
  const description = String(body.description || '').trim().slice(0, 500);
  const rewardRaw = num(body.reward);
  if (rewardRaw === null || rewardRaw < 0 || rewardRaw > 99999 || !Number.isInteger(rewardRaw))
    return json({ error: '赏金需为 0~99999 的整数（元）' }, 400);
  const pickup = String(body.pickup || '').trim().slice(0, 50);
  if (!pickup) return json({ error: '取件地点必填' }, 400);
  const dropoff = String(body.dropoff || '').trim().slice(0, 50);
  if (!dropoff) return json({ error: '送达地点必填' }, 400);
  const contact = String(body.contact || '').trim().slice(0, 100);
  if (!contact) return json({ error: '联系方式必填' }, 400);
  let deadline = null;
  if (body.deadline) {
    const d = num(body.deadline);
    if (d === null || !Number.isSafeInteger(d) || d <= Date.now()) return json({ error: '截止时间需为合法时间戳且晚于当前时间' }, 400);
    deadline = d;
  }
  const now = Date.now();
  const rate = await rateWindow(db, 'errand:pub:' + user.id, 10 * 60 * 1000, 30);
  if (rate.failed) return json({ error: '服务繁忙，请稍后再试' }, 503);
  if (rate.count > 30) return json({ error: '发布太频繁，请稍后再试' }, 429);
  try {
    const result = await db.prepare(
      'INSERT INTO errand_tasks (publisher_id, title, description, reward, pickup, dropoff, contact, deadline, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(user.id, title, description, rewardRaw, pickup, dropoff, contact, deadline, now, now).run();
    const id = result && result.meta && result.meta.last_row_id ? result.meta.last_row_id : null;
    if (!id) return json({ error: 'internal error' }, 500);
    const row = await db.prepare(TASK_SELECT + 'WHERE t.id = ?').bind(id).first();
    return json({ ok: true, task: mapTask(row) }, 201);
  } catch (error) {
    console.error('errand create error:', error);
    return json({ error: 'internal error' }, 500);
  }
}

/* ---------- 列表（公开；可筛选状态，默认待接单） ---------- */
async function listTasks(db, request) {
  const url = new URL(request.url);
  const status = String(url.searchParams.get('status') || 'open');
  if (!['open', 'doing', 'done', 'cancelled', 'all'].includes(status)) return json({ error: 'invalid status' }, 400);
  const page = clamp(Math.floor(num(url.searchParams.get('page')) || 1), 1, 1000);
  const pageSize = clamp(Math.floor(num(url.searchParams.get('pageSize')) || 20), 1, 50);
  const where = status === 'all' ? 'WHERE t.status != \'cancelled\'' : 'WHERE t.status = ?';
  const params = status === 'all' ? [] : [status];
  try {
    const countRow = await db.prepare('SELECT COUNT(*) AS c FROM errand_tasks t ' + where).bind(...params).first();
    const rows = await db.prepare(
      TASK_SELECT + where + ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?'
    ).bind(...params, pageSize, (page - 1) * pageSize).all();
    const items = (rows && rows.results ? rows.results : []).map(mapTask).map(t => { t.contact = ''; return t; });
    return json({ items, total: Number(countRow && countRow.c) || 0, page, pageSize });
  } catch (error) {
    console.error('errand list error:', error);
    return json({ error: 'internal error' }, 500);
  }
}

/* ---------- 我的任务（发布的/接的） ---------- */
async function myTasks(db, request) {
  const user = await sessionUser(db, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const url = new URL(request.url);
  const role = url.searchParams.get('role') || 'posted';
  if (!['posted', 'taken'].includes(role)) return json({ error: 'invalid role' }, 400);
  const page = clamp(Math.floor(num(url.searchParams.get('page')) || 1), 1, 1000);
  const pageSize = clamp(Math.floor(num(url.searchParams.get('pageSize')) || 20), 1, 50);
  const col = role === 'posted' ? 't.publisher_id' : 't.taker_id';
  try {
    const countRow = await db.prepare('SELECT COUNT(*) AS c FROM errand_tasks t WHERE ' + col + ' = ?').bind(user.id).first();
    const rows = await db.prepare(
      TASK_SELECT + 'WHERE ' + col + ' = ? ORDER BY t.created_at DESC LIMIT ? OFFSET ?'
    ).bind(user.id, pageSize, (page - 1) * pageSize).all();
    const items = (rows && rows.results ? rows.results : []).map(r => sanitizeContact(mapTask(r), user, r));
    return json({ items, total: Number(countRow && countRow.c) || 0, page, pageSize, role });
  } catch (error) {
    console.error('errand mine error:', error);
    return json({ error: 'internal error' }, 500);
  }
}

/* ---------- 详情（可选鉴权；联系方式仅双方可见） ---------- */
async function taskDetail(db, request, id) {
  let row;
  try {
    row = await db.prepare(TASK_SELECT + 'WHERE t.id = ?').bind(id).first();
  } catch (error) {
    // 2026-08-23 审查：DB 故障不再是「任务不存在」(404)，显式 503
    console.error('errand taskDetail error:', error);
    return json({ error: '服务繁忙，请稍后再试' }, 503);
  }
  if (!row) return json({ error: '任务不存在' }, 404);
  const user = await sessionUser(db, request).catch(() => null);
  const task = sanitizeContact(mapTask(row), user, row);
  return json({ task });
}

/* ---------- 接单（原子抢占） ---------- */
async function takeTask(db, request, id) {
  const user = await sessionUser(db, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const now = Date.now();
  const rate = await rateWindow(db, 'errand:take:' + user.id, 60 * 1000, 10);
  if (rate.failed) return json({ error: '服务繁忙，请稍后再试' }, 503);
  if (rate.count > 10) return json({ error: '操作太频繁，请稍后再试' }, 429);
  try {
    const result = await db.prepare(
      'UPDATE errand_tasks SET status = \'doing\', taker_id = ?, updated_at = ? ' +
      'WHERE id = ? AND status = \'open\' AND publisher_id != ? AND (deadline IS NULL OR deadline > ?)'
    ).bind(user.id, now, id, user.id, now).run();
    if (!result || !result.meta || Number(result.meta.changes) !== 1) {
      const row = await db.prepare('SELECT status, publisher_id, deadline FROM errand_tasks WHERE id = ?').bind(id).first();
      if (!row) return json({ error: '任务不存在' }, 404);
      if (row.publisher_id === user.id) return json({ error: '不能接自己发布的任务' }, 400);
      if (row.status === 'open' && row.deadline && Number(row.deadline) <= now) {
        await db.prepare(
          'UPDATE errand_tasks SET status = \'cancelled\', cancelled_at = ?, cancel_reason = ?, updated_at = ? ' +
          'WHERE id = ? AND status = \'open\''
        ).bind(now, '任务已过期，自动取消', now, id).run().catch(() => {});
        return json({ error: '任务已过期，无法接单', status: 'cancelled' }, 409);
      }
      return json({ error: row.status === 'open' ? '手慢了，任务已被接走' : '任务当前不可接单', status: row.status }, 409);
    }
    const row = await db.prepare(TASK_SELECT + 'WHERE t.id = ?').bind(id).first();
    return json({ ok: true, task: mapTask(row) });
  } catch (error) {
    console.error('errand take error:', error);
    return json({ error: '服务繁忙，请稍后再试' }, 503);
  }
}

/* ---------- 接单者标记完成 ---------- */
async function completeTask(db, request, id) {
  const user = await sessionUser(db, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const now = Date.now();
  let result;
  try {
    result = await db.prepare(
      'UPDATE errand_tasks SET status = \'done\', completed_at = ?, updated_at = ? ' +
      'WHERE id = ? AND status = \'doing\' AND taker_id = ?'
    ).bind(now, now, id, user.id).run();
  } catch (error) {
    // 2026-08-23 审查：DB 故障 → 503，与「无权限/状态不符」(400) 区分
    console.error('errand complete error:', error);
    return json({ error: '服务繁忙，请稍后再试' }, 503);
  }
  if (!result || !result.meta || Number(result.meta.changes) !== 1) return json({ error: '只有接单者能在进行中标记完成' }, 400);
  let row;
  try {
    row = await db.prepare(TASK_SELECT + 'WHERE t.id = ?').bind(id).first();
  } catch (error) {
    console.error('errand complete fetch error:', error);
    return json({ error: '服务繁忙，请稍后再试' }, 503);
  }
  return json({ ok: true, task: mapTask(row) });
}

/* ---------- 发布者确认完成（线下结算闭环） ---------- */
async function confirmTask(db, request, id) {
  const user = await sessionUser(db, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const now = Date.now();
  let result;
  try {
    result = await db.prepare(
      'UPDATE errand_tasks SET confirmed_at = ?, confirmed_by = \'publisher\', updated_at = ? ' +
      'WHERE id = ? AND status = \'done\' AND publisher_id = ? AND confirmed_at IS NULL'
    ).bind(now, now, id, user.id).run();
  } catch (error) {
    // 2026-08-23 审查：DB 故障 → 503
    console.error('errand confirm error:', error);
    return json({ error: '服务繁忙，请稍后再试' }, 503);
  }
  if (!result || !result.meta || Number(result.meta.changes) !== 1) return json({ error: '只有发布者能确认已完成的任务' }, 400);
  let row;
  try {
    row = await db.prepare(TASK_SELECT + 'WHERE t.id = ?').bind(id).first();
  } catch (error) {
    console.error('errand confirm fetch error:', error);
    return json({ error: '服务繁忙，请稍后再试' }, 503);
  }
  return json({ ok: true, task: mapTask(row) });
}

/* ---------- 取消（发布者 open/doing；接单者 doing） ---------- */
async function cancelTask(db, request, id) {
  const user = await sessionUser(db, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason || '').trim().slice(0, 100);
  const now = Date.now();
  try {
    const row = await db.prepare('SELECT status, publisher_id, taker_id FROM errand_tasks WHERE id = ?').bind(id).first();
    if (!row) return json({ error: '任务不存在' }, 404);
    if (row.status === 'cancelled') return json({ error: '任务已取消' }, 400);
    if (row.status === 'done') return json({ error: '任务已完成，不能取消' }, 400);
    const isPublisher = row.publisher_id === user.id;
    const isTaker = row.taker_id === user.id;
    if (!isPublisher && !isTaker) return json({ error: '无权操作该任务' }, 403);
    if (row.status === 'open' && !isPublisher) return json({ error: '只有发布者能取消待接单任务' }, 403);
    const defaultReason = isPublisher ? '发布者取消' : '接单者取消';
    // 条件 UPDATE：并发下另一请求可能已改状态/已被接走，按 changes 判定而非无条件覆盖
    const result = await db.prepare(
      'UPDATE errand_tasks SET status = \'cancelled\', cancelled_at = ?, cancel_reason = ?, updated_at = ? ' +
      'WHERE id = ? AND status IN (\'open\', \'doing\') AND (publisher_id = ? OR (status = \'doing\' AND taker_id = ?))'
    ).bind(now, reason || defaultReason, now, id, user.id, user.id).run();
    if (!result || !result.meta || Number(result.meta.changes) !== 1) {
      const cur = await db.prepare('SELECT status FROM errand_tasks WHERE id = ?').bind(id).first();
      if (!cur) return json({ error: '任务不存在' }, 404);
      if (cur.status === 'cancelled') return json({ error: '任务已取消' }, 400);
      return json({ error: '取消失败，任务状态已变化', status: cur.status }, 409);
    }
    const fresh = await db.prepare(TASK_SELECT + 'WHERE t.id = ?').bind(id).first();
    return json({ ok: true, task: mapTask(fresh) });
  } catch (error) {
    console.error('errand cancel error:', error);
    return json({ error: '服务繁忙，请稍后再试' }, 503);
  }
}

/* ---------- 评价（确认完成后双方互评，每人一次） ---------- */
/* ---------- 申诉（任务双方；doing/done/confirmed 可申诉） ---------- */
/* ---------- 入口 ---------- */
export async function handleErrand(request, env, path) {
  const db = env.DB;
  if (!db) return json({ error: 'db unavailable' }, 503);
  // 写请求全局体积预检（申诉详情按 createDispute 内 text() 精确校验）
  if (['POST', 'PATCH', 'PUT'].includes(request.method)) {
    const cl = Number(request.headers.get('content-length') || 0);
    if (cl > 1100000) return json({ error: '请求体过大（最大约 1MB）' }, 413);
  }
  if (path === '/api/errand/tasks' && request.method === 'POST') return createTask(db, request);
  if (path === '/api/errand/tasks' && request.method === 'GET') return listTasks(db, request);
  if (path === '/api/errand/mine' && request.method === 'GET') return myTasks(db, request);
  if (path === '/api/errand/reviews' && request.method === 'POST') return createReview(db, request);
  if (path === '/api/errand/reviews' && request.method === 'GET') return listReviews(db, request);
  if (path === '/api/errand/disputes' && request.method === 'POST') return createDispute(db, request, env);
  if (path === '/api/errand/disputes' && request.method === 'GET') return listDisputes(db, request, env);
  if (path === '/api/errand/admin/tasks' && request.method === 'GET') return adminTasks(db, request, env);
  if (path === '/api/errand/admin/logs' && request.method === 'GET') return listAdminLogs(db, request, env);
  const ev = path.match(/^\/api\/errand\/disputes\/(\d+)\/evidence$/);
  if (ev && request.method === 'GET') return listEvidence(db, request, env, Number(ev[1]));
  const evx = path.match(/^\/api\/errand\/evidence\/(\d+)$/);
  if (evx && request.method === 'GET') return serveEvidenceBinary(db, request, env, Number(evx[1]));
  const m = path.match(/^\/api\/errand\/tasks\/(\d+)(?:\/(take|complete|confirm|cancel))?$/);
  if (m) {
    const id = Number(m[1]);
    const action = m[2];
    if (!action && request.method === 'GET') return taskDetail(db, request, id);
    if (action === 'take' && request.method === 'POST') return takeTask(db, request, id);
    if (action === 'complete' && request.method === 'POST') return completeTask(db, request, id);
    if (action === 'confirm' && request.method === 'POST') return confirmTask(db, request, id);
    if (action === 'cancel' && request.method === 'POST') return cancelTask(db, request, id);
  }
  const adm = path.match(/^\/api\/errand\/admin\/tasks\/(\d+)$/);
  if (adm && request.method === 'DELETE') return adminDeleteTask(db, request, env, Number(adm[1]));
  const adm2 = path.match(/^\/api\/errand\/admin\/disputes\/(\d+)$/);
  if (adm2 && request.method === 'PATCH') return resolveDispute(db, request, env, Number(adm2[1]));
  if (ev || evx || m || adm || adm2) return json({ error: 'method not allowed' }, 405);
  return json({ error: 'not found' }, 404);
}
