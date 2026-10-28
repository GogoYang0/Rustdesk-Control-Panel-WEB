import { getAccessToken, refreshAccessToken, type TokenPair } from './session'

/** Envelope from the panel: `{code, message, data}`. */
interface Envelope<T> {
  code?: string
  message?: string
  data?: T
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
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
    throw new ApiError(res.status, body.code ?? 'internal', body.message ?? res.statusText)
  }
  return body.data as T
}

/** Calls the panel API through the same-origin proxy, refreshing once on 401. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { retryOn401 = true, ...init } = options
  try {
    return await once<T>(path, init)
  } catch (err) {
    if (retryOn401 && err instanceof ApiError && err.status === 401) {
      const next = await refreshAccessToken()
      if (next) return once<T>(path, init)
    }
    throw err
  }
}

// ── contract types (mirrors openapi.yaml 0.12.0) ─────────────────────────────

export type RoleKind = 'owner' | 'admin' | 'member' | 'custom'

export interface MeUser {
  id: number
  email: string
  email_verified: boolean
  totp_enabled: boolean
  has_password: boolean
}

export interface MeOrg {
  id: number
  name: string
  role_id: number
  role_kind: RoleKind
  permissions: string[]
}

export interface Me {
  user: MeUser
  orgs: MeOrg[]
}

export interface Member {
  id: number
  user_id: number
  email: string
  role: string
  role_id: number
  role_name: string
  role_kind?: RoleKind
  disabled: boolean
  created_at: string
}

export interface Role {
  id: number
  name: string
  kind: RoleKind
  permissions: string[]
  audit_scope: string
  builtin: boolean
  created_at: string
  updated_at: string
}

export interface Invitation {
  id: number
  email: string
  role: string
  expires_at: string
}

export interface MemberMutation {
  revoked_sessions?: number
}

export interface AuthProviders {
  oidc: { enabled: boolean; name?: string }
  ldap: { enabled: boolean }
}

export type LoginResult = TokenPair

export function login(email: string, password: string): Promise<LoginResult> {
  return apiFetch<LoginResult>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    retryOn401: false,
  })
}

export function fetchMe(): Promise<Me> {
  return apiFetch<Me>('/api/v1/me')
}

export function fetchProviders(): Promise<AuthProviders> {
  return apiFetch<AuthProviders>('/api/v1/auth/providers')
}

export function fetchMembers(orgId: number): Promise<Member[]> {
  return apiFetch<Member[]>(`/api/v1/orgs/${orgId}/members`)
}

export function fetchRoles(orgId: number): Promise<Role[]> {
  return apiFetch<Role[]>(`/api/v1/orgs/${orgId}/roles`)
}

export function inviteMember(orgId: number, email: string, role: 'admin' | 'member'): Promise<Invitation> {
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
