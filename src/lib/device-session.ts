// Device deletion and session-ending copy. Both actions are destructive, so
// errors must name the exact state the operator can fix.

import { ApiError } from './api'

export function deleteDeviceError(err: unknown): string {
  if (!(err instanceof ApiError) || err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 403) return '没有设备管理权限'
  if (err.status === 404) return '设备不存在或已删除，请刷新列表'
  if (err.status === 409) return '该设备仍有进行中的会话，请先在会话页结束'
  if (err.status >= 500) return '服务异常，请稍后重试'
  return '删除设备失败，请稍后重试'
}

export function endSessionError(err: unknown): string {
  if (!(err instanceof ApiError) || err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 403) return '没有断连权限'
  if (err.status === 404) return '会话不存在，请刷新列表'
  if (err.status === 409) return '会话已结束，请刷新列表'
  if (err.status >= 500) return '服务异常，请稍后重试'
  return '结束会话失败，请稍后重试'
}

export function endSessionToast(disconnectRequested: boolean): string {
  return disconnectRequested
    ? '已结束会话并请求设备断连'
    : '会话已结束，但断连请求未排队；请检查设备状态'
}
