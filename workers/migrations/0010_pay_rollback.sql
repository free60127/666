-- 0010_pay_rollback.sql：回滚 0009 会员付费（payjs 平台已停用，2026-08-23 用户确认删除）
DROP TABLE IF EXISTS pay_orders;
ALTER TABLE users DROP COLUMN member_until;
