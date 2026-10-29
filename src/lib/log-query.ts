// Collected hbbs/hbbr events are read-only: the API supports one limit window,
// not paging. The URL keeps the user's filters while the `since` boundary is
// frozen per range and refresh so changing a level does not move the window.

import { ApiError } from './api'

export const LOG_RANGES = ['24h', '7d', '30d', 'all'] as const
export type LogRange = (typeof LOG_RANGES)[number]

export const LOG_LEVELS = ['info', 'warn', 'error'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

export const LOG_LIMITS = [50, 100, 200] as const
export type LogLimit = (typeof LOG_LIMITS)[number]

export interface LogFilters {
  deviceId: number | null
  level: LogLevel | null
  range: LogRange
  limit: LogLimit
}

export const DEFAULT_LOG_FILTERS: LogFilters = {
  deviceId: null,
  level: null,
  range: '7d',
  limit: 50,
}

const RANGE_MS: Record<Exclude<LogRange, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

function isRange(value: string): value is LogRange {
  return (LOG_RANGES as readonly string[]).includes(value)
}

function isLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value)
}

function isLimit(value: number): value is LogLimit {
  return (LOG_LIMITS as readonly number[]).includes(value)
}

function positiveId(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function parseLimit(raw: string | null): LogLimit {
  if (raw === null || !/^\d+$/.test(raw)) return DEFAULT_LOG_FILTERS.limit
  const value = Number(raw)
  return isLimit(value) ? value : DEFAULT_LOG_FILTERS.limit
}

export function parseLogFilters(params: URLSearchParams): LogFilters {
  const range = params.get('range') ?? ''
  const level = params.get('level') ?? ''
  return {
    deviceId: positiveId(params.get('deviceId')),
    level: isLevel(level) ? level : DEFAULT_LOG_FILTERS.level,
    range: isRange(range) ? range : DEFAULT_LOG_FILTERS.range,
    limit: parseLimit(params.get('limit')),
  }
}

export function toLogSearchParams(filters: LogFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.deviceId !== null) params.set('deviceId', String(filters.deviceId))
  if (filters.level !== null) params.set('level', filters.level)
  if (filters.range !== DEFAULT_LOG_FILTERS.range) params.set('range', filters.range)
  if (filters.limit !== DEFAULT_LOG_FILTERS.limit) params.set('limit', String(filters.limit))
  return params
}

/** `since` is inclusive; the all range has no lower bound. */
export function logRangeSince(range: LogRange, now: Date): string | undefined {
  if (range === 'all') return undefined
  return new Date(now.getTime() - RANGE_MS[range]).toISOString()
}

export function toLogRequestQuery(filters: LogFilters, now: Date): URLSearchParams {
  const query = new URLSearchParams()
  if (filters.deviceId !== null) query.set('deviceId', String(filters.deviceId))
  if (filters.level !== null) query.set('level', filters.level)
  const since = logRangeSince(filters.range, now)
  if (since) query.set('since', since)
  query.set('limit', String(filters.limit))
  return query
}

const RANGE_LABELS: Record<LogRange, string> = {
  '24h': '24 小时',
  '7d': '7 天',
  '30d': '30 天',
  all: '全部时间',
}

export function logRangeLabel(range: LogRange): string {
  return RANGE_LABELS[range]
}

const LEVEL_LABELS: Record<LogLevel, string> = {
  info: '提示',
  warn: '警告',
  error: '错误',
}

export function logLevelLabel(level: LogLevel): string {
  return LEVEL_LABELS[level]
}

export function logLevelTone(level: LogLevel): 'green' | 'orange' | 'red' {
  return level === 'error' ? 'red' : level === 'warn' ? 'orange' : 'green'
}

const SOURCE_LABELS: Record<string, string> = {
  hbbs: 'hbbs 信令',
  hbbr: 'hbbr 中继',
}

export function logSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source
}

const KIND_LABELS: Record<string, string> = {
  conn: '连接',
  file: '文件传输',
  disconnected: '断开',
  error: '错误',
  other: '其他',
}

/** The generated union omits `disconnected`, so callers pass a string. */
export function logKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind
}

export function logEventDeviceLabel(
  deviceId: number | null | undefined,
  names: Map<number, string>,
): string {
  if (deviceId === null || deviceId === undefined) return '未关联设备'
  return names.get(deviceId) ?? `设备 #${deviceId}`
}

function truncate(value: string, length = 80): string {
  return value.length > length ? `${value.slice(0, length)}…` : value
}

function summaryValue(value: unknown): string {
  if (typeof value === 'string') return truncate(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return 'null'
  try {
    return truncate(JSON.stringify(value))
  } catch {
    return truncate(String(value))
  }
}

/** First two captured fields after `devseed`; keeps table cells short. */
export function logSummary(detail: unknown): string {
  if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) return '—'
  const entries = Object.entries(detail as Record<string, unknown>).filter(
    ([key]) => key !== 'devseed',
  )
  if (entries.length === 0) return '—'
  return entries
    .slice(0, 2)
    .map(([, value]) => summaryValue(value))
    .join(' · ')
}

function detailObject(detail: unknown): Record<string, unknown> | null {
  if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) return null
  return detail as Record<string, unknown>
}

/** The original log line, rendered as plain text (never HTML). */
export function logDetailRaw(detail: unknown): string | null {
  const object = detailObject(detail)
  if (!object || !('raw' in object)) return null
  const raw = object.raw
  if (typeof raw === 'string') return raw
  try {
    return JSON.stringify(raw)
  } catch {
    return String(raw)
  }
}

/** Captured fields minus the raw line and the e2e marker. */
export function logDetailRest(detail: unknown): string | null {
  const object = detailObject(detail)
  if (!object) return null
  const rest = Object.fromEntries(
    Object.entries(object).filter(([key]) => key !== 'raw' && key !== 'devseed'),
  )
  if (Object.keys(rest).length === 0) return null
  try {
    return JSON.stringify(rest, null, 2)
  } catch {
    return null
  }
}

export function logListError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return '网络异常，请稍后重试'
    if (err.status === 400) return '筛选参数不合法，请调整后重试'
    if (err.status === 401) return '登录已失效，请重新登录'
    if (err.status === 403) return '当前角色没有日志读取权限'
    if (err.status === 404) return '组织不存在'
    if (err.status >= 500) return '服务异常，请稍后重试'
    return '加载失败，请稍后重试'
  }
  return '网络异常，请稍后重试'
}
