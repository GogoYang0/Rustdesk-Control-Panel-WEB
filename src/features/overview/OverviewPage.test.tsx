import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import OverviewPage from './OverviewPage'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function page(items: unknown[], total: number) {
  return { code: 'ok', message: 'ok', data: { items, page: 1, page_size: 5, total } }
}

function setup(
  options: {
    permissions?: string[]
    deviceTotal?: number
    devicesStatus?: number
    sessionsStatus?: number
    emptyLists?: boolean
    initialPath?: string
  } = {},
) {
  const permissions = options.permissions ?? ['device.read', 'audit.read']
  const requests: string[] = []
  let deviceTotal = options.deviceTotal ?? 42
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    requests.push(url)
    if (url.endsWith('/me')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: {
          user: { id: 1, email: 'owner@acme.local' },
          orgs: [{ id: 1, name: 'ACME', role_id: 1, role_kind: 'owner', permissions }],
        },
      })
    }
    if (url.includes('/devices?')) {
      if (options.devicesStatus) {
        return json({ code: 'internal', message: 'failed' }, options.devicesStatus)
      }
      return json(page([], deviceTotal))
    }
    if (url.includes('/sessions?')) {
      if (options.sessionsStatus) {
        return json({ code: 'internal', message: 'failed' }, options.sessionsStatus)
      }
      if (!url.includes('status=open') || !url.includes('pageSize=5')) {
        return json({ code: 'invalid', message: 'wrong query' }, 400)
      }
      if (options.emptyLists) return json(page([], 0))
      return json(
        page(
          [
            {
              id: 11,
              device_id: 7,
              rustdesk_id: '123 456',
              origin: 'panel',
              status: 'open',
              started_at: '2026-10-30T08:00:00Z',
            },
          ],
          3,
        ),
      )
    }
    if (url.includes('/approvals?')) {
      if (!url.includes('status=pending')) {
        return json({ code: 'invalid', message: 'wrong query' }, 400)
      }
      if (options.emptyLists) return json(page([], 0))
      return json(
        page(
          [
            {
              id: 21,
              device_id: 9,
              kind: 'pre_approval',
              status: 'pending',
              requested_at: '2026-10-30T08:00:00Z',
              expires_at: '2026-10-30T09:00:00Z',
            },
            {
              id: 22,
              device_id: 10,
              kind: 'ratification',
              status: 'pending',
              requested_at: '2026-10-30T07:00:00Z',
              expires_at: '2026-10-30T09:00:00Z',
            },
          ],
          2,
        ),
      )
    }
    if (url.includes('/alerts?')) {
      if (!url.includes('pageSize=5') || url.includes('since=')) {
        return json({ code: 'invalid', message: 'wrong query' }, 400)
      }
      if (options.emptyLists) return json(page([], 0))
      return json(
        page(
          [
            {
              id: 31,
              kind: 'outside_window',
              severity: 'critical',
              created_at: '2026-10-30T08:00:00Z',
            },
          ],
          9,
        ),
      )
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
      <MemoryRouter initialEntries={[options.initialPath ?? '/orgs/1/overview']}>
        <Routes>
          <Route path="/orgs/:orgId/overview" element={<OverviewPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
  return {
    requests,
    setDeviceTotal: (value: number) => {
      deviceTotal = value
    },
  }
}

afterEach(() => vi.restoreAllMocks())

describe('OverviewPage', () => {
  it('renders four totals and the recent lists with the exact query scopes', async () => {
    const { requests } = setup()
    const devices = await screen.findByTestId('overview-stat-devices')
    expect(await within(devices).findByText('42')).toBeTruthy()
    expect((await screen.findByTestId('overview-stat-sessions')).textContent).toContain('3')
    expect((await screen.findByTestId('overview-stat-approvals')).textContent).toContain('2')
    expect((await screen.findByTestId('overview-stat-alerts')).textContent).toContain('9')

    expect(requests.some((url) => url.includes('/devices?page=1&pageSize=1'))).toBe(true)
    expect(requests.some((url) => url.includes('sessions?status=open&page=1&pageSize=5'))).toBe(
      true,
    )
    expect(requests.some((url) => url.includes('approvals?status=pending&page=1&pageSize=5'))).toBe(
      true,
    )
    expect(requests.some((url) => url.includes('alerts?page=1&pageSize=5'))).toBe(true)
    expect(requests.some((url) => url.includes('since='))).toBe(false)

    expect(await screen.findByText('123 456')).toBeTruthy()
    expect(screen.getByText(/面板 ·/)).toBeTruthy()
    expect(screen.getByText(/待审批 · 截止/)).toBeTruthy()
    expect(screen.getByText(/待追认 · 截止/)).toBeTruthy()
    expect(screen.getByText('时段外发起')).toBeTruthy()
    expect(screen.getByText('严重')).toBeTruthy()
  })

  it('degrades the device card without sending a device request', async () => {
    const { requests } = setup({ permissions: ['audit.read'] })
    const device = await screen.findByTestId('overview-stat-devices')
    expect(device.textContent).toContain('—')
    expect(device.textContent).toContain('需要 device.read')
    expect(requests.some((url) => url.includes('/devices?'))).toBe(false)
    expect(
      await within(await screen.findByTestId('overview-stat-sessions')).findByText('3'),
    ).toBeTruthy()
  })

  it('isolates a device error from the other cards', async () => {
    setup({ devicesStatus: 500 })
    const device = await screen.findByTestId('overview-stat-devices')
    expect(await within(device).findByText(/服务暂时不可用/)).toBeTruthy()
    expect(device.textContent).toContain('—')
    expect((await screen.findByTestId('overview-stat-sessions')).textContent).toContain('3')
    expect((await screen.findByTestId('overview-stat-alerts')).textContent).toContain('9')
    expect(within(device).getByRole('button', { name: '重试' })).toBeTruthy()
  })

  it('links rows and view-all targets to the all-history scope', async () => {
    setup()
    const sessionLink = await screen.findByRole('link', { name: '123 456' })
    expect(sessionLink.getAttribute('href')).toBe(
      '/orgs/1/sessions?status=open&range=all&sessionId=11',
    )
    const approvalLink = await screen.findByRole('link', { name: /设备 #9/ })
    expect(approvalLink.getAttribute('href')).toBe('/orgs/1/approvals?status=pending&approvalId=21')
    const allLinks = screen.getAllByRole('link', { name: '查看全部' })
    expect(allLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/orgs/1/sessions?status=open&range=all',
      '/orgs/1/approvals?status=pending',
      '/orgs/1/alerts?range=all',
    ])
  })

  it('refreshes all four queries on demand', async () => {
    const { requests } = setup()
    await screen.findByText('123 456')
    const before = requests.length
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(requests.length).toBeGreaterThan(before))
    await waitFor(() => expect(requests.filter((url) => url.endsWith('/me')).length).toBe(1))
    expect(requests.filter((url) => url.includes('/devices?')).length).toBe(2)
    expect(requests.filter((url) => url.includes('/sessions?')).length).toBe(2)
    expect(requests.filter((url) => url.includes('/approvals?')).length).toBe(2)
    expect(requests.filter((url) => url.includes('/alerts?')).length).toBe(2)
  })

  it('rejects an invalid organization id without requesting data', async () => {
    const { requests } = setup({ initialPath: '/orgs/abc/overview' })
    expect(await screen.findByText('组织不存在')).toBeTruthy()
    expect(requests.every((url) => url.endsWith('/me'))).toBe(true)
  })

  it('shows empty states for all three recent lists', async () => {
    setup({ emptyLists: true })
    expect(await screen.findByText('暂无进行中的会话。')).toBeTruthy()
    expect(screen.getByText('暂无待处理审批。')).toBeTruthy()
    expect(screen.getByText('暂无告警。')).toBeTruthy()
  })

  it('isolates a session list error from the other cards', async () => {
    setup({ sessionsStatus: 500 })
    const sessions = await screen.findByTestId('overview-stat-sessions')
    expect(await within(sessions).findByText(/服务暂时不可用/)).toBeTruthy()
    expect(screen.getByTestId('overview-sessions').textContent).toContain('服务暂时不可用')
    expect((await screen.findByTestId('overview-stat-approvals')).textContent).toContain('2')
    expect((await screen.findByTestId('overview-stat-alerts')).textContent).toContain('9')
  })

  it('formats large totals and empty lists', async () => {
    setup({ deviceTotal: 12345 })
    expect(await screen.findByText('12,345')).toBeTruthy()
  })
})
