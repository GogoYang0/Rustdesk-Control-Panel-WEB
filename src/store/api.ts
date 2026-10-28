import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'

import {
  ApiError,
  fetchDevices,
  fetchMe,
  fetchMembers,
  fetchRoles,
  fetchSession,
  fetchSessionAlerts,
  fetchSessions,
  inviteMember,
  removeMember,
  updateMember,
  type AlertPage,
  type DevicePage,
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
  tagTypes: ['Me', 'Members', 'Sessions', 'Session', 'SessionAlerts', 'Devices'],
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
} = panelApi
