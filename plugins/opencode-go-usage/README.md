# OpenCode Go 用量

在会话头部右上角放一个紧凑的用量按钮（`conversation.session.header.utilities`），显示当前最紧张的窗口百分比；点开后是三行用量面板：5 小时用量、每周用量、每月用量，每行带百分比、进度条和重置时间。

## 数据来源

Host 半读取只读 OpenCode API Key，请求 `GET https://opencode.ai/inference/go/v1/usage`，把百分比与重置时间转成一份摘要，经 Harness 已鉴权的 `/api` 通道交给页面。Key 只在 Host 进程内使用，不会出现在页面、路由响应或日志里。

请求由上层的 Host 定时器发起，默认每 60 秒一次，与页面是否打开无关；页面每 20 秒读取一次这份快照，因此上游始终是每分钟一次，界面最多滞后约 20 秒。手动刷新会立刻补一次上游请求。

用量窗口与 OpenCode 的额度规则一致：5 小时窗口是月额度的 20%，每周窗口是 50%，每月窗口是 100%。

## 配置

行配置写在 profile 的 `cordis.patch.yml`：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `credentialRef` | `OPENCODE_GO_USAGE_API_KEY` | 凭据存储中的引用名；存储无值时回退到同名环境变量 |
| `baseUrl` | `https://opencode.ai` | 端点源站 |
| `usagePath` | `/inference/go/v1/usage` | 用量路径 |
| `refreshIntervalMs` | `60000` | Host 向官方端点请求的间隔；页面按它的三分之一（5–20 秒）读取快照 |
| `timeoutMs` | `15000` | 单次请求超时 |

## 设置 API Key

把只读 Key 存进凭据引用，而不是写进配置：

```yaml
# ~/.dsh/.credentials.yaml
refs:
  OPENCODE_GO_USAGE_API_KEY: oc_sk_...
```

凭据存储监听文件变化，保存后无需重启；页面下一次刷新即生效。也可以用环境变量 `OPENCODE_GO_USAGE_API_KEY` 启动 Harness。

只读 Key 无法调用模型，因此请勿用它覆盖推理用的 `OPENCODE_GO_API_KEY`。

## 交互

- 右上角按钮显示三个窗口中已用比例最高的那个（`时 100%`、`周 62%`、`月 47%`），鼠标悬停可看到三个窗口的完整数值。
- 点击按钮打开面板，每行显示窗口名、进度条、百分比与重置时间；达到 80% 变黄，达到 100% 或被限流变红。
- 面板右上角按钮强制刷新，绕过 Host 缓存；按 Esc 或点击面板外关闭面板。
- 刷新失败时保留上一次结果，并在底部提示失败原因（401、403、限流、网络、超时）。
- 文案走 Harness 的 locale 服务，中英文随界面语言切换。

## 限制

- 只读取用量，不读取模型列表、账单或余额。
- 需要页面与 Host 同源，路由走 `/api` 的浏览器鉴权。
- 未做 Off-Peak/Peak 计费的细分，返回什么就显示什么。
- 入口位于会话头部，因此只在打开会话时出现。
