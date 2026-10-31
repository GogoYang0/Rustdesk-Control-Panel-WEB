// Address-book tag helpers. The management API replaces the whole palette; peer
// tags reference names and are not cascaded by the server.

import type { CSSProperties } from 'react'

export const TAG_NAME_MAX = 64
export const TAG_LIMIT = 256
export const PEER_TAG_LIMIT = 64
export const PEER_TAGS_JSON_MAX = 2048
export const DEFAULT_TAG_COLOR = 0
export const DEFAULT_TAG_HEX = '#e5e6eb'

export interface TagRow {
  name: string
  color: number
}

export function tagNameProblem(
  name: string,
  existing: string[],
  exceptIndex?: number,
): string | null {
  const trimmed = name.trim()
  if (!trimmed) return '标签名称不能为空'
  if ([...trimmed].length > TAG_NAME_MAX) return `标签名称最多 ${TAG_NAME_MAX} 个字符`
  const duplicate = existing.some(
    (other, index) => index !== exceptIndex && other.trim() === trimmed,
  )
  if (duplicate) return '标签名称重复'
  return null
}

export function tagRowsProblem(rows: TagRow[]): string | null {
  if (rows.length > TAG_LIMIT) return `最多 ${TAG_LIMIT} 个标签`
  for (let index = 0; index < rows.length; index += 1) {
    const problem = tagNameProblem(
      rows[index].name,
      rows.map((row) => row.name),
      index,
    )
    if (problem) return problem
  }
  return null
}

/** `#RRGGBB` to the contract's integer RGB; null for malformed input. */
export function hexToColor(hex: string): number | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null
  return Number.parseInt(hex.slice(1), 16)
}

/** 0 is the server's "default" sentinel; show it as the neutral swatch. */
export function colorToHex(color?: number | null): string {
  if (!color) return DEFAULT_TAG_HEX
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`
}

function contrastText(color: number): string {
  const r = (color >> 16) & 0xff
  const g = (color >> 8) & 0xff
  const b = color & 0xff
  // W3C-ish perceived brightness, enough to keep chips readable.
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 150 ? '#1f2329' : '#ffffff'
}

/** Inline style for a defined tag color; 0/undefined falls back to the grey class. */
export function tagColorStyle(color?: number | null): CSSProperties | undefined {
  if (!color) return undefined
  return {
    backgroundColor: `#${(color & 0xffffff).toString(16).padStart(6, '0')}`,
    color: contrastText(color),
  }
}

export function peerTagsProblem(tags: string[]): string | null {
  if (tags.length > PEER_TAG_LIMIT) return `单个 peer 最多 ${PEER_TAG_LIMIT} 个标签`
  const seen = new Set<string>()
  for (const tag of tags) {
    const trimmed = tag.trim()
    if (!trimmed) return '标签名称不能为空'
    if ([...trimmed].length > TAG_NAME_MAX) return `标签名称最多 ${TAG_NAME_MAX} 个字符`
    if (seen.has(trimmed)) return '标签名称重复'
    seen.add(trimmed)
  }
  if ([...JSON.stringify(tags)].length > PEER_TAGS_JSON_MAX) {
    return '标签总长度超出限制，请减少标签'
  }
  return null
}
