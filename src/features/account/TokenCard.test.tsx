import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import TokenCard from './TokenCard'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function token(
  id: number,
  overrides: Partial<{
    name: string
    revoked_at: string | null
    expires_at: string
    plaintext: string
  }> = {},
) {
  return {
    id,
    organization_id: 1,
    name: overrides.name ?? `token-${id}`,
    token_prefix: `rdt_${String(id).padStart(4, '0')}`,
    permissions: ['device.read'],
    expires_at: overrides.expires_at ?? '2099-01-01T00:00:00Z',
    last_used_at: null,
    revoked_at: overrides.revoked_at ?? null,
    created_at: '2026-10-30T00:00:00Z',
  }
}

function setup(
  options: {
    tokens?: ReturnType<typeof token>[]
    permissions?: string[]
    listStatus?: number
    createStatus?: number
  } = {},
) {
  let rows = options.tokens ?? [
    token(1, { name: 'CI' }),
    token(2, { name: 'Old', revoked_at: '2026-10-29T00:00:00Z' }),
    token(3, { name: 'Expired', expires_at: '2020-01-01T00:00:00Z' }),
  ]
  const permissions = options.permissions ?? ['device.read', 'member.manage']
  const requests: { method: string; url: string; body: string }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = String(init?.method ?? 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? init.body : ''
    requests.push({ method, url, body })
    if (url.includes('/auth/tokens?')) {
      if (options.listStatus) {
        return json({ code: 'internal', message: 'list failed' }, options.listStatus)
      }
      return json({ code: 'ok', message: 'ok', data: rows })
    }
    if (url.endsWith('/auth/tokens') && method === 'POST') {
      if (options.createStatus) {
        return json({ code: 'conflict', message: 'too many' }, options.createStatus)
      }
      const parsed = JSON.parse(body) as {
        name: string
        permissions?: string[]
        expires_in_days: number
      }
      const created = {
        ...token(4, { name: parsed.name }),
        permissions: parsed.permissions ?? permissions,
        expires_at: '2099-04-01T00:00:00Z',
      }
      rows = [created, ...rows]
      return json(
        {
          code: 'ok',
          message: 'ok',
          data: {
            token: created,
            plaintext: 'rdt_plaintext_ONLY_ONCE',
          },
        },
        201,
      )
    }
    if (url.match(/\/auth\/tokens\/\d+$/) && method === 'DELETE') {
      const id = Number(url.match(/tokens\/(\d+)$/)?.[1])
      rows = rows.map((row) =>
        row.id === id ? { ...row, revoked_at: '2026-10-30T01:00:00Z' } : row,
      )
      return json({ code: 'ok', message: 'ok', data: null })
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
  const view = render(
    <Provider store={store}>
      <TokenCard orgId={1} permissions={permissions} />
    </Provider>,
  )
  return { requests, view, store, getRows: () => rows }
}

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

afterEach(() => vi.restoreAllMocks())

describe('TokenCard', () => {
  it('lists active, revoked and expired tokens with the active quota', async () => {
    setup()
    expect(await screen.findByText('CI')).toBeTruthy()
    expect(screen.getByText('活跃 1 / 20')).toBeTruthy()
    const activeRow = screen.getByText('CI').closest('tr') as HTMLElement
    const revokedRow = screen.getByText('Old').closest('tr') as HTMLElement
    const expiredRow = screen.getByText('Expired').closest('tr') as HTMLElement
    expect(within(activeRow).getByText('活跃')).toBeTruthy()
    expect(within(revokedRow).getByText('已撤销')).toBeTruthy()
    expect(within(expiredRow).getByText('已过期')).toBeTruthy()
    expect(within(activeRow).getByRole('button', { name: '撤销' })).toBeTruthy()
    expect(within(revokedRow).queryByRole('button', { name: '撤销' })).toBeNull()
    expect(within(expiredRow).queryByRole('button', { name: '撤销' })).toBeNull()
  })

  it('creates a token with all permissions omitted and shows the plaintext once', async () => {
    const { requests, store } = setup()
    await screen.findByText('CI')
    fireEvent.click(screen.getByRole('button', { name: '创建令牌' }))
    const dialog = await screen.findByRole('dialog', { name: '创建个人 API Token' })
    fireEvent.change(within(dialog).getByLabelText('名称'), { target: { value: '  New Token  ' } })
    fireEvent.change(within(dialog).getByLabelText('有效天数'), { target: { value: '30' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '创建' }))

    const plaintext = await screen.findByTestId('token-plaintext')
    expect(plaintext.textContent).toBe('rdt_plaintext_ONLY_ONCE')
    const create = requests.find((request) => request.method === 'POST')
    expect(JSON.parse(create?.body ?? '{}')).toEqual({
      name: 'New Token',
      organization_id: 1,
      expires_in_days: 30,
    })

    fireEvent.click(screen.getByRole('button', { name: '我已保存' }))
    await waitFor(() => expect(screen.queryByTestId('token-plaintext')).toBeNull())
    expect(document.body.textContent).not.toContain('rdt_plaintext_ONLY_ONCE')
    expect(JSON.stringify(store.getState())).not.toContain('rdt_plaintext_ONLY_ONCE')
    expect(window.location.href).not.toContain('rdt_plaintext_ONLY_ONCE')
    expect(JSON.stringify(localStorage)).not.toContain('rdt_plaintext_ONLY_ONCE')
    expect(await screen.findByText('New Token')).toBeTruthy()
  })

  it('sends only the chosen permission subset', async () => {
    const { requests } = setup()
    await screen.findByText('CI')
    fireEvent.click(screen.getByRole('button', { name: '创建令牌' }))
    const dialog = await screen.findByRole('dialog', { name: '创建个人 API Token' })
    fireEvent.change(within(dialog).getByLabelText('名称'), { target: { value: 'Subset' } })
    fireEvent.click(within(dialog).getByLabelText('member.manage'))
    fireEvent.click(within(dialog).getByRole('button', { name: '创建' }))
    await screen.findByTestId('token-plaintext')
    const create = requests.find((request) => request.method === 'POST')
    expect(JSON.parse(create?.body ?? '{}').permissions).toEqual(['device.read'])
  })

  it('rejects an empty name and an out-of-range expiry before sending', async () => {
    const { requests } = setup()
    await screen.findByText('CI')
    fireEvent.click(screen.getByRole('button', { name: '创建令牌' }))
    const dialog = await screen.findByRole('dialog', { name: '创建个人 API Token' })
    fireEvent.click(within(dialog).getByRole('button', { name: '创建' }))
    expect(within(dialog).getByText('请输入令牌名称')).toBeTruthy()
    fireEvent.change(within(dialog).getByLabelText('名称'), { target: { value: 'X' } })
    fireEvent.change(within(dialog).getByLabelText('有效天数'), { target: { value: '0' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '创建' }))
    expect(within(dialog).getByText('天数必须在 1–365 之间')).toBeTruthy()
    expect(requests.some((request) => request.method === 'POST')).toBe(false)
  })

  it('revokes an active token after confirmation', async () => {
    const { requests } = setup()
    await screen.findByText('CI')
    const row = screen.getByText('CI').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '撤销' }))
    const dialog = await screen.findByRole('dialog', { name: '撤销令牌' })
    fireEvent.click(within(dialog).getByRole('button', { name: '撤销' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() =>
      expect(
        within(screen.getByText('CI').closest('tr') as HTMLElement).getByText('已撤销'),
      ).toBeTruthy(),
    )
    expect(requests.some((request) => request.method === 'DELETE')).toBe(true)
  })

  it('shows the active quota but lets the server reject the twenty-first token', async () => {
    const { requests } = setup({
      tokens: Array.from({ length: 20 }, (_, index) => token(index + 1)),
      createStatus: 409,
    })
    expect(await screen.findByText('活跃 20 / 20')).toBeTruthy()
    const create = screen.getByRole('button', { name: '创建令牌' }) as HTMLButtonElement
    expect(create.disabled).toBe(false)
    fireEvent.click(create)
    const dialog = await screen.findByRole('dialog', { name: '创建个人 API Token' })
    fireEvent.change(within(dialog).getByLabelText('名称'), { target: { value: 'Too many' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '创建' }))
    expect(await within(dialog).findByText(/活跃令牌已达 20 个/)).toBeTruthy()
    expect(requests.some((request) => request.method === 'POST')).toBe(true)
  })

  it('allows an explicit empty permission set', async () => {
    const { requests } = setup()
    await screen.findByText('CI')
    fireEvent.click(screen.getByRole('button', { name: '创建令牌' }))
    const dialog = await screen.findByRole('dialog', { name: '创建个人 API Token' })
    fireEvent.change(within(dialog).getByLabelText('名称'), { target: { value: 'No perms' } })
    fireEvent.click(within(dialog).getByLabelText('device.read'))
    fireEvent.click(within(dialog).getByLabelText('member.manage'))
    expect(within(dialog).getByText(/未勾选任何权限/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '创建' }))
    await screen.findByTestId('token-plaintext')
    const create = requests.find((request) => request.method === 'POST')
    expect(JSON.parse(create?.body ?? '{}').permissions).toEqual([])
  })

  it('shows a retryable error instead of an empty state', async () => {
    setup({ listStatus: 500 })
    expect(await screen.findByText('服务异常，请稍后重试')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
    expect(screen.queryByText('还没有个人 API Token。')).toBeNull()
    expect(screen.getByTestId('token-activity').textContent).toBe('活跃 — / 20')
  })
})
