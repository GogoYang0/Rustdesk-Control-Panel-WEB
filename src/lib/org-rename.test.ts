import { describe, expect, it } from 'vitest'

import { ApiError, type Me } from './api'
import { patchOrgName, renameOrgError } from './org-rename'

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
    { id: 2, name: 'Lab', role_id: 2, role_kind: 'admin', permissions: ['device.read'] },
  ],
}

describe('renameOrgError', () => {
  it('maps validation, permission, missing and service failures', () => {
    expect(renameOrgError(new ApiError(400, 'invalid_request', 'bad'))).toContain('不合法')
    expect(renameOrgError(new ApiError(403, 'forbidden', 'no'))).toContain('owner')
    expect(renameOrgError(new ApiError(404, 'not_found', 'gone'))).toContain('不存在')
    expect(renameOrgError(new ApiError(503, 'internal', 'boom'))).toContain('服务异常')
    expect(renameOrgError(new ApiError(418, 'teapot', 'english'))).not.toContain('english')
  })

  it('treats network failures as retryable', () => {
    expect(renameOrgError(new TypeError('Failed to fetch'))).toContain('网络异常')
    expect(renameOrgError(new ApiError(0, 'internal', 'network'))).toContain('网络异常')
  })
})

describe('patchOrgName', () => {
  it('renames only the target organization without mutating the input', () => {
    const next = patchOrgName(me, 1, 'ACME 2')
    expect(next).not.toBe(me)
    expect(next.orgs[0].name).toBe('ACME 2')
    expect(next.orgs[1]).toBe(me.orgs[1])
    expect(me.orgs[0].name).toBe('ACME')
    expect(next.user).toBe(me.user)
  })

  it('returns the same object when the id is missing or the name is unchanged', () => {
    expect(patchOrgName(me, 999, 'X')).toBe(me)
    expect(patchOrgName(me, 1, 'ACME')).toBe(me)
  })
})
