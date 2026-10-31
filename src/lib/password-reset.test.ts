import { afterEach, describe, expect, it } from 'vitest'

import { ApiError } from './api'
import {
  passwordResetError,
  passwordResetProblem,
  passwordResetRequestError,
  readHashToken,
} from './password-reset'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('readHashToken', () => {
  it('reads the token once and clears the fragment', () => {
    window.history.replaceState(null, '', '/reset-password#token=abcdefghijklmnop')
    expect(readHashToken()).toBe('abcdefghijklmnop')
    expect(window.location.hash).toBe('')
    expect(readHashToken()).toBe('')
  })

  it('returns an empty string without a token', () => {
    window.history.replaceState(null, '', '/reset-password')
    expect(readHashToken()).toBe('')
  })
})

describe('passwordResetProblem', () => {
  it('enforces length and confirmation by code point', () => {
    expect(passwordResetProblem('short', 'short')).toContain('至少')
    expect(passwordResetProblem('维'.repeat(129), '维'.repeat(129))).toContain('最多')
    expect(passwordResetProblem('password123', 'password124')).toContain('不一致')
    expect(passwordResetProblem('password123', 'password123')).toBeNull()
  })
})

describe('passwordResetError', () => {
  it('maps invalid links and validation failures', () => {
    expect(passwordResetError(new ApiError(400, 'invalid_request', 'bad'))).toContain('不合法')
    expect(passwordResetError(new ApiError(409, 'conflict', 'used'))).toContain('无效')
    expect(passwordResetError(new ApiError(503, 'internal', 'boom'))).toContain('服务异常')
    expect(passwordResetError(new TypeError('Failed to fetch'))).toContain('网络异常')
  })
})

describe('passwordResetRequestError', () => {
  it('maps member guards and cooldown', () => {
    expect(passwordResetRequestError(new ApiError(403, 'forbidden', 'no'))).toContain('权限')
    expect(passwordResetRequestError(new ApiError(404, 'not_found', 'gone'))).toContain('不存在')
    expect(passwordResetRequestError(new ApiError(409, 'conflict', 'nopass'))).toContain(
      '没有本地密码',
    )
    expect(passwordResetRequestError(new ApiError(429, 'rate_limited', 'slow'))).toContain('频繁')
    expect(passwordResetRequestError(new ApiError(418, 'teapot', 'english'))).not.toContain(
      'english',
    )
  })
})
