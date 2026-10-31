import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import RolesPage from './RolesPage'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function me(permissions: string[]) {
  return {
    user: { id: 1, email: 'owner@acme.local' },
    orgs: [{ id: 1, name: 'ACME', role_kind: 'owner', permissions }],
  }
}

const catalog = [
  {
    code: 'role.manage',
    description: 'Create roles',
    delegable: false,
  },
  { code: 'member.manage', description: 'Manage members', delegable: true },
  { code: 'device.read', description: 'Read devices', delegable: true },
  { code: 'audit.read', description: 'Read audit logs', delegable: true },
]

function role(
  id: number,
  name: string,
  kind: 'owner' | 'admin' | 'member' | 'custom',
  permissions: string[],
  audit: 'global' | 'individual' = 'individual',
) {
  return {
    id,
    name,
    kind,
    permissions,
    audit_scope: audit,
    builtin: kind !== 'custom',
    created_at: '2026-10-31T00:00:00Z',
    updated_at: '2026-10-31T00:00:00Z',
  }
}

function setup(
  options: {
    permissions?: string[]
    permissionsStatus?: number
    deleteConflict?: boolean
  } = {},
) {
  const roleRows = [
    role(1, 'owner', 'owner', ['org.admin', 'role.manage'], 'global'),
    role(2, 'Ops', 'custom', ['device.read']),
  ]
  const requests: { method: string; url: string; body: string }[] = []
  let permissionsCalls = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = String(init?.method ?? 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? init.body : ''
    requests.push({ method, url, body })
    if (url.endsWith('/me')) {
      return json({ code: 'ok', message: 'ok', data: me(options.permissions ?? ['role.manage']) })
    }
    if (url.endsWith('/permissions')) {
      permissionsCalls += 1
      if (options.permissionsStatus) {
        return json({ code: 'internal', message: 'catalog down' }, options.permissionsStatus)
      }
      return json({ code: 'ok', message: 'ok', data: catalog })
    }
    if (url.endsWith('/roles') && method === 'POST') {
      const parsed = JSON.parse(body) as {
        name: string
        permissions: string[]
        audit_scope: 'global' | 'individual'
      }
      const created = role(9, parsed.name, 'custom', parsed.permissions, parsed.audit_scope)
      roleRows.push(created)
      return json({ code: 'ok', message: 'ok', data: created }, 201)
    }
    if (url.match(/\/roles\/\d+$/) && method === 'PUT') {
      const id = Number(url.match(/roles\/(\d+)/)?.[1])
      const parsed = JSON.parse(body) as {
        name: string
        permissions: string[]
        audit_scope: 'global' | 'individual'
      }
      const target = roleRows.find((row) => row.id === id)
      if (target) {
        target.name = parsed.name
        target.permissions = parsed.permissions
        target.audit_scope = parsed.audit_scope
      }
      return json({ code: 'ok', message: 'ok', data: target })
    }
    if (url.match(/\/roles\/\d+$/) && method === 'DELETE') {
      if (options.deleteConflict) {
        return json({ code: 'conflict', message: 'role is still assigned' }, 409)
      }
      const id = Number(url.match(/roles\/(\d+)/)?.[1])
      const index = roleRows.findIndex((row) => row.id === id)
      if (index >= 0) roleRows.splice(index, 1)
      return json({ code: 'ok', message: 'ok' })
    }
    if (url.endsWith('/roles')) {
      return json({ code: 'ok', message: 'ok', data: roleRows })
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
      <MemoryRouter initialEntries={['/orgs/1/roles']}>
        <Routes>
          <Route path="/orgs/:orgId/roles" element={<RolesPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
  return { requests, roleRows, permissionsCalls: () => permissionsCalls }
}

describe('RolesPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('disables role writes without role.manage', async () => {
    setup({ permissions: ['device.read'] })
    await screen.findAllByText('Ops')
    expect(
      (screen.getByRole('button', { name: '新建自定义角色' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect((screen.getByRole('button', { name: '编辑' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '删除' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('creates a custom role with permissions and audit scope', async () => {
    const { requests } = setup()
    await screen.findAllByText('Ops')
    fireEvent.click(screen.getByRole('button', { name: '新建自定义角色' }))
    const dialog = await screen.findByRole('dialog', { name: '新建自定义角色' })
    fireEvent.change(within(dialog).getByLabelText(/角色名称/), {
      target: { value: '审计员' },
    })
    expect(
      (within(dialog).getByRole('checkbox', { name: /角色管理/ }) as HTMLInputElement).disabled,
    ).toBe(true)
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /设备只读/ }))
    fireEvent.click(within(dialog).getByLabelText('全组织审计'))
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(requests.some((request) => request.method === 'POST')).toBe(true))
    const post = requests.find((request) => request.method === 'POST')
    expect(JSON.parse(post?.body ?? '{}')).toEqual({
      name: '审计员',
      permissions: ['device.read'],
      audit_scope: 'global',
    })
  })

  it('edits a custom role with a full replacement payload', async () => {
    const { requests } = setup()
    await screen.findAllByText('Ops')
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const dialog = await screen.findByRole('dialog', { name: '编辑角色' })
    fireEvent.change(within(dialog).getByLabelText(/角色名称/), {
      target: { value: 'Ops 2' },
    })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /成员管理/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(requests.some((request) => request.method === 'PUT')).toBe(true))
    const put = requests.find((request) => request.method === 'PUT')
    expect(JSON.parse(put?.body ?? '{}')).toEqual({
      name: 'Ops 2',
      permissions: ['device.read', 'member.manage'],
      audit_scope: 'individual',
    })
  })

  it('keeps the delete dialog open when the role is still assigned', async () => {
    setup({ deleteConflict: true })
    await screen.findAllByText('Ops')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    const dialog = await screen.findByRole('dialog', { name: '删除角色' })
    fireEvent.click(within(dialog).getByRole('button', { name: '删除角色' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('仍被成员使用')
    expect(screen.getByRole('dialog', { name: '删除角色' })).toBeTruthy()
  })

  it('blocks saving when the permission catalog fails', async () => {
    setup({ permissionsStatus: 500 })
    await screen.findAllByText('Ops')
    fireEvent.click(screen.getByRole('button', { name: '新建自定义角色' }))
    const dialog = await screen.findByRole('dialog', { name: '新建自定义角色' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('权限目录加载失败')
    expect(
      (within(dialog).getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(within(dialog).getByRole('button', { name: '重试' })).toBeTruthy()
  })
})
