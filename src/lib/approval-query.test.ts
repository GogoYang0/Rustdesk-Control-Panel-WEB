import { describe, expect, it } from 'vitest'

import type { Approval } from '../api/generated'
import { ApiError } from './api'
import {
  APPROVAL_PAGE_SIZE,
  DEFAULT_APPROVAL_FILTERS,
  approvalActionLabels,
  approvalKindLabel,
  approvalStatusLabel,
  approvalWriteError,
  formatRemaining,
  isActionable,
  parseApprovalFilters,
  ticketState,
  toApprovalRequestQuery,
  toApprovalSearchParams,
  toDecisionRequest,
} from './approval-query'

const NOW = new Date('2026-10-29T10:00:00.000Z')

function approval(overrides: Partial<Approval> = {}): Approval {
  return {
    id: 7,
    organization_id: 1,
    device_id: 3,
    kind: 'pre_approval',
    actor_user_id: 2,
    status: 'pending',
    requested_at: '2026-10-29T09:55:00.000Z',
    expires_at: '2026-10-29T10:10:00.000Z',
    ...overrides,
  }
}

describe('approval filters in the URL', () => {
  it('defaults to pending and no deep link', () => {
    expect(parseApprovalFilters(new URLSearchParams())).toEqual(DEFAULT_APPROVAL_FILTERS)
  })

  it('keeps valid status, device, page and deep link', () => {
    expect(
      parseApprovalFilters(new URLSearchParams('status=approved&deviceId=12&page=3&approvalId=34')),
    ).toEqual({ status: 'approved', deviceId: '12', page: 3, approvalId: 34 })
  })

  it.each([
    ['status=processed', 'status', 'pending'],
    ['status=bogus', 'status', 'pending'],
    ['deviceId=0', 'deviceId', ''],
    ['deviceId=1.5', 'deviceId', ''],
    ['page=0', 'page', 1],
    ['page=1e21', 'page', 1],
    ['approvalId=-2', 'approvalId', null],
    ['approvalId=abc', 'approvalId', null],
    ['page=1000001', 'page', 1],
  ] as const)('normalises an invalid %s', (query, key, expected) => {
    expect(parseApprovalFilters(new URLSearchParams(query))[key]).toEqual(expected)
  })

  it('accepts ids beyond the page cap', () => {
    expect(parseApprovalFilters(new URLSearchParams('deviceId=1000001')).deviceId).toBe('1000001')
    expect(parseApprovalFilters(new URLSearchParams('approvalId=2000000')).approvalId).toBe(2000000)
  })

  it('omits defaults from the URL and keeps the deep link', () => {
    expect(toApprovalSearchParams(DEFAULT_APPROVAL_FILTERS).toString()).toBe('')
    expect(toApprovalSearchParams({ ...DEFAULT_APPROVAL_FILTERS, approvalId: 5 }).toString()).toBe(
      'approvalId=5',
    )
  })

  it('round-trips a non-default filter set', () => {
    const filters = parseApprovalFilters(
      new URLSearchParams('status=denied&deviceId=9&page=2&approvalId=11'),
    )
    expect(parseApprovalFilters(toApprovalSearchParams(filters))).toEqual(filters)
  })
})

describe('approval request parameters', () => {
  it('always sends status and the fixed page size, never the deep link', () => {
    const query = toApprovalRequestQuery({
      status: 'expired',
      deviceId: '4',
      page: 2,
      approvalId: 9,
    })
    expect(query.get('status')).toBe('expired')
    expect(query.get('deviceId')).toBe('4')
    expect(query.get('page')).toBe('2')
    expect(query.get('pageSize')).toBe(String(APPROVAL_PAGE_SIZE))
    expect(query.get('approvalId')).toBeNull()
  })

  it('sends the default status when no device filter is set', () => {
    const query = toApprovalRequestQuery(DEFAULT_APPROVAL_FILTERS)
    expect(query.get('status')).toBe('pending')
    expect(query.get('deviceId')).toBeNull()
    expect(query.get('page')).toBe('1')
  })
})

describe('labels', () => {
  it('distinguishes the two kinds and their decisions', () => {
    expect(approvalKindLabel('pre_approval')).toBe('事前审批')
    expect(approvalKindLabel('ratification')).toBe('事后追认')
    expect(approvalActionLabels('pre_approval')).toEqual({ approve: '批准', deny: '驳回' })
    expect(approvalActionLabels('ratification')).toEqual({ approve: '追认', deny: '拒绝追认' })
  })

  it('names each state per kind instead of merging them', () => {
    expect(approvalStatusLabel('pre_approval', 'pending')).toBe('待审批')
    expect(approvalStatusLabel('ratification', 'pending')).toBe('待追认')
    expect(approvalStatusLabel('pre_approval', 'approved')).toBe('已批准')
    expect(approvalStatusLabel('ratification', 'approved')).toBe('已追认')
    expect(approvalStatusLabel('pre_approval', 'denied')).toBe('已驳回')
    expect(approvalStatusLabel('ratification', 'denied')).toBe('已拒绝追认')
    expect(approvalStatusLabel('pre_approval', 'expired')).toBe('已过期')
  })
})

describe('actionability and deadlines', () => {
  it('requires pending and an unexpired deadline', () => {
    expect(isActionable(approval(), NOW)).toBe(true)
    expect(isActionable(approval({ status: 'approved' }), NOW)).toBe(false)
    expect(isActionable(approval({ expires_at: '2026-10-29T09:59:59.000Z' }), NOW)).toBe(false)
  })

  it('formats the remaining time and the overdue case', () => {
    expect(formatRemaining('2026-10-29T10:10:00.000Z', NOW)).toBe('剩余 10 分钟')
    expect(formatRemaining('2026-10-29T09:00:00.000Z', NOW)).toBe('已超时')
    expect(formatRemaining('not-a-date', NOW)).toBe('—')
  })

  it('separates an approved-but-unspent permission from a linked ticket', () => {
    expect(ticketState(approval({ status: 'approved', ticket_id: 21 }), NOW)).toBe('linked')
    expect(ticketState(approval({ status: 'approved' }), NOW)).toBe('not_linked')
    expect(
      ticketState(approval({ status: 'approved', expires_at: '2026-10-29T09:00:00.000Z' }), NOW),
    ).toBe('permission_expired')
    expect(ticketState(approval({ kind: 'ratification', status: 'approved' }), NOW)).toBe(
      'acknowledged',
    )
    expect(ticketState(approval({ status: 'pending' }), NOW)).toBeNull()
  })
})

describe('decision payload', () => {
  it('approve never carries a reason', () => {
    expect(toDecisionRequest('approve', 'keep this')).toEqual({ decision: 'approve' })
    expect(toDecisionRequest('approve')).toEqual({ decision: 'approve' })
  })

  it('deny keeps a trimmed reason and omits an empty one', () => {
    expect(toDecisionRequest('deny', '  权限已收回  ')).toEqual({
      decision: 'deny',
      reason: '权限已收回',
    })
    expect(toDecisionRequest('deny', '   ')).toEqual({ decision: 'deny' })
    expect(toDecisionRequest('deny')).toEqual({ decision: 'deny' })
  })

  it('rejects a deny reason over 500 characters', () => {
    expect(() => toDecisionRequest('deny', 'a'.repeat(501))).toThrow(/500/)
    expect(toDecisionRequest('deny', 'a'.repeat(500))).toEqual({
      decision: 'deny',
      reason: 'a'.repeat(500),
    })
  })
})

describe('decision errors', () => {
  it('explains the already-decided conflict and the lost request', () => {
    expect(approvalWriteError(new ApiError(409, 'conflict', 'already decided'))).toContain(
      '已处理或已过期',
    )
    expect(approvalWriteError(new ApiError(404, 'not_found', 'approval not found'))).toContain(
      '不存在',
    )
    expect(approvalWriteError(new ApiError(403, 'forbidden', 'forbidden'))).toContain('权限')
    expect(approvalWriteError(new ApiError(0, 'internal', 'Failed to fetch'))).toContain('网络')
    expect(approvalWriteError(new ApiError(500, 'internal', 'boom'))).toContain('服务异常')
    expect(approvalWriteError(new TypeError('Failed to fetch'))).toContain('网络')
  })
})
