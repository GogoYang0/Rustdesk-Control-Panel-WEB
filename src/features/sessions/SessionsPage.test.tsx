import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import SessionsPage from './SessionsPage'

const me = {
  user: { id: 1, email: 'admin@acme.local' },
  orgs: [
    {
      id: 1,
      name: 'ACME',
      role_kind: 'owner',
      permissions: ['device.read', 'member.manage'],
    },
  ],
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup(sessionId: string, origin: 'native' | 'panel' = 'native') {
  const approvalBodies: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/approvals') && String(init?.method).toUpperCase() === 'POST') {
      approvalBodies.push(String(init?.body ?? ''))
      return json({
        code: 'ok',
        message: 'ok',
        data: {
          id: 11,
          organization_id: 1,
          device_id: 1,
          session_id: 2,
          kind: 'ratification',
          status: 'pending',
          requested_at: '2026-10-31T00:00:00.000Z',
          expires_at: '2026-10-31T00:15:00.000Z',
        },
      })
    }
    if (url.includes('/sessions/2')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: {
          session: {
            id: 2,
            organization_id: 1,
            device_id: 1,
            rustdesk_id: '123456789',
            origin,
            status: 'closed',
            started_at: '2026-10-28T16:25:00.000Z',
            ended_at: '2026-10-28T17:25:00.000Z',
            last_activity_at: '2026-10-28T17:25:00.000Z',
            control_permissions: 0,
          },
          events: [],
          truncated: false,
        },
      })
    }
    if (url.includes('/sessions?')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: { items: [], page: 1, page_size: 50, total: 0 },
      })
    }
    if (url.includes('/devices?') || url.includes('/alerts?')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: { items: [], page: 1, page_size: 200, total: 0 },
      })
    }
    if (url.includes('/members')) {
      return json({ code: 'ok', message: 'ok', data: [] })
    }
    return json({ code: 'ok', message: 'ok', data: me })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/orgs/1/sessions?sessionId=${sessionId}`]}>
        <Routes>
          <Route path="/orgs/:orgId/sessions" element={<SessionsPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
  return { approvalBodies }
}

describe('sessions deep link', () => {
  afterEach(() => vi.restoreAllMocks())

  it('opens the session sheet for ?sessionId= without relying on the current page', async () => {
    setup('2')
    expect(await screen.findByText('会话 #2')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('原生直连')).toBeTruthy())
  })

  it('closes the sheet and submits a ratification for a native session', async () => {
    const { approvalBodies } = setup('2')
    fireEvent.click(await screen.findByRole('button', { name: '申请追认' }))
    expect(await screen.findByText('申请事后追认')).toBeTruthy()
    expect(screen.queryByText('事件时间线')).toBeNull()

    fireEvent.change(screen.getByLabelText('申请理由'), { target: { value: '补记录' } })
    fireEvent.click(screen.getByRole('button', { name: '提交审批' }))
    await waitFor(() => expect(approvalBodies).toHaveLength(1))
    expect(JSON.parse(approvalBodies[0])).toEqual({
      kind: 'ratification',
      session_id: 2,
      reason: '补记录',
    })
    const link = (await screen.findByTestId('approval-request-link')) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/orgs/1/approvals?approvalId=11')
  })

  it('does not offer ratification for a panel session', async () => {
    setup('2', 'panel')
    await waitFor(() => expect(screen.getByText('会话 #2')).toBeTruthy())
    expect(screen.queryByRole('button', { name: '申请追认' })).toBeNull()
  })
})
