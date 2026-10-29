import { describe, expect, it } from 'vitest'

import type { AddressBookGrant, UserGroup } from '../api/generated'
import { ApiError } from './api'
import {
  GRANT_ACCESS,
  accessLabel,
  accessTone,
  addressBookGrantError,
  findGrant,
  grantImpactNote,
  grantSubjectKey,
  grantableGroups,
  subjectLabel,
  toGrantRequest,
  validateGrantForm,
} from './addressbook-grant'

function grant(overrides: Partial<AddressBookGrant> = {}): AddressBookGrant {
  return {
    id: 1,
    subject_kind: 'user',
    subject_user_id: 7,
    subject_group_id: null,
    access: 'read',
    created_by: 1,
    created_at: '2026-10-29T00:00:00Z',
    ...overrides,
  }
}

function group(overrides: Partial<UserGroup> = {}): UserGroup {
  return {
    id: 3,
    name: '研发组',
    kind: 'custom',
    member_ids: [],
    created_at: '2026-10-29T00:00:00Z',
    updated_at: '2026-10-29T00:00:00Z',
    ...overrides,
  }
}

describe('subject keys and upsert detection', () => {
  it('keys each subject kind by its own id', () => {
    expect(grantSubjectKey({ subject_kind: 'user', subject_user_id: 7 })).toBe('user:7')
    expect(grantSubjectKey({ subject_kind: 'user_group', subject_group_id: 3 })).toBe('group:3')
    expect(grantSubjectKey({ subject_kind: 'everyone' })).toBe('everyone')
  })

  it('does not confuse a group grant with a user grant of the same id', () => {
    const grants = [
      grant({ subject_kind: 'user_group', subject_user_id: null, subject_group_id: 7 }),
    ]
    expect(findGrant(grants, { subject_kind: 'user', subject_user_id: 7 })).toBeUndefined()
    expect(findGrant(grants, { subject_kind: 'user_group', subject_group_id: 7 })?.id).toBe(1)
  })

  it('tones the access levels for the tag palette', () => {
    expect(accessLabel('read')).toBe('只读')
    expect(accessTone('write')).toBe('blue')
    expect(accessTone('full')).toBe('orange')
  })

  it('finds an existing grant for the same subject only', () => {
    const grants = [grant(), grant({ id: 2, subject_kind: 'everyone', subject_user_id: null })]
    expect(findGrant(grants, { subject_kind: 'user', subject_user_id: 7 })?.id).toBe(1)
    expect(findGrant(grants, { subject_kind: 'user', subject_user_id: 8 })).toBeUndefined()
    expect(findGrant(grants, { subject_kind: 'everyone' })?.id).toBe(2)
  })
})

describe('grant form validation', () => {
  it('requires the id that belongs to the chosen kind', () => {
    expect(
      validateGrantForm({ kind: 'user', userId: '', groupId: '', access: 'read' }).userId,
    ).toContain('成员')
    expect(
      validateGrantForm({ kind: 'user_group', userId: '', groupId: '', access: 'read' }).groupId,
    ).toContain('用户组')
    expect(
      validateGrantForm({ kind: 'everyone', userId: '', groupId: '', access: 'read' }),
    ).toEqual({})
  })

  it('builds the upsert payload with only the subject field that applies', () => {
    expect(toGrantRequest({ kind: 'user', userId: '7', groupId: '', access: 'write' })).toEqual({
      subject_kind: 'user',
      subject_user_id: 7,
      access: 'write',
    })
    expect(
      toGrantRequest({ kind: 'user_group', userId: '', groupId: '3', access: 'full' }),
    ).toEqual({
      subject_kind: 'user_group',
      subject_group_id: 3,
      access: 'full',
    })
    expect(toGrantRequest({ kind: 'everyone', userId: '', groupId: '', access: 'read' })).toEqual({
      subject_kind: 'everyone',
      access: 'read',
    })
  })

  it('offers exactly the three contract access levels', () => {
    expect(GRANT_ACCESS).toEqual(['read', 'write', 'full'])
    expect(accessLabel('read')).toBe('只读')
    expect(accessLabel('write')).toBe('可编辑 peers')
    expect(accessLabel('full')).toBe('完全管理')
  })
})

describe('group and member dictionaries', () => {
  it('drops the built-in everyone group from grantable groups', () => {
    expect(grantableGroups([group(), group({ id: 1, name: '所有人', kind: 'everyone' })])).toEqual([
      group(),
    ])
  })

  it('labels subjects with dictionary fallbacks', () => {
    const emails = new Map([[7, 'ops@acme.local']])
    const groups = new Map([[3, '研发组']])
    expect(subjectLabel(grant(), emails, groups)).toBe('ops@acme.local')
    expect(subjectLabel(grant({ subject_user_id: 9 }), emails, groups)).toBe('用户 #9')
    expect(
      subjectLabel(
        grant({ subject_kind: 'user_group', subject_user_id: null, subject_group_id: 3 }),
        emails,
        groups,
      ),
    ).toBe('研发组')
    expect(
      subjectLabel(
        grant({ subject_kind: 'user_group', subject_user_id: null, subject_group_id: 4 }),
        emails,
        groups,
      ),
    ).toBe('用户组 #4')
    expect(subjectLabel(grant({ subject_kind: 'everyone', subject_user_id: null }))).toBe('所有人')
  })
})

describe('impact and errors', () => {
  it('warns when a broad subject gets write or full', () => {
    expect(grantImpactNote('everyone', 'full')).toContain('全部成员')
    expect(grantImpactNote('user_group', 'write')).toContain('该组')
    expect(grantImpactNote('user', 'full')).toBeNull()
    expect(grantImpactNote('everyone', 'read')).toContain('默认只读')
  })

  it('maps the common failures', () => {
    expect(addressBookGrantError(new ApiError(409, 'conflict', 'x'))).toBeTruthy()
    expect(addressBookGrantError(new ApiError(403, 'forbidden', 'x'))).toContain('权限')
    expect(addressBookGrantError(new ApiError(404, 'not_found', 'x'))).toContain('不存在')
    expect(addressBookGrantError(new ApiError(400, 'invalid_request', 'x'))).toContain('不支持')
    expect(addressBookGrantError(new TypeError('Failed to fetch'))).toContain('网络')
  })
})
