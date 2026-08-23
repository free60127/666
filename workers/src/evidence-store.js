/* ============================================================
   证据对象存储（2026-08-23 审查第 6 项闭环）：R2 优先 + D1 base64 回退。
   独立模块避免 auth.js <-> errand.js 循环依赖。
   真实 R2 binding 未配置（wrangler.jsonc 无 r2_buckets / EVIDENCE_BUCKET）时：
   - createDispute 仍走 D1 base64（行为不变）；
   - 本模块全部函数安全跳过（返回空/0），不抛错、不产生副作用。
   启用步骤：Cloudflare Dashboard 启用 R2 -> 创建 bucket（如 waiyuan-evidence）
   -> wrangler.jsonc 加 r2_buckets binding EVIDENCE_BUCKET -> deploy。
   ============================================================ */

/** 尽力删除一组 R2 对象；返回 { deleted, failed }。R2 未启用时 no-op。 */
export async function deleteR2Objects(env, keys) {
  if (!env || !env.EVIDENCE_BUCKET) return { deleted: 0, failed: 0 };
  const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (!list.length) return { deleted: 0, failed: 0 };
  let deleted = 0;
  let failed = 0;
  for (const key of list) {
    try {
      await env.EVIDENCE_BUCKET.delete(key);
      deleted++;
    } catch (e) {
      failed++;
      console.error("evidence-store delete R2 failed:", key, e);
    }
  }
  return { deleted, failed };
}

/** 某任务下全部证据的 R2 对象键（含申诉双方上传）；供删除任务时清理。 */
export async function evidenceKeysForTask(db, taskId) {
  const rows = await db.prepare(
    "SELECT e.url FROM errand_evidence e JOIN errand_disputes d ON d.id = e.dispute_id WHERE d.task_id = ? AND e.url IS NOT NULL AND e.url != ''"
  ).bind(taskId).all();
  return (rows && rows.results ? rows.results : []).map(r => r.url).filter(Boolean);
}

/** 与某用户相关证据的 R2 对象键（申诉人本人 + 其发布/承接的任务）；供注销账号时清理。 */
export async function evidenceKeysForUser(db, userId) {
  const rows = await db.prepare(
    "SELECT DISTINCT e.url FROM errand_evidence e JOIN errand_disputes d ON d.id = e.dispute_id JOIN errand_tasks t ON t.id = d.task_id WHERE e.url IS NOT NULL AND e.url != '' AND (d.user_id = ? OR t.publisher_id = ? OR t.taker_id = ?)"
  ).bind(userId, userId, userId).all();
  return (rows && rows.results ? rows.results : []).map(r => r.url).filter(Boolean);
}
