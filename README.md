
## 运维与验证脚本
- `scripts/release.js`：一键发布（重建产物 → 版本号刷新 → 校验 → commit/push）
- `scripts/check-online.js`：线上资源与功能全量检查（主域 21+ 项 + API + www 301）
- `scripts/verify-*-live.mjs`：线上 API 集成验证。**注意**：`verify-rank-live.mjs` 会创建线上测试账号并写入排行榜活动数据，脚本结束会自动清理（活动记录 + 测试账号）；请勿在 CI 中自动执行。`verify-auth-live.mjs`/`verify-v2-live.mjs`/`verify-v3-live.mjs`/`verify-harden-live.mjs`/`verify-stats-live.mjs` 同理会产生少量线上测试数据。
- 管理接口：`DELETE /api/auth/account?email=`（管理员令牌，删账号级联会话）、`DELETE /api/activity?key=&date=`（管理员令牌，删单日活动记录）——清理遗留测试数据用。

## 2026-08-23 审查整改（跑腿 + 全站安全）
- **限流全面化**（D1 rate 表滚动窗口）：注册（IP 10 分钟 30 次 + 邮箱 1 小时 5 次）、找回密码（邮箱 1 分钟 1 次 + IP 10 分钟 10 次 + 全局 1 分钟 30 次）、跑腿发布（10 分钟 30 次）/接单（1 分钟 10 次）/申诉（1 分钟 5 次 + IP 20 次）、/api/visit（IP 1 分钟 60 次，防伪造 vid 刷量）。
- **限流器故障语义**：登录放行（可用性优先）；写操作（注册/找回/申诉/visit）保守拒绝 503。
- **登录失败计数原子化**（UPSERT，并发不丢计数）；注销前跑腿任务检查 DB 故障返回 503（原 .catch 误放行）；任务详情/完成/确认区分 DB 故障（503）与业务错误（404/400）。
- **跑腿发布**强制 pickup/dropoff/contact 必填 + deadline 安全整数（前后端一致）；/api/visit 路径白名单（拒绝 ../、//、反斜杠、控制字符）。
- **任务分享二维码深链** ?task=ID，扫码直达任务详情；前端列表竞态修复（requestId 作废旧响应 + 加载更多锁）；注册免二次登录（原逻辑创建两个会话）；跑腿页新增「📱 添加到主屏幕」（与主页一致）。
- **工具链**：ci.yml worker-test 增跑 test-errand.mjs；validate.js 增综英 data.js 校验（kind/kindLabel/重复题/HTML 实体）；check-online.js 失败计数 + 非 0 退出码。
## 2026-08-23 第二轮审查整改（APK 链路 + 限流/并发 + 跑腿 + 测试）
- **APK 版本化**：APK 的 versionName/versionCode 由 workflow 注入（输入 version 或自动 `1.YYMM.提交数`；versionCode=git 提交数单调递增），Android 可覆盖更新；Release tag 跟随版本（apk-v<版本>）。
- **APK 下载链路**：稳定地址 `/apk/waiyuan-*.apk` 302 → 版本化地址 `/apk/waiyuan-*-v<版本>.apk`（KV 键 `apk:latest:<名>` 存最新版本）；版本化地址长缓存（7 天 immutable）+ ETag（SHA-256，实时计算兜底）+ 304；KV 无文件 404 / KV 故障 503 区分。workflow 上传：curl --fail-with-body + success 字段校验 + metadata.sha + 上传后稳定/版本化双地址验证大小一致。
- **限流故障语义收紧**：登录 IP/邮箱检查、找回密码尝试计数故障 → 503（不再放行）；同步上传/删除、心跳、反馈提交故障 → 503（读路径 download/visit 仍放行）；反馈限流从实例内存 Map 迁 D1 rate 表（多节点一致）。
- **云同步 CAS 原子化**：同步数据从 KV 迁 D1 `sync_data` 表（0011 迁移）；上传带 baseRev 时用 `INSERT ... ON CONFLICT DO UPDATE ... WHERE sync_data.rev = ?` 原子校验（changes=0 → 409 带云端最新），双设备并发不再互相覆盖；无 baseRev 旧客户端兼容覆盖。存量 KV 数据迁移工具 `scripts/migrate-kv-sync-to-d1.cjs`（当前仅测试残留键，已清）。注销/清理任务同步删 D1 数据。
- **activity 心跳原子化**：先查后改 → 单条 UPSERT（minutes+1 / learned+增量 / last_ts）+ 40s 间隔条件（WHERE 只作用于 UPDATE 分支），并发不丢计数；响应不再返回 minutes/learned（验证脚本断言已同步更新）。
- **跑腿**：doing 状态补申诉入口（原逻辑写在 done 分支内永远不显示）；详情/评价/申诉加载加请求序号守卫（快速切详情不串数据）；申诉证据过滤后整体 D1 batch 原子提交；takeTask/cancelTask/listEvidence/resolveDispute 区分 DB 故障（503）与业务错误（404/400/403）。
- **测试**：playwright.config reuseExistingServer 改为 `!process.env.CI`（本地复用、CI 自管生命周期，测试结束进程不残留）；新增 doing 申诉按钮用例；新增 `scripts/verify-apk-live.mjs`（稳定 302 → 版本化 200 + 类型/大小/魔数/ETag/304 全链路 smoke test）。
## 安卓版 App（APK）
- 两个 **Capacitor（WebView）壳** APK：**外院知识分享站**（加载 https://free60127.top/）与 **外院跑腿**（加载 https://free60127.top/paotui/）；内容是线上网页，站点更新即自动同步，无需重装。Capacitor 内置 confirm/文件上传/a[download] 等能力（跑腿确认弹窗、反馈/申诉图片上传、分享卡保存图片均可直接使用）。
- 下载：`https://free60127.top/apk/waiyuan-share.apk`、`https://free60127.top/apk/waiyuan-paotui.apk`（Worker 从 KV 直出，国内无需 VPN；GitHub Release `apk-v<版本>` 为备份源）。
- 构建：GitHub Actions `twa-build.yml`（手动触发 workflow_dispatch，`app=both/share/paotui`）→ `scripts/cap-sign.cjs` 注入签名/版本（keystore 从 secret 还原到 `keys/`）→ `./gradlew assembleRelease`（工程 `cap-share/`、`cap-paotui/` 已提交仓库）→ CF API 直传 KV + 上传 Release。签名 keystore 存 GitHub secrets（APK_KEYSTORE_B64/APK_KEYSTORE_PASS/APK_KEY_PASS/APK_KEY_ALIAS=waiyuan，PKCS12，指纹 FE:DE:94:7D:56:16:0E:99:90:FF:A3:00:5F:AB:42:82:5B:0F:A2:18:BC:E8:E6:55:15:5C:83:BA:B1:8E:3D:85）；数字资产关联 `.well-known/assetlinks.json`（com.waiyuan.share + com.waiyuan.paotui）已上线。
- 图标：branding/share-icon.png 与 paotui-icon.png（1254×1254）生成全套 mipmap + adaptive icon（背景 #fdfaf3）。
- 注意：App 壳版本更新需重新下载安装（网页内容自动更新）；versionCode 随 git 提交数单调递增，可覆盖安装。
## 数据治理记录

- 2026-08：思修 318→214、近代史 331→215（去重 + 答案冲突修正）、毛概 244→243、计算机数据库基础清 1 组重复；马原、习概无重复。
- **2026-08-21 答案书核对**：以《新编英语语法教程 第6版 课后练习答案》PDF 逐题核对翻译（257 题）与改写（390 题）答案，**648 题中 643 题与官方答案完全一致**；修复 4 处：21C 题号错位（#9 题目尾部粘连原 #10 题目、#10 题目丢失、#11 答案合并 #12 → 拆分为 20 题并全量对齐 PDF 答案）、39B#26 答案错位（原为 #36/#37 内容 → 修正为 PDF 值）、21B#11 剥离题号前缀、23D#14 "V ote"→"Vote"。核对脚本保留于 `scripts/_tmp-parse-pdf.js`/`scripts/_tmp-diff.js`（PDF 文本解析 + 对照报告），修复脚本 `scripts/fix-translations-pdf.js`（幂等，执行前自动备份 `.bak-pdfcheck`）。
- **已知缺题**（答案书有、站内暂缺，旧 OCR 提取时漏题，中文题目需 OCR 恢复）：翻译 16C 缺 #20-21、18B 缺 #31-50、27G 缺 #20。答案书本身无 13A/32C/32D 练习（无法核对）。39B#7 答案书排版残缺（项目答案保留）。39B#36/#37 项目答案与答案书语义等价（不同写法，保留项目版本）。
- 历史教训：改数据后必须重新跑 `build.js` 重建产物并验证（脚本与手改数据不同步曾导致回滚事故）；id 按题型独立编号（`single#87` ≠ `multi#87`）。