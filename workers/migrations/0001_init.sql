-- 0001_init.sql：用户账号 + 登录会话（D1 账号体系，2026-08-21）
-- 设计：D1 只存账号/会话；学习数据仍在 KV（sync:{deviceId}），
--       users.recovery_encrypted 保存用「密码派生密钥」加密的恢复码（服务端不可读）。

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                       -- 16 字节随机 hex
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,               -- pbkdf2:iter:salt_b64:hash_b64（SHA-256 150k 轮）
  nickname TEXT NOT NULL DEFAULT '',
  recovery_encrypted TEXT,                   -- JSON {salt_b64,iv_b64,c_b64}：密码派生 AES-GCM 加密的恢复码
  created_at INTEGER NOT NULL,               -- unix 毫秒
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,                    -- 32 字节随机 hex
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL                -- unix 毫秒（30 天）
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
