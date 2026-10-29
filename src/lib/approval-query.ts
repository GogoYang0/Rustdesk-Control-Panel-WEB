// Approval-center query and decision helpers. The API filters one status at a
// time, so the center exposes four tabs instead of merging pages, and every
// derived label keeps pre-approval and ratification apart.

import type {
  Approval,
  ApprovalDecision,
  ApprovalDecisionRequest,
  ApprovalKind,
  ApprovalStatus,
} from '../api/generated'
import { ApiError } from './api'

export const APPROVAL_PAGE_SIZE = 50
export const APPROVAL_STATUSES: ApprovalStatus[] = ['pending', 'approved', 'denied', 'expired']
export const MAX_APPROVAL_PAGE = 100_000

export interface ApprovalFilters {
  status: ApprovalStatus
  /** Device row id as a positive integer string; '' means no filter. */
  deviceId: string
  page: number
  /** Deep link to one approval; never sent to the list endpoint. */
  approvalId: number | null
}

export const DEFAULT_APPROVAL_FILTERS: ApprovalFilters = {
  status: 'pending',
  deviceId: '',
  page: 1,
  approvalId: null,
}

function isStatus(value: string): value is ApprovalStatus {
  return (APPROVAL_STATUSES as string[]).includes(value)
}

function positiveInt(value: string, max: number = Number.MAX_SAFE_INTEGER): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) && n <= max ? n : null
}

/** Unknown or malformed values fall back to the default instead of erroring. */
export function parseApprovalFilters(params: URLSearchParams): ApprovalFilters {
  const status = params.get('status') ?? ''
  const deviceId = params.get('deviceId') ?? ''
  // Only the page has the API's cap; ids are ordinary auto-increment keys.
  const page = positiveInt(params.get('page') ?? '', MAX_APPROVAL_PAGE)
  const approvalId = positiveInt(params.get('approvalId') ?? '')
  return {
    status: isStatus(status) ? status : DEFAULT_APPROVAL_FILTERS.status,
    deviceId: positiveInt(deviceId) ? deviceId : '',
    page: page ?? 1,
    approvalId,
  }
}

/** Omits defaults so the common view keeps a short URL; keeps the deep link. */
export function toApprovalSearchParams(filters: ApprovalFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.status !== DEFAULT_APPROVAL_FILTERS.status) params.set('status', filters.status)
  if (filters.deviceId) params.set('deviceId', filters.deviceId)
  if (filters.page > 1) params.set('page', String(filters.page))
  if (filters.approvalId) params.set('approvalId', String(filters.approvalId))
  return params
}

/** Request parameters for `GET /orgs/{orgId}/approvals`. */
export function toApprovalRequestQuery(
  filters: ApprovalFilters,
  pageSize = APPROVAL_PAGE_SIZE,
): URLSearchParams {
  const query = new URLSearchParams()
  query.set('status', filters.status)
  if (filters.deviceId) query.set('deviceId', filters.deviceId)
  query.set('page', String(filters.page))
  query.set('pageSize', String(pageSize))
  return query
}

/** A decision needs a pending request that has not passed its deadline. */
export function isActionable(approval: Approval, now: Date): boolean {
  if (approval.status !== 'pending') return false
  const expires = new Date(approval.expires_at).getTime()
  return !Number.isNaN(expires) && expires > now.getTime()
}

export function approvalKindLabel(kind: ApprovalKind): string {
  return kind === 'ratification' ? '事后追认' : '事前审批'
}

export function approvalStatusLabel(kind: ApprovalKind, status: ApprovalStatus): string {
  switch (status) {
    case 'pending':
      return kind === 'ratification' ? '待追认' : '待审批'
    case 'approved':
      return kind === 'ratification' ? '已追认' : '已批准'
    case 'denied':
      return kind === 'ratification' ? '已拒绝追认' : '已驳回'
    default:
      return '已过期'
  }
}

export function approvalActionLabels(kind: ApprovalKind): { approve: string; deny: string } {
  return kind === 'ratification'
    ? { approve: '追认', deny: '拒绝追认' }
    : { approve: '批准', deny: '驳回' }
}

/**
 * How an approved request is actually consumed. A pre-approval is a permission
 * to issue one ticket and can lapse unspent; a ratification is only an
 * acknowledgement.
 */
export type TicketState = 'linked' | 'not_linked' | 'permission_expired' | 'acknowledged'

export function ticketState(approval: Approval, now: Date): TicketState | null {
  if (approval.kind === 'ratification') {
    return approval.status === 'approved' ? 'acknowledged' : null
  }
  if (approval.status !== 'approved') return null
  if (approval.ticket_id != null) return 'linked'
  const expires = new Date(approval.expires_at).getTime()
  if (!Number.isNaN(expires) && expires <= now.getTime()) return 'permission_expired'
  return 'not_linked'
}

/** Human deadline hint; the server deadline stays authoritative. */
export function formatRemaining(expiresAt: string, now: Date): string {
  const expires = new Date(expiresAt).getTime()
  if (Number.isNaN(expires)) return '—'
  const ms = expires - now.getTime()
  if (ms <= 0) return '已超时'
  return `剩余 ${Math.ceil(ms / 60_000)} 分钟`
}

/**
 * `approve` never carries a reason (it would overwrite the request's reason
 * with nothing useful); a deny reason is optional, trimmed, and capped at the
 * contract's 500 characters.
 */
export function toDecisionRequest(
  decision: ApprovalDecision,
  reason?: string | null,
): ApprovalDecisionRequest {
  if (decision === 'approve') return { decision }
  const trimmed = (reason ?? '').trim()
  if (!trimmed) return { decision }
  if ([...trimmed].length > 500) {
    throw new RangeError('拒绝原因最多 500 个字符')
  }
  return { decision, reason: trimmed }
}

/** Chinese copy for decision failures. */
export function approvalWriteError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return '网络异常，请稍后重试'
    if (err.status === 403) return '当前角色没有审批决策权限'
    if (err.status === 404) return '审批请求不存在或不可访问'
    if (err.status === 409) return '该请求已处理或已过期，请核对最新状态'
    if (err.status === 400) return '请求参数不合法，请检查填写内容'
    if (err.status === 429) return '请求过于频繁，请稍后重试'
    if (err.status >= 500) return '服务异常，请稍后重试'
    return err.message || '操作失败'
  }
  return '网络异常，请稍后重试'
}
