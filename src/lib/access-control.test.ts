import { describe, expect, it } from 'vitest'

import type { DeviceGroup } from '../api/generated'
import {
  accessError,
  accessRuleImpact,
  accessRuleKey,
  accessRuleTargetLabel,
  deviceGroupOwnership,
  findDuplicateRule,
  isDefaultAccessRule,
  ruleError,
  ruleTargetKindLabel,
  validateRuleForm,
  diffIds,
  groupMemberSummary,
  sameIdSet,
  validateDeviceGroupName,
  validateUserGroupName,
} from './access-control'
import { ApiError } from './api'

const groups = [
  { id: 1, name: 'everyone' },
  { id: 3, name: 'Finance' },
]

describe('validateUserGroupName', () => {
  it('requires a trimmed 1–64 character name', () => {
    expect(validateUserGroupName('   ', groups)).toContain('填写')
    expect(validateUserGroupName('a'.repeat(65), groups)).toContain('64')
    expect(validateUserGroupName(` ${'a'.repeat(64)} `, groups)).toBeNull()
  })

  it('rejects the reserved everyone name in any casing', () => {
    expect(validateUserGroupName('Everyone', groups)).toContain('保留')
    expect(validateUserGroupName('everyone', [])).toContain('保留')
  })

  it('rejects case-insensitive duplicates but ignores the edited group', () => {
    expect(validateUserGroupName('finance', groups)).toContain('同名')
    expect(validateUserGroupName('finance', groups, 3)).toBeNull()
  })
})

describe('validateDeviceGroupName', () => {
  it('allows everyone as a device-group name and checks duplicates', () => {
    const deviceGroups = [{ id: 7, name: 'Finance' }]
    expect(validateDeviceGroupName('everyone', deviceGroups)).toBeNull()
    expect(validateDeviceGroupName('FINANCE', deviceGroups)).toContain('同名')
    expect(validateDeviceGroupName('ops', deviceGroups)).toBeNull()
  })
})

describe('groupMemberSummary', () => {
  it('describes everyone by implicit membership instead of zero', () => {
    expect(groupMemberSummary({ kind: 'everyone', member_ids: [] })).toBe('全部有效成员')
    expect(groupMemberSummary({ kind: 'custom', member_ids: [1, 2] })).toBe('2 人')
    expect(groupMemberSummary({ kind: 'custom', member_ids: [] })).toBe('0 人')
  })
})

describe('id set helpers', () => {
  it('compares sets independent of order', () => {
    expect(sameIdSet([1, 2], [2, 1])).toBe(true)
    expect(sameIdSet([1], [1, 2])).toBe(false)
    expect(diffIds([1, 2], [2, 3])).toEqual({ added: 1, removed: 1 })
    expect(diffIds([], [4, 4])).toEqual({ added: 1, removed: 0 })
  })
})

describe('deviceGroupOwnership', () => {
  it('maps every device id to its current group', () => {
    const map = deviceGroupOwnership([
      { id: 7, name: 'Ops', device_ids: [11, 12] },
      { id: 8, name: 'Finance', device_ids: [13] },
    ] as DeviceGroup[])
    expect(map.get(11)).toEqual({ id: 7, name: 'Ops' })
    expect(map.get(13)).toEqual({ id: 8, name: 'Finance' })
    expect(map.get(99)).toBeUndefined()
  })
})

describe('access rule helpers', () => {
  it('keys duplicates consistently for null and zero targets', () => {
    expect(
      accessRuleKey({ source_group_id: 1, target_kind: 'all_devices', target_group_id: null }),
    ).toBe('1|all_devices|0')
    expect(
      accessRuleKey({ source_group_id: 1, target_kind: 'all_devices', target_group_id: 0 }),
    ).toBe('1|all_devices|0')
    expect(
      accessRuleKey({ source_group_id: 1, target_kind: 'device_group', target_group_id: 7 }),
    ).toBe('1|device_group|7')
  })

  it('detects duplicate and default rules', () => {
    const rules = [
      {
        id: 1,
        source_group_id: 1,
        source_group_name: 'everyone',
        target_kind: 'all_devices' as const,
        target_group_id: null,
        target_group_name: '',
        created_at: '',
      },
    ]
    expect(
      findDuplicateRule(rules, {
        source_group_id: 1,
        target_kind: 'all_devices',
        target_group_id: null,
      })?.id,
    ).toBe(1)
    expect(isDefaultAccessRule(rules[0], [])).toBe(true)
    expect(isDefaultAccessRule(rules[0], [{ id: 1, kind: 'custom' }])).toBe(false)
  })

  it('labels targets and explains their impact', () => {
    expect(ruleTargetKindLabel('device_group')).toBe('设备组')
    expect(accessRuleTargetLabel({ target_kind: 'user_group', target_group_name: 'Finance' })).toBe(
      '用户组 · Finance',
    )
    expect(accessRuleTargetLabel({ target_kind: 'all_devices', target_group_name: '' })).toBe(
      '全部设备',
    )
    expect(accessRuleImpact('user_group')).toContain('拥有的')
    expect(accessRuleImpact('all_devices')).toContain('全部')
  })

  it('validates source and target selection', () => {
    expect(
      validateRuleForm({ sourceGroupId: 0, targetKind: 'all_devices', targetGroupId: null }),
    ).toContain('来源')
    expect(
      validateRuleForm({ sourceGroupId: 1, targetKind: 'device_group', targetGroupId: null }),
    ).toContain('目标')
    expect(
      validateRuleForm({ sourceGroupId: 1, targetKind: 'device_group', targetGroupId: 3 }),
    ).toBeNull()
    expect(
      validateRuleForm({ sourceGroupId: 1, targetKind: 'all_devices', targetGroupId: 3 }),
    ).toBeNull()
  })
})

describe('ruleError', () => {
  it('maps rule-specific 400/409 without backend English', () => {
    expect(ruleError(new ApiError(400, 'invalid', 'bad'))).toContain('目标组')
    expect(ruleError(new ApiError(409, 'conflict', 'dup'))).toContain('已存在')
    expect(ruleError(new ApiError(403, 'forbidden', 'no'))).toContain('权限')
  })
})

describe('accessError', () => {
  it('maps access failures to Chinese without backend text', () => {
    expect(accessError(new ApiError(400, 'invalid', 'bad'))).toContain('不合法')
    expect(accessError(new ApiError(403, 'forbidden', 'no'))).toContain('权限')
    expect(accessError(new ApiError(404, 'not_found', 'gone'))).toContain('不存在')
    expect(accessError(new ApiError(409, 'conflict', 'dup'))).toContain('同名')
    expect(accessError(new ApiError(0, 'internal', 'net'))).toContain('网络')
    expect(accessError(new ApiError(500, 'internal', 'boom'))).toContain('服务异常')
    expect(accessError(new Error('boom'))).toContain('网络')
  })
})
