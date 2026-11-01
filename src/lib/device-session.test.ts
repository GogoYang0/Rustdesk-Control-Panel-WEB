import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import { deleteDeviceError, endSessionError, endSessionToast } from './device-session'

describe('deleteDeviceError', () => {
  it('maps open-session conflicts and permissions', () => {
    expect(deleteDeviceError(new ApiError(409, 'conflict', 'open'))).toContain('进行中的会话')
    expect(deleteDeviceError(new ApiError(403, 'forbidden', 'no'))).toContain('权限')
    expect(deleteDeviceError(new ApiError(404, 'not_found', 'gone'))).toContain('不存在')
    expect(deleteDeviceError(new TypeError('network'))).toContain('网络异常')
    expect(deleteDeviceError(new ApiError(418, 'teapot', 'english'))).not.toContain('english')
  })
})

describe('endSessionError', () => {
  it('maps stale sessions and permissions', () => {
    expect(endSessionError(new ApiError(409, 'conflict', 'closed'))).toContain('已结束')
    expect(endSessionError(new ApiError(403, 'forbidden', 'no'))).toContain('断连权限')
    expect(endSessionError(new ApiError(404, 'not_found', 'gone'))).toContain('不存在')
    expect(endSessionError(new ApiError(503, 'internal', 'down'))).toContain('服务异常')
  })
})

describe('endSessionToast', () => {
  it('does not claim a disconnect was queued when it was not', () => {
    expect(endSessionToast(true)).toContain('请求设备断连')
    expect(endSessionToast(false)).toContain('未排队')
  })
})
