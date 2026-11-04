/**
 * dsh-notification-gotify host types: the resolved plugin configuration (schema
 * defaults applied). Everything the watcher and the pusher need lives here, so
 * `cordis.yml` is the single configuration surface.
 */
/** Resolved plugin configuration (schema defaults applied). */
export interface ResolvedConfig {
    /** Gotify server root, e.g. `https://gotify.example.com`. */
    readonly baseUrl: string;
    /** The application token Gotify issues per app; kept in server config only. */
    readonly appToken: string;
    /** Master switch; false stops every push while keeping the other settings. */
    readonly enabled: boolean;
    /** Push when a turn ends with reason `completed`. */
    readonly notifyCompleted: boolean;
    /** Push when a turn ends `aborted` (user/parent cancel) or `interrupted` (crash orphan). */
    readonly notifyInterrupted: boolean;
    /** Push when a turn ends `error`, `max-tokens`, or `blocked` instead of completing. */
    readonly notifyFailed: boolean;
    /** Push when the model calls `ask_user_question` (the task waits on you). */
    readonly notifyQuestion: boolean;
    /** Gotify priority for completed pushes. */
    readonly completedPriority: number;
    /** Gotify priority for interrupted pushes. */
    readonly interruptedPriority: number;
    /** Gotify priority for failed-turn pushes. */
    readonly failedPriority: number;
    /** Gotify priority for question pushes. */
    readonly questionPriority: number;
    /** Character budget for reply/question text in a push body. */
    readonly maxBodyChars: number;
    /** How long a question push waits before firing; answered questions are cancelled. */
    readonly questionDelayMs: number;
    /** HTTP timeout for one Gotify request. */
    readonly timeoutMs: number;
}
