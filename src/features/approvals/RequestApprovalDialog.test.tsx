import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import RequestApprovalDialog from './RequestApprovalDialog'

const now = new Date().toISOString()

function approval(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    organization_id: 1,
    device_id: 5,
    kind: 'pre_approval',
    status: 'pending',
    requested_at: now,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    ...overrides,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface SetupOptions {
  kind?: 'pre_approval' | 'ratification'
  status?: number
  code?: string
  result?: Record<string, unknown>
  deferred?: boolean
}

function setup({
  kind = 'pre_approval',
  status = 200,
  code = 'ok',
  result,
  deferred = false,
}: SetupOptions = {}) {
  const bodies: string[] = []
  let release = () => {}
  const gate = deferred
    ? new Promise<void>((resolve) => {
        release = resolve
      })
    : Promise.resolve()
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input).includes('/approvals')) {
      bodies.push(String(init?.body ?? ''))
      await gate
      if (status >= 400) {
        return json({ code, message: 'backend english', data: null }, status)
      }
      return json({ code: 'ok', message: 'ok', data: result ?? approval({ kind }) }, status)
    }
    return json({ code: 'ok', message: 'ok', data: null })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  const onClose = vi.fn()
  render(
    <Provider store={store}>
      <MemoryRouter>
        <RequestApprovalDialog
          orgId={1}
          kind={kind}
          device={{ id: 5, name: '设计机', rustdesk_id: '123456789' }}
          session={{ id: 7, deviceName: '设计机', startedAt: now }}
          onClose={onClose}
        />
      </MemoryRouter>
    </Provider>,
  )
  return { bodies, onClose, release: () => release() }
}

describe('RequestApprovalDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: vi.fn() } },
      configurable: true,
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('submits a pre-approval without a reason and links to the request', async () => {
    const { bodies } = setup()
    fireEvent.click(await screen.findByRole('button', { name: '提交审批' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(JSON.parse(bodies[0])).toEqual({ kind: 'pre_approval', device_id: 5 })

    const result = await screen.findByTestId('approval-request-result')
    expect(result.textContent).toContain('#9')
    expect(result.textContent).toContain('待审批')
    const link = screen.getByTestId('approval-request-link') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/orgs/1/approvals?approvalId=9')
  })

  it('submits a ratification for the session only, with a trimmed reason', async () => {
    const { bodies } = setup({
      kind: 'ratification',
      result: approval({ kind: 'ratification', session_id: 7 }),
    })
    fireEvent.change(await screen.findByLabelText('申请理由'), {
      target: { value: '  补记录  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '提交审批' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(JSON.parse(bodies[0])).toEqual({
      kind: 'ratification',
      session_id: 7,
      reason: '补记录',
    })
    expect(JSON.parse(bodies[0])).not.toHaveProperty('device_id')
    expect(await screen.findByTestId('approval-request-result')).toBeTruthy()
  })

  it('shows the approved wording when a ratification is reused', async () => {
    setup({
      kind: 'ratification',
      result: approval({ kind: 'ratification', session_id: 7, status: 'approved' }),
    })
    fireEvent.click(await screen.findByRole('button', { name: '提交审批' }))
    expect(await screen.findByText('该会话已追认')).toBeTruthy()
    expect(screen.queryByText(/截止/)).toBeNull()
  })

  it('rejects a reason above 500 code points without a request', async () => {
    const { bodies } = setup()
    fireEvent.change(await screen.findByLabelText('申请理由'), {
      target: { value: '维'.repeat(501) },
    })
    fireEvent.click(screen.getByRole('button', { name: '提交审批' }))
    expect((await screen.findByRole('alert')).textContent).toContain('500')
    expect(bodies).toHaveLength(0)
  })

  it('submits only once when the button is clicked twice', async () => {
    const { bodies } = setup()
    const button = await screen.findByRole('button', { name: '提交审批' })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(bodies).toHaveLength(1))
  })

  it('cannot be dismissed while the request is in flight', async () => {
    const { onClose, release } = setup({ deferred: true })
    fireEvent.click(await screen.findByRole('button', { name: '提交审批' }))
    await screen.findByRole('button', { name: '提交中…' })
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onClose).not.toHaveBeenCalled()
    release()
    expect(await screen.findByTestId('approval-request-result')).toBeTruthy()
  })

  it('maps the ratification-specific 400 without leaking backend text', async () => {
    setup({ kind: 'ratification', status: 400, code: 'invalid_request' })
    fireEvent.click(await screen.findByRole('button', { name: '提交审批' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('native 会话')
    expect(alert.textContent).not.toContain('backend')
  })

  it('maps a 404 pre-approval to the device copy and keeps the form', async () => {
    setup({ status: 404, code: 'not_found' })
    fireEvent.click(await screen.findByRole('button', { name: '提交审批' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('设备不存在')
    expect(screen.getByRole('button', { name: '提交审批' })).toBeTruthy()
  })

  it('closes through both result buttons', async () => {
    const { onClose } = setup()
    fireEvent.click(await screen.findByRole('button', { name: '提交审批' }))
    fireEvent.click(await screen.findByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
