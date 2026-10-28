import type { Member, Me, Role } from '../api/generated'
import { getAccessToken, logout, refreshAccessToken, type TokenPair } from './session'

export type { Member, Me, Role }
export type RoleKind = Role['kind']
export type MeUser = Me['user']
export type MeOrg = Me['orgs'][number]

/** Envelope from the panel: `{code, message, data}`. */
interface Envelope<T> {
  code?: string
  message?: string
  data?: T
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  /** `data` of a failed envelope, e.g. the 2FA challenge on a 403 login. */
  readonly detail: unknown

  constructor(status: number, code: string, message: string, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}

interface RequestOptions extends RequestInit {
  /** Login and refresh must not attempt a token refresh themselves. */
  retryOn401?: boolean
}

async function once<T>(path: string, options: RequestOptions): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(path, { ...options, headers })
  const text = await res.text()
  let body: Envelope<T> = {}
  if (text) {
    try {
      body = JSON.parse(text) as Envelope<T>
    } catch {
      throw new ApiError(res.status, 'internal', '响应不是合法的 JSON')
    }
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body.code ?? 'internal',
      body.message ?? res.statusText,
      body.data,
    )
  }
  return body.data as T
}

/** Calls the panel API through the same-origin proxy, refreshing once on 401. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { retryOn401 = true, ...init } = options
  try {
    return await once<T>(path, init)
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401 || !retryOn401) throw err
    const refreshed = await refreshAccessToken()
    if (refreshed.access) return once<T>(path, init)
    if (refreshed.invalid) {
      // The server rejected the refresh token: the session is really over, so
      // clear the cache and route to /login. Network and 5xx failures keep the
      // session and surface as an ordinary error instead.
      logout()
    }
    throw err
  }
}

// ── auth ────────────────────────────────────────────────────────────────────

export interface TwoFactorChallenge {
  challenge_token: string
  methods?: string[]
}

export interface CaptchaInfo {
  enabled: boolean
  provider?: string
}

export function login(email: string, password: string): Promise<TokenPair> {
  return apiFetch<TokenPair>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    retryOn401: false,
  })
}

/** Second login step for accounts with TOTP enabled. */
export function verifyTwoFactor(challengeToken: string, code: string): Promise<TokenPair> {
  return apiFetch<TokenPair>('/api/v1/auth/2fa/verify', {
    method: 'POST',
    body: JSON.stringify({ challenge_token: challengeToken, code }),
    retryOn401: false,
  })
}

export function fetchProviders(): Promise<{
  oidc: { enabled: boolean; name?: string }
  ldap: { enabled: boolean }
}> {
  return apiFetch('/api/v1/auth/providers')
}

export function fetchCaptcha(): Promise<CaptchaInfo> {
  return apiFetch('/api/v1/auth/captcha')
}

export function fetchMe(): Promise<Me> {
  return apiFetch<Me>('/api/v1/me')
}

// ── organization ────────────────────────────────────────────────────────────

export interface Invitation {
  id: number
  email: string
  role: string
  expires_at: string
}

export interface MemberMutation {
  revoked_sessions?: number
}

export function fetchMembers(orgId: number): Promise<Member[]> {
  return apiFetch<Member[]>(`/api/v1/orgs/${orgId}/members`)
}

export function fetchRoles(orgId: number): Promise<Role[]> {
  return apiFetch<Role[]>(`/api/v1/orgs/${orgId}/roles`)
}

export function inviteMember(
  orgId: number,
  email: string,
  role: 'admin' | 'member',
): Promise<Invitation> {
  return apiFetch<Invitation>(`/api/v1/orgs/${orgId}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  })
}

export function updateMember(
  orgId: number,
  userId: number,
  patch: { role_id?: number; disabled?: boolean },
): Promise<MemberMutation> {
  return apiFetch<MemberMutation>(`/api/v1/orgs/${orgId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function removeMember(orgId: number, userId: number): Promise<MemberMutation> {
  return apiFetch<MemberMutation>(`/api/v1/orgs/${orgId}/members/${userId}`, { method: 'DELETE' })
}
