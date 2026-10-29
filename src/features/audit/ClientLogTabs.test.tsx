import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ConnectionLog, DevicePage, FileLog } from '../../lib/api'
import { DEFAULT_AUDIT_FILTERS } from '../../lib/audit-query'
import { panelApi } from '../../store/api'
import ConnectionLogTab from './ConnectionLogTab'
import FileLogTab from './FileLogTab'

const devices = {
  items: [{ id: 5, name: 'lab-pc', rustdesk_id: '123456789' }],
  page: 1,
  page_size: 200,
  total: 1,
} as unknown as DevicePage

const connections: ConnectionLog[] = [
  {
    id: 1,
    organization_id: 1,
    device_id: 5,
    rustdesk_id: '123456789',
    conn_id: 12,
    session_id: 34,
    ip: '10.0.0.8',
    status: 'open',
    started_at: '2026-10-29T05:00:00Z',
    ended_at: null,
    note: 'after hours',
    conn_audit_ref: 'ref-1',
    created_at: '2026-10-29T05:00:00Z',
  },
  {
    id: 2,
    organization_id: 1,
    device_id: 5,
    rustdesk_id: '123456789',
    conn_id: 11,
    session_id: 33,
    status: 'closed',
    started_at: '2026-10-29T04:00:00Z',
    ended_at: '2026-10-29T04:10:00Z',
    created_at: '2026-10-29T04:00:00Z',
  },
]

const files: FileLog[] = [
  {
    id: 9,
    organization_id: 1,
    device_id: 5,
    rustdesk_id: '123456789',
    peer_id: '987654321',
    conn_id: 12,
    direction: 'send',
    path: '/home/lab/report.csv',
    is_file: true,
    file_count: 2,
    files: [
      ['report.csv', 1024],
      ['notes.txt', 12],
    ],
    ip: '10.0.0.8',
    name: 'report.csv',
    info: '{"peer":"987654321"}',
    created_at: '2026-10-29T05:00:00Z',
  },
  {
    id: 10,
    organization_id: 1,
    device_id: 5,
    rustdesk_id: '123456789',
    direction: 'receive',
    files: 'oops' as unknown as FileLog['files'],
    created_at: '2026-10-29T04:00:00Z',
  },
  {
    id: 11,
    organization_id: 1,
    device_id: 5,
    rustdesk_id: '123456789',
    direction: 'receive',
    file_count: 12,
    files: Array.from({ length: 12 }, (_, index) => [`f${index + 1}.bin`, index + 1]),
    created_at: '2026-10-29T03:00:00Z',
  },
]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup(
  kind: 'connections' | 'files',
  options: {
    canReadDevices?: boolean
    page?: number
    total?: number
    status?: number
  } = {},
) {
  const { canReadDevices = true, page = 1, total = 2, status = 200 } = options
  const requests: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    requests.push(url)
    if (url.includes('/devices')) return json({ code: 'ok', message: 'ok', data: devices })
    if (url.includes('/connection-logs')) {
      if (status !== 200) return json({ code: 'forbidden', message: 'forbidden' }, status)
      return json({
        code: 'ok',
        message: 'ok',
        data: { items: connections, page, page_size: 50, total },
      })
    }
    if (url.includes('/file-logs')) {
      if (status !== 200) return json({ code: 'forbidden', message: 'forbidden' }, status)
      return json({ code: 'ok', message: 'ok', data: { items: files, page, page_size: 50, total } })
    }
    return json({ code: 'ok', message: 'ok', data: null })
  })
  const onChangePage = vi.fn()
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  const Tab = kind === 'connections' ? ConnectionLogTab : FileLogTab
  render(
    <Provider store={store}>
      <Tab
        orgId={1}
        filters={{ ...DEFAULT_AUDIT_FILTERS, tab: kind, page }}
        now={new Date('2026-10-29T06:00:00.000Z')}
        refreshSignal={0}
        onChangePage={onChangePage}
        canReadDevices={canReadDevices}
      />
    </Provider>,
  )
  return { requests, onChangePage }
}

describe('ConnectionLogTab', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders status, device name and client connection ids without a session link', async () => {
    const { requests } = setup('connections')
    expect(await screen.findByText('进行中')).toBeTruthy()
    expect(screen.getByText('已关闭')).toBeTruthy()
    expect(screen.getAllByText('lab-pc')).toHaveLength(2)
    expect(screen.getByText(/conn #12/)).toBeTruthy()
    expect(screen.getByText(/session #34/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /会话/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /会话/ })).toBeNull()
    expect(requests.some((url) => url.includes('/sessions'))).toBe(false)

    const rows = await screen.findAllByRole('row')
    expect(within(rows[1]).getAllByRole('cell')[1].textContent).toBe('—')
  })

  it('falls back without device.read and does not request devices', async () => {
    const { requests } = setup('connections', { canReadDevices: false })
    expect((await screen.findAllByText('设备 #5')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/123456789/).length).toBeGreaterThan(0)
    expect(requests.some((url) => url.includes('/devices'))).toBe(false)
  })

  it('clamps an out-of-range page to the last page', async () => {
    const { onChangePage } = setup('connections', { page: 3, total: 51 })
    await waitFor(() => expect(onChangePage).toHaveBeenCalledWith(2))
  })
})

describe('FileLogTab', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders directions and opens a sheet with files and raw info', async () => {
    setup('files')
    expect(await screen.findByText('发送')).toBeTruthy()
    expect(screen.getAllByText('接收').length).toBeGreaterThan(0)
    expect(screen.getByText('/home/lab/report.csv')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: '详情' })[0])
    expect(await screen.findByText('report.csv · 1024')).toBeTruthy()
    expect(screen.getByText('notes.txt · 12')).toBeTruthy()
    expect(screen.getByText(/"peer":"987654321"/)).toBeTruthy()
    expect(screen.queryByText('仅展示前 10 项')).toBeNull()
  })

  it('renders a malformed files payload without crashing', async () => {
    setup('files')
    await screen.findAllByText('接收')
    fireEvent.click(screen.getAllByRole('button', { name: '详情' })[1])
    expect((await screen.findAllByText('—')).length).toBeGreaterThan(0)
    expect(screen.queryByText('仅展示前 10 项')).toBeNull()
  })

  it('notes that only the first ten files are shown', async () => {
    setup('files', { total: 3 })
    await waitFor(() => expect(screen.getAllByRole('button', { name: '详情' })).toHaveLength(3))
    fireEvent.click(screen.getAllByRole('button', { name: '详情' })[2])
    expect(await screen.findByText('仅展示前 10 项')).toBeTruthy()
    expect(screen.getByText('f10.bin · 10')).toBeTruthy()
  })

  it('maps a 403 to Chinese copy and offers a retry', async () => {
    setup('files', { status: 403, total: 0 })
    expect(await screen.findByText(/当前角色没有审计读取权限/)).toBeTruthy()
    expect(screen.queryByText('forbidden')).toBeNull()
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
  })
})
