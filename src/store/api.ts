import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'

import {
  ApiError,
  assignMemberControlRole as assignMemberControlRoleRequest,
  assignMemberStrategy as assignMemberStrategyRequest,
  assignDeviceGroupStrategy as assignDeviceGroupStrategyRequest,
  assignDeviceStrategy as assignDeviceStrategyRequest,
  fetchDevicePage,
  fetchDevices,
  fetchMe,
  fetchMembers,
  fetchIdentities,
  fetchTokens,
  fetchProviders,
  fetchProvisioning,
  fetchAuditRetention,
  listPasskeys,
  fetchRoles,
  fetchPermissions,
  createRole,
  updateRole,
  deleteRole,
  resetMemberTotp,
  resetMemberPasskeys,
  resetMemberIdentity,
  fetchSession,
  fetchSessionAlerts,
  fetchSessions,
  createAccessRule,
  createAddressBook,
  createAddressBookGrant,
  createApproval,
  cancelClientBuild,
  createClientBuild,
  createClientBuildProfile,
  createControlRole,
  createStrategy,
  deleteStrategy,
  fetchStrategies,
  createDeviceGroup,
  createPolicy,
  createUserGroup,
  deleteAccessRule,
  deleteAddressBook,
  deleteAddressBookGrant,
  deleteAddressBookPeer,
  deleteClientBuildProfile,
  deleteClientBuildProfileLogo,
  deleteControlRole,
  deleteDeviceGroup,
  deletePolicy,
  deleteUserGroup,
  fetchAddressBook,
  fetchAddressBookGrants,
  fetchAccessRules,
  fetchAddressBooks,
  fetchAlertPage,
  fetchAllDevices,
  fetchClientBuild,
  fetchClientBuildCapabilities,
  fetchClientBuildPage,
  fetchClientBuildProfiles,
  fetchControlRoles,
  fetchDeviceGroups,
  fetchApproval,
  fetchApprovalPage,
  fetchTicket,
  fetchAuditLogPage,
  fetchConnectionLogPage,
  fetchFileLogPage,
  fetchLogEvents,
  fetchPolicies,
  fetchUserGroups,
  renameDeviceGroup,
  renameUserGroup,
  inviteMember,
  putClientBuildProfileLogo,
  rebindDevice,
  registerDevice,
  removeMember,
  replaceAddressBookPeers,
  replaceDeviceGroupDevices,
  replaceUserGroupMembers,
  requestDeviceDisconnect,
  submitApprovalDecision,
  updateAddressBook,
  updateClientBuildProfile,
  updateControlRole,
  updateStrategy,
  updateDevice,
  updateMember,
  updatePolicy,
  type AddressBook,
  type AddressBookGrant,
  type AddressBookGrantRequest,
  type AccessRule,
  type AccessRuleCreateRequest,
  type AddressBookPeer,
  type AllDevices,
  type DeviceGroup,
  type DeviceGroupDeleteData,
  type DeviceGroupMemberMutation,
  type UserGroup,
  type UserGroupDeleteData,
  type UserGroupMemberMutation,
  type AlertPage,
  type AuditLogPage,
  type ClientBuildCapabilities,
  type ClientBuildCreateRequest,
  type ClientBuildDetail,
  type ClientBuildPage,
  type ClientBuildProfile,
  type ClientBuildProfilePage,
  type ClientBuildProfileUpdateRequest,
  type ControlRole,
  type ControlPermissionStates,
  type ControlRoleUpdateRequest,
  type PasskeyList,
  type Permission,
  type RoleCreateRequest,
  type RoleUpdateRequest,
  type ApiToken,
  type IdentityList,
  type AuthProviders,
  type ProvisioningStatus,
  type AuditRetention,
  type Strategy,
  type StrategyCreateRequest,
  type StrategyUpdateRequest,
  type ConnectionLogPage,
  type FileLogPage,
  type LogEvent,
  type Approval,
  type ApprovalCreateRequest,
  type ApprovalDecisionRequest,
  type ApprovalPage,
  type Ticket,
  type Device,
  type DeviceDisconnect,
  type DevicePage,
  type DeviceUpdateRequest,
  type Policy,
  type PolicyRequest,
  type Invitation,
  type Me,
  type Member,
  type MemberMutation,
  type Role,
  type SessionDetail,
  type SessionPage,
} from '../lib/api'

async function wrap<T>(fn: () => Promise<T>): Promise<{ data: T } | { error: ApiError }> {
  try {
    return { data: await fn() }
  } catch (err) {
    return { error: err instanceof ApiError ? err : new ApiError(0, 'internal', String(err)) }
  }
}

/**
 * All panel reads go through one cache. Tags are keyed per organization so a
 * switch cannot serve the previous organization's rows (design D5).
 *
 * fakeBaseQuery keeps the typing honest: every endpoint states exactly what it
 * calls, instead of a loosely typed fetch layer.
 */
export const panelApi = createApi({
  reducerPath: 'panelApi',
  baseQuery: fakeBaseQuery<ApiError>(),
  tagTypes: [
    'Me',
    'Members',
    'Sessions',
    'Session',
    'SessionAlerts',
    'Devices',
    'Policies',
    'Approvals',
    'Approval',
    'Ticket',
    'Alerts',
    'AddressBooks',
    'AddressBook',
    'AddressBookGrants',
    'UserGroups',
    'DeviceGroups',
    'AccessDevices',
    'AccessRules',
    'LogEvents',
    'ClientBuildCaps',
    'ClientBuildProfiles',
    'ClientBuilds',
    'ClientBuild',
    'ControlRoles',
    'Strategies',
    'Passkeys',
    'Tokens',
    'Identities',
    'Provisioning',
    'AuditRetention',
    'Providers',
  ],
  endpoints: (build) => ({
    getMe: build.query<Me, void>({
      queryFn: () => wrap(fetchMe),
      providesTags: ['Me'],
    }),
    getMembers: build.query<Member[], number>({
      queryFn: (orgId) => wrap(() => fetchMembers(orgId)),
      providesTags: (_result, _error, orgId) => [{ type: 'Members', id: orgId }],
    }),
    getRoles: build.query<Role[], number>({
      queryFn: (orgId) => wrap(() => fetchRoles(orgId)),
      providesTags: (_result, _error, orgId) => [{ type: 'Members', id: `roles-${orgId}` }],
    }),
    getPermissions: build.query<Permission[], void>({
      queryFn: () => wrap(fetchPermissions),
    }),
    createRole: build.mutation<Role, { orgId: number; input: RoleCreateRequest }>({
      queryFn: ({ orgId, input }) => wrap(() => createRole(orgId, input)),
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'Members', id: `roles-${orgId}` }],
    }),
    updateRole: build.mutation<Role, { orgId: number; roleId: number; input: RoleUpdateRequest }>({
      queryFn: ({ orgId, roleId, input }) => wrap(() => updateRole(orgId, roleId, input)),
      // A rename changes role_name on every member row and the role summary.
      invalidatesTags: (_result, _error, { orgId }) => [
        { type: 'Members', id: `roles-${orgId}` },
        { type: 'Members', id: orgId },
      ],
    }),
    deleteRole: build.mutation<void, { orgId: number; roleId: number }>({
      queryFn: async ({ orgId, roleId }) => {
        const result = await wrap(() => deleteRole(orgId, roleId))
        return 'data' in result ? { data: undefined } : result
      },
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'Members', id: `roles-${orgId}` }],
    }),
    inviteMember: build.mutation<
      Invitation,
      { orgId: number; email: string; role: 'admin' | 'member' }
    >({
      queryFn: ({ orgId, email, role }) => wrap(() => inviteMember(orgId, email, role)),
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'Members', id: orgId }],
    }),
    updateMember: build.mutation<
      MemberMutation,
      { orgId: number; userId: number; patch: { role_id?: number; disabled?: boolean } }
    >({
      queryFn: ({ orgId, userId, patch }) => wrap(() => updateMember(orgId, userId, patch)),
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'Members', id: orgId }],
    }),
    removeMember: build.mutation<MemberMutation, { orgId: number; userId: number }>({
      queryFn: ({ orgId, userId }) => wrap(() => removeMember(orgId, userId)),
      invalidatesTags: (_result, _error, { orgId }) => [
        { type: 'Members', id: orgId },
        { type: 'UserGroups', id: orgId },
      ],
    }),
    resetMemberTotp: build.mutation<void, { orgId: number; userId: number }>({
      queryFn: async ({ orgId, userId }) => {
        const result = await wrap(() => resetMemberTotp(orgId, userId))
        return 'data' in result ? { data: undefined } : result
      },
    }),
    resetMemberPasskeys: build.mutation<void, { orgId: number; userId: number }>({
      queryFn: async ({ orgId, userId }) => {
        const result = await wrap(() => resetMemberPasskeys(orgId, userId))
        return 'data' in result ? { data: undefined } : result
      },
    }),
    resetMemberIdentity: build.mutation<void, { orgId: number; userId: number }>({
      queryFn: async ({ orgId, userId }) => {
        const result = await wrap(() => resetMemberIdentity(orgId, userId))
        return 'data' in result ? { data: undefined } : result
      },
    }),
    getSessions: build.query<SessionPage, { orgId: number; queryString: string }>({
      queryFn: ({ orgId, queryString }) =>
        wrap(() => fetchSessions(orgId, new URLSearchParams(queryString))),
      providesTags: (_result, _error, { orgId }) => [{ type: 'Sessions', id: orgId }],
    }),
    getSession: build.query<SessionDetail, { orgId: number; sessionId: number }>({
      queryFn: ({ orgId, sessionId }) => wrap(() => fetchSession(orgId, sessionId)),
      providesTags: (_result, _error, { orgId, sessionId }) => [
        { type: 'Session', id: `${orgId}-${sessionId}` },
      ],
    }),
    getSessionAlerts: build.query<AlertPage, { orgId: number; sessionId: number }>({
      queryFn: ({ orgId, sessionId }) => wrap(() => fetchSessionAlerts(orgId, sessionId)),
      providesTags: (_result, _error, { orgId, sessionId }) => [
        { type: 'SessionAlerts', id: `${orgId}-${sessionId}` },
      ],
    }),
    getDevices: build.query<DevicePage, number>({
      queryFn: (orgId) => wrap(() => fetchDevices(orgId)),
      providesTags: (_result, _error, orgId) => [{ type: 'Devices', id: orgId }],
    }),
    getAddressBooks: build.query<AddressBook[], number>({
      queryFn: (orgId) => wrap(() => fetchAddressBooks(orgId)),
      providesTags: (_result, _error, orgId) => [{ type: 'AddressBooks', id: orgId }],
    }),
    getAddressBookGrants: build.query<AddressBookGrant[], { orgId: number; bookId: number }>({
      queryFn: ({ orgId, bookId }) => wrap(() => fetchAddressBookGrants(orgId, bookId)),
      providesTags: (_result, _error, { orgId, bookId }) => [
        { type: 'AddressBookGrants', id: `${orgId}-${bookId}` },
      ],
    }),
    createAddressBookGrant: build.mutation<
      AddressBookGrant,
      { orgId: number; bookId: number; request: AddressBookGrantRequest }
    >({
      queryFn: ({ orgId, bookId, request }) =>
        wrap(() => createAddressBookGrant(orgId, bookId, request)),
      invalidatesTags: (_result, _error, { orgId, bookId }) => [
        { type: 'AddressBookGrants', id: `${orgId}-${bookId}` },
      ],
    }),
    deleteAddressBookGrant: build.mutation<
      void,
      { orgId: number; bookId: number; grantId: number }
    >({
      queryFn: async ({ orgId, bookId, grantId }) => {
        const result = await wrap(() => deleteAddressBookGrant(orgId, bookId, grantId))
        return 'data' in result ? { data: undefined } : result
      },
      invalidatesTags: (_result, _error, { orgId, bookId }) => [
        { type: 'AddressBookGrants', id: `${orgId}-${bookId}` },
      ],
    }),
    getUserGroups: build.query<UserGroup[], number>({
      queryFn: (orgId) => wrap(() => fetchUserGroups(orgId)),
      providesTags: (_result, _error, orgId) => [{ type: 'UserGroups', id: orgId }],
    }),
    getAccessRules: build.query<AccessRule[], number>({
      queryFn: (orgId) => wrap(() => fetchAccessRules(orgId)),
      providesTags: (_result, _error, orgId) => [{ type: 'AccessRules', id: orgId }],
    }),
    createAccessRule: build.mutation<
      AccessRule,
      { orgId: number; request: AccessRuleCreateRequest }
    >({
      queryFn: ({ orgId, request }) => wrap(() => createAccessRule(orgId, request)),
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'AccessRules', id: orgId }],
    }),
    deleteAccessRule: build.mutation<void, { orgId: number; ruleId: number }>({
      queryFn: async ({ orgId, ruleId }) => {
        const result = await wrap(() => deleteAccessRule(orgId, ruleId))
        return 'data' in result ? { data: undefined } : result
      },
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'AccessRules', id: orgId }],
    }),
    getDeviceGroups: build.query<DeviceGroup[], number>({
      queryFn: (orgId) => wrap(() => fetchDeviceGroups(orgId)),
      providesTags: (_result, _error, orgId) => [{ type: 'DeviceGroups', id: orgId }],
    }),
    getAllDevices: build.query<AllDevices, number>({
      queryFn: (orgId) => wrap(() => fetchAllDevices(orgId)),
      providesTags: (_result, _error, orgId) => [{ type: 'AccessDevices', id: orgId }],
    }),
    createUserGroup: build.mutation<UserGroup, { orgId: number; name: string }>({
      queryFn: ({ orgId, name }) => wrap(() => createUserGroup(orgId, name)),
      invalidatesTags: (_result, _error, { orgId }) => [
        { type: 'UserGroups', id: orgId },
        { type: 'AccessRules', id: orgId },
      ],
    }),
    renameUserGroup: build.mutation<UserGroup, { orgId: number; groupId: number; name: string }>({
      queryFn: ({ orgId, groupId, name }) => wrap(() => renameUserGroup(orgId, groupId, name)),
      invalidatesTags: (_result, _error, { orgId }) => [
        { type: 'UserGroups', id: orgId },
        { type: 'AccessRules', id: orgId },
      ],
    }),
    deleteUserGroup: build.mutation<UserGroupDeleteData, { orgId: number; groupId: number }>({
      queryFn: ({ orgId, groupId }) => wrap(() => deleteUserGroup(orgId, groupId)),
      invalidatesTags: (_result, _error, { orgId }) => [
        { type: 'UserGroups', id: orgId },
        { type: 'AccessRules', id: orgId },
        { type: 'AddressBookGrants' },
      ],
    }),
    replaceUserGroupMembers: build.mutation<
      UserGroupMemberMutation,
      { orgId: number; groupId: number; userIds: number[] }
    >({
      queryFn: ({ orgId, groupId, userIds }) =>
        wrap(() => replaceUserGroupMembers(orgId, groupId, userIds)),
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'UserGroups', id: orgId }],
    }),
    createDeviceGroup: build.mutation<DeviceGroup, { orgId: number; name: string }>({
      queryFn: ({ orgId, name }) => wrap(() => createDeviceGroup(orgId, name)),
      invalidatesTags: (_result, _error, { orgId }) => [
        { type: 'DeviceGroups', id: orgId },
        { type: 'Devices', id: orgId },
        { type: 'AccessDevices', id: orgId },
        { type: 'AccessRules', id: orgId },
      ],
    }),
    renameDeviceGroup: build.mutation<
      DeviceGroup,
      { orgId: number; groupId: number; name: string }
    >({
      queryFn: ({ orgId, groupId, name }) => wrap(() => renameDeviceGroup(orgId, groupId, name)),
      invalidatesTags: (_result, _error, { orgId }) => [
        { type: 'DeviceGroups', id: orgId },
        { type: 'AccessRules', id: orgId },
      ],
    }),
    deleteDeviceGroup: build.mutation<DeviceGroupDeleteData, { orgId: number; groupId: number }>({
      queryFn: ({ orgId, groupId }) => wrap(() => deleteDeviceGroup(orgId, groupId)),
      invalidatesTags: (_result, _error, { orgId }) => [
        { type: 'DeviceGroups', id: orgId },
        { type: 'Devices', id: orgId },
        { type: 'AccessDevices', id: orgId },
        { type: 'AccessRules', id: orgId },
      ],
    }),
    replaceDeviceGroupDevices: build.mutation<
      DeviceGroupMemberMutation,
      { orgId: number; groupId: number; deviceIds: number[] }
    >({
      queryFn: ({ orgId, groupId, deviceIds }) =>
        wrap(() => replaceDeviceGroupDevices(orgId, groupId, deviceIds)),
      invalidatesTags: (_result, _error, { orgId }) => [
        { type: 'DeviceGroups', id: orgId },
        { type: 'Devices', id: orgId },
        { type: 'AccessDevices', id: orgId },
        { type: 'AccessRules', id: orgId },
      ],
    }),
    getAddressBook: build.query<AddressBook, { orgId: number; bookId: number }>({
      queryFn: ({ orgId, bookId }) => wrap(() => fetchAddressBook(orgId, bookId)),
      providesTags: (_result, _error, { orgId, bookId }) => [
        { type: 'AddressBook', id: `${orgId}-${bookId}` },
      ],
    }),
    createAddressBook: build.mutation<
      AddressBook,
      { orgId: number; name: string; scope: 'personal' | 'shared' }
    >({
      queryFn: ({ orgId, name, scope }) => wrap(() => createAddressBook(orgId, { name, scope })),
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'AddressBooks', id: orgId }],
    }),
    updateAddressBook: build.mutation<AddressBook, { orgId: number; bookId: number; name: string }>(
      {
        queryFn: ({ orgId, bookId, name }) =>
          wrap(() => updateAddressBook(orgId, bookId, { name })),
        // Mutating responses reload only the book row: `peers` and `tags` come
        // back empty, so patching the detail would blank them. Refetch instead.
        invalidatesTags: (_result, _error, { orgId, bookId }) => [
          { type: 'AddressBook', id: `${orgId}-${bookId}` },
          { type: 'AddressBooks', id: orgId },
        ],
      },
    ),
    deleteAddressBook: build.mutation<void, { orgId: number; bookId: number }>({
      queryFn: async ({ orgId, bookId }) => {
        const result = await wrap(() => deleteAddressBook(orgId, bookId))
        return 'data' in result ? { data: undefined } : result
      },
      invalidatesTags: (_result, _error, { orgId, bookId }) => [
        { type: 'AddressBook', id: `${orgId}-${bookId}` },
        { type: 'AddressBooks', id: orgId },
      ],
    }),
    replaceAddressBookPeers: build.mutation<
      AddressBook,
      { orgId: number; bookId: number; peers: AddressBookPeer[] }
    >({
      queryFn: ({ orgId, bookId, peers }) =>
        wrap(() => replaceAddressBookPeers(orgId, bookId, peers)),
      // Same as updateAddressBook: the response omits peers, so refetch the
      // detail instead of patching it with a peer-less row.
      invalidatesTags: (_result, _error, { orgId, bookId }) => [
        { type: 'AddressBook', id: `${orgId}-${bookId}` },
        { type: 'AddressBooks', id: orgId },
      ],
    }),
    deleteAddressBookPeer: build.mutation<void, { orgId: number; bookId: number; peerId: string }>({
      queryFn: async ({ orgId, bookId, peerId }) => {
        const result = await wrap(() => deleteAddressBookPeer(orgId, bookId, peerId))
        return 'data' in result ? { data: undefined } : result
      },
      invalidatesTags: (_result, _error, { orgId, bookId }) => [
        { type: 'AddressBook', id: `${orgId}-${bookId}` },
        { type: 'AddressBooks', id: orgId },
      ],
    }),
    getDevicePage: build.query<DevicePage, { orgId: number; queryString: string }>({
      queryFn: ({ orgId, queryString }) =>
        wrap(() => fetchDevicePage(orgId, new URLSearchParams(queryString))),
      providesTags: (_result, _error, { orgId }) => [{ type: 'Devices', id: orgId }],
    }),
    registerDevice: build.mutation<Device, { orgId: number; name: string; rustdesk_id: string }>({
      queryFn: ({ orgId, name, rustdesk_id }) =>
        wrap(() => registerDevice(orgId, { name, rustdesk_id })),
      invalidatesTags: (_result, _error, { orgId }) => [
        { type: 'Devices', id: orgId },
        { type: 'AccessDevices', id: orgId },
      ],
    }),
    updateDevice: build.mutation<
      Device,
      { orgId: number; deviceId: number; patch: DeviceUpdateRequest }
    >({
      queryFn: ({ orgId, deviceId, patch }) => wrap(() => updateDevice(orgId, deviceId, patch)),
      invalidatesTags: (_result, _error, { orgId }) => [
        { type: 'Devices', id: orgId },
        { type: 'AccessDevices', id: orgId },
      ],
    }),
    rebindDevice: build.mutation<Device, { orgId: number; deviceId: number; reason: string }>({
      queryFn: ({ orgId, deviceId, reason }) => wrap(() => rebindDevice(orgId, deviceId, reason)),
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'Devices', id: orgId }],
    }),
    requestDeviceDisconnect: build.mutation<
      DeviceDisconnect,
      { orgId: number; deviceId: number; reason: string }
    >({
      queryFn: ({ orgId, deviceId, reason }) =>
        wrap(() => requestDeviceDisconnect(orgId, deviceId, reason)),
      // The list carries no pending marker, so nothing here changes; a refetch
      // would only add noise.
      invalidatesTags: [],
    }),
    getPolicies: build.query<Policy[], number>({
      queryFn: (orgId) => wrap(() => fetchPolicies(orgId)),
      providesTags: (_result, _error, orgId) => [{ type: 'Policies', id: orgId }],
    }),
    createPolicy: build.mutation<Policy, { orgId: number; input: PolicyRequest }>({
      queryFn: ({ orgId, input }) => wrap(() => createPolicy(orgId, input)),
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'Policies', id: orgId }],
    }),
    updatePolicy: build.mutation<Policy, { orgId: number; policyId: number; input: PolicyRequest }>(
      {
        queryFn: ({ orgId, policyId, input }) => wrap(() => updatePolicy(orgId, policyId, input)),
        invalidatesTags: (_result, _error, { orgId }) => [{ type: 'Policies', id: orgId }],
      },
    ),
    getAlertPage: build.query<AlertPage, { orgId: number; queryString: string }>({
      queryFn: ({ orgId, queryString }) =>
        wrap(() => fetchAlertPage(orgId, new URLSearchParams(queryString))),
      providesTags: (_result, _error, { orgId }) => [{ type: 'Alerts', id: orgId }],
    }),
    getAuditLogPage: build.query<AuditLogPage, { orgId: number; queryString: string }>({
      queryFn: ({ orgId, queryString }) =>
        wrap(() => fetchAuditLogPage(orgId, new URLSearchParams(queryString))),
    }),
    getConnectionLogPage: build.query<ConnectionLogPage, { orgId: number; queryString: string }>({
      queryFn: ({ orgId, queryString }) =>
        wrap(() => fetchConnectionLogPage(orgId, new URLSearchParams(queryString))),
    }),
    getFileLogPage: build.query<FileLogPage, { orgId: number; queryString: string }>({
      queryFn: ({ orgId, queryString }) =>
        wrap(() => fetchFileLogPage(orgId, new URLSearchParams(queryString))),
    }),
    getLogEvents: build.query<LogEvent[], { orgId: number; queryString: string }>({
      queryFn: ({ orgId, queryString }) =>
        wrap(() => fetchLogEvents(orgId, new URLSearchParams(queryString))),
      providesTags: (_result, _error, { orgId }) => [{ type: 'LogEvents', id: orgId }],
    }),
    getClientBuildCapabilities: build.query<ClientBuildCapabilities, number>({
      queryFn: (orgId) => wrap(() => fetchClientBuildCapabilities(orgId)),
      providesTags: (_result, _error, orgId) => [{ type: 'ClientBuildCaps', id: orgId }],
    }),
    getClientBuildProfiles: build.query<ClientBuildProfilePage, number>({
      queryFn: (orgId) => wrap(() => fetchClientBuildProfiles(orgId)),
      providesTags: (_result, _error, orgId) => [{ type: 'ClientBuildProfiles', id: orgId }],
    }),
    createClientBuildProfile: build.mutation<
      ClientBuildProfile,
      { orgId: number; name: string; app_name: string }
    >({
      queryFn: ({ orgId, name, app_name }) =>
        wrap(() => createClientBuildProfile(orgId, { name, app_name })),
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'ClientBuildProfiles', id: orgId }],
    }),
    updateClientBuildProfile: build.mutation<
      ClientBuildProfile,
      { orgId: number; profileId: number; patch: ClientBuildProfileUpdateRequest }
    >({
      queryFn: ({ orgId, profileId, patch }) =>
        wrap(() => updateClientBuildProfile(orgId, profileId, patch)),
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'ClientBuildProfiles', id: orgId }],
    }),
    deleteClientBuildProfile: build.mutation<void, { orgId: number; profileId: number }>({
      queryFn: async ({ orgId, profileId }) => {
        const result = await wrap(() => deleteClientBuildProfile(orgId, profileId))
        return 'data' in result ? { data: undefined } : result
      },
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'ClientBuildProfiles', id: orgId }],
    }),
    putClientBuildProfileLogo: build.mutation<
      ClientBuildProfile,
      { orgId: number; profileId: number; pngBase64: string }
    >({
      queryFn: ({ orgId, profileId, pngBase64 }) =>
        wrap(() => putClientBuildProfileLogo(orgId, profileId, pngBase64)),
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'ClientBuildProfiles', id: orgId }],
    }),
    deleteClientBuildProfileLogo: build.mutation<void, { orgId: number; profileId: number }>({
      queryFn: async ({ orgId, profileId }) => {
        const result = await wrap(() => deleteClientBuildProfileLogo(orgId, profileId))
        return 'data' in result ? { data: undefined } : result
      },
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'ClientBuildProfiles', id: orgId }],
    }),
    getPasskeys: build.query<PasskeyList, void>({
      queryFn: () => wrap(() => listPasskeys()),
      providesTags: ['Passkeys'],
    }),
    getTokens: build.query<ApiToken[], number>({
      queryFn: (orgId) => wrap(() => fetchTokens(orgId)),
      providesTags: (_result, _error, orgId) => [{ type: 'Tokens', id: orgId }],
    }),
    getIdentities: build.query<IdentityList, void>({
      queryFn: () => wrap(() => fetchIdentities()),
      providesTags: ['Identities'],
    }),
    getProvisioning: build.query<ProvisioningStatus, number>({
      queryFn: (orgId) => wrap(() => fetchProvisioning(orgId)),
      providesTags: (_result, _error, orgId) => [{ type: 'Provisioning', id: orgId }],
    }),
    getAuditRetention: build.query<AuditRetention, number>({
      queryFn: (orgId) => wrap(() => fetchAuditRetention(orgId)),
      providesTags: (_result, _error, orgId) => [{ type: 'AuditRetention', id: orgId }],
    }),
    getProviders: build.query<AuthProviders, void>({
      queryFn: () => wrap(() => fetchProviders()),
      providesTags: ['Providers'],
    }),
    getStrategies: build.query<Strategy[], number>({
      queryFn: (orgId) => wrap(() => fetchStrategies(orgId)),
      providesTags: (_result, _error, orgId) => [{ type: 'Strategies', id: orgId }],
    }),
    createStrategy: build.mutation<Strategy, { orgId: number; request: StrategyCreateRequest }>({
      queryFn: ({ orgId, request }) => wrap(() => createStrategy(orgId, request)),
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'Strategies', id: orgId }],
    }),
    updateStrategy: build.mutation<
      Strategy,
      { orgId: number; strategyId: number; request: StrategyUpdateRequest }
    >({
      queryFn: ({ orgId, strategyId, request }) =>
        wrap(() => updateStrategy(orgId, strategyId, request)),
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'Strategies', id: orgId }],
    }),
    deleteStrategy: build.mutation<void, { orgId: number; strategyId: number }>({
      queryFn: async ({ orgId, strategyId }) => {
        const result = await wrap(() => deleteStrategy(orgId, strategyId))
        return 'data' in result ? { data: undefined } : result
      },
      invalidatesTags: (_result, _error, { orgId }) => [
        { type: 'Strategies', id: orgId },
        { type: 'Members', id: orgId },
        { type: 'DeviceGroups', id: orgId },
        { type: 'Devices', id: orgId },
        { type: 'AccessDevices', id: orgId },
      ],
    }),
    assignMemberStrategy: build.mutation<
      void,
      { orgId: number; userId: number; strategyId: number | null }
    >({
      queryFn: async ({ orgId, userId, strategyId }) => {
        const result = await wrap(() => assignMemberStrategyRequest(orgId, userId, strategyId))
        return 'data' in result ? { data: undefined } : result
      },
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'Members', id: orgId }],
    }),
    assignDeviceGroupStrategy: build.mutation<
      void,
      { orgId: number; groupId: number; strategyId: number | null }
    >({
      queryFn: async ({ orgId, groupId, strategyId }) => {
        const result = await wrap(() =>
          assignDeviceGroupStrategyRequest(orgId, groupId, strategyId),
        )
        return 'data' in result ? { data: undefined } : result
      },
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'DeviceGroups', id: orgId }],
    }),
    assignDeviceStrategy: build.mutation<
      void,
      { orgId: number; deviceId: number; strategyId: number | null }
    >({
      queryFn: async ({ orgId, deviceId, strategyId }) => {
        const result = await wrap(() => assignDeviceStrategyRequest(orgId, deviceId, strategyId))
        return 'data' in result ? { data: undefined } : result
      },
      invalidatesTags: (_result, _error, { orgId }) => [
        { type: 'Devices', id: orgId },
        { type: 'AccessDevices', id: orgId },
      ],
    }),
    getControlRoles: build.query<ControlRole[], number>({
      queryFn: (orgId) => wrap(() => fetchControlRoles(orgId)),
      providesTags: (_result, _error, orgId) => [{ type: 'ControlRoles', id: orgId }],
    }),
    createControlRole: build.mutation<
      ControlRole,
      { orgId: number; name: string; permissions: ControlPermissionStates }
    >({
      queryFn: ({ orgId, name, permissions }) =>
        wrap(() => createControlRole(orgId, { name, permissions })),
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'ControlRoles', id: orgId }],
    }),
    updateControlRole: build.mutation<
      ControlRole,
      { orgId: number; roleId: number; request: ControlRoleUpdateRequest }
    >({
      queryFn: ({ orgId, roleId, request }) =>
        wrap(() => updateControlRole(orgId, roleId, request)),
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'ControlRoles', id: orgId }],
    }),
    deleteControlRole: build.mutation<void, { orgId: number; roleId: number }>({
      queryFn: async ({ orgId, roleId }) => {
        const result = await wrap(() => deleteControlRole(orgId, roleId))
        return 'data' in result ? { data: undefined } : result
      },
      invalidatesTags: (_result, _error, { orgId }) => [
        { type: 'ControlRoles', id: orgId },
        { type: 'Members', id: orgId },
      ],
    }),
    assignMemberControlRole: build.mutation<
      void,
      { orgId: number; userId: number; controlRoleId: number | null }
    >({
      queryFn: async ({ orgId, userId, controlRoleId }) => {
        const result = await wrap(() =>
          assignMemberControlRoleRequest(orgId, userId, controlRoleId),
        )
        return 'data' in result ? { data: undefined } : result
      },
      invalidatesTags: (_result, _error, { orgId }) => [
        { type: 'ControlRoles', id: orgId },
        { type: 'Members', id: orgId },
      ],
    }),
    getClientBuildPage: build.query<ClientBuildPage, { orgId: number; queryString: string }>({
      queryFn: ({ orgId, queryString }) =>
        wrap(() => fetchClientBuildPage(orgId, new URLSearchParams(queryString))),
      providesTags: (_result, _error, { orgId }) => [{ type: 'ClientBuilds', id: orgId }],
    }),
    getClientBuild: build.query<ClientBuildDetail, { orgId: number; buildId: number }>({
      queryFn: ({ orgId, buildId }) => wrap(() => fetchClientBuild(orgId, buildId)),
      providesTags: (_result, _error, { orgId, buildId }) => [
        { type: 'ClientBuild', id: `${orgId}-${buildId}` },
      ],
    }),
    createClientBuild: build.mutation<
      ClientBuildDetail,
      { orgId: number; request: ClientBuildCreateRequest }
    >({
      queryFn: ({ orgId, request }) => wrap(() => createClientBuild(orgId, request)),
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'ClientBuilds', id: orgId }],
    }),
    cancelClientBuild: build.mutation<ClientBuildDetail, { orgId: number; buildId: number }>({
      queryFn: ({ orgId, buildId }) => wrap(() => cancelClientBuild(orgId, buildId)),
      invalidatesTags: (_result, _error, { orgId, buildId }) => [
        { type: 'ClientBuilds', id: orgId },
        { type: 'ClientBuild', id: `${orgId}-${buildId}` },
      ],
    }),
    getApprovalPage: build.query<ApprovalPage, { orgId: number; queryString: string }>({
      queryFn: ({ orgId, queryString }) =>
        wrap(() => fetchApprovalPage(orgId, new URLSearchParams(queryString))),
      providesTags: (_result, _error, { orgId }) => [{ type: 'Approvals', id: orgId }],
    }),
    getApproval: build.query<Approval, { orgId: number; approvalId: number }>({
      queryFn: ({ orgId, approvalId }) => wrap(() => fetchApproval(orgId, approvalId)),
      providesTags: (_result, _error, { orgId, approvalId }) => [
        { type: 'Approval', id: `${orgId}-${approvalId}` },
      ],
    }),
    createApproval: build.mutation<Approval, { orgId: number; request: ApprovalCreateRequest }>({
      queryFn: ({ orgId, request }) => wrap(() => createApproval(orgId, request)),
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'Approvals', id: orgId }],
    }),
    getTicket: build.query<Ticket, { orgId: number; ticketId: number }>({
      queryFn: ({ orgId, ticketId }) => wrap(() => fetchTicket(orgId, ticketId)),
      providesTags: (_result, _error, { orgId, ticketId }) => [
        { type: 'Ticket', id: `${orgId}-${ticketId}` },
      ],
    }),
    decideApproval: build.mutation<
      Approval,
      { orgId: number; approvalId: number; request: ApprovalDecisionRequest }
    >({
      queryFn: ({ orgId, approvalId, request }) =>
        wrap(() => submitApprovalDecision(orgId, approvalId, request)),
      async onQueryStarted({ orgId, approvalId }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled
          // The decision response is authoritative for this row; patch the
          // detail cache and let every list of this organization refetch.
          dispatch(panelApi.util.updateQueryData('getApproval', { orgId, approvalId }, () => data))
          dispatch(panelApi.util.invalidateTags([{ type: 'Approvals', id: orgId }]))
        } catch {
          // Failures surface through unwrap(); nothing to cache.
        }
      },
    }),
    deletePolicy: build.mutation<void, { orgId: number; policyId: number }>({
      queryFn: async ({ orgId, policyId }) => {
        const result = await wrap(() => deletePolicy(orgId, policyId))
        return 'data' in result ? { data: undefined } : result
      },
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'Policies', id: orgId }],
    }),
  }),
})

export const {
  useGetMeQuery,
  useGetMembersQuery,
  useGetRolesQuery,
  useGetPermissionsQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
  useInviteMemberMutation,
  useUpdateMemberMutation,
  useRemoveMemberMutation,
  useResetMemberTotpMutation,
  useResetMemberPasskeysMutation,
  useResetMemberIdentityMutation,
  useGetSessionsQuery,
  useGetSessionQuery,
  useGetSessionAlertsQuery,
  useGetDevicesQuery,
  useGetDevicePageQuery,
  useRegisterDeviceMutation,
  useUpdateDeviceMutation,
  useRebindDeviceMutation,
  useRequestDeviceDisconnectMutation,
  useGetPoliciesQuery,
  useCreatePolicyMutation,
  useUpdatePolicyMutation,
  useDeletePolicyMutation,
  useGetAddressBookGrantsQuery,
  useCreateAddressBookGrantMutation,
  useDeleteAddressBookGrantMutation,
  useGetUserGroupsQuery,
  useGetAccessRulesQuery,
  useCreateAccessRuleMutation,
  useDeleteAccessRuleMutation,
  useGetDeviceGroupsQuery,
  useGetAllDevicesQuery,
  useCreateUserGroupMutation,
  useRenameUserGroupMutation,
  useDeleteUserGroupMutation,
  useReplaceUserGroupMembersMutation,
  useCreateDeviceGroupMutation,
  useRenameDeviceGroupMutation,
  useDeleteDeviceGroupMutation,
  useReplaceDeviceGroupDevicesMutation,
  useGetAddressBooksQuery,
  useGetAddressBookQuery,
  useCreateAddressBookMutation,
  useUpdateAddressBookMutation,
  useDeleteAddressBookMutation,
  useReplaceAddressBookPeersMutation,
  useDeleteAddressBookPeerMutation,
  useGetAlertPageQuery,
  useGetAuditLogPageQuery,
  useGetConnectionLogPageQuery,
  useGetFileLogPageQuery,
  useGetLogEventsQuery,
  useGetClientBuildCapabilitiesQuery,
  useGetClientBuildProfilesQuery,
  useCreateClientBuildProfileMutation,
  useUpdateClientBuildProfileMutation,
  useDeleteClientBuildProfileMutation,
  usePutClientBuildProfileLogoMutation,
  useDeleteClientBuildProfileLogoMutation,
  useGetStrategiesQuery,
  useGetPasskeysQuery,
  useGetTokensQuery,
  useGetIdentitiesQuery,
  useGetProvisioningQuery,
  useGetAuditRetentionQuery,
  useGetProvidersQuery,
  useCreateStrategyMutation,
  useUpdateStrategyMutation,
  useDeleteStrategyMutation,
  useAssignMemberStrategyMutation,
  useAssignDeviceGroupStrategyMutation,
  useAssignDeviceStrategyMutation,
  useGetControlRolesQuery,
  useCreateControlRoleMutation,
  useUpdateControlRoleMutation,
  useDeleteControlRoleMutation,
  useAssignMemberControlRoleMutation,
  useGetClientBuildPageQuery,
  useGetClientBuildQuery,
  useCreateClientBuildMutation,
  useCancelClientBuildMutation,
  useGetApprovalPageQuery,
  useGetApprovalQuery,
  useGetTicketQuery,
  useCreateApprovalMutation,
  useDecideApprovalMutation,
} = panelApi
