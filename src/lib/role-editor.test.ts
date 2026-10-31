import { describe, expect, it } from 'vitest'

import { ApiError, type Permission, type Role } from './api'
import {
  auditScopeLabel,
  permissionGroups,
  permissionLabel,
  rbacRoleNameProblem,
  roleEditorError,
  unknownPermissions,
} from './role-editor'

function permission(code: string, delegable = true): Permission {
  return { code, description: 'backend English', delegable }
}

const catalog: Permission[] = [
  permission('role.manage', false),
  permission('member.manage'),
  permission('device.read'),
  permission('audit.read'),
  permission('future.capability'),
]

function role(overrides: Partial<Role>): Role {
  return {
    id: 1,
    name: 'ops',
    kind: 'custom',
    permissions: ['device.read'],
    audit_scope: 'individual',
    builtin: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function api(status: number) {
  return new ApiError(status, 'error', 'backend English')
}

describe('permissionGroups', () => {
  it('groups known codes in display order and falls back for future codes', () => {
    const groups = permissionGroups(catalog)
    expect(groups.map((group) => group.title)).toEqual([
      '组织与成员',
      '设备与访问',
      '审计与数据',
      '其他权限',
    ])
    expect(groups[0].items.map((item) => item.code)).toEqual(['role.manage', 'member.manage'])
    expect(groups[3].items.map((item) => item.code)).toEqual(['future.capability'])
    expect(permissionLabel('device.read')).toBe('设备只读')
    expect(permissionLabel('future.capability')).toBe('future.capability')
  })
})

describe('role naming and unknown permissions', () => {
  it('reuses the name rules and ignores the edited role', () => {
    const roles = [role({ id: 1, name: 'ops' }), role({ id: 2, name: 'admin', builtin: true })]
    expect(rbacRoleNameProblem('  ', roles)).toBe('名称需为 1–64 个字符')
    expect(rbacRoleNameProblem('admin', roles)).toBe('名称已被使用')
    expect(rbacRoleNameProblem('ops', roles, 1)).toBeNull()
    expect(rbacRoleNameProblem('x'.repeat(65), roles)).toBe('名称需为 1–64 个字符')
  })

  it('reports permissions missing from the catalog', () => {
    expect(
      unknownPermissions(role({ permissions: ['device.read', 'legacy.code'] }), catalog),
    ).toEqual(['legacy.code'])
  })
})

describe('roleEditorError', () => {
  it('separates name conflicts from in-use deletes', () => {
    expect(roleEditorError(api(409), 'create')).toContain('名称已被占用')
    expect(roleEditorError(api(409), 'delete')).toContain('仍被成员使用')
    expect(roleEditorError(api(409), 'delete', true)).toContain('内置角色不可删除')
    expect(roleEditorError(api(409), 'update', true)).toContain('内置角色不可修改')
    expect(roleEditorError(api(403), 'update')).toContain('owner 专属')
    expect(roleEditorError(api(400), 'create')).toContain('不符合要求')
    expect(roleEditorError(new TypeError('offline'), 'create')).toContain('网络')
    expect(roleEditorError(api(500), 'create')).not.toContain('backend English')
  })
})

describe('auditScopeLabel', () => {
  it('labels the two scopes', () => {
    expect(auditScopeLabel('global')).toBe('全组织审计')
    expect(auditScopeLabel('individual')).toBe('仅本人相关')
  })
})
