import { describe, expect, it } from 'vitest'

import type { DeviceGroup } from '../api/generated'
import {
  accessError,
  deviceGroupOwnership,
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
