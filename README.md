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
| 背单词 | `背单词/` | 专四、专八词汇学习与智能复习（`vocabulary-data.js`） |
| 学习中心 | `学习中心/` | 全站统一进度、正确率、收藏与错题复习 |

全站页面统一引用 `reading-tools.js`（字号调节、查词、PDF 下载）、`unified-quiz-engine.js`（收藏与进度统一记录、随机一题、学习中心定位复习）、`a4-print.js`（PDF 导出）。

## 题库数据管线

题库唯一数据源为 `source/*.json`，产物由构建脚本生成，**不要手改产物**：

```
source/*.json ──> scripts/build/build.js ──> 思政系列/data.js + data.json
                                            计算机系列/data.js + data.json
```

- `source/politics.json`：思政五门题库（ethics / history / marx / mao / xi）
- `source/computer.json`：计算机题库
- `source/vocabulary.json`：背单词词汇（tem4 / tem8）
- `source/tem4.json`、`source/tem8.json`、`source/dictionary.json`：查词词典与词表素材

scripts 下常用命令（在项目根目录执行）：

```bash
node scripts/build/build.js          # 从 source/*.json 重建全部 data.js/data.json 产物
node scripts/build/extract.js        # 从原始素材提取题库（入库用）
node scripts/build/validate.js       # 校验题库一致性（答案格式、选项、重复题等）
node scripts/build/report.js         # 生成数据治理报告
node scripts/build/verify-docx.js    # 与《大一上思政.docx》核对
node scripts/build/dedupe-history.js # 近代史去重（331→215）
node scripts/build/fix-history-answers.js # 近代史答案修正脚本（multi#15 等）
node scripts/count-types.js          # 统计各题库题型分布
```

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

本地目录不是 git 仓库；站点代码维护在 GitHub 仓库 `free60127/666`（仓库根 = 站点根）。发布流程：

1. 本地全部更新后，将整个站点文件夹内容复制进 Pages 仓库工作目录；
2. `git add -A && git commit && git push`；
3. GitHub Actions（或 Pages 自动构建）发布，约 1 分钟后线上生效：`https://free60127.github.io/666/`。

⚠️ 每次改完必须重新部署，否则线上仍是旧版（历史教训：线上曾停留在 8/18 版本，首页搜索与新版答题引擎全部 404）。部署后建议用浏览器无痕窗口 + 检查线上资源版本号确认。

## 自愿赞助

首页底部「赞助支持」弹出微信收款码（`payment-qr.jpg`）。赞助完全自愿，不影响任何功能。多文件版部署必须包含 `payment-qr.jpg`（单文件版已内嵌）。

## 数据治理记录

- 2026-08：思修 318→214、近代史 331→215（去重 + 答案冲突修正）、毛概 244→243、计算机数据库基础清 1 组重复；马原、习概无重复。
- 历史教训：改数据后必须重新跑 `build.js` 重建产物并验证（脚本与手改数据不同步曾导致回滚事故）；id 按题型独立编号（`single#87` ≠ `multi#87`）。
