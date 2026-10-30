import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { enableTotp } from './api'
import { accessTokenExpiresSoon, clearSession, getRefreshToken, setTokens } from './session'

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function installLocks() {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      async request(_name: string, _options: unknown, callback: (lock: unknown) => Promise<void>) {
        await callback({ name: 'lock' })
      },
    },
  })
}

beforeEach(() => {
  localStorage.clear()
  clearSession()
  installLocks()
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'locks')
})

describe('credential request refresh', () => {
  it('refreshes an almost expired session before sending the credential once', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0)
    setTokens({ access_token: 'old', refresh_token: 'r1', expires_in: 900 })
    now.mockReturnValue(870_000)

    const calls: { url: string; authorization: string | null }[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      calls.push({ url, authorization: new Headers(init?.headers).get('Authorization') })
      if (url.endsWith('/auth/refresh')) {
        return json({
          code: 'ok',
          message: 'ok',
          data: { access_token: 'new', refresh_token: 'r2', expires_in: 900 },
        })
      }
      if (url.endsWith('/auth/2fa/enable')) {
        return json({ code: 'ok', message: 'ok', data: null })
      }
      throw new Error(`unexpected request ${url}`)
    })

    await expect(enableTotp('123456')).resolves.toBeUndefined()
    expect(calls).toEqual([
      { url: '/api/v1/auth/refresh', authorization: null },
      { url: '/api/v1/auth/2fa/enable', authorization: 'Bearer new' },
    ])
    expect(getRefreshToken()).toBe('r2')
    expect(accessTokenExpiresSoon()).toBe(false)
  })
})
