import { ApiError } from './api'

/**
 * Chinese copy for device write failures. The API speaks English for some
 * errors and a raw `message` is the wrong thing to show an operator.
 */
export function deviceWriteError(err: unknown, action?: 'disconnect'): string {
  if (err instanceof ApiError) {
    if (action === 'disconnect' && err.status === 409) {
      return '该设备已有待消费的断连请求：请等客户端下次心跳消费，或 15 分钟过期后重试'
    }
    if (err.status === 403) return '当前角色没有该操作的权限'
    if (err.status === 404) return '设备或目标成员不存在（可能已被移除或停用）'
    return err.message || '操作失败'
  }
  return '网络异常，请稍后重试'
}
