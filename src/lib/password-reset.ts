// Password reset page helpers. The token travels in the URL fragment so it is
// never sent to the server; it is read once and removed from the address bar.

import { ApiError } from './api'

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

/** Reads `#token=...` once and clears the fragment without a history entry. */
export function readHashToken(): string {
  if (typeof window === 'undefined') return ''
  const raw = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash
  const token = new URLSearchParams(raw).get('token') ?? ''
  if (token) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
  return token
}

export function passwordResetProblem(password: string, confirm: string): string | null {
  const length = [...password].length
  if (length < PASSWORD_MIN) return `密码至少 ${PASSWORD_MIN} 个字符`
  if (length > PASSWORD_MAX) return `密码最多 ${PASSWORD_MAX} 个字符`
  if (password !== confirm) return '两次输入的密码不一致'
  return null
}

export function passwordResetError(err: unknown): string {
  if (!(err instanceof ApiError) || err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 400) return '密码不合法，请检查后重试'
  if (err.status === 409) return '重置链接无效或已使用，请让管理员重新发送'
  if (err.status === 429) return '请求过于频繁，请稍后再试'
  if (err.status >= 500) return '服务异常，请稍后重试'
  return '重置失败，请稍后重试'
}

/** Admin request failures keep the member dialog open with actionable copy. */
export function passwordResetRequestError(err: unknown): string {
  if (!(err instanceof ApiError) || err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 403) return '没有权限，或该成员属于其他组织/目标为 owner；需线下处理'
  if (err.status === 404) return '成员不存在或已离开组织，请刷新后重试'
  if (err.status === 409) return '该成员没有本地密码、已停用，或不能重置自己'
  if (err.status === 429) return '操作过于频繁，请 15 分钟后再试'
  if (err.status >= 500) return '服务异常，请稍后重试'
  return '发送重置邮件失败，请稍后重试'
}
