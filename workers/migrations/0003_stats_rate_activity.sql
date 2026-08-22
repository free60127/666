-- 0003_stats_rate_activity.sql：高频 KV 数据迁 D1（2026-08-22）
-- 背景：KV 免费每日写/删/列仅 1000 次，统计(每 PV 多写)/限流(每请求读写)/排行榜(每分钟心跳)
--       已触发 Cloudflare 50% 警报。D1 免费额度大 100 倍（每日 500 万读 + 10 万写）。
-- 保留 KV：云同步 payload(2.5MB)、反馈、公告（低频/大对象）。

-- 统计计数（键名与旧 KV 完全一致，便于存量迁移与双读兼容）
CREATE TABLE IF NOT EXISTS stats (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_stats_key ON stats(key);

-- UV 当日去重（替代 KV stats:uv:day:{date}:{vid} TTL 键）
CREATE TABLE IF NOT EXISTS uv_seen (
  day TEXT NOT NULL,
  vid TEXT NOT NULL,
  PRIMARY KEY (day, vid)
);

-- 通用限流计数器（滚动窗口；每身份×动作仅一行，窗口过期自动重置，键量恒定无需清理）
CREATE TABLE IF NOT EXISTS rate (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  until INTEGER NOT NULL DEFAULT 0
);

-- 学习活跃/排行榜（替代 KV act:{key}:{date}）
CREATE TABLE IF NOT EXISTS activity (
  act_key TEXT NOT NULL,
  date TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  learned INTEGER NOT NULL DEFAULT 0,
  last_ts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (act_key, date)
);
CREATE INDEX IF NOT EXISTS idx_activity_date ON activity(date);

-- 排行榜结果缓存（替代 KV rank:cache:{period}:{range}，TTL 语义由 updated_at 比较实现）
CREATE TABLE IF NOT EXISTS rank_cache (
  period TEXT NOT NULL,
  range TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (period, range)
);