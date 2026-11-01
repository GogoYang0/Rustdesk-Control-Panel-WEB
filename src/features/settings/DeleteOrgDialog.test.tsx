import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MeOrg } from '../../lib/api'
import { panelApi } from '../../store/api'
import DeleteOrgDialog from './DeleteOrgDialog'

const org: MeOrg = {
  id: 1,
  name: 'ACME',
  role_id: 1,
  role_kind: 'owner',
  permissions: ['org.admin'],
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup(status = 200) {
  const requests: { method: string; url: string; body: string }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const method = String(init?.method ?? 'GET').toUpperCase()
    requests.push({ method, url: String(input), body: String(init?.body ?? '') })
    if (method === 'DELETE') {
      if (status !== 200) {
        return json({ code: 'conflict', message: 'cleanup' }, status)
      }
      return json({ code: 'ok', message: 'ok' })
    }
    return json({
      code: 'ok',
      message: 'ok',
      data: {
        user: {
          id: 1,
          email: 'owner@acme.local',
          email_verified: true,
          totp_enabled: false,
          has_password: true,
        },
        orgs: [],
      },
    })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  const onClose = vi.fn()
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/orgs/1/settings']}>
        <DeleteOrgDialog org={org} onClose={onClose} />
      </MemoryRouter>
    </Provider>,
  )
  return { requests, onClose }
}

afterEach(() => vi.restoreAllMocks())

describe('DeleteOrgDialog', () => {
  it('requires the exact name and deletes with confirmation', async () => {
    const { requests, onClose } = setup()
    fireEvent.change(screen.getByLabelText('确认组织名称'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: '删除组织' }))
    expect(screen.getByText('输入的组织名称与当前名称不一致')).toBeTruthy()
    expect(requests.some((request) => request.method === 'DELETE')).toBe(false)

    fireEvent.change(screen.getByLabelText('确认组织名称'), { target: { value: 'ACME' } })
    fireEvent.click(screen.getByRole('button', { name: '删除组织' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const del = requests.find((request) => request.method === 'DELETE')
    expect(del?.url).toBe('/api/v1/orgs/1')
    expect(JSON.parse(del?.body ?? '{}')).toEqual({ confirm_name: 'ACME' })
  })

  it('shows the provisioning cleanup failure and stays open', async () => {
    const { onClose } = setup(409)
    fireEvent.change(screen.getByLabelText('确认组织名称'), { target: { value: 'ACME' } })
    fireEvent.click(screen.getByRole('button', { name: '删除组织' }))
    expect(await screen.findByText(/供应容器清理失败/)).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })
})
