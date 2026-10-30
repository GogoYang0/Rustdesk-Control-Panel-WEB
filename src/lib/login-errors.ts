import { ApiError } from './api'

const NETWORK = '网络异常，请稍后重试'
const SERVICE = '服务异常，请稍后重试'

function apiError(err: unknown): ApiError | null {
  return err instanceof ApiError ? err : null
}

export function oidcCallbackError(code: string | null): string {
  switch (code) {
    case 'no_account':
      return '该 SSO 邮箱没有对应的面板账号，请联系管理员'
    case 'identity_conflict':
      return '该外部身份已绑定其他账号，请联系管理员重置绑定'
    case 'email_unverified':
      return '邮箱尚未验证，请先完成邮件验证'
    case 'oidc_failed':
      return 'SSO 登录失败，请重试或联系管理员'
    default:
      return 'SSO 登录失败，请重试或联系管理员'
  }
}

export function oidcStartError(err: unknown): string {
  const e = apiError(err)
  if (!e) return NETWORK
  if (e.status === 0) return NETWORK
  if (e.status === 400) return 'SSO 请求不合法，请刷新后重试'
  if (e.status === 429) return '尝试过于频繁，请稍后再试'
  if (e.status === 503) return 'SSO 尚未启用或身份提供方不可用，请联系管理员'
  if (e.status >= 500) return SERVICE
  return '无法发起 SSO 登录，请稍后重试'
}

export function oidcExchangeError(err: unknown): string {
  const e = apiError(err)
  if (!e) return NETWORK
  if (e.status === 0) return NETWORK
  if (e.status === 401) {
    return 'SSO 回调已失效或未通过浏览器校验（需要 HTTPS 与同源），请重新登录'
  }
  if (e.status === 403 && e.code === 'email_not_verified') {
    return '邮箱尚未验证，请先完成邮件验证'
  }
  if (e.status === 429) return '尝试过于频繁，请稍后再试'
  if (e.status === 503) return 'SSO 尚未启用或身份提供方不可用，请联系管理员'
  if (e.status >= 500) return SERVICE
  return 'SSO 登录失败，请重新登录'
}

export function ldapLoginError(err: unknown): string {
  const e = apiError(err)
  if (!e) return NETWORK
  if (e.status === 0) return NETWORK
  if (e.status === 400) {
    if (e.code === 'captcha_required' || e.code === 'captcha_invalid') {
      return '需要完成交互式验证码'
    }
    return '请输入目录用户名和密码'
  }
  if (e.status === 401) return '目录用户名或密码不正确'
  if (e.status === 403) {
    return e.code === 'email_not_verified'
      ? '邮箱尚未验证，请先完成邮件验证'
      : '该目录账号没有对应的面板账号，或目录条目缺少邮箱，请联系管理员'
  }
  if (e.status === 409) {
    return '目录身份与面板账号冲突，或目录邮箱已变化；请联系管理员重置绑定'
  }
  if (e.status === 429) return '尝试过于频繁，请稍后再试'
  if (e.status === 503) {
    return e.code === 'captcha_unavailable'
      ? '验证码服务暂时不可用，请稍后再试'
      : '目录服务暂时不可用，请稍后重试'
  }
  if (e.status >= 500) return SERVICE
  return '目录登录失败，请稍后重试'
}
