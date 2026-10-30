import type { ApiToken } from './api'

export const MAX_ACTIVE_TOKENS = 20
export const MAX_TOKEN_NAME_LENGTH = 128
export const DEFAULT_TOKEN_EXPIRY_DAYS = 90
export const MAX_TOKEN_EXPIRY_DAYS = 365

export type TokenStatus = 'active' | 'revoked' | 'expired'

export function tokenStatus(
  token: Pick<ApiToken, 'revoked_at' | 'expires_at'>,
  now = Date.now(),
): TokenStatus {
  if (token.revoked_at) return 'revoked'
  const expires = new Date(token.expires_at).getTime()
  if (!Number.isNaN(expires) && expires <= now) return 'expired'
  return 'active'
}

export function tokenStatusLabel(status: TokenStatus): string {
  if (status === 'revoked') return '已撤销'
  if (status === 'expired') return '已过期'
  return '活跃'
}

export function tokenStatusTone(status: TokenStatus): string {
  if (status === 'revoked') return 'grey'
  if (status === 'expired') return 'orange'
  return 'green'
}

export function activeTokenCount(tokens: Pick<ApiToken, 'revoked_at' | 'expires_at'>[]): number {
  const now = Date.now()
  return tokens.filter((token) => tokenStatus(token, now) === 'active').length
}

export function tokenNameProblem(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return '请输入令牌名称'
  if ([...trimmed].length > MAX_TOKEN_NAME_LENGTH) {
    return `名称最多 ${MAX_TOKEN_NAME_LENGTH} 个字符`
  }
  return null
}

export function expiryDaysProblem(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return '请输入有效天数'
  if (!/^\d+$/.test(trimmed)) return '天数必须是整数'
  const days = Number(trimmed)
  if (days < 1 || days > MAX_TOKEN_EXPIRY_DAYS) {
    return `天数必须在 1–${MAX_TOKEN_EXPIRY_DAYS} 之间`
  }
  return null
}

export function identityProviderLabel(provider: string): string {
  if (provider === 'oidc') return 'OIDC'
  if (provider === 'ldap') return 'LDAP'
  return provider || '外部身份'
}
