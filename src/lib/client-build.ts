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

export const BUILD_PAGE_SIZES = [20, 50, 100] as const
export type BuildPageSize = (typeof BUILD_PAGE_SIZES)[number]
export const MAX_BUILD_PAGE = 100_000

export interface BuildFilters {
  status: string
  profileId: number | null
  page: number
  pageSize: BuildPageSize
}

export const DEFAULT_BUILD_FILTERS: BuildFilters = {
  status: '',
  profileId: null,
  page: 1,
  pageSize: 20,
}

function knownStatus(value: string): boolean {
  return (CLIENT_BUILD_STATUSES as readonly string[]).includes(value)
}

export function parseBuildFilters(params: URLSearchParams): BuildFilters {
  const status = params.get('status') ?? ''
  const profile = params.get('profileId') ?? ''
  const page = params.get('page') ?? ''
  const pageSize = params.get('pageSize') ?? ''
  const profileId = /^\d+$/.test(profile) ? Number(profile) : 0
  const parsedPage = /^\d+$/.test(page) ? Number(page) : 1
  const parsedSize = /^\d+$/.test(pageSize) ? Number(pageSize) : 20
  return {
    status: knownStatus(status) ? status : '',
    profileId: Number.isSafeInteger(profileId) && profileId > 0 ? profileId : null,
    page:
      Number.isSafeInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, MAX_BUILD_PAGE) : 1,
    pageSize: (BUILD_PAGE_SIZES as readonly number[]).includes(parsedSize)
      ? (parsedSize as BuildPageSize)
      : DEFAULT_BUILD_FILTERS.pageSize,
  }
}

export function toBuildSearchParams(filters: BuildFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.profileId !== null) params.set('profileId', String(filters.profileId))
  if (filters.page > 1) params.set('page', String(filters.page))
  if (filters.pageSize !== DEFAULT_BUILD_FILTERS.pageSize) {
    params.set('pageSize', String(filters.pageSize))
  }
  return params
}

export function toBuildRequestQuery(filters: BuildFilters): URLSearchParams {
  const query = new URLSearchParams()
  if (filters.status) query.set('status', filters.status)
  if (filters.profileId !== null) query.set('profileId', String(filters.profileId))
  query.set('page', String(filters.page))
  query.set('pageSize', String(filters.pageSize))
  return query
}

const CANCELABLE_STATUSES = new Set(['pending', 'dispatching', 'dispatched', 'running'])

export function canCancelBuild(status: string): boolean {
  return CANCELABLE_STATUSES.has(status)
}

export function buildArtifactLabel(count: number, purged: boolean): string {
  if (purged) return '已清理'
  return count > 0 ? String(count) : '—'
}

export function buildPlatformsLabel(platforms: string[]): string {
  return platforms.length === 0 ? '—' : platforms.map(platformLabel).join(', ')
}

export type ClientBuildOperation =
  | 'profile-create'
  | 'profile-update'
  | 'profile-delete'
  | 'logo'
  | 'capabilities'
  | 'profiles'
  | 'builds'
  | 'build'
  | 'build-create'
  | 'build-cancel'
  | 'artifact'

export function clientBuildError(err: unknown, operation: ClientBuildOperation): string {
  if (!(err instanceof ApiError)) return '网络异常，请稍后重试'
  if (err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 401) return '登录已失效，请重新登录'
  if (err.status === 403) return '当前角色没有客户端生成器权限'
  if (err.status === 404) {
    if (operation === 'capabilities' || operation === 'profiles') return '组织不存在或服务不可用'
    if (operation === 'builds') return '组织不存在或服务不可用'
    if (operation === 'build') return '构建不存在'
    if (operation === 'artifact') return '产物已不可下载'
    return 'Profile 不存在'
  }
  if (err.status === 409) {
    if (operation === 'profile-create') return '名称已被使用或 Profile 数量已达上限'
    if (operation === 'profile-update') return '名称已被使用'
    if (operation === 'profile-delete') return '该 Profile 仍有进行中的构建，暂不能删除'
    if (operation === 'build-create') return '无法发起构建：服务器未就绪或配额已满'
    if (operation === 'build-cancel') return '构建状态已变化，无法取消'
    return '操作冲突，请刷新后重试'
  }
  if (err.status === 400) {
    if (operation === 'logo') return 'PNG 需为 256–1024 正方形且不超过 1 MiB'
    if (operation === 'profile-create' || operation === 'profile-update') {
      return 'Profile 名称或应用名不合法'
    }
    if (operation === 'build-create') return '平台或 Profile 不合法'
    return '请求参数不合法'
  }
  if (err.status === 503) return '构建能力不可用'
  if (err.status >= 500) return '服务异常，请稍后重试'
  return '操作失败，请稍后重试'
}
