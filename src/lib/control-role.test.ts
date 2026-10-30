import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import {
  CONTROL_PERMISSION_KEYS,
  controlKeyLabel,
  controlRoleError,
  controlStateLabel,
  controlStateTone,
  isBuiltinRole,
  memberCountForRole,
  normalizePermissions,
  permissionCounts,
  roleAssignmentLabel,
  roleNameProblem,
  type RoleLike,
} from './control-role'

const sync = {
  keyboard: 'enable',
  file: 'disable',
  clipboard: 'use_client',
} as Record<string, string>

describe('control permissions', () => {
  it('keeps the 14 protocol keys in order', () => {
    expect(CONTROL_PERMISSION_KEYS).toHaveLength(14)
    expect(CONTROL_PERMISSION_KEYS[0]).toBe('keyboard')
    expect(CONTROL_PERMISSION_KEYS[13]).toBe('usb')
  })

  it('fills missing keys with use_client and ignores unknown keys', () => {
    const normalized = normalizePermissions({ ...sync, unknown: 'enable' })
    expect(normalized.keyboard).toBe('enable')
    expect(normalized.file).toBe('disable')
    expect(normalized.usb).toBe('use_client')
    expect('unknown' in normalized).toBe(false)
  })

  it('falls back invalid states to use_client', () => {
    expect(normalizePermissions({ keyboard: 'maybe' }).keyboard).toBe('use_client')
    expect(normalizePermissions(null).camera).toBe('use_client')
  })

  it('counts states and labels them', () => {
    expect(permissionCounts(sync)).toEqual({ enable: 1, disable: 1, inherit: 12 })
    expect(controlStateLabel('enable')).toBe('允许')
    expect(controlStateLabel('disable')).toBe('拒绝')
    expect(controlStateLabel('use_client')).toBe('继承')
    expect(controlStateTone('disable')).toBe('red')
    expect(controlKeyLabel('keyboard')).toBe('键盘与鼠标')
    expect(controlKeyLabel('unknown')).toBe('unknown')
  })
})

describe('roles and members', () => {
  const roles: RoleLike[] = [
    { id: 1, name: 'Default', kind: 'default', builtin: true },
    { id: 2, name: 'Ops', kind: 'custom', builtin: false },
  ]

  it('counts null and builtin assignments toward Default', () => {
    const members = [
      { control_role_id: null },
      { control_role_id: 1 },
      { control_role_id: 2 },
      { control_role_id: 2 },
    ]
    expect(memberCountForRole(roles[0], roles, members)).toBe(2)
    expect(memberCountForRole(roles[1], roles, members)).toBe(2)
    expect(isBuiltinRole(roles[0])).toBe(true)
  })

  it('labels assignments including missing roles', () => {
    expect(roleAssignmentLabel(null, roles)).toBe('未分配 → Default')
    expect(roleAssignmentLabel(1, roles)).toBe('未分配 → Default')
    expect(roleAssignmentLabel(2, roles)).toBe('Ops')
    expect(roleAssignmentLabel(9, roles)).toBe('角色 #9（不存在）')
  })

  it('validates names without case folding and allows the edited role', () => {
    expect(roleNameProblem('  Ops  ', roles)).not.toBeNull()
    expect(roleNameProblem('  Ops  ', roles, 2)).toBeNull()
    expect(roleNameProblem('ops', roles)).toBeNull()
    expect(roleNameProblem('', roles)).not.toBeNull()
    expect(roleNameProblem('a\u0007', roles)).not.toBeNull()
  })
})

describe('control role errors', () => {
  it('maps role operations and builtin conflicts', () => {
    expect(controlRoleError(new ApiError(0, 'network', 'x'), 'roles')).toBe('网络异常，请稍后重试')
    expect(controlRoleError(new ApiError(403, 'forbidden', 'x'), 'roles')).toContain(
      '没有控制角色管理权限',
    )
    expect(controlRoleError(new ApiError(409, 'conflict', 'x'), 'role-create')).toBe('名称已被使用')
    expect(controlRoleError(new ApiError(409, 'conflict', 'x'), 'role-delete', true)).toContain(
      '内置 Default',
    )
    expect(controlRoleError(new ApiError(404, 'not_found', 'x'), 'assign')).toContain(
      '成员或控制角色不存在',
    )
    expect(controlRoleError(new ApiError(500, 'internal', 'sql'), 'roles')).not.toContain('sql')
  })
})
