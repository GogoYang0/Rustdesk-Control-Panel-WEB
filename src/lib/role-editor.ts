import type { Permission, Role } from './api'
import { ApiError } from './api'
import { roleNameProblem } from './control-role'

const GROUP_ORDER: { title: string; codes: string[] }[] = [
  { title: '组织与成员', codes: ['org.admin', 'role.manage', 'member.manage'] },
  {
    title: '设备与访问',
    codes: ['device.read', 'device.write', 'device.disconnect', 'access.manage'],
  },
  { title: '会话与审批', codes: ['policy.write', 'approval.decide'] },
  { title: '审计与数据', codes: ['audit.read', 'address_book.write'] },
  {
    title: '客户端与控制',
    codes: ['control_role.manage', 'strategy.manage', 'client_build.manage'],
  },
]

const LABELS: Record<string, string> = {
  'org.admin': '组织管理',
  'role.manage': '角色管理',
  'member.manage': '成员管理',
  'device.read': '设备只读',
  'device.write': '设备写入',
  'device.disconnect': '设备断连',
  'access.manage': '访问控制',
  'policy.write': '连接策略',
  'approval.decide': '审批决定',
  'audit.read': '审计读取',
  'address_book.write': '共享地址簿',
  'control_role.manage': '控制角色',
  'strategy.manage': '客户端策略',
  'client_build.manage': '客户端生成器',
}

export interface PermissionGroup {
  title: string
  items: Permission[]
}

export function permissionLabel(code: string): string {
  return LABELS[code] ?? code
}

/** Keeps catalog order inside known groups; future codes fall into 其他权限. */
export function permissionGroups(catalog: Permission[]): PermissionGroup[] {
  const byCode = new Map(catalog.map((permission) => [permission.code, permission]))
  const groups: PermissionGroup[] = []
  const used = new Set<string>()
  for (const group of GROUP_ORDER) {
    const items = group.codes
      .map((code) => byCode.get(code))
      .filter((permission): permission is Permission => Boolean(permission))
    if (items.length) groups.push({ title: group.title, items })
    group.codes.forEach((code) => used.add(code))
  }
  const rest = catalog.filter((permission) => !used.has(permission.code))
  if (rest.length) groups.push({ title: '其他权限', items: rest })
  return groups
}

export function unknownPermissions(role: Role, catalog: Permission[]): string[] {
  const known = new Set(catalog.map((permission) => permission.code))
  return role.permissions.filter((code) => !known.has(code))
}

/** RBAC roles can use the control-role name rules once adapted to RoleLike. */
export function rbacRoleNameProblem(name: string, roles: Role[], exceptId?: number): string | null {
  return roleNameProblem(
    name,
    roles.map((role) => ({
      id: role.id,
      name: role.name,
      kind: role.builtin ? 'default' : 'custom',
      builtin: role.builtin,
    })),
    exceptId,
  )
}

export type RoleOperation = 'create' | 'update' | 'delete' | 'permissions'

export function roleEditorError(err: unknown, operation: RoleOperation, builtin = false): string {
  if (operation === 'permissions') {
    if (!(err instanceof ApiError) || err.status === 0) {
      return '权限目录加载失败，请检查网络后重试'
    }
    if (err.status === 401) return '登录已失效，请重新登录'
    return '权限目录加载失败，请重试'
  }
  if (!(err instanceof ApiError)) return '网络异常，请稍后重试'
  if (err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 401) return '登录已失效，请重新登录'
  if (err.status === 403) return '没有角色管理权限，或包含了 owner 专属权限'
  if (err.status === 404) return '角色不存在或组织不可用，请刷新后重试'
  if (err.status === 429) return '操作过于频繁，请稍后再试'
  if (err.status >= 500) return '服务异常，请稍后重试'
  if (err.status === 409) {
    if (builtin) {
      return operation === 'delete' ? '内置角色不可删除' : '内置角色不可修改'
    }
    if (operation === 'delete') return '角色仍被成员使用，请先改派这些成员'
    return '角色名称已被占用或与内置角色重名'
  }
  if (err.status === 400) return '角色名称或权限不符合要求'
  return '保存失败，请稍后重试'
}

export function auditScopeLabel(scope: Role['audit_scope']): string {
  return scope === 'global' ? '全组织审计' : '仅本人相关'
}
