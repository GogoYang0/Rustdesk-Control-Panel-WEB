import { describe, expect, it } from 'vitest'

import { closeTabFrom, evictionCandidate, pushTab } from './tabs'

describe('tab strip', () => {
  it('appends a new page and is idempotent for the active one', () => {
    expect(pushTab(['members'], 'roles')).toEqual(['members', 'roles'])
    expect(pushTab(['members', 'roles'], 'roles')).toEqual(['members', 'roles'])
  })

  it('re-activating a tab moves it to the tail (most recent last)', () => {
    expect(pushTab(['members', 'roles', 'devices'], 'members')).toEqual(['roles', 'devices', 'members'])
  })

  it('closes a tab without reordering the rest', () => {
    expect(closeTabFrom(['members', 'roles', 'devices'], 'roles')).toEqual(['members', 'devices'])
  })

  it('never evicts the active tab', () => {
    expect(evictionCandidate(['members', 'roles'], 'members')).toBe('roles')
    expect(evictionCandidate(['members'], 'members')).toBeNull()
  })
})
