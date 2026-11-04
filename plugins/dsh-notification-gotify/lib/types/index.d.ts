/**
 * dsh-notification-gotify host plugin: pushes Gotify notifications when a session's
 * task completes, is interrupted, or asks the user a question. The watcher
 * subscribes to the `session/event` firehose (the same seam the
 * session-projection registry drives); the sender is a serialized HTTP client
 * over the global fetch. No harness change and no browser half — pushes work
 * even when no client is connected.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin name (the Loader entry). */
export declare const name = "dsh-notification-gotify";
/** Services required before load: the session store (its event firehose). */
export declare const inject: string[];
/** Host plugin configuration, validated at load by the Loader. */
export interface Config {
    /** Gotify server root, e.g. `https://gotify.example.com`. */
    baseUrl: string;
    /** The application token Gotify issues per app. */
    appToken: string;
    /** Master switch; false stops every push while keeping the other settings. */
    enabled: boolean;
    /** Push when a turn ends with reason `completed`. */
    notifyCompleted: boolean;
    /** Push when a turn ends `aborted` or `interrupted`. */
    notifyInterrupted: boolean;
    /** Push when a turn ends `error`, `max-tokens`, or `blocked`. */
    notifyFailed: boolean;
    /** Push when the model calls `ask_user_question`. */
    notifyQuestion: boolean;
    /** Gotify priority for completed pushes. */
    completedPriority: number;
    /** Gotify priority for interrupted pushes. */
    interruptedPriority: number;
    /** Gotify priority for failed-turn pushes. */
    failedPriority: number;
    /** Gotify priority for question pushes. */
    questionPriority: number;
    /** Character budget for reply/question text in a push body. */
    maxBodyChars: number;
    /** Debounce for question pushes; answered questions are cancelled. */
    questionDelayMs: number;
    /** HTTP timeout for one Gotify request. */
    timeoutMs: number;
}
/**
 * Configuration schema, validated at load by the Loader. `baseUrl`/`appToken`
 * default to empty so a profile can mount the plugin before configuring
 * Gotify; the plugin then logs a warning and stays inert instead of failing
 * the composition.
 */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    baseUrl: z<string, string, "defined">;
    appToken: z<string, string, "defined">;
    enabled: z<boolean, boolean, "defined">;
    notifyCompleted: z<boolean, boolean, "defined">;
    notifyInterrupted: z<boolean, boolean, "defined">;
    notifyFailed: z<boolean, boolean, "defined">;
    notifyQuestion: z<boolean, boolean, "defined">;
    completedPriority: z<number, number, "defined">;
    interruptedPriority: z<number, number, "defined">;
    failedPriority: z<number, number, "defined">;
    questionPriority: z<number, number, "defined">;
    maxBodyChars: z<number, number, "defined">;
    questionDelayMs: z<number, number, "defined">;
    timeoutMs: z<number, number, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    baseUrl: z<string, string, "defined">;
    appToken: z<string, string, "defined">;
    enabled: z<boolean, boolean, "defined">;
    notifyCompleted: z<boolean, boolean, "defined">;
    notifyInterrupted: z<boolean, boolean, "defined">;
    notifyFailed: z<boolean, boolean, "defined">;
    notifyQuestion: z<boolean, boolean, "defined">;
    completedPriority: z<number, number, "defined">;
    interruptedPriority: z<number, number, "defined">;
    failedPriority: z<number, number, "defined">;
    questionPriority: z<number, number, "defined">;
    maxBodyChars: z<number, number, "defined">;
    questionDelayMs: z<number, number, "defined">;
    timeoutMs: z<number, number, "defined">;
}>>, "plain">;
/**
 * Apply the plugin: resolve the config, wire the pusher to the logger, and
 * feed every committed session event to the watcher. The registrations ride
 * this fiber; the returned disposer cancels the watcher's pending question
 * pushes on unload.
 * @param ctx - host cordis context (requires the session store).
 * @param config - validated plugin configuration (schema defaults applied).
 * @returns a disposer that stops the watcher.
 */
export declare function apply(ctx: Context, config?: Config): (() => void) | void;
