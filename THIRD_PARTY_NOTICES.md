# 第三方开源参考与许可声明

“外院 · 背单词”第一版在产品设计和技术调研阶段参考了以下开源项目。项目名称、作者和许可证按原仓库声明保留。

## Learning With Texts (LWT)

- 项目：https://github.com/HugoFara/lwt
- 作者/维护者：HugoFara、原 LWT 作者及项目贡献者
- 许可证：The Unlicense
- 使用情况：参考点击查词、生词收藏和上下文学习的产品思路；当前网页端点击取词、词典加载与收藏代码为适配本站架构的独立实现，未复制其 PHP/MySQL 应用代码。

## Qwerty Learner

- 项目：https://github.com/RealKai42/qwerty-learner
- 作者/维护者：RealKai42 及项目贡献者
- 许可证：GNU General Public License v3.0（GPL-3.0）
- 使用情况：仅参考公开展示的交互思路与功能分类；未复制其源代码，未直接导入其词库或语音资源。

## UnlearnableWord（学不会单词）

- 项目：https://github.com/Mint-green/UnlearnableWord
- 作者/维护者：Mint-green 及项目贡献者
- 许可证：MIT License
- 使用情况：参考微信小程序学习、复习和统计页面的产品组织方式；当前实现为独立编写。

## ts-fsrs

- 项目：https://github.com/open-spaced-repetition/ts-fsrs
- 作者/维护者：Open Spaced Repetition 社区及项目贡献者
- 许可证：MIT License
- 使用情况：已整合 ts-fsrs 5.4.1 的 CommonJS 与 UMD 构建文件，分别用于微信小程序端和网页端的间隔复习调度。原始 MIT License 随源码保存在 `words/vendor/ts-fsrs/` 及网页端对应目录。

## ECDICT

- 项目：https://github.com/skywind3000/ECDICT
- 作者/维护者：skywind3000 及项目贡献者
- 许可证：MIT License
- 使用情况：以用户提供的《HY2024版专四词汇8000》和《专八词汇突破13000（新题型）》正文索引、派生词、短语及附录为来源，分别筛选并导入 4115 个专四、5673 个专八词条/短语；网页查词功能按当前题库及词库实际出现的词形生成精简查询子集。数据包含音标、释义与词形变化，未将 ECDICT 全库打包进项目。原始 MIT License 保存在 `words/vendor/ecdict/LICENSE` 及网页端对应目录。

专四、专八词表的收词范围来自用户提供词汇书的书后索引，并按对应词汇书正文顺序组织；项目不包含或重新发布教材正文、例句、图片和版式内容，也不宣称等同于考试官方完整词表。

## MIT License 原文

Copyright (c) 2022 Mint-green  
Copyright (c) 2026 Open Spaced Repetition  
Copyright (c) 2025 Linwei

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
