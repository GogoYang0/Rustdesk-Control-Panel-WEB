import type {
  AddressBook,
  AddressBookCreateRequest,
  AddressBookGrant,
  AddressBookGrantRequest,
  AddressBookPeer,
  AddressBookPeersReplaceRequest,
  AddressBookRecycleBinItem,
  AddressBookTag,
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
  ControlRole,
  ControlRoleCreateRequest,
  ControlRoleUpdateRequest,
  ConnectionLogPage,
  FileLogPage,
  LogEvent,
  UserGroup,
  UserGroupDeleteData,
  UserGroupMemberMutation,
  Approval,
  ApprovalCreateRequest,
  ApprovalDecisionRequest,
  ApprovalPage,
  IssuedTicket,
  Ticket,
  TicketCreateRequest,
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
  Org,
  Invitation,
  Policy,
  PolicyRequest,
  Role,
  SessionDetail as SessionDetailPayload,
  SessionPage,
  Strategy,
  StrategyCreateRequest,
  StrategyUpdateRequest,
  Passkey,
  PasskeyCeremony,
  PasskeyList,
  TotpSetup,
  TotpRecoveryCodes,
  PasswordRemoveResult,
  StepupToken,
  ApiToken,
  IssuedApiToken,
  TokenCreateRequest,
  IdentityList,
  IdentityUnlinkRequest,
  AuthProviders,
  CaptchaChallenge,
  CaptchaProof,
  ProvisioningStatus,
  AuditRetention,
  OidcStartRequest,
  OidcStart,
  OidcExchangeRequest,
  LdapLoginRequest,
  Permission,
  RoleCreateRequest,
  RoleUpdateRequest,
} from '../api/generated'
import {
  accessTokenExpiresSoon,
  getAccessToken,
  getRefreshToken,
  logout,
  refreshAccessToken,
  type TokenPair,
} from './session'

export type { Member, Me, Org, Permission, Role, RoleCreateRequest, RoleUpdateRequest }
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
  /**
   * Credential checks answer 401 for a wrong code/password, so they cannot
   * refresh-and-replay. Refresh before sending when the access token is about
   * to lapse instead, keeping a stale token from masquerading as a bad code.
   */
  refreshIfExpired?: boolean
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
  const { retryOn401 = true, refreshIfExpired = false, ...init } = options
  if (refreshIfExpired && getRefreshToken() && accessTokenExpiresSoon()) {
    const refreshed = await refreshAccessToken()
    if (!refreshed.access) {
      if (refreshed.invalid) {
        logout()
        throw new ApiError(401, 'unauthorized', '登录已失效，请重新登录')
      }
      throw new ApiError(0, 'internal', '会话刷新失败，请稍后重试')
    }
  }
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

export type { CaptchaChallenge, CaptchaProof }

export function login(email: string, password: string, captcha?: CaptchaProof): Promise<TokenPair> {
  return apiFetch<TokenPair>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, captcha }),
    retryOn401: false,
  })
}

/** Second login step for accounts with TOTP enabled. */
export function verifyTwoFactor(
  challengeToken: string,
  code: string,
  captcha?: CaptchaProof,
): Promise<TokenPair> {
  return apiFetch<TokenPair>('/api/v1/auth/2fa/verify', {
    method: 'POST',
    body: JSON.stringify({ challenge_token: challengeToken, code, captcha }),
    retryOn401: false,
  })
}

export function fetchProviders(): Promise<AuthProviders> {
  return apiFetch<AuthProviders>('/api/v1/auth/providers')
}

export function fetchCaptchaChallenge(): Promise<CaptchaChallenge> {
  return apiFetch<CaptchaChallenge>('/api/v1/auth/captcha', {
    retryOn401: false,
    // A stalled proxy must not leave the form stuck in `loading` (submit is
    // blocked and there is no retry until the request settles).
    signal: AbortSignal.timeout(10_000),
    // The page may still carry an OIDC ticket or invitation token when this
    // runs; a default Referer would copy it into proxy/API access logs.
    referrerPolicy: 'no-referrer',
  })
}

export function startOidcLogin(input: OidcStartRequest): Promise<OidcStart> {
  return apiFetch<OidcStart>('/api/v1/auth/oidc/start', {
    method: 'POST',
    body: JSON.stringify(input),
    retryOn401: false,
  })
}

export function exchangeOidcLogin(input: OidcExchangeRequest): Promise<TokenPair> {
  return apiFetch<TokenPair>('/api/v1/auth/oidc/exchange', {
    method: 'POST',
    body: JSON.stringify(input),
    retryOn401: false,
  })
}

export function ldapLogin(input: LdapLoginRequest): Promise<TokenPair> {
  return apiFetch<TokenPair>('/api/v1/auth/ldap/login', {
    method: 'POST',
    body: JSON.stringify(input),
    retryOn401: false,
  })
}

// Public onboarding endpoints. 401 is a credential/ticket answer, never an
// expired session, so none of them may refresh and replay the request.
export async function verifyEmail(token: string): Promise<void> {
  await apiFetch<unknown>('/api/v1/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
    retryOn401: false,
    // The token may still be in the address bar when this fires; a same-origin
    // Referer would copy it into proxy/API access logs.
    referrerPolicy: 'no-referrer',
  })
}

export async function resendVerification(email: string): Promise<void> {
  await apiFetch<unknown>('/api/v1/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
    retryOn401: false,
  })
}

export function acceptInvitation(
  token: string,
  password: string,
  captcha?: CaptchaProof,
): Promise<Member> {
  return apiFetch<Member>('/api/v1/invitations/accept', {
    method: 'POST',
    body: JSON.stringify({ token, password, captcha }),
    retryOn401: false,
    referrerPolicy: 'no-referrer',
  })
}

export function fetchMe(): Promise<Me> {
  return apiFetch<Me>('/api/v1/me')
}

/** Creates an organization; the caller becomes its owner. Names may repeat. */
export function createOrg(name: string): Promise<Org> {
  return apiFetch<Org>('/api/v1/orgs', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

/** Renames an organization. Only an owner holds the required org.admin. */
export function renameOrg(orgId: number, name: string): Promise<Org> {
  return apiFetch<Org>(`/api/v1/orgs/${orgId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

// ── account security ───────────────────────────────────────────────────────

export type {
  ApiToken,
  Invitation,
  IssuedApiToken,
  TokenCreateRequest,
  OidcStartRequest,
  OidcStart,
  OidcExchangeRequest,
  LdapLoginRequest,
  Identity,
  IdentityList,
  IdentityUnlinkRequest,
  AuthProviders,
  ProvisioningStatus,
  AuditRetention,
  Passkey,
  PasskeyCeremony,
  PasskeyList,
  TotpSetup,
  TotpRecoveryCodes,
} from '../api/generated'

export interface PasskeyCredentialPayload {
  id: string
  rawId: string
  type: string
  clientExtensionResults?: Record<string, unknown>
  response: Record<string, unknown>
}

export function setupTotp(): Promise<TotpSetup> {
  return apiFetch<TotpSetup>('/api/v1/auth/2fa/setup', { method: 'POST' })
}

export async function enableTotp(code: string): Promise<void> {
  await apiFetch<unknown>('/api/v1/auth/2fa/enable', {
    method: 'POST',
    body: JSON.stringify({ code }),
    retryOn401: false,
    refreshIfExpired: true,
  })
}

export async function disableTotp(password: string, code: string): Promise<void> {
  await apiFetch<unknown>('/api/v1/auth/2fa/disable', {
    method: 'POST',
    body: JSON.stringify({ password, code }),
    retryOn401: false,
    refreshIfExpired: true,
  })
}

export function regenerateRecoveryCodes(
  password: string,
  code: string,
): Promise<TotpRecoveryCodes> {
  return apiFetch<TotpRecoveryCodes>('/api/v1/auth/2fa/recovery-codes', {
    method: 'POST',
    body: JSON.stringify({ password, code }),
    retryOn401: false,
    refreshIfExpired: true,
  })
}

export function listPasskeys(): Promise<PasskeyList> {
  return apiFetch<PasskeyList>('/api/v1/auth/passkeys')
}

export function beginPasskeyRegistration(): Promise<PasskeyCeremony> {
  return apiFetch<PasskeyCeremony>('/api/v1/auth/passkey/register/begin', { method: 'POST' })
}

export function finishPasskeyRegistration(input: {
  ceremony_token: string
  credential: PasskeyCredentialPayload
  name?: string
}): Promise<Passkey> {
  return apiFetch<Passkey>('/api/v1/auth/passkey/register/finish', {
    method: 'POST',
    body: JSON.stringify(input),
    retryOn401: false,
    refreshIfExpired: true,
  })
}

export function renamePasskey(passkeyId: number, name: string): Promise<Passkey> {
  return apiFetch<Passkey>(`/api/v1/auth/passkeys/${passkeyId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

export async function deletePasskey(passkeyId: number): Promise<void> {
  await apiFetch<unknown>(`/api/v1/auth/passkeys/${passkeyId}`, {
    method: 'DELETE',
  })
}

export function beginPasskeyStepup(): Promise<PasskeyCeremony> {
  return apiFetch<PasskeyCeremony>('/api/v1/auth/passkey/stepup/begin', { method: 'POST' })
}

export function finishPasskeyStepup(input: {
  ceremony_token: string
  credential: PasskeyCredentialPayload
}): Promise<StepupToken> {
  return apiFetch<StepupToken>('/api/v1/auth/passkey/stepup/finish', {
    method: 'POST',
    body: JSON.stringify(input),
    retryOn401: false,
    refreshIfExpired: true,
  })
}

export function removePassword(
  password: string,
  stepupToken: string,
): Promise<PasswordRemoveResult> {
  return apiFetch<PasswordRemoveResult>('/api/v1/auth/password/remove', {
    method: 'POST',
    body: JSON.stringify({ password, stepup_token: stepupToken }),
    retryOn401: false,
    refreshIfExpired: true,
  })
}

export async function setPassword(newPassword: string, stepupToken: string): Promise<void> {
  await apiFetch<unknown>('/api/v1/auth/password/set', {
    method: 'POST',
    body: JSON.stringify({ new_password: newPassword, stepup_token: stepupToken }),
    retryOn401: false,
    refreshIfExpired: true,
  })
}

// ── personal tokens & external identities ─────────────────────────────────

export function fetchTokens(organizationId: number): Promise<ApiToken[]> {
  return apiFetch<ApiToken[]>(`/api/v1/auth/tokens?organizationId=${organizationId}`)
}

export function createToken(input: TokenCreateRequest): Promise<IssuedApiToken> {
  return apiFetch<IssuedApiToken>('/api/v1/auth/tokens', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function revokeToken(tokenId: number): Promise<void> {
  await apiFetch<unknown>(`/api/v1/auth/tokens/${tokenId}`, { method: 'DELETE' })
}

export function fetchIdentities(): Promise<IdentityList> {
  return apiFetch<IdentityList>('/api/v1/auth/identity')
}

export async function unlinkIdentity(input: IdentityUnlinkRequest): Promise<void> {
  await apiFetch<unknown>('/api/v1/auth/identity/unlink', {
    method: 'POST',
    body: JSON.stringify(input),
    retryOn401: false,
    refreshIfExpired: true,
  })
}

export function beginPasskeyLogin(input: {
  challenge_token?: string
  email?: string
}): Promise<PasskeyCeremony> {
  return apiFetch<PasskeyCeremony>('/api/v1/auth/passkey/login/begin', {
    method: 'POST',
    body: JSON.stringify(input),
    retryOn401: false,
  })
}

export function finishPasskeyLogin(input: {
  ceremony_token: string
  credential: PasskeyCredentialPayload
}): Promise<TokenPair> {
  return apiFetch<TokenPair>('/api/v1/auth/passkey/login/finish', {
    method: 'POST',
    body: JSON.stringify(input),
    retryOn401: false,
  })
}

// ── system settings ─────────────────────────────────────────────────────────

export function fetchProvisioning(orgId: number): Promise<ProvisioningStatus> {
  return apiFetch<ProvisioningStatus>(`/api/v1/orgs/${orgId}/provisioning`)
}

export function updateProvisioning(orgId: number, enabled: boolean): Promise<ProvisioningStatus> {
  return apiFetch<ProvisioningStatus>(`/api/v1/orgs/${orgId}/provisioning`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
}

export function fetchAuditRetention(orgId: number): Promise<AuditRetention> {
  return apiFetch<AuditRetention>(`/api/v1/orgs/${orgId}/audit-retention`)
}

export function updateAuditRetention(orgId: number, days: number): Promise<AuditRetention> {
  return apiFetch<AuditRetention>(`/api/v1/orgs/${orgId}/audit-retention`, {
    method: 'PUT',
    body: JSON.stringify({ days }),
  })
}

// ── organization ────────────────────────────────────────────────────────────

export interface MemberMutation {
  revoked_sessions?: number
}

export function fetchMembers(orgId: number): Promise<Member[]> {
  return apiFetch<Member[]>(`/api/v1/orgs/${orgId}/members`)
}

export function fetchRoles(orgId: number): Promise<Role[]> {
  return apiFetch<Role[]>(`/api/v1/orgs/${orgId}/roles`)
}

export function fetchPermissions(): Promise<Permission[]> {
  return apiFetch<Permission[]>('/api/v1/permissions')
}

export function createRole(orgId: number, input: RoleCreateRequest): Promise<Role> {
  return apiFetch<Role>(`/api/v1/orgs/${orgId}/roles`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateRole(orgId: number, roleId: number, input: RoleUpdateRequest): Promise<Role> {
  return apiFetch<Role>(`/api/v1/orgs/${orgId}/roles/${roleId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function deleteRole(orgId: number, roleId: number): Promise<void> {
  await apiFetch<unknown>(`/api/v1/orgs/${orgId}/roles/${roleId}`, { method: 'DELETE' })
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

/** Pending invitations only; the API never returns the token or its hash. */
export function fetchInvitations(orgId: number): Promise<Invitation[]> {
  return apiFetch<Invitation[]>(`/api/v1/orgs/${orgId}/invitations`)
}

export async function revokeInvitation(orgId: number, invitationId: number): Promise<void> {
  await apiFetch<unknown>(`/api/v1/orgs/${orgId}/invitations/${invitationId}`, {
    method: 'DELETE',
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

export async function resetMemberTotp(orgId: number, userId: number): Promise<void> {
  await apiFetch<unknown>(`/api/v1/orgs/${orgId}/members/${userId}/2fa/reset`, {
    method: 'POST',
  })
}

export async function resetMemberPasskeys(orgId: number, userId: number): Promise<void> {
  await apiFetch<unknown>(`/api/v1/orgs/${orgId}/members/${userId}/passkeys/reset`, {
    method: 'POST',
  })
}

export async function resetMemberIdentity(orgId: number, userId: number): Promise<void> {
  await apiFetch<unknown>(`/api/v1/orgs/${orgId}/members/${userId}/identity/reset`, {
    method: 'POST',
  })
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
  Strategy,
  StrategyCreateRequest,
  StrategyUpdateRequest,
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
  AddressBookRecycleBinItem,
  AddressBookTag,
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

/** Requires write access. The server returns all recycled rows, newest first. */
export function fetchAddressBookRecycleBin(
  orgId: number,
  bookId: number,
): Promise<AddressBookRecycleBinItem[]> {
  return apiFetch<AddressBookRecycleBinItem[]>(
    `/api/v1/orgs/${orgId}/address-books/${bookId}/recycle-bin`,
  )
}

/** Requires write access; capacity exhaustion is a 400. */
export async function restoreAddressBookPeer(
  orgId: number,
  bookId: number,
  peerId: string,
): Promise<void> {
  await apiFetch<unknown>(
    `/api/v1/orgs/${orgId}/address-books/${bookId}/recycle-bin/${encodeURIComponent(peerId)}/restore`,
    { method: 'POST' },
  )
}

/** Requires full access; irreversible and does not bump the book revision. */
export async function purgeAddressBookPeer(
  orgId: number,
  bookId: number,
  peerId: string,
): Promise<void> {
  await apiFetch<unknown>(
    `/api/v1/orgs/${orgId}/address-books/${bookId}/recycle-bin/${encodeURIComponent(peerId)}`,
    { method: 'DELETE' },
  )
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

/** Replaces the whole palette; peer tag strings are not cascaded by the server. */
export function replaceAddressBookTags(
  orgId: number,
  bookId: number,
  tags: AddressBookTag[],
): Promise<AddressBook> {
  return apiFetch<AddressBook>(`/api/v1/orgs/${orgId}/address-books/${bookId}/tags`, {
    method: 'PUT',
    body: JSON.stringify({ tags }),
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
  ApprovalCreateRequest,
  ApprovalDecision,
  ApprovalDecisionRequest,
  ApprovalKind,
  ApprovalPage,
  ApprovalStatus,
} from '../api/generated'

export type { IssuedTicket, Ticket, TicketCreateRequest } from '../api/generated'

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
  ControlPermissionState,
  ControlPermissionStates,
  ControlRole,
  ControlRoleCreateRequest,
  ControlRoleUpdateRequest,
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

// ── control roles ───────────────────────────────────────────────────────────

// ── client strategies ───────────────────────────────────────────────────────

export function fetchStrategies(orgId: number): Promise<Strategy[]> {
  return apiFetch<Strategy[]>(`/api/v1/orgs/${orgId}/strategies`)
}

export function createStrategy(orgId: number, request: StrategyCreateRequest): Promise<Strategy> {
  return apiFetch<Strategy>(`/api/v1/orgs/${orgId}/strategies`, {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function updateStrategy(
  orgId: number,
  strategyId: number,
  request: StrategyUpdateRequest,
): Promise<Strategy> {
  return apiFetch<Strategy>(`/api/v1/orgs/${orgId}/strategies/${strategyId}`, {
    method: 'PATCH',
    body: JSON.stringify(request),
  })
}

export async function deleteStrategy(orgId: number, strategyId: number): Promise<void> {
  await apiFetch<unknown>(`/api/v1/orgs/${orgId}/strategies/${strategyId}`, {
    method: 'DELETE',
  })
}

async function putStrategyAssignment(path: string, strategyId: number | null): Promise<void> {
  await apiFetch<unknown>(path, {
    method: 'PUT',
    body: JSON.stringify({ strategy_id: strategyId }),
  })
}

export function assignMemberStrategy(
  orgId: number,
  userId: number,
  strategyId: number | null,
): Promise<void> {
  return putStrategyAssignment(`/api/v1/orgs/${orgId}/members/${userId}/strategy`, strategyId)
}

export function assignDeviceGroupStrategy(
  orgId: number,
  groupId: number,
  strategyId: number | null,
): Promise<void> {
  return putStrategyAssignment(
    `/api/v1/orgs/${orgId}/device-groups/${groupId}/strategy`,
    strategyId,
  )
}

export function assignDeviceStrategy(
  orgId: number,
  deviceId: number,
  strategyId: number | null,
): Promise<void> {
  return putStrategyAssignment(`/api/v1/orgs/${orgId}/devices/${deviceId}/strategy`, strategyId)
}

export function fetchControlRoles(orgId: number): Promise<ControlRole[]> {
  return apiFetch<ControlRole[]>(`/api/v1/orgs/${orgId}/control-roles`)
}

export function createControlRole(
  orgId: number,
  request: ControlRoleCreateRequest,
): Promise<ControlRole> {
  return apiFetch<ControlRole>(`/api/v1/orgs/${orgId}/control-roles`, {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function updateControlRole(
  orgId: number,
  roleId: number,
  request: ControlRoleUpdateRequest,
): Promise<ControlRole> {
  return apiFetch<ControlRole>(`/api/v1/orgs/${orgId}/control-roles/${roleId}`, {
    method: 'PATCH',
    body: JSON.stringify(request),
  })
}

export async function deleteControlRole(orgId: number, roleId: number): Promise<void> {
  await apiFetch<unknown>(`/api/v1/orgs/${orgId}/control-roles/${roleId}`, {
    method: 'DELETE',
  })
}

export async function assignMemberControlRole(
  orgId: number,
  userId: number,
  controlRoleId: number | null,
): Promise<void> {
  await apiFetch<unknown>(`/api/v1/orgs/${orgId}/members/${userId}/control-role`, {
    method: 'PUT',
    body: JSON.stringify({ control_role_id: controlRoleId }),
  })
}

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

/** Creates or reuses a pending request; both answer 200/201 with the row. */
export function createApproval(orgId: number, request: ApprovalCreateRequest): Promise<Approval> {
  return apiFetch<Approval>(`/api/v1/orgs/${orgId}/approvals`, {
    method: 'POST',
    body: JSON.stringify(request),
  })
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

// ── connection tickets ──────────────────────────────────────────────────────

/**
 * Issues a one-shot ticket. The plaintext token exists only in this response:
 * no cache may keep it, and callers must not hand it to RTK Query.
 */
export function issueTicket(orgId: number, request: TicketCreateRequest): Promise<IssuedTicket> {
  return apiFetch<IssuedTicket>(`/api/v1/orgs/${orgId}/tickets`, {
    method: 'POST',
    body: JSON.stringify(request),
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  })
}

/** Bookkeeping view; the server never returns the token here. */
export function fetchTicket(orgId: number, ticketId: number): Promise<Ticket> {
  return apiFetch<Ticket>(`/api/v1/orgs/${orgId}/tickets/${ticketId}`)
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
