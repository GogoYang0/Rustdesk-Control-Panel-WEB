import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import type { AddressBook } from '../../lib/api'
import AddressBooksPage from './AddressBooksPage'
import { MemoryRouter, Route, Routes } from 'react-router'

const me = {
  user: { id: 1, email: 'owner@acme.local' },
  orgs: [{ id: 1, name: 'ACME', role_kind: 'member', permissions: ['device.read'] }],
}

function book(overrides: Partial<AddressBook> = {}): AddressBook {
  return {
    id: 1,
    name: '个人簿',
    scope: 'personal',
    owner_id: 1,
    revision: 1,
    created_at: '2026-10-29T00:00:00Z',
    updated_at: '2026-10-29T00:00:00Z',
    peers: [],
    tags: [],
    ...overrides,
  }
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup(books: AddressBook[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith('/address-books')) {
      return json({ code: 'ok', message: 'ok', data: books })
    }
    return json({ code: 'ok', message: 'ok', data: me })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/orgs/1/address-books']}>
        <Routes>
          <Route path="/orgs/:orgId/address-books" element={<AddressBooksPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('AddressBooksPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('groups personal and shared books', async () => {
    setup([
      book({ id: 1, name: '我的笔记' }),
      book({ id: 2, name: '总部共享', scope: 'shared', owner_id: null }),
    ])
    expect(await screen.findByText('我的地址簿')).toBeTruthy()
    expect(screen.getByText('共享地址簿')).toBeTruthy()
    expect(screen.getByText('我的笔记')).toBeTruthy()
    expect(screen.getByText('总部共享')).toBeTruthy()
  })

  it('disables writes on a shared book without addressbook.write but keeps the owner book editable', async () => {
    setup([
      book({ id: 1, name: '我的笔记' }),
      book({ id: 2, name: '总部共享', scope: 'shared', owner_id: null }),
    ])
    await screen.findByText('总部共享')
    const cards = [...document.querySelectorAll('.grid-2 .card')]
    const shared = cards.find((card) => card.textContent?.includes('总部共享')) as HTMLElement
    const personal = cards.find((card) => card.textContent?.includes('我的笔记')) as HTMLElement
    const deleteOf = (card: HTMLElement) =>
      [...card.querySelectorAll('.row-end button')].find((b) => b.textContent === '删除') as
        HTMLButtonElement | undefined
    expect(deleteOf(shared)?.disabled).toBe(true)
    expect(deleteOf(personal)?.disabled).toBe(false)
  })
})
