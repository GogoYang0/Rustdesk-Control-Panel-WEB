import { describe, expect, it } from 'vitest'

import {
  colorToHex,
  hexToColor,
  peerTagsProblem,
  tagColorStyle,
  tagNameProblem,
  tagRowsProblem,
} from './addressbook-tags'

describe('tagNameProblem', () => {
  it('validates required, length and duplicates', () => {
    expect(tagNameProblem('', [])).toContain('不能为空')
    expect(tagNameProblem('维'.repeat(64), [])).toBeNull()
    expect(tagNameProblem('维'.repeat(65), [])).toContain('64')
    expect(tagNameProblem('lab', ['lab'])).toContain('重复')
    expect(tagNameProblem(' lab ', ['lab'])).toContain('重复')
    expect(tagNameProblem('lab', ['lab'], 0)).toBeNull()
  })
})

describe('tagRowsProblem', () => {
  it('checks the palette limit and every row', () => {
    expect(
      tagRowsProblem([
        { name: 'a', color: 0 },
        { name: 'b', color: 0 },
      ]),
    ).toBeNull()
    expect(
      tagRowsProblem([
        { name: 'a', color: 0 },
        { name: 'a', color: 0 },
      ]),
    ).toContain('重复')
    expect(
      tagRowsProblem(Array.from({ length: 257 }, (_, index) => ({ name: `t${index}`, color: 0 }))),
    ).toContain('256')
  })
})

describe('colors', () => {
  it('round-trips RGB and masks the contract integer', () => {
    expect(hexToColor('#0f4c81')).toBe(0x0f4c81)
    expect(hexToColor('0f4c81')).toBeNull()
    expect(hexToColor('#fff')).toBeNull()
    expect(colorToHex(0x0f4c81)).toBe('#0f4c81')
    expect(colorToHex(0xff0f4c81)).toBe('#0f4c81')
    expect(colorToHex(0)).toBe('#e5e6eb')
  })

  it('keeps text readable on dark and light backgrounds', () => {
    expect(tagColorStyle(0x0f4c81)?.color).toBe('#ffffff')
    expect(tagColorStyle(0xffffff)?.color).toBe('#1f2329')
    expect(tagColorStyle(0)).toBeUndefined()
  })
})

describe('peerTagsProblem', () => {
  it('validates count, names, duplicates and the serialized size', () => {
    expect(peerTagsProblem(['lab', 'finance'])).toBeNull()
    expect(peerTagsProblem([''])).toContain('不能为空')
    expect(peerTagsProblem(['lab', 'lab'])).toContain('重复')
    expect(peerTagsProblem(Array.from({ length: 65 }, (_, i) => `t${i}`))).toContain('64')
    expect(
      peerTagsProblem(
        Array.from(
          { length: 64 },
          (_, index) => `${String(index).padStart(2, '0')}${'维'.repeat(60)}`,
        ),
      ),
    ).toContain('总长度')
  })
})
