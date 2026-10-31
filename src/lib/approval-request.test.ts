import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import {
  approvalReasonProblem,
  approvalRequestError,
  toApprovalCreateRequest,
} from './approval-request'

describe('toApprovalCreateRequest', () => {
  it('sends device_id for a pre-approval and session_id for a ratification', () => {
    expect(toApprovalCreateRequest('pre_approval', { deviceId: 7 }, ' 需要维护  ')).toEqual({
      kind: 'pre_approval',
      device_id: 7,
      reason: '需要维护',
    })
    expect(toApprovalCreateRequest('ratification', { sessionId: 9 }, '')).toEqual({
      kind: 'ratification',
      session_id: 9,
    })
  })

  it('never mixes the two target fields', () => {
    const pre = toApprovalCreateRequest('pre_approval', { deviceId: 1, sessionId: 2 }, '')
    expect(pre).not.toHaveProperty('session_id')
    const rat = toApprovalCreateRequest('ratification', { deviceId: 1, sessionId: 2 }, '')
    expect(rat).not.toHaveProperty('device_id')
  })

  it('omits a blank reason instead of sending an empty string', () => {
    expect(toApprovalCreateRequest('pre_approval', { deviceId: 3 }, '   ')).toEqual({
      kind: 'pre_approval',
      device_id: 3,
    })
  })

  it('rejects a missing target instead of guessing one', () => {
    expect(() => toApprovalCreateRequest('pre_approval', {}, '')).toThrow(RangeError)
    expect(() => toApprovalCreateRequest('ratification', {}, '')).toThrow(RangeError)
  })
})

describe('approvalReasonProblem', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(approvalReasonProblem('维'.repeat(500))).toBeNull()
    expect(approvalReasonProblem('维'.repeat(501))).toContain('500')
    expect(approvalReasonProblem('😀'.repeat(501))).toContain('500')
  })

  it('ignores surrounding whitespace', () => {
    expect(approvalReasonProblem(`  ${'维'.repeat(500)}  `)).toBeNull()
  })
})

describe('approvalRequestError', () => {
  it('uses the ratification-specific 400 copy', () => {
    expect(approvalRequestError(new ApiError(400, 'invalid_request', 'bad'), 'ratification')).toBe(
      '会话不存在、不属于当前组织，或不是可追认的 native 会话',
    )
    expect(approvalRequestError(new ApiError(400, 'invalid_request', 'bad'), 'pre_approval')).toBe(
      '请求参数不合法，请检查填写内容',
    )
  })

  it('maps membership, missing device and service failures', () => {
    expect(approvalRequestError(new ApiError(403, 'forbidden', 'no'), 'pre_approval')).toBe(
      '当前会籍无权发起审批',
    )
    expect(approvalRequestError(new ApiError(404, 'not_found', 'gone'), 'pre_approval')).toBe(
      '设备不存在或不属于当前组织',
    )
    expect(approvalRequestError(new ApiError(0, 'internal', 'network'), 'pre_approval')).toBe(
      '网络异常，请稍后重试',
    )
    expect(approvalRequestError(new ApiError(503, 'internal', 'boom'), 'pre_approval')).toBe(
      '服务异常，请稍后重试',
    )
  })

  it('does not surface the backend message', () => {
    const err = new ApiError(418, 'teapot', 'backend english message')
    expect(approvalRequestError(err, 'pre_approval')).not.toContain('backend')
  })
})
