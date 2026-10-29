// Filter state for the session list. Filters live in the URL so a reload or a
// shared link keeps the same view, and switching organization (which drops the
// query string) starts from the defaults.

export const PAGE_SIZE = 50

export const ORIGINS = ['panel', 'native'] as const
export const STATUSES = ['open', 'closed', 'denied'] as const
export const RANGES = ['24h', '7d', '30d', 'all'] as const

export type SessionOrigin = (typeof ORIGINS)[number]
export type SessionStatus = (typeof STATUSES)[number]
export type SessionRange = (typeof RANGES)[number]

export interface SessionFilters {
  origin: SessionOrigin | ''
  status: SessionStatus | ''
  /** Device row id as a positive integer string; '' means no filter. */
  deviceId: string
  range: SessionRange
  page: number
  /** Deep link to one session; never sent to the list endpoint. */
  sessionId: number | null
}

export const DEFAULT_FILTERS: SessionFilters = {
  origin: '',
  status: '',
  deviceId: '',
  range: '7d',
  page: 1,
  sessionId: null,
}

function isOrigin(value: string): value is SessionOrigin {
  return (ORIGINS as readonly string[]).includes(value)
}

function isStatus(value: string): value is SessionStatus {
  return (STATUSES as readonly string[]).includes(value)
}

function isRange(value: string): value is SessionRange {
  return (RANGES as readonly string[]).includes(value)
}

/** Unknown or malformed values fall back to the default instead of erroring. */
export function parseFilters(params: URLSearchParams): SessionFilters {
  const origin = params.get('origin') ?? ''
  const status = params.get('status') ?? ''
  const deviceId = params.get('deviceId') ?? ''
  const range = params.get('range') ?? ''
  const page = Number(params.get('page') ?? '')
  const sessionId = params.get('sessionId') ?? ''

  return {
    origin: isOrigin(origin) ? origin : '',
    status: isStatus(status) ? status : '',
    deviceId: /^[1-9]\d*$/.test(deviceId) ? deviceId : '',
    range: isRange(range) ? range : DEFAULT_FILTERS.range,
    // Cap at the last page a URL can usefully express; 1e21 would serialise as
    // "1e+21" and come back as a 400 instead of the default.
    page: Number.isSafeInteger(page) && page > 0 && page <= 100_000 ? page : 1,
    sessionId:
      /^[1-9]\d*$/.test(sessionId) && Number.isSafeInteger(Number(sessionId))
        ? Number(sessionId)
        : null,
  }
}

/** Omits defaults so the common view keeps a short, readable URL. */
export function toSearchParams(filters: SessionFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.origin) params.set('origin', filters.origin)
  if (filters.status) params.set('status', filters.status)
  if (filters.deviceId) params.set('deviceId', filters.deviceId)
  if (filters.range !== DEFAULT_FILTERS.range) params.set('range', filters.range)
  if (filters.page > 1) params.set('page', String(filters.page))
  if (filters.sessionId) params.set('sessionId', String(filters.sessionId))
  return params
}

const RANGE_MS: Record<Exclude<SessionRange, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

/** RFC 3339 timestamp for the `since` parameter; `all` sends nothing. */
export function rangeToSince(range: SessionRange, now: Date): string | undefined {
  if (range === 'all') return undefined
  return new Date(now.getTime() - RANGE_MS[range]).toISOString()
}

/** Request parameters for `GET /orgs/{orgId}/sessions`. */
export function toRequestQuery(
  filters: SessionFilters,
  now: Date,
  pageSize = PAGE_SIZE,
): URLSearchParams {
  const query = new URLSearchParams()
  if (filters.origin) query.set('origin', filters.origin)
  if (filters.status) query.set('status', filters.status)
  if (filters.deviceId) query.set('deviceId', filters.deviceId)
  const since = rangeToSince(filters.range, now)
  if (since) query.set('since', since)
  query.set('page', String(filters.page))
  query.set('pageSize', String(pageSize))
  return query
}

import { totalPages as pageCount } from './paging'

export function totalPages(total: number, pageSize = PAGE_SIZE): number {
  return pageCount(total, pageSize)
}
