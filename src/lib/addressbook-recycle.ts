// Recycle-bin presentation helpers. The server has no pagination here, so the
// console searches and caps rendering itself.

import type { AddressBookRecycleBinItem } from '../api/generated'
import { ApiError } from './api'

export const RECYCLE_RETENTION_DAYS = 30
export const RECYCLE_RENDER_LIMIT = 200

const DAY_MS = 24 * 60 * 60 * 1000

/** How long the row stays recoverable; expired rows await the hourly sweep. */
export function retentionText(deletedAt: string, now: Date): string {
  const deleted = new Date(deletedAt).getTime()
  if (Number.isNaN(deleted)) return '—'
  const remaining = deleted + RECYCLE_RETENTION_DAYS * DAY_MS - now.getTime()
  if (remaining <= 0) return '等待清扫'
  return `剩 ${Math.ceil(remaining / DAY_MS)} 天`
}

export function deletedByLabel(id: number, emails: Map<number, string>): string {
  if (!Number.isFinite(id) || id <= 0) return '系统'
  return emails.get(id) ?? `用户 #${id}`
}

export interface RecycleSearch {
  visible: AddressBookRecycleBinItem[]
  matched: number
  truncated: boolean
}

export function filterRecycle(
  items: AddressBookRecycleBinItem[],
  query: string,
  limit = RECYCLE_RENDER_LIMIT,
): RecycleSearch {
  const needle = query.trim().toLowerCase()
  const matched = needle
    ? items.filter((item) =>
        [item.peer_id, item.alias, item.hostname, ...(item.tags ?? [])]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLowerCase().includes(needle)),
      )
    : items
  return {
    // Keep the server's newest-first order; the cap only limits the DOM.
    visible: matched.slice(0, limit),
    matched: matched.length,
    truncated: matched.length > limit,
  }
}

export type RecycleAction = 'restore' | 'purge' | 'list'

/** Chinese copy for recycle-bin failures; backend English is never surfaced. */
export function recycleError(err: unknown, action: RecycleAction): string {
  if (!(err instanceof ApiError) || err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 400) {
    return action === 'restore'
      ? '地址簿已达 2000 个 peer 上限，无法恢复；请先删除一个 peer'
      : '请求参数不合法，请稍后重试'
  }
  if (err.status === 403) {
    if (action === 'list') return '当前角色没有查看回收站的权限'
    return action === 'restore' ? '当前角色没有恢复权限' : '当前账号没有永久删除权限'
  }
  if (err.status === 404) {
    return action === 'list' ? '地址簿不存在或无权访问' : '该条目已不在回收站，请刷新'
  }
  if (err.status >= 500) return '服务异常，请稍后重试'
  return '操作失败，请稍后重试'
}
