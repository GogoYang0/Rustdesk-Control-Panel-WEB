import { describe, expect, it } from 'vitest'

import type { AddressBook, AddressBookPeer } from '../api/generated'
import { ApiError } from './api'
import {
  PEER_LIMIT,
  addressBookError,
  buildReplacePayload,
  canEditBook,
  filterPeers,
  formToPeer,
  groupBooks,
  peerToForm,
  revisionChanged,
  validatePeerForm,
} from './addressbook-form'

function book(overrides: Partial<AddressBook> = {}): AddressBook {
  return {
    id: 1,
    name: '总部设备',
    scope: 'shared',
    revision: 3,
    created_at: '2026-10-29T00:00:00Z',
    updated_at: '2026-10-29T00:00:00Z',
    peers: [],
    tags: [],
    ...overrides,
  }
}

function peer(id: string, extra: Partial<AddressBookPeer> = {}): AddressBookPeer {
  return { peer_id: id, alias: `别名-${id}`, hostname: `host-${id}`, ...extra }
}

describe('grouping and permissions', () => {
  it('splits personal and shared books and sorts by name', () => {
    const books = [
      book({ id: 3, name: 'B 共享', scope: 'shared' }),
      book({ id: 1, name: 'A 个人', scope: 'personal', owner_id: 7 }),
      book({ id: 2, name: 'A 共享', scope: 'shared' }),
    ]
    const groups = groupBooks(books)
    expect(groups.personal.map((item) => item.id)).toEqual([1])
    expect(groups.shared.map((item) => item.name)).toEqual(['A 共享', 'B 共享'])
  })

  it('lets the personal owner edit without any permission code', () => {
    expect(canEditBook(book({ scope: 'personal', owner_id: 7 }), 7, new Set())).toBe(true)
    expect(canEditBook(book({ scope: 'personal', owner_id: 8 }), 7, new Set())).toBe(false)
  })

  it('requires addressbook.write for shared books', () => {
    expect(canEditBook(book(), 7, new Set(['addressbook.write']))).toBe(true)
    expect(canEditBook(book(), 7, new Set())).toBe(false)
  })
})

describe('peer form', () => {
  it('round-trips a peer and preserves tags that this wave cannot edit', () => {
    const original = peer('1001', { tags: ['lab', 'vip'] })
    const form = peerToForm(original)
    expect(form.peerId).toBe('1001')
    expect(formToPeer(form, original.tags)).toEqual({
      peer_id: '1001',
      alias: '别名-1001',
      hostname: 'host-1001',
      tags: ['lab', 'vip'],
    })
  })

  it('omits empty optional fields instead of sending empty strings', () => {
    const form = { peerId: ' 1002 ', alias: ' ', username: '', hostname: '', platform: '' }
    expect(formToPeer(form)).toEqual({ peer_id: '1002' })
  })

  it('requires a bounded peer id', () => {
    expect(
      validatePeerForm({ peerId: ' ', alias: '', username: '', hostname: '', platform: '' }, [])
        .peerId,
    ).toContain('必填')
    expect(
      validatePeerForm(
        { peerId: 'x'.repeat(65), alias: '', username: '', hostname: '', platform: '' },
        [],
      ).peerId,
    ).toContain('64')
  })

  it('rejects a duplicate peer id but allows keeping the edited one', () => {
    const peers = [peer('1001'), peer('1002')]
    const form = { peerId: '1001', alias: '', username: '', hostname: '', platform: '' }
    expect(validatePeerForm(form, peers).peerId).toContain('已存在')
    expect(validatePeerForm(form, peers, '1001')).toEqual({})
  })

  it('enforces field lengths', () => {
    const errors = validatePeerForm(
      {
        peerId: '1003',
        alias: 'a'.repeat(129),
        username: 'u'.repeat(129),
        hostname: 'h'.repeat(129),
        platform: 'p'.repeat(65),
      },
      [],
    )
    expect(errors.alias).toContain('128')
    expect(errors.username).toContain('128')
    expect(errors.hostname).toContain('128')
    expect(errors.platform).toContain('64')
  })
})

describe('full replacement payload', () => {
  it('appends a new peer without touching the rest of the list', () => {
    const peers = [peer('1001'), peer('1002')]
    const payload = buildReplacePayload(peers, {
      kind: 'add',
      peer: { peer_id: '1003', alias: '新设备' },
    })
    expect(payload.map((item) => item.peer_id)).toEqual(['1001', '1002', '1003'])
    expect(payload[0]).toEqual(peers[0])
  })

  it('edits one peer in place and keeps the others', () => {
    const peers = [peer('1001'), peer('1002')]
    const payload = buildReplacePayload(peers, {
      kind: 'edit',
      peerId: '1002',
      peer: { peer_id: '1002', alias: '改了' },
    })
    expect(payload[1]).toEqual({ peer_id: '1002', alias: '改了' })
    expect(payload[0]).toEqual(peers[0])
  })

  it('refuses to add beyond the contract limit', () => {
    expect(PEER_LIMIT).toBe(2000)
    const peers = Array.from({ length: PEER_LIMIT }, (_, index) => peer(String(1000 + index)))
    expect(() => buildReplacePayload(peers, { kind: 'add', peer: { peer_id: '9999' } })).toThrow(
      /2000/,
    )
  })

  it('detects a changed revision', () => {
    expect(revisionChanged(3, 3)).toBe(false)
    expect(revisionChanged(3, 4)).toBe(true)
  })
})

describe('peer search', () => {
  it('matches id, alias and hostname, and truncates at 200 rows', () => {
    const peers = Array.from({ length: 260 }, (_, index) => peer(String(1000 + index)))
    const all = filterPeers(peers, '')
    expect(all.visible).toHaveLength(200)
    expect(all.truncated).toBe(true)
    expect(filterPeers(peers, 'host-1259').visible.map((item) => item.peer_id)).toEqual(['1259'])
    expect(filterPeers(peers, '别名-1000').visible).toHaveLength(1)
    expect(filterPeers(peers, '1250').visible).toHaveLength(1)
  })
})

describe('error mapping', () => {
  it('explains the common failures', () => {
    expect(addressBookError(new ApiError(409, 'conflict', 'duplicate'))).toContain('已存在')
    expect(addressBookError(new ApiError(403, 'forbidden', 'forbidden'))).toContain('权限')
    expect(addressBookError(new ApiError(404, 'not_found', 'missing'))).toContain('不存在')
    expect(addressBookError(new ApiError(400, 'invalid_request', 'bad'))).toContain('不合法')
    expect(addressBookError(new ApiError(0, 'internal', 'Failed to fetch'))).toContain('网络')
    expect(addressBookError(new TypeError('Failed to fetch'))).toContain('网络')
  })
})
