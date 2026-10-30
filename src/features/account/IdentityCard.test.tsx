import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import IdentityCard from './IdentityCard'

const webauthnMock = vi.hoisted(() => ({
  assert: vi.fn(),
}))

vi.mock('../../lib/webauthn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/webauthn')>()
  return {
    ...actual,
    assertPasskeyCredential: webauthnMock.assert,
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function identity(id: number, provider: 'oidc' | 'ldap', overrides: Record<string, unknown> = {}) {
  return {
    id,
    provider,
    issuer: provider === 'oidc' ? 'https://idp.example.com' : 'ldap://directory.example.com',
    subject: `subject-${id}`,
    email: `${provider}${id}@acme.local`,
    linked_at: '2026-10-01T00:00:00Z',
    last_login_at: '2026-10-29T00:00:00Z',
    conflict_at: null,
    ...overrides,
  }
}

function setup(
  options: {
    identities?: ReturnType<typeof identity>[]
    listStatus?: number
    unlinkStatus?: number
    hasPassword?: boolean
    canStepup?: boolean
    stepupReason?: string
  } = {},
) {
  let rows = options.identities ?? [identity(1, 'oidc'), identity(2, 'ldap')]
  let failNextList = false
  const requests: { method: string; url: string; body: string }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = String(init?.method ?? 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? init.body : ''
    requests.push({ method, url, body })
    if (url.endsWith('/auth/identity') && method === 'GET') {
      if (failNextList) {
        failNextList = false
        return json({ code: 'internal', message: 'refresh failed' }, 500)
      }
      if (options.listStatus) {
        return json({ code: 'internal', message: 'disabled' }, options.listStatus)
      }
      return json({
        code: 'ok',
        message: 'ok',
        data: { active_provider: 'oidc', identities: rows },
      })
    }
    if (url.endsWith('/auth/identity/unlink')) {
      if (options.unlinkStatus) {
        return json({ code: 'error', message: 'rejected' }, options.unlinkStatus)
      }
      const parsed = JSON.parse(body) as { identity_id: number }
      rows = rows.filter((row) => row.id !== parsed.identity_id)
      return json({ code: 'ok', message: 'ok', data: null })
    }
    if (url.endsWith('/auth/passkey/stepup/begin')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: { ceremony_token: 'step-ceremony', options: { publicKey: { challenge: 'AAAA' } } },
      })
    }
    if (url.endsWith('/auth/passkey/stepup/finish')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: { stepup_token: 'step-token', expires_in: 120 },
      })
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
      <IdentityCard
        hasPassword={options.hasPassword ?? true}
        canStepup={options.canStepup ?? true}
        stepupReason={options.stepupReason ?? '账户没有可用的 Passkey'}
      />
    </Provider>,
  )
  return {
    requests,
    store,
    getRows: () => rows,
    failNextList: () => {
      failNextList = true
    },
  }
}

beforeEach(() => {
  webauthnMock.assert.mockReset()
})

afterEach(() => vi.restoreAllMocks())

describe('IdentityCard', () => {
  it('lists bindings, the active provider and conflict warnings', async () => {
    setup({
      identities: [
        identity(1, 'oidc', { conflict_at: '2026-10-20T00:00:00Z' }),
        identity(2, 'ldap'),
      ],
    })
    expect(await screen.findByText('当前身份源：OIDC')).toBeTruthy()
    expect(screen.getByText('https://idp.example.com')).toBeTruthy()
    expect(screen.getByText('ldap://directory.example.com')).toBeTruthy()
    expect(screen.getByText(/SSO 已拒绝该绑定/)).toBeTruthy()
    const oidcRow = screen.getByText('https://idp.example.com').closest('tr') as HTMLElement
    expect(within(oidcRow).getByText('OIDC')).toBeTruthy()
  })

  it('shows 503 as disabled, not as an empty list', async () => {
    setup({ listStatus: 503 })
    expect(await screen.findByText('外部身份未启用。')).toBeTruthy()
    expect(screen.queryByText('还没有外部身份绑定。')).toBeNull()
  })

  it('unlinks with the current password by default', async () => {
    const { requests, store } = setup()
    await screen.findByText('https://idp.example.com')
    const row = screen.getByText('https://idp.example.com').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '解绑' }))
    const dialog = await screen.findByRole('dialog', { name: '解绑 OIDC 身份' })
    fireEvent.change(within(dialog).getByLabelText('当前密码'), {
      target: { value: 'secret-pass' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '解绑' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByText('https://idp.example.com')).toBeNull()
    const unlink = requests.find((request) => request.url.endsWith('/auth/identity/unlink'))
    expect(JSON.parse(unlink?.body ?? '{}')).toEqual({
      identity_id: 1,
      password: 'secret-pass',
    })
    expect(JSON.stringify(store.getState())).not.toContain('secret-pass')
  })

  it('unlinks with a passkey step-up when the account has no password', async () => {
    const { requests, store } = setup({ hasPassword: false, canStepup: true })
    await screen.findByText('https://idp.example.com')
    const row = screen.getByText('https://idp.example.com').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '解绑' }))
    const dialog = await screen.findByRole('dialog', { name: '解绑 OIDC 身份' })
    expect(within(dialog).getByText(/提交时会要求使用 Passkey/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '解绑' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(webauthnMock.assert).toHaveBeenCalledTimes(1)
    const unlink = requests.find((request) => request.url.endsWith('/auth/identity/unlink'))
    expect(JSON.parse(unlink?.body ?? '{}')).toEqual({
      identity_id: 1,
      stepup_token: 'step-token',
    })
    expect(JSON.stringify(store.getState())).not.toContain('step-token')
    expect(document.body.textContent).not.toContain('step-token')
    expect(JSON.stringify(localStorage)).not.toContain('step-token')
  })

  it('reports a wrong password without closing the dialog', async () => {
    setup({ unlinkStatus: 401 })
    await screen.findByText('https://idp.example.com')
    const row = screen.getByText('https://idp.example.com').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '解绑' }))
    const dialog = await screen.findByRole('dialog', { name: '解绑 OIDC 身份' })
    fireEvent.change(within(dialog).getByLabelText('当前密码'), {
      target: { value: 'wrong' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '解绑' }))
    expect(await within(dialog).findByText('密码或 Passkey 验证不正确')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: '解绑 OIDC 身份' })).toBeTruthy()
  })

  it('explains that the only credential cannot be unlinked', async () => {
    setup({ unlinkStatus: 409 })
    await screen.findByText('https://idp.example.com')
    const row = screen.getByText('https://idp.example.com').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '解绑' }))
    const dialog = await screen.findByRole('dialog', { name: '解绑 OIDC 身份' })
    fireEvent.change(within(dialog).getByLabelText('当前密码'), {
      target: { value: 'secret-pass' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '解绑' }))
    expect(await within(dialog).findByText(/该绑定是唯一登录通道/)).toBeTruthy()
  })

  it('keeps the cached list visible with a retry after a refresh failure', async () => {
    const { store, failNextList } = setup()
    await screen.findByText('https://idp.example.com')
    failNextList()
    store.dispatch(panelApi.util.invalidateTags(['Identities']))
    expect(await screen.findByText(/外部身份刷新失败/)).toBeTruthy()
    expect(screen.getByText('https://idp.example.com')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.queryByText(/外部身份刷新失败/)).toBeNull())
    expect(screen.getByText('https://idp.example.com')).toBeTruthy()
  })

  it('disables unlink when no proof method exists', async () => {
    setup({
      hasPassword: false,
      canStepup: false,
      stepupReason: '当前浏览器不支持 Passkey，或页面不在安全上下文',
    })
    await screen.findByText('https://idp.example.com')
    const row = screen.getByText('https://idp.example.com').closest('tr') as HTMLElement
    expect((within(row).getByRole('button', { name: '解绑' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(screen.getByText(/无法解绑外部身份/)).toBeTruthy()
    expect(screen.getByText(/当前浏览器不支持 Passkey/)).toBeTruthy()
  })
})
