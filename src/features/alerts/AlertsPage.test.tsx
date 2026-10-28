import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import AlertsPage from './AlertsPage'

const me = {
  user: { id: 1, email: 'admin@acme.local' },
  orgs: [{ id: 1, name: 'ACME', role_kind: 'owner', permissions: ['device.read'] }],
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.includes('/alerts?')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: {
          items: [
            {
              id: 3,
              organization_id: 1,
              session_id: 2,
              device_id: 1,
              kind: 'duration_exceeded',
              severity: 'critical',
              detail: { limit: 30 },
              created_at: '2026-10-29T02:37:00.000Z',
            },
          ],
          page: 1,
          page_size: 50,
          total: 1,
        },
      })
    }
    if (url.includes('/devices?')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: { items: [], page: 1, page_size: 200, total: 0 },
      })
    }
    return json({ code: 'ok', message: 'ok', data: me })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/orgs/1/alerts']}>
        <Routes>
          <Route path="/orgs/:orgId/alerts" element={<AlertsPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('AlertsPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders the record banner and a row with a session link', async () => {
    setup()
    expect(await screen.findByText(/只增的记录/)).toBeTruthy()
    expect(await screen.findByText('严重')).toBeTruthy()
    const link = await screen.findByRole('button', { name: '会话 #2' })
    expect(link).toBeTruthy()
    expect(screen.queryByText('已处置')).toBeNull()
  })
})
