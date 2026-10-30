import { ApiError } from './api'

export type CredentialContext =
  | 'totp'
  | 'passkey'
  | 'passkey-register'
  | 'passkey-delete'
  | 'stepup'
  | 'password-set'
  | 'password-remove'
  | 'token-create'
  | 'token-revoke'
  | 'token-list'
  | 'identity'
  | 'identity-list'

export const MIN_PASSWORD_LENGTH = 8

export function passwordLength(value: string): number {
  return [...value].length
}

// The server answers 401 for every credential check, so the copy has to name
// both factors instead of guessing which one failed.
export function accountSecurityError(err: unknown, context: CredentialContext): string {
  if (!(err instanceof ApiError)) return '网络异常，请稍后重试'
  if (err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 401) {
    if (context === 'totp') return '密码或动态码不正确'
    if (context === 'password-remove') return '当前密码或 Passkey 验证不正确'
    if (context === 'password-set' || context === 'stepup') {
      return 'Passkey 验证未通过，请重新验证'
    }
    if (context === 'passkey-register') return '注册校验未通过，请重新开始注册'
    if (context === 'identity') return '密码或 Passkey 验证不正确'
    if (context === 'passkey' || context === 'passkey-delete') {
      return '登录状态已失效，请重新登录'
    }
    if (context === 'token-create' || context === 'token-revoke' || context === 'token-list') {
      return '登录状态已失效，请重新登录'
    }
    if (context === 'identity-list') return '登录状态已失效，请重新登录'
    return '认证失败，请重试'
  }
  if (err.status === 400) {
    if (context === 'token-create') return '名称、有效期或权限不合法'
    if (context === 'identity') return '验证方式不可用或请求不合法，请刷新后重试'
    if (context === 'token-list' || context === 'identity-list') {
      return '请求不合法，请刷新后重试'
    }
    return '输入不合法，请检查后重试'
  }
  if (err.status === 403) {
    if (context === 'token-create') return '所选权限超出当前角色，请刷新后重试'
    if (context === 'identity-list') return '当前账户无权查看外部身份'
    return '当前账户无权执行该操作'
  }
  if (err.status === 404) {
    if (context === 'token-revoke') return '令牌不存在，请刷新后重试'
    if (context === 'identity') return '绑定不存在，请刷新后重试'
    return '凭据不存在，请刷新后重试'
  }
  if (err.status === 409) {
    if (context === 'totp') return '两步验证状态已变化，或账户没有本地密码'
    if (context === 'passkey-register') return '已达到 Passkey 数量上限，或该凭据已注册'
    if (context === 'passkey-delete') return '无本地密码且这是最后一个 Passkey，不能删除'
    if (context === 'stepup') return '账户没有可用的 Passkey，无法完成验证'
    if (context === 'password-set') return '账户已有本地密码，请刷新后重试'
    if (context === 'password-remove') {
      return '删除条件已变化：需至少 2 个 Passkey 且停用两步验证（待启用的 TOTP 配置也会阻止删除）'
    }
    if (context === 'token-create') {
      return '当前账户在该组织下的活跃令牌已达 20 个，请先撤销旧令牌'
    }
    if (context === 'identity') {
      return '该绑定是唯一登录通道，解绑会锁死账户；请先设置密码或添加 Passkey'
    }
    return '账户状态已变化，请刷新后重试'
  }
  if (err.status === 429) return '操作过于频繁，请稍后再试'
  if (err.status === 503) {
    if (context === 'identity' || context === 'identity-list') return '外部身份未启用'
    return '该能力未在部署中启用'
  }
  if (err.status >= 500) return '服务异常，请稍后重试'
  return '操作失败，请稍后重试'
}

const PASSWORD_REMOVE_WARNINGS: Record<string, string> = {
  compat_login_disabled: '原生客户端（compat 登录）将无法再用该账户的本地密码登录。',
  keep_a_second_passkey: '请妥善保管剩余的 Passkey；遗失全部 Passkey 将无法登录。',
  accept_invitation_requires_password: '接受新的组织邀请前需要先设置本地密码。',
}

export function passwordRemoveWarning(code: string): string {
  return PASSWORD_REMOVE_WARNINGS[code] ?? code
}
