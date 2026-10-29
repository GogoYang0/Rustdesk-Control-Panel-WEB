// Alert list filters and copy. The API exposes only a read endpoint, so the
// center is a record viewer: no disposition state is invented here.

import type { Alert, AlertSeverity } from '../api/generated'

export const ALERT_PAGE_SIZE = 50
export const MAX_ALERT_PAGE = 100_000
export const ALERT_KINDS = ['duration_exceeded', 'concurrency_exceeded', 'outside_window'] as const
export const ALERT_RANGES = ['24h', '7d', '30d', 'all'] as const

export type AlertRange = (typeof ALERT_RANGES)[number]

export interface AlertFilters {
  severity: AlertSeverity | ''
  /** Free string on the wire; an unknown value from a shared link is kept. */
  kind: string
  range: AlertRange
  page: number
}

export const DEFAULT_ALERT_FILTERS: AlertFilters = { severity: '', kind: '', range: '7d', page: 1 }

const SEVERITIES: AlertSeverity[] = ['critical', 'warning', 'info']

function isSeverity(value: string): value is AlertSeverity {
  return (SEVERITIES as string[]).includes(value)
}

function isRange(value: string): value is AlertRange {
  return (ALERT_RANGES as readonly string[]).includes(value)
}

function positiveInt(value: string, max: number = Number.MAX_SAFE_INTEGER): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) && n <= max ? n : null
}

/** Unknown severities and ranges fall back; an unknown kind is preserved. */
export function parseAlertFilters(params: URLSearchParams): AlertFilters {
  const severity = params.get('severity') ?? ''
  const kind = (params.get('kind') ?? '').slice(0, 64)
  const range = params.get('range') ?? ''
  const page = positiveInt(params.get('page') ?? '', MAX_ALERT_PAGE)
  return {
    severity: isSeverity(severity) ? severity : '',
    kind,
    range: isRange(range) ? range : DEFAULT_ALERT_FILTERS.range,
    page: page ?? 1,
  }
}

export function toAlertSearchParams(filters: AlertFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.severity) params.set('severity', filters.severity)
  if (filters.kind) params.set('kind', filters.kind)
  if (filters.range !== DEFAULT_ALERT_FILTERS.range) params.set('range', filters.range)
  if (filters.page > 1) params.set('page', String(filters.page))
  return params
}

const RANGE_MS: Record<Exclude<AlertRange, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

export function rangeToSince(range: AlertRange, now: Date): string | undefined {
  if (range === 'all') return undefined
  return new Date(now.getTime() - RANGE_MS[range]).toISOString()
}

export function toAlertRequestQuery(
  filters: AlertFilters,
  now: Date,
  pageSize = ALERT_PAGE_SIZE,
): URLSearchParams {
  const query = new URLSearchParams()
  if (filters.severity) query.set('severity', filters.severity)
  if (filters.kind) query.set('kind', filters.kind)
  const since = rangeToSince(filters.range, now)
  if (since) query.set('since', since)
  query.set('page', String(filters.page))
  query.set('pageSize', String(pageSize))
  return query
}

const KIND_LABELS: Record<string, string> = {
  duration_exceeded: '会话时长超限',
  concurrency_exceeded: '并发会话超限',
  outside_window: '时段外发起',
}

export function alertKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind
}

export function alertSeverityLabel(severity: AlertSeverity): string {
  if (severity === 'critical') return '严重'
  if (severity === 'warning') return '警告'
  return '提示'
}

/** Tag palette from the UI conventions; never the only signal. */
export function alertSeverityTone(severity: AlertSeverity): 'red' | 'orange' | 'grey' {
  if (severity === 'critical') return 'red'
  if (severity === 'warning') return 'orange'
  return 'grey'
}

/** A short, stable preview of the detail object (first two entries). */
export function detailSummary(item: Alert): string {
  const detail = item.detail
  if (!detail) return '—'
  const entries = Object.entries(detail).slice(0, 2)
  if (entries.length === 0) return '—'
  return entries
    .map(([key, value]) => {
      if (value == null) return `${key} —`
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return `${key} ${String(value)}`
      }
      return `${key} ${JSON.stringify(value)}`
    })
    .join(' · ')
}
