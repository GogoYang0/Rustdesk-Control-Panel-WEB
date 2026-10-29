// Address-book grant helpers: subject identity drives the upsert detection,
// because the API has no "create only" endpoint — re-posting a subject updates
// its access level.

import type {
  AddressBookGrant,
  AddressBookGrantAccess,
  AddressBookGrantKind,
  AddressBookGrantRequest,
  UserGroup,
} from '../api/generated'
import { ApiError } from './api'

export const GRANT_ACCESS: AddressBookGrantAccess[] = ['read', 'write', 'full']

export interface GrantSubject {
  subject_kind: AddressBookGrantKind
  subject_user_id?: number | null
  subject_group_id?: number | null
}

export interface GrantForm {
  kind: AddressBookGrantKind
  userId: string
  groupId: string
  access: AddressBookGrantAccess
}

export function grantSubjectKey(subject: GrantSubject): string {
  if (subject.subject_kind === 'everyone') return 'everyone'
  if (subject.subject_kind === 'user_group') return `group:${subject.subject_group_id ?? 0}`
  return `user:${subject.subject_user_id ?? 0}`
}

export function findGrant(
  grants: AddressBookGrant[],
  subject: GrantSubject,
): AddressBookGrant | undefined {
  const key = grantSubjectKey(subject)
  return grants.find((grant) => grantSubjectKey(grant) === key)
}

export function validateGrantForm(form: GrantForm): Record<string, string> {
  const errors: Record<string, string> = {}
  if (form.kind === 'user' && !form.userId) errors.userId = '请选择成员'
  if (form.kind === 'user_group' && !form.groupId) errors.groupId = '请选择用户组'
  return errors
}

/** Only the id that belongs to the chosen kind is sent. */
export function toGrantRequest(form: GrantForm): AddressBookGrantRequest {
  const request: AddressBookGrantRequest = {
    subject_kind: form.kind,
    access: form.access,
  }
  if (form.kind === 'user') request.subject_user_id = Number(form.userId)
  if (form.kind === 'user_group') request.subject_group_id = Number(form.groupId)
  return request
}

export function accessLabel(access: AddressBookGrantAccess): string {
  if (access === 'write') return '可编辑 peers'
  if (access === 'full') return '完全管理'
  return '只读'
}

/** Grants use {@link AddressBookGrantAccessLabel}; keep the palette mapping close. */
export function accessTone(access: AddressBookGrantAccess): 'grey' | 'blue' | 'orange' {
  if (access === 'write') return 'blue'
  if (access === 'full') return 'orange'
  return 'grey'
}

/** The built-in everyone group cannot be the subject of a `user_group` grant. */
export function grantableGroups(groups: UserGroup[]): UserGroup[] {
  return groups.filter((group) => group.kind === 'custom')
}

export function subjectLabel(
  grant: AddressBookGrant,
  emails: Map<number, string> = new Map(),
  groups: Map<number, string> = new Map(),
): string {
  if (grant.subject_kind === 'everyone') return '所有人'
  if (grant.subject_kind === 'user_group') {
    const id = grant.subject_group_id ?? 0
    return groups.get(id) ?? `用户组 #${id}`
  }
  const id = grant.subject_user_id ?? 0
  return emails.get(id) ?? `用户 #${id}`
}

/** What an operator should know before saving this subject/access pair. */
export function grantImpactNote(
  kind: AddressBookGrantKind,
  access: AddressBookGrantAccess,
): string | null {
  if (kind === 'user') return null
  if (kind === 'everyone') {
    if (access === 'read') return '共享簿默认只读，everyone=read 与默认一致。'
    return '会影响全部成员；user 授权优先于 everyone。'
  }
  if (access === 'read') return null
  return '该组全部成员会获得这一访问级别；user 授权仍优先。'
}

export function addressBookGrantError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return '网络异常，请稍后重试'
    if (err.status === 400) return '该地址簿不支持授权，或主体/级别不合法'
    if (err.status === 403) return '当前角色没有授权管理权限'
    if (err.status === 404) return '地址簿或授权不存在'
    if (err.status >= 500) return '服务异常，请稍后重试'
    return err.message || '操作失败'
  }
  return '网络异常，请稍后重试'
}
