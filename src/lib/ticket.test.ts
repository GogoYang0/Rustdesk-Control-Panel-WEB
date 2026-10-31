import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import {
  approvalIDFromError,
  formatTicketRemaining,
  isApprovalRequired,
  ticketDetailError,
  ticketIssueError,
  ticketStatus,
} from './ticket'

const now = new Date('2026-10-31T00:00:00.000Z')
const inSeconds = (seconds: number) => new Date(now.getTime() + seconds * 1000).toISOString()

describe('ticketStatus', () => {
  it('prioritises used, then revoked, then expiry', () => {
    expect(
      ticketStatus(
        { used_at: inSeconds(-1), revoked_at: inSeconds(-2), expires_at: inSeconds(60) },
        now,
      ),
    ).toBe('used')
    expect(
      ticketStatus({ used_at: null, revoked_at: inSeconds(-2), expires_at: inSeconds(60) }, now),
    ).toBe('revoked')
    expect(ticketStatus({ used_at: null, revoked_at: null, expires_at: inSeconds(-1) }, now)).toBe(
      'expired',
    )
    expect(ticketStatus({ used_at: null, revoked_at: null, expires_at: inSeconds(60) }, now)).toBe(
      'pending',
    )
  })

  it('treats an invalid deadline as expired instead of usable', () => {
    expect(ticketStatus({ used_at: null, revoked_at: null, expires_at: 'nope' }, now)).toBe(
      'expired',
    )
  })
})

describe('formatTicketRemaining', () => {
  it('prints mm:ss and expires at the deadline', () => {
    expect(formatTicketRemaining(inSeconds(300), now)).toBe('5:00')
    expect(formatTicketRemaining(inSeconds(65), now)).toBe('1:05')
    expect(formatTicketRemaining(inSeconds(1), now)).toBe('0:01')
    expect(formatTicketRemaining(inSeconds(0), now)).toBe('已过期')
    expect(formatTicketRemaining(inSeconds(-5), now)).toBe('已过期')
    expect(formatTicketRemaining('bad', now)).toBe('已过期')
  })
})

describe('approvalIDFromError', () => {
  it('reads a positive approval id from approval_required only', () => {
    const err = new ApiError(409, 'approval_required', 'approval required', { approval_id: 7 })
    expect(isApprovalRequired(err)).toBe(true)
    expect(approvalIDFromError(err)).toBe(7)
    expect(
      approvalIDFromError(
        new ApiError(409, 'approval_required', 'approval required', { approval_id: '8' }),
      ),
    ).toBe(8)
  })

  it('rejects missing, malformed and other conflicts', () => {
    expect(approvalIDFromError(new ApiError(409, 'approval_required', 'x', null))).toBeNull()
    expect(
      approvalIDFromError(new ApiError(409, 'approval_required', 'x', { approval_id: -1 })),
    ).toBeNull()
    expect(
      approvalIDFromError(new ApiError(409, 'approval_required', 'x', { approval_id: 'abc' })),
    ).toBeNull()
    expect(approvalIDFromError(new ApiError(409, 'conflict', 'x', { approval_id: 7 }))).toBeNull()
    expect(approvalIDFromError(new Error('boom'))).toBeNull()
  })
})

describe('ticket errors', () => {
  it('maps issue failures without leaking backend text', () => {
    expect(ticketIssueError(new ApiError(0, 'internal', 'network'))).toContain('网络')
    expect(ticketIssueError(new ApiError(403, 'forbidden', 'english'))).toContain('无权签发')
    expect(ticketIssueError(new ApiError(404, 'not_found', 'english'))).toContain('无权访问')
    expect(ticketIssueError(new ApiError(409, 'conflict', 'english'))).toContain('审批已失效')
    expect(ticketIssueError(new ApiError(503, 'internal', 'english'))).toContain('服务异常')
    expect(ticketIssueError(new ApiError(418, 'teapot', 'english'))).not.toContain('english')
  })

  it('maps ticket detail failures', () => {
    expect(ticketDetailError(new ApiError(403, 'forbidden', 'english'))).toContain('无权读取')
    expect(ticketDetailError(new ApiError(404, 'not_found', 'english'))).toContain('不存在')
    expect(ticketDetailError(new ApiError(0, 'internal', 'network'))).toContain('网络')
  })
})
