import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import { deviceWriteError } from './device-errors'

describe('device write errors', () => {
  it('maps a pending disconnect conflict to the wait message', () => {
    const err = new ApiError(409, 'conflict', 'a disconnect request is already pending')
    expect(deviceWriteError(err, 'disconnect')).toContain('已有待消费的断连请求')
  })

  it('keeps the backend message for other conflicts', () => {
    const err = new ApiError(409, 'conflict', 'device is disabled')
    expect(deviceWriteError(err)).toBe('device is disabled')
  })

  it('translates permission failures', () => {
    expect(deviceWriteError(new ApiError(403, 'forbidden', 'forbidden'))).toBe(
      '当前角色没有该操作的权限',
    )
  })

  it('translates missing devices and members', () => {
    expect(deviceWriteError(new ApiError(404, 'not_found', 'owner is not an active member'))).toBe(
      '设备或目标成员不存在（可能已被移除或停用）',
    )
  })

  it('falls back to the backend message, then a generic one', () => {
    expect(deviceWriteError(new ApiError(500, 'internal', 'database is locked'))).toBe(
      'database is locked',
    )
    expect(deviceWriteError(new ApiError(400, 'invalid_request', ''))).toBe('操作失败')
  })

  it('treats a non-API failure as a network problem', () => {
    expect(deviceWriteError(new TypeError('Failed to fetch'))).toBe('网络异常，请稍后重试')
  })

  it('localises the status-0 wrapper that hides a failed fetch', () => {
    expect(deviceWriteError(new ApiError(0, 'internal', 'TypeError: Failed to fetch'))).toBe(
      '网络异常，请稍后重试',
    )
  })
})
