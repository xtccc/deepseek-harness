/**
 * The Gotify client: endpoint/body construction and the serialized pusher.
 * The fetch implementation is injected, so no HTTP leaves the test.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GotifyNotification } from '../src/contract.ts'
import { GotifyPusher, messageBody, messageEndpoint, normalizeBaseUrl } from '../src/gotify.ts'

const push: GotifyNotification = { kind: 'completed', title: 'DSH · Task completed', message: 'hello', priority: 5 }

function okResponse(): Response {
  return { ok: true, status: 200 } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('normalizeBaseUrl', () => {
  it('trims whitespace and trailing slashes', () => {
    expect(normalizeBaseUrl(' https://gotify.example.com/ ')).toBe('https://gotify.example.com')
    expect(normalizeBaseUrl('https://gotify.example.com///')).toBe('https://gotify.example.com')
    expect(normalizeBaseUrl('http://localhost:8080/')).toBe('http://localhost:8080')
  })
})

describe('messageEndpoint', () => {
  it('appends the /message path and the app token as a query parameter', () => {
    expect(messageEndpoint('https://gotify.example.com/', 'abc123')).toBe('https://gotify.example.com/message?token=abc123')
  })

  it('encodes token characters', () => {
    expect(messageEndpoint('https://g.test', 'a b&c?')).toBe('https://g.test/message?token=a%20b%26c%3F')
  })
})

describe('messageBody', () => {
  it('serializes exactly the fields Gotify understands', () => {
    expect(messageBody(push)).toEqual({ title: 'DSH · Task completed', message: 'hello', priority: 5 })
  })
})

describe('GotifyPusher', () => {
  it('POSTs one JSON push to the authenticated endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())
    const pusher = new GotifyPusher({ baseUrl: 'https://g.test/', appToken: 'tok', timeoutMs: 1000, fetchImpl })
    await pusher.send(push)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, options] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://g.test/message?token=tok')
    expect(options.method).toBe('POST')
    expect(options.headers).toEqual({ 'content-type': 'application/json' })
    expect(JSON.parse(String(options.body))).toEqual({ title: 'DSH · Task completed', message: 'hello', priority: 5 })
  })

  it('aborts a stuck request via the configured timeout signal', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())
    const pusher = new GotifyPusher({ baseUrl: 'https://g.test', appToken: 'tok', timeoutMs: 2500, fetchImpl })
    await pusher.send(push)
    const options = fetchImpl.mock.calls[0]?.[1] as RequestInit
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it('reports a network failure through onError and keeps the queue alive', async () => {
    const onError = vi.fn()
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(okResponse())
    const pusher = new GotifyPusher({ baseUrl: 'https://g.test', appToken: 'tok', timeoutMs: 1000, fetchImpl, onError })
    await pusher.send(push)
    await pusher.send({ ...push, message: 'second' })
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('gotify request failed'), expect.any(TypeError))
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('reports a non-OK status through onError', async () => {
    const onError = vi.fn()
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response)
    const pusher = new GotifyPusher({ baseUrl: 'https://g.test', appToken: 'tok', timeoutMs: 1000, fetchImpl, onError })
    await pusher.send(push)
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('HTTP 401'))
  })

  it('serializes sends in order even when the first request is slow', async () => {
    const order: string[] = []
    let releaseFirst!: () => void
    const first = new Promise<Response>(resolve => { releaseFirst = () => resolve(okResponse()) })
    const fetchImpl = vi.fn()
      .mockImplementationOnce(async (url: string) => {
        order.push('first:' + url)
        await first
        return okResponse()
      })
      .mockImplementationOnce(async (url: string) => {
        order.push('second:' + url)
        return okResponse()
      })
    const pusher = new GotifyPusher({ baseUrl: 'https://g.test', appToken: 'tok', timeoutMs: 1000, fetchImpl })
    const firstSend = pusher.send(push)
    const secondSend = pusher.send({ ...push, message: 'second' })
    await Promise.resolve()
    expect(order).toEqual(['first:https://g.test/message?token=tok'])
    releaseFirst()
    await Promise.all([firstSend, secondSend])
    expect(order).toEqual(['first:https://g.test/message?token=tok', 'second:https://g.test/message?token=tok'])
  })

  it('flush resolves after every queued push settled', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())
    const pusher = new GotifyPusher({ baseUrl: 'https://g.test', appToken: 'tok', timeoutMs: 1000, fetchImpl })
    void pusher.send(push)
    void pusher.send({ ...push, message: 'second' })
    await pusher.flush()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('uses the global fetch by default', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchImpl)
    const pusher = new GotifyPusher({ baseUrl: 'https://g.test', appToken: 'tok', timeoutMs: 1000 })
    await pusher.send(push)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
