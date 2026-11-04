/**
 * Session-event watcher: folds the `session/event` firehose into Gotify
 * pushes. Four kinds of session-log event are translated:
 *
 * - `completed`  — `turn/end` with reason kind `completed`.
 * - `failed`     — `turn/end` with reason kind `error`, `max-tokens`, or
 *   `blocked`: the turn stopped without producing the answer the user asked
 *   for, which is exactly the case a push is for.
 * - `interrupted` — `turn/end` with reason kind `aborted` (user/parent cancel)
 *   or `interrupted` (a crash-orphaned turn closed on reload).
 * - `question`   — `tool/call` of the `ask_user_question` tool, meaning the
 *   task is parked waiting for a human answer, and `tool/call` of the
 *   plan-mode `exit_plan_mode` tool, whose review question is asked through
 *   the user-questions channel (which the session log never records), so the
 *   tool call itself is the wait signal. Both pushes are debounced by
 *   `questionDelayMs` and cancelled when a `tool/result` for the same
 *   callId lands first (the user already answered in the UI).
 *
 * Session titles come from the log-only `session/title` event when the
 * session-title service is mounted; otherwise the first `user/message` text is
 * the fallback. Subagent sessions are skipped (their progress is noise).
 * Per-kind event-seq watermarks make the watcher idempotent per event, so a
 * duplicate delivery of the same event never double-pushes.
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { GotifyEventKind, GotifyNotification } from './contract.ts';
import type { ResolvedConfig } from './types.ts';
/** The model-facing tool whose call means "the task is waiting for the user". */
export declare const ASK_USER_TOOL = "ask_user_question";
/**
 * The plan-mode exit tool. Its review question is raised through the
 * user-questions channel, which the session log does not record, so a
 * `tool/call` of this tool is the host-observable "plan pending review"
 * signal.
 */
export declare const EXIT_PLAN_MODE_TOOL = "exit_plan_mode";
/** The log-only event the session-title plugin appends with the durable title. */
export declare const SESSION_TITLE_EVENT = "session/title";
/** The structural session face the watcher reads; the real Session satisfies it. */
export interface WatcherSession {
    readonly id: string;
    readonly header: {
        readonly origin?: string;
    };
}
/** The schedule/cancel pair a debounce needs (defaults to timers). */
export type DebounceScheduler = (callback: () => void, ms: number) => () => void;
/** Bound one text to the body budget, ellipsizing on overflow. */
export declare function boundText(text: string, maxChars: number): string;
/** Join the text blocks of a message's content (structural; works for any block list). */
export declare function textOf(blocks: readonly {
    readonly type: string;
    readonly text?: unknown;
}[]): string;
/**
 * The last non-empty text block of a message's content — the final reply
 * segment. Earlier text blocks in the same message (or earlier messages of
 * the turn) are the model's step narration, not the answer.
 */
export declare function lastTextOf(blocks: readonly {
    readonly type: string;
    readonly text?: unknown;
}[]): string;
/** One question extracted from the `ask_user_question` tool-call arguments. */
export interface ParsedQuestion {
    readonly header?: string;
    readonly question: string;
    readonly options?: readonly {
        readonly label: string;
    }[];
}
/**
 * Parse the `ask_user_question` tool-call arguments JSON. Malformed input
 * yields no questions (the tool schema enforces the shape at call time; this
 * stays defensive for older logs and odd providers).
 * @param raw - the raw `arguments` JSON string from the `tool/call` event.
 * @returns the questions that parsed cleanly.
 */
export declare function parseQuestionArguments(raw: string): ParsedQuestion[];
/**
 * Render parsed questions as a push body: each question on its own line with
 * its header prefixed and its options as a bulleted list, bounded to the body
 * budget.
 * @param questions - the parsed questions.
 * @param maxChars - the body budget.
 * @returns the rendered text.
 */
export declare function formatQuestions(questions: readonly ParsedQuestion[], maxChars: number): string;
/** One plan-review request extracted from the `exit_plan_mode` tool-call arguments. */
export interface ParsedPlanReview {
    /** The markdown plan awaiting review. */
    readonly plan: string;
}
/**
 * Parse the `exit_plan_mode` tool-call arguments JSON. Malformed input yields
 * null (the tool schema enforces the shape at call time; this stays defensive
 * for older logs and odd providers).
 * @param raw - the raw `arguments` JSON string from the `tool/call` event.
 * @returns the reviewed plan, or null when the arguments do not parse.
 */
export declare function parsePlanReviewArguments(raw: string): ParsedPlanReview | null;
/** Render the reviewed plan as a push body, bounded to the body budget. */
export declare function formatPlanReview(plan: string, maxChars: number): string;
/** Push titles for the four kinds (kept as constants so a fork can restyle). */
export declare const TITLES: Record<GotifyEventKind, string>;
/**
 * Push titles for the turn-end reasons that end a turn without completing it.
 * The detail differs per reason, so the title carries it.
 */
export declare const FAILED_TITLES: {
    readonly error: "DSH · Task failed";
    readonly 'max-tokens': "DSH · Output truncated";
    readonly blocked: "DSH · Task blocked";
};
/** The turn-end reason kinds that count as a failed turn. */
export type FailedTurnKind = keyof typeof FAILED_TITLES;
/** Push title for plan-mode reviews (still a `question`-kind push). */
export declare const PLAN_REVIEW_TITLE = "DSH \u00B7 Plan review";
/** The fallback session label when no title has been derived yet. */
export declare const DEFAULT_SESSION_LABEL = "DSH session";
/**
 * The session-log → Gotify watcher. Owns per-session fold state and the
 * question debounce timers; all side effects flow through the injected `send`
 * and `schedule` (tests replace them). Call `dispose` to cancel pending
 * question pushes (e.g. on plugin unload).
 */
export declare class SessionEventWatcher {
    private readonly config;
    private readonly send;
    private readonly schedule;
    private readonly sessions;
    constructor(config: ResolvedConfig, send: (notification: GotifyNotification) => void, schedule?: DebounceScheduler);
    /**
     * Fold one committed session event; may emit a push.
     * @param session - the session that produced the event.
     * @param event - the committed event, exactly as recorded.
     */
    handle(session: WatcherSession, event: SessionEvent): void;
    /**
     * Cancel every pending question push and forget all per-session state.
     * Safe to call more than once.
     */
    dispose(): void;
    private stateFor;
    private labelOf;
    /**
     * Push one failed turn, at most once per event seq.
     * @param state - the session's fold state.
     * @param seq - the `turn/end` event seq, the idempotence watermark.
     * @param kind - which failure ended the turn (selects the title).
     * @param detail - the one-line reason, bounded to the body budget.
     */
    private pushFailed;
}
