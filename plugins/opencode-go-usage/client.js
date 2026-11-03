window.__ModuleLoader__.load({
  id: '@local/opencode-go-usage',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const h = React.createElement

    /** Locale namespace owned by this bundle. */
    const NS = 'opencode-go-usage'
    /** Host route registered by `index.js`. */
    const ROUTE = '/api/opencode-go-usage'
    /** Allowance windows in display order; the Host sends exactly these keys. */
    const WINDOWS = [
      { key: 'rolling', label: 'windowRolling', tag: 'tagRolling' },
      { key: 'weekly', label: 'windowWeekly', tag: 'tagWeekly' },
      { key: 'monthly', label: 'windowMonthly', tag: 'tagMonthly' },
    ]

    const EN = {
      title: 'OpenCode Go usage',
      windowRolling: '5-hour usage',
      windowWeekly: 'Weekly usage',
      windowMonthly: 'Monthly usage',
      tagRolling: '5h',
      tagWeekly: 'W',
      tagMonthly: 'M',
      refresh: 'Refresh usage',
      loading: 'Loading usage…',
      resets: 'Resets {time}',
      resetsUnknown: 'No reset time',
      updatedJustNow: 'Updated just now',
      updatedMinutesAgo: 'Updated {count} min ago',
      updatedAt: 'Updated {time}',
      stale: 'Could not refresh',
      openSummary: 'Open the OpenCode Go usage panel',
      noKey: 'Add an OpenCode read-only API key to credential {ref}.',
      unauthorized: 'The API key was rejected (401).',
      forbidden: 'The API key cannot read usage (403).',
      tooManyRequests: 'Too many requests; showing the last result.',
      network: 'Cannot reach opencode.ai.',
      timeout: 'The usage request timed out.',
      invalidResponse: 'OpenCode returned an unexpected response.',
      http: 'OpenCode returned an error.',
      internal: 'The Harness could not read usage.',
      credential: 'The credential store is unavailable.',
    }

    const ZH = {
      title: 'OpenCode Go 用量',
      windowRolling: '5 小时用量',
      windowWeekly: '每周用量',
      windowMonthly: '每月用量',
      tagRolling: '时',
      tagWeekly: '周',
      tagMonthly: '月',
      refresh: '刷新用量',
      loading: '正在获取用量…',
      resets: '重置 {time}',
      resetsUnknown: '无重置时间',
      updatedJustNow: '刚刚更新',
      updatedMinutesAgo: '{count} 分钟前更新',
      updatedAt: '{time} 更新',
      stale: '刷新失败',
      openSummary: '打开 OpenCode Go 用量面板',
      noKey: '请把 OpenCode 只读 API Key 存入凭据 {ref}。',
      unauthorized: 'API Key 未被接受（401）。',
      forbidden: '该 API Key 无权读取用量（403）。',
      tooManyRequests: '请求过于频繁，显示上次结果。',
      network: '无法连接 opencode.ai。',
      timeout: '获取用量超时。',
      invalidResponse: 'OpenCode 返回了无法识别的数据。',
      http: 'OpenCode 返回了错误。',
      internal: 'Harness 无法读取用量。',
      credential: '凭据存储不可用。',
    }

    /** Error code to dictionary key; unknown codes fall back to the generic HTTP text. */
    const ERROR_KEYS = {
      'no-key': 'noKey',
      unauthorized: 'unauthorized',
      forbidden: 'forbidden',
      'rate-limited': 'tooManyRequests',
      network: 'network',
      timeout: 'timeout',
      'invalid-response': 'invalidResponse',
      http: 'http',
      internal: 'internal',
      credential: 'credential',
    }

    const CSS = `
.ocgo-trigger{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;font-variant-numeric:tabular-nums;cursor:pointer;white-space:nowrap}
.ocgo-trigger:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.ocgo-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.ocgo-trigger[data-tone='warn'] .ocgo-pill-value{color:var(--dsw-alias-state-warn-primary)}
.ocgo-trigger[data-tone='error'] .ocgo-pill-value{color:var(--dsw-alias-state-error-primary)}
.ocgo-panel{position:fixed;z-index:100;box-sizing:border-box;width:320px;max-width:calc(100vw - 16px);display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-shadow-lv3,0 12px 32px rgba(0,0,0,.22));color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.35}
.ocgo-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ocgo-title{font-weight:600;letter-spacing:.01em}
.ocgo-refresh{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none}
.ocgo-refresh:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.ocgo-refresh:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.ocgo-refresh:disabled{cursor:default;opacity:.55}
.ocgo-refresh[data-busy='true'] svg{animation:ocgo-spin .9s linear infinite}
@keyframes ocgo-spin{to{transform:rotate(360deg)}}
.ocgo-rows{display:flex;flex-direction:column;gap:7px}
.ocgo-row{display:grid;grid-template-columns:auto minmax(40px,1fr) 38px auto;align-items:center;column-gap:10px}
.ocgo-label{color:var(--dsw-alias-label-secondary);white-space:nowrap}
.ocgo-track{position:relative;height:6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.ocgo-fill{position:absolute;top:0;bottom:0;left:0;border-radius:999px;transition:width .35s ease}
.ocgo-value{text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
.ocgo-reset{color:var(--dsw-alias-label-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}
.ocgo-foot{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:11px}
.ocgo-status{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ocgo-status[data-tone='warn']{color:var(--dsw-alias-state-warn-primary)}
.ocgo-status[data-tone='error']{color:var(--dsw-alias-state-error-primary)}
@media (max-width:460px){.ocgo-row{grid-template-columns:auto minmax(40px,1fr) 38px}.ocgo-reset{display:none}}
@media (prefers-reduced-motion:reduce){.ocgo-fill{transition:none}.ocgo-refresh[data-busy='true'] svg{animation:none}}
`

    /** English fallback used when the locale service is unavailable. */
    const fallbackTranslate = (key, params) => {
      const template = EN[key] ?? key
      if (params === undefined) return template
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
    }

    /**
     * Pick the tone token for one allowance bar.
     * @param percent - used share of the window, 0 through 100.
     * @param status - the endpoint's own window status.
     * @returns a CSS color token.
     */
    function fillColor(percent, status) {
      if (status === 'rate-limited' || percent >= 100) return 'var(--dsw-alias-state-error-primary)'
      if (percent >= 80) return 'var(--dsw-alias-state-warn-primary)'
      return 'var(--dsw-alias-brand-primary)'
    }

    /**
     * Format one reset instant as a compact local date and time.
     * @param iso - ISO 8601 instant from the Host, or undefined.
     * @param tag - BCP 47 tag for the active locale.
     * @param t - namespace-bound translate.
     * @returns the display text, or the localized fallback when the instant is unusable.
     */
    function formatReset(iso, tag, t) {
      if (typeof iso !== 'string') return t('resetsUnknown')
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return t('resetsUnknown')
      const text = new Intl.DateTimeFormat(tag, {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
      }).format(date)
      return t('resets', { time: text })
    }

    /**
     * Describe how old the last successful read is.
     * @param fetchedAt - ISO 8601 instant of the last read.
     * @param tag - BCP 47 tag for the active locale.
     * @param t - namespace-bound translate.
     * @returns the status text.
     */
    function formatAge(fetchedAt, tag, t) {
      const at = typeof fetchedAt === 'string' ? Date.parse(fetchedAt) : NaN
      if (Number.isNaN(at)) return t('updatedAt', { time: '—' })
      const seconds = Math.max(0, Math.round((Date.now() - at) / 1000))
      if (seconds < 60) return t('updatedJustNow')
      if (seconds < 3600) return t('updatedMinutesAgo', { count: Math.floor(seconds / 60) })
      const time = new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit' }).format(new Date(at))
      return t('updatedAt', { time })
    }

    /**
     * Build the header entry; it keeps the plugin Context so it can read the active locale.
     * @param ctx - this package's Client Context.
     * @returns the React component rendered in the Session header utilities.
     */
    function createComponent(ctx) {
      return function OpenCodeGoUsage(props) {
        const t = typeof props.t === 'function' ? props.t : fallbackTranslate
        const [state, setState] = React.useState({ status: 'loading', busy: false })
        const [open, setOpen] = React.useState(false)
        const [anchor, setAnchor] = React.useState(undefined)
        const trigger = React.useRef(null)
        const panel = React.useRef(null)
        const alive = React.useRef(true)
        const interval = React.useRef(20_000)

        const load = React.useCallback(async (options) => {
          const { force = false, manual = false } = options ?? {}
          if (manual) setState(previous => ({ ...previous, busy: true }))
          try {
            const response = await fetch(force ? `${ROUTE}?refresh=1` : ROUTE, {
              method: 'GET',
              credentials: 'same-origin',
              headers: { accept: 'application/json' },
            })
            if (!response.ok) {
              if (!alive.current) return
              const code = response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : 'http'
              setState(previous => ({ ...previous, status: 'error', code, busy: false }))
              return
            }
            const payload = await response.json()
            if (!alive.current) return
            if (payload?.ok === true && payload.usage !== undefined) {
              if (Number.isSafeInteger(payload.refreshIntervalMs) && payload.refreshIntervalMs >= 5_000) {
                // Read the Host snapshot faster than the Host asks upstream, so
                // each upstream refresh shows up without a full interval of lag.
                interval.current = Math.max(5_000, Math.min(20_000, Math.round(payload.refreshIntervalMs / 3)))
              }
              setState({
                status: 'ready',
                usage: payload.usage,
                fetchedAt: payload.fetchedAt,
                credentialRef: payload.credentialRef,
                busy: false,
              })
              return
            }
            setState(previous => ({
              ...previous,
              status: 'error',
              credentialRef: payload?.credentialRef ?? previous.credentialRef,
              code: payload?.error?.code ?? 'http',
              busy: false,
            }))
          } catch {
            if (!alive.current) return
            setState(previous => ({ ...previous, status: 'error', code: 'network', busy: false }))
          }
        }, [])

        React.useEffect(() => {
          alive.current = true
          let cancelled = false
          let timer
          const tick = async () => {
            await load({})
            if (!cancelled) timer = setTimeout(tick, interval.current)
          }
          tick()
          const onVisibility = () => {
            if (document.visibilityState === 'visible') load({})
          }
          document.addEventListener('visibilitychange', onVisibility)
          return () => {
            cancelled = true
            alive.current = false
            clearTimeout(timer)
            document.removeEventListener('visibilitychange', onVisibility)
          }
        }, [load])

        const measure = React.useCallback(() => {
          const element = trigger.current
          if (element === null) return
          const rect = element.getBoundingClientRect()
          setAnchor({
            top: Math.round(rect.bottom + 6),
            right: Math.max(8, Math.round(window.innerWidth - rect.right)),
          })
        }, [])

        React.useEffect(() => {
          if (!open) return undefined
          measure()
          const onViewportChange = () => { measure() }
          const onPointerDown = (event) => {
            const target = event.target
            if (panel.current?.contains(target) === true || trigger.current?.contains(target) === true) return
            setOpen(false)
          }
          const onKeyDown = (event) => {
            if (event.key !== 'Escape') return
            setOpen(false)
            trigger.current?.focus()
          }
          window.addEventListener('resize', onViewportChange)
          window.addEventListener('scroll', onViewportChange, true)
          document.addEventListener('pointerdown', onPointerDown, true)
          document.addEventListener('keydown', onKeyDown)
          const frame = requestAnimationFrame(() => { panel.current?.focus() })
          return () => {
            window.removeEventListener('resize', onViewportChange)
            window.removeEventListener('scroll', onViewportChange, true)
            document.removeEventListener('pointerdown', onPointerDown, true)
            document.removeEventListener('keydown', onKeyDown)
            cancelAnimationFrame(frame)
          }
        }, [open, measure])

        const locale = ctx.get('locale')
        const active = locale?.getLocale().active ?? 'en'
        const tag = active === 'zh' ? 'zh-CN' : active
        const usage = state.usage
        const errorKey = state.code === undefined ? undefined : ERROR_KEYS[state.code] ?? 'http'

        const entries = WINDOWS.map((window) => ({
          ...window,
          entry: usage?.[window.key],
          percent: usage?.[window.key]?.percent ?? 0,
        }))
        const peak = entries.reduce((best, current) => (current.percent > best.percent ? current : best), entries[0])

        const pillValue = usage === undefined ? '—' : `${t(peak.tag)} ${peak.percent}%`
        const summary = usage === undefined
          ? t('title')
          : `${t('title')}: ${entries.map(item => `${t(item.label)} ${item.percent}%`).join(' · ')}`
        const pillTone = peak.percent >= 100 || peak.entry?.status === 'rate-limited'
          ? 'error'
          : peak.percent >= 80 ? 'warn' : 'normal'

        let status
        let tone = 'muted'
        if (state.status === 'loading') {
          status = t('loading')
        } else if (state.status === 'error' && usage === undefined) {
          status = t(errorKey)
          tone = 'error'
        } else if (state.status === 'error') {
          status = `${t('stale')} · ${t(errorKey)}`
          tone = 'warn'
        } else {
          status = formatAge(state.fetchedAt, tag, t)
        }
        const filledStatus = status.replace('{ref}', state.credentialRef ?? 'OPENCODE_GO_USAGE_API_KEY')

        const rows = entries.map(({ key, label, entry, percent }) => {
          const reset = entry === undefined ? t('resetsUnknown') : formatReset(entry.resetsAt, tag, t)
          return h('div', { className: 'ocgo-row', key },
            h('span', { className: 'ocgo-label' }, t(label)),
            h('div', {
              className: 'ocgo-track',
              role: 'progressbar',
              'aria-label': t(label),
              'aria-valuemin': 0,
              'aria-valuemax': 100,
              'aria-valuenow': percent,
              'aria-valuetext': `${percent}% · ${reset}`,
            }, h('div', {
              className: 'ocgo-fill',
              style: {
                width: `${percent}%`,
                background: fillColor(percent, entry?.status),
              },
            })),
            h('span', { className: 'ocgo-value' }, entry === undefined ? '—' : `${percent}%`),
            h('span', { className: 'ocgo-reset' }, reset))
        })

        const panelNode = h('div', {
          className: 'ocgo-panel',
          role: 'dialog',
          'aria-label': t('title'),
          tabIndex: -1,
          ref: panel,
          style: anchor === undefined ? { top: 0, right: 8, visibility: 'hidden' } : { top: anchor.top, right: anchor.right },
        },
        h('div', { className: 'ocgo-head' },
          h('span', { className: 'ocgo-title' }, t('title')),
          h('button', {
            type: 'button',
            className: 'ocgo-refresh',
            'data-busy': state.busy ? 'true' : 'false',
            disabled: state.busy,
            title: t('refresh'),
            'aria-label': t('refresh'),
            onClick: () => { void load({ force: true, manual: true }) },
          }, h('svg', {
            viewBox: '0 0 16 16', width: 13, height: 13, fill: 'none',
            stroke: 'currentColor', strokeWidth: 1.6,
            strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
          },
          h('path', { d: 'M13.2 8a5.2 5.2 0 1 1-1.5-3.7' }),
          h('path', { d: 'M13.4 2.4v3.2H10.2' })))),
        h('div', { className: 'ocgo-rows' }, rows),
        h('div', { className: 'ocgo-foot' },
          h('span', {
            className: 'ocgo-status',
            'data-tone': tone,
            title: state.code === undefined ? undefined : state.code,
          }, filledStatus)))

        return h(React.Fragment, null,
          h('button', {
            type: 'button',
            className: 'ocgo-trigger',
            'data-tone': pillTone,
            ref: trigger,
            'aria-label': summary,
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            title: summary,
            onClick: () => { setOpen(value => !value) },
          },
          h('svg', {
            viewBox: '0 0 12 12', width: 12, height: 12, fill: 'currentColor',
            'aria-hidden': true, focusable: 'false',
          },
          h('rect', { x: 1, y: 6, width: 2.4, height: 5, rx: 1, opacity: 0.55 }),
          h('rect', { x: 4.8, y: 3.5, width: 2.4, height: 7.5, rx: 1, opacity: 0.8 }),
          h('rect', { x: 8.6, y: 1, width: 2.4, height: 10, rx: 1 })),
          h('span', { className: 'ocgo-pill-value' }, pillValue)),
          open ? createPortal(panelNode, document.body) : null)
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Locale may activate after this row; register the dictionaries when it
        // appears so the injected `t` seat resolves real text.
        ctx.inject(['locale'], (scope) => {
          scope.effect(() => scope.locale.register(NS, 'en', EN))
          scope.effect(() => scope.locale.register(NS, 'zh', ZH))
        })
        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.plugin = NS
          style.textContent = CSS
          document.head.appendChild(style)
          return () => { style.remove() }
        }, `${NS}: stylesheet`)
        const Component = createComponent(ctx)
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'opencode-go-usage',
          order: 10,
          locale: NS,
        }, Component))
      },
    }
  },
})
