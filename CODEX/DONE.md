# 两轮评估总收尾（2026-08-24，DSH 侧）

- Codex review / codex exec（两个独立会话）均失败：`ERROR rmcp::transport::worker ... Transport channel closed`（chatgpt.com/backend-api/ps/mcp）+ `failed to refresh available models: missing field display_name`——评估通道故障，未产出结论。
- DSH 代行第一轮评估与修复：全站静态体检（发布代码无 TODO/debugger/console.log；worker 14 模块 node --check 过）；test-auth 58/58、test-errand 128/128、test-router 全过、test-feedback 全过、test-sync-guard 9/9。
- 修复项：.gitignore 补 `scripts/_codex-review*.log` + `tests/_pw-exit.log`（防 review 日志误提交，上轮曾 4.5MB 误提交 amend）；删除 scripts/_codex-review2.log（1.7MB）。
- 第二轮（DSH 评估、Codex 改）：清单见 CODEX/ROUND-REPORT.md；Codex 通道故障未执行。

---

# Round 1 完成报告（DSH）

日期：2026-08-23  分支：main  基线：aaf578a（本地工作区）

## 1. R2 证据闭环（已实现 + fake R2 测试通过）
- 新增 workers/src/evidence-store.js：deleteR2Objects / evidenceKeysForTask / evidenceKeysForUser（R2 未配置时全部安全 no-op，不虚构 bucket）。
- workers/src/errand.js：
  - 新增受权限保护的二进制下载端点 GET /api/errand/evidence/:id（serveEvidenceBinary）：先查记录→authorizeEvidence（管理员或任务双方）→ R2 get 或 D1 base64 解码 → 二进制 Response（Content-Type 回源 mime；老 base64 记录按 dataURL 前缀推导 mime；R2 未配置时显式 503 阻断说明，不泄露对象键）。
  - listEvidence 只返回元数据 {id,mime,size,createdAt,stored}（不再返回 base64/对象键）。
  - 申诉证据 R2 分支：uploadedR2 跟踪，R2 put 失败或 D1 batch 失败均回滚已写对象 + 删申诉行（外层 catch 统一清理）。
  - adminDeleteTask：先 evidenceKeysForTask 收集 R2 键，删除任务后 deleteR2Objects 清理。
- workers/src/auth.js deleteAccount：注销前 evidenceKeysForUser 收集本人相关证据 R2 键，删除账号后 deleteR2Objects 清理。
- 前端：paotui/app.js 新增 apiBlob（fetch+blob），证据 img.src 改 objectURL；admin.js 同改（fetch blob）。
- workers/wrangler.jsonc：加注释说明（R2 未启用，启用后加 r2_buckets binding EVIDENCE_BUCKET），未虚构名称。
- 测试：scripts/test-errand.mjs MemoryD1 扩展（evidence url/size/sha/mime 分支、JOIN 键查询分支、failEvidenceInsert、fake R2）+ 节 22 共 15 项（打通：列表元数据/无内容泄露/401/403/双方与管理员 200 二进制一致/404/put 部分失败回滚/D1 batch 失败回滚/R2 未配置 503 阻断/管理删除清理 R2/byteLength 413）。

## 2. 反馈迁移脚本两阶段（已重写）
- scripts/migrate-kv-feedback-to-d1.mjs：默认阶段 1 只读 KV 生成 SQL（不删）；--verify 用 CF API D1 query 核对全部 KV 键 id 已在 D1；--delete-after 自动先 verify，核对不过 exit 1，任一删除失败 exit 1。缺 env 退出 2（失败保护）。

## 3. 申诉请求体 byteLength
- createDispute：new TextEncoder().encode(raw).byteLength > 1100000 → 413（原 raw.length 字符数）；节 22 含中文 40 万字符（字符 <110 万、字节 >110 万）→ 413 边界用例。

## 4. CI
- .github/workflows/ci.yml worker-test：加入 node scripts/test-feedback.mjs；run 首行 set -euo pipefail（test-router 原已在列）。

## 5. Playwright 退出
- 全量 npx playwright test：90 passed，EXIT=0；teardown-server.cjs 正常兜底清 8788 残留（Playwright 结束时刻 webServer 尚存活属正常时序，teardown 幂等）。子集/全量多次均正常退出。

## 6. README
- workers/README.md：migrations 说明更新至 0014（含 0009 随 0010 回滚说明）；新增「测试命令」「反馈迁移（两阶段）」「跑腿证据存储（R2 优先 + D1 回退）」三节；反馈限频/存储文案更新为 D1 版（原“进程内 Map”删除）。

## 测试结果（本地）
- scripts/test-errand.mjs 119/119（新增节 22 R2 闭环 15 项）
- scripts/test-auth.mjs 58/58（注销/认证无回归）
- scripts/test-router.mjs 全部通过；scripts/test-sync-guard.mjs 9/9；scripts/test-feedback.mjs 全部通过
- Playwright 全量 90/90（errand.spec 证据 mock 更新后重跑全绿，EXIT=0）

## 未解决 / 后续
- R2 真实 bucket 未创建（CF 账号需 Dashboard 启用 R2，API 10042）：代码已安全回退并写明启用步骤（wrangler.jsonc 注释 + README 节）。
- 未部署/未发布本轮改动（按循环约定等 Codex 检查指示；本地 commit 1642bed 已推进）。
- 自动通知 Codex 尝试失败：codex exec resume --last 报 "thread-store conflict: thread 01a02181-a814-7af1-83a4-7c1471f6d5f2 already has an active writer"——Codex 桌面会话正处于活跃写入状态，锁被占用。需 Codex 会话空闲后重试 node scripts/notify-codex.cjs，或由用户/Codex 直接下达第 2 轮指令。