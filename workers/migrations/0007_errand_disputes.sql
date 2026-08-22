-- 跑腿申诉 + 证据（2026-08-22）：确认后纠纷处理、图片证据
CREATE TABLE IF NOT EXISTS errand_disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES errand_tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('publisher','taker')),
  reason TEXT NOT NULL,
  detail TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','rejected')),
  admin_note TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_disputes_task ON errand_disputes(task_id);
CREATE INDEX IF NOT EXISTS idx_disputes_user ON errand_disputes(user_id);

CREATE TABLE IF NOT EXISTS errand_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispute_id INTEGER NOT NULL REFERENCES errand_disputes(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_dispute ON errand_evidence(dispute_id);