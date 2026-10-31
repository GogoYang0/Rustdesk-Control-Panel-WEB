import type { SetURLSearchParams } from 'react-router'

import { ApiError } from './api'

/** Removes a one-shot token from the address bar without leaving a history entry. */
export function clearTokenParam(params: URLSearchParams, setParams: SetURLSearchParams): void {
  if (!params.has('token')) return
  const next = new URLSearchParams(params)
  next.delete('token')
  setParams(next, { replace: true })
}

export const RESEND_VERIFICATION_NOTICE =
  '如果该邮箱尚未验证，验证邮件已发送。请查收（包括垃圾邮件）。'

// apiFetch does not wrap fetch rejections: an offline browser throws TypeError,
// so every helper treats a non-ApiError as a network failure.
export function verifyEmailError(err: unknown): string {
  if (!(err instanceof ApiError)) return '网络异常，请稍后重试'
  if (err.status === 400) return '验证链接不完整或无效，请重新打开邮件中的链接。'
  if (err.status === 409) {
    return '链接无效、已过期或已使用；如已完成验证可直接登录，否则请在登录页重发验证邮件。'
  }
  if (err.status === 429) return '请求过于频繁，请稍后再试。'
  if (err.status >= 500) return '服务异常，请稍后重试。'
  return '验证失败，请稍后重试。'
}

export function isRetryableVerifyError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true
  return err.status === 429 || err.status >= 500
}

export function resendVerificationError(err: unknown): string {
  if (!(err instanceof ApiError)) return '发送失败，请稍后重试。'
  if (err.status === 400) return '邮箱格式不正确，请检查后重试。'
  if (err.status === 429) return '发送过于频繁，请稍后再试。'
  return '发送失败，请稍后重试。'
}

export function acceptInvitationError(err: unknown): string {
  if (!(err instanceof ApiError)) return '网络异常，请稍后重试'
  if (err.code === 'captcha_unavailable') return '验证码服务不可用，请稍后再试。'
  if (err.status === 400) {
    if (err.code === 'captcha_required' || err.code === 'captcha_invalid') {
      return '验证码已失效，请重新完成验证。'
    }
    return '邀请链接或密码不符合要求，请检查后重试。'
  }
  if (err.status === 401) {
    return '密码不正确。如果该邮箱已有账号，请输入该账号当前的本地密码；仅使用 Passkey、没有本地密码的账号无法接受邀请，请联系管理员。'
  }
  if (err.status === 409) return '邀请无效、已过期或已被使用，请联系管理员重新邀请。'
  if (err.status === 429) return '尝试过于频繁或账号暂时锁定，请稍后再试。'
  if (err.status === 503) return '服务暂时不可用，请稍后再试。'
  if (err.status >= 500) return '服务异常，请稍后重试。'
  return '接受邀请失败，请稍后重试。'
}
