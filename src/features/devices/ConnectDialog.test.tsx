import { configureStore } from '@reduxjs/toolkit'
import { Toast } from '@douyinfe/semi-ui'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Device } from '../../lib/api'
import { panelApi } from '../../store/api'
import ConnectDialog from './ConnectDialog'

const device: Device = {
  id: 5,
  name: '设计机',
  rustdesk_id: '123456789',
  status: 'offline',
  last_seen_at: null,
  bound: true,
  disabled: false,
  device_group_id: null,
}

const now = Date.now()

function ticket(overrides: Record<string, unknown> = {}) {
  return {
    id: 21,
    organization_id: 1,
    device_id: 5,
    control_permissions: 0,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + 300_000).toISOString(),
    ...overrides,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface Reply {
  status?: number
  body: unknown
}

interface SetupOptions {
  replies?: Reply[]
  token?: string
  ticketOverrides?: Record<string, unknown>
  deferred?: boolean
}

function setup({
  replies,
  token = 'tok_secret_123',
  ticketOverrides = {},
  deferred = false,
}: SetupOptions = {}) {
  const bodies: string[] = []
  const queue: Reply[] = replies
    ? [...replies]
    : [
        {
          status: 201,
          body: { code: 'ok', message: 'ok', data: { ticket: ticket(ticketOverrides), token } },
        },
      ]
  let release = () => {}
  const gate = deferred
    ? new Promise<void>((resolve) => {
        release = resolve
      })
    : Promise.resolve()
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input).endsWith('/tickets')) {
      bodies.push(String(init?.body ?? ''))
      await gate
      const reply = queue.shift()
      if (!reply) return json({ code: 'internal', message: 'no reply' }, 500)
      return json(reply.body, reply.status ?? 200)
    }
    return json({ code: 'ok', message: 'ok', data: null })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  const onClose = vi.fn()
  const view = render(
    <Provider store={store}>
      <MemoryRouter>
        <ConnectDialog orgId={1} device={device} onClose={onClose} />
      </MemoryRouter>
    </Provider>,
  )
  return { bodies, store, onClose, release: () => release(), unmount: view.unmount }
}

function jsonData(body: unknown) {
  return { body }
}

describe('ConnectDialog', () => {
  const clipboard = { writeText: vi.fn() }
  beforeEach(() => {
    localStorage.clear()
    clipboard.writeText.mockReset()
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard },
      configurable: true,
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('issues with the default TTL and shows the token once', async () => {
    const { bodies, store } = setup()
    fireEvent.click(await screen.findByRole('button', { name: '签发票据' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(JSON.parse(bodies[0])).toEqual({ device_id: 5, ttl_seconds: 300 })

    const pre = await screen.findByTestId('ticket-plaintext')
    expect(pre.textContent).toBe('tok_secret_123')
    expect(screen.getByText(/剩余 4:5\d|剩余 5:00/)).toBeTruthy()
    expect(JSON.stringify(store.getState())).not.toContain('tok_secret_123')
    expect(JSON.stringify(localStorage)).not.toContain('tok_secret_123')
  })

  it('copies without putting the token into the toast', async () => {
    setup()
    const success = vi.spyOn(Toast, 'success')
    fireEvent.click(await screen.findByRole('button', { name: '签发票据' }))
    await screen.findByTestId('ticket-plaintext')
    fireEvent.click(screen.getByRole('button', { name: '复制令牌' }))
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith('tok_secret_123'))
    await waitFor(() => expect(success).toHaveBeenCalledWith('令牌已复制'))
    expect(JSON.stringify(success.mock.calls)).not.toContain('tok_secret_123')
  })

  it('cannot be dismissed by Escape or the mask while the token is shown', async () => {
    const { onClose } = setup()
    fireEvent.click(await screen.findByRole('button', { name: '签发票据' }))
    await screen.findByTestId('ticket-plaintext')
    fireEvent.keyDown(document, { key: 'Escape' })
    const mask = document.querySelector('.mask')
    expect(mask).toBeTruthy()
    fireEvent.click(mask as Element)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '我已保存' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('drops the token on unmount', async () => {
    const { unmount } = setup()
    fireEvent.click(await screen.findByRole('button', { name: '签发票据' }))
    await screen.findByTestId('ticket-plaintext')
    unmount()
    expect(document.body.textContent).not.toContain('tok_secret_123')
  })

  it('sends the selected TTL', async () => {
    const { bodies } = setup()
    fireEvent.change(await screen.findByLabelText('票据有效期'), { target: { value: '900' } })
    fireEvent.click(screen.getByRole('button', { name: '签发票据' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(JSON.parse(bodies[0])).toEqual({ device_id: 5, ttl_seconds: 900 })
  })

  it('shows the approval stage and retries after approval', async () => {
    const { bodies } = setup({
      replies: [
        {
          status: 409,
          body: {
            code: 'approval_required',
            message: 'approval required',
            data: { approval_id: 7 },
          },
        },
        jsonData({ code: 'ok', message: 'ok', data: { ticket: ticket(), token: 'tok_second' } }),
      ],
    })
    fireEvent.click(await screen.findByRole('button', { name: '签发票据' }))
    const approval = await screen.findByTestId('ticket-approval')
    expect(approval.textContent).toContain('#7')
    const link = screen.getByRole('link', { name: '查看审批请求' }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/orgs/1/approvals?approvalId=7')

    fireEvent.click(screen.getByRole('button', { name: '重试签发' }))
    expect((await screen.findByTestId('ticket-plaintext')).textContent).toBe('tok_second')
    expect(bodies).toHaveLength(2)
  })

  it('maps a conflict without leaving the form', async () => {
    setup({
      replies: [{ status: 409, body: { code: 'conflict', message: 'outside window', data: null } }],
    })
    fireEvent.click(await screen.findByRole('button', { name: '签发票据' }))
    expect((await screen.findByRole('alert')).textContent).toContain('审批已失效')
    expect(screen.getByRole('button', { name: '签发票据' })).toBeTruthy()
  })

  it('does not close while the request is in flight', async () => {
    const { onClose, release } = setup({ deferred: true })
    fireEvent.click(await screen.findByRole('button', { name: '签发票据' }))
    await screen.findByRole('button', { name: '签发中…' })
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onClose).not.toHaveBeenCalled()
    release()
    expect(await screen.findByTestId('ticket-plaintext')).toBeTruthy()
  })

  it('labels an expired token instead of pretending it is usable', async () => {
    setup({ ticketOverrides: { expires_at: new Date(now - 1000).toISOString() } })
    fireEvent.click(await screen.findByRole('button', { name: '签发票据' }))
    await screen.findByTestId('ticket-plaintext')
    expect(screen.getByText('令牌已失效，请重新签发。')).toBeTruthy()
    expect(screen.getAllByText('已过期').length).toBeGreaterThan(0)
  })
})
