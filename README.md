# 外院知识分享站

课程题库、学习工具与专业资料的免费分享站。

- 在线地址：<https://free60127.github.io/666/>
- 全部内容免费使用；进度、错题、收藏保存在浏览器本地（localStorage）。
- 部署方式：GitHub Pages，仓库根 = 站点根，站点部署在 `/666/` 子路径。

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
node scripts/build/extract.js        # 从原始素材提取题库（入库用）
node scripts/build/validate.js       # 校验题库一致性（答案格式、选项、重复题等）
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
node scripts/make-brand-assets.ps1   # 生成 PWA 图标与分享图（需在项目根用 PowerShell 执行）
```

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

## 自愿赞助

首页底部「赞助支持」弹出微信收款码（`payment-qr.jpg`）。赞助完全自愿，不影响任何功能。多文件版部署必须包含 `payment-qr.jpg`（单文件版已内嵌）。

## 数据治理记录

- 2026-08：思修 318→214、近代史 331→215（去重 + 答案冲突修正）、毛概 244→243、计算机数据库基础清 1 组重复；马原、习概无重复。
- 历史教训：改数据后必须重新跑 `build.js` 重建产物并验证（脚本与手改数据不同步曾导致回滚事故）；id 按题型独立编号（`single#87` ≠ `multi#87`）。
