import { ApiError, type Session } from './api'

const countFormat = new Intl.NumberFormat('zh-CN')

export function formatCount(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  return countFormat.format(value)
}

export function sessionOriginLabel(origin: Session['origin']): string {
  return origin === 'native' ? '原生' : '面板'
}

export function sessionDeviceLabel(session: Pick<Session, 'rustdesk_id' | 'device_id'>): string {
  return session.rustdesk_id || `设备 #${session.device_id}`
}

export function approvalDeviceLabel(deviceId: number): string {
  return `设备 #${deviceId}`
}

export type OverviewContext = 'devices' | 'sessions' | 'approvals' | 'alerts'

export function overviewError(err: unknown, context: OverviewContext): string {
  if (!(err instanceof ApiError)) return '网络异常，请稍后重试'
  if (err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 401) return '登录状态已失效，请重新登录'
  if (err.status === 403) {
    return context === 'devices'
      ? '当前角色没有 device.read，无法查看设备统计'
      : '当前账户无权查看该数据'
  }
  if (err.status === 404) return '组织不存在或无权访问'
  if (err.status === 429) return '操作过于频繁，请稍后再试'
  if (err.status >= 500) return '服务暂时不可用，请稍后重试'
  return '加载失败，请稍后重试'
}
