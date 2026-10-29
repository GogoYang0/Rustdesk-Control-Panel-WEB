import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DeviceGroup } from '../../lib/api'
import { panelApi } from '../../store/api'
import DeviceGroupsTab from './DeviceGroupsTab'

const devices = [
  {
    id: 1,
    organization_id: 1,
    rustdesk_id: '111111111',
    name: 'Lab-1',
    owner_user_id: 1,
    device_group_id: 9,
    disabled: false,
    created_at: '',
    updated_at: '',
  },
  {
    id: 2,
    organization_id: 1,
    rustdesk_id: '222222222',
    name: 'Lab-2',
    owner_user_id: 1,
    device_group_id: 20,
    disabled: false,
    created_at: '',
    updated_at: '',
  },
]

function group(overrides: Partial<DeviceGroup> = {}): DeviceGroup {
  return {
    id: 9,
    name: 'Ops',
    device_ids: [1],
    strategy_id: null,
    created_at: '2026-10-29T00:00:00Z',
    updated_at: '2026-10-29T00:00:00Z',
    ...overrides,
  }
}

function initialGroups(): DeviceGroup[] {
  return [group(), group({ id: 20, name: 'Other', device_ids: [2] })]
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup(groups = initialGroups(), total = 2) {
  let current = groups
  const requests: { method: string; url: string; body: unknown }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({ method, url, body })
    if (url.includes('/device-groups') && method === 'GET') {
      return json({ code: 'ok', data: current })
    }
    if (url.includes('/device-groups') && method === 'POST') {
      return json({ code: 'ok', data: group({ id: 30, name: body.name }) }, 201)
    }
    if (url.includes('/device-groups') && method === 'PATCH') {
      return json({ code: 'ok', data: group({ name: body.name }) })
    }
    if (url.includes('/device-groups') && method === 'DELETE') {
      return json({ code: 'ok', data: { removed_rules: 1, ungrouped_devices: 1 } })
    }
    if (url.includes('/devices') && method === 'GET') {
      const page = Number(new URL(url, 'http://x').searchParams.get('page') ?? 1)
      return json({
        code: 'ok',
        data: { items: page === 1 ? devices : [], page, page_size: 200, total },
      })
    }
    if (url.includes('/devices') && method === 'PUT') {
      return json({ code: 'ok', data: { added: 1, removed: 0 } })
    }
    return json({ code: 'ok', data: [] })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  render(
    <Provider store={store}>
      <DeviceGroupsTab orgId={1} />
    </Provider>,
  )
  return {
    requests,
    setGroups(next: DeviceGroup[]) {
      current = next
    },
  }
}

describe('DeviceGroupsTab', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders device counts and strategy ids', async () => {
    setup([group({ strategy_id: 4 }), group({ id: 20, name: 'Other', device_ids: [2] })])
    expect(await screen.findByText('Ops')).toBeTruthy()
    const row = screen.getByText('Ops').closest('tr') as HTMLElement
    expect(within(row).getByText('策略 #4')).toBeTruthy()
    expect(within(row).getByText('1')).toBeTruthy()
  })

  it('moves a device from another group and saves the full set', async () => {
    const { requests } = setup()
    await screen.findByText('Ops')
    fireEvent.click(
      within(screen.getByText('Ops').closest('tr') as HTMLElement).getByRole('button', {
        name: '设备',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('Lab-2')).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Lab-2/ }))
    expect(within(dialog).getByText(/从 Other 移入/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(requests.some((request) => request.method === 'PUT')).toBe(true))
    const put = requests.find((request) => request.method === 'PUT')
    expect(put?.url).toContain('/device-groups/9/devices')
    expect(put?.body).toEqual({ device_ids: [1, 2] })
  })

  it('aborts when the device set changed after the dialog opened', async () => {
    const { requests, setGroups } = setup()
    await screen.findByText('Ops')
    fireEvent.click(
      within(screen.getByText('Ops').closest('tr') as HTMLElement).getByRole('button', {
        name: '设备',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('Lab-1')

    setGroups(
      initialGroups().map((item) => (item.id === 9 ? { ...item, device_ids: [1, 2] } : item)),
    )
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))

    expect(await within(dialog).findByText(/已被其他人修改/)).toBeTruthy()
    expect(requests.some((request) => request.method === 'PUT')).toBe(false)
  })

  it('disables device editing when the organization exceeds the picker cap', async () => {
    setup(initialGroups(), 2001)
    await screen.findByText('Ops')
    fireEvent.click(
      within(screen.getByText('Ops').closest('tr') as HTMLElement).getByRole('button', {
        name: '设备',
      }),
    )
    const dialog = await screen.findByRole('dialog')

    expect(await within(dialog).findByText(/2000 台上限/)).toBeTruthy()
    expect(
      (within(dialog).getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('deletes a device group and reports ungrouped devices', async () => {
    const { requests } = setup()
    await screen.findByText('Ops')
    fireEvent.click(
      within(screen.getByText('Ops').closest('tr') as HTMLElement).getByRole('button', {
        name: '删除',
      }),
    )
    const dialog = await screen.findByRole('dialog', { name: '删除设备组' })
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))

    await waitFor(() =>
      expect(
        requests.some(
          (request) => request.method === 'DELETE' && request.url.endsWith('/device-groups/9'),
        ),
      ).toBe(true),
    )
  })
})
