// Client-build copy and validation. The API exposes no machine-readable 409
// reason, so conflict text is chosen from the operation that issued the call.

import { ApiError } from './api'

const PLATFORM_LABELS: Record<string, string> = {
  'windows-x64': 'Windows x64',
  'linux-x64': 'Linux x64',
  'macos-arm64': 'macOS arm64',
  'macos-x64': 'macOS x64',
  'android-arm64': 'Android arm64',
}

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform
}

export const CLIENT_BUILD_STATUSES = [
  'pending',
  'dispatching',
  'dispatched',
  'running',
  'ingesting',
  'succeeded',
  'failed',
  'cancelled',
] as const

const STATUS_LABELS: Record<string, string> = {
  pending: '排队中',
  dispatching: '派发中',
  dispatched: '已派发',
  running: '构建中',
  ingesting: '回收产物',
  succeeded: '成功',
  failed: '失败',
  cancelled: '已取消',
}

const STATUS_TONES: Record<string, string> = {
  pending: 'grey',
  dispatching: 'orange',
  dispatched: 'blue',
  running: 'blue',
  ingesting: 'orange',
  succeeded: 'green',
  failed: 'red',
  cancelled: 'grey',
}

export function buildStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

export function buildStatusTone(status: string): string {
  return STATUS_TONES[status] ?? 'grey'
}

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled'])

export function isActiveBuildStatus(status: string): boolean {
  return !TERMINAL_STATUSES.has(status)
}

const PROVISIONING_LABELS: Record<string, string> = {
  deployed: '已部署',
  provisioning: '供应中',
  failed: '供应失败',
  disabled: '已停用',
  missing: '缺失',
}

export function provisioningLabel(state: string): string {
  return PROVISIONING_LABELS[state] ?? state
}

interface BuildCapabilityView {
  enabled: boolean
  provisioning_state: string
  defaults?: unknown
}

/** Build creation is blocked unless the deployment and server defaults exist. */
export function capabilityBlockReason(caps: BuildCapabilityView): string | null {
  if (!caps.enabled) return '构建能力未启用；可维护品牌配置，但不能发起构建'
  if (caps.provisioning_state !== 'deployed') {
    return `本组织服务器${provisioningLabel(caps.provisioning_state)}，构建不可发起`
  }
  if (!caps.defaults) return '服务器默认值不可用；构建不可发起'
  return null
}

function runeCount(value: string): number {
  return [...value].length
}

export function profileNameProblem(
  name: string,
  profiles: { id?: number; name: string }[],
  exceptId?: number,
): string | null {
  const trimmed = name.trim()
  if (runeCount(trimmed) < 1 || runeCount(trimmed) > 64) return '名称需为 1–64 个字符'
  if (
    [...trimmed].some((char) => {
      const code = char.codePointAt(0) ?? 0
      return code < 0x20 || (code >= 0x7f && code <= 0x9f)
    })
  ) {
    return '名称包含不可见控制字符'
  }
  const key = trimmed.toLowerCase()
  const duplicate = profiles.some(
    (profile) => profile.id !== exceptId && profile.name.trim().toLowerCase() === key,
  )
  return duplicate ? '名称已被使用（不区分大小写）' : null
}

// Mirrors the server's Unicode letter/digit rule; keep this aligned with
// internal/clientbuild/validate.go rather than an ASCII-only regexp.
const APP_NAME_CHARS = /^[\p{L}\p{Nd} ._-]+$/u

export function appNameProblem(name: string): string | null {
  const trimmed = name.trim()
  if (runeCount(trimmed) < 1 || runeCount(trimmed) > 32) return '应用名需为 1–32 个字符'
  if (trimmed === 'RustDesk') return '应用名不能与官方 RustDesk 相同'
  if (trimmed === '.' || trimmed === '..') return '应用名不能是路径片段'
  if (!APP_NAME_CHARS.test(trimmed)) {
    return '应用名只能包含字母、数字、空格和 . _ -'
  }
  return null
}

interface UploadFileView {
  type: string
  size: number
  name?: string
}

export function logoUploadProblem(file: UploadFileView): string | null {
  const png =
    file.type === 'image/png' || (file.type === '' && file.name?.toLowerCase().endsWith('.png'))
  if (!png) return 'Logo 必须是 PNG 文件'
  if (file.size > 1024 * 1024) return 'Logo 不能超过 1 MiB'
  return null
}

/** The API wants bare base64, not the data URL prefix. */
export function base64FromDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma === -1 ? '' : dataUrl.slice(comma + 1)
}

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes
  let unit = 'B'
  for (const next of units) {
    value /= 1024
    unit = next
    if (value < 1024) break
  }
  return `${value.toFixed(1)} ${unit}`
}

export function shortSha(sha: string): string {
  return sha.length > 12 ? `${sha.slice(0, 12)}…` : sha
}

export type ClientBuildOperation =
  'profile-create' | 'profile-update' | 'profile-delete' | 'logo' | 'capabilities' | 'profiles'

export function clientBuildError(err: unknown, operation: ClientBuildOperation): string {
  if (!(err instanceof ApiError)) return '网络异常，请稍后重试'
  if (err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 401) return '登录已失效，请重新登录'
  if (err.status === 403) return '当前角色没有客户端生成器权限'
  if (err.status === 404) {
    return operation === 'capabilities' || operation === 'profiles'
      ? '组织不存在或服务不可用'
      : 'Profile 不存在'
  }
  if (err.status === 409) {
    if (operation === 'profile-create') return '名称已被使用或 Profile 数量已达上限'
    if (operation === 'profile-update') return '名称已被使用'
    if (operation === 'profile-delete') return '该 Profile 仍有进行中的构建，暂不能删除'
    return '操作冲突，请刷新后重试'
  }
  if (err.status === 400) {
    if (operation === 'logo') return 'PNG 需为 256–1024 正方形且不超过 1 MiB'
    if (operation === 'profile-create' || operation === 'profile-update') {
      return 'Profile 名称或应用名不合法'
    }
    return '请求参数不合法'
  }
  if (err.status === 503) return '构建能力不可用'
  if (err.status >= 500) return '服务异常，请稍后重试'
  return '操作失败，请稍后重试'
}
