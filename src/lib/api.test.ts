import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refreshAccessToken = vi.fn()
const logout = vi.fn()

vi.mock('./session', () => ({
  getAccessToken: () => 'access-1',
  refreshAccessToken: (...args: unknown[]) => refreshAccessToken(...args),
  logout: () => logout(),
}))

const { ApiError, apiFetch } = await import('./api')

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('apiFetch', () => {
  beforeEach(() => {
    refreshAccessToken.mockReset()
    logout.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('unwraps the envelope', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ code: 'ok', data: { id: 1 } }))
    await expect(apiFetch<{ id: number }>('/api/v1/me')).resolves.toEqual({ id: 1 })
  })

  it('replays once after a successful refresh', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ code: 'unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ code: 'ok', data: { id: 2 } }))
    refreshAccessToken.mockResolvedValue({ access: 'access-2', invalid: false })

    await expect(apiFetch<{ id: number }>('/api/v1/me')).resolves.toEqual({ id: 2 })
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(logout).not.toHaveBeenCalled()
  })

  it('signs the session out when the refresh fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ code: 'unauthorized', message: 'expired' }, 401),
    )
    refreshAccessToken.mockResolvedValue({ access: null, invalid: true })

    await expect(apiFetch('/api/v1/me')).rejects.toBeInstanceOf(ApiError)
    expect(logout).toHaveBeenCalledTimes(1)
  })

  it('carries the error envelope detail so callers can read the 2FA challenge', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        { code: 'two_factor_required', message: '需要两步验证', data: { challenge_token: 'c1' } },
        401,
      ),
    )
    refreshAccessToken.mockResolvedValue({ access: null, invalid: true })

    await expect(apiFetch('/api/v1/auth/login', { retryOn401: false })).rejects.toMatchObject({
      code: 'two_factor_required',
      detail: { challenge_token: 'c1' },
    })
  })
})
