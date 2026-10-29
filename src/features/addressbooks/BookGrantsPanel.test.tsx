import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AddressBook, AddressBookGrant, Member, UserGroup } from '../../lib/api'
import type { GrantDictionaryState } from '../../lib/addressbook-grant'
import { panelApi } from '../../store/api'
import BookGrantsPanel from './BookGrantsPanel'

const book: AddressBook = {
  id: 3,
  name: '总部共享',
  scope: 'shared',
  revision: 1,
  created_at: '2026-10-29T00:00:00Z',
  updated_at: '2026-10-29T00:00:00Z',
  peers: [],
  tags: [],
}

const members: Member[] = [
  {
    id: 1,
    user_id: 1,
    email: 'owner@acme.local',
    role_name: 'owner',
    disabled: false,
    created_at: '2026-10-29T00:00:00Z',
  },
  {
    id: 2,
    user_id: 2,
    email: 'ops@acme.local',
    role_name: 'member',
    disabled: true,
    created_at: '2026-10-29T00:00:00Z',
  },
] as Member[]

const groups: UserGroup[] = [
  { id: 1, name: '所有人', kind: 'everyone', member_ids: [], created_at: '', updated_at: '' },
  { id: 3, name: '研发组', kind: 'custom', member_ids: [], created_at: '', updated_at: '' },
]

const grants: AddressBookGrant[] = [
  {
    id: 9,
    subject_kind: 'everyone',
    subject_user_id: null,
    subject_group_id: null,
    access: 'read',
    created_by: 1,
    created_at: '2026-10-29T00:00:00Z',
  },
]

const disabledUserGrant: AddressBookGrant[] = [
  {
    id: 10,
    subject_kind: 'user',
    subject_user_id: 2,
    subject_group_id: null,
    access: 'write',
    created_by: 1,
    created_at: '2026-10-29T00:00:00Z',
  },
]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const idleState: GrantDictionaryState = { error: false, loading: false, retry: () => {} }

function setup(
  canManageGroups = true,
  list: AddressBookGrant[] = grants,
  memberList: Member[] = members,
  memberState: GrantDictionaryState = idleState,
  groupState: GrantDictionaryState = idleState,
  groupList: UserGroup[] = groups,
) {
  const posts: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    if (init?.method === 'POST') {
      posts.push(String(init.body))
      return json({ code: 'ok', message: 'ok', data: list[0] }, 201)
    }
    if (init?.method === 'DELETE') {
      return json({ code: 'ok', message: 'ok' })
    }
    return json({ code: 'ok', message: 'ok', data: list })
  })
  const emails = new Map(memberList.map((member) => [member.user_id, member.email]))
  const store = configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
  render(
    <Provider store={store}>
      <BookGrantsPanel
        orgId={1}
        book={book}
        emails={emails}
        members={memberList}
        groups={groupList}
        canManageGroups={canManageGroups}
        memberState={memberState}
        groupState={groupState}
      />
    </Provider>,
  )
  return { posts }
}

describe('BookGrantsPanel', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists grants with subject and access labels', async () => {
    setup()
    expect((await screen.findAllByText('所有人')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('只读').length).toBeGreaterThan(0)
    expect(screen.getByText('owner@acme.local')).toBeTruthy()
  })

  it('disables the group subject without access.manage', async () => {
    setup(false)
    await screen.findAllByText('所有人')
    fireEvent.click(screen.getByRole('button', { name: '添加授权' }))
    const chip = screen.getByRole('button', { name: '用户组' }) as HTMLButtonElement
    expect(chip.disabled).toBe(true)
    expect(screen.getByText(/无法列用户组/)).toBeTruthy()
  })

  it('warns that re-posting an existing subject updates it', async () => {
    setup()
    await screen.findAllByText('所有人')
    fireEvent.click(screen.getByRole('button', { name: '添加授权' }))
    fireEvent.click(screen.getByRole('button', { name: '所有人' }))
    expect(await screen.findByText(/该主体已有/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '更新' })).toBeTruthy()
  })

  it('explains the everyone default when revoking it', async () => {
    setup()
    await screen.findAllByText('所有人')
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(await screen.findByText(/回到共享簿的默认只读/)).toBeTruthy()
  })

  it('locks the subject kind while editing an existing grant', async () => {
    setup()
    await screen.findAllByText('所有人')
    fireEvent.click(screen.getAllByRole('button', { name: '修改权限' })[0])
    for (const name of ['成员', '用户组']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true)
    }
    expect(screen.getByText(/主体不可更改/)).toBeTruthy()
  })

  it('adds a user grant without sending the disabled member option', async () => {
    const { posts } = setup()
    await screen.findAllByText('所有人')
    fireEvent.click(screen.getByRole('button', { name: '添加授权' }))
    const select = screen.getByLabelText('成员') as HTMLSelectElement
    expect([...select.options].map((option) => option.value)).toEqual(['', '1'])
    fireEvent.change(select, { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(JSON.parse(posts[0])).toEqual({
      subject_kind: 'user',
      subject_user_id: 1,
      access: 'read',
    })
  })

  it('keeps a disabled member selectable when editing their grant', async () => {
    const { posts } = setup(true, disabledUserGrant)
    fireEvent.click(await screen.findByRole('button', { name: '修改权限' }))
    const select = screen.getByLabelText('成员') as HTMLSelectElement
    expect(select.value).toBe('2')
    expect([...select.options].map((option) => option.value)).toContain('2')
    fireEvent.click(screen.getByRole('button', { name: '更新' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(JSON.parse(posts[0])).toEqual({
      subject_kind: 'user',
      subject_user_id: 2,
      access: 'write',
    })
  })

  it('falls back to a label when the grant subject is missing from members', async () => {
    setup(
      true,
      disabledUserGrant,
      members.filter((member) => member.user_id !== 2),
    )
    fireEvent.click(await screen.findByRole('button', { name: '修改权限' }))
    expect((screen.getByLabelText('成员') as HTMLSelectElement).value).toBe('2')
    expect(screen.getByRole('option', { name: /不在成员字典中/ })).toBeTruthy()
  })

  it('offers a retry when the member dictionary fails to load', async () => {
    const retry = vi.fn()
    setup(true, disabledUserGrant, [], { error: true, loading: false, retry })
    fireEvent.click(await screen.findByRole('button', { name: '修改权限' }))
    expect(screen.getByText(/加载成员失败/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('offers a retry when the user group dictionary fails to load', async () => {
    const retry = vi.fn()
    setup(true, grants, members, undefined, { error: true, loading: false, retry }, [])
    await screen.findAllByText('所有人')
    fireEvent.click(screen.getByRole('button', { name: '添加授权' }))
    expect(screen.getByText(/加载用户组失败/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
