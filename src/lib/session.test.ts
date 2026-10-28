import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  refreshAccessToken,
  setTokens,
} from './session'

describe('session refresh', () => {
  beforeEach(() => {
    localStorage.clear()
    clearSession()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stores the refresh token in localStorage and keeps access in memory', () => {
    setTokens({ access_token: 'a1', refresh_token: 'r1' })
    expect(getAccessToken()).toBe('a1')
    expect(getRefreshToken()).toBe('r1')
    expect(JSON.stringify(localStorage)).not.toContain('a1')
  })

  it('shares one refresh flight between concurrent callers', async () => {
    setTokens({ access_token: 'old', refresh_token: 'r1' })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { access_token: 'new', refresh_token: 'r2' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const [a, b] = await Promise.all([refreshAccessToken(), refreshAccessToken()])
    expect(a.access).toBe('new')
    expect(b.access).toBe('new')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getRefreshToken()).toBe('r2')
  })

  it('clears the session only when the server rejects the refresh token', async () => {
    setTokens({ access_token: 'old', refresh_token: 'r1' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }))
    expect(await refreshAccessToken()).toEqual({ access: null, invalid: true })
    expect(getRefreshToken()).toBeNull()
    expect(getAccessToken()).toBeNull()
  })

  it('keeps the refresh token when the refresh fails transiently', async () => {
    setTokens({ access_token: 'old', refresh_token: 'r1' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }))
    expect(await refreshAccessToken()).toEqual({ access: null, invalid: false })
    expect(getRefreshToken()).toBe('r1')

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    expect(await refreshAccessToken()).toEqual({ access: null, invalid: false })
    expect(getRefreshToken()).toBe('r1')
  })
})

describe('refresh across tabs', () => {
  beforeEach(() => {
    localStorage.clear()
    clearSession()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.removeItem('rdp-panel-refresh-lock')
  })

  it('does not spend the token while another tab holds the lock', { timeout: 15_000 }, async () => {
    setTokens({ access_token: 'old', refresh_token: 'r1' })
    // jsdom has no navigator.locks, so this exercises the storage fallback.
    localStorage.setItem('rdp-panel-refresh-lock', `${Date.now()}-other`)
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    expect(await refreshAccessToken()).toEqual({ access: null, invalid: false })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getRefreshToken()).toBe('r1')
  })

  it('rotates with the token the holder published, once the lock frees', async () => {
    setTokens({ access_token: 'old', refresh_token: 'r1' })
    localStorage.setItem('rdp-panel-refresh-lock', `${Date.now()}-other`)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { access_token: 'a2', refresh_token: 'r2' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const pending = refreshAccessToken()
    // The holder finishes: it publishes a new token and releases the lock.
    setTimeout(() => {
      localStorage.setItem('rdp-panel-refresh', 'r2')
      localStorage.removeItem('rdp-panel-refresh-lock')
    }, 150)
    const result = await pending
    expect(result.access).toBe('a2')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const sent = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(sent.refresh_token).toBe('r2')
  })
})

describe('refresh responses that are not a usable pair', () => {
  beforeEach(() => {
    localStorage.clear()
    clearSession()
  })

  it.each(['{}', '{"data":{}}', '{"data":{"access_token":"a"}}', 'not-json'])(
    'treats %s as invalid and clears the session',
    async (body) => {
      setTokens({ access_token: 'old', refresh_token: 'r1' })
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status: 200 }))
      expect(await refreshAccessToken()).toEqual({ access: null, invalid: true })
      expect(getRefreshToken()).toBeNull()
    },
  )
})
