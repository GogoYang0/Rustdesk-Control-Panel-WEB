// Control roles only affect panel sessions: hbbs injects the native bitmap and
// the panel is not in that signalling path. The UI keeps the protocol order
// because the slice index is the client's permission bit.

import { ApiError } from './api'

export const CONTROL_PERMISSION_KEYS = [
  'keyboard',
  'remote_printer',
  'clipboard',
  'file',
  'audio',
  'camera',
  'terminal',
  'tunnel',
  'restart',
  'recording',
  'block_input',
  'remote_modify',
  'privacy_mode',
  'usb',
] as const

export type ControlPermissionKey = (typeof CONTROL_PERMISSION_KEYS)[number]
export type ControlPermissionState = 'use_client' | 'enable' | 'disable'
export type ControlPermissions = Record<ControlPermissionKey, ControlPermissionState>

const KEY_LABELS: Record<ControlPermissionKey, string> = {
  keyboard: '键盘与鼠标',
  remote_printer: '远程打印机',
  clipboard: '剪贴板',
  file: '文件传输',
  audio: '声音',
  camera: '摄像头',
  terminal: '终端',
  tunnel: '隧道',
  restart: '远程重启',
  recording: '录屏',
  block_input: '阻止输入',
  remote_modify: '远程修改',
  privacy_mode: '隐私模式',
  usb: 'USB',
}

export const CONTROL_STATES: ControlPermissionState[] = ['use_client', 'enable', 'disable']

const STATE_LABELS: Record<ControlPermissionState, string> = {
  use_client: '继承',
  enable: '允许',
  disable: '拒绝',
}

const STATE_TONES: Record<ControlPermissionState, string> = {
  use_client: 'grey',
  enable: 'green',
  disable: 'red',
}

export function controlKeyLabel(key: string): string {
  return KEY_LABELS[key as ControlPermissionKey] ?? key
}

export function controlStateLabel(state: string): string {
  return STATE_LABELS[state as ControlPermissionState] ?? state
}

export function controlStateTone(state: string): string {
  return STATE_TONES[state as ControlPermissionState] ?? 'grey'
}

/** Fills absent keys with use_client; unknown keys are ignored defensively. */
export function normalizePermissions(
  input: Record<string, string> | null | undefined,
): ControlPermissions {
  const out = {} as ControlPermissions
  for (const key of CONTROL_PERMISSION_KEYS) {
    const value = input?.[key]
    out[key] =
      value === 'enable' || value === 'disable' || value === 'use_client' ? value : 'use_client'
  }
  return out
}

export function permissionCounts(permissions: Record<string, string>): {
  enable: number
  disable: number
  inherit: number
} {
  const normalized = normalizePermissions(permissions)
  let enable = 0
  let disable = 0
  for (const key of CONTROL_PERMISSION_KEYS) {
    if (normalized[key] === 'enable') enable += 1
    else if (normalized[key] === 'disable') disable += 1
  }
  return { enable, disable, inherit: CONTROL_PERMISSION_KEYS.length - enable - disable }
}

export interface RoleLike {
  id: number
  name: string
  kind: 'default' | 'custom'
  builtin: boolean
}

export interface MemberLike {
  control_role_id?: number | null
}

export function isBuiltinRole(role: RoleLike): boolean {
  return role.builtin || role.kind === 'default'
}

/** Members with null or the builtin id both fall back to Default. */
export function memberCountForRole(
  role: RoleLike,
  roles: RoleLike[],
  members: MemberLike[],
): number {
  if (isBuiltinRole(role)) {
    const defaultId = roles.find(isBuiltinRole)?.id
    return members.filter(
      (member) => member.control_role_id == null || member.control_role_id === defaultId,
    ).length
  }
  return members.filter((member) => member.control_role_id === role.id).length
}

export function roleAssignmentLabel(roleId: number | null | undefined, roles: RoleLike[]): string {
  if (roleId == null) return '未分配 → Default'
  const role = roles.find((candidate) => candidate.id === roleId)
  if (!role) return `角色 #${roleId}（不存在）`
  if (isBuiltinRole(role)) return '未分配 → Default'
  return role.name
}

export function roleNameProblem(name: string, roles: RoleLike[], exceptId?: number): string | null {
  const trimmed = name.trim()
  const length = [...trimmed].length
  if (length < 1 || length > 64) return '名称需为 1–64 个字符'
  if (
    [...trimmed].some((char) => {
      const code = char.codePointAt(0) ?? 0
      return code < 0x20 || (code >= 0x7f && code <= 0x9f)
    })
  ) {
    return '名称包含不可见控制字符'
  }
  return roles.some((role) => role.id !== exceptId && role.name === trimmed) ? '名称已被使用' : null
}

export type ControlRoleOperation =
  'roles' | 'role-create' | 'role-update' | 'role-delete' | 'assign'

export function controlRoleError(
  err: unknown,
  operation: ControlRoleOperation,
  builtin = false,
): string {
  if (!(err instanceof ApiError)) return '网络异常，请稍后重试'
  if (err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 401) return '登录已失效，请重新登录'
  if (err.status === 403) return '当前角色没有控制角色管理权限'
  if (err.status === 404) {
    if (operation === 'assign') return '成员或控制角色不存在'
    return operation === 'roles' ? '组织不存在或服务不可用' : '控制角色不存在'
  }
  if (err.status === 409) {
    if (builtin && (operation === 'role-delete' || operation === 'role-update')) {
      return '内置 Default 角色不可改名或删除'
    }
    return operation === 'role-create' || operation === 'role-update'
      ? '名称已被使用'
      : '操作冲突，请刷新后重试'
  }
  if (err.status === 400) {
    return operation === 'assign' ? '成员或控制角色不合法' : '控制角色名称或权限不合法'
  }
  if (err.status >= 500) return '服务异常，请稍后重试'
  return '操作失败，请稍后重试'
}
