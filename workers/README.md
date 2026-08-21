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
| POST | `/api/notice` | 更新公告 `{text}` | Bearer ADMIN_TOKEN |
| POST | `/api/feedback` | 提交反馈 `{page,question,answer,note,contact}`（同 IP 30 秒最多 5 次） | 公开 |
| GET | `/api/feedback` | 拉取反馈列表（cursor 分页：`?cursor=&limit=&type=&since=&until=&handled=`） | Bearer ADMIN_TOKEN |
| PATCH | `/api/feedback?key=feedback:xxx&handled=1|0` | 标记反馈已处理/重新打开 | Bearer ADMIN_TOKEN |
| DELETE | `/api/feedback?key=feedback:xxx` | 删除反馈 | Bearer ADMIN_TOKEN |
| POST | `/api/sync` | 进度同步上传 `{deviceId?, payload}`（payload ≤ 2.5MB；匿名需 64 位 hex deviceId；登录态带 Bearer 走账号键） | 匿名 / 会话 |
| GET | `/api/sync?deviceId=x` | 进度同步下载（不存在返回 404；登录态可不带 deviceId 直接取账号数据） | 匿名 / 会话 |
| DELETE | `/api/sync?deviceId=x` | 删除云端进度（登录态直接删账号数据） | 匿名 / 会话 |
| GET | `/proxy/*` | 站点反代加速 → `https://free60127.github.io/666/*`（HTML 自动重写资源路径） | 公开 |
| GET | `/` 及任意非 `/api/` 路径 | 主域直连反代（`free60127.top`），HTML 去 `/666/` 前缀 + OG 地址改主域 | 公开 |

所有 API 响应 JSON。CORS：**API 路由**只对白名单来源（`https://free60127.github.io`、`https://free60127.top`）回显 `Access-Control-Allow-Origin`（其他来源无 CORS 头）；**反代**是公开静态资源，返回 `Access-Control-Allow-Origin: *`（不携带凭证）。

## 安全边界（2026-08-22 加固后）

- `/api/sync` 双模式：
  - **匿名（访客）**：恢复码 → `deviceId = SHA-256(code)`（64 位 hex），**知道恢复码才能读写数据**（服务端只存哈希）；
  - **账号（登录用户）**：`Authorization: Bearer <session>`，数据键 `user:{id}` 与匿名完全隔离；前端登录后自动把旧匿名数据迁移到账号（`cloud-sync.js migrateAnonymous`）。
- 保护措施：deviceId 必须 64 位 hex；每键每分钟限流（上传 10 / 下载 30 / 删除 6，KV 计数器）；`Content-Length` 预检 + 字符串化二次校验（payload ≤ 2.5MB）；写入带 2 年 TTL（730 天未备份自动过期）；响应 `Cache-Control: no-store`；CORS 回显 `Vary: Origin`。
- payload 全程端到端加密（PBKDF2 派生 AES-GCM-256），服务端/管理员读不到学习内容。
- 反馈限频（进程内 `Map`）仅限单实例；`/api/feedback` 列表已支持 cursor 分页 + 类型/时间/已处理筛选。
- 反代仅允许 `GET/HEAD`，并主动删除 `Authorization`、`Cookie` 等敏感请求头。

## 常用命令

本机 PowerShell 执行策略禁用了 `.ps1` shim，用 node 直调 wrangler：

```powershell
$W = 'C:\Users\23674\.ai-manager\runtimes\node\24.19.0\node_modules\wrangler\bin\wrangler.js'
node $W deploy          # 部署
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
