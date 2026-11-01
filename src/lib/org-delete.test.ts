import { describe, expect, it } from 'vitest'

import { ApiError, type Me } from './api'
import { orgDeleteError, removeOrgFromMe } from './org-delete'

describe('orgDeleteError', () => {
  it('maps confirmation, permission, cleanup and network failures', () => {
    expect(orgDeleteError(new ApiError(400, 'invalid_request', 'bad'))).toContain('不匹配')
    expect(orgDeleteError(new ApiError(403, 'forbidden', 'no'))).toContain('owner')
    expect(orgDeleteError(new ApiError(404, 'not_found', 'gone'))).toContain('不存在')
    expect(orgDeleteError(new ApiError(409, 'conflict', 'docker'))).toContain('清理失败')
    expect(orgDeleteError(new ApiError(503, 'internal', 'down'))).toContain('服务异常')
    expect(orgDeleteError(new TypeError('network'))).toContain('网络异常')
  })
})

const me: Me = {
  user: {
    id: 1,
    email: 'owner@acme.local',
    email_verified: true,
    totp_enabled: false,
    has_password: true,
  },
  orgs: [
    { id: 1, name: 'ACME', role_id: 1, role_kind: 'owner', permissions: ['org.admin'] },
    { id: 2, name: 'Lab', role_id: 2, role_kind: 'member', permissions: [] },
  ],
}

describe('removeOrgFromMe', () => {
  it('removes only the deleted organization', () => {
    const next = removeOrgFromMe(me, 1)
    expect(next).not.toBe(me)
    expect(next.orgs.map((org) => org.id)).toEqual([2])
    expect(me.orgs).toHaveLength(2)
    expect(removeOrgFromMe(me, 999)).toBe(me)
  })
})
