import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import {
  accountSecurityError,
  MIN_PASSWORD_LENGTH,
  passwordLength,
  passwordRemoveWarning,
} from './account-security'

function api(status: number, code = 'error') {
  return new ApiError(status, code, 'backend message')
}

describe('account security copy', () => {
  it('maps credential failures per operation instead of echoing the backend', () => {
    expect(accountSecurityError(api(401), 'totp')).toBe('密码或动态码不正确')
    expect(accountSecurityError(api(401), 'password-remove')).toBe('当前密码或 Passkey 验证不正确')
    expect(accountSecurityError(api(401), 'stepup')).toBe('Passkey 验证未通过，请重新验证')
    expect(accountSecurityError(api(401), 'passkey-register')).toBe(
      '注册校验未通过，请重新开始注册',
    )
    expect(accountSecurityError(api(409), 'passkey-delete')).toBe(
      '无本地密码且这是最后一个 Passkey，不能删除',
    )
    expect(accountSecurityError(api(409), 'stepup')).toBe('账户没有可用的 Passkey，无法完成验证')
    expect(accountSecurityError(api(409), 'password-set')).toBe('账户已有本地密码，请刷新后重试')
  })

  it('treats a missing deployment capability as 503, not a validation error', () => {
    expect(accountSecurityError(api(503), 'passkey')).toBe('该能力未在部署中启用')
    expect(accountSecurityError(api(503), 'stepup')).toBe('该能力未在部署中启用')
  })

  it('handles network and unknown errors', () => {
    expect(accountSecurityError(api(0), 'totp')).toBe('网络异常，请稍后重试')
    expect(accountSecurityError(new Error('boom'), 'totp')).toBe('网络异常，请稍后重试')
    expect(accountSecurityError(api(429), 'totp')).toBe('操作过于频繁，请稍后再试')
    expect(accountSecurityError(api(500), 'totp')).toBe('服务异常，请稍后重试')
  })

  it('translates known password-removal warning codes and keeps unknown ones', () => {
    expect(passwordRemoveWarning('compat_login_disabled')).toContain('compat')
    expect(passwordRemoveWarning('keep_a_second_passkey')).toContain('Passkey')
    expect(passwordRemoveWarning('future_code')).toBe('future_code')
  })

  it('counts password length in code points', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8)
    expect(passwordLength('密码密码密码密码')).toBe(8)
    expect(passwordLength('1234567')).toBe(7)
  })
})
