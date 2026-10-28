import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import DecisionDialog from './DecisionDialog'

const baseApproval = {
  id: 9,
  organization_id: 1,
  device_id: 2,
  kind: 'pre_approval',
  actor_user_id: 1,
  status: 'pending',
  requested_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
}

function setup(approval: Record<string, unknown>, intent?: 'approve' | 'deny') {
  const bodies: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/decision')) {
      bodies.push(String(init?.body))
      return new Response(
        JSON.stringify({ code: 'ok', message: 'ok', data: { ...approval, status: 'approved' } }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({ code: 'ok', message: 'ok', data: approval }), {
      status: 200,
    })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  const onDone = vi.fn()
  render(
    <Provider store={store}>
      <DecisionDialog
        orgId={1}
        approvalId={9}
        canDecide
        intent={intent}
        onClose={() => {}}
        onDone={onDone}
      />
    </Provider>,
  )
  return { bodies, onDone }
}

describe('DecisionDialog', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('approves without a reason', async () => {
    const { bodies, onDone } = setup(baseApproval)
    const confirm = await screen.findByRole('button', { name: '确认批准' })
    fireEvent.click(confirm)
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(JSON.parse(bodies[0])).toEqual({ decision: 'approve' })
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('denies with a trimmed reason', async () => {
    const { bodies } = setup(baseApproval)
    fireEvent.click(await screen.findByRole('button', { name: '驳回' }))
    const reason = await screen.findByLabelText('拒绝原因')
    fireEvent.change(reason, { target: { value: '  权限已收回  ' } })
    fireEvent.click(screen.getByRole('button', { name: '确认驳回' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(JSON.parse(bodies[0])).toEqual({ decision: 'deny', reason: '权限已收回' })
  })

  it('honours the button that opened it, so 驳回 never submits an approval', async () => {
    const { bodies } = setup(baseApproval, 'deny')
    expect(await screen.findByRole('button', { name: '确认驳回' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '确认驳回' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(JSON.parse(bodies[0])).toEqual({ decision: 'deny' })
  })

  it('refuses to act on an expired request', async () => {
    setup({ ...baseApproval, expires_at: new Date(Date.now() - 60_000).toISOString() })
    expect(await screen.findByText(/已不可决策/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '确认批准' }).hasAttribute('disabled')).toBe(true)
  })
})
