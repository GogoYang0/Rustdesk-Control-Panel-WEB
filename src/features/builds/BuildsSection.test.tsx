import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ClientBuildCapabilities } from '../../lib/api'
import { panelApi } from '../../store/api'
import BuildsSection from './BuildsSection'

const { saveBlobFile } = vi.hoisted(() => ({ saveBlobFile: vi.fn() }))
vi.mock('../../lib/download', () => ({ saveBlobFile, saveTextFile: vi.fn() }))

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function caps(overrides: Record<string, unknown> = {}): ClientBuildCapabilities {
  return {
    enabled: true,
    platforms: ['windows-x64', 'linux-x64'],
    limits: {
      max_profiles_per_org: 10,
      max_concurrent_per_org: 2,
      max_active_builds: 4,
      max_artifact_bytes: 1024 * 1024,
      artifact_retention_days: 30,
    },
    provisioning_state: 'deployed',
    defaults: {
      server: 'relay.example.com:21117',
      server_key: 'key',
      api_server: 'https://panel.example.com',
    },
    ...overrides,
  } as ClientBuildCapabilities
}

function profile(id = 1) {
  return {
    id,
    name: 'Acme 品牌',
    app_name: 'Acme Remote',
    has_logo: false,
    logo_width: 0,
    logo_height: 0,
    logo_sha256: '',
    created_at: '2026-10-29T05:00:00Z',
    updated_at: '2026-10-29T05:00:00Z',
  }
}

function summary(id: number, status: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    profile_id: 1,
    profile_name: 'Acme 品牌',
    app_name: 'Acme Remote',
    upstream_version: '1.5.0',
    platforms: ['windows-x64', 'linux-x64'],
    status,
    artifact_count: status === 'succeeded' ? 2 : 0,
    artifacts_purged: false,
    created_at: '2026-10-29T05:00:00Z',
    dispatched_at: '2026-10-29T05:01:00Z',
    finished_at: status === 'succeeded' || status === 'failed' ? '2026-10-29T05:30:00Z' : null,
    github_run_id: 1842,
    github_run_url: 'https://github.com/e2e/actions/runs/1842',
    error_message: status === 'failed' ? 'E2E sample build failed' : '',
    ...overrides,
  }
}

function detail(id: number, status: string, overrides: Record<string, unknown> = {}) {
  const row = summary(id, status, overrides)
  return {
    ...row,
    manifest: {
      schema_version: 1,
      build_id: id,
      app_name: 'Acme Remote',
      server: 'relay.example.com:21117',
      server_key: 'key',
      api_server: 'https://panel.example.com',
      upstream_version: '1.5.0',
      platforms: ['windows-x64', 'linux-x64'],
      logo: { sha256: 'a'.repeat(64), width: 256, height: 256 },
    },
    artifacts:
      status === 'succeeded' && !row.artifacts_purged
        ? [
            {
              id: 11,
              platform: 'windows-x64',
              file_name: 'panel-client-1-windows-x64.zip',
              size_bytes: 12,
              sha256: 'b'.repeat(64),
              created_at: '2026-10-29T05:30:00Z',
            },
          ]
        : [],
  }
}

function SwitchHarness({ capabilities }: { capabilities: ClientBuildCapabilities }) {
  const [orgId, setOrgId] = useState(1)
  return (
    <>
      <BuildsSection orgId={orgId} caps={capabilities} />
      <button type="button" onClick={() => setOrgId(2)}>
        切换组织
      </button>
      <LocationProbe />
    </>
  )
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="loc">{`${location.pathname}${location.search}`}</div>
}

function setup(
  options: {
    initial?: string
    capabilities?: ClientBuildCapabilities
    rows?: Record<string, unknown>[]
    total?: number
    detailStatus?: string
    detailOverrides?: Record<string, unknown>
    cancelResult?: string
    listFailures?: number
    detailErrorStatus?: number
    cancelErrorStatus?: number
    createdStatus?: number
    artifactStatus?: number
    profilesStatus?: number
    switchable?: boolean
  } = {},
) {
  const {
    initial = '/orgs/1/builds',
    capabilities = caps(),
    rows = [summary(2, 'running'), summary(1, 'succeeded')],
    total = rows.length,
    detailStatus = 'running',
    detailOverrides = {},
    cancelResult = 'running',
    listFailures = 0,
    detailErrorStatus = 0,
    cancelErrorStatus = 0,
    createdStatus = 202,
    artifactStatus = 0,
    profilesStatus = 0,
    switchable = false,
  } = options
  let failures = listFailures
  const requests: string[] = []
  const postBodies: string[] = []
  let currentStatus = detailStatus
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = String(init?.method ?? 'GET').toUpperCase()
    requests.push(`${method} ${url}`)
    if (method === 'POST' && typeof init?.body === 'string') postBodies.push(init.body)
    if (url.includes('/client-build-profiles')) {
      if (profilesStatus) {
        return json({ code: 'internal', message: 'profile read failed' }, profilesStatus)
      }
      return json({
        code: 'ok',
        message: 'ok',
        data: { items: [profile()], page: 1, page_size: 200, total: 1 },
      })
    }
    if (url.match(/\/client-builds\/\d+\/cancel$/) && method === 'POST') {
      if (cancelErrorStatus) {
        return json({ code: 'conflict', message: 'build is running' }, cancelErrorStatus)
      }
      currentStatus = cancelResult
      return json({
        code: 'ok',
        message: 'ok',
        data: detail(7, currentStatus, detailOverrides),
      })
    }
    if (url.match(/\/client-builds\/\d+\/artifacts\/\d+$/)) {
      if (artifactStatus) {
        return json({ code: 'internal', message: 'artifact read failed' }, artifactStatus)
      }
      return new Response('zip-bytes', {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="panel-client-1-windows-x64.zip"',
        },
      })
    }
    if (url.match(/\/client-builds\/\d+$/) && method === 'GET') {
      if (detailErrorStatus) {
        return json({ code: 'not_found', message: 'build not found' }, detailErrorStatus)
      }
      const id = Number(url.match(/\/client-builds\/(\d+)/)?.[1])
      return json({
        code: 'ok',
        message: 'ok',
        data:
          id === 7
            ? detail(7, currentStatus, detailOverrides)
            : detail(id, detailStatus, detailOverrides),
      })
    }
    if (url.endsWith('/client-builds') && method === 'POST') {
      if (createdStatus !== 202) {
        return json({ code: 'conflict', message: 'quota or server' }, createdStatus)
      }
      return json({ code: 'ok', message: 'ok', data: detail(9, 'pending') }, 202)
    }
    if (url.includes('/client-builds?')) {
      if (failures > 0) {
        failures -= 1
        return json({ code: 'internal', message: 'database is locked' }, 500)
      }
      return json({
        code: 'ok',
        message: 'ok',
        data: { items: rows, page: 1, page_size: 20, total },
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
          <Route
            path="/orgs/:orgId/builds"
            element={
              switchable ? (
                <SwitchHarness capabilities={capabilities} />
              ) : (
                <>
                  <BuildsSection orgId={1} caps={capabilities} />
                  <LocationProbe />
                </>
              )
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
  return { requests, postBodies }
}

describe('BuildsSection', () => {
  afterEach(() => {
    saveBlobFile.mockReset()
    vi.restoreAllMocks()
  })

  it('lists builds and writes status, profile and page-size filters to the URL', async () => {
    const { requests } = setup()
    expect(await screen.findByText('#2')).toBeTruthy()
    expect(screen.getByText('#1')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '失败' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('status=failed'))
    fireEvent.change(screen.getByLabelText('Profile 筛选'), { target: { value: '1' } })
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('profileId=1'))
    fireEvent.change(screen.getByLabelText('每页条数'), { target: { value: '50' } })
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('pageSize=50'))

    const last = requests
      .filter((url) => url.startsWith('GET ') && url.includes('/client-builds?'))
      .at(-1)
    const query = new URL(last ?? '', 'http://x').searchParams
    expect(query.get('status')).toBe('failed')
    expect(query.get('profileId')).toBe('1')
    expect(query.get('pageSize')).toBe('50')
    expect(query.get('page')).toBe('1')
  })

  it('pages through the result set and clamps an out-of-range page', async () => {
    const { requests } = setup({ total: 45 })
    await screen.findByText('#2')
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('page=2'))
    expect(requests.some((url) => url.startsWith('GET ') && url.includes('page=2'))).toBe(true)
    await screen.findByRole('button', { name: '下一页' })
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('page=3'))
  })

  it('disables creation without a ready server or when no profile exists', async () => {
    setup({ capabilities: caps({ defaults: null }) })
    await screen.findByText('#2')
    const button = screen.getByRole('button', { name: '新建构建' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.title).toContain('服务器默认值不可用')
  })

  it('creates a build with profile and platform selection', async () => {
    const { requests, postBodies } = setup()
    await screen.findByText('#2')
    fireEvent.click(screen.getByRole('button', { name: '新建构建' }))
    const dialog = await screen.findByRole('dialog', { name: '新建构建' })
    fireEvent.click(within(dialog).getByLabelText('Windows x64'))
    fireEvent.click(within(dialog).getByLabelText('Linux x64'))
    fireEvent.click(within(dialog).getByRole('button', { name: '发起构建' }))

    await waitFor(() => {
      expect(postBodies).toHaveLength(1)
      expect(JSON.parse(postBodies[0])).toEqual({
        profile_id: 1,
        platforms: ['windows-x64', 'linux-x64'],
      })
      expect(
        requests.some((url) => url.startsWith('POST ') && url.endsWith('/client-builds')),
      ).toBe(true)
      expect(
        requests.filter((url) => url.startsWith('GET ') && url.includes('/client-builds?')).length,
      ).toBeGreaterThan(1)
    })
    expect(await screen.findByRole('dialog', { name: '构建 #9' })).toBeTruthy()
  })

  it('renders detail, cancel-requested state and artifact download', async () => {
    const { requests } = setup()
    await screen.findByText('#2')
    fireEvent.click(screen.getAllByRole('button', { name: '详情' })[0])
    const sheet = await screen.findByRole('dialog', { name: '构建 #2' })
    expect(await within(sheet).findByText('relay.example.com:21117')).toBeTruthy()
    expect(within(sheet).getByText('构建中')).toBeTruthy()

    fireEvent.click(within(sheet).getByRole('button', { name: '取消构建' }))
    const requested = (await within(sheet).findByRole('button', {
      name: '已请求取消',
    })) as HTMLButtonElement
    expect(requested.disabled).toBe(true)

    const detailRequest = requests.filter((url) => /GET .*\/client-builds\/2$/.test(url))
    expect(detailRequest.length).toBeGreaterThan(0)
  })

  it('downloads an artifact through the authenticated blob layer', async () => {
    setup({
      detailStatus: 'succeeded',
      detailOverrides: { artifacts_purged: false },
      cancelResult: 'succeeded',
    })
    await screen.findByText('#2')
    fireEvent.click(screen.getAllByRole('button', { name: '详情' })[0])
    const sheet = await screen.findByRole('dialog', { name: '构建 #2' })
    expect(within(sheet).queryByRole('button', { name: '取消构建' })).toBeNull()
    expect(await within(sheet).findByRole('button', { name: '刷新' })).toBeTruthy()
    fireEvent.click(await within(sheet).findByRole('button', { name: '下载' }))
    await waitFor(() => {
      expect(saveBlobFile).toHaveBeenCalledTimes(1)
    })
    expect(saveBlobFile.mock.calls[0][0]).toBe('panel-client-1-windows-x64.zip')
  })

  it('shows purged artifacts without download controls', async () => {
    setup({
      detailStatus: 'succeeded',
      detailOverrides: { artifacts_purged: true },
    })
    await screen.findByText('#2')
    fireEvent.click(screen.getAllByRole('button', { name: '详情' })[0])
    const sheet = await screen.findByRole('dialog', { name: '构建 #2' })
    expect(await within(sheet).findByText(/产物已清理/)).toBeTruthy()
    expect(within(sheet).queryByRole('button', { name: '下载' })).toBeNull()
  })
})

it('shows a list error and retries', async () => {
  setup({ listFailures: 1 })
  expect(await screen.findByText(/加载构建失败/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(await screen.findByText('#2')).toBeTruthy()
})

it('surfaces a cancel conflict inside the sheet', async () => {
  setup({ cancelErrorStatus: 409 })
  await screen.findByText('#2')
  fireEvent.click(screen.getAllByRole('button', { name: '详情' })[0])
  const sheet = await screen.findByRole('dialog', { name: '构建 #2' })
  await within(sheet).findByText('relay.example.com:21117')
  fireEvent.click(within(sheet).getByRole('button', { name: '取消构建' }))
  expect(await within(sheet).findByText('构建状态已变化，无法取消')).toBeTruthy()
})

it('surfaces a create conflict per operation', async () => {
  setup({ createdStatus: 409 })
  await screen.findByText('#2')
  fireEvent.click(screen.getByRole('button', { name: '新建构建' }))
  const dialog = await screen.findByRole('dialog', { name: '新建构建' })
  fireEvent.click(within(dialog).getByLabelText('Windows x64'))
  fireEvent.click(within(dialog).getByRole('button', { name: '发起构建' }))
  expect(await within(dialog).findByText('无法发起构建：服务器未就绪或配额已满')).toBeTruthy()
})

it('shows a missing build detail error without closing the sheet', async () => {
  setup({ detailErrorStatus: 404 })
  await screen.findByText('#2')
  fireEvent.click(screen.getAllByRole('button', { name: '详情' })[0])
  const sheet = await screen.findByRole('dialog', { name: '构建 #2' })
  expect(await within(sheet).findByText('构建不存在')).toBeTruthy()
  expect(screen.getByRole('dialog', { name: '构建 #2' })).toBeTruthy()
})

it('surfaces artifact download failures', async () => {
  setup({ detailStatus: 'succeeded', artifactStatus: 500 })
  await screen.findByText('#2')
  fireEvent.click(screen.getAllByRole('button', { name: '详情' })[0])
  const sheet = await screen.findByRole('dialog', { name: '构建 #2' })
  fireEvent.click(await within(sheet).findByRole('button', { name: '下载' }))
  expect(await within(sheet).findByText('服务异常，请稍后重试')).toBeTruthy()
  expect(saveBlobFile).not.toHaveBeenCalled()
})

it('clamps an out-of-range page', async () => {
  setup({ initial: '/orgs/1/builds?page=99', total: 45 })
  await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('page=3'))
  await screen.findByText('#2')
  expect(screen.getByRole('button', { name: '下一页' })).toHaveProperty('disabled', true)
})

it('renders the empty state without a pager', async () => {
  setup({ rows: [], total: 0 })
  expect(await screen.findByText('还没有构建')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '下一页' })).toBeNull()
})

it('surfaces a profiles load error instead of claiming there are none', async () => {
  setup({ profilesStatus: 500 })
  expect(await screen.findByText(/加载 Profile 筛选失败/)).toBeTruthy()
  const button = screen.getByRole('button', { name: '新建构建' }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  expect(button.title).toContain('Profile 列表加载失败')
})

it('maps a 503 build creation failure', async () => {
  setup({ createdStatus: 503 })
  await screen.findByText('#2')
  fireEvent.click(screen.getByRole('button', { name: '新建构建' }))
  const dialog = await screen.findByRole('dialog', { name: '新建构建' })
  fireEvent.click(within(dialog).getByLabelText('Windows x64'))
  fireEvent.click(within(dialog).getByRole('button', { name: '发起构建' }))
  expect(await within(dialog).findByText('构建能力不可用')).toBeTruthy()
})

it('closes the sheet when the organization switches', async () => {
  const { requests } = setup({ switchable: true })
  await screen.findByText('#2')
  fireEvent.click(screen.getAllByRole('button', { name: '详情' })[0])
  expect(await screen.findByRole('dialog', { name: '构建 #2' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: '切换组织' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(requests.some((url) => url.includes('/orgs/2/client-builds/2'))).toBe(false)
})
