import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AddressBook, AddressBookTag } from '../../lib/api'
import { panelApi } from '../../store/api'
import { PeerDialog } from './AddressBookDialogs'

function book(overrides: Partial<AddressBook> = {}): AddressBook {
  return {
    id: 2,
    name: '总部共享',
    scope: 'shared',
    revision: 1,
    created_at: '2026-10-29T00:00:00Z',
    updated_at: '2026-10-29T00:00:00Z',
    peers: [{ peer_id: '1001' }, { peer_id: '1002' }],
    tags: [],
    ...overrides,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function saveButton() {
  const save = screen.getByRole('button', { name: '保存' }) as HTMLButtonElement
  await waitFor(() => expect(save.disabled).toBe(false))
  return save
}

function setup(
  options: {
    revisionAfterRead?: number
    failRefetch?: boolean
    peer?: { peer_id: string; tags?: string[] }
    tags?: AddressBookTag[]
  } = {},
) {
  let gets = 0
  const puts: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/peers') && init?.method === 'PUT') {
      puts.push(String(init.body))
      return json({ code: 'ok', message: 'ok', data: book({ revision: 2 }) })
    }
    gets += 1
    if (gets > 1 && options.failRefetch) {
      return json({ code: 'internal', message: 'boom', data: null }, 500)
    }
    const revision = gets > 1 && options.revisionAfterRead ? options.revisionAfterRead : 1
    return json({ code: 'ok', message: 'ok', data: book({ revision, tags: options.tags ?? [] }) })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  const onDone = vi.fn()
  render(
    <Provider store={store}>
      <PeerDialog
        orgId={1}
        book={book({ tags: options.tags ?? [] })}
        peer={options.peer}
        onClose={() => {}}
        onDone={onDone}
      />
    </Provider>,
  )
  return { puts, onDone, getGets: () => gets }
}

describe('PeerDialog', () => {
  afterEach(() => vi.restoreAllMocks())

  it('adds a peer by replacing the complete list', async () => {
    const { puts, onDone } = setup()
    fireEvent.change(screen.getByLabelText('Peer ID'), { target: { value: '1003' } })
    fireEvent.change(screen.getByLabelText('别名'), { target: { value: '新设备' } })
    fireEvent.click(await saveButton())
    await waitFor(() => expect(puts).toHaveLength(1))
    const body = JSON.parse(puts[0]) as { peers: { peer_id: string }[] }
    expect(body.peers.map((peer) => peer.peer_id)).toEqual(['1001', '1002', '1003'])
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('aborts when the book changed since it was opened', async () => {
    const { puts, getGets } = setup({ revisionAfterRead: 2 })
    // The dialog must have read the baseline before the submit re-read counts.
    await waitFor(() => expect(getGets()).toBeGreaterThanOrEqual(1))
    fireEvent.change(screen.getByLabelText('Peer ID'), { target: { value: '1003' } })
    fireEvent.click(await saveButton())
    expect(await screen.findByText(/已被他人修改/)).toBeTruthy()
    expect(puts).toHaveLength(0)
  })

  it('does not replace the list when the final read fails', async () => {
    const { puts } = setup({ failRefetch: true })
    fireEvent.change(screen.getByLabelText('Peer ID'), { target: { value: '1003' } })
    fireEvent.click(await saveButton())
    expect(await screen.findByText(/无法读取地址簿最新内容/)).toBeTruthy()
    expect(puts).toHaveLength(0)
  })

  it('refuses a duplicate peer id without sending anything', async () => {
    const { puts } = setup()
    fireEvent.change(screen.getByLabelText('Peer ID'), { target: { value: '1001' } })
    fireEvent.click(await saveButton())
    expect(await screen.findByText(/已存在于本地址簿/)).toBeTruthy()
    expect(puts).toHaveLength(0)
  })

  it('selects a palette tag for a new peer', async () => {
    const { puts, onDone } = setup({
      tags: [
        { name: 'lab', color: 0x0f4c81 },
        { name: 'finance', color: 0 },
      ],
    })
    fireEvent.change(screen.getByLabelText('Peer ID'), { target: { value: '1003' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'lab' }))
    fireEvent.click(await saveButton())
    await waitFor(() => expect(puts).toHaveLength(1))
    const body = JSON.parse(puts[0]) as { peers: { peer_id: string; tags?: string[] }[] }
    expect(body.peers.find((peer) => peer.peer_id === '1003')?.tags).toEqual(['lab'])
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('keeps an orphan tag checked and drops it only when unchecked', async () => {
    const { puts } = setup({
      tags: [{ name: 'lab', color: 0 }],
      peer: { peer_id: '1001', tags: ['old'] },
    })
    expect(screen.getByRole('checkbox', { name: /old/ })).toBeChecked()
    fireEvent.change(screen.getByLabelText('别名'), { target: { value: '改名' } })
    fireEvent.click(await saveButton())
    await waitFor(() => expect(puts).toHaveLength(1))
    let body = JSON.parse(puts[0]) as { peers: { peer_id: string; tags?: string[] }[] }
    expect(body.peers.find((peer) => peer.peer_id === '1001')?.tags).toEqual(['old'])

    fireEvent.click(screen.getByRole('checkbox', { name: /old/ }))
    fireEvent.click(await saveButton())
    await waitFor(() => expect(puts).toHaveLength(2))
    body = JSON.parse(puts[1]) as { peers: { peer_id: string; tags?: string[] }[] }
    expect(body.peers.find((peer) => peer.peer_id === '1001')?.tags).toBeUndefined()
  })

  it('keeps the tags of an edited peer that this wave cannot edit', async () => {
    const { puts } = setup({ peer: { peer_id: '1001', tags: ['lab'] } })
    fireEvent.change(screen.getByLabelText('别名'), { target: { value: '改名' } })
    fireEvent.click(await saveButton())
    await waitFor(() => expect(puts).toHaveLength(1))
    const body = JSON.parse(puts[0]) as {
      peers: { peer_id: string; alias?: string; tags?: string[] }[]
    }
    const edited = body.peers.find((peer) => peer.peer_id === '1001')
    expect(edited?.alias).toBe('改名')
    expect(edited?.tags).toEqual(['lab'])
  })
})
