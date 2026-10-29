import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AuditLog, Member } from '../../lib/api'
import { DEFAULT_AUDIT_FILTERS, type AuditRange } from '../../lib/audit-query'
import { panelApi } from '../../store/api'
import AuditLogTab from './AuditLogTab'

const members: Member[] = [
  {
    id: 7,
    user_id: 7,
    email: 'ops@acme.local',
    role_name: 'admin',
    disabled: false,
    created_at: '2026-10-29T00:00:00Z',
  },
] as Member[]

const rows: AuditLog[] = [
  {
    id: 1,
    seq: 41,
    actor_user_id: 7,
    action: 'session.ticket.redeem',
    target_type: 'device',
    target_id: '1024',
    detail: { status: 200 },
    created_at: '2026-10-29T05:00:00Z',
  },
  {
    id: 2,
    seq: 40,
    actor_user_id: 0,
    action: 'GET /api/v1/me',
    target_type: 'http',
    target_id: '',
    detail: 'legacy',
    created_at: '2026-10-29T04:59:00Z',
  },
]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup(
  options: {
    page?: number
    total?: number
    range?: AuditRange
    status?: number
    items?: AuditLog[]
  } = {},
) {
  const { page = 1, total = rows.length, range = '7d', status = 200, items = rows } = options
  const requests: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.includes('/members')) return json({ code: 'ok', message: 'ok', data: members })
    if (url.includes('/audit-logs')) {
      requests.push(url)
      if (status !== 200) return json({ code: 'forbidden', message: 'forbidden' }, status)
      return json({
        code: 'ok',
        message: 'ok',
        data: { items, page, page_size: 50, total },
      })
    }
    return json({ code: 'ok', message: 'ok', data: null })
  })
  const onChangePage = vi.fn()
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  const baseNow = new Date('2026-10-29T06:00:00.000Z')
  const tree = (refreshSignal: number, now = baseNow) => (
    <Provider store={store}>
      <AuditLogTab
        orgId={1}
        filters={{ ...DEFAULT_AUDIT_FILTERS, page, range }}
        now={now}
        refreshSignal={refreshSignal}
        onChangePage={onChangePage}
      />
    </Provider>
  )
  const view = render(tree(0))
  return { requests, onChangePage, view, tree }
}

describe('AuditLogTab', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders rows with actor, target and system labels', async () => {
    setup()
    expect(await screen.findByText('session.ticket.redeem')).toBeTruthy()
    expect(screen.getByText('ops@acme.local')).toBeTruthy()
    expect(screen.getByText('device 1024')).toBeTruthy()
    expect(screen.getByText('系统')).toBeTruthy()
    expect(screen.getByText('http')).toBeTruthy()
    expect(screen.getByText('41')).toBeTruthy()
  })

  it('shows JSON and legacy string details in the sheet', async () => {
    setup()
    await screen.findByText('session.ticket.redeem')
    fireEvent.click(screen.getAllByRole('button', { name: '详情' })[0])
    expect(await screen.findByText(/"status": 200/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))

    fireEvent.click(screen.getAllByRole('button', { name: '详情' })[1])
    expect(await screen.findByText('legacy')).toBeTruthy()
  })

  it('maps a 403 to Chinese copy and offers a retry', async () => {
    setup({ status: 403, total: 0, items: [] })
    expect(await screen.findByText(/当前角色没有审计读取权限/)).toBeTruthy()
    expect(screen.queryByText('forbidden')).toBeNull()
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
  })

  it('clamps an out-of-range page to the last page', async () => {
    const { onChangePage } = setup({ page: 3, total: 51 })
    await waitFor(() => expect(onChangePage).toHaveBeenCalledWith(2))
  })

  it('refetches on a refresh signal when the range is all', async () => {
    const { requests, view, tree } = setup({ range: 'all' })
    await screen.findByText('session.ticket.redeem')
    expect(requests).toHaveLength(1)

    view.rerender(tree(1))
    await waitFor(() => expect(requests).toHaveLength(2))
  })

  it('refetches when the frozen window advances', async () => {
    const { requests, view, tree } = setup()
    await screen.findByText('session.ticket.redeem')
    expect(requests).toHaveLength(1)

    view.rerender(tree(0, new Date('2026-10-29T06:01:00.000Z')))
    await waitFor(() => expect(requests).toHaveLength(2))
  })
})
