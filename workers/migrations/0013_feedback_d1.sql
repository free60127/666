-- 反馈迁 D1（2026-08-23 审查第 7 项）：反馈主存 D1，KV 只留公告/配置/APK 指针。
-- id 沿用 KV 键格式 feedback:<ts>-<rand>（前端 API 契约不变：items[].key = id）。
CREATE TABLE IF NOT EXISTS feedbacks (
  id TEXT PRIMARY KEY,
  page TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  ts INTEGER NOT NULL,
  handled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedbacks_handled ON feedbacks(handled, ts DESC);
CREATE INDEX IF NOT EXISTS idx_feedbacks_type ON feedbacks(type, ts DESC);
CREATE INDEX IF NOT EXISTS idx_feedbacks_ts ON feedbacks(ts DESC);
