/* ============================================================
   证据对象存储（2026-08-23 审查第 6 项闭环）：R2 优先 + D1 base64 回退。
   独立模块避免 auth.js <-> errand.js 循环依赖。
   真实 R2 binding 未配置（wrangler.jsonc 无 r2_buckets / EVIDENCE_BUCKET）时：
   - createDispute 仍走 D1 base64（行为不变）；
   - 本模块全部函数安全跳过（返回空/0），不抛错、不产生副作用。
   启用步骤：Cloudflare Dashboard 启用 R2 -> 创建 bucket（如 waiyuan-evidence）
   -> wrangler.jsonc 加 r2_buckets binding EVIDENCE_BUCKET -> deploy。
   2026-08-23 审查第 2 轮：删除失败记入 KV r2:pending-cleanup 供 cron 重试；
   evidenceKeysForTask/User 查询失败向上抛错，由调用方 fail-closed（503 拒绝删除）。
   并发说明：KV pending 采用读-改-写（无 CAS），当前唯一写者是 cron cleanupDb；
   若未来出现多写者（如多实例/手动触发），应把 pending 记录迁到 D1 表或改用 KV CAS 语义。
   状态未知即 fail-safe：读取/解析失败绝不当作「无 pending」，也不覆盖旧值。
   ============================================================ */

/** 尽力删除一组 R2 对象；返回 { deleted, failed, failedKeys }。R2 未启用时 no-op。
    删除失败的对象键会尝试写入 KV r2:pending-cleanup（TTL 30 天）供定时任务重试。 */
export async function deleteR2Objects(env, keys) {
  if (!env || !env.EVIDENCE_BUCKET) return { deleted: 0, failed: 0, failedKeys: [] };
  const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (!list.length) return { deleted: 0, failed: 0, failedKeys: [] };
  let deleted = 0;
  const failedKeys = [];
  for (const key of list) {
    try {
      await env.EVIDENCE_BUCKET.delete(key);
      deleted++;
    } catch (e) {
      failedKeys.push(key);
      console.error('evidence-store delete R2 failed:', key, e);
    }
  }
  if (failedKeys.length) {
    await recordPendingR2(env, failedKeys).catch(() => {}); // 记录失败不阻断主流程（日志已留痕）
  }
  return { deleted, failed: failedKeys.length, failedKeys };
}

/** 将失败的 R2 删除键合并记录到 KV r2:pending-cleanup（数组 JSON，TTL 30 天）。
    fail-safe：旧记录读取/解析失败时不覆盖旧值（保留 KV 原样），返回 false 并留日志；
    KV 不可用（未配置 get/put）时也返回 false。 */
export async function recordPendingR2(env, keys) {
  if (!env || !env.STUDY_KV || typeof env.STUDY_KV.get !== 'function' || typeof env.STUDY_KV.put !== 'function') return false;
  const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (!list.length) return true;
  let raw;
  try {
    raw = await env.STUDY_KV.get('r2:pending-cleanup');
  } catch (e) {
    // 读失败 = 无法安全合并：不写入，保留可能存在的旧值，本轮失败键靠日志留痕后由人工/下轮处理。
    console.error('evidence-store read pending R2 failed, skip write to preserve old value:', e);
    return false;
  }
  let existing = [];
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) throw new Error('not array');
      existing = arr.filter(Boolean);
    } catch (e) {
      // 存量数据损坏：绝不能静默当作空/覆盖旧值。保留 KV 原值，仅日志告警。
      console.error('evidence-store pending R2 record corrupt, SKIP write to preserve original. raw head:', String(raw).slice(0, 200));
      return false;
    }
  }
  const merged = Array.from(new Set([...existing, ...list]));
  try {
    await env.STUDY_KV.put('r2:pending-cleanup', JSON.stringify(merged), { expirationTtl: 30 * 86400 });
    return true;
  } catch (e) {
    console.error('evidence-store record pending R2 failed:', e);
    return false;
  }
}

/** 读取待重试的 R2 对象键。
    无记录/空记录 → [];KV 读取或解析失败 → null（调用方必须按「未知」处理，不能当作无 pending）。 */
export async function pendingR2Keys(env) {
  if (!env || !env.STUDY_KV || typeof env.STUDY_KV.get !== 'function') return [];
  let raw;
  try {
    raw = await env.STUDY_KV.get('r2:pending-cleanup');
  } catch (e) {
    console.error('evidence-store read pending R2 failed:', e);
    return null;
  }
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch (e) {
    console.error('evidence-store pending R2 parse failed; preserving raw data, do NOT treat as empty. raw head:', String(raw).slice(0, 200));
    return null;
  }
}

/** 重试此前失败的 R2 删除（供 cron cleanupDb 周期调用）。
    读取失败（null）→ 跳过且保留数据（pending:-1, error='pending-read-failed'）。
    全部成功 → 清 pending；但 KV.clear 失败不谎报 pending=0（返回 pending=原键数，等待下轮重试）。 */
export async function retryPendingR2(env) {
  const keys = await pendingR2Keys(env);
  if (keys === null) return { deleted: 0, failed: 0, failedKeys: [], pending: -1, error: 'pending-read-failed' };
  if (!keys.length) return { deleted: 0, failed: 0, failedKeys: [], pending: 0 };
  const res = await deleteR2Objects(env, keys);
  if (res.failed > 0) {
    await recordPendingR2(env, res.failedKeys).catch(() => {});
    return { ...res, pending: res.failedKeys.length };
  }
  if (env && env.STUDY_KV && typeof env.STUDY_KV.delete === 'function') {
    try {
      await env.STUDY_KV.delete('r2:pending-cleanup');
      return { ...res, pending: 0 };
    } catch (e) {
      console.error('evidence-store clear pending R2 failed; pending keys retained:', e);
      return { ...res, pending: keys.length };
    }
  }
  // KV clean 不可用：对象已删但记录无法确认清空，保守返回 pending=键数（保底重试无害）
  return { ...res, pending: keys.length };
}

/** 某任务下全部证据的 R2 对象键（含申诉双方上传）；供删除任务时清理。
    DB 查询失败会抛错，调用方应 fail-closed（返回 503，不继续删除 D1 行造成 R2 孤儿）。 */
export async function evidenceKeysForTask(db, taskId) {
  const rows = await db.prepare(
    "SELECT e.url FROM errand_evidence e JOIN errand_disputes d ON d.id = e.dispute_id WHERE d.task_id = ? AND e.url IS NOT NULL AND e.url != ''"
  ).bind(taskId).all();
  return (rows && rows.results ? rows.results : []).map(r => r.url).filter(Boolean);
}

/** 与某用户相关证据的 R2 对象键（申诉人本人 + 其发布/承接的任务）；供注销账号时清理。
    DB 查询失败会抛错，调用方应 fail-closed（返回 503，不继续删除账号造成 R2 孤儿）。 */
export async function evidenceKeysForUser(db, userId) {
  const rows = await db.prepare(
    "SELECT DISTINCT e.url FROM errand_evidence e JOIN errand_disputes d ON d.id = e.dispute_id JOIN errand_tasks t ON t.id = d.task_id WHERE e.url IS NOT NULL AND e.url != '' AND (d.user_id = ? OR t.publisher_id = ? OR t.taker_id = ?)"
  ).bind(userId, userId, userId).all();
  return (rows && rows.results ? rows.results : []).map(r => r.url).filter(Boolean);
}
