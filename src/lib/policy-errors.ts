import { ApiError } from './api'

/** Chinese copy for policy write failures. */
export function policyWriteError(err: unknown): string {
  if (err instanceof ApiError) {
    // `wrap()` reports a failed fetch as ApiError(0) with an internal message.
    if (err.status === 0) return '网络异常，请稍后重试'
    if (err.status === 403) return '当前角色没有管理策略的权限'
    if (err.status === 404) return '策略不存在（可能已被删除）'
    if (err.status === 409) return '策略名称已存在，请换一个'
    if (err.status === 400) return '请求参数不合法，请检查填写内容'
    if (err.status >= 500) return '服务异常，请稍后重试'
    return err.message || '操作失败'
  }
  return '网络异常，请稍后重试'
}
