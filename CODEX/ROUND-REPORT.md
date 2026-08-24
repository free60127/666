# 两轮纠错评估报告（2026-08-24）

基线：HEAD=4673533（release 20260824-0820），工作区干净。

## 第一轮：Codex 评估 → DSH 修复

### 通道结果（如实记录）
Codex 两次会话均未能产出评估：
1. `codex exec review --commit 4673533`（PID 1086）：日志 295KB，仅输出 git diff，随后持续报
   `ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed`（chatgpt.com/backend-api/ps/mcp）而中断。
2. `codex exec ...`（PID 1155）：日志 1.7MB，Codex 在自动执行 PowerShell 统计文件行数（中文路径大量报错），并输出
   `ERROR codex_models_manager::manager: failed to refresh available models: stream disconnected before completion: failed to decode models response: missing field display_name`，随后同样 MCP channel closed。

结论：本轮 Codex 评估通道（MCP + 模型列表接口）故障，无法按原计划产出。DSH 代行第一轮评估并修复，报告如下。

### 第一轮评估发现（DSH 代行）
| # | 项目 | 证据 | 处理 |
|---|------|------|------|
| 1 | review/评估日志存在误提交风险 | `.gitignore` 仅有一条 `scripts/_codex-review.log`；本次 `scripts/_codex-review2.log`（1.7MB）未跟踪；历史上曾发生 4.5MB review log 误提交后 amend 回滚 | 已修：`.gitignore` 改 `scripts/_codex-review*.log` 通配 + 新增 `tests/_pw-exit.log`；删除 1.7MB 日志 |
| 2 | 发布代码卫生 | grep TODO/FIXME/XXX/debugger 仅命中 `.dsh-vision-router/artifacts/extract-latest.js` 与 `scripts/extract-session.js`（均本地工具）；console.log 仅测试服务器与依赖 vendor `ts-fsrs/index.umd.js` | 无需处理（非发布代码） |
| 3 | worker 语法/回归 | 14 个 src 模块 `node --check` 全过；test-auth 58/58、test-errand 128/128、test-router 全过、test-feedback 全过、test-sync-guard 9/9 | 基线健康 |
| 4 | 其他已知长期项（不阻塞） | R2 真实 bucket 未启用（CF API 10042，需 Dashboard 启用）；KV 读改写 pending 无 CAS（唯一写者 cron，已注释说明）；admin token 存 sessionStorage（已做） | 记录于本报告 |

### 已提交
- `.gitignore`（+2 行）
- `CODEX/DONE.md`（头部追加两轮总收尾）
- `CODEX/ROUND-REPORT.md`（本文件）
- 删除 `scripts/_codex-review2.log`

## 第二轮：DSH 评估 → 待 Codex 修复

以下为第二轮清单（按优先级）；Codex 通道恢复后可直接按此清单执行。

### P1（建议本轮修）
| # | 文件 | 问题 | 建议 |
|---|------|------|------|
| 1 | workers/src/errand.js（662 行） | 职责仍大：任务/评价/申诉/证据/管理端混在一文件；错误状态分支多 | 拆 `errand-reviews.js`(createReview/listReviews) 与 `errand-disputes.js`(createDispute/listDisputes/serveEvidenceBinary/adminTasks/adminDeleteTask/resolveDispute)；已有 MemoryD1 128 用例作安全网 |
| 2 | paotui/app.js（709 行） | 详情渲染+认证+分享+列表混排；与 auth-ui.js 能力重叠 | 拆 `paotui/detail.js`（renderDetail/操作按钮/申诉）；认证改用 window.WaiyuanAuthUI（当前为简版独立实现） |
| 3 | 学习中心/app.js（~31KB） | 云端备份/恢复面板内联在 app.js（cloud-sync.js 已有库逻辑） | 拆 `学习中心/cloud-panel.js`（doCloudBackup/doCloudRestore/doCloudClear/copyCloudCode + #cloud-panel 渲染） |
| 4 | workers/src/index.js（147 行）+ config/auth 引用 | CORS 白名单与配置从 `config.js` 读取（已做），但 `route()` 内仍有大量重复的 `if (path === ...)` 无集中注册表 | 可选：改集中 ROUTES 表（低优先；当前可读性好，勿强拆） |

### P2（建议后续）
| # | 文件 | 问题 | 建议 |
|---|------|------|------|
| 5 | unified-quiz-engine.js（~29KB） | 判题/收藏/反馈/随机/统计混一文件（CSS 已拆出） | 拆 `quiz-telemetry.js`（收藏/学习进度/心跳）与 `quiz-feedback.js` |
| 6 | a4-print.js（~29KB） | 打印逻辑+便携 PDF+桌面打印窗混一 | 拆 `a4-pdf.js`（portablePdfBytes/drawPortablePage）保持 open/buildPages 为门面 |
| 7 | admin.js（~29KB） | 反馈/公告/统计/排行/跑腿/日志/审计 7 个 tab 混一 | 拆 `admin-feedback.js` + `admin-stats.js` + `admin-errand.js`，admin.js 只留 tab 调度 |
| 8 | archive/legacy + scripts 大文件 | english-lookup-data.js 3.9MB 等为必要数据；archive 为归档 | 保持现状（release.js 已排除；勿删） |

### 体验改进（P2）
| # | 建议 |
|---|------|
| 9 | 商英/综英/基英/泛读 data 中翻译题存在 `&quot;` 实体与个别拼写（OCR 校对遗留，如 in flu cn ced）——属数据质量，建议对 source/*.json 做实体清理脚本（非代码层） |
| 10 | 在线缓存策略：PWA SW 已按版本化资源缓存；建议后续给 reading-tools/quiz-engine 加 `Cache-Control: immutable` 提示（受 GH Pages 限制则跳过） |

---

### 验证基线（两轮共用）
- node --check：worker 14 模块 + 前端改动文件全过
- test-auth 58/58；test-errand 128/128；test-router 冒烟全过；test-feedback 全过；test-sync-guard 9/9
- check-links 294/0（2026-08-24 上轮实测）；Playwright 99/99（上轮发布链，英文引擎词库修复后）
