/**
 * dsh-notification-gotify shared types: the Gotify push payload and the session-log
 * event kinds the host watcher translates into pushes. The plugin is host-only
 * — the browser half was removed when delivery moved from the Notification API
 * to Gotify — so these types describe the host's wire face only.
 */
/** The session-log events the watcher turns into a Gotify push. */
export type GotifyEventKind = 'completed' | 'failed' | 'interrupted' | 'question';
/** One Gotify push ready to be POSTed to the server's /message endpoint. */
export interface GotifyNotification {
    /** Which session-log event produced this push. */
    readonly kind: GotifyEventKind;
    /** Short push title (shown big in Gotify clients). */
    readonly title: string;
    /** Push body: session title, turn facts, and the reply/question text. */
    readonly message: string;
    /** Gotify priority (0–10; higher is more urgent). */
    readonly priority: number;
}
