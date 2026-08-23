-- 云同步数据迁 D1（2026-08-23 审查：KV 无 CAS，冲突检测「先读后写」非原子，
-- 双设备同读旧版本同时上传会互相覆盖）。
-- D1 单语句 UPSERT + WHERE 实现原子 CAS：仅当云端 rev 等于客户端 baseRev 才更新；
-- changes=0 → 409 返回最新数据，前端自动合并重试。
CREATE TABLE IF NOT EXISTS sync_data (
  user_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  rev INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
