// Organization deletion stays owner-only and requires typing the current name.

import { ApiError, type Me } from './api'

export function orgDeleteError(err: unknown): string {
  if (!(err instanceof ApiError) || err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 400) return '组织名称不匹配，请重新输入'
  if (err.status === 403) return '只有 owner 可以删除组织'
  if (err.status === 404) return '组织不存在或已删除，请刷新'
  if (err.status === 409) return '供应容器清理失败，请稍后重试或联系运维'
  if (err.status >= 500) return '服务异常，请稍后重试'
  return '删除组织失败，请稍后重试'
}

/** Removes the deleted organization from the shell cache without mutating it. */
export function removeOrgFromMe(me: Me, orgId: number): Me {
  if (!me.orgs.some((org) => org.id === orgId)) return me
  return { ...me, orgs: me.orgs.filter((org) => org.id !== orgId) }
}
