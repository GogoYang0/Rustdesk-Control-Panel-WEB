import { ApiError } from './api'

export const MAX_RETENTION_DAYS = 3650

export type ArchiveView =
  { kind: 'none' } | { kind: 'ok'; at: string; rows: number; path: string } | { kind: 'invalid' }

export function provisioningStateLabel(state: string): string {
  switch (state) {
    case 'disabled':
      return '未启用'
    case 'pending':
      return '等待部署'
    case 'provisioning':
      return '部署中'
    case 'deployed':
      return '已部署'
    case 'failed':
      return '部署失败'
    default:
      return state
  }
}

export function provisioningStateTone(state: string): string {
  switch (state) {
    case 'deployed':
      return 'green'
    case 'provisioning':
      return 'blue'
    case 'pending':
      return 'orange'
    case 'failed':
      return 'red'
    default:
      return 'grey'
  }
}

export function retentionDaysProblem(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return '请输入保留天数（0 表示永久）'
  if (!/^-?\d+$/.test(trimmed)) return '保留天数必须是整数'
  const days = Number(trimmed)
  if (days < 0 || days > MAX_RETENTION_DAYS) {
    return `保留天数必须在 0–${MAX_RETENTION_DAYS} 之间`
  }
  return null
}

export function readArchiveSummary(value: unknown): ArchiveView {
  if (value === null || value === undefined) return { kind: 'none' }
  if (typeof value !== 'object') return { kind: 'invalid' }
  const row = value as Record<string, unknown>
  if (typeof row.at !== 'string' || typeof row.path !== 'string') return { kind: 'invalid' }
  const rows = typeof row.rows === 'number' ? row.rows : Number.NaN
  if (!Number.isFinite(rows)) return { kind: 'invalid' }
  return { kind: 'ok', at: row.at, rows, path: row.path }
}

export type SettingsContext = 'provisioning' | 'retention' | 'providers'

export function settingsError(err: unknown, context: SettingsContext): string {
  if (!(err instanceof ApiError)) return '网络异常，请稍后重试'
  if (err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 400) {
    return context === 'retention' ? '保留天数必须是 0–3650 的整数' : '设置值不合法，请检查'
  }
  if (err.status === 401) return '登录状态已失效，请重新登录'
  if (err.status === 403) return '需要 owner 权限（org.admin）才能查看或修改系统设置'
  if (err.status === 404) return '组织不存在或无权访问'
  if (err.status === 429) return '操作过于频繁，请稍后再试'
  if (err.status >= 500) return '服务暂时不可用，请稍后重试'
  return '操作失败，请稍后重试'
}
