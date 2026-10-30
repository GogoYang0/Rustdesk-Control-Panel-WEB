import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { accessTokenExpiresSoon, clearSession, getRefreshToken } from '../../lib/session'
import { panelApi } from '../../store/api'
import LoginPage from './LoginPage'

const redirectMock = vi.hoisted(() => vi.fn())

vi.mock('../../lib/browser', () => ({ redirectTo: redirectMock }))

const webauthnMock = vi.hoisted(() => ({
  supported: true,
  assert: vi.fn(),
}))

vi.mock('../../lib/webauthn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/webauthn')>()
  return {
    ...actual,
    webAuthnSupported: () => webauthnMock.supported,
    assertPasskeyCredential: webauthnMock.assert,
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function tokenPair() {
  return {
    code: 'ok',
    message: 'ok',
    data: { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 900 },
  }
}

function setup(
  options: {
    loginStatus?: number
    loginBody?: unknown
    beginStatus?: number
    beginNetworkError?: boolean
    providers?: {
      oidc: { enabled: boolean; name?: string }
      ldap: { enabled: boolean; name?: string }
    }
    providersStatus?: number
    captchaEnabled?: boolean
    captchaStatus?: number
    initialPath?: string
    exchangeBody?: unknown
    exchangeStatus?: number
    startStatus?: number
    ldapBody?: unknown
    ldapStatus?: number
    verifyBody?: unknown
    verifyStatus?: number
    resendStatus?: number
    resendNetworkError?: boolean
    strict?: boolean
  } = {},
) {
  const requests: { url: string; body: string }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const body = typeof init?.body === 'string' ? init.body : ''
    requests.push({ url, body })
    if (url.endsWith('/auth/captcha')) {
      if (options.captchaStatus) {
        return json({ code: 'internal', message: 'probe failed' }, options.captchaStatus)
      }
      return json({
        code: 'ok',
        message: 'ok',
        data: { enabled: options.captchaEnabled ?? false },
      })
    }
    if (url.endsWith('/auth/providers')) {
      if (options.providersStatus) {
        return json({ code: 'internal', message: 'probe failed' }, options.providersStatus)
      }
      return json({
        code: 'ok',
        message: 'ok',
        data: options.providers ?? { oidc: { enabled: false }, ldap: { enabled: false } },
      })
    }
    if (url.endsWith('/auth/oidc/start')) {
      if (options.startStatus) {
        return json({ code: 'internal', message: 'sso disabled' }, options.startStatus)
      }
      return json({
        code: 'ok',
        message: 'ok',
        data: { authorization_url: 'https://idp.example.com/authorize', state: 'state-1' },
      })
    }
    if (url.endsWith('/auth/oidc/exchange')) {
      return json(options.exchangeBody ?? tokenPair(), options.exchangeStatus ?? 200)
    }
    if (url.endsWith('/auth/ldap/login')) {
      return json(options.ldapBody ?? tokenPair(), options.ldapStatus ?? 200)
    }
    if (url.endsWith('/auth/login')) {
      return json(
        options.loginBody ?? { code: 'unauthorized', message: 'invalid credentials' },
        options.loginStatus ?? 401,
      )
    }
    if (url.endsWith('/auth/2fa/verify')) {
      return json(options.verifyBody ?? tokenPair(), options.verifyStatus ?? 200)
    }
    if (url.endsWith('/auth/resend-verification')) {
      if (options.resendNetworkError) throw new TypeError('Failed to fetch')
      if (options.resendStatus) {
        return json({ code: 'rate_limited', message: 'too many requests' }, options.resendStatus)
      }
      return json({ code: 'ok', message: 'ok' })
    }
    if (url.endsWith('/auth/passkey/login/begin')) {
      if (options.beginNetworkError) throw new TypeError('Failed to fetch')
      if (options.beginStatus) {
        return json({ code: 'internal', message: 'passkey disabled' }, options.beginStatus)
      }
      return json({
        code: 'ok',
        message: 'ok',
        data: { ceremony_token: 'login-ceremony', options: { publicKey: { challenge: 'AAAA' } } },
      })
    }
    if (url.endsWith('/auth/passkey/login/finish')) {
      return json(tokenPair())
    }
    return json({ code: 'ok', message: 'ok', data: null })
  })

  webauthnMock.assert.mockResolvedValue({
    id: 'cred',
    rawId: 'cred',
    type: 'public-key',
    response: { clientDataJSON: 'x', authenticatorData: 'x', signature: 'x', userHandle: null },
  })

  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) =>
      getDefault({
        serializableCheck: {
          ignoredActions: ['panelApi/executeQuery/rejected', 'panelApi/executeMutation/rejected'],
          ignoredPaths: [/^panelApi\.(queries|mutations)\..*\.error$/],
        },
      }).concat(panelApi.middleware),
  })
  const tree = (
    <Provider store={store}>
      <MemoryRouter initialEntries={[options.initialPath ?? '/login']}>
        <Routes>
          <Route
            path="/login"
            element={
              <>
                <LoginPage />
                <LocationProbe />
              </>
            }
          />
          <Route path="/" element={<div>控制台</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  )
  render(options.strict ? <StrictMode>{tree}</StrictMode> : tree)
  return { requests, store }
}

beforeEach(() => {
  webauthnMock.supported = true
  webauthnMock.assert.mockReset()
  clearSession()
  localStorage.clear()
})

afterEach(() => vi.restoreAllMocks())

describe('LoginPage passkey login', () => {
  it('signs in with a discoverable passkey when the email is empty', async () => {
    const { requests } = setup()
    fireEvent.click(await screen.findByRole('button', { name: '使用 Passkey 登录' }))
    expect(await screen.findByText('控制台')).toBeTruthy()
    const begin = requests.find((request) => request.url.endsWith('/auth/passkey/login/begin'))
    expect(JSON.parse(begin?.body ?? '{}')).toEqual({})
    const finish = requests.find((request) => request.url.endsWith('/auth/passkey/login/finish'))
    expect(JSON.parse(finish?.body ?? '{}').ceremony_token).toBe('login-ceremony')
    expect(getRefreshToken()).toBe('refresh-1')
  })

  it('records the access-token expiry from the login response', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0)
    setup()
    fireEvent.click(await screen.findByRole('button', { name: '使用 Passkey 登录' }))
    await screen.findByText('控制台')
    expect(accessTokenExpiresSoon()).toBe(false)
    now.mockReturnValue(870_000)
    expect(accessTokenExpiresSoon()).toBe(true)
  })

  it('uses the email as an optional credential hint', async () => {
    const { requests } = setup()
    fireEvent.change(await screen.findByLabelText(/邮箱/), {
      target: { value: 'owner@acme.local' },
    })
    fireEvent.click(screen.getByRole('button', { name: '使用 Passkey 登录' }))
    await screen.findByText('控制台')
    const begin = requests.find((request) => request.url.endsWith('/auth/passkey/login/begin'))
    expect(JSON.parse(begin?.body ?? '{}')).toEqual({ email: 'owner@acme.local' })
  })

  it('offers passkey as the second factor after a password challenge', async () => {
    const { requests } = setup({
      loginStatus: 401,
      loginBody: {
        code: 'two_factor_required',
        message: 'two factor required',
        data: { challenge_token: 'challenge-1', methods: ['totp', 'passkey'] },
      },
    })
    fireEvent.change(await screen.findByLabelText(/邮箱/), {
      target: { value: 'owner@acme.local' },
    })
    fireEvent.change(screen.getByLabelText(/密码/), { target: { value: 'secret-pass' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByRole('heading', { name: '两步验证' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '使用 Passkey 验证' }))
    await screen.findByText('控制台')
    const begin = requests.find((request) => request.url.endsWith('/auth/passkey/login/begin'))
    expect(JSON.parse(begin?.body ?? '{}')).toEqual({ challenge_token: 'challenge-1' })
  })

  it('tells the second factor to go back when the challenge is no longer valid', async () => {
    setup({
      loginStatus: 401,
      loginBody: {
        code: 'two_factor_required',
        message: 'two factor required',
        data: { challenge_token: 'challenge-1', methods: ['totp', 'passkey'] },
      },
      beginStatus: 401,
    })
    fireEvent.change(await screen.findByLabelText(/邮箱/), {
      target: { value: 'owner@acme.local' },
    })
    fireEvent.change(screen.getByLabelText(/密码/), { target: { value: 'secret-pass' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByRole('heading', { name: '两步验证' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '使用 Passkey 验证' }))
    expect(await screen.findByText('验证挑战已失效或未通过，请返回重新登录')).toBeTruthy()
  })

  it('reports a cancelled authenticator without calling the finish endpoint', async () => {
    const { requests } = setup()
    webauthnMock.assert.mockRejectedValue(new DOMException('cancelled', 'NotAllowedError'))
    fireEvent.click(await screen.findByRole('button', { name: '使用 Passkey 登录' }))
    expect(await screen.findByText('已取消或超时，请重试')).toBeTruthy()
    expect(requests.some((request) => request.url.endsWith('/auth/passkey/login/finish'))).toBe(
      false,
    )
  })

  it('explains a deployment without WebAuthn instead of showing a generic error', async () => {
    setup({ beginStatus: 503 })
    fireEvent.click(await screen.findByRole('button', { name: '使用 Passkey 登录' }))
    expect(await screen.findByText('该部署未启用 Passkey 登录')).toBeTruthy()
  })

  it('hides the passkey button in an unsupported browser', async () => {
    webauthnMock.supported = false
    await setup()
    await screen.findByLabelText(/邮箱/)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '使用 Passkey 登录' })).toBeNull(),
    )
  })

  it('reports a network failure as a network problem, not a bad authenticator', async () => {
    setup({ beginNetworkError: true })
    fireEvent.click(await screen.findByRole('button', { name: '使用 Passkey 登录' }))
    expect(await screen.findByText('网络异常，请稍后重试')).toBeTruthy()
  })

  it('maps a passkey service failure to Chinese copy', async () => {
    setup({ beginStatus: 500 })
    fireEvent.click(await screen.findByRole('button', { name: '使用 Passkey 登录' }))
    expect(await screen.findByText('服务异常，请稍后重试')).toBeTruthy()
  })

  it('starts OIDC with the login redirect path and no token cache', async () => {
    const { requests } = setup({
      providers: { oidc: { enabled: true, name: 'Corp SSO' }, ldap: { enabled: false } },
    })
    fireEvent.click(await screen.findByRole('button', { name: '使用 Corp SSO 登录' }))
    await waitFor(() =>
      expect(requests.some((request) => request.url.endsWith('/auth/oidc/start'))).toBe(true),
    )
    const start = requests.find((request) => request.url.endsWith('/auth/oidc/start'))
    expect(JSON.parse(start?.body ?? '{}')).toEqual({ redirect_path: '/login' })
    expect(redirectMock).toHaveBeenCalledWith('https://idp.example.com/authorize')
    expect(getRefreshToken()).toBeNull()
  })

  it('explains an unavailable OIDC provider without navigating away', async () => {
    setup({
      providers: { oidc: { enabled: true }, ldap: { enabled: false } },
      startStatus: 503,
    })
    fireEvent.click(await screen.findByRole('button', { name: '使用 OIDC 登录' }))
    expect(await screen.findByText(/SSO 尚未启用或身份提供方不可用/)).toBeTruthy()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('exchanges an OIDC ticket exactly once', async () => {
    const { requests } = setup({ initialPath: '/login?ticket=ticket-1' })
    expect(await screen.findByText('控制台')).toBeTruthy()
    const exchanges = requests.filter((request) => request.url.endsWith('/auth/oidc/exchange'))
    expect(exchanges).toHaveLength(1)
    expect(JSON.parse(exchanges[0].body)).toEqual({ ticket: 'ticket-1' })
    expect(getRefreshToken()).toBe('refresh-1')
  })

  it('does not double-spend the ticket under StrictMode', async () => {
    const { requests } = setup({ initialPath: '/login?ticket=ticket-1', strict: true })
    expect(await screen.findByText('控制台')).toBeTruthy()
    expect(requests.filter((request) => request.url.endsWith('/auth/oidc/exchange'))).toHaveLength(
      1,
    )
  })

  it('clears a rejected ticket and keeps the login form usable', async () => {
    const { requests } = setup({
      initialPath: '/login?ticket=ticket-1',
      exchangeStatus: 401,
      exchangeBody: { code: 'unauthorized', message: 'ticket rejected' },
    })
    expect(await screen.findByText(/SSO 回调已失效/)).toBeTruthy()
    expect(screen.getByTestId('location').textContent).toBe('/login')
    expect(requests.some((request) => request.url.endsWith('/auth/oidc/exchange'))).toBe(true)
    expect(await screen.findByLabelText(/邮箱/)).toBeTruthy()
  })

  it('maps OIDC callback errors without showing the raw code', async () => {
    setup({ initialPath: '/login?error=identity_conflict' })
    expect(await screen.findByText(/该外部身份已绑定其他账号/)).toBeTruthy()
    expect(screen.getByTestId('location').textContent).toBe('/login')
  })

  it('continues an OIDC login through the local TOTP step', async () => {
    const { requests } = setup({
      initialPath: '/login?ticket=ticket-1',
      exchangeStatus: 401,
      exchangeBody: {
        code: 'two_factor_required',
        message: 'two factor required',
        data: { challenge_token: 'challenge-oidc', methods: ['totp'] },
      },
    })
    expect(await screen.findByRole('heading', { name: '两步验证' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/动态码/), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: '验证并登录' }))
    await screen.findByText('控制台')
    const verify = requests.find((request) => request.url.endsWith('/auth/2fa/verify'))
    expect(JSON.parse(verify?.body ?? '{}')).toEqual({
      challenge_token: 'challenge-oidc',
      code: '123456',
    })
  })

  it('signs in with LDAP credentials from the directory mode', async () => {
    const { requests } = setup({
      providers: { oidc: { enabled: false }, ldap: { enabled: true, name: 'Corp LDAP' } },
    })
    fireEvent.click(await screen.findByRole('button', { name: '目录账号' }))
    fireEvent.change(screen.getByLabelText(/目录用户名/), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText(/目录密码/), { target: { value: 'directory-pass' } })
    fireEvent.click(screen.getByRole('button', { name: '目录登录' }))
    await screen.findByText('控制台')
    const ldap = requests.find((request) => request.url.endsWith('/auth/ldap/login'))
    expect(JSON.parse(ldap?.body ?? '{}')).toEqual({
      username: 'alice',
      password: 'directory-pass',
    })
    expect(getRefreshToken()).toBe('refresh-1')
  })

  it('maps an LDAP credential failure and clears the directory password', async () => {
    setup({
      providers: { oidc: { enabled: false }, ldap: { enabled: true } },
      ldapStatus: 401,
      ldapBody: { code: 'unauthorized', message: 'invalid credentials' },
    })
    fireEvent.click(await screen.findByRole('button', { name: '目录账号' }))
    fireEvent.change(screen.getByLabelText(/目录用户名/), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText(/目录密码/), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: '目录登录' }))
    expect(await screen.findByText('目录用户名或密码不正确')).toBeTruthy()
    expect((screen.getByLabelText(/目录密码/) as HTMLInputElement).value).toBe('')
  })

  it('uses TOTP-specific copy for a rejected second factor', async () => {
    setup({
      loginStatus: 401,
      loginBody: {
        code: 'two_factor_required',
        message: 'two factor required',
        data: { challenge_token: 'challenge-1', methods: ['totp'] },
      },
      verifyStatus: 401,
      verifyBody: { code: 'unauthorized', message: 'invalid code' },
    })
    fireEvent.change(await screen.findByLabelText(/邮箱/), {
      target: { value: 'owner@acme.local' },
    })
    fireEvent.change(screen.getByLabelText(/密码/), { target: { value: 'secret-pass' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByRole('heading', { name: '两步验证' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/动态码/), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: '验证并登录' }))
    expect(await screen.findByText('动态码或恢复码不正确')).toBeTruthy()
  })

  it('warns that TOTP cannot finish while captcha is enabled', async () => {
    setup({
      captchaEnabled: true,
      initialPath: '/login?ticket=ticket-1',
      exchangeStatus: 401,
      exchangeBody: {
        code: 'two_factor_required',
        message: 'two factor required',
        data: { challenge_token: 'challenge-oidc', methods: ['totp'] },
      },
    })
    expect(await screen.findByRole('heading', { name: '两步验证' })).toBeTruthy()
    expect(screen.getByText(/TOTP 第二步需要验证码 proof/)).toBeTruthy()
  })

  it('shows an unknown captcha state on the TOTP step when the probe fails', async () => {
    setup({
      captchaStatus: 500,
      initialPath: '/login?ticket=ticket-1',
      exchangeStatus: 401,
      exchangeBody: {
        code: 'two_factor_required',
        message: 'two factor required',
        data: { challenge_token: 'challenge-oidc', methods: ['totp'] },
      },
    })
    expect(await screen.findByRole('heading', { name: '两步验证' })).toBeTruthy()
    expect(screen.getByText(/正在确认验证码状态/)).toBeTruthy()
    expect(screen.getByLabelText(/动态码/).getAttribute('aria-describedby')).toBe(
      'totp-captcha-hint',
    )
  })

  it('continues an LDAP login through the local TOTP step', async () => {
    const { requests } = setup({
      providers: { oidc: { enabled: false }, ldap: { enabled: true } },
      ldapStatus: 401,
      ldapBody: {
        code: 'two_factor_required',
        message: 'two factor required',
        data: { challenge_token: 'challenge-ldap', methods: ['totp'] },
      },
    })
    fireEvent.click(await screen.findByRole('button', { name: '目录账号' }))
    fireEvent.change(screen.getByLabelText(/目录用户名/), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText(/目录密码/), { target: { value: 'directory-pass' } })
    fireEvent.click(screen.getByRole('button', { name: '目录登录' }))
    expect(await screen.findByRole('heading', { name: '两步验证' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/动态码/), { target: { value: '654321' } })
    fireEvent.click(screen.getByRole('button', { name: '验证并登录' }))
    await screen.findByText('控制台')
    const verify = requests.find((request) => request.url.endsWith('/auth/2fa/verify'))
    expect(JSON.parse(verify?.body ?? '{}')).toEqual({
      challenge_token: 'challenge-ldap',
      code: '654321',
    })
  })

  it('keeps local login usable when the provider probe fails', async () => {
    setup({ providersStatus: 500 })
    expect(await screen.findByText(/无法读取外部身份状态/)).toBeTruthy()
    expect(await screen.findByLabelText(/邮箱/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '登录' })).toBeTruthy()
  })

  it('keeps LDAP disabled until the captcha probe resolves', async () => {
    setup({
      providers: { oidc: { enabled: false }, ldap: { enabled: true } },
      captchaStatus: 500,
    })
    fireEvent.click(await screen.findByRole('button', { name: '目录账号' }))
    expect(await screen.findByText(/无法确认验证码状态/)).toBeTruthy()
    expect((screen.getByRole('button', { name: '目录登录' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('blocks LDAP submission when interactive captcha is enabled', async () => {
    setup({
      providers: { oidc: { enabled: false }, ldap: { enabled: true } },
      captchaEnabled: true,
    })
    fireEvent.click(await screen.findByRole('button', { name: '目录账号' }))
    expect((screen.getByRole('button', { name: '目录登录' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(screen.getByText(/交互式验证码/)).toBeTruthy()
  })

  it('clears cached account data when signing in from the login page', async () => {
    const { store } = setup()
    store.dispatch(
      panelApi.util.upsertQueryData('getMe', undefined, {
        user: { id: 9, email: 'previous@acme.local' },
        orgs: [],
      } as never),
    )
    expect(Object.keys(store.getState().panelApi.queries)).toHaveLength(1)

    fireEvent.click(await screen.findByRole('button', { name: '使用 Passkey 登录' }))
    await screen.findByText('控制台')
    expect(Object.keys(store.getState().panelApi.queries)).toHaveLength(0)
  })
})

describe('LoginPage verification resend', () => {
  type SetupOptions = NonNullable<Parameters<typeof setup>[0]>

  async function submitUnverified(options: SetupOptions = {}) {
    const result = setup({
      loginStatus: 403,
      loginBody: { code: 'email_not_verified', message: 'email is not verified' },
      ...options,
    })
    fireEvent.change(await screen.findByLabelText(/邮箱/), {
      target: { value: ' new@acme.local ' },
    })
    fireEvent.change(screen.getByLabelText(/密码/), { target: { value: 'secret-pass' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByText('邮箱尚未验证，请先完成邮件验证')).toBeTruthy()
    return result
  }

  it('resends to the trimmed address with a neutral notice', async () => {
    const { requests } = await submitUnverified()
    fireEvent.click(screen.getByRole('button', { name: '重新发送验证邮件' }))

    expect(await screen.findByText(/如果该邮箱尚未验证/)).toBeTruthy()
    const resend = requests.find((request) => request.url.endsWith('/auth/resend-verification'))
    expect(JSON.parse(resend?.body ?? '{}')).toEqual({ email: 'new@acme.local' })
    expect(screen.queryByRole('button', { name: '重新发送验证邮件' })).toBeNull()
  })

  it('reports throttling and network failures inline', async () => {
    await submitUnverified({ resendStatus: 429 })
    fireEvent.click(screen.getByRole('button', { name: '重新发送验证邮件' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('发送过于频繁')
  })

  it('reports a network failure without replacing the login error', async () => {
    await submitUnverified({ resendNetworkError: true })
    fireEvent.click(screen.getByRole('button', { name: '重新发送验证邮件' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('发送失败')
    expect(screen.getByText('邮箱尚未验证，请先完成邮件验证')).toBeTruthy()
  })

  it('maps an invalid resend address and a server failure', async () => {
    await submitUnverified({ resendStatus: 400 })
    fireEvent.click(screen.getByRole('button', { name: '重新发送验证邮件' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('邮箱格式不正确')
  })

  it('reports a resend server failure', async () => {
    await submitUnverified({ resendStatus: 500 })
    fireEvent.click(screen.getByRole('button', { name: '重新发送验证邮件' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('发送失败')
  })

  it('does not offer a resend for a wrong password', async () => {
    setup()
    fireEvent.change(await screen.findByLabelText(/邮箱/), {
      target: { value: 'new@acme.local' },
    })
    fireEvent.change(screen.getByLabelText(/密码/), { target: { value: 'wrong-pass' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByText('邮箱或密码不正确')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '重新发送验证邮件' })).toBeNull()
  })

  it('hides the resend when the mailbox or login mode changes', async () => {
    await submitUnverified({
      providers: { oidc: { enabled: false }, ldap: { enabled: true } },
    })
    fireEvent.change(screen.getByLabelText(/邮箱/), { target: { value: 'other@acme.local' } })
    expect(screen.queryByRole('button', { name: '重新发送验证邮件' })).toBeNull()
  })

  it('clears the resend entry when switching to directory login', async () => {
    await submitUnverified({
      providers: { oidc: { enabled: false }, ldap: { enabled: true } },
    })
    fireEvent.click(screen.getByRole('button', { name: '目录账号' }))
    expect(screen.queryByRole('button', { name: '重新发送验证邮件' })).toBeNull()
  })
})
