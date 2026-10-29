// Address-book helpers: grouping, the peer form, and the full-replacement
// payload. The API has no per-peer create/update and no revision check, so the
// UI refuses to replace a list it did not just read.

import type { AddressBook, AddressBookPeer } from '../api/generated'
import { ApiError } from './api'

export const PEER_LIMIT = 2000
export const PEER_RENDER_LIMIT = 200

export interface PeerForm {
  peerId: string
  alias: string
  username: string
  hostname: string
  platform: string
}

export type PeerChange =
  { kind: 'add'; peer: AddressBookPeer } | { kind: 'edit'; peerId: string; peer: AddressBookPeer }

const byName = (a: AddressBook, b: AddressBook) => a.name.localeCompare(b.name, 'zh-Hans-CN')

export function groupBooks(books: AddressBook[]): {
  personal: AddressBook[]
  shared: AddressBook[]
} {
  const personal = books.filter((book) => book.scope === 'personal').sort(byName)
  const shared = books.filter((book) => book.scope === 'shared').sort(byName)
  return { personal, shared }
}

export function canEditBook(
  book: AddressBook,
  userId: number | undefined,
  perms: Set<string>,
): boolean {
  if (book.scope === 'personal') return book.owner_id === userId
  return perms.has('addressbook.write')
}

export function peerToForm(peer?: AddressBookPeer): PeerForm {
  return {
    peerId: peer?.peer_id ?? '',
    alias: peer?.alias ?? '',
    username: peer?.username ?? '',
    hostname: peer?.hostname ?? '',
    platform: peer?.platform ?? '',
  }
}

/** Empty optional fields are omitted; peer_id is always trimmed. */
export function formToPeer(form: PeerForm, tags?: string[]): AddressBookPeer {
  const peer: AddressBookPeer = { peer_id: form.peerId.trim() }
  const alias = form.alias.trim()
  const username = form.username.trim()
  const hostname = form.hostname.trim()
  const platform = form.platform.trim()
  if (alias) peer.alias = alias
  if (username) peer.username = username
  if (hostname) peer.hostname = hostname
  if (platform) peer.platform = platform
  if (tags && tags.length > 0) peer.tags = tags
  return peer
}

export function validatePeerForm(
  form: PeerForm,
  peers: AddressBookPeer[],
  originalPeerId?: string,
): Record<string, string> {
  const errors: Record<string, string> = {}
  const peerId = form.peerId.trim()
  if (!peerId) errors.peerId = 'peer id 必填'
  else if (peerId.length > 64) errors.peerId = 'peer id 最多 64 个字符'
  else if (peers.some((peer) => peer.peer_id === peerId && peer.peer_id !== originalPeerId)) {
    errors.peerId = '该 peer id 已存在于本地址簿'
  }
  if (form.alias.trim().length > 128) errors.alias = '别名最多 128 个字符'
  if (form.username.trim().length > 128) errors.username = '用户名最多 128 个字符'
  if (form.hostname.trim().length > 128) errors.hostname = '主机名最多 128 个字符'
  if (form.platform.trim().length > 64) errors.platform = '平台最多 64 个字符'
  return errors
}

/** Builds the complete array to PUT; the untouched rows stay byte-for-byte. */
export function buildReplacePayload(
  peers: AddressBookPeer[],
  change: PeerChange,
): AddressBookPeer[] {
  if (change.kind === 'add') {
    if (peers.length >= PEER_LIMIT) {
      throw new RangeError(`地址簿最多 ${PEER_LIMIT} 个 peer`)
    }
    return [...peers, change.peer]
  }
  return peers.map((peer) => (peer.peer_id === change.peerId ? change.peer : peer))
}

export function revisionChanged(baseline: number, latest: number): boolean {
  return baseline !== latest
}

export interface PeerSearch {
  visible: AddressBookPeer[]
  matched: number
  truncated: boolean
}

export function filterPeers(
  peers: AddressBookPeer[],
  query: string,
  limit = PEER_RENDER_LIMIT,
): PeerSearch {
  const needle = query.trim().toLowerCase()
  const matched = (
    needle
      ? peers.filter((peer) =>
          [peer.peer_id, peer.alias, peer.hostname]
            .filter((value): value is string => Boolean(value))
            .some((value) => value.toLowerCase().includes(needle)),
        )
      : peers
  ).slice()
  // Sort the whole match before truncating, so the 200th row is the real 200th
  // by peer id rather than an artifact of the server's order.
  matched.sort((a, b) => a.peer_id.localeCompare(b.peer_id))
  return {
    visible: matched.slice(0, limit),
    matched: matched.length,
    truncated: matched.length > limit,
  }
}

/** Chinese copy for address-book failures. */
export function addressBookError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return '网络异常，请稍后重试'
    if (err.status === 403) return '当前角色没有该操作的权限'
    if (err.status === 404) return '地址簿不存在或无权访问'
    if (err.status === 409) return '同范围下已存在同名地址簿'
    if (err.status === 400) return '请求参数不合法，请检查填写内容'
    if (err.status >= 500) return '服务异常，请稍后重试'
    return err.message || '操作失败'
  }
  return '网络异常，请稍后重试'
}
