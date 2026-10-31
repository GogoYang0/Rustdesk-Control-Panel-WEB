// Organization creation helpers. The server accepts duplicate names and only
// rejects a blank name; the client enforces the contract's 1–128 character bound.

import { ApiError } from './api'

export const ORG_NAME_MAX = 128

export function orgNameProblem(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return '请填写组织名称'
  if ([...trimmed].length > ORG_NAME_MAX) return `组织名称最多 ${ORG_NAME_MAX} 个字符`
  return null
}

/** Chinese copy for organization-creation failures. */
export function createOrgError(err: unknown): string {
  if (!(err instanceof ApiError)) {
    // The request may have reached the server even though the response was
    // lost; duplicate names are allowed, so retrying blindly can create two.
    return '网络异常；组织可能已创建，请刷新组织列表确认后再试'
  }
  if (err.status === 0) return '网络异常；组织可能已创建，请刷新组织列表确认后再试'
  if (err.status === 400) return '组织名称不合法，请检查填写内容'
  if (err.status === 409) return '已达到可创建组织数量上限，请联系管理员'
  if (err.status >= 500) return '服务异常，请稍后重试'
  return '操作失败，请稍后重试'
}
