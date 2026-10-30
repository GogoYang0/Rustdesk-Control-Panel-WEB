// Client strategies are configuration delivery, not authorization. The client
// applies every key it receives without its own allowlist, so this UI list must
// match the 20 keys in the API contract byte for byte.

import { ApiError } from './api'

export const STRATEGY_OPTION_KEYS = [
  'enable-audio',
  'enable-clipboard',
  'enable-file-transfer',
  'enable-file-copy-paste',
  'enable-camera',
  'enable-terminal',
  'enable-tunnel',
  'enable-remote-restart',
  'enable-record-session',
  'enable-block-input',
  'enable-privacy-mode',
  'enable-remote-modify',
  'enable-remote-printer',
  'enable-check-update',
  'disable-change-id',
  'disable-settings',
  'disable-installation',
  'disable-unlock-pin',
  'disable-tcp-listen',
  'disable-ab',
] as const

export type StrategyOptionKey = (typeof STRATEGY_OPTION_KEYS)[number]

const KEY_LABELS: Record<StrategyOptionKey, string> = {
  'enable-audio': '启用声音',
  'enable-clipboard': '启用剪贴板',
  'enable-file-transfer': '启用文件传输',
  'enable-file-copy-paste': '启用文件复制粘贴',
  'enable-camera': '启用摄像头',
  'enable-terminal': '启用终端',
  'enable-tunnel': '启用隧道',
  'enable-remote-restart': '启用远程重启',
  'enable-record-session': '启用录屏',
  'enable-block-input': '启用阻止输入',
  'enable-privacy-mode': '启用隐私模式',
  'enable-remote-modify': '启用远程修改',
  'enable-remote-printer': '启用远程打印机',
  'enable-check-update': '启用检查更新',
  'disable-change-id': '禁止更改 ID',
  'disable-settings': '禁用设置',
  'disable-installation': '禁止安装',
  'disable-unlock-pin': '禁止解锁 PIN',
  'disable-tcp-listen': '禁用 TCP 监听',
  'disable-ab': '禁用地址簿',
}

export function strategyOptionLabel(key: string): string {
  return KEY_LABELS[key as StrategyOptionKey] ?? key
}

export interface StrategyRow {
  key: StrategyOptionKey
  label: string
  checked: boolean
  value: string
}

/** Presence is the source of truth: an empty value is still a checked key. */
export function buildStrategyRows(
  config: Record<string, string> | null | undefined,
): StrategyRow[] {
  return STRATEGY_OPTION_KEYS.map((key) => ({
    key,
    label: KEY_LABELS[key],
    checked: config != null && Object.prototype.hasOwnProperty.call(config, key),
    value: config?.[key] ?? 'Y',
  }))
}

export function rowsToConfig(rows: StrategyRow[]): Record<string, string> {
  const config: Record<string, string> = {}
  for (const row of rows) {
    if (row.checked) config[row.key] = row.value
  }
  return config
}

export function strategyKeyCount(config: Record<string, string> | null | undefined): number {
  return config ? Object.keys(config).length : 0
}

export function strategyNameProblem(
  name: string,
  strategies: { id: number; name: string }[],
  exceptId?: number,
): string | null {
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
  const key = trimmed.toLocaleLowerCase()
  return strategies.some(
    (strategy) => strategy.id !== exceptId && strategy.name.trim().toLocaleLowerCase() === key,
  )
    ? '名称已被使用（不区分大小写）'
    : null
}

export function optionValueProblem(value: string): string | null {
  if ([...value].length > 256) return '值不能超过 256 个字符'
  if (
    [...value].some((char) => {
      const code = char.codePointAt(0) ?? 0
      return code < 0x20 || (code >= 0x7f && code <= 0x9f)
    })
  ) {
    return '值包含不可见控制字符'
  }
  return null
}

export function strategyAssignmentLabel(
  strategyId: number | null | undefined,
  strategies: { id: number; name: string }[],
): string {
  if (strategyId == null) return '未分配'
  const strategy = strategies.find((candidate) => candidate.id === strategyId)
  return strategy ? strategy.name : `策略 #${strategyId}（不存在）`
}

export const STRATEGY_PRIORITY_COPY =
  '设备 > 设备组 > 成员；成员层只作用于该成员拥有、且没有设备/组层分配的设备。停用策略会停止下发且不向更宽层回落。'

export function strategyDeleteWarning(): string {
  return '删除会清除成员、设备组、设备三层的分配；设备数量不在此处估算。'
}

export type StrategyOperation =
  | 'strategies'
  | 'strategy'
  | 'create'
  | 'update'
  | 'delete'
  | 'assign-member'
  | 'assign-group'
  | 'assign-device'

export function strategyError(err: unknown, operation: StrategyOperation): string {
  if (!(err instanceof ApiError)) return '网络异常，请稍后重试'
  if (err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 401) return '登录已失效，请重新登录'
  if (err.status === 403) {
    if (operation === 'assign-group') return '设备组读取需要 access.manage'
    if (operation === 'assign-device') return '当前角色没有设备读取权限'
    return '当前角色没有客户端策略管理权限'
  }
  if (err.status === 404) {
    if (operation === 'strategies') return '组织不存在或服务不可用'
    if (
      operation === 'assign-member' ||
      operation === 'assign-group' ||
      operation === 'assign-device'
    ) {
      return '目标或策略不存在'
    }
    return '策略不存在'
  }
  if (err.status === 409) {
    return operation === 'create' || operation === 'update'
      ? '名称已被使用（不区分大小写）'
      : '操作冲突，请刷新后重试'
  }
  if (err.status === 400) {
    return operation === 'create' || operation === 'update'
      ? '策略名称、白名单键或值不合法'
      : '请求参数不合法'
  }
  if (err.status >= 500) return '服务异常，请稍后重试'
  return '操作失败，请稍后重试'
}
