import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Device } from '../../lib/api'
import { panelApi } from '../../store/api'
import { DeleteDeviceDialog } from './DeviceDialogs'

const device: Device = {
  id: 9,
  name: 'lab-pc',
  rustdesk_id: '700001',
  status: 'offline',
  last_seen_at: null,
  bound: false,
  disabled: false,
  device_group_id: null,
  owner_user_id: null,
  owner_email: null,
  note: '',
}

function setup(status = 200) {
  const requests: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    requests.push(`${init?.method ?? 'GET'} ${String(input)}`)
    return new Response(JSON.stringify({ code: status === 200 ? 'ok' : 'conflict' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  const onDone = vi.fn()
  render(
    <Provider store={store}>
      <DeleteDeviceDialog orgId={1} device={device} onClose={vi.fn()} onDone={onDone} />
    </Provider>,
  )
  return { requests, onDone }
}

afterEach(() => vi.restoreAllMocks())

describe('DeleteDeviceDialog', () => {
  it('deletes a device and closes on success', async () => {
    const { requests, onDone } = setup()
    fireEvent.click(screen.getByRole('button', { name: '删除设备' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(requests).toContain('DELETE /api/v1/orgs/1/devices/9')
  })

  it('shows the open-session conflict and keeps the dialog open', async () => {
    const { onDone } = setup(409)
    fireEvent.click(screen.getByRole('button', { name: '删除设备' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('进行中的会话')
    expect(onDone).not.toHaveBeenCalled()
  })
})
