/* ============================================================
   跑腿任务图片（2026-08-24）：R2 优先 + D1 base64 回退（与申诉证据同模式）。
   - 发布任务时最多 3 张，前端 canvas 压缩到 <=200KB（base64 <=274400 字符）；
   - env.EVIDENCE_BUCKET 未配置（R2 未启用）→ 存 D1 task_images.data 列，行为不变；
   - 启用 R2 后：D1 只存元数据（data=''），对象键 task/{taskId}/{i}-{sha256}.bin；
   - 图片公开只读（买家看「出闲置」实物图等），端点 /api/errand/task-images/:id。
   删除清理：adminDeleteTask / 注销账号时先 taskImageKeysForTask 收集 R2 键，
   删除任务后经 deleteR2Objects 清理（失败入 r2:pending-cleanup 由 cron 重试）。
   ============================================================ */
import { deleteR2Objects } from './evidence-store.js';

export const TASK_IMAGE_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
export const TASK_IMAGE_MAX_LEN = 300000; // 每张 base64 字符上限（≈220KB 文件）
export const TASK_IMAGE_MAX_COUNT = 3;

export function taskImageMime(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp);base64,/.exec(String(dataUrl || ''));
  if (!m) return null;
  return m[1] === 'jpeg' ? 'image/jpeg' : 'image/' + m[1];
}

/** 过滤合法图片项（非法/超限静默跳过，与申诉证据一致），最多 TASK_IMAGE_MAX_COUNT 张 */
export function validTaskImages(images) {
  const list = Array.isArray(images) ? images : [];
  const out = [];
  for (const v of list) {
    const s = String(v || '');
    if (!TASK_IMAGE_RE.test(s) || s.length > TASK_IMAGE_MAX_LEN) continue;
    out.push(s);
    if (out.length >= TASK_IMAGE_MAX_COUNT) break;
  }
  return out;
}

/** 任务图片元数据（公开详情也返回，不含 data 内容）；R2 模式 stored=true */
export async function taskImagesForTask(db, taskId) {
  const rows = await db.prepare(
    'SELECT id, mime, size, url, created_at FROM errand_task_images WHERE task_id = ? ORDER BY id ASC'
  ).bind(taskId).all();
  const list = (rows && rows.results ? rows.results : []).map(r => ({
    id: r.id, mime: r.mime || '', size: Number(r.size) || 0,
    stored: !!(r.url && r.url.length > 0), createdAt: r.created_at,
  }));
  return list;
}

/** 写入一组已过滤的图片（调用方保证 valid）；返回 R2 已写入对象键（用于回滚）。
    D1 元数据 batch 失败 → 清理已写 R2 对象后抛错（调用方回滚整单）。 */
export async function storeTaskImages(db, env, taskId, images, now) {
  const valid = validTaskImages(images);
  if (!valid.length) return [];
  const uploadedR2 = [];
  if (env && env.EVIDENCE_BUCKET) {
    const stmts = [];
    for (let i = 0; i < valid.length; i++) {
      const es = valid[i];
      const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(es);
      const mime = m[1] === 'jpeg' ? 'image/jpeg' : 'image/' + m[1];
      const bin = Uint8Array.from(atob(m[2]), ch => ch.charCodeAt(0));
      const digest = await crypto.subtle.digest('SHA-256', bin);
      const sha = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      const url = 'task/' + taskId + '/' + i + '-' + sha + '.bin';
      await env.EVIDENCE_BUCKET.put(url, bin, { httpMetadata: { contentType: mime } });
      uploadedR2.push(url);
      stmts.push(db.prepare(
        'INSERT INTO errand_task_images (task_id, data, url, size, sha256, mime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(taskId, '', url, bin.length, sha, mime, now));
    }
    try {
      await db.batch(stmts);
    } catch (e) {
      await deleteR2Objects(env, uploadedR2).catch(() => {});
      throw e;
    }
    return uploadedR2;
  }
  // D1 回退：base64 直接入 data 列（同时记 size/mime，供前端展示；二进制由 serveTaskImage 从 dataURL 解码）
  await db.batch(valid.map(ev => {
    const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(ev);
    const mime = m ? (m[1] === 'jpeg' ? 'image/jpeg' : 'image/' + m[1]) : '';
    let size = 0;
    try { size = m ? Uint8Array.from(atob(m[2]), ch => ch.charCodeAt(0)).length : 0; } catch (_) { size = 0; }
    return db.prepare(
      'INSERT INTO errand_task_images (task_id, data, size, mime, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(taskId, ev, size, mime, now);
  }));
  return [];
}

/** 收集某用户发布的全部任务 R2 对象键（注销账号前调用） */
export async function taskImageKeysForUser(db, userId) {
  const rows = await db.prepare(
    'SELECT ti.url FROM errand_task_images ti JOIN errand_tasks t ON t.id = ti.task_id ' +
    'WHERE t.publisher_id = ? AND ti.url IS NOT NULL AND ti.url != \'\''
  ).bind(userId).all();
  return (rows && rows.results ? rows.results : []).map(r => r.url).filter(Boolean);
}

/** 公开只读图片端点：返回 Response（含 404/503），无鉴权（买家看商品图）。
    R2 优先；老记录/未启用 R2 时从 D1 data 列解码。 */
export async function serveTaskImage(db, env, id) {
  if (!id || id <= 0) return null;
  let row;
  try {
    row = await db.prepare(
      'SELECT ti.id, ti.data, ti.url, ti.mime, ti.size, ti.sha256 FROM errand_task_images ti WHERE ti.id = ?'
    ).bind(id).first();
  } catch (e) {
    console.error('errand task image query error:', e);
    return null;
  }
  if (!row) return null;
  let bin = null;
  let mime = row.mime || 'image/jpeg';
  if (row.url && row.url.length > 0) {
    if (!env || !env.EVIDENCE_BUCKET) return null; // 元数据指向 R2 但 binding 缺失：503 语义由调用方处理
    try {
      const obj = await env.EVIDENCE_BUCKET.get(row.url);
      if (!obj) return null;
      bin = await obj.arrayBuffer();
    } catch (e) {
      console.error('errand task image R2 get error:', e);
      return null;
    }
  } else if (row.data && row.data.length > 0) {
    const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(row.data);
    if (!m) return null;
    mime = m[1] === 'jpeg' ? 'image/jpeg' : 'image/' + m[1];
    try { bin = Uint8Array.from(atob(m[2]), ch => ch.charCodeAt(0)); } catch (e) { return null; }
  } else {
    return null;
  }
  return new Response(bin, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/** 收集某任务的 R2 对象键（删除任务/账号前调用；无 R2 记录返回 []） */
export async function taskImageKeysForTask(db, taskId) {
  const rows = await db.prepare(
    'SELECT url FROM errand_task_images WHERE task_id = ? AND url IS NOT NULL AND url != \'\''
  ).bind(taskId).all();
  return (rows && rows.results ? rows.results : []).map(r => r.url).filter(Boolean);
}