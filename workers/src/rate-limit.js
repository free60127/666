/* ============================================================
    统一限流（2026-08-23 三阶段·审查第 4 项）：所有 D1 rate 表滚动窗口只此一份实现。
    - rateWindow(): 通用窗口（认证/注册/找回/反馈/访问共用）
    - syncRateLimit(): 同步/心跳/访客上报专用（SYNC_RATE 阈值表）
    ============================================================ */

/** 同步/心跳/访客上报每分钟每键阈值（原 sync.js 常量迁移至此） */
export const SYNC_RATE = { upload: 10, download: 30, delete: 6, heartbeat: 6, heartbeatIp: 20, visit: 60 };

/** 通用滚动窗口限流（D1 rate 表）。返回 {count, failed}；failed=true 表示限流器故障 */
export async function rateWindow(db, key, windowMs, max) {
  try {
    const now = Date.now();
    const end = now + windowMs;
    const row = await db.prepare(
      'INSERT INTO rate (key, count, until) VALUES (?1, 1, ?2) ' +
      'ON CONFLICT(key) DO UPDATE SET ' +
      'count = CASE WHEN rate.until <= ?3 THEN 1 ELSE rate.count + 1 END, ' +
      'until = CASE WHEN rate.until <= ?3 THEN ?4 ELSE rate.until END ' +
      'RETURNING count'
    ).bind(key, end, now, end).first();
    return { count: row ? Number(row.count) : 0, failed: false };
  } catch (error) {
    console.error('rateWindow error:', error);
    return { count: 0, failed: true };
  }
}

/** 同步/心跳限流：SYNC_RATE[action] 每分钟阈值；返回 {ok, failed} */
export async function syncRateLimit(env, key, action) {
  const r = await rateWindow(env.DB, 'rate:sync:' + action + ':' + key, 60000, SYNC_RATE[action] || 10);
  if (r.failed) return { ok: false, failed: true };
  return { ok: !(r.count > (SYNC_RATE[action] || 10)), failed: false };
}
