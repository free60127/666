/* ============================================================
   跑腿平台模块（D1 版）：发布任务 / 列表 / 详情 / 原子接单 /
   完成确认 / 取消。与现有账号体系同库（users + sessions）。
   状态机：open（待接单）→ doing（已接单）→ done（接单者标记完成）
   → confirmed_at（发布者确认，线下结算）；任意未完成态可 cancelled。
   接单并发：UPDATE ... WHERE status='open' 原子抢占（D1 事务）。
   ============================================================ */
import { sessionUser } from './auth.js';
import { json, isAdmin } from './http.js';


const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/* 限流计数（rate 表滚动窗口，与 auth.js resetAttemptCheck 同模式）。
   返回 { count, failed }：failed=true 表示限流存储故障——写操作必须保守失败（503），
   不能静默放行（放行会让攻击者绕过所有写限流）。 */
async function rateHit(db, key, windowMs, max) {
  const now = Date.now();
  const winStart = Math.floor(now / windowMs) * windowMs;
  const winEnd = winStart + windowMs;
  try {
    const row = await db.prepare(
      'INSERT INTO rate (key, count, until) VALUES (?1, 1, ?2) ' +
      'ON CONFLICT(key) DO UPDATE SET ' +
      'count = CASE WHEN rate.until <= ?3 THEN 1 ELSE rate.count + 1 END, ' +
      'until = CASE WHEN rate.until <= ?3 THEN ?4 ELSE rate.until END ' +
      'RETURNING count'
    ).bind(key, winEnd, winStart, winEnd).first();
    return { count: Number(row && row.count) || 0, failed: false };
  } catch (e) {
    console.error('rateHit error:', e);
    return { count: 0, failed: true };
  }
}

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
  const rate = await rateHit(db, 'errand:pub:' + user.id, 10 * 60 * 1000, 30);
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
  const rate = await rateHit(db, 'errand:take:' + user.id, 60 * 1000, 10);
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
const REVIEW_SELECT =
  'SELECT r.id, r.task_id, r.reviewer_id, r.reviewee_id, r.rating, r.comment, r.created_at, u.nickname AS reviewer_name ' +
  'FROM errand_reviews r LEFT JOIN users u ON u.id = r.reviewer_id ';
const mapReview = (r) => r ? ({ id: r.id, taskId: r.task_id, reviewerId: r.reviewer_id, revieweeId: r.reviewee_id,
  rating: r.rating, comment: r.comment, createdAt: r.created_at, reviewerName: r.reviewer_name }) : null;
// 公开版：不暴露内部用户 ID（审查项：隐藏内部 ID）
const mapReviewPublic = (r) => r ? ({ id: r.id, taskId: r.task_id,
  rating: r.rating, comment: r.comment, createdAt: r.created_at, reviewerName: r.reviewer_name }) : null;

async function createReview(db, request) {
  const user = await sessionUser(db, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'invalid json' }, 400);
  const taskId = Math.floor(num(body.taskId));
  if (!Number.isInteger(taskId) || taskId <= 0) return json({ error: 'invalid taskId' }, 400);
  const rating = Math.floor(num(body.rating));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: '评分需为 1~5 的整数' }, 400);
  const comment = String(body.comment || '').trim().slice(0, 200);
  try {
    const task = await db.prepare('SELECT id, publisher_id, taker_id, confirmed_at FROM errand_tasks WHERE id = ?').bind(taskId).first();
    if (!task) return json({ error: '任务不存在' }, 404);
    if (!task.confirmed_at) return json({ error: '任务确认完成后才能评价' }, 400);
    const isPublisher = task.publisher_id === user.id;
    const isTaker = task.taker_id === user.id;
    if (!isPublisher && !isTaker) return json({ error: '只有任务双方可以评价' }, 403);
    const revieweeId = isPublisher ? task.taker_id : task.publisher_id;
    if (!revieweeId) return json({ error: '对方账号不存在' }, 400);
    const dup = await db.prepare('SELECT id FROM errand_reviews WHERE task_id = ? AND reviewer_id = ?').bind(taskId, user.id).first();
    if (dup) return json({ error: '已评价过该任务' }, 400);
    const result = await db.prepare(
      'INSERT INTO errand_reviews (task_id, reviewer_id, reviewee_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(taskId, user.id, revieweeId, rating, comment, Date.now()).run();
    const row = await db.prepare(REVIEW_SELECT + 'WHERE r.id = ?').bind(result.meta.last_row_id).first();
    return json({ ok: true, review: mapReviewPublic(row) }, 201);
  } catch (error) {
    // 并发双发：UNIQUE(task_id, reviewer_id) 约束兜底
    if (String(error && error.message || '').includes('UNIQUE constraint failed')) {
      return json({ error: '已评价过该任务' }, 400);
    }
    console.error('errand review error:', error);
    return json({ error: 'internal error' }, 500);
  }
}

async function listReviews(db, request) {
  const url = new URL(request.url);
  const taskId = Math.floor(num(url.searchParams.get('taskId')));
  if (!Number.isInteger(taskId) || taskId <= 0) return json({ error: 'invalid taskId' }, 400);
  try {
    const rows = await db.prepare(REVIEW_SELECT + 'WHERE r.task_id = ? ORDER BY r.created_at DESC').bind(taskId).all();
    return json({ reviews: (rows && rows.results ? rows.results : []).map(mapReviewPublic) });
  } catch (error) {
    console.error('errand reviews list error:', error);
    return json({ error: 'internal error' }, 500);
  }
}

/* ---------- 申诉（任务双方；doing/done/confirmed 可申诉） ---------- */
const DISPUTE_SELECT =
  'SELECT d.id, d.task_id, d.user_id, d.role, d.reason, d.detail, d.status, d.admin_note, d.created_at, d.updated_at, u.nickname AS user_name ' +
  'FROM errand_disputes d LEFT JOIN users u ON u.id = d.user_id ';
const mapDispute = (r) => r ? ({ id: r.id, taskId: r.task_id, userId: r.user_id, role: r.role, reason: r.reason,
  detail: r.detail, status: r.status, adminNote: r.admin_note, createdAt: r.created_at, updatedAt: r.updated_at, userName: r.user_name }) : null;
// 非管理端版：不暴露 userId（审查项：隐藏内部 ID）
const mapDisputePublic = (r) => r ? ({ id: r.id, taskId: r.task_id, role: r.role, reason: r.reason,
  detail: r.detail, status: r.status, adminNote: r.admin_note, createdAt: r.created_at, updatedAt: r.updated_at, userName: r.user_name }) : null;

async function createDispute(db, request, env) {
  const user = await sessionUser(db, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  // 请求体大小限制：证据 3×300000 + 正文，约 1MB 上限
  const raw = await request.text();
  if (!raw || raw.length > 1100000) return json({ error: '请求体过大（最大约 1MB）' }, 413);
  let body = null;
  try { body = JSON.parse(raw); } catch (_) { return json({ error: 'invalid json' }, 400); }
  const taskId = Math.floor(num(body.taskId));
  if (!Number.isInteger(taskId) || taskId <= 0) return json({ error: 'invalid taskId' }, 400);
  const reason = String(body.reason || '').trim();
  if (!reason || reason.length > 60) return json({ error: '申诉理由必填，最长 60 字' }, 400);
  const detail = String(body.detail || '').trim().slice(0, 500);
  // 申诉限流：用户 60s/5 次 + IP 60s/20 次（审查项）
  const ip = String(request.headers.get('CF-Connecting-IP') || '').slice(0, 64);
  const rate = await rateHit(db, 'errand:dp:' + user.id, 60 * 1000, 5);
  if (rate.failed) return json({ error: '服务繁忙，请稍后再试' }, 503);
  if (rate.count > 5) return json({ error: '申诉太频繁，请稍后再试' }, 429);
  if (ip) {
    const rateIp = await rateHit(db, 'errand:dpip:' + ip, 60 * 1000, 20);
    if (rateIp.failed) return json({ error: '服务繁忙，请稍后再试' }, 503);
    if (rateIp.count > 20) return json({ error: '操作太频繁，请稍后再试' }, 429);
  }
  const evidence = Array.isArray(body.evidence) ? body.evidence.slice(0, 3) : [];
  let disputeId = null;
  try {
    const task = await db.prepare('SELECT id, publisher_id, taker_id, status FROM errand_tasks WHERE id = ?').bind(taskId).first();
    if (!task) return json({ error: '任务不存在' }, 404);
    if (task.status === 'open' || task.status === 'cancelled') return json({ error: '该状态任务无法申诉' }, 400);
    const isPublisher = task.publisher_id === user.id;
    const isTaker = task.taker_id === user.id;
    if (!isPublisher && !isTaker) return json({ error: '只有任务双方可以申诉' }, 403);
    const dup = await db.prepare("SELECT id FROM errand_disputes WHERE task_id = ? AND user_id = ? AND status = 'open'").bind(taskId, user.id).first();
    if (dup) return json({ error: '已有进行中的申诉，请等待处理' }, 400);
    const now = Date.now();
    const role = isPublisher ? 'publisher' : 'taker';
    const result = await db.prepare(
      "INSERT INTO errand_disputes (task_id, user_id, role, reason, detail, status, admin_note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'open', '', ?, ?)"
    ).bind(taskId, user.id, role, reason, detail, now, now).run();
    disputeId = result.meta.last_row_id;
        // 证据入库（2026-08-23 审查）：过滤非法项后整体 batch 原子提交；
    // 任一失败由外层 catch 回滚删除申诉（级联删证据），不留半成品
    const validEvidence = [];
    for (const ev of evidence) {
      const es = String(ev || '');
      const evRe = new RegExp('^data:image\\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$');
      if (!evRe.test(es) || es.length > 300000) continue;
      validEvidence.push(es);
    }
    if (validEvidence.length) {
      const evStmts = validEvidence.map(ev => db.prepare('INSERT INTO errand_evidence (dispute_id, data, created_at) VALUES (?, ?, ?)').bind(disputeId, ev, now));
      await db.batch(evStmts);
    }
const row = await db.prepare(DISPUTE_SELECT + 'WHERE d.id = ?').bind(disputeId).first();
    return json({ ok: true, dispute: mapDispute(row) }, 201);
  } catch (error) {
    // 并发重复 open 申诉：唯一部分索引兜底
    if (String(error && error.message || '').includes('UNIQUE constraint failed')) {
      return json({ error: '已有进行中的申诉，请等待处理' }, 400);
    }
    if (disputeId !== null) {
      await db.prepare('DELETE FROM errand_disputes WHERE id = ?').bind(disputeId).run().catch(() => {});
    }
    console.error('errand dispute error:', error);
    return json({ error: '服务繁忙，请稍后再试' }, 503);
  }
}

async function listDisputes(db, request, env) {
  const url = new URL(request.url);
  const taskId = Math.floor(num(url.searchParams.get('taskId')));
  const adminView = isAdmin(request, env);
  const user = await sessionUser(db, request).catch(() => null);
  if (Number.isInteger(taskId) && taskId > 0) {
    const task = await db.prepare('SELECT publisher_id, taker_id FROM errand_tasks WHERE id = ?').bind(taskId).first();
    if (!task) return json({ error: '任务不存在' }, 404);
    const ok2 = adminView || (user && (user.id === task.publisher_id || user.id === task.taker_id));
    if (!ok2) return json({ error: '无权查看' }, 403);
    const rows = await db.prepare(DISPUTE_SELECT + 'WHERE d.task_id = ? ORDER BY d.created_at DESC').bind(taskId).all();
    return json({ disputes: (rows && rows.results ? rows.results : []).map(adminView ? mapDispute : mapDisputePublic) });
  }
  if (!adminView) return json({ error: 'unauthorized' }, 401);
  const rows = await db.prepare(DISPUTE_SELECT + 'ORDER BY d.created_at DESC LIMIT 100').all();
  return json({ disputes: (rows && rows.results ? rows.results : []).map(mapDispute) });
}

/* ---------- 管理端：任务列表 / 物理删除 / 申诉处理 ---------- */
async function adminTasks(db, request, env) {
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
  const url = new URL(request.url);
  const status = String(url.searchParams.get('status') || 'all');
  if (!['all', 'open', 'doing', 'done', 'cancelled'].includes(status)) return json({ error: 'invalid status' }, 400);
  const page = clamp(Math.floor(num(url.searchParams.get('page')) || 1), 1, 1000);
  const pageSize = clamp(Math.floor(num(url.searchParams.get('pageSize')) || 20), 1, 50);
  const where = status === 'all' ? '' : 'WHERE t.status = ?';
  const params = status === 'all' ? [] : [status];
  const countRow = await db.prepare('SELECT COUNT(*) AS c FROM errand_tasks t ' + where).bind(...params).first();
  const rows = await db.prepare(TASK_SELECT + where + ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?').bind(...params, pageSize, (page - 1) * pageSize).all();
  return json({ items: (rows && rows.results ? rows.results : []).map(mapTask), total: Number(countRow && countRow.c) || 0, page, pageSize });
}

/* 管理操作审计：写 admin_logs（admin 标识用令牌前缀，避免落明文令牌） */
async function auditLog(db, env, action, detail) {
  try {
    await db.prepare(
      'INSERT INTO admin_logs (action, detail, admin, created_at) VALUES (?, ?, ?, ?)'
    ).bind(action, String(detail || '').slice(0, 500), String(env.ADMIN_TOKEN || '').slice(0, 8), Date.now()).run();
  } catch (e) { console.error('auditLog error:', e); }
}

async function adminDeleteTask(db, request, env, id) {
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
  const result = await db.prepare('DELETE FROM errand_tasks WHERE id = ?').bind(id).run().catch(e => { console.error('errand admin delete:', e); return null; });
  if (!result || !result.meta || Number(result.meta.changes) < 1) return json({ error: '任务不存在' }, 404);
  await auditLog(db, env, 'errand.task.delete', 'task ' + id);
  return json({ ok: true });
}

async function resolveDispute(db, request, env, id) {
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  if (!['resolved', 'rejected'].includes(body.status)) return json({ error: 'invalid status' }, 400);
  const note = String(body.note || '').trim().slice(0, 300);
  const now = Date.now();
  let result;
  try {
    result = await db.prepare("UPDATE errand_disputes SET status = ?, admin_note = ?, updated_at = ? WHERE id = ? AND status = 'open'").bind(body.status, note, now, id).run();
  } catch (e) {
    console.error('errand resolve:', e);
    return json({ error: '服务繁忙，请稍后再试' }, 503);
  }
  if (!result || !result.meta || Number(result.meta.changes) !== 1) return json({ error: '申诉不存在或已处理' }, 400);
  await auditLog(db, env, 'errand.dispute.resolve', 'dispute ' + id + ' -> ' + body.status + (note ? ' (' + note + ')' : ''));
  let row;
  try { row = await db.prepare(DISPUTE_SELECT + 'WHERE d.id = ?').bind(id).first(); }
  catch (e) { console.error('errand resolve fetch error:', e); return json({ error: '服务繁忙，请稍后再试' }, 503); }
  return json({ ok: true, dispute: mapDispute(row) });
}

/* ---------- 证据读取（管理端或任务双方可见） ---------- */
async function listEvidence(db, request, env, disputeId) {
  const adminView = isAdmin(request, env);
  const user = await sessionUser(db, request).catch(() => null);
  if (!adminView && !user) return json({ error: 'unauthorized' }, 401);
  let d;
  try { d = await db.prepare('SELECT task_id FROM errand_disputes WHERE id = ?').bind(disputeId).first(); }
  catch (e) { console.error('errand evidence dispute query error:', e); return json({ error: '服务繁忙，请稍后再试' }, 503); }
  if (!d) return json({ error: '申诉不存在' }, 404);
  if (!adminView) {
    let task;
    try { task = await db.prepare('SELECT publisher_id, taker_id FROM errand_tasks WHERE id = ?').bind(d.task_id).first(); }
    catch (e) { console.error('errand evidence task query error:', e); return json({ error: '服务繁忙，请稍后再试' }, 503); }
    if (!task || (user.id !== task.publisher_id && user.id !== task.taker_id)) return json({ error: '无权查看' }, 403);
  }
  const rows = await db.prepare('SELECT id, data, created_at FROM errand_evidence WHERE dispute_id = ? ORDER BY id ASC').bind(disputeId).all();
  return json({ evidence: (rows && rows.results ? rows.results : []).map(r => ({ id: r.id, data: r.data, createdAt: r.created_at })) });
}

/* ---------- 管理端：审计日志 ---------- */
async function listAdminLogs(db, request, env) {
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
  const url = new URL(request.url);
  const page = clamp(Math.floor(num(url.searchParams.get('page')) || 1), 1, 1000);
  const pageSize = clamp(Math.floor(num(url.searchParams.get('pageSize')) || 30), 1, 100);
  const rows = await db.prepare('SELECT id, action, detail, admin, created_at FROM admin_logs ORDER BY id DESC LIMIT ? OFFSET ?').bind(pageSize, (page - 1) * pageSize).all();
  const countRow = await db.prepare('SELECT COUNT(*) AS c FROM admin_logs').first();
  return json({ logs: (rows && rows.results ? rows.results : []).map(r => ({ id: r.id, action: r.action, detail: r.detail, admin: r.admin, createdAt: r.created_at })),
    total: Number(countRow && countRow.c) || 0, page, pageSize });
}
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
  if (ev || m || adm || adm2) return json({ error: 'method not allowed' }, 405);
  return json({ error: 'not found' }, 404);
}