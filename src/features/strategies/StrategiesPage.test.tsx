import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import StrategiesPage from './StrategiesPage'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function me(perms: string[]) {
  return {
    user: { id: 1, email: 'owner@acme.local' },
    orgs: [{ id: 1, name: 'ACME', role_kind: 'owner', permissions: perms }],
  }
}

function strategy(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: '基线',
    config_options: { 'enable-audio': 'Y' },
    cleared_keys: [],
    version: 3,
    enabled: true,
    created_at: '2026-10-29T05:00:00Z',
    updated_at: '2026-10-29T05:00:00Z',
    ...overrides,
  }
}

function member(strategyId: number | null = null) {
  return {
    id: 2,
    user_id: 2,
    email: 'ops@acme.local',
    role: 'member',
    role_id: 2,
    role_name: 'Member',
    strategy_id: strategyId,
    disabled: false,
    created_at: '2026-10-29T05:00:00Z',
  }
}

function setup(
  options: {
    permissions?: string[]
    strategies?: Record<string, unknown>[]
    groupsError?: number
    strategiesError?: number
    members?: Record<string, unknown>[]
  } = {},
) {
  const {
    permissions = ['strategy.manage', 'access.manage'],
    strategies = [strategy()],
    groupsError = 0,
    strategiesError = 0,
    members = [member()],
  } = options
  const strategyRows = strategies.map((row) => ({ ...row })) as ReturnType<typeof strategy>[]
  const memberRows = members.map((row) => ({ ...row }))
  const requests: { method: string; url: string; body: string }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = String(init?.method ?? 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? init.body : ''
    requests.push({ method, url, body })
    if (url.endsWith('/me')) return json({ code: 'ok', message: 'ok', data: me(permissions) })
    if (url.match(/\/members\/\d+\/strategy$/) && method === 'PUT') {
      const parsed = JSON.parse(body) as { strategy_id: number | null }
      memberRows[0].strategy_id = parsed.strategy_id
      return json({ code: 'ok', message: 'ok', data: null })
    }
    if (url.endsWith('/members')) return json({ code: 'ok', message: 'ok', data: memberRows })
    if (url.includes('/device-groups') && method === 'GET') {
      if (groupsError) {
        return json({ code: 'forbidden', message: 'access.manage required' }, groupsError)
      }
      return json({
        code: 'ok',
        message: 'ok',
        data: [{ id: 5, name: '研发组', device_ids: [3], strategy_id: null }],
      })
    }
    if (url.match(/\/devices\/\d+\/strategy$/) && method === 'PUT') {
      return json({ code: 'ok', message: 'ok', data: null })
    }
    if (url.includes('/devices?')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: {
          items: [{ id: 3, name: '工作站', rustdesk_id: '100000001', strategy_id: null }],
          page: 1,
          page_size: 50,
          total: 1,
        },
      })
    }
    if (url.match(/\/strategies\/\d+$/) && method === 'PATCH') {
      const parsed = JSON.parse(body) as Record<string, unknown>
      Object.assign(strategyRows[0], parsed)
      return json({ code: 'ok', message: 'ok', data: strategyRows[0] })
    }
    if (url.match(/\/strategies\/\d+$/) && method === 'DELETE') {
      strategyRows.splice(0, 1)
      return json({ code: 'ok', message: 'ok', data: null })
    }
    if (url.endsWith('/strategies') && method === 'POST') {
      const parsed = JSON.parse(body) as { name: string; config_options: Record<string, string> }
      const created = strategy({
        id: 9,
        name: parsed.name,
        config_options: parsed.config_options,
        version: 4,
      })
      strategyRows.push(created)
      return json({ code: 'ok', message: 'ok', data: created }, 201)
    }
    if (url.endsWith('/strategies')) {
      if (strategiesError) {
        return json({ code: 'internal', message: 'strategies locked' }, strategiesError)
      }
      return json({ code: 'ok', message: 'ok', data: strategyRows })
    }
    return json({ code: 'ok', message: 'ok', data: null })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/orgs/1/strategies']}>
        <Routes>
          <Route path="/orgs/:orgId/strategies" element={<StrategiesPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
  return { requests, strategyRows, memberRows }
}

describe('StrategiesPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('gates the page without strategy.manage', async () => {
    const { requests } = setup({ permissions: ['device.read'] })
    expect(await screen.findByText(/没有客户端策略管理权限/)).toBeTruthy()
    expect(requests.some((request) => request.url.includes('/strategies'))).toBe(false)
  })

  it('lists strategies with key count and version', async () => {
    setup()
    expect(await screen.findAllByText('基线')).toBeTruthy()
    expect(screen.getAllByText('启用').length).toBeGreaterThan(0)
    expect(screen.getAllByText('3').length).toBeGreaterThan(0)
    expect(screen.getByText('三层分配')).toBeTruthy()
    expect(screen.getAllByText(/设备 > 设备组 > 成员/).length).toBeGreaterThan(0)
  })

  it('creates a strategy with only the checked keys', async () => {
    const { requests } = setup()
    await screen.findAllByText('基线')
    fireEvent.click(screen.getByRole('button', { name: '新建策略' }))
    const dialog = await screen.findByRole('dialog', { name: '新建客户端策略' })
    fireEvent.change(within(dialog).getByLabelText('名称'), { target: { value: '新策略' } })
    fireEvent.click(within(dialog).getByLabelText('下发 启用声音'))
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(requests.some((request) => request.method === 'POST')).toBe(true))
    const payload = JSON.parse(requests.find((request) => request.method === 'POST')?.body ?? '{}')
    expect(payload.name).toBe('新策略')
    expect(payload.config_options).toEqual({ 'enable-audio': 'Y' })
  })

  it('round-trips a present empty value and the enabled flag on edit', async () => {
    const { requests } = setup({
      strategies: [strategy({ config_options: { 'enable-audio': '' } })],
    })
    await screen.findAllByText('基线')
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const dialog = await screen.findByRole('dialog', { name: /编辑客户端策略/ })
    expect((within(dialog).getByLabelText('下发 启用声音') as HTMLInputElement).checked).toBe(true)
    expect((within(dialog).getByLabelText('值 启用声音') as HTMLInputElement).value).toBe('')
    fireEvent.click(within(dialog).getByLabelText('启用策略'))
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(requests.some((request) => request.method === 'PATCH')).toBe(true))
    const payload = JSON.parse(requests.find((request) => request.method === 'PATCH')?.body ?? '{}')
    expect(payload.config_options).toEqual({ 'enable-audio': '' })
    expect(payload.enabled).toBe(false)
  })

  it('assigns and clears the member default strategy', async () => {
    const { requests, memberRows } = setup()
    await screen.findAllByText('基线')
    const select = (await screen.findByLabelText('策略 ops@acme.local')) as HTMLSelectElement
    fireEvent.change(select, { target: { value: '1' } })
    await waitFor(() => expect(memberRows[0].strategy_id).toBe(1))
    await waitFor(() =>
      expect(screen.getByLabelText('策略 ops@acme.local')).toHaveProperty('value', '1'),
    )
    expect(requests.filter((request) => request.url.endsWith('/members')).length).toBeGreaterThan(1)
    expect(JSON.parse(requests.find((r) => r.method === 'PUT')?.body ?? '{}')).toEqual({
      strategy_id: 1,
    })
    fireEvent.change(screen.getByLabelText('策略 ops@acme.local'), { target: { value: '' } })
    await waitFor(() => expect(memberRows[0].strategy_id).toBeNull())
    expect(JSON.parse(requests.filter((r) => r.method === 'PUT').at(-1)?.body ?? '{}')).toEqual({
      strategy_id: null,
    })
  })

  it('shows a specific 403 on the device-group tab', async () => {
    setup({ groupsError: 403 })
    await screen.findAllByText('基线')
    fireEvent.click(screen.getByRole('tab', { name: '设备组' }))
    expect(await screen.findByText(/access.manage/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
  })

  it('searches devices by the server query and assigns one', async () => {
    const { requests } = setup()
    await screen.findAllByText('基线')
    fireEvent.click(screen.getByRole('tab', { name: '设备' }))
    const input = await screen.findByLabelText('搜索设备')
    fireEvent.change(input, { target: { value: '工作站' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await waitFor(() =>
      expect(
        requests.some(
          (request) =>
            request.url.includes('/devices?') &&
            request.url.includes('q=%E5%B7%A5%E4%BD%9C%E7%AB%99'),
        ),
      ).toBe(true),
    )
    const select = (await screen.findByLabelText('策略 工作站')) as HTMLSelectElement
    fireEvent.change(select, { target: { value: '1' } })
    await waitFor(() =>
      expect(
        requests.some(
          (request) => request.method === 'PUT' && request.url.includes('/devices/3/strategy'),
        ),
      ).toBe(true),
    )
  })

  it('warns qualitatively and deletes a strategy', async () => {
    const { requests, strategyRows } = setup()
    await screen.findAllByText('基线')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    const dialog = await screen.findByRole('dialog', { name: /删除客户端策略/ })
    expect(within(dialog).getByText(/成员、设备组、设备三层/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))
    await waitFor(() => expect(strategyRows).toHaveLength(0))
    expect(requests.some((request) => request.method === 'DELETE')).toBe(true)
  })
})

it('preserves the loaded configuration on a no-op save', async () => {
  const { requests } = setup()
  await screen.findAllByText('基线')
  fireEvent.click(screen.getByRole('button', { name: '编辑' }))
  const dialog = await screen.findByRole('dialog', { name: /编辑客户端策略/ })
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
  await waitFor(() => expect(requests.some((request) => request.method === 'PATCH')).toBe(true))
  const payload = JSON.parse(requests.find((request) => request.method === 'PATCH')?.body ?? '{}')
  expect(payload.config_options).toEqual({ 'enable-audio': 'Y' })
  expect(payload.enabled).toBe(true)
  expect(screen.getByText('3')).toBeTruthy()
})

it('assigns a device-group strategy with the expected body', async () => {
  const { requests } = setup()
  await screen.findAllByText('基线')
  fireEvent.click(screen.getByRole('tab', { name: '设备组' }))
  const select = (await screen.findByLabelText('策略 研发组')) as HTMLSelectElement
  fireEvent.change(select, { target: { value: '1' } })
  await waitFor(() =>
    expect(
      requests.some(
        (request) => request.method === 'PUT' && request.url.includes('/device-groups/5/strategy'),
      ),
    ).toBe(true),
  )
  expect(JSON.parse(requests.find((r) => r.method === 'PUT')?.body ?? '{}')).toEqual({
    strategy_id: 1,
  })
})

it('disables assignment when the strategy dictionary fails', async () => {
  setup({ strategiesError: 500 })
  expect(await screen.findByText(/加载客户端策略失败/)).toBeTruthy()
  expect(await screen.findByText(/加载策略字典失败/)).toBeTruthy()
  expect((screen.getByLabelText('策略 ops@acme.local') as HTMLSelectElement).disabled).toBe(true)
})
