-- 登录失败锁定（2026-08-22）：邮箱级失败计数/锁定时间。
-- 用 D1 而非 KV：SQLite 强一致，连续失败请求打到不同边缘节点也能正确累计。
CREATE TABLE IF NOT EXISTS login_fails (
  email TEXT PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
