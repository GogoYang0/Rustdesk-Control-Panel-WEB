import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'

import {
  ApiError,
  fetchDevicePage,
  fetchDevices,
  fetchMe,
  fetchMembers,
  fetchRoles,
  fetchSession,
  fetchSessionAlerts,
  fetchSessions,
  createAddressBook,
  createAddressBookGrant,
  createPolicy,
  deleteAddressBook,
  deleteAddressBookGrant,
  deleteAddressBookPeer,
  deletePolicy,
  fetchAddressBook,
  fetchAddressBookGrants,
  fetchAddressBooks,
  fetchAlertPage,
  fetchApproval,
  fetchApprovalPage,
  fetchAuditLogPage,
  fetchConnectionLogPage,
  fetchFileLogPage,
  fetchPolicies,
  fetchUserGroups,
  inviteMember,
  rebindDevice,
  registerDevice,
  removeMember,
  replaceAddressBookPeers,
  requestDeviceDisconnect,
  submitApprovalDecision,
  updateAddressBook,
  updateDevice,
  updateMember,
  updatePolicy,
  type AddressBook,
  type AddressBookGrant,
  type AddressBookGrantRequest,
  type AddressBookPeer,
  type UserGroup,
  type AlertPage,
  type AuditLogPage,
  type ConnectionLogPage,
  type FileLogPage,
  type Approval,
  type ApprovalDecisionRequest,
  type ApprovalPage,
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
    'Alerts',
    'AddressBooks',
    'AddressBook',
    'AddressBookGrants',
    'UserGroups',
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
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'Members', id: orgId }],
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
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'Devices', id: orgId }],
    }),
    updateDevice: build.mutation<
      Device,
      { orgId: number; deviceId: number; patch: DeviceUpdateRequest }
    >({
      queryFn: ({ orgId, deviceId, patch }) => wrap(() => updateDevice(orgId, deviceId, patch)),
      invalidatesTags: (_result, _error, { orgId }) => [{ type: 'Devices', id: orgId }],
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
  useInviteMemberMutation,
  useUpdateMemberMutation,
  useRemoveMemberMutation,
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
  useGetAddressBooksQuery,
  useGetAddressBookQuery,
  useCreateAddressBookMutation,
  useUpdateAddressBookMutation,
  useDeleteAddressBookMutation,
  useReplaceAddressBookPeersMutation,
  useDeleteAddressBookPeerMutation,
  useGetAlertPageQuery,
  useGetApprovalPageQuery,
  useGetApprovalQuery,
  useDecideApprovalMutation,
} = panelApi
