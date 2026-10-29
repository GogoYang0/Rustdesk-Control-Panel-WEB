import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { Provider } from 'react-redux'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import LogsPage from './LogsPage'

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

function event(org: number, overrides: Record<string, unknown> = {}) {
  return {
    id: org * 10,
    device_id: 5,
    source: 'hbbs',
    level: 'error',
    kind: 'error',
    detail: { devseed: 'e2e', raw: `ERROR org.${org}.relay` },
    occurred_at: '2026-10-29T05:00:00Z',
    ...overrides,
  }
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="loc">{`${location.pathname}${location.search}`}</div>
}

function SwitchOrg() {
  const location = useLocation()
  return <Link to={`/orgs/2/logs${location.search}`}>切组织</Link>
}

const sheetSeenOnOrg2: boolean[] = []

// Passive effects run before RTL returns from fireEvent, so a DOM assertion
// alone cannot catch a stale sheet that was mounted for one committed frame.
function OrgSwitchProbe() {
  const location = useLocation()
  useLayoutEffect(() => {
    if (location.pathname === '/orgs/2/logs') {
      sheetSeenOnOrg2.push(document.querySelector('[role="dialog"]') !== null)
    }
  })
  return null
}

function setup(
  options: {
    initial?: string
    permissions?: string[]
    events?: Array<Record<string, unknown>>
    devices?: Array<Record<string, unknown>>
    logFailures?: number
    failCalls?: number[]
    gateSecondCall?: Promise<void>
  } = {},
) {
  const {
    initial = '/orgs/1/logs',
    permissions = ['audit.read', 'device.read'],
    events = [
      event(1, { id: 4, device_id: null, source: 'hbbr', kind: 'disconnected', level: 'info' }),
      event(1, { id: 3 }),
      event(1, { id: 2, level: 'warn', kind: 'file' }),
    ],
    devices = [{ id: 5, name: '工作站 A', rustdesk_id: '100000001', disabled: false }],
    logFailures = 0,
    failCalls = [],
    gateSecondCall,
  } = options
  let failures = logFailures
  let logCalls = 0
  const requests: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    requests.push(url)
    if (url.endsWith('/me')) {
      return json({ code: 'ok', message: 'ok', data: meWith(permissions) })
    }
    const org = Number(url.match(/\/orgs\/(\d+)\//)?.[1] ?? 1)
    if (url.includes('/log-events')) {
      logCalls += 1
      if (gateSecondCall && logCalls === 2) await gateSecondCall
      if (failCalls.includes(logCalls)) {
        return json({ code: 'internal', message: 'database is locked' }, 500)
      }
      if (failures > 0) {
        failures -= 1
        return json({ code: 'internal', message: 'database is locked' }, 500)
      }
      const rows = events.map((row) => {
        const detail = { ...(row.detail as Record<string, unknown>) }
        if (typeof detail.raw === 'string' && detail.raw.includes('org.1')) {
          detail.raw = detail.raw.replaceAll('org.1', `org.${org}`)
        }
        return { ...row, detail }
      })
      return json({ code: 'ok', message: 'ok', data: rows })
    }
    if (url.includes('/devices')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: { items: devices, page: 1, page_size: 200, total: devices.length },
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
            path="/orgs/:orgId/logs"
            element={
              <>
                <LogsPage />
                <LocationProbe />
                <SwitchOrg />
                <OrgSwitchProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
  return { requests }
}

function logRequests(requests: string[]) {
  return requests.filter((url) => url.includes('/log-events'))
}

describe('LogsPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('gates the page without audit.read and never requests events', async () => {
    const { requests } = setup({ permissions: ['device.read'] })
    expect(await screen.findByText(/没有日志读取权限/)).toBeTruthy()
    expect(logRequests(requests)).toHaveLength(0)
    expect(requests.some((url) => url.includes('/devices'))).toBe(false)
  })

  it('rejects an invalid organization id without loading events', async () => {
    const { requests } = setup({ initial: '/orgs/abc/logs' })
    expect(await screen.findByText('组织不存在')).toBeTruthy()
    expect(logRequests(requests)).toHaveLength(0)
  })

  it('lists events newest-first with kind, device and summary copy', async () => {
    const { requests } = setup()
    expect(await screen.findByText('断开')).toBeTruthy()
    expect(screen.getAllByText('hbbs 信令').length).toBeGreaterThan(0)
    expect(screen.getByText('未关联设备')).toBeTruthy()
    expect(screen.getAllByText('工作站 A').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ERROR org.1.relay').length).toBe(3)
    expect(screen.getAllByText('错误').length).toBeGreaterThan(0)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0].textContent).toContain('断开')
    expect(screen.queryByLabelText('下一页')).toBeNull()
    const devicesRequest = requests.find((url) => url.includes('/devices')) ?? ''
    expect(new URL(devicesRequest, 'http://x').searchParams.get('pageSize')).toBe('200')
  })

  it('opens a row snapshot with raw text and captured fields', async () => {
    setup({
      events: [
        event(1, {
          id: 7,
          detail: { devseed: 'e2e', raw: '<script>alert(1)</script>', peer: '10.0.0.5' },
        }),
      ],
    })
    await screen.findAllByText('hbbs 信令')
    fireEvent.click(screen.getByRole('button', { name: '详情' }))

    const sheet = await screen.findByRole('dialog', { name: '日志 #7' })
    expect(within(sheet).getByText('<script>alert(1)</script>')).toBeTruthy()
    expect(within(sheet).getByText(/"peer": "10.0.0.5"/)).toBeTruthy()
    expect(document.querySelector('.sheet script')).toBeNull()

    fireEvent.click(within(sheet).getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('keeps the sheet snapshot while a refresh is in flight', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { requests } = setup({ gateSecondCall: gate })
    await screen.findAllByText('hbbs 信令')
    fireEvent.click(screen.getAllByRole('button', { name: '详情' })[0])
    expect(await screen.findByRole('dialog')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(logRequests(requests)).toHaveLength(2))
    expect(screen.getByRole('dialog')).toBeTruthy()

    release()
    await waitFor(() => expect(logRequests(requests)).toHaveLength(2))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('keeps the last window visible when a refresh fails', async () => {
    setup({ failCalls: [2] })
    await screen.findAllByText('hbbs 信令')
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))

    expect(await screen.findByText(/加载日志失败/)).toBeTruthy()
    expect(screen.getByText(/显示上次结果/)).toBeTruthy()
    expect(screen.getAllByText('ERROR org.1.relay').length).toBe(3)
  })

  it('writes level, range, device and limit filters to the URL and request', async () => {
    const { requests } = setup()
    await screen.findAllByText('hbbs 信令')

    fireEvent.click(screen.getByRole('button', { name: '错误' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('level=error'))
    fireEvent.click(screen.getByRole('button', { name: '30 天' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('range=30d'))
    fireEvent.change(screen.getByLabelText('设备'), { target: { value: '5' } })
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('deviceId=5'))
    fireEvent.change(screen.getByLabelText('最近条数'), { target: { value: '100' } })
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('limit=100'))

    await waitFor(() => {
      const latest = logRequests(requests).at(-1) ?? ''
      const query = new URL(latest, 'http://x').searchParams
      expect(query.get('level')).toBe('error')
      expect(query.get('deviceId')).toBe('5')
      expect(query.get('limit')).toBe('100')
      expect(query.get('since')).not.toBeNull()
    })
  })

  it('keeps the frozen since across filter changes but moves it on refresh', async () => {
    const { requests } = setup()
    await screen.findAllByText('hbbs 信令')
    const first = new URL(logRequests(requests)[0], 'http://x').searchParams.get('since')

    fireEvent.click(screen.getByRole('button', { name: '警告' }))
    await waitFor(() => {
      const urls = logRequests(requests)
      expect(urls.length).toBeGreaterThan(1)
      expect(new URL(urls[urls.length - 1], 'http://x').searchParams.get('since')).toBe(first)
    })

    fireEvent.change(screen.getByLabelText('设备'), { target: { value: '5' } })
    await waitFor(() => {
      const urls = logRequests(requests)
      expect(new URL(urls[urls.length - 1], 'http://x').searchParams.get('deviceId')).toBe('5')
      expect(new URL(urls[urls.length - 1], 'http://x').searchParams.get('since')).toBe(first)
    })

    fireEvent.change(screen.getByLabelText('最近条数'), { target: { value: '100' } })
    await waitFor(() => {
      const urls = logRequests(requests)
      expect(new URL(urls[urls.length - 1], 'http://x').searchParams.get('limit')).toBe('100')
      expect(new URL(urls[urls.length - 1], 'http://x').searchParams.get('since')).toBe(first)
    })

    await new Promise((resolve) => setTimeout(resolve, 5))
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => {
      const urls = logRequests(requests)
      expect(new URL(urls[urls.length - 1], 'http://x').searchParams.get('since')).not.toBe(first)
    })
  })

  it('sends no since for all and refetches explicitly on refresh', async () => {
    const { requests } = setup({ initial: '/orgs/1/logs?range=all' })
    await screen.findAllByText('hbbs 信令')
    const initial = logRequests(requests)
    expect(initial).toHaveLength(1)
    expect(new URL(initial[0], 'http://x').searchParams.get('since')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(logRequests(requests)).toHaveLength(2))
    expect(logRequests(requests)[1]).toBe(initial[0])
  })

  it('shows empty and retry states', async () => {
    const { requests } = setup({ events: [], logFailures: 1 })
    expect(await screen.findByText(/加载日志失败/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('没有符合条件的采集日志')).toBeTruthy()
    expect(logRequests(requests).length).toBeGreaterThanOrEqual(2)
  })

  it('hides the device filter and skips devices without device.read', async () => {
    const { requests } = setup({ permissions: ['audit.read'] })
    await screen.findAllByText('hbbs 信令')
    expect(screen.queryByLabelText('设备')).toBeNull()
    expect(screen.getByText('仅显示设备 ID')).toBeTruthy()
    expect(screen.getAllByText('设备 #5').length).toBeGreaterThan(0)
    expect(requests.some((url) => url.includes('/devices'))).toBe(false)
  })

  it('ignores a deep-linked deviceId when the role cannot read devices', async () => {
    const { requests } = setup({ permissions: ['audit.read'], initial: '/orgs/1/logs?deviceId=5' })
    await screen.findAllByText('hbbs 信令')
    expect(screen.queryByLabelText('设备')).toBeNull()
    expect(new URL(logRequests(requests)[0], 'http://x').searchParams.get('deviceId')).toBeNull()
  })

  it('clears filters and the sheet when switching organization', async () => {
    setup({ initial: '/orgs/1/logs?level=error&range=30d' })
    await screen.findAllByText('hbbs 信令')
    fireEvent.click(
      within(screen.getAllByText('ERROR org.1.relay')[0].closest('tr') as HTMLElement).getByRole(
        'button',
        { name: '详情' },
      ),
    )
    expect(await screen.findByRole('dialog')).toBeTruthy()

    sheetSeenOnOrg2.length = 0
    fireEvent.click(screen.getByRole('link', { name: '切组织' }))
    expect(sheetSeenOnOrg2).not.toContain(true)
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/orgs/2/logs'))
    expect((await screen.findAllByText('ERROR org.2.relay')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the recent-limit copy without paging', async () => {
    setup()
    await screen.findAllByText('hbbs 信令')
    fireEvent.change(screen.getByLabelText('最近条数'), { target: { value: '200' } })
    expect(await screen.findByText(/仅显示最近 200 条（上限 200）/)).toBeTruthy()
    expect(screen.queryByLabelText('下一页')).toBeNull()
    expect(screen.queryByLabelText('上一页')).toBeNull()
  })
})
