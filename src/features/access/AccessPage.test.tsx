import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import AccessPage from './AccessPage'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function meWith(permissions: string[]) {
  return {
    user: { id: 1, email: 'owner@acme.local' },
    orgs: [
      { id: 1, name: 'ACME', role_kind: 'owner', permissions },
      { id: 2, name: 'Beta', role_kind: 'owner', permissions },
    ],
  }
}

const members = [
  {
    id: 1,
    user_id: 1,
    email: 'owner@acme.local',
    role_name: 'owner',
    disabled: false,
    created_at: '',
  },
  {
    id: 2,
    user_id: 2,
    email: 'ops@acme.local',
    role_name: 'member',
    disabled: true,
    created_at: '',
  },
]

function userGroups(org: number) {
  return [
    {
      id: 1,
      name: 'everyone',
      kind: 'everyone',
      member_ids: [],
      created_at: '',
      updated_at: '',
    },
    {
      id: org * 10,
      name: `Group ${org}`,
      kind: 'custom',
      member_ids: [1],
      created_at: '',
      updated_at: '',
    },
  ]
}

function rules(org: number) {
  return [
    {
      id: org,
      source_group_id: 1,
      source_group_name: `Source ${org}`,
      target_kind: 'all_devices',
      target_group_id: null,
      target_group_name: '',
      created_at: '2026-10-29T00:00:00Z',
    },
  ]
}

function deviceGroups(org: number) {
  return [
    {
      id: org * 10,
      name: `Devices ${org}`,
      device_ids: [],
      strategy_id: null,
      created_at: '',
      updated_at: '',
    },
  ]
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="loc">{`${location.pathname}${location.search}`}</div>
}

function SwitchOrg() {
  const location = useLocation()
  return <Link to={`/orgs/2/access${location.search}`}>切组织</Link>
}

function setup(permissions = ['access.manage'], initial = '/orgs/1/access') {
  const requests: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    requests.push(url)
    if (url.endsWith('/me')) return json({ code: 'ok', data: meWith(permissions) })
    const org = Number(url.match(/\/orgs\/(\d+)\//)?.[1] ?? 1)
    if (url.includes('/members')) return json({ code: 'ok', data: members })
    if (url.includes('/user-groups')) return json({ code: 'ok', data: userGroups(org) })
    if (url.includes('/device-groups')) return json({ code: 'ok', data: deviceGroups(org) })
    if (url.includes('/access-rules')) return json({ code: 'ok', data: rules(org) })
    return json({ code: 'ok', data: [] })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route
            path="/orgs/:orgId/access"
            element={
              <>
                <AccessPage />
                <LocationProbe />
                <SwitchOrg />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
  return { requests }
}

describe('AccessPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('gates the page without access.manage and never requests groups', async () => {
    const { requests } = setup(['device.read'])
    expect(await screen.findByText(/没有访问控制权限/)).toBeTruthy()
    expect(requests.some((url) => url.includes('/user-groups'))).toBe(false)
    expect(requests.some((url) => url.includes('/device-groups'))).toBe(false)
    expect(requests.some((url) => url.includes('/access-rules'))).toBe(false)
  })

  it('renders rules by default and switches tabs through the URL', async () => {
    setup()
    expect(await screen.findByText('Source 1')).toBeTruthy()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['规则', '用户组', '设备组'])
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')

    fireEvent.click(tabs[1])
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('tab=user-groups'))
    expect(await screen.findByText('Group 1')).toBeTruthy()
    expect(screen.getByText('全部有效成员')).toBeTruthy()
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(
      'access-tab-user-groups',
    )
  })

  it('clears the tab and remounts data when the organization changes', async () => {
    const { requests } = setup(['access.manage'], '/orgs/1/access?tab=device-groups')
    expect(await screen.findByText('Devices 1')).toBeTruthy()

    fireEvent.click(screen.getByRole('link', { name: '切组织' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/orgs/2/access'))
    expect((await screen.findAllByText('全部设备')).length).toBeGreaterThan(0)
    expect(screen.queryByText('Devices 1')).toBeNull()
    await waitFor(() =>
      expect(requests.some((url) => url.includes('/orgs/2/access-rules'))).toBe(true),
    )
  })
})
