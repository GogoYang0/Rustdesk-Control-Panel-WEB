import type { AddressBookTag } from '../../lib/api'
import { tagColorStyle } from '../../lib/addressbook-tags'

/** Palette colors by name; tag names absent from the palette render grey. */
export function tagColorMap(tags: AddressBookTag[] | undefined): Map<string, number> {
  const map = new Map<string, number>()
  for (const tag of tags ?? []) map.set(tag.name, tag.color ?? 0)
  return map
}

export default function TagChips({
  tags,
  colors,
  empty = '—',
}: {
  tags?: string[]
  colors?: Map<string, number>
  empty?: string
}) {
  if (!tags || tags.length === 0) return <>{empty}</>
  return (
    <span className="hstack" style={{ flexWrap: 'wrap', gap: 4 }}>
      {tags.map((tag) => {
        const defined = colors?.has(tag) ?? false
        const color = colors?.get(tag)
        return (
          <span
            key={tag}
            className={`tag ${defined && color ? '' : 'grey'}`}
            style={tagColorStyle(color)}
            title={colors && !defined ? '未定义标签' : undefined}
          >
            {tag}
          </span>
        )
      })}
    </span>
  )
}
