import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refreshAccessToken = vi.fn()
const logout = vi.fn()
const sessionMock = vi.hoisted(() => ({
  expiresSoon: false,
  refreshToken: 'refresh-1' as string | null,
}))

vi.mock('./session', () => ({
  getAccessToken: () => 'access-1',
  getRefreshToken: () => sessionMock.refreshToken,
  accessTokenExpiresSoon: () => sessionMock.expiresSoon,
  refreshAccessToken: (...args: unknown[]) => refreshAccessToken(...args),
  logout: () => logout(),
}))

const {
  ApiError,
  apiBlob,
  apiFetch,
  enableTotp,
  fetchClientBuildArtifact,
  fetchCsv,
  renamePasskey,
} = await import('./api')

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

describe('credential endpoints and session refresh', () => {
  beforeEach(() => {
    refreshAccessToken.mockReset()
    logout.mockReset()
    sessionMock.expiresSoon = false
    sessionMock.refreshToken = 'refresh-1'
  })
  afterEach(() => vi.restoreAllMocks())

  it('does not refresh a 401 from a credential check', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ code: 'unauthorized', message: 'invalid code' }, 401))

    await expect(enableTotp('123456')).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })

  it('refreshes and replays a passkey rename 401', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ code: 'unauthorized', message: 'expired' }, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          code: 'ok',
          message: 'ok',
          data: { id: 1, name: 'Office key' },
        }),
      )
    refreshAccessToken.mockResolvedValue({ access: 'access-2', invalid: false })

    await expect(renamePasskey(1, 'Office key')).resolves.toMatchObject({
      id: 1,
      name: 'Office key',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  it('refreshes proactively before a credential check when the access token is about to lapse', async () => {
    sessionMock.expiresSoon = true
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ code: 'ok', message: 'ok', data: null }))
    refreshAccessToken.mockResolvedValue({ access: 'access-2', invalid: false })

    await expect(enableTotp('123456')).resolves.toBeUndefined()
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('aborts the credential check without logging out when the pre-refresh is transient', async () => {
    sessionMock.expiresSoon = true
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    refreshAccessToken.mockResolvedValue({ access: null, invalid: false })

    await expect(enableTotp('123456')).rejects.toMatchObject({ status: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(logout).not.toHaveBeenCalled()
  })

  it('logs out when the pre-refresh proves the refresh token invalid', async () => {
    sessionMock.expiresSoon = true
    vi.spyOn(globalThis, 'fetch')
    refreshAccessToken.mockResolvedValue({ access: null, invalid: true })

    await expect(enableTotp('123456')).rejects.toMatchObject({ status: 401 })
    expect(logout).toHaveBeenCalledTimes(1)
  })

  it('skips the pre-refresh when there is no refresh token', async () => {
    sessionMock.expiresSoon = true
    sessionMock.refreshToken = null
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ code: 'unauthorized', message: 'invalid code' }, 401))

    await expect(enableTotp('123456')).rejects.toMatchObject({ status: 401 })
    expect(refreshAccessToken).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

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

describe('fetchClientBuildArtifact', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the artifact blob and disposition filename', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('zip-bytes', {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="panel-client-1.zip"',
        },
      }),
    )
    const result = await fetchClientBuildArtifact(1, 2, 3, 'fallback.zip')
    expect(result.filename).toBe('panel-client-1.zip')
    await expect(result.blob.text()).resolves.toBe('zip-bytes')
  })

  it('sanitizes the metadata fallback and rejects an HTML 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>proxy</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    )
    await expect(fetchClientBuildArtifact(1, 2, 3, '../evil.zip')).rejects.toMatchObject({
      status: 200,
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('zip', {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    )
    await expect(fetchClientBuildArtifact(1, 2, 3, '../evil.zip')).resolves.toMatchObject({
      filename: '.._evil.zip',
    })
  })
})

describe('apiBlob', () => {
  beforeEach(() => {
    refreshAccessToken.mockReset()
    logout.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())

  it('returns the blob, content type and sanitized filename', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('png-bytes', {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': 'attachment; filename="../logo.png"',
        },
      }),
    )
    const result = await apiBlob('/logo', { cache: 'no-store' })
    expect(result.status).toBe(200)
    expect(result.contentType).toBe('image/png')
    expect(result.filename).toBe('.._logo.png')
    expect(result.notModified).toBe(false)
    await expect(result.blob.text()).resolves.toBe('png-bytes')
  })

  it('throws the JSON envelope on a failed binary request', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ code: 'conflict', message: 'profile has active builds' }, 409),
    )
    await expect(apiBlob('/logo')).rejects.toMatchObject({
      status: 409,
      code: 'conflict',
    })
  })

  it('marks 304 as not modified instead of a body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 304 }))
    await expect(apiBlob('/logo')).resolves.toMatchObject({
      status: 304,
      notModified: true,
      filename: '',
    })
  })

  it('replays once after a refresh', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ code: 'unauthorized' }, 401))
      .mockResolvedValueOnce(
        new Response('x', { status: 200, headers: { 'Content-Type': 'image/png' } }),
      )
    refreshAccessToken.mockResolvedValue({ access: 'access-2', invalid: false })
    await expect(apiBlob('/logo')).resolves.toMatchObject({ status: 200, contentType: 'image/png' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('turns a network failure into ApiError(0)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
    await expect(apiBlob('/logo')).rejects.toMatchObject({ status: 0 })
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
