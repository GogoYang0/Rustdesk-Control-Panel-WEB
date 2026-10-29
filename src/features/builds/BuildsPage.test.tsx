import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from '../../store/api'
import BuildsPage from './BuildsPage'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function meWith(permissions: string[]) {
  return {
    user: { id: 1, email: 'owner@acme.local' },
    orgs: [{ id: 1, name: 'ACME', role_kind: 'owner', permissions }],
  }
}

function capabilities(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    platforms: ['windows-x64', 'linux-x64'],
    limits: {
      max_profiles_per_org: 10,
      max_concurrent_per_org: 2,
      max_active_builds: 4,
      max_artifact_bytes: 2 * 1024 * 1024,
      artifact_retention_days: 30,
    },
    provisioning_state: 'deployed',
    defaults: {
      server: 'relay.example.com:21117',
      server_key: 'public-key',
      api_server: 'https://panel.example.com',
    },
    ...overrides,
  }
}

function profile(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Profile ${id}`,
    app_name: `App ${id}`,
    has_logo: false,
    logo_width: 0,
    logo_height: 0,
    logo_sha256: '',
    created_at: '2026-10-29T05:00:00Z',
    updated_at: '2026-10-29T05:00:00Z',
    ...overrides,
  }
}

function setup(
  options: {
    initial?: string
    permissions?: string[]
    caps?: Record<string, unknown>
    capsFailures?: number
    profiles?: Record<string, unknown>[]
  } = {},
) {
  const {
    initial = '/orgs/1/builds',
    permissions = ['client_build.manage'],
    caps = capabilities(),
    capsFailures = 0,
    profiles = [],
  } = options
  let failures = capsFailures
  const requests: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    requests.push(url)
    if (url.endsWith('/me')) {
      return json({ code: 'ok', message: 'ok', data: meWith(permissions) })
    }
    if (url.includes('/client-build/capabilities')) {
      if (failures > 0) {
        failures -= 1
        return json({ code: 'internal', message: 'database is locked' }, 500)
      }
      return json({ code: 'ok', message: 'ok', data: caps })
    }
    if (url.includes('/client-build-profiles')) {
      return json({
        code: 'ok',
        message: 'ok',
        data: { items: profiles, page: 1, page_size: 200, total: profiles.length },
      })
    }
    return json({ code: 'ok', message: 'ok', data: null })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/orgs/:orgId/builds" element={<BuildsPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
  return { requests }
}

describe('BuildsPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('gates the page without client_build.manage and never requests builds', async () => {
    const { requests } = setup({ permissions: ['device.read'] })
    expect(await screen.findByText(/没有客户端生成器权限/)).toBeTruthy()
    expect(requests.some((url) => url.includes('/client-build'))).toBe(false)
  })

  it('rejects an invalid organization id without requests', async () => {
    const { requests } = setup({ initial: '/orgs/abc/builds' })
    expect(await screen.findByText('组织不存在')).toBeTruthy()
    expect(requests.some((url) => url.includes('/client-build'))).toBe(false)
  })

  it('shows a disabled capability while keeping profile maintenance available', async () => {
    setup({
      caps: capabilities({
        enabled: false,
        provisioning_state: 'missing',
        defaults: null,
      }),
    })
    expect(await screen.findByText(/构建暂不可发起/)).toBeTruthy()
    expect(screen.getByText(/未启用/)).toBeTruthy()
    expect(screen.getByText('还没有品牌配置')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: '新建 Profile' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('separates provisioning states and missing defaults', async () => {
    setup({
      caps: capabilities({ provisioning_state: 'provisioning', defaults: null }),
    })
    expect(await screen.findByText(/本组织服务器供应中/)).toBeTruthy()
  })

  it('uses capability quotas instead of hardcoded limits', async () => {
    setup({
      caps: capabilities({
        limits: {
          max_profiles_per_org: 1,
          max_concurrent_per_org: 3,
          max_active_builds: 9,
          max_artifact_bytes: 1024,
          artifact_retention_days: 7,
        },
      }),
      profiles: [profile(1)],
    })
    expect(await screen.findByText('Profile 1')).toBeTruthy()
    expect(screen.getByText(/最多 1 个 Profile/)).toBeTruthy()
    expect(screen.getByText(/同时 3 个活跃构建/)).toBeTruthy()
    expect(screen.getByText(/保留 7 天/)).toBeTruthy()
    expect(screen.getByText(/上限 1.0 KiB/)).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: '新建 Profile' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('retries a failed capability request', async () => {
    setup({ capsFailures: 1 })
    expect(await screen.findByText(/加载构建能力失败/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText(/构建能力已启用/)).toBeTruthy()
  })

  it('renders a deployed banner with the derived server and API server', async () => {
    setup()
    expect(await screen.findByText(/构建能力已启用/)).toBeTruthy()
    expect(screen.getByText('relay.example.com:21117')).toBeTruthy()
    expect(screen.getByText('https://panel.example.com')).toBeTruthy()
    expect(screen.queryByText('public-key')).toBeNull()
    expect(screen.getByText(/Windows x64 \/ Linux x64/)).toBeTruthy()
  })
})
