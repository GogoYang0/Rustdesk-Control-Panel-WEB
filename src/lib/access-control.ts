// Access-control groups: name rules, full-replacement diffs and the device →
// group map used to explain moves before saving.

import type { DeviceGroup } from '../api/generated'
import { ApiError } from './api'

export const EVERYONE_NAME = 'everyone'
export const GROUP_NAME_MAX = 64
export const DEVICE_PICKER_LIMIT = 2000

interface NamedGroup {
  id?: number
  name: string
}

function clean(name: string): string {
  return name.trim()
}

function commonNameError(name: string, groups: NamedGroup[], exceptId?: number): string | null {
  const trimmed = clean(name)
  if (!trimmed) return '请填写组名称'
  if ([...trimmed].length > GROUP_NAME_MAX) return `名称最多 ${GROUP_NAME_MAX} 个字符`
  if (
    groups.some(
      (group) => group.id !== exceptId && clean(group.name).toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    return '已存在同名组'
  }
  return null
}

export function validateUserGroupName(
  name: string,
  groups: NamedGroup[] = [],
  exceptId?: number,
): string | null {
  const trimmed = clean(name)
  if (!trimmed) return '请填写组名称'
  if ([...trimmed].length > GROUP_NAME_MAX) return `名称最多 ${GROUP_NAME_MAX} 个字符`
  if (trimmed.toLowerCase() === EVERYONE_NAME) return 'everyone 是保留组名，请换一个名称'
  return commonNameError(name, groups, exceptId)
}

export function validateDeviceGroupName(
  name: string,
  groups: NamedGroup[] = [],
  exceptId?: number,
): string | null {
  return commonNameError(name, groups, exceptId)
}

export function groupMemberSummary(group: { kind: string; member_ids: number[] }): string {
  if (group.kind === 'everyone') return '全部有效成员'
  return `${group.member_ids.length} 人`
}

export function sameIdSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const left = new Set(a)
  return b.every((id) => left.has(id))
}

/** Counts the selected-vs-baseline changes for a full replacement. */
export function diffIds(
  baseline: number[],
  selected: number[],
): { added: number; removed: number } {
  const before = new Set(baseline)
  const after = new Set(selected)
  let added = 0
  let removed = 0
  for (const id of after) if (!before.has(id)) added += 1
  for (const id of before) if (!after.has(id)) removed += 1
  return { added, removed }
}

/** device id → current group, used for “moves in from …” labels. */
export function deviceGroupOwnership(
  groups: DeviceGroup[],
): Map<number, { id: number; name: string }> {
  const map = new Map<number, { id: number; name: string }>()
  for (const group of groups) {
    for (const deviceID of group.device_ids) {
      map.set(deviceID, { id: group.id, name: group.name })
    }
  }
  return map
}

/** Chinese copy for access-control failures. */
export function accessError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return '网络异常，请稍后重试'
    if (err.status === 400) return '请求不合法，请检查成员或设备选择'
    if (err.status === 403) return '当前角色没有访问控制管理权限'
    if (err.status === 404) return '对象已不存在，列表将刷新'
    if (err.status === 409) return '同名、保留组或规则已存在'
    if (err.status >= 500) return '服务异常，请稍后重试'
    return '操作失败，请稍后重试'
  }
  return '网络异常，请稍后重试'
}
