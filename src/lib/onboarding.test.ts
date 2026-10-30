import { describe, expect, it, vi } from 'vitest'

import { ApiError } from './api'
import {
  acceptInvitationError,
  clearTokenParam,
  INVITATION_CAPTCHA_NOTICE,
  isRetryableVerifyError,
  resendVerificationError,
  verifyEmailError,
} from './onboarding'

function api(status: number, code = 'error') {
  return new ApiError(status, code, 'backend English message')
}

describe('clearTokenParam', () => {
  it('removes the token with replace and keeps unrelated params', () => {
    const setParams = vi.fn()
    clearTokenParam(new URLSearchParams('token=secret&from=mail'), setParams)
    expect(setParams).toHaveBeenCalledWith(new URLSearchParams('from=mail'), { replace: true })
  })

  it('does nothing when there is no token', () => {
    const setParams = vi.fn()
    clearTokenParam(new URLSearchParams('from=mail'), setParams)
    expect(setParams).not.toHaveBeenCalled()
  })
})

describe('verifyEmailError', () => {
  it('maps invalid, used, rate-limited and server failures', () => {
    expect(verifyEmailError(api(400))).toContain('链接不完整或无效')
    expect(verifyEmailError(api(409))).toContain('已过期或已使用')
    expect(verifyEmailError(api(429))).toContain('频繁')
    expect(verifyEmailError(api(500))).toContain('服务异常')
  })

  it('treats non-ApiError rejections as network failures', () => {
    expect(verifyEmailError(new TypeError('failed to fetch'))).toContain('网络')
    expect(verifyEmailError(api(500))).not.toContain('backend English')
  })

  it('only retries transport, throttling and server failures', () => {
    expect(isRetryableVerifyError(new TypeError('failed to fetch'))).toBe(true)
    expect(isRetryableVerifyError(api(429))).toBe(true)
    expect(isRetryableVerifyError(api(500))).toBe(true)
    expect(isRetryableVerifyError(api(400))).toBe(false)
    expect(isRetryableVerifyError(api(409))).toBe(false)
  })
})

describe('resendVerificationError', () => {
  it('maps invalid addresses, throttling and unknown failures', () => {
    expect(resendVerificationError(api(400))).toContain('邮箱格式')
    expect(resendVerificationError(api(429))).toContain('频繁')
    expect(resendVerificationError(api(500))).toContain('发送失败')
    expect(resendVerificationError(new TypeError('failed to fetch'))).toContain('发送失败')
  })
})

describe('acceptInvitationError', () => {
  it('maps credential and dead-invitation answers', () => {
    const unauthorized = acceptInvitationError(api(401))
    expect(unauthorized).toContain('密码不正确')
    expect(unauthorized).toContain('Passkey')
    expect(acceptInvitationError(api(409))).toContain('无效、已过期或已被使用')
    expect(acceptInvitationError(api(429))).toContain('频繁')
  })

  it('separates captcha limits from malformed payloads', () => {
    expect(acceptInvitationError(api(400, 'captcha_required'))).toBe(INVITATION_CAPTCHA_NOTICE)
    expect(acceptInvitationError(api(400, 'captcha_invalid'))).toBe(INVITATION_CAPTCHA_NOTICE)
    expect(acceptInvitationError(api(503, 'captcha_unavailable'))).toContain('验证码服务')
    expect(acceptInvitationError(api(400))).toContain('不符合要求')
    expect(acceptInvitationError(api(503))).toContain('服务暂时不可用')
    expect(acceptInvitationError(api(500))).toContain('服务异常')
    expect(acceptInvitationError(new TypeError('failed to fetch'))).toContain('网络')
  })

  it('never returns the backend English message', () => {
    for (const status of [400, 401, 409, 429, 500]) {
      expect(acceptInvitationError(api(status))).not.toContain('backend English')
    }
  })
})
