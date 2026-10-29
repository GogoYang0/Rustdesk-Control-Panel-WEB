import type {
  AddressBook,
  AddressBookCreateRequest,
  AddressBookGrant,
  AddressBookGrantRequest,
  AddressBookPeer,
  AddressBookPeersReplaceRequest,
  AddressBookUpdateRequest,
  AlertPage,
  AuditLogPage,
  ConnectionLogPage,
  FileLogPage,
  UserGroup,
  Approval,
  ApprovalDecisionRequest,
  ApprovalPage,
  Device,
  DeviceCreateRequest,
  DeviceDisconnect,
  DevicePage,
  DeviceUpdateRequest,
  Member,
  Me,
  Policy,
  PolicyRequest,
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

async function request(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(path, { ...init, headers })
}

/**
 * Sends the request with the refresh-on-401 contract. Login and refresh calls
 * opt out; network and 5xx failures keep the session and surface as errors.
 */
async function authorizedFetch(path: string, options: RequestOptions): Promise<Response> {
  const { retryOn401 = true, ...init } = options
  const res = await request(path, init)
  if (res.status !== 401 || !retryOn401) return res

  const refreshed = await refreshAccessToken()
  if (refreshed.access) return request(path, init)
  if (refreshed.invalid) logout()
  return res
}

async function once<T>(path: string, options: RequestOptions): Promise<T> {
  const res = await authorizedFetch(path, options)
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
export function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return once<T>(path, options)
}

export interface CsvDownload {
  filename: string
  text: string
}

/**
 * Downloads a CSV export through the same refresh contract. JSON error
 * envelopes become ApiError; a 200 that is neither CSV nor an attachment is
 * rejected so a proxy error page can never be saved as evidence.
 */
export async function fetchCsv(path: string): Promise<CsvDownload> {
  let res: Response
  try {
    res = await authorizedFetch(path, { retryOn401: true })
  } catch {
    throw new ApiError(0, 'internal', '网络异常')
  }

  const text = await res.text()
  if (!res.ok) {
    let body: Envelope<unknown> = {}
    if (text) {
      try {
        body = JSON.parse(text) as Envelope<unknown>
      } catch {
        // Proxy or gateway error pages are not envelopes; keep them opaque.
      }
    }
    throw new ApiError(
      res.status,
      body.code ?? 'internal',
      body.message ?? res.statusText,
      body.data,
    )
  }

  const disposition = res.headers.get('Content-Disposition') ?? ''
  const contentType = (res.headers.get('Content-Type') ?? '').toLowerCase()
  if (!disposition && !contentType.includes('text/csv')) {
    throw new ApiError(res.status, 'internal', '响应不是 CSV')
  }
  return { filename: csvFilename(disposition), text }
}

function csvFilename(disposition: string): string {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
  if (!match) return ''
  let name = match[1].trim()
  try {
    name = decodeURIComponent(name)
  } catch {
    // Keep the raw header if it is not valid percent-encoding.
  }
  return name.replace(/[\\/:*?"<>|\r\n]/g, '_').trim()
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

// ── address books ───────────────────────────────────────────────────────────

export type {
  AddressBook,
  AddressBookGrant,
  AddressBookGrantAccess,
  AddressBookGrantKind,
  AddressBookGrantRequest,
  AddressBookPeer,
  UserGroup,
} from '../api/generated'

export function fetchAddressBooks(orgId: number): Promise<AddressBook[]> {
  return apiFetch<AddressBook[]>(`/api/v1/orgs/${orgId}/address-books`)
}

export function fetchAddressBook(orgId: number, bookId: number): Promise<AddressBook> {
  return apiFetch<AddressBook>(`/api/v1/orgs/${orgId}/address-books/${bookId}`)
}

export function createAddressBook(
  orgId: number,
  input: AddressBookCreateRequest,
): Promise<AddressBook> {
  return apiFetch<AddressBook>(`/api/v1/orgs/${orgId}/address-books`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateAddressBook(
  orgId: number,
  bookId: number,
  input: AddressBookUpdateRequest,
): Promise<AddressBook> {
  return apiFetch<AddressBook>(`/api/v1/orgs/${orgId}/address-books/${bookId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function deleteAddressBook(orgId: number, bookId: number): Promise<void> {
  await apiFetch<unknown>(`/api/v1/orgs/${orgId}/address-books/${bookId}`, { method: 'DELETE' })
}

/** Replacement is whole-list: the array must contain every peer to keep. */
export function replaceAddressBookPeers(
  orgId: number,
  bookId: number,
  peers: AddressBookPeer[],
): Promise<AddressBook> {
  const body: AddressBookPeersReplaceRequest = { peers }
  return apiFetch<AddressBook>(`/api/v1/orgs/${orgId}/address-books/${bookId}/peers`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function fetchAddressBookGrants(orgId: number, bookId: number): Promise<AddressBookGrant[]> {
  return apiFetch<AddressBookGrant[]>(`/api/v1/orgs/${orgId}/address-books/${bookId}/grants`)
}

/** Re-posting the same subject updates its access level (upsert). */
export function createAddressBookGrant(
  orgId: number,
  bookId: number,
  request: AddressBookGrantRequest,
): Promise<AddressBookGrant> {
  return apiFetch<AddressBookGrant>(`/api/v1/orgs/${orgId}/address-books/${bookId}/grants`, {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export async function deleteAddressBookGrant(
  orgId: number,
  bookId: number,
  grantId: number,
): Promise<void> {
  await apiFetch<unknown>(`/api/v1/orgs/${orgId}/address-books/${bookId}/grants/${grantId}`, {
    method: 'DELETE',
  })
}

/** Requires `access.manage`; includes the built-in everyone group. */
export function fetchUserGroups(orgId: number): Promise<UserGroup[]> {
  return apiFetch<UserGroup[]>(`/api/v1/orgs/${orgId}/user-groups`)
}

export async function deleteAddressBookPeer(
  orgId: number,
  bookId: number,
  peerId: string,
): Promise<void> {
  await apiFetch<unknown>(
    `/api/v1/orgs/${orgId}/address-books/${bookId}/peers/${encodeURIComponent(peerId)}`,
    { method: 'DELETE' },
  )
}

// ── approvals ───────────────────────────────────────────────────────────────

export type {
  Approval,
  ApprovalDecision,
  ApprovalDecisionRequest,
  ApprovalKind,
  ApprovalPage,
  ApprovalStatus,
} from '../api/generated'

export type { AlertSeverity } from '../api/generated'

/** Alerts are records: the API has no detail, disposition or export endpoint. */
export function fetchAlertPage(orgId: number, query: URLSearchParams): Promise<AlertPage> {
  return apiFetch<AlertPage>(`/api/v1/orgs/${orgId}/alerts?${query.toString()}`)
}

// ── audit & client-reported logs ────────────────────────────────────────────

export type {
  AuditLog,
  AuditLogPage,
  ConnectionLog,
  ConnectionLogPage,
  FileLog,
  FileLogPage,
} from '../api/generated'

export function fetchAuditLogPage(orgId: number, query: URLSearchParams): Promise<AuditLogPage> {
  return apiFetch<AuditLogPage>(`/api/v1/orgs/${orgId}/audit-logs?${query.toString()}`)
}

export function fetchConnectionLogPage(
  orgId: number,
  query: URLSearchParams,
): Promise<ConnectionLogPage> {
  return apiFetch<ConnectionLogPage>(`/api/v1/orgs/${orgId}/connection-logs?${query.toString()}`)
}

export function fetchFileLogPage(orgId: number, query: URLSearchParams): Promise<FileLogPage> {
  return apiFetch<FileLogPage>(`/api/v1/orgs/${orgId}/file-logs?${query.toString()}`)
}

export function fetchApprovalPage(orgId: number, query: URLSearchParams): Promise<ApprovalPage> {
  return apiFetch<ApprovalPage>(`/api/v1/orgs/${orgId}/approvals?${query.toString()}`)
}

export function fetchApproval(orgId: number, approvalId: number): Promise<Approval> {
  return apiFetch<Approval>(`/api/v1/orgs/${orgId}/approvals/${approvalId}`)
}

export function submitApprovalDecision(
  orgId: number,
  approvalId: number,
  request: ApprovalDecisionRequest,
): Promise<Approval> {
  return apiFetch<Approval>(`/api/v1/orgs/${orgId}/approvals/${approvalId}/decision`, {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

// ── connection policies ─────────────────────────────────────────────────────

export type { Policy, PolicyRequest } from '../api/generated'

export function fetchPolicies(orgId: number): Promise<Policy[]> {
  return apiFetch<Policy[]>(`/api/v1/orgs/${orgId}/policies`)
}

export function createPolicy(orgId: number, input: PolicyRequest): Promise<Policy> {
  return apiFetch<Policy>(`/api/v1/orgs/${orgId}/policies`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** `PUT` replaces the whole policy: every field must be present. */
export function updatePolicy(
  orgId: number,
  policyId: number,
  input: PolicyRequest,
): Promise<Policy> {
  return apiFetch<Policy>(`/api/v1/orgs/${orgId}/policies/${policyId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function deletePolicy(orgId: number, policyId: number): Promise<void> {
  await apiFetch<unknown>(`/api/v1/orgs/${orgId}/policies/${policyId}`, { method: 'DELETE' })
}
