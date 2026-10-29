import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UserGroup } from '../../lib/api'
import { panelApi } from '../../store/api'
import UserGroupsTab from './UserGroupsTab'

const members = [
  {
    id: 1,
    user_id: 1,
    email: 'owner@acme.local',
    role_name: 'owner',
    disabled: false,
    created_at: '2026-10-29T00:00:00Z',
  },
  {
    id: 2,
    user_id: 2,
    email: 'ops@acme.local',
    role_name: 'member',
    disabled: true,
    created_at: '2026-10-29T00:00:00Z',
  },
]

function group(overrides: Partial<UserGroup> = {}): UserGroup {
  return {
    id: 10,
    name: 'Finance',
    kind: 'custom',
    member_ids: [1],
    created_at: '2026-10-29T00:00:00Z',
    updated_at: '2026-10-29T00:00:00Z',
    ...overrides,
  }
}

function everyone(): UserGroup {
  return group({ id: 1, name: 'everyone', kind: 'everyone', member_ids: [] })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup(initialGroups: UserGroup[] = [everyone(), group()]) {
  let groups = initialGroups
  const requests: { method: string; url: string; body: unknown }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({ method, url, body })
    if (url.includes('/members') && method === 'PUT') {
      return json({ code: 'ok', data: { added: 1, removed: 0 } })
    }
    if (url.includes('/members')) return json({ code: 'ok', data: members })
    if (url.includes('/user-groups') && method === 'GET') {
      return json({ code: 'ok', data: groups })
    }
    if (url.includes('/user-groups') && method === 'POST') {
      return json({ code: 'ok', data: group({ id: 11, name: body.name }) }, 201)
    }
    if (url.includes('/user-groups') && method === 'PATCH') {
      return json({ code: 'ok', data: group({ name: body.name }) })
    }
    if (url.includes('/user-groups') && method === 'DELETE') {
      return json({ code: 'ok', data: { removed_rules: 2, removed_grants: 1 } })
    }
    return json({ code: 'ok', data: [] })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  render(
    <Provider store={store}>
      <UserGroupsTab orgId={1} />
    </Provider>,
  )
  return {
    requests,
    setGroups(next: UserGroup[]) {
      groups = next
    },
  }
}

describe('UserGroupsTab', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders everyone as implicit membership and custom counts', async () => {
    setup()
    expect(await screen.findByText('Finance')).toBeTruthy()
    expect(screen.getByText('全部有效成员')).toBeTruthy()
    expect(screen.getByText('1 人')).toBeTruthy()
    expect(screen.getByText('保留组')).toBeTruthy()
    const everyoneRow = screen.getByText('everyone').closest('tr') as HTMLElement
    expect(within(everyoneRow).queryByRole('button', { name: '成员' })).toBeNull()
  })

  it('creates a user group with a trimmed name', async () => {
    const { requests } = setup()
    await screen.findByText('Finance')
    fireEvent.click(screen.getByRole('button', { name: '新建用户组' }))
    fireEvent.change(screen.getByLabelText('用户组名称'), { target: { value: ' Ops ' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(
        requests.some(
          (request) => request.method === 'POST' && request.url.endsWith('/user-groups'),
        ),
      ).toBe(true),
    )
    const post = requests.find((request) => request.method === 'POST')
    expect(post?.body).toEqual({ name: 'Ops' })
  })

  it('replaces the full member set and keeps disabled members visible', async () => {
    const { requests } = setup([everyone(), group({ member_ids: [1] })])
    await screen.findByText('Finance')
    fireEvent.click(screen.getByRole('button', { name: '成员' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('停用')).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('checkbox', { name: /ops@acme\.local/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(requests.some((request) => request.method === 'PUT')).toBe(true))
    const put = requests.find((request) => request.method === 'PUT')
    expect(put?.url).toContain('/user-groups/10/members')
    expect(put?.body).toEqual({ user_ids: [1, 2] })
  })

  it('aborts when the member set changed after the dialog opened', async () => {
    const { requests, setGroups } = setup()
    await screen.findByText('Finance')
    fireEvent.click(screen.getByRole('button', { name: '成员' }))
    const dialog = await screen.findByRole('dialog')

    setGroups([everyone(), group({ member_ids: [1, 2] })])
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))

    expect(await within(dialog).findByText(/已被其他人修改/)).toBeTruthy()
    expect(requests.some((request) => request.method === 'PUT')).toBe(false)
  })

  it('deletes a custom group and reports the cascade', async () => {
    const { requests } = setup()
    await screen.findByText('Finance')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    const dialog = await screen.findByRole('dialog', { name: '删除用户组' })
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))

    await waitFor(() =>
      expect(
        requests.some(
          (request) => request.method === 'DELETE' && request.url.endsWith('/user-groups/10'),
        ),
      ).toBe(true),
    )
  })
})
