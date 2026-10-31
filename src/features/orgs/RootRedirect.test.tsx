import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import { RootRedirect } from '../../router'

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function me(orgs: unknown[]) {
  return {
    user: { id: 1, email: 'admin@acme.local' },
    orgs,
  }
}

function setup(orgs: unknown[]) {
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
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/orgs/:orgId/overview" element={<div>OVERVIEW</div>} />
          <Route path="/login" element={<div>LOGIN</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('RootRedirect', () => {
  afterEach(() => vi.restoreAllMocks())

  it('offers creation when the account has no organization', async () => {
    setup([])
    expect(await screen.findByText('还没有组织')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '创建组织' }))
    expect(await screen.findByRole('dialog', { name: '创建组织' })).toBeTruthy()
  })

  it('redirects an account with organizations to the first overview', async () => {
    setup([{ id: 3, name: 'Acme', role_kind: 'owner', permissions: [] }])
    expect(await screen.findByText('OVERVIEW')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '创建组织' })).toBeNull()
  })
})
