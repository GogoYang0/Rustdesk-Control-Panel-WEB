import type {
  AddressBook,
  AddressBookCreateRequest,
  AddressBookGrant,
  AddressBookGrantRequest,
  AddressBookPeer,
  AddressBookPeersReplaceRequest,
  AddressBookUpdateRequest,
  AccessRule,
  AccessRuleCreateRequest,
  AlertPage,
  AuditLogPage,
  ClientBuildCapabilities,
  ClientBuildCreateRequest,
  ClientBuildDetail,
  ClientBuildPage,
  ClientBuildProfile,
  ClientBuildProfileCreateRequest,
  ClientBuildProfilePage,
  ClientBuildProfileUpdateRequest,
  ConnectionLogPage,
  FileLogPage,
  LogEvent,
  UserGroup,
  UserGroupDeleteData,
  UserGroupMemberMutation,
  Approval,
  ApprovalDecisionRequest,
  ApprovalPage,
  Device,
  DeviceCreateRequest,
  DeviceDisconnect,
  DeviceGroup,
  DeviceGroupDeleteData,
  DeviceGroupMemberMutation,
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

  let text: string
  try {
    text = await res.text()
  } catch {
    throw new ApiError(0, 'internal', '网络异常')
  }
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

export interface BlobDownload {
  status: number
  blob: Blob
  filename: string
  contentType: string
  notModified: boolean
}

/**
 * Fetches a binary response through the same refresh contract. Error bodies
 * are still JSON envelopes, so a failed binary request never becomes a file.
 */
export async function apiBlob(
  path: string,
  options: { cache?: RequestCache } = {},
): Promise<BlobDownload> {
  let res: Response
  try {
    res = await authorizedFetch(path, { retryOn401: true, cache: options.cache })
  } catch {
    throw new ApiError(0, 'internal', '网络异常')
  }

  let blob: Blob
  try {
    blob = await res.blob()
  } catch {
    throw new ApiError(0, 'internal', '网络异常')
  }

  if (res.status === 304) {
    return { status: 304, blob, filename: '', contentType: '', notModified: true }
  }
  if (!res.ok) {
    let body: Envelope<unknown> = {}
    const text = await blob.text().catch(() => '')
    if (text) {
      try {
        body = JSON.parse(text) as Envelope<unknown>
      } catch {
        // Proxy error pages are not envelopes; keep them opaque.
      }
    }
    throw new ApiError(
      res.status,
      body.code ?? 'internal',
      body.message ?? res.statusText,
      body.data,
    )
  }

  return {
    status: res.status,
    blob,
    filename: csvFilename(res.headers.get('Content-Disposition') ?? ''),
    contentType: res.headers.get('Content-Type') ?? '',
    notModified: false,
  }
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

export interface AllDevices {
  items: Device[]
  total: number
  truncated: boolean
}

/**
 * Loads every device for a full replacement picker. The API caps one page at
 * 200; stop at 2000 so an enormous organization cannot make the dialog fetch
 * unbounded pages. Callers must disable destructive saves when truncated.
 */
export async function fetchAllDevices(orgId: number): Promise<AllDevices> {
  const items: Device[] = []
  let total = 0
  let page = 1
  while (items.length < 2000) {
    const data = await fetchDevicePage(
      orgId,
      new URLSearchParams({ page: String(page), pageSize: '200' }),
    )
    total = data.total
    items.push(...data.items)
    if (data.items.length === 0 || items.length >= total) break
    page += 1
  }
  return { items: items.slice(0, 2000), total, truncated: total > 2000 }
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

export type { DeviceGroup, UserGroupDeleteData, UserGroupMemberMutation } from '../api/generated'
export type { DeviceGroupDeleteData, DeviceGroupMemberMutation } from '../api/generated'

export function createUserGroup(orgId: number, name: string): Promise<UserGroup> {
  return apiFetch<UserGroup>(`/api/v1/orgs/${orgId}/user-groups`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export function renameUserGroup(orgId: number, groupId: number, name: string): Promise<UserGroup> {
  return apiFetch<UserGroup>(`/api/v1/orgs/${orgId}/user-groups/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

export function deleteUserGroup(orgId: number, groupId: number): Promise<UserGroupDeleteData> {
  return apiFetch<UserGroupDeleteData>(`/api/v1/orgs/${orgId}/user-groups/${groupId}`, {
    method: 'DELETE',
  })
}

export function replaceUserGroupMembers(
  orgId: number,
  groupId: number,
  userIds: number[],
): Promise<UserGroupMemberMutation> {
  return apiFetch<UserGroupMemberMutation>(`/api/v1/orgs/${orgId}/user-groups/${groupId}/members`, {
    method: 'PUT',
    body: JSON.stringify({ user_ids: userIds }),
  })
}

export type { AccessRule, AccessRuleCreateRequest, AccessRuleTargetKind } from '../api/generated'

export function fetchAccessRules(orgId: number): Promise<AccessRule[]> {
  return apiFetch<AccessRule[]>(`/api/v1/orgs/${orgId}/access-rules`)
}

export function createAccessRule(
  orgId: number,
  request: AccessRuleCreateRequest,
): Promise<AccessRule> {
  return apiFetch<AccessRule>(`/api/v1/orgs/${orgId}/access-rules`, {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export async function deleteAccessRule(orgId: number, ruleId: number): Promise<void> {
  await apiFetch<unknown>(`/api/v1/orgs/${orgId}/access-rules/${ruleId}`, {
    method: 'DELETE',
  })
}

export function fetchDeviceGroups(orgId: number): Promise<DeviceGroup[]> {
  return apiFetch<DeviceGroup[]>(`/api/v1/orgs/${orgId}/device-groups`)
}

export function createDeviceGroup(orgId: number, name: string): Promise<DeviceGroup> {
  return apiFetch<DeviceGroup>(`/api/v1/orgs/${orgId}/device-groups`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export function renameDeviceGroup(
  orgId: number,
  groupId: number,
  name: string,
): Promise<DeviceGroup> {
  return apiFetch<DeviceGroup>(`/api/v1/orgs/${orgId}/device-groups/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

export function deleteDeviceGroup(orgId: number, groupId: number): Promise<DeviceGroupDeleteData> {
  return apiFetch<DeviceGroupDeleteData>(`/api/v1/orgs/${orgId}/device-groups/${groupId}`, {
    method: 'DELETE',
  })
}

export function replaceDeviceGroupDevices(
  orgId: number,
  groupId: number,
  deviceIds: number[],
): Promise<DeviceGroupMemberMutation> {
  return apiFetch<DeviceGroupMemberMutation>(
    `/api/v1/orgs/${orgId}/device-groups/${groupId}/devices`,
    { method: 'PUT', body: JSON.stringify({ device_ids: deviceIds }) },
  )
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
  LogEvent,
} from '../api/generated'

// ── custom client builds ────────────────────────────────────────────────────

export type {
  ClientBuildArtifact,
  ClientBuildCapabilities,
  ClientBuildCreateRequest,
  ClientBuildDefaults,
  ClientBuildDetail,
  ClientBuildLimits,
  ClientBuildManifest,
  ClientBuildManifestLogo,
  ClientBuildPage,
  ClientBuildProfile,
  ClientBuildProfileCreateRequest,
  ClientBuildProfilePage,
  ClientBuildProfileUpdateRequest,
  ClientBuildSummary,
} from '../api/generated'

export function fetchClientBuildCapabilities(orgId: number): Promise<ClientBuildCapabilities> {
  return apiFetch<ClientBuildCapabilities>(`/api/v1/orgs/${orgId}/client-build/capabilities`)
}

export function fetchClientBuildProfiles(
  orgId: number,
  page = 1,
  pageSize = 200,
): Promise<ClientBuildProfilePage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  return apiFetch<ClientBuildProfilePage>(
    `/api/v1/orgs/${orgId}/client-build-profiles?${query.toString()}`,
  )
}

export function createClientBuildProfile(
  orgId: number,
  request: ClientBuildProfileCreateRequest,
): Promise<ClientBuildProfile> {
  return apiFetch<ClientBuildProfile>(`/api/v1/orgs/${orgId}/client-build-profiles`, {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function updateClientBuildProfile(
  orgId: number,
  profileId: number,
  request: ClientBuildProfileUpdateRequest,
): Promise<ClientBuildProfile> {
  return apiFetch<ClientBuildProfile>(`/api/v1/orgs/${orgId}/client-build-profiles/${profileId}`, {
    method: 'PATCH',
    body: JSON.stringify(request),
  })
}

export async function deleteClientBuildProfile(orgId: number, profileId: number): Promise<void> {
  await apiFetch<unknown>(`/api/v1/orgs/${orgId}/client-build-profiles/${profileId}`, {
    method: 'DELETE',
  })
}

export function putClientBuildProfileLogo(
  orgId: number,
  profileId: number,
  pngBase64: string,
): Promise<ClientBuildProfile> {
  return apiFetch<ClientBuildProfile>(
    `/api/v1/orgs/${orgId}/client-build-profiles/${profileId}/logo`,
    { method: 'PUT', body: JSON.stringify({ png_base64: pngBase64 }) },
  )
}

export async function deleteClientBuildProfileLogo(
  orgId: number,
  profileId: number,
): Promise<void> {
  await apiFetch<unknown>(`/api/v1/orgs/${orgId}/client-build-profiles/${profileId}/logo`, {
    method: 'DELETE',
  })
}

/** Logo bytes need the Bearer token, so an `<img src>` cannot load them. */
export async function fetchClientBuildProfileLogo(
  orgId: number,
  profileId: number,
  sha?: string,
): Promise<Blob | null> {
  const version = sha ? `?v=${encodeURIComponent(sha)}` : ''
  const download = await apiBlob(
    `/api/v1/orgs/${orgId}/client-build-profiles/${profileId}/logo${version}`,
    { cache: 'no-store' },
  )
  if (download.notModified) return null
  if (!download.contentType.toLowerCase().includes('image/png')) {
    throw new ApiError(download.status, 'internal', '响应不是 PNG')
  }
  return download.blob
}

export function fetchClientBuildPage(
  orgId: number,
  query: URLSearchParams,
): Promise<ClientBuildPage> {
  return apiFetch<ClientBuildPage>(`/api/v1/orgs/${orgId}/client-builds?${query.toString()}`)
}

export function fetchClientBuild(orgId: number, buildId: number): Promise<ClientBuildDetail> {
  return apiFetch<ClientBuildDetail>(`/api/v1/orgs/${orgId}/client-builds/${buildId}`)
}

export function createClientBuild(
  orgId: number,
  request: ClientBuildCreateRequest,
): Promise<ClientBuildDetail> {
  return apiFetch<ClientBuildDetail>(`/api/v1/orgs/${orgId}/client-builds`, {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function cancelClientBuild(orgId: number, buildId: number): Promise<ClientBuildDetail> {
  return apiFetch<ClientBuildDetail>(`/api/v1/orgs/${orgId}/client-builds/${buildId}/cancel`, {
    method: 'POST',
  })
}

/** Artifact bytes with the same refresh/error contract as other downloads. */
export async function fetchClientBuildArtifact(
  orgId: number,
  buildId: number,
  artifactId: number,
  fallbackName: string,
): Promise<{ blob: Blob; filename: string }> {
  const download = await apiBlob(
    `/api/v1/orgs/${orgId}/client-builds/${buildId}/artifacts/${artifactId}`,
  )
  if (download.notModified) throw new ApiError(304, 'internal', '产物响应异常')
  const type = download.contentType.toLowerCase()
  if (!download.filename && !type.includes('application/octet-stream')) {
    throw new ApiError(download.status, 'internal', '响应不是构建产物')
  }
  const fallback = fallbackName.replace(/[\\/:*?"<>|\r\n]/g, '_').trim()
  return { blob: download.blob, filename: download.filename || fallback }
}

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

/** Parsed hbbs/hbbr events; scoped by the role's audit_scope server-side. */
export function fetchLogEvents(orgId: number, query: URLSearchParams): Promise<LogEvent[]> {
  return apiFetch<LogEvent[]>(`/api/v1/orgs/${orgId}/log-events?${query.toString()}`)
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
