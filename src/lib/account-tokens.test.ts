import { describe, expect, it } from 'vitest'

import {
  activeTokenCount,
  DEFAULT_TOKEN_EXPIRY_DAYS,
  expiryDaysProblem,
  identityProviderLabel,
  MAX_ACTIVE_TOKENS,
  MAX_TOKEN_EXPIRY_DAYS,
  tokenNameProblem,
  tokenStatus,
  tokenStatusLabel,
  tokenStatusTone,
} from './account-tokens'

function token(overrides: Partial<{ revoked_at: string | null; expires_at: string }> = {}) {
  return {
    revoked_at: null,
    expires_at: '2099-11-30T00:00:00Z',
    ...overrides,
  }
}

describe('token status', () => {
  const now = new Date('2026-10-30T00:00:00Z').getTime()

  it('prefers revoked over expired and active', () => {
    expect(tokenStatus(token({ revoked_at: '2026-10-29T00:00:00Z' }), now)).toBe('revoked')
    expect(tokenStatus(token({ expires_at: '2026-10-01T00:00:00Z' }), now)).toBe('expired')
    expect(tokenStatus(token(), now)).toBe('active')
  })

  it('labels and tones every state', () => {
    expect(tokenStatusLabel('active')).toBe('活跃')
    expect(tokenStatusLabel('revoked')).toBe('已撤销')
    expect(tokenStatusLabel('expired')).toBe('已过期')
    expect(tokenStatusTone('active')).toBe('green')
    expect(tokenStatusTone('revoked')).toBe('grey')
    expect(tokenStatusTone('expired')).toBe('orange')
  })

  it('counts only tokens that are active right now', () => {
    expect(MAX_ACTIVE_TOKENS).toBe(20)
    expect(
      activeTokenCount([
        token(),
        token({ revoked_at: '2026-10-29T00:00:00Z' }),
        token({ expires_at: '2020-01-01T00:00:00Z' }),
      ]),
    ).toBe(1)
  })
})

describe('token form validation', () => {
  it('trims names and bounds them to 128 characters', () => {
    expect(tokenNameProblem('  ')).toBe('请输入令牌名称')
    expect(tokenNameProblem('  CI  ')).toBeNull()
    expect(tokenNameProblem('a'.repeat(128))).toBeNull()
    expect(tokenNameProblem('a'.repeat(129))).toContain('128')
    expect(tokenNameProblem('😀'.repeat(128))).toBeNull()
    expect(tokenNameProblem('😀'.repeat(129))).toContain('128')
  })

  it('accepts whole days between 1 and 365', () => {
    expect(DEFAULT_TOKEN_EXPIRY_DAYS).toBe(90)
    expect(MAX_TOKEN_EXPIRY_DAYS).toBe(365)
    expect(expiryDaysProblem('90')).toBeNull()
    expect(expiryDaysProblem('1')).toBeNull()
    expect(expiryDaysProblem('365')).toBeNull()
    expect(expiryDaysProblem('0')).toContain('1–365')
    expect(expiryDaysProblem('366')).toContain('1–365')
    expect(expiryDaysProblem('1.5')).toBe('天数必须是整数')
    expect(expiryDaysProblem('')).toBe('请输入有效天数')
  })

  it('labels identity providers without leaking unknown values', () => {
    expect(identityProviderLabel('oidc')).toBe('OIDC')
    expect(identityProviderLabel('ldap')).toBe('LDAP')
    expect(identityProviderLabel('')).toBe('外部身份')
    expect(identityProviderLabel('saml')).toBe('saml')
  })
})
