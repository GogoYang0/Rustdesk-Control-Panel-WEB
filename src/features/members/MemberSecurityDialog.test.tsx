import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Member } from '../../lib/api'
import { panelApi } from '../../store/api'
import { MemberSecurityDialog } from './MembersPage'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const member: Member = {
  id: 2,
  user_id: 7,
  email: 'ops@acme.local',
  role: 'member',
  role_id: 3,
  role_name: 'Member',
  disabled: false,
  created_at: '2026-10-31T00:00:00Z',
}

function setup(status = 200) {
  const requests: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    requests.push(String(input))
    if (status !== 200) return json({ code: 'conflict', message: 'blocked' }, status)
    return json({ code: 'ok', message: 'ok' })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) =>
      getDefault({
        serializableCheck: {
          ignoredActions: ['panelApi/executeMutation/rejected'],
          ignoredPaths: [/^panelApi\.mutations\..*\.error$/],
        },
      }).concat(panelApi.middleware),
  })
  const onClose = vi.fn()
  render(
    <Provider store={store}>
      <MemberSecurityDialog orgId={1} member={member} onClose={onClose} />
    </Provider>,
  )
  return { requests, onClose }
}

afterEach(() => vi.restoreAllMocks())

describe('MemberSecurityDialog', () => {
  it('lists the three security actions and confirms before resetting TOTP', async () => {
    const { requests, onClose } = setup()
    expect(screen.getByText('重置两步验证')).toBeTruthy()
    expect(screen.getByText('重置 Passkey')).toBeTruthy()
    expect(screen.getByText('解绑外部身份')).toBeTruthy()

    const totpCard = screen.getByText('重置两步验证').closest('.card') as HTMLElement
    fireEvent.click(within(totpCard).getByRole('button', { name: '重置' }))
    expect(screen.getByText(/恢复码会被删除/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重置两步验证' }))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]).toBe('/api/v1/orgs/1/members/7/2fa/reset')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows the passkey lockout refusal and keeps the dialog open', async () => {
    const { onClose } = setup(409)
    const card = screen.getByText('重置 Passkey').closest('.card') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: '重置' }))
    fireEvent.click(screen.getByRole('button', { name: '删除全部 Passkey' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('没有本地密码')
    expect(onClose).not.toHaveBeenCalled()
  })
})
