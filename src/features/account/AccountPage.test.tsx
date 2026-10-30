import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import AccountPage from './AccountPage'

const webauthnMock = vi.hoisted(() => ({
  supported: true,
  assert: vi.fn(),
  create: vi.fn(),
}))

vi.mock('../../lib/webauthn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/webauthn')>()
  return {
    ...actual,
    webAuthnSupported: () => webauthnMock.supported,
    assertPasskeyCredential: webauthnMock.assert,
    createPasskeyCredential: webauthnMock.create,
  }
})

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function passkey(id: number, name: string) {
  return {
    id,
    name,
    created_at: '2026-10-30T05:00:00Z',
    last_used_at: null,
    transports: ['internal'],
    backup_eligible: true,
    backup_state: false,
    aaguid: 'test',
    clone_warning: false,
  }
}

interface SetupOptions {
  totpEnabled?: boolean
  hasPassword?: boolean
  passkeys?: ReturnType<typeof passkey>[]
  passkeysStatus?: number
  initialPath?: string
}

function setup(options: SetupOptions = {}) {
  const user = {
    id: 1,
    email: 'owner@acme.local',
    email_verified: true,
    totp_enabled: options.totpEnabled ?? false,
    has_password: options.hasPassword ?? true,
  }
  let passkeyRows = options.passkeys ?? [passkey(1, 'MacBook'), passkey(2, 'Phone')]
  const requests: { method: string; url: string; body: string }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = String(init?.method ?? 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? init.body : ''
    requests.push({ method, url, body })
    if (url.endsWith('/me')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: {
          user,
          orgs: [{ id: 1, name: 'ACME', role_id: 1, role_kind: 'owner', permissions: [] }],
        },
      })
    }
    if (url.endsWith('/auth/passkeys') && method === 'GET') {
      if (options.passkeysStatus) {
        return json({ code: 'internal', message: 'disabled' }, options.passkeysStatus)
      }
      return json({
        code: 'ok',
        message: 'ok',
        data: {
          items: passkeyRows,
          has_password: user.has_password,
          totp_enabled: user.totp_enabled,
        },
      })
    }
    if (url.includes('/auth/tokens?')) {
      return json({ code: 'ok', message: 'ok', data: [] })
    }
    if (url.endsWith('/auth/identity')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: { active_provider: 'oidc', identities: [] },
      })
    }
    if (url.endsWith('/auth/2fa/setup')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: {
          secret: 'JBSWY3DPEHPK3PXP',
          otpauth_uri: 'otpauth://totp/ACME:owner?secret=JBSWY3DPEHPK3PXP',
        },
      })
    }
    if (url.endsWith('/auth/2fa/enable')) {
      user.totp_enabled = true
      return json({ code: 'ok', message: 'ok', data: null })
    }
    if (url.endsWith('/auth/2fa/disable')) {
      user.totp_enabled = false
      return json({ code: 'ok', message: 'ok', data: null })
    }
    if (url.endsWith('/auth/2fa/recovery-codes')) {
      return json({ code: 'ok', message: 'ok', data: { codes: ['alpha', 'bravo'] } })
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
    if (url.endsWith('/auth/password/set')) {
      user.has_password = true
      return json({ code: 'ok', message: 'ok', data: null })
    }
    if (url.endsWith('/auth/password/remove')) {
      user.has_password = false
      return json({
        code: 'ok',
        message: 'ok',
        data: {
          warnings: [
            'compat_login_disabled',
            'keep_a_second_passkey',
            'accept_invitation_requires_password',
          ],
        },
      })
    }
    if (url.endsWith('/auth/passkey/register/begin')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: { ceremony_token: 'reg-ceremony', options: { publicKey: { challenge: 'AAAA' } } },
      })
    }
    if (url.endsWith('/auth/passkey/register/finish')) {
      const created = passkey(3, 'New Key')
      passkeyRows = [...passkeyRows, created]
      return json({ code: 'ok', message: 'ok', data: created }, 201)
    }
    if (url.match(/\/auth\/passkeys\/\d+$/) && method === 'PATCH') {
      const id = Number(url.match(/passkeys\/(\d+)/)?.[1])
      const parsed = JSON.parse(body) as { name: string }
      passkeyRows = passkeyRows.map((row) => (row.id === id ? { ...row, name: parsed.name } : row))
      return json({ code: 'ok', message: 'ok', data: passkeyRows.find((row) => row.id === id) })
    }
    if (url.match(/\/auth\/passkeys\/\d+$/) && method === 'DELETE') {
      const id = Number(url.match(/passkeys\/(\d+)/)?.[1])
      if (passkeyRows.length === 1 && !user.has_password) {
        return json({ code: 'conflict', message: 'cannot delete the last passkey' }, 409)
      }
      passkeyRows = passkeyRows.filter((row) => row.id !== id)
      return json({ code: 'ok', message: 'ok', data: null })
    }
    return json({ code: 'ok', message: 'ok', data: null })
  })

  webauthnMock.assert.mockResolvedValue({
    id: 'cred',
    rawId: 'cred',
    type: 'public-key',
    response: { clientDataJSON: 'x', authenticatorData: 'x', signature: 'x', userHandle: null },
  })
  webauthnMock.create.mockResolvedValue({
    id: 'cred',
    rawId: 'cred',
    type: 'public-key',
    response: { clientDataJSON: 'x', attestationObject: 'x', transports: ['internal'] },
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
      <MemoryRouter initialEntries={[options.initialPath ?? '/orgs/1/account']}>
        <Routes>
          <Route
            path="/orgs/:orgId/account"
            element={
              <>
                <AccountPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
  return { requests, user, getPasskeys: () => passkeyRows }
}

beforeEach(() => {
  webauthnMock.supported = true
  webauthnMock.assert.mockReset()
  webauthnMock.create.mockReset()
})

afterEach(() => vi.restoreAllMocks())

describe('AccountPage', () => {
  it('renders account-level credentials without an organization permission gate', async () => {
    const { requests } = setup()
    expect(await screen.findByText(/owner@acme.local/)).toBeTruthy()
    expect(await screen.findByText('MacBook')).toBeTruthy()
    expect(screen.getByTestId('totp-card').textContent).toContain('未启用')
    expect(screen.getByTestId('password-card').textContent).toContain('已设置')
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs).toHaveLength(3)
    expect((tabs[1] as HTMLButtonElement).disabled).toBe(false)
    expect((tabs[2] as HTMLButtonElement).disabled).toBe(false)
    for (const item of tabs) expect(item.getAttribute('aria-controls')).toBe('account-panel')
    expect(requests.some((request) => request.url.endsWith('/me'))).toBe(true)
    expect(requests.some((request) => request.url.endsWith('/members'))).toBe(false)
  })

  it('deep-links to the token and identity tabs and switches back', async () => {
    setup({ initialPath: '/orgs/1/account?tab=tokens' })
    expect(await screen.findByTestId('token-card')).toBeTruthy()
    expect(screen.queryByTestId('totp-card')).toBeNull()
    expect(screen.getByRole('tab', { name: '个人 API Token' }).getAttribute('aria-selected')).toBe(
      'true',
    )

    expect(screen.getByTestId('location').textContent).toBe('/orgs/1/account?tab=tokens')

    fireEvent.click(screen.getByRole('tab', { name: '外部身份' }))
    expect(await screen.findByTestId('identity-card')).toBeTruthy()
    expect(screen.queryByTestId('token-card')).toBeNull()
    expect(screen.getByTestId('location').textContent).toBe('/orgs/1/account?tab=identities')

    fireEvent.click(screen.getByRole('tab', { name: '登录凭据' }))
    expect(await screen.findByTestId('totp-card')).toBeTruthy()
    expect(screen.queryByTestId('identity-card')).toBeNull()
    expect(screen.getByTestId('location').textContent).toBe('/orgs/1/account')
  })

  it('explains an unsupported browser on the identity tab', async () => {
    webauthnMock.supported = false
    setup({ hasPassword: false, initialPath: '/orgs/1/account?tab=identities' })
    expect(await screen.findByTestId('identity-card')).toBeTruthy()
    expect(await screen.findByText(/当前浏览器不支持 Passkey/)).toBeTruthy()
  })

  it('falls back to credentials for an unknown tab parameter', async () => {
    setup({ initialPath: '/orgs/1/account?tab=wat' })
    expect(await screen.findByTestId('totp-card')).toBeTruthy()
    expect(screen.queryByTestId('token-card')).toBeNull()
  })

  it('starts TOTP enrollment, copies the secret and verifies the first code', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const { requests, user } = setup()
    await screen.findByText('MacBook')
    fireEvent.click(screen.getByRole('button', { name: '启用两步验证' }))
    const dialog = await screen.findByRole('dialog', { name: '启用两步验证' })
    expect(within(dialog).getByTestId('totp-secret').textContent).toContain('JBSWY3DPEHPK3PXP')
    fireEvent.click(within(dialog).getByRole('button', { name: '复制秘密' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('JBSWY3DPEHPK3PXP'))
    fireEvent.click(within(dialog).getByRole('button', { name: '复制 URI' }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('otpauth://totp/ACME:owner?secret=JBSWY3DPEHPK3PXP'),
    )
    fireEvent.change(within(dialog).getByLabelText('首个动态码'), { target: { value: '123456' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '验证并启用' }))
    await waitFor(() => expect(user.totp_enabled).toBe(true))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByTestId('totp-card').textContent).not.toContain('已留下待启用配置')
    const enable = requests.find((request) => request.url.endsWith('/auth/2fa/enable'))
    expect(JSON.parse(enable?.body ?? '{}')).toEqual({ code: '123456' })
    await waitFor(() => expect(screen.getByTestId('totp-card').textContent).toContain('已启用'))
  })

  it('blocks TOTP for passkey-only accounts and sets a password through step-up', async () => {
    setup({ hasPassword: false })
    await screen.findByText('MacBook')
    const totpButton = screen.getByRole('button', { name: '启用两步验证' }) as HTMLButtonElement
    expect(totpButton.disabled).toBe(true)
    expect(screen.getByTestId('totp-card').textContent).toContain('passkey-only')

    fireEvent.click(screen.getByRole('button', { name: '设置本地密码' }))
    const dialog = await screen.findByRole('dialog', { name: '设置本地密码' })
    fireEvent.change(within(dialog).getByLabelText('新密码'), { target: { value: 'short' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '设置' }))
    expect(within(dialog).getByText('新密码至少 8 个字符')).toBeTruthy()

    fireEvent.change(within(dialog).getByLabelText('新密码'), { target: { value: 'long-enough' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '设置' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(webauthnMock.assert).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByTestId('password-card').textContent).toContain('已设置'))
  })

  it('keeps password removal disabled until the account has two passkeys and no TOTP', async () => {
    setup({ passkeys: [passkey(1, 'Only')] })
    await screen.findByText('Only')
    expect(
      (screen.getByRole('button', { name: '删除本地密码' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByTestId('password-card').textContent).toContain('当前 1 个')
  })

  it('keeps password removal disabled while TOTP is enabled', async () => {
    setup({ totpEnabled: true })
    await screen.findByText('MacBook')
    expect(
      (screen.getByRole('button', { name: '删除本地密码' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByTestId('password-card').textContent).toContain('请先停用两步验证')
  })

  it('removes the password with step-up and explains the consequences', async () => {
    const { requests, user } = setup()
    await screen.findByText('MacBook')
    fireEvent.click(screen.getByRole('button', { name: '删除本地密码' }))
    const dialog = await screen.findByRole('dialog', { name: '删除本地密码' })
    fireEvent.change(within(dialog).getByLabelText('当前密码'), { target: { value: 'secret-123' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))
    await waitFor(() => expect(user.has_password).toBe(false))
    const warning = await screen.findByRole('dialog', { name: '本地密码已删除' })
    expect(within(warning).getByText(/compat/)).toBeTruthy()
    expect(within(warning).getByText(/遗失全部 Passkey/)).toBeTruthy()
    expect(webauthnMock.assert).toHaveBeenCalledTimes(1)
    expect(requests.some((request) => request.url.endsWith('/auth/passkey/stepup/finish'))).toBe(
      true,
    )
    const remove = requests.find((request) => request.url.endsWith('/auth/password/remove'))
    expect(JSON.parse(remove?.body ?? '{}')).toMatchObject({
      password: 'secret-123',
      stepup_token: 'step-token',
    })
  })

  it('shows a disabled passkey card when the deployment lacks WebAuthn', async () => {
    setup({ passkeysStatus: 503 })
    await waitFor(() =>
      expect(screen.getByTestId('passkey-card').textContent).toContain('当前部署未启用 Passkey'),
    )
    expect(
      (screen.getByRole('button', { name: '添加 Passkey' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: '删除本地密码' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByTestId('password-card').textContent).toContain('Passkey 列表不可用')
  })

  it('registers a passkey with the standard serialized credential', async () => {
    const { requests } = setup({ passkeys: [] })
    await screen.findByRole('button', { name: '添加 Passkey' })
    fireEvent.click(screen.getByRole('button', { name: '添加 Passkey' }))
    const dialog = await screen.findByRole('dialog', { name: '添加 Passkey' })
    fireEvent.change(within(dialog).getByLabelText('名称（可选）'), {
      target: { value: 'New Key' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '开始注册' }))
    await screen.findByText('New Key')
    const finish = requests.find((request) => request.url.endsWith('/auth/passkey/register/finish'))
    const payload = JSON.parse(finish?.body ?? '{}') as {
      ceremony_token: string
      name: string
      credential: {
        id: string
        rawId: string
        type: string
        response: { attestationObject: string; clientDataJSON: string; transports: string[] }
      }
    }
    expect(payload.ceremony_token).toBe('reg-ceremony')
    expect(payload.name).toBe('New Key')
    expect(payload.credential).toMatchObject({
      id: 'cred',
      rawId: 'cred',
      type: 'public-key',
      response: {
        clientDataJSON: 'x',
        attestationObject: 'x',
        transports: ['internal'],
      },
    })
  })

  it('explains a refused last-passkey delete instead of exposing the backend message', async () => {
    setup({ hasPassword: false, passkeys: [passkey(1, 'Only')] })
    await screen.findByText('Only')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    const dialog = await screen.findByRole('dialog', { name: /删除 Passkey/ })
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))
    expect(
      await within(dialog).findByText('无本地密码且这是最后一个 Passkey，不能删除'),
    ).toBeTruthy()
  })

  it('disables password removal when the browser cannot do WebAuthn', async () => {
    webauthnMock.supported = false
    setup()
    await screen.findByText('MacBook')
    expect(
      (screen.getByRole('button', { name: '删除本地密码' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByTestId('password-card').textContent).toContain('不支持 Passkey')
    expect(
      (screen.getByRole('button', { name: '添加 Passkey' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('disables TOTP with password and code and shows the new state', async () => {
    const { requests, user } = setup({ totpEnabled: true })
    await screen.findByText('MacBook')
    fireEvent.click(screen.getByRole('button', { name: '停用' }))
    const dialog = await screen.findByRole('dialog', { name: '停用两步验证' })
    fireEvent.change(within(dialog).getByLabelText('当前密码'), { target: { value: 'secret-123' } })
    fireEvent.change(within(dialog).getByLabelText('动态码或恢复码'), {
      target: { value: '654321' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '停用' }))
    await waitFor(() => expect(user.totp_enabled).toBe(false))
    await waitFor(() => expect(screen.getByTestId('totp-card').textContent).toContain('未启用'))
    const disable = requests.find((request) => request.url.endsWith('/auth/2fa/disable'))
    expect(JSON.parse(disable?.body ?? '{}')).toEqual({
      password: 'secret-123',
      code: '654321',
    })
  })

  it('regenerates recovery codes and shows them once', async () => {
    const { requests } = setup({ totpEnabled: true })
    await screen.findByText('MacBook')
    fireEvent.click(screen.getByRole('button', { name: '恢复码' }))
    const dialog = await screen.findByRole('dialog', { name: '重新生成恢复码' })
    fireEvent.change(within(dialog).getByLabelText('当前密码'), { target: { value: 'secret-123' } })
    fireEvent.change(within(dialog).getByLabelText('动态码或恢复码'), {
      target: { value: '123456' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '生成' }))
    const codes = await screen.findByTestId('recovery-codes')
    expect(codes.textContent).toContain('alpha')
    expect(codes.textContent).toContain('bravo')
    expect(requests.some((request) => request.url.endsWith('/auth/2fa/recovery-codes'))).toBe(true)
  })

  it('keeps a visible pending warning after cancelling TOTP setup', async () => {
    setup()
    await screen.findByText('MacBook')
    fireEvent.click(screen.getByRole('button', { name: '启用两步验证' }))
    const dialog = await screen.findByRole('dialog', { name: '启用两步验证' })
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByTestId('totp-card').textContent).toContain('已留下待启用配置')
    expect(
      (screen.getByRole('button', { name: '删除本地密码' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByTestId('password-card').textContent).toContain('待启用的 TOTP 配置')
  })

  it('renames a passkey and refreshes the list', async () => {
    const { requests } = setup()
    await screen.findByText('MacBook')
    const row = screen.getByText('MacBook').closest('tr')
    expect(row).not.toBeNull()
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '重命名' }))
    const dialog = await screen.findByRole('dialog', { name: '重命名 Passkey' })
    fireEvent.change(within(dialog).getByLabelText('名称'), { target: { value: 'Work Mac' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(await screen.findByText('Work Mac')).toBeTruthy()
    const patch = requests.find(
      (request) => request.method === 'PATCH' && request.url.includes('/auth/passkeys/1'),
    )
    expect(JSON.parse(patch?.body ?? '{}')).toEqual({ name: 'Work Mac' })
  })
})
