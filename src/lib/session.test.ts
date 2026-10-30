import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  accessTokenExpiresSoon,
  clearSession,
  getAccessToken,
  getRefreshToken,
  refreshAccessToken,
  setTokens,
} from './session'

const LOCK = 'rdp-panel-refresh'

/**
 * jsdom has no Web Locks, and the console refuses to refresh without one
 * (localStorage cannot prove mutual exclusion). This stand-in serialises like the
 * real lock manager; a test plays "another tab" by pre-holding the returned set.
 */
function installLocks(): Set<string> {
  const held = new Set<string>()
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      async request(name: string, _opts: unknown, cb: (lock: unknown) => Promise<void>) {
        if (held.has(name)) {
          await cb(null)
          return
        }
        held.add(name)
        try {
          await cb({ name })
        } finally {
          held.delete(name)
        }
      },
    },
  })
  return held
}

function pairResponse(access: string, refresh: string, status = 200): Response {
  return new Response(
    JSON.stringify({ data: { access_token: access, refresh_token: refresh, expires_in: 900 } }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'locks')
})

describe('session refresh', () => {
  beforeEach(() => {
    localStorage.clear()
    clearSession()
    installLocks()
  })

  it('tracks whether the access token is about to expire', () => {
    expect(accessTokenExpiresSoon()).toBe(true)
    setTokens({ access_token: 'a1', refresh_token: 'r1' })
    expect(accessTokenExpiresSoon()).toBe(false)
    setTokens({ access_token: 'a1', refresh_token: 'r1', expires_in: 900 })
    expect(accessTokenExpiresSoon()).toBe(false)
    setTokens({ access_token: 'a1', refresh_token: 'r1', expires_in: 1 })
    expect(accessTokenExpiresSoon()).toBe(true)
    clearSession()
    expect(accessTokenExpiresSoon()).toBe(true)
  })

  it('stores the refresh token in localStorage and keeps access in memory', () => {
    setTokens({ access_token: 'a1', refresh_token: 'r1' })
    expect(getAccessToken()).toBe('a1')
    expect(getRefreshToken()).toBe('r1')
    expect(JSON.stringify(localStorage)).not.toContain('a1')
  })

  it('shares one refresh flight between concurrent callers', async () => {
    setTokens({ access_token: 'old', refresh_token: 'r1' })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(pairResponse('new', 'r2'))
    const [a, b] = await Promise.all([refreshAccessToken(), refreshAccessToken()])
    expect(a.access).toBe('new')
    expect(b.access).toBe('new')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getRefreshToken()).toBe('r2')
    expect(accessTokenExpiresSoon()).toBe(false)
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
    // The outcome was unknown, so the retry is refused rather than replayed;
    // that behaviour is covered by the replay-protection suite below.
  })
})

describe('refresh across tabs', () => {
  beforeEach(() => {
    localStorage.clear()
    clearSession()
  })

  it('does not spend the token while another tab holds the lock', { timeout: 15_000 }, async () => {
    const held = installLocks()
    setTokens({ access_token: 'old', refresh_token: 'r1' })
    held.add(LOCK) // another tab is inside its refresh
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    expect(await refreshAccessToken()).toEqual({ access: null, invalid: false })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getRefreshToken()).toBe('r1')
  })

  it('rotates with the token the holder published, once the lock frees', async () => {
    const held = installLocks()
    setTokens({ access_token: 'old', refresh_token: 'r1' })
    held.add(LOCK)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(pairResponse('a2', 'r2'))
    const pending = refreshAccessToken()
    // The holder finishes: it publishes a new token and releases the lock.
    setTimeout(() => {
      localStorage.setItem('rdp-panel-refresh', 'r2')
      held.delete(LOCK)
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
    installLocks()
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

describe('unsafe replay protection', () => {
  beforeEach(() => {
    localStorage.clear()
    clearSession()
    installLocks()
  })

  it('refuses to resend a token whose earlier attempt never reported back', async () => {
    setTokens({ access_token: 'old', refresh_token: 'r1' })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('socket hang up'))
    // Unknown outcome: the token is kept, and the marker records the doubt.
    expect(await refreshAccessToken()).toEqual({ access: null, invalid: false })
    expect(getRefreshToken()).toBe('r1')

    expect(await refreshAccessToken()).toEqual({ access: null, invalid: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getRefreshToken()).toBeNull()
  })

  it.each([
    ['null', 'null'],
    ['data not an object', '{"data":"x"}'],
    ['numeric tokens', '{"data":{"access_token":1,"refresh_token":2}}'],
    ['only refresh_token', '{"data":{"refresh_token":"r2"}}'],
  ])('rejects a 2xx whose body has %s', async (_label, body) => {
    setTokens({ access_token: 'old', refresh_token: 'r1' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status: 200 }))
    expect(await refreshAccessToken()).toEqual({ access: null, invalid: true })
    expect(getRefreshToken()).toBeNull()
  })

  it('keeps the doubt marker when the new pair cannot be published', async () => {
    setTokens({ access_token: 'old', refresh_token: 'r1' })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(pairResponse('a2', 'r2'))
    // A tab can die, or storage can reject the write, between the response and
    // the publish. The marker must survive that, or the next tab replays r1.
    const setItem = Storage.prototype.setItem
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === 'rdp-panel-refresh') throw new Error('quota exceeded')
      setItem.call(this, key, value)
    })

    expect(await refreshAccessToken()).toEqual({ access: null, invalid: false })
    expect(localStorage.getItem('rdp-panel-refresh-inflight')).not.toBeNull()

    spy.mockRestore()
    expect(await refreshAccessToken()).toEqual({ access: null, invalid: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getRefreshToken()).toBeNull()
  })
})

describe('browsers without Web Locks', () => {
  beforeEach(() => {
    localStorage.clear()
    clearSession()
    Reflect.deleteProperty(navigator, 'locks')
  })

  it('signs out instead of refreshing without a real cross-tab mutex', async () => {
    setTokens({ access_token: 'old', refresh_token: 'r1' })
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    expect(await refreshAccessToken()).toEqual({ access: null, invalid: true })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getRefreshToken()).toBeNull()
  })
})
