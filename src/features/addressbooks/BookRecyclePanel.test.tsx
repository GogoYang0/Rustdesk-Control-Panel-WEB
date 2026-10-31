import { configureStore } from '@reduxjs/toolkit'
import { Toast } from '@douyinfe/semi-ui'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import BookRecyclePanel from './BookRecyclePanel'

const emails = new Map([[7, 'ops@acme.local']])

function recycleItem(overrides: Record<string, unknown> = {}) {
  return {
    peer_id: '1001',
    alias: '设计机',
    hostname: 'design-01',
    tags: ['lab'],
    deleted_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    deleted_by: 7,
    ...overrides,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface Options {
  items?: ReturnType<typeof recycleItem>[]
  listStatus?: number
  restoreStatus?: number
  purgeStatus?: number
}

function setup({
  items: initial = [
    recycleItem(),
    recycleItem({ peer_id: '2002', alias: '财务机', deleted_by: 0 }),
  ],
  listStatus = 200,
  restoreStatus = 200,
  purgeStatus = 200,
}: Options = {}) {
  let items = [...initial]
  const calls: { method: string; url: string }[] = []
  let listRequests = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = String(init?.method ?? 'GET').toUpperCase()
    calls.push({ method, url })
    if (url.includes('/recycle-bin/') && method === 'POST') {
      if (restoreStatus >= 400) {
        return json({ code: 'invalid_request', message: 'full' }, restoreStatus)
      }
      const peerId = decodeURIComponent(url.split('/recycle-bin/')[1].replace('/restore', ''))
      items = items.filter((item) => item.peer_id !== peerId)
      return json({ code: 'ok', message: 'ok', data: null })
    }
    if (url.includes('/recycle-bin/') && method === 'DELETE') {
      if (purgeStatus >= 400) {
        return json({ code: 'forbidden', message: 'no' }, purgeStatus)
      }
      const peerId = decodeURIComponent(url.split('/recycle-bin/')[1])
      items = items.filter((item) => item.peer_id !== peerId)
      return json({ code: 'ok', message: 'ok', data: null })
    }
    if (url.endsWith('/recycle-bin')) {
      listRequests += 1
      if (listStatus >= 400) {
        return json({ code: 'forbidden', message: 'no' }, listStatus)
      }
      return json({ code: 'ok', message: 'ok', data: items })
    }
    return json({ code: 'ok', message: 'ok', data: [] })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  render(
    <Provider store={store}>
      <BookRecyclePanel orgId={1} bookId={5} emails={emails} />
    </Provider>,
  )
  return { calls, listRequests: () => listRequests }
}

describe('BookRecyclePanel', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('lists recycled peers with tags, deleter and retention', async () => {
    setup()
    expect(await screen.findByText('1001')).toBeTruthy()
    expect(screen.getByText('财务机')).toBeTruthy()
    expect(screen.getByText('ops@acme.local')).toBeTruthy()
    expect(screen.getByText('系统')).toBeTruthy()
    expect(screen.getAllByText(/剩 \d+ 天/).length).toBe(2)
    expect(screen.getAllByText('lab').length).toBe(2)
  })

  it('searches by tag and keeps the server order', async () => {
    setup({
      items: [
        recycleItem({ peer_id: '2002', tags: ['finance'] }),
        recycleItem({ peer_id: '1001', tags: ['lab'] }),
      ],
    })
    await screen.findByText('2002')
    fireEvent.change(screen.getByLabelText('搜索回收站'), { target: { value: 'finance' } })
    expect(screen.getByText('2002')).toBeTruthy()
    expect(screen.queryByText('1001')).toBeNull()
  })

  it('restores a peer and lets the invalidated list refetch', async () => {
    const { calls } = setup()
    const row = (await screen.findByText('1001')).closest('tr') as HTMLElement
    const success = vi.spyOn(Toast, 'success')
    fireEvent.click(within(row).getByTestId('recycle-restore'))
    await waitFor(() =>
      expect(
        calls.some(
          (call) => call.method === 'POST' && call.url.includes('/recycle-bin/1001/restore'),
        ),
      ).toBe(true),
    )
    await waitFor(() => expect(screen.queryByText('1001')).toBeNull())
    expect(success).toHaveBeenCalledWith('已恢复 peer 1001')
  })

  it('explains the capacity failure on restore', async () => {
    setup({ restoreStatus: 400 })
    const row = (await screen.findByText('1001')).closest('tr') as HTMLElement
    const error = vi.spyOn(Toast, 'error')
    fireEvent.click(within(row).getByTestId('recycle-restore'))
    await waitFor(() => expect(error).toHaveBeenCalled())
    expect(JSON.stringify(error.mock.calls)).toContain('2000')
  })

  it('confirms and permanently deletes a peer', async () => {
    const { calls } = setup()
    const row = (await screen.findByText('1001')).closest('tr') as HTMLElement
    fireEvent.click(within(row).getByTestId('recycle-purge'))
    const dialog = await screen.findByRole('dialog', { name: '永久删除 peer' })
    expect(dialog.textContent).toContain('不可恢复')
    fireEvent.click(within(dialog).getByRole('button', { name: '永久删除' }))
    await waitFor(() =>
      expect(
        calls.some((call) => call.method === 'DELETE' && call.url.endsWith('/recycle-bin/1001')),
      ).toBe(true),
    )
    await waitFor(() => expect(screen.queryByText('1001')).toBeNull())
  })

  it('maps a forbidden purge', async () => {
    setup({ purgeStatus: 403 })
    const row = (await screen.findByText('1001')).closest('tr') as HTMLElement
    const error = vi.spyOn(Toast, 'error')
    fireEvent.click(within(row).getByTestId('recycle-purge'))
    const dialog = await screen.findByRole('dialog', { name: '永久删除 peer' })
    fireEvent.click(within(dialog).getByRole('button', { name: '永久删除' }))
    await waitFor(() => expect(error).toHaveBeenCalled())
    expect(JSON.stringify(error.mock.calls)).toContain('永久删除权限')
  })

  it('shows the empty state', async () => {
    setup({ items: [] })
    expect(await screen.findByText('回收站为空')).toBeTruthy()
  })

  it('shows a load error with retry', async () => {
    const { listRequests } = setup({ listStatus: 403 })
    expect((await screen.findByRole('alert')).textContent).toContain('查看回收站的权限')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(listRequests()).toBe(2))
  })
})
