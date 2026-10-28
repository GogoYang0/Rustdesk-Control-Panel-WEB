// Policy form logic: the API stores minute-of-day in UTC, operators think in
// local time, and `PUT` replaces the whole record. These helpers keep the
// conversion, validation and payload assembly in one testable place.

import type { Policy, PolicyRequest } from '../api/generated'

export interface PolicyForm {
  name: string
  enabled: boolean
  /** No window at all; the API stores both bounds as null. */
  allDay: boolean
  /** Local minute-of-day, 0–1439 (only meaningful when allDay is false). */
  startMinute: number
  endMinute: number
  /** No limit; the API stores null. */
  noConcurrencyLimit: boolean
  maxConcurrent: string
  noDurationLimit: boolean
  maxSessionMinutes: string
  requireApproval: boolean
  /** Stored row has only one window bound; the API evaluates it as blocked. */
  windowIncomplete: boolean
}

export const MINUTES_PER_DAY = 24 * 60

/** Minutes east of UTC for this browser right now (UTC+8 → 480). */
export function currentOffsetEast(now = new Date()): number {
  return -now.getTimezoneOffset()
}

/** `UTC+08:00` style label for the offset used by the form. */
export function formatOffset(offsetEast: number): string {
  const sign = offsetEast >= 0 ? '+' : '-'
  const abs = Math.abs(offsetEast)
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(
    2,
    '0',
  )}`
}

export function parseTimeValue(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function formatMinute(minute: number): string {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function localToUtcMinute(localMinute: number, offsetEast: number): number {
  return (((localMinute - offsetEast) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
}

export function utcToLocalMinute(utcMinute: number, offsetEast: number): number {
  return (((utcMinute + offsetEast) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
}

/** A UTC window rendered in local time; both null means all day. */
export function windowLabel(
  startMinute: number | null | undefined,
  endMinute: number | null | undefined,
  offsetEast: number,
): string {
  if (startMinute == null && endMinute == null) return '全天'
  if (startMinute == null || endMinute == null) return '配置不完整'
  return `${formatMinute(utcToLocalMinute(startMinute, offsetEast))}–${formatMinute(
    utcToLocalMinute(endMinute, offsetEast),
  )}`
}

export function policyToForm(policy: Policy, offsetEast: number): PolicyForm {
  const hasStart = policy.allowed_start_minute != null
  const hasEnd = policy.allowed_end_minute != null
  return {
    name: policy.name,
    enabled: policy.enabled,
    allDay: !hasStart && !hasEnd,
    startMinute: hasStart
      ? utcToLocalMinute(policy.allowed_start_minute as number, offsetEast)
      : 9 * 60,
    endMinute: hasEnd ? utcToLocalMinute(policy.allowed_end_minute as number, offsetEast) : 18 * 60,
    noConcurrencyLimit: policy.max_concurrent_sessions == null,
    maxConcurrent:
      policy.max_concurrent_sessions == null ? '5' : String(policy.max_concurrent_sessions),
    noDurationLimit: policy.max_session_minutes == null,
    maxSessionMinutes:
      policy.max_session_minutes == null ? '60' : String(policy.max_session_minutes),
    requireApproval: policy.require_approval,
    // A half window evaluates as blocked; editing must not "repair" it into
    // all-day silently, so it stays visible and blocks submission.
    windowIncomplete: hasStart !== hasEnd,
  }
}

export function emptyPolicyForm(): PolicyForm {
  return {
    name: '',
    enabled: true,
    allDay: false,
    startMinute: 9 * 60,
    endMinute: 18 * 60,
    noConcurrencyLimit: true,
    maxConcurrent: '5',
    noDurationLimit: true,
    maxSessionMinutes: '60',
    requireApproval: false,
    windowIncomplete: false,
  }
}

// A positive integer as typed; '' and non-integers are invalid.
function parsePositiveInt(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  return Number.isSafeInteger(n) && n >= 1 ? n : null
}

/** Field-keyed messages, empty when the form can be submitted. */
export function validatePolicyForm(form: PolicyForm): Record<string, string> {
  const errors: Record<string, string> = {}
  const name = form.name.trim()
  if (!name) errors.name = '请填写策略名称'
  else if (name.length > 128) errors.name = '名称最多 128 个字符'

  if (form.windowIncomplete) {
    errors.window = '原策略的时段只有一端有值（服务端按完全禁止处理），请重新设置完整时段或改为全天'
  } else if (!form.allDay && form.startMinute === form.endMinute) {
    // The write path rejects equal bounds with 400; a stored row with equal
    // bounds would evaluate as blocked. Both are too easy to misread, so the
    // form refuses the shape instead of encoding it.
    errors.window = '起止时间不能相同，请调整时段或改为全天'
  }
  if (!form.noConcurrencyLimit && parsePositiveInt(form.maxConcurrent) == null) {
    errors.maxConcurrent = '并发上限必须是 ≥1 的整数'
  }
  if (!form.noDurationLimit && parsePositiveInt(form.maxSessionMinutes) == null) {
    errors.maxSessionMinutes = '时长上限必须是 ≥1 的整数'
  }
  return errors
}

export function toPolicyRequest(form: PolicyForm, offsetEast: number): PolicyRequest {
  const request: PolicyRequest = {
    name: form.name.trim(),
    // Both booleans must be present: the API distinguishes "missing" from
    // "false" to avoid silently disabling a policy.
    enabled: form.enabled,
    require_approval: form.requireApproval,
    max_concurrent_sessions: form.noConcurrencyLimit
      ? null
      : (parsePositiveInt(form.maxConcurrent) as number),
    max_session_minutes: form.noDurationLimit
      ? null
      : (parsePositiveInt(form.maxSessionMinutes) as number),
    allowed_start_minute: form.allDay ? null : localToUtcMinute(form.startMinute, offsetEast),
    allowed_end_minute: form.allDay ? null : localToUtcMinute(form.endMinute, offsetEast),
  }
  return request
}

/** Full payload for the enable/disable switch — `PUT` has no partial form.
 * Built from the stored row, not the form: form defaults would silently rewrite
 * an all-day policy or a half window. */
export function withEnabled(policy: Policy, enabled: boolean): PolicyRequest {
  return {
    name: policy.name,
    enabled,
    require_approval: policy.require_approval,
    max_concurrent_sessions: policy.max_concurrent_sessions ?? null,
    max_session_minutes: policy.max_session_minutes ?? null,
    allowed_start_minute: policy.allowed_start_minute ?? null,
    allowed_end_minute: policy.allowed_end_minute ?? null,
  }
}
