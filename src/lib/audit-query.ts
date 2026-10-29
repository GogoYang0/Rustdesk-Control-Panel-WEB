// Audit & logs filters. The three tabs share one frozen time window but send
// different fields: the audit trail is half-open on `to`, the client-reported
// logs include both ends.

import type { ConnectionLog, FileLog } from '../api/generated'
import { ApiError } from './api'

export const AUDIT_TABS = ['audit', 'connections', 'files'] as const
export type AuditTab = (typeof AUDIT_TABS)[number]

export const AUDIT_RANGES = ['24h', '7d', '30d', 'all'] as const
export type AuditRange = (typeof AUDIT_RANGES)[number]

export const AUDIT_PAGE_SIZE = 50
export const MAX_AUDIT_PAGE = 100_000

export interface AuditFilters {
  tab: AuditTab
  range: AuditRange
  page: number
  action: string
  /** null = any actor; 0 = system actions. */
  actorUserId: number | null
  targetType: string
  targetId: string
  rustdeskId: string
}

export const DEFAULT_AUDIT_FILTERS: AuditFilters = {
  tab: 'audit',
  range: '7d',
  page: 1,
  action: '',
  actorUserId: null,
  targetType: '',
  targetId: '',
  rustdeskId: '',
}

const RANGE_MS: Record<Exclude<AuditRange, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

function isTab(value: string): value is AuditTab {
  return (AUDIT_TABS as readonly string[]).includes(value)
}

function isRange(value: string): value is AuditRange {
  return (AUDIT_RANGES as readonly string[]).includes(value)
}

function boundedPage(raw: string): number {
  if (!/^\d+$/.test(raw)) return 1
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1) return 1
  return Math.min(value, MAX_AUDIT_PAGE)
}

function actorId(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) ? value : null
}

export function parseAuditFilters(params: URLSearchParams): AuditFilters {
  const tab = params.get('tab') ?? ''
  const range = params.get('range') ?? ''
  return {
    tab: isTab(tab) ? tab : DEFAULT_AUDIT_FILTERS.tab,
    range: isRange(range) ? range : DEFAULT_AUDIT_FILTERS.range,
    page: boundedPage(params.get('page') ?? ''),
    action: (params.get('action') ?? '').slice(0, 128),
    actorUserId: actorId(params.get('actorUserId')),
    targetType: (params.get('targetType') ?? '').slice(0, 64),
    targetId: (params.get('targetId') ?? '').slice(0, 64),
    rustdeskId: (params.get('rustdeskId') ?? '').slice(0, 64),
  }
}

export function toAuditSearchParams(filters: AuditFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.tab !== DEFAULT_AUDIT_FILTERS.tab) params.set('tab', filters.tab)
  if (filters.range !== DEFAULT_AUDIT_FILTERS.range) params.set('range', filters.range)
  if (filters.action) params.set('action', filters.action)
  if (filters.actorUserId !== null) params.set('actorUserId', String(filters.actorUserId))
  if (filters.targetType) params.set('targetType', filters.targetType)
  if (filters.targetId) params.set('targetId', filters.targetId)
  if (filters.rustdeskId) params.set('rustdeskId', filters.rustdeskId)
  if (filters.page > 1) params.set('page', String(filters.page))
  return params
}

export function auditRangeBounds(range: AuditRange, now: Date): { from?: string; to?: string } {
  if (range === 'all') return {}
  return {
    from: new Date(now.getTime() - RANGE_MS[range]).toISOString(),
    to: now.toISOString(),
  }
}

/** Filters shared by the list and the export; pagination is added per caller. */
export function toAuditExportQuery(filters: AuditFilters, now: Date): URLSearchParams {
  const query = new URLSearchParams()
  const action = filters.action.trim()
  const targetType = filters.targetType.trim()
  const targetId = filters.targetId.trim()
  const rustdeskId = filters.rustdeskId.trim()
  if (filters.tab === 'audit') {
    if (action) query.set('action', action)
    if (filters.actorUserId !== null) query.set('actorUserId', String(filters.actorUserId))
    if (targetType) query.set('targetType', targetType)
    if (targetId) query.set('targetId', targetId)
  } else if (rustdeskId) {
    query.set('rustdeskId', rustdeskId)
  }
  const { from, to } = auditRangeBounds(filters.range, now)
  if (from) query.set('from', from)
  if (to) query.set('to', to)
  return query
}

export function toAuditRequestQuery(
  filters: AuditFilters,
  now: Date,
  pageSize = AUDIT_PAGE_SIZE,
): URLSearchParams {
  const query = toAuditExportQuery(filters, now)
  query.set('page', String(filters.page))
  query.set('pageSize', String(pageSize))
  return query
}

const EXPORT_SEGMENT: Record<AuditTab, string> = {
  audit: 'audit-logs',
  connections: 'connection-logs',
  files: 'file-logs',
}

export function auditExportPath(orgId: number, filters: AuditFilters, now: Date): string {
  return `/api/v1/orgs/${orgId}/${EXPORT_SEGMENT[filters.tab]}/export?${toAuditExportQuery(
    filters,
    now,
  ).toString()}`
}

export function auditExportFallbackName(tab: AuditTab, orgId: number, now: Date): string {
  const prefix = tab === 'audit' ? 'audit' : tab === 'connections' ? 'connection' : 'file'
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
  return `${prefix}-org-${orgId}-${stamp}.csv`
}

/** Chinese copy for CSV export failures; a 400 means the result was too wide. */
export function auditExportError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return '网络异常，请稍后重试'
    if (err.status === 400) {
      return '结果可能超过 1000 行，请缩小时间范围或补充筛选后再试'
    }
    if (err.status === 401) return '登录已失效，请重新登录'
    if (err.status === 403) return '当前角色没有审计读取权限'
    if (err.status >= 500) return '服务异常，请稍后重试'
    return '导出失败，请稍后重试'
  }
  return '网络异常，请稍后重试'
}

const TAB_LABELS: Record<AuditTab, string> = {
  audit: '请求审计',
  connections: '连接日志',
  files: '文件日志',
}

export function auditTabLabel(tab: AuditTab): string {
  return TAB_LABELS[tab]
}

const RANGE_LABELS: Record<AuditRange, string> = {
  '24h': '24 小时',
  '7d': '7 天',
  '30d': '30 天',
  all: '全部时间',
}

export function auditRangeLabel(range: AuditRange): string {
  return RANGE_LABELS[range]
}

export function auditActorLabel(actorUserId: number, emails: Map<number, string>): string {
  if (actorUserId === 0) return '系统'
  return emails.get(actorUserId) ?? `用户 #${actorUserId}`
}

export function auditTargetLabel(targetType: string, targetId: string): string {
  if (!targetType) return targetId || '—'
  return targetId ? `${targetType} ${targetId}` : targetType
}

export function connectionStatusLabel(status: ConnectionLog['status']): string {
  return status === 'open' ? '进行中' : '已关闭'
}

export function connectionStatusTone(status: ConnectionLog['status']): 'green' | 'grey' {
  return status === 'open' ? 'green' : 'grey'
}

export function fileDirectionLabel(direction: FileLog['direction']): string {
  return direction === 'send' ? '发送' : '接收'
}

/** `detail` may be legacy raw text, not only the current JSON object. */
export function auditDetailText(detail: unknown): string {
  if (detail === null || detail === undefined) return ''
  if (typeof detail === 'string') return detail
  if (typeof detail === 'object') {
    try {
      return JSON.stringify(detail, null, 2)
    } catch {
      return String(detail)
    }
  }
  return String(detail)
}

/** Chinese copy for audit list failures; backend messages stay hidden. */
export function auditListError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return '网络异常，请稍后重试'
    if (err.status === 400) return '筛选参数不合法，请调整后重试'
    if (err.status === 403) return '当前角色没有审计读取权限'
    if (err.status === 404) return '组织或记录不存在'
    if (err.status >= 500) return '服务异常，请稍后重试'
    return '加载失败，请稍后重试'
  }
  return '网络异常，请稍后重试'
}
