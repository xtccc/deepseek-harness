/**
 * Host composition behavior: the plugin module boots over a real cordis
 * Context with the REAL SessionStore, and committed session events become
 * real Gotify POSTs through the real pusher — nothing is faked except the
 * fetch transport. Proves registration, the event subscription, and the
 * full watcher→pusher chain end-to-end.
 */
import { Context } from '@deepseek-ai/cordis'
import { createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as plugin from '../src/index.ts'

function reply(text: string) {
  return createAssistantMessage({ content: [{ type: 'text', text }], source: { provider: 'test', model: 'test' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('dsh-notification-gotify host composition', () => {
  it('pushes a completed turn to Gotify over the real session store', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchImpl)
    const ctx = new Context()
    await ctx.plugin(TypertRegistry)
    await ctx.plugin(SessionStore)
    const fiber = ctx.plugin(
      { inject: plugin.inject, apply: plugin.apply },
      { baseUrl: 'https://gotify.test', appToken: 'tok', maxBodyChars: 100 },
    )
    await fiber
    const store = ctx.get('sessions') as SessionStore
    const session = store.create(undefined, { meta: { cwd: '/tmp/dsh-notification-gotify' } })
    session.append('turn/start', { turn: 1 })
    session.append('assistant/message', { turn: 1, step: 1, message: reply('deploy done') }, { surfaceOp: 'append' })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
    const [url, options] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://gotify.test/message?token=tok')
    expect(JSON.parse(String(options.body))).toMatchObject({
      title: 'DSH · Task completed',
      priority: 5,
      message: expect.stringContaining('deploy done'),
    })
    await fiber.dispose()
  })

  it('pushes a debounced question through the full chain', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchImpl)
    const ctx = new Context()
    await ctx.plugin(TypertRegistry)
    await ctx.plugin(SessionStore)
    const fiber = ctx.plugin(
      { inject: plugin.inject, apply: plugin.apply },
      { baseUrl: 'https://gotify.test', appToken: 'tok', questionDelayMs: 3000 },
    )
    await fiber
    const store = ctx.get('sessions') as SessionStore
    const session = store.create(undefined, { meta: { cwd: '/tmp/dsh-notification-gotify' } })
    session.append('tool/call', {
      turn: 1,
      step: 1,
      callId: 'q1' as never,
      name: 'ask_user_question',
      arguments: JSON.stringify({ questions: [{ id: 'a', question: '继续?', options: [{ label: '是' }] }] }),
    })

    vi.advanceTimersByTime(3000)
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({ title: 'DSH · Question for you', priority: 9, message: expect.stringContaining('继续?') })
    vi.useRealTimers()
    await fiber.dispose()
  })

  it('pushes a debounced plan review through the full chain', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchImpl)
    const ctx = new Context()
    await ctx.plugin(TypertRegistry)
    await ctx.plugin(SessionStore)
    const fiber = ctx.plugin(
      { inject: plugin.inject, apply: plugin.apply },
      { baseUrl: 'https://gotify.test', appToken: 'tok', questionDelayMs: 3000 },
    )
    await fiber
    const store = ctx.get('sessions') as SessionStore
    const session = store.create(undefined, { meta: { cwd: '/tmp/dsh-notification-gotify' } })
    session.append('tool/call', {
      turn: 1,
      step: 1,
      callId: 'p1' as never,
      name: 'exit_plan_mode',
      arguments: JSON.stringify({ plan: '# 部署后端\n\n1. 写代码' }),
    })

    vi.advanceTimersByTime(3000)
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({
      title: 'DSH · Plan review',
      priority: 9,
      message: expect.stringContaining('# 部署后端'),
    })
    vi.useRealTimers()
    await fiber.dispose()
  })

  it('cancels the question push when the answer lands first', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchImpl)
    const ctx = new Context()
    await ctx.plugin(TypertRegistry)
    await ctx.plugin(SessionStore)
    const fiber = ctx.plugin(
      { inject: plugin.inject, apply: plugin.apply },
      { baseUrl: 'https://gotify.test', appToken: 'tok', questionDelayMs: 3000 },
    )
    await fiber
    const store = ctx.get('sessions') as SessionStore
    const session = store.create(undefined, { meta: { cwd: '/tmp/dsh-notification-gotify' } })
    const callId = 'q1' as never
    session.append('tool/call', {
      turn: 1,
      step: 1,
      callId,
      name: 'ask_user_question',
      arguments: JSON.stringify({ questions: [{ id: 'a', question: '继续?', options: [{ label: '是' }] }] }),
    })
    session.append('tool/result', {
      turn: 1,
      step: 1,
      message: createToolResultMessage({ callId, content: [{ type: 'text', text: '{"answers":[]}' }], isError: false }),
    }, { surfaceOp: 'append' })

    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchImpl).not.toHaveBeenCalled()
    vi.useRealTimers()
    await fiber.dispose()
  })

  it('stays inert (no fetch) when Gotify is not configured', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const ctx = new Context()
    await ctx.plugin(TypertRegistry)
    await ctx.plugin(SessionStore)
    const fiber = ctx.plugin({ inject: plugin.inject, apply: plugin.apply })
    await fiber
    const store = ctx.get('sessions') as SessionStore
    const session = store.create(undefined, { meta: { cwd: '/tmp/dsh-notification-gotify' } })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(fetchImpl).not.toHaveBeenCalled()
    await fiber.dispose()
  })

  it('validates configuration through the exported schema', () => {
    expect(plugin.Config({})).toEqual({
      baseUrl: '',
      appToken: '',
      enabled: true,
      notifyCompleted: true,
      notifyInterrupted: true,
      notifyFailed: true,
      notifyQuestion: true,
      completedPriority: 5,
      interruptedPriority: 8,
      failedPriority: 8,
      questionPriority: 9,
      maxBodyChars: 400,
      questionDelayMs: 5000,
      timeoutMs: 10000,
    })
    expect(() => plugin.Config({ completedPriority: 11 })).toThrow()
    expect(() => plugin.Config({ maxBodyChars: 0 })).toThrow()
  })
})
