-- 2026-08-23 三阶段第一阶段第 4 项：为 cron 清理扫描补齐索引
-- cleanupDb 每 6 小时按过期列 DELETE，无索引时全表扫描会拖慢 D1 并耗费读配额。

CREATE INDEX IF NOT EXISTS idx_rate_until ON rate(until);
CREATE INDEX IF NOT EXISTS idx_rank_cache_updated ON rank_cache(updated_at);
CREATE INDEX IF NOT EXISTS idx_login_fails_updated ON login_fails(updated_at);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires ON reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_sync_data_updated ON sync_data(updated_at);

-- 跑腿过期取消：WHERE status = 'open' AND deadline IS NOT NULL AND deadline < ?
-- 自动确认：WHERE status = 'done' AND completed_at IS NOT NULL AND completed_at < ?
-- 组合索引让 status 过滤后按时间列有序扫描（status 单选率高，组合最优）。
CREATE INDEX IF NOT EXISTS idx_errand_deadline ON errand_tasks(status, deadline);
CREATE INDEX IF NOT EXISTS idx_errand_completed ON errand_tasks(status, completed_at);