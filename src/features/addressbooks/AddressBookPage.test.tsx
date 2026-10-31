import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import AddressBookPage from './AddressBookPage'

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function me(permissions: string[]) {
  return {
    user: { id: 1, email: 'owner@acme.local' },
    orgs: [{ id: 1, name: 'ACME', role_kind: 'owner', permissions }],
  }
}

function book(scope: 'personal' | 'shared') {
  return {
    id: 5,
    organization_id: 1,
    owner_id: scope === 'personal' ? 1 : null,
    scope,
    name: 'E2E Book',
    revision: 3,
    peers: [],
    tags: [],
    created_at: '2026-10-30T00:00:00.000Z',
    updated_at: '2026-10-30T00:00:00.000Z',
  }
}

function setup(entry: string, scope: 'personal' | 'shared', permissions: string[]) {
  const calls: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    calls.push(url)
    if (url.endsWith('/address-books/5'))
      return json({ code: 'ok', message: 'ok', data: book(scope) })
    if (url.includes('/recycle-bin')) return json({ code: 'ok', message: 'ok', data: [] })
    if (url.includes('/members')) return json({ code: 'ok', message: 'ok', data: [] })
    if (url.includes('/user-groups')) return json({ code: 'ok', message: 'ok', data: [] })
    return json({ code: 'ok', message: 'ok', data: me(permissions) })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/orgs/:orgId/address-books/:bookId" element={<AddressBookPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
  return { calls }
}

describe('AddressBookPage recycle tab', () => {
  afterEach(() => vi.restoreAllMocks())

  it('offers peers and recycle tabs for a personal book', async () => {
    setup('/orgs/1/address-books/5', 'personal', ['addressbook.write'])
    expect(await screen.findByRole('tab', { name: 'Peers' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '回收站' })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: '授权' })).toBeNull()
    expect(screen.getByRole('button', { name: '标签' })).toBeTruthy()
  })

  it('opens the tag palette from an editable book', async () => {
    setup('/orgs/1/address-books/5', 'personal', ['addressbook.write'])
    fireEvent.click(await screen.findByRole('button', { name: '标签' }))
    expect(await screen.findByRole('dialog', { name: '管理标签' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '添加标签' })).toBeTruthy()
  })

  it('adds the grants tab for a writable shared book', async () => {
    setup('/orgs/1/address-books/5', 'shared', ['addressbook.write'])
    expect(await screen.findByRole('tab', { name: 'Peers' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '回收站' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '授权' })).toBeTruthy()
  })

  it('hides every tab for a read-only shared book and falls back to peers', async () => {
    setup('/orgs/1/address-books/5?tab=recycle', 'shared', ['device.read'])
    expect(await screen.findByText('E2E Book')).toBeTruthy()
    expect(await screen.findByText(/当前为只读视图/)).toBeTruthy()
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByRole('button', { name: '标签' })).toBeNull()
  })

  it('loads the recycle panel when the tab is active', async () => {
    const { calls } = setup('/orgs/1/address-books/5?tab=recycle', 'personal', [
      'addressbook.write',
    ])
    expect(await screen.findByText('回收站为空')).toBeTruthy()
    expect(calls.some((url) => url.includes('/recycle-bin'))).toBe(true)
  })
})
