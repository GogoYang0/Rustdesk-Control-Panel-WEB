import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import {
  approvalDeviceLabel,
  formatCount,
  overviewError,
  sessionDeviceLabel,
  sessionOriginLabel,
} from './overview'

describe('overview formatting', () => {
  it('formats counts and unknown values', () => {
    expect(formatCount(12345)).toBe('12,345')
    expect(formatCount(0)).toBe('0')
    expect(formatCount(undefined)).toBe('—')
    expect(formatCount(Number.NaN)).toBe('—')
  })

  it('labels session origins and device fallbacks', () => {
    expect(sessionOriginLabel('panel')).toBe('面板')
    expect(sessionOriginLabel('native')).toBe('原生')
    expect(sessionDeviceLabel({ rustdesk_id: '123 456', device_id: 7 })).toBe('123 456')
    expect(sessionDeviceLabel({ rustdesk_id: '', device_id: 7 })).toBe('设备 #7')
    expect(approvalDeviceLabel(9)).toBe('设备 #9')
  })

  it('keeps device permission errors distinct', () => {
    expect(overviewError(new ApiError(403, 'forbidden', 'x'), 'devices')).toContain('device.read')
    expect(overviewError(new ApiError(403, 'forbidden', 'x'), 'sessions')).not.toContain(
      'device.read',
    )
    expect(overviewError(new ApiError(500, 'internal', 'x'), 'alerts')).toContain('暂时不可用')
    expect(overviewError(new ApiError(401, 'unauthorized', 'x'), 'approvals')).toContain('登录状态')
    expect(overviewError(new ApiError(404, 'not_found', 'x'), 'sessions')).toContain('组织不存在')
    expect(overviewError(new Error('boom'), 'approvals')).toContain('网络')
  })

  it('maps rate limits and unknown status failures', () => {
    expect(overviewError(new ApiError(429, 'rate_limited', 'x'), 'devices')).toContain('过于频繁')
    expect(overviewError(new ApiError(418, 'teapot', 'x'), 'devices')).toContain('加载失败')
  })
})
