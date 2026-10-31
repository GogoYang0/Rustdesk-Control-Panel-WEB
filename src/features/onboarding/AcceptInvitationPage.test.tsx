import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AcceptInvitationPage from './AcceptInvitationPage'

vi.mock('../auth/captcha/CaptchaField', () => ({
  default: ({
    state,
    onProof,
  }: {
    state: { kind: string; generation?: number; message?: string }
    onProof: (generation: number, proof: unknown) => void
  }) => {
    if (state.kind === 'disabled') return null
    if (state.kind === 'loading') return <div>验证码加载中…</div>
    if (state.kind === 'unavailable') return <div>{state.message}</div>
    return (
      <button
        type="button"
        onClick={() => onProof(state.generation ?? 0, { response: { payload: 'test-payload' } })}
      >
        完成验证
      </button>
    )
  },
}))

const TOKEN = 'invite-token-0123456789'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function memberBody() {
  return {
    code: 'ok',
    message: 'ok',
    data: {
      id: 3,
      user_id: 4,
      email: 'invitee@acme.local',
      role: 'member',
      role_id: 5,
      role_name: '成员',
    },
  }
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function setup(
  path: string,
  options: {
    captchaEnabled?: boolean
    captchaStatus?: number
    captchaPending?: boolean
    acceptStatus?: number
    acceptBody?: unknown
    strict?: boolean
  } = {},
) {
  const requests: { url: string; body: string }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const body = typeof init?.body === 'string' ? init.body : ''
    requests.push({ url, body })
    if (url.endsWith('/auth/captcha')) {
      if (options.captchaPending) return new Promise<Response>(() => {})
      if (options.captchaStatus) {
        return json({ code: 'internal', message: 'probe failed' }, options.captchaStatus)
      }
      return json({
        code: 'ok',
        message: 'ok',
        data: options.captchaEnabled
          ? {
              enabled: true,
              provider: 'altcha',
              challenge: {
                params: { challenge: 'c1', salt: 's1', signature: 'sig1', maxNumber: 100000 },
              },
            }
          : { enabled: false },
      })
    }
    if (url.endsWith('/invitations/accept')) {
      return json(options.acceptBody ?? memberBody(), options.acceptStatus ?? 200)
    }
    return json({ code: 'ok', message: 'ok', data: null })
  })

  const ui = (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/accept-invitation"
          element={
            <>
              <AcceptInvitationPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  )
  render(options.strict ? <StrictMode>{ui}</StrictMode> : ui)
  return { requests }
}

function fill(password: string, confirm = password) {
  fireEvent.change(screen.getByPlaceholderText('至少 8 位'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText(/确认密码/), { target: { value: confirm } })
}

async function ready() {
  await screen.findByRole('button', { name: '接受邀请' })
  await waitFor(() =>
    expect((screen.getByRole('button', { name: '接受邀请' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  )
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('AcceptInvitationPage', () => {
  it('shows the invalid state without a token and sends nothing', () => {
    const { requests } = setup('/accept-invitation')

    expect(screen.getByRole('alert')).toHaveTextContent('链接不完整或无效')
    expect(requests).toHaveLength(0)
    expect(screen.queryByRole('button', { name: '接受邀请' })).toBeNull()
  })

  it('strips the token and probes captcha before showing the form', async () => {
    const { requests } = setup(`/accept-invitation?token=${TOKEN}`)

    expect(await screen.findByRole('button', { name: '接受邀请' })).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/accept-invitation$/),
    )
    expect(requests.some((request) => request.url.endsWith('/auth/captcha'))).toBe(true)
  })

  it('rejects a short password and a mismatch without calling the API', async () => {
    const { requests } = setup(`/accept-invitation?token=${TOKEN}`)
    await ready()

    fill('short')
    fireEvent.click(screen.getByRole('button', { name: '接受邀请' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('至少需要 8 个字符')

    fill('password-1', 'password-2')
    fireEvent.click(screen.getByRole('button', { name: '接受邀请' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('两次输入的密码不一致')
    expect(requests.some((request) => request.url.endsWith('/invitations/accept'))).toBe(false)
  })

  it('accepts the invitation without signing in and shows the role', async () => {
    const { requests } = setup(`/accept-invitation?token=${TOKEN}`)
    await ready()

    fill('password-1')
    fireEvent.click(screen.getByRole('button', { name: '接受邀请' }))

    expect(await screen.findByText(/已加入组织，角色：成员/)).toBeTruthy()
    expect(screen.getByText(/登录邮箱：invitee@acme.local/)).toBeTruthy()
    const accept = requests.find((request) => request.url.endsWith('/invitations/accept'))
    expect(JSON.parse(accept?.body ?? '{}')).toEqual({ token: TOKEN, password: 'password-1' })
    expect(screen.queryByRole('button', { name: '接受邀请' })).toBeNull()
    expect(localStorage.length).toBe(0)
    expect(requests.some((request) => request.url.endsWith('/api/v1/me'))).toBe(false)
    expect(screen.getByText(/不会自动登录/)).toBeTruthy()
  })

  it('keeps the token on a wrong password and clears the password fields', async () => {
    const { requests } = setup(`/accept-invitation?token=${TOKEN}`, { acceptStatus: 401 })
    await ready()

    fill('password-1')
    fireEvent.click(screen.getByRole('button', { name: '接受邀请' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('密码不正确')
    expect(alert).toHaveTextContent('Passkey')
    expect((screen.getByPlaceholderText('至少 8 位') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/确认密码/) as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('button', { name: '接受邀请' })).toBeTruthy()

    fill('password-2')
    fireEvent.click(screen.getByRole('button', { name: '接受邀请' }))
    await waitFor(() =>
      expect(
        requests.filter((request) => request.url.endsWith('/invitations/accept')),
      ).toHaveLength(2),
    )
  })

  it('drops a dead invitation token and removes the form', async () => {
    setup(`/accept-invitation?token=${TOKEN}`, { acceptStatus: 409 })
    await ready()

    fill('password-1')
    fireEvent.click(screen.getByRole('button', { name: '接受邀请' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('无效、已过期或已被使用')
    expect(screen.queryByRole('button', { name: '接受邀请' })).toBeNull()
    expect(screen.queryByPlaceholderText('至少 8 位')).toBeNull()
  })

  it('requires and sends a captcha proof when the deployment enables it', async () => {
    const { requests } = setup(`/accept-invitation?token=${TOKEN}`, { captchaEnabled: true })
    await ready()

    expect((screen.getByPlaceholderText('至少 8 位') as HTMLInputElement).disabled).toBe(false)
    fill('password-1')
    fireEvent.click(screen.getByRole('button', { name: '接受邀请' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('请先完成安全验证')
    expect(requests.some((request) => request.url.endsWith('/invitations/accept'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: '完成验证' }))
    fireEvent.click(screen.getByRole('button', { name: '接受邀请' }))
    expect(await screen.findByText(/已加入组织/)).toBeTruthy()
    const accept = requests.find((request) => request.url.endsWith('/invitations/accept'))
    expect(JSON.parse(accept?.body ?? '{}')).toEqual({
      token: TOKEN,
      password: 'password-1',
      captcha: { response: { payload: 'test-payload' } },
    })
  })

  it('refreshes the challenge after a rejected existing-account password', async () => {
    const { requests } = setup(`/accept-invitation?token=${TOKEN}`, {
      captchaEnabled: true,
      acceptStatus: 401,
    })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: '完成验证' }))
    fill('password-1')
    fireEvent.click(screen.getByRole('button', { name: '接受邀请' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('密码不正确')
    await waitFor(() =>
      expect(requests.filter((request) => request.url.endsWith('/auth/captcha'))).toHaveLength(2),
    )
  })

  it('drops a dead token without refreshing the challenge', async () => {
    const { requests } = setup(`/accept-invitation?token=${TOKEN}`, {
      captchaEnabled: true,
      acceptStatus: 409,
    })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: '完成验证' }))
    fill('password-1')
    fireEvent.click(screen.getByRole('button', { name: '接受邀请' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('无效、已过期或已被使用')
    expect(requests.filter((request) => request.url.endsWith('/auth/captcha'))).toHaveLength(1)
  })

  it('maps a server captcha answer when the challenge probe failed', async () => {
    setup(`/accept-invitation?token=${TOKEN}`, {
      captchaStatus: 503,
      acceptStatus: 400,
      acceptBody: { code: 'captcha_required', message: 'captcha is required' },
    })

    expect(await screen.findByText(/验证码服务不可用/)).toBeTruthy()
    await ready()
    fill('password-1')
    fireEvent.click(screen.getByRole('button', { name: '接受邀请' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('验证码已失效')
    expect((screen.getByRole('button', { name: '接受邀请' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

  it('keeps submit disabled while the challenge is still loading', async () => {
    const { requests } = setup(`/accept-invitation?token=${TOKEN}`, { captchaPending: true })

    expect(await screen.findByText('验证码加载中…')).toBeTruthy()
    expect((screen.getByRole('button', { name: '接受邀请' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(requests.some((request) => request.url.endsWith('/invitations/accept'))).toBe(false)
  })

  it('keeps the proof on throttling so the invitation stays retryable', async () => {
    const { requests } = setup(`/accept-invitation?token=${TOKEN}`, {
      captchaEnabled: true,
      acceptStatus: 429,
      acceptBody: { code: 'rate_limited', message: 'too many attempts' },
    })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: '完成验证' }))
    fill('password-1')
    fireEvent.click(screen.getByRole('button', { name: '接受邀请' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('频繁')
    expect((screen.getByPlaceholderText('至少 8 位') as HTMLInputElement).value).toBe('password-1')
    expect(requests.filter((request) => request.url.endsWith('/auth/captcha'))).toHaveLength(1)
    expect((screen.getByRole('button', { name: '接受邀请' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

  it('does not submit automatically under StrictMode', async () => {
    const { requests } = setup(`/accept-invitation?token=${TOKEN}`, { strict: true })
    await screen.findByRole('button', { name: '接受邀请' })
    await waitFor(() =>
      expect(requests.some((request) => request.url.endsWith('/auth/captcha'))).toBe(true),
    )
    expect(requests.some((request) => request.url.endsWith('/invitations/accept'))).toBe(false)
  })
})
