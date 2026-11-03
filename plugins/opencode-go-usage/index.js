/**
 * Host half of the OpenCode Go usage bundle.
 *
 * Reads a read-only OpenCode API key from the credential store, asks the
 * console's Go usage endpoint for the three allowance windows, and serves the
 * normalized summary to this package's Client half over the authenticated
 * `/api` channel. Only percentages and reset instants cross that route; the key
 * itself never leaves the Host.
 *
 * @module @local/opencode-go-usage
 */

/** Loader row name. */
export const name = 'opencode-go-usage'

/** Host services this bundle cannot run without. */
export const inject = ['credentials', 'connection']

/** Allowance windows the Go endpoint reports, in display order. */
const WINDOWS = ['rolling', 'weekly', 'monthly']

/** Route below `/api`; the Client half requests exactly this path. */
const ROUTE_PATH = '/api/opencode-go-usage'

/** Credential references are POSIX shell identifiers in the store. */
const REF_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Defaults for every configuration field this bundle reads. */
const DEFAULTS = {
  credentialRef: 'OPENCODE_GO_USAGE_API_KEY',
  baseUrl: 'https://opencode.ai',
  usagePath: '/inference/go/v1/usage',
  refreshIntervalMs: 60_000,
  timeoutMs: 15_000,
}

/** Shortest upstream poll interval accepted from configuration. */
const MIN_REFRESH_INTERVAL_MS = 5_000

/** Upper bound on a failure detail echoed to the Client half. */
const MAX_DETAIL_LENGTH = 200

/**
 * Validate one configuration value and return the resolved settings.
 * @param raw - the Loader row's `config`, or undefined when the row sets none.
 * @returns every field with defaults applied.
 * @throws when a supplied field has the wrong type or an unusable value.
 */
export function resolveConfig(raw) {
  if (raw === undefined || raw === null) return { ...DEFAULTS }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${name}: config must be an object`)
  }
  const config = { ...DEFAULTS }
  const assign = (field) => {
    if (raw[field] !== undefined) config[field] = raw[field]
  }
  for (const field of Object.keys(DEFAULTS)) assign(field)
  if (typeof config.credentialRef !== 'string' || !REF_NAME.test(config.credentialRef)) {
    throw new Error(`${name}: config.credentialRef must be a POSIX shell identifier such as OPENCODE_GO_USAGE_API_KEY`)
  }
  for (const field of ['baseUrl', 'usagePath']) {
    if (typeof config[field] !== 'string' || config[field].trim() === '') {
      throw new Error(`${name}: config.${field} must be a non-empty string`)
    }
  }
  let origin
  try {
    origin = new URL(config.baseUrl)
  } catch {
    throw new Error(`${name}: config.baseUrl must be an absolute http(s) URL`)
  }
  if (origin.protocol !== 'https:' && origin.protocol !== 'http:') {
    throw new Error(`${name}: config.baseUrl must be an absolute http(s) URL`)
  }
  if (!config.usagePath.startsWith('/')) {
    throw new Error(`${name}: config.usagePath must start with "/"`)
  }
  for (const field of ['refreshIntervalMs', 'timeoutMs']) {
    if (!Number.isSafeInteger(config[field]) || config[field] < MIN_REFRESH_INTERVAL_MS) {
      throw new Error(`${name}: config.${field} must be an integer of at least ${MIN_REFRESH_INTERVAL_MS}`)
    }
  }
  return config
}

/**
 * Build the failure payload the Client half renders.
 * @param code - stable machine-readable reason.
 * @param message - short technical detail, never a credential.
 * @param credentialRef - the reference the Client half names when no key is set.
 * @returns the payload body.
 */
function failure(code, message, credentialRef) {
  return {
    ok: false,
    credentialRef,
    error: { code, message: message.slice(0, MAX_DETAIL_LENGTH) },
  }
}

/**
 * Map the endpoint body onto the summary the Client half renders.
 * @param body - parsed JSON from the usage endpoint.
 * @returns the three windows in display order, or undefined when the body does not match the endpoint's declared fields.
 */
export function parseUsage(body) {
  const usage = typeof body === 'object' && body !== null ? body.usage : undefined
  if (typeof usage !== 'object' || usage === null || Array.isArray(usage)) return undefined
  const parsed = {}
  for (const window of WINDOWS) {
    const entry = usage[window]
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined
    const percent = entry.percent
    if (typeof percent !== 'number' || !Number.isFinite(percent)) return undefined
    const resetsAt = typeof entry.resetsAt === 'string' ? Date.parse(entry.resetsAt) : NaN
    parsed[window] = {
      status: entry.status === 'rate-limited' ? 'rate-limited' : 'ok',
      percent: Math.min(100, Math.max(0, Math.round(percent))),
      ...Number.isNaN(resetsAt) ? {} : { resetsAt: new Date(resetsAt).toISOString() },
    }
  }
  return parsed
}

/**
 * Start the periodic snapshot and register the usage route for this profile.
 * @param ctx - owning Context providing `credentials` and `connection`.
 * @param rawConfig - the Loader row's `config`.
 * @returns nothing; the timer and route are removed when the plugin unloads.
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  const lifetime = new AbortController()
  /** Last successful payload and when it was produced, in epoch milliseconds. */
  let cached
  /** Coalesces concurrent requests so the endpoint sees one call per refresh. */
  let inflight

  ctx.effect(() => () => { lifetime.abort() }, `${name}: request lifetime`)

  /** Resolve the read-only key from the credential store, then the process environment. */
  const apiKey = async () => {
    const stored = await ctx.credentials.resolve(config.credentialRef)
    const value = stored?.value?.trim()
    if (value !== undefined && value !== '') return value
    const fromEnvironment = process.env[config.credentialRef]?.trim()
    return fromEnvironment === undefined || fromEnvironment === '' ? undefined : fromEnvironment
  }

  /** Ask the endpoint once and normalize the outcome into a Client-facing payload. */
  const requestUsage = async () => {
    let key
    try {
      key = await apiKey()
    } catch (error) {
      return failure('credential', error instanceof Error ? error.message : String(error), config.credentialRef)
    }
    if (key === undefined) {
      return failure('no-key', `No value in credential ${config.credentialRef}`, config.credentialRef)
    }
    let response
    try {
      response = await fetch(new URL(config.usagePath, config.baseUrl), {
        method: 'GET',
        headers: {
          authorization: `Bearer ${key}`,
          accept: 'application/json',
          'user-agent': 'dsh-opencode-go-usage/1.0',
        },
        signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(config.timeoutMs)]),
      })
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      return failure(timedOut ? 'timeout' : 'network', error instanceof Error ? error.message : String(error), config.credentialRef)
    }
    if (response.status === 401) return failure('unauthorized', 'The API key was rejected', config.credentialRef)
    if (response.status === 403) return failure('forbidden', 'The API key cannot read usage', config.credentialRef)
    if (response.status === 429) return failure('rate-limited', 'The usage endpoint asked to slow down', config.credentialRef)
    if (!response.ok) return failure('http', `The usage endpoint answered HTTP ${response.status}`, config.credentialRef)
    let body
    try {
      body = await response.json()
    } catch (error) {
      return failure('invalid-response', error instanceof Error ? error.message : String(error), config.credentialRef)
    }
    const usage = parseUsage(body)
    if (usage === undefined) {
      return failure('invalid-response', 'The usage endpoint returned unexpected fields', config.credentialRef)
    }
    return {
      ok: true,
      credentialRef: config.credentialRef,
      usage,
      fetchedAt: new Date().toISOString(),
      refreshIntervalMs: config.refreshIntervalMs,
    }
  }

  /**
   * Ask the endpoint now, keeping the last success for readers.
   * Concurrent callers share one upstream request, so a timer tick, a page
   * read, and the refresh button never stack.
   * @returns the payload of this attempt.
   */
  const refresh = () => {
    if (inflight !== undefined) return inflight
    inflight = requestUsage().then((payload) => {
      inflight = undefined
      if (payload.ok) cached = { at: Date.now(), payload }
      return payload
    }, (error) => {
      inflight = undefined
      throw error
    })
    return inflight
  }

  // Host-owned cadence: one upstream request per interval, independent of any
  // open page, so the snapshot keeps moving while nobody is looking.
  ctx.effect(() => {
    const tick = () => { void refresh().catch(() => undefined) }
    tick()
    const timer = setInterval(tick, config.refreshIntervalMs)
    if (typeof timer.unref === 'function') timer.unref()
    return () => { clearInterval(timer) }
  }, `${name}: refresh loop`)

  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const forced = new URL(request.url).searchParams.has('refresh')
      let payload
      try {
        payload = forced || cached === undefined ? await refresh() : cached.payload
      } catch (error) {
        payload = failure('internal', error instanceof Error ? error.message : String(error), config.credentialRef)
      }
      return Response.json(payload, { headers: { 'cache-control': 'no-store' } })
    },
  }), `${name}: usage route`)
}
