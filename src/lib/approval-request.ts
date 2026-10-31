// Approval-request helpers shared by the device and session entries. The API
// has two mutually exclusive shapes: a pre-approval carries device_id and a
// ratification carries session_id (the server derives its device).

import type { ApprovalCreateRequest, ApprovalKind } from '../api/generated'
import { ApiError } from './api'

export const MAX_APPROVAL_REASON = 500

export interface ApprovalTarget {
  deviceId?: number
  sessionId?: number
}

/** The reason is optional; only its length can make the form invalid. */
export function approvalReasonProblem(reason: string): string | null {
  if ([...reason.trim()].length > MAX_APPROVAL_REASON) {
    return `理由最多 ${MAX_APPROVAL_REASON} 个字符`
  }
  return null
}

export function toApprovalCreateRequest(
  kind: ApprovalKind,
  target: ApprovalTarget,
  reason: string,
): ApprovalCreateRequest {
  const trimmed = reason.trim()
  const withReason = trimmed ? { reason: trimmed } : {}
  if (kind === 'pre_approval') {
    if (!target.deviceId) throw new RangeError('pre_approval requires a device id')
    return { kind, device_id: target.deviceId, ...withReason }
  }
  if (!target.sessionId) throw new RangeError('ratification requires a session id')
  // device_id is derived from the session server-side; sending one is a 400.
  return { kind, session_id: target.sessionId, ...withReason }
}

/** Chinese copy for request failures; backend English is never surfaced. */
export function approvalRequestError(err: unknown, kind: ApprovalKind): string {
  if (!(err instanceof ApiError)) return '网络异常，请稍后重试'
  if (err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 400) {
    return kind === 'ratification'
      ? '会话不存在、不属于当前组织，或不是可追认的 native 会话'
      : '请求参数不合法，请检查填写内容'
  }
  if (err.status === 403) return '当前会籍无权发起审批'
  if (err.status === 404) {
    return kind === 'pre_approval' ? '设备不存在或不属于当前组织' : '请求目标不存在或不可访问'
  }
  if (err.status >= 500) return '服务异常，请稍后重试'
  return '操作失败，请稍后重试'
}
