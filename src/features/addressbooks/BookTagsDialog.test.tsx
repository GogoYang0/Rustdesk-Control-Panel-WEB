import { configureStore } from '@reduxjs/toolkit'
import { Toast } from '@douyinfe/semi-ui'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AddressBook } from '../../lib/api'
import { panelApi } from '../../store/api'
import BookTagsDialog from './BookTagsDialog'

function book(overrides: Partial<AddressBook> = {}): AddressBook {
  return {
    id: 5,
    name: 'E2E Book',
    scope: 'personal',
    owner_id: 1,
    revision: 3,
    peers: [{ peer_id: '1001', tags: ['lab'] }],
    tags: [
      { name: 'lab', color: 0x0f4c81 },
      { name: 'finance', color: 0 },
    ],
    created_at: '2026-10-30T00:00:00Z',
    updated_at: '2026-10-30T00:00:00Z',
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

function setup(options: { revisionAfterRead?: number; putStatus?: number } = {}) {
  let gets = 0
  const puts: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/tags') && init?.method === 'PUT') {
      puts.push(String(init.body))
      if (options.putStatus && options.putStatus >= 400) {
        return json({ code: 'forbidden', message: 'no' }, options.putStatus)
      }
      return json({ code: 'ok', message: 'ok', data: book({ revision: 4 }) })
    }
    gets += 1
    const revision = gets > 1 && options.revisionAfterRead ? options.revisionAfterRead : 3
    return json({ code: 'ok', message: 'ok', data: book({ revision }) })
  })
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  const onDone = vi.fn()
  render(
    <Provider store={store}>
      <BookTagsDialog orgId={1} book={book()} onClose={() => {}} onDone={onDone} />
    </Provider>,
  )
  return { puts, onDone, getGets: () => gets }
}

describe('BookTagsDialog', () => {
  afterEach(() => vi.restoreAllMocks())

  it('initializes from the palette and saves the whole list', async () => {
    const { puts, onDone } = setup()
    expect((screen.getByLabelText('标签名称 1') as HTMLInputElement).value).toBe('lab')
    expect((screen.getByLabelText('标签名称 2') as HTMLInputElement).value).toBe('finance')

    fireEvent.click(screen.getByRole('button', { name: '添加标签' }))
    fireEvent.change(screen.getByLabelText('标签名称 3'), { target: { value: ' new ' } })
    fireEvent.click(await saveButton())

    await waitFor(() => expect(puts).toHaveLength(1))
    expect(JSON.parse(puts[0])).toEqual({
      tags: [
        { name: 'lab', color: 0x0f4c81 },
        { name: 'finance', color: 0 },
        { name: 'new', color: 0 },
      ],
    })
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('rejects duplicate and empty names locally', async () => {
    const { puts } = setup()
    fireEvent.change(screen.getByLabelText('标签名称 2'), { target: { value: ' lab ' } })
    fireEvent.click(await saveButton())
    expect((await screen.findByRole('alert')).textContent).toContain('重复')
    expect(puts).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('标签名称 2'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect((await screen.findByRole('alert')).textContent).toContain('不能为空')
    expect(puts).toHaveLength(0)
  })

  it('aborts when the book changed before saving', async () => {
    const { puts } = setup({ revisionAfterRead: 4 })
    fireEvent.change(screen.getByLabelText('标签名称 1'), { target: { value: 'lab2' } })
    fireEvent.click(await saveButton())
    expect(await screen.findByText(/已被他人修改/)).toBeTruthy()
    expect(puts).toHaveLength(0)
  })

  it('maps a forbidden save and keeps the dialog open', async () => {
    const { puts } = setup({ putStatus: 403 })
    fireEvent.change(screen.getByLabelText('标签名称 1'), { target: { value: 'lab2' } })
    fireEvent.click(await saveButton())
    expect(await screen.findByText(/没有该操作的权限/)).toBeTruthy()
    expect(puts).toHaveLength(1)
    expect(screen.getByRole('button', { name: '保存' })).toBeTruthy()
  })

  it('removes a palette row', async () => {
    setup()
    fireEvent.click(screen.getAllByRole('button', { name: '移除' })[1])
    expect(screen.queryByLabelText('标签名称 2')).toBeNull()
    const success = vi.spyOn(Toast, 'success')
    fireEvent.click(await saveButton())
    await waitFor(() => expect(success).toHaveBeenCalledWith('标签已保存'))
  })
})
