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
  acceptInvitation,
  apiBlob,
  apiFetch,
  createToken,
  enableTotp,
  resendVerification,
  verifyEmail,
  fetchCaptchaChallenge,
  fetchClientBuildArtifact,
  fetchCsv,
  fetchAuditRetention,
  login,
  verifyTwoFactor,
  fetchIdentities,
  fetchProvisioning,
  fetchProviders,
  fetchTokens,
  exchangeOidcLogin,
  ldapLogin,
  startOidcLogin,
  updateAuditRetention,
  updateProvisioning,
  renamePasskey,
  revokeToken,
  unlinkIdentity,
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

describe('personal tokens and identities', () => {
  beforeEach(() => {
    refreshAccessToken.mockReset()
    logout.mockReset()
    sessionMock.expiresSoon = false
    sessionMock.refreshToken = 'refresh-1'
  })
  afterEach(() => vi.restoreAllMocks())

  it('lists tokens for one organization and sends the exact create payload', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          code: 'ok',
          message: 'ok',
          data: [{ id: 1, organization_id: 7, name: 'CI', token_prefix: 'rdt_abcd' }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            code: 'ok',
            message: 'ok',
            data: { token: { id: 2 }, plaintext: 'rdt_secret' },
          },
          201,
        ),
      )

    await expect(fetchTokens(7)).resolves.toMatchObject([{ id: 1 }])
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/v1/auth/tokens?organizationId=7')

    const input = {
      name: ' CI ',
      organization_id: 7,
      permissions: ['device.read'],
      expires_in_days: 30,
    }
    await expect(createToken(input)).resolves.toMatchObject({ plaintext: 'rdt_secret' })
    const createCall = fetchMock.mock.calls[1]
    expect(String(createCall[0])).toBe('/api/v1/auth/tokens')
    expect(String((createCall[1] as RequestInit).method)).toBe('POST')
    expect(JSON.parse(String((createCall[1] as RequestInit).body))).toEqual(input)
  })

  it('revokes with DELETE and lists identities without an organization parameter', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ code: 'ok', message: 'ok', data: null }))
      .mockResolvedValueOnce(
        jsonResponse({
          code: 'ok',
          message: 'ok',
          data: { active_provider: 'oidc', identities: [] },
        }),
      )

    await expect(revokeToken(3)).resolves.toBeUndefined()
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/v1/auth/tokens/3')
    expect(String((fetchMock.mock.calls[0][1] as RequestInit).method)).toBe('DELETE')

    await expect(fetchIdentities()).resolves.toMatchObject({ active_provider: 'oidc' })
    expect(String(fetchMock.mock.calls[1][0])).toBe('/api/v1/auth/identity')
  })

  it('does not refresh a 401 from identity unlink', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ code: 'unauthorized', message: 'invalid password' }, 401))

    await expect(unlinkIdentity({ identity_id: 5, password: 'wrong-pass' })).rejects.toMatchObject({
      status: 401,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(refreshAccessToken).not.toHaveBeenCalled()
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      identity_id: 5,
      password: 'wrong-pass',
    })
  })

  it('refreshes before unlinking when the access token is about to lapse', async () => {
    sessionMock.expiresSoon = true
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ code: 'ok', message: 'ok', data: null }))
    refreshAccessToken.mockResolvedValue({ access: 'access-2', invalid: false })

    await expect(
      unlinkIdentity({ identity_id: 5, stepup_token: 'step-token' }),
    ).resolves.toBeUndefined()
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(refreshAccessToken.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0],
    )
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      identity_id: 5,
      stepup_token: 'step-token',
    })
  })
})

describe('external login endpoints', () => {
  beforeEach(() => {
    refreshAccessToken.mockReset()
    logout.mockReset()
    sessionMock.expiresSoon = false
    sessionMock.refreshToken = 'refresh-1'
  })
  afterEach(() => vi.restoreAllMocks())

  it('starts OIDC with the login redirect path and no session', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        code: 'ok',
        message: 'ok',
        data: { authorization_url: 'https://idp.example.com/auth', state: 'state-1' },
      }),
    )
    await expect(startOidcLogin({ redirect_path: '/login' })).resolves.toMatchObject({
      state: 'state-1',
    })
    const call = fetchMock.mock.calls[0]
    expect(String(call[0])).toBe('/api/v1/auth/oidc/start')
    expect(String((call[1] as RequestInit).method)).toBe('POST')
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({
      redirect_path: '/login',
    })
  })

  it('does not refresh or replay a rejected OIDC ticket', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ code: 'unauthorized', message: 'ticket rejected' }, 401))
    await expect(exchangeOidcLogin({ ticket: 'ticket-1' })).rejects.toMatchObject({
      status: 401,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(refreshAccessToken).not.toHaveBeenCalled()
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      ticket: 'ticket-1',
    })
  })

  it('does not refresh or replay a rejected LDAP password', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ code: 'unauthorized', message: 'invalid credentials' }, 401),
      )
    await expect(ldapLogin({ username: 'alice', password: 'wrong' })).rejects.toMatchObject({
      status: 401,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(refreshAccessToken).not.toHaveBeenCalled()
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/v1/auth/ldap/login')
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      username: 'alice',
      password: 'wrong',
    })
  })
})

describe('captcha endpoints', () => {
  const proof = { response: { payload: 'solved-payload' } }

  beforeEach(() => {
    refreshAccessToken.mockReset()
    logout.mockReset()
    sessionMock.refreshToken = 'refresh-1'
  })
  afterEach(() => vi.restoreAllMocks())

  it('fetches the full challenge, including provider params, without refreshing', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        code: 'ok',
        message: 'ok',
        data: {
          enabled: true,
          provider: 'altcha',
          challenge: { params: { challenge: 'c1', salt: 's1', signature: 'sig1' } },
        },
      }),
    )
    await expect(fetchCaptchaChallenge()).resolves.toMatchObject({
      provider: 'altcha',
      challenge: { params: { challenge: 'c1' } },
    })
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/v1/auth/captcha')
    expect((fetchMock.mock.calls[0][1] as RequestInit).referrerPolicy).toBe('no-referrer')

    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 'unauthorized', message: 'no' }, 401))
    await expect(fetchCaptchaChallenge()).rejects.toMatchObject({ status: 401 })
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })

  it('omits captcha when no proof was solved and includes it otherwise', async () => {
    const pair = {
      code: 'ok',
      message: 'ok',
      data: { access_token: 'a', refresh_token: 'r', expires_in: 900 },
    }
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(pair))

    await login('alice@example.com', 'password-1')
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      email: 'alice@example.com',
      password: 'password-1',
    })

    await login('alice@example.com', 'password-1', proof)
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({
      email: 'alice@example.com',
      password: 'password-1',
      captcha: proof,
    })

    await verifyTwoFactor('challenge-1', '123456', proof)
    expect(JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))).toEqual({
      challenge_token: 'challenge-1',
      code: '123456',
      captcha: proof,
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        code: 'ok',
        message: 'ok',
        data: { id: 1, user_id: 2, email: 'new@example.com', role: 'member' },
      }),
    )
    await acceptInvitation('invite-1', 'password-1', proof)
    expect(JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body))).toEqual({
      token: 'invite-1',
      password: 'password-1',
      captcha: proof,
    })
  })
})

describe('onboarding endpoints', () => {
  beforeEach(() => {
    refreshAccessToken.mockReset()
    logout.mockReset()
    sessionMock.refreshToken = 'refresh-1'
  })
  afterEach(() => vi.restoreAllMocks())

  it('posts the verification token and returns void', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ code: 'ok', message: 'ok' }))
    await expect(verifyEmail('verify-token-1')).resolves.toBeUndefined()
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/v1/auth/verify-email')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({ token: 'verify-token-1' })
    expect(init.referrerPolicy).toBe('no-referrer')
  })

  it('posts the resend address and never refreshes a 429', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ code: 'rate_limited', message: 'too many' }, 429))
    await expect(resendVerification('alice@example.com')).rejects.toMatchObject({ status: 429 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(refreshAccessToken).not.toHaveBeenCalled()
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/v1/auth/resend-verification')
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      email: 'alice@example.com',
    })
  })

  it('does not refresh a 401 from verify or resend', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        jsonResponse({ code: 'unauthorized', message: 'rejected' }, 401),
      )

    await expect(verifyEmail('verify-token-1')).rejects.toMatchObject({ status: 401 })
    await expect(resendVerification('alice@example.com')).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })

  it('accepts an invitation without refreshing and returns the member', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        code: 'ok',
        message: 'ok',
        data: { id: 3, user_id: 4, email: 'new@example.com', role: 'member' },
      }),
    )
    await expect(acceptInvitation('invite-1', 'password-1')).resolves.toMatchObject({ id: 3 })
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/v1/invitations/accept')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({
      token: 'invite-1',
      password: 'password-1',
    })
    expect(init.referrerPolicy).toBe('no-referrer')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 'unauthorized', message: 'invalid credentials' }, 401),
    )
    await expect(acceptInvitation('invite-1', 'wrong')).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })
})

describe('system settings endpoints', () => {
  beforeEach(() => {
    refreshAccessToken.mockReset()
    logout.mockReset()
    sessionMock.expiresSoon = false
    sessionMock.refreshToken = 'refresh-1'
  })
  afterEach(() => vi.restoreAllMocks())

  it('reads and updates provisioning with the exact shape', async () => {
    const state = { enabled: false, state: 'disabled', cleanup_pending: true }
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ code: 'ok', message: 'ok', data: state }))
      .mockResolvedValueOnce(
        jsonResponse({
          code: 'ok',
          message: 'ok',
          data: { enabled: true, state: 'pending', cleanup_pending: false },
        }),
      )

    await expect(fetchProvisioning(7)).resolves.toEqual(state)
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/v1/orgs/7/provisioning')
    await expect(updateProvisioning(7, true)).resolves.toMatchObject({ enabled: true })
    const update = fetchMock.mock.calls[1]
    expect(String(update[0])).toBe('/api/v1/orgs/7/provisioning')
    expect(String((update[1] as RequestInit).method)).toBe('PUT')
    expect(JSON.parse(String((update[1] as RequestInit).body))).toEqual({ enabled: true })
  })

  it('reads and updates audit retention with days as an explicit number', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          code: 'ok',
          message: 'ok',
          data: { audit_retention_days: 0, last_archive: null },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 'ok',
          message: 'ok',
          data: { audit_retention_days: 30, last_archive: null },
        }),
      )

    await expect(fetchAuditRetention(7)).resolves.toMatchObject({ audit_retention_days: 0 })
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/v1/orgs/7/audit-retention')
    await expect(updateAuditRetention(7, 30)).resolves.toMatchObject({
      audit_retention_days: 30,
    })
    const update = fetchMock.mock.calls[1]
    expect(String((update[1] as RequestInit).method)).toBe('PUT')
    expect(JSON.parse(String((update[1] as RequestInit).body))).toEqual({ days: 30 })
  })

  it('reads provider status including the LDAP display name', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        code: 'ok',
        message: 'ok',
        data: { oidc: { enabled: false }, ldap: { enabled: true, name: 'Corp LDAP' } },
      }),
    )
    await expect(fetchProviders()).resolves.toEqual({
      oidc: { enabled: false },
      ldap: { enabled: true, name: 'Corp LDAP' },
    })
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
