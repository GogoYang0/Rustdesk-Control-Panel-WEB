import { configureStore } from '@reduxjs/toolkit'
import { Toast } from '@douyinfe/semi-ui'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import SettingsPage from './SettingsPage'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup(
  options: {
    permissions?: string[]
    provisioning?: Record<string, unknown>
    retention?: Record<string, unknown>
    providers?: Record<string, unknown>
    provisioningStatus?: number
    retentionStatus?: number
    providersStatus?: number
    provisioningWriteStatus?: number
    renameStatus?: number
    renameGate?: Promise<void>
  } = {},
) {
  const perms = options.permissions ?? ['org.admin', 'device.read']
  let provisioning = options.provisioning ?? {
    enabled: false,
    state: 'disabled',
    cleanup_pending: false,
  }
  let retention = options.retention ?? { audit_retention_days: 0, last_archive: null }
  const providers = options.providers ?? {
    oidc: { enabled: false },
    ldap: { enabled: false },
  }
  const requests: { method: string; url: string; body: string }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = String(init?.method ?? 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? init.body : ''
    requests.push({ method, url, body })
    if (url.endsWith('/me')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: {
          user: {
            id: 1,
            email: 'owner@acme.local',
            email_verified: true,
            totp_enabled: false,
            has_password: true,
          },
          orgs: [
            {
              id: 1,
              name: 'ACME',
              role_id: 1,
              role_kind: 'owner',
              permissions: perms,
            },
          ],
        },
      })
    }
    if (url.endsWith('/orgs/1') && method === 'PATCH') {
      if (options.renameGate) await options.renameGate
      if (options.renameStatus) {
        return json({ code: 'internal', message: 'rename failed' }, options.renameStatus)
      }
      const parsed = JSON.parse(body) as { name: string }
      return json({
        code: 'ok',
        message: 'ok',
        data: { id: 1, name: parsed.name, created_at: '2026-01-01T00:00:00Z' },
      })
    }
    if (url.endsWith('/orgs/1/provisioning')) {
      if (method === 'PUT') {
        if (options.provisioningWriteStatus) {
          return json(
            { code: 'internal', message: 'write failed' },
            options.provisioningWriteStatus,
          )
        }
        const parsed = JSON.parse(body) as { enabled: boolean }
        provisioning = {
          enabled: parsed.enabled,
          state: parsed.enabled ? 'pending' : 'disabled',
          cleanup_pending: false,
        }
        return json({ code: 'ok', message: 'ok', data: provisioning })
      }
      if (options.provisioningStatus) {
        return json({ code: 'internal', message: 'failed' }, options.provisioningStatus)
      }
      return json({ code: 'ok', message: 'ok', data: provisioning })
    }
    if (url.endsWith('/orgs/1/audit-retention')) {
      if (method === 'PUT') {
        const parsed = JSON.parse(body) as { days: number }
        retention = { ...retention, audit_retention_days: parsed.days }
        return json({ code: 'ok', message: 'ok', data: retention })
      }
      if (options.retentionStatus) {
        return json({ code: 'internal', message: 'failed' }, options.retentionStatus)
      }
      return json({ code: 'ok', message: 'ok', data: retention })
    }
    if (url.endsWith('/auth/providers')) {
      if (options.providersStatus) {
        return json({ code: 'internal', message: 'failed' }, options.providersStatus)
      }
      return json({ code: 'ok', message: 'ok', data: providers })
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
      <MemoryRouter initialEntries={['/orgs/1/settings']}>
        <Routes>
          <Route path="/orgs/:orgId/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
  return { requests }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => vi.restoreAllMocks())

describe('SettingsPage', () => {
  it('gates non-owners without requesting settings endpoints', async () => {
    const { requests } = setup({ permissions: ['device.read'] })
    expect(await screen.findByText('需要 owner 权限')).toBeTruthy()
    expect(
      requests.some(
        (request) =>
          request.url.includes('/provisioning') ||
          request.url.includes('/audit-retention') ||
          request.url.includes('/auth/providers'),
      ),
    ).toBe(false)
  })

  it('renders the four cards for an owner', async () => {
    setup({
      provisioning: { enabled: true, state: 'pending', cleanup_pending: false },
      retention: {
        audit_retention_days: 30,
        last_archive: { at: '2026-10-01T00:00:00Z', rows: 12, path: '/archive/a.gz' },
      },
      providers: { oidc: { enabled: true, name: 'Corp SSO' }, ldap: { enabled: false } },
    })
    const org = await screen.findByTestId('org-card')
    expect(org.textContent).toContain('ACME')
    expect(org.textContent).toContain('#1')
    expect(org.textContent).toContain('2 项')
    const provisioning = screen.getByTestId('provisioning-card')
    expect(await within(provisioning).findByText('等待部署')).toBeTruthy()
    const retention = screen.getByTestId('retention-card')
    expect(await within(retention).findByText('保留 30 天')).toBeTruthy()
    expect(retention.textContent).toContain('12 行')
    expect(retention.textContent).toContain('/archive/a.gz')
    const providersCard = screen.getByTestId('provider-card')
    expect(providersCard.textContent).toContain('Corp SSO')
    expect(providersCard.textContent).toContain('已启用')
  })

  it('confirms provisioning disable and updates the card from the PUT response', async () => {
    const { requests } = setup({
      provisioning: { enabled: true, state: 'deployed', cleanup_pending: false },
    })
    const card = await screen.findByTestId('provisioning-card')
    fireEvent.click(await within(card).findByRole('switch', { name: '允许服务器供应' }))
    const dialog = await screen.findByRole('dialog', { name: '关闭服务器供应' })
    expect(within(dialog).getByText(/同步停止/)).toBeTruthy()
    expect(requests.some((request) => request.method === 'PUT')).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(card).getByRole('switch').getAttribute('aria-checked')).toBe('false')
    const put = requests.find((request) => request.method === 'PUT')
    expect(JSON.parse(put?.body ?? '{}')).toEqual({ enabled: false })
  })

  it('enables asynchronous provisioning once even on a double click', async () => {
    const { requests } = setup()
    const card = await screen.findByTestId('provisioning-card')
    fireEvent.click(await within(card).findByRole('switch', { name: '允许服务器供应' }))
    const dialog = await screen.findByRole('dialog', { name: '启用服务器供应' })
    expect(within(dialog).getByText(/异步部署队列/)).toBeTruthy()
    const confirm = within(dialog).getByRole('button', { name: '启用' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() =>
      expect(within(card).getByTestId('provisioning-state').textContent).toBe('等待部署'),
    )
    const puts = requests.filter((request) => request.method === 'PUT')
    expect(puts).toHaveLength(1)
    expect(JSON.parse(puts[0].body)).toEqual({ enabled: true })
  })

  it('offers a cleanup retry when disabling left a lingering deployment', async () => {
    const { requests } = setup({
      provisioning: { enabled: false, state: 'disabled', cleanup_pending: true },
    })
    const card = await screen.findByTestId('provisioning-card')
    expect(await within(card).findByText(/关闭状态尚未完全收尾/)).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: '重试清理' }))
    const dialog = await screen.findByRole('dialog', { name: '重试清理' })
    fireEvent.click(within(dialog).getByRole('button', { name: '重试清理' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(card.textContent).not.toContain('关闭状态尚未完全收尾')
    const put = requests.find((request) => request.method === 'PUT')
    expect(JSON.parse(put?.body ?? '{}')).toEqual({ enabled: false })
  })

  it('warns on a failed deployment without promising a retry', async () => {
    setup({
      provisioning: { enabled: true, state: 'failed', cleanup_pending: false },
    })
    const card = await screen.findByTestId('provisioning-card')
    expect(await within(card).findByText(/人工恢复/)).toBeTruthy()
    expect(card.textContent).toContain('部署失败')
    expect(within(card).queryByRole('button', { name: /重试/ })).toBeNull()
  })

  it('saves a new retention window and shows 0 as permanent', async () => {
    const { requests } = setup()
    const card = await screen.findByTestId('retention-card')
    expect(await within(card).findByText('永久保留')).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: '编辑' }))
    const dialog = await screen.findByRole('dialog', { name: '修改审计保留' })
    fireEvent.change(within(dialog).getByLabelText('保留天数'), { target: { value: '90' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(card.textContent).toContain('保留 90 天')
    const put = requests.find((request) => request.method === 'PUT')
    expect(JSON.parse(put?.body ?? '{}')).toEqual({ days: 90 })
  })

  it('rejects a blank retention value instead of treating it as zero', async () => {
    const { requests } = setup()
    const card = await screen.findByTestId('retention-card')
    expect(await within(card).findByText('永久保留')).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: '编辑' }))
    const dialog = await screen.findByRole('dialog', { name: '修改审计保留' })
    fireEvent.change(within(dialog).getByLabelText('保留天数'), { target: { value: '  ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(await within(dialog).findByText('请输入保留天数（0 表示永久）')).toBeTruthy()
    expect(requests.some((request) => request.method === 'PUT')).toBe(false)
  })

  it('shows a malformed archive summary without crashing', async () => {
    setup({
      retention: { audit_retention_days: 30, last_archive: { at: 1, rows: 'x' } },
    })
    const card = await screen.findByTestId('retention-card')
    expect(await within(card).findByText('归档摘要不可读')).toBeTruthy()
  })

  it('keeps the write error inside the provisioning dialog', async () => {
    setup({
      provisioning: { enabled: false, state: 'disabled', cleanup_pending: false },
      provisioningWriteStatus: 500,
    })
    const card = await screen.findByTestId('provisioning-card')
    fireEvent.click(await within(card).findByRole('switch', { name: '允许服务器供应' }))
    const dialog = await screen.findByRole('dialog', { name: '启用服务器供应' })
    fireEvent.click(within(dialog).getByRole('button', { name: '启用' }))
    expect(await within(dialog).findByText(/服务暂时不可用/)).toBeTruthy()
    expect(screen.getByRole('dialog', { name: '启用服务器供应' })).toBeTruthy()
  })

  it('keeps other cards usable when providers fail', async () => {
    setup({ providersStatus: 500 })
    expect(await screen.findByText(/服务暂时不可用/)).toBeTruthy()
    expect(screen.getByTestId('org-card')).toBeTruthy()
    expect(screen.getByTestId('provisioning-card').textContent).toContain('未启用')
    expect(screen.getByTestId('retention-card').textContent).toContain('永久保留')
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
  })

  it('renames the organization and updates the card from the /me cache', async () => {
    const toast = vi.spyOn(Toast, 'success')
    const { requests } = setup()
    const card = await screen.findByTestId('org-card')
    fireEvent.click(within(card).getByRole('button', { name: '重命名' }))
    const dialog = await screen.findByRole('dialog', { name: '重命名组织' })
    const input = within(dialog).getByLabelText('组织名称') as HTMLInputElement
    expect(input.value).toBe('ACME')
    fireEvent.change(input, { target: { value: '  ACME 2  ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(card.textContent).toContain('ACME 2'))
    const patch = requests.find((request) => request.method === 'PATCH')
    expect(JSON.parse(patch?.body ?? '{}')).toEqual({ name: 'ACME 2' })
    expect(toast).toHaveBeenCalledWith('已重命名为 ACME 2')
  })

  it('keeps the rename dialog open with a Chinese error on failure', async () => {
    setup({ renameStatus: 403 })
    const card = await screen.findByTestId('org-card')
    fireEvent.click(within(card).getByRole('button', { name: '重命名' }))
    const dialog = await screen.findByRole('dialog', { name: '重命名组织' })
    fireEvent.change(within(dialog).getByLabelText('组织名称'), { target: { value: 'ACME 2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(await within(dialog).findByText('只有 owner 可以重命名组织')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: '重命名组织' })).toBeTruthy()
    expect(card.textContent).toContain('ACME')
    expect(card.textContent).not.toContain('ACME 2')
  })

  it('rejects an unchanged name locally without calling the API', async () => {
    const { requests } = setup()
    const card = await screen.findByTestId('org-card')
    fireEvent.click(within(card).getByRole('button', { name: '重命名' }))
    const dialog = await screen.findByRole('dialog', { name: '重命名组织' })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(within(dialog).getByText('新名称与当前名称相同')).toBeTruthy()
    expect(requests.some((request) => request.method === 'PATCH')).toBe(false)
  })

  it('blocks closing the dialog while the rename is in flight', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    setup({ renameGate: gate })
    const card = await screen.findByTestId('org-card')
    fireEvent.click(within(card).getByRole('button', { name: '重命名' }))
    const dialog = await screen.findByRole('dialog', { name: '重命名组织' })
    fireEvent.change(within(dialog).getByLabelText('组织名称'), { target: { value: 'ACME 2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(dialog.parentElement as HTMLElement)
    expect(screen.getByRole('dialog', { name: '重命名组织' })).toBeTruthy()
    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(card.textContent).toContain('ACME 2'))
  })
})
