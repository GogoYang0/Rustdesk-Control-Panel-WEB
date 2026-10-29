import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClientBuildCapabilities } from '../../lib/api'
import { panelApi } from '../../store/api'
import ProfilesSection from './ProfilesSection'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function caps(overrides: Record<string, unknown> = {}): ClientBuildCapabilities {
  return {
    enabled: true,
    platforms: ['windows-x64'],
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
    profiles?: Record<string, unknown>[]
    capabilities?: ClientBuildCapabilities
    deleteStatus?: number
    logoBody?: Blob
    logoContentType?: string
    profilesStatus?: number
  } = {},
) {
  const items = [...(options.profiles ?? [])]
  const capabilities = options.capabilities ?? caps()
  const requests: { url: string; method: string; body: string; cache: string }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = String(init?.method ?? 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? init.body : ''
    requests.push({ url, method, body, cache: String(init?.cache ?? '') })
    if (url.includes('/logo') && method === 'GET') {
      return new Response(options.logoBody ?? new Blob(['png'], { type: 'image/png' }), {
        status: 200,
        headers: { 'Content-Type': options.logoContentType ?? 'image/png' },
      })
    }
    if (url.includes('/logo') && method === 'PUT') {
      const target = items.find((item) => url.includes(`/${item.id}/logo`))
      if (target) {
        target.has_logo = true
        target.logo_width = 256
        target.logo_height = 256
        target.logo_sha256 = 'a'.repeat(64)
      }
      return json({ code: 'ok', message: 'ok', data: target })
    }
    if (url.includes('/logo') && method === 'DELETE') {
      const target = items.find((item) => url.includes(`/${item.id}/logo`))
      if (target) {
        target.has_logo = false
        target.logo_width = 0
        target.logo_height = 0
        target.logo_sha256 = ''
      }
      return json({ code: 'ok', message: 'ok', data: null })
    }
    if (url.includes('/client-build-profiles') && method === 'POST') {
      const parsed = JSON.parse(body) as { name: string; app_name: string }
      const created = profile(100 + items.length, {
        name: parsed.name,
        app_name: parsed.app_name,
      })
      items.push(created)
      return json({ code: 'ok', message: 'ok', data: created }, 201)
    }
    if (url.includes('/client-build-profiles') && method === 'PATCH') {
      const id = Number(url.match(/profiles\/(\d+)$/)?.[1])
      const parsed = JSON.parse(body) as { name?: string; app_name?: string }
      const target = items.find((item) => item.id === id)
      if (target) {
        if (parsed.name) target.name = parsed.name
        if (parsed.app_name) target.app_name = parsed.app_name
      }
      return json({ code: 'ok', message: 'ok', data: target })
    }
    if (url.includes('/client-build-profiles') && method === 'DELETE') {
      if (options.deleteStatus && options.deleteStatus !== 200) {
        return json(
          { code: 'conflict', message: 'profile has active builds' },
          options.deleteStatus,
        )
      }
      const id = Number(url.match(/profiles\/(\d+)$/)?.[1])
      const index = items.findIndex((item) => item.id === id)
      if (index >= 0) items.splice(index, 1)
      return json({ code: 'ok', message: 'ok', data: null })
    }
    if (url.includes('/client-build-profiles')) {
      if (options.profilesStatus && options.profilesStatus !== 200) {
        return json({ code: 'internal', message: 'database is locked' }, options.profilesStatus)
      }
      return json({
        code: 'ok',
        message: 'ok',
        data: { items, page: 1, page_size: 200, total: items.length },
      })
    }
    return json({ code: 'ok', message: 'ok', data: null })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  const view = render(
    <Provider store={store}>
      <ProfilesSection orgId={1} caps={capabilities} />
    </Provider>,
  )
  return { requests, items, view }
}

describe('ProfilesSection', () => {
  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:test'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
  })
  afterEach(() => {
    delete (URL as { createObjectURL?: unknown }).createObjectURL
    delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL
    vi.restoreAllMocks()
  })

  it('creates a profile with trimmed fields and refetches the list', async () => {
    const { requests } = setup()
    expect(await screen.findByText('还没有品牌配置')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '新建 Profile' }))
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '  Acme  ' } })
    fireEvent.change(screen.getByLabelText('应用名'), { target: { value: ' Acme Remote ' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('Acme')).toBeTruthy()
    const post = requests.find(
      (request) => request.method === 'POST' && request.url.includes('/client-build-profiles'),
    )
    expect(JSON.parse(post?.body ?? '{}')).toEqual({
      name: 'Acme',
      app_name: 'Acme Remote',
    })
  })

  it('blocks duplicate names before calling the API', async () => {
    const { requests } = setup({ profiles: [profile(1, { name: 'Acme' })] })
    await screen.findByText('Acme')
    fireEvent.click(screen.getByRole('button', { name: '新建 Profile' }))
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'acme' } })
    fireEvent.change(screen.getByLabelText('应用名'), { target: { value: 'Other' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText(/名称已被使用/)).toBeTruthy()
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(0)
  })

  it('edits the app name', async () => {
    const { requests } = setup({ profiles: [profile(1, { name: 'Acme' })] })
    await screen.findByText('Acme')
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('应用名'), { target: { value: 'Acme 2' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.getByText('应用名 Acme 2')).toBeTruthy())
    const patch = requests.find((request) => request.method === 'PATCH')
    expect(JSON.parse(patch?.body ?? '{}')).toEqual({ name: 'Acme', app_name: 'Acme 2' })
  })

  it('deletes a profile after confirmation and maps an active-build conflict', async () => {
    const { requests } = setup({ profiles: [profile(1, { name: 'Acme' })] })
    await screen.findByText('Acme')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    const dialog = await screen.findByRole('dialog', { name: /删除 Profile/ })
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))
    await waitFor(() => expect(screen.queryByText('Acme')).toBeNull())
    expect(requests.some((request) => request.method === 'DELETE')).toBe(true)

    const conflict = setup({
      profiles: [profile(2, { name: 'Busy' })],
      deleteStatus: 409,
    })
    await screen.findByText('Busy')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    const busyDialog = await screen.findByRole('dialog', { name: /删除 Profile/ })
    fireEvent.click(within(busyDialog).getByRole('button', { name: '删除' }))
    const errorDialog = await screen.findByRole('dialog', { name: /删除 Profile/ })
    expect(within(errorDialog).getByText('该 Profile 仍有进行中的构建，暂不能删除')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: /删除 Profile/ })).toBeTruthy()
    expect(conflict.requests.some((request) => request.method === 'DELETE')).toBe(true)
  })

  it('disables creation at the capability profile limit', async () => {
    setup({
      profiles: [profile(1)],
      capabilities: caps({
        limits: {
          max_profiles_per_org: 1,
          max_concurrent_per_org: 2,
          max_active_builds: 4,
          max_artifact_bytes: 1024,
          artifact_retention_days: 30,
        },
      }),
    })
    await screen.findByText('Profile 1')
    expect(
      (screen.getByRole('button', { name: '新建 Profile' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('uploads the bare base64 PNG and shows the new dimensions', async () => {
    const { requests } = setup({ profiles: [profile(1, { name: 'Acme' })] })
    await screen.findByText('Acme')
    const input = screen.getByLabelText('上传 Logo Acme') as HTMLInputElement
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', {
      type: 'image/png',
    })
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText(/Logo 256×256/)).toBeTruthy()
    const put = requests.find((request) => request.method === 'PUT')
    const payload = JSON.parse(put?.body ?? '{}') as { png_base64: string }
    expect(payload.png_base64.length).toBeGreaterThan(0)
    expect(payload.png_base64.startsWith('data:')).toBe(false)
  })

  it('rejects a non-PNG file before calling the API', async () => {
    const { requests } = setup({ profiles: [profile(1, { name: 'Acme' })] })
    await screen.findByText('Acme')
    const input = screen.getByLabelText('上传 Logo Acme') as HTMLInputElement
    const file = new File(['x'], 'logo.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(await screen.findByText('Logo 必须是 PNG 文件')).toBeTruthy()
    expect(requests.some((request) => request.method === 'PUT')).toBe(false)
  })

  it('previews an authenticated logo blob and revokes its object URL', async () => {
    const { view, requests } = setup({
      profiles: [
        profile(1, {
          name: 'Acme',
          has_logo: true,
          logo_width: 256,
          logo_height: 256,
          logo_sha256: 'b'.repeat(64),
        }),
      ],
    })
    const image = await screen.findByRole('img', { name: 'Acme Logo' })
    expect(image.getAttribute('src')).toBe('blob:test')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    const logoRequest = requests.find(
      (request) => request.method === 'GET' && request.url.includes('/logo'),
    )
    expect(logoRequest?.url).toContain('v=')
    expect(logoRequest?.cache).toBe('no-store')
    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })

  it('shows a load error without the empty state', async () => {
    setup({ profilesStatus: 500 })
    expect(await screen.findByText(/加载 Profile 失败/)).toBeTruthy()
    expect(screen.queryByText('还没有品牌配置')).toBeNull()
  })

  it('falls back when the logo is not a PNG response', async () => {
    setup({
      profiles: [profile(1, { name: 'Acme', has_logo: true, logo_width: 256, logo_height: 256 })],
      logoContentType: 'text/html',
    })
    expect(await screen.findByText('Logo 不可用')).toBeTruthy()
    expect(screen.queryByRole('img', { name: 'Acme Logo' })).toBeNull()
  })

  it('removes a logo after confirmation', async () => {
    const { requests } = setup({
      profiles: [profile(1, { name: 'Acme', has_logo: true, logo_width: 256, logo_height: 256 })],
    })
    await screen.findByText(/Logo 256×256/)
    fireEvent.click(screen.getByRole('button', { name: '移除 Logo' }))
    const dialog = await screen.findByRole('dialog', { name: /移除.*的 Logo/ })
    fireEvent.click(within(dialog).getByRole('button', { name: '移除 Logo' }))

    expect(await screen.findByText('未上传 Logo')).toBeTruthy()
    expect(
      requests.some((request) => request.method === 'DELETE' && request.url.includes('/logo')),
    ).toBe(true)
  })
})
