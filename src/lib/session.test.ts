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
    expect(a).toBe('new')
    expect(b).toBe('new')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getRefreshToken()).toBe('r2')
  })

  it('clears the session when the refresh token is rejected', async () => {
    setTokens({ access_token: 'old', refresh_token: 'r1' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }))
    expect(await refreshAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(getAccessToken()).toBeNull()
  })
})
