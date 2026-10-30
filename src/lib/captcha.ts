import { ApiError } from './api'

export function captchaChallengeError(err: unknown): string {
  if (!(err instanceof ApiError)) return '验证码加载失败，请检查网络后重试。'
  if (err.status === 429) return '验证码请求过于频繁，请稍后再试。'
  if (err.status === 503 || err.code === 'captcha_unavailable') {
    return '验证码服务不可用，请稍后再试。'
  }
  if (err.status >= 500) return '服务异常，请稍后重试。'
  if (err.status === 400) return '验证码请求无效，请重试。'
  return '验证码加载失败，请稍后重试。'
}

/** Overrides the generic auth copy for captcha failures; null means untouched. */
export function captchaSubmitMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null
  if (err.code === 'captcha_required' || err.code === 'captcha_invalid') {
    return '验证码已失效，请重新完成验证。'
  }
  // 503 is also LDAP's "directory unavailable"; only the captcha code belongs here.
  if (err.code === 'captcha_unavailable') {
    return '验证码服务不可用，请稍后再试。'
  }
  return null
}

/** Providers the console can actually render; 17c-2 adds geetest/cap. */
export function captchaProviderSupported(provider: string): boolean {
  return provider === 'altcha'
}

export function captchaProviderLabel(provider: string | undefined): string {
  switch (provider) {
    case 'altcha':
      return 'Altcha'
    case 'geetest':
      return 'GeeTest'
    case 'cap':
      return 'Cap'
    default:
      return provider ? `未知提供商（${provider}）` : '验证码'
  }
}
