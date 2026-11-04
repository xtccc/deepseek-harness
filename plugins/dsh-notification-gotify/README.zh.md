# dsh-notification-gotify

DeepSeek Harness 的 Gotify 推送通知插件。宿主进程监听 `session/event` 事件流，当任务**完成**、**失败**、**被中断**、或**向你提问**时，向你的 Gotify 服务器推送一条消息——浏览器关着也能在手机上收到提醒。

```
session/event 事件流（turn/end completed · turn/end error/max-tokens/blocked · turn/end aborted/interrupted · tool/call ask_user_question · tool/call exit_plan_mode）
        -> 宿主 watcher（按会话折叠、按 seq 去重、提问防抖）
        -> GotifyPusher（串行 POST /message?token=…）
        -> Gotify 服务器 -> 手机/桌面客户端
```

**无需改动 harness**：插件订阅的正是会话投影注册表驱动的同一条 `session/event` 通道，而且完全没有浏览器半部分。

## 安装

```sh
dsh plugin --profile web add file:/path/to/dsh-notification-gotify
```

重启 web 服务以加载宿主 bundle，然后在 profile 的 `cordis.yml` 里加上 Gotify 配置：

```yaml
- id: dsh-notification-gotify
  name: dsh-notification-gotify
  config:
    baseUrl: https://gotify.example.com
    appToken: AaBbCcDdEeFfGgHhIiJjKkL
```

## 配置

| 配置项 | 默认 | 作用 |
| --- | --- | --- |
| `baseUrl` | `''` | Gotify 服务器地址（如 `https://gotify.example.com`）。为空时插件只记一条警告、不发送任何推送。 |
| `appToken` | `''` | Gotify 按应用签发的应用 token。 |
| `enabled` | `true` | 总开关；关闭后不再推送，其余配置保留。 |
| `notifyCompleted` | `true` | 轮次以 `completed` 结束时推送。 |
| `notifyInterrupted` | `true` | 轮次以 `aborted`（用户/父代理取消）或 `interrupted`（崩溃孤儿轮次在重载时关闭）结束时推送。 |
| `notifyFailed` | `true` | 轮次以 `error`、`max-tokens`、`blocked` 结束时推送——任务没有给出你要的结果就停了。 |
| `notifyQuestion` | `true` | 模型调用 `ask_user_question`，或通过 `exit_plan_mode` 提交计划审阅（任务停在那里等你回答）时推送。 |
| `completedPriority` | `5` | 完成推送的 Gotify 优先级（0–10）。 |
| `interruptedPriority` | `8` | 中断推送的 Gotify 优先级（0–10）。 |
| `failedPriority` | `8` | 失败轮次推送的 Gotify 优先级（0–10）。 |
| `questionPriority` | `9` | 提问推送的 Gotify 优先级（0–10）。 |
| `maxBodyChars` | `400` | 推送正文中最终回复/问题文本的字符预算，超出省略号截断。 |
| `questionDelayMs` | `5000` | 提问/计划审阅推送延迟这么久才发出；期间若同一次调用的 `tool/result` 先到（你已在界面里回答），推送取消。 |
| `timeoutMs` | `10000` | 单次 Gotify 请求的 HTTP 超时。 |

推送按 FIFO 队列串行发出（多个会话并发时保持顺序），失败通过插件 logger 记录且不会中断队列；每个会话、每种事件至多推送一次。

推送正文包含会话标题（已挂载 session-title 服务时取 `session/title` 事件，否则取第一条用户消息）、轮次号；完成推送附带最终回复文本（该轮次最后一条助手消息，不含逐步的过程叙述），失败推送附带失败原因与该轮次已产出的文本，提问推送附带问题文本与选项（计划审阅附带被审阅的计划）。子代理会话一律跳过，`forked`（fork 种子收尾）一律不推送。

## 对模型的影响

| 方面 | 效果 |
| --- | --- |
| Token 开销 | 无 —— 通知绝不进入请求。 |
| 工具调用 | 无 —— 模型没有新增任何工具。 |
| 会话日志 | 不变 —— 插件只读事件流，不新增事件。 |
| 提示词 | 不变 —— 不注册任何 system prompt 段。 |

## 权限边界

- 宿主订阅 `session/event`（投影注册表驱动的同一条火线），折叠一份很小的按会话状态，再 POST 到 Gotify；插件不写日志，不注册面向模型的工具。
- 凭据只存在于 `cordis.yml` 服务端配置；token 通过文档规定的 `?token=` 查询参数经 HTTPS 传输。
- 提问推送带防抖，若用户先在界面里回答则取消推送，秒答不会轰炸手机。

## 开发

```sh
pnpm install            # 链接所在的 deepseek-harness 仓库用于构建与测试
pnpm run check          # typecheck + tests + build
pnpm run test           # vitest（gotify 客户端、会话 watcher、宿主组合）
pnpm run build          # esbuild host 打包 + tsc 声明
```

插件提交了构建好的 `lib/`，profile 直接 `link:` 到本目录即可；`pnpm install` 只在改动它时才需要。开发期 `link:` 指向所在 harness 仓库的 `../../packages/...` 与 `../../vendor/...`。组合测试用真实 `SessionStore` 验证 watcher→pusher 全链路（仅 fetch 传输层为 mock）。

## 已知限制

- 需要 Gotify 服务器可达；网络故障时只记日志并丢弃该条推送（无重试队列）。
- 只在插件加载期间观察事件：重启前已完成的轮次不会补推。
- `questionDelayMs` 防抖只在单进程内生效；重启后不再跟踪未决的提问。

## License

MIT
