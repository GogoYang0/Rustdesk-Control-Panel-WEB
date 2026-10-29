import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import AuditPage from './AuditPage'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function meWith(permissions: string[]) {
  return {
    user: { id: 1, email: 'owner@acme.local' },
    orgs: [
      { id: 1, name: 'ACME', role_kind: 'owner', permissions },
      { id: 2, name: 'Beta', role_kind: 'owner', permissions },
    ],
  }
}

function auditRow(org: number) {
  return {
    id: org,
    seq: org,
    actor_user_id: 0,
    action: `org.${org}.audit`,
    target_type: 'http',
    target_id: '',
    detail: { status: 200 },
    created_at: '2026-10-29T05:00:00Z',
  }
}

function connectionRow(org: number) {
  return {
    id: org,
    organization_id: org,
    device_id: 5,
    rustdesk_id: `10000000${org}`,
    conn_id: org,
    session_id: 0,
    status: 'closed',
    started_at: '2026-10-29T05:00:00Z',
    ended_at: '2026-10-29T05:10:00Z',
    created_at: '2026-10-29T05:00:00Z',
  }
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="loc">{`${location.pathname}${location.search}`}</div>
}

function SwitchOrg() {
  const location = useLocation()
  return <Link to={`/orgs/2/audit${location.search}`}>切组织</Link>
}

function setup(options: { initial?: string; permissions?: string[]; auditTotal?: number } = {}) {
  const { initial = '/orgs/1/audit', permissions = ['audit.read'], auditTotal = 1 } = options
  const requests: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    requests.push(url)
    if (url.endsWith('/me')) {
      return json({ code: 'ok', message: 'ok', data: meWith(permissions) })
    }
    const org = Number(url.match(/\/orgs\/(\d+)\//)?.[1] ?? 1)
    if (url.includes('/members')) return json({ code: 'ok', message: 'ok', data: [] })
    if (url.includes('/audit-logs')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: { items: [auditRow(org)], page: 1, page_size: 50, total: auditTotal },
      })
    }
    if (url.includes('/connection-logs')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: { items: [connectionRow(org)], page: 1, page_size: 50, total: 1 },
      })
    }
    if (url.includes('/file-logs')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: { items: [], page: 1, page_size: 50, total: 0 },
      })
    }
    if (url.includes('/devices')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: { items: [], page: 1, page_size: 200, total: 0 },
      })
    }
    return json({ code: 'ok', message: 'ok', data: null })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route
            path="/orgs/:orgId/audit"
            element={
              <>
                <AuditPage />
                <LocationProbe />
                <SwitchOrg />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
  return { requests }
}

describe('AuditPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('gates the page without audit.read and never requests audit logs', async () => {
    const { requests } = setup({ permissions: ['device.read'] })
    expect(await screen.findByText(/没有审计读取权限/)).toBeTruthy()
    expect(requests.some((url) => url.includes('/audit-logs'))).toBe(false)
  })

  it('renders the three tabs and switches to connection logs', async () => {
    setup()
    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['请求审计', '连接日志', '文件日志'])
    expect(await screen.findByText('org.1.audit')).toBeTruthy()
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[0].getAttribute('aria-controls')).toBe('audit-tabpanel')

    fireEvent.click(tabs[1])
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('tab=connections'))
    expect(await screen.findByText('100000001')).toBeTruthy()
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(
      'audit-tab-connections',
    )
  })

  it('keeps the range when switching tabs', async () => {
    setup()
    await screen.findByText('org.1.audit')
    fireEvent.click(screen.getByRole('button', { name: '30 天' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('range=30d'))

    fireEvent.click(screen.getByRole('tab', { name: '连接日志' }))
    await waitFor(() => {
      const location = screen.getByTestId('loc').textContent ?? ''
      expect(location).toContain('tab=connections')
      expect(location).toContain('range=30d')
    })
  })

  it('sends system actor 0 and resets the page on filter changes', async () => {
    const { requests } = setup({ initial: '/orgs/1/audit?page=2', auditTotal: 100 })
    await screen.findByText('org.1.audit')
    fireEvent.change(screen.getByLabelText('动作'), { target: { value: 'org.1.audit' } })
    fireEvent.blur(screen.getByLabelText('动作'))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).not.toContain('page=2'))

    fireEvent.change(screen.getByLabelText('操作人'), { target: { value: '0' } })
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('actorUserId=0'))
    await waitFor(() =>
      expect(
        requests.some((url) => url.includes('/audit-logs') && url.includes('actorUserId=0')),
      ).toBe(true),
    )
  })

  it('clears filters, closes the sheet and reloads on organization switch', async () => {
    setup({
      initial: '/orgs/1/audit?tab=connections&range=30d&rustdeskId=100000001',
    })
    await screen.findByText('100000001')
    fireEvent.click(screen.getByRole('button', { name: '详情' }))
    expect(await screen.findByText('客户端连接标识，非面板会话')).toBeTruthy()

    fireEvent.click(screen.getByRole('link', { name: '切组织' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/orgs/2/audit'))
    expect(await screen.findByText('org.2.audit')).toBeTruthy()
    expect(screen.queryByText('100000001')).toBeNull()
    expect(screen.queryByText('客户端连接标识，非面板会话')).toBeNull()
  })

  it('resets only the active tab filters', async () => {
    setup({ initial: '/orgs/1/audit?tab=connections' })
    await screen.findByText('100000001')
    fireEvent.change(screen.getByLabelText('RustDesk ID'), {
      target: { value: '100000001' },
    })
    fireEvent.blur(screen.getByLabelText('RustDesk ID'))
    await waitFor(() =>
      expect(screen.getByTestId('loc').textContent).toContain('rustdeskId=100000001'),
    )

    fireEvent.click(screen.getByRole('tab', { name: '请求审计' }))
    await screen.findByText('org.1.audit')
    fireEvent.change(screen.getByLabelText('动作'), { target: { value: 'org.1.audit' } })
    fireEvent.blur(screen.getByLabelText('动作'))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('action='))

    fireEvent.click(screen.getByRole('button', { name: '重置筛选' }))
    await waitFor(() => {
      const location = screen.getByTestId('loc').textContent ?? ''
      expect(location).not.toContain('action=')
      expect(location).toContain('rustdeskId=100000001')
    })

    fireEvent.click(screen.getByRole('tab', { name: '连接日志' }))
    await screen.findByText('100000001')
    expect((screen.getByLabelText('RustDesk ID') as HTMLInputElement).value).toBe('100000001')
  })

  it('keeps a typed trailing space in the action input', async () => {
    setup()
    await screen.findByText('org.1.audit')
    const action = screen.getByLabelText('动作') as HTMLInputElement
    fireEvent.change(action, { target: { value: 'GET ' } })
    expect(action.value).toBe('GET ')
    expect(screen.getByTestId('loc').textContent).not.toContain('action=')

    fireEvent.blur(action)
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('action=GET'))
    expect(action.value).toBe('GET ')
  })

  it('drops an uncommitted draft when the organization changes', async () => {
    setup({ initial: '/orgs/1/audit' })
    await screen.findByText('org.1.audit')
    fireEvent.change(screen.getByLabelText('动作'), { target: { value: 'draft' } })

    fireEvent.click(screen.getByRole('link', { name: '切组织' }))
    expect(await screen.findByText('org.2.audit')).toBeTruthy()
    expect(screen.getByTestId('loc').textContent).toBe('/orgs/2/audit')
    expect((screen.getByLabelText('动作') as HTMLInputElement).value).toBe('')
  })

  it('keeps an unknown actor id visible in the filter', async () => {
    setup({ initial: '/orgs/1/audit?actorUserId=99' })
    await screen.findByText('org.1.audit')
    expect((screen.getByLabelText('操作人') as HTMLSelectElement).value).toBe('99')
    expect(screen.getByRole('option', { name: /用户 #99/ })).toBeTruthy()
  })
})
