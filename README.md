# 外院知识分享站

课程题库、学习工具与专业资料的免费分享站。

- 在线地址：<https://free60127.top/>
- 全部内容免费使用；进度、错题、收藏保存在浏览器本地（localStorage）。
- 部署方式：GitHub Pages（仓库根 = 站点根，部署于 `/666/` 子路径）为源站；主域名 `free60127.top` 经 Cloudflare Worker 反代源站（自动去 `/666/` 前缀、OG 地址改主域），API 走 `api.free60127.top`。

## 站点模块

| 模块 | 路径 | 说明 |
|---|---|---|
| 首页 | `index.html` | 全站搜索（`site-search.js` + `site-search-data.js`）、学习专区入口、赞助/打印小店 |
| 专业课 | `专业课/` | 语法、通用课程、综英系列等电子学习资料 |
| 计算机 | `计算机系列/` | 计算机基础与 Visual FoxPro 题库（5 个库：入库试题、VFP1/2 复习、下册复习、数据库基础） |
| 思政 | `思政系列/` | 五门课程题库（思修 214 题、近代史 215 题、马原 197 题、毛概 243 题、习概 225 题）、模拟卷与错题本 |
| 电子版教材 | `电子版教材/` | 电子教材二维码分发页 |
| 考证 | `考证/` | 英语专四等考证资料 |
| 背单词 | `背单词/` | 专四、专八词汇学习与智能复习（按词书按需加载：`vocabulary-meta.js` + `vocabulary-data-tem4/tem8.js`） |
| 学习中心 | `学习中心/` | 全站统一进度、正确率、收藏与错题复习、错题提醒 |

全站页面统一引用 `reading-tools.js`（字号调节、查词、PDF 下载、**深色/浅色主题切换**）、`unified-quiz-engine.js`（收藏与进度统一记录、随机一题、学习中心定位复习）、`a4-print.js`（PDF 导出）、`common.js`（GoatCounter 统计 + Service Worker 注册）。

## 新功能一览（2026-08-20 新增）

- **深色模式**：悬浮工具栏 🌙/☀️ 按钮一键切换，记忆选择（`localStorage: waiyuan-web-theme-v1`），未设置时跟随系统；实现为根目录 `theme.css` 覆盖层（`html[data-theme="dark"]`），不侵入各模块样式。
- **访问统计（GoatCounter）**：`common.js` 已接入，**使用前需注册** [goatcounter.com](https://www.goatcounter.com) 账号并把子域名设为 `free60127`（或修改 `common.js` 顶部 `GC_SITE` 常量）。未注册不影响任何功能。
- **PWA**：`manifest.webmanifest`（桌面图标 192/512）+ `sw.js`（核心资源预缓存、静态资源缓存优先、离线可访问首页）；图标与分享图由 `scripts/make-brand-assets.ps1` 生成。
- **学习提醒**：背单词页「每日提醒」设定时间后，当日到点未学习时发系统通知（需授予通知权限）；学习中心「开启错题提醒」后有错题待复习时每日提醒一次。
- **分享图**：`og-image.png`（1200×630），微信/社交平台分享链接时显示卡片预览。

## 题库数据管线

题库唯一数据源为 `source/*.json`，产物由构建脚本生成，**不要手改产物**：

```
source/*.json ──> scripts/build/build.js ──> 思政系列/data.js + data.json
                                            计算机系列/data.js + data.json
                                            专业课/英语系/泛读系列/data.js + data.json
                                            专业课/英语系/基英系列/data.js + data.json
```

- `source/politics.json`：思政五门题库（ethics / history / marx / mao / xi）
- `source/computer.json`：计算机题库
- `source/vocabulary.json`：背单词词汇（tem4 / tem8）
- `source/reading.json`：泛读系列教材题库（books → units → questions，由旧静态 HTML 提取迁移）
- `source/basic-english.json`：基英系列教材题库（同上）
- `source/tem4.json`、`source/tem8.json`、`source/dictionary.json`：查词词典与词表素材
- `source/translations.json`、`source/rewrite-sentences.json`：翻译/改写句子题库（特殊结构，手动维护）

**新增/导入题目**（推荐流程，见下方「题库导入工具」）：浏览器粘贴校验 → 下载标准 JSON → 本地一行命令合并，全程不需要手改源文件。

scripts 下常用命令（在项目根目录执行）：

```bash
node scripts/build/build.js          # 从 source/*.json 重建全部 data.js/data.json 产物
node scripts/build/validate.js       # 校验题库一致性（答案格式、选项、重复题等，覆盖全部 8 个源文件）
node scripts/build/report.js         # 生成数据治理报告
node scripts/build/verify-docx.js    # 与《大一上思政.docx》核对
node scripts/build/dedupe-history.js # 近代史去重（331→215）
node scripts/build/fix-history-answers.js # 近代史答案修正脚本（multi#15 等）
node scripts/extract-content.js      # 泛读/基英 静态 HTML → source JSON 迁移工具（已迁移，保留参考）
node scripts/import-quiz.js          # 本地题库导入器（见下方说明）
node scripts/quiz-schema.js          # 题库校验规则（Node/浏览器双端共用）
node scripts/count-types.js          # 统计各题库题型分布
node scripts/check-links.js          # 全站 HTML 资源引用完整性检查
node scripts/inject-common.js        # 全站注入主题防闪烁脚本 + theme.css + common.js（幂等）
node scripts/build-standalone.js 思政系列   # 重建单文件离线版（见「单文件离线版」）
node scripts/verify-standalone.js <文件>   # 验证单文件离线版内嵌完整性
node scripts/check-online.js         # 线上资源可用性核验（部署后执行）
node scripts/release.js              # 一键发布（见「部署」）
```

PowerShell 生成 PWA 图标与分享图（非 Node）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/make-brand-assets.ps1
```

> 注：`scripts/build/extract.js` 与 `scripts/build/validate-quiz-data.js` 等旧工具已归档至 `archive/legacy/`，不再维护；请以本清单为准。

## 题库导入工具

两种方式，都自动校验（题型白名单、选项数量、答案范围、重复检测）：

**① 在线页面**（无需装环境）：打开 `题库导入.html`（线上 `/666/题库导入.html`），选择目标题库、粘贴 JSON 或 CSV，点「校验并生成导入文件」→ 下载 `import.json`。

**② 本地命令**（推荐，一步到位）：

```bash
# JSON 或 CSV 文件，CSV 列：type,title,options,answer,hint（options 用 | 分隔，type 留空自动推断）
node scripts/import-quiz.js politics 导入.json --bank ethics          # 思政某 bank
node scripts/import-quiz.js computer 导入.csv --bank computer-first-semester
node scripts/import-quiz.js reading 导入.json --unit book-1-word-unit-9   # 追加现有单元
node scripts/import-quiz.js reading 导入.json --unit-name "Unit 16 · 补充" # 新建单元
node scripts/import-quiz.js politics 导入.json --bank ethics --check  # 只校验不写入
```

导入器会自动：校验 → 与库内去重合并 → 备份源文件（`source/*.json.bak-import-*`）→ 重排 id → 提示发布。最后跑 `node scripts/release.js` 一键上线。

**同学纠错**：全站题目卡片上有「⚠ 纠错」按钮，点击复制纠错信息（页面/题干/当前答案），粘贴发给站长即可；如需直达邮箱，在页面里设置 `window.WAIYUAN_FEEDBACK_EMAIL`。

## 单文件离线版

把样式、题库、阅读工具、统一引擎、PDF 导出全部内联成一个 HTML，可单独发给同学离线使用：

```bash
node scripts/build-standalone.js 思政系列    # → 思政系列/思政刷题-单文件离线版.html
node scripts/build-standalone.js 计算机系列  # → 计算机系列/计算机刷题-单文件离线版.html
```

- 产物命名必须与内容一致（思政系列 → 思政刷题…，计算机系列 → 计算机刷题…），避免误发。
- 生成后用 `node scripts/verify-standalone.js <文件>` 验证内嵌完整性（语法、题库一致性、无外部引用）。
- 单文件版已内嵌微信收款码（`payment-qr.jpg`）与欢迎图（`welcome-cat.jpg`），无需额外文件。

## 部署（GitHub Pages）

本站维护在 GitHub 仓库 `free60127/666`（仓库根 = 站点根，部署于 `/666/` 子路径）。**一键发布**：

```bash
node scripts/release.js
```

`release.js` 自动完成：重建数据产物 → 全站版本号刷新为 `v=YYYYMMDD-HHMM`（强制缓存更新）→ 重建两份单文件离线版 → 引用与单文件校验 → `git add/commit/push`（推送后自动核验远程 HEAD）。等 1-3 分钟 Pages 构建后执行 `node scripts/check-online.js` 确认线上可用。

⚠️ 每次改完必须重新部署，否则线上仍是旧版（历史教训：线上曾停留在 8/18 版本，首页搜索与新版答题引擎全部 404）。

## 云同步（已启用，2026-08-21）

学习中心提供「云端备份 / 云端恢复 / 清除云端」：

- **恢复码**：首次备份自动生成 32 字节随机恢复码（base64url，约 256 bit 熵），是云端数据的唯一钥匙，需用户自己妥善保存（复制到记事本/密码管理器）。
- **加密**：恢复码经 PBKDF2（120k 次）派生 AES-GCM-256 密钥，学习数据加密后才上传；服务端只存 `deviceId = SHA-256(恢复码)`（64 位 hex），KV 泄露也推不出恢复码、读不出内容。
- **备份**：上传本机全部学习数据（网页题库进度/收藏/设置 + 背单词 FSRS + 思政/计算机答题状态 + 查词收藏）覆盖云端；**恢复**：下载解密后与本地合并（重复条目取较新、独有内容两边都保留），恢复前自动导出一份本机备份文件兜底。
- 实现：前端 `学习中心/cloud-sync.js`（UMD，Node 可单测）；后端 `/api/sync`（POST/GET/DELETE，payload ≤ 2.5MB）。
- 安全边界：恢复码随机性即安全边界（无找回机制，丢失只能重新备份）；`/api/feedback` 限频（同一 IP 30 秒 5 次）基于单实例内存 `Map`，多实例部署下不构成全局限流，如遭滥用应改用 Cloudflare Rate Limiting、Turnstile 或 Durable Objects；CORS 只对白名单（`https://free60127.github.io`、`https://free60127.top`）回显。

## 公告

首页与各页面支持云端公告条：管理员在 `admin.html`（站点根，需管理令牌）发布公告后，页面顶部的 `#site-notice` 横幅自动显示（`common.js` 拉取 `GET /api/notice`，4 秒超时静默降级；无公告或不可达时不显示，不影响功能）。

## 自愿赞助

首页底部「赞助支持」弹出微信收款码（`payment-qr.jpg`）。赞助完全自愿，不影响任何功能。多文件版部署必须包含 `payment-qr.jpg`（单文件版已内嵌）。

## 运维与验证脚本
- `scripts/release.js`：一键发布（重建产物 → 版本号刷新 → 校验 → commit/push）
- `scripts/check-online.js`：线上资源与功能全量检查（主域 21+ 项 + API + www 301）
- `scripts/verify-*-live.mjs`：线上 API 集成验证。**注意**：`verify-rank-live.mjs` 会创建线上测试账号并写入排行榜活动数据，脚本结束会自动清理（活动记录 + 测试账号）；请勿在 CI 中自动执行。`verify-auth-live.mjs`/`verify-v2-live.mjs`/`verify-v3-live.mjs`/`verify-harden-live.mjs`/`verify-stats-live.mjs` 同理会产生少量线上测试数据。
- 管理接口：`DELETE /api/auth/account?email=`（管理员令牌，删账号级联会话）、`DELETE /api/activity?key=&date=`（管理员令牌，删单日活动记录）——清理遗留测试数据用。
## 数据治理记录

- 2026-08：思修 318→214、近代史 331→215（去重 + 答案冲突修正）、毛概 244→243、计算机数据库基础清 1 组重复；马原、习概无重复。
- **2026-08-21 答案书核对**：以《新编英语语法教程 第6版 课后练习答案》PDF 逐题核对翻译（257 题）与改写（390 题）答案，**648 题中 643 题与官方答案完全一致**；修复 4 处：21C 题号错位（#9 题目尾部粘连原 #10 题目、#10 题目丢失、#11 答案合并 #12 → 拆分为 20 题并全量对齐 PDF 答案）、39B#26 答案错位（原为 #36/#37 内容 → 修正为 PDF 值）、21B#11 剥离题号前缀、23D#14 "V ote"→"Vote"。核对脚本保留于 `scripts/_tmp-parse-pdf.js`/`scripts/_tmp-diff.js`（PDF 文本解析 + 对照报告），修复脚本 `scripts/fix-translations-pdf.js`（幂等，执行前自动备份 `.bak-pdfcheck`）。
- **已知缺题**（答案书有、站内暂缺，旧 OCR 提取时漏题，中文题目需 OCR 恢复）：翻译 16C 缺 #20-21、18B 缺 #31-50、27G 缺 #20。答案书本身无 13A/32C/32D 练习（无法核对）。39B#7 答案书排版残缺（项目答案保留）。39B#36/#37 项目答案与答案书语义等价（不同写法，保留项目版本）。
- 历史教训：改数据后必须重新跑 `build.js` 重建产物并验证（脚本与手改数据不同步曾导致回滚事故）；id 按题型独立编号（`single#87` ≠ `multi#87`）。
