import { configureStore } from '@reduxjs/toolkit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { panelApi } from './api'

function makeStore() {
  return configureStore({
    reducer: { [panelApi.reducerPath]: panelApi.reducer },
    middleware: (getDefault) => getDefault().concat(panelApi.middleware),
  })
}

const approval = {
  id: 7,
  organization_id: 1,
  device_id: 3,
  kind: 'pre_approval',
  status: 'pending',
  requested_at: '2026-10-29T09:55:00.000Z',
  expires_at: '2026-10-29T10:10:00.000Z',
}

describe('approval endpoints', () => {
  const calls: string[] = []
  beforeEach(() => {
    calls.length = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.includes('/approvals/7/decision')) {
        return new Response(
          JSON.stringify({ code: 'ok', message: 'ok', data: { ...approval, status: 'approved' } }),
          { status: 200 },
        )
      }
      if (url.includes('/approvals/7')) {
        return new Response(JSON.stringify({ code: 'ok', message: 'ok', data: approval }), {
          status: 200,
        })
      }
      return new Response(
        JSON.stringify({
          code: 'ok',
          message: 'ok',
          data: { items: [approval], page: 1, page_size: 50, total: 1 },
        }),
        { status: 200 },
      )
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('maps filters onto the contract query and never sends the deep link', async () => {
    const store = makeStore()
    await store
      .dispatch(
        panelApi.endpoints.getApprovalPage.initiate({
          orgId: 1,
          queryString: 'status=pending&deviceId=3&page=1&pageSize=50',
        }),
      )
      .unwrap()
    expect(calls[0]).toBe(
      'GET /api/v1/orgs/1/approvals?status=pending&deviceId=3&page=1&pageSize=50',
    )
  })

  it('patches the detail cache from a decision and invalidates the list', async () => {
    const store = makeStore()
    await store
      .dispatch(panelApi.endpoints.getApproval.initiate({ orgId: 1, approvalId: 7 }))
      .unwrap()
    // Keep a list subscription so invalidation triggers a refetch.
    const listSub = store.dispatch(
      panelApi.endpoints.getApprovalPage.initiate({
        orgId: 1,
        queryString: 'status=pending&page=1&pageSize=50',
      }),
    )
    await listSub
    const listCallsBefore = calls.filter((call) => call.includes('/approvals?')).length

    await store
      .dispatch(
        panelApi.endpoints.decideApproval.initiate({
          orgId: 1,
          approvalId: 7,
          request: { decision: 'approve' },
        }),
      )
      .unwrap()

    // A fresh initiate reads the patched cache instead of issuing another GET.
    const refetched = await store
      .dispatch(panelApi.endpoints.getApproval.initiate({ orgId: 1, approvalId: 7 }))
      .unwrap()
    expect(refetched.status).toBe('approved')
    const detailGets = calls.filter(
      (call) => call.includes('/approvals/7') && !call.includes('decision'),
    )
    expect(detailGets).toHaveLength(1)
    await vi.waitFor(() => {
      const listCallsAfter = calls.filter((call) => call.includes('/approvals?')).length
      expect(listCallsAfter).toBeGreaterThan(listCallsBefore)
    })
    listSub.unsubscribe()
  })
})
