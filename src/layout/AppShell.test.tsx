import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../store/api'
import AppShell from './AppShell'

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function me(orgs: unknown[]) {
  return { user: { id: 1, email: 'admin@acme.local' }, orgs }
}

const acme = {
  id: 1,
  name: 'Acme',
  role_kind: 'owner',
  permissions: ['org.admin', 'device.read', 'member.manage'],
}

function setup(orgs: unknown[], path = '/orgs/1/overview') {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (String(input).endsWith('/me')) {
      return json({ code: 'ok', message: 'ok', data: me(orgs) })
    }
    return json({ code: 'ok', message: 'ok', data: null })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<div>ROOT</div>} />
          <Route path="/orgs/:orgId" element={<AppShell />}>
            <Route path="overview" element={<div>OVERVIEW</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('AppShell organization creation entry', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('opens the create dialog from the desktop switcher menu', async () => {
    setup([acme])
    expect(await screen.findByText('OVERVIEW')).toBeTruthy()
    fireEvent.click(screen.getByTitle('切换组织'))
    const create = await screen.findByRole('button', { name: /创建组织/ })
    fireEvent.click(create)
    expect(await screen.findByRole('dialog', { name: '创建组织' })).toBeTruthy()
  })

  it('redirects a no-organization account away from org routes', async () => {
    setup([])
    expect(await screen.findByText('ROOT')).toBeTruthy()
    expect(screen.queryByText('组织不存在或你不是成员')).toBeNull()
  })

  it('keeps the 404 fallback for a non-member organization', async () => {
    setup([acme], '/orgs/99/overview')
    expect(await screen.findByText('组织不存在或你不是成员')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '创建组织' })).toBeNull()
  })
})
