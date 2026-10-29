import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AccessRule } from '../../lib/api'
import { panelApi } from '../../store/api'
import RulesTab from './RulesTab'

const groups = [
  {
    id: 1,
    name: 'everyone',
    kind: 'everyone',
    member_ids: [],
    created_at: '',
    updated_at: '',
  },
  {
    id: 3,
    name: 'Finance',
    kind: 'custom',
    member_ids: [],
    created_at: '',
    updated_at: '',
  },
]

const deviceGroups = [
  { id: 9, name: 'Ops', device_ids: [], strategy_id: null, created_at: '', updated_at: '' },
]

function rule(overrides: Partial<AccessRule> = {}): AccessRule {
  return {
    id: 5,
    source_group_id: 1,
    source_group_name: 'everyone',
    target_kind: 'device_group',
    target_group_id: 9,
    target_group_name: 'Ops',
    created_at: '2026-10-29T00:00:00Z',
    ...overrides,
  }
}

const defaultRule = rule({
  id: 6,
  target_kind: 'all_devices',
  target_group_id: null,
  target_group_name: '',
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup(rules: AccessRule[] = [rule(), defaultRule]) {
  const requests: { method: string; url: string; body: unknown }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({ method, url, body })
    if (url.includes('/access-rules') && method === 'GET') {
      return json({ code: 'ok', data: rules })
    }
    if (url.includes('/access-rules') && method === 'POST') {
      return json({ code: 'ok', data: rule({ id: 7 }) }, 201)
    }
    if (url.includes('/access-rules') && method === 'DELETE') {
      return json({ code: 'ok' })
    }
    if (url.includes('/user-groups')) return json({ code: 'ok', data: groups })
    if (url.includes('/device-groups')) return json({ code: 'ok', data: deviceGroups })
    return json({ code: 'ok', data: [] })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  render(
    <Provider store={store}>
      <RulesTab orgId={1} />
    </Provider>,
  )
  return { requests }
}

describe('RulesTab', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists source, target kind and name', async () => {
    setup()
    expect(await screen.findByText('Ops')).toBeTruthy()
    expect(screen.getAllByText('设备组').length).toBeGreaterThan(0)
    expect(screen.getAllByText('全部设备').length).toBeGreaterThan(0)
    expect(screen.getAllByText('保留组').length).toBeGreaterThan(0)
  })

  it('creates a device-group rule with the selected target', async () => {
    const { requests } = setup()
    await screen.findByText('Ops')
    fireEvent.click(screen.getByRole('button', { name: '新建规则' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('来源用户组'), {
      target: { value: '3' },
    })
    fireEvent.change(within(dialog).getByLabelText('目标设备组'), {
      target: { value: '9' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(requests.some((request) => request.method === 'POST')).toBe(true))
    const post = requests.find((request) => request.method === 'POST')
    expect(post?.body).toEqual({
      source_group_id: 3,
      target_kind: 'device_group',
      target_group_id: 9,
    })
  })

  it('creates an all-devices rule without a target id', async () => {
    const { requests } = setup([])
    await screen.findByText('还没有访问规则')
    fireEvent.click(screen.getByRole('button', { name: '新建规则' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('来源用户组'), {
      target: { value: '3' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '全部设备' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(requests.some((request) => request.method === 'POST')).toBe(true))
    const post = requests.find((request) => request.method === 'POST')
    expect(post?.body).toEqual({ source_group_id: 3, target_kind: 'all_devices' })
  })

  it('creates a user-group rule with the selected group', async () => {
    const { requests } = setup([])
    await screen.findByText('还没有访问规则')
    fireEvent.click(screen.getByRole('button', { name: '新建规则' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('来源用户组'), {
      target: { value: '3' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '用户组' }))
    fireEvent.change(within(dialog).getByLabelText('目标用户组'), {
      target: { value: '1' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(requests.some((request) => request.method === 'POST')).toBe(true))
    const post = requests.find((request) => request.method === 'POST')
    expect(post?.body).toEqual({
      source_group_id: 3,
      target_kind: 'user_group',
      target_group_id: 1,
    })
  })

  it('disables a duplicate source/target rule', async () => {
    setup()
    await screen.findByText('Ops')
    fireEvent.click(screen.getByRole('button', { name: '新建规则' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('来源用户组'), {
      target: { value: '1' },
    })
    fireEvent.change(within(dialog).getByLabelText('目标设备组'), {
      target: { value: '9' },
    })
    expect(await within(dialog).findByText(/不能重复创建/)).toBeTruthy()
    expect(
      (within(dialog).getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('warns before deleting the default rule', async () => {
    setup()
    await screen.findByText('Ops')
    const row = screen.getAllByText('全部设备')[0].closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '删除' }))

    const dialog = await screen.findByRole('dialog', { name: '删除访问规则' })
    expect(within(dialog).getByText(/不会自动重建/)).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: '删除默认规则' })).toBeTruthy()
  })

  it('deletes a normal rule', async () => {
    const { requests } = setup()
    await screen.findByText('Ops')
    const row = screen.getByText('Ops').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '删除' }))
    const dialog = await screen.findByRole('dialog', { name: '删除访问规则' })
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))

    await waitFor(() =>
      expect(
        requests.some(
          (request) => request.method === 'DELETE' && request.url.endsWith('/access-rules/5'),
        ),
      ).toBe(true),
    )
  })
})
