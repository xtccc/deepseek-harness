/**
 * Minimal Gotify client: POSTs one push per notification to the server's
 * `/message` endpoint, serialized on a FIFO queue so pushes from parallel
 * sessions arrive in order and a slow request never interleaves. Built on the
 * global `fetch` (Node 22), so the host bundle needs no HTTP dependency; the
 * token rides the documented `?token=` query parameter and never leaves the
 * server configuration.
 */
import type { GotifyNotification } from './contract.ts'

/**
 * Normalize a configured base URL: trim whitespace and strip trailing slashes
 * so `https://host/` and `https://host` are the same endpoint.
 * @param raw - the configured server root.
 * @returns the normalized root without a trailing slash.
 */
export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

/**
 * The authenticated `/message` endpoint for one app token. The token is the
 * query parameter the Gotify API documents for app-token auth.
 * @param baseUrl - the configured server root (normalized on the fly).
 * @param appToken - the application token.
 * @returns the full POST target URL.
 */
export function messageEndpoint(baseUrl: string, appToken: string): string {
  return `${normalizeBaseUrl(baseUrl)}/message?token=${encodeURIComponent(appToken)}`
}

/**
 * The wire body for one push — exactly the fields Gotify understands.
 * @param notification - the push to serialize.
 * @returns the JSON body.
 */
export function messageBody(notification: GotifyNotification): { title: string; message: string; priority: number } {
  return { title: notification.title, message: notification.message, priority: notification.priority }
}

/** Sink for non-fatal push failures (network errors, non-OK status). */
export type GotifyErrorSink = (message: string, cause?: unknown) => void

/** Options for the serialized pusher. */
export interface GotifyPusherOptions {
  /** Normalized-or-not Gotify server root. */
  readonly baseUrl: string
  /** The application token. */
  readonly appToken: string
  /** Abort one request after this many milliseconds. */
  readonly timeoutMs: number
  /** Fetch implementation override (tests); defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch
  /** Failure sink; defaults to a no-op (the host passes the logger). */
  readonly onError?: GotifyErrorSink
}

/**
 * Serialized Gotify sender. `send` chains onto the queue and returns the tail
 * promise, so a caller may ignore it (fire-and-forget) or await the whole
 * queue (`flush`). A failed request reports through `onError` and never
 * breaks the queue.
 */
export class GotifyPusher {
  private queue: Promise<void> = Promise.resolve()
  private readonly fetchImpl: typeof fetch
  private readonly onError: GotifyErrorSink

  constructor(private readonly options: GotifyPusherOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.onError = options.onError ?? (() => {})
  }

  /**
   * POST one push, ordered after every earlier send.
   * @param notification - the push to send.
   * @returns the queue tail; resolves when this push (and every earlier one) settled.
   */
  send(notification: GotifyNotification): Promise<void> {
    this.queue = this.queue.then(() => this.post(notification)).catch(() => {})
    return this.queue
  }

  /**
   * Wait for every queued push to settle.
   * @returns a promise resolving once the queue is idle.
   */
  flush(): Promise<void> {
    return this.queue
  }

  private async post(notification: GotifyNotification): Promise<void> {
    const url = messageEndpoint(this.options.baseUrl, this.options.appToken)
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(messageBody(notification)),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      })
    } catch (cause) {
      this.onError(`gotify request failed (${notification.kind}: ${notification.title})`, cause)
      return
    }
    if (!response.ok) {
      this.onError(`gotify rejected the push (${notification.kind}: ${notification.title}): HTTP ${response.status}`)
    }
  }
}
