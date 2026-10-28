import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'

import {
  ApiError,
  fetchMe,
  fetchMembers,
  type Me,
  type Member,
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
  tagTypes: ['Me', 'Members'],
  endpoints: (build) => ({
    getMe: build.query<Me, void>({
      queryFn: () => wrap(fetchMe),
      providesTags: ['Me'],
    }),
    getMembers: build.query<Member[], number>({
      queryFn: (orgId) => wrap(() => fetchMembers(orgId)),
      providesTags: (_result, _error, orgId) => [{ type: 'Members', id: orgId }],
    }),
  }),
})

export const { useGetMeQuery, useGetMembersQuery } = panelApi
