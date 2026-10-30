import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import {
  ldapLoginError,
  oidcCallbackError,
  oidcExchangeError,
  oidcStartError,
} from './login-errors'

function api(status: number, code = 'error') {
  return new ApiError(status, code, 'backend English message')
}

describe('OIDC callback errors', () => {
  it('maps the fixed callback codes without echoing raw text', () => {
    expect(oidcCallbackError('no_account')).toContain('没有对应的面板账号')
    expect(oidcCallbackError('identity_conflict')).toContain('重置绑定')
    expect(oidcCallbackError('email_unverified')).toContain('邮箱尚未验证')
    expect(oidcCallbackError('oidc_failed')).toContain('SSO 登录失败')
    expect(oidcCallbackError('unexpected_internal_code')).toBe('SSO 登录失败，请重试或联系管理员')
    expect(oidcCallbackError(null)).toBe('SSO 登录失败，请重试或联系管理员')
  })

  it('never returns the backend English message', () => {
    expect(oidcStartError(api(500))).not.toContain('backend English')
    expect(oidcExchangeError(api(500))).not.toContain('backend English')
    expect(ldapLoginError(api(500))).not.toContain('backend English')
  })
})

describe('OIDC start/exchange errors', () => {
  it('explains disabled SSO and rate limits', () => {
    expect(oidcStartError(api(503))).toContain('SSO 尚未启用')
    expect(oidcStartError(api(429))).toContain('频繁')
    expect(oidcStartError(api(0))).toContain('网络')
    expect(oidcStartError(new Error('boom'))).toContain('网络')
  })

  it('explains ticket rejection as a secure-context/same-origin problem', () => {
    expect(oidcExchangeError(api(401))).toContain('HTTPS')
    expect(oidcExchangeError(api(403, 'email_not_verified'))).toContain('邮箱尚未验证')
    expect(oidcExchangeError(api(503))).toContain('SSO 尚未启用')
  })
})

describe('LDAP errors', () => {
  it('maps credential, account, conflict and directory failures', () => {
    expect(ldapLoginError(api(400))).toContain('用户名和密码')
    expect(ldapLoginError(api(400, 'captcha_required'))).toContain('交互式验证码')
    expect(ldapLoginError(api(401))).toContain('用户名或密码不正确')
    expect(ldapLoginError(api(403))).toContain('面板账号')
    expect(ldapLoginError(api(403, 'email_not_verified'))).toContain('邮箱尚未验证')
    expect(ldapLoginError(api(409))).toContain('重置绑定')
    expect(ldapLoginError(api(429))).toContain('频繁')
    expect(ldapLoginError(api(503))).toContain('目录服务')
    expect(ldapLoginError(api(503, 'captcha_unavailable'))).toContain('验证码服务')
    expect(ldapLoginError(api(500))).toContain('服务异常')
  })
})
