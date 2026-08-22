-- 0005_cleanup_jobs.sql：注销账号后的 KV 清理重试队列
-- D1 删除与 KV 删除不在同一事务中；KV 暂时故障时由 Worker Cron 重试。
CREATE TABLE IF NOT EXISTS cleanup_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kv_key TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_cleanup_jobs_due ON cleanup_jobs(next_attempt_at);
