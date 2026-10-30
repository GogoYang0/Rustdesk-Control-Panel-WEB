import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearSession, getRefreshToken } from '../../lib/session'
import { panelApi } from '../../store/api'
import LoginPage from './LoginPage'

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
  } = {},
) {
  const requests: { url: string; body: string }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const body = typeof init?.body === 'string' ? init.body : ''
    requests.push({ url, body })
    if (url.endsWith('/auth/captcha')) {
      return json({ code: 'ok', message: 'ok', data: { enabled: false } })
    }
    if (url.endsWith('/auth/providers')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: { oidc: { enabled: false }, ldap: { enabled: false } },
      })
    }
    if (url.endsWith('/auth/login')) {
      return json(
        options.loginBody ?? { code: 'unauthorized', message: 'invalid credentials' },
        options.loginStatus ?? 401,
      )
    }
    if (url.endsWith('/auth/2fa/verify')) {
      return json(tokenPair())
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
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>控制台</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
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
