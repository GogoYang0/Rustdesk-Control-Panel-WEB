import { configureStore } from '@reduxjs/toolkit'
import { Toast } from '@douyinfe/semi-ui'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Invitation } from '../../lib/api'
import { panelApi } from '../../store/api'
import MembersPage from './MembersPage'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const pending: Invitation = {
  id: 7,
  email: 'invitee@example.com',
  role: 'admin',
  expires_at: '2026-11-07T12:00:00Z',
}

function setup(
  options: {
    permissions?: string[]
    invitations?: Invitation[]
    listStatus?: number
    deleteStatus?: number
    deleteGate?: Promise<void>
  } = {},
) {
  const perms = options.permissions ?? ['member.manage', 'device.read']
  let invitations = options.invitations ?? [pending]
  const requests: { method: string; url: string }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = String(init?.method ?? 'GET').toUpperCase()
    requests.push({ method, url })
    if (url.endsWith('/me')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: {
          user: {
            id: 1,
            email: 'owner@acme.local',
            email_verified: true,
            totp_enabled: false,
            has_password: true,
          },
          orgs: [{ id: 1, name: 'ACME', role_id: 1, role_kind: 'owner', permissions: perms }],
        },
      })
    }
    if (url.endsWith('/orgs/1/members')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: [
          {
            id: 9,
            user_id: 2,
            email: 'ops@acme.local',
            role: 'member',
            role_id: 3,
            role_name: 'member',
            control_role_id: null,
            strategy_id: null,
            disabled: false,
            created_at: '2026-10-01T00:00:00Z',
          },
        ],
      })
    }
    if (url.endsWith('/orgs/1/invitations') && method === 'GET') {
      if (options.listStatus) {
        return json({ code: 'internal', message: 'failed' }, options.listStatus)
      }
      return json({ code: 'ok', message: 'ok', data: invitations })
    }
    if (/\/orgs\/1\/invitations\/\d+$/.test(url) && method === 'DELETE') {
      if (options.deleteGate) await options.deleteGate
      if (options.deleteStatus) {
        // A stale row is gone even though the revoke failed.
        if (options.deleteStatus === 409) invitations = []
        return json({ code: 'conflict', message: 'failed' }, options.deleteStatus)
      }
      invitations = []
      return json({ code: 'ok', message: 'ok', data: null })
    }
    return json({ code: 'ok', message: 'ok', data: null })
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
      <MemoryRouter initialEntries={['/orgs/1/members']}>
        <Routes>
          <Route path="/orgs/:orgId/members" element={<MembersPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
  return { requests }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => vi.restoreAllMocks())

describe('MembersPage invitations', () => {
  it('renders pending invitations for a member manager', async () => {
    const { requests } = setup()
    const card = await screen.findByTestId('invitation-card')
    expect(await within(card).findByText('invitee@example.com')).toBeTruthy()
    expect(within(card).getByText('Admin')).toBeTruthy()
    expect(within(card).getByRole('button', { name: '撤销' })).toBeTruthy()
    expect(requests.some((request) => request.url.endsWith('/orgs/1/invitations'))).toBe(true)
  })

  it('hides the card and skips the query without member.manage', async () => {
    const { requests } = setup({ permissions: ['device.read'] })
    expect(await screen.findByText('ops@acme.local')).toBeTruthy()
    expect(screen.queryByTestId('invitation-card')).toBeNull()
    expect(requests.some((request) => request.url.endsWith('/orgs/1/invitations'))).toBe(false)
  })

  it('shows an empty state when no invitation is pending', async () => {
    setup({ invitations: [] })
    const card = await screen.findByTestId('invitation-card')
    expect(await within(card).findByText('没有待接受的邀请')).toBeTruthy()
  })

  it('keeps a load error inside the card with a retry action', async () => {
    setup({ listStatus: 500 })
    const card = await screen.findByTestId('invitation-card')
    expect(await within(card).findByText(/加载待接受邀请失败/)).toBeTruthy()
    expect(within(card).getByRole('button', { name: '重试' })).toBeTruthy()
  })

  it('revokes an invitation after confirmation and refreshes the list', async () => {
    const toast = vi.spyOn(Toast, 'success')
    const { requests } = setup()
    const card = await screen.findByTestId('invitation-card')
    fireEvent.click(await within(card).findByRole('button', { name: '撤销' }))
    const dialog = await screen.findByRole('dialog', { name: '撤销邀请' })
    expect(within(dialog).getByText(/invitee@example.com/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '撤销邀请' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(within(card).queryByText('invitee@example.com')).toBeNull())
    expect(requests.filter((request) => request.method === 'DELETE')).toHaveLength(1)
    expect(toast).toHaveBeenCalledWith('已撤销邀请')
  })

  it('shows the accepted conflict and refreshes the stale row', async () => {
    setup({ deleteStatus: 409 })
    const card = await screen.findByTestId('invitation-card')
    fireEvent.click(await within(card).findByRole('button', { name: '撤销' }))
    const dialog = await screen.findByRole('dialog', { name: '撤销邀请' })
    fireEvent.click(within(dialog).getByRole('button', { name: '撤销邀请' }))
    expect(await within(dialog).findByText('受邀人已接受邀请')).toBeTruthy()
    await waitFor(() => expect(within(card).queryByText('invitee@example.com')).toBeNull())
  })

  it('blocks closing while the revoke is in flight', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { requests } = setup({ deleteGate: gate })
    const card = await screen.findByTestId('invitation-card')
    fireEvent.click(await within(card).findByRole('button', { name: '撤销' }))
    const dialog = await screen.findByRole('dialog', { name: '撤销邀请' })
    fireEvent.click(within(dialog).getByRole('button', { name: '撤销邀请' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(dialog.parentElement as HTMLElement)
    expect(screen.getByRole('dialog', { name: '撤销邀请' })).toBeTruthy()
    expect(requests.filter((request) => request.method === 'DELETE')).toHaveLength(1)
    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
