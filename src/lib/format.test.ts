import { describe, expect, it } from 'vitest'

import { formatDuration, formatTime } from './format'

describe('formatTime', () => {
  it('renders a missing or empty value as a dash', () => {
    expect(formatTime(null)).toBe('—')
    expect(formatTime(undefined)).toBe('—')
    expect(formatTime('')).toBe('—')
  })

  it('passes an unparsable value through instead of showing Invalid Date', () => {
    expect(formatTime('not-a-date')).toBe('not-a-date')
  })

  it('formats in local time without seconds', () => {
    const text = formatTime('2026-10-28T06:05:00.000Z')
    expect(text).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/)
    expect(text).not.toContain('Invalid')
  })
})

describe('formatDuration', () => {
  const start = '2026-10-28T10:00:00.000Z'
  const plus = (minutes: number) =>
    new Date(new Date(start).getTime() + minutes * 60_000).toISOString()

  it('shows sub-minute sessions without claiming zero minutes', () => {
    expect(formatDuration(start, plus(0))).toBe('<1 分钟')
  })

  it('counts whole minutes below an hour', () => {
    expect(formatDuration(start, plus(7))).toBe('7 分钟')
    expect(formatDuration(start, plus(59))).toBe('59 分钟')
  })

  it('switches to hours, keeping the remaining minutes', () => {
    expect(formatDuration(start, plus(60))).toBe('1 小时')
    expect(formatDuration(start, plus(125))).toBe('2 小时 5 分')
  })

  it('returns a dash for an unparsable start', () => {
    expect(formatDuration('nope', plus(5))).toBe('—')
  })
})
