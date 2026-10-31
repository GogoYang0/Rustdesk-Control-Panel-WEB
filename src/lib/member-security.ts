import { ApiError } from './api'

export type MemberSecurityAction = 'totp' | 'passkey' | 'identity' | 'password'

export const MEMBER_SECURITY_ACTIONS: {
  action: MemberSecurityAction
  label: string
  description: string
  confirm: string
  button: string
}[] = [
  {
    action: 'totp',
    label: '重置两步验证',
    description: '删除该成员的 TOTP 与恢复码；之后登录不再要求动态码。',
    confirm: '该成员的两步验证配置与恢复码会被删除，且不可撤销。',
    button: '重置两步验证',
  },
  {
    action: 'passkey',
    label: '重置 Passkey',
    description: '删除该成员的全部 Passkey；没有本地密码时服务端会拒绝。',
    confirm: '该成员的所有 Passkey 会被删除，且不可撤销；请确认其仍能通过其他方式登录。',
    button: '删除全部 Passkey',
  },
  {
    action: 'identity',
    label: '解绑外部身份',
    description: '删除该成员的 OIDC/LDAP 绑定；没有本地凭据时服务端会拒绝。',
    confirm: '该成员的外部身份绑定会被删除，且不可撤销；请确认其仍能通过本地凭据登录。',
    button: '解绑外部身份',
  },
  {
    action: 'password',
    label: '重置本地密码',
    description: '向该成员邮箱发送一次性重置链接；1 小时内有效，旧链接立即失效。',
    confirm:
      '将向该成员邮箱发送密码重置链接。成员设置新密码后，其全部登录会话会被撤销；管理员不会看到新密码。',
    button: '发送重置邮件',
  },
]

export function memberSecurityError(err: unknown, action: MemberSecurityAction): string {
  if (!(err instanceof ApiError)) return '网络异常，请稍后重试'
  if (err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 401) return '登录已失效，请重新登录'
  if (err.status === 403) {
    return '没有权限，或该成员属于其他组织/目标为 owner；需线下处理'
  }
  if (err.status === 404) return '成员不存在或已离开组织，请刷新后重试'
  if (err.status === 429) return '操作过于频繁，请稍后再试'
  if (err.status === 503) {
    return action === 'passkey' ? '该部署未启用 Passkey' : '服务暂时不可用，请稍后再试'
  }
  if (err.status >= 500) return '服务异常，请稍后重试'
  if (err.status === 409) {
    if (action === 'passkey') return '该成员没有本地密码，重置 Passkey 会导致无法登录'
    if (action === 'identity') {
      return '该成员没有本地凭据且仍有可用绑定，解绑会导致无法登录'
    }
    if (action === 'password') return '该成员没有本地密码、已停用，或不能重置自己'
    return '两步验证状态已变化，请刷新后重试'
  }
  return '操作失败，请稍后重试'
}
