// Organization rename helpers. The dialog reuses the creation name rules and
// patches the /me cache so the shell never shows the old name after a rename.

import { ApiError, type Me } from './api'

/** Chinese copy for organization-rename failures; server text never surfaces. */
export function renameOrgError(err: unknown): string {
  if (!(err instanceof ApiError) || err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 400) return '组织名称不合法，请检查填写内容'
  if (err.status === 403) return '只有 owner 可以重命名组织'
  if (err.status === 404) return '组织不存在，请刷新后重试'
  if (err.status >= 500) return '服务异常，请稍后重试'
  return '重命名失败，请稍后重试'
}

/**
 * Returns a new Me with the renamed organization. A missing id or unchanged
 * name returns the same object so callers can skip cache writes.
 */
export function patchOrgName(me: Me, orgId: number, name: string): Me {
  let changed = false
  const orgs = me.orgs.map((org) => {
    if (org.id !== orgId || org.name === name) return org
    changed = true
    return { ...org, name }
  })
  return changed ? { ...me, orgs } : me
}
