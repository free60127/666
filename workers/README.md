# 外院知识分享站 · 云端 API（Cloudflare Worker）

线上地址：`https://waiyuan-study.3338095791.workers.dev`
（域名若被网络环境 DNS 污染，可改用 DoH 解析后直连真实 IP，或后续绑定自定义域名）

## 接口一览

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| GET | `/api/health` | 健康检查 | 公开 |
| GET | `/api/notice` | 读取公告 | 公开 |
| POST | `/api/notice` | 更新公告 `{text}` | Bearer ADMIN_TOKEN |
| POST | `/api/feedback` | 提交反馈 `{page,question,answer,note,contact}`（同 IP 30 秒最多 5 次） | 公开 |
| GET | `/api/feedback` | 拉取反馈列表（最多 200 条） | Bearer ADMIN_TOKEN |
| POST | `/api/sync` | 进度同步上传 `{deviceId, payload}`（payload ≤ 1MB，deviceId ≤ 64 字符） | 匿名 |
| GET | `/api/sync?deviceId=x` | 进度同步下载（不存在返回 404） | 匿名 |
| DELETE | `/api/sync?deviceId=x` | 删除云端进度 | 匿名 |
| GET | `/proxy/*` | 站点反代加速 → `https://free60127.github.io/666/*`（HTML 自动重写资源路径） | 公开 |

所有 API 响应 JSON。CORS：**API 路由**只对白名单来源 `https://free60127.github.io` 回显 `Access-Control-Allow-Origin`（其他来源无 CORS 头）；**反代 `/proxy/*`** 是公开静态资源，返回 `Access-Control-Allow-Origin: *`（不携带凭证）。

## 安全边界（上线清单，未启用前须知）

- `/api/sync` 使用匿名 `deviceId` 作为访问凭证——**知道 ID 即可读取/覆盖/删除进度**，前端暂未接入，切勿直接上线自动云同步；启用前需增加配对码/签名令牌/账号鉴权、payload 加密、冲突合并与设备解绑。
- 反馈/同步限频使用进程内 `Map`，多实例部署时不是全局限流。
- `/api/feedback` 拉取最多 200 条，无分页。
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
