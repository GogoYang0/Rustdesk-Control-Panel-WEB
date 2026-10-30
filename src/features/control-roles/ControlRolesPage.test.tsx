import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CONTROL_PERMISSION_KEYS } from '../../lib/control-role'
import { panelApi } from '../../store/api'
import ControlRolesPage from './ControlRolesPage'

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

function permissions(overrides: Record<string, string> = {}) {
  return Object.fromEntries(
    CONTROL_PERMISSION_KEYS.map((key) => [key, overrides[key] ?? 'use_client']),
  )
}

function role(id: number, name: string, kind: 'default' | 'custom', perms = {}) {
  return {
    id,
    name,
    kind,
    builtin: kind === 'default',
    permissions: permissions(perms),
    created_at: '2026-10-29T05:00:00Z',
    updated_at: '2026-10-29T05:00:00Z',
  }
}

function member(userId: number, email: string, controlRoleId: number | null) {
  return {
    id: userId,
    user_id: userId,
    email,
    role: userId === 1 ? 'owner' : 'member',
    role_id: 1,
    role_name: userId === 1 ? 'Owner' : 'Member',
    control_role_id: controlRoleId,
    disabled: false,
    created_at: '2026-10-29T05:00:00Z',
  }
}

function setup(
  options: {
    permissions?: string[]
    roles?: Record<string, unknown>[]
    members?: Record<string, unknown>[]
    membersError?: number
    rolesStatus?: number
    membersGate?: Promise<void>
  } = {},
) {
  const {
    permissions: perms = ['control_role.manage'],
    roles = [
      role(1, 'Default', 'default', { keyboard: 'enable' }),
      role(2, 'Ops', 'custom', { file: 'disable' }),
    ],
    members = [member(1, 'owner@acme.local', 1), member(2, 'ops@acme.local', null)],
    membersError = 0,
    rolesStatus = 0,
    membersGate,
  } = options
  let membersCalls = 0
  const roleRows = roles.map((row) => ({
    ...row,
    permissions: { ...(row.permissions as object) },
  })) as ReturnType<typeof role>[]
  const memberRows = members.map((row) => ({ ...row })) as ReturnType<typeof member>[]
  const requests: { method: string; url: string; body: string }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = String(init?.method ?? 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? init.body : ''
    requests.push({ method, url, body })
    if (url.endsWith('/me')) return json({ code: 'ok', message: 'ok', data: me(perms) })
    if (url.includes('/members/') && url.endsWith('/control-role')) {
      const userId = Number(url.match(/members\/(\d+)\/control-role/)?.[1])
      const parsed = JSON.parse(body) as { control_role_id: number | null }
      const target = memberRows.find((row) => row.user_id === userId)
      if (target) target.control_role_id = parsed.control_role_id
      return json({ code: 'ok', message: 'ok', data: null })
    }
    if (url.endsWith('/members')) {
      membersCalls += 1
      if (membersCalls > 1 && membersGate) await membersGate
      if (membersError) {
        return json({ code: 'internal', message: 'members locked' }, membersError)
      }
      return json({ code: 'ok', message: 'ok', data: memberRows })
    }
    if (url.endsWith('/control-roles') && method === 'POST') {
      const parsed = JSON.parse(body) as { name: string; permissions: Record<string, string> }
      const created = role(3, parsed.name, 'custom', parsed.permissions)
      roleRows.push(created)
      return json({ code: 'ok', message: 'ok', data: created }, 201)
    }
    if (url.match(/\/control-roles\/\d+$/) && method === 'PATCH') {
      const id = Number(url.match(/control-roles\/(\d+)/)?.[1])
      const parsed = JSON.parse(body) as { name?: string; permissions?: Record<string, string> }
      const target = roleRows.find((row) => row.id === id)
      if (target) {
        if (parsed.name) target.name = parsed.name
        if (parsed.permissions) target.permissions = permissions(parsed.permissions)
      }
      return json({ code: 'ok', message: 'ok', data: target })
    }
    if (url.match(/\/control-roles\/\d+$/) && method === 'DELETE') {
      const id = Number(url.match(/control-roles\/(\d+)/)?.[1])
      const index = roleRows.findIndex((row) => row.id === id)
      if (index >= 0) roleRows.splice(index, 1)
      return json({ code: 'ok', message: 'ok', data: null })
    }
    if (url.endsWith('/control-roles')) {
      if (rolesStatus) {
        return json({ code: 'internal', message: 'roles locked' }, rolesStatus)
      }
      return json({ code: 'ok', message: 'ok', data: roleRows })
    }
    return json({ code: 'ok', message: 'ok', data: null })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/orgs/1/control-roles']}>
        <Routes>
          <Route path="/orgs/:orgId/control-roles" element={<ControlRolesPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
  return { requests, roleRows, memberRows }
}

describe('ControlRolesPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('gates the page without control_role.manage and makes no data requests', async () => {
    const { requests } = setup({ permissions: ['device.read'] })
    expect(await screen.findByText(/没有控制角色管理权限/)).toBeTruthy()
    expect(requests.some((request) => request.url.includes('/control-roles'))).toBe(false)
    expect(requests.some((request) => request.url.endsWith('/members'))).toBe(false)
  })

  it('lists roles with builtin first and derives member counts from members', async () => {
    setup()
    expect((await screen.findAllByText('Default')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('Ops')).length).toBeGreaterThan(0)
    const rows = within(screen.getAllByRole('table')[0]).getAllByRole('row').slice(1)
    expect(rows[0].textContent).toContain('Default')
    expect(within(rows[0]).getByText('2')).toBeTruthy()
    expect(rows[0].textContent).toContain('允许 1')
    expect(rows[1].textContent).toContain('拒绝 1')
  })

  it('creates a role with the complete 14-key map', async () => {
    const { requests } = setup()
    await screen.findAllByText('Ops')
    fireEvent.click(screen.getByRole('button', { name: '新建角色' }))
    const dialog = await screen.findByRole('dialog', { name: '新建控制角色' })
    fireEvent.change(within(dialog).getByLabelText('名称'), { target: { value: '观察者' } })
    const keyboard = within(dialog).getByRole('group', { name: '键盘与鼠标' })
    fireEvent.click(within(keyboard).getByRole('button', { name: '允许' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(requests.some((request) => request.method === 'POST')).toBe(true))
    const post = requests.find((request) => request.method === 'POST')
    const payload = JSON.parse(post?.body ?? '{}') as {
      name: string
      permissions: Record<string, string>
    }
    expect(payload.name).toBe('观察者')
    expect(Object.keys(payload.permissions)).toHaveLength(14)
    expect(payload.permissions.keyboard).toBe('enable')
    expect(payload.permissions.usb).toBe('use_client')
  })

  it('locks the Default name but still updates its permissions', async () => {
    const { requests } = setup()
    await screen.findAllByText('Default')
    const rows = within(screen.getAllByRole('table')[0]).getAllByRole('row').slice(1)
    fireEvent.click(within(rows[0]).getByRole('button', { name: '编辑' }))
    const dialog = await screen.findByRole('dialog', { name: /编辑控制角色/ })
    expect((within(dialog).getByLabelText('名称') as HTMLInputElement).disabled).toBe(true)
    const file = within(dialog).getByRole('group', { name: '文件传输' })
    fireEvent.click(within(file).getByRole('button', { name: '拒绝' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(requests.some((request) => request.method === 'PATCH')).toBe(true))
    const patch = requests.find((request) => request.method === 'PATCH')
    const payload = JSON.parse(patch?.body ?? '{}') as {
      name?: string
      permissions: Record<string, string>
    }
    expect(payload.name).toBeUndefined()
    expect(Object.keys(payload.permissions)).toHaveLength(14)
    expect(payload.permissions.keyboard).toBe('enable')
    expect(payload.permissions.file).toBe('disable')
  })

  it('deletes a custom role and never offers delete for Default', async () => {
    const { requests, roleRows } = setup()
    await screen.findAllByText('Ops')
    const rows = within(screen.getAllByRole('table')[0]).getAllByRole('row').slice(1)
    expect(within(rows[0]).queryByRole('button', { name: '删除' })).toBeNull()
    fireEvent.click(within(rows[1]).getByRole('button', { name: '删除' }))
    const dialog = await screen.findByRole('dialog', { name: /删除控制角色/ })
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))
    await waitFor(() => expect(roleRows.some((row) => row.name === 'Ops')).toBe(false))
    expect(requests.some((request) => request.method === 'DELETE')).toBe(true)
  })

  it('assigns and clears a member control role', async () => {
    const { requests, memberRows } = setup()
    await screen.findByText('成员控制角色')
    const select = (await screen.findByLabelText('控制角色 ops@acme.local')) as HTMLSelectElement
    fireEvent.change(select, { target: { value: '2' } })
    await waitFor(() =>
      expect(memberRows.find((row) => row.user_id === 2)?.control_role_id).toBe(2),
    )
    let put = requests.filter((request) => request.method === 'PUT').at(-1)
    expect(JSON.parse(put?.body ?? '{}')).toEqual({ control_role_id: 2 })

    fireEvent.change(screen.getByLabelText('控制角色 ops@acme.local'), {
      target: { value: '' },
    })
    await waitFor(() =>
      expect(memberRows.find((row) => row.user_id === 2)?.control_role_id).toBeNull(),
    )
    put = requests.filter((request) => request.method === 'PUT').at(-1)
    expect(JSON.parse(put?.body ?? '{}')).toEqual({ control_role_id: null })
  })

  it('shows missing member counts instead of zero on a members error', async () => {
    setup({ membersError: 500 })
    await screen.findAllByText('Default')
    const rows = within(screen.getAllByRole('table')[0]).getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('—')).toBeTruthy()
    expect(await screen.findByText(/加载成员失败/)).toBeTruthy()
  })

  it('saves an unchanged role with the complete original map', async () => {
    const { requests } = setup()
    await screen.findAllByText('Ops')
    const rows = within(screen.getAllByRole('table')[0]).getAllByRole('row').slice(1)
    fireEvent.click(within(rows[1]).getByRole('button', { name: '编辑' }))
    const dialog = await screen.findByRole('dialog', { name: /编辑控制角色/ })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(requests.some((request) => request.method === 'PATCH')).toBe(true))
    const payload = JSON.parse(
      requests.find((request) => request.method === 'PATCH')?.body ?? '{}',
    ) as {
      name: string
      permissions: Record<string, string>
    }
    expect(payload.name).toBe('Ops')
    expect(Object.keys(payload.permissions)).toHaveLength(14)
    expect(payload.permissions.file).toBe('disable')
    expect(payload.permissions.keyboard).toBe('use_client')
  })

  it('disables assignment while the role dictionary is unavailable', async () => {
    setup({ rolesStatus: 500 })
    expect(await screen.findByText(/加载控制角色失败/)).toBeTruthy()
    expect(await screen.findByText(/加载控制角色字典失败/)).toBeTruthy()
    expect((screen.getByLabelText('控制角色 ops@acme.local') as HTMLSelectElement).disabled).toBe(
      true,
    )
  })

  it('keeps disabled members visible with their assigned role', async () => {
    setup({
      members: [
        member(1, 'owner@acme.local', 1),
        { ...member(2, 'ops@acme.local', 2), disabled: true },
      ],
    })
    await screen.findByText('成员控制角色')
    const select = (await screen.findByLabelText('控制角色 ops@acme.local')) as HTMLSelectElement
    expect(select.value).toBe('2')
    expect(screen.getByText('停用')).toBeTruthy()
  })

  it('disables assignment while members refetch in the background', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    setup({ membersGate: gate })
    await screen.findByText('成员控制角色')
    const select = (await screen.findByLabelText('控制角色 ops@acme.local')) as HTMLSelectElement
    fireEvent.change(select, { target: { value: '2' } })
    await waitFor(() => expect(select.disabled).toBe(true))
    release()
    await waitFor(() => expect(select.disabled).toBe(false))
  })
})
