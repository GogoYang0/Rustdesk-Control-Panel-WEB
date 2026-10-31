// Ticket presentation helpers. The server returns the bookkeeping row without
// the plaintext token; only the issuance response ever carries it.

import type { Ticket } from '../api/generated'
import { ApiError } from './api'

export const TICKET_TTL_OPTIONS = [
  { value: 60, label: '1 分钟' },
  { value: 300, label: '5 分钟' },
  { value: 900, label: '15 分钟' },
] as const

export const DEFAULT_TICKET_TTL = 300

export type TicketState = 'pending' | 'used' | 'revoked' | 'expired'

export const TICKET_STATUS_LABELS: Record<TicketState, string> = {
  pending: '待兑换',
  used: '已兑换',
  revoked: '已撤销',
  expired: '已过期',
}

export function ticketStatus(
  ticket: Pick<Ticket, 'used_at' | 'revoked_at' | 'expires_at'>,
  now: Date,
): TicketState {
  if (ticket.used_at) return 'used'
  if (ticket.revoked_at) return 'revoked'
  const expires = new Date(ticket.expires_at).getTime()
  if (Number.isNaN(expires) || expires <= now.getTime()) return 'expired'
  return 'pending'
}

/** mm:ss until the ticket expires; expired and invalid deadlines read the same. */
export function formatTicketRemaining(expiresAt: string, now: Date): string {
  const expires = new Date(expiresAt).getTime()
  const ms = expires - now.getTime()
  if (Number.isNaN(expires) || ms <= 0) return '已过期'
  const total = Math.floor(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function isApprovalRequired(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'approval_required'
}

/** `409 approval_required` carries `data.approval_id`; anything malformed is null. */
export function approvalIDFromError(err: unknown): number | null {
  if (!isApprovalRequired(err)) return null
  const detail = (err as ApiError).detail
  if (!detail || typeof detail !== 'object') return null
  const raw = (detail as { approval_id?: unknown }).approval_id
  const id = typeof raw === 'number' ? raw : Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/** Chinese copy for issuance failures; approval_required has its own stage. */
export function ticketIssueError(err: unknown): string {
  if (!(err instanceof ApiError)) return '网络异常，请稍后重试'
  if (err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 400) return '请求参数不合法，请检查票据有效期'
  if (err.status === 403) return '当前会籍无权签发连接票据'
  if (err.status === 404) return '设备不存在，或当前账号无权访问该设备'
  if (err.status === 409) {
    return '签发被拒绝：当前时段不允许连接，或审批已失效，请核对策略与审批状态'
  }
  if (err.status >= 500) return '服务异常，请稍后重试'
  return '操作失败，请稍后重试'
}

export function ticketDetailError(err: unknown): string {
  if (!(err instanceof ApiError) || err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 403) return '当前会籍无权读取票据'
  if (err.status === 404) return '票据记录不存在或不属于当前组织'
  if (err.status >= 500) return '服务异常，请稍后重试'
  return '票据详情加载失败，请稍后重试'
}
