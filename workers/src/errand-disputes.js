import { sessionUser } from './auth.js';
import { json, isAdmin } from './http.js';
import { corsFor } from './config.js';
import { deleteR2Objects, evidenceKeysForTask } from './evidence-store.js';
import { rateWindow } from './rate-limit.js';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };


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

const DISPUTE_SELECT =
  'SELECT d.id, d.task_id, d.user_id, d.role, d.reason, d.detail, d.status, d.admin_note, d.created_at, d.updated_at, u.nickname AS user_name ' +
  'FROM errand_disputes d LEFT JOIN users u ON u.id = d.user_id ';
const mapDispute = (r) => r ? ({ id: r.id, taskId: r.task_id, userId: r.user_id, role: r.role, reason: r.reason,
  detail: r.detail, status: r.status, adminNote: r.admin_note, createdAt: r.created_at, updatedAt: r.updated_at, userName: r.user_name }) : null;
// 非管理端版：不暴露 userId（审查项：隐藏内部 ID）
const mapDisputePublic = (r) => r ? ({ id: r.id, taskId: r.task_id, role: r.role, reason: r.reason,
  detail: r.detail, status: r.status, adminNote: r.admin_note, createdAt: r.created_at, updatedAt: r.updated_at, userName: r.user_name }) : null;

export async function createDispute(db, request, env) {
  const user = await sessionUser(db, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  // 请求体大小限制：证据 3×300000 + 正文，约 1MB 上限（按 UTF-8 字节计，中文 1 字=3 字节，不能用 raw.length）
  const raw = await request.text();
  const rawBytes = new TextEncoder().encode(raw).byteLength;
  if (!raw || rawBytes > 1100000) return json({ error: '请求体过大（最大约 1MB）' }, 413);
  let body = null;
  try { body = JSON.parse(raw); } catch (_) { return json({ error: 'invalid json' }, 400); }
  const taskId = Math.floor(num(body.taskId));
  if (!Number.isInteger(taskId) || taskId <= 0) return json({ error: 'invalid taskId' }, 400);
  const reason = String(body.reason || '').trim();
  if (!reason || reason.length > 60) return json({ error: '申诉理由必填，最长 60 字' }, 400);
  const detail = String(body.detail || '').trim().slice(0, 500);
  // 申诉限流：用户 60s/5 次 + IP 60s/20 次（审查项）
  const ip = String(request.headers.get('CF-Connecting-IP') || '').slice(0, 64);
  const rate = await rateWindow(db, 'errand:dp:' + user.id, 60 * 1000, 5);
  if (rate.failed) return json({ error: '服务繁忙，请稍后再试' }, 503);
  if (rate.count > 5) return json({ error: '申诉太频繁，请稍后再试' }, 429);
  if (ip) {
    const rateIp = await rateWindow(db, 'errand:dpip:' + ip, 60 * 1000, 20);
    if (rateIp.failed) return json({ error: '服务繁忙，请稍后再试' }, 503);
    if (rateIp.count > 20) return json({ error: '操作太频繁，请稍后再试' }, 429);
  }
  const evidence = Array.isArray(body.evidence) ? body.evidence.slice(0, 3) : [];
  let disputeId = null;
  let uploadedR2 = [];
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
    const evRe = new RegExp('^data:image\\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$');
    for (const ev of evidence) {
      const es = String(ev || '');
      if (!evRe.test(es) || es.length > 300000) continue;
      validEvidence.push(es);
    }
    if (validEvidence.length) {
      // 2026-08-23 审查第 6 项：R2 已启用（env.EVIDENCE_BUCKET）→ 图片入 R2，D1 只存元数据；
      // 未启用（线上当前状态）→ 回退存 base64 data 列（行为不变，切换只需加 R2 binding）
      if (env.EVIDENCE_BUCKET) {
        const evStmts = [];
        for (let i = 0; i < validEvidence.length; i++) {
          const es = validEvidence[i];
          const m = es.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
          const mime = m[1] === 'jpeg' ? 'image/jpeg' : 'image/' + m[1];
          const bin = Uint8Array.from(atob(m[2]), ch => ch.charCodeAt(0));
          const digest = await crypto.subtle.digest('SHA-256', bin);
          const sha = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
          const url = 'evidence/' + disputeId + '/' + i + '-' + sha + '.bin';
          await env.EVIDENCE_BUCKET.put(url, bin, { httpMetadata: { contentType: mime } });
          uploadedR2.push(url);
          evStmts.push(db.prepare('INSERT INTO errand_evidence (dispute_id, data, url, size, sha256, mime, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?)').bind(disputeId, url, bin.length, sha, mime, now));
        }
        try {
          await db.batch(evStmts);
        } catch (e) {
          // D1 元数据提交失败：清理已写入的 R2 对象，避免孤儿对象（审查第 6 项闭环）
          await deleteR2Objects(env, uploadedR2);
          throw e;
        }
      } else {
        const evStmts = validEvidence.map(ev => db.prepare('INSERT INTO errand_evidence (dispute_id, data, created_at) VALUES (?, ?, ?)').bind(disputeId, ev, now));
        await db.batch(evStmts);
      }
    }
    const row = await db.prepare(DISPUTE_SELECT + 'WHERE d.id = ?').bind(disputeId).first();
    return json({ ok: true, dispute: mapDispute(row) }, 201);
  } catch (error) {
    // 并发重复 open 申诉：唯一部分索引兜底
    if (String(error && error.message || '').includes('UNIQUE constraint failed')) {
      return json({ error: '已有进行中的申诉，请等待处理' }, 400);
    }
    if (uploadedR2.length) await deleteR2Objects(env, uploadedR2);  // R2 写入/后续任一步失败：回滚已写对象（审查第 6 项闭环）
    if (disputeId !== null) {
      await db.prepare('DELETE FROM errand_disputes WHERE id = ?').bind(disputeId).run().catch(() => {});
    }
    console.error('errand dispute error:', error);
    return json({ error: '服务繁忙，请稍后再试' }, 503);
  }
}

export async function listDisputes(db, request, env) {
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
export async function adminTasks(db, request, env) {
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

export async function adminDeleteTask(db, request, env, id) {
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
  // R2 证据对象先收集后删除（2026-08-23 审查第 6 项闭环；D1 级联删 evidence 行，R2 对象需单独清理）
  let evKeys;
  try { evKeys = await evidenceKeysForTask(db, id); }
  catch (e) { // 2026-08-23 审查第 2 轮第 3 项：键查询失败 fail-closed，避免 D1 删除后 R2 对象成孤儿
    console.error('adminDeleteTask evidence keys error:', e);
    return json({ error: '服务繁忙，请稍后再试' }, 503);
  }
  const result = await db.prepare('DELETE FROM errand_tasks WHERE id = ?').bind(id).run().catch(e => { console.error('errand admin delete:', e); return null; });
  if (!result || !result.meta || Number(result.meta.changes) < 1) return json({ error: '任务不存在' }, 404);
  if (evKeys.length) {
    const r = await deleteR2Objects(env, evKeys);
    if (r.failed) console.warn('adminDeleteTask R2 cleanup incomplete: failed=' + r.failed + '/' + evKeys.length);
  }
  await auditLog(db, env, 'errand.task.delete', 'task ' + id);
  return json({ ok: true });
}

export async function resolveDispute(db, request, env, id) {
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
/** 统一授权：管理端或任务双方（发布者/接单者）才可读取该申诉的证据 */
async function authorizeEvidence(db, request, env, disputeId) {
  const adminView = isAdmin(request, env);
  const user = await sessionUser(db, request).catch(() => null);
  if (!adminView && !user) return { status: 401, error: 'unauthorized' };
  let d;
  try { d = await db.prepare('SELECT task_id FROM errand_disputes WHERE id = ?').bind(disputeId).first(); }
  catch (e) { console.error('errand evidence dispute query error:', e); return { status: 503, error: '服务繁忙，请稍后再试' }; }
  if (!d) return { status: 404, error: '申诉不存在' };
  if (!adminView) {
    let task;
    try { task = await db.prepare('SELECT publisher_id, taker_id FROM errand_tasks WHERE id = ?').bind(d.task_id).first(); }
    catch (e) { console.error('errand evidence task query error:', e); return { status: 503, error: '服务繁忙，请稍后再试' }; }
    if (!task || (user.id !== task.publisher_id && user.id !== task.taker_id)) return { status: 403, error: '无权查看' };
  }
  return { ok: true };
}

export async function listEvidence(db, request, env, disputeId) {
  const auth = await authorizeEvidence(db, request, env, disputeId);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let rows;
  try { rows = await db.prepare('SELECT id, data, url, size, mime, created_at FROM errand_evidence WHERE dispute_id = ? ORDER BY id ASC').bind(disputeId).all(); }
  catch (e) { console.error('errand evidence list query error:', e); return json({ error: '服务繁忙，请稍后再试' }, 503); }
  // 内容不随列表返回（2026-08-23 审查第 6 项闭环）：统一走受权限保护的 GET /api/errand/evidence/:id，
  // 前端 fetch + blob 展示；此处只给元数据，避免把 base64 / R2 对象键直接暴露给客户端。
  return json({ evidence: (rows && rows.results ? rows.results : []).map(r => ({
    id: r.id, mime: r.mime || 'image/png', size: r.size || null,
    createdAt: r.created_at, stored: r.url ? 'r2' : (r.data ? 'd1' : 'none'),
  })) });
}

/* 受权限保护的证据二进制下载：R2 对象或 D1 base64 都经鉴权后返回二进制。
   R2 未启用/读取失败时显式报错，不把桶内对象名泄露给客户端。 */
export async function serveEvidenceBinary(db, request, env, evidenceId) {
  let row;
  try { row = await db.prepare('SELECT id, dispute_id, data, url, mime FROM errand_evidence WHERE id = ?').bind(evidenceId).first(); }
  catch (e) { console.error('errand evidence get error:', e); return json({ error: '服务繁忙，请稍后再试' }, 503); }
  if (!row) return json({ error: '证据不存在' }, 404);
  const auth = await authorizeEvidence(db, request, env, row.dispute_id);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  // mime：优先表列；老 base64 记录（0014 前无 mime 列）按 dataURL 前缀推导
  const rawData = String(row.data || '');
  const mime = row.mime || (rawData.startsWith('data:image/png') ? 'image/png' : rawData.startsWith('data:image/jpeg') ? 'image/jpeg' : 'application/octet-stream');
  const headers = { 'Content-Type': mime, 'Cache-Control': 'private, max-age=3600', ...corsFor(request) };
  if (row.url) {
    if (!env.EVIDENCE_BUCKET) {
      return json({ error: '证据已迁 R2 但当前未配置 EVIDENCE_BUCKET（r2_buckets binding），请联系管理员启用 R2 后重试' }, 503);
    }
    let obj;
    try { obj = await env.EVIDENCE_BUCKET.get(row.url); }
    catch (e) { console.error('errand evidence R2 get error:', e); return json({ error: '服务繁忙，请稍后再试' }, 503); }
    if (!obj) return json({ error: '证据对象不存在' }, 404);
    return new Response(obj.body, { headers });
  }
  if (row.data) {
    try {
      const b64 = String(row.data).split(',')[1] || String(row.data);
      const bin = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
      return new Response(bin, { headers });
    } catch (e) {
      console.error('errand evidence data decode error:', e);
      return json({ error: '证据数据损坏' }, 500);
    }
  }
  return json({ error: '证据内容缺失' }, 404);
}

/* ---------- 管理端：审计日志 ---------- */
export async function listAdminLogs(db, request, env) {
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
  const url = new URL(request.url);
  const page = clamp(Math.floor(num(url.searchParams.get('page')) || 1), 1, 1000);
  const pageSize = clamp(Math.floor(num(url.searchParams.get('pageSize')) || 30), 1, 100);
  const rows = await db.prepare('SELECT id, action, detail, admin, created_at FROM admin_logs ORDER BY id DESC LIMIT ? OFFSET ?').bind(pageSize, (page - 1) * pageSize).all();
  const countRow = await db.prepare('SELECT COUNT(*) AS c FROM admin_logs').first();
  return json({ logs: (rows && rows.results ? rows.results : []).map(r => ({ id: r.id, action: r.action, detail: r.detail, admin: r.admin, createdAt: r.created_at })),
    total: Number(countRow && countRow.c) || 0, page, pageSize });
}
