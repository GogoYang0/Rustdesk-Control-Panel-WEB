import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { MeOrg } from '../../lib/api'
import OrgCard from './OrgCard'

const owner: MeOrg = {
  id: 1,
  name: 'ACME',
  role_id: 1,
  role_kind: 'owner',
  permissions: ['org.admin'],
}

const admin: MeOrg = {
  id: 1,
  name: 'ACME',
  role_id: 2,
  role_kind: 'admin',
  permissions: ['device.read'],
}

describe('OrgCard', () => {
  it('offers rename to an owner', () => {
    render(<OrgCard org={owner} />)
    expect(screen.getByRole('button', { name: '重命名' })).toBeTruthy()
  })

  it('hides rename without org.admin', () => {
    render(<OrgCard org={admin} />)
    expect(screen.queryByRole('button', { name: '重命名' })).toBeNull()
  })
})
