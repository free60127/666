-- 0015: 跑腿订单细分分类 + 任务图片（R2 优先 / D1 base64 回退，与申诉证据同模式）
-- 分类 key：pickup-food 取外卖 / pickup-parcel 取快递 / sell-item 出闲置 / request-info 求资料 / other 其他
ALTER TABLE errand_tasks ADD COLUMN category TEXT NOT NULL DEFAULT 'other';

CREATE TABLE IF NOT EXISTS errand_task_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES errand_tasks(id) ON DELETE CASCADE,
  data TEXT,          -- R2 模式为空字符串（内容在 R2）；D1 回退模式存 base64 dataURL
  url TEXT,           -- R2 对象键（前缀 task/{taskId}/{i}-{sha256}.bin）
  size INTEGER,
  sha256 TEXT,
  mime TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_images_task ON errand_task_images(task_id);
