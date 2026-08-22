-- 0006_errand.sql：跑腿平台（外院跑腿）
-- 任务表：发布→接单→完成（接单者标记）→确认（发布者确认，线下结算）→取消
-- 与现有账号体系同库：publisher_id/taker_id 引用 users(id)（16B hex）

CREATE TABLE IF NOT EXISTS errand_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publisher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  reward INTEGER NOT NULL DEFAULT 0 CHECK (reward >= 0 AND reward <= 99999),
  pickup TEXT NOT NULL DEFAULT '',
  dropoff TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  deadline INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','doing','done','cancelled')),
  taker_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  confirmed_at INTEGER,
  cancelled_at INTEGER,
  cancel_reason TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_errand_status ON errand_tasks(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_errand_publisher ON errand_tasks(publisher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_errand_taker ON errand_tasks(taker_id, created_at DESC);

-- 评价表（轮2 接评价接口；先建表保证迁移一次到位）
CREATE TABLE IF NOT EXISTS errand_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES errand_tasks(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE (task_id, reviewer_id)
);
CREATE INDEX IF NOT EXISTS idx_errand_reviews_reviewee ON errand_reviews(reviewee_id);