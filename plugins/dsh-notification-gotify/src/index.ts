/**
 * dsh-notification-gotify host plugin: pushes Gotify notifications when a session's
 * task completes, is interrupted, or asks the user a question. The watcher
 * subscribes to the `session/event` firehose (the same seam the
 * session-projection registry drives); the sender is a serialized HTTP client
 * over the global fetch. No harness change and no browser half — pushes work
 * even when no client is connected.
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Type-only: brings the `ctx.sessions` member and the `session/event` event
// into this program's Context typing.
import type {} from '@deepseek-ai/dsh-session'
import type { GotifyNotification } from './contract.ts'
import { GotifyPusher } from './gotify.ts'
import type { ResolvedConfig } from './types.ts'
import { SessionEventWatcher } from './watcher.ts'

/** Cordis plugin name (the Loader entry). */
export const name = 'dsh-notification-gotify'

/** Services required before load: the session store (its event firehose). */
export const inject = ['sessions']

/** Host plugin configuration, validated at load by the Loader. */
export interface Config {
  /** Gotify server root, e.g. `https://gotify.example.com`. */
  baseUrl: string
  /** The application token Gotify issues per app. */
  appToken: string
  /** Master switch; false stops every push while keeping the other settings. */
  enabled: boolean
  /** Push when a turn ends with reason `completed`. */
  notifyCompleted: boolean
  /** Push when a turn ends `aborted` or `interrupted`. */
  notifyInterrupted: boolean
  /** Push when a turn ends `error`, `max-tokens`, or `blocked`. */
  notifyFailed: boolean
  /** Push when the model calls `ask_user_question`. */
  notifyQuestion: boolean
  /** Gotify priority for completed pushes. */
  completedPriority: number
  /** Gotify priority for interrupted pushes. */
  interruptedPriority: number
  /** Gotify priority for failed-turn pushes. */
  failedPriority: number
  /** Gotify priority for question pushes. */
  questionPriority: number
  /** Character budget for reply/question text in a push body. */
  maxBodyChars: number
  /** Debounce for question pushes; answered questions are cancelled. */
  questionDelayMs: number
  /** HTTP timeout for one Gotify request. */
  timeoutMs: number
}

/**
 * Configuration schema, validated at load by the Loader. `baseUrl`/`appToken`
 * default to empty so a profile can mount the plugin before configuring
 * Gotify; the plugin then logs a warning and stays inert instead of failing
 * the composition.
 */
export const Config = z.object({
  baseUrl: z.string().default(''),
  appToken: z.string().default(''),
  enabled: z.boolean().default(true),
  notifyCompleted: z.boolean().default(true),
  notifyInterrupted: z.boolean().default(true),
  notifyFailed: z.boolean().default(true),
  notifyQuestion: z.boolean().default(true),
  completedPriority: z.number().min(0).max(10).default(5),
  interruptedPriority: z.number().min(0).max(10).default(8),
  failedPriority: z.number().min(0).max(10).default(8),
  questionPriority: z.number().min(0).max(10).default(9),
  maxBodyChars: z.natural().min(1).default(400),
  questionDelayMs: z.natural().min(0).default(5000),
  timeoutMs: z.natural().min(100).default(10000),
})

/**
 * Apply the plugin: resolve the config, wire the pusher to the logger, and
 * feed every committed session event to the watcher. The registrations ride
 * this fiber; the returned disposer cancels the watcher's pending question
 * pushes on unload.
 * @param ctx - host cordis context (requires the session store).
 * @param config - validated plugin configuration (schema defaults applied).
 * @returns a disposer that stops the watcher.
 */
export function apply(ctx: Context, config?: Config): (() => void) | void {
  const resolved: ResolvedConfig = Config(config ?? {})
  if (!resolved.enabled) {
    ctx.logger.info('[dsh-notification-gotify] push notifications disabled by config')
    return
  }
  if (resolved.baseUrl === '' || resolved.appToken === '') {
    ctx.logger.warn('[dsh-notification-gotify] Gotify baseUrl/appToken not configured; no pushes will be sent')
    return
  }
  const pusher = new GotifyPusher({
    baseUrl: resolved.baseUrl,
    appToken: resolved.appToken,
    timeoutMs: resolved.timeoutMs,
    onError: (message, cause) => ctx.logger.warn(`[dsh-notification-gotify] ${message}`, cause),
  })
  const watcher = new SessionEventWatcher(resolved, (notification: GotifyNotification) => {
    // Fire-and-forget: the pusher's queue serializes and logs failures.
    void pusher.send(notification)
  })
  ctx.on('session/event', (session, event) => watcher.handle(session, event))
  return () => watcher.dispose()
}
