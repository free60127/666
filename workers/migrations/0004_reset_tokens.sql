-- 0004_reset_tokens.sql：找回密码一次性重置码（2026-08-22）
-- 每邮箱一行（新码覆盖旧码）；码存 SHA-256 哈希，15 分钟有效；used 防止重放
CREATE TABLE IF NOT EXISTS reset_tokens (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);