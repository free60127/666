# 外院知识分享站 · 云端 API（Cloudflare Worker）

线上地址：`https://api.free60127.top`（API）／ `https://free60127.top`（主域直连反代）
备用：`https://waiyuan-study.3338095791.workers.dev`（workers.dev 在国内常被 DNS 污染，仅作兜底）

## 域名接入（2026-08-21）

- 阿里云注册域名 `free60127.top`，NS 已改指向 Cloudflare（`andy.ns.cloudflare.com` + `mallory.ns.cloudflare.com`），zone 状态 `active`。
- `api.free60127.top`：绑定本 Worker（API 专用，只走 `/api/*` 路由）。
- `free60127.top`：绑定本 Worker，所有非 `/api/` 路径反代 `https://free60127.github.io/666`（HTML 自动去 `/666/` 前缀 + OG 地址改主域）。
- CORS 白名单：`https://free60127.github.io`、`https://free60127.top`。
- 前端切换：`common.js` 的 `WAIYUAN_API_BASE = https://api.free60127.top`（一处生效全站）。

## 接口一览

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| GET | `/api/health` | 健康检查 | 公开 |
| GET | `/api/notice` | 读取公告 | 公开 |
| GET | `/api/stats` | 站点统计：`{totals, today, daily[14], topPages[20]}`（PV/UV/趋势/热门页面） | Bearer ADMIN_TOKEN |
| POST | `/api/notice` | 更新公告 `{text}` | Bearer ADMIN_TOKEN |
| POST | `/api/feedback` | 提交反馈 `{page,question,answer,note,contact}`（同 IP 30 秒最多 5 次） | 公开 |
| GET | `/api/feedback` | 拉取反馈列表（cursor 分页：`?cursor=&limit=&type=&since=&until=&handled=`） | Bearer ADMIN_TOKEN |
| PATCH | `/api/feedback?key=feedback:xxx&handled=1|0` | 标记反馈已处理/重新打开 | Bearer ADMIN_TOKEN |
| DELETE | `/api/feedback?key=feedback:xxx` | 删除反馈 | Bearer ADMIN_TOKEN |
| POST | `/api/sync` | 进度同步上传 `{deviceId?, payload, baseRev?}`（payload ≤ 2.5MB；匿名需 64 位 hex deviceId；登录态带 Bearer 走账号键。baseRev 为乐观锁版本号：与云端当前 rev 不一致返回 409 + 云端最新数据） | 匿名 / 会话 |
| GET | `/api/sync?deviceId=x` | 进度同步下载（不存在返回 404；登录态可不带 deviceId 直接取账号数据；响应带 `rev` 供下次上传冲突检测） | 匿名 / 会话 |
| DELETE | `/api/sync?deviceId=x` | 删除云端进度（登录态直接删账号数据） | 匿名 / 会话 |
| GET | `/proxy/*` | 站点反代加速 → `https://free60127.github.io/666/*`（HTML 自动重写资源路径） | 公开 |
| GET | `/` 及任意非 `/api/` 路径 | 主域直连反代（`free60127.top`），HTML 去 `/666/` 前缀 + OG 地址改主域 | 公开 |

所有 API 响应 JSON。CORS：**API 路由**只对白名单来源（`https://free60127.github.io`、`https://free60127.top`）回显 `Access-Control-Allow-Origin`（其他来源无 CORS 头）；**反代**是公开静态资源，返回 `Access-Control-Allow-Origin: *`（不携带凭证）。

## 账号体系（2026-08-22，D1）

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| POST | `/api/auth/register` | 注册 `{email, password, nickname?, recovery?}`（recovery 为恢复码保险箱 `{salt,iv,c}`） | 公开（IP+邮箱限流） |
| POST | `/api/auth/login` | 登录 → `{token, user, recovery}`（30 天会话；连续 8 次失败锁 15 分钟） | 公开 |
| POST | `/api/auth/logout` | 退出当前会话 | 会话 |
| GET | `/api/auth/me` | 当前用户 + 恢复码保险箱 | 会话 |
| POST | `/api/auth/recovery` | 更新恢复码保险箱 `{recovery}` | 会话 |
| POST | `/api/auth/change-password` | 改密码 `{oldPassword, newPassword, recovery?}`（recovery 可选：新密码加密的保险箱，随改密原子更新；其他设备会话全部失效） | 会话 |
| POST | `/api/auth/delete-account` | 注销 `{password}`（D1 原子清理账号、会话、活跃记录、同步数据和重置码；旧 KV 残留删除失败会进入 Cron 重试队列，响应含 `cleanupPending`） | 会话 + 密码 |
| POST | `/api/auth/forgot` | 找回密码第 1 步：向注册邮箱发 8 位数字重置码（15 分钟有效；未注册邮箱也返回 ok 防枚举；每邮箱 1 分钟 1 次） | 公开 |
| POST | `/api/auth/reset-password` | 找回密码第 2 步 `{email, code, newPassword, recovery?}`（邮箱 15 分钟最多 8 次、IP 最多 20 次；超限作废验证码；成功后原子消费，重置后全部设备退出） | 公开 |
| POST | `/api/auth/admin-reset-code` | 管理端兜底：生成重置码（明文返回，线下转交用户）`{email}` | Bearer ADMIN_TOKEN |

### 邮件（找回密码）

Worker 用 **TCP sockets**（`cloudflare:sockets`，TLS 直连 smtp.qq.com:465）发信，无需第三方 HTTP 邮件服务。需配置 secret：

```powershell
node $W secret put SMTP_USER   # QQ 邮箱（如 3338095791@qq.com）
node $W secret put SMTP_PASS   # QQ 邮箱 SMTP 授权码（QQ 邮箱设置 → 账户 → 开启 SMTP 服务生成；非 QQ 密码）
# 可选：SMTP_HOST（缺省 smtp.qq.com）、SMTP_PORT（缺省 465）、SMTP_FROM（缺省 SMTP_USER）
```

未配置时 `/api/auth/forgot` 返回 503「邮件发送失败」，不影响注册/登录/改密码/注销；管理员可用 `admin-reset-code` 线下兜底。

### 安全说明

- **密码即钥匙**：恢复码保险箱用密码派生密钥（PBKDF2 150k + AES-GCM-256）加密，服务端只存密文无法解密；改密码/重置密码时前端用旧密码解密 → 新密码重新加密上传（change-password 可随请求原子更新）。
- **忘记密码 = 云端数据需原恢复码**：重置密码会清空保险箱（除非请求携带新密码加密的原恢复码），登录后若本机无恢复码需手动「云端恢复」或联系管理员。
- 会话 token 在库中只存 SHA-256 哈希；密码 PBKDF2(SHA-256, 10k 轮, 16B salt)（Workers 免费计划 CPU 限制，150k 会超时）。
- SMTP 邮件主题使用 RFC 2047 Base64，正文使用 UTF-8 Base64；SMTP 连接在成功和异常路径都会释放。
- 注销账号后的旧 KV 残留清理任务使用 `cleanup_jobs` 表和 Cron 指数退避重试；同步数据主存已迁移到 D1 `sync_data`，不再使用 KV `sync:user:{id}` 作为主存储。

## 安全边界（2026-08-22 加固后）


- `/api/sync` 双模式：
  - **匿名（访客）**：恢复码 → `deviceId = SHA-256(code)`（64 位 hex），**知道恢复码才能读写数据**（服务端只存哈希）；
  - **账号（登录用户）**：`Authorization: Bearer <session>`，数据键 `user:{id}` 与匿名完全隔离；前端登录后自动把旧匿名数据迁移到账号（`cloud-sync.js migrateAnonymous`）。
- 保护措施：deviceId 必须 64 位 hex；每键每分钟限流（上传 10 / 下载 30 / 删除 6，D1 rate 表滚动窗口，2026-08-22 自 KV 迁出）；`Content-Length` 预检 + 字符串化二次校验（payload ≤ 2.5MB）；写入带 2 年 TTL（730 天未备份自动过期）；响应 `Cache-Control: no-store`；CORS 回显 `Vary: Origin`。
- **版本号 + 冲突检测（2026-08-22）**：云端每条记录带 `rev`（写入时间戳毫秒）。客户端上传带 `baseRev`（下载得到的 rev），服务端校验 `baseRev === 当前 rev` 才写入；不一致返回 `409 {error:'conflict', rev, payload, updatedAt}`，前端（cloud-sync.js）自动拉最新数据合并后重试一次——多设备并发写不再互相覆盖。旧客户端不带 baseRev 仍可写（向后兼容）；旧记录无 rev 视为 0。
- payload 全程端到端加密（PBKDF2 派生 AES-GCM-256），服务端/管理员读不到学习内容。
- 反馈限频（进程内 `Map`）仅限单实例；`/api/feedback` 列表已支持 cursor 分页 + 类型/时间/已处理筛选。
- 反代仅允许 `GET/HEAD`，并主动删除 `Authorization`、`Cookie` 等敏感请求头。

## 站点统计（2026-08-22）

- 统计范围：**经本 Worker 反代的页面访问**（`free60127.top` 主域直连 + `/proxy/* 路径）；直接访问 `github.io` 源站不经 Worker，不计入。
- 口径：PV = 每次 HTML 页面 GET 请求；UV = 当日去重访客（浏览器 Cookie `waiyuan_vid` 识别，无 Cookie 的请求按 `CF-Connecting-IP + 日期` 哈希兜底，同 IP 当日只算 1）。
- 存储（**D1**，2026-08-22 自 KV 迁出——KV 免费每日写/删/列仅 1000 次，统计高频写触发 429；D1 免费 10 万写/日）：`stats` 表（键名与旧 KV 一致：`stats:pv:total`、`stats:pv:day:{YYYY-MM-DD}`、`stats:page:{encoded}`、`stats:uv:day:{date}`）+ `uv_seen` 表做当日访客去重（替代 KV TTL 键）。日期用 UTC+8 自然日。
- 读取：`GET /api/stats`（需 ADMIN_TOKEN）返回累计 PV、今日 PV/UV、近 14 天逐日 PV/UV、热门页面 Top 20（按 PV 降序）。
- 注意：计数失败静默，不影响页面响应；D1 为强一致存储，写入后立即可见（无需轮询）。
- 排行榜/限流（2026-08-22 迁 D1）：`activity` 表（每身份每日一行，替代 KV act: 键）、`rank_cache` 表（结果缓存 5 分钟）、`rate` 表（滚动窗口限流，每身份×动作一行，键量恒定无需清理）。登录邮箱锁定在 `login_fails` 表（0002 迁移）。
- 存量迁移：`scripts/migrate-kv-to-d1.mjs` 读 KV `stats:*`/`act:*` 键生成 SQL，`wrangler d1 execute --remote --file` 导入（INSERT OR IGNORE 幂等）。

## 常用命令

本机 PowerShell 执行策略禁用了 `.ps1` shim，用 node 直调 wrangler：

```powershell
$W = 'C:\Users\23674\.ai-manager\runtimes\node\24.19.0\node_modules\wrangler\bin\wrangler.js'
node $W d1 migrations apply waiyuan-study-db --remote  # 应用 migrations/ 下全部待执行迁移（当前至 0011）
node $W deploy          # 再部署 Worker
node $W dev --port 8787 # 本地调试（miniflare 模拟 KV）
node $W kv namespace create NAME   # 新建 KV
node $W secret put ADMIN_TOKEN     # 更新管理令牌（stdin 管道输入）
node $W tail            # 实时日志
```

## 管理令牌

`ADMIN_TOKEN` 已作为 **secret** 存于线上（不会出现在代码/配置中），当前值见会话记录。
更换方法：`'新令牌' | node $W secret put ADMIN_TOKEN`（生成：`-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 32 | %{[char]$_})`）。

## 坑位记录

- **空目录陷阱**：`wrangler` 在无 `wrangler.jsonc` 的目录下会走交互引导，内部 spawn 系统 PowerShell 失败报 `ENOENT`——任何目录都先放配置文件。
- **同名冲突**：`vars` 与 `secret` 不能同名（API code 10053），秘密一律用 secret，vars 只放公开配置。
- **npm 11**：全局安装需 `--allow-scripts=esbuild,workerd` 放行安装脚本，否则 wrangler 二进制缺失。
- **workers.dev 国内访问**：DNS 常被污染/边缘 IP 被断，建议后续绑定自定义域名（Cloudflare 免费套餐可托管 DNS）。
