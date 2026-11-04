/**
 * Minimal Gotify client: POSTs one push per notification to the server's
 * `/message` endpoint, serialized on a FIFO queue so pushes from parallel
 * sessions arrive in order and a slow request never interleaves. Built on the
 * global `fetch` (Node 22), so the host bundle needs no HTTP dependency; the
 * token rides the documented `?token=` query parameter and never leaves the
 * server configuration.
 */
import type { GotifyNotification } from './contract.ts';
/**
 * Normalize a configured base URL: trim whitespace and strip trailing slashes
 * so `https://host/` and `https://host` are the same endpoint.
 * @param raw - the configured server root.
 * @returns the normalized root without a trailing slash.
 */
export declare function normalizeBaseUrl(raw: string): string;
/**
 * The authenticated `/message` endpoint for one app token. The token is the
 * query parameter the Gotify API documents for app-token auth.
 * @param baseUrl - the configured server root (normalized on the fly).
 * @param appToken - the application token.
 * @returns the full POST target URL.
 */
export declare function messageEndpoint(baseUrl: string, appToken: string): string;
/**
 * The wire body for one push — exactly the fields Gotify understands.
 * @param notification - the push to serialize.
 * @returns the JSON body.
 */
export declare function messageBody(notification: GotifyNotification): {
    title: string;
    message: string;
    priority: number;
};
/** Sink for non-fatal push failures (network errors, non-OK status). */
export type GotifyErrorSink = (message: string, cause?: unknown) => void;
/** Options for the serialized pusher. */
export interface GotifyPusherOptions {
    /** Normalized-or-not Gotify server root. */
    readonly baseUrl: string;
    /** The application token. */
    readonly appToken: string;
    /** Abort one request after this many milliseconds. */
    readonly timeoutMs: number;
    /** Fetch implementation override (tests); defaults to the global fetch. */
    readonly fetchImpl?: typeof fetch;
    /** Failure sink; defaults to a no-op (the host passes the logger). */
    readonly onError?: GotifyErrorSink;
}
/**
 * Serialized Gotify sender. `send` chains onto the queue and returns the tail
 * promise, so a caller may ignore it (fire-and-forget) or await the whole
 * queue (`flush`). A failed request reports through `onError` and never
 * breaks the queue.
 */
export declare class GotifyPusher {
    private readonly options;
    private queue;
    private readonly fetchImpl;
    private readonly onError;
    constructor(options: GotifyPusherOptions);
    /**
     * POST one push, ordered after every earlier send.
     * @param notification - the push to send.
     * @returns the queue tail; resolves when this push (and every earlier one) settled.
     */
    send(notification: GotifyNotification): Promise<void>;
    /**
     * Wait for every queued push to settle.
     * @returns a promise resolving once the queue is idle.
     */
    flush(): Promise<void>;
    private post;
}
