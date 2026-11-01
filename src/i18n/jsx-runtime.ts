import { Fragment, isValidElement } from 'react'
import { jsx as reactJsx, jsxs as reactJsxs } from 'react/jsx-runtime'
import { jsxDEV as reactJsxDEV } from 'react/jsx-dev-runtime'

import { getLang, translate } from './core'

type JsxType = Parameters<typeof reactJsx>[0]
type JsxProps = Parameters<typeof reactJsx>[1]
type JsxKey = Parameters<typeof reactJsx>[2]

const TEXT_PROPS = new Set([
  'title',
  'placeholder',
  'aria-label',
  'aria-description',
  'alt',
  'label',
  'hint',
  'description',
  'content',
  'header',
])

const SPACE_LANGS = new Set(['en', 'ru'])

function hasLeadingBoundary(value: string): boolean {
  return /^(?:\s|[.,!?;:)\]}])/u.test(value)
}

function hasTrailingBoundary(value: string): boolean {
  return /(?:[.,!?;:([{]|\s)$/u.test(value)
}

function localizeChild(child: unknown): unknown {
  if (typeof child === 'string') return translate(child)
  if (Array.isArray(child)) return localizeChildren(child)
  return child
}

function localizeChildren(children: unknown[]): unknown[] {
  const spaced = SPACE_LANGS.has(getLang())
  let changed = false
  const mapped = children.map((item) => {
    const next = localizeChild(item)
    if (next !== item) changed = true
    return next
  })
  if (!spaced) return changed ? mapped : children

  const padded = mapped.map((item, index) => {
    if (typeof item !== 'string' || !item) return item
    let value = item
    const previous = mapped[index - 1]
    const next = mapped[index + 1]
    if (previous !== undefined && isValidElement(previous) && !hasLeadingBoundary(value)) {
      value = ` ${value}`
    }
    if (next !== undefined && isValidElement(next) && !hasTrailingBoundary(value)) {
      value = `${value} `
    }
    if (value !== item) changed = true
    return value
  })
  return changed ? padded : children
}

function localizeProps(props: JsxProps): JsxProps {
  if (!props || typeof props !== 'object') return props
  let next: Record<string, unknown> | null = null
  const assign = (key: string, value: unknown) => {
    if (!next) next = { ...(props as Record<string, unknown>) }
    next[key] = value
  }

  const children = (props as Record<string, unknown>).children
  if (typeof children === 'string') {
    const translated = translate(children)
    if (translated !== children) assign('children', translated)
  } else if (Array.isArray(children)) {
    const translated = localizeChild(children)
    if (translated !== children) assign('children', translated)
  }

  for (const key of TEXT_PROPS) {
    const value = (props as Record<string, unknown>)[key]
    if (typeof value !== 'string') continue
    const translated = translate(value)
    if (translated !== value) assign(key, translated)
  }

  return (next ?? props) as JsxProps
}

export function jsx(type: JsxType, props: JsxProps, key?: JsxKey) {
  return reactJsx(type, localizeProps(props), key)
}

export function jsxs(type: JsxType, props: JsxProps, key?: JsxKey) {
  return reactJsxs(type, localizeProps(props), key)
}

export function jsxDEV(
  type: JsxType,
  props: JsxProps,
  key: JsxKey,
  isStaticChildren: boolean,
  source?: unknown,
  self?: unknown,
) {
  return reactJsxDEV(
    type,
    localizeProps(props),
    key,
    isStaticChildren,
    source as Parameters<typeof reactJsxDEV>[4],
    self as Parameters<typeof reactJsxDEV>[5],
  )
}

export { Fragment }
