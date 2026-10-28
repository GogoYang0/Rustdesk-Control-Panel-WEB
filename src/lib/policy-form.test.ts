import { describe, expect, it } from 'vitest'

import type { Policy } from '../api/generated'
import {
  emptyPolicyForm,
  formatMinute,
  formatOffset,
  localToUtcMinute,
  parseTimeValue,
  policyToForm,
  toPolicyRequest,
  utcToLocalMinute,
  validatePolicyForm,
  windowLabel,
  withEnabled,
} from './policy-form'

const EAST8 = 480
const WEST5 = -300

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 1,
    organization_id: 1,
    name: '工作日',
    enabled: true,
    require_approval: false,
    created_at: '2026-10-28T00:00:00Z',
    updated_at: '2026-10-28T00:00:00Z',
    ...overrides,
  }
}

describe('time helpers', () => {
  it('parses HH:MM and rejects malformed or out-of-range values', () => {
    expect(parseTimeValue('09:30')).toBe(570)
    expect(parseTimeValue('00:00')).toBe(0)
    expect(parseTimeValue('23:59')).toBe(1439)
    expect(parseTimeValue('24:00')).toBeNull()
    expect(parseTimeValue('9')).toBeNull()
    expect(parseTimeValue('09:60')).toBeNull()
  })

  it('formats minutes with wrapping', () => {
    expect(formatMinute(0)).toBe('00:00')
    expect(formatMinute(570)).toBe('09:30')
    expect(formatMinute(1440)).toBe('00:00')
    expect(formatMinute(-60)).toBe('23:00')
  })

  it('converts between local and UTC on both sides of Greenwich', () => {
    expect(localToUtcMinute(540, EAST8)).toBe(60) // 09:00 local → 01:00 UTC
    expect(localToUtcMinute(30, EAST8)).toBe(990) // 00:30 local → 16:30 UTC
    expect(localToUtcMinute(540, WEST5)).toBe(840) // 09:00 local → 14:00 UTC
    expect(utcToLocalMinute(60, EAST8)).toBe(540)
    expect(utcToLocalMinute(840, WEST5)).toBe(540)
  })

  it('labels the offset for the timezone note', () => {
    expect(formatOffset(480)).toBe('UTC+08:00')
    expect(formatOffset(-300)).toBe('UTC-05:00')
    expect(formatOffset(0)).toBe('UTC+00:00')
  })

  it('round-trips every minute for a positive and a negative offset', () => {
    for (const offset of [EAST8, WEST5, 0]) {
      for (const minute of [0, 1, 419, 540, 1439]) {
        expect(utcToLocalMinute(localToUtcMinute(minute, offset), offset)).toBe(minute)
      }
    }
  })
})

describe('policy form mapping', () => {
  it('labels an all-day window and converts a configured one', () => {
    expect(windowLabel(null, null, EAST8)).toBe('全天')
    expect(windowLabel(60, 600, EAST8)).toBe('09:00–18:00')
    expect(windowLabel(60, null, EAST8)).toBe('配置不完整')
  })

  it('starts from sensible defaults', () => {
    const form = emptyPolicyForm()
    expect(form.enabled).toBe(true)
    expect(form.allDay).toBe(false)
    expect(form.startMinute).toBe(540)
    expect(form.endMinute).toBe(1080)
    expect(validatePolicyForm(form)).toEqual({ name: '请填写策略名称' })
  })

  it('maps a stored policy into local form values', () => {
    const form = policyToForm(policy({ allowed_start_minute: 60, allowed_end_minute: 600 }), EAST8)
    expect(form.allDay).toBe(false)
    expect(form.startMinute).toBe(540)
    expect(form.endMinute).toBe(1080)
    expect(form.noConcurrencyLimit).toBe(true)
    expect(form.maxConcurrent).toBe('5')
  })

  it('keeps explicit limits when the policy has them', () => {
    const form = policyToForm(
      policy({ max_concurrent_sessions: 3, max_session_minutes: 45, require_approval: true }),
      EAST8,
    )
    expect(form.noConcurrencyLimit).toBe(false)
    expect(form.maxConcurrent).toBe('3')
    expect(form.noDurationLimit).toBe(false)
    expect(form.maxSessionMinutes).toBe('45')
    expect(form.requireApproval).toBe(true)
  })
})

describe('validation', () => {
  it('accepts a complete form', () => {
    expect(validatePolicyForm({ ...emptyPolicyForm(), name: '值班' })).toEqual({})
  })

  it('rejects over-long names', () => {
    expect(validatePolicyForm({ ...emptyPolicyForm(), name: 'a'.repeat(129) }).name).toContain(
      '128',
    )
  })

  it('refuses equal bounds instead of encoding a blocked window', () => {
    const form = { ...emptyPolicyForm(), name: '值班', startMinute: 600, endMinute: 600 }
    expect(validatePolicyForm(form).window).toContain('不能相同')
  })

  it('flags a half window instead of repairing it into all-day', () => {
    const form = policyToForm(policy({ allowed_start_minute: 60 }), EAST8)
    expect(form.allDay).toBe(false)
    expect(form.windowIncomplete).toBe(true)
    expect(validatePolicyForm({ ...form, name: '遗留策略' }).window).toContain('只有一端有值')
  })

  it('does not require a window when all-day is on', () => {
    const form = { ...emptyPolicyForm(), name: '值班', allDay: true, startMinute: 0, endMinute: 0 }
    expect(validatePolicyForm(form)).toEqual({})
  })

  it('validates the limit inputs only when enabled', () => {
    const base = { ...emptyPolicyForm(), name: '值班' }
    expect(
      validatePolicyForm({ ...base, noConcurrencyLimit: false, maxConcurrent: '0' }).maxConcurrent,
    ).toContain('≥1')
    expect(
      validatePolicyForm({ ...base, noConcurrencyLimit: false, maxConcurrent: '2.5' })
        .maxConcurrent,
    ).toContain('≥1')
    expect(
      validatePolicyForm({ ...base, noDurationLimit: false, maxSessionMinutes: '' })
        .maxSessionMinutes,
    ).toContain('≥1')
    expect(
      validatePolicyForm({
        ...base,
        noConcurrencyLimit: false,
        maxConcurrent: '0',
        noDurationLimit: true,
      }).maxConcurrent,
    ).toContain('≥1')
  })
})

describe('request payloads', () => {
  it('sends explicit booleans and nulls for unlimited fields', () => {
    const request = toPolicyRequest({ ...emptyPolicyForm(), name: '值班', allDay: true }, EAST8)
    expect(request).toMatchObject({
      name: '值班',
      enabled: true,
      require_approval: false,
      max_concurrent_sessions: null,
      max_session_minutes: null,
      allowed_start_minute: null,
      allowed_end_minute: null,
    })
  })

  it('labels a wrapping UTC window in local time', () => {
    // 14:00–22:00 UTC is 22:00–06:00 at UTC+8.
    expect(windowLabel(840, 1320, EAST8)).toBe('22:00–06:00')
  })

  it('converts a wrapping local window into the equivalent UTC range', () => {
    const form = {
      ...emptyPolicyForm(),
      name: '夜班',
      startMinute: 22 * 60,
      endMinute: 6 * 60,
      noConcurrencyLimit: false,
      maxConcurrent: '2',
      noDurationLimit: false,
      maxSessionMinutes: '90',
    }
    const request = toPolicyRequest(form, EAST8)
    expect(request.allowed_start_minute).toBe(840) // 22:00 local → 14:00 UTC
    expect(request.allowed_end_minute).toBe(1320) // 06:00 local → 22:00 UTC
    expect(request.max_concurrent_sessions).toBe(2)
    expect(request.max_session_minutes).toBe(90)
  })

  it('flips enabled while keeping every other field', () => {
    const stored = policy({
      max_concurrent_sessions: 4,
      allowed_start_minute: 60,
      allowed_end_minute: 600,
      require_approval: true,
    })
    const off = withEnabled(stored, false)
    expect(off.enabled).toBe(false)
    expect(off.require_approval).toBe(true)
    expect(off.max_concurrent_sessions).toBe(4)
    expect(off.allowed_start_minute).toBe(60)
    expect(off.allowed_end_minute).toBe(600)
  })

  it('keeps an all-day policy all-day when toggling', () => {
    const stored = policy()
    const request = withEnabled(stored, false)
    expect(request.allowed_start_minute).toBeNull()
    expect(request.allowed_end_minute).toBeNull()
    expect(request.max_concurrent_sessions).toBeNull()
    expect(request.require_approval).toBe(false)
  })
})
