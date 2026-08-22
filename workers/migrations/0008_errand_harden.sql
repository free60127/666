-- 审查整改：并发安全 + 自动确认语义 + 管理审计
-- 1) 同一任务同一用户最多一条 open 申诉（并发防重，替代先查后插）
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_dispute
  ON errand_disputes (task_id, user_id) WHERE status = 'open';

-- 2) 自动确认语义：确认来源与系统自动确认时间
--    confirmed_by: NULL=未确认, 'publisher'=发布者手动确认, 'system'=cron 超时自动确认
ALTER TABLE errand_tasks ADD COLUMN auto_confirmed_at INTEGER;
ALTER TABLE errand_tasks ADD COLUMN confirmed_by TEXT;

-- 3) 管理操作审计日志
CREATE TABLE IF NOT EXISTS admin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  admin TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs (created_at);
