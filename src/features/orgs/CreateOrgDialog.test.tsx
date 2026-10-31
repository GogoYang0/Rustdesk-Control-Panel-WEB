import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Me } from '../../lib/api'
import { panelApi } from '../../store/api'
import CreateOrgDialog from './CreateOrgDialog'

const oldMe: Me = {
  user: {
    id: 1,
    email: 'admin@acme.local',
    email_verified: true,
    totp_enabled: false,
    has_password: true,
  },
  orgs: [{ id: 1, name: 'Acme', role_id: 1, role_kind: 'owner', permissions: ['org.admin'] }],
}

const newMe: Me = {
  user: oldMe.user,
  orgs: [
    ...oldMe.orgs,
    {
      id: 9,
      name: '新组织',
      role_id: 2,
      role_kind: 'owner',
      permissions: ['org.admin', 'device.read'],
    },
  ],
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface Options {
  createStatus?: number
  meStatus?: number
  deferredCreate?: boolean
}

function setup({ createStatus = 201, meStatus = 200, deferredCreate = false }: Options = {}) {
  const creates: string[] = []
  let meStatusNow = meStatus
  let meCalls = 0
  let release = () => {}
  const gate = deferredCreate
    ? new Promise<void>((resolve) => {
        release = resolve
      })
    : Promise.resolve()
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/orgs') && init?.method === 'POST') {
      creates.push(String(init.body ?? ''))
      await gate
      if (createStatus >= 400) return json({ code: 'conflict', message: 'quota' }, createStatus)
      return json(
        {
          code: 'ok',
          message: 'ok',
          data: { id: 9, name: '新组织', created_at: '2026-10-31T00:00:00Z' },
        },
        201,
      )
    }
    if (url.endsWith('/me')) {
      meCalls += 1
      if (meStatusNow >= 400) return json({ code: 'internal', message: 'boom' }, meStatusNow)
      return json({ code: 'ok', message: 'ok', data: newMe })
    }
    return json({ code: 'ok', message: 'ok', data: null })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  void store.dispatch(panelApi.util.upsertQueryData('getMe', undefined, oldMe))
  const onCreated = vi.fn()
  const onClose = vi.fn()
  render(
    <Provider store={store}>
      <CreateOrgDialog onClose={onClose} onCreated={onCreated} />
    </Provider>,
  )
  return {
    creates,
    store,
    onCreated,
    onClose,
    release: () => release(),
    meCalls: () => meCalls,
    fixMe: () => {
      meStatusNow = 200
    },
  }
}

describe('CreateOrgDialog', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('trims the name, refreshes /me and hands the org to the caller', async () => {
    const { creates, store, onCreated } = setup()
    fireEvent.change(screen.getByLabelText('组织名称'), { target: { value: '  新组织  ' } })
    fireEvent.click(screen.getByRole('button', { name: '创建组织' }))
    await waitFor(() => expect(creates).toHaveLength(1))
    expect(JSON.parse(creates[0])).toEqual({ name: '新组织' })
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(onCreated.mock.calls[0][0]).toMatchObject({ id: 9, name: '新组织' })
    await waitFor(() => expect(JSON.stringify(store.getState())).toContain('新组织'))
  })

  it('rejects an empty name without a request', async () => {
    const { creates } = setup()
    fireEvent.click(screen.getByRole('button', { name: '创建组织' }))
    expect((await screen.findByRole('alert')).textContent).toContain('请填写')
    expect(creates).toHaveLength(0)
  })

  it('maps the quota conflict without refreshing /me', async () => {
    const { creates, meCalls } = setup({ createStatus: 409 })
    fireEvent.change(screen.getByLabelText('组织名称'), { target: { value: '新组织' } })
    fireEvent.click(screen.getByRole('button', { name: '创建组织' }))
    expect((await screen.findByRole('alert')).textContent).toContain('上限')
    expect(creates).toHaveLength(1)
    expect(meCalls()).toBe(0)
  })

  it('keeps the created result when /me fails and retries without creating again', async () => {
    const { creates, onCreated, meCalls, fixMe } = setup({ meStatus: 500 })
    fireEvent.change(screen.getByLabelText('组织名称'), { target: { value: '新组织' } })
    fireEvent.click(screen.getByRole('button', { name: '创建组织' }))
    expect(await screen.findByText(/组织列表刷新失败/)).toBeTruthy()
    expect(creates).toHaveLength(1)
    expect(onCreated).not.toHaveBeenCalled()

    fixMe()
    fireEvent.click(screen.getByRole('button', { name: '重试刷新' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(creates).toHaveLength(1)
    expect(meCalls()).toBe(2)
  })

  it('cannot be dismissed while the create request is in flight', async () => {
    const { onClose, release } = setup({ deferredCreate: true })
    fireEvent.change(screen.getByLabelText('组织名称'), { target: { value: '新组织' } })
    fireEvent.click(screen.getByRole('button', { name: '创建组织' }))
    await screen.findByRole('button', { name: '创建中…' })
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onClose).not.toHaveBeenCalled()
    release()
    await waitFor(() => expect(screen.queryByText(/组织已创建/)).toBeTruthy())
  })
})
