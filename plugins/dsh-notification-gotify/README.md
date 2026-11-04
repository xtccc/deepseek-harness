# dsh-notification-gotify

Gotify push notifications for the DeepSeek Harness. The host process watches the `session/event` firehose and pushes a message to your Gotify server when a task **completes**, **fails**, is **interrupted**, or **asks you a question** — so your phone buzzes even when no browser tab is open.

```
session/event firehose (turn/end completed · turn/end error/max-tokens/blocked · turn/end aborted/interrupted · tool/call ask_user_question · tool/call exit_plan_mode)
        -> host watcher (per-session fold, seq idempotence, question debounce)
        -> GotifyPusher (serialized POST /message?token=…)
        -> Gotify server -> your phone/desktop
```

No harness change is needed: the plugin subscribes to the same `session/event` seam the session-projection registry drives, and there is no browser half at all.

## Install

```sh
dsh plugin --profile web add file:/path/to/dsh-notification-gotify
```

Restart the web server so the host bundle is loaded, then add the Gotify
configuration to the profile's `cordis.yml`:

```yaml
- id: dsh-notification-gotify
  name: dsh-notification-gotify
  config:
    baseUrl: https://gotify.example.com
    appToken: AaBbCcDdEeFfGgHhIiJjKkL
```

## Configuration

| Setting | Default | Effect |
| --- | --- | --- |
| `baseUrl` | `''` | Gotify server root (e.g. `https://gotify.example.com`). Empty = plugin logs a warning and sends nothing. |
| `appToken` | `''` | The application token Gotify issues per app. |
| `enabled` | `true` | Master switch; off stops every push while keeping the rest of the config. |
| `notifyCompleted` | `true` | Push when a turn ends with reason `completed`. |
| `notifyInterrupted` | `true` | Push when a turn ends `aborted` (user/parent cancel) or `interrupted` (crash-orphaned turn closed on reload). |
| `notifyFailed` | `true` | Push when a turn ends `error`, `max-tokens`, or `blocked` — the task stopped without the answer you asked for. |
| `notifyQuestion` | `true` | Push when the model calls `ask_user_question`, or presents a plan-mode review via `exit_plan_mode` (the task is parked waiting for you). |
| `completedPriority` | `5` | Gotify priority for completed pushes (0–10). |
| `interruptedPriority` | `8` | Gotify priority for interrupted pushes (0–10). |
| `failedPriority` | `8` | Gotify priority for failed-turn pushes (0–10). |
| `questionPriority` | `9` | Gotify priority for question pushes (0–10). |
| `maxBodyChars` | `400` | Character budget for the final-reply/question text in a push body; longer text is ellipsized. |
| `questionDelayMs` | `5000` | Question/plan-review pushes wait this long before firing; if a `tool/result` for the same call lands first (you answered in the UI), the push is cancelled. |
| `timeoutMs` | `10000` | HTTP timeout for one Gotify request. |

Pushes are serialized on a FIFO queue (order preserved across parallel
sessions), failures are logged via the plugin's logger and never break the
queue, and each event is delivered at most once per session per kind.

Push bodies carry the session title (from the `session/title` event when the
session-title service is mounted, otherwise the first user message), the turn
number, and — for completions — the final reply text (the turn's last
assistant message; step-by-step narration is not included), for failures the
reason plus any reply text the turn produced, or for questions the question
text with its options (a plan review carries the reviewed plan). Subagent
sessions are skipped, and a fork-seed turn close (`forked`) never pushes.

## Model experience

| Aspect | Effect |
| --- | --- |
| Token cost | None — notifications never enter a request. |
| Tool calls | None — the model gets no new tool. |
| Session log | Unchanged — the plugin only reads the event firehose and adds no events. |
| Prompt | Unchanged — no system-prompt section is registered. |

## Permission boundary

- The host subscribes to `session/event` (the same firehose the projection registry drives), folds a small per-session state, and POSTs to Gotify; the plugin writes nothing to the log and registers no model-facing tools.
- Credentials live in `cordis.yml` server config only; the token travels the documented `?token=` query parameter over HTTPS.
- The question push is debounced and cancelled when the user answers in the UI first, so instant answers never spam your phone.

## Development

```sh
pnpm install            # links the surrounding deepseek-harness checkout for build and tests
pnpm run check          # typecheck + tests + build
pnpm run test           # vitest (gotify client, session watcher, host composition)
pnpm run build          # esbuild host bundle + tsc declarations
```

The plugin ships its built `lib/`, so a profile resolves it with a plain
`link:` to this directory; `pnpm install` here is only needed to change it.
The dev-time `link:` resolutions point at `../../packages/...` and
`../../vendor/...` in the surrounding harness checkout. The composition spec
boots the real `SessionStore` and proves the watcher→pusher chain over real
committed events (only the fetch transport is faked).

## Known limitations

- The plugin needs a reachable Gotify server; a network outage only logs and drops the push (no retry queue).
- Events are only observed while the plugin is loaded: a completion that happened before the server restart is not re-pushed.
- `questionDelayMs` debounces within one process; after a restart a pending question is no longer tracked.

## License

MIT
