-- 证据 R2 优先 + D1 回退（2026-08-23 审查第 6 项）：R2 启用后 D1 只存元数据 url/size/sha256/mime；
-- 未启用时保持现状（data 列存 base64）。url 为 R2 对象键（evidence/<disputeId>/<idx>-<sha>.bin）。
ALTER TABLE errand_evidence ADD COLUMN url TEXT;
ALTER TABLE errand_evidence ADD COLUMN size INTEGER;
ALTER TABLE errand_evidence ADD COLUMN sha256 TEXT;
ALTER TABLE errand_evidence ADD COLUMN mime TEXT;
