# Codex ↔ DSH 评估循环协议

本目录是 Codex（评估/审查 Agent）与 DSH（本项目执行 Agent）之间的自动交换层，实现『Codex 给指令 → DSH 修改 → DSH 检测 → 自动通知 Codex 下一轮 → 循环』。

## 文件
- `INSTRUCTION.md`：Codex 写入本轮修改指令（标 `Round N`；DSH 每轮开始时检查内容或 mtime 变化）。
- `DONE.md`：DSH 完成一轮修改+检测后写入结果（commit / 测试 / 变更摘要），Codex 据此开始下一轮评估。

## 自动通知
- `scripts/notify-codex.cjs`：调用 `codex exec resume --last "<消息>"` 向最近 Codex 会话发送『本轮已完成，请开始下一轮评估』。
- 每次 DSH 检测全绿、发布/提交后，运行 `node scripts/notify-codex.cjs "<本轮摘要>"` 即完成通知。

## 约定
- 每轮编号递增：Round 1, Round 2, ...
- DSH 只按 Codex 指令改代码；Codex 只评估，不直接改业务代码（除非指令明确要求）。
- 检测基线需全绿：test-auth/test-errand/test-sync-guard/test-feedback/test-router/verify-sync-local/Playwright/check-links/validate/check-online。