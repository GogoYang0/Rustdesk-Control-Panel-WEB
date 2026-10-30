import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import { captchaChallengeError, captchaProviderLabel, captchaSubmitMessage } from './captcha'

function api(status: number, code = 'error') {
  return new ApiError(status, code, 'backend English message')
}

describe('captchaChallengeError', () => {
  it('maps throttling, outages and transport failures', () => {
    expect(captchaChallengeError(api(429))).toContain('频繁')
    expect(captchaChallengeError(api(503))).toContain('验证码服务不可用')
    expect(captchaChallengeError(api(500))).toContain('服务异常')
    expect(captchaChallengeError(new TypeError('failed to fetch'))).toContain('网络')
    expect(captchaChallengeError(api(500))).not.toContain('backend English')
  })
})

describe('captchaSubmitMessage', () => {
  it('overrides expired proofs and provider outages only', () => {
    expect(captchaSubmitMessage(api(400, 'captcha_required'))).toContain('重新完成验证')
    expect(captchaSubmitMessage(api(400, 'captcha_invalid'))).toContain('重新完成验证')
    expect(captchaSubmitMessage(api(503, 'captcha_unavailable'))).toContain('验证码服务不可用')
    expect(captchaSubmitMessage(api(503, 'internal'))).toBeNull()
    expect(captchaSubmitMessage(api(401, 'unauthorized'))).toBeNull()
    expect(captchaSubmitMessage(new TypeError('failed to fetch'))).toBeNull()
  })
})

describe('captchaProviderLabel', () => {
  it('labels known providers without echoing a missing value', () => {
    expect(captchaProviderLabel('altcha')).toBe('Altcha')
    expect(captchaProviderLabel('geetest')).toBe('GeeTest')
    expect(captchaProviderLabel('cap')).toBe('Cap')
    expect(captchaProviderLabel('other')).toContain('未知提供商')
    expect(captchaProviderLabel(undefined)).toBe('验证码')
  })
})
