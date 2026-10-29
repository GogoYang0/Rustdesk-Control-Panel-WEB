import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refreshAccessToken = vi.fn()
const logout = vi.fn()

vi.mock('./session', () => ({
  getAccessToken: () => 'access-1',
  refreshAccessToken: (...args: unknown[]) => refreshAccessToken(...args),
  logout: () => logout(),
}))

const { ApiError, apiFetch, fetchCsv } = await import('./api')

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function csvResponse(body: string, disposition = 'attachment; filename="audit-org-1.csv"') {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': disposition },
  })
}

describe('fetchCsv', () => {
  beforeEach(() => {
    refreshAccessToken.mockReset()
    logout.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())

  it('returns the filename and unmodified CSV text', async () => {
    const csv = ['created_at,action', '1,test', ''].join('\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(csvResponse(csv))
    await expect(fetchCsv('/api/v1/orgs/1/audit-logs/export')).resolves.toEqual({
      filename: 'audit-org-1.csv',
      text: csv,
    })
  })

  it('throws the JSON envelope on an export 400', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ code: 'invalid_request', message: 'too many rows (1001)' }, 400),
    )
    await expect(fetchCsv('/export')).rejects.toMatchObject({
      status: 400,
      code: 'invalid_request',
      message: 'too many rows (1001)',
    })
    expect(logout).not.toHaveBeenCalled()
  })

  it('replays once after a refresh and accepts a disposition without text/csv', async () => {
    const csv = ['a,b', ''].join('\n')
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ code: 'unauthorized' }, 401))
      .mockResolvedValueOnce(
        new Response(csv, {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="x.csv"' },
        }),
      )
    refreshAccessToken.mockResolvedValue({ access: 'access-2', invalid: false })

    await expect(fetchCsv('/export')).resolves.toEqual({ filename: 'x.csv', text: csv })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects a 200 that is neither CSV nor an attachment', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }))
    await expect(fetchCsv('/export')).rejects.toMatchObject({ status: 200 })
  })

  it('sanitizes path separators and reserved characters in the filename', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      csvResponse('a', 'attachment; filename="../evil:name?.csv"'),
    )
    await expect(fetchCsv('/export')).resolves.toMatchObject({
      filename: '.._evil_name_.csv',
    })
  })

  it('turns a network failure into ApiError(0)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
    await expect(fetchCsv('/export')).rejects.toMatchObject({ status: 0 })
  })
})

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
