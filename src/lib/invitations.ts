// Pending-invitation helpers. The API never exposes invitation tokens, so the
// UI only maps public fields and revoke failures.

import { ApiError } from './api'

export function invitationRoleLabel(role: string): string {
  return role === 'admin' ? 'Admin' : 'Member'
}

export function revokeInvitationError(err: unknown): string {
  if (!(err instanceof ApiError) || err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 403) return '没有成员管理权限'
  if (err.status === 404) return '邀请已失效，请刷新列表'
  if (err.status === 409) return '受邀人已接受邀请'
  if (err.status >= 500) return '服务异常，请稍后重试'
  return '撤销失败，请稍后重试'
}

/** 404/409 mean the row is stale; callers should refresh the pending list. */
export function revokeInvitationNeedsRefresh(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 409)
}
