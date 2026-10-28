import type {
  AlertPage,
  Device,
  DeviceCreateRequest,
  DeviceDisconnect,
  DevicePage,
  DeviceUpdateRequest,
  Member,
  Me,
  Role,
  SessionDetail as SessionDetailPayload,
  SessionPage,
} from '../api/generated'
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

// ── sessions ────────────────────────────────────────────────────────────────
// Shapes come from the generated contract client: hand-written copies drift,
// and they promote optional fields (the API omits unset ones instead of sending
// null — that already broke the native-session actor once).

export type {
  Alert,
  AlertPage,
  Session,
  SessionDetail,
  SessionEvent,
  SessionPage,
} from '../api/generated'

export function fetchSessions(orgId: number, query: URLSearchParams): Promise<SessionPage> {
  return apiFetch<SessionPage>(`/api/v1/orgs/${orgId}/sessions?${query.toString()}`)
}

export function fetchSession(orgId: number, sessionId: number): Promise<SessionDetailPayload> {
  return apiFetch<SessionDetailPayload>(`/api/v1/orgs/${orgId}/sessions/${sessionId}`)
}

/** Alerts caused by one session; requires the contract's `sessionId` filter. */
export function fetchSessionAlerts(orgId: number, sessionId: number): Promise<AlertPage> {
  return apiFetch<AlertPage>(`/api/v1/orgs/${orgId}/alerts?sessionId=${sessionId}&pageSize=200`)
}

/** One page of devices, used as a name dictionary for the session list. */
export function fetchDevices(orgId: number, pageSize = 200): Promise<DevicePage> {
  return apiFetch<DevicePage>(`/api/v1/orgs/${orgId}/devices?page=1&pageSize=${pageSize}`)
}

// ── device management ───────────────────────────────────────────────────────

export type { Device, DeviceDisconnect, DevicePage, DeviceUpdateRequest } from '../api/generated'

export function fetchDevicePage(orgId: number, query: URLSearchParams): Promise<DevicePage> {
  return apiFetch<DevicePage>(`/api/v1/orgs/${orgId}/devices?${query.toString()}`)
}

export function registerDevice(orgId: number, input: DeviceCreateRequest): Promise<Device> {
  return apiFetch<Device>(`/api/v1/orgs/${orgId}/devices`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateDevice(
  orgId: number,
  deviceId: number,
  patch: DeviceUpdateRequest,
): Promise<Device> {
  return apiFetch<Device>(`/api/v1/orgs/${orgId}/devices/${deviceId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

/** Clears the binding and bumps the generation; `reason` is kept in the audit. */
export function rebindDevice(orgId: number, deviceId: number, reason: string): Promise<Device> {
  return apiFetch<Device>(`/api/v1/orgs/${orgId}/devices/${deviceId}/rebind`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

/** Records a request the client consumes on its next heartbeat — not an
 * immediate disconnect. */
export function requestDeviceDisconnect(
  orgId: number,
  deviceId: number,
  reason: string,
): Promise<DeviceDisconnect> {
  return apiFetch<DeviceDisconnect>(`/api/v1/orgs/${orgId}/devices/${deviceId}/disconnect`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}
