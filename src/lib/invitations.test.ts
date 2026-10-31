import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import {
  invitationRoleLabel,
  revokeInvitationError,
  revokeInvitationNeedsRefresh,
} from './invitations'

describe('invitationRoleLabel', () => {
  it('renders the two invitation roles', () => {
    expect(invitationRoleLabel('admin')).toBe('Admin')
    expect(invitationRoleLabel('member')).toBe('Member')
  })
})

describe('revokeInvitationError', () => {
  it('maps permission, stale, accepted and service failures', () => {
    expect(revokeInvitationError(new ApiError(403, 'forbidden', 'no'))).toContain('权限')
    expect(revokeInvitationError(new ApiError(404, 'not_found', 'gone'))).toContain('失效')
    expect(revokeInvitationError(new ApiError(409, 'conflict', 'used'))).toContain('已接受')
    expect(revokeInvitationError(new ApiError(503, 'internal', 'boom'))).toContain('服务异常')
    expect(revokeInvitationError(new ApiError(418, 'teapot', 'english'))).not.toContain('english')
  })

  it('treats network failures as retryable', () => {
    expect(revokeInvitationError(new TypeError('Failed to fetch'))).toContain('网络异常')
    expect(revokeInvitationError(new ApiError(0, 'internal', 'network'))).toContain('网络异常')
  })
})

describe('revokeInvitationNeedsRefresh', () => {
  it('refreshes only on stale state', () => {
    expect(revokeInvitationNeedsRefresh(new ApiError(404, 'not_found', 'gone'))).toBe(true)
    expect(revokeInvitationNeedsRefresh(new ApiError(409, 'conflict', 'used'))).toBe(true)
    expect(revokeInvitationNeedsRefresh(new ApiError(403, 'forbidden', 'no'))).toBe(false)
    expect(revokeInvitationNeedsRefresh(new TypeError('network'))).toBe(false)
  })
})
