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
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { GotifyEventKind, GotifyNotification } from './contract.ts'
import type { ResolvedConfig } from './types.ts'

/** The model-facing tool whose call means "the task is waiting for the user". */
export const ASK_USER_TOOL = 'ask_user_question'

/**
 * The plan-mode exit tool. Its review question is raised through the
 * user-questions channel, which the session log does not record, so a
 * `tool/call` of this tool is the host-observable "plan pending review"
 * signal.
 */
export const EXIT_PLAN_MODE_TOOL = 'exit_plan_mode'

/** The log-only event the session-title plugin appends with the durable title. */
export const SESSION_TITLE_EVENT = 'session/title'

/** The structural session face the watcher reads; the real Session satisfies it. */
export interface WatcherSession {
  readonly id: string
  readonly header: { readonly origin?: string }
}

/** The schedule/cancel pair a debounce needs (defaults to timers). */
export type DebounceScheduler = (callback: () => void, ms: number) => () => void

function timerScheduler(callback: () => void, ms: number): () => void {
  const timer = setTimeout(callback, ms)
  return () => clearTimeout(timer)
}

/** Bound one text to the body budget, ellipsizing on overflow. */
export function boundText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars - 1) + '…'
}

/** Join the text blocks of a message's content (structural; works for any block list). */
export function textOf(blocks: readonly { readonly type: string; readonly text?: unknown }[]): string {
  return blocks
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text as string)
    .join('')
}

/**
 * The last non-empty text block of a message's content — the final reply
 * segment. Earlier text blocks in the same message (or earlier messages of
 * the turn) are the model's step narration, not the answer.
 */
export function lastTextOf(blocks: readonly { readonly type: string; readonly text?: unknown }[]): string {
  let text = ''
  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text !== '') text = block.text
  }
  return text
}

/** One question extracted from the `ask_user_question` tool-call arguments. */
export interface ParsedQuestion {
  readonly header?: string
  readonly question: string
  readonly options?: readonly { readonly label: string }[]
}

/**
 * Parse the `ask_user_question` tool-call arguments JSON. Malformed input
 * yields no questions (the tool schema enforces the shape at call time; this
 * stays defensive for older logs and odd providers).
 * @param raw - the raw `arguments` JSON string from the `tool/call` event.
 * @returns the questions that parsed cleanly.
 */
export function parseQuestionArguments(raw: string): ParsedQuestion[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []
  const questions = (parsed as { questions?: unknown }).questions
  if (!Array.isArray(questions)) return []
  const out: ParsedQuestion[] = []
  for (const entry of questions) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as { question?: unknown; header?: unknown; options?: unknown }
    if (typeof record.question !== 'string') continue
    const parsedQuestion: { question: string; header?: string; options?: readonly { readonly label: string }[] } = {
      question: record.question,
    }
    if (typeof record.header === 'string' && record.header !== '') parsedQuestion.header = record.header
    if (Array.isArray(record.options)) {
      const labels = record.options
        .filter((option): option is { label: unknown } => typeof option === 'object' && option !== null && typeof (option as { label?: unknown }).label === 'string')
        .map(option => ({ label: (option as { label: string }).label }))
      if (labels.length > 0) parsedQuestion.options = labels
    }
    out.push(parsedQuestion)
  }
  return out
}

/**
 * Render parsed questions as a push body: each question on its own line with
 * its header prefixed and its options as a bulleted list, bounded to the body
 * budget.
 * @param questions - the parsed questions.
 * @param maxChars - the body budget.
 * @returns the rendered text.
 */
export function formatQuestions(questions: readonly ParsedQuestion[], maxChars: number): string {
  const lines: string[] = []
  for (const question of questions) {
    const label = question.header !== undefined ? `${question.header}: ${question.question}` : question.question
    lines.push(label)
    for (const option of question.options ?? []) lines.push(`- ${option.label}`)
    lines.push('')
  }
  return boundText(lines.join('\n').trim(), maxChars)
}

/** One plan-review request extracted from the `exit_plan_mode` tool-call arguments. */
export interface ParsedPlanReview {
  /** The markdown plan awaiting review. */
  readonly plan: string
}

/**
 * Parse the `exit_plan_mode` tool-call arguments JSON. Malformed input yields
 * null (the tool schema enforces the shape at call time; this stays defensive
 * for older logs and odd providers).
 * @param raw - the raw `arguments` JSON string from the `tool/call` event.
 * @returns the reviewed plan, or null when the arguments do not parse.
 */
export function parsePlanReviewArguments(raw: string): ParsedPlanReview | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const plan = (parsed as { plan?: unknown }).plan
  if (typeof plan !== 'string' || plan === '') return null
  return { plan }
}

/** Render the reviewed plan as a push body, bounded to the body budget. */
export function formatPlanReview(plan: string, maxChars: number): string {
  return boundText(plan.trim(), maxChars)
}

/** Push titles for the four kinds (kept as constants so a fork can restyle). */
export const TITLES: Record<GotifyEventKind, string> = {
  completed: 'DSH · Task completed',
  failed: 'DSH · Task failed',
  interrupted: 'DSH · Task interrupted',
  question: 'DSH · Question for you',
}

/**
 * Push titles for the turn-end reasons that end a turn without completing it.
 * The detail differs per reason, so the title carries it.
 */
export const FAILED_TITLES = {
  error: 'DSH · Task failed',
  'max-tokens': 'DSH · Output truncated',
  blocked: 'DSH · Task blocked',
} as const

/** The turn-end reason kinds that count as a failed turn. */
export type FailedTurnKind = keyof typeof FAILED_TITLES

/** Push title for plan-mode reviews (still a `question`-kind push). */
export const PLAN_REVIEW_TITLE = 'DSH · Plan review'

/** The fallback session label when no title has been derived yet. */
export const DEFAULT_SESSION_LABEL = 'DSH session'

interface PendingQuestion {
  /** Cancels the scheduled push (fires when the user answers first). */
  readonly cancel: () => void
}

interface SessionState {
  /** Durable title from `session/title`; wins over the fallback. */
  title: string | null
  /** First user-message text, the title fallback. */
  fallbackTitle: string | null
  /** The turn currently accumulating reply text (null outside a turn). */
  currentTurn: number | null
  /** The turn's final assistant reply text (last text segment), bounded to the body budget. */
  turnText: string
  /** In-flight debounced question pushes by tool callId. */
  pendingQuestions: Map<string, PendingQuestion>
  /** Last event seq already turned into a push, per kind (idempotence). */
  notifiedSeq: Partial<Record<GotifyEventKind, number>>
}

/**
 * The session-log → Gotify watcher. Owns per-session fold state and the
 * question debounce timers; all side effects flow through the injected `send`
 * and `schedule` (tests replace them). Call `dispose` to cancel pending
 * question pushes (e.g. on plugin unload).
 */
export class SessionEventWatcher {
  private readonly sessions = new Map<string, SessionState>()

  constructor(
    private readonly config: ResolvedConfig,
    private readonly send: (notification: GotifyNotification) => void,
    private readonly schedule: DebounceScheduler = timerScheduler,
  ) {}

  /**
   * Fold one committed session event; may emit a push.
   * @param session - the session that produced the event.
   * @param event - the committed event, exactly as recorded.
   */
  handle(session: WatcherSession, event: SessionEvent): void {
    if (session.header.origin === 'subagent') return
    const state = this.stateFor(session.id)
    switch (event.type) {
      case 'turn/start':
        state.currentTurn = event.data.turn
        state.turnText = ''
        return
      case 'assistant/message': {
        if (state.currentTurn !== event.data.turn) return
        // Keep only the latest reply: earlier assistant messages in the turn
        // are step narration (thinking aloud), not the answer. An empty text
        // (tool-call-only message) leaves the previous reply in place.
        const text = lastTextOf(event.data.message.content)
        if (text === '') return
        state.turnText = boundText(text, this.config.maxBodyChars)
        return
      }
      case 'user/message': {
        if (state.fallbackTitle === null) {
          const text = textOf(event.data.content)
          if (text !== '') state.fallbackTitle = boundText(text, this.config.maxBodyChars)
        }
        return
      }
      case 'tool/call': {
        const isQuestion = event.data.name === ASK_USER_TOOL
        const isPlanReview = event.data.name === EXIT_PLAN_MODE_TOOL
        if (!isQuestion && !isPlanReview) return
        if (!this.config.notifyQuestion) return
        if (state.pendingQuestions.has(event.data.callId)) return
        if ((state.notifiedSeq.question ?? -1) >= event.seq) return
        state.notifiedSeq.question = event.seq
        let title = TITLES.question
        let body: string
        if (isQuestion) {
          const questions = parseQuestionArguments(event.data.arguments)
          if (questions.length === 0) return
          body = formatQuestions(questions, this.config.maxBodyChars)
        } else {
          const review = parsePlanReviewArguments(event.data.arguments)
          if (review === null) return
          title = PLAN_REVIEW_TITLE
          body = formatPlanReview(review.plan, this.config.maxBodyChars)
        }
        const label = this.labelOf(state)
        const cancel = this.schedule(() => {
          state.pendingQuestions.delete(event.data.callId)
          this.send({
            kind: 'question',
            title,
            message: [label, body].filter(Boolean).join('\n'),
            priority: this.config.questionPriority,
          })
        }, this.config.questionDelayMs)
        state.pendingQuestions.set(event.data.callId, { cancel })
        return
      }
      case 'tool/result': {
        // The answered call rides the tool-role message itself; its content
        // blocks carry the tool output, not the call identity.
        const callId = event.data.message.toolCallId
        const pending = state.pendingQuestions.get(callId)
        if (pending === undefined) return
        pending.cancel()
        state.pendingQuestions.delete(callId)
        return
      }
      case 'turn/end': {
        const reason = event.data.reason
        switch (reason.kind) {
          case 'completed': {
            if (!this.config.notifyCompleted) return
            if ((state.notifiedSeq.completed ?? -1) >= event.seq) return
            state.notifiedSeq.completed = event.seq
            this.send({
              kind: 'completed',
              title: TITLES.completed,
              message: [this.labelOf(state), `Turn ${event.data.turn} completed.`, state.turnText].filter(Boolean).join('\n'),
              priority: this.config.completedPriority,
            })
            return
          }
          case 'error': {
            this.pushFailed(state, event.seq, 'error', `Turn ${event.data.turn} failed: ${reason.error.message}`)
            return
          }
          case 'max-tokens': {
            this.pushFailed(state, event.seq, 'max-tokens', `Turn ${event.data.turn} hit the output-token limit.`)
            return
          }
          case 'blocked': {
            this.pushFailed(state, event.seq, 'blocked', `Turn ${event.data.turn} was blocked before it could run.`)
            return
          }
          case 'aborted':
          case 'interrupted': {
            if (!this.config.notifyInterrupted) return
            if ((state.notifiedSeq.interrupted ?? -1) >= event.seq) return
            state.notifiedSeq.interrupted = event.seq
            this.send({
              kind: 'interrupted',
              title: TITLES.interrupted,
              message: [this.labelOf(state), `Turn ${event.data.turn} was interrupted.`].filter(Boolean).join('\n'),
              priority: this.config.interruptedPriority,
            })
            return
          }
          case 'forked': {
            // Fork-seed construction closes a turn that was still open at the
            // cut; the source events survive in the child, so nothing failed.
            return
          }
          default: {
            // `TurnEndReason` is merge-extensible: a reason merged in by
            // another plugin stays unnotified until this watcher learns it.
            return
          }
        }
      }
      default: {
        // `session/title` is merged into the event map by the session-title
        // plugin, which the core does not know — read it defensively so this
        // plugin works with or without the title service mounted.
        const unknown = event as unknown as { type: string; data?: { title?: unknown } }
        if (unknown.type === SESSION_TITLE_EVENT && typeof unknown.data?.title === 'string') {
          state.title = unknown.data.title
        }
      }
    }
  }

  /**
   * Cancel every pending question push and forget all per-session state.
   * Safe to call more than once.
   */
  dispose(): void {
    for (const state of this.sessions.values()) {
      for (const pending of state.pendingQuestions.values()) pending.cancel()
    }
    this.sessions.clear()
  }

  private stateFor(id: string): SessionState {
    let state = this.sessions.get(id)
    if (state === undefined) {
      state = {
        title: null,
        fallbackTitle: null,
        currentTurn: null,
        turnText: '',
        pendingQuestions: new Map(),
        notifiedSeq: {},
      }
      this.sessions.set(id, state)
    }
    return state
  }

  private labelOf(state: SessionState): string {
    return state.title ?? state.fallbackTitle ?? DEFAULT_SESSION_LABEL
  }

  /**
   * Push one failed turn, at most once per event seq.
   * @param state - the session's fold state.
   * @param seq - the `turn/end` event seq, the idempotence watermark.
   * @param kind - which failure ended the turn (selects the title).
   * @param detail - the one-line reason, bounded to the body budget.
   */
  private pushFailed(state: SessionState, seq: number, kind: FailedTurnKind, detail: string): void {
    if (!this.config.notifyFailed) return
    if ((state.notifiedSeq.failed ?? -1) >= seq) return
    state.notifiedSeq.failed = seq
    this.send({
      kind: 'failed',
      title: FAILED_TITLES[kind],
      message: [this.labelOf(state), boundText(detail, this.config.maxBodyChars), state.turnText].filter(Boolean).join('\n'),
      priority: this.config.failedPriority,
    })
  }
}
