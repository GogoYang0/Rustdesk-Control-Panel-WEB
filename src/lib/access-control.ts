// Access-control groups: name rules, full-replacement diffs and the device →
// group map used to explain moves before saving.

import type { AccessRule, AccessRuleTargetKind, DeviceGroup } from '../api/generated'
import { ApiError } from './api'

export const EVERYONE_NAME = 'everyone'
export const GROUP_NAME_MAX = 64

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

export interface RuleSubject {
  source_group_id: number
  target_kind: AccessRuleTargetKind
  target_group_id?: number | null
}

/** Stable duplicate key; null and 0 both mean “no target group”. */
export function accessRuleKey(rule: RuleSubject): string {
  return `${rule.source_group_id}|${rule.target_kind}|${rule.target_group_id ?? 0}`
}

export function findDuplicateRule(
  rules: AccessRule[],
  subject: RuleSubject,
): AccessRule | undefined {
  const key = accessRuleKey(subject)
  return rules.find((rule) => accessRuleKey(rule) === key)
}

export function isDefaultAccessRule(
  rule: AccessRule,
  groups: { id: number; kind: string }[] = [],
): boolean {
  if (rule.target_kind !== 'all_devices') return false
  const source = groups.find((group) => group.id === rule.source_group_id)
  if (source) return source.kind === 'everyone'
  return rule.source_group_name === EVERYONE_NAME
}

const TARGET_LABELS: Record<AccessRuleTargetKind, string> = {
  device_group: '设备组',
  user_group: '用户组',
  all_devices: '全部设备',
}

export function ruleTargetKindLabel(kind: AccessRuleTargetKind): string {
  return TARGET_LABELS[kind]
}

export function accessRuleTargetLabel(rule: {
  target_kind: AccessRuleTargetKind
  target_group_name: string
}): string {
  if (rule.target_kind === 'all_devices') return '全部设备'
  return `${ruleTargetKindLabel(rule.target_kind)} · ${rule.target_group_name}`
}

export function accessRuleImpact(kind: AccessRuleTargetKind): string {
  if (kind === 'all_devices') {
    return '源组成员可以访问组织内全部未停用设备。'
  }
  if (kind === 'user_group') {
    return '源组成员可以访问目标用户组显式成员拥有的未停用设备；目标是 everyone 时等于所有有效成员拥有的设备。'
  }
  return '源组成员可以访问该设备组当前及以后加入的未停用设备。'
}

export function validateRuleForm(form: {
  sourceGroupId: number
  targetKind: AccessRuleTargetKind
  targetGroupId: number | null
}): string | null {
  if (form.sourceGroupId <= 0) return '请选择来源用户组'
  if (form.targetKind === 'all_devices') return null
  if (form.targetGroupId == null || form.targetGroupId <= 0) {
    return `请选择目标${ruleTargetKindLabel(form.targetKind)}`
  }
  return null
}
