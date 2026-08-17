# 第三方开源参考与许可声明

“外院 · 背单词”第一版在产品设计和技术调研阶段参考了以下开源项目。项目名称、作者和许可证按原仓库声明保留。

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
- 使用情况：以用户提供的《HY2024版专四词汇8000》书后索引为白名单，筛选并导入 4115 个专四词条的音标、中文释义、英文释义、词形变化及考试标签。未将 ECDICT 全库打包进项目，原始 MIT License 保存在 `words/vendor/ecdict/LICENSE` 及网页端对应目录。

专四词表的收词范围来自用户提供词汇书的书后索引；项目不包含或重新发布该书正文、例句和版式内容。专八词库目前仍为首批体验数据，不宣称等同于考试官方完整词表。

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
