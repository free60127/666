/* D1/KV 定时维护：与 HTTP 路由解耦，失败只记录日志，不影响在线请求。 */

import { retryPendingR2 } from './evidence-store.js';

const SYNC_TTL_SECONDS = 730 * 24 * 3600;

/**
 * 每日清理滚动数据：
 * - uv_seen 保留 2 天
 * - activity 保留 8 天（覆盖周榜窗口）
 * - rate、rank_cache、stats、login_fails、reset_tokens 按过期时间清理
 * - sync_data 保留 730 天
 * - 跑腿过期任务自动取消，完成任务 48 小时后自动确认
 */
export async function cleanupDb(env) {
  // 2026-08-23 审查第 2 轮收尾：R2 pending 重试不依赖 D1——没有 DB 也必须照常回收 R2 孤儿。
  try {
    await retryPendingR2(env).catch(e => console.error('retryPendingR2 error:', e));
  } catch (e) {
    console.error('retryPendingR2 outer error:', e);
  }
  const db = env.DB;
  if (!db) return;
  const now = Date.now();
  try {
    const dayMs = 86400 * 1000;
    const daysAgo = n => new Date(now + 8 * 3600 * 1000 - n * dayMs).toISOString().slice(0, 10);
    await db.batch([
      db.prepare('DELETE FROM uv_seen WHERE day < ?1').bind(daysAgo(2)),
      db.prepare('DELETE FROM activity WHERE date < ?1').bind(daysAgo(8)),
      db.prepare('DELETE FROM rate WHERE until < ?1').bind(now),
      db.prepare('DELETE FROM rank_cache WHERE updated_at < ?1').bind(now - 3600 * 1000),
      db.prepare("DELETE FROM stats WHERE key LIKE 'stats:pv:day:%' AND substr(key, 14) < ?1").bind(daysAgo(30)),
      db.prepare("DELETE FROM stats WHERE key LIKE 'stats:uv:day:%' AND substr(key, 14) < ?1").bind(daysAgo(30)),
      db.prepare('DELETE FROM login_fails WHERE updated_at < ?1').bind(now - dayMs),
      db.prepare('DELETE FROM reset_tokens WHERE expires_at < ?1').bind(now),
      db.prepare('DELETE FROM sync_data WHERE updated_at < ?1').bind(now - SYNC_TTL_SECONDS * 1000),
      db.prepare("UPDATE errand_tasks SET status = 'cancelled', cancelled_at = ?1, cancel_reason = '任务已过期，自动取消', updated_at = ?1 WHERE status = 'open' AND deadline IS NOT NULL AND deadline < ?1").bind(now),
      db.prepare("UPDATE errand_tasks SET confirmed_at = ?1, auto_confirmed_at = ?1, confirmed_by = 'system', updated_at = ?1 WHERE status = 'done' AND confirmed_at IS NULL AND completed_at IS NOT NULL AND completed_at < ?2").bind(now, now - 48 * 3600 * 1000),
    ]);
  } catch (error) {
    console.error('cleanupDb error:', (error && error.message) || error);
    try {
      await db.prepare('INSERT INTO stats (key, value) VALUES (?1, 1) ON CONFLICT(key) DO UPDATE SET value = stats.value + 1').bind('stats:cleanup:fail').run();
    } catch (_) {
      // 计数失败也静默，避免清理任务自身再抛错。
    }
  }
  await processCleanupJobs(env, now);
}

async function processCleanupJobs(env, now) {
  if (!env.DB || !env.STUDY_KV) return;
  let rows;
  try {
    const result = await env.DB.prepare(
      'SELECT id, kv_key, attempts FROM cleanup_jobs WHERE next_attempt_at <= ? ORDER BY id LIMIT 20'
    ).bind(now).all();
    rows = result && result.results ? result.results : [];
  } catch (_) {
    return;
  }
  for (const row of rows) {
    try {
      // 2026-08-23 云同步迁 D1：同步数据主存 D1，KV 仅删旧残留。
      await env.DB.prepare('DELETE FROM sync_data WHERE user_id = ?').bind(row.kv_key).run();
      await env.STUDY_KV.delete(row.kv_key);
      await env.DB.prepare('DELETE FROM cleanup_jobs WHERE id = ?').bind(row.id).run();
    } catch (error) {
      const attempts = (Number(row.attempts) || 0) + 1;
      const delay = Math.min(24 * 3600 * 1000, 60000 * (2 ** Math.min(attempts, 10)));
      const message = String(error && error.message || error).slice(0, 500);
      await env.DB.prepare(
        'UPDATE cleanup_jobs SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?'
      ).bind(attempts, now + delay, message, row.id).run().catch(() => {});
    }
  }
}
