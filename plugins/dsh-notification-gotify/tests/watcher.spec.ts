/**
 * The session-log watcher: which events become which pushes, the question
 * debounce and its cancellation, title derivation, and per-kind idempotence.
 * Synthetic events avoid the session-store machinery the composition spec
 * covers.
 */
import { createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionEventMap, SessionEventType } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GotifyNotification } from '../src/contract.ts'
import type { ResolvedConfig } from '../src/types.ts'
import {
  ASK_USER_TOOL,
  DEFAULT_SESSION_LABEL,
  EXIT_PLAN_MODE_TOOL,
  FAILED_TITLES,
  PLAN_REVIEW_TITLE,
  SESSION_TITLE_EVENT,
  SessionEventWatcher,
  TITLES,
  boundText,
  formatPlanReview,
  formatQuestions,
  lastTextOf,
  parsePlanReviewArguments,
  parseQuestionArguments,
} from '../src/watcher.ts'

function evt<K extends SessionEventType>(type: K, data: SessionEventMap[K], seq = 1): SessionEvent<K> {
  return { type, seq, time: 0, data } as SessionEvent<K>
}

function assistant(turn: number, text: string, seq = 2): SessionEvent<'assistant/message'> {
  return evt('assistant/message', {
    turn,
    step: 1,
    message: createAssistantMessage({ content: [{ type: 'text', text }], source: { provider: 'test', model: 'test' } }),
  }, seq)
}

function userText(text: string, seq = 2): SessionEvent<'user/message'> {
  return evt('user/message', {
    content: [{ type: 'text', text }],
    role: 'user',
    source: { kind: 'human' },
  } as never, seq)
}

function questionCall(turn: number, callId: string, args: string, seq = 3): SessionEvent<'tool/call'> {
  return evt('tool/call', { turn, step: 1, callId: callId as never, name: ASK_USER_TOOL, arguments: args }, seq)
}

function toolResult(callId: string, seq = 4): SessionEvent<'tool/result'> {
  return evt('tool/result', {
    turn: 1,
    step: 1,
    message: createToolResultMessage({
      callId: callId as never,
      content: [{ type: 'text', text: '{"answers":[]}' }],
      isError: false,
    }),
  }, seq)
}

function planCall(turn: number, callId: string, plan: string, seq = 3): SessionEvent<'tool/call'> {
  return evt('tool/call', {
    turn,
    step: 1,
    callId: callId as never,
    name: EXIT_PLAN_MODE_TOOL,
    arguments: JSON.stringify({ plan }),
  }, seq)
}



function config(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    baseUrl: 'https://g.test',
    appToken: 'tok',
    enabled: true,
    notifyCompleted: true,
    notifyInterrupted: true,
    notifyQuestion: true,
    completedPriority: 5,
    interruptedPriority: 8,
    notifyFailed: true,
    failedPriority: 8,
    questionPriority: 9,
    maxBodyChars: 400,
    questionDelayMs: 5000,
    timeoutMs: 10000,
    ...overrides,
  }
}

function session(overrides: { origin?: string; id?: string } = {}) {
  return { id: overrides.id ?? 's1', header: { ...(overrides.origin !== undefined ? { origin: overrides.origin } : {}) } }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('boundText', () => {
  it('returns short text unchanged', () => {
    expect(boundText('done', 10)).toBe('done')
  })

  it('ellipsizes text over the budget', () => {
    expect(boundText('1234567890', 5)).toBe('1234…')
  })
})

describe('parseQuestionArguments', () => {
  it('parses questions with headers and options', () => {
    expect(parseQuestionArguments(JSON.stringify({
      questions: [
        { id: 'a', question: '继续?', options: [{ label: '是' }, { label: '否' }] },
        { id: 'b', question: '选一个', header: '模式' },
      ],
    }))).toEqual([
      { question: '继续?', options: [{ label: '是' }, { label: '否' }] },
      { header: '模式', question: '选一个' },
    ])
  })

  it('returns [] for malformed input', () => {
    expect(parseQuestionArguments('not json')).toEqual([])
    expect(parseQuestionArguments('{"questions": 3}')).toEqual([])
    expect(parseQuestionArguments('{"questions": [{"id": "a"}]}')).toEqual([])
  })
})

describe('formatQuestions', () => {
  it('renders header, question, and options as lines', () => {
    expect(formatQuestions([{ header: '确认', question: '继续?', options: [{ label: '是' }] }], 400))
      .toBe('确认: 继续?\n- 是')
  })

  it('bounds to the budget', () => {
    expect(formatQuestions([{ question: '1234567890' }], 5)).toBe('1234…')
  })
})

describe('parsePlanReviewArguments', () => {
  it('parses the plan out of the exit_plan_mode arguments', () => {
    const plan = '# 部署后端\n\n1. 写代码\n2. 跑测试'
    expect(parsePlanReviewArguments(JSON.stringify({ plan }))).toEqual({ plan })
  })

  it('returns null for malformed input', () => {
    expect(parsePlanReviewArguments('not json')).toBeNull()
    expect(parsePlanReviewArguments('{}')).toBeNull()
    expect(parsePlanReviewArguments('{"plan": 3}')).toBeNull()
    expect(parsePlanReviewArguments('{"plan": ""}')).toBeNull()
  })
})

describe('formatPlanReview', () => {
  it('bounds the plan to the budget', () => {
    expect(formatPlanReview('# 1234567890', 5)).toBe('# 12…')
  })
})

describe('lastTextOf', () => {
  it('returns the last non-empty text block', () => {
    expect(lastTextOf([{ type: 'text', text: 'a' }, { type: 'reasoning', text: 'r' }, { type: 'text', text: 'b' }])).toBe('b')
  })

  it('skips empty text blocks', () => {
    expect(lastTextOf([{ type: 'text', text: 'a' }, { type: 'text', text: '' }, { type: 'text', text: 'b' }])).toBe('b')
    expect(lastTextOf([{ type: 'text', text: 'a' }, { type: 'text', text: '' }])).toBe('a')
  })

  it('returns empty when there is no text block', () => {
    expect(lastTextOf([{ type: 'reasoning', text: 'r' }, { type: 'tool-call', id: 'c1', name: 'x', arguments: '{}' }])).toBe('')
  })
})

describe('SessionEventWatcher · completed', () => {
  it('pushes a completed turn with title, turn number, and the reply text', () => {
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    watcher.handle(session(), evt('turn/start', { turn: 1 }))
    watcher.handle(session(), assistant(1, 'deploy done'))
    watcher.handle(session(), evt('turn/end', { turn: 1, reason: { kind: 'completed' } }, 4))
    expect(sent).toEqual([{
      kind: 'completed',
      title: TITLES.completed,
      message: `${DEFAULT_SESSION_LABEL}\nTurn 1 completed.\ndeploy done`,
      priority: 5,
    }])
  })

  it('does not push when notifyCompleted is off', () => {
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config({ notifyCompleted: false }), n => sent.push(n))
    watcher.handle(session(), evt('turn/end', { turn: 1, reason: { kind: 'completed' } }))
    expect(sent).toEqual([])
  })

  it('is idempotent per event seq', () => {
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    const event = evt('turn/end', { turn: 1, reason: { kind: 'completed' } })
    watcher.handle(session(), event)
    watcher.handle(session(), event)
    expect(sent).toHaveLength(1)
  })

  it('pushes a turn that ended in error, max-tokens, or blocked', () => {
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    watcher.handle(session(), evt('turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'provider 500', code: 'UNKNOWN' } } }, 10))
    watcher.handle(session(), evt('turn/end', { turn: 2, reason: { kind: 'max-tokens' } }, 11))
    watcher.handle(session(), evt('turn/end', { turn: 3, reason: { kind: 'blocked' } }, 12))
    expect(sent.map(n => n.title)).toEqual([FAILED_TITLES.error, FAILED_TITLES['max-tokens'], FAILED_TITLES.blocked])
    expect(sent[0]?.message).toContain('provider 500')
    expect(sent.map(n => n.kind)).toEqual(['failed', 'failed', 'failed'])
    expect(sent.map(n => n.priority)).toEqual([8, 8, 8])
  })

  it('does not push a failed turn when notifyFailed is off', () => {
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config({ notifyFailed: false }), n => sent.push(n))
    watcher.handle(session(), evt('turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'boom', code: 'UNKNOWN' } } }))
    expect(sent).toEqual([])
  })

  it('stays silent for a fork-seed turn close', () => {
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    watcher.handle(session(), evt('turn/end', { turn: 1, reason: { kind: 'forked' } }))
    expect(sent).toEqual([])
  })

  it('pushes a failed turn at most once per event seq', () => {
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    const event = evt('turn/end', { turn: 1, reason: { kind: 'max-tokens' } })
    watcher.handle(session(), event)
    watcher.handle(session(), event)
    expect(sent).toHaveLength(1)
  })

  it('bounds the reply text to the body budget', () => {
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config({ maxBodyChars: 5 }), n => sent.push(n))
    watcher.handle(session(), evt('turn/start', { turn: 1 }))
    watcher.handle(session(), assistant(1, '1234567890'))
    watcher.handle(session(), evt('turn/end', { turn: 1, reason: { kind: 'completed' } }))
    expect(sent[0]?.message).toContain('1234…')
  })
})

describe('SessionEventWatcher · completed · final reply segment', () => {
  it('uses only the last assistant message text of the turn', () => {
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    watcher.handle(session(), evt('turn/start', { turn: 1 }))
    watcher.handle(session(), assistant(1, '我先看一下结构…'))
    watcher.handle(session(), assistant(1, '正在分析原因…'))
    watcher.handle(session(), assistant(1, '搞定，问题已修复。'))
    watcher.handle(session(), evt('turn/end', { turn: 1, reason: { kind: 'completed' } }, 4))
    expect(sent).toHaveLength(1)
    expect(sent[0]?.message).toContain('搞定，问题已修复。')
    expect(sent[0]?.message).not.toContain('我先看一下')
    expect(sent[0]?.message).not.toContain('正在分析')
  })

  it('keeps the previous text when the last message has none', () => {
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    watcher.handle(session(), evt('turn/start', { turn: 1 }))
    watcher.handle(session(), assistant(1, '答案是 42'))
    // A tool-call-only message carries no visible text.
    watcher.handle(session(), evt('assistant/message', {
      turn: 1,
      step: 2,
      message: createAssistantMessage({ content: [{ type: 'tool-call', id: 'c1' as never, name: 'x', arguments: '{}' }], source: { provider: 'test', model: 'test' } }),
    }))
    watcher.handle(session(), evt('turn/end', { turn: 1, reason: { kind: 'completed' } }, 4))
    expect(sent[0]?.message).toContain('答案是 42')
  })

  it('takes the last text block of a multi-block message', () => {
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    watcher.handle(session(), evt('turn/start', { turn: 1 }))
    watcher.handle(session(), evt('assistant/message', {
      turn: 1,
      step: 1,
      message: createAssistantMessage({ content: [{ type: 'text', text: '思考摘要…' }, { type: 'text', text: '最终答案' }], source: { provider: 'test', model: 'test' } }),
    }))
    watcher.handle(session(), evt('turn/end', { turn: 1, reason: { kind: 'completed' } }, 4))
    expect(sent[0]?.message).toContain('最终答案')
    expect(sent[0]?.message).not.toContain('思考摘要')
  })
})

describe('SessionEventWatcher · interrupted', () => {
  it('pushes an aborted turn as interrupted', () => {
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    watcher.handle(session(), evt('turn/start', { turn: 2 }))
    watcher.handle(session(), evt('turn/end', { turn: 2, reason: { kind: 'aborted', reason: { kind: 'user' } } }))
    expect(sent).toEqual([{
      kind: 'interrupted',
      title: TITLES.interrupted,
      message: `${DEFAULT_SESSION_LABEL}\nTurn 2 was interrupted.`,
      priority: 8,
    }])
  })

  it('pushes a crash-orphaned turn close (reason interrupted)', () => {
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    watcher.handle(session(), evt('turn/end', { turn: 3, reason: { kind: 'interrupted' } }))
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ kind: 'interrupted', priority: 8 })
  })

  it('does not push when notifyInterrupted is off', () => {
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config({ notifyInterrupted: false }), n => sent.push(n))
    watcher.handle(session(), evt('turn/end', { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } }))
    expect(sent).toEqual([])
  })
})

describe('SessionEventWatcher · question', () => {
  const args = JSON.stringify({ questions: [{ id: 'a', question: '继续?', options: [{ label: '是' }] }] })

  it('pushes the question after the debounce delay', () => {
    vi.useFakeTimers()
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    watcher.handle(session(), questionCall(1, 'c1', args))
    expect(sent).toEqual([])
    vi.advanceTimersByTime(4999)
    expect(sent).toEqual([])
    vi.advanceTimersByTime(1)
    expect(sent).toEqual([{
      kind: 'question',
      title: TITLES.question,
      message: `${DEFAULT_SESSION_LABEL}\n继续?\n- 是`,
      priority: 9,
    }])
  })

  it('cancels the push when the user answers before the delay', () => {
    vi.useFakeTimers()
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    watcher.handle(session(), questionCall(1, 'c1', args))
    watcher.handle(session(), toolResult('c1'))
    vi.advanceTimersByTime(10000)
    expect(sent).toEqual([])
  })

  it('pushes immediately with a zero delay', () => {
    vi.useFakeTimers()
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config({ questionDelayMs: 0 }), n => sent.push(n))
    watcher.handle(session(), questionCall(1, 'c1', args))
    vi.advanceTimersByTime(0)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ kind: 'question' })
  })

  it('does not push when notifyQuestion is off', () => {
    vi.useFakeTimers()
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config({ notifyQuestion: false }), n => sent.push(n))
    watcher.handle(session(), questionCall(1, 'c1', args))
    vi.advanceTimersByTime(10000)
    expect(sent).toEqual([])
  })

  it('deduplicates the same event seq', () => {
    vi.useFakeTimers()
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config({ questionDelayMs: 0 }), n => sent.push(n))
    const event = questionCall(1, 'c1', args)
    watcher.handle(session(), event)
    watcher.handle(session(), event)
    vi.advanceTimersByTime(0)
    expect(sent).toHaveLength(1)
  })

  it('dispose cancels pending question pushes', () => {
    vi.useFakeTimers()
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    watcher.handle(session(), questionCall(1, 'c1', args))
    watcher.dispose()
    vi.advanceTimersByTime(10000)
    expect(sent).toEqual([])
  })

  it('lists several questions of one call in a single push', () => {
    vi.useFakeTimers()
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    const multi = JSON.stringify({ questions: [{ id: 'a', question: 'Q1' }, { id: 'b', question: 'Q2' }] })
    watcher.handle(session(), questionCall(1, 'c1', multi))
    vi.advanceTimersByTime(5000)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.message).toContain('Q1')
    expect(sent[0]?.message).toContain('Q2')
  })
})

describe('SessionEventWatcher · plan review', () => {
  const plan = '# 部署后端\n\n1. 写代码\n2. 跑测试'

  it('pushes the pending plan review after the debounce delay', () => {
    vi.useFakeTimers()
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    watcher.handle(session(), planCall(1, 'p1', plan))
    expect(sent).toEqual([])
    vi.advanceTimersByTime(5000)
    expect(sent).toEqual([{
      kind: 'question',
      title: PLAN_REVIEW_TITLE,
      message: `${DEFAULT_SESSION_LABEL}\n${plan}`,
      priority: 9,
    }])
  })

  it('cancels the push when the review is answered before the delay', () => {
    vi.useFakeTimers()
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    watcher.handle(session(), planCall(1, 'p1', plan))
    watcher.handle(session(), toolResult('p1'))
    vi.advanceTimersByTime(10000)
    expect(sent).toEqual([])
  })

  it('does not push when notifyQuestion is off', () => {
    vi.useFakeTimers()
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config({ notifyQuestion: false }), n => sent.push(n))
    watcher.handle(session(), planCall(1, 'p1', plan))
    vi.advanceTimersByTime(10000)
    expect(sent).toEqual([])
  })

  it('ignores malformed plan arguments', () => {
    vi.useFakeTimers()
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    watcher.handle(session(), evt('tool/call', {
      turn: 1,
      step: 1,
      callId: 'p1' as never,
      name: EXIT_PLAN_MODE_TOOL,
      arguments: 'not json',
    }))
    vi.advanceTimersByTime(10000)
    expect(sent).toEqual([])
  })
})

describe('SessionEventWatcher · titles and session filters', () => {
  it('prefers the session/title event over the user-message fallback', () => {
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    watcher.handle(session(), userText('first prompt'))
    watcher.handle(session(), evt('turn/start', { turn: 1 }))
    watcher.handle(session(), assistant(1, 'done'))
    watcher.handle(session(), { type: SESSION_TITLE_EVENT, seq: 5, time: 0, data: { title: '部署后端' } } as unknown as SessionEvent)
    watcher.handle(session(), evt('turn/end', { turn: 1, reason: { kind: 'completed' } }, 6))
    expect(sent[0]?.message).toContain('部署后端')
  })

  it('falls back to the first user message text', () => {
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    watcher.handle(session(), userText('部署后端服务'))
    watcher.handle(session(), evt('turn/end', { turn: 1, reason: { kind: 'completed' } }))
    expect(sent[0]?.message).toContain('部署后端服务')
  })

  it('skips subagent sessions entirely', () => {
    vi.useFakeTimers()
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    const child = session({ origin: 'subagent' })
    watcher.handle(child, evt('turn/end', { turn: 1, reason: { kind: 'completed' } }))
    watcher.handle(child, questionCall(1, 'c1', '{"questions":[{"id":"a","question":"Q"}]}'))
    vi.advanceTimersByTime(10000)
    expect(sent).toEqual([])
  })

  it('tracks separate state per session', () => {
    const sent: GotifyNotification[] = []
    const watcher = new SessionEventWatcher(config(), n => sent.push(n))
    watcher.handle(session({ id: 'a' }), userText('任务甲'))
    watcher.handle(session({ id: 'b' }), userText('任务乙'))
    watcher.handle(session({ id: 'a' }), evt('turn/end', { turn: 1, reason: { kind: 'completed' } }))
    watcher.handle(session({ id: 'b' }), evt('turn/end', { turn: 1, reason: { kind: 'completed' } }))
    expect(sent[0]?.message).toContain('任务甲')
    expect(sent[1]?.message).toContain('任务乙')
  })
})
